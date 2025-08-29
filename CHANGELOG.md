# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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