#!/usr/bin/env node
// Unit tests for lib/core/utils.js
// Tests utility functions and helper methods

const fs = require('fs');
const path = require('path');
const { 
  assertEqual, 
  assertContains, 
  assertMatch,
  assertGreaterThan,
  test, 
  TempDirectory,
  TestStats 
} = require('./utils/test-helpers');

const { 
  Utils, 
  ensureDir, 
  ensureExecutable, 
  toPosix, 
  cryptoRandomId, 
  escapeMarkdown 
} = require('../lib/core/utils');

const stats = new TestStats();
const tempDir = new TempDirectory('utils-test');

// Test Utils class static methods
async function testUtilsClassStaticMethods() {
  await test('Utils.ensureDir creates directory recursively', () => {
    const tempPath = tempDir.create();
    const nestedDir = path.join(tempPath, 'deep', 'nested', 'directory');
    
    assertEqual(fs.existsSync(nestedDir), false);
    
    Utils.ensureDir(nestedDir);
    
    assertEqual(fs.existsSync(nestedDir), true);
    assertEqual(fs.statSync(nestedDir).isDirectory(), true);
  });

  await test('Utils.ensureDir handles existing directory', () => {
    const tempPath = tempDir.create();
    const existingDir = path.join(tempPath, 'existing');
    
    fs.mkdirSync(existingDir);
    assertEqual(fs.existsSync(existingDir), true);
    
    // Should not throw
    Utils.ensureDir(existingDir);
    assertEqual(fs.existsSync(existingDir), true);
  });

  await test('Utils.ensureExecutable adds execute permissions', () => {
    const tempPath = tempDir.create();
    const testFile = path.join(tempPath, 'test-script.sh');
    
    fs.writeFileSync(testFile, '#!/bin/bash\necho "test"');
    
    const originalStats = fs.statSync(testFile);
    const originalMode = originalStats.mode;
    
    Utils.ensureExecutable(testFile);
    
    const newStats = fs.statSync(testFile);
    const newMode = newStats.mode;
    
    // Execute bits should be added
    assertEqual((newMode & 0o111) > 0, true);
    assertEqual((newMode & 0o111) >= (originalMode & 0o111), true);
  });

  await test('Utils.ensureExecutable handles missing files gracefully', () => {
    const tempPath = tempDir.create();
    const missingFile = path.join(tempPath, 'nonexistent.sh');
    
    assertEqual(fs.existsSync(missingFile), false);
    
    // Should not throw
    Utils.ensureExecutable(missingFile);
    
    // File should still not exist
    assertEqual(fs.existsSync(missingFile), false);
  });

  await test('Utils.toPosix converts path separators', () => {
    // Test Windows-style paths
    assertEqual(Utils.toPosix('C:\\Users\\test\\file.txt'), 'C:/Users/test/file.txt');
    assertEqual(Utils.toPosix('relative\\path\\to\\file'), 'relative/path/to/file');
    
    // Test already POSIX paths (should be unchanged)
    assertEqual(Utils.toPosix('/unix/path/file.txt'), '/unix/path/file.txt');
    assertEqual(Utils.toPosix('relative/path/file'), 'relative/path/file');
    
    // Test mixed separators
    assertEqual(Utils.toPosix('mixed\\path/to\\file'), 'mixed/path/to/file');
    
    // Test edge cases
    assertEqual(Utils.toPosix(''), '');
    assertEqual(Utils.toPosix('single'), 'single');
  });

  await test('Utils.cryptoRandomId generates valid UUID-like IDs', () => {
    const id1 = Utils.cryptoRandomId();
    const id2 = Utils.cryptoRandomId();
    
    // Should be different
    assertEqual(id1 === id2, false);
    
    // Should match UUID format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    assertMatch(id1, uuidPattern);
    assertMatch(id2, uuidPattern);
    
    // Length should be correct
    assertEqual(id1.length, 36);
    assertEqual(id2.length, 36);
    
    // Should have correct structure (4 hyphens)
    assertEqual(id1.split('-').length, 5);
    assertEqual(id2.split('-').length, 5);
  });

  await test('Utils.cryptoRandomId generates unique IDs consistently', () => {
    const ids = new Set();
    const count = 100;
    
    for (let i = 0; i < count; i++) {
      const id = Utils.cryptoRandomId();
      assertEqual(ids.has(id), false, `Duplicate ID generated: ${id}`);
      ids.add(id);
    }
    
    assertEqual(ids.size, count);
  });

  await test('Utils.escapeMarkdown escapes special characters', () => {
    // Test individual characters
    assertEqual(Utils.escapeMarkdown('_'), '\\_');
    assertEqual(Utils.escapeMarkdown('*'), '\\*');
    assertEqual(Utils.escapeMarkdown('['), '\\[');
    assertEqual(Utils.escapeMarkdown(']'), '\\]');
    assertEqual(Utils.escapeMarkdown('('), '\\(');
    assertEqual(Utils.escapeMarkdown(')'), '\\)');
    assertEqual(Utils.escapeMarkdown('~'), '\\~');
    assertEqual(Utils.escapeMarkdown('`'), '\\`');
    assertEqual(Utils.escapeMarkdown('>'), '\\>');
    assertEqual(Utils.escapeMarkdown('#'), '\\#');
    assertEqual(Utils.escapeMarkdown('+'), '\\+');
    assertEqual(Utils.escapeMarkdown('-'), '\\-');
    assertEqual(Utils.escapeMarkdown('='), '\\=');
    assertEqual(Utils.escapeMarkdown('|'), '\\|');
    assertEqual(Utils.escapeMarkdown('{'), '\\{');
    assertEqual(Utils.escapeMarkdown('}'), '\\}');
    assertEqual(Utils.escapeMarkdown('.'), '\\.');
    assertEqual(Utils.escapeMarkdown('!'), '\\!');
    
    // Test backslashes (should be escaped first)
    assertEqual(Utils.escapeMarkdown('\\'), '\\\\');
    assertEqual(Utils.escapeMarkdown('\\*'), '\\\\\\*');
  });

  await test('Utils.escapeMarkdown handles complex strings', () => {
    const input = 'This is *bold* and _italic_ with [links](url) and `code` blocks!';
    const expected = 'This is \\*bold\\* and \\_italic\\_ with \\[links\\]\\(url\\) and \\`code\\` blocks\\!';
    assertEqual(Utils.escapeMarkdown(input), expected);
    
    const complexInput = 'File path: C:\\Users\\test\\file.txt (with special chars: []{}~`>#+=-|.!)';
    const result = Utils.escapeMarkdown(complexInput);
    // Just verify that special markdown characters are escaped
    assertContains(result, '\\[');
    assertContains(result, '\\]');
    assertContains(result, '\\(');
    assertContains(result, '\\)');
    assertContains(result, '\\{');
    assertContains(result, '\\}');
    assertContains(result, '\\~');
    assertContains(result, '\\`');
    assertContains(result, '\\#');
    assertContains(result, '\\+');
    assertContains(result, '\\=');
    assertContains(result, '\\-');
    assertContains(result, '\\|');
    assertContains(result, '\\.');
    assertContains(result, '\\!');
  });

  await test('Utils.escapeMarkdown handles non-strings', () => {
    assertEqual(Utils.escapeMarkdown(null), null);
    assertEqual(Utils.escapeMarkdown(undefined), undefined);
    assertEqual(Utils.escapeMarkdown(42), 42);
    assertEqual(Utils.escapeMarkdown(true), true);
    assertEqual(Utils.escapeMarkdown({}), {});
    assertEqual(Utils.escapeMarkdown([]), []);
  });

  await test('Utils.escapeMarkdown handles empty and edge cases', () => {
    assertEqual(Utils.escapeMarkdown(''), '');
    assertEqual(Utils.escapeMarkdown(' '), ' ');
    assertEqual(Utils.escapeMarkdown('\n'), '\n');
    assertEqual(Utils.escapeMarkdown('\t'), '\t');
    assertEqual(Utils.escapeMarkdown('normal text'), 'normal text');
  });

  await test('Utils.fileExists checks file existence', () => {
    const tempPath = tempDir.create();
    const existingFile = path.join(tempPath, 'existing.txt');
    const missingFile = path.join(tempPath, 'missing.txt');
    
    fs.writeFileSync(existingFile, 'content');
    
    assertEqual(Utils.fileExists(existingFile), true);
    assertEqual(Utils.fileExists(missingFile), false);
  });

  await test('Utils.getFileStats returns stats or null', () => {
    const tempPath = tempDir.create();
    const testFile = path.join(tempPath, 'stats-test.txt');
    const content = 'test content';
    
    fs.writeFileSync(testFile, content);
    
    const stats = Utils.getFileStats(testFile);
    assertEqual(stats !== null, true);
    assertEqual(stats.isFile(), true);
    assertEqual(stats.size >= content.length, true);
    
    const missingStats = Utils.getFileStats(path.join(tempPath, 'missing.txt'));
    assertEqual(missingStats, null);
  });

  await test('Utils.readFile reads file with fallback', () => {
    const tempPath = tempDir.create();
    const testFile = path.join(tempPath, 'read-test.txt');
    const content = 'Hello, World!';
    
    fs.writeFileSync(testFile, content);
    
    const result = Utils.readFile(testFile);
    assertEqual(result, content);
    
    const missingResult = Utils.readFile(path.join(tempPath, 'missing.txt'), 'utf8', 'fallback');
    assertEqual(missingResult, 'fallback');
  });

  await test('Utils.writeFile writes with directory creation', () => {
    const tempPath = tempDir.create();
    const nestedFile = path.join(tempPath, 'nested', 'deep', 'file.txt');
    const content = 'Nested file content';
    
    assertEqual(fs.existsSync(path.dirname(nestedFile)), false);
    
    Utils.writeFile(nestedFile, content);
    
    assertEqual(fs.existsSync(nestedFile), true);
    assertEqual(fs.readFileSync(nestedFile, 'utf8'), content);
  });

  await test('Utils.sleep returns promise that resolves', async () => {
    const start = Date.now();
    await Utils.sleep(50);
    const elapsed = Date.now() - start;
    
    // Should have waited at least 45ms (allowing for timing variance)
    assertGreaterThan(elapsed, 45);
  });

  await test('Utils.isEmpty checks empty strings', () => {
    assertEqual(Utils.isEmpty(''), true);
    assertEqual(Utils.isEmpty('   '), true);
    assertEqual(Utils.isEmpty('\t\n  '), true);
    assertEqual(Utils.isEmpty(null), true);
    assertEqual(Utils.isEmpty(undefined), true);
    
    assertEqual(Utils.isEmpty('content'), false);
    assertEqual(Utils.isEmpty(' content '), false);
    assertEqual(Utils.isEmpty('0'), false);
  });

  await test('Utils.truncate shortens long strings', () => {
    assertEqual(Utils.truncate('short', 10), 'short');
    assertEqual(Utils.truncate('this is a long string', 10), 'this is...');
    assertEqual(Utils.truncate('exactly10chars', 10), 'exactly...');
    assertEqual(Utils.truncate('', 10), '');
    assertEqual(Utils.truncate(null, 10), null);
    assertEqual(Utils.truncate(undefined, 10), undefined);
  });
}

// Test backward compatibility functions
async function testBackwardCompatibilityFunctions() {
  await test('ensureDir backward compatibility function works', () => {
    const tempPath = tempDir.create();
    const testDir = path.join(tempPath, 'compat-dir', 'nested');
    
    assertEqual(fs.existsSync(testDir), false);
    
    ensureDir(testDir);
    
    assertEqual(fs.existsSync(testDir), true);
    assertEqual(fs.statSync(testDir).isDirectory(), true);
  });

  await test('ensureExecutable backward compatibility function works', () => {
    const tempPath = tempDir.create();
    const testFile = path.join(tempPath, 'compat-script.sh');
    
    fs.writeFileSync(testFile, '#!/bin/bash\necho "test"');
    
    const originalStats = fs.statSync(testFile);
    
    ensureExecutable(testFile);
    
    const newStats = fs.statSync(testFile);
    assertEqual((newStats.mode & 0o111) > 0, true);
  });

  await test('toPosix backward compatibility function works', () => {
    assertEqual(toPosix('path\\with\\backslashes'), 'path/with/backslashes');
    assertEqual(toPosix('/unix/path'), '/unix/path');
  });

  await test('cryptoRandomId backward compatibility function works', () => {
    const id = cryptoRandomId();
    assertEqual(typeof id, 'string');
    assertEqual(id.length, 36);
    assertMatch(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  await test('escapeMarkdown backward compatibility function works', () => {
    assertEqual(escapeMarkdown('*bold*'), '\\*bold\\*');
    assertEqual(escapeMarkdown('_italic_'), '\\_italic\\_');
    assertEqual(escapeMarkdown(42), 42); // Non-strings should pass through
  });
}

// Test error handling and edge cases
async function testErrorHandlingAndEdgeCases() {
  await test('ensureDir handles permission errors gracefully', () => {
    // This test might not work on all systems due to permission restrictions
    try {
      ensureDir('/root/test-permission-error');
      // If it succeeds, that's also fine (might be running as root)
      assertEqual(true, true);
    } catch (error) {
      // If it fails with permission error, that's expected
      assertContains(error.message.toLowerCase(), 'permission', 'Should fail with permission error');
    }
  });

  await test('cryptoRandomId maintains randomness under rapid generation', () => {
    const rapidIds = [];
    const count = 1000;
    
    for (let i = 0; i < count; i++) {
      rapidIds.push(cryptoRandomId());
    }
    
    const uniqueIds = new Set(rapidIds);
    assertEqual(uniqueIds.size, count, 'All rapidly generated IDs should be unique');
  });

  await test('escapeMarkdown handles special regex characters correctly', () => {
    // Test characters that have special meaning in regex
    const input = 'Test with regex chars: . * + ? ^ $ { } [ ] | ( ) \\';
    const result = escapeMarkdown(input);
    
    // Result should not break when used in regex
    try {
      new RegExp(result);
      assertEqual(true, true); // If we get here, regex is valid
    } catch (error) {
      throw new Error(`Escaped string breaks regex: ${error.message}`);
    }
    
    // Specific checks
    assertContains(result, '\\.');
    assertContains(result, '\\*');
    assertContains(result, '\\+');
    assertContains(result, '\\\\');
  });

  await test('Utils functions handle extreme input sizes', () => {
    // Test very long strings
    const longString = 'a'.repeat(10000);
    const longPath = 'dir/'.repeat(100) + 'file.txt';
    
    assertEqual(toPosix(longPath).includes('/'), true);
    assertEqual(escapeMarkdown(longString).length >= longString.length, true);
    assertEqual(Utils.truncate(longString, 50).length, 50);
  });
}

// Test integration scenarios
async function testIntegrationScenarios() {
  await test('File operations integration - create, modify, check', () => {
    const tempPath = tempDir.create();
    const testFile = path.join(tempPath, 'integration', 'test.txt');
    const content = 'Integration test content';
    
    // File shouldn't exist initially
    assertEqual(Utils.fileExists(testFile), false);
    assertEqual(Utils.getFileStats(testFile), null);
    
    // Write file (creates directories)
    Utils.writeFile(testFile, content);
    
    // Now should exist
    assertEqual(Utils.fileExists(testFile), true);
    
    const stats = Utils.getFileStats(testFile);
    assertEqual(stats !== null, true);
    assertEqual(stats.isFile(), true);
    
    // Read content back
    const readContent = Utils.readFile(testFile);
    assertEqual(readContent, content);
    
    // Make executable
    Utils.ensureExecutable(testFile);
    const execStats = Utils.getFileStats(testFile);
    assertEqual((execStats.mode & 0o111) > 0, true);
  });

  await test('Path operations integration', () => {
    const mixedPath = 'C:\\Users\\test\\Documents/Projects\\afk/bin\\script.sh';
    const posixPath = toPosix(mixedPath);
    
    assertEqual(posixPath, 'C:/Users/test/Documents/Projects/afk/bin/script.sh');
    assertEqual(posixPath.includes('\\'), false);
    assertEqual(posixPath.includes('/'), true);
    
    // Test with directory creation
    const tempPath = tempDir.create();
    const nestedPath = path.join(tempPath, toPosix('nested\\deep\\path'));
    
    ensureDir(nestedPath);
    assertEqual(fs.existsSync(nestedPath), true);
  });

  await test('ID generation and text processing integration', () => {
    const ids = [];
    const texts = [];
    
    // Generate IDs and create markdown-like text
    for (let i = 0; i < 10; i++) {
      const id = cryptoRandomId();
      ids.push(id);
      
      const text = `Session ${id}: *Processing* [file_${i}.txt](path/to/file) with \`special\` chars!`;
      const escaped = escapeMarkdown(text);
      texts.push(escaped);
    }
    
    // All IDs should be unique
    const uniqueIds = new Set(ids);
    assertEqual(uniqueIds.size, 10);
    
    // All texts should be properly escaped
    for (const text of texts) {
      assertEqual(text.includes('\\*'), true);
      assertEqual(text.includes('\\_'), true);
      assertEqual(text.includes('\\['), true);
      assertEqual(text.includes('\\]'), true);
      assertEqual(text.includes('\\('), true);
      assertEqual(text.includes('\\)'), true);
      assertEqual(text.includes('\\`'), true);
      assertEqual(text.includes('\\!'), true);
    }
  });

  await test('Utility functions chain correctly', () => {
    const tempPath = tempDir.create();
    
    // Create a complex scenario
    const sessionId = cryptoRandomId();
    const projectName = 'Test Project [v1.0]';
    const escapedProjectName = escapeMarkdown(projectName);
    const logDir = toPosix(path.join(tempPath, 'logs', sessionId));
    
    ensureDir(logDir);
    
    const logFile = path.join(logDir, 'session.log');
    const logContent = `Session: ${sessionId}\nProject: ${escapedProjectName}\nTimestamp: ${new Date().toISOString()}`;
    
    Utils.writeFile(logFile, logContent);
    Utils.ensureExecutable(logFile);
    
    // Verify everything worked
    assertEqual(Utils.fileExists(logFile), true);
    const readContent = Utils.readFile(logFile);
    assertContains(readContent, sessionId);
    assertContains(readContent, 'Test Project \\[v1\\.0\\]');
    
    const stats = Utils.getFileStats(logFile);
    assertEqual((stats.mode & 0o111) > 0, true);
  });
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Testing lib/core/utils.js\n');
  
  try {
    await testUtilsClassStaticMethods();
    await testBackwardCompatibilityFunctions();
    await testErrorHandlingAndEdgeCases();
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
  testUtilsClassStaticMethods,
  testBackwardCompatibilityFunctions,
  testErrorHandlingAndEdgeCases,
  testIntegrationScenarios
};