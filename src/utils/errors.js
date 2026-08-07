/**
 * Custom error class for BookCli.
 * @extends Error
 * @param {string} message - Human-readable error description.
 * @param {{ code?: string }} options - Error options.
 * @param {string} [options.code='BOOKCLI_ERROR'] - Machine-readable error code.
 * @returns {BookCliError}
 */
class BookCliError extends Error {
  constructor(message, { code = 'BOOKCLI_ERROR' } = {}) {
    super(message);
    this.name = 'BookCliError';
    this.code = code;
  }
}

module.exports = { BookCliError };
