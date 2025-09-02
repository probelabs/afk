# Node.js AI Agent + AFK Integration

Simple example showing how to integrate any Node.js AI agent with AFK remote control using child_process calls to the AFK binary.

## Features

- ✅ **Simple**: Just ~200 lines of Node.js code
- ✅ **No Dependencies**: Uses only Node.js stdlib + AFK binary  
- ✅ **Remote Approval**: Get Telegram notifications for risky actions
- ✅ **Session Management**: Proper session start/end notifications
- ✅ **Error Handling**: Graceful fallbacks when AFK unavailable
- ✅ **Promise-based**: Modern async/await API

## Prerequisites

```bash
# Install AFK binary
npm install -g @probelabs/afk

# Configure Telegram integration
afk setup

# Verify installation
afk status
```

## Usage

```bash
# Run the demo
npm start

# Or directly
node ai-agent.js

# Or use the integration in your own agent
const { AFKIntegration } = require('./ai-agent');

const afk = new AFKIntegration('my-agent');
const approved = await afk.requestApproval('dangerous_action', {details: '...'});
if (approved) {
  // User approved - execute action
  performDangerousAction();
}
```

## Integration Pattern

The integration uses child_process.spawn to call the AFK binary:

```javascript
const { spawn } = require('child_process');

// Request approval
const child = spawn('afk', ['hook', 'pretooluse'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send JSON input
child.stdin.write(JSON.stringify({
  tool_name: 'action_name',
  tool_input: {param: 'value'},
  session_id: 'my-session',
  cwd: '/current/directory',
  transcript_path: '/tmp/session.jsonl'
}));
child.stdin.end();

// Handle result
child.on('close', (code) => {
  const approved = (code === 0);  // 0=approved, 2=denied, 1=error
});
```

## Example Operations

### Safe Operations (No approval needed)
- Data analysis
- Read-only operations  
- Calculations

### Risky Operations (Approval required)
- Code execution
- File modifications
- Shell commands
- Network requests

### How It Looks on Mobile

When the agent requests approval, you get a rich Telegram notification:

```
🤖 Node.js AI Agent

execute_code:
```javascript
console.log('Hello from approved code!')
```

Language: javascript
Session: nodejs-12345

[✅ Approve] [❌ Deny] [📋 Details]
```

## Customization

### Risk Assessment
```javascript
function assessRisk(actionName, params) {
  const highRisk = ['execute_code', 'shell_command', 'delete_file'];
  const mediumRisk = ['write_file', 'modify_config'];
  
  if (highRisk.includes(actionName)) {
    return 'high';
  } else if (mediumRisk.includes(actionName)) {
    return 'medium';
  } else {
    return 'low';
  }
}

// Only request approval for medium/high risk
const risk = assessRisk(actionName, params);
if (['medium', 'high'].includes(risk)) {
  approved = await afk.requestApproval(actionName, params);
} else {
  approved = true;  // Auto-approve low risk
}
```

### Custom Actions
```javascript
async myCustomAction(data) {
  const approved = await this.afk.requestApproval('custom_action', {
    data_size: JSON.stringify(data).length,
    action_type: 'data_processing'
  });

  if (approved) {
    // User approved - execute
    const result = this.processData(data);
    return result;
  } else {
    console.log('Custom action denied by user');
    return null;
  }
}
```

### Error Handling
```javascript
async function safeRequestApproval(afk, actionName, params) {
  try {
    return await afk.requestApproval(actionName, params);
  } catch (error) {
    if (error.message === 'Timeout') {
      console.log('⏰ Approval timeout - defaulting to deny');
      return false;
    } else if (error.code === 'ENOENT') {
      console.log('⚠️ AFK not installed - running in local mode');
      return true;  // or false, depending on your preference
    } else {
      console.log(`🚨 AFK error: ${error.message} - defaulting to deny`);
      return false;
    }
  }
}
```

This approach provides all the remote control functionality with a clean Promise-based API!