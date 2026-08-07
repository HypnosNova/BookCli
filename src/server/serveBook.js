const fs = require('fs');
const http = require('http');
const path = require('path');
const { buildHtml } = require('../build/buildHtml');
const { BookCliError } = require('../utils/errors');
const { resolveInside } = require('../utils/safePath');
const logger = require('../utils/logger');

/**
 * Start a local HTTP server to preview the book, with optional live-reload on file changes.
 * @param {string} bookDir - Absolute path to the book project directory.
 * @param {object} [options={}]
 * @param {number} [options.port=3000] - The port to listen on.
 * @param {string} [options.host='127.0.0.1'] - The host to bind to.
 * @param {boolean} [options.watch=true] - Whether to watch for file changes and auto-rebuild.
 * @returns {Promise<{ server: import('http').Server, close: Function }>}
 *   Resolves with the HTTP server instance and a close function.
 */
function serveBook(bookDir, { port = 3000, host = '127.0.0.1', watch = true } = {}) {
  let buildResult = buildHtml(bookDir);
  const clients = new Set();

  const server = http.createServer((req, res) => {
    try {
      handleRequest({ req, res, bookDir, buildResult, clients });
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(err && err.stack ? err.stack : String(err));
    }
  });

  let watcher = null;
  if (watch !== false) {
    watcher = watchBook(bookDir, () => {
      try {
        buildResult = buildHtml(bookDir);
        broadcastReload(clients);
      } catch (err) {
        logger.error(`预览重建失败: ${err.message}`);
        broadcastBuildError(clients, err);
      }
    });
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (watcher) watcher.close();
    for (const client of clients) client.end();
    if (server.listening) server.close();
    process.removeListener('SIGINT', handleSigint);
  };

  const handleSigint = () => {
    close();
    process.exit(0);
  };
  process.once('SIGINT', handleSigint);

  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      close();
      if (err.code === 'EADDRINUSE') {
        reject(new BookCliError(`端口已被占用: ${host}:${port}`, { code: 'EADDRINUSE' }));
        return;
      }
      reject(err);
    });

    server.listen(Number(port), host, () => {
      const url = `http://${host}:${server.address().port}/`;
      logger.info(`预览服务已启动: ${url}`);
      logger.info(`PDF 版式预览: ${url}?media=print`);
      logger.info('修改 config.json、chapters 或 assets 后会自动重建 HTML。');
      logger.info('按 Ctrl+C 停止预览服务。');
      resolve({ server, close });
    });
  });
}

function handleRequest({ req, res, bookDir, buildResult, clients }) {
  const url = new URL(req.url, 'http://bookcli.local');
  if (url.pathname === '/__bookcli/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const distDir = path.join(bookDir, 'dist');
  let filePath;
  try {
    filePath = url.pathname === '/' ? buildResult.htmlPath : resolvePreviewPath(distDir, url.pathname);
  } catch (err) {
    if (!(err instanceof BookCliError) || err.code !== 'EINVALID_PATH') throw err;
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') {
    const html = injectPreviewHelpers(getHtmlContent(filePath, buildResult), { printPreview: url.searchParams.get('media') === 'print' });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(200, { 'content-type': getMimeType(ext) });
  fs.createReadStream(filePath).pipe(res);
}

function resolvePreviewPath(distDir, urlPathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(String(urlPathname || ''));
  } catch (_) {
    throw new BookCliError('预览资源路径编码无效', { code: 'EINVALID_PATH' });
  }

  const relativePath = decodedPath
    .replace(/^[\\/]+/, '')
    .replace(/[\\/]+/g, path.sep);
  return resolveInside(distDir, relativePath, { label: '预览资源路径' });
}

function watchBook(bookDir, onChange, { debounceMs = 150 } = {}) {
  const watchers = new Map();
  let timer = null;
  let closed = false;

  const schedule = (eventType, fileName) => {
    syncWatchers();
    if (shouldIgnoreWatchedFile(fileName)) return;
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };

  const syncWatchers = () => {
    if (closed) return;
    const desired = collectWatchDirectories(bookDir);

    for (const [watchedDir, watcher] of watchers) {
      if (desired.has(watchedDir)) continue;
      watcher.close();
      watchers.delete(watchedDir);
    }

    for (const directory of desired) {
      if (watchers.has(directory)) continue;
      try {
        const watcher = fs.watch(directory, schedule);
        watcher.on('error', () => {
          watcher.close();
          watchers.delete(directory);
          queueMicrotask(syncWatchers);
        });
        watchers.set(directory, watcher);
      } catch (err) {
        logger.warn(`无法监听目录 ${directory}: ${err.message}`);
      }
    }
  };

  syncWatchers();

  return {
    refresh: syncWatchers,
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}

function collectWatchDirectories(bookDir) {
  const directories = new Set();
  if (!fs.existsSync(bookDir) || !fs.statSync(bookDir).isDirectory()) return directories;
  directories.add(path.resolve(bookDir));

  for (const rootName of ['chapters', 'assets']) {
    const root = path.join(bookDir, rootName);
    collectDirectoryTree(root, directories);
  }
  return directories;
}

function collectDirectoryTree(dir, directories) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  directories.add(path.resolve(dir));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) collectDirectoryTree(path.join(dir, entry.name), directories);
  }
}

function shouldIgnoreWatchedFile(fileName) {
  const baseName = path.basename(String(fileName || ''));
  return ['ideas.md', 'outline.md', 'summary.md'].includes(baseName) || baseName.startsWith('.');
}

function broadcastReload(clients) {
  for (const client of clients) {
    client.write('event: reload\n');
    client.write('data: reload\n\n');
  }
}

function broadcastBuildError(clients, err) {
  const data = JSON.stringify({
    message: err && err.message ? err.message : String(err),
    code: err && err.code ? err.code : undefined,
  });
  for (const client of clients) {
    client.write('event: error\n');
    client.write(`data: ${data}\n\n`);
  }
}

function getHtmlContent(filePath, buildResult) {
  if (path.resolve(filePath) === path.resolve(buildResult.htmlPath) && typeof buildResult.html === 'string') {
    return buildResult.html;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function injectPreviewHelpers(html, { printPreview = false } = {}) {
  let out = html;
  if (printPreview) out = addHtmlClass(out, 'bookcli-print-preview');
  const script = `<script>
(() => {
  const source = new EventSource('/__bookcli/events');
  source.addEventListener('reload', () => {
    removeErrorBanner();
    window.location.reload();
  });
  source.addEventListener('error', (event) => {
    try {
      const data = JSON.parse(event.data || '{}');
      console.error('[book-cli] 预览重建失败:', data.message || event.data);
      showErrorBanner(data.message || event.data || '预览重建失败');
    } catch (_) {
      console.error('[book-cli] 预览重建失败:', event.data);
      showErrorBanner(event.data || '预览重建失败');
    }
  });

  function showErrorBanner(message) {
    removeErrorBanner();
    const banner = document.createElement('div');
    banner.id = 'bookcli-error-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 16px;background:#fee2e2;color:#991b1b;font:14px/1.5 system-ui,sans-serif;border-bottom:2px solid #f8717a;white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(0,0,0,.1);';
    banner.textContent = '[book-cli] 预览重建失败: ' + message;
    document.body.appendChild(banner);
  }

  function removeErrorBanner() {
    const existing = document.getElementById('bookcli-error-banner');
    if (existing) existing.remove();
  }
})();
</script>`;
  const style = printPreview ? `<style>
html.bookcli-print-preview {
  background: #eef1f4;
}
html.bookcli-print-preview body {
  padding: 0;
}
html.bookcli-print-preview .bookcli-content {
  margin: 16px auto;
  min-height: 297mm;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 10px 32px rgba(0, 0, 0, 0.12);
}
@media (max-width: 800px) {
  html.bookcli-print-preview .bookcli-content {
    margin: 8px auto;
    min-height: auto;
  }
}
</style>` : '';
  const injection = `${style}\n${script}`;
  return out.includes('</body>') ? out.replace('</body>', `${injection}\n</body>`) : `${out}\n${injection}`;
}

function addHtmlClass(html, className) {
  return String(html).replace(/<html([^>]*)>/i, (match, attrs) => {
    const classMatch = attrs.match(/\sclass=(["'])(.*?)\1/i);
    if (!classMatch) return `<html${attrs} class="${className}">`;
    const classes = classMatch[2].split(/\s+/).filter(Boolean);
    if (!classes.includes(className)) classes.push(className);
    return match.replace(classMatch[0], ` class=${classMatch[1]}${classes.join(' ')}${classMatch[1]}`);
  });
}

function getMimeType(ext) {
  return {
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.md': 'text/markdown; charset=utf-8',
  }[ext] || 'application/octet-stream';
}

module.exports = { resolvePreviewPath, serveBook, watchBook };
