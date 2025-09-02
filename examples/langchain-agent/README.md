# LangChain Agent + AFK Integration

This example demonstrates integrating AFK remote control with LangChain agents, providing remote approval for tool usage and chain execution.

## Features

- Remote approval for tool execution
- Chain-level and tool-level control
- Memory and context preservation during approvals
- Support for custom tools and chains
- Detailed execution logging

## Installation

```bash
npm install @probelabs/afk-core langchain
```

## Environment Setup

```bash
export OPENAI_API_KEY="sk-..."
export TELEGRAM_BOT_TOKEN="1234:ABC..."
export TELEGRAM_CHAT_ID="123456789"
```

## Usage

```javascript
const { LangChainAFK } = require('./langchain-afk');

// Create agent with AFK protection
const agent = new LangChainAFK({
  llmConfig: {
    modelName: 'gpt-4',
    temperature: 0.7
  },
  tools: [
    'calculator',
    'search',
    'filesystem'
  ],
  afkConfig: {
    telegramConfig: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID
    },
    autoApproveTools: ['calculator', 'search'],
    requireApprovalTools: ['filesystem', 'web_scraper'],
    autoDenyTools: ['system_command', 'delete_files']
  }
});

// Execute with remote control
const result = await agent.run('Analyze the data in data.csv and create a summary report');
```

## Tool Categories

### Auto-Approved Tools
- **Calculator**: Mathematical computations
- **Search**: Web and knowledge base searches  
- **Read-only operations**: File reading, data querying

### Approval-Required Tools
- **File system**: File creation, modification
- **Web scraping**: Data extraction from websites
- **API calls**: External service integrations
- **Data processing**: Large dataset operations

### Auto-Denied Tools
- **System commands**: Shell execution, system calls
- **Network tools**: Port scanning, security testing
- **Destructive operations**: File deletion, data removal

## Configuration

```json
{
  "langchain": {
    "llm": {
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.7,
      "maxTokens": 2048
    },
    "memory": {
      "type": "buffer",
      "maxTokens": 4000,
      "returnMessages": true
    },
    "tools": [
      {
        "name": "calculator",
        "description": "Perform mathematical calculations",
        "approval": "auto"
      },
      {
        "name": "filesystem",
        "description": "File system operations",
        "approval": "required",
        "risk": "medium"
      },
      {
        "name": "web_scraper", 
        "description": "Extract data from web pages",
        "approval": "required",
        "risk": "medium"
      }
    ]
  },
  
  "afk": {
    "enabled": true,
    "approvalTimeout": 300000,
    "chainApproval": {
      "enabled": true,
      "threshold": 3
    },
    "logging": {
      "level": "info",
      "includeContext": true,
      "maxContextLength": 1000
    }
  }
}
```

## Chain-Level Control

The integration supports both tool-level and chain-level approvals:

- **Tool-level**: Individual tool execution approvals
- **Chain-level**: Approve entire execution chains
- **Conditional**: Approve based on context and parameters
- **Batch**: Approve multiple similar operations

## Custom Tools

You can easily add AFK protection to custom LangChain tools:

```javascript
import { Tool } from 'langchain/tools';

class CustomTool extends Tool {
  name = 'custom_tool';
  description = 'Custom tool with AFK protection';
  
  async _call(input, runManager) {
    // AFK approval is automatically handled by the wrapper
    return await this.executeCustomLogic(input);
  }
  
  async executeCustomLogic(input) {
    // Your tool implementation
    return `Processed: ${input}`;
  }
}
```