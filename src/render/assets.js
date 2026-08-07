const fs = require('fs');
const path = require('path');
const { protectMarkdownCode, restoreProtectedMarkdownCode } = require('../utils/utils');
const logger = require('../utils/logger');

/**
 * Rewrite local image references in markdown to point into the dist assets directory,
 * copying the referenced files from sourceDir to distDir.
 * @param {string} markdown - The markdown content containing image references.
 * @param {object} options
 * @param {string} options.sourceDir - Directory containing the source image files.
 * @param {string} options.distDir - Destination directory where assets will be copied.
 * @param {string} [options.namespace=''] - Optional namespace prefix for the asset path.
 * @returns {string} The markdown with rewritten image paths.
 */
function rewriteMarkdownImageAssets(markdown, { sourceDir, distDir, namespace = '' }) {
  const protectedMarkdown = protectMarkdownCode(markdown, { tokenPrefix: 'BOOKCLI_ASSET_CODE' });
  const rewritten = protectedMarkdown.markdown.replace(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (match, alt, rawTarget) => {
    const parsed = parseMarkdownLinkTarget(rawTarget);
    if (!parsed || shouldKeepAssetUrl(parsed.url)) return match;

    const sourcePath = path.resolve(sourceDir, parsed.url);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      logger.warn(`图片资源不存在，保持原路径: ${sourcePath}`);
      return match;
    }

    const assetRelPath = buildAssetRelativePath(parsed.url, namespace);
    const targetPath = path.join(distDir, assetRelPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);

    return `![${alt}](${formatMarkdownLinkTarget(assetRelPath, parsed.title)})`;
  });

  return restoreProtectedMarkdownCode(rewritten, protectedMarkdown.placeholders);
}

function buildAssetRelativePath(rawUrl, namespace) {
  const cleanUrl = rawUrl.replace(/[?#].*$/, '');
  const safeParts = cleanUrl
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => sanitizePathPart(part));
  const namespaced = namespace ? [sanitizePathPart(namespace), ...safeParts] : safeParts;
  return path.posix.join('assets', ...namespaced);
}

function parseMarkdownLinkTarget(rawTarget) {
  const value = String(rawTarget || '').trim();
  if (!value) return null;

  if (value.startsWith('<')) {
    const closeIndex = value.indexOf('>');
    if (closeIndex === -1) return null;
    return {
      url: value.slice(1, closeIndex).trim(),
      title: value.slice(closeIndex + 1).trim(),
    };
  }

  const match = value.match(/^(\S+)(?:\s+(.+))?$/);
  if (!match) return null;
  return { url: match[1], title: match[2] || '' };
}

function formatMarkdownLinkTarget(url, title) {
  const formattedUrl = /[\s()]/.test(url) ? `<${url}>` : url;
  return title ? `${formattedUrl} ${title}` : formattedUrl;
}

function shouldKeepAssetUrl(url) {
  return (
    !url ||
    url.startsWith('#') ||
    url.startsWith('/') ||
    /^[a-z][a-z0-9+.-]*:/i.test(url)
  );
}

function sanitizePathPart(part) {
  return String(part)
    .trim()
    .replace(/[<>:"|?*]/g, '-')
    .replace(/^\.+$/, '_')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ') || 'asset';
}

module.exports = { rewriteMarkdownImageAssets };
