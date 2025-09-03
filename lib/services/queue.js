#!/usr/bin/env node
/**
 * Queue Service Module
 * Handles message queue operations with atomic claiming, distributed locking,
 * and JSONL persistence for multi-instance coordination.
 */

const fs = require('fs');
const path = require('path');

/**
 * QueueService class for message queue management
 * @class
 */
class QueueService {
  /**
   * Create a new QueueService instance
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance for debug output
   * @param {Utils} utils - Utils instance for file operations
   */
  constructor(configManager, logger, utils) {
    this.configManager = configManager;
    this.logger = logger;
    this.utils = utils;
    
    const afkDir = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.afk'
    );
    
    this.queueDir = path.join(afkDir, 'messages');
    this.globalQueuePath = path.join(this.queueDir, 'global.jsonl');
    this.processedQueuePath = path.join(this.queueDir, 'processed.jsonl');
    this.locksDir = path.join(this.queueDir, 'locks');
    
    this.initMessageQueue();
  }

  /**
   * Initialize the message queue directory structure
   * @returns {void}
   */
  initMessageQueue() {
    // Create directories if they don't exist
    if (!fs.existsSync(this.queueDir)) {
      fs.mkdirSync(this.queueDir, { recursive: true });
      this.logger.debugLog('QUEUE_INIT', 'Created queue directory', {
        path: this.queueDir
      });
    }
    
    if (!fs.existsSync(this.locksDir)) {
      fs.mkdirSync(this.locksDir, { recursive: true });
      this.logger.debugLog('QUEUE_INIT', 'Created locks directory', {
        path: this.locksDir
      });
    }
    
    // Create queue files if they don't exist
    if (!fs.existsSync(this.globalQueuePath)) {
      fs.writeFileSync(this.globalQueuePath, '');
      this.logger.debugLog('QUEUE_INIT', 'Created global queue file', {
        path: this.globalQueuePath
      });
    }
    
    if (!fs.existsSync(this.processedQueuePath)) {
      fs.writeFileSync(this.processedQueuePath, '');
      this.logger.debugLog('QUEUE_INIT', 'Created processed queue file', {
        path: this.processedQueuePath
      });
    }
  }

  /**
   * Append messages to the global queue
   * @param {Array<Object>} updates - Messages to append
   * @returns {void}
   */
  appendToGlobalQueue(updates) {
    if (!updates || updates.length === 0) return;
    
    this.initMessageQueue();
    const timestamp = new Date().toISOString();
    
    for (const update of updates) {
      const entry = {
        timestamp,
        update_id: update.update_id,
        update
      };
      fs.appendFileSync(this.globalQueuePath, JSON.stringify(entry) + '\n');
    }
    
    this.logger.debugLog('QUEUE_APPEND', 'Messages appended to queue', {
      count: updates.length,
      firstUpdateId: updates[0]?.update_id
    });
  }

  /**
   * Atomically claim a message from the queue (matches binary implementation)
   * @param {Function} filterFn - Function to filter messages
   * @param {string} hookId - Unique identifier for the claiming hook
   * @returns {Object|null} Claimed message or null
   */
  atomicClaimMessage(filterFn, hookId) {
    // Use file locking to atomically claim a message
    const lockFile = path.join(this.locksDir, 'message-claim.lock');
    
    try {
      this.utils.ensureDir(this.locksDir);
      
      // Try to acquire lock with timeout
      const maxAttempts = 50; // 50ms max wait
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          // Try to create lock file exclusively
          fs.writeFileSync(lockFile, `${hookId}:${Date.now()}`, { flag: 'wx' });
          break; // Lock acquired
        } catch (e) {
          if (e.code === 'EEXIST') {
            // Lock exists, wait 1ms and try again (synchronous)
            const start = Date.now();
            while (Date.now() - start < 1) { /* busy wait 1ms */ }
            continue;
          }
          throw e; // Other error
        }
        
        if (attempt === maxAttempts - 1) {
          // Couldn't acquire lock
          return null;
        }
      }
      
      // Lock acquired, now safely find and claim message
      const myMessages = this.getMyMessages(filterFn);
      if (myMessages.length > 0) {
        const message = myMessages[0];
        this.markUpdateAsProcessed(message.update_id, hookId);
        return message;
      }
      
      return null;
      
    } catch (e) {
      this.logger.error(`[${hookId}] Error in atomic claim:`, e.message);
      return null;
    } finally {
      // Always release lock
      try {
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Get all messages from the global queue
   * @returns {Array<Object>} All messages
   */
  getAllMessages() {
    if (!fs.existsSync(this.globalQueuePath)) {
      return [];
    }
    
    try {
      const content = fs.readFileSync(this.globalQueuePath, 'utf8');
      if (!content.trim()) return [];
      
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            this.logger.error('Failed to parse queue line:', line);
            return null;
          }
        })
        .filter(msg => msg !== null);
    } catch (e) {
      this.logger.error('Failed to read global queue:', e.message);
      return [];
    }
  }

  /**
   * Get messages matching a filter (matches binary format)
   * @param {Function} filterFn - Filter function that takes entry.update
   * @returns {Array<Object>} Filtered message entries
   */
  getMyMessages(filterFn) {
    if (!fs.existsSync(this.globalQueuePath)) return [];
    
    const processed = this.getProcessedUpdateIds();
    const myMessages = [];
    
    try {
      const content = fs.readFileSync(this.globalQueuePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      for (const line of lines) {
        const entry = JSON.parse(line);
        
        // Skip already processed messages
        if (processed.has(entry.update_id)) continue;
        
        // Apply filter to see if this message is for me
        if (filterFn(entry.update)) {
          myMessages.push(entry);
        }
      }
    } catch (e) {
      this.logger.error('[queue] Error reading global queue:', e.message);
    }
    
    return myMessages;
  }

  /**
   * Get set of processed update IDs
   * @returns {Set<number>} Set of processed IDs
   */
  getProcessedUpdateIds() {
    const processedIds = new Set();
    
    if (!fs.existsSync(this.processedQueuePath)) {
      return processedIds;
    }
    
    try {
      const content = fs.readFileSync(this.processedQueuePath, 'utf8');
      if (!content.trim()) return processedIds;
      
      content
        .split('\n')
        .filter(line => line.trim())
        .forEach(line => {
          try {
            const entry = JSON.parse(line);
            if (entry.update_id) {
              processedIds.add(entry.update_id);
            }
          } catch (e) {
            // Skip invalid lines
          }
        });
    } catch (e) {
      this.logger.error('Failed to read processed queue:', e.message);
    }
    
    return processedIds;
  }

  /**
   * Get set of update IDs already in global queue (for deduplication)
   * @returns {Set<number>} Set of global queue IDs
   */
  getGlobalQueueUpdateIds() {
    const globalIds = new Set();
    
    if (!fs.existsSync(this.globalQueuePath)) {
      return globalIds;
    }
    
    try {
      const content = fs.readFileSync(this.globalQueuePath, 'utf8');
      if (!content.trim()) return globalIds;
      
      content
        .split('\n')
        .filter(line => line.trim())
        .forEach(line => {
          try {
            const entry = JSON.parse(line);
            if (entry.update_id) {
              globalIds.add(entry.update_id);
            }
          } catch (e) {
            // Skip invalid lines
          }
        });
    } catch (e) {
      this.logger.error('Failed to read global queue:', e.message);
    }
    
    return globalIds;
  }

  /**
   * Mark an update as processed
   * @param {number} updateId - Update ID to mark
   * @param {string} processedBy - Hook ID that processed it
   * @returns {void}
   */
  markUpdateAsProcessed(updateId, processedBy) {
    this.initMessageQueue();
    const entry = {
      timestamp: new Date().toISOString(),
      update_id: updateId,
      processed_by: processedBy
    };
    
    // Append to processed queue
    fs.appendFileSync(this.processedQueuePath, JSON.stringify(entry) + '\n');
    
    this.logger.debugLog('QUEUE_PROCESSED', 'Update marked as processed', {
      updateId,
      processedBy
    });
  }

  /**
   * Clean up old locks and messages
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   * @returns {number} Number of items cleaned
   */
  cleanup(maxAgeMs = 60 * 60 * 1000) {
    let cleaned = 0;
    const now = Date.now();
    
    // Clean old locks
    if (fs.existsSync(this.locksDir)) {
      const locks = fs.readdirSync(this.locksDir);
      for (const lockFile of locks) {
        const lockPath = path.join(this.locksDir, lockFile);
        try {
          const stat = fs.statSync(lockPath);
          if (now - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(lockPath);
            cleaned++;
          }
        } catch (e) {
          // Skip if can't access
        }
      }
    }
    
    // TODO: Clean old messages from queues (requires rewriting files)
    
    if (cleaned > 0) {
      this.logger.debugLog('QUEUE_CLEANUP', 'Old items cleaned', {
        cleaned,
        maxAgeMs
      });
    }
    
    return cleaned;
  }

  /**
   * Clear all queue data (for testing)
   * @returns {void}
   */
  clearAll() {
    // Clear queue files
    if (fs.existsSync(this.globalQueuePath)) {
      fs.writeFileSync(this.globalQueuePath, '');
    }
    
    if (fs.existsSync(this.processedQueuePath)) {
      fs.writeFileSync(this.processedQueuePath, '');
    }
    
    // Remove all locks
    if (fs.existsSync(this.locksDir)) {
      const locks = fs.readdirSync(this.locksDir);
      for (const lockFile of locks) {
        try {
          fs.unlinkSync(path.join(this.locksDir, lockFile));
        } catch (e) {
          // Skip if can't remove
        }
      }
    }
    
    this.logger.debugLog('QUEUE_CLEAR', 'All queue data cleared');
  }

  /**
   * Try to acquire a lock with timeout
   * @param {string} lockName - Name of the lock
   * @param {number} timeoutMs - Maximum wait time (default: 50ms)
   * @returns {boolean} True if lock acquired
   */
  acquireLock(lockName, timeoutMs = 50) {
    const lockPath = path.join(this.locksDir, lockName);
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        // Try to create lock file exclusively
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeSync(fd, JSON.stringify({
          timestamp: Date.now(),
          pid: process.pid
        }));
        fs.closeSync(fd);
        
        return true;
      } catch (e) {
        if (e.code === 'EEXIST') {
          // Lock exists, wait a bit and retry
          // Busy wait for 1ms
          const waitUntil = Date.now() + 1;
          while (Date.now() < waitUntil) {
            // Busy wait
          }
        } else {
          // Other error
          this.logger.error('Failed to acquire lock:', e.message);
          return false;
        }
      }
    }
    
    return false;
  }

  /**
   * Release a lock
   * @param {string} lockName - Name of the lock
   * @returns {void}
   */
  releaseLock(lockName) {
    const lockPath = path.join(this.locksDir, lockName);
    
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch (e) {
      this.logger.error('Failed to release lock:', e.message);
    }
  }

  /**
   * Distributed telegram polling with message claiming (matches binary implementation)
   * @param {Function} filterFn - Function to filter relevant updates
   * @param {string} hookId - Unique hook identifier
   * @param {string} sessionId - Claude session ID  
   * @param {number} timeoutMs - Maximum polling time in milliseconds
   * @param {Object} dependencies - Required dependencies (telegramService, sessionsService, readMode)
   * @returns {Promise<Object|null>} Update or null if cancelled
   */
  async distributedTelegramPoll(filterFn, hookId, sessionId, timeoutMs = 21600000, dependencies = {}) {
    const { telegramService, sessionsService, readMode } = dependencies;
    
    if (!telegramService) {
      throw new Error('telegramService dependency required for distributedTelegramPoll');
    }
    
    this.logger.eprint(`[${hookId}] Starting distributed polling for session ${sessionId}...`);
    
    const token = this.configManager.cfg().telegram_bot_token;
    if (!token) {
      throw new Error('No Telegram bot token configured');
    }
    
    let lastUpdateId = 0;
    const startTime = Date.now();
    let lastAbandonedCheck = 0;
    let pollDelayMs = 100; // Start with fast polling
    let consecutiveEmptyPolls = 0;
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        // Check if mode switched to local - if so, exit polling
        if (readMode && readMode() === 'local') {
          this.logger.eprint(`[${hookId}] Mode switched to local - exiting polling`);
          // Allow the hook to exit gracefully (Claude will proceed with local permissions)
          return null;
        }
        
        // Get updates with offset to avoid conflicts with other pollers
        const updates = await telegramService.tgApiWithToken(token, 'getUpdates', {
          offset: lastUpdateId + 1,
          limit: 10,
          timeout: 1 // Very short timeout for maximum responsiveness (was 5)
        });
        
        if (updates.length > 0) {
          // Update our last seen ID
          lastUpdateId = Math.max(...updates.map(u => u.update_id));
          
          // Filter out messages we've already seen to prevent duplicates
          const existingIds = this.getProcessedUpdateIds();
          const existingGlobalIds = this.getGlobalQueueUpdateIds();
          const newUpdates = updates.filter(u => 
            !existingIds.has(u.update_id) && !existingGlobalIds.has(u.update_id)
          );
          
          if (newUpdates.length > 0) {
            // Dump only NEW messages to global queue
            this.appendToGlobalQueue(newUpdates);
            this.logger.eprint(`[${hookId}] Dumped ${newUpdates.length} new messages to global queue (${updates.length - newUpdates.length} duplicates skipped)`);
          } else {
            this.logger.eprint(`[${hookId}] All ${updates.length} messages were duplicates, skipping`);
          }
        }
        
        // Atomically claim a message for this hook
        const claimedMessage = this.atomicClaimMessage(filterFn, hookId);
        if (claimedMessage) {
          this.logger.eprint(`[${hookId}] Claimed message ${claimedMessage.update_id}`);
          return claimedMessage.update;
        }
        
        // Adaptive polling: speed up when we get messages, slow down when idle
        if (updates.length > 0) {
          // Got messages, poll quickly
          pollDelayMs = 50;
          consecutiveEmptyPolls = 0;
        } else {
          consecutiveEmptyPolls++;
          // Gradually slow down polling if no messages (max 500ms)
          pollDelayMs = Math.min(500, 50 + (consecutiveEmptyPolls * 50));
        }
        
        // Check for abandoned sessions every 60 seconds
        const now = Date.now();
        if (now - lastAbandonedCheck > 60000 && sessionsService) {
          const abandonedSessions = sessionsService.checkAbandonedSessions();
          for (const session of abandonedSessions) {
            // Note: notifyAbandonedSession would need to be implemented
            // await this.notifyAbandonedSession(session);
            sessionsService.removeActiveSession(session.sessionId);
          }
          lastAbandonedCheck = now;
        }
        
        // Update session heartbeat to indicate we're still polling
        if (sessionId && sessionsService) {
          sessionsService.updateSessionActivity(sessionId);
        }
        
        // Adaptive pause to prevent hammering the API
        await new Promise(resolve => setTimeout(resolve, pollDelayMs));
        
      } catch (e) {
        this.logger.eprint(`[${hookId}] Polling error:`, e.message);
        // Reduced error recovery delay from 2000ms to 500ms for better responsiveness
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    throw new Error(`[${hookId}] Polling timeout after ${timeoutMs}ms`);
  }
}

// Export the class
module.exports = { QueueService };

// Backward compatibility: Export factory function
module.exports.createQueueService = (configManager, logger, utils) => {
  return new QueueService(configManager, logger, utils);
};