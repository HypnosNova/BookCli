const fs = require('fs');
const path = require('path');
const { loadBookProjectConfig } = require('../config/loadBookConfig');
const { rewriteMarkdownImageAssets } = require('../render/assets');
const { resolveChapterPaths } = require('../utils/safePath');
const { formatChapterTitle, isHeadingNumberingEnabled, numberChapterHeadings } = require('./headings');

/**
 * Load, normalize and compile a book once into a shared intermediate model.
 * Renderers consume this model instead of reading chapter files independently.
 */
function compileBook(bookDir, buildDir) {
  const projectConfig = loadBookProjectConfig(bookDir);
  const config = projectConfig.book;
  const headingNumberingEnabled = isHeadingNumberingEnabled(config);
  fs.mkdirSync(buildDir, { recursive: true });

  const chapters = config.chapters.map((chapter, index) => {
    const { chapterDir, contentPath } = resolveChapterPaths(bookDir, chapter);
    const sourceMarkdown = fs.readFileSync(contentPath, 'utf8').trim();
    const rewrittenMarkdown = rewriteMarkdownImageAssets(sourceMarkdown, {
      sourceDir: chapterDir,
      distDir: buildDir,
      namespace: chapter.dir,
    });
    const title = formatChapterTitle(index, chapter.title, headingNumberingEnabled);
    const body = headingNumberingEnabled
      ? numberChapterHeadings(rewrittenMarkdown, index, chapter.title)
      : rewrittenMarkdown;

    return {
      index,
      source: chapter,
      sourcePath: contentPath,
      title,
      body,
      markdown: `# ${title}\n\n${body}\n`,
      epubFileName: `chapter-${String(index + 1).padStart(3, '0')}.xhtml`,
    };
  });

  const frontMatterMarkdown = renderFrontMatterMarkdown(config);
  const markdown = [frontMatterMarkdown, ...chapters.map((chapter) => chapter.markdown)].join('\n');

  return {
    bookDir,
    buildDir,
    config,
    style: projectConfig.style,
    plugins: projectConfig.plugins,
    output: projectConfig.output,
    frontMatterMarkdown,
    chapters,
    markdown,
  };
}

function renderFrontMatterMarkdown(config) {
  const parts = [`# ${config.title}\n`];
  if (config.subtitle) parts.push(`> ${config.subtitle}\n`);
  if (config.author) parts.push(`**作者:** ${config.author}\n`);
  if (config.date) parts.push(`**日期:** ${config.date}\n`);
  parts.push('\n---\n');
  return parts.join('\n');
}

module.exports = { compileBook, renderFrontMatterMarkdown };
