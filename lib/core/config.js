/**
 * Configuration Management Module
 * 
 * Provides configuration loading, saving, and management for the afk application.
 * Maintains backward compatibility with existing configuration patterns.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Constants
const HOME = os.homedir();
const USER_CFG_DIR = path.join(HOME, '.afk');
const USER_CFG = path.join(USER_CFG_DIR, 'config.json');
const DEFAULT_TIMEOUT = 3600; // 1 hour (in seconds)
const DEFAULT_TIMEOUT_ACTION = 'deny'; // 'deny', 'allow', or 'wait'

/**
 * Configuration Manager Class
 * Handles loading, saving and managing application configuration
 */
class ConfigManager {
  constructor(configPath = USER_CFG, configDir = USER_CFG_DIR) {
    this.configPath = configPath;
    this.configDir = configDir;
    this._cachedConfig = null;
  }

  /**
   * Load JSON file with default fallback
   * @param {string} filePath - Path to JSON file
   * @param {*} defaultValue - Default value if file doesn't exist or is invalid
   * @returns {*} Parsed JSON or default value
   */
  loadJson(filePath, defaultValue = {}) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (e) {
      console.error(`[afk] Failed to read ${filePath}: ${e.message}`);
    }
    return defaultValue;
  }

  /**
   * Save object as JSON file atomically
   * @param {string} filePath - Path to save file
   * @param {*} obj - Object to save as JSON
   */
  saveJson(filePath, obj) {
    this._ensureDir(path.dirname(filePath));
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, filePath);
  }

  /**
   * Load and cache configuration with environment variable fallbacks
   * @returns {Object} Configuration object
   */
  cfg() {
    if (this._cachedConfig) {
      return this._cachedConfig;
    }

    const config = this.loadJson(this.configPath, {});
    
    // Apply defaults and environment variable fallbacks
    config.telegram_bot_token = config.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '';
    config.telegram_chat_id = config.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || '';
    config.timeout_seconds = config.timeout_seconds || DEFAULT_TIMEOUT;
    config.timeout_action = config.timeout_action || DEFAULT_TIMEOUT_ACTION;
    config.intercept_matcher = config.intercept_matcher || 'Bash|Edit|Write|MultiEdit|WebFetch|mcp__.*';
    config.auto_approve_tools = config.auto_approve_tools || ['Read'];

    this._cachedConfig = config;
    return config;
  }

  /**
   * Write default configuration if it doesn't exist
   */
  writeDefaultConfig() {
    if (!fs.existsSync(this.configPath)) {
      this.saveJson(this.configPath, this.cfg());
      console.log(`Wrote default config at ${this.configPath}`);
    }
  }

  /**
   * Clear cached configuration (useful for testing or when config changes)
   */
  clearCache() {
    this._cachedConfig = null;
  }

  /**
   * Get configuration directory path
   * @returns {string} Configuration directory path
   */
  getConfigDir() {
    return this.configDir;
  }

  /**
   * Get configuration file path
   * @returns {string} Configuration file path
   */
  getConfigPath() {
    return this.configPath;
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
const defaultConfigManager = new ConfigManager();

/**
 * Backward compatibility functions - these maintain the exact same interface
 * as the original functions in bin/afk
 */

/**
 * Load JSON file with default fallback (backward compatibility)
 * @param {string} p - Path to JSON file
 * @param {*} def - Default value
 * @returns {*} Parsed JSON or default value
 */
function loadJson(p, def) {
  return defaultConfigManager.loadJson(p, def);
}

/**
 * Save object as JSON file atomically (backward compatibility)
 * @param {string} p - Path to save file
 * @param {*} obj - Object to save
 */
function saveJson(p, obj) {
  return defaultConfigManager.saveJson(p, obj);
}

/**
 * Load and cache configuration (backward compatibility)
 * @returns {Object} Configuration object
 */
function cfg() {
  return defaultConfigManager.cfg();
}

/**
 * Write default configuration if it doesn't exist (backward compatibility)
 */
function writeDefaultConfig() {
  return defaultConfigManager.writeDefaultConfig();
}

module.exports = {
  ConfigManager,
  loadJson,
  saveJson,
  cfg,
  writeDefaultConfig,
  // Constants for other modules
  USER_CFG_DIR,
  USER_CFG,
  DEFAULT_TIMEOUT,
  DEFAULT_TIMEOUT_ACTION
};