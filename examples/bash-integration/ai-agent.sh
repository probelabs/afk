#!/bin/bash
# Shell Script AI Agent with AFK Integration
# Uses direct afk binary calls for remote approval

set -euo pipefail

# Configuration
SESSION_ID="bash-agent-$$"
CWD="$(pwd)"
TRANSCRIPT_PATH="/tmp/${SESSION_ID}.jsonl"
TIMEOUT=300  # 5 minutes

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $*${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $*${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $*${NC}"
}

log_error() {
    echo -e "${RED}❌ $*${NC}"
}

# Check if AFK is installed
check_afk_installed() {
    if ! command -v afk >/dev/null 2>&1; then
        log_error "AFK binary not found. Install with: npm install -g @probelabs/afk"
        exit 1
    fi
}

# Request approval for an action using afk binary
request_approval() {
    local action_name="$1"
    local action_params="$2"
    
    local hook_input
    hook_input=$(cat <<EOF
{
  "tool_name": "$action_name",
  "tool_input": $action_params,
  "session_id": "$SESSION_ID",
  "cwd": "$CWD",
  "transcript_path": "$TRANSCRIPT_PATH"
}
EOF
    )
    
    log_info "Requesting approval for: $action_name"
    
    # Call AFK with timeout
    if echo "$hook_input" | timeout $TIMEOUT afk hook pretooluse >/dev/null 2>&1; then
        return 0  # Approved
    else
        local exit_code=$?
        case $exit_code in
            124) log_warning "Approval timeout for $action_name"; return 1 ;;
            2)   log_warning "User denied $action_name"; return 1 ;;
            *)   log_error "AFK integration error (code: $exit_code)"; return 1 ;;
        esac
    fi
}

# Notify AFK of session start
notify_session_start() {
    local hook_input
    hook_input=$(cat <<EOF
{
  "session_id": "$SESSION_ID",
  "cwd": "$CWD",
  "transcript_path": "$TRANSCRIPT_PATH"
}
EOF
    )
    
    echo "$hook_input" | afk hook sessionstart >/dev/null 2>&1 || true
}

# Notify AFK of session end
notify_session_end() {
    local hook_input
    hook_input=$(cat <<EOF
{
  "session_id": "$SESSION_ID",
  "cwd": "$CWD",
  "stop_hook_active": true
}
EOF
    )
    
    echo "$hook_input" | afk hook stop >/dev/null 2>&1 || true
}

# Execute shell command with approval
execute_shell_command() {
    local command="$1"
    local params
    params=$(cat <<EOF
{
  "command": "$command"
}
EOF
    )
    
    if request_approval "shell_command" "$params"; then
        log_success "Shell command approved: $command"
        echo "📤 Output:"
        eval "$command"
    else
        log_error "Shell command denied: $command"
        return 1
    fi
}

# Write file with approval
write_file() {
    local filepath="$1"
    local content="$2"
    
    # Truncate content for mobile display
    local display_content
    if [[ ${#content} -gt 100 ]]; then
        display_content="${content:0:100}..."
    else
        display_content="$content"
    fi
    
    local params
    params=$(cat <<EOF
{
  "filepath": "$filepath",
  "content": $(echo "$display_content" | jq -Rs .),
  "size": ${#content}
}
EOF
    )
    
    if request_approval "write_file" "$params"; then
        log_success "File write approved: $filepath"
        echo "$content" > "$filepath"
        log_info "File written: $filepath"
    else
        log_error "File write denied: $filepath"
        return 1
    fi
}

# Execute script with approval
execute_script() {
    local script_content="$1"
    local language="${2:-bash}"
    
    # Truncate script for mobile display
    local display_script
    if [[ ${#script_content} -gt 200 ]]; then
        display_script="${script_content:0:200}..."
    else
        display_script="$script_content"
    fi
    
    local params
    params=$(cat <<EOF
{
  "code": $(echo "$display_script" | jq -Rs .),
  "language": "$language"
}
EOF
    )
    
    if request_approval "execute_code" "$params"; then
        log_success "Script execution approved"
        echo "Executing: $script_content"
        eval "$script_content"
    else
        log_error "Script execution denied"
        return 1
    fi
}

# Analyze data (low-risk, auto-approved)
analyze_data() {
    local -a data=("$@")
    
    log_info "Analyzing ${#data[@]} data points..."
    
    # Calculate statistics
    local sum=0
    local max="${data[0]}"
    local min="${data[0]}"
    
    for num in "${data[@]}"; do
        sum=$((sum + num))
        if ((num > max)); then
            max=$num
        fi
        if ((num < min)); then
            min=$num
        fi
    done
    
    local avg
    if [[ ${#data[@]} -gt 0 ]]; then
        avg=$((sum / ${#data[@]}))
    else
        avg=0
    fi
    
    log_success "Analysis complete:"
    echo "   Average: $avg"
    echo "   Max: $max"
    echo "   Min: $min"
}

# Cleanup function
cleanup() {
    log_info "AI Agent shutting down..."
    notify_session_end
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Demo function
demo() {
    log_info "🤖 Shell Script AI Agent started with AFK remote control"
    notify_session_start
    
    echo
    echo "--- Demo: Safe Operations (No Approval Needed) ---"
    analyze_data 1 2 3 4 5 10 15 20
    
    echo
    echo "--- Demo: Risky Operations (Approval Required) ---"
    
    # Script execution (high risk)
    execute_script "echo 'Hello from approved shell script!'"
    
    # File writing (medium risk)
    write_file "/tmp/ai_agent_test.txt" "This file was created by the shell AI agent after user approval."
    
    # Shell commands (high risk)
    execute_shell_command "echo 'Hello from approved command'"
    execute_shell_command "ls -la /tmp/ai_agent_test.txt"
    
    # Dangerous command (should be denied)
    echo
    echo "--- Demo: Dangerous Operation ---"
    execute_shell_command "rm -rf /" || true  # This should be denied!
}

# Usage function
usage() {
    cat <<EOF
Shell Script AI Agent with AFK Integration

Usage: $0 [COMMAND] [ARGS...]

Commands:
    demo                    Run the demo
    execute <command>       Execute shell command with approval
    script <code>          Execute script with approval
    write <file> <content> Write file with approval
    analyze <numbers...>   Analyze data (no approval needed)

Examples:
    $0 demo
    $0 execute "ls -la"
    $0 script "echo 'Hello World'"
    $0 write "/tmp/test.txt" "Hello World"
    $0 analyze 1 2 3 4 5

Prerequisites:
    npm install -g @probelabs/afk
    afk setup
EOF
}

# Main function
main() {
    check_afk_installed
    
    case "${1:-demo}" in
        demo)
            demo
            ;;
        execute)
            if [[ $# -lt 2 ]]; then
                log_error "Usage: $0 execute <command>"
                exit 1
            fi
            execute_shell_command "$2"
            ;;
        script)
            if [[ $# -lt 2 ]]; then
                log_error "Usage: $0 script <code>"
                exit 1
            fi
            execute_script "$2"
            ;;
        write)
            if [[ $# -lt 3 ]]; then
                log_error "Usage: $0 write <file> <content>"
                exit 1
            fi
            write_file "$2" "$3"
            ;;
        analyze)
            if [[ $# -lt 2 ]]; then
                log_error "Usage: $0 analyze <numbers...>"
                exit 1
            fi
            shift
            analyze_data "$@"
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: $1"
            usage
            exit 1
            ;;
    esac
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "🚀 Shell Script AI Agent with AFK Integration"
    echo "This demo shows how to integrate any shell script with AFK remote control"
    echo "Make sure you have AFK installed: npm install -g @probelabs/afk"
    echo "And configured: afk setup"
    echo
    
    main "$@"
fi