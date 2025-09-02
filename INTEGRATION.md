# AFK Integration Guide

Transform any AI agent into a remotely controllable system using the AFK binary. No SDK required - just simple shell commands.

## Quick Start

### 1. Install AFK

```bash
npm install -g @probelabs/afk
afk setup  # Configure Telegram bot
```

### 2. Test Integration

```bash
# Test approval request
afk hook pretooluse << 'EOF'
{
  "tool_name": "test_tool",
  "tool_input": {"action": "test"},
  "session_id": "test-session",
  "cwd": "/tmp"
}
EOF
```

### 3. Integrate Your AI System

Pick your integration pattern and start building!

## Integration Patterns

### Pattern 1: Shell Command Integration

**When to use**: Any system that can execute shell commands

```python
# Python example
import subprocess
import json

def request_approval(tool_name, tool_input, session_id):
    hook_input = {
        "tool_name": tool_name,
        "tool_input": tool_input,
        "session_id": session_id,
        "cwd": os.getcwd(),
        "transcript_path": "/tmp/transcript.jsonl"
    }
    
    result = subprocess.run(
        ['afk', 'hook', 'pretooluse'],
        input=json.dumps(hook_input),
        text=True,
        capture_output=True
    )
    
    if result.returncode == 0:
        return True  # Approved
    elif result.returncode == 2:
        return False  # Denied
    else:
        raise Exception(f"AFK error: {result.stderr}")

# Usage
if request_approval("dangerous_action", {"cmd": "rm -rf /"}, "session-123"):
    print("Action approved - executing...")
else:
    print("Action denied by user")
```

### Pattern 2: Hook Installation

**When to use**: Systems with plugin/hook architectures (like Claude Code)

```bash
# Install AFK hooks for your system
afk install user    # Global installation
afk install project --project-root /path/to/your/ai/project

# AFK will create settings.json with hooks:
# PreToolUse: /path/to/afk hook pretooluse  
# SessionStart: /path/to/afk hook sessionstart
# Stop: /path/to/afk hook stop
```

### Pattern 3: Configuration-Based Integration

**When to use**: Systems that can load external configuration

```json
{
  "hooks": {
    "before_action": {
      "command": "afk hook pretooluse",
      "timeout": 300
    },
    "session_start": {
      "command": "afk hook sessionstart",
      "timeout": 30
    }
  }
}
```

## Hook Types

### PreToolUse Hook

**Purpose**: Request approval before executing actions

**Input Format**:
```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "src/main.py",
    "old_string": "def hello():",
    "new_string": "def hello_world():"
  },
  "session_id": "claude-session-123",
  "cwd": "/Users/dev/myproject",
  "transcript_path": "/tmp/claude-transcript.jsonl"
}
```

**Usage**:
```bash
afk hook pretooluse < input.json
echo $?  # 0=approved, 2=denied, 1=error
```

**Output**:
- Exit code 0: Approved ✅
- Exit code 2: Denied ❌  
- Exit code 1: Error (timeout, connection issue)

### SessionStart Hook

**Purpose**: Notify of new AI sessions

**Input Format**:
```json
{
  "session_id": "session-abc123",
  "cwd": "/Users/dev/project", 
  "transcript_path": "/tmp/session.jsonl"
}
```

**Usage**:
```bash
afk hook sessionstart < session_input.json
```

### Stop Hook

**Purpose**: Notify when AI tasks complete

**Input Format**:
```json
{
  "session_id": "session-abc123",
  "cwd": "/Users/dev/project",
  "stop_hook_active": true
}
```

**Usage**:
```bash
afk hook stop < stop_input.json
```

## Language Examples

### Python Integration

```python
#!/usr/bin/env python3
"""AFK integration for Python AI agents"""

import os
import json
import subprocess
from typing import Dict, Any, Optional

class AFKIntegration:
    def __init__(self, session_id: str = None):
        self.session_id = session_id or f"python-{os.getpid()}"
        self.cwd = os.getcwd()
    
    def request_approval(
        self, 
        action_name: str, 
        action_params: Dict[str, Any],
        risk_level: str = "medium"
    ) -> bool:
        """Request approval for an action"""
        hook_input = {
            "tool_name": action_name,
            "tool_input": action_params,
            "session_id": self.session_id,
            "cwd": self.cwd,
            "transcript_path": f"/tmp/{self.session_id}.jsonl"
        }
        
        try:
            result = subprocess.run(
                ['afk', 'hook', 'pretooluse'],
                input=json.dumps(hook_input, indent=2),
                text=True,
                capture_output=True,
                timeout=300  # 5 minute timeout
            )
            
            return result.returncode == 0
            
        except subprocess.TimeoutExpired:
            print(f"Approval timeout for {action_name}")
            return False
        except Exception as e:
            print(f"AFK integration error: {e}")
            return False
    
    def notify_session_start(self):
        """Notify AFK of session start"""
        hook_input = {
            "session_id": self.session_id,
            "cwd": self.cwd,
            "transcript_path": f"/tmp/{self.session_id}.jsonl"
        }
        
        subprocess.run(
            ['afk', 'hook', 'sessionstart'],
            input=json.dumps(hook_input),
            text=True,
            capture_output=True
        )
    
    def notify_session_end(self):
        """Notify AFK of session completion"""
        hook_input = {
            "session_id": self.session_id,
            "cwd": self.cwd,
            "stop_hook_active": True
        }
        
        subprocess.run(
            ['afk', 'hook', 'stop'],
            input=json.dumps(hook_input),
            text=True,
            capture_output=True
        )

# Example AI agent using AFK
class MyAIAgent:
    def __init__(self):
        self.afk = AFKIntegration("my-ai-agent")
        self.afk.notify_session_start()
    
    def execute_code(self, code: str):
        # Request approval for code execution
        if self.afk.request_approval("execute_code", {"code": code}, "high"):
            print(f"Executing code: {code}")
            # Execute the code
            exec(code)
        else:
            print("Code execution denied by user")
    
    def write_file(self, filepath: str, content: str):
        # Request approval for file writing
        if self.afk.request_approval("write_file", {
            "filepath": filepath, 
            "content": content[:100] + "..." if len(content) > 100 else content
        }):
            print(f"Writing file: {filepath}")
            with open(filepath, 'w') as f:
                f.write(content)
        else:
            print(f"File write denied: {filepath}")
    
    def shutdown(self):
        self.afk.notify_session_end()

if __name__ == "__main__":
    agent = MyAIAgent()
    
    # Example usage
    agent.execute_code("print('Hello World')")
    agent.write_file("/tmp/test.txt", "This is a test file")
    
    agent.shutdown()
```

### Node.js Integration

```javascript
#!/usr/bin/env node
// AFK integration for Node.js AI systems

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class AFKIntegration {
    constructor(sessionId = null) {
        this.sessionId = sessionId || `nodejs-${process.pid}`;
        this.cwd = process.cwd();
    }
    
    async requestApproval(actionName, actionParams, riskLevel = 'medium') {
        const hookInput = {
            tool_name: actionName,
            tool_input: actionParams,
            session_id: this.sessionId,
            cwd: this.cwd,
            transcript_path: `/tmp/${this.sessionId}.jsonl`
        };
        
        return new Promise((resolve, reject) => {
            const afk = spawn('afk', ['hook', 'pretooluse']);
            
            let stdout = '';
            let stderr = '';
            
            afk.stdout.on('data', (data) => stdout += data);
            afk.stderr.on('data', (data) => stderr += data);
            
            afk.on('close', (code) => {
                if (code === 0) {
                    resolve(true);  // Approved
                } else if (code === 2) {
                    resolve(false); // Denied
                } else {
                    reject(new Error(`AFK error (${code}): ${stderr}`));
                }
            });
            
            afk.stdin.write(JSON.stringify(hookInput, null, 2));
            afk.stdin.end();
            
            // Timeout after 5 minutes
            setTimeout(() => {
                afk.kill('SIGTERM');
                reject(new Error('Approval timeout'));
            }, 300000);
        });
    }
    
    async notifySessionStart() {
        const hookInput = {
            session_id: this.sessionId,
            cwd: this.cwd,
            transcript_path: `/tmp/${this.sessionId}.jsonl`
        };
        
        return this.callHook('sessionstart', hookInput);
    }
    
    async notifySessionEnd() {
        const hookInput = {
            session_id: this.sessionId,
            cwd: this.cwd,
            stop_hook_active: true
        };
        
        return this.callHook('stop', hookInput);
    }
    
    callHook(hookType, input) {
        return new Promise((resolve) => {
            const afk = spawn('afk', ['hook', hookType]);
            
            afk.on('close', (code) => resolve(code === 0));
            
            afk.stdin.write(JSON.stringify(input));
            afk.stdin.end();
        });
    }
}

// Example AI agent
class MyAIAgent {
    constructor() {
        this.afk = new AFKIntegration('my-ai-agent');
        this.afk.notifySessionStart();
    }
    
    async executeShellCommand(command) {
        const approved = await this.afk.requestApproval('shell_command', {
            command: command
        }, 'high');
        
        if (approved) {
            console.log(`Executing: ${command}`);
            // Execute the command
            const { exec } = require('child_process');
            exec(command, (error, stdout, stderr) => {
                if (error) console.error('Error:', error);
                if (stdout) console.log('Output:', stdout);
                if (stderr) console.error('Stderr:', stderr);
            });
        } else {
            console.log('Shell command denied by user');
        }
    }
    
    async modifyFile(filepath, content) {
        const approved = await this.afk.requestApproval('modify_file', {
            filepath: filepath,
            content: content.length > 100 ? content.substring(0, 100) + '...' : content
        });
        
        if (approved) {
            fs.writeFileSync(filepath, content);
            console.log(`File written: ${filepath}`);
        } else {
            console.log(`File modification denied: ${filepath}`);
        }
    }
    
    async shutdown() {
        await this.afk.notifySessionEnd();
    }
}

// Usage example
async function main() {
    const agent = new MyAIAgent();
    
    await agent.executeShellCommand('ls -la');
    await agent.modifyFile('/tmp/test.txt', 'Hello from Node.js AI agent');
    
    await agent.shutdown();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { AFKIntegration };
```

### Go Integration

```go
package main

import (
    "encoding/json"
    "fmt"
    "os"
    "os/exec"
    "strings"
    "time"
)

type AFKIntegration struct {
    SessionID string
    CWD       string
}

type HookInput struct {
    ToolName      string                 `json:"tool_name"`
    ToolInput     map[string]interface{} `json:"tool_input"`
    SessionID     string                 `json:"session_id"`
    CWD           string                 `json:"cwd"`
    TranscriptPath string                `json:"transcript_path"`
    StopHookActive bool                  `json:"stop_hook_active,omitempty"`
}

func NewAFKIntegration(sessionID string) *AFKIntegration {
    if sessionID == "" {
        sessionID = fmt.Sprintf("go-%d", os.Getpid())
    }
    
    cwd, _ := os.Getwd()
    
    return &AFKIntegration{
        SessionID: sessionID,
        CWD:       cwd,
    }
}

func (afk *AFKIntegration) RequestApproval(actionName string, actionParams map[string]interface{}) (bool, error) {
    input := HookInput{
        ToolName:      actionName,
        ToolInput:     actionParams,
        SessionID:     afk.SessionID,
        CWD:           afk.CWD,
        TranscriptPath: fmt.Sprintf("/tmp/%s.jsonl", afk.SessionID),
    }
    
    inputJSON, err := json.MarshalIndent(input, "", "  ")
    if err != nil {
        return false, err
    }
    
    cmd := exec.Command("afk", "hook", "pretooluse")
    cmd.Stdin = strings.NewReader(string(inputJSON))
    
    // Set timeout
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
    defer cancel()
    cmd = exec.CommandContext(ctx, "afk", "hook", "pretooluse")
    cmd.Stdin = strings.NewReader(string(inputJSON))
    
    err = cmd.Run()
    if err != nil {
        if exitError, ok := err.(*exec.ExitError); ok {
            switch exitError.ExitCode() {
            case 0:
                return true, nil  // Approved
            case 2:
                return false, nil // Denied
            default:
                return false, fmt.Errorf("AFK error: exit code %d", exitError.ExitCode())
            }
        }
        return false, err
    }
    
    return true, nil // Success (exit code 0)
}

func (afk *AFKIntegration) NotifySessionStart() error {
    input := HookInput{
        SessionID:      afk.SessionID,
        CWD:            afk.CWD,
        TranscriptPath: fmt.Sprintf("/tmp/%s.jsonl", afk.SessionID),
    }
    
    return afk.callHook("sessionstart", input)
}

func (afk *AFKIntegration) NotifySessionEnd() error {
    input := HookInput{
        SessionID:      afk.SessionID,
        CWD:            afk.CWD,
        StopHookActive: true,
    }
    
    return afk.callHook("stop", input)
}

func (afk *AFKIntegration) callHook(hookType string, input HookInput) error {
    inputJSON, err := json.Marshal(input)
    if err != nil {
        return err
    }
    
    cmd := exec.Command("afk", "hook", hookType)
    cmd.Stdin = strings.NewReader(string(inputJSON))
    
    return cmd.Run()
}

// Example AI agent
type AIAgent struct {
    afk *AFKIntegration
}

func NewAIAgent() *AIAgent {
    agent := &AIAgent{
        afk: NewAFKIntegration("go-ai-agent"),
    }
    
    agent.afk.NotifySessionStart()
    return agent
}

func (agent *AIAgent) ExecuteCommand(command string) {
    approved, err := agent.afk.RequestApproval("execute_command", map[string]interface{}{
        "command": command,
    })
    
    if err != nil {
        fmt.Printf("AFK error: %v\n", err)
        return
    }
    
    if approved {
        fmt.Printf("Executing command: %s\n", command)
        cmd := exec.Command("sh", "-c", command)
        output, err := cmd.CombinedOutput()
        if err != nil {
            fmt.Printf("Command error: %v\n", err)
        }
        fmt.Printf("Output: %s\n", output)
    } else {
        fmt.Println("Command execution denied by user")
    }
}

func (agent *AIAgent) WriteFile(filepath, content string) {
    approved, err := agent.afk.RequestApproval("write_file", map[string]interface{}{
        "filepath": filepath,
        "content":  content,
    })
    
    if err != nil {
        fmt.Printf("AFK error: %v\n", err)
        return
    }
    
    if approved {
        err := os.WriteFile(filepath, []byte(content), 0644)
        if err != nil {
            fmt.Printf("Write error: %v\n", err)
        } else {
            fmt.Printf("File written: %s\n", filepath)
        }
    } else {
        fmt.Printf("File write denied: %s\n", filepath)
    }
}

func (agent *AIAgent) Shutdown() {
    agent.afk.NotifySessionEnd()
}

func main() {
    agent := NewAIAgent()
    defer agent.Shutdown()
    
    agent.ExecuteCommand("echo 'Hello from Go AI agent'")
    agent.WriteFile("/tmp/test.txt", "Hello from Go")
}
```

### Shell Script Integration

```bash
#!/bin/bash
# AFK integration for shell-based AI systems

# Configuration
SESSION_ID="shell-ai-$$"
TRANSCRIPT_PATH="/tmp/${SESSION_ID}.jsonl"

# Helper function to request approval
request_approval() {
    local action_name="$1"
    local action_params="$2"
    
    local hook_input=$(cat << EOF
{
  "tool_name": "$action_name",
  "tool_input": $action_params,
  "session_id": "$SESSION_ID",
  "cwd": "$(pwd)",
  "transcript_path": "$TRANSCRIPT_PATH"
}
EOF
)
    
    echo "$hook_input" | afk hook pretooluse
    return $?
}

# Helper function for session start
notify_session_start() {
    local hook_input=$(cat << EOF
{
  "session_id": "$SESSION_ID",
  "cwd": "$(pwd)",
  "transcript_path": "$TRANSCRIPT_PATH"
}
EOF
)
    
    echo "$hook_input" | afk hook sessionstart
}

# Helper function for session end
notify_session_end() {
    local hook_input=$(cat << EOF
{
  "session_id": "$SESSION_ID",
  "cwd": "$(pwd)",
  "stop_hook_active": true
}
EOF
)
    
    echo "$hook_input" | afk hook stop
}

# Example AI agent functions
execute_command() {
    local command="$1"
    local params=$(cat << EOF
{"command": "$command"}
EOF
)
    
    if request_approval "execute_command" "$params"; then
        echo "✅ Command approved: $command"
        eval "$command"
    else
        echo "❌ Command denied: $command"
    fi
}

write_file() {
    local filepath="$1"
    local content="$2"
    local params=$(cat << EOF
{"filepath": "$filepath", "content": "$(echo "$content" | head -c 100)..."}
EOF
)
    
    if request_approval "write_file" "$params"; then
        echo "✅ File write approved: $filepath"
        echo "$content" > "$filepath"
    else
        echo "❌ File write denied: $filepath"
    fi
}

# Main AI agent logic
main() {
    echo "🚀 Starting AI agent with AFK integration"
    notify_session_start
    
    # Example operations
    execute_command "ls -la"
    execute_command "whoami"
    write_file "/tmp/test.txt" "Hello from shell AI agent"
    
    echo "🏁 AI agent session complete"
    notify_session_end
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
```

## Configuration

### Global Configuration

```bash
# Set default mode
afk on    # Enable remote mode
afk off   # Enable local mode
afk       # Toggle mode

# Check status
afk status
```

### Project-Specific Configuration

```bash
# Install AFK for specific project
cd /path/to/your/ai/project
afk install project

# This creates .claude/settings.json with AFK hooks
```

### Environment Variables

```bash
# Required for AFK operation
export TELEGRAM_BOT_TOKEN="your-bot-token"
export TELEGRAM_CHAT_ID="your-chat-id"

# Optional configuration
export AFK_TIMEOUT=300000          # 5 minute timeout
export AFK_LOG_LEVEL=info          # info, debug, error
export AFK_AUTO_APPROVE="read_*,list_*"  # Auto-approve patterns
```

## Best Practices

### Risk Assessment

Categorize your actions by risk level and handle appropriately:

```python
def get_risk_level(action_name, params):
    """Assess risk level of actions"""
    high_risk = ['execute_code', 'delete_file', 'system_command', 'network_request']
    medium_risk = ['write_file', 'modify_config', 'install_package']
    
    if any(risk in action_name.lower() for risk in high_risk):
        return 'high'
    elif any(risk in action_name.lower() for risk in medium_risk):
        return 'medium'
    else:
        return 'low'

# Only request approval for medium/high risk actions
risk = get_risk_level(action_name, params)
if risk in ['medium', 'high']:
    approved = afk.request_approval(action_name, params, risk)
else:
    approved = True  # Auto-approve low risk
```

### Error Handling

```python
def safe_request_approval(action_name, params):
    """Request approval with proper error handling"""
    try:
        return afk.request_approval(action_name, params)
    except subprocess.TimeoutExpired:
        print(f"⏰ Approval timeout for {action_name} - defaulting to deny")
        return False
    except Exception as e:
        print(f"🚨 AFK integration error: {e}")
        # Default behavior when AFK is unavailable
        # You might want to fall back to local mode or fail safely
        return False
```

### Message Formatting

```python
def format_for_mobile(content, max_length=200):
    """Format content for mobile notification"""
    if len(content) <= max_length:
        return content
    
    return content[:max_length] + f"... ({len(content)} chars total)"

# Usage
params = {
    "code": format_for_mobile(code_content),
    "filename": filepath
}
```

### Session Management

```python
class AISession:
    def __init__(self, session_id=None):
        self.session_id = session_id or f"ai-{uuid.uuid4()}"
        self.afk = AFKIntegration(self.session_id)
        self.start_time = time.time()
        
    def __enter__(self):
        self.afk.notify_session_start()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.afk.notify_session_end()
        duration = time.time() - self.start_time
        print(f"Session {self.session_id} completed in {duration:.1f}s")

# Usage with context manager
with AISession() as session:
    # Your AI agent operations
    if session.afk.request_approval("risky_action", params):
        perform_risky_action()
```

## Testing Your Integration

### Manual Testing

```bash
# Test that AFK is working
afk status

# Test approval flow
echo '{"tool_name": "test", "tool_input": {}, "session_id": "test", "cwd": "/tmp"}' | afk hook pretooluse
echo "Exit code: $?"
```

### Automated Testing

```python
#!/usr/bin/env python3
"""Test AFK integration"""

import subprocess
import json
import sys

def test_afk_binary():
    """Test that AFK binary is available and working"""
    try:
        result = subprocess.run(['afk', 'status'], capture_output=True, text=True)
        print(f"✅ AFK binary available: {result.stdout.strip()}")
        return True
    except FileNotFoundError:
        print("❌ AFK binary not found. Install with: npm install -g @probelabs/afk")
        return False

def test_approval_flow():
    """Test approval request flow"""
    test_input = {
        "tool_name": "test_action",
        "tool_input": {"test": True},
        "session_id": "integration-test",
        "cwd": "/tmp",
        "transcript_path": "/tmp/test.jsonl"
    }
    
    try:
        result = subprocess.run(
            ['afk', 'hook', 'pretooluse'],
            input=json.dumps(test_input),
            text=True,
            capture_output=True,
            timeout=5
        )
        
        if result.returncode == 0:
            print("✅ Approval flow test passed (approved)")
        elif result.returncode == 2:
            print("✅ Approval flow test passed (denied)")
        else:
            print(f"❌ Approval flow test failed: exit code {result.returncode}")
            print(f"   stderr: {result.stderr}")
            return False
            
        return True
    except subprocess.TimeoutExpired:
        print("❌ Approval flow test timed out")
        return False
    except Exception as e:
        print(f"❌ Approval flow test error: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing AFK Integration\n")
    
    tests = [
        ("AFK Binary", test_afk_binary),
        ("Approval Flow", test_approval_flow),
    ]
    
    passed = 0
    for name, test_func in tests:
        print(f"Running {name} test...")
        if test_func():
            passed += 1
        print()
    
    print(f"📊 Results: {passed}/{len(tests)} tests passed")
    
    if passed == len(tests):
        print("🎉 All tests passed! Your AFK integration is ready.")
        sys.exit(0)
    else:
        print("❌ Some tests failed. Check your AFK installation.")
        sys.exit(1)
```

## Troubleshooting

### Common Issues

**AFK binary not found**
```bash
# Install AFK globally
npm install -g @probelabs/afk

# Verify installation
which afk
afk --version
```

**Telegram not configured**
```bash
# Run setup to configure Telegram
afk setup

# Test Telegram connection
afk telegram test
```

**Permission issues**
```bash
# Make sure AFK binary is executable
chmod +x $(which afk)

# Check AFK status
afk status
```

**Timeout issues**
```bash
# Increase timeout in your integration
# Python: timeout=600 (10 minutes)  
# Node.js: setTimeout(..., 600000)
# Shell: timeout 600 afk hook pretooluse
```

**JSON parsing errors**
```bash
# Validate your JSON input
echo '{"tool_name": "test"}' | python -m json.tool

# Test with minimal input
echo '{"tool_name": "test", "tool_input": {}, "session_id": "test", "cwd": "/tmp"}' | afk hook pretooluse
```

This binary-first approach is simpler, more reliable, and leverages the proven AFK system you already have!