# Generic AI Agent Template + AFK Integration

Comprehensive template for integrating any AI system with AFK remote approval. This template provides a complete framework with risk assessment, approval policies, and customizable behavior.

## Features

- ✅ **Complete Framework**: Base classes for easy AI integration
- ✅ **Risk Assessment**: Configurable risk levels with pattern matching
- ✅ **Approval Policies**: Flexible auto-approve/deny rules
- ✅ **Custom Assessors**: Add your own risk evaluation logic
- ✅ **Error Handling**: Comprehensive error handling and logging
- ✅ **Session Management**: Proper session lifecycle management
- ✅ **Extensible**: Easy to customize for any AI system

## Prerequisites

```bash
# Install AFK binary
npm install -g @probelabs/afk

# Configure Telegram integration
afk setup

# Verify installation
afk status
```

## Quick Start

```bash
# Run the demo
python3 template.py

# Or use as a library
from template import BaseAIAgent, RiskLevel, ApprovalPolicy

class MyAI(BaseAIAgent):
    def initialize(self, **kwargs):
        # Custom initialization
        pass
    
    def _perform_action(self, action_name, action_params):
        # Implement your AI's actions
        return "Action completed"

ai = MyAI(session_id="my-ai")
result = ai.execute_action("my_action", {"param": "value"})
```

## Architecture

### Core Components

1. **AFKIntegration** - Handles subprocess calls to AFK binary
2. **RiskAssessor** - Evaluates risk levels using patterns and custom logic
3. **ApprovalPolicy** - Determines when to request approval
4. **BaseAIAgent** - Abstract base class for AI implementations

### Risk Levels

- **LOW** - Auto-approved (data analysis, read operations)
- **MEDIUM** - Requires approval (file writes, network requests)  
- **HIGH** - Requires approval (code execution, shell commands)
- **CRITICAL** - Auto-denied (destructive operations like `rm -rf /`)

### Flow Diagram

```
Action Request → Risk Assessment → Approval Policy Check
                       ↓
    ┌─────────────────────────────────────────┐
    │                                         │
    ▼                  ▼                      ▼
Auto-Approve     Request Approval        Auto-Deny
    │                  │                      │
    ▼                  ▼                      ▼
Execute Action   User Decision         Return Error
                      │
                 ┌────┴────┐
                 ▼         ▼
            Approved    Denied
                 │         │
                 ▼         ▼
         Execute Action  Return Error
```

## Customization Examples

### Custom Risk Assessor

```python
def custom_risk_assessor(action_name: str, params: Dict) -> Optional[RiskLevel]:
    # Example: Database operations are always high risk
    if 'database' in action_name.lower():
        return RiskLevel.HIGH
    
    # Example: Operations on test data are low risk
    if params.get('dataset') == 'test':
        return RiskLevel.LOW
    
    return None  # Use default assessment

agent.risk_assessor.add_custom_assessor(custom_risk_assessor)
```

### Custom Approval Policy

```python
def auto_approve_dev_mode(action_name: str, params: Dict) -> bool:
    # Auto-approve everything in development mode
    return os.getenv('ENV') == 'development'

def auto_approve_small_files(action_name: str, params: Dict) -> bool:
    # Auto-approve small file writes
    if action_name == 'write_file':
        content = params.get('content', '')
        return len(content) < 1000
    return False

agent.approval_policy.add_auto_approve_condition(auto_approve_dev_mode)
agent.approval_policy.add_auto_approve_condition(auto_approve_small_files)
```

### Subclass Implementation

```python
class ChatbotAI(BaseAIAgent):
    def initialize(self, **kwargs):
        self.model = kwargs.get('model', 'gpt-3.5-turbo')
        
        # Custom risk patterns for chatbot actions
        self.risk_assessor.risk_patterns[RiskLevel.HIGH].extend([
            r'send.*message.*all',
            r'broadcast',
            r'mass.*email'
        ])
        
        # Auto-approve simple chat responses
        def auto_approve_chat(action_name: str, params: Dict) -> bool:
            return action_name == 'send_message' and len(params.get('message', '')) < 200
        
        self.approval_policy.add_auto_approve_condition(auto_approve_chat)
    
    def _perform_action(self, action_name: str, action_params: Dict[str, Any]) -> Any:
        if action_name == 'send_message':
            message = action_params['message']
            recipient = action_params.get('recipient', 'user')
            # Implement actual message sending
            return f"Message sent to {recipient}: {message}"
        
        elif action_name == 'search_web':
            query = action_params['query']
            # Implement web search
            return f"Web search results for: {query}"
        
        elif action_name == 'generate_code':
            language = action_params.get('language', 'python')
            prompt = action_params['prompt']
            # Implement code generation
            return f"Generated {language} code for: {prompt}"
        
        return super()._perform_action(action_name, action_params)

# Usage
chatbot = ChatbotAI(session_id="chatbot-1", model="gpt-4")
result = chatbot.execute_action("send_message", {
    "message": "Hello! How can I help you today?",
    "recipient": "user123"
})
```

### Configuration Examples

```python
# Strict security policy
agent.approval_policy.require_approval.update({
    RiskLevel.LOW: True,     # Even low risk requires approval
    RiskLevel.MEDIUM: True,
    RiskLevel.HIGH: True,
    RiskLevel.CRITICAL: True,
})

# Permissive development policy  
agent.approval_policy.require_approval.update({
    RiskLevel.LOW: False,    # Auto-approve low risk
    RiskLevel.MEDIUM: False, # Auto-approve medium risk
    RiskLevel.HIGH: True,    # Still require approval for high risk
})

# Custom risk patterns
agent.risk_assessor.risk_patterns[RiskLevel.HIGH].extend([
    r'api.*key',
    r'secret.*token',
    r'password.*hash'
])
```

## Error Handling

The template includes comprehensive error handling:

```python
try:
    result = agent.execute_action("risky_action", {"param": "value"})
    
    if result.success:
        print(f"Action completed: {result.result}")
    else:
        if not result.approved:
            print(f"Action denied: {result.error}")
        else:
            print(f"Action failed: {result.error}")
            
except Exception as e:
    print(f"Unexpected error: {e}")
finally:
    agent.shutdown()  # Always clean up
```

## Integration with Existing AI Systems

### OpenAI Assistant Integration

```python
class OpenAIAssistant(BaseAIAgent):
    def initialize(self, **kwargs):
        import openai
        self.client = openai.OpenAI(api_key=kwargs['api_key'])
        self.assistant_id = kwargs['assistant_id']
    
    def _perform_action(self, action_name: str, action_params: Dict[str, Any]) -> Any:
        if action_name == 'call_function':
            # Call OpenAI function with approval
            function_call = action_params['function_call']
            # Implement OpenAI function calling
            return "Function called successfully"
        
        return super()._perform_action(action_name, action_params)
```

### LangChain Integration

```python
class LangChainAgent(BaseAIAgent):
    def initialize(self, **kwargs):
        from langchain.agents import AgentExecutor
        self.executor = kwargs['agent_executor']
    
    def _perform_action(self, action_name: str, action_params: Dict[str, Any]) -> Any:
        if action_name == 'run_tool':
            # Run LangChain tool with approval
            tool_name = action_params['tool_name']
            tool_input = action_params['tool_input']
            # Implement tool execution
            return "Tool executed successfully"
        
        return super()._perform_action(action_name, action_params)
```

This template provides everything you need to add AFK remote approval to any AI system!