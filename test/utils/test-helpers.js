#!/usr/bin/env node
// Test utilities and helpers for AFK tests
// Common functions for test setup, assertions, and cleanup

const fs = require('fs');
const path = require('path');
const os = require('os');

// Assertion helpers
function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const error = message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    throw new Error(error);
  }
}

function assertContains(haystack, needle, message) {
  if (!haystack || !haystack.includes(needle)) {
    const error = message || `Expected "${haystack}" to contain "${needle}"`;
    throw new Error(error);
  }
}

function assertNotContains(haystack, needle, message) {
  if (haystack && haystack.includes(needle)) {
    const error = message || `Expected "${haystack}" to not contain "${needle}"`;
    throw new Error(error);
  }
}

function assertGreaterThan(actual, expected, message) {
  if (actual <= expected) {
    const error = message || `Expected ${actual} to be greater than ${expected}`;
    throw new Error(error);
  }
}

function assertLessThan(actual, expected, message) {
  if (actual >= expected) {
    const error = message || `Expected ${actual} to be less than ${expected}`;
    throw new Error(error);
  }
}

function assertMatch(actual, pattern, message) {
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  if (!regex.test(actual)) {
    const error = message || `Expected "${actual}" to match pattern ${pattern}`;
    throw new Error(error);
  }
}

function assertInstanceOf(actual, expectedClass, message) {
  if (!(actual instanceof expectedClass)) {
    const error = message || `Expected instance of ${expectedClass.name}, got ${actual.constructor.name}`;
    throw new Error(error);
  }
}

// Test runner helper
function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      // Handle async test
      return result.then(() => {
        console.log(`✅ ${name}`);
        return true;
      }).catch(error => {
        console.error(`❌ ${name}`);
        console.error(`   ${error.message}`);
        return false;
      });
    } else {
      // Sync test
      console.log(`✅ ${name}`);
      return true;
    }
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   ${error.message}`);
    return false;
  }
}

// Temporary directory management
class TempDirectory {
  constructor(prefix = 'afk-test') {
    this.prefix = prefix;
    this.dirs = [];
  }

  create(suffix = '') {
    const tempDir = path.join(os.tmpdir(), `${this.prefix}-${Date.now()}${suffix}`);
    fs.mkdirSync(tempDir, { recursive: true });
    this.dirs.push(tempDir);
    return tempDir;
  }

  cleanup() {
    for (const dir of this.dirs) {
      try {
        if (fs.existsSync(dir)) {
          this._removeDirectory(dir);
        }
      } catch (error) {
        console.warn(`Warning: Failed to cleanup temp directory ${dir}: ${error.message}`);
      }
    }
    this.dirs = [];
  }

  _removeDirectory(dirPath) {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        this._removeDirectory(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    }
    fs.rmdirSync(dirPath);
  }
}

// Configuration generators
function createTestConfig(overrides = {}) {
  return {
    telegram_bot_token: 'test-bot-token-123',
    telegram_chat_id: '123456789',
    timeout_seconds: 3600,
    timeout_action: 'deny',
    intercept_matcher: 'Bash|Edit|Write|MultiEdit|WebFetch|mcp__.*',
    auto_approve_tools: ['Read', 'Grep', 'Glob', 'TodoWrite'],
    respect_claude_permissions: true,
    ...overrides
  };
}

function createHookInput(hookType, overrides = {}) {
  const baseInput = {
    session_id: 'test-session-' + Math.random().toString(36).substr(2, 8),
    cwd: '/test/project',
    transcript_path: '/tmp/transcript.jsonl',
    ...overrides
  };

  switch (hookType) {
    case 'pretooluse':
      return {
        tool_name: 'Edit',
        tool_input: {
          file_path: 'test.js',
          old_string: 'console.log("old");',
          new_string: 'console.log("new");'
        },
        ...baseInput,
        ...overrides
      };

    case 'stop':
      return {
        stop_hook_active: true,
        ...baseInput,
        ...overrides
      };

    case 'sessionstart':
      return {
        ...baseInput,
        ...overrides
      };

    default:
      return baseInput;
  }
}

// Image validation helpers
function validatePngImage(imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const buffer = fs.readFileSync(imagePath);
  
  // Check PNG signature
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('Invalid PNG signature');
  }

  return {
    valid: true,
    size: buffer.length,
    sizeKB: Math.round(buffer.length / 1024 * 10) / 10
  };
}

function validateImageDimensions(imagePath, expectedWidth, expectedHeight, tolerance = 50) {
  // Basic dimension validation by checking IHDR chunk
  const buffer = fs.readFileSync(imagePath);
  
  // Find IHDR chunk (should be right after PNG signature)
  const ihdrStart = 8; // After PNG signature
  if (buffer.toString('ascii', ihdrStart + 4, ihdrStart + 8) !== 'IHDR') {
    throw new Error('Invalid PNG: IHDR chunk not found');
  }

  // Extract width and height from IHDR
  const width = buffer.readUInt32BE(ihdrStart + 8);
  const height = buffer.readUInt32BE(ihdrStart + 12);

  if (expectedWidth !== null && Math.abs(width - expectedWidth) > tolerance) {
    throw new Error(`Width ${width} not within tolerance of expected ${expectedWidth}`);
  }

  if (expectedHeight !== null && Math.abs(height - expectedHeight) > tolerance) {
    throw new Error(`Height ${height} not within tolerance of expected ${expectedHeight}`);
  }

  return { width, height };
}

// Mock time helpers
let mockTime = Date.now();

function setMockTime(timestamp) {
  mockTime = timestamp;
}

function advanceTime(milliseconds) {
  mockTime += milliseconds;
}

function resetMockTime() {
  mockTime = Date.now();
}

function getMockTime() {
  return mockTime;
}

// JSON validation helpers
function validateJson(jsonString) {
  try {
    return { valid: true, data: JSON.parse(jsonString) };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function validateHookOutput(output, expectedDecision = null) {
  const validation = validateJson(output);
  if (!validation.valid) {
    throw new Error(`Invalid JSON output: ${validation.error}`);
  }

  const data = validation.data;

  if (!data.hookSpecificOutput) {
    throw new Error('Missing hookSpecificOutput in hook response');
  }

  const hso = data.hookSpecificOutput;

  if (!['allow', 'ask', 'deny'].includes(hso.decision)) {
    throw new Error(`Invalid decision: ${hso.decision}`);
  }

  if (typeof hso.message !== 'string') {
    throw new Error('Missing or invalid message in hook response');
  }

  if (expectedDecision && hso.decision !== expectedDecision) {
    throw new Error(`Expected decision "${expectedDecision}", got "${hso.decision}"`);
  }

  return data;
}

// Request/response validation
function validateTelegramRequest(requestData) {
  if (!requestData) {
    throw new Error('No request data provided');
  }

  const bodyStr = Buffer.isBuffer(requestData.body) ? requestData.body.toString() : (requestData.body || '');
  
  // Validate multipart form data structure
  if (!bodyStr.includes('Content-Disposition: form-data')) {
    throw new Error('Invalid multipart form data structure');
  }

  // Extract fields
  const fields = {};
  
  const chatIdMatch = bodyStr.match(/name="chat_id"\r?\n\r?\n([^\r\n]+)/);
  if (chatIdMatch) fields.chat_id = chatIdMatch[1];
  
  const captionMatch = bodyStr.match(/name="caption"\r?\n\r?\n([^\r\n]+)/);
  if (captionMatch) fields.caption = captionMatch[1];
  
  const filenameMatch = bodyStr.match(/filename="([^"]+)"/);
  if (filenameMatch) fields.filename = filenameMatch[1];

  return fields;
}

// Error simulation helpers
function simulateNetworkError() {
  const error = new Error('Network error: ENOTFOUND');
  error.code = 'ENOTFOUND';
  error.errno = -3008;
  error.syscall = 'getaddrinfo';
  return error;
}

function simulateTimeout() {
  const error = new Error('Request timeout');
  error.code = 'ETIMEDOUT';
  error.timeout = true;
  return error;
}

function simulatePermissionError(path) {
  const error = new Error(`EACCES: permission denied, open '${path}'`);
  error.code = 'EACCES';
  error.errno = -13;
  error.syscall = 'open';
  error.path = path;
  return error;
}

// Test statistics tracking
class TestStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.errors = [];
  }

  addPass(testName) {
    this.passed++;
  }

  addFail(testName, error) {
    this.failed++;
    this.errors.push({ test: testName, error: error.message });
  }

  addSkip(testName, reason) {
    this.skipped++;
  }

  getTotal() {
    return this.passed + this.failed + this.skipped;
  }

  getSummary() {
    return {
      total: this.getTotal(),
      passed: this.passed,
      failed: this.failed,
      skipped: this.skipped,
      success: this.failed === 0,
      errors: [...this.errors]
    };
  }

  printSummary() {
    const summary = this.getSummary();
    console.log('\n=== Test Results ===\n');
    console.log(`✅ Passed: ${summary.passed}`);
    if (summary.failed > 0) {
      console.log(`❌ Failed: ${summary.failed}`);
    }
    if (summary.skipped > 0) {
      console.log(`⏸️  Skipped: ${summary.skipped}`);
    }
    console.log(`Total: ${summary.total}\n`);

    if (summary.errors.length > 0) {
      console.log('Failures:');
      for (const error of summary.errors) {
        console.log(`   ${error.test}: ${error.error}`);
      }
      console.log();
    }

    if (summary.success) {
      console.log('🎉 All tests passed!\n');
    } else {
      console.log('⚠️  Some tests failed\n');
    }

    return summary.success;
  }
}

module.exports = {
  // Assertions
  assertEqual,
  assertContains,
  assertNotContains,
  assertGreaterThan,
  assertLessThan,
  assertMatch,
  assertInstanceOf,

  // Test runner
  test,

  // Directory management
  TempDirectory,

  // Configuration
  createTestConfig,
  createHookInput,

  // Image validation
  validatePngImage,
  validateImageDimensions,

  // Time mocking
  setMockTime,
  advanceTime,
  resetMockTime,
  getMockTime,

  // JSON validation
  validateJson,
  validateHookOutput,

  // Request validation
  validateTelegramRequest,

  // Error simulation
  simulateNetworkError,
  simulateTimeout,
  simulatePermissionError,

  // Statistics
  TestStats
};