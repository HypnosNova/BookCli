const { BookCliError } = require('./errors');

const SHORT_OPTIONS = {
  v: 'version',
  h: 'help',
  d: 'debug',
  q: 'quiet',
  b: 'book',
  p: 'port',
  o: 'out',
  t: 'title',
  a: 'author',
};

const BOOLEAN_OPTIONS = new Set(['version', 'help', 'debug', 'quiet', 'json']);
const VALUE_OPTIONS = new Set([
  'book',
  'dir',
  'port',
  'out',
  'title',
  'author',
  'host',
  'name',
  'chapterDir',
  'file',
]);
const LONG_OPTION_ALIASES = {
  'chapter-dir': 'chapterDir',
};

/**
 * Parse BookCli command-line arguments without allowing boolean flags to consume
 * the following command or positional argument.
 * @param {string[]} argv
 * @returns {Record<string, string | boolean | string[]> & { _: string[] }}
 */
function parseArgs(argv) {
  const args = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--') {
      args._.push(...argv.slice(i + 1));
      break;
    }

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      const rawKey = token.slice(2, eq === -1 ? undefined : eq);
      const key = LONG_OPTION_ALIASES[rawKey] || rawKey;
      ensureKnownOption(key, token);

      if (BOOLEAN_OPTIONS.has(key)) {
        if (eq !== -1) throw usageError(`布尔参数不接受值: ${token}`);
        args[key] = true;
        continue;
      }

      if (eq !== -1) {
        const value = token.slice(eq + 1);
        if (!value) throw usageError(`参数缺少值: --${rawKey}`);
        args[key] = value;
        continue;
      }

      const next = argv[i + 1];
      if (!next || next.startsWith('-')) throw usageError(`参数缺少值: --${rawKey}`);
      args[key] = next;
      i += 1;
      continue;
    }

    if (token.startsWith('-') && token !== '-') {
      const flag = token.slice(1);
      const key = SHORT_OPTIONS[flag];
      if (!key) throw usageError(`未知参数: ${token}`);

      if (BOOLEAN_OPTIONS.has(key)) {
        args[key] = true;
        continue;
      }

      const next = argv[i + 1];
      if (!next || next.startsWith('-')) throw usageError(`参数缺少值: ${token}`);
      args[key] = next;
      i += 1;
      continue;
    }

    args._.push(token);
  }

  return args;
}

function ensureKnownOption(key, token) {
  if (!BOOLEAN_OPTIONS.has(key) && !VALUE_OPTIONS.has(key)) {
    throw usageError(`未知参数: ${token}`);
  }
}

function usageError(message) {
  return new BookCliError(message, { code: 'EUSAGE' });
}

module.exports = { parseArgs };
