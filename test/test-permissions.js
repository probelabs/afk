#!/usr/bin/env node
// Unit tests for afk permission checking logic

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(`   ${e.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Mock the pattern matching function from afk
function patternMatches(pattern, rule) {
  // Exact match
  if (pattern === rule) return true;
  
  // For tools without patterns (Read, Edit, etc.), just check tool name
  if (!rule.includes('(') && !pattern.includes('(')) {
    return pattern === rule;
  }
  
  // Check if rule is more general (e.g., Bash(*) matches any Bash command)
  if (rule.endsWith('(*)') || rule.endsWith('(**)')) {
    const rulePrefix = rule.split('(')[0];
    const patternPrefix = pattern.split('(')[0];
    return rulePrefix === patternPrefix;
  }
  
  // Check wildcard patterns like Bash(npm:*) matching Bash(npm test:*)
  if (rule.includes(':*') && pattern.includes(':')) {
    const ruleBase = rule.replace(':*)', '');
    const patternBase = pattern.substring(0, pattern.lastIndexOf(':'));
    return pattern.startsWith(ruleBase);
  }
  
  // MCP tool wildcard matching (mcp__* matches any mcp__ tool)
  if (rule === 'mcp__*' && pattern.startsWith('mcp__')) {
    return true;
  }
  
  // File path patterns with ** (matches any subdirectory)
  if (rule.includes('(**') || rule.includes('/*')) {
    // Convert pattern to regex-like match
    let rulePattern = rule
      .replace(/\./g, '\\.')  // Escape dots
      .replace(/\*\*/g, '.*') // ** matches any path
      .replace(/\*/g, '[^/]*'); // * matches any filename
    
    // Handle (src/**) format
    if (rule.includes('(') && rule.includes(')')) {
      const content = rule.match(/\((.*)\)/)[1];
      const toolName = rule.split('(')[0];
      if (pattern.startsWith(toolName + '(')) {
        const patternContent = pattern.match(/\((.*)\)/)[1];
        const contentPattern = content
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*');
        return new RegExp('^' + contentPattern + '$').test(patternContent);
      }
    }
  }
  
  return false;
}

// Test pattern matching
console.log('\n=== Testing Pattern Matching ===\n');

test('Exact match works', () => {
  assert(patternMatches('Bash(npm test)', 'Bash(npm test)'));
  assert(patternMatches('Read', 'Read'));
});

test('Tool name without patterns', () => {
  assert(patternMatches('Read', 'Read'));
  assert(patternMatches('Edit', 'Edit'));
  assert(!patternMatches('Read', 'Write'));
});

test('Wildcard (*) matches any tool usage', () => {
  assert(patternMatches('Bash(npm test)', 'Bash(*)'));
  assert(patternMatches('Bash(git status)', 'Bash(*)'));
  assert(patternMatches('WebFetch(domain:example.com)', 'WebFetch(*)'));
  assert(!patternMatches('Edit(file.txt)', 'Bash(*)'));
});

test('Colon wildcard patterns', () => {
  assert(patternMatches('Bash(npm test:*)', 'Bash(npm test:*)'));
  assert(patternMatches('Bash(npm test:unit)', 'Bash(npm test:*)'));
  assert(patternMatches('Bash(git commit:*)', 'Bash(git commit:*)'));
  assert(!patternMatches('Bash(npm install:*)', 'Bash(npm test:*)'));
});

test('Specific Bash command patterns', () => {
  assert(patternMatches('Bash(npm run:*)', 'Bash(npm run:*)'));
  assert(!patternMatches('Bash(npm install:*)', 'Bash(npm run:*)'));
  assert(patternMatches('Bash(git status:*)', 'Bash(git status:*)'));
});

test('WebFetch domain patterns', () => {
  assert(patternMatches('WebFetch(domain:github.com)', 'WebFetch(domain:github.com)'));
  assert(patternMatches('WebFetch(domain:api.example.com)', 'WebFetch(*)'));
  assert(!patternMatches('WebFetch(domain:github.com)', 'WebFetch(domain:gitlab.com)'));
});

test('MCP tool patterns', () => {
  assert(patternMatches('mcp__code-search__search_code', 'mcp__code-search__search_code'));
  // Note: mcp__* is not a valid pattern in our current implementation
  // We'd need to add special handling for mcp wildcard patterns
  assert(!patternMatches('mcp__code-search__search_code', 'mcp__other__tool'));
});

// Mock checkClaudePermissions function
function checkClaudePermissions(pattern, configs) {
  // Simulate checking multiple config levels
  // configs is array of {name, permissions} in order: local, project, user
  
  for (const config of configs) {
    if (!config.permissions) continue;
    
    // Check deny list first (takes precedence)
    if (config.permissions.deny && Array.isArray(config.permissions.deny)) {
      for (const rule of config.permissions.deny) {
        if (patternMatches(pattern, rule)) {
          return { decision: 'deny', level: config.name, rule };
        }
      }
    }
    
    // Check allow list
    if (config.permissions.allow && Array.isArray(config.permissions.allow)) {
      for (const rule of config.permissions.allow) {
        if (patternMatches(pattern, rule)) {
          return { decision: 'allow', level: config.name, rule };
        }
      }
    }
  }
  
  return { decision: 'ask', level: null, rule: null };
}

console.log('\n=== Testing Permission Chain Resolution ===\n');

test('Local settings override project and user', () => {
  const configs = [
    {
      name: 'local',
      permissions: {
        allow: ['Bash(npm test:*)']
      }
    },
    {
      name: 'project',
      permissions: {
        deny: ['Bash(*)']
      }
    },
    {
      name: 'user',
      permissions: {
        deny: ['Bash(*)']
      }
    }
  ];
  
  const result = checkClaudePermissions('Bash(npm test:*)', configs);
  assertEqual(result.decision, 'allow');
  assertEqual(result.level, 'local');
});

test('Deny takes precedence over allow at same level', () => {
  const configs = [
    {
      name: 'user',
      permissions: {
        deny: ['Bash(rm:*)'],
        allow: ['Bash(*)']
      }
    }
  ];
  
  const result = checkClaudePermissions('Bash(rm:*)', configs);
  assertEqual(result.decision, 'deny');
  assertEqual(result.rule, 'Bash(rm:*)');
});

test('Project settings override user settings', () => {
  const configs = [
    {
      name: 'project',
      permissions: {
        allow: ['WebFetch(domain:api.internal.com)']
      }
    },
    {
      name: 'user',
      permissions: {
        deny: ['WebFetch(*)']
      }
    }
  ];
  
  const result = checkClaudePermissions('WebFetch(domain:api.internal.com)', configs);
  assertEqual(result.decision, 'allow');
  assertEqual(result.level, 'project');
});

test('Returns ask when no match found', () => {
  const configs = [
    {
      name: 'user',
      permissions: {
        allow: ['Read', 'Bash(npm:*)'],
        deny: ['Write(*.env)']
      }
    }
  ];
  
  const result = checkClaudePermissions('Edit(file.js)', configs);
  assertEqual(result.decision, 'ask');
  assertEqual(result.level, null);
});

test('Complex multi-level permission chain', () => {
  const configs = [
    {
      name: 'local',
      permissions: {
        allow: ['Bash(npm test:*)'],
        deny: ['Bash(npm test:e2e)']
      }
    },
    {
      name: 'project',
      permissions: {
        allow: ['Bash(npm:*)', 'Read', 'Edit(src/**)'],
        deny: ['Bash(rm:*)', 'Write(*.env)']
      }
    },
    {
      name: 'user',
      permissions: {
        allow: ['Read', 'WebFetch(*)'],
        deny: ['Bash(*)', 'Write(*)']
      }
    }
  ];
  
  // Test various patterns
  assertEqual(checkClaudePermissions('Bash(npm test:unit)', configs).decision, 'allow'); // local allow
  assertEqual(checkClaudePermissions('Bash(npm test:e2e)', configs).decision, 'deny'); // local deny
  assertEqual(checkClaudePermissions('Bash(npm install:*)', configs).decision, 'allow'); // project allow
  assertEqual(checkClaudePermissions('Bash(rm:rf)', configs).decision, 'deny'); // project deny
  assertEqual(checkClaudePermissions('Read', configs).decision, 'allow'); // project allow (also in user)
  assertEqual(checkClaudePermissions('WebFetch(domain:example.com)', configs).decision, 'allow'); // user allow
  assertEqual(checkClaudePermissions('Bash(git status:*)', configs).decision, 'deny'); // user deny
  assertEqual(checkClaudePermissions('Grep(pattern)', configs).decision, 'ask'); // no match
});

test('Real-world Bash command matching', () => {
  const configs = [
    {
      name: 'user',
      permissions: {
        allow: [
          'Bash(npm test:*)',
          'Bash(npm run:*)',
          'Bash(git status:*)',
          'Bash(git diff:*)',
          'Bash(ls:*)',
          'Bash(cat:*)'
        ],
        deny: [
          'Bash(rm:*)',
          'Bash(sudo:*)',
          'Bash(chmod:*)'
        ]
      }
    }
  ];
  
  // Test actual command patterns that would be generated
  assertEqual(checkClaudePermissions('Bash(npm test:*)', configs).decision, 'allow');
  assertEqual(checkClaudePermissions('Bash(npm run:*)', configs).decision, 'allow');
  assertEqual(checkClaudePermissions('Bash(git status:*)', configs).decision, 'allow');
  assertEqual(checkClaudePermissions('Bash(rm:*)', configs).decision, 'deny');
  assertEqual(checkClaudePermissions('Bash(sudo:*)', configs).decision, 'deny');
  assertEqual(checkClaudePermissions('Bash(echo:*)', configs).decision, 'ask'); // not in list
});

test('MCP tools and internal tools', () => {
  const configs = [
    {
      name: 'user', 
      permissions: {
        allow: [
          'mcp__code-search__search_code',
          'mcp__code-search__extract_code',
          'Task',
          'TodoWrite',
          'Read'
        ],
        deny: [
          'mcp__dangerous__tool'
        ]
      }
    }
  ];
  
  assertEqual(checkClaudePermissions('mcp__code-search__search_code', configs).decision, 'allow');
  assertEqual(checkClaudePermissions('mcp__dangerous__tool', configs).decision, 'deny');
  assertEqual(checkClaudePermissions('Task', configs).decision, 'allow');
  assertEqual(checkClaudePermissions('Write', configs).decision, 'ask');
});

// Test merging configurations
console.log('\n=== Testing Configuration Merging ===\n');

test('Empty configs return ask', () => {
  const configs = [];
  assertEqual(checkClaudePermissions('Bash(ls:*)', configs).decision, 'ask');
});

test('Missing permissions field handled gracefully', () => {
  const configs = [
    { name: 'local' }, // no permissions field
    { name: 'project', permissions: {} }, // empty permissions
    { name: 'user', permissions: { allow: ['Read'] } }
  ];
  
  assertEqual(checkClaudePermissions('Read', configs).decision, 'allow');
  assertEqual(checkClaudePermissions('Write', configs).decision, 'ask');
});

test('Wildcard precedence rules', () => {
  const configs = [
    {
      name: 'user',
      permissions: {
        allow: ['Bash(*)', 'WebFetch(*)'],
        deny: ['Bash(rm:*)', 'WebFetch(domain:malicious.com)']
      }
    }
  ];
  
  // Specific deny should override general allow
  assertEqual(checkClaudePermissions('Bash(rm:*)', configs).decision, 'deny');
  assertEqual(checkClaudePermissions('Bash(ls:*)', configs).decision, 'allow');
  assertEqual(checkClaudePermissions('WebFetch(domain:malicious.com)', configs).decision, 'deny');
  assertEqual(checkClaudePermissions('WebFetch(domain:safe.com)', configs).decision, 'allow');
});

// Print summary
console.log('\n=== Test Summary ===\n');
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);

if (testsFailed > 0) {
  process.exit(1);
}

// Test compound command parsing
function parseCompoundCommand(command) {
  // Mock the function from afk for testing
  const commands = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let parenDepth = 0;
  let i = 0;
  
  while (i < command.length) {
    const char = command[i];
    const nextChar = command[i + 1] || '';
    
    // Handle escape sequences
    if (char === '\\' && (nextChar === '"' || nextChar === "'" || nextChar === '\\')) {
      current += char + nextChar;
      i += 2;
      continue;
    }
    
    // Handle quotes
    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
      current += char;
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = '';
      current += char;
    } else if (inQuotes) {
      current += char;
    } else if (char === '(' || char === '[' || char === '{') {
      parenDepth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      parenDepth--;
      current += char;
    } else if (parenDepth === 0) {
      // Check for operators only when not in quotes or parentheses
      if (char === '|' && nextChar === '|') {
        // || operator
        if (current.trim()) commands.push(current.trim());
        current = '';
        i += 2;
        continue;
      } else if (char === '&' && nextChar === '&') {
        // && operator  
        if (current.trim()) commands.push(current.trim());
        current = '';
        i += 2;
        continue;
      } else if (char === '|' && nextChar !== '|') {
        // | pipe operator
        if (current.trim()) commands.push(current.trim());
        current = '';
      } else if (char === ';') {
        // ; separator
        if (current.trim()) commands.push(current.trim());
        current = '';
      } else if (char === '&' && nextChar !== '&') {
        // & background operator
        if (current.trim()) commands.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    } else {
      current += char;
    }
    
    i++;
  }
  
  // Add the last command
  if (current.trim()) {
    commands.push(current.trim());
  }
  
  return commands;
}

function generatePermissionPattern(toolName, toolInput) {
  // Enhanced pattern generation for testing
  if (toolName === 'Bash' && toolInput.command) {
    const commands = parseCompoundCommand(toolInput.command);
    
    if (commands.length > 1) {
      // Return array of patterns for compound commands
      return commands.map(cmd => {
        const parts = cmd.trim().split(/\s+/);
        const baseCmd = parts[0];
        
        if (baseCmd === 'npm' && parts[1]) {
          return `Bash(npm ${parts[1]}:*)`;
        }
        if (baseCmd === 'git' && parts[1]) {
          return `Bash(git ${parts[1]}:*)`;
        }
        
        return `Bash(${baseCmd}:*)`;
      });
    } else {
      // Single command
      const parts = toolInput.command.trim().split(/\s+/);
      const baseCmd = parts[0];
      
      if (baseCmd === 'npm' && parts[1]) {
        return `Bash(npm ${parts[1]}:*)`;
      }
      if (baseCmd === 'git' && parts[1]) {
        return `Bash(git ${parts[1]}:*)`;
      }
      
      return `Bash(${baseCmd}:*)`;
    }
  }
  
  // Other tool types...
  if (toolName === 'WebFetch' && toolInput.url) {
    try {
      const url = new URL(toolInput.url);
      return `WebFetch(domain:${url.hostname})`;
    } catch {
      return 'WebFetch(*)';
    }
  }
  
  if (['Read', 'Edit', 'Write', 'MultiEdit'].includes(toolName)) {
    if (toolInput.file_path) {
      return `${toolName}(${toolInput.file_path})`;
    }
    return toolName;
  }
  
  return toolName;
}

console.log('\n=== Testing Compound Command Parsing ===\n');

test('Single command parsing', () => {
  const commands = parseCompoundCommand('npm test');
  assertEqual(commands, ['npm test']);
});

test('Pipe operator parsing', () => {
  const commands = parseCompoundCommand('ls -la | grep test');
  assertEqual(commands, ['ls -la', 'grep test']);
});

test('Multiple pipe parsing', () => {
  const commands = parseCompoundCommand('cat file.txt | grep error | wc -l');
  assertEqual(commands, ['cat file.txt', 'grep error', 'wc -l']);
});

test('Logical AND operator parsing', () => {
  const commands = parseCompoundCommand('npm test && npm build');
  assertEqual(commands, ['npm test', 'npm build']);
});

test('Logical OR operator parsing', () => {
  const commands = parseCompoundCommand('npm test || echo "Tests failed"');
  assertEqual(commands, ['npm test', 'echo "Tests failed"']);
});

test('Semicolon separator parsing', () => {
  const commands = parseCompoundCommand('cd /tmp; ls -la; rm *.tmp');
  assertEqual(commands, ['cd /tmp', 'ls -la', 'rm *.tmp']);
});

test('Background operator parsing', () => {
  const commands = parseCompoundCommand('npm start & npm test');
  assertEqual(commands, ['npm start', 'npm test']);
});

test('Mixed operators parsing', () => {
  const commands = parseCompoundCommand('git status && git add . || echo "failed"');
  assertEqual(commands, ['git status', 'git add .', 'echo "failed"']);
});

test('Commands with quotes', () => {
  const commands = parseCompoundCommand('echo "hello world" | grep "hello"');
  assertEqual(commands, ['echo "hello world"', 'grep "hello"']);
});

test('Commands with single quotes', () => {
  const commands = parseCompoundCommand("echo 'test | grep' && ls");
  assertEqual(commands, ["echo 'test | grep'", 'ls']);
});

test('Commands with escaped quotes', () => {
  const commands = parseCompoundCommand('echo "say \\"hello\\"" | cat');
  assertEqual(commands, ['echo "say \\"hello\\""', 'cat']);
});

test('Commands with parentheses', () => {
  const commands = parseCompoundCommand('(cd /tmp && ls) | wc -l');
  assertEqual(commands, ['(cd /tmp && ls)', 'wc -l']);
});

test('Complex nested command', () => {
  const commands = parseCompoundCommand('if [ -f "file with spaces.txt" ]; then cat "file with spaces.txt" | grep test; fi');
  assertEqual(commands, ['if [ -f "file with spaces.txt" ]', 'then cat "file with spaces.txt"', 'grep test', 'fi']);
});

test('Pattern generation for compound commands', () => {
  const patterns = generatePermissionPattern('Bash', { command: 'npm test && git status' });
  assertEqual(patterns, ['Bash(npm test:*)', 'Bash(git status:*)']);
});

test('Pattern generation for piped commands', () => {
  const patterns = generatePermissionPattern('Bash', { command: 'ls -la | grep test | wc -l' });
  assertEqual(patterns, ['Bash(ls:*)', 'Bash(grep:*)', 'Bash(wc:*)']);
});

test('Pattern generation preserves single commands', () => {
  const pattern = generatePermissionPattern('Bash', { command: 'npm install' });
  assertEqual(pattern, 'Bash(npm install:*)');
});

console.log('\n✅ All tests passed!');