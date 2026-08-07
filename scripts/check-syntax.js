const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoots = ['bin', 'src', 'scripts', 'tests'];
const files = sourceRoots
  .flatMap((root) => collectJavaScriptFiles(path.join(projectRoot, root)))
  .sort();

for (const filePath of files) {
  const result = spawnSync(process.execPath, ['--check', filePath], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`[book-cli] syntax check passed (${files.length} files)`);

function collectJavaScriptFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectJavaScriptFiles(filePath));
    if (entry.isFile() && path.extname(entry.name) === '.js') files.push(filePath);
  }
  return files;
}
