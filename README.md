<p align="center">
  <img src="site/afk-logo.png" alt="AFK Logo" width="200" />
</p>

# AFK - Control Claude Code from Anywhere

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](package.json)
[![npm version](https://img.shields.io/npm/v/@probelabs/afk.svg)](https://www.npmjs.com/package/@probelabs/afk)

> **Your code doesn't stop when you leave your desk.** Get Telegram notifications for Claude Code actions and approve them from anywhere. No cloud dependencies, no third-party servers. **Plus**: Integrate any AI system with remote approval using simple binary calls.

## ⚡ Quick Start

3 commands, 2 minutes, full mobile control:

```bash
# 1. Install and setup
npm install -g @probelabs/afk
afk setup  # Creates your Telegram bot

# 2. Go remote
afk        # Smart toggle: installs hooks and enables remote mode
```

**That's it!** Claude Code now sends approval requests to your phone. 📱

### What happens next?
- Claude starts a task → You get a Telegram notification
- Tap **Approve** → Claude continues
- Tap **Deny** → Claude stops and asks for guidance
- Step away confident your code is safe

## 🎯 Why AFK?

**📱 Mobile Development Freedom**
- ☕ Step away during long refactors
- 🚇 Approve changes from your commute  
- 🏖️ Monitor critical tasks remotely
- 🔒 Add approval gates for sensitive operations

**🤖 Universal AI Integration**
- Not just Claude Code—works with any AI system
- Simple binary calls (Python, Node.js, bash, etc.)
- [Complete integration guide](INTEGRATION.md) with examples
- Risk assessment and approval policies

**🔐 Privacy First**
- Zero cloud dependencies
- Direct Telegram connection
- Your bot, your control
- Local state only

**🚀 Smart Integration**
- Works with Claude Code's permission system
- Multi-project session management
- Auto-approve safe operations
- Timeout protection

## 🛠️ Commands

### Basic Usage
```bash
afk              # Smart toggle: install if needed, then toggle mode
afk on           # Enable remote approvals  
afk off          # Disable remote approvals
afk readonly     # Enable read-only mode (notifications without blocking)
afk status       # Check current mode
```

### Claude Commands
Control AFK mode directly from Claude Code interface:
```bash
/afk             # Toggle global AFK mode (local ↔ remote)
/afk:on          # Enable remote mode globally
/afk:off         # Disable remote mode globally
/afk:readonly    # Enable read-only mode globally
/afk:status      # Show current mode status
/afk:global      # Toggle global mode (same as /afk)
/afk:project     # Toggle project-specific mode
/afk:help        # Show command help
```

### Setup & Installation
```bash
afk setup        # Interactive Telegram bot setup
afk install      # Install Claude Code hooks
afk uninstall    # Remove hooks
```

### Testing & Debug
```bash
afk telegram test    # Test Telegram connection
afk debug on         # Enable debug logging
```

## 🎛️ Operating Modes

AFK supports three operating modes to fit different workflows:

### 🔒 Remote Mode (`afk on`)
- **Full approval workflow**: All permissioned tools require Telegram approval
- **Interactive**: Tap Approve/Deny buttons for each action
- **Blocking**: Claude waits for your response before proceeding
- **Best for**: Active development when you want full control

### 🏠 Local Mode (`afk off`) 
- **Default Claude behavior**: Uses Claude's built-in permission prompts
- **No Telegram notifications**: Everything happens in Claude interface
- **Non-blocking**: Normal Claude workflow
- **Best for**: When working directly at your computer

### 📖 Read-Only Mode (`afk readonly`)
- **Passive monitoring**: Get notified of completed sessions
- **No approvals required**: Tools execute without intervention
- **Non-blocking**: No delays or waiting
- **Best for**: Monitoring long-running tasks without interference

**Mode Toggle Behavior:**
- `afk` or `afk toggle`: Cycles between Local ↔ Remote only
- `afk readonly`: Explicit command to enable read-only mode
- Read-only mode is separate and doesn't interfere with normal toggling

## 🤖 AI Integration

**Want to integrate AFK with your own AI system?** Check out our [comprehensive integration guide](INTEGRATION.md) with examples for:

- 🐍 **Python**: Simple AFKIntegration class with subprocess calls
- 🚀 **Node.js**: Promise-based integration with error handling  
- 🔧 **Bash**: Pure shell script integration with JSON piping
- 🎯 **Generic Template**: Complete framework with risk assessment

**Quick Example (Python):**
```python
from afk_integration import AFKIntegration

afk = AFKIntegration("my-ai-session")
if afk.request_approval("execute_code", {"code": "print('Hello!')", "language": "python"}):
    exec("print('Hello!')")  # User approved - execute
else:
    print("User denied code execution")
```

**Setup Integration Examples:**
```bash
# Run the setup script to install AFK and configure examples
bash scripts/setup-integration.sh

# Test all integration examples
bash scripts/test-integration.sh
```

## 🔧 How it Works

**1. Hook Integration**
AFK hooks into Claude Code at key decision points:
- **PreToolUse**: Intercepts risky operations (file edits, bash commands, web requests)
- **SessionStart**: Notifies when new coding sessions begin  
- **Stop**: Enables follow-up conversations when tasks complete

**2. Smart Permissions**
- Respects Claude's existing allow/deny lists
- Auto-approves safe tools like `Read` and `Grep`
- Creates permanent patterns from one-time approvals

**3. Mode-Based Workflow**
```
Claude wants to edit file.js
        ↓
AFK checks current mode:
        ↓
Local Mode: Claude handles normally
Remote Mode: Send approval request → Wait for response
Read-Only Mode: Allow execution, notify on completion
        ↓
You tap: [Approve] [Deny] [Allow All] [Ask Claude UI] (Remote only)
        ↓
Claude proceeds based on mode and your choice
```

**4. Session Management**
- Each Claude session gets unique ID
- Messages tagged with project and session
- Reply threading maintains conversation context

## 🏗️ Architecture

### System Overview

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│                  │         │                  │         │                  │
│   Claude Code    │────────▶│   AFK Hooks      │────────▶│   Telegram API   │
│                  │         │                  │         │                  │
│  • PreToolUse    │         │ • Intercepts     │         │ • Distributed    │
│  • SessionStart  │         │ • Routes msgs    │         │   polling        │
│  • Stop events   │◀────────│ • Manages state  │◀────────│ • Button handling│
│  • Notifications │         │                  │         │                  │
└──────────────────┘         └──────────────────┘         └──────────────────┘
        ▲                            │                            
        │                            │                            
        │                            ▼                            
        │                    ┌──────────────────┐                
        │                    │                  │                
        └────────────────────│   Local State    │                
                             │                  │                
                             │ • ~/.afk         │               
                             │ • Mode (on/off)  │               
                             │ • Session map    │               
                             │ • Approvals      │               
                             └──────────────────┘               
```

### Hook Integration Points

**PreToolUse Hook** - Gates tool execution:
- Checks current mode (local/remote)
- Validates against Claude's existing permissions
- Sends approval requests to Telegram in remote mode
- Waits for user response with timeout

**SessionStart Hook** - New session notifications:
- Notifies when Claude begins new coding sessions
- Waits for initial instructions or "Continue" 
- Can inject follow-up tasks via process exit code 2

**Stop Hook** - Task completion handling:
- Sends completion notifications to Telegram
- Enables follow-up conversations and instructions
- Supports session continuation or closure

## ⚙️ Configuration

Run `afk setup` for interactive configuration. The wizard:

1. 🤖 Creates your Telegram bot via @BotFather
2. 🔑 Securely stores bot token (masked input)
3. 💬 Auto-detects your chat ID  
4. ✅ Tests the connection
5. 💾 Saves to `~/.afk/config.json`

**Config file:**
```json
{
  "telegram_bot_token": "YOUR_BOT_TOKEN",
  "telegram_chat_id": "YOUR_CHAT_ID",
  "timeout_seconds": 3600,
  "intercept_matcher": "Bash|Edit|Write|MultiEdit|WebFetch|mcp__.*",
  "auto_approve_tools": ["Read"]
}
```

### Configuration Options

| Option | Description | Default | Options |
|--------|-------------|---------|---------|
| `timeout_seconds` | Approval timeout | `3600` (1 hour) | Any positive number, `0` for infinite |
| `intercept_matcher` | Tools to intercept | `"Bash\|Edit\|Write\|MultiEdit\|WebFetch\|mcp__.*"` | Regex pattern |
| `auto_approve_tools` | Always allow these | `["Read"]` | Array of tool names |

**Note**: Additional options like `timeout_action` and `respect_claude_permissions` can be added manually to the config file if needed.

### Environment Variables

```bash
export TELEGRAM_BOT_TOKEN="your_token"    # Alternative to config file
export TELEGRAM_CHAT_ID="your_chat_id"    # Alternative to config file
export CC_REMOTE_STOP_TIMEOUT=21600       # Stop event timeout (6 hours)
```

## 🔐 Smart Approval System

**Permission Flow:**
1. Check Claude's existing permissions → Use those if set
2. Check auto-approve list → Safe tools go through automatically  
3. Check mode → Local uses Claude UI, Remote sends to Telegram
4. Telegram approval → Tap **[Approve]**, **[Deny]**, **[Allow All]**, or **[Ask Claude UI]**

**Smart Patterns:**
When you tap **[Allow All]**, AFK creates permanent rules like:
- `Bash(npm test:*)` - Allow all npm test commands
- `Edit(/src/*)` - Allow edits to source files
- `WebFetch(domain:api.github.com)` - Allow GitHub API calls

### Permission Pattern Examples

Patterns are automatically generated based on context:

```javascript
// Bash commands → command prefix patterns
"Bash(npm run:*)"      // All npm run scripts
"Bash(git:*)"          // All git commands
"Bash(curl:*)"         // All curl requests

// Web requests → domain patterns
"WebFetch(domain:api.example.com)"   // Specific API
"WebFetch(domain:*.example.com)"     // Subdomains

// File operations → path patterns
"Edit(/src/*)"         // All files in src/
"Write(/tests/*)"      // All test files
"MultiEdit(/config/*)" // Multi-file edits in config/
```

## 📱 Multi-Session Support

### Session Identification

Each Telegram message includes:
- 📁 **Project**: Derived from working directory
- 🔖 **Session ID**: Short unique identifier  
- ⏰ **Timestamp**: When request was made

Example message:
```
[my-project] [sess-a1b2] 
Claude requests: Edit server.js

[Approve] [Deny] [Allow All] [Ask Claude UI]
```

### Reply Routing
- **Native Reply**: Always routes to the original session
- **Plain Message**: Routes to the most recent session
- **Multiple Projects**: Each maintains independent state

## 🔧 Troubleshooting

**No Telegram messages?**
```bash
afk status          # Check if remote mode is enabled
afk telegram test   # Test connection
```

**Buttons not working?**
- Only run one AFK instance at a time
- Verify your Telegram bot has message permissions

## 🚀 Advanced Features

### Timeout Configuration
Control what happens when approvals timeout:

```json
{
  "timeout_seconds": 3600,     // 1 hour
  "timeout_action": "deny"     // Auto-deny on timeout
}
```

**Timeout Actions:**
- `"deny"`: Safe default, blocks operation
- `"allow"`: Convenient but less secure
- `"wait"`: Never timeout, wait indefinitely

### Blocking Stop Events
Enable interactive follow-ups after Claude finishes:

```bash
# In your Stop hook configuration, AFK automatically waits for user input
# Users can then reply with follow-up instructions or tap [Continue]
```

### Installation Scopes
```bash
# Global (all projects)
afk install --scope user

# Project-specific 
afk install --scope project

# Local development
afk install --scope local
```

---

## 📦 Installation

**Requirements:** Node.js ≥ 18, Claude Code, Telegram account

### Install Methods

#### 🌟 **Recommended: npm Global**
```bash
npm install -g @probelabs/afk
```

#### 🔧 **From Source**
```bash
git clone https://github.com/probelabs/afk.git
cd afk
npm link  # Creates global symlink
```

## 📄 License

MIT License - Part of the [Probe Labs](https://probelabs.com) ecosystem

## 🔗 Links

📖 [Documentation](https://probelabs.com/afk) • 🤖 [AI Integration Guide](INTEGRATION.md) • 🐛 [Issues](https://github.com/probelabs/afk/issues) • 💬 [Discussions](https://github.com/probelabs/afk/discussions)