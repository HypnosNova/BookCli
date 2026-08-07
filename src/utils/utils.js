const logger = require('./logger');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, '&apos;');
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w一-龥-]/g, '');
}

function protectMarkdownCode(markdown, { tokenPrefix = 'BOOKCLI_CODE', warnUnclosedFence = true } = {}) {
  const placeholders = [];
  let out = protectFencedCodeBlocks(String(markdown), placeholders, { tokenPrefix, warnUnclosedFence });

  out = out.replace(/`[^`\n]*`/g, (match) => {
    const token = `${tokenPrefix}_INLINE_${placeholders.length}`;
    placeholders.push({ token, value: match });
    return token;
  });

  return { markdown: out, placeholders };
}

function protectFencedCodeBlocks(markdown, placeholders, { tokenPrefix, warnUnclosedFence }) {
  const lines = markdown.split(/(\n)/);
  let out = '';
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;
  let buffer = '';

  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i] || '';
    const newline = lines[i + 1] || '';
    const fullLine = line + newline;

    if (!inFence) {
      const open = line.match(/^([ \t]{0,3})(`{3,}|~{3,})/);
      if (open) {
        inFence = true;
        fenceChar = open[2][0];
        fenceLength = open[2].length;
        buffer = fullLine;
      } else {
        out += fullLine;
      }
      continue;
    }

    buffer += fullLine;
    const close = line.match(/^([ \t]{0,3})(`{3,}|~{3,})[ \t]*$/);
    if (close && close[2][0] === fenceChar && close[2].length >= fenceLength) {
      const token = `${tokenPrefix}_BLOCK_${placeholders.length}`;
      placeholders.push({ token, value: buffer });
      out += token;
      inFence = false;
      fenceChar = '';
      fenceLength = 0;
      buffer = '';
    }
  }

  if (inFence) {
    if (warnUnclosedFence) {
      logger.warn('检测到未关闭的 Markdown 围栏代码块，已按代码块保护到文件末尾。');
    }
    const token = `${tokenPrefix}_BLOCK_${placeholders.length}`;
    placeholders.push({ token, value: buffer });
    return out + token;
  }

  return out;
}

function restoreProtectedMarkdownCode(markdown, placeholders) {
  let out = markdown;
  for (const item of [...placeholders].sort((a, b) => b.token.length - a.token.length)) {
    out = out.replace(new RegExp(escapeRegExp(item.token), 'g'), item.value);
  }
  return out;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  escapeHtml,
  escapeRegExp,
  escapeXml,
  protectMarkdownCode,
  restoreProtectedMarkdownCode,
  slugify,
};
