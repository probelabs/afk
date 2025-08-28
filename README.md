# afk - Claude Code Remote Control via Telegram

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](package.json)

**afk** (Away From Keyboard) is a powerful CLI tool that enables remote control and approval workflows for Claude Code through Telegram. Perfect for when you want to monitor and control Claude's actions while away from your desk.

## 🎯 Key Features

- **🔐 Remote Approval System**: Approve or deny Claude's tool usage remotely via Telegram
- **🔄 AFK Toggle**: Simple CLI commands to switch between local and remote modes
- **📱 Telegram Integration**: Real-time notifications and interactive approval buttons
- **🎭 Multi-Session Support**: Handle multiple Claude sessions simultaneously
- **📦 Zero Dependencies**: Built entirely with Node.js ≥18 built-ins
- **🔌 Flexible Installation**: User, project, or local scope installation options
- **📬 Local Inbox**: Optional blocking Stop flows for enhanced control

## 📋 Table of Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Commands](#commands)
- [Architecture](#architecture)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## 🚀 How It Works

afk acts as a bridge between Claude Code and Telegram, intercepting tool usage requests and forwarding them to your Telegram bot for approval when in "remote" mode.

- Manual AFK: `/afk on|off|toggle|status` via a deterministic UserPromptSubmit hook (blocks the prompt; updates state).
- PreToolUse: Gates permissioned tools with Telegram Approve/Deny when AFK=remote, before Claude’s normal permission UI.
- Notification: Forwards Claude notifications to Telegram.
- Stop: Sends a labeled “Agent finished” message with [Reply]/[Continue]; native Telegram Reply is supported.
- Multi‑session: Each Telegram message is mapped to a session; plain messages target the latest session by default.
- Local inbox: `inbox wait` enables optional blocking Stop flows.

## 📦 Requirements

- Node.js ≥ 18
- A Telegram bot token (from @BotFather) and your Telegram user chat ID
- Claude Code (to install/approve hooks under `/hooks`)

## 🏁 Quick Start

### 1️⃣ Install the CLI

#### Option A: Install from npm (Recommended)
```bash
# Install globally
npm install -g @probelabs/afk

# Or with yarn
yarn global add @probelabs/afk

# Verify installation
afk --version
```

#### Option B: Clone from GitHub
```bash
# Clone the repository
git clone https://github.com/probelabs/afk.git
cd afk

# Make the binary executable
chmod +x bin/afk

# Add to PATH (choose one):
# Option 1: Copy to local bin
mkdir -p ~/.claude-remote/bin
cp bin/afk ~/.claude-remote/bin/afk
export PATH="$HOME/.claude-remote/bin:$PATH"  # Add to ~/.bashrc or ~/.zshrc

# Option 2: Create symlink
ln -s "$(pwd)/bin/afk" /usr/local/bin/afk
```

#### Option C: Direct Download
```bash
# Download directly from GitHub
curl -L https://raw.githubusercontent.com/probelabs/afk/main/bin/afk -o ~/.claude-remote/bin/afk
chmod +x ~/.claude-remote/bin/afk
export PATH="$HOME/.claude-remote/bin:$PATH"
```

### 2️⃣ Run Guided Setup

The interactive setup wizard will help you configure everything:

```
afk setup
```

The wizard asks for your Telegram bot token (masked), verifies it, guides you to message the bot, auto‑detects your chat ID, writes `~/.claude-remote/config.json`, and sends a test message.

### 3️⃣ Install Claude Code Hooks

Choose your installation scope:

```
afk install
# or explicitly
afk install --scope user
afk install --scope project --project-root /path/to/repo
afk install --scope local   --project-root /path/to/repo
```

### 4️⃣ Approve Hooks in Claude Code

Open Claude Code → run `/hooks` → approve the newly installed hooks.

### 5️⃣ Start the Telegram Bot

Launch the bot (runs as a single instance):

```
afk telegram start-bot
```

6) Toggle AFK and use:

```
afk mode on   # REMOTE: approvals required
afk mode off  # LOCAL: normal prompts
```

## Commands

- install: `afk install [--scope user|project|local] [--project-root PATH]`
  - Writes hooks at the chosen scope. Prompts when flags are omitted.
  - User scope: `~/.claude/settings.json` and `~/.claude-remote/bin/afk`.
  - Project scope: `./.claude/settings.json` and `./.claude/hooks/afk` (checked in).
  - Local scope: `./.claude/settings.local.json` and `./.claude/hooks/afk` (not checked in).

- setup: `afk setup`
  - Interactive Telegram link: token → verify → detect chat → save → test.

- uninstall: `afk uninstall --scope user|project|local [--project-root PATH]`
  - Prints non‑destructive steps to remove hooks and the executable.

- mode: `afk mode [on|off|toggle|local|remote|status]`
  - on / remote: Switch to REMOTE — all permissioned tools require Telegram approval.
  - off / local: Switch to LOCAL — tools run with Claude’s normal permission prompts.
  - toggle: Flip between LOCAL and REMOTE.
  - status: Print the current mode with short guidance.
  - State is global and stored at `~/.claude-remote/mode` (`local` or `remote`).

- telegram: `afk telegram start-bot|test`
  - start-bot: Starts the long‑polling bot to handle Approve/Deny and Reply/Continue. Run exactly one instance.
  - test: Sends a test message to your configured chat.

- inbox: `afk inbox wait --session <id> [--timeout 21600]`
  - Local poller for a `reply` or `continue` event for a specific session. Useful when enabling blocking Stop behavior.

- hook: `afk hook pretooluse|stop|userpromptsubmit`
  - Internal entrypoints used by hooks (read JSON on stdin; write JSON on stdout where applicable).

## Hooks & Behavior

- UserPromptSubmit
  - Intercepts `/afk on|off|toggle|status` deterministically, updates state, and blocks the prompt with a friendly message.

- PreToolUse (smart permission gatekeeper)
  - **Fully respects Claude's permission chain**: Checks local → project → user settings
  - **Only prompts when Claude would ask**: If already in allow/deny lists, defers to Claude
  - When AFK=remote and Claude would show permission dialog, sends Telegram card with four options:
    - **✅ Approve**: Allow this specific tool call once
    - **❌ Deny**: Block this specific tool call  
    - **✅ Allow All**: Allow and add a permission pattern to `~/.claude/settings.json` for future auto-approval
    - **🔧 Ask Claude UI**: Show Claude's native permission dialog with its own Allow/Allow All/Deny options
  - Auto‑approve list (default `["Read"]`) bypasses the prompt even in remote.
  - Timeout (default 3600s/1 hour) with configurable action via `timeout_action`:
    - `"deny"` (default): Auto-deny after timeout
    - `"allow"`: Auto-approve after timeout
    - `"wait"`: Keep waiting indefinitely for user response
  - Telegram message updates to show timeout status
  - Multiple requests are independent and safe to approve/deny in any order.
  - Permission patterns are intelligently generated based on tool type:
    - Bash commands: `Bash(npm run:*)`, `Bash(git status:*)`, etc.
    - WebFetch URLs: `WebFetch(domain:example.com)`  
    - MCP tools and internal tools: Use full tool name


- Stop (session follow‑ups)
  - Sends “Agent finished — <folder>” with [Reply]/[Continue].
  - Native Telegram Reply to this message routes your text to that exact session.
  - Plain messages (not a reply) route to the latest session in your chat.
  - Always blocks and waits for user interaction. Timeout: `CC_REMOTE_STOP_TIMEOUT` (seconds, default 21600/6 hours).

## Multi‑Session Routing

- Telegram messages include a project label (derived from `cwd`, e.g., `repo/subdir`) and a short session id.
- Each outgoing message is recorded in `~/.claude-remote/session-map.json` (message_id → session metadata) and appended to `~/.claude-remote/history.jsonl`.
- Native Reply uses `reply_to_message.message_id` to target the correct session.
- Plain messages route to the latest session for your chat, tracked in the session map.
- Approvals are always 1:1: each PreToolUse request has its own Approve/Deny card and independent timeout.

## Files & State

- `~/.claude-remote/config.json`
  - `telegram_bot_token`: string — Bot token from @BotFather.
  - `telegram_chat_id`: string — Your user chat ID.
  - `timeout_seconds`: number — PreToolUse approval timeout in seconds (default: 3600/1 hour, 0 or -1 for infinite).
  - `timeout_action`: string — What to do on timeout: `"deny"` (default), `"allow"`, or `"wait"`.
  - `intercept_matcher`: string (regex) — Which tools to gate.
  - `auto_approve_tools`: string[] — Tools allowed even in remote.
  - `respect_claude_permissions`: boolean — Check Claude's settings.json before prompting (default: true).
  - Env fallbacks: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` can populate values.

- `~/.claude-remote/mode` — `local` or `remote` (global AFK mode).
- `~/.claude-remote/approvals/` — transient files for Approve/Deny decisions.
- `~/.claude-remote/session-map.json` — message_id → session mapping + latest session per chat.
- `~/.claude-remote/history.jsonl` — append‑only event log (trimmed to last ~200 lines).

- Project scope files (if installed there):
  - `./.claude/settings.json` or `./.claude/settings.local.json` — hooks section.
  - `./.claude/hooks/afk` — executable copy used by hooks.
  - `./.claude/commands/afk.md` — discoverability; actual toggle via UserPromptSubmit.

## Multiple Projects & Sessions

- Mode and Telegram config are global. Hooks at any scope read the same config/state.
- Install at user scope to cover all projects, or at project/local scope to check in/out configuration.
- Run exactly one bot instance with your token; multiple pollers will race on `getUpdates`.

## Security & Safety

- Hooks run with your user privileges. Review commands and test before production use.
- Claude Code snapshots hook config; after edits, open `/hooks` to approve changes.
- Keep `intercept_matcher` narrow to your threat model; only gate the tools you need.

## Troubleshooting

- No Telegram messages:
  - Re‑run `afk setup`; verify token/chat id; ensure outbound HTTPS is allowed.
  - Confirm the bot is running: `afk telegram start-bot` (single instance).

- Buttons do nothing:
  - Ensure only one bot instance is running (multiple pollers may drop updates).

- Approvals not gating:
  - Set AFK to remote: `afk mode on`.
  - Check matcher covers your tool names; re‑approve hooks via `/hooks`.

- Reply routed to wrong session:
  - Use native Reply to the session message; otherwise routing defaults to the latest session.

- “(no output)” after Reply/Continue:
  - The `claude` CLI printed no stdout. Routing still worked; this is expected in mock/local tests.

## Configuration Examples

### Timeout Configuration

Example `~/.claude-remote/config.json`:

```json
{
  "telegram_bot_token": "YOUR_BOT_TOKEN",
  "telegram_chat_id": "YOUR_CHAT_ID",
  "timeout_seconds": 3600,        // 1 hour timeout (default)
  "timeout_action": "wait",       // Options: "deny", "allow", "wait"
  "intercept_matcher": "Bash|Edit|Write|MultiEdit|WebFetch|mcp__.*",
  "auto_approve_tools": ["Read"],
  "respect_claude_permissions": true
}
```

**Timeout Actions:**
- `"deny"`: Auto-deny after timeout (safe default)
- `"allow"`: Auto-approve after timeout (convenient but less secure)
- `"wait"`: Keep waiting indefinitely (never timeout, best for long AFK periods)

## Enhanced Permission Management

The "Allow All" feature integrates with Claude Code's native permission system:

1. **One-time approval**: Use "Approve" for single-use permission
2. **Permanent patterns**: Use "Allow All" to add patterns to `~/.claude/settings.json`
3. **Delegate to UI**: Use "Ask Claude UI" to see Claude's native permission dialog
4. **Smart patterns**: Automatically generates appropriate permission patterns:
   - `Bash(npm test:*)` - All npm test variations
   - `Bash(git:*)` - All git commands
   - `WebFetch(domain:api.example.com)` - All URLs from that domain
   - `mcp__code-search__search_code` - Specific MCP tools

Permission patterns are saved to `~/.claude/settings.json` and persist across sessions, reducing approval fatigue while maintaining security.

## Examples

- Simulate an approval (blocks until Approve/Deny/Allow All/Ask UI):
```
echo '{"tool_name":"Bash","tool_input":{"command":"npm test"},"session_id":"sess-1","cwd":"/path/to/proj"}' | afk hook pretooluse
```

- Simulate a stop notice:
```
echo '{"session_id":"sess-1","cwd":"/path/to/proj"}' | afk hook stop
```

- Wait locally for a reply/continue (used with blocking Stop):
```
afk inbox wait --session sess-1 --timeout 120
```

## 🧪 Testing

Run the test suite to ensure everything is working correctly:

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:permissions   # Test permission handling
npm run test:integration   # Test integration flows
npm run test:syntax        # Verify syntax is valid
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on:
- Code of conduct
- Development setup
- Pull request process
- Coding standards

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for the Claude Code community
- Inspired by the need for better remote control of AI assistants
- Zero dependencies philosophy for maximum portability

## 📚 Resources

- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Node.js Built-in Modules](https://nodejs.org/api/)

## 🐛 Issues & Support

Found a bug or have a feature request? Please open an issue on [GitHub Issues](https://github.com/probelabs/afk/issues).

---

**Made with ❤️ for the Claude Code community**

