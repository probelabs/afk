#!/bin/bash
# AFK Integration Setup Script
# Sets up AFK binary and configures integration for various AI systems

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $*${NC}"; }
log_error() { echo -e "${RED}❌ $*${NC}"; }

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXAMPLES_DIR="$PROJECT_ROOT/examples"

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_deps=()
    
    if ! command_exists node; then
        missing_deps+=("node.js")
    fi
    
    if ! command_exists npm; then
        missing_deps+=("npm")
    fi
    
    if ! command_exists python3; then
        missing_deps+=("python3")
    fi
    
    if ! command_exists jq; then
        missing_deps+=("jq")
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        log_info "Please install the missing dependencies:"
        log_info "  macOS: brew install node python jq"
        log_info "  Ubuntu: apt install nodejs npm python3 jq"
        return 1
    fi
    
    log_success "All prerequisites satisfied"
    return 0
}

# Install AFK binary
install_afk() {
    log_info "Installing AFK binary..."
    
    if command_exists afk; then
        local current_version
        current_version=$(npm list -g @probelabs/afk --depth=0 2>/dev/null | grep @probelabs/afk | head -1 || echo "")
        if [[ -n "$current_version" ]]; then
            log_success "AFK already installed: $current_version"
            return 0
        fi
    fi
    
    log_info "Installing @probelabs/afk globally..."
    if npm install -g @probelabs/afk; then
        log_success "AFK binary installed successfully"
    else
        log_error "Failed to install AFK binary"
        log_info "Try: sudo npm install -g @probelabs/afk"
        return 1
    fi
}

# Configure AFK
configure_afk() {
    log_info "Configuring AFK..."
    
    if [[ -f "$HOME/.afk/config.json" ]]; then
        local config
        config=$(cat "$HOME/.afk/config.json")
        local has_token
        has_token=$(echo "$config" | jq -r '.telegram_bot_token // empty')
        local has_chat_id
        has_chat_id=$(echo "$config" | jq -r '.telegram_chat_id // empty')
        
        if [[ -n "$has_token" && -n "$has_chat_id" ]]; then
            log_success "AFK already configured"
            return 0
        fi
    fi
    
    log_info "Running AFK setup wizard..."
    log_info "You'll need:"
    log_info "  1. A Telegram bot token (get from @BotFather)"
    log_info "  2. Your Telegram chat ID"
    log_info ""
    
    if afk setup; then
        log_success "AFK configured successfully"
    else
        log_error "AFK configuration failed"
        return 1
    fi
}

# Test AFK installation
test_afk() {
    log_info "Testing AFK installation..."
    
    if afk telegram test; then
        log_success "AFK test message sent successfully"
    else
        log_warning "AFK test failed - you may need to reconfigure"
        log_info "Run: afk setup"
    fi
}

# Set up Python example
setup_python_example() {
    log_info "Setting up Python example..."
    
    local python_dir="$EXAMPLES_DIR/python-agent"
    if [[ -d "$python_dir" ]]; then
        cd "$python_dir"
        chmod +x ai_agent.py
        
        # Test Python example
        if python3 -c "import ai_agent; print('Python example ready')"; then
            log_success "Python example ready: $python_dir/ai_agent.py"
        else
            log_warning "Python example may have issues"
        fi
    else
        log_warning "Python example directory not found: $python_dir"
    fi
}

# Set up Node.js example
setup_nodejs_example() {
    log_info "Setting up Node.js example..."
    
    local nodejs_dir="$EXAMPLES_DIR/nodejs-agent"
    if [[ -d "$nodejs_dir" ]]; then
        cd "$nodejs_dir"
        chmod +x ai-agent.js
        
        # Test Node.js example
        if node -c ai-agent.js; then
            log_success "Node.js example ready: $nodejs_dir/ai-agent.js"
        else
            log_warning "Node.js example may have syntax errors"
        fi
    else
        log_warning "Node.js example directory not found: $nodejs_dir"
    fi
}

# Set up shell script example
setup_bash_example() {
    log_info "Setting up bash example..."
    
    local bash_dir="$EXAMPLES_DIR/bash-integration"
    if [[ -d "$bash_dir" ]]; then
        cd "$bash_dir"
        chmod +x ai-agent.sh
        
        # Test bash example
        if bash -n ai-agent.sh; then
            log_success "Bash example ready: $bash_dir/ai-agent.sh"
        else
            log_warning "Bash example may have syntax errors"
        fi
    else
        log_warning "Bash example directory not found: $bash_dir"
    fi
}

# Set up generic template
setup_generic_template() {
    log_info "Setting up generic AI template..."
    
    local template_dir="$EXAMPLES_DIR/generic-ai"
    if [[ -d "$template_dir" ]]; then
        cd "$template_dir"
        chmod +x template.py
        
        # Test generic template
        if python3 -c "import template; print('Generic template ready')"; then
            log_success "Generic template ready: $template_dir/template.py"
        else
            log_warning "Generic template may have issues"
        fi
    else
        log_warning "Generic template directory not found: $template_dir"
    fi
}

# Create test configuration
create_test_config() {
    log_info "Creating test configuration..."
    
    cat > "$PROJECT_ROOT/test-config.json" <<EOF
{
  "test_session_id": "afk-integration-test-$$",
  "examples": {
    "python": "$EXAMPLES_DIR/python-agent/ai_agent.py",
    "nodejs": "$EXAMPLES_DIR/nodejs-agent/ai-agent.js", 
    "bash": "$EXAMPLES_DIR/bash-integration/ai-agent.sh",
    "generic": "$EXAMPLES_DIR/generic-ai/template.py"
  },
  "test_commands": {
    "python": "python3",
    "nodejs": "node",
    "bash": "bash",
    "generic": "python3"
  }
}
EOF
    
    log_success "Test configuration created: $PROJECT_ROOT/test-config.json"
}

# Show usage instructions
show_usage() {
    log_success "🎉 AFK Integration setup complete!"
    echo
    log_info "Available examples:"
    echo "  📝 Python:     $EXAMPLES_DIR/python-agent/ai_agent.py"
    echo "  🚀 Node.js:    $EXAMPLES_DIR/nodejs-agent/ai-agent.js"
    echo "  🔧 Bash:       $EXAMPLES_DIR/bash-integration/ai-agent.sh"
    echo "  🎯 Generic:    $EXAMPLES_DIR/generic-ai/template.py"
    echo
    log_info "Quick test commands:"
    echo "  python3 examples/python-agent/ai_agent.py"
    echo "  node examples/nodejs-agent/ai-agent.js"
    echo "  bash examples/bash-integration/ai-agent.sh"
    echo "  python3 examples/generic-ai/template.py"
    echo
    log_info "Run comprehensive tests:"
    echo "  bash scripts/test-integration.sh"
    echo
    log_info "Need help? Check the README files in each example directory"
}

# Main setup function
main() {
    echo "🚀 AFK Integration Setup Script"
    echo "This will set up AFK binary and all integration examples"
    echo
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    # Run setup steps
    if ! check_prerequisites; then exit 1; fi
    if ! install_afk; then exit 1; fi
    if ! configure_afk; then exit 1; fi
    
    test_afk
    
    setup_python_example
    setup_nodejs_example  
    setup_bash_example
    setup_generic_template
    
    create_test_config
    show_usage
    
    log_success "Setup completed successfully! 🎉"
}

# Handle command line arguments
case "${1:-setup}" in
    setup)
        main
        ;;
    check)
        check_prerequisites
        ;;
    install)
        install_afk
        ;;
    configure)
        configure_afk
        ;;
    test)
        test_afk
        ;;
    examples)
        setup_python_example
        setup_nodejs_example
        setup_bash_example
        setup_generic_template
        ;;
    help|--help|-h)
        echo "AFK Integration Setup Script"
        echo
        echo "Usage: $0 [COMMAND]"
        echo
        echo "Commands:"
        echo "  setup      Full setup (default)"
        echo "  check      Check prerequisites only"
        echo "  install    Install AFK binary only"
        echo "  configure  Configure AFK only"
        echo "  test       Test AFK installation"
        echo "  examples   Set up examples only"
        echo "  help       Show this help"
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac