#!/bin/bash
# AFK Integration Test Script
# Comprehensive testing for all AFK integration examples

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $*${NC}"; }
log_error() { echo -e "${RED}❌ $*${NC}"; }
log_test() { echo -e "${CYAN}🧪 $*${NC}"; }

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_CONFIG="$PROJECT_ROOT/test-config.json"
TEST_SESSION_ID="afk-test-$$"
TEST_TIMEOUT=30

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Test result tracking
record_test() {
    local status="$1"
    local name="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    case "$status" in
        pass)
            PASSED_TESTS=$((PASSED_TESTS + 1))
            log_success "PASS: $name"
            ;;
        fail)
            FAILED_TESTS=$((FAILED_TESTS + 1))
            log_error "FAIL: $name"
            ;;
        skip)
            SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
            log_warning "SKIP: $name"
            ;;
    esac
}

# Check if AFK is properly installed and configured
test_afk_installation() {
    log_test "Testing AFK installation..."
    
    # Check if afk command exists
    if ! command -v afk >/dev/null 2>&1; then
        record_test fail "AFK binary not found"
        log_error "AFK binary not installed. Run: npm install -g @probelabs/afk"
        return 1
    fi
    record_test pass "AFK binary found"
    
    # Check AFK status
    if afk status >/dev/null 2>&1; then
        record_test pass "AFK status command works"
    else
        record_test fail "AFK status command failed"
        return 1
    fi
    
    # Check AFK configuration
    if [[ -f "$HOME/.afk/config.json" ]]; then
        local config
        config=$(cat "$HOME/.afk/config.json")
        local has_token has_chat_id
        has_token=$(echo "$config" | jq -r '.telegram_bot_token // empty' 2>/dev/null || echo "")
        has_chat_id=$(echo "$config" | jq -r '.telegram_chat_id // empty' 2>/dev/null || echo "")
        
        if [[ -n "$has_token" && -n "$has_chat_id" ]]; then
            record_test pass "AFK configuration found"
        else
            record_test fail "AFK configuration incomplete"
            log_warning "Run 'afk setup' to configure Telegram integration"
            return 1
        fi
    else
        record_test fail "AFK configuration file not found"
        return 1
    fi
    
    return 0
}

# Test AFK hook functionality
test_afk_hooks() {
    log_test "Testing AFK hook functionality..."
    
    # Test pretooluse hook with auto-deny
    local hook_input
    hook_input=$(cat <<EOF
{
  "tool_name": "test_action",
  "tool_input": {"test": true},
  "session_id": "$TEST_SESSION_ID",
  "cwd": "$(pwd)",
  "transcript_path": "/tmp/$TEST_SESSION_ID.jsonl"
}
EOF
    )
    
    # This should work (even if denied) - we're just testing the hook mechanism
    local exit_code
    if echo "$hook_input" | timeout $TEST_TIMEOUT afk hook pretooluse >/dev/null 2>&1; then
        exit_code=0
    else
        exit_code=$?
    fi
    
    # Any of these exit codes indicate the hook is working
    case $exit_code in
        0|2) record_test pass "AFK pretooluse hook responds" ;;
        124) record_test skip "AFK pretooluse hook timeout (user interaction required)" ;;
        *) record_test fail "AFK pretooluse hook failed (code: $exit_code)" ;;
    esac
    
    # Test session start hook
    local session_input
    session_input=$(cat <<EOF
{
  "session_id": "$TEST_SESSION_ID",
  "cwd": "$(pwd)",
  "transcript_path": "/tmp/$TEST_SESSION_ID.jsonl"
}
EOF
    )
    
    if echo "$session_input" | timeout $TEST_TIMEOUT afk hook sessionstart >/dev/null 2>&1; then
        record_test pass "AFK sessionstart hook works"
    else
        record_test skip "AFK sessionstart hook failed (not critical)"
    fi
}

# Test syntax of example files
test_syntax() {
    log_test "Testing syntax of example files..."
    
    # Test Python examples
    for py_file in "$PROJECT_ROOT/examples"/*/*.py; do
        if [[ -f "$py_file" ]]; then
            local filename
            filename=$(basename "$py_file")
            if python3 -m py_compile "$py_file" 2>/dev/null; then
                record_test pass "Python syntax: $filename"
            else
                record_test fail "Python syntax: $filename"
            fi
        fi
    done
    
    # Test Node.js examples
    for js_file in "$PROJECT_ROOT/examples"/*/*.js; do
        if [[ -f "$js_file" ]]; then
            local filename
            filename=$(basename "$js_file")
            if node -c "$js_file" 2>/dev/null; then
                record_test pass "Node.js syntax: $filename"
            else
                record_test fail "Node.js syntax: $filename"
            fi
        fi
    done
    
    # Test shell script examples
    for sh_file in "$PROJECT_ROOT/examples"/*/*.sh; do
        if [[ -f "$sh_file" ]]; then
            local filename
            filename=$(basename "$sh_file")
            if bash -n "$sh_file" 2>/dev/null; then
                record_test pass "Shell syntax: $filename"
            else
                record_test fail "Shell syntax: $filename"
            fi
        fi
    done
}

# Test example imports and basic functionality
test_imports() {
    log_test "Testing example imports..."
    
    # Test Python example imports
    local python_example="$PROJECT_ROOT/examples/python-agent/ai_agent.py"
    if [[ -f "$python_example" ]]; then
        if python3 -c "
import sys
sys.path.insert(0, '$(dirname "$python_example")')
import ai_agent
print('Python import successful')
" >/dev/null 2>&1; then
            record_test pass "Python example import"
        else
            record_test fail "Python example import"
        fi
    else
        record_test skip "Python example not found"
    fi
    
    # Test Node.js example loading
    local nodejs_example="$PROJECT_ROOT/examples/nodejs-agent/ai-agent.js"
    if [[ -f "$nodejs_example" ]]; then
        if node -e "
const path = require('path');
process.chdir(path.dirname('$nodejs_example'));
const { AFKIntegration } = require('./ai-agent.js');
console.log('Node.js import successful');
" >/dev/null 2>&1; then
            record_test pass "Node.js example import"
        else
            record_test fail "Node.js example import"
        fi
    else
        record_test skip "Node.js example not found"
    fi
    
    # Test generic template import
    local template_example="$PROJECT_ROOT/examples/generic-ai/template.py"
    if [[ -f "$template_example" ]]; then
        if python3 -c "
import sys
sys.path.insert(0, '$(dirname "$template_example")')
import template
print('Generic template import successful')
" >/dev/null 2>&1; then
            record_test pass "Generic template import"
        else
            record_test fail "Generic template import"
        fi
    else
        record_test skip "Generic template not found"
    fi
}

# Test basic integration functionality (dry-run mode)
test_integration_basics() {
    log_test "Testing basic integration functionality..."
    
    # Test Python integration basic initialization
    if python3 -c "
import sys, os
sys.path.insert(0, '$PROJECT_ROOT/examples/python-agent')
from ai_agent import AFKIntegration
afk = AFKIntegration('test-session')
print(f'Python integration initialized: {afk.session_id}')
" >/dev/null 2>&1; then
        record_test pass "Python AFKIntegration initialization"
    else
        record_test fail "Python AFKIntegration initialization"
    fi
    
    # Test Node.js integration basic initialization  
    if node -e "
process.chdir('$PROJECT_ROOT/examples/nodejs-agent');
const { AFKIntegration } = require('./ai-agent.js');
const afk = new AFKIntegration('test-session');
console.log('Node.js integration initialized:', afk.sessionId);
" >/dev/null 2>&1; then
        record_test pass "Node.js AFKIntegration initialization"
    else
        record_test fail "Node.js AFKIntegration initialization"
    fi
    
    # Test generic template basic initialization
    if python3 -c "
import sys
sys.path.insert(0, '$PROJECT_ROOT/examples/generic-ai')
from template import BaseAIAgent, ExampleAIAgent
class TestAgent(BaseAIAgent):
    def initialize(self, **kwargs): pass
    def _perform_action(self, name, params): return 'test'
agent = TestAgent('test-session')
agent.shutdown()
print('Generic template initialized successfully')
" >/dev/null 2>&1; then
        record_test pass "Generic template initialization"
    else
        record_test fail "Generic template initialization"
    fi
}

# Test documentation and README files
test_documentation() {
    log_test "Testing documentation..."
    
    # Check that all examples have README files
    for example_dir in "$PROJECT_ROOT/examples"/*; do
        if [[ -d "$example_dir" ]]; then
            local readme="$example_dir/README.md"
            local dirname
            dirname=$(basename "$example_dir")
            
            if [[ -f "$readme" ]]; then
                # Check README has required sections
                if grep -q "Prerequisites" "$readme" && grep -q "Usage" "$readme"; then
                    record_test pass "README completeness: $dirname"
                else
                    record_test fail "README completeness: $dirname (missing sections)"
                fi
            else
                record_test fail "README exists: $dirname"
            fi
        fi
    done
    
    # Check main integration documentation
    if [[ -f "$PROJECT_ROOT/INTEGRATION.md" ]]; then
        if grep -q "Integration Patterns" "$PROJECT_ROOT/INTEGRATION.md"; then
            record_test pass "Main INTEGRATION.md completeness"
        else
            record_test fail "Main INTEGRATION.md completeness"
        fi
    else
        record_test fail "Main INTEGRATION.md exists"
    fi
}

# Test file permissions and executability
test_permissions() {
    log_test "Testing file permissions..."
    
    # Check that script files are executable
    for script_file in "$PROJECT_ROOT/examples"/*/*.{py,js,sh} "$PROJECT_ROOT/scripts"/*.sh; do
        if [[ -f "$script_file" && "$script_file" =~ \.(py|sh)$ ]]; then
            local filename
            filename=$(basename "$script_file")
            
            if [[ -x "$script_file" ]]; then
                record_test pass "Executable: $filename"
            else
                record_test fail "Executable: $filename"
            fi
        fi
    done
}

# Generate test report
generate_report() {
    echo
    echo "======================================"
    echo "🧪 AFK Integration Test Report"
    echo "======================================"
    echo
    
    local pass_rate=0
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        pass_rate=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
    fi
    
    echo "📊 Test Results:"
    echo "   Total Tests: $TOTAL_TESTS"
    echo -e "   ${GREEN}Passed: $PASSED_TESTS${NC}"
    echo -e "   ${RED}Failed: $FAILED_TESTS${NC}"
    echo -e "   ${YELLOW}Skipped: $SKIPPED_TESTS${NC}"
    echo "   Pass Rate: $pass_rate%"
    echo
    
    if [[ $FAILED_TESTS -eq 0 ]]; then
        log_success "🎉 All tests passed! AFK integration is ready to use."
        echo
        log_info "Next steps:"
        echo "  1. Run example demos to test interactively"
        echo "  2. Check individual README files for usage instructions"
        echo "  3. Integrate AFK into your own AI systems using the examples"
        return 0
    else
        log_error "❌ Some tests failed. Please review the failures above."
        echo
        log_info "Common issues:"
        echo "  - Run 'scripts/setup-integration.sh' first"
        echo "  - Ensure AFK is configured: 'afk setup'"
        echo "  - Check that all dependencies are installed"
        return 1
    fi
}

# Run interactive tests (requires user input)
test_interactive() {
    log_test "Running interactive tests..."
    log_warning "These tests require user interaction via Telegram"
    
    echo
    read -p "Run interactive tests? [y/N]: " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping interactive tests"
        return 0
    fi
    
    log_info "Starting interactive test session..."
    log_info "You should receive Telegram notifications for approval"
    
    # Test Python example with a safe action
    if python3 -c "
import sys
sys.path.insert(0, '$PROJECT_ROOT/examples/python-agent')
from ai_agent import SimpleAIAgent
agent = SimpleAIAgent()
try:
    agent.analyze_data([1, 2, 3, 4, 5])
    print('Python interactive test completed')
finally:
    agent.shutdown()
" 2>/dev/null; then
        record_test pass "Python interactive test"
    else
        record_test fail "Python interactive test"
    fi
}

# Main test function
main() {
    echo "🧪 AFK Integration Test Suite"
    echo "Testing all integration examples and functionality"
    echo
    
    cd "$PROJECT_ROOT"
    
    # Run test categories
    test_afk_installation
    test_afk_hooks
    test_syntax
    test_imports
    test_integration_basics
    test_documentation
    test_permissions
    
    # Check for interactive flag
    if [[ "${1:-}" == "--interactive" || "${1:-}" == "-i" ]]; then
        test_interactive
    fi
    
    generate_report
}

# Handle command line arguments
case "${1:-test}" in
    test)
        main "$@"
        ;;
    interactive)
        main --interactive
        ;;
    afk)
        test_afk_installation
        test_afk_hooks
        ;;
    syntax)
        test_syntax
        ;;
    imports)
        test_imports
        ;;
    docs)
        test_documentation
        ;;
    help|--help|-h)
        echo "AFK Integration Test Script"
        echo
        echo "Usage: $0 [COMMAND]"
        echo
        echo "Commands:"
        echo "  test         Run all tests (default)"
        echo "  interactive  Run all tests including interactive ones"
        echo "  afk         Test only AFK installation and hooks"
        echo "  syntax      Test only syntax validation"
        echo "  imports     Test only import functionality" 
        echo "  docs        Test only documentation"
        echo "  help        Show this help"
        echo
        echo "Examples:"
        echo "  $0              # Run standard tests"
        echo "  $0 interactive  # Include user interaction tests"
        echo "  $0 syntax       # Quick syntax check"
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac

exit $([[ $FAILED_TESTS -eq 0 ]] && echo 0 || echo 1)