#!/usr/bin/env node
/**
 * Install Service Module
 * Handles installation, uninstallation, and settings configuration
 * for Claude Code hook integration.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * InstallService class for managing AFK installation and configuration
 */
class InstallService {
  constructor(configManager, permissionsService, logger, utils) {
    this.configManager = configManager;
    this.permissionsService = permissionsService;
    this.logger = logger;
    this.utils = utils;
    
    // Constants
    this.HOME = os.homedir();
    this.USER_CFG_DIR = path.join(this.HOME, '.afk');
    this.USER_BIN = path.join(this.USER_CFG_DIR, 'bin');
  }

  /**
   * Install AFK hooks at user or project level
   * @param {string} scope - 'user', 'project', or 'local'
   * @param {string} projectRoot - Required for project/local scope
   */
  install(scope, projectRoot) {
    if (scope === 'user') {
      this.utils.ensureDir(this.USER_BIN);
      const dest = path.join(this.USER_BIN, 'afk');
      fs.copyFileSync(process.argv[1], dest);
      this.utils.ensureExecutable(dest);
      const settingsPath = this.writeSettings('user');
      console.log(`[afk] Installed hooks at user level: ${settingsPath}`);
      console.log(`[afk] Next: in Claude Code, run /hooks to approve.`);
      console.log(`[afk] Tip: switch modes with afk on (remote) or afk off (local).`);
    } else {
      if (!projectRoot) {
        this.logger.eprint('--project-root is required for project/local install');
        process.exit(2);
      }
      const pr = path.resolve(projectRoot);
      const settingsPath = this.writeSettings(scope, pr);
      console.log(`[afk] Installed hooks at ${scope} level: ${settingsPath}`);
      console.log(`[afk] Next: inside this project, run /hooks to approve.`);
      console.log(`[afk] Tip: switch modes with afk on (remote) or afk off (local).`);
    }
  }

  /**
   * Show uninstallation instructions
   * @param {string} scope - 'user', 'project', or 'local'
   */
  uninstall(scope) {
    if (scope === 'user') {
      console.log(`To uninstall, remove hook entries from ~/.claude/settings.json hooks section and delete ~/.afk.`);
    } else {
      console.log(`To uninstall, remove hook entries from your project's .claude/settings(.local).json and delete ./.claude/hooks/afk`);
    }
  }

  /**
   * Write Claude Code settings with AFK hooks
   * @param {string} scope - 'user', 'project', or 'local'
   * @param {string} projectRoot - Project root directory (required for project/local)
   * @returns {string} Settings file path
   */
  writeSettings(scope, projectRoot) {
    let settingsPath, hookCmdBase, scopeDir;
    if (scope === 'user') {
      settingsPath = path.join(this.HOME, '.claude', 'settings.json');
      hookCmdBase = this.utils.toPosix(path.join(this.USER_BIN, 'afk'));
      scopeDir = path.join(this.HOME, '.claude');
    } else {
      if (!projectRoot) throw new Error('project_root required');
      scopeDir = path.join(projectRoot, '.claude');
      settingsPath = path.join(scopeDir, scope === 'local' ? 'settings.local.json' : 'settings.json');
      const dest = path.join(scopeDir, 'hooks', 'afk');
      this.utils.ensureDir(path.dirname(dest));
      fs.copyFileSync(process.argv[1], dest);
      this.utils.ensureExecutable(dest);
      hookCmdBase = this.utils.toPosix(dest);
    }

    const pretoolCmd = `${hookCmdBase} hook pretooluse`;
    const stopCmd = `${hookCmdBase} hook stop`;
    const sessionStartCmd = `${hookCmdBase} hook sessionstart`;
    const userPromptCmd = `${hookCmdBase} hook userpromptsubmit`;

    let settings = this.configManager.loadJson(settingsPath, {});
    settings = this.permissionsService.mergeHooks(settings, [{ type: 'command', command: pretoolCmd, timeout: 21600 }], 'PreToolUse', this.configManager.cfg().intercept_matcher);
    // Notification hook removed - redundant with PreToolUse  
    settings = this.permissionsService.mergeHooks(settings, [{ type: 'command', command: stopCmd, timeout: 21600 }], 'Stop', null);
    settings = this.permissionsService.mergeHooks(settings, [{ type: 'command', command: sessionStartCmd, timeout: 21600 }], 'SessionStart', null);
    // Re-enable UserPromptSubmit hook for /afk commands
    settings = this.permissionsService.mergeHooks(settings, [{ type: 'command', command: userPromptCmd, timeout: 30 }], 'UserPromptSubmit', null);

    this.configManager.saveJson(settingsPath, settings);
    this.installAfkSlashCommand(scopeDir);
    return settingsPath;
  }

  /**
   * Install the AFK slash command documentation using flat structure
   * @param {string} scopeDir - Claude scope directory
   */
  installAfkSlashCommand(scopeDir) {
    const cmdDir = path.join(scopeDir, 'commands');
    const afkDir = path.join(cmdDir, 'afk');
    this.utils.ensureDir(afkDir);
    
    // Create subcommand files directly in afk directory  
    const subcommands = {
      'on': {
        description: 'Enable remote mode globally.',
        usage: '**Usage:** `/afk:on`'
      },
      'off': {
        description: 'Disable remote mode globally.',
        usage: '**Usage:** `/afk:off`'
      },
      'readonly': {
        description: 'Enable read-only mode globally.',
        usage: 'Read-only mode sends notifications for completed sessions without blocking or waiting for responses.\n\n**Usage:** `/afk:readonly`'
      },
      'status': {
        description: 'Show AFK mode status at all levels.',
        usage: '**Usage:** `/afk:status`'
      },
      'global': {
        description: 'Toggle global AFK mode.',
        usage: 'Same as `/afk`. Toggles between local and remote modes.\n\n**Usage:** `/afk:global`'
      },
      'project': {
        description: 'Toggle project-specific AFK mode.',
        usage: 'Toggles between remote and local for this project directory.\n\n**Usage:** `/afk:project`'
      },
      'help': {
        description: 'Show help for AFK commands.',
        usage: '**Available commands:**\n• `/afk` - Toggle global AFK mode (local ↔ remote)\n• `/afk:on` - Enable remote mode globally\n• `/afk:off` - Disable remote mode globally\n• `/afk:readonly` - Enable read-only mode globally\n• `/afk:status` - Show current mode status\n• `/afk:global` - Toggle global mode (same as /afk)\n• `/afk:project` - Toggle project-specific mode\n• `/afk:help` - Show this help\n\n**Modes:**\n• **Local**: No notifications, Claude prompts only\n• **Remote**: Telegram approvals required for tools\n• **Read-only**: Notifications without blocking (enable with `/afk:readonly`)\n\n**Mode hierarchy:** Session > Project > Global'
      }
    };
    
    // Create each subcommand file directly in afk directory
    Object.entries(subcommands).forEach(([subcommand, config]) => {
      const content = `${config.description}\n\n${config.usage}\n\n$ARGUMENTS`;
      fs.writeFileSync(path.join(afkDir, `${subcommand}.md`), content);
    });
    
    // Create main /afk command (global toggle)
    const mainAfkContent = `Toggle global AFK mode.\n\n**Usage:** \`/afk\`\n\nToggles between local and remote modes.\n\n**Modes:**\n• **Local**: No notifications, Claude prompts only\n• **Remote**: Telegram approvals required for tools\n• **Read-only**: Notifications without blocking (enable with \`/afk:readonly\`)\n\n$ARGUMENTS`;
    fs.writeFileSync(path.join(cmdDir, 'afk.md'), mainAfkContent);
  }
}

/**
 * Backward compatibility functions - these maintain the exact same interface
 * as the original functions in bin/afk
 */

/**
 * Install AFK (backward compatibility)
 * @param {string} scope - Installation scope
 * @param {string} projectRoot - Project root directory
 */
function install(scope, projectRoot) {
  throw new Error('install function requires service dependencies - use InstallService instead');
}

/**
 * Uninstall AFK (backward compatibility)
 * @param {string} scope - Installation scope
 */
function uninstall(scope) {
  throw new Error('uninstall function requires service dependencies - use InstallService instead');
}

/**
 * Write settings (backward compatibility)
 * @param {string} scope - Installation scope
 * @param {string} projectRoot - Project root directory
 */
function writeSettings(scope, projectRoot) {
  throw new Error('writeSettings function requires service dependencies - use InstallService instead');
}

/**
 * Install AFK slash command (backward compatibility)
 * @param {string} scopeDir - Claude scope directory
 */
function installAfkSlashCommand(scopeDir) {
  throw new Error('installAfkSlashCommand function requires service dependencies - use InstallService instead');
}

module.exports = {
  InstallService,
  // Functional exports for backward compatibility
  install,
  uninstall,
  writeSettings,
  installAfkSlashCommand
};