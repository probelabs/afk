#!/usr/bin/env node

// Generate diff image and keep it for reading
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

async function generateDiffForReading() {
  console.log('🎨 Generating diff image for direct reading...');
  
  try {
    const diff = execSync('git diff', { encoding: 'utf8', maxBuffer: 100000 }).trim();
    
    if (!diff) {
      console.log('❌ No git changes found');
      return null;
    }

    console.log(`✅ Found ${diff.length} characters of changes`);

    // Parse the diff to extract file changes
    const files = [];
    let currentFile = null;
    let additions = 0;
    let deletions = 0;
    let filesChanged = 0;
    
    const lines = diff.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          files.push(currentFile);
        }
        const match = line.match(/b\/(.+)$/);
        currentFile = {
          name: match ? match[1] : 'unknown',
          status: 'modified',
          chunks: [],
          currentChunk: null
        };
        filesChanged++;
      } else if (line.startsWith('new file')) {
        if (currentFile) currentFile.status = 'added';
      } else if (line.startsWith('deleted file')) {
        if (currentFile) currentFile.status = 'deleted';
      } else if (line.startsWith('@@')) {
        if (currentFile) {
          const chunk = {
            header: line,
            lines: []
          };
          currentFile.chunks.push(chunk);
          currentFile.currentChunk = chunk;
        }
      } else if (currentFile && currentFile.currentChunk) {
        let type = 'context';
        let content = line.substring(1);
        
        if (line.startsWith('+')) {
          type = 'add';
          additions++;
        } else if (line.startsWith('-')) {
          type = 'del';
          deletions++;
        }
        
        currentFile.currentChunk.lines.push({ type, content });
      }
    }
    
    if (currentFile) {
      files.push(currentFile);
    }

    // Smart diff limiting with line budgets
    const MAX_TOTAL_LINES = 200;
    const MAX_LINES_PER_FILE = 30;
    let totalLinesUsed = 0;
    const displayFiles = [];
    const skippedFiles = [];
    
    for (const file of files) {
      const totalFileLines = file.chunks.reduce((sum, chunk) => sum + chunk.lines.length, 0);
      
      if (totalLinesUsed + Math.min(totalFileLines, MAX_LINES_PER_FILE) <= MAX_TOTAL_LINES) {
        // We can show this file with diff content
        displayFiles.push(file);
        totalLinesUsed += Math.min(totalFileLines, MAX_LINES_PER_FILE);
      } else if (totalLinesUsed < MAX_TOTAL_LINES) {
        // We have some budget left but not enough for full file - show file summary only
        skippedFiles.push({ ...file, totalLines: totalFileLines, showSummaryOnly: true });
        break;
      } else {
        // No budget left - add to skipped files
        skippedFiles.push({ ...file, totalLines: totalFileLines, showSummaryOnly: false });
      }
    }
    
    // Generate the HTML rows for each file with line limiting
    const generateFileHtml = (file) => {
      let lineNum = 1;
      let rows = '';
      let linesInFile = 0;
      const maxLinesForThisFile = Math.min(MAX_LINES_PER_FILE, MAX_TOTAL_LINES - totalLinesUsed + MAX_LINES_PER_FILE);
      
      for (const chunk of file.chunks) {
        if (linesInFile >= maxLinesForThisFile) break;
        
        // Parse chunk header for line numbers
        const match = chunk.header.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)$/);
        if (match) {
          const oldStart = parseInt(match[1]);
          const newStart = parseInt(match[2]);
          const context = match[3] || '';
          lineNum = oldStart;
          
          rows += `
                    <tr class="diff-row line-chunk">
                        <td class="line-number">${chunk.header.split('@@')[1] + '@@'}</td>
                        <td class="line-content">${context.trim()}</td>
                    </tr>`;
          linesInFile++;
        }
        
        // Limit lines per chunk within file budget
        const remainingBudget = maxLinesForThisFile - linesInFile;
        const displayLines = chunk.lines.slice(0, remainingBudget);
        const truncated = chunk.lines.length > displayLines.length;
        
        displayLines.forEach(line => {
          const lineClass = `line-${line.type}`;
          const displayNum = line.type === 'del' ? lineNum : (line.type === 'add' ? lineNum : lineNum);
          
          rows += `
                    <tr class="diff-row ${lineClass}">
                        <td class="line-number">${displayNum}</td>
                        <td class="line-content">${escapeHtml(line.content)}</td>
                    </tr>`;
          
          if (line.type !== 'add') lineNum++;
          linesInFile++;
        });
        
        if (truncated) {
          const totalFileLines = file.chunks.reduce((sum, chunk) => sum + chunk.lines.length, 0);
          rows += `
                    <tr class="diff-row line-context">
                        <td class="line-number">...</td>
                        <td class="line-content">... (${totalFileLines - linesInFile} more lines)</td>
                    </tr>`;
          break;
        }
      }
      
      return rows;
    };
    
    const escapeHtml = (text) => {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, m => map[m]);
    };

    // Generate file cards HTML for displayed files
    const fileCardsHtml = displayFiles.map(file => {
      const badgeClass = file.status === 'added' ? 'badge-added' : 
                         file.status === 'deleted' ? 'badge-deleted' : 
                         'badge-modified';
      const badgeText = file.status.charAt(0).toUpperCase() + file.status.slice(1);
      
      const totalFileLines = file.chunks.reduce((sum, chunk) => sum + chunk.lines.length, 0);
      const hasLargeChanges = totalFileLines > MAX_LINES_PER_FILE;
      
      return `
        <!-- ${file.name} -->
        <div class="file-card">
            <div class="file-header">
                <div class="file-info">
                    <div class="file-icon">
                        <svg viewBox="0 0 24 24">
                            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                        </svg>
                    </div>
                    <span class="file-name">${file.name}</span>
                </div>
                <span class="file-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="diff-container">
                <table class="diff-table">
                    ${generateFileHtml(file)}
                </table>
            </div>
            ${hasLargeChanges ? `
            <div class="file-limit-notice">
                Large file - showing first ${MAX_LINES_PER_FILE} lines of ${totalFileLines} changes
            </div>` : ''}
        </div>`;
    }).join('\n');
    
    // Generate summary cards for skipped files
    const skippedCardsHtml = skippedFiles.map(file => {
      const badgeClass = file.status === 'added' ? 'badge-added' : 
                         file.status === 'deleted' ? 'badge-deleted' : 
                         'badge-modified';
      const badgeText = file.status.charAt(0).toUpperCase() + file.status.slice(1);
      
      return `
        <!-- ${file.name} (summary only) -->
        <div class="file-card">
            <div class="file-header">
                <div class="file-info">
                    <div class="file-icon">
                        <svg viewBox="0 0 24 24">
                            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                        </svg>
                    </div>
                    <span class="file-name">${file.name}</span>
                </div>
                <span class="file-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="file-limit-notice">
                ${file.status === 'added' ? `New file with ${file.totalLines} lines` :
                  file.status === 'deleted' ? `Deleted file with ${file.totalLines} lines` :
                  `${file.totalLines} lines changed`}
            </div>
        </div>`;
    }).join('\n');

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Diff Viewer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Text', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px 10px;
        }

        .container {
            max-width: 850px;
            margin: 0 auto;
        }

        .header {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
        }

        .header h1 {
            font-size: 28px;
            font-weight: 700;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 8px;
        }

        .header .stats {
            display: flex;
            gap: 20px;
            margin-top: 15px;
            flex-wrap: wrap;
        }

        .stat {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: #f8f9fa;
            border-radius: 100px;
            font-size: 14px;
            font-weight: 600;
        }

        .stat.additions {
            color: #22c55e;
            background: #dcfce7;
        }

        .stat.deletions {
            color: #ef4444;
            background: #fee2e2;
        }

        .stat.modified {
            color: #3b82f6;
            background: #dbeafe;
        }

        .file-card {
            background: white;
            border-radius: 16px;
            margin-bottom: 16px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .file-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
        }

        .file-header {
            background: linear-gradient(135deg, #f6f8fb 0%, #e9ecef 100%);
            padding: 18px 20px;
            border-bottom: 2px solid #e1e8ed;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
        }

        .file-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .file-icon {
            width: 36px;
            height: 36px;
            background: white;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .file-icon svg {
            width: 20px;
            height: 20px;
            fill: #6366f1;
        }

        .file-name {
            font-weight: 600;
            font-size: 16px;
            color: #1f2937;
            word-break: break-all;
        }

        .file-badge {
            padding: 6px 14px;
            border-radius: 100px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .badge-modified {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
        }

        .badge-deleted {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
        }

        .badge-added {
            background: linear-gradient(135deg, #22c55e, #16a34a);
            color: white;
        }

        .diff-container {
            overflow-x: auto;
            background: #fafbfc;
        }

        .diff-table {
            width: 100%;
            border-collapse: collapse;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.6;
        }

        .diff-row {
            transition: background-color 0.1s ease;
        }

        .diff-row:hover {
            background-color: rgba(59, 130, 246, 0.05) !important;
        }

        .line-number {
            width: 60px;
            padding: 8px 12px;
            text-align: right;
            background: #f6f8fa;
            color: #6b7280;
            border-right: 1px solid #e1e8ed;
            user-select: none;
            font-size: 13px;
            font-weight: 500;
            position: sticky;
            left: 0;
        }

        .line-content {
            padding: 8px 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: anywhere;
            position: relative;
            font-size: 14px;
        }

        /* Addition lines */
        .line-add {
            background: linear-gradient(90deg, #dcfce7 0%, #d1fae5 100%);
        }

        .line-add .line-number {
            background: #bbf7d0;
            color: #15803d;
            font-weight: 600;
        }

        .line-add .line-content::before {
            content: '+';
            position: absolute;
            left: 4px;
            color: #15803d;
            font-weight: 700;
        }

        .line-add .line-content {
            padding-left: 30px;
            color: #14532d;
        }

        /* Deletion lines */
        .line-del {
            background: linear-gradient(90deg, #fee2e2 0%, #fecaca 100%);
        }

        .line-del .line-number {
            background: #fecaca;
            color: #991b1b;
            font-weight: 600;
        }

        .line-del .line-content::before {
            content: '−';
            position: absolute;
            left: 4px;
            color: #991b1b;
            font-weight: 700;
        }

        .line-del .line-content {
            padding-left: 30px;
            color: #7f1d1d;
        }

        /* Context lines */
        .line-context {
            background: white;
        }

        .line-context .line-number {
            background: #f9fafb;
            color: #9ca3af;
        }

        .line-context .line-content {
            color: #374151;
            padding-left: 30px;
        }

        /* Chunk headers */
        .line-chunk {
            background: linear-gradient(90deg, #e0e7ff 0%, #c7d2fe 100%);
            font-weight: 600;
        }

        .line-chunk .line-number {
            background: #c7d2fe;
            color: #4338ca;
        }

        .line-chunk .line-content {
            color: #312e81;
            padding-left: 16px;
            font-size: 12px;
        }

        /* File limit indicator */
        .file-limit-notice {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            padding: 16px;
            text-align: center;
            color: #92400e;
            font-weight: 600;
            font-size: 14px;
            border-radius: 0 0 16px 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .file-limit-notice::before {
            content: '⚠️';
            font-size: 18px;
        }

        /* Mobile optimizations */
        @media (max-width: 640px) {
            body {
                padding: 15px 8px;
            }

            .header {
                padding: 20px 15px;
                border-radius: 16px;
            }

            .header h1 {
                font-size: 24px;
            }

            .stat {
                padding: 6px 12px;
                font-size: 13px;
            }

            .file-header {
                padding: 14px 15px;
            }

            .file-name {
                font-size: 14px;
            }

            .file-badge {
                padding: 4px 10px;
                font-size: 11px;
            }

            .diff-table {
                font-size: 12px;
            }

            .line-number {
                width: 40px;
                padding: 4px 6px;
                font-size: 11px;
            }

            .line-content {
                padding: 4px 12px;
            }

            .line-add .line-content,
            .line-del .line-content,
            .line-context .line-content {
                padding-left: 20px;
            }
        }

        /* Loading animation */
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .file-card {
            animation: fadeIn 0.5s ease-out;
        }

        .file-card:nth-child(2) {
            animation-delay: 0.1s;
        }

        .file-card:nth-child(3) {
            animation-delay: 0.2s;
        }

        .file-card:nth-child(4) {
            animation-delay: 0.3s;
        }

        /* Scrollbar styling */
        .diff-container::-webkit-scrollbar {
            height: 8px;
        }

        .diff-container::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
        }

        .diff-container::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
        }

        .diff-container::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Git Diff Summary</h1>
            <div class="stats">
                <div class="stat additions">
                    <span>+</span>
                    <span>${additions} additions</span>
                </div>
                <div class="stat deletions">
                    <span>−</span>
                    <span>${deletions} deletions</span>
                </div>
                <div class="stat modified">
                    <span>●</span>
                    <span>${filesChanged} files changed</span>
                </div>
            </div>
        </div>

        ${fileCardsHtml}
        ${skippedCardsHtml}
        
        ${skippedFiles.length > 0 ? `
        <div class="file-card">
            <div class="file-limit-notice">
                Showing detailed diff for ${displayFiles.length} files, summaries for ${skippedFiles.length} files (${MAX_TOTAL_LINES} line limit reached)
            </div>
        </div>` : ''}
    </div>
</body>
</html>`;

    // Create persistent image path in current directory  
    const imagePath = path.join(process.cwd(), 'generated-diff-image.png');

    const puppeteer = require('puppeteer-core');
    
    const chromiumPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      process.env.CHROME_EXECUTABLE_PATH
    ].filter(Boolean);

    let executablePath = null;
    for (const chromePath of chromiumPaths) {
      if (fs.existsSync(chromePath)) {
        executablePath = chromePath;
        break;
      }
    }

    if (!executablePath) {
      throw new Error('No Chrome found');
    }

    console.log('🚀 Generating image with Puppeteer...');

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 900, height: 1400, deviceScaleFactor: 2 });
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      
      const dimensions = await page.evaluate(() => {
        const body = document.body;
        const container = document.querySelector('.container');
        return {
          width: container ? container.scrollWidth : body.scrollWidth,
          height: body.scrollHeight
        };
      });
      
      console.log(`📐 Image dimensions: ${dimensions.width}x${dimensions.height}`);
      
      await page.screenshot({
        path: imagePath,
        type: 'png',
        fullPage: true
      });

      let stats = fs.statSync(imagePath);
      console.log(`📊 Original size: ${(stats.size / 1024).toFixed(1)} KB`);
      
      // Save uncompressed version for testing
      const uncompressedPath = imagePath.replace('.png', '-uncompressed.png');
      fs.copyFileSync(imagePath, uncompressedPath);
      
      // Compress the PNG using sharp
      const sharp = require('sharp');
      const compressedPath = imagePath.replace('.png', '-compressed.png');
      
      await sharp(imagePath)
        .png({
          compressionLevel: 9, // Maximum compression (0-9)
          palette: true, // Use palette-based color reduction for better compression
          quality: 85, // More compression for smaller file size
          effort: 10, // Maximum effort for compression (1-10)
          colors: 128 // Reduce color palette for better compression
        })
        .toFile(compressedPath);
      
      // Replace original with compressed version
      fs.renameSync(compressedPath, imagePath);
      
      stats = fs.statSync(imagePath);
      console.log(`✅ Compressed image: ${imagePath}`);
      console.log(`📊 Compressed size: ${(stats.size / 1024).toFixed(1)} KB`);
      
      return imagePath;
      
    } finally {
      await browser.close();
    }

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return null;
  }
}

// Generate the image
generateDiffForReading().then(imagePath => {
  if (imagePath) {
    console.log(`🎯 Image ready for reading at: ${imagePath}`);
    console.log(`📖 You can now use the Read tool to analyze this image!`);
  }
}).catch(console.error);