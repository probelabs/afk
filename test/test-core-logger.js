#!/usr/bin/env node
// Unit tests for lib/core/logger.js
// Tests logging and debug functionality

const fs = require('fs');
const path = require('path');
const { 
  assertEqual, 
  assertContains, 
  assertInstanceOf,
  test, 
  TempDirectory,
  TestStats 
} = require('./utils/test-helpers');

const { Logger, isDebugEnabled, debugLog, eprint } = require('../lib/core/logger');

const stats = new TestStats();
const tempDir = new TempDirectory('logger-test');

// Mock console.error for testing eprint
let mockConsoleError = [];
const originalConsoleError = console.error;

function mockConsoleFunctions() {
  mockConsoleError = [];
  console.error = (...args) => {
    mockConsoleError.push(args.join(' '));
  };
}

function restoreConsoleFunctions() {
  console.error = originalConsoleError;
}

// Test Logger class
async function testLoggerClass() {
  await test('Logger - constructor sets paths correctly', () => {
    const configDir = '/test/config';
    const debugLogFile = '/test/debug.log';
    const stateFile = '/test/mode';
    
    const logger = new Logger(configDir, debugLogFile, stateFile);
    assertEqual(logger.configDir, configDir);
    assertEqual(logger.debugLogFile, debugLogFile);
    assertEqual(logger.stateFile, stateFile);
  });

  await test('Logger - isDebugEnabled checks .debug file', () => {
    const tempPath = tempDir.create();
    const debugFile = path.join(tempPath, '.debug');
    
    const logger = new Logger(tempPath);
    
    // No debug file - should be false
    assertEqual(logger.isDebugEnabled(), false);
    
    // Create debug file - should be true
    fs.writeFileSync(debugFile, '');
    logger.clearDebugCache(); // Clear cache to force re-check
    assertEqual(logger.isDebugEnabled(), true);
  });

  await test('Logger - isDebugEnabled checks environment variables', () => {
    const tempPath = tempDir.create();
    const logger = new Logger(tempPath);
    
    const originalAFK = process.env.AFK_DEBUG;
    const originalCC = process.env.CC_REMOTE_DEBUG;
    
    // Clean environment
    delete process.env.AFK_DEBUG;
    delete process.env.CC_REMOTE_DEBUG;
    logger.clearDebugCache();
    assertEqual(logger.isDebugEnabled(), false);
    
    // Test AFK_DEBUG
    process.env.AFK_DEBUG = '1';
    logger.clearDebugCache();
    assertEqual(logger.isDebugEnabled(), true);
    
    // Test CC_REMOTE_DEBUG (deprecated)
    delete process.env.AFK_DEBUG;
    process.env.CC_REMOTE_DEBUG = '1';
    logger.clearDebugCache();
    assertEqual(logger.isDebugEnabled(), true);
    
    // Restore environment
    if (originalAFK !== undefined) {
      process.env.AFK_DEBUG = originalAFK;
    } else {
      delete process.env.AFK_DEBUG;
    }
    if (originalCC !== undefined) {
      process.env.CC_REMOTE_DEBUG = originalCC;
    } else {
      delete process.env.CC_REMOTE_DEBUG;
    }
  });

  await test('Logger - isDebugEnabled checks command line arguments', () => {
    const tempPath = tempDir.create();
    const logger = new Logger(tempPath);
    
    const originalArgv = process.argv;
    
    // No --debug flag
    process.argv = ['node', 'test.js'];
    logger.clearDebugCache();
    assertEqual(logger.isDebugEnabled(), false);
    
    // With --debug flag
    process.argv = ['node', 'test.js', '--debug'];
    logger.clearDebugCache();
    assertEqual(logger.isDebugEnabled(), true);
    
    // Restore original argv
    process.argv = originalArgv;
  });

  await test('Logger - isDebugEnabled caches result', () => {
    const tempPath = tempDir.create();
    const logger = new Logger(tempPath);
    
    const result1 = logger.isDebugEnabled();
    const result2 = logger.isDebugEnabled();
    
    assertEqual(result1, result2);
    // Note: We can't easily test that it's truly cached without mocking internals
    // but the behavior should be consistent
  });

  await test('Logger - clearDebugCache clears cache', () => {
    const tempPath = tempDir.create();
    const debugFile = path.join(tempPath, '.debug');
    const logger = new Logger(tempPath);
    
    // First check without debug file
    assertEqual(logger.isDebugEnabled(), false);
    
    // Create debug file and clear cache
    fs.writeFileSync(debugFile, '');
    logger.clearDebugCache();
    
    // Now should detect the debug file
    assertEqual(logger.isDebugEnabled(), true);
  });

  await test('Logger - eprint outputs to console.error', () => {
    mockConsoleFunctions();
    
    const logger = new Logger();
    logger.eprint('Test message', { data: 'value' });
    
    assertEqual(mockConsoleError.length, 1);
    assertContains(mockConsoleError[0], 'Test message');
    assertContains(mockConsoleError[0], '{"data":"value"}');
    
    restoreConsoleFunctions();
  });

  await test('Logger - debugLog does nothing when debug disabled', () => {
    const tempPath = tempDir.create();
    const debugLogFile = path.join(tempPath, 'debug.log');
    const logger = new Logger(tempPath, debugLogFile);
    
    mockConsoleFunctions();
    
    // Ensure debug is disabled
    logger.clearDebugCache();
    assertEqual(logger.isDebugEnabled(), false);
    
    logger.debugLog('TEST_CATEGORY', 'Test message', { data: 'value' });
    
    // Should not have written to console or file
    assertEqual(mockConsoleError.length, 0);
    assertEqual(fs.existsSync(debugLogFile), false);
    
    restoreConsoleFunctions();
  });

  await test('Logger - debugLog writes when debug enabled', () => {
    const tempPath = tempDir.create();
    const debugLogFile = path.join(tempPath, 'debug.log');
    const debugFile = path.join(tempPath, '.debug');
    const logger = new Logger(tempPath, debugLogFile);
    
    mockConsoleFunctions();
    
    // Enable debug mode
    fs.writeFileSync(debugFile, '');
    logger.clearDebugCache();
    assertEqual(logger.isDebugEnabled(), true);
    
    // Mock session ID
    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'test-session-123';
    
    logger.debugLog('TEST_CATEGORY', 'Test debug message', { foo: 'bar' });
    
    // Should have written to console
    assertEqual(mockConsoleError.length >= 1, true);
    assertContains(mockConsoleError.join(' '), 'TEST_CATEGORY');
    assertContains(mockConsoleError.join(' '), 'Test debug message');
    
    // Should have written to file
    assertEqual(fs.existsSync(debugLogFile), true);
    const logContent = fs.readFileSync(debugLogFile, 'utf8');
    const logLines = logContent.trim().split('\n');
    assertEqual(logLines.length >= 1, true);
    
    const logEntry = JSON.parse(logLines[0]);
    assertEqual(logEntry.category, 'TEST_CATEGORY');
    assertEqual(logEntry.message, 'Test debug message');
    assertEqual(logEntry.data.foo, 'bar');
    assertEqual(logEntry.session, 'test-session-123');
    assertEqual(typeof logEntry.timestamp, 'string');
    assertEqual(typeof logEntry.pid, 'number');
    assertEqual(typeof logEntry.mode, 'string');
    
    // Restore environment
    if (originalSessionId !== undefined) {
      process.env.CLAUDE_SESSION_ID = originalSessionId;
    } else {
      delete process.env.CLAUDE_SESSION_ID;
    }
    
    restoreConsoleFunctions();
  });

  await test('Logger - debugLog handles file write errors gracefully', () => {
    const tempPath = tempDir.create();
    const invalidLogFile = '/root/invalid-path/debug.log'; // Should cause permission error
    const debugFile = path.join(tempPath, '.debug');
    const logger = new Logger(tempPath, invalidLogFile);
    
    // Enable debug mode
    fs.writeFileSync(debugFile, '');
    logger.clearDebugCache();
    
    mockConsoleFunctions();
    
    // This should not throw even if file write fails
    logger.debugLog('TEST_CATEGORY', 'Test message');
    
    // Console output should still work
    assertEqual(mockConsoleError.length >= 1, true);
    
    restoreConsoleFunctions();
  });

  await test('Logger - debugLog without data parameter', () => {
    const tempPath = tempDir.create();
    const debugLogFile = path.join(tempPath, 'debug.log');
    const debugFile = path.join(tempPath, '.debug');
    const logger = new Logger(tempPath, debugLogFile);
    
    mockConsoleFunctions();
    
    // Enable debug mode
    fs.writeFileSync(debugFile, '');
    logger.clearDebugCache();
    
    logger.debugLog('TEST_CATEGORY', 'Test message without data');
    
    // Should work without data parameter
    assertEqual(mockConsoleError.length >= 1, true);
    assertContains(mockConsoleError.join(' '), 'Test message without data');
    
    // Check log file
    const logContent = fs.readFileSync(debugLogFile, 'utf8');
    const logEntry = JSON.parse(logContent.trim().split('\n')[0]);
    assertEqual(logEntry.data, null);
    
    restoreConsoleFunctions();
  });

  await test('Logger - setDebugLogFile changes log file path', () => {
    const tempPath = tempDir.create();
    const logger = new Logger(tempPath);
    const newLogFile = path.join(tempPath, 'custom-debug.log');
    
    logger.setDebugLogFile(newLogFile);
    assertEqual(logger.debugLogFile, newLogFile);
  });
}

// Test backward compatibility functions
async function testBackwardCompatibilityFunctions() {
  await test('isDebugEnabled backward compatibility function works', () => {
    // Just test that the function exists and returns a boolean
    // The detailed functionality is tested in the Logger class tests
    const result = isDebugEnabled();
    assertEqual(typeof result, 'boolean');
  });

  await test('eprint backward compatibility function works', () => {
    mockConsoleFunctions();
    
    eprint('Test eprint message', { test: true });
    
    assertEqual(mockConsoleError.length, 1);
    assertContains(mockConsoleError[0], 'Test eprint message');
    
    restoreConsoleFunctions();
  });

  await test('debugLog backward compatibility function works', () => {
    mockConsoleFunctions();
    
    const originalArgv = process.argv;
    process.argv = ['node', 'test.js', '--debug']; // Enable debug
    
    debugLog('COMPAT_TEST', 'Compatibility test message', { compat: true });
    
    // Should have produced some output
    assertEqual(mockConsoleError.length >= 1, true);
    
    process.argv = originalArgv;
    restoreConsoleFunctions();
  });
}

// Test mode detection
async function testModeDetection() {
  await test('Logger - _readMode reads from state file', () => {
    const tempPath = tempDir.create();
    const stateFile = path.join(tempPath, 'mode');
    const logger = new Logger(tempPath, path.join(tempPath, 'debug.log'), stateFile);
    
    // No state file - should return default
    assertEqual(logger._readMode(), 'local');
    
    // Write remote mode
    fs.writeFileSync(stateFile, 'remote');
    assertEqual(logger._readMode(), 'remote');
    
    // Write local mode
    fs.writeFileSync(stateFile, 'local');
    assertEqual(logger._readMode(), 'local');
    
    // Write invalid mode - should return default
    fs.writeFileSync(stateFile, 'invalid');
    assertEqual(logger._readMode(), 'local');
  });

  await test('Logger - _readMode handles whitespace in state file', () => {
    const tempPath = tempDir.create();
    const stateFile = path.join(tempPath, 'mode');
    const logger = new Logger(tempPath, path.join(tempPath, 'debug.log'), stateFile);
    
    // Write mode with whitespace
    fs.writeFileSync(stateFile, '  remote  \n');
    assertEqual(logger._readMode(), 'remote');
    
    fs.writeFileSync(stateFile, '\n\nlocal\t\t');
    assertEqual(logger._readMode(), 'local');
  });
}

// Test integration scenarios
async function testIntegrationScenarios() {
  await test('Logger - full debug session lifecycle', () => {
    const tempPath = tempDir.create();
    const debugLogFile = path.join(tempPath, 'session.log');
    const debugFile = path.join(tempPath, '.debug');
    const stateFile = path.join(tempPath, 'mode');
    const logger = new Logger(tempPath, debugLogFile, stateFile);
    
    mockConsoleFunctions();
    
    // 1. Start with debug disabled
    logger.clearDebugCache();
    assertEqual(logger.isDebugEnabled(), false);
    
    logger.debugLog('SESSION', 'This should not appear');
    assertEqual(mockConsoleError.length, 0);
    
    // 2. Enable debug mode
    fs.writeFileSync(debugFile, '');
    fs.writeFileSync(stateFile, 'remote');
    logger.clearDebugCache();
    
    // 3. Log some debug messages
    logger.debugLog('SESSION', 'Session started', { user: 'test' });
    logger.debugLog('TOOL', 'Tool execution', { tool: 'Edit' });
    logger.debugLog('SESSION', 'Session ended');
    
    // 4. Verify console output
    assertEqual(mockConsoleError.length >= 3, true);
    assertContains(mockConsoleError.join(' '), 'Session started');
    assertContains(mockConsoleError.join(' '), 'Tool execution');
    assertContains(mockConsoleError.join(' '), 'Session ended');
    
    // 5. Verify log file contents
    const logContent = fs.readFileSync(debugLogFile, 'utf8');
    const logLines = logContent.trim().split('\n');
    assertEqual(logLines.length >= 3, true);
    
    const firstEntry = JSON.parse(logLines[0]);
    assertEqual(firstEntry.category, 'SESSION');
    assertEqual(firstEntry.message, 'Session started');
    assertEqual(firstEntry.mode, 'remote');
    assertEqual(firstEntry.data.user, 'test');
    
    restoreConsoleFunctions();
  });

  await test('Logger - multiple logger instances work independently', () => {
    const tempPath = tempDir.create();
    const logger1 = new Logger(tempPath, path.join(tempPath, 'log1.log'), path.join(tempPath, 'state1'));
    const logger2 = new Logger(tempPath, path.join(tempPath, 'log2.log'), path.join(tempPath, 'state2'));
    
    // Enable debug for first logger only
    const debugFile = path.join(tempPath, '.debug');
    fs.writeFileSync(debugFile, '');
    
    logger1.clearDebugCache();
    logger2.clearDebugCache();
    
    assertEqual(logger1.isDebugEnabled(), true);
    assertEqual(logger2.isDebugEnabled(), true); // Both use same config dir
    
    // But they should log to different files
    logger1.debugLog('LOGGER1', 'Message from logger 1');
    logger2.debugLog('LOGGER2', 'Message from logger 2');
    
    const log1Content = fs.readFileSync(logger1.debugLogFile, 'utf8');
    const log2Content = fs.readFileSync(logger2.debugLogFile, 'utf8');
    
    assertContains(log1Content, 'LOGGER1');
    assertContains(log2Content, 'LOGGER2');
    
    // Files should be different
    assertEqual(log1Content === log2Content, false);
  });
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Testing lib/core/logger.js\n');
  
  try {
    await testLoggerClass();
    await testBackwardCompatibilityFunctions();
    await testModeDetection();
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
  testLoggerClass,
  testBackwardCompatibilityFunctions,
  testModeDetection,
  testIntegrationScenarios
};