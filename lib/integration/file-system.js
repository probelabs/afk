/**
 * File System Integration Module
 * 
 * Provides file system operations with error handling, atomic operations,
 * and JSON/JSONL file management for the AFK application.
 * 
 * Includes both class-based and functional exports for backward compatibility.
 */

const fs = require('fs');
const path = require('path');

/**
 * File System Service Class
 * Handles all file system operations with proper error handling and atomic operations
 */
class FileSystemService {
  constructor(configManager, logger, utils) {
    this.configManager = configManager;
    this.logger = logger;
    this.utils = utils;
  }

  /**
   * Read JSON file with error handling
   * @param {string} filePath - Path to JSON file
   * @param {*} defaultValue - Default value if file doesn't exist or is invalid
   * @returns {*} Parsed JSON or default value
   */
  readJsonFile(filePath, defaultValue = {}) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (e) {
      this.logger.eprint(`[fs] Failed to read JSON file ${filePath}: ${e.message}`);
      if (this.logger.debugLog) {
        this.logger.debugLog('FILE_READ_ERROR', 'JSON file read failed', {
          filePath,
          error: e.message
        });
      }
    }
    return defaultValue;
  }

  /**
   * Write JSON file atomically
   * @param {string} filePath - Path to write file
   * @param {*} obj - Object to write as JSON
   * @param {Object} options - Write options
   * @param {number} options.spaces - Number of spaces for pretty printing (default: 2)
   */
  writeJsonFile(filePath, obj, options = {}) {
    const { spaces = 2 } = options;
    
    try {
      this.ensureDirectoryExists(path.dirname(filePath));
      
      // Use atomic write with temporary file
      const tmpPath = filePath + '.tmp';
      const content = JSON.stringify(obj, null, spaces);
      
      fs.writeFileSync(tmpPath, content, 'utf8');
      fs.renameSync(tmpPath, filePath);
      
      if (this.logger.debugLog) {
        this.logger.debugLog('FILE_WRITE', 'JSON file written successfully', {
          filePath,
          size: content.length
        });
      }
    } catch (e) {
      this.logger.eprint(`[fs] Failed to write JSON file ${filePath}: ${e.message}`);
      if (this.logger.debugLog) {
        this.logger.debugLog('FILE_WRITE_ERROR', 'JSON file write failed', {
          filePath,
          error: e.message
        });
      }
      throw e;
    }
  }

  /**
   * Read JSONL (JSON Lines) file
   * @param {string} filePath - Path to JSONL file
   * @param {Function} filterFn - Optional filter function
   * @returns {Array<Object>} Array of parsed JSON objects
   */
  readJsonLines(filePath, filterFn = null) {
    const entries = [];
    
    try {
      if (!fs.existsSync(filePath)) {
        return entries;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (!filterFn || filterFn(entry)) {
            entries.push(entry);
          }
        } catch (lineError) {
          this.logger.eprint(`[fs] Failed to parse JSONL line: ${lineError.message}`);
        }
      }
      
      if (this.logger.debugLog) {
        this.logger.debugLog('JSONL_READ', 'JSONL file read successfully', {
          filePath,
          totalLines: lines.length,
          validEntries: entries.length
        });
      }
      
    } catch (e) {
      this.logger.eprint(`[fs] Failed to read JSONL file ${filePath}: ${e.message}`);
      if (this.logger.debugLog) {
        this.logger.debugLog('JSONL_READ_ERROR', 'JSONL file read failed', {
          filePath,
          error: e.message
        });
      }
    }
    
    return entries;
  }

  /**
   * Write JSONL (JSON Lines) file
   * @param {string} filePath - Path to JSONL file
   * @param {Array<Object>} entries - Array of objects to write
   * @param {Object} options - Write options
   * @param {boolean} options.append - Whether to append to existing file (default: false)
   * @param {number} options.maxLines - Maximum lines to keep (for rotation)
   */
  writeJsonLines(filePath, entries, options = {}) {
    const { append = false, maxLines = null } = options;
    
    try {
      this.ensureDirectoryExists(path.dirname(filePath));
      
      const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      
      if (append) {
        fs.appendFileSync(filePath, newContent);
        
        // Handle rotation if maxLines is specified
        if (maxLines && fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.trim().split('\n').filter(Boolean);
          
          if (lines.length > maxLines * 2) { // Rotate when double the limit
            const trimmed = lines.slice(-maxLines).join('\n') + '\n';
            fs.writeFileSync(filePath, trimmed);
            
            if (this.logger.debugLog) {
              this.logger.debugLog('JSONL_ROTATE', 'JSONL file rotated', {
                filePath,
                oldLines: lines.length,
                newLines: maxLines
              });
            }
          }
        }
      } else {
        fs.writeFileSync(filePath, newContent);
      }
      
      if (this.logger.debugLog) {
        this.logger.debugLog('JSONL_WRITE', 'JSONL file written successfully', {
          filePath,
          entries: entries.length,
          append
        });
      }
      
    } catch (e) {
      this.logger.eprint(`[fs] Failed to write JSONL file ${filePath}: ${e.message}`);
      if (this.logger.debugLog) {
        this.logger.debugLog('JSONL_WRITE_ERROR', 'JSONL file write failed', {
          filePath,
          error: e.message
        });
      }
      throw e;
    }
  }

  /**
   * Append single entry to JSONL file
   * @param {string} filePath - Path to JSONL file
   * @param {Object} entry - Entry to append
   * @param {Object} options - Append options
   * @param {number} options.maxLines - Maximum lines to keep (for rotation)
   */
  appendJsonLine(filePath, entry, options = {}) {
    const { maxLines = null } = options;
    
    try {
      this.ensureDirectoryExists(path.dirname(filePath));
      
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(filePath, line);
      
      // Handle rotation if needed
      if (maxLines && Math.random() < 0.1) { // 10% chance to check for rotation
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        
        if (lines.length > maxLines * 2) {
          const trimmed = lines.slice(-maxLines).join('\n') + '\n';
          fs.writeFileSync(filePath, trimmed);
          
          if (this.logger.debugLog) {
            this.logger.debugLog('JSONL_ROTATE', 'JSONL file rotated during append', {
              filePath,
              oldLines: lines.length,
              newLines: maxLines
            });
          }
        }
      }
      
    } catch (e) {
      this.logger.eprint(`[fs] Failed to append to JSONL file ${filePath}: ${e.message}`);
      throw e;
    }
  }

  /**
   * Ensure directory exists, creating it if necessary
   * @param {string} dirPath - Directory path to ensure exists
   */
  ensureDirectoryExists(dirPath) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (e) {
      if (e.code !== 'EEXIST') {
        this.logger.eprint(`[fs] Failed to create directory ${dirPath}: ${e.message}`);
        throw e;
      }
    }
  }

  /**
   * Get absolute file path, resolving relative paths
   * @param {string} filePath - File path (relative or absolute)
   * @param {string} basePath - Base path for relative paths (default: cwd)
   * @returns {string} Absolute file path
   */
  getFilePath(filePath, basePath = process.cwd()) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(basePath, filePath);
  }

  /**
   * Clean up old files in a directory based on age or count
   * @param {string} dirPath - Directory to clean up
   * @param {Object} options - Cleanup options
   * @param {number} options.maxAge - Maximum age in milliseconds
   * @param {number} options.maxFiles - Maximum number of files to keep
   * @param {RegExp} options.pattern - File pattern to match (default: all files)
   */
  cleanupOldFiles(dirPath, options = {}) {
    const { maxAge = null, maxFiles = null, pattern = null } = options;
    
    try {
      if (!fs.existsSync(dirPath)) {
        return;
      }
      
      const files = fs.readdirSync(dirPath)
        .map(name => ({
          name,
          path: path.join(dirPath, name),
          stat: fs.statSync(path.join(dirPath, name))
        }))
        .filter(file => file.stat.isFile())
        .filter(file => !pattern || pattern.test(file.name));
      
      let filesToDelete = [];
      
      // Filter by age
      if (maxAge) {
        const cutoff = Date.now() - maxAge;
        filesToDelete = files.filter(file => file.stat.mtime.getTime() < cutoff);
      }
      
      // Filter by count (keep newest)
      if (maxFiles && files.length > maxFiles) {
        const sorted = files.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());
        const toDelete = sorted.slice(maxFiles);
        filesToDelete = filesToDelete.concat(toDelete);
      }
      
      // Remove duplicates
      const uniqueFiles = [...new Set(filesToDelete.map(f => f.path))];
      
      let deletedCount = 0;
      for (const filePath of uniqueFiles) {
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (deleteError) {
          this.logger.eprint(`[fs] Failed to delete file ${filePath}: ${deleteError.message}`);
        }
      }
      
      if (deletedCount > 0 && this.logger.debugLog) {
        this.logger.debugLog('CLEANUP', 'Files cleaned up', {
          dirPath,
          deletedCount,
          totalFiles: files.length
        });
      }
      
    } catch (e) {
      this.logger.eprint(`[fs] Failed to cleanup directory ${dirPath}: ${e.message}`);
    }
  }

  /**
   * Acquire file lock (simple implementation using exclusive file creation)
   * @param {string} lockPath - Path to lock file
   * @param {Object} options - Lock options
   * @param {number} options.timeout - Timeout in milliseconds (default: 1000)
   * @param {number} options.retryInterval - Retry interval in milliseconds (default: 10)
   * @returns {Function} Release function
   */
  acquireFileLock(lockPath, options = {}) {
    const { timeout = 1000, retryInterval = 10 } = options;
    const startTime = Date.now();
    const lockContent = `${process.pid}:${Date.now()}`;
    
    while (Date.now() - startTime < timeout) {
      try {
        // Try to create lock file exclusively
        fs.writeFileSync(lockPath, lockContent, { flag: 'wx' });
        
        // Successfully acquired lock
        if (this.logger.debugLog) {
          this.logger.debugLog('FILE_LOCK', 'Lock acquired', { lockPath });
        }
        
        return () => {
          try {
            if (fs.existsSync(lockPath)) {
              const content = fs.readFileSync(lockPath, 'utf8');
              if (content === lockContent) {
                fs.unlinkSync(lockPath);
                if (this.logger.debugLog) {
                  this.logger.debugLog('FILE_LOCK', 'Lock released', { lockPath });
                }
              }
            }
          } catch (releaseError) {
            this.logger.eprint(`[fs] Failed to release lock ${lockPath}: ${releaseError.message}`);
          }
        };
      } catch (e) {
        if (e.code === 'EEXIST') {
          // Lock exists, wait and retry
          const start = Date.now();
          while (Date.now() - start < retryInterval) { /* busy wait */ }
          continue;
        }
        throw e; // Other error
      }
    }
    
    throw new Error(`Failed to acquire file lock ${lockPath} after ${timeout}ms`);
  }

  /**
   * Check if file exists
   * @param {string} filePath - Path to check
   * @returns {boolean} Whether file exists
   */
  fileExists(filePath) {
    try {
      return fs.existsSync(filePath);
    } catch (e) {
      return false;
    }
  }

  /**
   * Get file stats
   * @param {string} filePath - Path to file
   * @returns {Object|null} File stats or null if not found
   */
  getFileStats(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.statSync(filePath);
      }
    } catch (e) {
      this.logger.eprint(`[fs] Failed to get stats for ${filePath}: ${e.message}`);
    }
    return null;
  }

  /**
   * Read file as string
   * @param {string} filePath - Path to file
   * @param {string} encoding - File encoding (default: 'utf8')
   * @returns {string|null} File content or null if not found
   */
  readFile(filePath, encoding = 'utf8') {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, encoding);
      }
    } catch (e) {
      this.logger.eprint(`[fs] Failed to read file ${filePath}: ${e.message}`);
    }
    return null;
  }

  /**
   * Write file with atomic operation
   * @param {string} filePath - Path to write
   * @param {string} content - Content to write
   * @param {string} encoding - File encoding (default: 'utf8')
   */
  writeFile(filePath, content, encoding = 'utf8') {
    try {
      this.ensureDirectoryExists(path.dirname(filePath));
      
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, content, encoding);
      fs.renameSync(tmpPath, filePath);
      
    } catch (e) {
      this.logger.eprint(`[fs] Failed to write file ${filePath}: ${e.message}`);
      throw e;
    }
  }

  /**
   * Append to file
   * @param {string} filePath - Path to file
   * @param {string} content - Content to append
   * @param {string} encoding - File encoding (default: 'utf8')
   */
  appendFile(filePath, content, encoding = 'utf8') {
    try {
      this.ensureDirectoryExists(path.dirname(filePath));
      fs.appendFileSync(filePath, content, encoding);
    } catch (e) {
      this.logger.eprint(`[fs] Failed to append to file ${filePath}: ${e.message}`);
      throw e;
    }
  }

  /**
   * Delete file if it exists
   * @param {string} filePath - Path to file
   * @returns {boolean} Whether file was deleted
   */
  deleteFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    } catch (e) {
      this.logger.eprint(`[fs] Failed to delete file ${filePath}: ${e.message}`);
    }
    return false;
  }
}

// Functional exports for backward compatibility

function readJsonFile(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`[fs] Failed to read ${filePath}: ${e.message}`);
  }
  return defaultValue;
}

function writeJsonFile(filePath, obj, spaces = 2) {
  try {
    ensureDirectoryExists(path.dirname(filePath));
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, spaces));
    fs.renameSync(tmp, filePath);
  } catch (e) {
    console.error(`[fs] Failed to write ${filePath}: ${e.message}`);
    throw e;
  }
}

function readJsonLines(filePath, filterFn = null) {
  const entries = [];
  try {
    if (!fs.existsSync(filePath)) return entries;
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (!filterFn || filterFn(entry)) {
          entries.push(entry);
        }
      } catch (lineError) {
        console.error(`[fs] Failed to parse line: ${lineError.message}`);
      }
    }
  } catch (e) {
    console.error(`[fs] Failed to read JSONL ${filePath}: ${e.message}`);
  }
  return entries;
}

function writeJsonLines(filePath, entries, append = false) {
  try {
    ensureDirectoryExists(path.dirname(filePath));
    const content = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    
    if (append) {
      fs.appendFileSync(filePath, content);
    } else {
      fs.writeFileSync(filePath, content);
    }
  } catch (e) {
    console.error(`[fs] Failed to write JSONL ${filePath}: ${e.message}`);
    throw e;
  }
}

function appendJsonLine(filePath, entry) {
  try {
    ensureDirectoryExists(path.dirname(filePath));
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error(`[fs] Failed to append to ${filePath}: ${e.message}`);
    throw e;
  }
}

function ensureDirectoryExists(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getFilePath(filePath, basePath = process.cwd()) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(basePath, filePath);
}

function cleanupOldFiles(dirPath, options = {}) {
  const { maxAge = null, maxFiles = null, pattern = null } = options;
  
  try {
    if (!fs.existsSync(dirPath)) return;
    
    const files = fs.readdirSync(dirPath)
      .map(name => ({
        name,
        path: path.join(dirPath, name),
        stat: fs.statSync(path.join(dirPath, name))
      }))
      .filter(file => file.stat.isFile())
      .filter(file => !pattern || pattern.test(file.name));
    
    let filesToDelete = [];
    
    if (maxAge) {
      const cutoff = Date.now() - maxAge;
      filesToDelete = files.filter(file => file.stat.mtime.getTime() < cutoff);
    }
    
    if (maxFiles && files.length > maxFiles) {
      const sorted = files.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());
      filesToDelete = filesToDelete.concat(sorted.slice(maxFiles));
    }
    
    const uniqueFiles = [...new Set(filesToDelete.map(f => f.path))];
    
    for (const filePath of uniqueFiles) {
      try {
        fs.unlinkSync(filePath);
      } catch (deleteError) {
        console.error(`[fs] Failed to delete ${filePath}: ${deleteError.message}`);
      }
    }
  } catch (e) {
    console.error(`[fs] Failed to cleanup ${dirPath}: ${e.message}`);
  }
}

module.exports = {
  FileSystemService,
  // Functional exports
  readJsonFile,
  writeJsonFile,
  readJsonLines,
  writeJsonLines,
  appendJsonLine,
  ensureDirectoryExists,
  getFilePath,
  cleanupOldFiles
};