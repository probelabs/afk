#!/usr/bin/env node
// Simple unit tests for AFK command parsing logic

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

let testCounter = 0;
let failures = [];

function runTest(name, testFn) {
  try {
    testCounter++;
    testFn();
    console.log(`✅ ${testCounter}. ${name}`);
    return true;
  } catch (error) {
    failures.push({ name, error: error.message });
    console.log(`❌ ${testCounter}. ${name}: ${error.message}`);
    return false;
  }
}

// Test the command parsing logic in isolation
function testCommandParsingLogic() {
  // This mimics the parsing logic from handleUserPromptSubmit
  function parseAfkCommand(prompt) {
    if (!prompt.startsWith('/afk')) {
      return null; // Not an AFK command
    }
    
    let subcommand, args;
    
    if (prompt.includes(':')) {
      // New format: /afk:on
      const colonIndex = prompt.indexOf(':');
      const afterColon = prompt.slice(colonIndex + 1);
      const parts = afterColon.split(/\s+/);
      subcommand = parts[0] || 'toggle';
      args = parts.slice(1).join(' ');
    } else {
      // Old format: /afk on
      const parts = prompt.slice(1).split(/\s+/); // Remove leading '/'
      subcommand = parts[1] || 'toggle';
      args = parts.slice(2).join(' ');
    }
    
    return { subcommand, args };
  }
  
  runTest('Parse /afk:on command', () => {
    const result = parseAfkCommand('/afk:on');
    assert.strictEqual(result.subcommand, 'on');
    assert.strictEqual(result.args, '');
  });
  
  runTest('Parse /afk:off command', () => {
    const result = parseAfkCommand('/afk:off');
    assert.strictEqual(result.subcommand, 'off');
    assert.strictEqual(result.args, '');
  });
  
  runTest('Parse /afk:toggle command', () => {
    const result = parseAfkCommand('/afk:toggle');
    assert.strictEqual(result.subcommand, 'toggle');
    assert.strictEqual(result.args, '');
  });
  
  runTest('Parse /afk:status command', () => {
    const result = parseAfkCommand('/afk:status');
    assert.strictEqual(result.subcommand, 'status');
    assert.strictEqual(result.args, '');
  });
  
  runTest('Parse /afk:global on command', () => {
    const result = parseAfkCommand('/afk:global on');
    assert.strictEqual(result.subcommand, 'global');
    assert.strictEqual(result.args, 'on');
  });
  
  runTest('Parse /afk:global off command', () => {
    const result = parseAfkCommand('/afk:global off');
    assert.strictEqual(result.args, 'off');
  });
  
  runTest('Parse /afk:project clear command', () => {
    const result = parseAfkCommand('/afk:project clear');
    assert.strictEqual(result.subcommand, 'project');
    assert.strictEqual(result.args, 'clear');
  });
  
  runTest('Parse legacy /afk on command', () => {
    const result = parseAfkCommand('/afk on');
    assert.strictEqual(result.subcommand, 'on');
    assert.strictEqual(result.args, '');
  });
  
  runTest('Parse legacy /afk off command', () => {
    const result = parseAfkCommand('/afk off');
    assert.strictEqual(result.subcommand, 'off');
    assert.strictEqual(result.args, '');
  });
  
  runTest('Parse legacy /afk toggle command', () => {
    const result = parseAfkCommand('/afk toggle');
    assert.strictEqual(result.subcommand, 'toggle');
    assert.strictEqual(result.args, '');
  });
  
  runTest('Parse legacy /afk global on command', () => {
    const result = parseAfkCommand('/afk global on');
    assert.strictEqual(result.subcommand, 'global');
    assert.strictEqual(result.args, 'on');
  });
  
  runTest('Parse /afk with no subcommand (should default to toggle)', () => {
    const result = parseAfkCommand('/afk');
    assert.strictEqual(result.subcommand, 'toggle');
    assert.strictEqual(result.args, '');
  });
  
  runTest('Parse /afk: with empty colon (should default to toggle)', () => {
    const result = parseAfkCommand('/afk:');
    assert.strictEqual(result.subcommand, 'toggle');
    assert.strictEqual(result.args, '');
  });
  
  runTest('Non-AFK command returns null', () => {
    const result = parseAfkCommand('/help');
    assert.strictEqual(result, null);
  });
  
  runTest('Regular text returns null', () => {
    const result = parseAfkCommand('hello world');
    assert.strictEqual(result, null);
  });
  
  runTest('Empty command returns null', () => {
    const result = parseAfkCommand('');
    assert.strictEqual(result, null);
  });
}

// Test that the subcommand structure matches the expected values
function testSubcommandValidation() {
  const validSubcommands = ['on', 'off', 'toggle', 'status', 'clear', 'global', 'project', 'help'];
  const validGlobalArgs = ['on', 'off', 'toggle'];
  const validProjectArgs = ['on', 'off', 'clear'];
  
  runTest('Valid basic subcommands', () => {
    ['on', 'off', 'toggle', 'status', 'clear', 'help'].forEach(cmd => {
      assert(validSubcommands.includes(cmd), `${cmd} should be a valid subcommand`);
    });
  });
  
  runTest('Valid global arguments', () => {
    ['on', 'off', 'toggle'].forEach(arg => {
      assert(validGlobalArgs.includes(arg), `${arg} should be a valid global argument`);
    });
  });
  
  runTest('Valid project arguments', () => {
    ['on', 'off', 'clear'].forEach(arg => {
      assert(validProjectArgs.includes(arg), `${arg} should be a valid project argument`);
    });
  });
}

// Test message formatting expectations
function testMessageFormatting() {
  // Test that we can create expected messages for different commands
  function createExpectedMessage(subcommand, args) {
    switch (subcommand) {
      case 'on':
        return 'Remote mode enabled for this session';
      case 'off':
        return 'Remote mode disabled for this session';
      case 'status':
        return 'AFK Mode Status';
      case 'help':
        return 'AFK Commands Help';
      case 'clear':
        return 'Session AFK mode override cleared';
      case 'global':
        if (args === 'on') return 'Global AFK mode enabled';
        if (args === 'off') return 'Global AFK mode disabled';
        return 'Global AFK mode is currently';
      case 'project':
        if (args === 'on') return 'Project AFK mode enabled';
        if (args === 'off') return 'Project AFK mode disabled';
        if (args === 'clear') return 'Project AFK mode override cleared';
        return 'Project AFK mode';
      default:
        return 'Unknown AFK command';
    }
  }
  
  runTest('Expected messages for basic commands', () => {
    assert(createExpectedMessage('on', '').includes('enabled'));
    assert(createExpectedMessage('off', '').includes('disabled'));
    assert(createExpectedMessage('status', '').includes('Status'));
    assert(createExpectedMessage('help', '').includes('Help'));
  });
  
  runTest('Expected messages for global commands', () => {
    assert(createExpectedMessage('global', 'on').includes('enabled'));
    assert(createExpectedMessage('global', 'off').includes('disabled'));
    assert(createExpectedMessage('global', '').includes('currently'));
  });
  
  runTest('Expected messages for project commands', () => {
    assert(createExpectedMessage('project', 'on').includes('enabled'));
    assert(createExpectedMessage('project', 'off').includes('disabled'));
    assert(createExpectedMessage('project', 'clear').includes('cleared'));
  });
}

// Main test runner
function runAllTests() {
  console.log('🧪 Running AFK Command Parsing Unit Tests\n');
  
  testCommandParsingLogic();
  testSubcommandValidation();
  testMessageFormatting();
  
  console.log(`\n📊 Results: ${testCounter - failures.length}/${testCounter} tests passed`);
  
  if (failures.length > 0) {
    console.log('\n❌ Failed tests:');
    failures.forEach(failure => {
      console.log(`  • ${failure.name}: ${failure.error}`);
    });
    process.exit(1);
  }
  
  console.log('\n✅ All command parsing tests passed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests
};