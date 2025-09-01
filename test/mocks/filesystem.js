#!/usr/bin/env node
// Centralized file system mocking for AFK tests
// Provides in-memory file system simulation with proper error handling

const fs = require('fs');
const path = require('path');
const os = require('os');

class FileSystemMock {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
    this.originalFs = {};
    this.isActive = false;
  }

  // Activate the mock system
  activate() {
    if (this.isActive) return;

    this.isActive = true;
    
    // Store original functions
    this.originalFs.existsSync = fs.existsSync;
    this.originalFs.readFileSync = fs.readFileSync;
    this.originalFs.writeFileSync = fs.writeFileSync;
    this.originalFs.mkdirSync = fs.mkdirSync;
    this.originalFs.unlinkSync = fs.unlinkSync;
    this.originalFs.statSync = fs.statSync;
    this.originalFs.renameSync = fs.renameSync;

    const self = this;

    // Mock fs.existsSync
    fs.existsSync = function(filePath) {
      const normalizedPath = path.normalize(filePath);
      return self.files.has(normalizedPath) || self.directories.has(normalizedPath);
    };

    // Mock fs.readFileSync
    fs.readFileSync = function(filePath, encoding) {
      const normalizedPath = path.normalize(filePath);
      if (!self.files.has(normalizedPath)) {
        const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
        error.code = 'ENOENT';
        error.errno = -2;
        error.syscall = 'open';
        error.path = filePath;
        throw error;
      }

      const content = self.files.get(normalizedPath);
      return encoding === 'utf8' ? content : Buffer.from(content);
    };

    // Mock fs.writeFileSync
    fs.writeFileSync = function(filePath, data, options) {
      const normalizedPath = path.normalize(filePath);
      const dirPath = path.dirname(normalizedPath);
      
      // Ensure directory exists
      if (!self.directories.has(dirPath)) {
        const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
        error.code = 'ENOENT';
        error.errno = -2;
        error.syscall = 'open';
        error.path = filePath;
        throw error;
      }

      const content = Buffer.isBuffer(data) ? data.toString() : String(data);
      self.files.set(normalizedPath, content);
    };

    // Mock fs.mkdirSync
    fs.mkdirSync = function(dirPath, options) {
      const normalizedPath = path.normalize(dirPath);
      
      if (options && options.recursive) {
        // Create all parent directories
        const parts = normalizedPath.split(path.sep);
        let currentPath = parts[0] || path.sep;
        
        for (let i = 1; i < parts.length; i++) {
          if (parts[i]) {
            currentPath = path.join(currentPath, parts[i]);
            self.directories.add(currentPath);
          }
        }
      } else {
        const parentDir = path.dirname(normalizedPath);
        if (!self.directories.has(parentDir) && parentDir !== normalizedPath) {
          const error = new Error(`ENOENT: no such file or directory, mkdir '${dirPath}'`);
          error.code = 'ENOENT';
          error.errno = -2;
          error.syscall = 'mkdir';
          error.path = dirPath;
          throw error;
        }
        
        if (self.directories.has(normalizedPath)) {
          const error = new Error(`EEXIST: file already exists, mkdir '${dirPath}'`);
          error.code = 'EEXIST';
          error.errno = -17;
          error.syscall = 'mkdir';
          error.path = dirPath;
          throw error;
        }
        
        self.directories.add(normalizedPath);
      }
    };

    // Mock fs.unlinkSync
    fs.unlinkSync = function(filePath) {
      const normalizedPath = path.normalize(filePath);
      if (!self.files.has(normalizedPath)) {
        const error = new Error(`ENOENT: no such file or directory, unlink '${filePath}'`);
        error.code = 'ENOENT';
        error.errno = -2;
        error.syscall = 'unlink';
        error.path = filePath;
        throw error;
      }
      
      self.files.delete(normalizedPath);
    };

    // Mock fs.statSync
    fs.statSync = function(filePath) {
      const normalizedPath = path.normalize(filePath);
      
      if (!self.files.has(normalizedPath) && !self.directories.has(normalizedPath)) {
        const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
        error.code = 'ENOENT';
        error.errno = -2;
        error.syscall = 'stat';
        error.path = filePath;
        throw error;
      }

      const isFile = self.files.has(normalizedPath);
      const content = isFile ? self.files.get(normalizedPath) : '';
      
      return {
        isFile: () => isFile,
        isDirectory: () => !isFile,
        size: isFile ? Buffer.byteLength(content, 'utf8') : 0,
        mtime: new Date(),
        ctime: new Date()
      };
    };

    // Mock fs.renameSync
    fs.renameSync = function(oldPath, newPath) {
      const oldNormalized = path.normalize(oldPath);
      const newNormalized = path.normalize(newPath);
      
      if (!self.files.has(oldNormalized)) {
        const error = new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
        error.code = 'ENOENT';
        error.errno = -2;
        error.syscall = 'rename';
        error.path = oldPath;
        error.dest = newPath;
        throw error;
      }
      
      const content = self.files.get(oldNormalized);
      self.files.delete(oldNormalized);
      self.files.set(newNormalized, content);
    };
  }

  // Deactivate the mock system
  deactivate() {
    if (!this.isActive) return;

    // Restore original functions
    fs.existsSync = this.originalFs.existsSync;
    fs.readFileSync = this.originalFs.readFileSync;
    fs.writeFileSync = this.originalFs.writeFileSync;
    fs.mkdirSync = this.originalFs.mkdirSync;
    fs.unlinkSync = this.originalFs.unlinkSync;
    fs.statSync = this.originalFs.statSync;
    fs.renameSync = this.originalFs.renameSync;

    this.isActive = false;
    this.clear();
  }

  // Add file to mock filesystem
  addFile(filePath, content = '') {
    const normalizedPath = path.normalize(filePath);
    const dirPath = path.dirname(normalizedPath);
    
    // Ensure parent directory exists
    this.addDirectory(dirPath);
    this.files.set(normalizedPath, String(content));
  }

  // Add directory to mock filesystem
  addDirectory(dirPath) {
    const normalizedPath = path.normalize(dirPath);
    
    // Add all parent directories
    const parts = normalizedPath.split(path.sep);
    let currentPath = parts[0] || path.sep;
    this.directories.add(currentPath);
    
    for (let i = 1; i < parts.length; i++) {
      if (parts[i]) {
        currentPath = path.join(currentPath, parts[i]);
        this.directories.add(currentPath);
      }
    }
  }

  // Remove file from mock filesystem
  removeFile(filePath) {
    const normalizedPath = path.normalize(filePath);
    this.files.delete(normalizedPath);
  }

  // Clear all files and directories
  clear() {
    this.files.clear();
    this.directories.clear();
  }

  // Get file content
  getFileContent(filePath) {
    const normalizedPath = path.normalize(filePath);
    return this.files.get(normalizedPath);
  }

  // Check if file exists
  hasFile(filePath) {
    const normalizedPath = path.normalize(filePath);
    return this.files.has(normalizedPath);
  }

  // Check if directory exists
  hasDirectory(dirPath) {
    const normalizedPath = path.normalize(dirPath);
    return this.directories.has(normalizedPath);
  }

  // Get all files
  getAllFiles() {
    return Object.fromEntries(this.files);
  }
}

// Configuration helpers for common AFK scenarios
function setupAfkConfig(fsMock, config = {}) {
  const homeDir = os.homedir();
  const afkDir = path.join(homeDir, '.afk');
  
  // Create AFK directory structure
  fsMock.addDirectory(afkDir);
  fsMock.addDirectory(path.join(afkDir, 'approvals'));
  
  // Default config
  const defaultConfig = {
    telegram_bot_token: 'test-bot-token',
    telegram_chat_id: '123456789',
    timeout_seconds: 3600,
    timeout_action: 'deny',
    intercept_matcher: 'Bash|Edit|Write|MultiEdit|WebFetch|mcp__.*',
    auto_approve_tools: ['Read', 'Grep', 'Glob', 'TodoWrite'],
    respect_claude_permissions: true,
    ...config
  };

  // Add config file
  fsMock.addFile(path.join(afkDir, 'config.json'), JSON.stringify(defaultConfig, null, 2));
  
  return { afkDir, config: defaultConfig };
}

function setupModeFile(fsMock, mode = 'remote') {
  const homeDir = os.homedir();
  const afkDir = path.join(homeDir, '.afk');
  fsMock.addFile(path.join(afkDir, 'mode'), mode);
}

function setupSessionFiles(fsMock) {
  const homeDir = os.homedir();
  const afkDir = path.join(homeDir, '.afk');
  
  // Empty session files
  fsMock.addFile(path.join(afkDir, 'session-map.json'), JSON.stringify({
    messages: {},
    latest_per_chat: {}
  }));
  
  fsMock.addFile(path.join(afkDir, 'active-sessions.json'), JSON.stringify({}));
}

function setupProjectDirectory(fsMock, projectPath) {
  const afkProjectDir = path.join(projectPath, '.afk');
  fsMock.addDirectory(afkProjectDir);
  
  // Add project config if needed
  const projectConfig = {
    project_name: 'Test Project'
  };
  
  fsMock.addFile(path.join(afkProjectDir, 'config.json'), JSON.stringify(projectConfig, null, 2));
  
  return { projectDir: afkProjectDir, config: projectConfig };
}

function addSampleImageFile(fsMock, imagePath, sizeKB = 100) {
  // Create a sample image file (PNG header + data)
  const pngHeader = '\x89PNG\r\n\x1a\n';
  const fakeImageData = 'X'.repeat((sizeKB * 1024) - pngHeader.length);
  fsMock.addFile(imagePath, pngHeader + fakeImageData);
}

module.exports = {
  FileSystemMock,
  setupAfkConfig,
  setupModeFile, 
  setupSessionFiles,
  setupProjectDirectory,
  addSampleImageFile
};