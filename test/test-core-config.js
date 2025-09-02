#!/usr/bin/env node
// Unit tests for lib/core/config.js
// Tests configuration management functionality

const fs = require('fs');
const path = require('path');
const { 
  assertEqual, 
  assertContains, 
  assertInstanceOf,
  test, 
  TempDirectory,
  createTestConfig,
  TestStats 
} = require('./utils/test-helpers');

const { ConfigManager, cfg, loadJson, saveJson, writeDefaultConfig } = require('../lib/core/config');

const stats = new TestStats();
const tempDir = new TempDirectory('config-test');

// Test ConfigManager class
async function testConfigManagerClass() {
  await test('ConfigManager - constructor sets paths correctly', () => {
    const manager = new ConfigManager('/test/config.json', '/test');
    assertEqual(manager.getConfigPath(), '/test/config.json');
    assertEqual(manager.getConfigDir(), '/test');
  });

  await test('ConfigManager - loadJson returns default for missing file', () => {
    const tempPath = tempDir.create();
    const missingFile = path.join(tempPath, 'missing.json');
    const manager = new ConfigManager();
    
    const result = manager.loadJson(missingFile, { default: true });
    assertEqual(result.default, true);
  });

  await test('ConfigManager - loadJson reads existing file', () => {
    const tempPath = tempDir.create();
    const testFile = path.join(tempPath, 'test.json');
    const testData = { foo: 'bar', number: 42 };
    
    const manager = new ConfigManager();
    manager.saveJson(testFile, testData);
    
    const result = manager.loadJson(testFile, {});
    assertEqual(result, testData);
  });

  await test('ConfigManager - saveJson creates file atomically', () => {
    const tempPath = tempDir.create();
    const testFile = path.join(tempPath, 'atomic.json');
    const testData = { atomic: true, timestamp: Date.now() };
    
    const manager = new ConfigManager();
    manager.saveJson(testFile, testData);
    
    assertEqual(fs.existsSync(testFile), true);
    assertEqual(fs.existsSync(testFile + '.tmp'), false); // Temp file should be cleaned up
    
    const savedData = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    assertEqual(savedData, testData);
  });

  await test('ConfigManager - cfg returns config with defaults', () => {
    const tempPath = tempDir.create();
    const configFile = path.join(tempPath, 'config.json');
    const manager = new ConfigManager(configFile, tempPath);
    
    const config = manager.cfg();
    
    assertEqual(config.timeout_seconds, 3600);
    assertEqual(config.timeout_action, 'deny');
    assertEqual(config.intercept_matcher, 'Bash|Edit|Write|MultiEdit|WebFetch|mcp__.*');
    assertEqual(Array.isArray(config.auto_approve_tools), true);
    assertContains(config.auto_approve_tools, 'Read');
  });

  await test('ConfigManager - cfg applies environment variables', () => {
    const tempPath = tempDir.create();
    const configFile = path.join(tempPath, 'config.json');
    const manager = new ConfigManager(configFile, tempPath);
    
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    const originalChatId = process.env.TELEGRAM_CHAT_ID;
    
    process.env.TELEGRAM_BOT_TOKEN = 'env-token-123';
    process.env.TELEGRAM_CHAT_ID = 'env-chat-456';
    
    manager.clearCache(); // Clear any cached config
    const config = manager.cfg();
    
    assertEqual(config.telegram_bot_token, 'env-token-123');
    assertEqual(config.telegram_chat_id, 'env-chat-456');
    
    // Restore original environment
    if (originalToken !== undefined) {
      process.env.TELEGRAM_BOT_TOKEN = originalToken;
    } else {
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
    if (originalChatId !== undefined) {
      process.env.TELEGRAM_CHAT_ID = originalChatId;
    } else {
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });

  await test('ConfigManager - cfg caches configuration', () => {
    const tempPath = tempDir.create();
    const configFile = path.join(tempPath, 'config.json');
    const manager = new ConfigManager(configFile, tempPath);
    
    const config1 = manager.cfg();
    const config2 = manager.cfg();
    
    assertEqual(config1 === config2, true); // Should be same object reference (cached)
  });

  await test('ConfigManager - clearCache clears cached config', () => {
    const tempPath = tempDir.create();
    const configFile = path.join(tempPath, 'config.json');
    const manager = new ConfigManager(configFile, tempPath);
    
    const config1 = manager.cfg();
    manager.clearCache();
    const config2 = manager.cfg();
    
    assertEqual(config1 === config2, false); // Should be different objects after cache clear
    assertEqual(JSON.stringify(config1), JSON.stringify(config2)); // But with same data
  });

  await test('ConfigManager - writeDefaultConfig creates file if missing', () => {
    const tempPath = tempDir.create();
    const configFile = path.join(tempPath, 'new-config.json');
    const manager = new ConfigManager(configFile, tempPath);
    
    assertEqual(fs.existsSync(configFile), false);
    
    manager.writeDefaultConfig();
    
    assertEqual(fs.existsSync(configFile), true);
    
    const savedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assertEqual(savedConfig.timeout_seconds, 3600);
    assertEqual(savedConfig.timeout_action, 'deny');
  });

  await test('ConfigManager - writeDefaultConfig skips if file exists', () => {
    const tempPath = tempDir.create();
    const configFile = path.join(tempPath, 'existing-config.json');
    const existingData = { custom: 'value', timestamp: Date.now() };
    
    const manager = new ConfigManager(configFile, tempPath);
    manager.saveJson(configFile, existingData);
    
    const originalMtime = fs.statSync(configFile).mtime;
    
    // Wait a bit to ensure mtime would change if file were rewritten
    // Using synchronous approach for simplicity in this test
    const waitStart = Date.now();
    while (Date.now() - waitStart < 10) {
      // Small delay
    }
    
    manager.writeDefaultConfig();
    
    const newMtime = fs.statSync(configFile).mtime;
    assertEqual(originalMtime.getTime(), newMtime.getTime());
    
    const savedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assertEqual(savedConfig.custom, 'value'); // Original data preserved
  });
}

// Test backward compatibility functions
async function testBackwardCompatibilityFunctions() {
  await test('loadJson backward compatibility function works', () => {
    const tempPath = tempDir.create();
    const testFile = path.join(tempPath, 'compat-test.json');
    const testData = { compatibility: true };
    
    fs.writeFileSync(testFile, JSON.stringify(testData));
    
    const result = loadJson(testFile, {});
    assertEqual(result, testData);
  });

  await test('loadJson handles missing file with default', () => {
    const tempPath = tempDir.create();
    const missingFile = path.join(tempPath, 'missing-compat.json');
    
    const result = loadJson(missingFile, { default: 'fallback' });
    assertEqual(result.default, 'fallback');
  });

  await test('saveJson backward compatibility function works', () => {
    const tempPath = tempDir.create();
    const testFile = path.join(tempPath, 'compat-save.json');
    const testData = { saved: true, timestamp: Date.now() };
    
    saveJson(testFile, testData);
    
    assertEqual(fs.existsSync(testFile), true);
    const savedData = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    assertEqual(savedData, testData);
  });

  await test('cfg backward compatibility function works', () => {
    const config = cfg();
    
    assertEqual(typeof config, 'object');
    assertEqual(config.timeout_seconds, 3600);
    assertEqual(config.timeout_action, 'deny');
    assertEqual(Array.isArray(config.auto_approve_tools), true);
  });

  await test('writeDefaultConfig backward compatibility function works', () => {
    // This test is tricky because the function writes to a fixed location
    // We'll just ensure it doesn't throw errors
    try {
      writeDefaultConfig();
      assertEqual(true, true); // If we get here, it didn't throw
    } catch (error) {
      // If it throws due to permissions, that's also acceptable in test environment
      assertContains(error.message, 'EACCES', 'Should fail with permission error or succeed');
    }
  });
}

// Test error handling
async function testErrorHandling() {
  await test('loadJson handles corrupted JSON gracefully', () => {
    const tempPath = tempDir.create();
    const badJsonFile = path.join(tempPath, 'bad.json');
    
    fs.writeFileSync(badJsonFile, '{ invalid json content');
    
    const result = loadJson(badJsonFile, { fallback: true });
    assertEqual(result.fallback, true);
  });

  await test('saveJson creates directory if needed', () => {
    const tempPath = tempDir.create();
    const nestedFile = path.join(tempPath, 'deep', 'nested', 'dir', 'file.json');
    const testData = { nested: true };
    
    saveJson(nestedFile, testData);
    
    assertEqual(fs.existsSync(nestedFile), true);
    const savedData = JSON.parse(fs.readFileSync(nestedFile, 'utf8'));
    assertEqual(savedData, testData);
  });

  await test('ConfigManager handles permission errors gracefully', () => {
    // Create a manager with a path that should cause issues
    const invalidPath = '/root/invalid-permission-path/config.json';
    const manager = new ConfigManager(invalidPath, '/root/invalid-permission-path');
    
    // These should not throw, but return defaults
    const result = manager.loadJson(invalidPath, { permission: 'denied' });
    assertEqual(result.permission, 'denied');
    
    try {
      // This might throw due to permissions, which is expected
      manager.saveJson(invalidPath, { test: 'data' });
      // If no error, that's also acceptable (might have permissions)
      assertEqual(true, true);
    } catch (error) {
      // If it throws, should be a permission-related error
      const message = error.message.toLowerCase();
      const hasPermissionError = message.includes('eacces') || 
                                message.includes('permission') || 
                                message.includes('enoent');
      assertEqual(hasPermissionError, true, `Should fail with permission/access error, got: ${error.message}`);
    }
  });
}

// Test integration scenarios
async function testIntegrationScenarios() {
  await test('Configuration lifecycle - create, modify, reload', () => {
    const tempPath = tempDir.create();
    const configFile = path.join(tempPath, 'lifecycle.json');
    const manager = new ConfigManager(configFile, tempPath);
    
    // 1. Create default config
    manager.writeDefaultConfig();
    assertEqual(fs.existsSync(configFile), true);
    
    // 2. Load and verify default values
    let config = manager.cfg();
    assertEqual(config.timeout_seconds, 3600);
    
    // 3. Manually modify the file
    const customConfig = {
      ...config,
      timeout_seconds: 7200,
      custom_field: 'test-value'
    };
    manager.saveJson(configFile, customConfig);
    
    // 4. Clear cache and reload
    manager.clearCache();
    config = manager.cfg();
    
    // 5. Verify custom values are loaded
    assertEqual(config.timeout_seconds, 7200);
    assertEqual(config.custom_field, 'test-value');
    
    // 6. Verify defaults are still applied for missing fields
    assertEqual(config.timeout_action, 'deny');
  });

  await test('Multiple ConfigManager instances work independently', () => {
    const tempPath = tempDir.create();
    const config1File = path.join(tempPath, 'config1.json');
    const config2File = path.join(tempPath, 'config2.json');
    
    const manager1 = new ConfigManager(config1File, tempPath);
    const manager2 = new ConfigManager(config2File, tempPath);
    
    // Configure differently
    manager1.saveJson(config1File, { timeout_seconds: 1800 });
    manager2.saveJson(config2File, { timeout_seconds: 7200 });
    
    const config1 = manager1.cfg();
    const config2 = manager2.cfg();
    
    assertEqual(config1.timeout_seconds, 1800);
    assertEqual(config2.timeout_seconds, 7200);
    
    // Verify they don't interfere with each other
    assertEqual(config1 === config2, false);
  });
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Testing lib/core/config.js\n');
  
  try {
    await testConfigManagerClass();
    await testBackwardCompatibilityFunctions();
    await testErrorHandling();
    await testIntegrationScenarios();
  } catch (error) {
    console.error('❌ Unexpected test error:', error.message);
    stats.addFail('UNEXPECTED_ERROR', error);
  } finally {
    tempDir.cleanup();
  }
  
  return stats.printSummary();
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = {
  runAllTests,
  testConfigManagerClass,
  testBackwardCompatibilityFunctions,
  testErrorHandling,
  testIntegrationScenarios
};