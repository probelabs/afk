#!/usr/bin/env node
// Centralized process mocking for AFK tests
// Handles child_process.execSync, stdin/stdout simulation, and environment variables

const { execSync } = require('child_process');

class ProcessMock {
  constructor() {
    this.commands = new Map();
    this.executions = [];
    this.originalExecSync = execSync;
    this.originalProcessStdin = process.stdin;
    this.originalProcessStdout = process.stdout;
    this.originalProcessEnv = { ...process.env };
    this.isActive = false;
    this.stdinData = '';
    this.stdoutData = [];
  }

  // Activate the mock system
  activate() {
    if (this.isActive) return;

    this.isActive = true;
    const self = this;

    // Mock child_process.execSync
    require('child_process').execSync = function(command, options = {}) {
      const execution = {
        command,
        options,
        timestamp: Date.now()
      };

      self.executions.push(execution);

      // Check for command-specific responses
      const response = self._getCommandResponse(command);
      
      if (response.error) {
        const error = new Error(response.error.message || 'Command failed');
        error.status = response.error.code || 1;
        error.signal = response.error.signal || null;
        error.cmd = command;
        throw error;
      }

      if (response.timeout) {
        const error = new Error(`Command timed out: ${command}`);
        error.killed = true;
        error.signal = 'SIGTERM';
        error.cmd = command;
        throw error;
      }

      return response.output || '';
    };

    // Note: We can't directly override process.stdin/stdout in modern Node.js
    // So we'll just track stdin data for hook testing
    // The hook implementation would need to be adapted to use our stdin simulation
  }

  // Deactivate the mock system
  deactivate() {
    if (!this.isActive) return;

    // Restore original functions
    require('child_process').execSync = this.originalExecSync;
    
    // Restore environment
    process.env = { ...this.originalProcessEnv };

    this.isActive = false;
    this.clear();
  }

  // Set response for a command pattern
  setCommandResponse(pattern, output, options = {}) {
    this.commands.set(pattern, {
      output: output,
      error: options.error || null,
      timeout: options.timeout || false
    });
  }

  // Set error response for command
  setCommandError(pattern, error, code = 1) {
    this.commands.set(pattern, {
      output: '',
      error: { message: error, code },
      timeout: false
    });
  }

  // Set timeout for command
  setCommandTimeout(pattern) {
    this.commands.set(pattern, {
      output: '',
      error: null,
      timeout: true
    });
  }

  // Get command executions
  getExecutions() {
    return [...this.executions];
  }

  // Clear all mock data
  clear() {
    this.commands.clear();
    this.executions = [];
    this.stdinData = '';
    this.stdoutData = [];
  }

  // Set stdin data for hook testing
  setStdinData(data) {
    this.stdinData = typeof data === 'string' ? data : JSON.stringify(data);
  }

  // Get stdout data
  getStdoutData() {
    return this.stdoutData.join('');
  }

  // Clear stdout data
  clearStdout() {
    this.stdoutData = [];
  }

  // Set environment variable
  setEnv(key, value) {
    process.env[key] = value;
  }

  // Helper to match command patterns
  _getCommandResponse(command) {
    // Try exact match first
    if (this.commands.has(command)) {
      return this.commands.get(command);
    }

    // Try pattern matching
    for (const [pattern, response] of this.commands.entries()) {
      if (command.includes(pattern) || this._matchPattern(command, pattern)) {
        return response;
      }
    }

    // Default responses for common commands
    return this._getDefaultResponse(command);
  }

  // Pattern matching helper
  _matchPattern(command, pattern) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(command);
    }
    return command.includes(pattern);
  }

  // Default responses for common commands
  _getDefaultResponse(command) {
    // Git commands
    if (command.startsWith('git diff')) {
      return {
        output: `diff --git a/test.js b/test.js
new file mode 100644
index 0000000..3072445
--- /dev/null
+++ b/test.js
@@ -0,0 +1 @@
+console.log("test");`,
        error: null,
        timeout: false
      };
    }

    if (command.startsWith('git status')) {
      return {
        output: `On branch main
Changes to be committed:
  (use "git reset HEAD <file>..." to unstage)

        new file:   test.js`,
        error: null,
        timeout: false
      };
    }

    // Chrome/Puppeteer commands
    if (command.includes('which google-chrome') || command.includes('which chromium')) {
      return {
        output: '/usr/bin/google-chrome',
        error: null,
        timeout: false
      };
    }

    // Node.js script execution
    if (command.includes('generate-and-read-diff.js')) {
      return {
        output: 'Generated diff image successfully',
        error: null,
        timeout: false
      };
    }

    // Default empty response
    return {
      output: '',
      error: null,
      timeout: false
    };
  }
}

// Hook JSON protocol helpers
class HookProtocol {
  static createHookInput(hookType, data) {
    const baseData = {
      session_id: data.session_id || 'test-session-12345',
      cwd: data.cwd || '/test/project',
      transcript_path: data.transcript_path || '/tmp/transcript.jsonl',
      ...data
    };

    if (hookType === 'pretooluse') {
      return {
        tool_name: data.tool_name || 'Edit',
        tool_input: data.tool_input || { file_path: 'test.js', old_string: 'old', new_string: 'new' },
        ...baseData
      };
    }

    if (hookType === 'stop') {
      return {
        stop_hook_active: data.stop_hook_active !== undefined ? data.stop_hook_active : true,
        ...baseData
      };
    }

    if (hookType === 'sessionstart') {
      return baseData;
    }

    return baseData;
  }

  static parseHookOutput(output) {
    try {
      return JSON.parse(output);
    } catch (e) {
      return { error: 'Invalid JSON output', raw: output };
    }
  }

  static validatePreToolUseOutput(output) {
    const parsed = this.parseHookOutput(output);
    
    if (parsed.error) return { valid: false, error: parsed.error };
    
    if (!parsed.hookSpecificOutput) {
      return { valid: false, error: 'Missing hookSpecificOutput' };
    }

    const hso = parsed.hookSpecificOutput;
    
    if (!['allow', 'ask', 'deny'].includes(hso.decision)) {
      return { valid: false, error: `Invalid decision: ${hso.decision}` };
    }

    if (typeof hso.message !== 'string') {
      return { valid: false, error: 'Missing or invalid message' };
    }

    return { valid: true, output: parsed };
  }
}

// Configuration helpers for common scenarios
function setupGitRepository(processMock) {
  processMock.setCommandResponse('git diff', `diff --git a/test.js b/test.js
new file mode 100644
index 0000000..3072445
--- /dev/null
+++ b/test.js
@@ -0,0 +1 @@
+console.log("Hello World");`);

  processMock.setCommandResponse('git status', `On branch main
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git checkout -- <file>..." to discard changes in working directory)

        modified:   test.js`);
}

function setupChromePath(processMock) {
  processMock.setCommandResponse('which google-chrome', '/usr/bin/google-chrome');
  processMock.setCommandResponse('which chromium', '/usr/bin/chromium');
}

function setupDiffGeneration(processMock, success = true) {
  if (success) {
    processMock.setCommandResponse('generate-and-read-diff.js', 'Generated diff image: /test/generated-diff-image.png');
  } else {
    processMock.setCommandError('generate-and-read-diff.js', 'Failed to generate diff image');
  }
}

function mockHookExecution(processMock, hookType, input, expectedOutput) {
  const inputJson = JSON.stringify(HookProtocol.createHookInput(hookType, input));
  const outputJson = JSON.stringify(expectedOutput);
  
  processMock.setStdinData(inputJson);
  
  return {
    input: inputJson,
    expectedOutput: outputJson,
    validate: () => HookProtocol.validatePreToolUseOutput(processMock.getStdoutData())
  };
}

module.exports = {
  ProcessMock,
  HookProtocol,
  setupGitRepository,
  setupChromePath,
  setupDiffGeneration,
  mockHookExecution
};