# OpenAI Assistant + AFK Integration

This example shows how to integrate AFK remote control with OpenAI Assistants API.

## Features

- Remote approval for function calls
- Cost tracking and budget controls  
- Session management across conversations
- Rich Telegram notifications with code snippets
- Auto-approval for safe functions

## Installation

```bash
npm install @probelabs/afk-core openai
```

## Environment Setup

```bash
export OPENAI_API_KEY="sk-..."
export TELEGRAM_BOT_TOKEN="1234:ABC..."
export TELEGRAM_CHAT_ID="123456789"
```

## Usage

```javascript
const { OpenAIAssistantAFK } = require('./openai-assistant-afk');

// Initialize with AFK protection
const assistant = new OpenAIAssistantAFK({
  apiKey: process.env.OPENAI_API_KEY,
  assistantId: 'asst_...',
  afkConfig: {
    telegramConfig: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID
    },
    autoApprove: ['get_weather', 'search_web'],
    autoDeny: ['delete_file', 'send_email']
  }
});

// Run with remote control
const response = await assistant.chat('user-123', 'Help me analyze this data file');
```

## Configuration

```json
{
  "openai": {
    "apiKey": "${OPENAI_API_KEY}",
    "assistantId": "asst_abc123",
    "model": "gpt-4",
    "maxTokens": 4096
  },
  
  "afk": {
    "enabled": true,
    "budget": {
      "maxCostPerHour": 5.00,
      "maxCostPerDay": 50.00,
      "currency": "USD"
    },
    "functions": {
      "autoApprove": [
        "get_current_weather",
        "search_web",
        "calculate",
        "get_date_time"
      ],
      "requireApproval": [
        "run_code", 
        "file_operations",
        "send_email",
        "api_calls"
      ],
      "autoDeny": [
        "delete_data",
        "system_commands"
      ]
    }
  }
}
```

## Function Examples

The integration automatically handles these common function types:

### Safe Functions (Auto-approved)
- Weather queries
- Web searches  
- Calculations
- Date/time operations
- Read-only file access

### Risky Functions (Require approval)
- Code execution
- File modifications
- API calls to external services
- Data processing operations
- Email/messaging

### Dangerous Functions (Auto-denied)
- System commands
- Data deletion
- Security operations
- Network attacks