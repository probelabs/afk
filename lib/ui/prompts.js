/**
 * Prompts module for afk binary
 * Handles interactive user prompts and setup wizards
 */

const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');

/**
 * Prompts Service class for interactive user interface operations
 */
class PromptsService {
  /**
   * Initialize Prompts service
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {TelegramService} telegramService - Telegram service instance
   * @param {Logger} logger - Logger instance
   * @param {Utils} utils - Utils instance
   */
  constructor(configManager, telegramService, logger, utils) {
    this.configManager = configManager;
    this.telegramService = telegramService;
    this.logger = logger;
    this.utils = utils;
  }

  /**
   * Generic prompt for a line of input
   * @param {string} question - Question to ask user
   * @param {Object} opts - Options for prompt (mask, etc.)
   * @returns {Promise<string>} User's response
   */
  async promptLine(question, opts = {}) {
    const { mask = false } = opts;
    const readline = require('readline');
    let muted = false;
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: new Writable({
        write(chunk, encoding, cb) {
          if (!mask || !muted) {
            process.stdout.write(chunk, encoding);
          } else {
            process.stdout.write('*'.repeat(String(chunk).length));
          }
          cb();
        }
      }),
      terminal: true
    });

    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close();
        process.stdout.write('\n');
        resolve(answer);
      });
      if (mask) {
        muted = true;
      }
    });
  }

  /**
   * Prompt for Telegram bot token with masking
   * @returns {Promise<string|null>} Bot token or null if cancelled
   */
  async promptForToken() {
    const token = await this.promptLine('Enter Telegram bot token (from @BotFather): ', { mask: true });
    return token.trim() || null;
  }

  /**
   * Prompt for mode selection
   * @returns {Promise<string>} Selected mode ('remote' or 'local')
   */
  async promptForMode() {
    console.log('Select AFK mode:');
    console.log('  1) local   (Claude UI prompts)');
    console.log('  2) remote  (Telegram approvals)');
    const ans = (await this.promptLine('Select 1/2 [1]: ')).trim();
    return ans === '2' ? 'remote' : 'local';
  }

  /**
   * Confirm an action with the user
   * @param {string} message - Confirmation message
   * @param {boolean} defaultValue - Default value if user just presses Enter
   * @returns {Promise<boolean>} User's confirmation
   */
  async confirmAction(message, defaultValue = false) {
    const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
    const response = (await this.promptLine(`${message} ${defaultText}: `)).trim().toLowerCase();
    
    if (response === '') {
      return defaultValue;
    }
    
    return ['y', 'yes', 'true', '1'].includes(response);
  }

  /**
   * Show the setup wizard for configuring Telegram
   * @returns {Promise<boolean>} True if setup completed successfully
   */
  async showSetupWizard() {
    console.log('afk interactive setup');
    console.log('This will configure Telegram and write ~/.afk/config.json');

    // Get bot token
    const token = await this.promptForToken();
    if (!token) {
      console.log('Aborted: no token.');
      return false;
    }

    // Validate token and get bot info
    let me;
    try {
      me = await this.telegramService.tgApiWithToken(token, 'getMe', {});
    } catch (e) {
      console.log(`Could not validate token: ${e.message}`);
      return false;
    }

    const botUsername = me.username ? `@${me.username}` : '(unknown)';
    const link = me.username ? `https://t.me/${me.username}?start=afk` : 'Open your bot in Telegram and press Start';
    console.log(`Bot verified as ${botUsername}`);

    // Drain existing updates so we only watch for new messages
    try {
      const updates = await this.telegramService.tgApiWithToken(token, 'getUpdates', { timeout: 0 }, { timeoutMs: 10000 });
      if (Array.isArray(updates) && updates.length) {
        const last = updates[updates.length - 1].update_id;
        await this.telegramService.tgApiWithToken(token, 'getUpdates', { offset: last + 1, timeout: 0 }, { timeoutMs: 10000 });
      }
    } catch (_) {
      // Ignore errors during update draining
    }

    // Get chat ID
    console.log('Now link your chat:');
    console.log(`  1) Open: ${link}`);
    console.log('  2) Press Start and send any message to the bot.');
    await this.promptLine('Press Enter after sending a message...');

    let chatId = null;
    const deadline = Date.now() + 120000; // up to 2 minutes
    let offset = 0;
    
    while (!chatId && Date.now() < deadline) {
      try {
        const updates = await this.telegramService.tgApiWithToken(token, 'getUpdates', { timeout: 50, offset }, { timeoutMs: 60000 });
        for (const u of updates) {
          offset = u.update_id + 1;
          const m = u.message;
          if (m && m.chat && m.chat.type === 'private') {
            chatId = String(m.chat.id);
            break;
          }
        }
      } catch (e) {
        this.logger.eprint('Polling error:', e.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!chatId) {
      console.log('Could not detect your chat automatically.');
      const maybe = await this.promptLine('Paste your numeric chat ID (or leave empty to cancel): ');
      if (maybe) {
        chatId = maybe.trim();
      }
    }

    if (!chatId) {
      console.log('Aborted without chat ID. You can re-run `afk setup` later.');
      return false;
    }

    // Save configuration
    const userConfigPath = this.configManager.configPath;
    const current = this.configManager.loadJson(userConfigPath, {});
    
    current.telegram_bot_token = token;
    current.telegram_chat_id = chatId;
    current.timeout_seconds = current.timeout_seconds || 3600;
    current.timeout_action = current.timeout_action || 'deny';
    current.intercept_matcher = current.intercept_matcher || 'Bash|Edit|Write|MultiEdit|WebFetch|mcp__.*';
    current.auto_approve_tools = current.auto_approve_tools || ['Read'];
    current.respect_claude_permissions = true;
    
    this.configManager.saveJson(userConfigPath, current);

    // Test connection
    try {
      await this.telegramService.tgApiWithToken(token, 'sendMessage', {
        chat_id: chatId,
        text: '✅ afk is linked. You will receive approvals here.'
      });
      console.log('Saved config and sent a test message.');
      return true;
    } catch (e) {
      console.log(`Saved config, but failed to send test message: ${e.message}`);
      return true; // Config was still saved
    }
  }

  /**
   * Display tool approval interface (for future use)
   * @param {string} toolName - Name of tool requiring approval
   * @param {Object} toolInput - Input parameters for the tool
   * @param {string} context - Additional context information
   * @returns {Promise<string>} Approval decision ('allow', 'deny', 'ask')
   */
  async displayToolApproval(toolName, toolInput, context = '') {
    console.log('\n--- Tool Approval Required ---');
    console.log(`Tool: ${toolName}`);
    console.log(`Context: ${context}`);
    console.log('Tool Input:', JSON.stringify(toolInput, null, 2));
    
    console.log('\nOptions:');
    console.log('  1) Allow');
    console.log('  2) Deny');
    console.log('  3) Ask via Telegram');
    
    const choice = await this.promptLine('Select 1/2/3 [3]: ');
    
    switch (choice.trim()) {
      case '1':
        return 'allow';
      case '2':
        return 'deny';
      default:
        return 'ask';
    }
  }

  /**
   * Format tool details for display
   * @param {string} toolName - Name of the tool
   * @param {Object} toolInput - Tool input parameters
   * @returns {string} Formatted tool details
   */
  formatToolDetails(toolName, toolInput) {
    let details = `Tool: ${toolName}\n`;
    
    // Format common tool inputs
    if (toolInput.command) {
      details += `Command: ${toolInput.command}\n`;
    }
    if (toolInput.file_path || toolInput.filePath) {
      details += `File: ${toolInput.file_path || toolInput.filePath}\n`;
    }
    if (toolInput.pattern) {
      details += `Pattern: ${toolInput.pattern}\n`;
    }
    if (toolInput.url) {
      details += `URL: ${toolInput.url}\n`;
    }
    
    return details;
  }

  /**
   * Show diff preview for file operations
   * @param {string} filePath - Path to the file being modified
   * @param {string} operation - Type of operation (Edit, Write, etc.)
   * @param {string} changes - Preview of changes
   */
  showDiffPreview(filePath, operation, changes) {
    console.log('\n--- Diff Preview ---');
    console.log(`Operation: ${operation}`);
    console.log(`File: ${filePath}`);
    console.log('Changes:');
    console.log(changes);
    console.log('--- End Preview ---\n');
  }

  /**
   * Prompt for installation scope selection
   * @returns {Promise<string>} Selected scope ('user', 'project', 'local')
   */
  async promptScope() {
    console.log('  1) user   (applies everywhere)');
    console.log('  2) project(checked in)');
    console.log('  3) local  (project, not checked in)');
    const ans = (await this.promptLine('Select 1/2/3 [1]: ')).trim();
    if (ans === '2') return 'project';
    if (ans === '3') return 'local';
    return 'user';
  }

  /**
   * Prompt for project root path
   * @returns {Promise<string>} Absolute path to project root
   */
  async promptProjectRoot() {
    const def = process.cwd();
    while (true) {
      const p = (await this.promptLine(`Project root path [${def}]: `)).trim() || def;
      try {
        const abs = path.resolve(p);
        if (fs.existsSync(abs)) {
          return abs;
        }
        console.log('Path does not exist. Please try again.');
      } catch (e) {
        console.log('Invalid path. Please try again.');
      }
    }
  }

  /**
   * Wait for inbox event (blocking operation)
   * @param {Object} options - Wait options
   * @returns {Object|null} Event data or null if timeout
   */
  waitForInboxEvent({ sessionId, kinds = ['reply', 'continue'], timeout = 21600 }) {
    const start = Date.now();
    const historyPath = this.configManager.historyPath;
    
    while (Date.now() - start < timeout * 1000) {
      const events = this.readHistorySince(historyPath, start, (ev) => 
        ev.session_id === sessionId && kinds.includes(ev.type)
      );
      if (events.length) {
        return events[0];
      }
      // Sleep for 1 second without busy loop
      const int32 = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(int32, 0, 0, 1000);
    }
    return null;
  }

  /**
   * Read history events since a timestamp
   * @param {string} historyPath - Path to history file
   * @param {number} ts - Timestamp to read from
   * @param {Function} filterFn - Optional filter function
   * @returns {Array} Filtered events
   */
  readHistorySince(historyPath, ts, filterFn) {
    try {
      if (!fs.existsSync(historyPath)) {
        return [];
      }
      
      const lines = fs.readFileSync(historyPath, 'utf8').trim().split('\n').filter(Boolean);
      const events = [];
      
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (!ts || ev.ts >= ts) {
            events.push(ev);
          }
        } catch (_) {
          // Ignore malformed JSON lines
        }
      }
      
      return filterFn ? events.filter(filterFn) : events;
    } catch (e) {
      return [];
    }
  }
}

// Functional exports for backward compatibility
function promptLine(question, opts = {}) {
  const prompts = new PromptsService(null, null, null, null);
  return prompts.promptLine(question, opts);
}

function promptForToken() {
  const prompts = new PromptsService(null, null, null, null);
  return prompts.promptForToken();
}

function promptForMode() {
  const prompts = new PromptsService(null, null, null, null);
  return prompts.promptForMode();
}

function confirmAction(message, defaultValue = false) {
  const prompts = new PromptsService(null, null, null, null);
  return prompts.confirmAction(message, defaultValue);
}

function showSetupWizard(telegramService, configManager, logger) {
  const prompts = new PromptsService(configManager, telegramService, logger, null);
  return prompts.showSetupWizard();
}

function displayToolApproval(toolName, toolInput, context = '') {
  const prompts = new PromptsService(null, null, null, null);
  return prompts.displayToolApproval(toolName, toolInput, context);
}

function formatToolDetails(toolName, toolInput) {
  const prompts = new PromptsService(null, null, null, null);
  return prompts.formatToolDetails(toolName, toolInput);
}

function showDiffPreview(filePath, operation, changes) {
  const prompts = new PromptsService(null, null, null, null);
  prompts.showDiffPreview(filePath, operation, changes);
}

function promptScope() {
  const prompts = new PromptsService(null, null, null, null);
  return prompts.promptScope();
}

function promptProjectRoot() {
  const prompts = new PromptsService(null, null, null, null);
  return prompts.promptProjectRoot();
}

function waitForInboxEvent(options) {
  const prompts = new PromptsService(null, null, null, null);
  return prompts.waitForInboxEvent(options);
}

module.exports = {
  PromptsService,
  // Functional exports
  promptLine,
  promptForToken,
  promptForMode,
  confirmAction,
  showSetupWizard,
  displayToolApproval,
  formatToolDetails,
  showDiffPreview,
  promptScope,
  promptProjectRoot,
  waitForInboxEvent
};