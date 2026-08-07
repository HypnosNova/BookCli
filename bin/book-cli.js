#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const { buildMarkdown } = require('../src/build/buildMarkdown');
const { buildHtml } = require('../src/build/buildHtml');
const { buildPdf } = require('../src/build/buildPdf');
const { buildEpub } = require('../src/build/buildEpub');
const { createBook } = require('../src/utils/createBook');
const { addChapter } = require('../src/utils/addChapter');
const { serveBook } = require('../src/server/serveBook');
const { analyzeBook, generateChapterSummaries, printWordStats, writeWordStats } = require('../src/utils/bookAnalysis');
const { BookCliError } = require('../src/utils/errors');
const logger = require('../src/utils/logger');
const { parseArgs } = require('../src/utils/parseArgs');

function resolveBookDir(args) {
  return path.resolve(process.cwd(), args.book || args.dir || '.');
}

function printHelp() {
  console.log(`BookCli

Usage:
  book-cli init <dir> --title <title> [--author <author>]
  book-cli build [--book <dir>]
  book-cli build-md [--book <dir>]
  book-cli build-html [--book <dir>]
  book-cli build-pdf [--book <dir>]
  book-cli build-epub [--book <dir>]
  book-cli serve [--book <dir>] [--port <port>]
  book-cli preview [--book <dir>] [--port <port>]
  book-cli add-chapter --book <dir> --title <title> [--dir <dir>]
  book-cli clean [--book <dir>]
  book-cli stats [--book <dir>] [--json] [--out <file>]
  book-cli summary [--book <dir>] [--out <file>]

Commands:
  init       Create a new book project.
  build      Build markdown, HTML and PDF.
  build-md   Merge chapters into dist/book.md.
  build-html Build dist/book.md and HTML.
  build-pdf  Build dist/book.md, HTML and PDF.
  build-epub Build dist/book.md, HTML and EPUB.
  serve      Start a local HTML preview server with live reload.
  preview    Alias of serve.
  add-chapter Create a chapter directory and update config.json.
  clean      Remove the book dist directory.
  stats      Count words for each chapter and write dist/word-stats.json.
  summary    Generate chapter summary.md files and dist/chapter-summaries.md.

Options:
  --book, -b  Book directory. Defaults to current directory.
  --dir       Alias of --book for build commands.
  --title, -t Book title for init.
  --author, -a Book author for init.
  --port, -p  Preview server port. Defaults to 3000.
  --out, -o   Output file for stats or summary.
  --json      Print stats as JSON.
  --quiet, -q Suppress informational output.
  --version, -v Show CLI version.
  --debug, -d Print stack traces for errors.
  --help, -h  Show help.
`);
}

function cleanBook(bookDir) {
  const distDir = path.join(bookDir, 'dist');
  if (!fs.existsSync(distDir)) {
    logger.info(`dist 目录不存在，无需清理: ${path.relative(process.cwd(), distDir)}`);
    return;
  }
  fs.rmSync(distDir, { recursive: true, force: true });
  logger.info(`已清理 ${path.relative(process.cwd(), distDir)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  main._args = args;

  if (args.quiet === true) {
    logger.configure({ quiet: true });
  }

  if (args.version === true || command === 'version') {
    console.log(pkg.version);
    return;
  }

  if (!command || args.help || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'init') {
    const dir = args._[1] || args.name;
    createBook({
      dir,
      title: args.title,
      author: args.author || '',
    });
    return;
  }

  if (command === 'build-md') {
    buildMarkdown(resolveBookDir(args));
    return;
  }

  if (command === 'build-html') {
    buildHtml(resolveBookDir(args));
    return;
  }

  if (command === 'build' || command === 'build-pdf') {
    await buildPdf(resolveBookDir(args));
    return;
  }

  if (command === 'build-epub') {
    buildEpub(resolveBookDir(args));
    return;
  }

  if (command === 'serve' || command === 'preview') {
    await serveBook(resolveBookDir(args), { port: args.port || 3000, host: args.host || '127.0.0.1' });
    return;
  }

  if (command === 'add-chapter') {
    addChapter(path.resolve(process.cwd(), args.book || '.'), {
      title: args.title || args._.slice(1).join(' '),
      dir: args.dir || args.chapterDir,
      file: args.file || 'content.md',
    });
    return;
  }

  if (command === 'clean') {
    cleanBook(resolveBookDir(args));
    return;
  }

  if (command === 'stats') {
    const bookDir = resolveBookDir(args);
    const stats = analyzeBook(bookDir);
    printWordStats(stats, { json: args.json === true });
    if (!args.json) {
      writeWordStats(bookDir, stats, args.out);
    }
    return;
  }

  if (command === 'summary') {
    generateChapterSummaries(resolveBookDir(args), { outputPath: args.out });
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  const args = main._args || {
    debug: process.argv.slice(2).some((token) => token === '--debug' || token === '-d'),
  };
  if (err instanceof BookCliError && args.debug !== true) {
    logger.error(err.message);
    if (err.code) logger.error(`错误码: ${err.code}`);
    logger.error('如需查看堆栈，请加 --debug。');
    process.exit(1);
  }
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
