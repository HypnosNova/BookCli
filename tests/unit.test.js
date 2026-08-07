const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { execFileSync, spawnSync } = require('child_process');
const { PDFDocument, PDFName } = require('pdf-lib');
const { buildEpub } = require('../src/build/buildEpub');
const { buildMarkdown, formatChapterTitle, numberChapterHeadings, isHeadingNumberingEnabled, stripHeadingNumber } = require('../src/build/buildMarkdown');
const { loadBookProjectConfig, readJson } = require('../src/config/loadBookConfig');
const renderHtmlModule = require('../src/render/renderHtml');
const { DEFAULT_STYLE, mergeDeep, styleToCss, cssValue, cloneDefaultStyle } = require('../src/render/style');
const { protectMarkdownCode, restoreProtectedMarkdownCode, slugify } = require('../src/utils/utils');
const { BookCliError } = require('../src/utils/errors');
const { rewriteMarkdownImageAssets } = require('../src/render/assets');
const { countWords, markdownToPlainText } = require('../src/utils/bookAnalysis');
const { createZip } = require('../src/utils/zip');
const { DEFAULT_LANGUAGE } = require('../src/utils/constants');
const logger = require('../src/utils/logger');
const { parseArgs } = require('../src/utils/parseArgs');
const { resolveInside } = require('../src/utils/safePath');
const { resolvePreviewPath, watchBook } = require('../src/server/serveBook');
const { addChapter } = require('../src/utils/addChapter');
const { compileBook } = require('../src/build/compileBook');
const { resolveNamedDestinationChapterPageRanges } = require('../src/build/pdfPostProcess');

// ─── CLI argument parsing ─────────────────────────────────────────────

test('parseArgs keeps commands after long boolean flags', () => {
  assert.deepEqual(parseArgs(['--quiet', 'build']), { _: ['build'], quiet: true });
  assert.deepEqual(parseArgs(['--json', 'stats']), { _: ['stats'], json: true });
});

test('parseArgs accepts value options before or after the command', () => {
  assert.deepEqual(parseArgs(['--book', './my-book', 'build']), { _: ['build'], book: './my-book' });
  assert.deepEqual(parseArgs(['build', '--book=./my-book']), { _: ['build'], book: './my-book' });
});

test('parseArgs supports short options and the chapter-dir alias', () => {
  assert.deepEqual(parseArgs(['build', '-q', '-b', './my-book']), {
    _: ['build'],
    quiet: true,
    book: './my-book',
  });
  assert.deepEqual(parseArgs(['add-chapter', '--chapter-dir', '02-next']), {
    _: ['add-chapter'],
    chapterDir: '02-next',
  });
});

test('parseArgs rejects unknown options and missing values', () => {
  assert.throws(() => parseArgs(['build', '--unknown']), (err) => err.code === 'EUSAGE');
  assert.throws(() => parseArgs(['build', '--book']), (err) => err.code === 'EUSAGE');
  assert.throws(() => parseArgs(['build', '-b', '--quiet']), (err) => err.code === 'EUSAGE');
});

test('CLI reports argument errors without a stack unless debug is enabled', () => {
  const cliPath = path.resolve(__dirname, '../bin/book-cli.js');
  const normal = spawnSync(process.execPath, [cliPath, '--unknown'], { encoding: 'utf8' });
  assert.equal(normal.status, 1);
  assert.match(normal.stderr, /未知参数: --unknown/);
  assert.match(normal.stderr, /错误码: EUSAGE/);
  assert.doesNotMatch(normal.stderr, /BookCliError:/);

  const debug = spawnSync(process.execPath, [cliPath, '--debug', '--unknown'], { encoding: 'utf8' });
  assert.equal(debug.status, 1);
  assert.match(debug.stderr, /BookCliError: 未知参数: --unknown/);
});

// ─── Safe path resolution ─────────────────────────────────────────────

test('resolveInside accepts nested paths and rejects path traversal or absolute paths', () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookcli-safe-path-'));
  assert.equal(resolveInside(baseDir, 'nested/content.md'), path.join(baseDir, 'nested/content.md'));
  assert.throws(() => resolveInside(baseDir, '../outside.md'), (err) => err.code === 'EINVALID_PATH');
  assert.throws(() => resolveInside(baseDir, path.resolve(baseDir, 'absolute.md')), (err) => err.code === 'EINVALID_PATH');
});

test('resolveInside rejects existing symlinks that escape the base directory', {
  skip: process.platform === 'win32',
}, () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookcli-safe-base-'));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookcli-safe-outside-'));
  fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret');
  fs.symlinkSync(outsideDir, path.join(baseDir, 'linked'));
  assert.throws(() => resolveInside(baseDir, 'linked/secret.txt'), (err) => err.code === 'EINVALID_PATH');
});

test('book config rejects chapter directories and files outside their allowed roots', () => {
  const bookDir = createTempBook();
  const configPath = path.join(bookDir, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  fs.mkdirSync(path.join(bookDir, 'outside'), { recursive: true });
  fs.writeFileSync(path.join(bookDir, 'outside', 'content.md'), 'outside');
  config.book.chapters[0].dir = '../outside';
  fs.writeFileSync(configPath, JSON.stringify(config));
  assert.throws(() => loadBookProjectConfig(bookDir), (err) => err.code === 'EINVALID_CONFIG');

  config.book.chapters[0].dir = '01-introduction';
  config.book.chapters[0].file = '../../outside/content.md';
  fs.writeFileSync(configPath, JSON.stringify(config));
  assert.throws(() => loadBookProjectConfig(bookDir), (err) => err.code === 'EINVALID_CONFIG');
});

test('addChapter refuses to create directories or files outside chapters', () => {
  const bookDir = createTempBook();
  assert.throws(
    () => addChapter(bookDir, { title: 'Escape dir', dir: '../../escape-dir' }),
    (err) => err.code === 'EINVALID_PATH'
  );
  assert.throws(
    () => addChapter(bookDir, { title: 'Escape file', dir: '02-safe', file: '../../escape.md' }),
    (err) => err.code === 'EINVALID_PATH'
  );
  assert.equal(fs.existsSync(path.join(bookDir, 'escape.md')), false);
});

test('resolvePreviewPath confines decoded and symlinked paths to dist', {
  skip: process.platform === 'win32',
}, () => {
  const bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookcli-preview-'));
  const distDir = path.join(bookDir, 'dist');
  const siblingDir = path.join(bookDir, 'dist-secret');
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
  fs.mkdirSync(siblingDir);
  fs.writeFileSync(path.join(distDir, 'assets', 'ok.txt'), 'ok');
  fs.writeFileSync(path.join(siblingDir, 'secret.txt'), 'secret');
  fs.symlinkSync(siblingDir, path.join(distDir, 'linked'));

  assert.equal(resolvePreviewPath(distDir, '/assets/ok.txt'), path.join(distDir, 'assets', 'ok.txt'));
  assert.throws(
    () => resolvePreviewPath(distDir, '/..%2Fdist-secret%2Fsecret.txt'),
    (err) => err.code === 'EINVALID_PATH'
  );
  assert.throws(() => resolvePreviewPath(distDir, '/linked/secret.txt'), (err) => err.code === 'EINVALID_PATH');
  assert.throws(() => resolvePreviewPath(distDir, '/bad%ZZpath'), (err) => err.code === 'EINVALID_PATH');
});

test('watchBook observes later edits inside a directory created after startup', async (t) => {
  const bookDir = createTempBook();
  let changeCount = 0;
  const watcher = watchBook(bookDir, () => {
    changeCount += 1;
  }, { debounceMs: 20 });
  t.after(() => watcher.close());

  const newChapterDir = path.join(bookDir, 'chapters', '02-dynamic');
  fs.mkdirSync(newChapterDir);
  await waitFor(() => changeCount >= 1);

  const countAfterDirectoryCreation = changeCount;
  fs.writeFileSync(path.join(newChapterDir, 'content.md'), '# Dynamic\n\nFirst version.\n');
  await waitFor(() => changeCount > countAfterDirectoryCreation);

  const countAfterInitialWrite = changeCount;
  fs.appendFileSync(path.join(newChapterDir, 'content.md'), '\nSecond version.\n');
  await waitFor(() => changeCount > countAfterInitialWrite);
});

// ─── mergeDeep ────────────────────────────────────────────────────────

test('mergeDeep preserves explicit null and false overrides', () => {
  const merged = mergeDeep(DEFAULT_STYLE, {
    h1: { borderBottom: null },
    header: { enabled: false },
  });

  assert.equal(merged.h1.borderBottom, null);
  assert.equal(merged.header.enabled, false);
  assert.equal(DEFAULT_STYLE.h1.borderBottom, '1px solid #dddddd');
});

test('mergeDeep deep merges nested objects', () => {
  const base = { a: { b: { c: 1, d: 2 } }, e: 3 };
  const override = { a: { b: { c: 99 } } };
  const result = mergeDeep(base, override);
  assert.deepEqual(result, { a: { b: { c: 99, d: 2 } }, e: 3 });
});

test('mergeDeep does not mutate inputs', () => {
  const base = { a: { b: 1 } };
  const override = { a: { c: 2 } };
  mergeDeep(base, override);
  assert.deepEqual(base, { a: { b: 1 } });
  assert.deepEqual(override, { a: { c: 2 } });
});

// ─── styleToCss / cssValue ────────────────────────────────────────────

test('styleToCss converts camelCase JS props to CSS declarations', () => {
  const css = styleToCss({ fontSize: '12pt', color: '#333' });
  assert.match(css, /font-size: 12pt;/);
  assert.match(css, /color: #333;/);
});

test('styleToCss omits keys not in STYLE_PROP_MAP', () => {
  const css = styleToCss({ unknownProp: 'val', fontSize: '12pt' });
  assert.doesNotMatch(css, /unknownProp/);
  assert.match(css, /font-size/);
});

test('cssValue strips angle brackets and braces', () => {
  assert.equal(cssValue('<script>'), 'script');
  assert.equal(cssValue('{evil}'), 'evil');
});

test('cloneDefaultStyle produces a deep copy', () => {
  const clone = cloneDefaultStyle();
  assert.deepEqual(clone, DEFAULT_STYLE);
  clone.h1.fontSize = '99pt';
  assert.equal(DEFAULT_STYLE.h1.fontSize, '22pt');
});

// ─── protectMarkdownCode / restoreProtectedMarkdownCode ───────────────

test('protectMarkdownCode protects closed and unclosed fenced code blocks', () => {
  const markdown = [
    'before',
    '~~~js',
    'const closed = "$notMath$";',
    '~~~',
    'middle `inline`',
    '```txt',
    '# not a heading',
  ].join('\n');

  const protectedMarkdown = protectMarkdownCode(markdown, { tokenPrefix: 'TEST_CODE', warnUnclosedFence: false });
  assert.equal(protectedMarkdown.placeholders.filter((item) => item.token.includes('_BLOCK_')).length, 2);
  assert.equal(protectedMarkdown.placeholders.filter((item) => item.token.includes('_INLINE_')).length, 1);
  assert.match(protectedMarkdown.markdown, /TEST_CODE_BLOCK_\d+/);
  assert.match(protectedMarkdown.markdown, /TEST_CODE_INLINE_\d+/);
  assert.equal(restoreProtectedMarkdownCode(protectedMarkdown.markdown, protectedMarkdown.placeholders), markdown);
});

test('protectMarkdownCode handles nested backtick fences', () => {
  const markdown = '```\ncode with ``` inside\n```';
  const result = protectMarkdownCode(markdown, { tokenPrefix: 'NEST', warnUnclosedFence: false });
  assert.ok(result.placeholders.length >= 1);
  assert.equal(restoreProtectedMarkdownCode(result.markdown, result.placeholders), markdown);
});

test('protectMarkdownCode warns on unclosed fence', () => {
  let warned = false;
  const origWarn = logger.warn;
  logger.warn = () => { warned = true; };
  protectMarkdownCode('```\nno closing fence', { tokenPrefix: 'WARN' });
  logger.warn = origWarn;
  assert.ok(warned);
});

// ─── slugify ───────────────────────────────────────────────────────────

test('slugify is stable for Chinese chapter titles', () => {
  assert.equal(slugify('第 2 章　机器学习的基本问题'), '第-2-章-机器学习的基本问题');
});

test('slugify lowercases and hyphenates', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('  Mix 中英  '), 'mix-中英');
});

// ─── formatChapterTitle ───────────────────────────────────────────────

test('formatChapterTitle returns clean title when numbering is off', () => {
  assert.equal(formatChapterTitle(0, 'Intro', false), 'Intro');
  assert.equal(formatChapterTitle(2, '第三棵树', false), '第三棵树');
});

test('formatChapterTitle adds numeric prefix when numbering is on', () => {
  assert.equal(formatChapterTitle(0, 'Intro', true), '1. Intro');
  assert.equal(formatChapterTitle(3, 'Advanced', true), '4. Advanced');
});

// ─── numberChapterHeadings ────────────────────────────────────────────

test('numberChapterHeadings adds hierarchical numeric prefixes', () => {
  const markdown = [
    '# Intro',
    '',
    'Opening paragraph.',
    '',
    '```md',
    '# Not a real heading',
    '```',
    '',
    '## Existing Section',
    '',
    '### 1.1.1 Existing Child',
    '',
    '## 1.2. Old Number',
  ].join('\n');

  assert.equal(formatChapterTitle(0, 'Intro', true), '1. Intro');
  assert.equal(
    numberChapterHeadings(markdown, 0, 'Intro'),
    [
      'Opening paragraph.',
      '',
      '```md',
      '# Not a real heading',
      '```',
      '',
      '## 1.1 Existing Section',
      '',
      '### 1.1.1 Existing Child',
      '',
      '## 1.2 Old Number',
    ].join('\n')
  );
});

// ─── stripHeadingNumber ───────────────────────────────────────────────

test('stripHeadingNumber removes "第 X 章" with numeric dot prefix', () => {
  assert.equal(stripHeadingNumber('第 1 章　1.1 引言'), '引言');
  assert.equal(stripHeadingNumber('第12章 12. 测试'), '测试');
  assert.equal(stripHeadingNumber('1.2 Section'), 'Section');
});

test('stripHeadingNumber removes numeric dot prefix', () => {
  assert.equal(stripHeadingNumber('1.1 Section'), 'Section');
  assert.equal(stripHeadingNumber('2.3.1 Deep'), 'Deep');
});

// ─── isHeadingNumberingEnabled ────────────────────────────────────────

test('isHeadingNumberingEnabled returns false by default', () => {
  assert.equal(isHeadingNumberingEnabled({}), false);
  assert.equal(isHeadingNumberingEnabled({ headingNumbering: false }), false);
});

test('isHeadingNumberingEnabled returns true for boolean or object', () => {
  assert.equal(isHeadingNumberingEnabled({ headingNumbering: true }), true);
  assert.equal(isHeadingNumberingEnabled({ headingNumbering: { enabled: true } }), true);
  assert.equal(isHeadingNumberingEnabled({ headingNumbering: { enabled: false } }), false);
});

test('chapter page ranges use PDF named destinations when available', async () => {
  const pdfDoc = await PDFDocument.create();
  const pages = Array.from({ length: 7 }, () => pdfDoc.addPage());
  const destinations = pdfDoc.context.obj({});
  destinations.set(
    PDFName.of('chapter-1'),
    pdfDoc.context.obj([pages[1].ref, PDFName.of('XYZ'), 0, 0, 0])
  );
  destinations.set(
    PDFName.of('chapter-2'),
    pdfDoc.context.obj([pages[4].ref, PDFName.of('XYZ'), 0, 0, 0])
  );
  pdfDoc.catalog.set(PDFName.of('Dests'), destinations);

  assert.deepEqual(
    resolveNamedDestinationChapterPageRanges({
      pdfDoc,
      chapters: [{ title: 'First' }, { title: 'Second' }],
    }),
    [
      { title: 'First', startPageIndex: 1, endPageIndex: 3 },
      { title: 'Second', startPageIndex: 4, endPageIndex: 6 },
    ]
  );
});

// ─── buildMarkdown ────────────────────────────────────────────────────

test('compileBook creates one shared intermediate model for all chapters', () => {
  const bookDir = createTempBook();
  addSecondChapterFixture(bookDir);
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookcli-compile-'));
  const compiled = compileBook(bookDir, buildDir);

  assert.equal(compiled.chapters.length, 2);
  assert.deepEqual(compiled.chapters.map((chapter) => chapter.epubFileName), [
    'chapter-001.xhtml',
    'chapter-002.xhtml',
  ]);
  assert.match(compiled.frontMatterMarkdown, /# Unit Test/);
  assert.match(compiled.chapters[0].markdown, /Hello test/);
  assert.match(compiled.chapters[1].markdown, /Second chapter body/);
  assert.match(compiled.markdown, /Hello test[\s\S]*Second chapter body/);
});

test('buildMarkdown only numbers headings when headingNumbering is enabled', () => {
  const defaultBookDir = createTempBook();
  const defaultMarkdown = buildMarkdown(defaultBookDir).markdown;
  assert.match(defaultMarkdown, /# Intro/);
  assert.doesNotMatch(defaultMarkdown, /## 1\.1/);

  const numberedBookDir = createTempBook({
    book: {
      title: 'Unit Test',
      identifier: 'urn:uuid:00000000-0000-4000-8000-000000000003',
      headingNumbering: { enabled: true },
      chapters: [{ dir: '01-introduction', title: 'Intro', file: 'content.md' }],
    },
  });
  const numberedMarkdown = buildMarkdown(numberedBookDir).markdown;
  assert.match(numberedMarkdown, /# 1\. Intro/);
  assert.match(numberedMarkdown, /## 1\.1 Section/);
});

test('buildMarkdown replaces staged assets and removes files no longer referenced', () => {
  const bookDir = createTempBook();
  const chapterDir = path.join(bookDir, 'chapters', '01-introduction');
  const chapterAssetsDir = path.join(chapterDir, 'assets');
  const contentPath = path.join(chapterDir, 'content.md');
  fs.mkdirSync(chapterAssetsDir);
  fs.writeFileSync(path.join(chapterAssetsDir, 'old.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(contentPath, '# Intro\n\n![old](assets/old.svg)\n');

  buildMarkdown(bookDir);
  const builtAsset = path.join(bookDir, 'dist', 'assets', '01-introduction', 'assets', 'old.svg');
  assert.equal(fs.existsSync(builtAsset), true);

  fs.writeFileSync(contentPath, '# Intro\n\nNo image remains.\n');
  buildMarkdown(bookDir);
  assert.equal(fs.existsSync(builtAsset), false);
  assert.equal(fs.readdirSync(path.join(bookDir, 'dist')).some((name) => name.startsWith('.bookcli-staging-')), false);
});

test('a failed staged Markdown build preserves the previous successful output', () => {
  const bookDir = createTempBook();
  const first = buildMarkdown(bookDir);
  const previousMarkdown = fs.readFileSync(first.outPath, 'utf8');
  const configPath = path.join(bookDir, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.book.chapters[0].file = 'missing.md';
  fs.writeFileSync(configPath, JSON.stringify(config));

  assert.throws(() => buildMarkdown(bookDir), /章节文件不存在/);
  assert.equal(fs.readFileSync(first.outPath, 'utf8'), previousMarkdown);
  assert.equal(fs.readdirSync(path.join(bookDir, 'dist')).some((name) => name.startsWith('.bookcli-')), false);
});

// ─── renderHtml ───────────────────────────────────────────────────────

test('renderHtml exports only renderer-owned helpers', () => {
  assert.deepEqual(Object.keys(renderHtmlModule).sort(), ['buildCss', 'normalizePlugins', 'renderHtml']);
});

test('renderHtml produces valid HTML with title', () => {
  const config = { title: 'Test Book', chapters: [] };
  const html = renderHtmlModule.renderHtml('# Test\n\nHello.', config);
  assert.match(html, /<title>Test Book<\/title>/);
  assert.match(html, /<p>Hello\.<\/p>/);
  assert.match(html, /\.bookcli-chapter-start-group \{[^}]*padding-top: 10mm;/);
  assert.match(html, /@media print \{ html, body \{ background: #f{3}(?:fff)?; \} \}/);
});

test('renderHtml keeps each chapter title and metadata together for print pagination', () => {
  const config = { title: 'Test Book', chapters: [{ title: 'Intro' }] };
  const html = renderHtmlModule.renderHtml('# Test Book\n\n# Intro\n\n> **Updated:** today\n\nBody.', config);
  assert.match(
    html,
    /<section class="bookcli-chapter-page-break"><div class="bookcli-chapter-start-group"><h1[^>]*class="bookcli-chapter-start"[^>]*>Intro<\/h1>\s*<blockquote>[\s\S]*?<\/blockquote><\/div><\/section>/
  );
});

test('renderHtml supports compact TOC item spacing for longer books', () => {
  const config = { title: 'Test Book', chapters: [{ title: 'Intro' }] };
  const html = renderHtmlModule.renderHtml('# Test Book\n\n# Intro\n\nBody.', config, {
    toc: { itemPadding: '0.34em 0' },
  });
  assert.match(html, /nav\.toc li \{ padding: 0\.34em 0;/);
});

test('renderHtml uses configured language attribute', () => {
  const configZh = { title: '中文书', chapters: [], language: 'zh-CN' };
  const configEn = { title: 'English Book', chapters: [], language: 'en' };
  assert.match(renderHtmlModule.renderHtml('# T', configZh), /<html lang="zh-CN">/);
  assert.match(renderHtmlModule.renderHtml('# T', configEn), /<html lang="en">/);
});

test('renderHtml defaults to zh-CN language', () => {
  const config = { title: 'Default', chapters: [] };
  assert.match(renderHtmlModule.renderHtml('# T', config), /<html lang="zh-CN">/);
});

// ─── loadBookProjectConfig ────────────────────────────────────────────

test('loadBookProjectConfig validates heading numbering, header strategy and epubModified', () => {
  const headingNumberingDir = createTempBook({
    book: {
      title: 'Unit Test',
      identifier: 'urn:uuid:00000000-0000-4000-8000-000000000004',
      headingNumbering: { enabled: 'yes' },
      chapters: [{ dir: '01-introduction', title: 'Intro', file: 'content.md' }],
    },
  });
  assert.throws(() => loadBookProjectConfig(headingNumberingDir), /headingNumbering\.enabled/);

  const bookDir = createTempBook({
    style: { header: { chapterPageRangeStrategy: 'invalid' } },
  });
  assert.throws(() => loadBookProjectConfig(bookDir), /chapterPageRangeStrategy/);

  const dateDir = createTempBook({
    output: { epubModified: 'not-a-date' },
  });
  assert.throws(() => loadBookProjectConfig(dateDir), /epubModified/);
});

test('loadBookProjectConfig validates book.language', () => {
  const dir = createTempBook({
    book: {
      title: 'Test',
      language: 123,
      chapters: [{ dir: '01-introduction', title: 'Intro', file: 'content.md' }],
    },
  });
  assert.throws(() => loadBookProjectConfig(dir), /book\.language/);
});

test('loadBookProjectConfig validates output.htmlName', () => {
  const dir = createTempBook({
    output: { htmlName: '' },
  });
  assert.throws(() => loadBookProjectConfig(dir), /output\.htmlName/);
});

test('readJson throws BookCliError on invalid JSON', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookcli-readjson-'));
  const badFile = path.join(tmpDir, 'bad.json');
  fs.writeFileSync(badFile, '{invalid json}', 'utf8');
  assert.throws(() => readJson(badFile, 'bad.json'), (err) => err instanceof BookCliError && err.code === 'EINVALID_JSON');
});

// ─── buildEpub ────────────────────────────────────────────────────────

test('buildEpub writes configured epubModified into content.opf', () => {
  const bookDir = createTempBook({
    output: {
      pdfName: 'unit-epub',
      epubModified: '2026-01-02T03:04:05Z',
    },
  });

  const epubPath = buildEpub(bookDir);
  const opf = execFileSync('unzip', ['-p', epubPath, 'OEBPS/content.opf'], { encoding: 'utf8' });
  assert.match(opf, /2026-01-02T03:04:05Z/);
});

test('buildEpub uses configured language', () => {
  const bookDir = createTempBook({
    book: {
      title: 'En Book',
      language: 'en',
      chapters: [{ dir: '01-introduction', title: 'Intro', file: 'content.md' }],
    },
  });
  const epubPath = buildEpub(bookDir);
  const opf = execFileSync('unzip', ['-p', epubPath, 'OEBPS/content.opf'], { encoding: 'utf8' });
  assert.match(opf, /xml:lang="en"/);
  assert.match(opf, /<dc:language>en<\/dc:language>/);
});

test('buildEpub is byte-for-byte reproducible with a fixed epubModified time', () => {
  const bookDir = createTempBook({
    output: {
      epubName: 'reproducible',
      epubModified: '2026-01-02T03:04:06Z',
    },
  });

  const first = fs.readFileSync(buildEpub(bookDir));
  const second = fs.readFileSync(buildEpub(bookDir));
  assert.deepEqual(second, first);

  const expectedDosTime = (3 << 11) | (4 << 5) | 3;
  const expectedDosDate = ((2026 - 1980) << 9) | (1 << 5) | 2;
  assert.equal(first.readUInt16LE(10), expectedDosTime);
  assert.equal(first.readUInt16LE(12), expectedDosDate);
});

test('buildEpub writes one XHTML document and spine item per chapter', () => {
  const bookDir = createTempBook({
    output: { epubModified: '2026-01-02T03:04:06Z' },
  });
  addSecondChapterFixture(bookDir);
  const epubPath = buildEpub(bookDir);
  const entries = execFileSync('unzip', ['-Z1', epubPath], { encoding: 'utf8' });
  const opf = execFileSync('unzip', ['-p', epubPath, 'OEBPS/content.opf'], { encoding: 'utf8' });
  const nav = execFileSync('unzip', ['-p', epubPath, 'OEBPS/nav.xhtml'], { encoding: 'utf8' });
  const firstChapter = execFileSync('unzip', ['-p', epubPath, 'OEBPS/chapter-001.xhtml'], { encoding: 'utf8' });
  const secondChapter = execFileSync('unzip', ['-p', epubPath, 'OEBPS/chapter-002.xhtml'], { encoding: 'utf8' });

  assert.match(entries, /OEBPS\/title\.xhtml/);
  assert.match(entries, /OEBPS\/chapter-001\.xhtml/);
  assert.match(entries, /OEBPS\/chapter-002\.xhtml/);
  assert.doesNotMatch(entries, /OEBPS\/content\.xhtml/);
  assert.match(opf, /id="chapter-1" href="chapter-001\.xhtml"/);
  assert.match(opf, /id="chapter-2" href="chapter-002\.xhtml"/);
  assert.match(opf, /<itemref idref="title-page"\/>[\s\S]*<itemref idref="chapter-1"\/>[\s\S]*<itemref idref="chapter-2"\/>/);
  assert.match(nav, /href="chapter-001\.xhtml">Intro<\/a>/);
  assert.match(nav, /href="chapter-002\.xhtml">Second<\/a>/);
  assert.match(firstChapter, /Hello test/);
  assert.doesNotMatch(firstChapter, /Second chapter body/);
  assert.match(secondChapter, /Second chapter body/);
  assert.doesNotMatch(secondChapter, /Hello test/);
});

// ─── zip ───────────────────────────────────────────────────────────────

test('createZip produces a valid ZIP with stored and deflated entries', () => {
  const entries = [
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'hello.txt', data: 'Hello, World!', store: false },
  ];
  const buffer = createZip(entries);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);

  // Check ZIP signature (PK header)
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
});

// ─── constants ────────────────────────────────────────────────────────

test('DEFAULT_LANGUAGE is zh-CN', () => {
  assert.equal(DEFAULT_LANGUAGE, 'zh-CN');
});

// ─── BookCliError ─────────────────────────────────────────────────────

test('BookCliError has name and code', () => {
  const err = new BookCliError('test message', { code: 'ETEST' });
  assert.equal(err.name, 'BookCliError');
  assert.equal(err.code, 'ETEST');
  assert.equal(err.message, 'test message');
  assert.ok(err instanceof Error);
});

// ─── logger ───────────────────────────────────────────────────────────

test('logger.info outputs with prefix', () => {
  const origLog = console.log;
  let captured = '';
  console.log = (msg) => { captured = msg; };
  logger.configure({ quiet: false });
  logger.info('hello');
  console.log = origLog;
  assert.equal(captured, '[book-cli] hello');
});

test('logger.info is suppressed in quiet mode', () => {
  const origLog = console.log;
  let captured = '';
  console.log = (msg) => { captured = msg; };
  logger.configure({ quiet: true });
  logger.info('should not appear');
  console.log = origLog;
  logger.configure({ quiet: false });
  assert.equal(captured, '');
});

// ─── bookAnalysis word counting ───────────────────────────────────────

test('countWords counts CJK and Latin mixed text', () => {
  assert.equal(countWords('你好世界'), 4);
  assert.equal(countWords('hello world'), 2);
  assert.equal(countWords('你好 world'), 3);
});

test('markdownToPlainText strips markdown syntax', () => {
  const result = markdownToPlainText('# Title\n\n**bold** and *italic*\n\n> quote');
  assert.doesNotMatch(result, /#/);
  assert.doesNotMatch(result, /\*\*/);
  assert.ok(result.length > 0);
});

// ─── rewriteMarkdownImageAssets ───────────────────────────────────────

test('rewriteMarkdownImageAssets preserves external URLs', () => {
  const result = rewriteMarkdownImageAssets('![alt](https://example.com/img.png)', {
    sourceDir: '/tmp',
    distDir: '/tmp/dist',
  });
  assert.equal(result, '![alt](https://example.com/img.png)');
});

test('rewriteMarkdownImageAssets preserves hash links', () => {
  const result = rewriteMarkdownImageAssets('![alt](#anchor)', {
    sourceDir: '/tmp',
    distDir: '/tmp/dist',
  });
  assert.equal(result, '![alt](#anchor)');
});

// ─── Helper ───────────────────────────────────────────────────────────

function createTempBook(overrides = {}) {
  const bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookcli-unit-'));
  const chapterDir = path.join(bookDir, 'chapters', '01-introduction');
  fs.mkdirSync(chapterDir, { recursive: true });
  fs.writeFileSync(path.join(chapterDir, 'content.md'), '# Intro\n\nHello test.\n\n## Section\n');
  fs.writeFileSync(
    path.join(bookDir, 'config.json'),
    JSON.stringify(
      {
        book: {
          title: 'Unit Test',
          identifier: 'urn:uuid:00000000-0000-4000-8000-000000000002',
          chapters: [{ dir: '01-introduction', title: 'Intro', file: 'content.md' }],
        },
        ...overrides,
      },
      null,
      2
    )
  );
  return bookDir;
}

function addSecondChapterFixture(bookDir) {
  const chapterDir = path.join(bookDir, 'chapters', '02-second');
  fs.mkdirSync(chapterDir, { recursive: true });
  fs.writeFileSync(path.join(chapterDir, 'content.md'), '# Second\n\nSecond chapter body.\n');
  const configPath = path.join(bookDir, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.book.chapters.push({ dir: '02-second', title: 'Second', file: 'content.md' });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function waitFor(predicate, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('Timed out waiting for filesystem event');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
