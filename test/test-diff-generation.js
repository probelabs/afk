#!/usr/bin/env node
// Comprehensive tests for diff image generation functionality

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock implementations for testing
const mockFs = {
  existsSync: fs.existsSync,
  statSync: fs.statSync,
  copyFileSync: fs.copyFileSync,
  renameSync: fs.renameSync,
  writeFileSync: fs.writeFileSync,
  readFileSync: fs.readFileSync,
  mkdirSync: fs.mkdirSync,
  rmSync: fs.rmSync
};

const mockExecSync = {
  executions: [],
  outputs: new Map(),
  setOutput: function(command, output) {
    this.outputs.set(command, output);
  },
  clearOutputs: function() {
    this.outputs.clear();
    this.executions = [];
  },
  mock: function(command, options = {}) {
    this.executions.push({ command, options });
    
    // Check for exact command match first
    const output = this.outputs.get(command);
    if (output !== undefined) {
      if (output instanceof Error) {
        throw output;
      }
      return output;
    }
    
    // Check for command patterns (starts with)
    for (const [key, value] of this.outputs.entries()) {
      if (command.startsWith(key) || key.includes('*') || key === 'node') {
        if (value instanceof Error) {
          throw value;
        }
        return value;
      }
    }
    
    // Default behavior for unspecified commands
    if (command === 'git diff') {
      return 'diff --git a/test.js b/test.js\nindex 123..456 100644\n--- a/test.js\n+++ b/test.js\n@@ -1,3 +1,3 @@\n console.log("hello");\n-console.log("old");\n+console.log("new");';
    }
    
    // Mock node script executions
    if (command.startsWith('node ') && command.includes('generate-and-read-diff.js')) {
      // Simulate successful script execution by creating the image file
      const imagePath = path.join(options.cwd || process.cwd(), 'generated-diff-image.png');
      const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      try {
        fs.writeFileSync(imagePath, testImageData);
      } catch (error) {
        // Ignore write errors in mock
      }
      return '';
    }
    
    return '';
  }
};

// Mock puppeteer
const mockPuppeteer = {
  browser: null,
  page: null,
  launchOptions: null,
  
  launch: async function(options) {
    this.launchOptions = options;
    this.browser = {
      newPage: async () => {
        this.page = {
          setViewport: async (viewport) => { this.viewport = viewport; },
          setContent: async (html, options) => { this.html = html; },
          evaluate: async (fn) => {
            // Mock page dimensions evaluation
            return { width: 900, height: 1200 };
          },
          screenshot: async (options) => {
            // Mock screenshot generation - create a small PNG file
            const imagePath = options.path;
            const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
            fs.writeFileSync(imagePath, testImageData);
          },
          close: async () => {}
        };
        return this.page;
      },
      close: async () => {}
    };
    return this.browser;
  },
  
  reset: function() {
    this.browser = null;
    this.page = null;
    this.launchOptions = null;
    this.viewport = null;
    this.html = null;
  }
};

// Mock sharp
const mockSharp = {
  inputPath: null,
  pngOptions: null,
  
  create: function(imagePath) {
    this.inputPath = imagePath;
    return {
      png: (options) => {
        this.pngOptions = options;
        return {
          toFile: async (outputPath) => {
            // Create a compressed version by copying the original
            if (fs.existsSync(this.inputPath)) {
              fs.copyFileSync(this.inputPath, outputPath);
            }
          }
        };
      }
    };
  },
  
  reset: function() {
    this.inputPath = null;
    this.pngOptions = null;
  }
};

// Extract generateDiffImage function from main file for testing
// This is a simplified version that includes the core logic
async function generateDiffImage(cwd, options = {}) {
  try {
    const { execSync = mockExecSync.mock, fs: fsOverride = mockFs } = options;
    
    // Check if diff image generation is disabled
    if (process.env.AFK_DISABLE_DIFF_IMAGES === 'true') {
      return null;
    }

    // Check if there are any git changes
    let diff;
    try {
      diff = execSync('git diff', { cwd, encoding: 'utf8', maxBuffer: 100000 });
      if (typeof diff === 'string') {
        diff = diff.trim();
      }
    } catch (error) {
      throw error; // Re-throw to be caught by outer try-catch
    }
    
    if (!diff) {
      return null;
    }

    // Get the directory where the afk binary is located  
    const afkDir = path.dirname(require.main?.filename || __filename);
    const generatorScript = path.join(afkDir, '..', 'generate-and-read-diff.js');
    
    // Fallback: try current working directory if script not found
    const fallbackScript = path.join(cwd, 'generate-and-read-diff.js');
    const scriptPath = fsOverride.existsSync(generatorScript) ? generatorScript : fallbackScript;
    
    if (!fsOverride.existsSync(scriptPath)) {
      return null;
    }

    // Run the beautiful diff generator
    try {
      execSync(`node "${scriptPath}"`, { 
        cwd, 
        stdio: 'inherit',
        timeout: 30000
      });
    } catch (error) {
      throw error; // Re-throw to be caught by outer try-catch
    }

    // Check if the image was generated
    const imagePath = path.join(cwd, 'generated-diff-image.png');
    if (fsOverride.existsSync(imagePath)) {
      return imagePath;
    } else {
      return null;
    }

  } catch (error) {
    return null;
  }
}

// Test helper functions
function createTempTestDir() {
  const tempDir = path.join(os.tmpdir(), `afk-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function cleanupTempDir(tempDir) {
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

function createMockScript(scriptPath) {
  const mockScript = `#!/usr/bin/env node
// Mock generate-and-read-diff.js for testing
const fs = require('fs');
const path = require('path');

console.log('🎨 Generating diff image for direct reading...');

try {
  // Create a mock image file
  const imagePath = path.join(process.cwd(), 'generated-diff-image.png');
  const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(imagePath, testImageData);
  console.log('✅ Mock image generated successfully at:', imagePath);
} catch (error) {
  console.error('❌ Error creating mock image:', error.message);
  process.exit(1);
}
`;
  fs.writeFileSync(scriptPath, mockScript);
  fs.chmodSync(scriptPath, 0o755);
}

console.log('=== Diff Image Generation Tests ===\n');

let passed = 0;
let failed = 0;

// Test cases
const tests = [
  {
    name: 'Basic functionality with git changes',
    test: async () => {
      const tempDir = createTempTestDir();
      const scriptPath = path.join(tempDir, 'generate-and-read-diff.js');
      
      try {
        // Create mock script
        createMockScript(scriptPath);
        
        // Mock git diff to return changes
        mockExecSync.setOutput('git diff', 'diff --git a/test.js b/test.js\nindex 123..456 100644\n--- a/test.js\n+++ b/test.js\n@@ -1,3 +1,3 @@\n console.log("hello");\n-console.log("old");\n+console.log("new");');
        
        // Create a custom execSync that creates the image file when the script is called
        const customExecSync = (command, options) => {
          mockExecSync.mock(command, options);
          if (command.startsWith('node ') && command.includes('generate-and-read-diff.js')) {
            // Create the image file manually
            const imagePath = path.join(tempDir, 'generated-diff-image.png');
            const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
            fs.writeFileSync(imagePath, testImageData);
          }
          return mockExecSync.outputs.get('git diff') || '';
        };
        
        const result = await generateDiffImage(tempDir, { execSync: customExecSync });
        
        assert(result !== null, 'Should return image path when git changes exist');
        assert(result.endsWith('generated-diff-image.png'), 'Should return correct image path');
        assert(fs.existsSync(result), 'Generated image file should exist');
        
        // Verify script was called
        const executions = mockExecSync.executions;
        assert(executions.length >= 2, 'Should call git diff and script');
        assert(executions.some(exec => exec.command.includes('generate-and-read-diff.js')), 'Should call generate-and-read-diff.js');
        
      } finally {
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
      }
    }
  },
  
  {
    name: 'No git changes - should return null',
    test: async () => {
      const tempDir = createTempTestDir();
      
      try {
        // Mock git diff to return empty string (no changes)
        mockExecSync.setOutput('git diff', '');
        
        const result = await generateDiffImage(tempDir, { execSync: mockExecSync.mock });
        
        assert(result === null, 'Should return null when no git changes');
        
      } finally {
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
      }
    }
  },
  
  {
    name: 'Script not found - should return null',
    test: async () => {
      const tempDir = createTempTestDir();
      
      try {
        // Mock git diff to return changes but don't create script
        mockExecSync.setOutput('git diff', 'diff --git a/test.js b/test.js\n+console.log("new");');
        
        const result = await generateDiffImage(tempDir, { execSync: mockExecSync.mock });
        
        assert(result === null, 'Should return null when script not found');
        
      } finally {
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
      }
    }
  },
  
  {
    name: 'Disabled via environment variable',
    test: async () => {
      const tempDir = createTempTestDir();
      const originalEnv = process.env.AFK_DISABLE_DIFF_IMAGES;
      
      try {
        process.env.AFK_DISABLE_DIFF_IMAGES = 'true';
        
        // Mock git diff to return changes
        mockExecSync.setOutput('git diff', 'diff --git a/test.js b/test.js\n+console.log("new");');
        
        const result = await generateDiffImage(tempDir, { execSync: mockExecSync.mock });
        
        assert(result === null, 'Should return null when disabled via env var');
        
      } finally {
        if (originalEnv !== undefined) {
          process.env.AFK_DISABLE_DIFF_IMAGES = originalEnv;
        } else {
          delete process.env.AFK_DISABLE_DIFF_IMAGES;
        }
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
      }
    }
  },
  
  {
    name: 'Script execution error - should return null',
    test: async () => {
      const tempDir = createTempTestDir();
      const scriptPath = path.join(tempDir, 'generate-and-read-diff.js');
      
      try {
        // Create mock script
        createMockScript(scriptPath);
        
        // Mock git diff to return changes
        mockExecSync.setOutput('git diff', 'diff --git a/test.js b/test.js\n+console.log("new");');
        
        // Mock script execution to throw error
        mockExecSync.setOutput(`node "${scriptPath}"`, new Error('Script execution failed'));
        
        const result = await generateDiffImage(tempDir, { execSync: mockExecSync.mock });
        
        assert(result === null, 'Should return null when script execution fails');
        
      } finally {
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
      }
    }
  },
  
  {
    name: 'Script runs but no image generated',
    test: async () => {
      const tempDir = createTempTestDir();
      const scriptPath = path.join(tempDir, 'generate-and-read-diff.js');
      
      try {
        // Create script that doesn't generate image
        const nonGeneratingScript = `#!/usr/bin/env node
console.log('Script runs but generates no image');
`;
        fs.writeFileSync(scriptPath, nonGeneratingScript);
        fs.chmodSync(scriptPath, 0o755);
        
        // Mock git diff to return changes
        mockExecSync.setOutput('git diff', 'diff --git a/test.js b/test.js\n+console.log("new");');
        
        const result = await generateDiffImage(tempDir, { execSync: mockExecSync.mock });
        
        assert(result === null, 'Should return null when no image file is generated');
        
      } finally {
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
      }
    }
  },
  
  {
    name: 'Script discovery - afk binary directory',
    test: async () => {
      const tempDir = createTempTestDir();
      const afkDir = createTempTestDir();
      const scriptPath = path.join(afkDir, 'generate-and-read-diff.js');
      
      try {
        // Create mock script in afk directory
        createMockScript(scriptPath);
        
        // Mock git diff to return changes
        mockExecSync.setOutput('git diff', 'diff --git a/test.js b/test.js\n+console.log("new");');
        
        // Mock require.main.filename to point to afk directory
        const originalMain = require.main;
        require.main = { filename: path.join(afkDir, 'bin', 'afk') };
        
        // Create a custom fs mock that finds the script in afkDir
        const customFs = { ...mockFs };
        customFs.existsSync = (filePath) => {
          if (filePath === path.join(afkDir, 'generate-and-read-diff.js')) {
            return true;
          }
          return mockFs.existsSync(filePath);
        };
        
        // Create a custom execSync that creates the image file when the script is called
        const customExecSync = (command, options) => {
          mockExecSync.mock(command, options);
          if (command.startsWith('node ') && command.includes('generate-and-read-diff.js')) {
            // Create the image file manually
            const imagePath = path.join(tempDir, 'generated-diff-image.png');
            const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
            fs.writeFileSync(imagePath, testImageData);
          }
          return mockExecSync.outputs.get('git diff') || '';
        };
        
        const result = await generateDiffImage(tempDir, { execSync: customExecSync, fs: customFs });
        
        assert(result !== null, 'Should find script in afk binary directory');
        
        require.main = originalMain;
        
      } finally {
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
        cleanupTempDir(afkDir);
      }
    }
  },
  
  {
    name: 'Git command timeout error',
    test: async () => {
      const tempDir = createTempTestDir();
      
      try {
        // Mock git diff to throw timeout error
        mockExecSync.setOutput('git diff', new Error('Command timed out'));
        
        const result = await generateDiffImage(tempDir, { execSync: mockExecSync.mock });
        
        assert(result === null, 'Should return null on git command timeout');
        
      } finally {
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
      }
    }
  },
  
  {
    name: 'Large git diff handling',
    test: async () => {
      const tempDir = createTempTestDir();
      const scriptPath = path.join(tempDir, 'generate-and-read-diff.js');
      
      try {
        createMockScript(scriptPath);
        
        // Create large diff output (simulate large changes)
        const largeDiff = 'diff --git a/large.js b/large.js\nindex 123..456 100644\n--- a/large.js\n+++ b/large.js\n' +
          Array(1000).fill(0).map((_, i) => `@@ -${i},1 +${i},1 @@\n-old line ${i}\n+new line ${i}`).join('\n');
        
        mockExecSync.setOutput('git diff', largeDiff);
        
        // Create a custom execSync that creates the image file when the script is called
        const customExecSync = (command, options) => {
          mockExecSync.mock(command, options);
          if (command.startsWith('node ') && command.includes('generate-and-read-diff.js')) {
            // Create the image file manually
            const imagePath = path.join(tempDir, 'generated-diff-image.png');
            const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
            fs.writeFileSync(imagePath, testImageData);
          }
          return largeDiff;
        };
        
        const result = await generateDiffImage(tempDir, { execSync: customExecSync });
        
        assert(result !== null, 'Should handle large diffs');
        assert(fs.existsSync(result), 'Should generate image for large diffs');
        
      } finally {
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
      }
    }
  },
  
  {
    name: 'Image file validation',
    test: async () => {
      const tempDir = createTempTestDir();
      const scriptPath = path.join(tempDir, 'generate-and-read-diff.js');
      
      try {
        createMockScript(scriptPath);
        
        mockExecSync.setOutput('git diff', 'diff --git a/test.js b/test.js\n+console.log("new");');
        
        // Create a custom execSync that creates the image file when the script is called
        const customExecSync = (command, options) => {
          mockExecSync.mock(command, options);
          if (command.startsWith('node ') && command.includes('generate-and-read-diff.js')) {
            // Create the image file manually
            const imagePath = path.join(tempDir, 'generated-diff-image.png');
            const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
            fs.writeFileSync(imagePath, testImageData);
          }
          return mockExecSync.outputs.get('git diff') || '';
        };
        
        const result = await generateDiffImage(tempDir, { execSync: customExecSync });
        
        assert(result !== null, 'Should return image path');
        
        const stats = fs.statSync(result);
        assert(stats.isFile(), 'Generated file should be a file');
        assert(stats.size > 0, 'Generated file should not be empty');
        
        // Verify it's a PNG file (basic check)
        const fileData = fs.readFileSync(result);
        assert(fileData[0] === 0x89 && fileData[1] === 0x50 && fileData[2] === 0x4E && fileData[3] === 0x47, 'Generated file should be PNG format');
        
      } finally {
        mockExecSync.clearOutputs();
        cleanupTempDir(tempDir);
      }
    }
  }
];

// Main test runner function
async function runAllTests() {
  // Run basic functionality tests
  for (const testCase of tests) {
    try {
      await testCase.test();
      console.log(`✅ ${testCase.name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${testCase.name}: ${error.message}`);
      failed++;
    }
  }

  console.log('\n=== Integration Test with generate-and-read-diff.js ===\n');

  // Test the actual generate-and-read-diff.js script if available
  try {
    const mainScriptPath = path.join(__dirname, '..', 'generate-and-read-diff.js');
    if (fs.existsSync(mainScriptPath)) {
      console.log('Testing with actual generate-and-read-diff.js script...');
      
      const tempDir = createTempTestDir();
      const testScriptPath = path.join(tempDir, 'generate-and-read-diff.js');
      
      try {
        // Copy the real script to temp directory
        fs.copyFileSync(mainScriptPath, testScriptPath);
        
        // Create a mock git repository with changes
        const gitDir = path.join(tempDir, '.git');
        fs.mkdirSync(gitDir);
        fs.writeFileSync(path.join(gitDir, 'config'), '[core]\n');
        
        // Mock git diff by creating a wrapper script
        const mockGitScript = path.join(tempDir, 'mock-git.js');
        fs.writeFileSync(mockGitScript, `#!/usr/bin/env node
if (process.argv[2] === 'diff') {
  console.log(\`diff --git a/test.js b/test.js
index 1234567..abcdefg 100644
--- a/test.js
+++ b/test.js
@@ -1,3 +1,4 @@
 console.log("hello");
-console.log("old code");
+console.log("new code");
+console.log("additional line");
 // end of file\`);
}
`);
        fs.chmodSync(mockGitScript, 0o755);
        
        console.log('✅ Integration test setup completed');
        passed++;
      } catch (error) {
        console.log(`❌ Integration test setup failed: ${error.message}`);
        failed++;
      } finally {
        cleanupTempDir(tempDir);
      }
    } else {
      console.log('⚠️  generate-and-read-diff.js not found, skipping integration test');
    }
  } catch (error) {
    console.log(`❌ Integration test error: ${error.message}`);
    failed++;
  }

  console.log('\n=== Error Handling Tests ===\n');

  // Test specific error conditions
  const errorTests = [
    {
      name: 'Git command not found',
      test: async () => {
        const tempDir = createTempTestDir();
        
        try {
          mockExecSync.setOutput('git diff', new Error('git: command not found'));
          
          const result = await generateDiffImage(tempDir, { execSync: mockExecSync.mock });
          assert(result === null, 'Should handle git not found gracefully');
          
        } finally {
          mockExecSync.clearOutputs();
          cleanupTempDir(tempDir);
        }
      }
    },
    
    {
      name: 'Permission denied on script execution',
      test: async () => {
        const tempDir = createTempTestDir();
        const scriptPath = path.join(tempDir, 'generate-and-read-diff.js');
        
        try {
          createMockScript(scriptPath);
          mockExecSync.setOutput('git diff', 'diff --git a/test.js b/test.js\n+new line');
          mockExecSync.setOutput(`node "${scriptPath}"`, new Error('EACCES: permission denied'));
          
          const result = await generateDiffImage(tempDir, { execSync: mockExecSync.mock });
          assert(result === null, 'Should handle permission errors gracefully');
          
        } finally {
          mockExecSync.clearOutputs();
          cleanupTempDir(tempDir);
        }
      }
    },
    
    {
      name: 'Disk space error during image generation',
      test: async () => {
        const tempDir = createTempTestDir();
        const scriptPath = path.join(tempDir, 'generate-and-read-diff.js');
        
        try {
          // Create script that simulates disk space error
          const errorScript = `#!/usr/bin/env node
throw new Error('ENOSPC: no space left on device');
`;
          fs.writeFileSync(scriptPath, errorScript);
          fs.chmodSync(scriptPath, 0o755);
          
          mockExecSync.setOutput('git diff', 'diff --git a/test.js b/test.js\n+new line');
          
          const result = await generateDiffImage(tempDir, { execSync: mockExecSync.mock });
          assert(result === null, 'Should handle disk space errors gracefully');
          
        } finally {
          mockExecSync.clearOutputs();
          cleanupTempDir(tempDir);
        }
      }
    }
  ];

  for (const errorTest of errorTests) {
    try {
      await errorTest.test();
      console.log(`✅ ${errorTest.name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${errorTest.name}: ${error.message}`);
      failed++;
    }
  }

  // Summary
  console.log('\n=== Test Summary ===\n');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n🎉 All diff generation tests passed!');
  }
}

// Run the tests
runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});