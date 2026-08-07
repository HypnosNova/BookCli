const fs = require('fs');
const path = require('path');
const { BookCliError } = require('../utils/errors');
const { resolveChapterPaths } = require('../utils/safePath');

/**
 * Load and return the book configuration section from the project config.
 * @param {string} bookDir - Absolute path to the book project directory.
 * @returns {object} The normalized book config object (title, chapters, etc.).
 */
function loadBookConfig(bookDir) {
  return loadBookProjectConfig(bookDir).book;
}

/**
 * Load the full book project configuration including book, style, plugins, and output sections.
 * @param {string} bookDir - Absolute path to the book project directory.
 * @returns {{ book: object, style: object, plugins: object, output: object }} The complete project config.
 */
function loadBookProjectConfig(bookDir) {
  const configPath = path.join(bookDir, 'config.json');
  if (fs.existsSync(configPath)) {
    const config = readJson(configPath, 'config.json');
    const book = normalizeBookConfig(config.book || config, 'config.json');
    validateBookProject({ bookDir, book, style: config.style || {}, plugins: config.plugins || {}, output: config.output || {} });
    return {
      book,
      style: config.style || {},
      plugins: config.plugins || {},
      output: config.output || {},
    };
  }

  const legacyPath = path.join(bookDir, 'book.json');
  if (!fs.existsSync(legacyPath)) {
    throw new BookCliError(`未找到 config.json 或 book.json: ${configPath}`, { code: 'ENOCONFIG' });
  }

  return {
    book: validateLegacyBookConfig(bookDir, normalizeBookConfig(readJson(legacyPath, 'book.json'), 'book.json')),
    style: loadOptionalJson(bookDir, 'style.json', {}),
    plugins: loadOptionalJson(bookDir, 'plugins.json', {}),
    output: {},
  };
}

function loadOptionalJson(bookDir, fileName, fallback = {}) {
  const filePath = path.join(bookDir, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return readJson(filePath, fileName);
}

/**
 * Read and parse a JSON file, throwing a BookCliError on invalid JSON.
 * @param {string} filePath - Absolute path to the JSON file.
 * @param {string} label - Human-readable label used in error messages.
 * @returns {object} The parsed JSON value.
 */
function readJson(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new BookCliError(`${label} 不是合法 JSON: ${err.message}`, { code: 'EINVALID_JSON' });
  }
}

/**
 * Load and return the style configuration section from the project config.
 * @param {string} bookDir - Absolute path to the book project directory.
 * @returns {object} The style config object (header, pageNumber, etc.).
 */
function loadBookStyle(bookDir) {
  return loadBookProjectConfig(bookDir).style;
}

/**
 * Load and return the plugins configuration section from the project config.
 * @param {string} bookDir - Absolute path to the book project directory.
 * @returns {object} The plugins config object (math, codeHighlight, etc.).
 */
function loadBookPlugins(bookDir) {
  return loadBookProjectConfig(bookDir).plugins;
}

function normalizeBookConfig(config, label) {
  if (!config.title) throw configError(`${label} 必须包含 book.title 或 title`);
  if (!Array.isArray(config.chapters) || config.chapters.length === 0) {
    throw configError(`${label}.chapters 必须是非空数组`);
  }
  return config;
}

function validateLegacyBookConfig(bookDir, book) {
  validateBookProject({ bookDir, book, style: {}, plugins: {}, output: {} });
  return book;
}

function validateBookProject({ bookDir, book, style, plugins, output }) {
  if (typeof book.title !== 'string' || !book.title.trim()) {
    throw configError('config.json 中 book.title 必须是非空字符串');
  }

  book.chapters.forEach((chapter, index) => {
    const label = `config.json book.chapters[${index}]`;
    if (!chapter || typeof chapter !== 'object') throw configError(`${label} 必须是对象`);
    if (typeof chapter.dir !== 'string' || !chapter.dir.trim()) throw configError(`${label}.dir 必须是非空字符串`);
    if (typeof chapter.title !== 'string' || !chapter.title.trim()) {
      throw configError(`${label}.title 必须是非空字符串`);
    }

    const chapterFile = chapter.file || 'content.md';
    if (typeof chapterFile !== 'string' || !chapterFile.trim()) throw configError(`${label}.file 必须是非空字符串`);

    const { chapterDir, contentPath } = resolveChapterPaths(bookDir, chapter, {
      label,
      code: 'EINVALID_CONFIG',
    });
    if (!fs.existsSync(chapterDir) || !fs.statSync(chapterDir).isDirectory()) {
      throw configError(`${label}.dir 指向的章节目录不存在: ${chapterDir}`);
    }

    if (!fs.existsSync(contentPath) || !fs.statSync(contentPath).isFile()) {
      throw configError(`${label}.file 指向的章节文件不存在: ${contentPath}`);
    }
  });

  if (book.coverImage !== undefined) {
    if (typeof book.coverImage !== 'string' || !book.coverImage.trim()) {
      throw configError('config.json book.coverImage 必须是非空字符串');
    }
    const coverPath = path.resolve(bookDir, book.coverImage);
    if (!fs.existsSync(coverPath) || !fs.statSync(coverPath).isFile()) {
      throw configError(`config.json book.coverImage 指向的文件不存在: ${coverPath}`);
    }
  }
  if (book.identifier !== undefined && (typeof book.identifier !== 'string' || !book.identifier.trim())) {
    throw configError('config.json book.identifier 必须是非空字符串');
  }
  if (book.language !== undefined && (typeof book.language !== 'string' || !book.language.trim())) {
    throw configError('config.json book.language 必须是非空字符串');
  }
  validateHeadingNumberingConfig(book.headingNumbering);

  if (output.pdfName !== undefined && (typeof output.pdfName !== 'string' || !output.pdfName.trim())) {
    throw configError('config.json output.pdfName 必须是非空字符串');
  }
  if (output.htmlName !== undefined && (typeof output.htmlName !== 'string' || !output.htmlName.trim())) {
    throw configError('config.json output.htmlName 必须是非空字符串');
  }
  if (output.epubName !== undefined && (typeof output.epubName !== 'string' || !output.epubName.trim())) {
    throw configError('config.json output.epubName 必须是非空字符串');
  }
  if (output.epubModified !== undefined) {
    if (typeof output.epubModified !== 'string' || !output.epubModified.trim()) {
      throw configError('config.json output.epubModified 必须是非空日期字符串');
    }
    const parsed = new Date(output.epubModified);
    if (Number.isNaN(parsed.getTime())) {
      throw configError('config.json output.epubModified 必须是合法日期字符串');
    }
  }

  validatePlugins(plugins);
  validateHeaderConfig(style.header);
  validatePageNumberConfig(style.pageNumber);
}

function validateHeadingNumberingConfig(headingNumbering) {
  if (headingNumbering === undefined || typeof headingNumbering === 'boolean') return;
  if (!headingNumbering || typeof headingNumbering !== 'object' || Array.isArray(headingNumbering)) {
    throw configError('config.json book.headingNumbering 必须是布尔值或对象');
  }
  if (headingNumbering.enabled !== undefined && typeof headingNumbering.enabled !== 'boolean') {
    throw configError('config.json book.headingNumbering.enabled 必须是布尔值');
  }
}

function validatePlugins(plugins = {}) {
  for (const name of ['math', 'codeHighlight']) {
    const value = plugins[name];
    if (value === undefined || value === true || value === false) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw configError(`config.json plugins.${name} 必须是布尔值或对象`);
    }
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
      throw configError(`config.json plugins.${name}.enabled 必须是布尔值`);
    }
  }

  if (plugins.codeHighlight?.theme !== undefined && typeof plugins.codeHighlight.theme !== 'string') {
    throw configError('config.json plugins.codeHighlight.theme 必须是字符串');
  }
}

function validateHeaderConfig(header) {
  if (!header) return;
  if (header.enabled !== undefined && typeof header.enabled !== 'boolean') {
    throw configError('config.json style.header.enabled 必须是布尔值');
  }
  for (const position of ['left', 'center', 'right']) {
    const slot = header[position];
    if (!slot) continue;
    const source = slot.source || 'none';
    if (!['none', 'book', 'chapter', 'text'].includes(source)) {
      throw configError(`config.json style.header.${position}.source 只能是 none、book、chapter 或 text`);
    }
    if (source === 'text' && typeof slot.text !== 'string') {
      throw configError(`config.json style.header.${position}.text 必须是字符串`);
    }
  }
  if (header.fontPath !== undefined && (typeof header.fontPath !== 'string' || !header.fontPath.trim())) {
    throw configError('config.json style.header.fontPath 必须是非空字符串');
  }
  if (
    header.chapterPageRangeStrategy !== undefined &&
    !['auto', 'exact', 'estimate'].includes(header.chapterPageRangeStrategy)
  ) {
    throw configError('config.json style.header.chapterPageRangeStrategy 只能是 auto、exact 或 estimate');
  }
}

function validatePageNumberConfig(pageNumber) {
  if (!pageNumber) return;
  if (pageNumber.enabled !== undefined && typeof pageNumber.enabled !== 'boolean') {
    throw configError('config.json style.pageNumber.enabled 必须是布尔值');
  }
  if (pageNumber.format !== undefined && typeof pageNumber.format !== 'string') {
    throw configError('config.json style.pageNumber.format 必须是字符串');
  }
}

function configError(message) {
  return new BookCliError(message, { code: 'EINVALID_CONFIG' });
}

module.exports = { loadBookConfig, loadBookProjectConfig, loadBookStyle, loadBookPlugins, readJson };
