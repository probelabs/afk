# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-28

### Added
- Initial release of afk-claude
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

[1.0.0]: https://github.com/buger/afk-claude/releases/tag/v1.0.0