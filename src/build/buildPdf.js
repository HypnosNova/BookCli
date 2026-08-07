const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');
const { buildHtml, sanitizeFileName } = require('./buildHtml');
const { renderHtml } = require('../render/renderHtml');
const { postProcessPdf } = require('./pdfPostProcess');
const { DEFAULT_STYLE, mergeDeep, styleToCss } = require('../render/style');
const { escapeHtml } = require('../utils/utils');
const logger = require('../utils/logger');
const { createStagingDirectory, publishStagedArtifacts, removeStagingDirectory } = require('./staging');

/**
 * Build a PDF file from the book project using Puppeteer.
 * @param {string} bookDir - Absolute path to the book project directory.
 * @returns {Promise<string>} The absolute path to the generated PDF file.
 */
async function buildPdf(bookDir) {
  const build = buildHtml(bookDir);
  const { htmlPath, config, style, plugins, output } = build;
  const mergedStyle = mergeDeep(DEFAULT_STYLE, style);

  const distDir = path.join(bookDir, 'dist');
  const outputBaseName = sanitizeFileName(output?.pdfName || config.title || 'book');
  const pdfName = `${outputBaseName}.pdf`;
  const pdfPath = path.join(distDir, pdfName);
  const stagingDir = createStagingDirectory(distDir);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-crash-reporter', '--disable-crashpad'],
    });
    const page = await browser.newPage();
    await page.emulateMediaType('print');
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: mergedStyle.page?.size || 'A4',
      printBackground: true,
      displayHeaderFooter: mergedStyle.header?.enabled !== false || mergedStyle.pageNumber?.enabled !== false,
      margin: mergedStyle.page?.pdfMargin || DEFAULT_STYLE.page.pdfMargin,
      headerTemplate: mergedStyle.header?.enabled === false ? '<div></div>' : buildHeaderTemplate(config, mergedStyle),
      footerTemplate: mergedStyle.pageNumber?.enabled === false ? '<div></div>' : buildFooterTemplate(config, mergedStyle),
    });

    const finalPdfBuffer = await postProcessPdf({
      browser,
      page,
      bookDir,
      pdfBuffer,
      config,
      style: mergedStyle,
      plugins,
      chapters: build.chapters,
    });
    fs.writeFileSync(path.join(stagingDir, pdfName), finalPdfBuffer);
    publishStagedArtifacts(stagingDir, distDir, [pdfName]);
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      removeStagingDirectory(stagingDir);
    }
  }

  logger.info(`已生成 ${path.relative(process.cwd(), pdfPath)}`);
  return pdfPath;
}

function buildHeaderTemplate(config, style) {
  const headerFooter = style.headerFooter || {};
  const header = style.header || {};
  const boxStyle = templateBoxStyle(header, {
    fontSize: header.fontSize || headerFooter.fontSize || '9pt',
    color: header.color || headerFooter.color || '#888',
    padding: header.padding || headerFooter.padding || '0 18mm',
  });

  return `<div style="${boxStyle} display:flex; align-items:center; justify-content:space-between;">
    <div style="flex:1; text-align:left;">${renderHeaderSlot(header.left, config)}</div>
    <div style="flex:1; text-align:center;">${renderHeaderSlot(header.center, config)}</div>
    <div style="flex:1; text-align:right;">${renderHeaderSlot(header.right, config)}</div>
  </div>`;
}

function buildFooterTemplate(config, style) {
  const headerFooter = style.headerFooter || {};
  const pageNumber = style.pageNumber || {};
  const boxStyle = templateBoxStyle(pageNumber, {
    fontSize: pageNumber.fontSize || headerFooter.fontSize || '9pt',
    color: pageNumber.color || headerFooter.color || '#888',
    padding: pageNumber.padding || headerFooter.padding || '0 18mm',
    textAlign: pageNumber.textAlign || headerFooter.textAlign || 'center',
  });

  return `<div style="${boxStyle}">${renderPageNumberFormat(pageNumber.format, config)}</div>`;
}

function templateBoxStyle(style, defaults) {
  const merged = {
    width: '100%',
    ...defaults,
    ...style,
  };

  delete merged.enabled;
  delete merged.format;
  delete merged.left;
  delete merged.center;
  delete merged.right;
  delete merged.source;
  delete merged.text;
  return styleToCss(merged).trim();
}

function renderHeaderSlot(slot = {}, config) {
  const source = slot.source || 'none';
  if (source === 'book') return escapeHtml(config.title || '');
  if (source === 'text') return escapeHtml(slot.text || '');
  return '';
}

function renderPageNumberFormat(format, config) {
  const tokens = {
    page: '<span class="pageNumber"></span>',
    total: '<span class="totalPages"></span>',
    title: escapeHtml(config.title || ''),
  };

  return String(format || DEFAULT_STYLE.pageNumber.format)
    .split(/(\{page\}|\{total\}|\{title\})/g)
    .map((part) => {
      const match = part.match(/^\{(.+)\}$/);
      return match && tokens[match[1]] ? tokens[match[1]] : escapeHtml(part);
    })
    .join('');
}

module.exports = { buildPdf, renderHtml };
