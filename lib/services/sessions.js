#!/usr/bin/env node
/**
 * Sessions Service Module
 * Handles session lifecycle management including tracking, heartbeat updates,
 * abandoned session detection, and persistence.
 */

const fs = require('fs');
const path = require('path');

/**
 * SessionsService class for session management
 * @class
 */
class SessionsService {
  /**
   * Create a new SessionsService instance
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance for debug output
   * @param {Utils} utils - Utils instance for file operations
   */
  constructor(configManager, logger, utils) {
    this.configManager = configManager;
    this.logger = logger;
    this.utils = utils;
    this.activeSessionsPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.afk',
      'active-sessions.json'
    );
    this.sessionMapPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.afk',
      'session-map.json'
    );
    this.replyLockPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.afk',
      'reply-lock.json'
    );
    this.historyPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.afk',
      'history.jsonl'
    );
  }

  /**
   * Track an active session
   * @param {string} sessionId - Unique session identifier
   * @param {string} toolCall - Tool call summary
   * @param {Object} metadata - Additional session metadata
   * @returns {void}
   */
  trackActiveSession(sessionId, toolCall, metadata = {}) {
    const sessions = this._loadActiveSessions();
    
    sessions[sessionId] = {
      toolCall,
      metadata,
      startTime: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };
    
    this._saveActiveSessions(sessions);
    
    this.logger.debugLog('SESSION_TRACK', 'Session tracked', {
      sessionId,
      toolCall,
      hasMetadata: !!metadata
    });
  }

  /**
   * Update session activity timestamp (heartbeat)
   * @param {string} sessionId - Session to update
   * @returns {void}
   */
  updateSessionActivity(sessionId) {
    const sessions = this._loadActiveSessions();
    
    if (sessions[sessionId]) {
      sessions[sessionId].lastActivity = new Date().toISOString();
      this._saveActiveSessions(sessions);
      
      this.logger.debugLog('SESSION_HEARTBEAT', 'Activity updated', {
        sessionId,
        lastActivity: sessions[sessionId].lastActivity
      });
    }
  }

  /**
   * Remove an active session
   * @param {string} sessionId - Session to remove
   * @returns {boolean} True if session was removed
   */
  removeActiveSession(sessionId) {
    const sessions = this._loadActiveSessions();
    
    if (sessions[sessionId]) {
      delete sessions[sessionId];
      this._saveActiveSessions(sessions);
      
      this.logger.debugLog('SESSION_REMOVE', 'Session removed', {
        sessionId
      });
      
      return true;
    }
    
    return false;
  }

  /**
   * Get all active sessions
   * @returns {Object} Active sessions object
   */
  getActiveSessions() {
    return this._loadActiveSessions();
  }

  /**
   * Check for abandoned sessions based on heartbeat timeout
   * @param {number} timeoutSeconds - Seconds before considering abandoned (default: 10)
   * @returns {Array<Object>} Array of abandoned session info
   */
  checkAbandonedSessions(timeoutSeconds = 10) {
    const sessions = this._loadActiveSessions();
    const abandonedSessions = [];
    const now = new Date();
    
    for (const [sessionId, session] of Object.entries(sessions)) {
      const lastActivity = new Date(session.lastActivity);
      const timeSinceActivity = (now - lastActivity) / 1000; // seconds
      
      if (timeSinceActivity > timeoutSeconds) {
        abandonedSessions.push({
          sessionId,
          ...session,
          timeSinceActivity
        });
        
        this.logger.debugLog('SESSION_ABANDONED', 'Session detected as abandoned', {
          sessionId,
          timeSinceActivity,
          timeoutSeconds
        });
      }
    }
    
    return abandonedSessions;
  }

  /**
   * Load session map
   * @returns {Object} Session map object
   */
  loadSessionMap() {
    if (!fs.existsSync(this.sessionMapPath)) {
      const defaultMap = { messages: {}, latest_per_chat: {} };
      this.saveSessionMap(defaultMap);
      return defaultMap;
    }
    
    try {
      const data = fs.readFileSync(this.sessionMapPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      this.logger.error('Failed to load session map:', e.message);
      const defaultMap = { messages: {}, latest_per_chat: {} };
      this.saveSessionMap(defaultMap);
      return defaultMap;
    }
  }

  /**
   * Save session map
   * @param {Object} map - Session map to save
   * @returns {void}
   */
  saveSessionMap(map) {
    // Ensure directory exists
    const dir = path.dirname(this.sessionMapPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Atomic write
    const tempPath = this.sessionMapPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(map, null, 2));
    fs.renameSync(tempPath, this.sessionMapPath);
    
    this.logger.debugLog('SESSION_MAP', 'Session map saved', {
      messageCount: Object.keys(map.messages || {}).length
    });
  }

  /**
   * Map a message to a session
   * @param {string} messageId - Message identifier
   * @param {Object} sessionInfo - Session information
   * @returns {void}
   */
  mapMessageToSession(messageId, sessionInfo) {
    const map = this.loadSessionMap();
    
    if (!map.messages) map.messages = {};
    map.messages[messageId] = sessionInfo;
    
    if (sessionInfo.chat_id) {
      if (!map.latest_per_chat) map.latest_per_chat = {};
      map.latest_per_chat[sessionInfo.chat_id] = {
        session_id: sessionInfo.session_id,
        timestamp: Date.now()
      };
    }
    
    this.saveSessionMap(map);
    
    this.logger.debugLog('SESSION_MAP', 'Message mapped to session', {
      messageId,
      sessionId: sessionInfo.session_id
    });
  }

  /**
   * Get session for a message
   * @param {string} messageId - Message identifier
   * @returns {Object|null} Session info or null
   */
  getSessionForMessage(messageId) {
    const map = this.loadSessionMap();
    return map.messages?.[messageId] || null;
  }

  /**
   * Get latest session for a chat
   * @param {string} chatId - Chat identifier
   * @returns {Object|null} Latest session info or null
   */
  getLatestSessionForChat(chatId) {
    const map = this.loadSessionMap();
    return map.latest_per_chat?.[chatId] || null;
  }

  /**
   * Clean up old session mappings
   * @param {number} maxAgeHours - Maximum age in hours (default: 24)
   * @returns {number} Number of entries cleaned
   */
  cleanupOldMappings(maxAgeHours = 24) {
    const map = this.loadSessionMap();
    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    let cleaned = 0;
    
    // Clean old messages
    if (map.messages) {
      for (const [messageId, info] of Object.entries(map.messages)) {
        if (info.timestamp && info.timestamp < cutoff) {
          delete map.messages[messageId];
          cleaned++;
        }
      }
    }
    
    // Clean old chat sessions
    if (map.latest_per_chat) {
      for (const [chatId, info] of Object.entries(map.latest_per_chat)) {
        if (info.timestamp && info.timestamp < cutoff) {
          delete map.latest_per_chat[chatId];
          cleaned++;
        }
      }
    }
    
    if (cleaned > 0) {
      this.saveSessionMap(map);
      this.logger.debugLog('SESSION_CLEANUP', 'Old mappings cleaned', {
        cleaned,
        maxAgeHours
      });
    }
    
    return cleaned;
  }

  /**
   * Load active sessions from file
   * @private
   * @returns {Object} Active sessions
   */
  _loadActiveSessions() {
    if (!fs.existsSync(this.activeSessionsPath)) {
      return {};
    }
    
    try {
      const data = fs.readFileSync(this.activeSessionsPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      this.logger.error('Failed to load active sessions:', e.message);
      return {};
    }
  }

  /**
   * Save active sessions to file
   * @private
   * @param {Object} sessions - Sessions to save
   * @returns {void}
   */
  _saveActiveSessions(sessions) {
    // Ensure directory exists
    const dir = path.dirname(this.activeSessionsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Atomic write
    const tempPath = this.activeSessionsPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(sessions, null, 2));
    fs.renameSync(tempPath, this.activeSessionsPath);
  }

  /**
   * Remember message mapping (matches binary implementation)
   * @param {string} messageId - Telegram message ID
   * @param {Object} mapping - Mapping information
   * @returns {void}
   */
  rememberMessageMapping(messageId, mapping) {
    const map = this.loadSessionMap();
    map.messages[String(messageId)] = { ...mapping };
    if (mapping.chat_id && mapping.session_id) {
      map.latest_per_chat[String(mapping.chat_id)] = mapping.session_id;
    }
    this.saveSessionMap(map);
  }

  /**
   * Look up session by message ID (matches binary implementation)
   * @param {string} messageId - Telegram message ID
   * @returns {Object|null} Session mapping or null
   */
  lookupSessionByMessageId(messageId) {
    const map = this.loadSessionMap();
    return map.messages[String(messageId)] || null;
  }

  /**
   * Set reply lock for session ownership (matches binary implementation)
   * @param {string} sessionId - Session ID
   * @param {string} messageId - Message ID
   * @returns {void}
   */
  setReplyLock(sessionId, messageId) {
    const lock = {
      sessionId,
      messageId,
      timestamp: Date.now()
      // No expiration - lock persists until explicitly cleared or taken by another session
    };
    try {
      fs.writeFileSync(this.replyLockPath, JSON.stringify(lock, null, 2));
      this.logger.eprint(`🔒 [afk] Session ${sessionId.substring(0, 8)} now owns next message`);
    } catch (e) {
      this.logger.eprint('[reply-lock] Failed to set lock:', e.message);
    }
  }

  /**
   * Get current reply lock (matches binary implementation)
   * @returns {Object|null} Current lock or null
   */
  getReplyLock() {
    try {
      if (!fs.existsSync(this.replyLockPath)) return null;
      const lock = JSON.parse(fs.readFileSync(this.replyLockPath, 'utf8'));
      
      // No expiration check - lock persists until explicitly managed
      return lock;
    } catch (e) {
      this.logger.eprint('[reply-lock] Failed to read lock:', e.message);
      return null;
    }
  }

  /**
   * Clear reply lock (matches binary implementation)
   * @returns {void}
   */
  clearReplyLock() {
    try {
      if (fs.existsSync(this.replyLockPath)) {
        fs.unlinkSync(this.replyLockPath);
        this.logger.eprint(`🔓 [afk] Reply lock cleared`);
      }
    } catch (e) {
      this.logger.eprint('[reply-lock] Failed to clear lock:', e.message);
    }
  }

  /**
   * Check if message belongs to session (matches binary implementation)
   * @param {string} sessionId - Session ID
   * @param {Object} message - Telegram message object
   * @returns {boolean} True if message belongs to session
   */
  isMyMessage(sessionId, message) {
    const lock = this.getReplyLock();
    
    // If no lock, any session can take messages (backward compatibility)
    if (!lock) return true;
    
    // If this session owns the lock, it can take the message
    if (lock.sessionId === sessionId) {
      this.logger.eprint(`✅ [afk] Session ${sessionId.substring(0, 8)} owns this message`);
      return true;
    }
    
    // Check if message is a reply to the specific locked message
    if (message.reply_to_message && message.reply_to_message.message_id === lock.messageId) {
      this.logger.eprint(`✅ [afk] Message is reply to locked message ${lock.messageId}`);
      return true;
    }
    
    this.logger.eprint(`🚫 [afk] Session ${sessionId.substring(0, 8)} cannot take message - owned by ${lock.sessionId.substring(0, 8)}`);
    return false;
  }

  /**
   * Append an event to the history log
   * @param {Object} event - Event object to log
   * @returns {void}
   */
  appendHistory(event) {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const enriched = { ts: Date.now(), ...event };
      fs.appendFileSync(this.historyPath, JSON.stringify(enriched) + '\n');
      
      // Trim to last 200 lines if file grows too big
      const data = fs.readFileSync(this.historyPath, 'utf8').split('\n');
      if (data.length > 400) {
        const trimmed = data.slice(-200).join('\n');
        fs.writeFileSync(this.historyPath, trimmed.endsWith('\n') ? trimmed : trimmed + '\n');
      }
    } catch (e) {
      this.logger.eprint('[history] failed to write:', e.message);
    }
  }
}

// Export the class
module.exports = { SessionsService };

// Backward compatibility: Export factory function
module.exports.createSessionsService = (configManager, logger, utils) => {
  return new SessionsService(configManager, logger, utils);
};