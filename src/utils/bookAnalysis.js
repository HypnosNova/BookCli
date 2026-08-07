const fs = require('fs');
const path = require('path');
const { loadBookProjectConfig } = require('../config/loadBookConfig');
const { escapeRegExp, protectMarkdownCode, restoreProtectedMarkdownCode } = require('./utils');
const logger = require('./logger');
const { resolveChapterPaths } = require('./safePath');

const CJK_CHAR_PATTERN = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]';
const CJK_CHAR_RE = new RegExp(CJK_CHAR_PATTERN, 'gu');
const CJK_CHAR_REPLACE = new RegExp(CJK_CHAR_PATTERN, 'gu');

function analyzeBook(bookDir) {
  const projectConfig = loadBookProjectConfig(bookDir);
  const config = projectConfig.book;
  const chapters = config.chapters.map((chapter, index) => {
    const contentPath = resolveChapterContentPath(bookDir, chapter);
    const exists = fs.existsSync(contentPath);
    const markdown = exists ? fs.readFileSync(contentPath, 'utf8') : '';
    const plainText = markdownToPlainText(markdown);
    const headings = extractHeadings(markdown);
    const wordCount = countWords(plainText);

    return {
      index: index + 1,
      title: chapter.title,
      dir: chapter.dir,
      file: chapter.file || 'content.md',
      contentPath,
      exists,
      wordCount,
      cjkCount: countCjk(plainText),
      latinWordCount: countLatinWords(plainText),
      headingCount: headings.length,
      headings,
      summary: createChapterSummary({ title: chapter.title, markdown, plainText, headings, wordCount }),
    };
  });

  return {
    title: config.title,
    bookDir,
    totalWordCount: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    chapters,
  };
}

function printWordStats(stats, { json = false } = {}) {
  if (json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const rows = stats.chapters.map((chapter) => [
    String(chapter.index).padStart(2, '0'),
    chapter.title,
    String(chapter.wordCount),
    chapter.exists ? chapter.file : '缺失',
  ]);
  const widths = [
    Math.max(2, ...rows.map((row) => row[0].length)),
    Math.max(4, ...rows.map((row) => visibleLength(row[1]))),
    Math.max(4, ...rows.map((row) => row[2].length)),
    Math.max(4, ...rows.map((row) => visibleLength(row[3]))),
  ];

  console.log(`书名: ${stats.title}`);
  console.log(`总字数: ${stats.totalWordCount}`);
  console.log('');
  console.log(formatRow(['序号', '章节', '字数', '文件'], widths));
  console.log(formatRow(widths.map((width) => '-'.repeat(width)), widths));
  for (const row of rows) {
    console.log(formatRow(row, widths));
  }
}

function writeWordStats(bookDir, stats, outputPath) {
  const distDir = path.join(bookDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outPath = outputPath ? path.resolve(process.cwd(), outputPath) : path.join(distDir, 'word-stats.json');
  fs.writeFileSync(outPath, JSON.stringify(stats, null, 2) + '\n', 'utf8');
  logger.info(`已生成 ${path.relative(process.cwd(), outPath)}`);
  return outPath;
}

function generateChapterSummaries(bookDir, { outputPath } = {}) {
  const stats = analyzeBook(bookDir);
  const lines = [`# ${stats.title} 章节摘要`, ''];

  for (const chapter of stats.chapters) {
    if (!chapter.exists) {
      logger.warn(`跳过缺失的章节文件: ${chapter.contentPath}`);
      continue;
    }

    const chapterDir = path.dirname(chapter.contentPath);
    const chapterSummaryPath = path.join(chapterDir, 'summary.md');
    const markdown = renderSingleChapterSummary(chapter);
    fs.writeFileSync(chapterSummaryPath, markdown, 'utf8');
    logger.info(`已生成 ${path.relative(process.cwd(), chapterSummaryPath)}`);

    lines.push(`## 第 ${chapter.index} 章　${chapter.title}`);
    lines.push('');
    lines.push(`- 字数：${chapter.wordCount}`);
    lines.push(`- 摘要：${chapter.summary.text}`);
    if (chapter.summary.keySections.length) {
      lines.push(`- 核心小节：${chapter.summary.keySections.join('；')}`);
    }
    lines.push('');
  }

  const distDir = path.join(bookDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outPath = outputPath ? path.resolve(process.cwd(), outputPath) : path.join(distDir, 'chapter-summaries.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  logger.info(`已生成 ${path.relative(process.cwd(), outPath)}`);

  return { stats, outPath };
}

function renderSingleChapterSummary(chapter) {
  const lines = [
    `# ${chapter.title} 摘要`,
    '',
    `- 章节：第 ${chapter.index} 章`,
    `- 字数：${chapter.wordCount}`,
    `- 小节数：${chapter.headingCount}`,
    '',
    '## 摘要',
    '',
    chapter.summary.text,
    '',
  ];

  if (chapter.summary.keySections.length) {
    lines.push('## 核心小节', '');
    for (const section of chapter.summary.keySections) {
      lines.push(`- ${section}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function createChapterSummary({ title, markdown, plainText, headings, wordCount }) {
  const paragraphs = extractParagraphs(markdown);
  const firstParagraph = paragraphs.find((paragraph) => !paragraph.startsWith('#')) || plainText;
  const fallback = `${title} 介绍了本章主题的核心概念、常用流程和实践注意点。`;
  const text = truncateText(firstParagraph || fallback, 180);
  const keySections = headings
    .filter((heading) => heading.level === 2)
    .map((heading) => heading.text)
    .slice(0, 8);

  return {
    text,
    keySections,
    wordCount,
  };
}

function extractParagraphs(markdown) {
  const cleaned = removeFencedCodeBlocks(markdown);
  return cleaned
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => !/^#{1,6}\s+/.test(part))
    .map((part) => stripMarkdownInline(part).trim())
    .filter(Boolean);
}

function extractHeadings(markdown) {
  const headings = [];
  for (const line of removeFencedCodeBlocks(markdown).split(/\r?\n/)) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;
    headings.push({
      level: match[1].length,
      text: stripMarkdownInline(match[2]).trim(),
    });
  }
  return headings;
}

function resolveChapterContentPath(bookDir, chapter) {
  return resolveChapterPaths(bookDir, chapter).contentPath;
}

function markdownToPlainText(markdown) {
  const withoutCodeBlocks = removeFencedCodeBlocks(markdown);
  return stripMarkdownInline(
    withoutCodeBlocks
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\|/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function removeFencedCodeBlocks(markdown) {
  const protectedMarkdown = protectMarkdownCode(markdown, { tokenPrefix: 'BOOKCLI_ANALYSIS_CODE' });
  let out = protectedMarkdown.markdown;
  const inlinePlaceholders = [];

  for (const item of protectedMarkdown.placeholders) {
    if (item.token.includes('_BLOCK_')) {
      out = out.replace(new RegExp(escapeRegExp(item.token), 'g'), '\n');
    } else {
      inlinePlaceholders.push(item);
    }
  }

  return restoreProtectedMarkdownCode(out, inlinePlaceholders);
}

function stripMarkdownInline(text) {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[#>*_~`]/g, '');
}

function countWords(text) {
  return countCjk(text) + countLatinWords(text);
}

function countCjk(text) {
  const matches = String(text).match(CJK_CHAR_RE);
  return matches ? matches.length : 0;
}

function countLatinWords(text) {
  const normalized = String(text).replace(CJK_CHAR_REPLACE, ' ');
  const matches = normalized.match(/[A-Za-z0-9]+(?:[-_'][A-Za-z0-9]+)*/g);
  return matches ? matches.length : 0;
}

function truncateText(text, maxLength) {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (visibleLength(normalized) <= maxLength) return normalized;
  let length = 0;
  let result = '';
  for (const char of normalized) {
    length += /[\x00-\x7F]/.test(char) ? 1 : 2;
    if (length > maxLength) break;
    result += char;
  }
  return result.replace(/[，。；：、,.!?;:]\s*$/, '') + '...';
}

function visibleLength(text) {
  let length = 0;
  for (const char of String(text)) {
    length += /[\x00-\x7F]/.test(char) ? 1 : 2;
  }
  return length;
}

function padVisible(text, width) {
  const raw = String(text);
  return raw + ' '.repeat(Math.max(0, width - visibleLength(raw)));
}

function formatRow(row, widths) {
  return row.map((cell, index) => padVisible(cell, widths[index])).join('  ');
}

module.exports = {
  analyzeBook,
  printWordStats,
  writeWordStats,
  generateChapterSummaries,
  countWords,
  markdownToPlainText,
};
