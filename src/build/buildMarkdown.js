const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { createStagingDirectory, publishStagedArtifacts, removeStagingDirectory } = require('./staging');
const { compileBook } = require('./compileBook');
const { formatChapterTitle, isHeadingNumberingEnabled, numberChapterHeadings, stripHeadingNumber } = require('./headings');

/**
 * Build a single concatenated Markdown file from all book chapters.
 * @param {string} bookDir - Absolute path to the book project directory.
 * @returns {{ outPath: string, markdown: string, config: object, style: object, plugins: object, output: object }}
 *   The output file path, full markdown content, and resolved config sections.
 */
function buildMarkdown(bookDir) {
  const distDir = path.join(bookDir, 'dist');
  const stagingDir = createStagingDirectory(distDir);
  try {
    const result = buildMarkdownInDirectory(bookDir, stagingDir);
    publishStagedArtifacts(stagingDir, distDir, ['assets', 'book.md']);
    const outPath = path.join(distDir, 'book.md');
    logger.info(`已生成 ${path.relative(process.cwd(), outPath)}`);
    return { ...result, outPath };
  } finally {
    removeStagingDirectory(stagingDir);
  }
}

function buildMarkdownInDirectory(bookDir, buildDir) {
  const compiled = compileBook(bookDir, buildDir);
  const outPath = path.join(buildDir, 'book.md');
  fs.writeFileSync(outPath, compiled.markdown, 'utf8');
  return { ...compiled, outPath };
}

module.exports = {
  buildMarkdown,
  buildMarkdownInDirectory,
  formatChapterTitle,
  isHeadingNumberingEnabled,
  numberChapterHeadings,
  stripHeadingNumber,
};
