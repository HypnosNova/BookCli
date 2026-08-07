const DEFAULT_STYLE = {
  page: {
    size: 'A4',
    margin: '22mm 18mm 24mm 18mm',
    pdfMargin: { top: '22mm', right: '18mm', bottom: '24mm', left: '18mm' },
  },
  body: {
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    fontSize: '12pt',
    lineHeight: 1.75,
    color: '#1f1f1f',
    backgroundColor: '#f5f5f7',
  },
  content: {
    maxWidth: '210mm',
    padding: '22mm 18mm 24mm',
    background: '#ffffff',
  },
  page: {
    size: 'A4',
    margin: '22mm 18mm 24mm 18mm',
    pdfMargin: { top: '22mm', right: '18mm', bottom: '24mm', left: '18mm' },
  },
  body: {
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    fontSize: '12pt',
    lineHeight: 1.75,
    color: '#1f1f1f',
    backgroundColor: '#ffffff',
  },
  cover: { titleAlign: 'left', subtitleColor: '#555555' },
  h1: {
    fontSize: '22pt',
    color: '#1f1f1f',
    margin: '0 0 1em',
    borderBottom: '1px solid #dddddd',
    paddingBottom: '0.3em',
    pageBreakBefore: 'always',
  },
  h2: { fontSize: '16pt', color: '#1f1f1f', marginTop: '1.6em' },
  h3: { fontSize: '13pt', color: '#1f1f1f', marginTop: '1.4em' },
  h4: { fontSize: '12pt', color: '#1f1f1f', marginTop: '1.2em' },
  h5: { fontSize: '11pt', color: '#333333', marginTop: '1em' },
  h6: { fontSize: '10pt', color: '#555555', marginTop: '1em' },
  paragraph: { margin: '0 0 0.2em', textAlign: 'justify' },
  blockquote: {
    borderLeft: '3px solid #999999',
    color: '#555555',
    backgroundColor: 'transparent',
    margin: '1em 0',
    padding: '0.2em 1em',
  },
  code: {
    fontFamily: '"SF Mono", Menlo, Consolas, monospace',
    fontSize: '10.5pt',
    color: '#24292f',
    backgroundColor: '#f6f8fa',
    padding: '0.1em 0.25em',
    borderRadius: '3px',
  },
  codeBlock: {
    backgroundColor: '#f5f5f5',
    color: '#24292f',
    padding: '0.8em 1em',
    borderRadius: '4px',
  },
  toc: { titleAlign: 'center', titleFontSize: '20pt', linkColor: '#1f1f1f', dividerColor: '#cccccc' },
  link: { color: '#1f1f1f', textDecoration: 'none' },
  table: { borderColor: '#cccccc', headerBackgroundColor: 'transparent', cellPadding: '0.4em 0.6em' },
  headerFooter: { fontSize: '9pt', color: '#888888' },
  header: {
    enabled: true,
    fontSize: '9pt',
    color: '#888888',
    padding: '0 18mm',
    left: { source: 'none' },
    center: { source: 'book' },
    right: { source: 'none' },
  },
  pageNumber: {
    enabled: true,
    format: '第 {page} 页 / 共 {total} 页',
    fontSize: '9pt',
    color: '#888888',
    padding: '0 18mm',
    textAlign: 'center',
  },
  hr: { borderColor: '#cccccc', margin: '1.5em 0' },
};

const STYLE_PROP_MAP = {
  fontFamily: 'font-family',
  fontSize: 'font-size',
  lineHeight: 'line-height',
  color: 'color',
  backgroundColor: 'background-color',
  background: 'background',
  margin: 'margin',
  marginTop: 'margin-top',
  marginRight: 'margin-right',
  marginBottom: 'margin-bottom',
  marginLeft: 'margin-left',
  padding: 'padding',
  paddingTop: 'padding-top',
  paddingRight: 'padding-right',
  paddingBottom: 'padding-bottom',
  paddingLeft: 'padding-left',
  border: 'border',
  borderTop: 'border-top',
  borderRight: 'border-right',
  borderBottom: 'border-bottom',
  borderLeft: 'border-left',
  borderRadius: 'border-radius',
  textAlign: 'text-align',
  textDecoration: 'text-decoration',
  fontWeight: 'font-weight',
  letterSpacing: 'letter-spacing',
  pageBreakBefore: 'page-break-before',
  pageBreakAfter: 'page-break-after',
  pageBreakInside: 'page-break-inside',
  width: 'width',
  maxWidth: 'max-width',
};

/**
 * Return a deep clone of the DEFAULT_STYLE object.
 * @returns {object} A new object with the same structure as DEFAULT_STYLE.
 */
function cloneDefaultStyle() {
  return JSON.parse(JSON.stringify(DEFAULT_STYLE));
}

/**
 * Convert a style object to a CSS declaration string using the STYLE_PROP_MAP.
 * @param {object} [style={}] - The style object with camelCase property names.
 * @param {string[]} [omit=[]] - Property keys to omit from the output.
 * @returns {string} A concatenated CSS declaration string (e.g. " font-size: 12pt; color: #1f1f1f;").
 */
function styleToCss(style = {}, omit = []) {
  return Object.entries(style)
    .filter(([key, value]) => value !== undefined && value !== null && !omit.includes(key) && STYLE_PROP_MAP[key])
    .map(([key, value]) => ` ${STYLE_PROP_MAP[key]}: ${cssValue(value)};`)
    .join('');
}

/**
 * Sanitize a CSS value by stripping dangerous characters (<, >, {, }).
 * @param {*} value - The CSS value to sanitize.
 * @returns {string} The sanitized string.
 */
function cssValue(value) {
  return String(value).replace(/[<>{}]/g, '');
}

/**
 * Deep-merge the override object into the base object, cloning values on conflict.
 * @param {object} base - The base object providing defaults.
 * @param {object} override - The override object whose values take precedence.
 * @returns {object} A new merged object.
 */
function mergeDeep(base, override) {
  if (!isPlainObject(override)) return cloneValue(base);

  const out = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(base?.[key])) {
      out[key] = mergeDeep(base[key], value);
    } else {
      out[key] = cloneValue(value);
    }
  }
  return out;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

module.exports = {
  DEFAULT_STYLE,
  STYLE_PROP_MAP,
  cloneDefaultStyle,
  cssValue,
  mergeDeep,
  styleToCss,
};
