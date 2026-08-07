const PREFIX = '[book-cli]';

let quiet = false;

/**
 * Configure logger verbosity.
 * @param {{ quiet?: boolean }} options
 */
function configure({ quiet: q = false } = {}) {
  quiet = q;
}

/**
 * Log an informational message. Suppressed when --quiet is active.
 * @param {string} message
 */
function info(message) {
  if (!quiet) {
    console.log(`${PREFIX} ${message}`);
  }
}

/**
 * Log a warning message. Always visible even in quiet mode.
 * @param {string} message
 */
function warn(message) {
  console.warn(`${PREFIX} ${message}`);
}

/**
 * Log an error message. Always visible even in quiet mode.
 * @param {string} message
 */
function error(message) {
  console.error(`${PREFIX} ${message}`);
}

module.exports = { configure, info, warn, error };