#!/usr/bin/env node
/**
 * Service Initialization Tests
 * 
 * Tests to catch service instantiation and initialization issues.
 * These tests would have caught:
 * - Utils class instantiation bugs (new Utils() vs Utils static)
 * - Missing service dependencies
 * - Incorrect service constructor arguments
 * - Service method availability after initialization
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
const TEST_DIR = path.join(os.tmpdir(), 'afk-init-test-' + Date.now());
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
  fs.writeFileSync(path.join(CONFIG_DIR, 'session-map.json'), JSON.stringify({ messages: {}, latest_per_chat: {} }));
  fs.writeFileSync(path.join(CONFIG_DIR, 'history.jsonl'), '');
  
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

// Test: Verify Utils is used as static class, not instantiated
async function testUtilsStaticUsage() {
  const { Utils } = require('../lib/core/utils.js');
  
  // Verify Utils is not meant to be instantiated
  if (typeof Utils === 'function') {
    // Check if it's meant to be used as constructor by looking for prototype methods
    const prototypeKeys = Object.getOwnPropertyNames(Utils.prototype || {});
    const staticKeys = Object.getOwnPropertyNames(Utils);
    
    // If it has static methods but minimal prototype, it's meant to be used statically
    if (staticKeys.length > prototypeKeys.length) {
      console.log(`   ${YELLOW}Info: Utils has ${staticKeys.length} static methods, ${prototypeKeys.length} prototype methods${RESET}`);
      
      // Verify key static methods exist
      if (typeof Utils.cryptoRandomId !== 'function') {
        throw new Error('Utils.cryptoRandomId static method not found');
      }
      
      if (typeof Utils.ensureDir !== 'function') {
        throw new Error('Utils.ensureDir static method not found');
      }
      
      if (typeof Utils.escapeMarkdown !== 'function') {
        throw new Error('Utils.escapeMarkdown static method not found');
      }
      
      // Test the original bug: creating instance vs using static
      try {
        const utilsInstance = new Utils();
        if (typeof utilsInstance.cryptoRandomId !== 'function') {
          console.log(`   ${GREEN}Info: new Utils() instance lacks static methods (this confirms static usage is correct)${RESET}`);
        }
      } catch (e) {
        console.log(`   ${GREEN}Info: new Utils() throws error (confirms static usage)${RESET}`);
      }
    }
  } else {
    throw new Error('Utils export is not a function/class');
  }
}

// Test: Check service constructors match actual usage patterns
async function testServiceConstructorSignatures() {
  const { ConfigManager } = require('../lib/core/config.js');
  const { Logger } = require('../lib/core/logger.js');
  const { Utils } = require('../lib/core/utils.js');
  const { SessionsService } = require('../lib/services/sessions.js');
  const { TelegramService } = require('../lib/services/telegram.js');
  const { PermissionsService } = require('../lib/services/permissions.js');
  const { ClaudeHooksService } = require('../lib/integration/claude-hooks.js');
  
  // Test ConfigManager (no args)
  let configManager;
  try {
    configManager = new ConfigManager();
    if (!configManager.configDir) {
      throw new Error('ConfigManager not properly initialized');
    }
  } catch (e) {
    throw new Error(`ConfigManager constructor failed: ${e.message}`);
  }
  
  // Test Logger (requires configDir)
  let logger;
  try {
    logger = new Logger(configManager.configDir);
    if (typeof logger.eprint !== 'function') {
      throw new Error('Logger missing eprint method');
    }
  } catch (e) {
    throw new Error(`Logger constructor failed: ${e.message}`);
  }
  
  // Test Utils (static class)
  const utils = Utils; // This is the correct pattern
  
  // Test SessionsService (configManager, logger, utils)
  let sessionsService;
  try {
    sessionsService = new SessionsService(configManager, logger, utils);
    if (typeof sessionsService.appendHistory !== 'function') {
      throw new Error('SessionsService missing appendHistory method');
    }
    if (typeof sessionsService.trackActiveSession !== 'function') {
      throw new Error('SessionsService missing trackActiveSession method');
    }
  } catch (e) {
    throw new Error(`SessionsService constructor failed: ${e.message}`);
  }
  
  // Test TelegramService (configManager, logger)
  let telegramService;
  try {
    telegramService = new TelegramService(configManager, logger);
    if (typeof telegramService.sendMessage !== 'function') {
      throw new Error('TelegramService missing sendMessage method');
    }
  } catch (e) {
    throw new Error(`TelegramService constructor failed: ${e.message}`);
  }
  
  // Test PermissionsService (configManager, logger)
  let permissionsService;
  try {
    permissionsService = new PermissionsService(configManager, logger);
    if (typeof permissionsService.checkClaudePermissions !== 'function') {
      throw new Error('PermissionsService missing checkClaudePermissions method');
    }
  } catch (e) {
    throw new Error(`PermissionsService constructor failed: ${e.message}`);
  }
  
  // Test ClaudeHooksService (configManager, telegramService, permissionsService, sessionsService, queueService, logger, utils)
  let claudeHooksService;
  try {
    const mockQueueService = { distributedTelegramPoll: () => Promise.resolve(null) };
    
    claudeHooksService = new ClaudeHooksService(
      configManager,
      telegramService,
      permissionsService,
      sessionsService,
      mockQueueService,
      logger,
      utils
    );
    
    if (typeof claudeHooksService.handlePreToolUse !== 'function') {
      throw new Error('ClaudeHooksService missing handlePreToolUse method');
    }
    if (typeof claudeHooksService.handleStop !== 'function') {
      throw new Error('ClaudeHooksService missing handleStop method');
    }
    if (typeof claudeHooksService.handleSessionStart !== 'function') {
      throw new Error('ClaudeHooksService missing handleSessionStart method');
    }
  } catch (e) {
    throw new Error(`ClaudeHooksService constructor failed: ${e.message}`);
  }
}

// Test: Verify service dependencies are correctly injected
async function testServiceDependencyInjection() {
  const { ConfigManager } = require('../lib/core/config.js');
  const { Logger } = require('../lib/core/logger.js');
  const { Utils } = require('../lib/core/utils.js');
  const { SessionsService } = require('../lib/services/sessions.js');
  const { TelegramService } = require('../lib/services/telegram.js');
  const { PermissionsService } = require('../lib/services/permissions.js');
  const { ClaudeHooksService } = require('../lib/integration/claude-hooks.js');
  
  const configManager = new ConfigManager();
  const logger = new Logger(configManager.configDir);
  const utils = Utils;
  const sessionsService = new SessionsService(configManager, logger, utils);
  const telegramService = new TelegramService(configManager, logger);
  const permissionsService = new PermissionsService(configManager, logger);
  const mockQueueService = { distributedTelegramPoll: () => Promise.resolve(null) };
  
  const claudeHooksService = new ClaudeHooksService(
    configManager,
    telegramService,
    permissionsService,
    sessionsService,
    mockQueueService,
    logger,
    utils
  );
  
  // Verify dependencies are properly injected and accessible
  if (claudeHooksService.configManager !== configManager) {
    throw new Error('ClaudeHooksService.configManager not properly injected');
  }
  
  if (claudeHooksService.sessionsService !== sessionsService) {
    throw new Error('ClaudeHooksService.sessionsService not properly injected');
  }
  
  if (claudeHooksService.utils !== utils) {
    throw new Error('ClaudeHooksService.utils not properly injected');
  }
  
  if (claudeHooksService.logger !== logger) {
    throw new Error('ClaudeHooksService.logger not properly injected');
  }
  
  // Test that injected dependencies can be used
  try {
    const randomId = claudeHooksService.utils.cryptoRandomId();
    if (!randomId || typeof randomId !== 'string') {
      throw new Error('Utils.cryptoRandomId not accessible through ClaudeHooksService');
    }
  } catch (e) {
    throw new Error(`ClaudeHooksService cannot access utils.cryptoRandomId: ${e.message}`);
  }
  
  try {
    claudeHooksService.sessionsService.appendHistory({ type: 'test', session_id: 'test123' });
  } catch (e) {
    throw new Error(`ClaudeHooksService cannot access sessionsService.appendHistory: ${e.message}`);
  }
}

// Test: Check that services can be instantiated in the same order as bin/afk
async function testBinAfkServiceOrder() {
  // This replicates the service initialization order from bin/afk
  try {
    // Step 1: Config and basic services
    const { ConfigManager } = require('../lib/core/config.js');
    const configManager = new ConfigManager();
    
    const { Logger } = require('../lib/core/logger.js');
    const logger = new Logger(configManager.configDir);
    
    const { Utils } = require('../lib/core/utils.js');
    const utils = Utils; // This was the bug - not new Utils()
    
    // Step 2: Core services
    const { SessionsService } = require('../lib/services/sessions.js');
    const sessionsService = new SessionsService(configManager, logger, utils);
    
    const { TelegramService } = require('../lib/services/telegram.js');
    const telegramService = new TelegramService(configManager, logger);
    
    const { PermissionsService } = require('../lib/services/permissions.js');
    const permissionsService = new PermissionsService(configManager, logger);
    
    // Step 3: Queue service (mocked)
    const queueService = { distributedTelegramPoll: () => Promise.resolve(null) };
    
    // Step 4: Integration services
    const { ClaudeHooksService } = require('../lib/integration/claude-hooks.js');
    const claudeHooksService = new ClaudeHooksService(
      configManager,
      telegramService,
      permissionsService,
      sessionsService,
      queueService,
      logger,
      utils
    );
    
    // Verify all services are properly initialized
    if (!configManager.configDir) throw new Error('ConfigManager not initialized');
    if (!logger.eprint) throw new Error('Logger not initialized');
    if (!utils.cryptoRandomId) throw new Error('Utils not accessible');
    if (!sessionsService.appendHistory) throw new Error('SessionsService not initialized');
    if (!telegramService.sendMessage) throw new Error('TelegramService not initialized');
    if (!permissionsService.checkClaudePermissions) throw new Error('PermissionsService not initialized');
    if (!claudeHooksService.handlePreToolUse) throw new Error('ClaudeHooksService not initialized');
    
  } catch (e) {
    throw new Error(`Service initialization order failed: ${e.message}`);
  }
}

// Test: Verify service method calls work with proper dependency access
async function testServiceMethodsWithDependencies() {
  const { ConfigManager } = require('../lib/core/config.js');
  const { Logger } = require('../lib/core/logger.js');
  const { Utils } = require('../lib/core/utils.js');
  const { SessionsService } = require('../lib/services/sessions.js');
  const { ClaudeHooksService } = require('../lib/integration/claude-hooks.js');
  
  const configManager = new ConfigManager();
  const logger = new Logger(configManager.configDir);
  const utils = Utils;
  const sessionsService = new SessionsService(configManager, logger, utils);
  
  // Mock other services
  const mockTelegramService = { sendMessage: () => Promise.resolve() };
  const mockPermissionsService = { checkClaudePermissions: () => true };
  const mockQueueService = { distributedTelegramPoll: () => Promise.resolve(null) };
  
  const claudeHooksService = new ClaudeHooksService(
    configManager,
    mockTelegramService,
    mockPermissionsService,
    sessionsService,
    mockQueueService,
    logger,
    utils
  );
  
  // Test that methods can access their dependencies
  try {
    // Test utils access
    const randomId1 = utils.cryptoRandomId();
    const randomId2 = claudeHooksService.utils.cryptoRandomId();
    
    if (!randomId1 || !randomId2) {
      throw new Error('Utils.cryptoRandomId not working correctly');
    }
    
    // Test sessionsService access
    sessionsService.appendHistory({ type: 'test1', session_id: 'test123' });
    claudeHooksService.sessionsService.appendHistory({ type: 'test2', session_id: 'test456' });
    
    // Verify history was written
    const historyPath = path.join(CONFIG_DIR, 'history.jsonl');
    if (!fs.existsSync(historyPath)) {
      throw new Error('SessionsService.appendHistory not writing to file');
    }
    
    const historyContent = fs.readFileSync(historyPath, 'utf8');
    if (!historyContent.includes('test1') || !historyContent.includes('test2')) {
      throw new Error('SessionsService.appendHistory not writing correct data');
    }
    
  } catch (e) {
    throw new Error(`Service method dependency access failed: ${e.message}`);
  }
}

// Test: Check for common initialization anti-patterns
async function testInitializationAntiPatterns() {
  // Load bin/afk source to check for anti-patterns
  const afkPath = path.join(__dirname, '..', 'bin', 'afk');
  const afkSource = fs.readFileSync(afkPath, 'utf8');
  
  // Check for the specific bug we fixed
  if (afkSource.includes('new Utils()')) {
    throw new Error('Found "new Utils()" in bin/afk - this should be just "Utils"');
  }
  
  // Check for other potential anti-patterns
  const antiPatterns = [
    { pattern: 'readConfig(', message: 'readConfig() should be cfg()' },
    { pattern: 'new Utils()', message: 'Utils should be static, not instantiated' },
    { pattern: /const\s+utils\s*=\s*new\s+Utils\s*\(/, message: 'Utils instantiation anti-pattern' }
  ];
  
  for (const { pattern, message } of antiPatterns) {
    if (typeof pattern === 'string' ? afkSource.includes(pattern) : pattern.test(afkSource)) {
      throw new Error(`Anti-pattern found: ${message}`);
    }
  }
  
  // Check that correct patterns are present
  const correctPatterns = [
    { pattern: 'const utils = Utils', message: 'Correct Utils static usage' },
    { pattern: 'const cfg =', message: 'Config function correctly named' }
  ];
  
  for (const { pattern, message } of correctPatterns) {
    if (!afkSource.includes(pattern)) {
      console.log(`   ${YELLOW}Warning: ${message} pattern not found${RESET}`);
    }
  }
}

// Test: Verify all required service exports are available
async function testServiceExports() {
  // Check that all service modules export their classes correctly
  const serviceModules = [
    { path: '../lib/core/config.js', exports: ['ConfigManager'] },
    { path: '../lib/core/logger.js', exports: ['Logger'] },
    { path: '../lib/core/utils.js', exports: ['Utils'] },
    { path: '../lib/services/sessions.js', exports: ['SessionsService'] },
    { path: '../lib/services/telegram.js', exports: ['TelegramService'] },
    { path: '../lib/services/permissions.js', exports: ['PermissionsService'] },
    { path: '../lib/integration/claude-hooks.js', exports: ['ClaudeHooksService'] }
  ];
  
  for (const { path, exports: expectedExports } of serviceModules) {
    try {
      const module = require(path);
      
      for (const exportName of expectedExports) {
        if (typeof module[exportName] !== 'function') {
          throw new Error(`${path} missing export: ${exportName}`);
        }
        
        // Test that export can be instantiated (except Utils)
        if (exportName !== 'Utils') {
          const mockArgs = exportName === 'ConfigManager' ? [] : 
                          exportName === 'Logger' ? [CONFIG_DIR] :
                          exportName === 'SessionsService' ? [{}, {}, {}] :
                          exportName === 'ClaudeHooksService' ? [{}, {}, {}, {}, {}, {}, {}] :
                          [{}, {}]; // Most services take configManager, logger
          
          try {
            new module[exportName](...mockArgs);
          } catch (e) {
            if (!e.message.includes('Cannot read property') && !e.message.includes('checkClaudePermissions')) {
              // Allow dependency-related errors, we're just testing the export exists
              console.log(`   ${YELLOW}Info: ${exportName} constructor needs proper dependencies${RESET}`);
            }
          }
        }
      }
    } catch (e) {
      throw new Error(`Failed to load ${path}: ${e.message}`);
    }
  }
}

// Main test runner
async function runAllTests() {
  console.log('🏗️  Running Service Initialization Tests...\n');
  
  setup();
  
  try {
    await runTest('Utils is used as static class, not instantiated', testUtilsStaticUsage);
    await runTest('Service constructors match usage patterns', testServiceConstructorSignatures);
    await runTest('Service dependencies are correctly injected', testServiceDependencyInjection);
    await runTest('Services can be instantiated in bin/afk order', testBinAfkServiceOrder);
    await runTest('Service methods work with proper dependencies', testServiceMethodsWithDependencies);
    await runTest('No initialization anti-patterns present', testInitializationAntiPatterns);
    await runTest('All required service exports are available', testServiceExports);
    
    console.log(`\n📊 Results: ${GREEN}${testsPassed} passed${RESET}, ${testsFailed > 0 ? RED : GREEN}${testsFailed} failed${RESET}`);
    
    if (testsFailed > 0) {
      console.log(`${RED}❌ Some service initialization tests failed${RESET}`);
      process.exit(1);
    } else {
      console.log(`${GREEN}✅ All service initialization tests passed!${RESET}`);
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