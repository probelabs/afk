#!/usr/bin/env node
/**
 * Permissions Service Module
 * Handles permission checking, pattern generation, and rule matching
 * for Claude Code tool approval workflows.
 */

const fs = require('fs');
const path = require('path');

/**
 * PermissionsService class for permission management
 * @class
 */
class PermissionsService {
  /**
   * Create a new PermissionsService instance
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance for debug output
   */
  constructor(configManager, logger) {
    this.configManager = configManager;
    this.logger = logger;
  }

  /**
   * Generate permission pattern for a tool call (matches binary implementation)
   * @param {string} toolName - Name of the tool
   * @param {Object} toolInput - Tool input parameters
   * @returns {string|Array<string>} Permission pattern(s)
   */
  generatePermissionPattern(toolName, toolInput) {
    // For Bash commands, create specific patterns
    if (toolName === 'Bash' && toolInput.command) {
      const cmd = toolInput.command;
      
      // Parse compound commands and generate patterns for each
      const commands = this.parseCompoundCommand(cmd);
      if (commands.length > 1) {
        // For compound commands, return patterns for all parts
        return commands.map(singleCmd => {
          const parts = singleCmd.trim().split(/\s+/);
          const baseCmd = parts[0];
          
          if (baseCmd === 'npm' && parts[1]) {
            return `Bash(npm ${parts[1]}:*)`;
          }
          if (baseCmd === 'git' && parts[1]) {
            return `Bash(git ${parts[1]}:*)`;
          }
          if (baseCmd === 'cargo' && parts[1]) {
            return `Bash(cargo ${parts[1]}:*)`;
          }
          if (baseCmd === 'make' && parts[1]) {
            return `Bash(make ${parts[1]}:*)`;
          }
          
          return `Bash(${baseCmd}:*)`;
        });
      }
      
      // Single command
      const parts = cmd.trim().split(/\s+/);
      const baseCmd = parts[0];
      
      // Check if it's a common safe command pattern
      if (baseCmd === 'npm' && parts[1]) {
        return `Bash(npm ${parts[1]}:*)`;
      }
      if (baseCmd === 'git' && parts[1]) {
        return `Bash(git ${parts[1]}:*)`;
      }
      if (baseCmd === 'cargo' && parts[1]) {
        return `Bash(cargo ${parts[1]}:*)`;
      }
      if (baseCmd === 'make' && parts[1]) {
        return `Bash(make ${parts[1]}:*)`;
      }
      
      // For other commands, use baseCmd:* pattern
      return `Bash(${baseCmd}:*)`;
    }
    
    // For WebFetch, use domain pattern
    if (toolName === 'WebFetch' && toolInput.url) {
      try {
        const url = new URL(toolInput.url);
        return `WebFetch(domain:${url.hostname})`;
      } catch {
        return 'WebFetch(*)';
      }
    }
    
    // For file operations (Read, Edit, Write, MultiEdit), no pattern needed
    // These tools don't use patterns in permissions
    if (['Read', 'Edit', 'Write', 'MultiEdit'].includes(toolName)) {
      return toolName;
    }
    
    // For MCP tools, use the full tool name
    if (toolName.startsWith('mcp__')) {
      return toolName;
    }
    
    // For other internal tools like Task, TodoWrite, etc., just use the name
    if (['Task', 'TodoWrite', 'Glob', 'Grep', 'LS', 'NotebookEdit', 'WebSearch', 'BashOutput', 'KillBash', 'ExitPlanMode'].includes(toolName)) {
      return toolName;
    }
    
    // Default: return the tool name
    return toolName;
  }

  /**
   * Generate pattern for Bash commands
   * @private
   * @param {string} command - Bash command
   * @returns {string|Array<string>} Pattern(s) for the command
   */
  _generateBashPattern(command) {
    // Parse compound commands
    const commands = this.parseCompoundCommand(command);
    
    if (commands.length > 1) {
      // Multiple commands - return array of patterns
      return commands.map(cmd => {
        const parts = cmd.trim().split(/\s+/);
        const baseCmd = parts[0];
        const args = parts.slice(1).join(' ');
        return `Bash(${baseCmd}:${args || '*'})`;
      });
    }
    
    // Single command
    const trimmed = command.trim();
    const parts = trimmed.split(/\s+/);
    const baseCmd = parts[0];
    const args = parts.slice(1).join(' ');
    
    return `Bash(${baseCmd}:${args || '*'})`;
  }

  /**
   * Generate pattern for WebFetch URLs
   * @private
   * @param {string} url - URL to fetch
   * @returns {string} Pattern for the URL
   */
  _generateWebFetchPattern(url) {
    try {
      const parsed = new URL(url);
      return `WebFetch(domain:${parsed.hostname})`;
    } catch (e) {
      return 'WebFetch(*)';
    }
  }

  /**
   * Parse compound Bash command into individual commands
   * @param {string} command - Compound command string
   * @returns {Array<string>} Individual commands
   */
  parseCompoundCommand(command) {
    const commands = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escapeNext = false;
    let parenDepth = 0;
    
    const operators = ['&&', '||', '|', ';', '&'];
    let i = 0;
    
    while (i < command.length) {
      const char = command[i];
      const nextChar = command[i + 1];
      const twoChar = char + (nextChar || '');
      
      if (escapeNext) {
        current += char;
        escapeNext = false;
        i++;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        current += char;
        i++;
        continue;
      }
      
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        current += char;
        i++;
        continue;
      }
      
      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        current += char;
        i++;
        continue;
      }
      
      if (!inSingleQuote && !inDoubleQuote) {
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
        
        // Check for operators only outside quotes and parentheses
        if (parenDepth === 0) {
          // Check two-char operators first
          if (operators.includes(twoChar)) {
            if (current.trim()) {
              commands.push(current.trim());
              current = '';
            }
            i += 2;
            continue;
          }
          
          // Check single-char operators
          if (operators.includes(char)) {
            if (current.trim()) {
              commands.push(current.trim());
              current = '';
            }
            i++;
            continue;
          }
        }
      }
      
      current += char;
      i++;
    }
    
    if (current.trim()) {
      commands.push(current.trim());
    }
    
    return commands.length > 0 ? commands : [command];
  }

  /**
   * Check if a pattern matches a rule
   * @param {string} pattern - Pattern to check
   * @param {string} rule - Rule to match against
   * @returns {boolean} True if pattern matches rule
   */
  patternMatches(pattern, rule) {
    // Exact match
    if (pattern === rule) return true;
    
    // For tools without patterns (Read, Edit, etc.), just check tool name
    if (!rule.includes('(') && !pattern.includes('(')) {
      return pattern === rule;
    }
    
    // Check if rule is more general (e.g., Bash(*) matches any Bash command)
    if (rule.endsWith('(*)') || rule.endsWith('(**)')) {
      const rulePrefix = rule.split('(')[0];
      const patternPrefix = pattern.split('(')[0];
      return rulePrefix === patternPrefix;
    }
    
    // Check wildcard patterns like Bash(npm:*) matching Bash(npm test:*)
    if (rule.includes(':*') && pattern.includes(':')) {
      const ruleBase = rule.replace(':*)', '');
      const patternBase = pattern.substring(0, pattern.lastIndexOf(':'));
      return ruleBase === patternBase;
    }
    
    // Check glob patterns for file paths (e.g., Edit(src/**) matches Edit(src/app.js))
    if (rule.includes('**') && pattern.includes('(')) {
      const ruleMatch = rule.match(/^([^(]+)\((.+)\)$/);
      const patternMatch = pattern.match(/^([^(]+)\((.+)\)$/);
      
      if (ruleMatch && patternMatch && ruleMatch[1] === patternMatch[1]) {
        const ruleGlob = ruleMatch[2];
        const patternPath = patternMatch[2];
        
        // Simple glob matching
        if (ruleGlob === '**') return true;
        if (ruleGlob.endsWith('/**')) {
          const prefix = ruleGlob.slice(0, -3);
          return patternPath.startsWith(prefix);
        }
        if (ruleGlob.startsWith('**/')) {
          const suffix = ruleGlob.slice(3);
          return patternPath.endsWith(suffix);
        }
        if (ruleGlob.includes('*')) {
          const regex = new RegExp('^' + ruleGlob.replace(/\*/g, '.*') + '$');
          return regex.test(patternPath);
        }
      }
    }
    
    return false;
  }

  /**
   * Check Claude permissions for a tool call (matches binary implementation)
   * @param {string} toolName - Tool name
   * @param {Object} toolInput - Tool input
   * @param {string} cwd - Current working directory
   * @returns {Object|null} Permission result object or null
   */
  checkClaudePermissions(toolName, toolInput, cwd) {
    const pattern = this.generatePermissionPattern(toolName, toolInput);
    
    this.logger.debugLog('PERMISSION_CHECK', 'Checking Claude permissions', {
      toolName,
      pattern,
      cwd
    });
    
    // Check three levels: local → project → user
    // Local settings override project, project overrides user
    const levels = [];
    
    // Determine if we're in a project
    if (cwd) {
      // Look for .claude directory up the tree
      let currentDir = cwd;
      while (currentDir !== '/' && currentDir !== path.dirname(currentDir)) {
        const claudeDir = path.join(currentDir, '.claude');
        if (fs.existsSync(claudeDir)) {
          // Found project root
          levels.push({
            name: 'local',
            path: path.join(claudeDir, 'settings.local.json')
          });
          levels.push({
            name: 'project', 
            path: path.join(claudeDir, 'settings.json')
          });
          break;
        }
        currentDir = path.dirname(currentDir);
      }
    }
    
    // Always check user level
    const userSettingsPath = path.join(
      process.env.HOME || process.env.USERPROFILE, 
      '.claude', 
      'settings.json'
    );
    levels.push({
      name: 'user',
      path: userSettingsPath
    });
    
    // Check each level
    for (const level of levels) {
      if (!fs.existsSync(level.path)) {
        this.logger.debugLog('PERMISSION_CHECK', `Level ${level.name} settings not found`, { path: level.path });
        continue;
      }
      
      let settings = {};
      try {
        settings = JSON.parse(fs.readFileSync(level.path, 'utf8'));
      } catch (e) {
        this.logger.error(`Failed to load ${level.name} settings:`, e.message);
        continue;
      }
      
      if (!settings.permissions) {
        this.logger.debugLog('PERMISSION_CHECK', `Level ${level.name} has no permissions`, { path: level.path });
        continue;
      }
      
      this.logger.debugLog('PERMISSION_CHECK', `Checking ${level.name} level permissions`, {
        path: level.path,
        allow: settings.permissions.allow?.length || 0,
        deny: settings.permissions.deny?.length || 0
      });
      
      // Check deny list first (takes precedence)
      if (settings.permissions.deny && Array.isArray(settings.permissions.deny)) {
        for (const rule of settings.permissions.deny) {
          if (this.patternMatches(pattern, rule)) {
            this.logger.debugLog('PERMISSION_MATCH', 'Pattern matched deny rule', {
              pattern,
              rule,
              level: level.name,
              decision: 'deny'
            });
            return { decision: 'deny', level: level.name, rule };
          }
        }
      }
      
      // Check allow list
      if (settings.permissions.allow && Array.isArray(settings.permissions.allow)) {
        for (const rule of settings.permissions.allow) {
          if (this.patternMatches(pattern, rule)) {
            this.logger.debugLog('PERMISSION_MATCH', 'Pattern matched allow rule', {
              pattern,
              rule,
              level: level.name,
              decision: 'allow'
            });
            return { decision: 'allow', level: level.name, rule };
          }
        }
      }
    }
    
    // No match found - Claude will ask for permission
    this.logger.debugLog('PERMISSION_CHECK', 'No matching rules found', {
      pattern,
      decision: 'ask'
    });
    return { decision: 'ask', level: null, rule: null };
  }

  /**
   * Load settings from all scopes
   * @private
   * @param {string} cwd - Current working directory
   * @returns {Promise<Object>} Settings from all scopes
   */
  async _loadAllSettings(cwd) {
    const settings = {
      user: null,
      project: null,
      local: null
    };
    
    // Load user settings
    const userSettingsPath = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'settings.json');
    if (fs.existsSync(userSettingsPath)) {
      try {
        settings.user = JSON.parse(fs.readFileSync(userSettingsPath, 'utf8'));
      } catch (e) {
        this.logger.error('Failed to load user settings:', e.message);
      }
    }
    
    // Find and load project settings
    const projectRoot = this._findProjectRoot(cwd);
    if (projectRoot) {
      const projectSettingsPath = path.join(projectRoot, '.claude', 'settings.json');
      if (fs.existsSync(projectSettingsPath)) {
        try {
          settings.project = JSON.parse(fs.readFileSync(projectSettingsPath, 'utf8'));
        } catch (e) {
          this.logger.error('Failed to load project settings:', e.message);
        }
      }
    }
    
    // Load local settings
    const localSettingsPath = path.join(cwd, '.claude', 'settings.json');
    if (fs.existsSync(localSettingsPath)) {
      try {
        settings.local = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'));
      } catch (e) {
        this.logger.error('Failed to load local settings:', e.message);
      }
    }
    
    return settings;
  }

  /**
   * Find project root directory
   * @private
   * @param {string} startDir - Starting directory
   * @returns {string|null} Project root path or null
   */
  _findProjectRoot(startDir) {
    let currentDir = path.resolve(startDir);
    const root = path.parse(currentDir).root;
    
    while (currentDir !== root) {
      // Check for .git directory or package.json
      if (fs.existsSync(path.join(currentDir, '.git')) ||
          fs.existsSync(path.join(currentDir, 'package.json'))) {
        return currentDir;
      }
      
      currentDir = path.dirname(currentDir);
    }
    
    return null;
  }

  /**
   * Add permission to Claude settings - preferring local settings if in a project (matches binary)
   * @param {string} pattern - Permission pattern
   * @param {string} cwd - Current working directory
   * @returns {boolean} True if pattern was added, false if it already exists
   */
  addPermissionToSettings(pattern, cwd) {
    // Determine the appropriate settings file based on cwd
    const userSettingsPath = path.join(
      process.env.HOME || process.env.USERPROFILE, 
      '.claude', 
      'settings.json'
    );
    let settingsPath = userSettingsPath;
    let settingsType = 'user';
    
    // Check if we're in a project with .claude directory
    if (cwd) {
      let currentDir = cwd;
      while (currentDir !== '/' && currentDir !== path.dirname(currentDir)) {
        const claudeDir = path.join(currentDir, '.claude');
        if (fs.existsSync(claudeDir)) {
          // Found project root, use local settings
          settingsPath = path.join(claudeDir, 'settings.local.json');
          settingsType = 'local';
          break;
        }
        currentDir = path.dirname(currentDir);
      }
    }
    
    // Ensure directory exists
    if (!fs.existsSync(path.dirname(settingsPath))) {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    }
    
    // Load existing settings or create new
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch (e) {
        this.logger.error(`Failed to load ${settingsType} settings:`, e.message);
        return false;
      }
    }
    
    if (!settings.permissions) {
      settings.permissions = { allow: [], deny: [] };
    }
    if (!settings.permissions.allow) {
      settings.permissions.allow = [];
    }
    
    // Check if pattern already exists
    if (!settings.permissions.allow.includes(pattern)) {
      settings.permissions.allow.push(pattern);
      
      // Write updated settings
      try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      } catch (e) {
        this.logger.error(`Failed to write ${settingsType} settings:`, e.message);
        return false;
      }
      
      this.logger.eprint(`[afk] Added ${pattern} to ${settingsType} settings: ${settingsPath}`);
      this.logger.debugLog('ALLOW_ALL', `Added pattern to ${settingsType} settings`, {
        pattern,
        settingsPath,
        settingsType
      });
      return true;
    }
    this.logger.debugLog('ALLOW_ALL', 'Pattern already exists', { pattern, settingsPath });
    return false;
  }

  /**
   * Merge hooks into existing settings configuration
   * @param {Object} existing - Existing settings object
   * @param {Array} commands - Array of hook commands to merge
   * @param {string} event - Event type (PreToolUse, Stop, SessionStart)
   * @param {string|null} matcher - Optional matcher pattern
   * @returns {Object} Updated settings object
   */
  mergeHooks(existing, commands, event, matcher = null) {
    existing.hooks = existing.hooks || {};
    existing.hooks[event] = existing.hooks[event] || [];
    const bucket = existing.hooks[event];
    
    if (matcher) {
      let group = bucket.find(m => m.matcher === matcher);
      if (!group) {
        group = { matcher, hooks: [] };
        bucket.push(group);
      }
      
      for (const h of commands) {
        if (!group.hooks.find(x => x.command === h.command)) {
          group.hooks.push(h);
        }
      }
    } else {
      const entry = { hooks: commands };
      if (!bucket.find(e => JSON.stringify(e) === JSON.stringify(entry))) {
        bucket.push(entry);
      }
    }
    
    return existing;
  }
}

// Export the class
module.exports = { PermissionsService };

// Backward compatibility: Export factory function
module.exports.createPermissionsService = (configManager, logger) => {
  return new PermissionsService(configManager, logger);
};