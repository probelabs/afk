# Python AI Agent + AFK Integration

Simple example showing how to integrate any Python AI agent with AFK remote control using subprocess calls to the AFK binary.

## Features

- ✅ **Simple**: Just 100 lines of Python code
- ✅ **No Dependencies**: Uses only Python stdlib + AFK binary
- ✅ **Remote Approval**: Get Telegram notifications for risky actions  
- ✅ **Session Management**: Proper session start/end notifications
- ✅ **Error Handling**: Graceful fallbacks when AFK unavailable

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
python3 ai_agent.py

# Or use the integration in your own agent
from ai_agent import AFKIntegration

afk = AFKIntegration("my-agent")
if afk.request_approval("dangerous_action", {"details": "..."}):
    # User approved - execute action
    perform_dangerous_action()
```

## Integration Pattern

The integration uses subprocess calls to the AFK binary:

```python
# Request approval
result = subprocess.run(
    ['afk', 'hook', 'pretooluse'],
    input=json.dumps({
        "tool_name": "action_name",
        "tool_input": {"param": "value"},
        "session_id": "my-session",
        "cwd": "/current/directory",
        "transcript_path": "/tmp/session.jsonl"
    }),
    text=True,
    capture_output=True,
    timeout=300
)

# Check result
approved = (result.returncode == 0)  # 0=approved, 2=denied, 1=error
```

## Example Operations

The demo shows several types of operations:

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
🤖 Python AI Agent

execute_code:
```python
print('Hello from approved code!')
```

Language: python
Session: python-12345

[✅ Approve] [❌ Deny] [📋 Details]
```

## Customization

### Risk Assessment
```python
def assess_risk(action_name, params):
    high_risk = ['execute_code', 'shell_command', 'delete_file']
    medium_risk = ['write_file', 'modify_config']
    
    if action_name in high_risk:
        return 'high'
    elif action_name in medium_risk:
        return 'medium'
    else:
        return 'low'

# Only request approval for medium/high risk
risk = assess_risk(action_name, params)
if risk in ['medium', 'high']:
    approved = afk.request_approval(action_name, params)
else:
    approved = True  # Auto-approve low risk
```

### Custom Actions
```python
def my_custom_action(self, data):
    """Your custom AI action with AFK approval"""
    if self.afk.request_approval("custom_action", {
        "data_size": len(str(data)),
        "action_type": "data_processing"
    }):
        # User approved - execute
        result = self.process_data(data)
        return result
    else:
        print("Custom action denied by user")
        return None
```

### Error Handling
```python
def safe_request_approval(afk, action_name, params):
    """Request approval with fallback behavior"""
    try:
        return afk.request_approval(action_name, params)
    except subprocess.TimeoutExpired:
        print("⏰ Approval timeout - defaulting to deny")
        return False
    except FileNotFoundError:
        print("⚠️ AFK not installed - running in local mode")
        return True  # or False, depending on your preference
    except Exception as e:
        print(f"🚨 AFK error: {e} - defaulting to deny")  
        return False
```

This approach is much simpler than a complex SDK while providing all the remote control functionality!