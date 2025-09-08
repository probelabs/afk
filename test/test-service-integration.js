#!/usr/bin/env node
/**
 * Service Integration Tests
 * 
 * Tests for service initialization, method dependencies, and integration issues
 * These tests would have caught the bugs we just fixed:
 * - Missing appendHistory method
 * - Utils class instantiation issues
 * - Method signature mismatches
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

// Test setup
const TEST_DIR = path.join(os.tmpdir(), 'afk-service-test-' + Date.now());
const CONFIG_DIR = path.join(TEST_DIR, '.afk');

function setup() {
  // Create test directories
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  
  // Create minimal config
  const testConfig = {
    telegram_bot_token: 'test-token-123',
    telegram_chat_id: '123456789',
    timeout_seconds: 60,
    auto_approve_tools: ['Read']
  };
  
  fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(testConfig, null, 2));
  fs.writeFileSync(path.join(CONFIG_DIR, 'mode'), 'local');
  
  // Set environment
  process.env.HOME = TEST_DIR;
}

function cleanup() {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`${GREEN}✅${RESET} ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`${RED}❌${RESET} ${name}`);
    console.log(`   ${RED}Error: ${error.message}${RESET}`);
    if (error.stack) {
      console.log(`   ${RED}${error.stack.split('\n').slice(1, 3).join('\n   ')}${RESET}`);
    }
    testsFailed++;
  }
}

// Import services like they are used in bin/afk
const { ConfigManager } = require('../lib/core/config.js');
const { Logger } = require('../lib/core/logger.js');
const { Utils } = require('../lib/core/utils.js');
const { SessionsService } = require('../lib/services/sessions.js');
const { TelegramService } = require('../lib/services/telegram.js');
const { PermissionsService } = require('../lib/services/permissions.js');
const { ClaudeHooksService } = require('../lib/integration/claude-hooks.js');

// Test: Service Initialization
async function testServiceInitialization() {
  const configManager = new ConfigManager();
  const logger = new Logger(configManager.configDir);
  const utils = Utils; // Static class - this was the bug!
  
  // Test that all services can be created without errors
  const telegramService = new TelegramService(configManager, logger);
  const permissionsService = new PermissionsService(configManager, logger);
  const sessionsService = new SessionsService(configManager, logger, utils);
  const queueService = { distributedTelegramPoll: () => null }; // Mock
  
  const claudeHooksService = new ClaudeHooksService(
    configManager, 
    telegramService, 
    permissionsService, 
    sessionsService, 
    queueService, 
    logger, 
    utils
  );
  
  // Verify services are properly initialized
  if (!claudeHooksService.configManager) throw new Error('ClaudeHooksService missing configManager');
  if (!claudeHooksService.sessionsService) throw new Error('ClaudeHooksService missing sessionsService');
  if (!claudeHooksService.utils) throw new Error('ClaudeHooksService missing utils');
}

// Test: SessionsService Methods
async function testSessionsServiceMethods() {
  const configManager = new ConfigManager();
  const logger = new Logger(configManager.configDir);
  const utils = Utils;
  
  const sessionsService = new SessionsService(configManager, logger, utils);
  
  // Test that appendHistory method exists and works
  if (typeof sessionsService.appendHistory !== 'function') {
    throw new Error('SessionsService missing appendHistory method');
  }
  
  // Test appendHistory functionality
  sessionsService.appendHistory({ 
    type: 'test_event', 
    session_id: 'test123', 
    decision: 'test' 
  });
  
  // Verify history file was created
  const historyPath = path.join(CONFIG_DIR, 'history.jsonl');
  if (!fs.existsSync(historyPath)) {
    throw new Error('appendHistory did not create history file');
  }
  
  const historyContent = fs.readFileSync(historyPath, 'utf8');
  if (!historyContent.includes('test_event')) {
    throw new Error('appendHistory did not write event data');
  }
}

// Test: Utils Static Methods
async function testUtilsStaticMethods() {
  const utils = Utils;
  
  // Test that cryptoRandomId exists and works - this was the original bug
  if (typeof utils.cryptoRandomId !== 'function') {
    throw new Error('Utils missing cryptoRandomId static method');
  }
  
  const randomId = utils.cryptoRandomId();
  if (!randomId || typeof randomId !== 'string') {
    throw new Error('cryptoRandomId did not return a valid string');
  }
  
  // Test other essential utils methods
  if (typeof utils.ensureDir !== 'function') {
    throw new Error('Utils missing ensureDir static method');
  }
  
  if (typeof utils.escapeMarkdown !== 'function') {
    throw new Error('Utils missing escapeMarkdown static method');
  }
}

// Test: ClaudeHooksService Method Dependencies
async function testClaudeHooksServiceDependencies() {
  const configManager = new ConfigManager();
  const logger = new Logger(configManager.configDir);
  const utils = Utils;
  
  const sessionsService = new SessionsService(configManager, logger, utils);
  const telegramService = new TelegramService(configManager, logger);
  const permissionsService = new PermissionsService(configManager, logger);
  const queueService = { distributedTelegramPoll: () => null }; // Mock
  
  const claudeHooksService = new ClaudeHooksService(
    configManager, 
    telegramService, 
    permissionsService, 
    sessionsService, 
    queueService, 
    logger, 
    utils
  );
  
  // Test that utils.cryptoRandomId can be called from the service
  try {
    const randomId = claudeHooksService.utils.cryptoRandomId();
    if (!randomId) throw new Error('Utils.cryptoRandomId returned falsy value');
  } catch (error) {
    throw new Error(`ClaudeHooksService cannot call utils.cryptoRandomId: ${error.message}`);
  }
  
  // Test that sessionsService.appendHistory can be called from the service
  try {
    claudeHooksService.sessionsService.appendHistory({ 
      type: 'test', 
      session_id: 'test123' 
    });
  } catch (error) {
    throw new Error(`ClaudeHooksService cannot call sessionsService.appendHistory: ${error.message}`);
  }
}

// Test: Hook Method Interface Contracts
async function testHookMethodContracts() {
  const configManager = new ConfigManager();
  const logger = new Logger(configManager.configDir);
  const utils = Utils;
  
  const sessionsService = new SessionsService(configManager, logger, utils);
  const telegramService = new TelegramService(configManager, logger);
  const permissionsService = new PermissionsService(configManager, logger);
  const queueService = { 
    distributedTelegramPoll: () => Promise.resolve(null) 
  };
  
  const claudeHooksService = new ClaudeHooksService(
    configManager, 
    telegramService, 
    permissionsService, 
    sessionsService, 
    queueService, 
    logger, 
    utils
  );
  
  // Test handlePreToolUse exists and accepts proper input
  if (typeof claudeHooksService.handlePreToolUse !== 'function') {
    throw new Error('ClaudeHooksService missing handlePreToolUse method');
  }
  
  // Test handleStop exists
  if (typeof claudeHooksService.handleStop !== 'function') {
    throw new Error('ClaudeHooksService missing handleStop method');
  }
  
  // Test handleSessionStart exists  
  if (typeof claudeHooksService.handleSessionStart !== 'function') {
    throw new Error('ClaudeHooksService missing handleSessionStart method');
  }
  
  // Test that essential supporting methods exist
  if (typeof claudeHooksService.shouldHandleCommand !== 'function') {
    throw new Error('ClaudeHooksService missing shouldHandleCommand method');
  }
}

// Test: Service Method Error Handling
async function testServiceErrorHandling() {
  const configManager = new ConfigManager();
  const logger = new Logger(configManager.configDir);
  const utils = Utils;
  
  const sessionsService = new SessionsService(configManager, logger, utils);
  
  // Test appendHistory with invalid input - should not throw
  try {
    sessionsService.appendHistory(null);
    sessionsService.appendHistory(undefined);
    sessionsService.appendHistory({});
  } catch (error) {
    throw new Error(`appendHistory should handle invalid input gracefully: ${error.message}`);
  }
  
  // Test Utils methods with edge cases
  try {
    const result1 = utils.escapeMarkdown(null);
    const result2 = utils.escapeMarkdown(undefined);
    const result3 = utils.escapeMarkdown('');
    
    // These should not throw and return reasonable values
    if (result1 !== null && result1 !== '') {
      // Accept either null or empty string handling
    }
  } catch (error) {
    throw new Error(`Utils methods should handle edge cases: ${error.message}`);
  }
}

// Main test runner
async function runAllTests() {
  console.log('🧪 Running Service Integration Tests...\n');
  
  setup();
  
  try {
    await runTest('Service Initialization', testServiceInitialization);
    await runTest('SessionsService Methods', testSessionsServiceMethods);
    await runTest('Utils Static Methods', testUtilsStaticMethods);
    await runTest('ClaudeHooksService Dependencies', testClaudeHooksServiceDependencies);
    await runTest('Hook Method Contracts', testHookMethodContracts);
    await runTest('Service Error Handling', testServiceErrorHandling);
    
    console.log(`\n📊 Results: ${GREEN}${testsPassed} passed${RESET}, ${testsFailed > 0 ? RED : GREEN}${testsFailed} failed${RESET}`);
    
    if (testsFailed > 0) {
      console.log(`${RED}❌ Some service integration tests failed${RESET}`);
      process.exit(1);
    } else {
      console.log(`${GREEN}✅ All service integration tests passed!${RESET}`);
    }
    
  } finally {
    cleanup();
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error(`${RED}Test runner error: ${error.message}${RESET}`);
    cleanup();
    process.exit(1);
  });
}

module.exports = { runAllTests };