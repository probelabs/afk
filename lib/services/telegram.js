#!/usr/bin/env node
/**
 * Telegram Service Module
 * Handles all Telegram Bot API interactions including message sending,
 * photo uploads, and multipart form data handling.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * TelegramService class for Bot API integration
 * @class
 */
class TelegramService {
  /**
   * Create a new TelegramService instance
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance for debug output
   */
  constructor(configManager, logger) {
    this.configManager = configManager;
    this.logger = logger;
    this.config = null;
  }

  /**
   * Get configuration, loading if necessary
   * @private
   * @returns {Object} Configuration object
   */
  _getConfig() {
    if (!this.config) {
      this.config = this.configManager.cfg();
    }
    return this.config;
  }

  /**
   * Make a Telegram Bot API call
   * @param {string} token - Bot token
   * @param {string} method - API method name
   * @param {Object} params - API parameters
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async tgApiWithToken(token, method, params, options = {}) {
    const { timeout = 10000 } = options;
    const url = `/bot${token}/${method}`;
    
    const body = JSON.stringify(params);
    const reqOptions = {
      hostname: 'api.telegram.org',
      path: url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout
    };

    return new Promise((resolve, reject) => {
      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.ok) {
              resolve(response.result);
            } else {
              const error = new Error(response.description || 'Telegram API error');
              error.error_code = response.error_code;
              reject(error);
            }
          } catch (e) {
            reject(new Error('Invalid JSON response from Telegram'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Send a message with legacy return format [success, error]
   * @param {string} text - Message text
   * @param {Object} reply_markup - Optional keyboard markup
   * @returns {Promise<[boolean, string|null]>} [success, error] tuple
   */
  async sendMessageLegacy(text, reply_markup = null) {
    try {
      await this.sendMessage(text, reply_markup);
      return [true, null];
    } catch (error) {
      return [false, error.message || String(error)];
    }
  }

  /**
   * Send a text message via Telegram
   * @param {string} text - Message text
   * @param {Object} reply_markup - Optional keyboard markup
   * @returns {Promise<Object>} Message result
   */
  async sendMessage(text, reply_markup = null) {
    const config = this._getConfig();
    
    if (!config.telegram_bot_token || !config.telegram_chat_id) {
      this.logger.eprint('[telegram] Telegram not configured');
      return null;
    }

    const params = {
      chat_id: config.telegram_chat_id,
      text: text,
      parse_mode: 'Markdown'
    };

    if (reply_markup) {
      params.reply_markup = JSON.stringify(reply_markup);
    }

    try {
      const result = await this.tgApiWithToken(
        config.telegram_bot_token,
        'sendMessage',
        params
      );
      
      this.logger.debugLog('TELEGRAM_SEND', 'Message sent', {
        message_id: result.message_id,
        chat_id: result.chat?.id
      });
      
      return result;
    } catch (error) {
      this.logger.eprint('[telegram] Failed to send message:', error.message);
      throw error;
    }
  }

  /**
   * Send a photo with caption via Telegram
   * @param {string} imagePath - Path to image file
   * @param {string} caption - Optional caption
   * @param {Object} reply_markup - Optional keyboard markup
   * @returns {Promise<Object>} Message result
   */
  async sendPhoto(imagePath, caption = '', reply_markup = null) {
    const config = this._getConfig();
    
    if (!config.telegram_bot_token || !config.telegram_chat_id) {
      this.logger.eprint('[telegram] Telegram not configured');
      return null;
    }

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    const boundary = '----TelegramFormBoundary' + Date.now();
    const imageData = fs.readFileSync(imagePath);
    
    // Build multipart form data
    const parts = [];
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="chat_id"\r\n\r\n`);
    parts.push(`${config.telegram_chat_id}\r\n`);
    
    if (caption) {
      // Truncate caption if too long (Telegram limit is 1024 for photos)
      const truncatedCaption = caption.length > 1021 ? 
        caption.substring(0, 1021) + '...' : caption;
      
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="caption"\r\n\r\n`);
      parts.push(`${truncatedCaption}\r\n`);
      
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="parse_mode"\r\n\r\n`);
      parts.push(`Markdown\r\n`);
    }
    
    if (reply_markup) {
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="reply_markup"\r\n\r\n`);
      parts.push(`${JSON.stringify(reply_markup)}\r\n`);
    }
    
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="photo"; filename="${path.basename(imagePath)}"\r\n`);
    parts.push(`Content-Type: image/png\r\n\r\n`);
    
    const textParts = Buffer.from(parts.join(''));
    const endBoundary = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([textParts, imageData, endBoundary]);
    
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${config.telegram_bot_token}/sendPhoto`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      },
      timeout: 30000
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.ok) {
              this.logger.debugLog('TELEGRAM_SEND', 'Photo sent', {
                message_id: response.result.message_id,
                has_photo: !!response.result.photo
              });
              resolve(response.result);
            } else {
              const error = new Error(response.description || 'Failed to send photo');
              error.error_code = response.error_code;
              reject(error);
            }
          } catch (e) {
            reject(new Error('Invalid JSON response from Telegram'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Photo upload timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Send a document via Telegram
   * @param {string} filePath - Path to document file
   * @param {string} caption - Optional caption
   * @param {Object} reply_markup - Optional keyboard markup
   * @returns {Promise<Object>} Message result
   */
  async sendDocument(filePath, caption = '', reply_markup = null) {
    const config = this._getConfig();
    
    if (!config.telegram_bot_token || !config.telegram_chat_id) {
      this.logger.eprint('[telegram] Telegram not configured');
      return null;
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Document file not found: ${filePath}`);
    }

    const boundary = '----TelegramFormBoundary' + Date.now();
    const fileData = fs.readFileSync(filePath);
    
    // Build multipart form data
    const parts = [];
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="chat_id"\r\n\r\n`);
    parts.push(`${config.telegram_chat_id}\r\n`);
    
    if (caption) {
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="caption"\r\n\r\n`);
      parts.push(`${caption}\r\n`);
      
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="parse_mode"\r\n\r\n`);
      parts.push(`Markdown\r\n`);
    }
    
    if (reply_markup) {
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="reply_markup"\r\n\r\n`);
      parts.push(`${JSON.stringify(reply_markup)}\r\n`);
    }
    
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="document"; filename="${path.basename(filePath)}"\r\n`);
    parts.push(`Content-Type: application/octet-stream\r\n\r\n`);
    
    const textParts = Buffer.from(parts.join(''));
    const endBoundary = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([textParts, fileData, endBoundary]);
    
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${config.telegram_bot_token}/sendDocument`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      },
      timeout: 30000
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.ok) {
              this.logger.debugLog('TELEGRAM_SEND', 'Document sent', {
                message_id: response.result.message_id,
                filename: response.result.document?.file_name
              });
              resolve(response.result);
            } else {
              const error = new Error(response.description || 'Failed to send document');
              error.error_code = response.error_code;
              reject(error);
            }
          } catch (e) {
            reject(new Error('Invalid JSON response from Telegram'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Document upload timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Create inline keyboard markup
   * @param {Array<Array<Object>>} buttons - Button configuration
   * @returns {Object} Keyboard markup object
   */
  createKeyboard(buttons) {
    return {
      inline_keyboard: buttons
    };
  }

  /**
   * Escape text for Markdown formatting
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
}

// Export the class
module.exports = { TelegramService };

// Backward compatibility: Export individual functions if needed
module.exports.createTelegramService = (configManager, logger) => {
  return new TelegramService(configManager, logger);
};