const fs = require('fs');
const path = require('path');
const { BookCliError } = require('./errors');
const { readJson } = require('../config/loadBookConfig');
const { resolveInside } = require('./safePath');
const logger = require('./logger');

function addChapter(bookDir, { title, dir, file = 'content.md' }) {
  if (!title || typeof title !== 'string') {
    throw new BookCliError('用法: book-cli add-chapter --book <dir> --title <章节标题> [--dir <目录名>]', { code: 'EUSAGE' });
  }

  const configPath = path.join(bookDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new BookCliError(`add-chapter 需要 config.json: ${configPath}`, { code: 'ENOCONFIG' });
  }

  const config = readJson(configPath, 'config.json');
  const book = config.book || config;
  if (!Array.isArray(book.chapters)) {
    throw new BookCliError('config.json 中 chapters 必须是数组', { code: 'EINVALID_CONFIG' });
  }
  const normalizedTitle = normalizeChapterTitle(title);
  const duplicate = book.chapters.find((chapter) => normalizeChapterTitle(chapter.title) === normalizedTitle);
  if (duplicate) {
    throw new BookCliError(`章节标题已存在: ${title}`, { code: 'EEXISTS' });
  }

  const chapterNumber = book.chapters.length + 1;
  const chapterDirName = dir || createChapterDirName(chapterNumber, title);
  const chaptersDir = path.join(bookDir, 'chapters');
  const chapterDir = resolveInside(chaptersDir, chapterDirName, { label: '章节目录' });
  const contentPath = resolveInside(chapterDir, file, { label: '章节文件' });
  if (fs.existsSync(chapterDir)) {
    throw new BookCliError(`章节目录已存在: ${chapterDir}`, { code: 'EEXISTS' });
  }

  fs.mkdirSync(chapterDir, { recursive: true });
  fs.mkdirSync(path.dirname(contentPath), { recursive: true });
  fs.writeFileSync(contentPath, `# ${title}\n\n在这里开始正文写作。\n`, 'utf8');
  fs.writeFileSync(path.join(chapterDir, 'outline.md'), createOutline(title), 'utf8');
  fs.writeFileSync(path.join(chapterDir, 'summary.md'), createSummary(title, chapterNumber), 'utf8');

  book.chapters.push({ dir: chapterDirName, title, file });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

  logger.info(`已新增章节: ${chapterDirName}`);
  logger.info(`已更新 ${path.relative(process.cwd(), configPath)}`);
  return { dir: chapterDirName, title, file };
}

function normalizeChapterTitle(title) {
  return String(title || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function createChapterDirName(index, title) {
  const prefix = String(index).padStart(2, '0');
  const slug = String(title)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}-${slug || 'chapter'}`;
}

function createOutline(title) {
  return `# ${title}\n\n## 本章目标\n\n- 说明本章要解决的问题。\n- 梳理核心概念和实践路径。\n\n## 建议结构\n\n1. 背景与动机\n2. 核心概念\n3. 工程实践\n4. 小结\n\n## 实践任务\n\n- 用自己的话总结本章核心观点。\n\n## 本章产出\n\n读者应能理解本章主题，并能将其应用到实际场景中。\n`;
}

function createSummary(title, chapterNumber) {
  return `# ${title} 摘要\n\n- 章节：第 ${chapterNumber} 章\n- 字数：待统计\n- 小节数：待统计\n\n## 摘要\n\n本章介绍 ${title} 的核心概念、常见流程和实践注意点。\n\n## 核心小节\n\n- 待补充\n`;
}

module.exports = { addChapter };
