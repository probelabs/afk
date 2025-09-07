/**
 * CLI module for afk binary
 * Handles command line argument parsing and display formatting
 */

const fs = require('fs');
const path = require('path');

/**
 * CLI Service class for command line interface operations
 */
class CLIService {
  /**
   * Initialize CLI service
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance
   * @param {Utils} utils - Utils instance
   */
  constructor(configManager, logger, utils) {
    this.configManager = configManager;
    this.logger = logger;
    this.utils = utils;
  }

  /**
   * Parse command line arguments into structured data
   * @param {string[]} argv - Process arguments array
   * @returns {Object} Parsed command structure
   */
  parseCommandLine(argv = []) {
    const cmd = argv[0];
    const subcmd = argv[1];
    
    // Parse flags
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
      if (argv[i].startsWith('--') && i + 1 < argv.length) {
        const flagName = argv[i].substring(2);
        const flagValue = argv[i + 1];
        if (!flagValue.startsWith('--')) {
          flags[flagName] = flagValue;
        }
      }
    }

    return {
      command: cmd || null,
      subcommand: subcmd || null,
      flags,
      rawArgs: argv
    };
  }

  /**
   * Show help text for the CLI
   */
  showHelp() {
    console.log(
`afk — Away From Keyboard + Telegram approvals

Smart Toggle:
  afk                    Smart toggle - installs if needed, otherwise toggles mode

Direct Commands:
  afk on                 Enable AFK mode (remote approvals)
  afk off                Disable AFK mode (local mode)
  afk toggle             Toggle between local and remote modes
  afk status             Show current AFK mode

Full Commands:
  install [--scope user|project|local] [--project-root PATH]
      Install Claude Code hooks at the chosen scope (prompts if omitted).
  setup
      Interactive wizard to link your Telegram bot and chat.
  uninstall --scope user|project|local [--project-root PATH]
      Print removal instructions for that scope.
  mode [on|off|toggle|local|remote|status]
      Switch between LOCAL (no remote approvals) and REMOTE (Telegram approvals).
  debug [on|off|status]
      Enable/disable persistent debug logging to ~/.afk/debug.log
  telegram test
      Send a test message to verify Telegram connection.
  inbox wait --session <id> [--timeout 21600]
      Wait locally for a "reply" or "continue" event for that session.
  hook pretooluse|stop|sessionstart
      Internal entrypoints used by Claude Code hooks.

Examples:
  afk                    # Smart toggle: install or toggle mode
  afk on                 # Enable remote mode
  afk off                # Enable local mode
  afk install            # Install hooks
  afk telegram test      # Test Telegram connection`);
  }

  /**
   * Show current status of AFK mode
   * @param {string} mode - Current mode ('remote' or 'local')
   */
  showStatus(mode) {
    this.showModeExplanation(mode);
  }

  /**
   * Show debug status information
   * @param {boolean} enabled - Whether debug mode is enabled
   * @param {string} logPath - Path to debug log file
   */
  showDebugStatus(enabled, logPath) {
    console.log(`Debug mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    if (enabled) {
      console.log(`Debug log: ${logPath}`);
    }
  }

  /**
   * Format error message for display
   * @param {string} message - Error message
   * @param {Error} error - Optional error object
   * @returns {string} Formatted error message
   */
  formatError(message, error = null) {
    if (error) {
      return `❌ ${message}: ${error.message}`;
    }
    return `❌ ${message}`;
  }

  /**
   * Format success message for display
   * @param {string} message - Success message
   * @returns {string} Formatted success message
   */
  formatSuccess(message) {
    return `✅ ${message}`;
  }

  /**
   * Main command dispatcher - routes commands to appropriate handlers
   * @param {Object} parsedCmd - Parsed command object
   * @param {Object} handlers - Object containing command handler functions
   * @returns {Promise<boolean>} True if command was handled, false otherwise
   */
  async handleCommand(parsedCmd, handlers = {}) {
    const { command, subcommand, flags } = parsedCmd;
    
    if (!command) {
      // Smart toggle behavior
      if (handlers.isInstalled && !handlers.isInstalled()) {
        console.log("Run 'afk install' to set up hooks");
        return true;
      }
      if (handlers.modeCommand) {
        handlers.modeCommand('toggle');
      }
      return true;
    }

    // Direct mode commands
    if (['on', 'off', 'readonly', 'toggle', 'status'].includes(command)) {
      if (handlers.modeCommand) {
        handlers.modeCommand(command);
      }
      return true;
    }

    // Main commands
    switch (command) {
      case 'install':
        if (handlers.install) {
          await handlers.install(flags.scope, flags['project-root']);
        }
        return true;
        
      case 'uninstall':
        if (handlers.uninstall) {
          handlers.uninstall(flags.scope);
        }
        return true;
        
      case 'setup':
        if (handlers.setup) {
          await handlers.setup();
        }
        return true;
        
      case 'mode':
        if (handlers.modeCommand) {
          handlers.modeCommand(subcommand || 'status');
        }
        return true;
        
      case 'debug':
        if (handlers.debug) {
          handlers.debug(subcommand);
        }
        return true;
        
      case 'telegram':
        if (handlers.telegram) {
          await handlers.telegram(subcommand);
        }
        return true;
        
      case 'hook':
        if (handlers.hook) {
          await handlers.hook(subcommand);
        }
        return true;
        
      case 'inbox':
        if (handlers.inbox) {
          await handlers.inbox(subcommand, flags.session, flags.timeout);
        }
        return true;
        
      default:
        this.showHelp();
        return false;
    }
  }

  /**
   * Validate command line arguments
   * @param {Object} parsedCmd - Parsed command object
   * @returns {Object} Validation result with success flag and errors
   */
  validateArguments(parsedCmd) {
    const { command, subcommand, flags } = parsedCmd;
    const errors = [];

    // Validate scope for install/uninstall
    if (['install', 'uninstall'].includes(command)) {
      if (flags.scope && !['user', 'project', 'local'].includes(flags.scope)) {
        errors.push('--scope must be one of: user, project, local');
      }
      if (command === 'uninstall' && !flags.scope) {
        errors.push('uninstall requires --scope flag');
      }
    }

    // Validate inbox wait command
    if (command === 'inbox' && subcommand === 'wait') {
      if (!flags.session) {
        errors.push('inbox wait requires --session <id>');
      }
      if (flags.timeout && isNaN(parseInt(flags.timeout))) {
        errors.push('--timeout must be a number');
      }
    }

    // Validate hook commands
    if (command === 'hook') {
      if (!['pretooluse', 'stop', 'sessionstart'].includes(subcommand)) {
        errors.push('hook command must be one of: pretooluse, stop, sessionstart');
      }
    }

    // Validate telegram commands
    if (command === 'telegram') {
      if (!['test'].includes(subcommand)) {
        errors.push('telegram command must be: test');
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * Show mode explanation based on current mode
   * @param {string} mode - Current mode ('remote', 'local', or 'readonly')
   */
  showModeExplanation(mode) {
    if (mode === 'remote') {
      console.log('AFK mode: REMOTE — All permissioned tool calls require Telegram approval.');
      console.log('Tip: Switch to local mode with `afk off` or read-only mode with `afk readonly`.');
    } else if (mode === 'readonly') {
      console.log('AFK mode: READ-ONLY — Get notifications for completed sessions without blocking.');
      console.log('Tip: Switch to remote mode with `afk on` or local mode with `afk off`.');
    } else {
      console.log("AFK mode: LOCAL — Tools run with Claude's normal permission prompts.");
      console.log('Tip: Switch to remote mode with `afk on` or read-only mode with `afk readonly`.');
    }
  }

  /**
   * Format installation success message
   * @param {string} scope - Installation scope
   * @param {string} settingsPath - Path to settings file
   * @returns {string} Formatted message
   */
  formatInstallSuccess(scope, settingsPath) {
    const scopeText = scope === 'user' ? 'user level' : `${scope} level`;
    return `[afk] Installed hooks at ${scopeText}: ${settingsPath}\n` +
           `[afk] Next: in Claude Code, run \`/hooks\` to approve.\n` +
           `[afk] Tip: switch modes with \`afk on\` (remote) or \`afk off\` (local).`;
  }

  /**
   * Format uninstall instructions
   * @param {string} scope - Uninstall scope
   * @returns {string} Formatted instructions
   */
  formatUninstallInstructions(scope) {
    if (scope === 'user') {
      return 'To uninstall, remove hook entries from ~/.claude/settings.json `hooks` section and delete ~/.afk.';
    } else {
      return 'To uninstall, remove hook entries from your project\'s .claude/settings(.local).json and delete ./.claude/hooks/afk';
    }
  }
}

// Functional exports for backward compatibility
function parseCommandLine(argv) {
  const cli = new CLIService(null, null, null);
  return cli.parseCommandLine(argv);
}

function showHelp() {
  const cli = new CLIService(null, null, null);
  cli.showHelp();
}

function showStatus(mode) {
  const cli = new CLIService(null, null, null);
  cli.showStatus(mode);
}

function showDebugStatus(enabled, logPath) {
  const cli = new CLIService(null, null, null);
  cli.showDebugStatus(enabled, logPath);
}

function formatError(message, error) {
  const cli = new CLIService(null, null, null);
  return cli.formatError(message, error);
}

function formatSuccess(message) {
  const cli = new CLIService(null, null, null);
  return cli.formatSuccess(message);
}

function handleCommand(parsedCmd, handlers) {
  const cli = new CLIService(null, null, null);
  return cli.handleCommand(parsedCmd, handlers);
}

function validateArguments(parsedCmd) {
  const cli = new CLIService(null, null, null);
  return cli.validateArguments(parsedCmd);
}

module.exports = {
  CLIService,
  // Functional exports
  parseCommandLine,
  showHelp,
  showStatus,
  showDebugStatus,
  formatError,
  formatSuccess,
  handleCommand,
  validateArguments
};