#!/usr/bin/env node
/**
 * Node.js AI Agent with AFK Integration
 * Uses child_process.spawn to call AFK binary for remote approval
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AFKIntegration {
  constructor(sessionId = null) {
    this.sessionId = sessionId || `nodejs-${process.pid}`;
    this.cwd = process.cwd();
  }

  /**
   * Request approval for an action using afk binary
   * @param {string} actionName - Name of the action to approve
   * @param {Object} actionParams - Parameters for the action
   * @returns {Promise<boolean>} - True if approved, false if denied
   */
  async requestApproval(actionName, actionParams) {
    const hookInput = {
      tool_name: actionName,
      tool_input: actionParams,
      session_id: this.sessionId,
      cwd: this.cwd,
      transcript_path: `/tmp/${this.sessionId}.jsonl`
    };

    try {
      const result = await this._runAfkCommand(['hook', 'pretooluse'], hookInput, 300000); // 5 min timeout
      
      // Return codes: 0=approved, 2=denied, 1=error
      return result.exitCode === 0;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('❌ AFK binary not found. Install with: npm install -g @probelabs/afk');
        return false;
      } else if (error.signal === 'SIGTERM') {
        console.log(`⏰ Approval timeout for ${actionName}`);
        return false;
      } else {
        console.log(`🚨 AFK integration error: ${error.message}`);
        return false;
      }
    }
  }

  /**
   * Notify AFK of session start
   */
  async notifySessionStart() {
    const hookInput = {
      session_id: this.sessionId,
      cwd: this.cwd,
      transcript_path: `/tmp/${this.sessionId}.jsonl`
    };

    try {
      await this._runAfkCommand(['hook', 'sessionstart'], hookInput);
    } catch (error) {
      // Silently fail for session notifications
    }
  }

  /**
   * Notify AFK of session end
   */
  async notifySessionEnd() {
    const hookInput = {
      session_id: this.sessionId,
      cwd: this.cwd,
      stop_hook_active: true
    };

    try {
      await this._runAfkCommand(['hook', 'stop'], hookInput);
    } catch (error) {
      // Silently fail for session notifications
    }
  }

  /**
   * Internal method to run AFK command with JSON input
   * @private
   */
  _runAfkCommand(args, input, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const child = spawn('afk', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Set timeout
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Timeout'));
      }, timeout);

      child.on('close', () => {
        clearTimeout(timer);
      });

      // Send JSON input
      child.stdin.write(JSON.stringify(input, null, 2));
      child.stdin.end();
    });
  }
}

class SimpleAIAgent {
  constructor() {
    this.afk = new AFKIntegration('simple-ai-agent-js');
    this.afk.notifySessionStart();
    console.log('🤖 Node.js AI Agent started with AFK remote control');
  }

  /**
   * Execute JavaScript code with approval
   */
  async executeCode(code) {
    // Truncate code for mobile display
    const displayCode = code.length > 200 ? code.substring(0, 200) + '...' : code;
    
    const approved = await this.afk.requestApproval('execute_code', {
      code: displayCode,
      language: 'javascript'
    });

    if (approved) {
      console.log('✅ Code execution approved');
      console.log(`Executing: ${code}`);
      try {
        // Use eval for demo purposes (normally you'd want safer execution)
        const result = eval(code);
        console.log(`📤 Result: ${result}`);
      } catch (error) {
        console.log(`❌ Execution error: ${error.message}`);
      }
    } else {
      console.log('❌ Code execution denied by user');
    }
  }

  /**
   * Write file with approval
   */
  async writeFile(filepath, content) {
    // Truncate content for mobile display
    const displayContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
    
    const approved = await this.afk.requestApproval('write_file', {
      filepath,
      content: displayContent,
      size: content.length
    });

    if (approved) {
      console.log(`✅ File write approved: ${filepath}`);
      fs.writeFileSync(filepath, content);
      console.log(`📄 File written: ${filepath}`);
    } else {
      console.log(`❌ File write denied: ${filepath}`);
    }
  }

  /**
   * Execute shell command with approval
   */
  async shellCommand(command) {
    const approved = await this.afk.requestApproval('shell_command', {
      command
    });

    if (approved) {
      console.log(`✅ Shell command approved: ${command}`);
      
      return new Promise((resolve) => {
        const child = spawn('sh', ['-c', command], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          if (stdout) console.log(`📤 Output: ${stdout.trim()}`);
          if (stderr) console.log(`⚠️ Stderr: ${stderr.trim()}`);
          resolve({ code, stdout, stderr });
        });
      });
    } else {
      console.log(`❌ Shell command denied: ${command}`);
    }
  }

  /**
   * Analyze data (low-risk, auto-approved)
   */
  analyzeData(data) {
    // This is a safe operation, no approval needed
    console.log(`📊 Analyzing ${data.length} data points...`);
    
    // Simulate data analysis
    const avg = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;
    const max = data.length > 0 ? Math.max(...data) : 0;
    const min = data.length > 0 ? Math.min(...data) : 0;
    
    console.log('📈 Analysis complete:');
    console.log(`   Average: ${avg.toFixed(2)}`);
    console.log(`   Max: ${max}`);
    console.log(`   Min: ${min}`);
  }

  /**
   * Clean shutdown with session end notification
   */
  async shutdown() {
    console.log('🏁 AI Agent shutting down...');
    await this.afk.notifySessionEnd();
  }
}

/**
 * Demonstrate the AI agent with various operations
 */
async function demo() {
  const agent = new SimpleAIAgent();
  
  try {
    console.log('\n--- Demo: Safe Operations (No Approval Needed) ---');
    agent.analyzeData([1, 2, 3, 4, 5, 10, 15, 20]);
    
    console.log('\n--- Demo: Risky Operations (Approval Required) ---');
    
    // Code execution (high risk)
    await agent.executeCode("console.log('Hello from approved Node.js code!')");
    
    // File writing (medium risk)
    await agent.writeFile('/tmp/ai_agent_test.txt', 'This file was created by the Node.js AI agent after user approval.');
    
    // Shell commands (high risk)
    await agent.shellCommand("echo 'Hello from approved shell command'");
    await agent.shellCommand('ls -la /tmp/ai_agent_test.txt');
    
    // Dangerous command (should be denied)
    console.log('\n--- Demo: Dangerous Operation ---');
    await agent.shellCommand('rm -rf /'); // This should be denied!
    
  } catch (error) {
    if (error.message === 'SIGINT') {
      console.log('\n🛑 Interrupted by user');
    } else {
      console.error('❌ Demo error:', error.message);
    }
  } finally {
    await agent.shutdown();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run demo if this file is executed directly
if (require.main === module) {
  console.log('🚀 Node.js AI Agent with AFK Integration');
  console.log('This demo shows how to integrate any Node.js AI with AFK remote control');
  console.log('Make sure you have AFK installed: npm install -g @probelabs/afk');
  console.log('And configured: afk setup');
  console.log();
  
  demo().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { AFKIntegration, SimpleAIAgent };