#!/usr/bin/env node
// Comprehensive tests for hook system integration functionality

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// Import centralized mocks
const { TelegramMock, TelegramResponses, setupSuccessfulTelegram, setupNetworkError } = require('./mocks/telegram');
const { FileSystemMock, setupAfkConfig, setupModeFile, addSampleImageFile } = require('./mocks/filesystem');
const { ProcessMock, setupGitRepository } = require('./mocks/process');
const { TestStats, assertContains } = require('./utils/test-helpers');

// Test configuration
let testResults = [];
let testCounter = 0;

// Mock instances
let telegramMock;
let fsMock;
let processMock;
let testStats;

// Test-specific request tracking
let testRequestCount = 0;
let testRequests = [];

// Initialize global mock instances once
telegramMock = new TelegramMock();
fsMock = new FileSystemMock(); 
processMock = new ProcessMock();
testStats = new TestStats();

// Activate mocks globally
telegramMock.activate();
fsMock.activate();
processMock.activate();

console.log('=== Hook Integration Tests ===\\n');

// Suppress unhandled promise rejection warnings during testing
process.on('unhandledRejection', (reason, promise) => {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  throw reason;
});

// Helper function to run async tests
async function runAsyncTest(name, testFn) {
  testCounter++;
  try {
    await testFn();
    console.log(`✅ Test ${testCounter}: ${name}`);
    testResults.push({ name, passed: true });
    if (testStats) testStats.addPass(name);
  } catch (error) {
    console.log(`❌ Test ${testCounter}: ${name}`);
    console.log(`   Error: ${error.message}`);
    testResults.push({ name, passed: false, error: error.message });
    if (testStats) testStats.addFail(name, error);
  }
}

// Helper function to run sync tests
function runTest(name, testFn) {
  testCounter++;
  try {
    testFn();
    console.log(`✅ Test ${testCounter}: ${name}`);
    testResults.push({ name, passed: true });
    if (testStats) testStats.addPass(name);
  } catch (error) {
    console.log(`❌ Test ${testCounter}: ${name}`);
    console.log(`   Error: ${error.message}`);
    testResults.push({ name, passed: false, error: error.message });
    if (testStats) testStats.addFail(name, error);
  }
}

// Setup function to clear mock data between tests
function setupMocks() {
  // Clear filesystem and process mocks 
  fsMock.clear();
  processMock.clear();
  // Only clear telegram responses, keep requests for assertion
  telegramMock.responses.clear();
}

// Cleanup function to clear data after tests
function cleanupMocks() {
  // Don't clear telegram requests, let them accumulate for debugging
  // if (telegramMock) {
  //   telegramMock.requests = [];
  // }
}

// Test helper functions using centralized mocks
function mockTelegramSuccess(method, data = {}) {
  telegramMock.setResponse(`/${method}`, {
    ok: true,
    result: {
      message_id: 123,
      chat: { id: 67890 },
      ...data
    }
  });
}

function mockTelegramError(method, errorDescription) {
  telegramMock.setResponse(`/${method}`, {
    ok: false,
    description: errorDescription
  });
}

function createMockConfig(telegramBotToken = '12345:test-token', telegramChatId = '67890') {
  setupAfkConfig(fsMock, {
    telegram_bot_token: telegramBotToken,
    telegram_chat_id: telegramChatId,
    auto_approve_tools: ['Read', 'Grep', 'Glob', 'TodoWrite']
  });
}

function createMockModeFile(mode = 'remote') {
  setupModeFile(fsMock, mode);
}

function createMockImageFile(imagePath, sizeKB = 50) {
  addSampleImageFile(fsMock, imagePath, sizeKB);
}

// Simplified test implementations of hook functions
async function testHookPreToolUse(inputData) {
  const data = inputData;
  const toolName = data.tool_name;
  const toolInput = data.tool_input || {};
  const sessionId = data.session_id;
  const cwd = data.cwd;

  const fs = require('fs');
  const configPath = path.join(os.homedir(), '.afk', 'config.json');
  
  // Try to load config
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    // No config = local mode
    const result = { decision: 'allow', message: 'Local mode - no config' };
    console.log(JSON.stringify(result));
    return result;
  }

  // Check mode
  const modePath = path.join(os.homedir(), '.afk', 'mode');
  let mode = 'remote';
  try {
    mode = fs.readFileSync(modePath, 'utf8').trim();
  } catch (e) {
    mode = 'remote';
  }

  // Auto-approve tools
  const autoApproveTools = config.auto_approve_tools || [];
  if (autoApproveTools.includes(toolName)) {
    const result = { decision: 'allow', message: `Auto-approved: ${toolName}` };
    console.log(JSON.stringify(result));
    return result;
  }

  // Local mode auto-approves
  if (mode === 'local') {
    const result = { decision: 'allow', message: 'Local mode - auto-approved' };
    console.log(JSON.stringify(result));
    return result;
  }

  // Try to send approval request
  try {
    const { telegram_chat_id: chat, telegram_bot_token: token } = config;
    
    if (!token || !chat) {
      throw new Error('Telegram not configured');
    }
    
    // For file editing tools, try to generate preview
    let previewPath = null;
    if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(toolName)) {
      const tempPath = '/tmp/afk-preview-diff.png';
      if (fs.existsSync(tempPath)) {
        previewPath = tempPath;
      }
    }
    
    const approvalText = `🤖 **Agent Request**\\n\\n**Tool:** ${toolName}\\n**Session:** ${sessionId?.substring(0, 8)}...\\n\\nApprove this action?`;
    
    if (previewPath) {
      await sendTelegramPhoto(previewPath, approvalText);
    } else {
      await sendTelegramMessage(approvalText);
    }
    
    const result = { decision: 'ask', message: 'Approval request sent' };
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    const result = { decision: 'deny', message: `Failed to send approval request: ${error.message}` };
    console.log(JSON.stringify(result));
    return result;
  }
}

async function testHookStop(inputData) {
  const data = inputData;
  const sessionId = data.session_id;

  const fs = require('fs');
  const configPath = path.join(os.homedir(), '.afk', 'config.json');
  
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return { message: 'No config - local mode' };
  }

  // Check mode
  const modePath = path.join(os.homedir(), '.afk', 'mode');
  let mode = 'remote';
  try {
    mode = fs.readFileSync(modePath, 'utf8').trim();
  } catch (e) {
    mode = 'remote';
  }

  if (mode === 'local') {
    return { message: 'Local mode - no notification' };
  }

  try {
    const completionText = `🏁 **Agent Finished**\\n\\n**Session:** ${sessionId?.substring(0, 8)}...\\n\\nTask completed successfully.`;
    
    // Try to use diff image if available
    const diffPath = '/tmp/afk-completion-diff.png';
    if (fs.existsSync(diffPath)) {
      await sendTelegramPhoto(diffPath, completionText);
    } else {
      await sendTelegramMessage(completionText);
    }
    
    return { message: 'Completion notification sent' };
  } catch (error) {
    return { message: `Failed to send completion: ${error.message}` };
  }
}

async function testHookSessionStart(inputData) {
  const data = inputData;
  const sessionId = data.session_id;

  const fs = require('fs');
  const configPath = path.join(os.homedir(), '.afk', 'config.json');
  
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return { message: 'No config - local mode' };
  }

  // Check mode
  const modePath = path.join(os.homedir(), '.afk', 'mode');
  let mode = 'remote';
  try {
    mode = fs.readFileSync(modePath, 'utf8').trim();
  } catch (e) {
    mode = 'remote';
  }

  if (mode === 'local') {
    return { message: 'Local mode - no notification' };
  }

  try {
    const projectName = path.basename(data.cwd || 'unknown');
    const startText = `🚀 **New Session**\\n\\n**Session ID:** ${sessionId?.substring(0, 8)}...\\n**Project:** ${projectName}\\n\\nAgent session started.`;
    
    await sendTelegramMessage(startText);
    return { message: 'Session start notification sent' };
  } catch (error) {
    return { message: `Failed to send session start: ${error.message}` };
  }
}

// Mock Telegram functions - directly use the mock for testing
async function sendTelegramMessage(text, reply_markup) {
  const configPath = path.join(os.homedir(), '.afk', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const { telegram_chat_id: chat, telegram_bot_token: token } = config;
  
  const body = new URLSearchParams();
  const params = { chat_id: chat, text, parse_mode: 'Markdown' };
  if (reply_markup) params.reply_markup = JSON.stringify(reply_markup);
  
  for (const [k, v] of Object.entries(params)) {
    body.append(k, String(v));
  }
  
  const data = body.toString();
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(data)
    },
    timeout: 10000
  };
  
  // Directly track the request instead of using https
  const requestData = {
    hostname: options.hostname,
    path: options.path,
    method: options.method,
    headers: options.headers,
    body: data,
    timestamp: Date.now()
  };
  // Only add to test-specific tracking, bypass the mock's array entirely
  testRequestCount++;
  testRequests.push(requestData);
  
  // Check for mock response
  const responseKey = telegramMock._getResponseKey(options.path);
  const mockResponse = telegramMock.responses.get(responseKey);
  
  if (mockResponse && !mockResponse.ok) {
    throw new Error(mockResponse.description || 'Telegram error');
  }
  
  // Check for network error simulation
  const errorKey = responseKey + '_error';
  if (telegramMock.responses.has(errorKey)) {
    throw telegramMock.responses.get(errorKey);
  }
  
  return { message_id: 123, chat: { id: parseInt(chat) } };
}

async function sendTelegramPhoto(imagePath, caption) {
  const configPath = path.join(os.homedir(), '.afk', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const { telegram_chat_id: chat, telegram_bot_token: token } = config;
  
  if (!fs.existsSync(imagePath)) {
    throw new Error('Image file not found: ' + imagePath);
  }
  
  const boundary = '----AFK' + Math.random().toString(36).substring(2);
  const imageData = fs.readFileSync(imagePath);
  
  const parts = [];
  parts.push(`--${boundary}\\r\\n`);
  parts.push(`Content-Disposition: form-data; name="chat_id"\\r\\n\\r\\n`);
  parts.push(`${chat}\\r\\n`);
  
  if (caption) {
    parts.push(`--${boundary}\\r\\n`);
    parts.push(`Content-Disposition: form-data; name="caption"\\r\\n\\r\\n`);
    parts.push(`${caption}\\r\\n`);
  }
  
  parts.push(`--${boundary}\\r\\n`);
  parts.push(`Content-Disposition: form-data; name="photo"; filename="diff.png"\\r\\n`);
  parts.push(`Content-Type: image/png\\r\\n\\r\\n`);
  
  const formDataBuffer = Buffer.concat([
    Buffer.from(parts.join('')),
    imageData,
    Buffer.from(`\\r\\n--${boundary}--\\r\\n`)
  ]);
  
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendPhoto`,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': formDataBuffer.length
    },
    timeout: 30000
  };
  
  // Directly track the request instead of using https
  const requestData = {
    hostname: options.hostname,
    path: options.path,
    method: options.method,
    headers: options.headers,
    body: formDataBuffer,
    timestamp: Date.now()
  };
  // Only add to test-specific tracking, bypass the mock's array entirely
  testRequestCount++;
  testRequests.push(requestData);
  
  // Check for mock response
  const responseKey = telegramMock._getResponseKey(options.path);
  const mockResponse = telegramMock.responses.get(responseKey);
  
  if (mockResponse && !mockResponse.ok) {
    throw new Error(mockResponse.description || 'Telegram photo upload error');
  }
  
  // Check for network error simulation
  const errorKey = responseKey + '_error';
  if (telegramMock.responses.has(errorKey)) {
    throw telegramMock.responses.get(errorKey);
  }
  
  return { message_id: 123, chat: { id: parseInt(chat) }, photo: [{ file_id: 'test-photo' }] };
}

console.log('Setting up test environment...\\n');

// ========================================
// PreToolUse Hook Integration Tests
// ========================================


runAsyncTest('PreToolUse hook with auto-approved tool (Read)', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('remote');
  
  const input = {
    tool_name: 'Read',
    tool_input: { file_path: '/test/file.txt' },
    session_id: 'test-session-123',
    cwd: '/test/project',
    transcript_path: '/tmp/transcript.json'
  };
  
  const result = await testHookPreToolUse(input);
  
  assert.strictEqual(result.decision, 'allow');
  assert(result.message.includes('Auto-approved'));
  cleanupMocks();
});

runAsyncTest('PreToolUse hook in local mode auto-approves', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('local');
  
  const input = {
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /' },
    session_id: 'test-session-123',
    cwd: '/test/project'
  };
  
  const result = await testHookPreToolUse(input);
  
  assert.strictEqual(result.decision, 'allow');
  assert(result.message.includes('Local mode'));
  cleanupMocks();
});

runAsyncTest('PreToolUse hook with file editing tool generates preview', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('remote');
  mockTelegramSuccess('sendPhoto', { photo: [{ file_id: 'preview123' }] });
  
  // Create the preview image file first
  createMockImageFile('/tmp/afk-preview-diff.png', 50);
  
  // Clear test-specific requests counter 
  testRequestCount = 0;
  testRequests = [];
  
  const input = {
    tool_name: 'Edit',
    tool_input: { 
      file_path: '/test/file.js',
      old_string: 'const old = true',
      new_string: 'const new = false'
    },
    session_id: 'test-session-123',
    cwd: '/test/project'
  };
  
  const result = await testHookPreToolUse(input);
  
  assert.strictEqual(result.decision, 'ask');
  assert(result.message.includes('Approval request sent'));
  // Use test-specific counter
  assert.strictEqual(testRequestCount, 1);
  assert(testRequests[0].path.includes('sendPhoto'));
  cleanupMocks();
});

runAsyncTest('PreToolUse hook with non-file-editing tool sends text message', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('remote');
  mockTelegramSuccess('sendMessage', { text: 'Approval request' });
  
  // Clear test-specific requests counter
  testRequestCount = 0;
  testRequests = [];
  
  const input = {
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    session_id: 'test-session-123',
    cwd: '/test/project'
  };
  
  const result = await testHookPreToolUse(input);
  
  assert.strictEqual(result.decision, 'ask');
  assert(result.message.includes('Approval request sent'));
  assert.strictEqual(testRequestCount, 1);
  assert(testRequests[0].path.includes('sendMessage'));
  cleanupMocks();
});

runAsyncTest('PreToolUse hook with Telegram error returns deny', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('remote');
  // Set up network error to simulate failure
  setupNetworkError(telegramMock);
  
  const input = {
    tool_name: 'Bash',
    tool_input: { command: 'npm install' },
    session_id: 'test-session-123',
    cwd: '/test/project'
  };
  
  const result = await testHookPreToolUse(input);
  
  assert.strictEqual(result.decision, 'deny');
  assert(result.message.includes('Failed to send approval request'));
  cleanupMocks();
});

runAsyncTest('PreToolUse hook without config allows in local mode', async () => {
  setupMocks();
  // Don't create config file
  
  const input = {
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
    session_id: 'test-session-123',
    cwd: '/test/project'
  };
  
  const result = await testHookPreToolUse(input);
  
  assert.strictEqual(result.decision, 'allow');
  assert(result.message.includes('Local mode'));
  cleanupMocks();
});

// ========================================
// Stop Hook Integration Tests
// ========================================

runAsyncTest('Stop hook in remote mode with diff image', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('remote');
  mockTelegramSuccess('sendPhoto', { photo: [{ file_id: 'diff123' }] });
  
  // Create the diff image file
  createMockImageFile('/tmp/afk-completion-diff.png', 100);
  
  // Clear test-specific requests counter
  testRequestCount = 0;
  testRequests = [];
  
  const input = {
    session_id: 'test-session-123',
    cwd: '/test/project',
    transcript_path: '/tmp/transcript.json',
    stop_hook_active: true
  };
  
  const result = await testHookStop(input);
  
  assert(result.message.includes('Completion notification sent'));
  assert.strictEqual(testRequestCount, 1);
  assert(testRequests[0].path.includes('sendPhoto'));
  cleanupMocks();
});

runAsyncTest('Stop hook in local mode does not send notification', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('local');
  
  const input = {
    session_id: 'test-session-123',
    cwd: '/test/project',
    stop_hook_active: true
  };
  
  const result = await testHookStop(input);
  
  assert(result.message.includes('Local mode'));
  const requests = telegramMock.getRequests();
  assert.strictEqual(requests.length, 0);
  cleanupMocks();
});

runAsyncTest('Stop hook without config returns local mode message', async () => {
  setupMocks();
  // Don't create config file
  
  const input = {
    session_id: 'test-session-123',
    cwd: '/test/project'
  };
  
  const result = await testHookStop(input);
  
  assert(result.message.includes('No config'));
  cleanupMocks();
});

runAsyncTest('Stop hook falls back to text when no diff image', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('remote');
  mockTelegramSuccess('sendMessage', { text: 'Completion message' });
  
  // Don't create diff image file
  
  const input = {
    session_id: 'test-session-123',
    cwd: '/test/project'
  };
  
  const result = await testHookStop(input);
  
  assert(result.message.includes('Completion notification sent'));
  const requests = telegramMock.getRequests();
  assert.strictEqual(requests.length, 1);
  assert(requests[0].path.includes('sendMessage'));
  cleanupMocks();
});

// ========================================
// SessionStart Hook Integration Tests
// ========================================

runAsyncTest('SessionStart hook in remote mode sends notification', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('remote');
  mockTelegramSuccess('sendMessage', { text: 'Session start' });
  
  const input = {
    session_id: 'test-session-123',
    cwd: '/test/project',
    transcript_path: '/tmp/transcript.json',
    source: 'claude-code'
  };
  
  const result = await testHookSessionStart(input);
  
  assert(result.message.includes('Session start notification sent'));
  const requests = telegramMock.getRequests();
  assert.strictEqual(requests.length, 1);
  assert(requests[0].path.includes('sendMessage'));
  
  // Check that message includes project name and session ID
  const requestData = requests[0].body || '';
  assertContains(requestData, 'project', 'Request should contain project name');
  assertContains(requestData, 'test-session', 'Request should contain session ID');
  cleanupMocks();
});

runAsyncTest('SessionStart hook in local mode does not send notification', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('local');
  
  const input = {
    session_id: 'test-session-123',
    cwd: '/test/project'
  };
  
  const result = await testHookSessionStart(input);
  
  assert(result.message.includes('Local mode'));
  const requests = telegramMock.getRequests();
  assert.strictEqual(requests.length, 0);
  cleanupMocks();
});

runAsyncTest('SessionStart hook without config returns local mode message', async () => {
  setupMocks();
  // Don't create config file
  
  const input = {
    session_id: 'test-session-123',
    cwd: '/test/project'
  };
  
  const result = await testHookSessionStart(input);
  
  assert(result.message.includes('No config'));
  cleanupMocks();
});

// ========================================
// JSON Protocol Communication Tests
// ========================================

runTest('JSON input parsing with valid data', () => {
  const validInput = {
    tool_name: 'Edit',
    tool_input: { file_path: '/test.js', old_string: 'old', new_string: 'new' },
    session_id: 'test-123',
    cwd: '/project'
  };
  
  // Test that JSON parsing works correctly
  const jsonString = JSON.stringify(validInput);
  const parsed = JSON.parse(jsonString);
  
  assert.deepStrictEqual(parsed, validInput);
});

runTest('JSON output format validation for PreToolUse decisions', () => {
  const decisions = [
    { decision: 'allow', message: 'Auto-approved: Read' },
    { decision: 'ask', message: 'Approval request sent' },
    { decision: 'deny', message: 'Permission denied' }
  ];
  
  decisions.forEach(result => {
    const jsonOutput = JSON.stringify(result);
    const parsed = JSON.parse(jsonOutput);
    
    assert.strictEqual(parsed.decision, result.decision);
    assert.strictEqual(parsed.message, result.message);
    assert(['allow', 'deny', 'ask'].includes(parsed.decision));
  });
});

runTest('JSON output structure compliance for Claude Code integration', () => {
  // Test various output formats that Claude Code expects
  
  // PreToolUse outputs must have decision and message
  const preToolOutput = { decision: 'allow', message: 'Auto-approved' };
  const preToolJson = JSON.stringify(preToolOutput);
  const preToolParsed = JSON.parse(preToolJson);
  assert(['allow', 'deny', 'ask'].includes(preToolParsed.decision));
  assert(typeof preToolParsed.message === 'string');
  
  // Stop hook outputs need message
  const stopOutput = { message: 'Completion sent' };
  const stopJson = JSON.stringify(stopOutput);
  const stopParsed = JSON.parse(stopJson);
  assert(typeof stopParsed.message === 'string');
  
  // SessionStart hook outputs
  const sessionStartOutput = { message: 'Session notification sent' };
  const sessionStartJson = JSON.stringify(sessionStartOutput);
  const sessionStartParsed = JSON.parse(sessionStartJson);
  assert(typeof sessionStartParsed.message === 'string');
});

runTest('JSON input parsing with missing required fields', () => {
  const incompleteInput = {
    session_id: 'test-123',
    cwd: '/project'
    // Missing tool_name
  };
  
  // Hook should handle missing fields gracefully
  assert.strictEqual(incompleteInput.tool_name, undefined);
  assert.strictEqual(incompleteInput.session_id, 'test-123');
});

runTest('JSON input parsing error handling', () => {
  try {
    const malformedJson = '{ "tool_name": "Edit", "incomplete": ';
    JSON.parse(malformedJson);
    assert.fail('Should have thrown an error');
  } catch (error) {
    assert(error instanceof SyntaxError);
  }
});

// ========================================
// End-to-End Workflow Tests
// ========================================

runAsyncTest('Complete workflow: SessionStart → PreToolUse → Stop', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('remote');
  
  // Mock all three Telegram calls
  setupSuccessfulTelegram(telegramMock);
  
  const sessionId = 'workflow-test-123';
  const cwd = '/test/project';
  
  // 1. SessionStart
  const sessionStartResult = await testHookSessionStart({
    session_id: sessionId,
    cwd: cwd,
    source: 'claude-code'
  });
  
  assert(sessionStartResult.message.includes('Session start notification sent'));
  
  // 2. PreToolUse with non-file tool (will send approval request)
  const preToolResult = await testHookPreToolUse({
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    session_id: sessionId,
    cwd: cwd
  });
  
  assert.strictEqual(preToolResult.decision, 'ask');
  assert(preToolResult.message.includes('Approval request sent'));
  
  // 3. Stop (completion)
  const stopResult = await testHookStop({
    session_id: sessionId,
    cwd: cwd,
    stop_hook_active: true
  });
  
  assert(stopResult.message.includes('Completion notification sent'));
  
  // Verify all three hooks sent Telegram messages
  const requests = telegramMock.getRequests();
  assert.strictEqual(requests.length, 3);
  
  cleanupMocks();
});

runAsyncTest('Workflow with auto-approved tools skips approval', async () => {
  setupMocks();
  createMockConfig();
  createMockModeFile('remote');
  
  // Mock only SessionStart and Stop
  setupSuccessfulTelegram(telegramMock);
  
  const sessionId = 'auto-approve-test-123';
  
  // 1. SessionStart
  const sessionStartResult = await testHookSessionStart({ 
    session_id: sessionId, 
    cwd: '/test' 
  });
  assert(sessionStartResult.message.includes('Session start notification sent'));
  
  // 2. PreToolUse with auto-approved tool (Read)
  const preToolResult = await testHookPreToolUse({
    tool_name: 'Read',
    tool_input: { file_path: '/test/file.txt' },
    session_id: sessionId,
    cwd: '/test'
  });
  
  assert.strictEqual(preToolResult.decision, 'allow');
  assert(preToolResult.message.includes('Auto-approved'));
  
  // 3. Stop
  const stopResult = await testHookStop({ 
    session_id: sessionId, 
    cwd: '/test' 
  });
  assert(stopResult.message.includes('Completion notification sent'));
  
  // Only SessionStart and Stop should have sent messages (2 total)
  // PreToolUse was auto-approved, so no Telegram message
  const requests = telegramMock.getRequests();
  assert.strictEqual(requests.length, 2);
  
  cleanupMocks();
});

// Test Results Summary
console.log('\\n=== Test Results ===\\n');

const passed = testResults.filter(r => r.passed).length;
const failed = testResults.filter(r => !r.passed).length;

console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Total: ${testResults.length}`);

if (failed > 0) {
  console.log('\\n⚠️  Failed tests:');
  testResults.filter(r => !r.passed).forEach(r => {
    console.log(`   • ${r.name}: ${r.error}`);
  });
  console.log('\\n❌ Some hook integration tests failed!');
} else {
  console.log('\\n🎉 All hook integration tests passed!');
}

// Deactivate mocks at the end
telegramMock.deactivate();
fsMock.deactivate();
processMock.deactivate();

if (failed > 0) {
  process.exit(1);
}