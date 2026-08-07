const fs = require('fs');
const path = require('path');
const { PDFArray, PDFDict, PDFDocument, PDFName, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { renderHtml } = require('../render/renderHtml');
const { DEFAULT_STYLE } = require('../render/style');
const { formatChapterTitle, isHeadingNumberingEnabled } = require('./headings');
const logger = require('../utils/logger');

/**
 * Post-process a PDF buffer: draw chapter headers on pages and prepend a cover image if configured.
 * @param {object} options
 * @param {import('puppeteer').Browser} options.browser - The Puppeteer browser instance.
 * @param {import('puppeteer').Page} options.page - The Puppeteer page used to render the PDF.
 * @param {string} options.bookDir - Absolute path to the book project directory.
 * @param {Buffer} options.pdfBuffer - The raw PDF buffer from Puppeteer.
 * @param {object} options.config - The book config object.
 * @param {object} options.style - The merged style configuration.
 * @param {object} options.plugins - The plugins configuration.
 * @returns {Promise<Uint8Array>} The post-processed PDF bytes.
 */
async function postProcessPdf({ browser, page, bookDir, pdfBuffer, config, style, plugins, chapters }) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const shouldDrawChapterHeaders = style.header?.enabled !== false && hasChapterHeaderSlot(style.header);

  if (shouldDrawChapterHeaders) {
    await applyChapterHeadersToDocument({ browser, page, pdfDoc, config, style, plugins, chapters });
  }

  await prependCoverImageToDocument({ bookDir, pdfDoc, config });
  return pdfDoc.save();
}

async function applyChapterHeadersToDocument({ browser, page, pdfDoc, config, style, plugins, chapters }) {
  const pageRanges = await resolveChapterPageRanges({ browser, page, pdfDoc, config, style, plugins, chapters });
  if (!pageRanges.length) return;

  const font = await embedHeaderFont(pdfDoc, style.header);
  if (!font) {
    logger.warn('未找到可嵌入的中文字体，已跳过章节名页眉绘制。可在 style.header.fontPath 中配置字体路径。');
    return;
  }

  const header = style.header || {};
  const fontSize = parseCssLengthToPt(header.fontSize || style.headerFooter?.fontSize || '9pt', 9);
  const color = parseCssColor(header.color || style.headerFooter?.color || '#888');
  const padding = parseCssBox(header.padding || style.headerFooter?.padding || '0 18mm');
  const topMargin = parseCssLengthToPt(style.page?.pdfMargin?.top || DEFAULT_STYLE.page.pdfMargin.top, 62);
  const pages = pdfDoc.getPages();

  for (const range of pageRanges) {
    const start = Math.max(0, range.startPageIndex);
    const end = Math.min(pages.length - 1, range.endPageIndex);
    for (let pageIndex = start; pageIndex <= end; pageIndex += 1) {
      drawChapterHeaderOnPage(pages[pageIndex], range.title, { header, font, fontSize, color, padding, topMargin });
    }
  }
}

async function prependCoverImageToDocument({ bookDir, pdfDoc, config }) {
  if (!config.coverImage) return;

  const imagePath = path.resolve(bookDir, config.coverImage);
  if (!fs.existsSync(imagePath)) {
    logger.warn(`封面图不存在，已跳过: ${imagePath}`);
    return;
  }

  const firstPage = pdfDoc.getPage(0);
  const pageWidth = firstPage.getWidth();
  const pageHeight = firstPage.getHeight();
  const imageBytes = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  let image;
  if (ext === '.jpg' || ext === '.jpeg') {
    image = await pdfDoc.embedJpg(imageBytes);
  } else if (ext === '.png') {
    image = await pdfDoc.embedPng(imageBytes);
  } else {
    throw new Error(`封面图格式不支持: ${imagePath}。当前 PDF 封面只支持 PNG、JPG/JPEG。`);
  }

  const coverPage = pdfDoc.insertPage(0, [pageWidth, pageHeight]);
  const imageRatio = image.width / image.height;
  const pageRatio = pageWidth / pageHeight;
  let drawWidth = pageWidth;
  let drawHeight = pageHeight;

  if (imageRatio > pageRatio) {
    drawHeight = pageHeight;
    drawWidth = pageHeight * imageRatio;
  } else {
    drawWidth = pageWidth;
    drawHeight = pageWidth / imageRatio;
  }

  coverPage.drawImage(image, {
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}

function hasChapterHeaderSlot(header = {}) {
  return ['left', 'center', 'right'].some((position) => header[position]?.source === 'chapter');
}

async function resolveChapterPageRanges({ browser, page, pdfDoc, config, style, plugins, chapters }) {
  const destinationRanges = resolveNamedDestinationChapterPageRanges({ pdfDoc, chapters });
  if (isValidChapterPageRanges(destinationRanges, pdfDoc.getPageCount(), config.chapters.length)) {
    return destinationRanges;
  }

  const strategy = style.header?.chapterPageRangeStrategy || 'auto';

  if (strategy === 'exact') {
    const exactRanges = await resolveExactChapterPageRanges({ browser, page, pdfDoc, config, style, plugins, chapters });
    if (exactRanges.length) return exactRanges;
    logger.warn('精确章节页码统计失败，尝试使用 DOM 估算结果。');
    try {
      return await resolveEstimatedChapterPageRanges({ page, pdfDoc, config, style });
    } catch (err) {
      logger.warn(`章节页码估算失败，已跳过章节名页眉绘制: ${err.message}`);
      return [];
    }
  }

  try {
    const estimatedRanges = await resolveEstimatedChapterPageRanges({ page, pdfDoc, config, style });
    if (estimatedRanges.length) return estimatedRanges;
    if (strategy === 'estimate') return [];
    logger.warn('章节页码估算结果异常，将使用逐章 PDF 统计。');
  } catch (err) {
    if (strategy === 'estimate') {
      logger.warn(`章节页码估算失败，已跳过章节名页眉绘制: ${err.message}`);
      return [];
    }
    logger.warn(`章节页码估算失败，将使用逐章 PDF 统计: ${err.message}`);
  }

  return resolveExactChapterPageRanges({ browser, page, pdfDoc, config, style, plugins, chapters });
}

function resolveNamedDestinationChapterPageRanges({ pdfDoc, chapters = [] }) {
  const destinations = pdfDoc.catalog.lookup(PDFName.of('Dests'));
  if (!(destinations instanceof PDFDict)) return [];

  const pageIndexByRef = new Map(pdfDoc.getPages().map((page, index) => [page.ref.toString(), index]));
  const startPageIndexes = [];

  for (const [, value] of destinations.entries()) {
    const destination = pdfDoc.context.lookup(value);
    if (!(destination instanceof PDFArray) || destination.size() === 0) continue;
    const pageRef = destination.get(0);
    const pageIndex = pageIndexByRef.get(pageRef?.toString());
    if (Number.isInteger(pageIndex)) startPageIndexes.push(pageIndex);
  }

  const uniqueStarts = [...new Set(startPageIndexes)].sort((a, b) => a - b);
  if (uniqueStarts.length !== chapters.length) return [];

  return uniqueStarts.map((startPageIndex, index) => ({
    title: chapters[index].title,
    startPageIndex,
    endPageIndex: index + 1 < uniqueStarts.length ? uniqueStarts[index + 1] - 1 : pdfDoc.getPageCount() - 1,
  }));
}

async function resolveEstimatedChapterPageRanges({ page, pdfDoc, config, style }) {
  const ranges = await estimateChapterPageRangesFromRenderedPage({ page, pdfDoc, config, style });
  if (isValidChapterPageRanges(ranges, pdfDoc.getPageCount(), config.chapters.length)) return ranges;
  return [];
}

async function resolveExactChapterPageRanges({ browser, page, pdfDoc, config, style, plugins, chapters }) {
  try {
    const chapterPageCounts = await countChapterPages({ browser, config, style, plugins, chapters });
    const exactRanges = buildChapterPageRangesFromCounts({
      chapterPageCounts,
      pageCount: pdfDoc.getPageCount(),
    });
    if (isValidChapterPageRanges(exactRanges, pdfDoc.getPageCount(), config.chapters.length)) {
      return exactRanges;
    }
    logger.warn('逐章 PDF 统计结果异常。');
  } catch (err) {
    logger.warn(`逐章 PDF 统计失败: ${err.message}`);
  }
  return [];
}

function buildChapterPageRangesFromCounts({ chapterPageCounts, pageCount }) {
  const chapterPageTotal = chapterPageCounts.reduce((sum, item) => sum + item.pageCount, 0);
  const inferredStart = pageCount - chapterPageTotal;
  let pageIndex = Number.isInteger(inferredStart) && inferredStart >= 0 ? inferredStart : 0;

  return chapterPageCounts.map((chapter) => {
    const startPageIndex = pageIndex;
    const endPageIndex = pageIndex + chapter.pageCount - 1;
    pageIndex = endPageIndex + 1;
    return { title: chapter.title, startPageIndex, endPageIndex };
  });
}

async function estimateChapterPageRangesFromRenderedPage({ page, pdfDoc, config, style }) {
  const headingNumberingEnabled = isHeadingNumberingEnabled(config);
  const pageContentHeightPx = getPdfContentHeightPx(pdfDoc, style);
  if (!Number.isFinite(pageContentHeightPx) || pageContentHeightPx <= 0) {
    throw new Error('无法计算 PDF 页面内容高度');
  }

  const markers = await page.evaluate(() => {
    const forcedBreakSelector = '.cover-end, .toc-end, h1';
    const forcedBreakElements = Array.from(document.querySelectorAll(forcedBreakSelector));
    return Array.from(document.querySelectorAll('.bookcli-chapter-start')).map((element) => {
      const rect = element.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const forcedBreaksBefore = forcedBreakElements.filter((item) => {
        if (item === element) return true;
        const itemTop = item.getBoundingClientRect().top + window.scrollY;
        if (itemTop >= top) return false;
        if (item.matches('.cover-end, .toc-end')) return true;
        const style = window.getComputedStyle(item);
        return style.breakBefore === 'page' || style.pageBreakBefore === 'always';
      }).length;

      return {
        index: Number(element.dataset.bookcliChapterIndex),
        title: element.textContent.trim(),
        top,
        forcedBreaksBefore,
      };
    });
  });

  const sorted = markers
    .filter((marker) => Number.isInteger(marker.index) && marker.index >= 0)
    .sort((a, b) => a.index - b.index);

  const startPages = sorted.map((marker) => ({
    title: marker.title || formatChapterTitle(marker.index, config.chapters[marker.index]?.title || '', headingNumberingEnabled),
    startPageIndex: Math.max(0, Math.floor(marker.top / pageContentHeightPx) + marker.forcedBreaksBefore),
  }));

  return startPages.map((item, index) => {
    const next = startPages[index + 1];
    const endPageIndex = next ? Math.max(item.startPageIndex, next.startPageIndex - 1) : pdfDoc.getPageCount() - 1;
    return { ...item, endPageIndex };
  });
}

function isValidChapterPageRanges(ranges, pageCount, chapterCount) {
  if (!Array.isArray(ranges) || ranges.length !== chapterCount) return false;
  let previousStart = -1;
  for (const range of ranges) {
    if (!Number.isInteger(range.startPageIndex) || !Number.isInteger(range.endPageIndex)) return false;
    if (range.startPageIndex < 0 || range.endPageIndex < range.startPageIndex || range.endPageIndex >= pageCount) {
      return false;
    }
    if (range.startPageIndex <= previousStart) return false;
    previousStart = range.startPageIndex;
  }
  return true;
}

function getPdfContentHeightPx(pdfDoc, style) {
  const firstPage = pdfDoc.getPage(0);
  const pageHeightPt = firstPage.getHeight();
  const margins = style.page?.pdfMargin || DEFAULT_STYLE.page.pdfMargin;
  const top = parseCssLengthToPt(margins.top, parseCssLengthToPt(DEFAULT_STYLE.page.pdfMargin.top, 0));
  const bottom = parseCssLengthToPt(margins.bottom, parseCssLengthToPt(DEFAULT_STYLE.page.pdfMargin.bottom, 0));
  return Math.max(1, ((pageHeightPt - top - bottom) * 96) / 72);
}

async function countChapterPages({ browser, config, style, plugins, chapters = [] }) {
  const concurrency = Math.max(1, Math.min(4, chapters.length));
  const chapterRenderConfig = { ...config, chapters: [] };
  const tasks = chapters.map((chapter) => ({
    title: chapter.title,
    html: renderHtml(chapter.markdown, chapterRenderConfig, style, plugins),
  }));

  const results = [];
  for (let batchStart = 0; batchStart < tasks.length; batchStart += concurrency) {
    const batch = tasks.slice(batchStart, batchStart + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (task) => {
        const page = await browser.newPage();
        try {
          await page.emulateMediaType('print');
          await page.setContent(task.html, { waitUntil: 'networkidle0' });
          const buffer = await page.pdf({
            format: style.page?.size || 'A4',
            printBackground: true,
            displayHeaderFooter: false,
            margin: style.page?.pdfMargin || DEFAULT_STYLE.page.pdfMargin,
          });
          const chapterPdf = await PDFDocument.load(buffer);
          return { title: task.title, pageCount: chapterPdf.getPageCount() };
        } finally {
          await page.close();
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}

async function embedHeaderFont(pdfDoc, header = {}) {
  const fontPath = findHeaderFontPath(header);
  if (!fontPath) return null;
  pdfDoc.registerFontkit(fontkit);
  return pdfDoc.embedFont(fs.readFileSync(fontPath), { subset: true });
}

function findHeaderFontPath(header = {}) {
  if (header.fontPath) {
    const configured = path.resolve(header.fontPath);
    if (fs.existsSync(configured)) return configured;
    logger.warn(`style.header.fontPath 指向的字体不存在: ${configured}`);
  }

  const candidates = [
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/System/Library/Fonts/Apple Symbols.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'msyh.ttc'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'simsun.ttc'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'simhei.ttf'),
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  ];
  return candidates.find((filePath) => fs.existsSync(filePath));
}

function drawChapterHeaderOnPage(page, title, options) {
  const { header, font, fontSize, color, padding, topMargin } = options;
  const width = page.getWidth();
  const y = page.getHeight() - Math.max(fontSize + 4, topMargin / 2 + fontSize / 2);
  const leftX = padding.left;
  const rightX = width - padding.right;
  const slotWidth = Math.max(20, (rightX - leftX) / 3);

  if (header.left?.source === 'chapter') {
    drawAlignedText(page, title, { x: leftX, y, width: slotWidth, align: 'left', font, fontSize, color });
  }
  if (header.center?.source === 'chapter') {
    drawAlignedText(page, title, {
      x: leftX + slotWidth,
      y,
      width: slotWidth,
      align: 'center',
      font,
      fontSize,
      color,
    });
  }
  if (header.right?.source === 'chapter') {
    drawAlignedText(page, title, {
      x: rightX - slotWidth,
      y,
      width: slotWidth,
      align: 'right',
      font,
      fontSize,
      color,
    });
  }
}

function drawAlignedText(page, text, options) {
  const { y, width, align, font, fontSize, color } = options;
  const fittedText = fitTextToWidth(text, font, fontSize, width);
  const textWidth = font.widthOfTextAtSize(fittedText, fontSize);
  let x = options.x;
  if (align === 'center') x += (width - textWidth) / 2;
  if (align === 'right') x += width - textWidth;
  page.drawText(fittedText, { x, y, size: fontSize, font, color });
}

function fitTextToWidth(text, font, fontSize, maxWidth) {
  const source = String(text || '');
  if (font.widthOfTextAtSize(source, fontSize) <= maxWidth) return source;

  let out = source;
  while (out.length > 0 && font.widthOfTextAtSize(`${out}...`, fontSize) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out ? `${out}...` : '';
}

function parseCssBox(value) {
  const parts = String(value || '0').trim().split(/\s+/);
  const top = parseCssLengthToPt(parts[0], 0);
  const right = parseCssLengthToPt(parts[1] || parts[0], 0);
  const bottom = parseCssLengthToPt(parts[2] || parts[0], 0);
  const left = parseCssLengthToPt(parts[3] || parts[1] || parts[0], 0);
  return { top, right, bottom, left };
}

function parseCssLengthToPt(value, fallback = 0) {
  const match = String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)(mm|cm|in|px|pt)?$/i);
  if (!match) return fallback;
  const number = Number(match[1]);
  const unit = (match[2] || 'pt').toLowerCase();
  if (unit === 'mm') return (number * 72) / 25.4;
  if (unit === 'cm') return (number * 72) / 2.54;
  if (unit === 'in') return number * 72;
  if (unit === 'px') return (number * 72) / 96;
  return number;
}

function parseCssColor(value) {
  const raw = String(value || '#888').trim();
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return rgb(0.533, 0.533, 0.533);
  const full = hex[1].length === 3 ? hex[1].split('').map((ch) => ch + ch).join('') : hex[1];
  return rgb(
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255
  );
}

module.exports = { postProcessPdf, resolveNamedDestinationChapterPageRanges };
