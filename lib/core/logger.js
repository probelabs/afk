/**
 * Logging Module
 * 
 * Provides structured logging capabilities for the afk application.
 * Maintains backward compatibility with existing logging patterns.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Constants
const HOME = os.homedir();
const USER_CFG_DIR = path.join(HOME, '.afk');
const DEBUG_LOG_FILE = path.join(USER_CFG_DIR, 'debug.log');
const STATE_FILE = path.join(USER_CFG_DIR, 'mode');
const DEFAULT_MODE = 'local';

/**
 * Logger Class
 * Provides structured debug logging with file and console output
 */
class Logger {
  constructor(configDir = USER_CFG_DIR, debugLogFile = DEBUG_LOG_FILE, stateFile = STATE_FILE) {
    this.configDir = configDir;
    this.debugLogFile = debugLogFile;
    this.stateFile = stateFile;
    this._debugMode = null; // Cache debug mode check
  }

  /**
   * Check if debug mode is enabled
   * @returns {boolean} True if debug mode is enabled
   */
  isDebugEnabled() {
    if (this._debugMode !== null) {
      return this._debugMode;
    }

    // Check persistent debug setting
    const debugFile = path.join(this.configDir, '.debug');
    if (fs.existsSync(debugFile)) {
      this._debugMode = true;
      return true;
    }
    
    // Check environment variable
    if (process.env.AFK_DEBUG === '1' || process.env.CC_REMOTE_DEBUG === '1') {
      if (process.env.CC_REMOTE_DEBUG === '1') {
        this.eprint('[afk] Warning: CC_REMOTE_DEBUG is deprecated, use AFK_DEBUG instead');
      }
      this._debugMode = true;
      return true;
    }
    
    // Check command line flag
    if (process.argv.includes('--debug')) {
      this._debugMode = true;
      return true;
    }
    
    this._debugMode = false;
    return false;
  }

  /**
   * Output to stderr (error print)
   * @param {...any} args - Arguments to print
   */
  eprint(...args) {
    console.error(...args);
  }

  /**
   * Structured debug logging
   * @param {string} category - Category of the log entry
   * @param {string} message - Log message
   * @param {*} data - Optional data to include (will be JSON stringified)
   */
  debugLog(category, message, data = null) {
    if (!this.isDebugEnabled()) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      category,
      message,
      data,
      pid: process.pid,
      mode: this._readMode(),
      session: process.env.CLAUDE_SESSION_ID || 'unknown'
    };
    
    // Log to stderr for immediate visibility
    const logLine = `[DEBUG ${timestamp}] [${category}] ${message}`;
    if (data) {
      this.eprint(logLine, JSON.stringify(data, null, 2));
    } else {
      this.eprint(logLine);
    }
    
    // Also append to debug log file
    try {
      this._ensureDir(this.configDir);
      fs.appendFileSync(this.debugLogFile, JSON.stringify(logEntry) + '\n');
    } catch (e) {
      // Silent fail - don't break the app if logging fails
    }
  }

  /**
   * Clear the debug mode cache (useful for testing)
   */
  clearDebugCache() {
    this._debugMode = null;
  }

  /**
   * Set debug log file path (useful for testing)
   * @param {string} filePath - New debug log file path
   */
  setDebugLogFile(filePath) {
    this.debugLogFile = filePath;
  }

  /**
   * Read current mode from state file (private helper)
   * @private
   * @returns {string} Current mode ('remote' or 'local')
   */
  _readMode() {
    if (fs.existsSync(this.stateFile)) {
      const v = fs.readFileSync(this.stateFile, 'utf8').trim();
      return (v === 'remote' || v === 'local') ? v : DEFAULT_MODE;
    }
    return DEFAULT_MODE;
  }

  /**
   * Ensure directory exists (private helper)
   * @private
   */
  _ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Create default instance for backward compatibility
const defaultLogger = new Logger();

/**
 * Backward compatibility functions - these maintain the exact same interface
 * as the original functions in bin/afk
 */

/**
 * Check if debug mode is enabled (backward compatibility)
 * @returns {boolean} True if debug mode is enabled
 */
function isDebugEnabled() {
  return defaultLogger.isDebugEnabled();
}

/**
 * Output to stderr (backward compatibility)
 * @param {...any} args - Arguments to print
 */
function eprint(...args) {
  return defaultLogger.eprint(...args);
}

/**
 * Structured debug logging (backward compatibility)
 * @param {string} category - Category of the log entry
 * @param {string} message - Log message
 * @param {*} data - Optional data to include
 */
function debugLog(category, message, data = null) {
  return defaultLogger.debugLog(category, message, data);
}

module.exports = {
  Logger,
  isDebugEnabled,
  eprint,
  debugLog,
  // Constants for other modules
  DEBUG_LOG_FILE,
  USER_CFG_DIR
};