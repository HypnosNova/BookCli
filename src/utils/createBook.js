const fs = require('fs');
const path = require('path');
const { BookCliError } = require('./errors');
const { cloneDefaultStyle } = require('../render/style');
const logger = require('./logger');

function createBook({ dir, title, author = '' }) {
  if (!dir) {
    throw new BookCliError('用法: book-cli init <dir> --title <书名> [--author <作者>]', { code: 'EUSAGE' });
  }

  const bookDir = path.resolve(process.cwd(), dir);
  if (fs.existsSync(bookDir)) {
    throw new BookCliError(`目录已存在: ${bookDir}`, { code: 'EEXISTS' });
  }

  const safeTitle = title || path.basename(bookDir);
  fs.mkdirSync(path.join(bookDir, 'chapters', '01-introduction'), { recursive: true });

  fs.writeFileSync(path.join(bookDir, 'config.json'), JSON.stringify(createDefaultConfig(safeTitle, author), null, 2) + '\n');
  fs.writeFileSync(path.join(bookDir, 'chapters', '01-introduction', 'ideas.md'), '# 构思\n\n在这里记录灵感与论点。\n');
  fs.writeFileSync(path.join(bookDir, 'chapters', '01-introduction', 'outline.md'), '# 大纲\n\n1. ...\n2. ...\n');
  fs.writeFileSync(
    path.join(bookDir, 'chapters', '01-introduction', 'content.md'),
    `欢迎来到《${safeTitle}》。\n\n在这里开始正文写作。\n`
  );

  logger.info(`已创建新书: ${path.relative(process.cwd(), bookDir)}`);
  logger.info(`下一步: cd ${path.relative(process.cwd(), bookDir)} && book-cli build`);
}

function createDefaultConfig(title, author) {
  return {
    book: {
      title,
      author,
      date: new Date().toISOString().slice(0, 10),
      chapters: [{ dir: '01-introduction', title: '引言', file: 'content.md' }],
    },
    output: { pdfName: title },
    plugins: {
      math: { enabled: true },
      codeHighlight: { enabled: true, theme: 'github' },
    },
    style: cloneDefaultStyle(),
  };
}

module.exports = { createBook, createDefaultConfig };
