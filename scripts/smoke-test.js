const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildHtml } = require('../src/build/buildHtml');
const { buildPdf } = require('../src/build/buildPdf');
const { buildEpub } = require('../src/build/buildEpub');
const { loadBookProjectConfig } = require('../src/config/loadBookConfig');

async function main() {
  const bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookcli-smoke-'));
  try {
    fs.mkdirSync(path.join(bookDir, 'chapters', '01-introduction'), { recursive: true });
    fs.mkdirSync(path.join(bookDir, 'chapters', '02-details'), { recursive: true });
    fs.writeFileSync(
      path.join(bookDir, 'config.json'),
      JSON.stringify(
        {
          book: {
            title: 'Smoke Test',
            identifier: 'urn:uuid:00000000-0000-4000-8000-000000000001',
            chapters: [
              { dir: '01-introduction', title: 'Intro', file: 'content.md' },
              { dir: '02-details', title: 'Details', file: 'content.md' },
            ],
          },
          output: {
            pdfName: 'smoke-test',
            htmlName: 'Smoke # 中文',
            epubModified: '2026-01-01T00:00:00Z',
          },
          style: {
            header: { chapterPageRangeStrategy: 'auto' },
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(bookDir, 'chapters', '01-introduction', 'content.md'), '# Intro\n\nHello **BookCli**.\n');
    fs.writeFileSync(path.join(bookDir, 'chapters', '02-details', 'content.md'), '# Details\n\nSecond chapter.\n');

    loadBookProjectConfig(bookDir);
    const html = buildHtml(bookDir);
    if (!fs.existsSync(html.htmlPath)) throw new Error('HTML output was not created');
    if (path.basename(html.htmlPath) !== 'Smoke # 中文.html') {
      throw new Error(`HTML output did not preserve the special file name: ${html.htmlPath}`);
    }

    const pdfPath = await buildPdf(bookDir);
    if (!fs.existsSync(pdfPath)) throw new Error('PDF output was not created');
    const pdfHeader = fs.readFileSync(pdfPath).subarray(0, 5).toString('ascii');
    if (pdfHeader !== '%PDF-') throw new Error('PDF output does not have a valid PDF header');

    const epubPath = buildEpub(bookDir);
    if (!fs.existsSync(epubPath)) throw new Error('EPUB output was not created');

    const opf = execFileSync('unzip', ['-p', epubPath, 'OEBPS/content.opf'], { encoding: 'utf8' });
    const epubEntries = execFileSync('unzip', ['-Z1', epubPath], { encoding: 'utf8' });
    if (!opf.includes('2026-01-01T00:00:00Z')) {
      throw new Error('EPUB modified time was not written');
    }
    if (!epubEntries.includes('OEBPS/chapter-001.xhtml') || !epubEntries.includes('OEBPS/chapter-002.xhtml')) {
      throw new Error('EPUB chapter documents were not created');
    }
    if (!opf.includes('<itemref idref="chapter-1"/>') || !opf.includes('<itemref idref="chapter-2"/>')) {
      throw new Error('EPUB chapter spine was not created');
    }

    console.log('[book-cli] smoke test passed');
  } finally {
    fs.rmSync(bookDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
