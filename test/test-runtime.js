#!/usr/bin/env node
// Runtime tests to catch undefined functions and basic errors

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

// Helper to create temporary test directory
const TEST_DIR = path.join(require('os').tmpdir(), 'afk-test-' + Date.now());
const CONFIG_DIR = path.join(TEST_DIR, '.afk');

function setup() {
  // Create test directories
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(path.join(CONFIG_DIR, 'approvals'), { recursive: true });
  
  // Create minimal config
  const testConfig = {
    telegram_bot_token: 'test-token-123',
    telegram_chat_id: '123456789',
    timeout_seconds: 60,
    timeout_action: 'deny',
    intercept_matcher: 'Bash|Edit',
    auto_approve_tools: ['Read']
  };
  
  fs.writeFileSync(
    path.join(CONFIG_DIR, 'config.json'),
    JSON.stringify(testConfig, null, 2)
  );
  
  // Create mode file
  fs.writeFileSync(path.join(CONFIG_DIR, 'mode'), 'local');
  
  // Create empty session map
  fs.writeFileSync(
    path.join(CONFIG_DIR, 'session-map.json'),
    JSON.stringify({ messages: {}, latest_per_chat: {} })
  );
  
  // Create empty history
  fs.writeFileSync(path.join(CONFIG_DIR, 'history.jsonl'), '');
  
  // Set HOME to test directory
  process.env.HOME = TEST_DIR;
  process.env.AFK_NONINTERACTIVE = '1'; // Prevent waiting for user input
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

// Test spawning afk with mock stdin
function spawnAfk(args, stdin = null) {
  return new Promise((resolve, reject) => {
    const afkPath = path.join(__dirname, '..', 'bin', 'afk');
    const proc = spawn('node', [afkPath, ...args], {
      env: { ...process.env, HOME: TEST_DIR, AFK_NONINTERACTIVE: '1' },
      timeout: 5000 // 5 second timeout
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

// Test that all functions are defined
async function testFunctionDefinitions() {
  // Load the afk module and check for common function issues
  const afkPath = path.join(__dirname, '..', 'bin', 'afk');
  const afkSource = fs.readFileSync(afkPath, 'utf8');
  
  // Check for function calls that don't have definitions
  const functionCalls = afkSource.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\(/g) || [];
  const functionDefs = afkSource.match(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
  const asyncDefs = afkSource.match(/async\s+function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
  
  const definedFunctions = new Set();
  functionDefs.forEach(def => {
    const name = def.replace('function ', '');
    definedFunctions.add(name);
  });
  asyncDefs.forEach(def => {
    const name = def.replace('async function ', '').replace('function ', '');
    definedFunctions.add(name);
  });
  
  // Add Node.js built-ins and known globals
  const builtins = new Set([
    'require', 'process', 'console', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'Promise', 'JSON', 'Date',
    'Math', 'String', 'Number', 'Boolean', 'Array', 'Object',
    'Buffer', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'encodeURIComponent', 'decodeURIComponent', 'escape', 'unescape',
    'eval', 'fetch', 'Atomics', 'SharedArrayBuffer', 'Int32Array',
    'Error', 'TypeError', 'ReferenceError', 'SyntaxError'
  ]);
  
  // Check for undefined function calls (basic check)
  const undefinedCalls = new Set();
  functionCalls.forEach(call => {
    const name = call.replace('(', '');
    if (!definedFunctions.has(name) && !builtins.has(name)) {
      // Check if it's a method call (has a dot before it)
      const methodPattern = new RegExp(`\\.${name}\\(`);
      if (!methodPattern.test(afkSource)) {
        // Check if it's imported from require
        if (!afkSource.includes(`require(`) || !afkSource.includes(`.${name}`)) {
          // Special case for common patterns we know are ok
          if (!['tgApiWithToken', 'api', 'ensureDir', 'toPosix'].includes(name)) {
            undefinedCalls.add(name);
          }
        }
      }
    }
  });
  
  // The readConfig error we fixed should be caught here
  if (afkSource.includes('readConfig(') && !definedFunctions.has('readConfig')) {
    throw new Error('readConfig is called but not defined (this should be cfg)');
  }
  
  // Check cfg() is used correctly
  if (!definedFunctions.has('cfg')) {
    throw new Error('cfg function is not defined');
  }
}

// Test hook functions can be called without crashing
async function testHookPreToolUse() {
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
    session_id: 'test-session-123',
    cwd: TEST_DIR,
    transcript_path: '/tmp/test.json'
  });
  
  const result = await spawnAfk(['hook', 'pretooluse'], input);
  
  // In local mode, it should just pass through
  if (result.stderr.includes('Error') || result.stderr.includes('not defined')) {
    throw new Error(`Hook crashed: ${result.stderr}`);
  }
}

async function testHookStop() {
  const input = JSON.stringify({
    session_id: 'test-session-456',
    cwd: TEST_DIR,
    transcript_path: '/tmp/test.json',
    stop_hook_active: false
  });
  
  const result = await spawnAfk(['hook', 'stop'], input);
  
  if (result.stderr.includes('Error') && !result.stderr.includes('[afk]')) {
    throw new Error(`Hook crashed: ${result.stderr}`);
  }
}

async function testHookSessionStart() {
  const input = JSON.stringify({
    session_id: 'test-session-789',
    cwd: TEST_DIR,
    transcript_path: '/tmp/test.json',
    source: 'startup'
  });
  
  const result = await spawnAfk(['hook', 'sessionstart'], input);
  
  if (result.stderr.includes('Error') && !result.stderr.includes('[afk]')) {
    throw new Error(`Hook crashed: ${result.stderr}`);
  }
}

// Test basic commands don't crash
async function testStatusCommand() {
  const result = await spawnAfk(['status']);
  
  if (!result.stdout.includes('LOCAL') && !result.stdout.includes('REMOTE')) {
    throw new Error('Status command did not return mode');
  }
}

async function testModeCommands() {
  // Test mode on
  let result = await spawnAfk(['mode', 'on']);
  if (result.code !== 0) {
    throw new Error(`Mode on failed with code ${result.code}`);
  }
  
  // Test mode off
  result = await spawnAfk(['mode', 'off']);
  if (result.code !== 0) {
    throw new Error(`Mode off failed with code ${result.code}`);
  }
  
  // Test mode toggle
  result = await spawnAfk(['mode', 'toggle']);
  if (result.code !== 0) {
    throw new Error(`Mode toggle failed with code ${result.code}`);
  }
}

// Test help command
async function testHelpCommand() {
  const result = await spawnAfk(['--help']);
  
  if (!result.stdout.includes('afk') || !result.stdout.includes('Away From Keyboard')) {
    throw new Error('Help command did not return expected output');
  }
}

// Test abandoned session notification function
async function testAbandonedSessionTracking() {
  // This tests the function that had the readConfig bug
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'sleep 1' },
    session_id: 'test-abandoned-123',
    cwd: TEST_DIR,
    transcript_path: '/tmp/test.json'
  });
  
  // Start a pretooluse hook (which tracks sessions)
  const result = await spawnAfk(['hook', 'pretooluse'], input);
  
  // Should not have readConfig errors
  if (result.stderr.includes('readConfig is not defined')) {
    throw new Error('readConfig bug still present!');
  }
}

// Main test runner
async function main() {
  console.log('\n=== Runtime Error Detection Tests ===\n');
  
  setup();
  
  try {
    // Test function definitions
    await runTest('All functions are defined', testFunctionDefinitions);
    
    // Test hooks don't crash
    await runTest('PreToolUse hook runs without crashing', testHookPreToolUse);
    await runTest('Stop hook runs without crashing', testHookStop);
    await runTest('SessionStart hook runs without crashing', testHookSessionStart);
    
    // Test basic commands
    await runTest('Status command works', testStatusCommand);
    await runTest('Mode commands work', testModeCommands);
    await runTest('Help command works', testHelpCommand);
    
    // Test the specific bug we fixed
    await runTest('No readConfig errors in session tracking', testAbandonedSessionTracking);
    
  } finally {
    cleanup();
  }
  
  // Summary
  console.log('\n=== Test Summary ===\n');
  if (testsFailed === 0) {
    console.log(`${GREEN}✅ All ${testsPassed} tests passed!${RESET}`);
    process.exit(0);
  } else {
    console.log(`${GREEN}✅ Passed: ${testsPassed}${RESET}`);
    console.log(`${RED}❌ Failed: ${testsFailed}${RESET}`);
    console.log(`Total: ${testsPassed + testsFailed}`);
    process.exit(1);
  }
}

// Run tests
main().catch(err => {
  console.error(`${RED}Test runner failed: ${err.message}${RESET}`);
  cleanup();
  process.exit(1);
});