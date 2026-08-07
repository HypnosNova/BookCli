const fs = require('fs');
const path = require('path');
const { BookCliError } = require('./errors');

/**
 * Resolve an untrusted relative path and ensure it remains inside baseDir.
 * Existing paths are checked through realpath as well, preventing symlink escapes.
 * @param {string} baseDir
 * @param {string} relativePath
 * @param {{ label?: string, code?: string, allowBase?: boolean }} [options]
 * @returns {string}
 */
function resolveInside(baseDir, relativePath, { label = '路径', code = 'EINVALID_PATH', allowBase = false } = {}) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || relativePath.includes('\0')) {
    throw pathError(`${label} 必须是非空相对路径`, code);
  }
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw pathError(`${label} 不允许使用绝对路径: ${relativePath}`, code);
  }

  const basePath = path.resolve(baseDir);
  const targetPath = path.resolve(basePath, relativePath);
  if (!isInside(basePath, targetPath, allowBase)) {
    throw pathError(`${label} 必须位于目录内: ${basePath}`, code);
  }

  assertRealPathInside(basePath, targetPath, { label, code, allowBase });
  return targetPath;
}

function resolveChapterPaths(bookDir, chapter, { label = '章节', code = 'EINVALID_PATH' } = {}) {
  const chaptersDir = path.join(bookDir, 'chapters');
  const chapterDir = resolveInside(chaptersDir, chapter.dir, { label: `${label}.dir`, code });
  const contentPath = resolveInside(chapterDir, chapter.file || 'content.md', { label: `${label}.file`, code });
  return { chapterDir, contentPath };
}

function assertRealPathInside(basePath, targetPath, { label, code, allowBase }) {
  if (!fs.existsSync(basePath)) return;

  const realBase = fs.realpathSync(basePath);
  let existingPath = targetPath;
  while (!fs.existsSync(existingPath)) {
    const parent = path.dirname(existingPath);
    if (parent === existingPath) return;
    existingPath = parent;
  }

  const realExistingPath = fs.realpathSync(existingPath);
  const existingIsBase = path.resolve(existingPath) === basePath;
  if (!isInside(realBase, realExistingPath, existingIsBase ? true : allowBase)) {
    throw pathError(`${label} 通过符号链接指向了目录外: ${targetPath}`, code);
  }
}

function isInside(basePath, targetPath, allowBase = false) {
  const relative = path.relative(basePath, targetPath);
  if (!relative) return allowBase;
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function pathError(message, code) {
  return new BookCliError(message, { code });
}

module.exports = { isInside, resolveChapterPaths, resolveInside };
