/**
 * Claude Integration Hooks
 * 
 * This module contains the core hook handlers that integrate with Claude Code:
 * - PreToolUse: Main tool approval hook handler
 * - Stop: Stop hook handler for task completion
 * - SessionStart: Session start hook handler for initial instructions
 * 
 * Provides both class-based and functional exports for backward compatibility.
 */

const fs = require('fs');
const path = require('path');

/**
 * Claude Hooks Service Class
 * Handles all Claude Code integration points and hook processing
 */
class ClaudeHooksService {
  constructor(configManager, telegramService, permissionsService, sessionsService, queueService, logger, utils) {
    this.configManager = configManager;
    this.telegramService = telegramService;
    this.permissionsService = permissionsService;
    this.sessionsService = sessionsService;
    this.queueService = queueService;
    this.logger = logger;
    this.utils = utils;
  }

  /**
   * Check if a command should be handled by AFK based on configuration
   * @param {string} toolName - Name of the tool being executed
   * @returns {boolean} Whether this command should be intercepted
   */
  shouldHandleCommand(toolName) {
    const autoApproveTools = [
      ...this.configManager.cfg().auto_approve_tools,
      'TodoWrite',        // Internal task management
      'ExitPlanMode',     // Internal mode switching
      'Task',             // Internal task delegation
      'LS',               // Safe file listing
      'Glob'              // Safe file pattern matching
    ];
    
    return !autoApproveTools.includes(toolName);
  }

  /**
   * Format tool information for display in Telegram messages
   * @param {string} toolName - Name of the tool
   * @param {Object} toolInput - Tool input parameters
   * @returns {string} Formatted tool display string
   */
  formatToolDisplay(toolName, toolInput) {
    const summary = this.summarizeTool(toolName, toolInput);
    const toolCmd = toolInput.command || '';
    const shortCmd = toolCmd.length > 50 ? toolCmd.substring(0, 50) + '...' : toolCmd;
    return `${toolName}${shortCmd ? `: ${shortCmd}` : ''}`;
  }

  /**
   * Process tool approval from Telegram callback
   * @param {Object} update - Telegram update object
   * @param {string} approvalId - Approval ID
   * @param {string} sessionId - Session ID
   * @returns {Object} Decision object for Claude Code
   */
  async processToolApproval(update, approvalId, sessionId) {
    const callbackData = update.callback_query.data || '';
    const [decision, ...args] = callbackData.split(':').slice(1); // Remove 'approve'/'deny' prefix
    
    this.logger.debugLog('CALLBACK_PARSE', 'Processing tool approval', { 
      decision, 
      args, 
      sessionId: sessionId?.substring(0, 8) + '...' 
    });

    // Load metadata for the approval
    const metaFile = path.join(this.getApprovalDir(), `${approvalId}.meta`);
    let metadata = {};
    try {
      if (fs.existsSync(metaFile)) {
        metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        fs.unlinkSync(metaFile); // Clean up
      }
    } catch (e) {
      this.logger.eprint(`[approval] Failed to read metadata: ${e.message}`);
    }

    const { patterns = [], toolName = '', toolInput = {} } = metadata;

    if (decision === 'approve') {
      await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'answerCallbackQuery', { 
        callback_query_id: update.callback_query.id 
      });

      const approvalText = `✅ *Approved* — ${this.formatToolDisplay(toolName, toolInput)}`;
      
      await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageText', {
        chat_id: update.callback_query.message.chat.id,
        message_id: update.callback_query.message.message_id,
        text: approvalText,
        parse_mode: 'Markdown'
      });

      this.sessionsService.appendHistory({ 
        type: 'approval', 
        session_id: sessionId, 
        decision: 'approve',
        tool_name: toolName
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: 'Approved via Telegram'
        }
      };

    } else if (decision === 'deny') {
      await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'answerCallbackQuery', { 
        callback_query_id: update.callback_query.id 
      });

      const denialText = `❌ *Denied* — ${this.formatToolDisplay(toolName, toolInput)}`;
      
      await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageText', {
        chat_id: update.callback_query.message.chat.id,
        message_id: update.callback_query.message.message_id,
        text: denialText,
        parse_mode: 'Markdown'
      });

      this.sessionsService.appendHistory({ 
        type: 'approval', 
        session_id: sessionId, 
        decision: 'deny',
        tool_name: toolName
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'Denied via Telegram'
        }
      };

    } else if (decision === 'allow_all') {
      const patternsForAllowAll = args[0] ? [args[0]] : patterns;
      const patternArray = Array.isArray(patternsForAllowAll) ? patternsForAllowAll : [patternsForAllowAll];
      
      let addedCount = 0;
      let skippedCount = 0;
      
      for (const pattern of patternArray) {
        const added = this.permissionsService.addAllowPattern(pattern);
        if (added) addedCount++;
        else skippedCount++;
      }

      const reasonText = addedCount > 0 ? 
        `Approved via Telegram and added ${addedCount} new ${addedCount === 1 ? 'pattern' : 'patterns'} to permissions` +
        (skippedCount > 0 ? ` (${skippedCount} already existed)` : '') :
        `Approved via Telegram (patterns already exist)`;

      await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'answerCallbackQuery', { 
        callback_query_id: update.callback_query.id 
      });

      const resultText = `✅ *Allowed All* — ${this.formatToolDisplay(toolName, toolInput)}\n\nAdded ${addedCount} new ${addedCount === 1 ? 'pattern' : 'patterns'} to permissions` +
        (skippedCount > 0 ? ` (${skippedCount} already existed)` : '');
      
      await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageText', {
        chat_id: update.callback_query.message.chat.id,
        message_id: update.callback_query.message.message_id,
        text: resultText,
        parse_mode: 'Markdown'
      });

      this.sessionsService.appendHistory({ 
        type: 'approval', 
        session_id: sessionId, 
        decision: 'allow_all', 
        patterns: patternArray,
        tool_name: toolName
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: reasonText
        }
      };

    } else if (decision === 'ask_ui') {
      await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'answerCallbackQuery', { 
        callback_query_id: update.callback_query.id 
      });

      const delegateText = `🔧 *Delegating to Claude UI* — ${this.formatToolDisplay(toolName, toolInput)}`;
      
      await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageText', {
        chat_id: update.callback_query.message.chat.id,
        message_id: update.callback_query.message.message_id,
        text: delegateText,
        parse_mode: 'Markdown'
      });

      this.sessionsService.appendHistory({ 
        type: 'approval', 
        session_id: sessionId, 
        decision: 'ask_ui',
        tool_name: toolName
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: 'Delegating to Claude UI for decision'
        }
      };
    }

    // Unknown decision
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: 'Unknown approval decision'
      }
    };
  }

  /**
   * Generate diff image for tool preview (Edit/MultiEdit/Write operations)
   * @param {string} toolName - Name of the tool
   * @param {Object} toolInput - Tool input parameters
   * @param {string} cwd - Current working directory
   * @returns {string|null} Path to generated diff image or null
   */
  async generateToolDiff(toolName, toolInput, cwd) {
    return this.generatePreviewDiffImage(toolName, toolInput, cwd);
  }

  /**
   * Generate preview diff image for proposed changes
   * @param {string} toolName - Name of the tool
   * @param {Object} toolInput - Tool input parameters
   * @param {string} cwd - Current working directory
   * @returns {string|null} Path to generated diff image or null
   */
  async generatePreviewDiffImage(toolName, toolInput, cwd) {
    try {
      // Check if diff image generation is disabled
      if (process.env.AFK_DISABLE_DIFF_IMAGES === 'true') {
        this.logger.eprint('[afk] Preview diff image generation disabled via AFK_DISABLE_DIFF_IMAGES');
        return null;
      }

      // Only generate previews for file editing tools
      if (!['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(toolName)) {
        return null;
      }

      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      this.logger.eprint(`[afk] Generating preview diff image for ${toolName} operation`);

      let previewChanges = [];

      if (toolName === 'Edit') {
        // Single file edit
        const filePath = toolInput.file_path;
        const oldString = toolInput.old_string;
        const newString = toolInput.new_string;
        
        if (!filePath || typeof filePath !== 'string' || 
            oldString === undefined || typeof oldString !== 'string' ||
            newString === undefined || typeof newString !== 'string') {
          this.logger.eprint(`[afk] Invalid Edit tool parameters: file_path=${!!filePath}, old_string=${oldString !== undefined}, new_string=${newString !== undefined}`);
          return null;
        }

        const absolutePath = path.resolve(cwd, filePath);
        
        // Read current file content
        let currentContent = '';
        try {
          if (fs.existsSync(absolutePath)) {
            currentContent = fs.readFileSync(absolutePath, 'utf8');
          }
        } catch (e) {
          this.logger.eprint(`[afk] Could not read file for preview: ${e.message}`);
          return null;
        }

        // Create preview of proposed change
        const newContent = currentContent.replace(oldString, newString);
        
        previewChanges.push({
          filePath: filePath,
          currentContent,
          newContent,
          operation: 'modified'
        });

      } else if (toolName === 'MultiEdit') {
        // Multiple edits in single file
        const filePath = toolInput.file_path;
        
        if (!filePath || typeof filePath !== 'string' || 
            !toolInput.edits || !Array.isArray(toolInput.edits) || toolInput.edits.length === 0) {
          this.logger.eprint(`[afk] Invalid MultiEdit tool parameters: file_path=${!!filePath}, edits=${Array.isArray(toolInput.edits)} (${toolInput.edits?.length || 0} items)`);
          return null;
        }
        
        // Validate each edit operation
        for (let i = 0; i < toolInput.edits.length; i++) {
          const edit = toolInput.edits[i];
          if (!edit.old_string || typeof edit.old_string !== 'string' ||
              edit.new_string === undefined || typeof edit.new_string !== 'string') {
            this.logger.eprint(`[afk] Invalid MultiEdit edit #${i + 1}: old_string=${!!edit.old_string}, new_string=${edit.new_string !== undefined}`);
            return null;
          }
        }

        const absolutePath = path.resolve(cwd, filePath);
        
        // Read current file content
        let currentContent = '';
        try {
          if (fs.existsSync(absolutePath)) {
            currentContent = fs.readFileSync(absolutePath, 'utf8');
          }
        } catch (e) {
          this.logger.eprint(`[afk] Could not read file for preview: ${e.message}`);
          return null;
        }

        // Apply all edits to simulate the change
        let newContent = currentContent;
        for (const edit of toolInput.edits) {
          if (edit.old_string && edit.new_string !== undefined) {
            if (edit.replace_all) {
              // Use global regex for replace_all functionality
              const regex = new RegExp(edit.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
              newContent = newContent.replace(regex, edit.new_string);
            } else {
              newContent = newContent.replace(edit.old_string, edit.new_string);
            }
          }
        }
        
        previewChanges.push({
          filePath: filePath,
          currentContent,
          newContent,
          operation: 'modified'
        });

      } else if (toolName === 'Write') {
        // File write (create or overwrite)
        const filePath = toolInput.file_path;
        const newContent = toolInput.content;
        
        if (!filePath || typeof filePath !== 'string' || 
            newContent === undefined || typeof newContent !== 'string') {
          this.logger.eprint(`[afk] Invalid Write tool parameters: file_path=${!!filePath}, content=${newContent !== undefined}`);
          return null;
        }

        const absolutePath = path.resolve(cwd, filePath);
        
        // Read current file content if exists
        let currentContent = '';
        let operation = 'added';
        
        try {
          if (fs.existsSync(absolutePath)) {
            currentContent = fs.readFileSync(absolutePath, 'utf8');
            operation = 'modified';
          }
        } catch (e) {
          // File doesn't exist or can't be read - it's a new file
        }
        
        previewChanges.push({
          filePath: filePath,
          currentContent,
          newContent,
          operation
        });

      } else if (toolName === 'NotebookEdit') {
        // Notebook editing - handle cell modifications
        const notebookPath = toolInput.notebook_path;
        const newSource = toolInput.new_source;
        const editMode = toolInput.edit_mode || 'replace';
        const cellType = toolInput.cell_type;
        
        if (!notebookPath || typeof notebookPath !== 'string' || 
            newSource === undefined || typeof newSource !== 'string') {
          this.logger.eprint(`[afk] Invalid NotebookEdit tool parameters: notebook_path=${!!notebookPath}, new_source=${newSource !== undefined}`);
          return null;
        }
        
        if (editMode && !['replace', 'insert', 'delete'].includes(editMode)) {
          this.logger.eprint(`[afk] Invalid NotebookEdit edit_mode: ${editMode} (must be replace, insert, or delete)`);
          return null;
        }
        
        if (cellType && !['code', 'markdown'].includes(cellType)) {
          this.logger.eprint(`[afk] Invalid NotebookEdit cell_type: ${cellType} (must be code or markdown)`);
          return null;
        }

        const absolutePath = path.resolve(cwd, notebookPath);
        
        // Read current notebook content
        let currentContent = '';
        let operation = 'modified';
        
        try {
          if (fs.existsSync(absolutePath)) {
            const notebook = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
            
            // For preview purposes, convert notebook to a readable text format
            currentContent = `# Notebook: ${notebookPath}\n\n`;
            if (notebook.cells) {
              notebook.cells.forEach((cell, index) => {
                currentContent += `## Cell ${index + 1} (${cell.cell_type})\n`;
                if (cell.source) {
                  const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
                  currentContent += source + '\n\n';
                }
              });
            }
          } else {
            operation = 'added';
          }
        } catch (e) {
          this.logger.eprint(`[afk] Could not read notebook for preview: ${e.message}`);
          return null;
        }

        // Create preview of notebook changes
        // For simplicity, we'll show the cell change as a text diff
        const cellIdentifier = toolInput.cell_id ? `Cell ID: ${toolInput.cell_id}` : 
                              toolInput.cell_number !== undefined ? `Cell ${toolInput.cell_number}` : 
                              'New Cell';
        
        let newContent = currentContent;
        if (editMode === 'insert') {
          newContent += `\n## ${cellIdentifier} (NEW)\n${newSource}\n\n`;
        } else if (editMode === 'delete') {
          newContent = currentContent.replace(new RegExp(`## ${cellIdentifier}.*?\n\n`, 's'), '');
        } else { // replace
          // For replace mode, show a simplified diff
          newContent = currentContent + `\n## ${cellIdentifier} (UPDATED)\n${newSource}\n\n`;
        }
        
        previewChanges.push({
          filePath: notebookPath,
          currentContent,
          newContent,
          operation
        });
      }

      if (previewChanges.length === 0) {
        return null;
      }

      // Create temporary files with the changes to generate git diff
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afk-preview-'));
      const tempOriginalFile = path.join(tempDir, 'original.txt');
      const tempModifiedFile = path.join(tempDir, 'modified.txt');
      
      let diffContent = '';

      try {
        for (const change of previewChanges) {
          // Write temp files
          fs.writeFileSync(tempOriginalFile, change.currentContent);
          fs.writeFileSync(tempModifiedFile, change.newContent);
          
          // Generate git diff between temp files
          const { execSync } = require('child_process');
          
          try {
            const diff = execSync(
              `git diff --no-index --no-prefix "${tempOriginalFile}" "${tempModifiedFile}"`,
              { encoding: 'utf8', maxBuffer: 50000, stdio: ['inherit', 'pipe', 'pipe'] }
            ).trim();
            
            if (diff) {
              // Replace temp file paths with actual file paths in diff
              const cleanDiff = diff
                .replace(/original\.txt/g, change.filePath)
                .replace(/modified\.txt/g, change.filePath)
                .replace(/a\//g, '')
                .replace(/b\//g, '');
              
              diffContent += cleanDiff + '\n';
            }
          } catch (diffError) {
            // git diff returns non-zero exit code when files differ, but that's normal
            if (diffError.stdout) {
              const cleanDiff = diffError.stdout
                .replace(/original\.txt/g, change.filePath)
                .replace(/modified\.txt/g, change.filePath)
                .replace(/a\//g, '')
                .replace(/b\//g, '');
              
              diffContent += cleanDiff + '\n';
            }
          }
        }

        if (!diffContent.trim()) {
          return null;
        }

        // Use our beautiful diff image generation with the preview diff
        return await this.generateBeautifulDiffFromContent(diffContent, 'Preview of Proposed Changes');

      } finally {
        // Clean up temp files
        try {
          fs.unlinkSync(tempOriginalFile);
          fs.unlinkSync(tempModifiedFile);
          fs.rmdirSync(tempDir);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

    } catch (error) {
      this.logger.debugLog('DIFF_GENERATION', 'Error generating preview diff image', { error: error.message });
      return null;
    }
  }

  /**
   * Main PreToolUse hook handler
   * @param {Object} data - Hook input data from Claude Code
   */
  async handlePreToolUse(data = null) {
    if (!data) {
      data = await this.readStdinJson();
    }

    const { tool_name: toolName, tool_input: toolInput = {}, session_id: sessionId, cwd } = data;

    this.logger.debugLog('HOOK_PRETOOL', 'PreToolUse hook triggered', {
      toolName, toolInput, sessionId, cwd,
      transcript_path: data.transcript_path
    });

    // Check if this tool should be auto-approved
    if (!this.shouldHandleCommand(toolName)) {
      this.logger.debugLog('HOOK_PRETOOL', 'Tool in auto-approve list, skipping intervention', { 
        toolName, decision: 'skip', reason: 'auto-approved tool'
      });
      process.stdout.write(JSON.stringify({}));
      return;
    }

    // Check effective mode using hierarchy (session > project > global)
    const mode = this.getEffectiveMode(sessionId, cwd);
    if (mode !== 'remote') {
      this.logger.debugLog('HOOK_PRETOOL', `${mode} mode - skipping intervention`, {
        mode, decision: 'skip', reason: `${mode} mode active`
      });
      process.stdout.write(JSON.stringify({}));
      return;
    }

    // Check Claude's permission system
    const respectClaudePermissions = this.configManager.cfg().respect_claude_permissions !== false;
    if (respectClaudePermissions) {
      const permissionResult = this.checkToolPermissions(toolName, toolInput, cwd);
      if (permissionResult) {
        process.stdout.write(JSON.stringify(permissionResult));
        return;
      }
    }

    // Need Telegram approval - generate approval request
    const approvalId = this.utils.cryptoRandomId();
    const approvalDir = this.getApprovalDir();
    this.utils.ensureDir(approvalDir);

    // Generate preview diff if applicable
    const previewImagePath = await this.generateToolDiff(toolName, toolInput, cwd);

    // Prepare approval request
    const patterns = this.generatePermissionPattern(toolName, toolInput);
    const summary = this.summarizeTool(toolName, toolInput);
    const label = this.projectLabel(cwd);
    
    // Store metadata for the approval
    const metaFile = path.join(approvalDir, `${approvalId}.meta`);
    fs.writeFileSync(metaFile, JSON.stringify({ patterns, toolName, toolInput, cwd, sessionId }));

    // Send Telegram approval request
    await this.sendApprovalRequest(approvalId, toolName, toolInput, summary, patterns, label, sessionId, cwd, previewImagePath);

    // Wait for approval response
    await this.waitForApproval(approvalId, sessionId, toolName, toolInput);
  }

  /**
   * Stop hook handler for task completion
   * @param {Object} data - Hook input data from Claude Code
   */
  async handleStop(data = null) {
    if (!data) {
      data = await this.readStdinJson();
    }

    const { session_id: sessionId, cwd } = data;

    this.logger.eprint(`🛑 [afk] Stop hook triggered (session: ${sessionId?.substring(0, 8)}...)`);
    console.log(`🛑 [afk] Stop hook triggered (session: ${sessionId?.substring(0, 8)}...)`);

    this.logger.debugLog('HOOK_STOP', 'Stop hook triggered', {
      sessionId, cwd,
      transcript_path: data.transcript_path
    });

    // Check effective mode using hierarchy (session > project > global)
    const mode = this.getEffectiveMode(sessionId, cwd);
    if (mode === 'local') {
      this.logger.debugLog('HOOK_STOP', 'Local mode - no Telegram notification', {
        mode, reason: 'local mode active'
      });
      this.logger.eprint(`[afk] Local mode - no Stop notification sent`);
      return;
    }

    // Generate diff image if available
    const diffImagePath = this.generateFormattedDiff(cwd);

    // Send stop notification to Telegram
    const label = this.projectLabel(cwd);
    const context = this.extractConversationContext(data.transcript_path);
    
    // In readonly mode, send notification but don't wait
    if (mode === 'readonly') {
      this.logger.debugLog('HOOK_STOP', 'Read-only mode - sending notification without waiting', {
        mode, sessionId
      });
      await this.sendStopNotificationReadOnly(sessionId, label, cwd, context, diffImagePath);
      this.logger.eprint(`📖 [afk] Read-only mode - Stop notification sent (no waiting)`);
      return;
    }

    // Remote mode - send notification and wait for response
    await this.sendStopNotification(sessionId, label, cwd, context, diffImagePath);
    await this.waitForStopResponse(sessionId, cwd);
  }

  /**
   * SessionStart hook handler for new sessions
   * @param {Object} data - Hook input data from Claude Code
   */
  async handleSessionStart(data = null) {
    if (!data) {
      data = await this.readStdinJson();
    }

    const { session_id: sessionId, cwd, source } = data;

    this.logger.eprint(`🚀 [afk] SessionStart hook triggered (session: ${sessionId?.substring(0, 8)}...)`);
    console.log(`🚀 [afk] SessionStart hook triggered (session: ${sessionId?.substring(0, 8)}...)`);

    this.logger.debugLog('HOOK_SESSIONSTART', 'SessionStart hook triggered', {
      sessionId, cwd, source,
      transcript_path: data.transcript_path
    });

    // Check effective mode using hierarchy (session > project > global)
    const mode = this.getEffectiveMode(sessionId, cwd);
    if (mode === 'local') {
      this.logger.debugLog('HOOK_SESSIONSTART', 'Local mode - no Telegram notification', {
        mode, reason: 'local mode active'
      });
      this.logger.eprint(`[afk] Local mode - no SessionStart notification sent`);
      return;
    }

    // Track active session
    this.sessionsService.trackActiveSession(sessionId, cwd);

    // Send session start notification
    const label = this.projectLabel(cwd);
    
    // In readonly mode, send notification but don't wait
    if (mode === 'readonly') {
      this.logger.debugLog('HOOK_SESSIONSTART', 'Read-only mode - sending notification without waiting', {
        mode, sessionId
      });
      await this.sendSessionStartNotificationReadOnly(sessionId, label, cwd, source);
      this.logger.eprint(`📖 [afk] Read-only mode - SessionStart notification sent (no waiting)`);
      return;
    }

    // Remote mode - send notification and wait for response
    await this.sendSessionStartNotification(sessionId, label, cwd, source);
    await this.waitForSessionStartResponse(sessionId, cwd);
  }

  // Helper methods (would be extracted from bin/afk)
  
  getApprovalDir() {
    return path.join(this.configManager.configDir, 'approvals');
  }

  readMode() {
    const stateFile = path.join(this.configManager.configDir, 'mode');
    try {
      return fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8').trim() : 'local';
    } catch (e) {
      return 'local';
    }
  }

  projectLabel(cwd) {
    return path.basename(cwd) || 'project';
  }

  async readStdinJson() {
    return new Promise((resolve, reject) => {
      let input = '';
      process.stdin.on('data', chunk => input += chunk);
      process.stdin.on('end', () => {
        try {
          resolve(JSON.parse(input));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    });
  }

  summarizeTool(toolName, toolInput) {
    // Tool summarization logic would be extracted from bin/afk
    const cmd = toolInput.command || '';
    if (cmd) {
      return `${toolName}: ${cmd.length > 100 ? cmd.substring(0, 100) + '...' : cmd}`;
    }
    return toolName;
  }

  generatePermissionPattern(toolName, toolInput) {
    // Permission pattern generation logic would be extracted from bin/afk
    if (toolInput.command) {
      return [`bash:${toolInput.command}`];
    }
    return [toolName.toLowerCase()];
  }

  checkToolPermissions(toolName, toolInput, cwd) {
    // Permission checking logic would be extracted from bin/afk
    // This is a placeholder - the actual implementation would call permissionsService
    return null;
  }

  /**
   * Helper function to generate beautiful diff image from diff content
   * @param {string} diffContent - The diff content to render
   * @param {string} title - Title for the diff image
   * @returns {string|null} Path to generated image or null
   */
  async generateBeautifulDiffFromContent(diffContent, title = 'Preview of Proposed Changes') {
    try {
      // For now, create a temporary file with the diff content and use existing generate-and-read-diff.js
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const { execSync } = require('child_process');

      // Write diff content to a temporary location and use the existing generator
      const tempFile = path.join(os.tmpdir(), `preview-diff-${Date.now()}.txt`);
      fs.writeFileSync(tempFile, diffContent);
      
      // Use the existing generate-and-read-diff.js script with the diff content
      const scriptPath = path.join(__dirname, '../../generate-and-read-diff.js');
      
      try {
        // Execute the generation script in a way that uses our diff content
        const result = execSync(`echo '${diffContent.replace(/'/g, "\\'").replace(/"/g, '\\"')}' | git apply --check --reverse 2>/dev/null || true && node "${scriptPath}"`, {
          cwd: process.cwd(),
          timeout: 30000,
          stdio: ['inherit', 'pipe', 'pipe'],
          maxBuffer: 100000
        });
        
        // Check if the generated image exists
        const imagePath = path.join(process.cwd(), 'generated-diff-image.png');
        if (fs.existsSync(imagePath)) {
          // Copy to temp location for preview
          const previewPath = path.join(os.tmpdir(), `afk-preview-${Date.now()}.png`);
          fs.copyFileSync(imagePath, previewPath);
          this.logger.eprint(`[afk] Preview diff image generated at ${previewPath}`);
          return previewPath;
        }
      } catch (scriptError) {
        this.logger.debugLog('DIFF_GENERATION', 'Error running diff generation script', { error: scriptError.message });
      } finally {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup error
        }
      }
      
      return null;

    } catch (error) {
      this.logger.debugLog('DIFF_GENERATION', 'Error generating beautiful preview diff', { error: error.message });
      return null;
    }
  }

  /**
   * Generate diff image with syntax highlighting using beautiful generator
   * @param {string} cwd - Current working directory
   * @returns {string|null} Path to generated image or null
   */
  async generateDiffImage(cwd) {
    try {
      // Check if diff image generation is disabled
      if (process.env.AFK_DISABLE_DIFF_IMAGES === 'true') {
        this.logger.eprint('[afk] Diff image generation disabled via AFK_DISABLE_DIFF_IMAGES');
        return null;
      }

      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');

      // Check if there are any git changes
      const diff = execSync('git diff', { cwd, encoding: 'utf8', maxBuffer: 100000, stdio: ['inherit', 'pipe', 'pipe'] }).trim();
      if (!diff) {
        this.logger.debugLog('DIFF_GENERATION', 'No git changes found, skipping diff image generation');
        return null;
      }

      this.logger.eprint('[afk] Generating beautiful diff image using generate-and-read-diff.js');

      // Get the directory where the afk binary is located  
      const afkDir = path.dirname(require.main.filename);
      const generatorScript = path.join(afkDir, '..', 'generate-and-read-diff.js');
      
      // Fallback: try current working directory if script not found
      const fallbackScript = path.join(cwd, 'generate-and-read-diff.js');
      const scriptPath = fs.existsSync(generatorScript) ? generatorScript : fallbackScript;
      
      if (!fs.existsSync(scriptPath)) {
        this.logger.eprint(`[afk] generate-and-read-diff.js not found at ${scriptPath}, using fallback method`);
        return null;
      }

      // Run the beautiful diff generator
      execSync(`node "${scriptPath}"`, { 
        cwd, 
        stdio: ['inherit', 'pipe', 'pipe'],
        timeout: 30000
      });

      // Check if the image was generated
      const imagePath = path.join(cwd, 'generated-diff-image.png');
      if (fs.existsSync(imagePath)) {
        const stats = fs.statSync(imagePath);
        this.logger.eprint(`[afk] Generated beautiful diff image: ${imagePath} (${(stats.size / 1024).toFixed(1)} KB)`);
        return imagePath;
      } else {
        this.logger.eprint('[afk] Diff image generation completed but no image file found');
        return null;
      }

    } catch (error) {
      this.logger.debugLog('DIFF_GENERATION', 'Error generating diff image', { error: error.message });
      return null;
    }
  }

  generateFormattedDiff(cwd) {
    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      
      // Check if there are any git changes
      const diff = execSync('git diff', { cwd, encoding: 'utf8', maxBuffer: 100000, stdio: ['inherit', 'pipe', 'pipe'] }).trim();
      if (!diff) {
        return null;
      }
      
      // For now, return null to disable image generation and avoid photo send errors
      // TODO: Implement proper diff image generation
      return null;
    } catch (error) {
      // Suppress git diff errors to avoid stderr pollution
      this.logger.debugLog('DIFF_GENERATION', 'Git diff failed', { error: error.message });
      return null;
    }
  }

  extractConversationContext(transcriptPath, maxLines = 20) {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      return { error: 'No transcript available' };
    }
    
    try {
      const { execSync } = require('child_process');
      const lines = execSync(`tail -${maxLines} "${transcriptPath}"`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
      
      const recentMessages = [];
      let lastUserMessage = null;
      let lastAssistantMessage = null;
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (!entry.message || !entry.message.role) continue;
          
          const role = entry.message.role;
          const content = entry.message.content;
          
          let text = '';
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text') {
                text += item.text + ' ';
              } else if (item.type === 'tool_use') {
                text += `[${item.name}: ${item.input ? Object.keys(item.input)[0] || 'action' : 'call'}] `;
              }
            }
          } else if (typeof content === 'string') {
            text = content;
          }
          
          text = text.trim();
          if (text && text.length > 3) {
            const msg = {
              role,
              text: text,
              timestamp: entry.timestamp
            };
            
            recentMessages.push(msg);
            
            if (role === 'user') lastUserMessage = msg;
            else if (role === 'assistant') lastAssistantMessage = msg;
          }
        } catch (e) {
          continue;
        }
      }
      
      const contextMessages = recentMessages.slice(-6);
      
      return {
        lastUserMessage,
        lastAssistantMessage, 
        recentMessages: contextMessages,
        messageCount: contextMessages.length,
        totalLinesProcessed: lines.length
      };
    } catch (e) {
      return { error: `Failed to read transcript: ${e.message}` };
    }
  }

  analyzeClaudeIntent(context, toolName, toolInput) {
    if (!context.lastAssistantMessage) {
      return "No recent context available";
    }
    
    const lastText = context.lastAssistantMessage.text.toLowerCase();
    
    if (lastText.includes('let me') || lastText.includes('i\'ll') || lastText.includes('i need to')) {
      if (toolName === 'Write' || toolName === 'Edit') {
        return `💡 **Context:** Claude is working on file modifications`;
      } else if (toolName === 'Bash') {
        const cmd = toolInput.command || '';
        if (cmd.includes('test')) {
          return `💡 **Context:** Claude is running tests`;
        } else if (cmd.includes('build') || cmd.includes('compile')) {
          return `💡 **Context:** Claude is building the project`;
        } else if (cmd.includes('git')) {
          return `💡 **Context:** Claude is working with git`;
        }
        return `💡 **Context:** Claude is running commands`;
      }
    }
    
    if (lastText.includes('error') || lastText.includes('fix') || lastText.includes('debug')) {
      return `🔧 **Context:** Claude is debugging/fixing issues`;
    }
    
    if (lastText.includes('test') || lastText.includes('check')) {
      return `🧪 **Context:** Claude is testing functionality`;
    }
    
    if (lastText.includes('create') || lastText.includes('add') || lastText.includes('new')) {
      return `✨ **Context:** Claude is creating new functionality`;
    }
    
    return `🤖 **Context:** Claude is working on the project`;
  }
  
  shortSession(sessionId) {
    if (!sessionId) return '(unknown)';
    return String(sessionId).slice(-8);
  }

  async sendApprovalRequest(approvalId, toolName, toolInput, summary, patterns, label, sessionId, cwd, previewImagePath) {
    // Extract conversation context
    const context = this.extractConversationContext(data.transcript_path);
    const intent = this.analyzeClaudeIntent(context, toolName, toolInput);
    
    // Format pattern display for compound commands
    let patternText;
    if (Array.isArray(patterns)) {
      patternText = patterns.length > 3 ? 
        `${patterns.slice(0, 3).join('`, `')}... (+${patterns.length - 3} more)` :
        patterns.join('`, `');
    } else {
      patternText = patterns;
    }
    
    // Build context section
    let contextSection = '';
    if (intent !== "No recent context available") {
      contextSection += `\n${intent}\n`;
    }
    
    const text = `🤖 *Approval required* — ${label}\n${summary}${contextSection}\n\n_Pattern${Array.isArray(patterns) ? 's' : ''}:_ \`${patternText}\`\n_Session:_ \`${this.shortSession(sessionId)}\`\n_Dir:_ \`${cwd}\``;
    
    // Store metadata for Allow All functionality
    const metaFile = path.join(this.getApprovalDir(), `${approvalId}.meta`);
    fs.writeFileSync(metaFile, JSON.stringify({ patterns, toolName, toolInput, cwd, sessionId }));
    
    const keyboard = { inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `approve:${approvalId}` },
        { text: '❌ Deny', callback_data: `deny:${approvalId}` }
      ],
      [
        { text: '✅ Allow All', callback_data: `allow_all:${approvalId}` },
        { text: '🔧 Ask Claude UI', callback_data: `ask_ui:${approvalId}` }
      ]
    ] };
    
    let msgRes = null;
    if (previewImagePath) {
      // Send approval request with preview diff image
      try {
        let caption = text;
        if (caption.length > 1000) {
          caption = caption.substring(0, 997) + '...';
        }
        msgRes = await this.telegramService.sendPhoto(previewImagePath, caption, keyboard);
        this.logger.eprint(`[afk] Sent approval request with preview diff image`);
      } catch (photoError) {
        this.logger.eprint(`[afk] Failed to send preview image, falling back to text: ${photoError.message}`);
        msgRes = await this.telegramService.sendMessage(text, keyboard);
      }
    } else {
      msgRes = await this.telegramService.sendMessage(text, keyboard);
    }
    
    return msgRes;
  }

  async sendStopNotification(sessionId, label, cwd, context, diffImagePath) {
    // Build focused context
    let contextSection = '';
    if (context.recentMessages && context.recentMessages.length > 0 && !context.error) {
      contextSection += `\n\n💬 **What happened:**`;
      
      const messagesToShow = context.recentMessages.slice(-3);
      for (const msg of messagesToShow) {
        const roleIcon = msg.role === 'user' ? '👤' : '🤖';
        contextSection += `\n${roleIcon} ${msg.text}`;
      }
    }
    
    const text = `✅ *Agent finished* — ${label}${contextSection}\n\n_Session:_ \`${this.shortSession(sessionId)}\`\n\n**What next?**\n• Tap *Reply* to send a follow-up task\n• Tap *Finish* to close this session`;
    
    const keyboard = { inline_keyboard: [[
      { text: '💬 Reply', callback_data: `reply:${sessionId}` },
      { text: '✅ Finish', callback_data: `finish:${sessionId}` }
    ]] };
    
    let msgRes = null;
    if (diffImagePath) {
      try {
        let caption = text;
        if (caption.length > 1000) {
          caption = caption.substring(0, 997) + '...';
        }
        msgRes = await this.telegramService.sendPhoto(diffImagePath, caption, keyboard);
        this.logger.eprint(`[afk] Sent stop notice with diff image`);
      } catch (photoError) {
        this.logger.eprint(`[afk] Failed to send photo, falling back to text: ${photoError.message}`);
        msgRes = await this.telegramService.sendMessage(text, keyboard);
      }
    } else {
      msgRes = await this.telegramService.sendMessage(text, keyboard);
    }
    
    return msgRes;
  }

  async sendSessionStartNotification(sessionId, label, cwd, source) {
    let sourceText = '';
    switch (source) {
      case 'startup':
        sourceText = '🆕 **New session started**';
        break;
      case 'resume':
        sourceText = '🔄 **Session resumed**';
        break;
      case 'clear':
        sourceText = '🧹 **Session cleared & restarted**';
        break;
      default:
        sourceText = '🚀 **Session initialized**';
    }
    
    const text = `${sourceText} — ${label}\n_Session:_ \`${this.shortSession(sessionId)}\`\n_Dir:_ \`${cwd}\`\n\nTap *Reply* to send initial instructions, or *Finish* to proceed without input.`;
    
    const keyboard = { inline_keyboard: [[
      { text: '💬 Reply', callback_data: `reply:${sessionId}` },
      { text: '✅ Finish', callback_data: `finish:${sessionId}` }
    ]] };
    
    return await this.telegramService.sendMessage(text, keyboard);
  }

  async sendStopNotificationReadOnly(sessionId, label, cwd, context, diffImagePath) {
    // Build focused context
    let contextSection = '';
    if (context.recentMessages && context.recentMessages.length > 0 && !context.error) {
      contextSection += `\n\n💬 **What happened:**`;
      
      const messagesToShow = context.recentMessages.slice(-3);
      for (const msg of messagesToShow) {
        const roleIcon = msg.role === 'user' ? '👤' : '🤖';
        contextSection += `\n${roleIcon} ${msg.text}`;
      }
    }
    
    const text = `📖 *[Read-Only Mode]* Session completed — ${label}${contextSection}\n\n_Session:_ \`${this.shortSession(sessionId)}\`\n\n_Note: No action required. This is a notification only._`;
    
    // No interactive buttons in read-only mode
    let msgRes = null;
    if (diffImagePath) {
      try {
        let caption = text;
        if (caption.length > 1000) {
          caption = caption.substring(0, 997) + '...';
        }
        msgRes = await this.telegramService.sendPhoto(diffImagePath, caption);
        this.logger.eprint(`📖 [afk] Sent read-only stop notification with diff image`);
      } catch (photoError) {
        this.logger.eprint(`[afk] Failed to send photo, falling back to text: ${photoError.message}`);
        msgRes = await this.telegramService.sendMessage(text);
      }
    } else {
      msgRes = await this.telegramService.sendMessage(text);
    }
    
    return msgRes;
  }

  async sendSessionStartNotificationReadOnly(sessionId, label, cwd, source) {
    let sourceText = '';
    switch (source) {
      case 'startup':
        sourceText = '🆕 **New session started**';
        break;
      case 'resume':
        sourceText = '🔄 **Session resumed**';
        break;
      case 'clear':
        sourceText = '🧹 **Session cleared & restarted**';
        break;
      default:
        sourceText = '🚀 **Session initialized**';
    }
    
    const text = `📖 *[Read-Only Mode]* ${sourceText} — ${label}\n_Session:_ \`${this.shortSession(sessionId)}\`\n_Dir:_ \`${cwd}\`\n\n_Note: No action required. This is a notification only._`;
    
    // No interactive buttons in read-only mode
    return await this.telegramService.sendMessage(text);
  }

  async waitForApproval(approvalId, sessionId, toolName, toolInput) {
    const configTimeout = this.configManager.cfg().timeout_seconds;
    const timeoutAction = this.configManager.cfg().timeout_action || 'deny';
    const timeout = configTimeout === 0 || configTimeout === -1 ? 999999 : Number(configTimeout || 3600);
    
    const hookId = `pretool-${approvalId}`;
    
    const messageFilter = (update) => {
      if (!update.callback_query) return false;
      const data = update.callback_query.data || '';
      return data.includes(approvalId);
    };
    
    const shouldWaitForever = timeoutAction === 'wait';
    const timeoutMs = shouldWaitForever ? 999999000 : timeout * 1000;
    
    this.logger.eprint(`[${hookId}] Waiting for user response...`);
    
    const update = await this.queueService.distributedTelegramPoll(messageFilter, hookId, sessionId, timeoutMs, {
      telegramService: this.telegramService,
      sessionsService: this.sessionsService,
      readMode: this.readMode.bind(this)
    });
    
    if (update && update.callback_query) {
      return await this.processToolApproval(update, approvalId, sessionId);
    }
    
    // Handle timeout
    if (timeoutAction === 'allow') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: `Auto-approved after ${timeout}s timeout`
        }
      };
    } else if (timeoutAction === 'deny') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Auto-denied after ${timeout}s timeout`
        }
      };
    }
    
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: 'Telegram timeout - delegating to Claude UI'
      }
    };
  }

  async waitForStopResponse(sessionId, cwd) {
    const timeout = Number(process.env.AFK_STOP_TIMEOUT || 21600);
    const hookId = `stop-${sessionId}`;
    
    const messageFilter = (update) => {
      if (update.callback_query) {
        const data = update.callback_query.data || '';
        return data.startsWith('reply:' + sessionId) || data.startsWith('finish:' + sessionId);
      }
      if (update.message && update.message.text && !update.message.text.startsWith('/')) {
        const chatId = String(update.message.chat.id);
        const { telegram_chat_id } = this.configManager.cfg();
        return chatId === String(telegram_chat_id);
      }
      return false;
    };
    
    this.logger.eprint(`🛑 [afk] Stop hook waiting for user response...`);
    
    const update = await this.queueService.distributedTelegramPoll(messageFilter, hookId, sessionId, timeout * 1000, {
      telegramService: this.telegramService,
      sessionsService: this.sessionsService,
      readMode: this.readMode.bind(this)
    });
    
    if (update && update.callback_query) {
      const callbackData = update.callback_query.data || '';
      
      if (callbackData.startsWith('reply:')) {
        // Handle full reply flow like the binary version
        try {
          await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'answerCallbackQuery', { 
            callback_query_id: update.callback_query.id 
          });
          
          // Clear any existing lock first, then set new one for this session
          this.sessionsService.clearReplyLock();
          this.sessionsService.setReplyLock(sessionId, update.callback_query.message.message_id);
          
          // Update buttons with Stop Waiting option
          await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageReplyMarkup', {
            chat_id: update.callback_query.message.chat.id,
            message_id: update.callback_query.message.message_id,
            reply_markup: JSON.stringify({ inline_keyboard: [[
              { text: '⏳ Waiting for your reply...', callback_data: 'waiting' },
              { text: '🛑 Stop Waiting', callback_data: `stop_wait:${sessionId}` }
            ]]})
          });
        } catch (e) {
          this.logger.eprint(`[${hookId}] Error updating message:`, e.message);
        }
        
        // Wait for text message - create more specific filter for text messages with session locking
        const textMessageFilter = (updateToCheck) => {
          if (updateToCheck.message && updateToCheck.message.text && !updateToCheck.message.text.startsWith('/')) {
            const chatId = String(updateToCheck.message.chat.id);
            const { telegram_chat_id } = this.configManager.cfg();
            
            // Only process messages from our configured chat
            if (chatId !== String(telegram_chat_id)) {
              return false;
            }
            
            // Only accept messages when explicitly waiting after Reply button
            if (!this.sessionsService.isMyMessage(sessionId, updateToCheck.message)) {
              return false;
            }
            
            // We got a message and we own the lock - accept it
            this.logger.eprint(`[${hookId}] Got text message after Reply button click`);
            this.sessionsService.clearReplyLock();
            return true;
          }
          return false;
        };
        
        const textUpdate = await this.queueService.distributedTelegramPoll(textMessageFilter, hookId + '-text', sessionId, timeout * 1000, {
          telegramService: this.telegramService,
          sessionsService: this.sessionsService,
          readMode: this.readMode.bind(this)
        });
        
        if (textUpdate && textUpdate.message && textUpdate.message.text) {
          const userText = textUpdate.message.text;
          this.logger.eprint(`💬 [afk] Stop hook: Got user message, continuing conversation`);
          
          // Update buttons to show we got the message
          try {
            await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageReplyMarkup', {
              chat_id: update.callback_query.message.chat.id,
              message_id: update.callback_query.message.message_id,
              reply_markup: JSON.stringify({ inline_keyboard: [[
                { text: `💬 Received: "${userText.substring(0, 30)}${userText.length > 30 ? '...' : ''}"`, callback_data: 'received' }
              ]]})
            });
          } catch (e) {
            this.logger.eprint(`[${hookId}] Error updating message:`, e.message);
          }
          
          this.sessionsService.appendHistory({ type: 'reply', session_id: sessionId, text: userText });
          this.logger.eprint(`✅ [afk] Stop hook completed - injecting user message into conversation`);
          
          // User clicked Reply - they want to continue with their message
          // Inject the message and let Claude continue
          process.stderr.write(`User replied via Telegram: "${userText}". Continue the conversation with this input.`);
          process.exit(2);
        }
        
      } else if (callbackData.startsWith('finish:')) {
        // User wants to finish - allow Claude to stop
        try {
          await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'answerCallbackQuery', { 
            callback_query_id: update.callback_query.id 
          });
          // Just update buttons to show session finished
          await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageReplyMarkup', {
            chat_id: update.callback_query.message.chat.id,
            message_id: update.callback_query.message.message_id,
            reply_markup: JSON.stringify({ inline_keyboard: [[
              { text: '✅ Session finished', callback_data: 'finished' }
            ]]})
          });
        } catch (e) {
          this.logger.eprint(`[${hookId}] Error updating message:`, e.message);
        }
        
        this.sessionsService.appendHistory({ type: 'finish', session_id: sessionId });
        this.logger.eprint(`✅ [afk] Stop hook completed - session finished`);
        
        return {};
      }
    }
    
    return {};
  }

  async handleUserPromptSubmit(data) {
    const prompt = String(data.prompt || '').trim();
    const sessionId = data.session_id;
    const cwd = data.cwd;
    
    // Only handle /afk commands
    if (!prompt.startsWith('/afk')) {
      return {}; // Let Claude handle other commands normally
    }
    
    // Parse both formats: "/afk:on" and "/afk on"
    let subcommand, args;
    
    if (prompt.includes(':')) {
      // New format: /afk:on
      const colonIndex = prompt.indexOf(':');
      const afterColon = prompt.slice(colonIndex + 1);
      const parts = afterColon.split(/\s+/);
      subcommand = parts[0] || 'global';
      args = parts.slice(1).join(' ');
    } else {
      // Plain /afk - global toggle
      const parts = prompt.slice(1).split(/\s+/); // Remove leading '/'
      if (parts.length === 1) {
        subcommand = 'global'; // /afk alone = global toggle
        args = '';
      } else {
        subcommand = parts[1] || 'global';
        args = parts.slice(2).join(' ');
      }
    }
    
    // Get current mode at all levels
    const sessionMode = this.getSessionMode(sessionId);
    const projectMode = this.getProjectMode(cwd);
    const globalMode = this.configManager.readMode();
    const effectiveMode = sessionMode || projectMode || globalMode || 'local';
    
    let message = '';
    
    switch(subcommand) {
      case 'on':
        // Explicit enable - affects global mode
        this.configManager.writeMode('remote');
        message = `✅ Remote mode enabled globally`;
        break;
        
      case 'off':
        // Explicit disable - affects global mode
        this.configManager.writeMode('local');
        message = `✅ Local mode enabled globally`;
        break;
        
      case 'readonly':
        // Enable read-only mode - affects global mode
        this.configManager.writeMode('readonly');
        message = `📖 Read-only mode enabled globally - notifications without blocking`;
        break;
        
      case 'status':
        const lines = ['📊 **AFK Mode Status**'];
        if (cwd) {
          lines.push(`Project: ${projectMode || '(not set)'}`);
        }
        lines.push(`Global: ${globalMode}`);
        lines.push(`**Current effective mode: ${effectiveMode.toUpperCase()}**`);
        message = lines.join('\n');
        break;
        
      case 'global':
        // Toggle global mode (same as plain /afk) - toggle between local and remote only
        let newGlobal;
        if (globalMode === 'local') {
          newGlobal = 'remote';
        } else {
          // From remote or readonly, go to local
          newGlobal = 'local';
        }
        this.configManager.writeMode(newGlobal);
        message = `✅ Global AFK mode toggled to ${newGlobal.toUpperCase()}`;
        break;
        
      case 'project':
        // Toggle project mode - toggle between remote and local (clear when local)
        let newProject;
        if (!projectMode) {
          newProject = 'remote'; // Start with remote if not set
        } else if (projectMode === 'remote') {
          newProject = 'local';
        } else if (projectMode === 'local') {
          newProject = null; // Clear project override
        } else {
          // From readonly, go to local
          newProject = 'local';
        }
        
        if (newProject === null) {
          this.clearProjectMode(cwd);
          message = `✅ Project override cleared for ${path.basename(cwd)} - using global mode`;
        } else {
          this.setProjectMode(cwd, newProject);
          message = `✅ Project mode set to ${newProject.toUpperCase()} for ${path.basename(cwd)}`;
        }
        break;
        
      case 'help':
        message = [
          '**AFK Commands:**',
          '`/afk` - Toggle global AFK mode (local ↔ remote)',
          '`/afk:on` - Enable remote mode globally',
          '`/afk:off` - Disable remote mode globally',
          '`/afk:readonly` - Enable read-only mode globally',
          '`/afk:status` - Show current mode status',
          '`/afk:global` - Toggle global mode (same as /afk)',
          '`/afk:project` - Toggle project-specific mode',
          '`/afk:help` - Show this help',
          '',
          '**Modes:**',
          '• **Local**: No notifications, Claude prompts only',
          '• **Remote**: Telegram approvals required for tools',
          '• **Read-only**: Notifications without blocking (enable with `/afk:readonly`)',
          '',
          '**Mode hierarchy:** Session > Project > Global'
        ].join('\n');
        break;
        
      default:
        message = `Unknown AFK command: ${subcommand}. Try /afk:help`;
    }
    
    // Return response that Claude will display
    return {
      systemMessage: message,
      suppressOutput: true // Don't show the markdown file content
    };
  }
  
  // Helper methods for mode management
  getSessionMode(sessionId) {
    const sessionDir = path.join(this.configManager.configDir, 'sessions', sessionId);
    const modeFile = path.join(sessionDir, 'mode');
    try {
      if (fs.existsSync(modeFile)) {
        return fs.readFileSync(modeFile, 'utf8').trim();
      }
    } catch (e) {
      this.logger.debugLog('SESSION_MODE', 'Failed to read session mode', { error: e.message });
    }
    return null;
  }
  
  setSessionMode(sessionId, mode) {
    const sessionDir = path.join(this.configManager.configDir, 'sessions', sessionId);
    const modeFile = path.join(sessionDir, 'mode');
    try {
      this.utils.ensureDir(sessionDir);
      fs.writeFileSync(modeFile, mode);
      this.logger.debugLog('SESSION_MODE', 'Session mode set', { sessionId, mode });
    } catch (e) {
      this.logger.eprint('Failed to set session mode:', e.message);
    }
  }
  
  clearSessionMode(sessionId) {
    const sessionDir = path.join(this.configManager.configDir, 'sessions', sessionId);
    const modeFile = path.join(sessionDir, 'mode');
    try {
      if (fs.existsSync(modeFile)) {
        fs.unlinkSync(modeFile);
        this.logger.debugLog('SESSION_MODE', 'Session mode cleared', { sessionId });
      }
    } catch (e) {
      this.logger.eprint('Failed to clear session mode:', e.message);
    }
  }
  
  getProjectMode(cwd) {
    if (!cwd) return null;
    
    // Check for .afk/mode in project directory
    const projectModeFile = path.join(cwd, '.afk', 'mode');
    try {
      if (fs.existsSync(projectModeFile)) {
        return fs.readFileSync(projectModeFile, 'utf8').trim();
      }
    } catch (e) {
      this.logger.debugLog('PROJECT_MODE', 'Failed to read project mode', { error: e.message });
    }
    
    // Also check .claude/afk-mode for compatibility
    const claudeModeFile = path.join(cwd, '.claude', 'afk-mode');
    try {
      if (fs.existsSync(claudeModeFile)) {
        return fs.readFileSync(claudeModeFile, 'utf8').trim();
      }
    } catch (e) {
      this.logger.debugLog('PROJECT_MODE', 'Failed to read .claude mode', { error: e.message });
    }
    
    return null;
  }
  
  setProjectMode(cwd, mode) {
    if (!cwd) return;
    
    const projectDir = path.join(cwd, '.afk');
    const modeFile = path.join(projectDir, 'mode');
    try {
      this.utils.ensureDir(projectDir);
      fs.writeFileSync(modeFile, mode);
      this.logger.debugLog('PROJECT_MODE', 'Project mode set', { cwd, mode });
    } catch (e) {
      this.logger.eprint('Failed to set project mode:', e.message);
    }
  }
  
  clearProjectMode(cwd) {
    if (!cwd) return;
    
    const modeFile = path.join(cwd, '.afk', 'mode');
    try {
      if (fs.existsSync(modeFile)) {
        fs.unlinkSync(modeFile);
        this.logger.debugLog('PROJECT_MODE', 'Project mode cleared', { cwd });
      }
    } catch (e) {
      this.logger.eprint('Failed to clear project mode:', e.message);
    }
  }
  
  // Updated method to get effective mode with hierarchy
  getEffectiveMode(sessionId, cwd) {
    const sessionMode = this.getSessionMode(sessionId);
    if (sessionMode) {
      this.logger.debugLog('EFFECTIVE_MODE', 'Using session mode', { sessionId, mode: sessionMode });
      return sessionMode;
    }
    
    const projectMode = this.getProjectMode(cwd);
    if (projectMode) {
      this.logger.debugLog('EFFECTIVE_MODE', 'Using project mode', { cwd, mode: projectMode });
      return projectMode;
    }
    
    const globalMode = this.configManager.readMode();
    this.logger.debugLog('EFFECTIVE_MODE', 'Using global mode', { mode: globalMode });
    return globalMode;
  }

  async waitForSessionStartResponse(sessionId, cwd) {
    const timeout = Number(process.env.AFK_SESSIONSTART_TIMEOUT || 21600);
    const hookId = `sessionstart-${sessionId}`;
    
    const messageFilter = (update) => {
      if (update.callback_query) {
        const data = update.callback_query.data || '';
        return data.startsWith('reply:' + sessionId) || data.startsWith('finish:' + sessionId);
      }
      if (update.message && update.message.text && !update.message.text.startsWith('/')) {
        const chatId = String(update.message.chat.id);
        const { telegram_chat_id } = this.configManager.cfg();
        return chatId === String(telegram_chat_id);
      }
      return false;
    };
    
    this.logger.eprint(`⏳ [afk] SessionStart hook waiting for user response...`);
    
    const update = await this.queueService.distributedTelegramPoll(messageFilter, hookId, sessionId, timeout * 1000, {
      telegramService: this.telegramService,
      sessionsService: this.sessionsService,
      readMode: this.readMode.bind(this)
    });
    
    if (update && update.callback_query) {
      const callbackData = update.callback_query.data || '';
      if (callbackData.startsWith('reply:')) {
        // Handle full reply flow for initial instructions
        try {
          await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'answerCallbackQuery', { 
            callback_query_id: update.callback_query.id 
          });
          
          // Clear any existing lock first, then set new one for this session
          this.sessionsService.clearReplyLock();
          this.sessionsService.setReplyLock(sessionId, update.callback_query.message.message_id);
          
          // Update buttons with waiting state
          await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageReplyMarkup', {
            chat_id: update.callback_query.message.chat.id,
            message_id: update.callback_query.message.message_id,
            reply_markup: JSON.stringify({ inline_keyboard: [[
              { text: '⏳ Waiting for your instructions...', callback_data: 'waiting' },
              { text: '🛑 Stop Waiting', callback_data: `stop_wait:${sessionId}` }
            ]]})
          });
        } catch (e) {
          this.logger.eprint(`[${hookId}] Error updating message:`, e.message);
        }
        
        // Wait for text message with session locking
        const textMessageFilter = (updateToCheck) => {
          if (updateToCheck.message && updateToCheck.message.text && !updateToCheck.message.text.startsWith('/')) {
            const chatId = String(updateToCheck.message.chat.id);
            const { telegram_chat_id } = this.configManager.cfg();
            
            // Only process messages from our configured chat
            if (chatId !== String(telegram_chat_id)) {
              return false;
            }
            
            // Only accept messages when explicitly waiting after Reply button
            if (!this.sessionsService.isMyMessage(sessionId, updateToCheck.message)) {
              return false;
            }
            
            // We got a message and we own the lock - accept it
            this.logger.eprint(`[${hookId}] Got initial instructions after Reply button click`);
            this.sessionsService.clearReplyLock();
            return true;
          }
          return false;
        };
        
        const textUpdate = await this.queueService.distributedTelegramPoll(textMessageFilter, hookId + '-text', sessionId, timeout * 1000, {
          telegramService: this.telegramService,
          sessionsService: this.sessionsService,
          readMode: this.readMode.bind(this)
        });
        
        if (textUpdate && textUpdate.message && textUpdate.message.text) {
          const userText = textUpdate.message.text;
          this.logger.eprint(`💬 [afk] SessionStart: Got initial instructions`);
          
          try {
            await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageReplyMarkup', {
              chat_id: update.callback_query.message.chat.id,
              message_id: update.callback_query.message.message_id,
              reply_markup: JSON.stringify({ inline_keyboard: [[
                { text: `💬 Received: "${userText.substring(0, 30)}${userText.length > 30 ? '...' : ''}"`, callback_data: 'received' }
              ]]})
            });
          } catch (e) {
            this.logger.eprint(`[${hookId}] Error updating message:`, e.message);
          }
          
          this.sessionsService.appendHistory({ type: 'session_start_reply', session_id: sessionId, text: userText });
          this.logger.eprint(`✅ [afk] SessionStart: Injecting initial instructions`);
          
          // Inject the initial instructions
          process.stderr.write(`User provided initial instructions via Telegram: "${userText}". Start the session with this input.`);
          process.exit(2);
        }
        
      } else if (callbackData.startsWith('finish:')) {
        // User wants to proceed without input
        try {
          await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'answerCallbackQuery', { 
            callback_query_id: update.callback_query.id 
          });
          
          await this.telegramService.tgApiWithToken(this.configManager.cfg().telegram_bot_token, 'editMessageReplyMarkup', {
            chat_id: update.callback_query.message.chat.id,
            message_id: update.callback_query.message.message_id,
            reply_markup: JSON.stringify({ inline_keyboard: [[
              { text: '✅ Session started', callback_data: 'started' }
            ]]})
          });
        } catch (e) {
          this.logger.eprint(`[${hookId}] Error updating message:`, e.message);
        }
        
        return {};
      }
    }
    
    return {};
  }
}

// Functional exports for backward compatibility
async function handlePreToolUse(data) {
  // This would need to be initialized with dependencies
  throw new Error('handlePreToolUse function requires service dependencies - use ClaudeHooksService instead');
}

async function handleStop(data) {
  throw new Error('handleStop function requires service dependencies - use ClaudeHooksService instead');
}

async function handleSessionStart(data) {
  throw new Error('handleSessionStart function requires service dependencies - use ClaudeHooksService instead');
}

function shouldHandleCommand(toolName, autoApproveTools = []) {
  const defaultAutoApprove = [
    'Read', 'Grep', 'Glob', 'LS', 'TodoWrite', 
    'ExitPlanMode', 'Task'
  ];
  const allAutoApprove = [...defaultAutoApprove, ...autoApproveTools];
  return !allAutoApprove.includes(toolName);
}

function formatToolDisplay(toolName, toolInput) {
  const toolCmd = toolInput.command || '';
  const shortCmd = toolCmd.length > 50 ? toolCmd.substring(0, 50) + '...' : toolCmd;
  return `${toolName}${shortCmd ? `: ${shortCmd}` : ''}`;
}

module.exports = {
  ClaudeHooksService,
  // Functional exports
  handlePreToolUse,
  handleStop,
  handleSessionStart,
  shouldHandleCommand,
  formatToolDisplay
};