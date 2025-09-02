/**
 * Utilities Module
 * 
 * Provides shared utility functions for the afk application.
 * Maintains backward compatibility with existing utility patterns.
 */

const fs = require('fs');
const path = require('path');

/**
 * Utilities Class
 * Container for various utility functions
 */
class Utils {
  /**
   * Ensure directory exists, creating if necessary
   * @param {string} dirPath - Directory path to ensure exists
   */
  static ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  /**
   * Make file executable by adding execute permissions
   * @param {string} filePath - File path to make executable
   */
  static ensureExecutable(filePath) {
    try {
      const st = fs.statSync(filePath);
      fs.chmodSync(filePath, st.mode | 0o111);
    } catch (_) {
      // Silent fail - file may not exist or permissions may not allow change
    }
  }

  /**
   * Convert path to POSIX format (forward slashes)
   * @param {string} p - Path to convert
   * @returns {string} Path with forward slashes
   */
  static toPosix(p) {
    // Replace all backslashes with forward slashes regardless of platform
    return p.replace(/\\/g, '/');
  }

  /**
   * Generate a crypto-random UUID-like identifier
   * @returns {string} Random identifier in UUID format
   */
  static cryptoRandomId() {
    // Simple UUID-ish (without importing crypto)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Escape Markdown special characters for Telegram
   * @param {string} text - Text to escape
   * @returns {string} Escaped text, or original if not a string
   */
  static escapeMarkdown(text) {
    if (typeof text !== 'string') return text;
    // Escape special Markdown characters for Telegram
    // Order matters: escape backslashes first
    return text
      .replace(/\\/g, '\\\\')
      .replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }

  /**
   * Check if a file exists
   * @param {string} filePath - File path to check
   * @returns {boolean} True if file exists
   */
  static fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  /**
   * Get file stats safely
   * @param {string} filePath - File path to get stats for
   * @returns {fs.Stats|null} File stats or null if error
   */
  static getFileStats(filePath) {
    try {
      return fs.statSync(filePath);
    } catch (_) {
      return null;
    }
  }

  /**
   * Read file safely with fallback
   * @param {string} filePath - File path to read
   * @param {string} encoding - File encoding (default 'utf8')
   * @param {*} fallback - Fallback value if read fails
   * @returns {string|*} File contents or fallback
   */
  static readFile(filePath, encoding = 'utf8', fallback = null) {
    try {
      return fs.readFileSync(filePath, encoding);
    } catch (_) {
      return fallback;
    }
  }

  /**
   * Write file safely with directory creation
   * @param {string} filePath - File path to write
   * @param {string} content - Content to write
   * @param {string} encoding - File encoding (default 'utf8')
   */
  static writeFile(filePath, content, encoding = 'utf8') {
    Utils.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, encoding);
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after ms milliseconds
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if string is empty or whitespace only
   * @param {string} str - String to check
   * @returns {boolean} True if empty or whitespace only
   */
  static isEmpty(str) {
    return !str || !str.trim();
  }

  /**
   * Truncate string to max length with ellipsis
   * @param {string} str - String to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated string
   */
  static truncate(str, maxLength) {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}

/**
 * Backward compatibility functions - these maintain the exact same interface
 * as the original functions in bin/afk
 */

/**
 * Ensure directory exists (backward compatibility)
 * @param {string} p - Directory path
 */
function ensureDir(p) {
  return Utils.ensureDir(p);
}

/**
 * Make file executable (backward compatibility)
 * @param {string} p - File path
 */
function ensureExecutable(p) {
  return Utils.ensureExecutable(p);
}

/**
 * Convert path to POSIX format (backward compatibility)
 * @param {string} p - Path to convert
 * @returns {string} POSIX path
 */
function toPosix(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Generate crypto-random ID (backward compatibility)
 * @returns {string} Random ID
 */
function cryptoRandomId() {
  return Utils.cryptoRandomId();
}

/**
 * Escape Markdown text (backward compatibility)
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeMarkdown(text) {
  return Utils.escapeMarkdown(text);
}

module.exports = {
  Utils,
  ensureDir,
  ensureExecutable,
  toPosix,
  cryptoRandomId,
  escapeMarkdown
};