const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const hljs = require('highlight.js');
const katex = require('katex');
const MarkdownIt = require('markdown-it');
const anchor = require('markdown-it-anchor');
const { DEFAULT_STYLE, STYLE_PROP_MAP, cssValue, mergeDeep, styleToCss } = require('./style');
const { escapeHtml, escapeRegExp, protectMarkdownCode, restoreProtectedMarkdownCode, slugify } = require('../utils/utils');
const { formatChapterTitle, isHeadingNumberingEnabled, stripHeadingNumber } = require('../build/headings');
const { DEFAULT_LANGUAGE } = require('../utils/constants');

/**
 * Render a full HTML document from markdown content using MarkdownIt with optional math and code highlighting.
 * @param {string} markdown - The markdown content to render.
 * @param {object} config - The book config object (title, chapters, etc.).
 * @param {object} [style={}] - The style configuration.
 * @param {object} [plugins={}] - The plugins configuration (math, codeHighlight).
 * @returns {string} The complete HTML document string.
 */
function renderHtml(markdown, config, style = {}, plugins = {}) {
  const mergedStyle = mergeDeep(DEFAULT_STYLE, style);
  const pluginConfig = normalizePlugins(plugins);
  const math = pluginConfig.math.enabled ? extractMath(markdown) : { markdown, placeholders: [] };
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: pluginConfig.codeHighlight.enabled ? (str, lang) => highlightCode(str, lang) : undefined,
  }).use(anchor, { slugify, permalink: false });

  const headings = [];
  for (const line of math.markdown.split('\n')) {
    const m = line.match(/^# (?!#)(.+)$/);
    if (m) headings.push(m[1].trim());
  }
  const headingNumberingEnabled = isHeadingNumberingEnabled(config);
  const expectedChapterHeadings = config.chapters.map((chapter, index) =>
    formatChapterTitle(index, chapter.title, headingNumberingEnabled)
  );
  const chapterHeadings = headings.slice(1).filter((heading) => {
    const stripped = stripHeadingNumber(heading);
    return expectedChapterHeadings.some((expected) => stripHeadingNumber(expected) === stripped);
  });

  const tocMarkdown = chapterHeadings.length
    ? '<div class="cover-end"></div>\n\n<nav class="toc">\n\n<h1>目　录</h1>\n\n<ol>\n' +
      chapterHeadings.map((h) => `<li><a href="#${escapeHtml(slugify(h))}">${escapeHtml(h)}</a></li>`).join('\n') +
      '\n</ol>\n\n</nav>\n\n<div class="toc-end"></div>\n\n'
    : '';

  let injected;
  if (tocMarkdown) {
    let h1Count = 0;
    injected = math.markdown.replace(/^# (?!#)/gm, (m) => {
      h1Count += 1;
      if (h1Count === 2) return tocMarkdown + m;
      return m;
    });
  } else {
    injected = math.markdown;
  }

  const renderedBody = markChapterHeadings(restoreMath(md.render(injected), math.placeholders), chapterHeadings);

  const lang = config.language || DEFAULT_LANGUAGE;

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(config.title)}</title>
<style>
${buildCss(mergedStyle, pluginConfig)}
</style>
</head>
<body>
<div class="bookcli-content">
${renderedBody}
</div>
</body>
</html>`;
}

function extractMath(markdown) {
  const placeholders = [];
  const protectedMarkdown = protectMarkdownCode(markdown, { tokenPrefix: 'BOOKCLI_CODE' });
  let out = protectedMarkdown.markdown.replace(/(^|\n)\$\$\s*\n([\s\S]*?)\n\s*\$\$(?=\n|$)/g, (match, prefix, content) => {
    const id = placeholders.length;
    placeholders.push({
      token: `BOOKCLI_MATH_BLOCK_${id}`,
      html: renderKatex(content.trim(), true),
    });
    return `${prefix}\n\nBOOKCLI_MATH_BLOCK_${id}\n\n`;
  });

  out = out.replace(/(^|[^\\\w$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?![\w$])/g, (match, prefix, content) => {
    const id = placeholders.length;
    placeholders.push({
      token: `BOOKCLI_MATH_INLINE_${id}`,
      html: renderKatex(content.trim(), false),
    });
    return `${prefix}BOOKCLI_MATH_INLINE_${id}`;
  });

  return { markdown: restoreProtectedMarkdownCode(out, protectedMarkdown.placeholders), placeholders };
}

function renderKatex(content, displayMode) {
  try {
    const html = katex.renderToString(content, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    });
    return displayMode ? `<div class="math-display">${html}</div>` : html;
  } catch (_) {
    return escapeHtml(content);
  }
}

function restoreMath(html, placeholders) {
  let out = html;
  for (const item of placeholders) {
    const tokenPattern = escapeRegExp(item.token);
    out = out.replace(new RegExp(`<p>${tokenPattern}</p>`, 'g'), item.html);
    out = out.replace(new RegExp(tokenPattern, 'g'), item.html);
  }
  return out;
}

function markChapterHeadings(html, chapterHeadings) {
  let out = html;
  chapterHeadings.forEach((heading, index) => {
    const id = slugify(heading);
    const pattern = new RegExp(`<h1([^>]*)id="${escapeRegExp(id)}"([^>]*)>(${escapeRegExp(escapeHtml(heading))})</h1>`);
    out = out.replace(pattern, (match, before, after, text) => {
      if (match.includes('bookcli-chapter-start')) return match;
      return `<h1${before}id="${escapeHtml(id)}"${after} class="bookcli-chapter-start" data-bookcli-chapter-index="${index}">${text}</h1>`;
    });
  });
  return out.replace(
    /(<h1[^>]*class="bookcli-chapter-start"[^>]*>[\s\S]*?<\/h1>)(\s*<blockquote>[\s\S]*?<\/blockquote>)?/g,
    (match, heading, metadata = '') =>
      `<section class="bookcli-chapter-page-break"><div class="bookcli-chapter-start-group">${heading}${metadata}</div></section>`
  );
}

/**
 * Build the complete CSS string for the rendered HTML document.
 * @param {object} style - The merged style configuration.
 * @param {object} plugins - The normalized plugins configuration.
 * @returns {string} The concatenated CSS rules.
 */
function buildCss(style, plugins) {
  const page = style.page || {};
  const header = style.header || {};
  const toc = style.toc || {};
  const table = style.table || {};
  const headerFooter = style.headerFooter || {};
  const hr = style.hr || {};
  const content = style.content || {};
  const contentMaxWidth = content.maxWidth || '210mm';
  const contentPadding = content.padding || '22mm 18mm 24mm';
  const contentBackground = content.background || '#ffffff';
  const parts = [
    buildPageCss(page, header),
    `  html, body {${styleToCss(style.body)}}`,
    '  body { margin: 0; padding: 0; }',
    `  .bookcli-content { max-width: ${cssValue(contentMaxWidth)}; margin: 0 auto; padding: ${cssValue(contentPadding)}; background: ${cssValue(contentBackground)}; box-sizing: border-box; min-height: 100vh; }`,
    '  @media (max-width: 800px) { .bookcli-content { max-width: 100%; padding: 1.5em; } }',
    `  @media print { html, body { background: ${cssValue(contentBackground)}; } }`,
    `  h1 {${styleToCss(style.h1)}}`,
    '  body > h1:first-of-type { page-break-before: avoid; }',
    '  @media print { .bookcli-chapter-page-break { display: block; break-before: page; page-break-before: always; } .bookcli-chapter-start-group { display: inline-block; width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid; padding-top: 10mm; } .bookcli-chapter-start-group .bookcli-chapter-start { break-before: avoid; page-break-before: avoid; } }',
    `  h2 {${styleToCss(style.h2)}}`,
    `  h3 {${styleToCss(style.h3)}}`,
    `  h4 {${styleToCss(style.h4)}}`,
    `  h5 {${styleToCss(style.h5)}}`,
    `  h6 {${styleToCss(style.h6)}}`,
    `  p {${styleToCss(style.paragraph)}}`,
    `  blockquote {${styleToCss(style.blockquote)}}`,
    `  code, pre {${styleToCss(style.code, ['backgroundColor', 'color'])}}`,
    `  :not(pre) > code {${styleToCss({
      backgroundColor: style.code?.backgroundColor,
      color: style.code?.color,
      padding: style.code?.padding || '0.1em 0.25em',
      borderRadius: style.code?.borderRadius || '3px',
    })}}`,
    `  pre {${styleToCss(style.codeBlock)} overflow-x: auto; page-break-inside: avoid; }`,
    '  .cover-end, .toc-end { page-break-after: always; height: 0; }',
    `  body > h1:first-of-type { text-align: ${cssValue(style.cover?.titleAlign || 'left')}; }`,
    `  body > blockquote:first-of-type { color: ${cssValue(style.cover?.subtitleColor || '#555')}; }`,
    `  nav.toc h1 { page-break-before: avoid; border: none; text-align: ${cssValue(toc.titleAlign || 'center')}; font-size: ${cssValue(toc.titleFontSize || '20pt')}; }`,
    '  nav.toc ol { list-style: none; padding: 0; }',
    `  nav.toc li { padding: ${cssValue(toc.itemPadding || '0.45em 0')}; border-bottom: 1px dotted ${cssValue(toc.dividerColor || '#ccc')}; }`,
    `  nav.toc a { color: ${cssValue(toc.linkColor || style.link?.color || '#1f1f1f')}; text-decoration: ${cssValue(style.link?.textDecoration || 'none')}; }`,
    `  a {${styleToCss(style.link)}}`,
    `  hr { border: none; border-top: 1px solid ${cssValue(hr.borderColor || '#ccc')}; margin: ${cssValue(hr.margin || '1.5em 0')}; }`,
    '  img { max-width: 100%; }',
    '  table { border-collapse: collapse; width: auto; max-width: 100%; margin: 1em auto; }',
    `  th, td { border: 1px solid ${cssValue(table.borderColor || '#ccc')}; padding: ${cssValue(table.cellPadding || '0.4em 0.6em')}; }`,
    `  th { background-color: ${cssValue(table.headerBackgroundColor || 'transparent')}; }`,
    `  .pdf-header-footer { font-size: ${cssValue(headerFooter.fontSize || '9pt')}; color: ${cssValue(headerFooter.color || '#888')}; }`,
  ];

  if (plugins.math.enabled) parts.push(loadPackageCss('katex/dist/katex.min.css'));
  if (plugins.codeHighlight.enabled) parts.push(loadHighlightThemeCss(plugins.codeHighlight.theme));
  if (plugins.math.enabled) {
    parts.push('  .math-display { page-break-inside: avoid; break-inside: avoid; margin: 1em 0; text-align: center; }');
    parts.push('  .math-display .katex-display { margin: 0; }');
    parts.push('  .katex { text-indent: 0; }');
  }

  return parts.join('\n');
}

function buildPageCss(page) {
  const rules = [`size: ${cssValue(page.size || 'A4')};`, `margin: ${cssValue(page.margin || '22mm 18mm 24mm 18mm')};`];
  return `  @page { ${rules.join(' ')} }`;
}

function highlightCode(str, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
    } catch (_) {
      // Fall through to escaped plain code.
    }
  }
  return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
}

function loadPackageCss(packagePath) {
  try {
    const filePath = require.resolve(packagePath);
    const css = fs.readFileSync(filePath, 'utf8');
    return rewriteCssAssetUrls(css, path.dirname(filePath));
  } catch (_) {
    return '';
  }
}

function rewriteCssAssetUrls(css, baseDir) {
  return css.replace(/url\(([^)]+)\)/g, (match, rawUrl) => {
    const unquoted = rawUrl.trim().replace(/^['"]|['"]$/g, '');
    if (
      !unquoted ||
      unquoted.startsWith('data:') ||
      unquoted.startsWith('http:') ||
      unquoted.startsWith('https:') ||
      unquoted.startsWith('file:') ||
      unquoted.startsWith('/')
    ) {
      return match;
    }

    const assetPath = path.resolve(baseDir, unquoted);
    return `url("${pathToFileURL(assetPath).href}")`;
  });
}

function loadHighlightThemeCss(theme = 'github') {
  return loadPackageCss(`highlight.js/styles/${theme}.css`) || loadPackageCss('highlight.js/styles/github.css');
}

/**
 * Normalize the plugins configuration into a consistent { enabled, ... } shape.
 * @param {object} [plugins={}] - The raw plugins config (booleans or objects with enabled).
 * @returns {{ math: { enabled: boolean }, codeHighlight: { enabled: boolean, theme: string } }}
 *   The normalized plugins configuration.
 */
function normalizePlugins(plugins = {}) {
  return {
    math: { enabled: plugins.math === true || plugins.math?.enabled === true },
    codeHighlight: {
      enabled: plugins.codeHighlight === true || plugins.codeHighlight?.enabled === true,
      theme: plugins.codeHighlight?.theme || 'github',
    },
  };
}

module.exports = {
  buildCss,
  normalizePlugins,
  renderHtml,
};
