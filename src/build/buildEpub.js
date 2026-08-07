const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildHtmlInDirectory, sanitizeFileName } = require('./buildHtml');
const { renderHtml } = require('../render/renderHtml');
const { escapeXml } = require('../utils/utils');
const { createZip } = require('../utils/zip');
const { DEFAULT_LANGUAGE } = require('../utils/constants');
const logger = require('../utils/logger');
const { createStagingDirectory, publishStagedArtifacts, removeStagingDirectory } = require('./staging');

/**
 * Build an EPUB file from the book project.
 * @param {string} bookDir - Absolute path to the book project directory.
 * @returns {string} The absolute path to the generated EPUB file.
 */
function buildEpub(bookDir) {
  const distDir = path.join(bookDir, 'dist');
  const stagingDir = createStagingDirectory(distDir);
  try {
    const build = buildHtmlInDirectory(bookDir, stagingDir);
    const outputBaseName = sanitizeFileName(build.output?.epubName || build.config.title || 'book');
    const epubName = `${outputBaseName}.epub`;
    const stagedEpubPath = path.join(stagingDir, epubName);
    const assets = collectAssets(path.join(stagingDir, 'assets'));
    const coverEntry = collectCoverImage(bookDir, build.config, assets);
    const buildDate = resolveEpubBuildDate(build.output);
    const modified = normalizeEpubModifiedTime(buildDate);

    const entries = [
      { name: 'mimetype', data: 'application/epub+zip', store: true },
      { name: 'META-INF/container.xml', data: renderContainerXml() },
      { name: 'OEBPS/content.opf', data: renderPackageOpf(build.config, build.chapters, assets, coverEntry, modified) },
      { name: 'OEBPS/nav.xhtml', data: renderNavXhtml(build.config, build.chapters) },
      {
        name: 'OEBPS/title.xhtml',
        data: renderMarkdownXhtml(build.frontMatterMarkdown, build.config.title, build),
      },
      ...build.chapters.map((chapter) => ({
        name: `OEBPS/${chapter.epubFileName}`,
        data: renderMarkdownXhtml(chapter.markdown, chapter.title, build),
      })),
      ...assets.map((asset) => ({ name: `OEBPS/${asset.href}`, data: fs.readFileSync(asset.filePath) })),
    ];

    if (coverEntry && !assets.some((asset) => asset.href === coverEntry.href)) {
      entries.push({ name: `OEBPS/${coverEntry.href}`, data: fs.readFileSync(coverEntry.filePath) });
    }

    fs.writeFileSync(stagedEpubPath, createZip(entries.map((entry) => ({ ...entry, date: buildDate }))));
    const htmlName = path.basename(build.htmlPath);
    publishStagedArtifacts(stagingDir, distDir, ['assets', 'book.md', htmlName, epubName]);

    const markdownPath = path.join(distDir, 'book.md');
    const htmlPath = path.join(distDir, htmlName);
    const epubPath = path.join(distDir, epubName);
    logger.info(`已生成 ${path.relative(process.cwd(), markdownPath)}`);
    logger.info(`已生成 ${path.relative(process.cwd(), htmlPath)}`);
    logger.info(`已生成 ${path.relative(process.cwd(), epubPath)}`);
    return epubPath;
  } finally {
    removeStagingDirectory(stagingDir);
  }
}

function renderContainerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

function renderPackageOpf(config, chapters, assets, coverEntry, modified) {
  const identifier = stableIdentifier(config);
  const imageItems = [...assets];
  if (coverEntry && !imageItems.some((asset) => asset.href === coverEntry.href)) imageItems.push(coverEntry);
  const manifestAssets = imageItems
    .map((asset, index) => {
      const properties = coverEntry && asset.href === coverEntry.href ? ' properties="cover-image"' : '';
      return `    <item id="asset-${index + 1}" href="${escapeXml(asset.href)}" media-type="${asset.mediaType}"${properties}/>`;
    })
    .join('\n');

  const lang = config.language || DEFAULT_LANGUAGE;
  const manifestChapters = chapters
    .map((chapter, index) => `    <item id="chapter-${index + 1}" href="${escapeXml(chapter.epubFileName)}" media-type="application/xhtml+xml"/>`)
    .join('\n');
  const spineChapters = chapters
    .map((chapter, index) => `    <itemref idref="chapter-${index + 1}"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(config.title || 'Book')}</dc:title>
    ${config.author ? `<dc:creator>${escapeXml(config.author)}</dc:creator>` : ''}
    <dc:language>${escapeXml(lang)}</dc:language>
    <meta property="dcterms:modified">${escapeXml(modified)}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>
${manifestChapters}
${manifestAssets}
  </manifest>
  <spine>
    <itemref idref="title-page"/>
${spineChapters}
  </spine>
</package>
`;
}

function resolveEpubBuildDate(output = {}) {
  return output.epubModified ? new Date(output.epubModified) : new Date();
}

function normalizeEpubModifiedTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`output.epubModified 不是合法日期: ${value}`);
  }
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function renderNavXhtml(config, chapters) {
  const lang = config.language || DEFAULT_LANGUAGE;
  const items = chapters
    .map((chapter) => `      <li><a href="${escapeXml(chapter.epubFileName)}">${escapeXml(chapter.title)}</a></li>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head>
  <title>${escapeXml(config.title || '目录')}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>
`;
}

function renderMarkdownXhtml(markdown, title, build) {
  const renderConfig = { ...build.config, title, chapters: [] };
  const html = renderHtml(markdown, renderConfig, build.style, build.plugins);
  const style = extractTagContent(html, 'style');
  const body = extractTagContent(html, 'body');
  const lang = build.config.language || DEFAULT_LANGUAGE;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head>
  <title>${escapeXml(title || 'Book')}</title>
  <style>
${sanitizeCssForEpub(style)}
  </style>
</head>
<body>
${sanitizeBodyForXhtml(body)}
</body>
</html>
`;
}

function collectAssets(assetDir) {
  if (!fs.existsSync(assetDir)) return [];
  const files = [];
  walk(assetDir, (filePath) => {
    const rel = path.relative(assetDir, filePath).split(path.sep).join('/');
    const mediaType = getMediaType(path.extname(filePath).toLowerCase());
    if (!mediaType) return;
    files.push({ href: `assets/${rel}`, filePath, mediaType });
  });
  return files.sort((a, b) => compareText(a.href, b.href));
}

function collectCoverImage(bookDir, config, assets) {
  if (!config.coverImage) return null;
  const filePath = path.resolve(bookDir, config.coverImage);
  if (!fs.existsSync(filePath)) return null;
  const mediaType = getMediaType(path.extname(filePath).toLowerCase());
  if (!mediaType || !mediaType.startsWith('image/')) return null;
  const href = `assets/cover${path.extname(filePath).toLowerCase()}`;
  const existing = assets.find((asset) => path.resolve(asset.filePath) === filePath);
  return existing || { href, filePath, mediaType };
}

function walk(dir, visit) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(filePath, visit);
    if (entry.isFile()) visit(filePath);
  }
}

function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function extractTagContent(html, tag) {
  const match = String(html).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1] : '';
}

function sanitizeCssForEpub(css) {
  return String(css)
    .replace(/@font-face\{[^}]*file:\/\/[^}]*\}/g, '')
    .replace(/file:\/\/[^)"']+/g, '');
}

const VOID_XHTML_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function sanitizeBodyForXhtml(body) {
  return String(body)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/(<\/?[A-Za-z][^<>]*>)/g)
    .map((part) => (part.startsWith('<') ? sanitizeXhtmlTag(part) : escapeXhtmlText(part)))
    .join('');
}

function sanitizeXhtmlTag(tag) {
  const match = String(tag).match(/^<\s*(\/?)([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)(\/?)\s*>$/);
  if (!match) return escapeXhtmlText(tag);

  const [, closing, rawName, rawAttrs, selfClosing] = match;
  const name = rawName.toLowerCase();
  const attrs = sanitizeXhtmlAttributes(rawAttrs);

  if (name === 'nobr') {
    return closing ? '</span>' : `<span${mergeClassAttribute(attrs, 'nobr')}>`;
  }

  if (VOID_XHTML_TAGS.has(name)) {
    return closing ? '' : `<${name}${attrs} />`;
  }

  if (closing) return `</${name}>`;
  if (selfClosing) return `<${name}${attrs} />`;
  return `<${name}${attrs}>`;
}

function sanitizeXhtmlAttributes(attrs) {
  return String(attrs || '')
    .replace(/\s+\/\s*$/g, '')
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
    .replace(/</g, '&lt;');
}

function mergeClassAttribute(attrs, className) {
  if (/\sclass\s*=/i.test(attrs)) {
    return attrs.replace(/(\sclass\s*=\s*)(["'])(.*?)\2/i, (match, prefix, quote, value) => {
      const classes = String(value).split(/\s+/).filter(Boolean);
      if (!classes.includes(className)) classes.push(className);
      return `${prefix}${quote}${classes.join(' ')}${quote}`;
    });
  }
  return `${attrs} class="${className}"`;
}

function escapeXhtmlText(text) {
  return String(text)
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stableIdentifier(config) {
  if (config.identifier) return config.identifier;
  const source = `${config.title || 'book'}:${config.author || ''}:${config.date || ''}`;
  return `urn:bookcli:${crypto.createHash('sha1').update(source).digest('hex')}`;
}

function getMediaType(ext) {
  return {
    '.css': 'text/css',
    '.html': 'application/xhtml+xml',
    '.xhtml': 'application/xhtml+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  }[ext] || null;
}

module.exports = { buildEpub };
