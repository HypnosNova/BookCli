const { protectMarkdownCode, restoreProtectedMarkdownCode } = require('../utils/utils');

function formatChapterTitle(index, title, headingNumberingEnabled = false) {
  const cleanTitle = stripHeadingNumber(title);
  if (headingNumberingEnabled) return `${index + 1}. ${cleanTitle}`;
  return cleanTitle;
}

function numberChapterHeadings(markdown, chapterIndex, chapterTitle = '') {
  const counters = [0, 0, 0, 0, 0];
  const chapterNumber = chapterIndex + 1;
  const protectedMarkdown = protectMarkdownCode(String(markdown || ''), { tokenPrefix: 'BOOKCLI_HEADING_CODE' });
  const lines = protectedMarkdown.markdown.split(/\r?\n/);
  const firstHeadingIndex = lines.findIndex((line) => line.trim());
  const normalizedChapterTitle = normalizeHeadingText(chapterTitle);

  const numbered = lines
    .map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (!match) return line;

      const rawText = stripHeadingNumber(match[2]);
      if (index === firstHeadingIndex && match[1].length === 1 && normalizeHeadingText(rawText) === normalizedChapterTitle) {
        return null;
      }

      const level = match[1].length === 1 ? 2 : match[1].length;
      const counterIndex = level - 2;
      for (let i = 0; i < counterIndex; i += 1) {
        if (counters[i] === 0) counters[i] = 1;
      }
      counters[counterIndex] += 1;
      for (let i = counterIndex + 1; i < counters.length; i += 1) counters[i] = 0;

      const number = [chapterNumber, ...counters.slice(0, counterIndex + 1)].join('.');
      return `${'#'.repeat(level)} ${number} ${rawText}`;
    })
    .filter((line) => line !== null)
    .join('\n')
    .trim();

  return restoreProtectedMarkdownCode(numbered, protectedMarkdown.placeholders);
}

function stripHeadingNumber(text) {
  return String(text || '')
    .trim()
    .replace(/^(?:第\s*\d+\s*章[　\s]*)?(?:\d+(?:\.\d+)+\.?|\d+\.)\s+/u, '')
    .trim();
}

function normalizeHeadingText(text) {
  return stripHeadingNumber(text).replace(/\s+/g, ' ').trim();
}

function isHeadingNumberingEnabled(config = {}) {
  const value = config.headingNumbering;
  if (value === true) return true;
  if (value && typeof value === 'object') return value.enabled === true;
  return false;
}

module.exports = {
  formatChapterTitle,
  isHeadingNumberingEnabled,
  numberChapterHeadings,
  stripHeadingNumber,
};
