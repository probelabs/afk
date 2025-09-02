# Shell Script AI Agent + AFK Integration

Simple example showing how to integrate any shell script or bash-based AI agent with AFK remote control using direct calls to the AFK binary.

## Features

- ✅ **Simple**: Pure bash script with no external dependencies
- ✅ **Direct Integration**: Uses `afk` binary directly with JSON piping
- ✅ **Remote Approval**: Get Telegram notifications for risky actions
- ✅ **Session Management**: Proper session start/end notifications
- ✅ **Error Handling**: Graceful fallbacks and timeout handling
- ✅ **Colorized Output**: Clear visual feedback
- ✅ **Signal Handling**: Clean shutdown on interruption

## Prerequisites

```bash
# Install AFK binary
npm install -g @probelabs/afk

# Configure Telegram integration
afk setup

# Verify installation
afk status

# Ensure jq is installed (for JSON processing)
# On macOS: brew install jq
# On Ubuntu: apt install jq
```

## Usage

```bash
# Make executable
chmod +x ai-agent.sh

# Run the demo
./ai-agent.sh demo

# Execute specific commands
./ai-agent.sh execute "ls -la"
./ai-agent.sh script "echo 'Hello World'"
./ai-agent.sh write "/tmp/test.txt" "Hello from shell"
./ai-agent.sh analyze 1 2 3 4 5

# Get help
./ai-agent.sh help
```

## Integration Pattern

The integration uses direct shell commands with JSON piping:

```bash
# Request approval
hook_input='{"tool_name":"action_name","tool_input":{"param":"value"},"session_id":"my-session","cwd":"'$(pwd)'","transcript_path":"/tmp/session.jsonl"}'

# Call AFK with timeout
if echo "$hook_input" | timeout 300 afk hook pretooluse >/dev/null 2>&1; then
    echo "Approved"
else
    case $? in
        124) echo "Timeout" ;;
        2)   echo "Denied" ;;
        *)   echo "Error" ;;
    esac
fi
```

## Command Structure

### Available Commands

- `demo` - Run the full demonstration
- `execute <command>` - Execute shell command with approval
- `script <code>` - Execute script code with approval  
- `write <file> <content>` - Write file with approval
- `analyze <numbers...>` - Analyze data (no approval needed)
- `help` - Show usage information

### Examples

```bash
# Safe operations (no approval)
./ai-agent.sh analyze 10 20 30 40 50

# Risky operations (approval required)
./ai-agent.sh execute "cat /etc/passwd"
./ai-agent.sh script "for i in {1..5}; do echo \"Count: \$i\"; done"
./ai-agent.sh write "/tmp/report.txt" "System analysis complete"

# Very dangerous (should be denied)
./ai-agent.sh execute "rm -rf /"
```

### How It Looks on Mobile

When the script requests approval, you get a rich Telegram notification:

```
🤖 Shell Script AI Agent

shell_command:
{
  "command": "cat /etc/passwd"
}

Session: bash-agent-12345

[✅ Approve] [❌ Deny] [📋 Details]
```

## Integration in Your Scripts

### Basic Integration
```bash
#!/bin/bash
source ai-agent.sh  # Or copy the functions you need

# Request approval for risky operation
if request_approval "dangerous_operation" '{"details":"system modification"}'; then
    echo "User approved - proceeding"
    perform_dangerous_operation
else
    echo "User denied - aborting"
    exit 1
fi
```

### Custom Risk Assessment
```bash
assess_risk() {
    local command="$1"
    case "$command" in
        rm*|del*|format*) echo "high" ;;
        sudo*|su*) echo "high" ;;
        cat*/etc*|ls*/etc*) echo "medium" ;;
        echo*|pwd|date) echo "low" ;;
        *) echo "medium" ;;
    esac
}

safe_execute() {
    local command="$1"
    local risk=$(assess_risk "$command")
    
    if [[ "$risk" == "low" ]]; then
        # Auto-approve low risk
        eval "$command"
    else
        # Request approval for medium/high risk
        if request_approval "shell_command" "{\"command\":\"$command\"}"; then
            eval "$command"
        else
            echo "Command denied: $command"
            return 1
        fi
    fi
}
```

### Error Handling
```bash
safe_request_approval() {
    local action_name="$1"
    local action_params="$2"
    
    if ! command -v afk >/dev/null 2>&1; then
        echo "⚠️ AFK not installed - running in local mode"
        return 0  # or return 1, depending on preference
    fi
    
    if request_approval "$action_name" "$action_params"; then
        return 0
    else
        local exit_code=$?
        case $exit_code in
            124) echo "⏰ Approval timeout - defaulting to deny"; return 1 ;;
            2)   echo "❌ User denied action"; return 1 ;;
            *)   echo "🚨 AFK error (code: $exit_code) - defaulting to deny"; return 1 ;;
        esac
    fi
}
```

## Environment Variables

You can customize behavior with environment variables:

```bash
export AFK_TIMEOUT=600        # Approval timeout in seconds (default: 300)
export AFK_SESSION_ID="my-ai" # Custom session ID
export AFK_AUTO_APPROVE_LOW=1 # Auto-approve low-risk operations
```

## Signal Handling

The script properly handles interruption signals:

- `SIGINT` (Ctrl+C) - Graceful shutdown with session end notification
- `SIGTERM` - Clean termination
- `EXIT` - Automatic cleanup on any exit

This approach gives you full shell scripting power with remote approval capabilities!