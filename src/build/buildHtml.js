const path = require('path');
const fs = require('fs');
const { buildMarkdownInDirectory } = require('./buildMarkdown');
const { renderHtml } = require('../render/renderHtml');
const logger = require('../utils/logger');
const { createStagingDirectory, publishStagedArtifacts, removeStagingDirectory } = require('./staging');

/**
 * Build an HTML file from the book project, combining markdown compilation and HTML rendering.
 * @param {string} bookDir - Absolute path to the book project directory.
 * @returns {{ htmlPath: string, markdownPath: string, html: string, markdown: string, config: object, style: object, plugins: object, output: object }}
 *   The output HTML file path, markdown path, rendered content, and resolved config sections.
 */
function buildHtml(bookDir) {
  const distDir = path.join(bookDir, 'dist');
  const stagingDir = createStagingDirectory(distDir);
  try {
    const result = buildHtmlInDirectory(bookDir, stagingDir);
    const htmlName = path.basename(result.htmlPath);
    publishStagedArtifacts(stagingDir, distDir, ['assets', 'book.md', htmlName]);

    const markdownPath = path.join(distDir, 'book.md');
    const htmlPath = path.join(distDir, htmlName);
    logger.info(`已生成 ${path.relative(process.cwd(), markdownPath)}`);
    logger.info(`已生成 ${path.relative(process.cwd(), htmlPath)}`);
    return { ...result, htmlPath, markdownPath };
  } finally {
    removeStagingDirectory(stagingDir);
  }
}

function buildHtmlInDirectory(bookDir, buildDir) {
  const compiled = buildMarkdownInDirectory(bookDir, buildDir);
  const { outPath, markdown, config, style, plugins, output } = compiled;
  const html = renderHtml(markdown, config, style, plugins);

  const outputBaseName = sanitizeFileName(output?.htmlName || config.title || 'book');
  const htmlPath = path.join(buildDir, `${outputBaseName}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  return {
    ...compiled,
    htmlPath,
    markdownPath: outPath,
    html,
  };
}

/**
 * Sanitize a string for use as a file name, replacing illegal characters with dashes.
 * @param {string} s - The raw file name string.
 * @returns {string} A sanitized file name safe for the filesystem.
 */
function sanitizeFileName(s) {
  return String(s)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, 'book') || 'book';
}

module.exports = { buildHtml, buildHtmlInDirectory, sanitizeFileName };
