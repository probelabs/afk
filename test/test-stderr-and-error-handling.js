#!/usr/bin/env node
/**
 * Stderr Pollution and Error Handling Tests
 * 
 * Tests to catch stderr pollution issues and verify proper error handling.
 * These tests would have caught:
 * - execSync commands polluting stderr in Claude Code view
 * - Missing stdio configuration for child processes
 * - Improper error message routing (eprint vs debugLog)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

// Test setup
const TEST_DIR = path.join(os.tmpdir(), 'afk-stderr-test-' + Date.now());
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
  process.env.AFK_NONINTERACTIVE = '1';
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

// Helper to spawn afk and capture stderr separately
function spawnAfkWithStderr(args, stdin = null) {
  return new Promise((resolve, reject) => {
    const afkPath = path.join(__dirname, '..', 'bin', 'afk');
    const proc = spawn('node', [afkPath, ...args], {
      env: { ...process.env, HOME: TEST_DIR, AFK_NONINTERACTIVE: '1' },
      timeout: 5000
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }
    
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
    
    // Kill after timeout
    setTimeout(() => {
      try {
        proc.kill();
      } catch (e) {
        // Already exited
      }
    }, 4000);
  });
}

// Test: Check that execSync calls don't pollute stderr
async function testExecSyncStderrSuppression() {
  // Load the claude-hooks.js file and check for proper stdio configuration
  const hooksPath = path.join(__dirname, '..', 'lib', 'integration', 'claude-hooks.js');
  const hooksSource = fs.readFileSync(hooksPath, 'utf8');
  
  // Check for stdio configuration in the file (this covers multi-line execSync calls)
  const hasStdioConfig = hooksSource.includes("stdio: ['inherit', 'pipe', 'pipe']");
  if (!hasStdioConfig) {
    throw new Error('No execSync calls with stderr suppression found in claude-hooks.js');
  }
  
  // Find specific problematic patterns that definitely need stdio config
  const problematicPatterns = [
    /execSync\(\s*['"`]git diff(?!.*stdio:).*$/gm,  // git diff without stdio on same line
    /execSync\(\s*['"`]node(?!.*stdio:).*$/gm       // node commands without stdio on same line
  ];
  
  // Check each pattern, but allow for multi-line execSync calls
  for (const pattern of problematicPatterns) {
    const matches = hooksSource.match(pattern) || [];
    const realProblems = matches.filter(match => {
      // For each match, check if there's a stdio config within reasonable distance
      const matchIndex = hooksSource.indexOf(match);
      const contextAfter = hooksSource.slice(matchIndex, matchIndex + 500); // Check next 500 chars
      return !contextAfter.includes("stdio: ['inherit', 'pipe', 'pipe']") && 
             !contextAfter.includes('2>/dev/null');
    });
    
    if (realProblems.length > 0) {
      throw new Error(`execSync calls without proper stderr handling: ${realProblems.join('; ')}`);
    }
  }
  
  // Positive check: ensure we do have some properly configured execSync calls
  const properlyConfiguredCount = (hooksSource.match(/stdio:\s*\[\s*'inherit'\s*,\s*'pipe'\s*,\s*'pipe'\s*\]/g) || []).length;
  if (properlyConfiguredCount < 2) {
    console.log(`   ${YELLOW}Info: Found ${properlyConfiguredCount} properly configured execSync calls${RESET}`);
  }
}

// Test: Check that error messages use appropriate logging levels
async function testErrorMessageLogging() {
  const hooksPath = path.join(__dirname, '..', 'lib', 'integration', 'claude-hooks.js');
  const hooksSource = fs.readFileSync(hooksPath, 'utf8');
  
  // Look for debug-level errors that should use debugLog instead of eprint
  const eprintCalls = hooksSource.match(/this\.logger\.eprint\([^)]+\)/g) || [];
  const debugLogCalls = hooksSource.match(/this\.logger\.debugLog\([^)]+\)/g) || [];
  
  // Check that we have both types (some errors should be user-visible, others debug-only)
  if (eprintCalls.length === 0) {
    throw new Error('No eprint calls found - some user-facing errors should use eprint');
  }
  
  if (debugLogCalls.length === 0) {
    throw new Error('No debugLog calls found - debug info should use debugLog instead of eprint');
  }
  
  // Look for patterns that suggest stderr pollution issues
  const potentialStderrPollution = eprintCalls.filter(call => {
    return call.includes('Failed to') && !call.includes('[afk]') && !call.includes('📖') && !call.includes('🔒');
  });
  
  if (potentialStderrPollution.length > 5) {
    console.log(`   ${YELLOW}Warning: Found ${potentialStderrPollution.length} potential stderr pollution sources${RESET}`);
  }
}

// Test: Verify hooks handle errors gracefully without crashing
async function testHookErrorHandling() {
  // Test PreToolUse hook with partially invalid but valid JSON input
  const partiallyInvalidInput = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
    session_id: 'test-session-error',
    cwd: TEST_DIR,
    transcript_path: '/tmp/test.json'
    // Missing some optional fields to test graceful handling
  });
  
  const result = await spawnAfkWithStderr(['hook', 'pretooluse'], partiallyInvalidInput);
  
  // Hook should handle malformed input gracefully, not crash
  if (result.stderr.includes('TypeError') || result.stderr.includes('ReferenceError')) {
    throw new Error(`Hook crashed with error instead of handling gracefully: ${result.stderr}`);
  }
  
  // Local mode should pass through, but not with critical errors
  if (result.stderr.includes('is not defined') || result.stderr.includes('Cannot read property')) {
    throw new Error(`Hook has undefined function errors: ${result.stderr}`);
  }
}

// Test: Check git command stderr suppression specifically
async function testGitCommandStderrSuppression() {
  // Create a git repo in test dir for testing
  const { execSync } = require('child_process');
  
  try {
    execSync('git init', { cwd: TEST_DIR, stdio: ['inherit', 'pipe', 'pipe'] });
    execSync('git config user.email "test@example.com"', { cwd: TEST_DIR, stdio: ['inherit', 'pipe', 'pipe'] });
    execSync('git config user.name "Test User"', { cwd: TEST_DIR, stdio: ['inherit', 'pipe', 'pipe'] });
    
    // Create and commit a test file
    fs.writeFileSync(path.join(TEST_DIR, 'test.txt'), 'original content\n');
    execSync('git add test.txt', { cwd: TEST_DIR, stdio: ['inherit', 'pipe', 'pipe'] });
    execSync('git commit -m "Initial commit"', { cwd: TEST_DIR, stdio: ['inherit', 'pipe', 'pipe'] });
    
    // Modify the file to create a diff
    fs.writeFileSync(path.join(TEST_DIR, 'test.txt'), 'modified content\n');
    
    // Test Stop hook which generates diffs
    const stopInput = JSON.stringify({
      session_id: 'test-session-stderr',
      cwd: TEST_DIR,
      transcript_path: '/tmp/test.json',
      stop_hook_active: false
    });
    
    const result = await spawnAfkWithStderr(['hook', 'stop'], stopInput);
    
    // In local mode, should not have git diff errors in stderr
    const gitErrors = result.stderr.split('\n').filter(line => 
      line.includes('git') && (line.includes('error') || line.includes('fatal'))
    );
    
    if (gitErrors.length > 0) {
      throw new Error(`Git commands are polluting stderr: ${gitErrors.join('; ')}`);
    }
    
  } catch (e) {
    // If git is not available, skip this test
    if (e.message.includes('git: command not found')) {
      console.log(`   ${YELLOW}Skipping git test - git not available${RESET}`);
      return;
    }
    throw e;
  }
}

// Test: Verify logger methods exist and work correctly
async function testLoggerMethodsExist() {
  const { Logger } = require('../lib/core/logger.js');
  
  const logger = new Logger(CONFIG_DIR);
  
  // Check that essential logger methods exist
  if (typeof logger.eprint !== 'function') {
    throw new Error('Logger missing eprint method');
  }
  
  if (typeof logger.debugLog !== 'function') {
    throw new Error('Logger missing debugLog method');
  }
  
  // Test that methods can be called without crashing
  try {
    logger.debugLog('TEST', 'Debug message', { test: true });
    logger.eprint('Test eprint message');
  } catch (e) {
    throw new Error(`Logger methods threw error: ${e.message}`);
  }
}

// Test: Check diff generation doesn't crash on edge cases
async function testDiffGenerationErrorHandling() {
  // Test with non-git directory
  const nonGitDir = path.join(TEST_DIR, 'not-git');
  fs.mkdirSync(nonGitDir, { recursive: true });
  
  const stopInput = JSON.stringify({
    session_id: 'test-diff-error',
    cwd: nonGitDir,
    transcript_path: '/tmp/test.json',
    stop_hook_active: false
  });
  
  const result = await spawnAfkWithStderr(['hook', 'stop'], stopInput);
  
  // Should handle non-git directories gracefully
  if (result.stderr.includes('fatal: not a git repository') && !result.stderr.includes('[afk]')) {
    throw new Error('Git error not properly handled in non-git directory');
  }
}

// Test: Verify service error handling doesn't crash
async function testServiceErrorResilience() {
  const { ConfigManager } = require('../lib/core/config.js');
  const { Logger } = require('../lib/core/logger.js');
  const { Utils } = require('../lib/core/utils.js');
  const { SessionsService } = require('../lib/services/sessions.js');
  
  const configManager = new ConfigManager();
  const logger = new Logger(CONFIG_DIR);
  const utils = Utils;
  
  const sessionsService = new SessionsService(configManager, logger, utils);
  
  // Test error handling with invalid inputs
  try {
    sessionsService.appendHistory(null);
    sessionsService.appendHistory(undefined);
    sessionsService.appendHistory({ invalid: 'data' });
    
    // These should not throw errors
  } catch (e) {
    throw new Error(`SessionsService.appendHistory should handle invalid input: ${e.message}`);
  }
  
  // Test with read-only file system simulation
  const originalWriteFileSync = fs.writeFileSync;
  const originalAppendFileSync = fs.appendFileSync;
  
  // Mock file system errors
  fs.writeFileSync = () => { throw new Error('EACCES: permission denied'); };
  fs.appendFileSync = () => { throw new Error('EACCES: permission denied'); };
  
  try {
    // Should handle file system errors gracefully
    sessionsService.appendHistory({ type: 'test' });
    
    // Restore original functions
    fs.writeFileSync = originalWriteFileSync;
    fs.appendFileSync = originalAppendFileSync;
    
  } catch (e) {
    // Restore functions even on error
    fs.writeFileSync = originalWriteFileSync;
    fs.appendFileSync = originalAppendFileSync;
    
    throw new Error(`Service should handle file system errors gracefully: ${e.message}`);
  }
}

// Main test runner
async function runAllTests() {
  console.log('🔍 Running Stderr Pollution and Error Handling Tests...\n');
  
  setup();
  
  try {
    await runTest('execSync calls have proper stderr suppression', testExecSyncStderrSuppression);
    await runTest('Error messages use appropriate logging levels', testErrorMessageLogging);
    await runTest('Hooks handle errors gracefully without crashing', testHookErrorHandling);
    await runTest('Git commands suppress stderr pollution', testGitCommandStderrSuppression);
    await runTest('Logger methods exist and work correctly', testLoggerMethodsExist);
    await runTest('Diff generation handles errors gracefully', testDiffGenerationErrorHandling);
    await runTest('Services are resilient to file system errors', testServiceErrorResilience);
    
    console.log(`\n📊 Results: ${GREEN}${testsPassed} passed${RESET}, ${testsFailed > 0 ? RED : GREEN}${testsFailed} failed${RESET}`);
    
    if (testsFailed > 0) {
      console.log(`${RED}❌ Some stderr pollution tests failed${RESET}`);
      process.exit(1);
    } else {
      console.log(`${GREEN}✅ All stderr pollution and error handling tests passed!${RESET}`);
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