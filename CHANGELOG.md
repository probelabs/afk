# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2025-01-09

### Added
- **Read-Only Mode**: New operating mode for passive monitoring without workflow interference
  - Enable with `afk readonly` command or `/afk:readonly` slash command
  - Sends notifications for completed sessions without blocking or waiting for responses
  - Perfect for monitoring long-running tasks without delays
  - Operates independently from local/remote toggle cycle
- **Enhanced Mode Management**: Three distinct operating modes with clear purposes
  - **Local Mode**: Default Claude behavior with built-in prompts
  - **Remote Mode**: Full Telegram approval workflow with interactive buttons
  - **Read-Only Mode**: Passive notifications without intervention
- **Improved Toggle Behavior**: Toggle command now cycles only between local and remote modes
  - Read-only mode requires explicit activation via dedicated command
  - Maintains predictable toggle behavior while adding monitoring capability
- **Updated CLI and Slash Commands**: Full support for read-only mode
  - New `afk readonly` CLI command
  - New `/afk:readonly` slash command for Claude Code interface
  - Updated help documentation and command descriptions

### Changed
- Toggle behavior now cycles between local ↔ remote only (read-only is separate)
- Updated notification formatting to clearly indicate read-only mode with special prefixes
- Enhanced help text and documentation to explain all three operating modes
- Improved mode status display with tips for switching between all modes

### Fixed
- Resolved Utils class instantiation issue causing cryptoRandomId function errors
- PreToolUse hook now correctly handles read-only mode without intervention

## [0.4.0] - 2025-08-30

### Added
- **Heartbeat-based session expiration**: Sessions now actively report their status via heartbeats
  - Heartbeat updates occur every second during polling
  - Sessions marked as expired only when heartbeat stops (2 seconds timeout)
  - Prevents false "expired" messages while hooks are actively waiting
- **Automatic hook cancellation**: Hooks automatically exit when switching from remote to local mode
  - No more hanging hooks when toggling modes
  - Immediate response to mode changes

### Changed
- Session expiration detection now based on heartbeat instead of creation time
- Removed auto-guessing for message routing - only explicit Reply button clicks accepted
- Simplified message handling logic for better predictability

### Fixed
- Sessions no longer show as "expired" while actively waiting for approval
- Mode switching now properly cancels all pending approval requests

## [0.2.0] - 2025-08-29

### Added
- **SessionStart hook**: New hook that triggers when Claude Code sessions start
  - Sends Telegram notifications when new sessions begin (startup, resume, or clear)
  - Shows session metadata including project name, session ID, and working directory
  - Includes interactive "Reply" button for immediate follow-up
  - Only active in remote mode to avoid unnecessary notifications
  - Integrates with existing session tracking and management system
  - Provides contextual messages based on session source type

### Changed
- Updated hook installation to include SessionStart alongside PreToolUse and Stop hooks
- Enhanced session lifecycle visibility for better remote monitoring

## [0.1.0] - 2025-08-28

### Added
- Initial release of @probelabs/afk
- Manual AFK toggle via CLI commands (`on`, `off`, `toggle`, `status`)
- Telegram bot integration for remote approvals
- PreToolUse hook for gating permissioned tools
- Stop hook for session follow-ups
- UserPromptSubmit hook for `/afk` commands
- Multi-session support with intelligent routing
- Interactive setup wizard
- Flexible installation scopes (user, project, local)
- Timeout configuration with customizable actions
- Auto-approve list for trusted tools
- Permission pattern generation for Allow All functionality
- Local inbox for blocking Stop flows
- Comprehensive test suite
- Zero runtime dependencies - uses only Node.js built-ins

### Features
- Real-time Telegram notifications
- Interactive approval buttons (Approve/Deny/Allow All/Ask Claude UI)
- Native Telegram reply support for session targeting
- Session tracking and history logging
- Respects Claude's existing permission settings
- Smart permission pattern generation based on tool type

### Security
- Secure token handling
- Permission-based access control
- Timeout-based auto-denial for security

[0.2.0]: https://github.com/probelabs/afk/releases/tag/v0.2.0
[0.1.0]: https://github.com/probelabs/afk/releases/tag/v0.1.0