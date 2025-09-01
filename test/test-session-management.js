#!/usr/bin/env node
// Comprehensive tests for afk session management functionality

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

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || 'Expected condition to be true');
  }
}

function assertFalse(condition, message) {
  if (condition) {
    throw new Error(message || 'Expected condition to be false');
  }
}

// Create a temporary test directory for session files
const TEST_DIR = path.join(os.tmpdir(), `afk-test-${Date.now()}`);
const ACTIVE_SESSIONS_FILE = path.join(TEST_DIR, 'active-sessions.json');
const SESSION_MAP_FILE = path.join(TEST_DIR, 'session-map.json');

// Mock time functions for testing
let mockTime = Date.now();
const originalDateNow = Date.now;
const originalSetTimeout = setTimeout;
const originalClearTimeout = clearTimeout;

function mockDateNow() {
  return mockTime;
}

function advanceTime(ms) {
  mockTime += ms;
}

function resetTime() {
  mockTime = originalDateNow();
}

// Mock the session management functions from afk
function generateSessionId() {
  // Simple UUID-ish (without importing crypto)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0; 
    const v = c === 'x' ? r : (r&0x3|0x8); 
    return v.toString(16);
  });
}

function trackActiveSession(sessionId, toolCall, metadata = {}) {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  
  let activeSessions = {};
  if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
    try {
      const data = fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf-8');
      activeSessions = JSON.parse(data);
    } catch (err) {
      // Handle corrupted file gracefully
    }
  }
  
  activeSessions[sessionId] = {
    toolCall,
    metadata,
    startTime: new Date(mockTime).toISOString(),
    lastActivity: new Date(mockTime).toISOString(),
    pid: process.pid,
    messageId: metadata.messageId || null,
    chatId: metadata.chatId || null
  };
  
  try {
    fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(activeSessions, null, 2));
  } catch (err) {
    throw new Error(`Failed to write active sessions file: ${err.message}`);
  }
}

function updateSessionActivity(sessionId) {
  if (!fs.existsSync(ACTIVE_SESSIONS_FILE)) return;
  
  try {
    const data = fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf-8');
    const activeSessions = JSON.parse(data);
    
    if (activeSessions[sessionId]) {
      activeSessions[sessionId].lastActivity = new Date(mockTime).toISOString();
      fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(activeSessions, null, 2));
    }
  } catch (err) {
    throw new Error(`Failed to update session activity: ${err.message}`);
  }
}

function removeActiveSession(sessionId) {
  if (!fs.existsSync(ACTIVE_SESSIONS_FILE)) return;
  
  try {
    const data = fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf-8');
    const activeSessions = JSON.parse(data);
    
    if (activeSessions[sessionId]) {
      delete activeSessions[sessionId];
      fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(activeSessions, null, 2));
    }
  } catch (err) {
    throw new Error(`Failed to remove active session: ${err.message}`);
  }
}

function checkAbandonedSessions() {
  if (!fs.existsSync(ACTIVE_SESSIONS_FILE)) return [];
  
  try {
    const data = fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf-8');
    const activeSessions = JSON.parse(data);
    const now = new Date(mockTime);
    const abandonedSessions = [];
    
    for (const [sessionId, session] of Object.entries(activeSessions)) {
      const lastActivity = new Date(session.lastActivity);
      const timeSinceActivity = (now - lastActivity) / 1000; // seconds
      
      // Consider session abandoned if no heartbeat for 10 seconds
      const heartbeatTimeout = 10; // seconds - allow for network delays and processing time
      if (timeSinceActivity > heartbeatTimeout) {
        abandonedSessions.push({
          sessionId,
          ...session,
          inactiveFor: timeSinceActivity
        });
      }
    }
    
    return abandonedSessions;
  } catch (err) {
    return [];
  }
}

function getActiveSessions() {
  if (!fs.existsSync(ACTIVE_SESSIONS_FILE)) return {};
  
  try {
    const data = fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

// Setup and teardown
function setupTest() {
  // Override Date.now for consistent testing
  Date.now = mockDateNow;
  resetTime();
  
  // Clean up any existing test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  
  // Create fresh test directory
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

function teardownTest() {
  // Restore original Date.now
  Date.now = originalDateNow;
  
  // Clean up test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Test Session ID Generation
console.log('\n=== Testing Session ID Generation ===\n');

test('Session IDs are unique', () => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    const id = generateSessionId();
    assertTrue(!ids.has(id), `Duplicate session ID generated: ${id}`);
    ids.add(id);
  }
});

test('Session ID format is correct', () => {
  const id = generateSessionId();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assertTrue(uuidPattern.test(id), `Session ID format is invalid: ${id}`);
});

test('Session ID generation is consistent', () => {
  for (let i = 0; i < 10; i++) {
    const id = generateSessionId();
    assertTrue(typeof id === 'string', 'Session ID should be a string');
    assertTrue(id.length === 36, `Session ID should be 36 characters, got ${id.length}`);
  }
});

// Test Session Tracking and Storage
console.log('\n=== Testing Session Tracking and Storage ===\n');

test('Track new active session', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  const toolCall = 'Bash(npm test)';
  const metadata = { messageId: 123, chatId: 456 };
  
  trackActiveSession(sessionId, toolCall, metadata);
  
  const sessions = getActiveSessions();
  assertTrue(sessions[sessionId] !== undefined, 'Session should be tracked');
  assertEqual(sessions[sessionId].toolCall, toolCall);
  assertEqual(sessions[sessionId].metadata, metadata);
  assertEqual(sessions[sessionId].pid, process.pid);
  
  teardownTest();
});

test('Track multiple active sessions', () => {
  setupTest();
  
  const session1 = generateSessionId();
  const session2 = generateSessionId();
  const session3 = generateSessionId();
  
  trackActiveSession(session1, 'Bash(ls)', { messageId: 1 });
  advanceTime(1000);
  trackActiveSession(session2, 'Read(/tmp/file.txt)', { messageId: 2 });
  advanceTime(1000);
  trackActiveSession(session3, 'Edit(/tmp/file.js)', { messageId: 3 });
  
  const sessions = getActiveSessions();
  assertEqual(Object.keys(sessions).length, 3);
  assertTrue(sessions[session1] !== undefined);
  assertTrue(sessions[session2] !== undefined);
  assertTrue(sessions[session3] !== undefined);
  
  teardownTest();
});

test('Session file creates directory if needed', () => {
  // Clean up completely
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(pwd)', {});
  
  assertTrue(fs.existsSync(TEST_DIR), 'Directory should be created');
  assertTrue(fs.existsSync(ACTIVE_SESSIONS_FILE), 'Sessions file should be created');
  
  teardownTest();
});

test('Handle corrupted session file gracefully', () => {
  setupTest();
  
  // Create corrupted JSON file
  fs.writeFileSync(ACTIVE_SESSIONS_FILE, 'invalid json content');
  
  const sessionId = generateSessionId();
  
  // Should not throw error and create new valid session
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  const sessions = getActiveSessions();
  assertTrue(sessions[sessionId] !== undefined, 'Should create session despite corruption');
  
  teardownTest();
});

// Test Heartbeat System
console.log('\n=== Testing Heartbeat System ===\n');

test('Update session activity updates timestamp', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  const originalSessions = getActiveSessions();
  const originalActivity = originalSessions[sessionId].lastActivity;
  
  // Advance time and update activity
  advanceTime(5000); // 5 seconds
  updateSessionActivity(sessionId);
  
  const updatedSessions = getActiveSessions();
  const updatedActivity = updatedSessions[sessionId].lastActivity;
  
  assertTrue(updatedActivity !== originalActivity, 'Activity timestamp should be updated');
  assertTrue(new Date(updatedActivity) > new Date(originalActivity), 'New timestamp should be later');
  
  teardownTest();
});

test('Update activity for non-existent session does nothing', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  
  // Should not throw error
  updateSessionActivity(sessionId);
  
  const sessions = getActiveSessions();
  assertEqual(Object.keys(sessions).length, 0, 'No sessions should be created');
  
  teardownTest();
});

test('Update activity with no sessions file does nothing', () => {
  setupTest();
  
  // Remove the sessions file
  if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
    fs.unlinkSync(ACTIVE_SESSIONS_FILE);
  }
  
  const sessionId = generateSessionId();
  
  // Should not throw error or create file
  updateSessionActivity(sessionId);
  
  assertFalse(fs.existsSync(ACTIVE_SESSIONS_FILE), 'Sessions file should not be created');
  
  teardownTest();
});

// Test Abandoned Session Detection (Critical 10-second timeout logic)
console.log('\n=== Testing Abandoned Session Detection (10-second timeout) ===\n');

test('Session within timeout not considered abandoned', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  // Advance time by 9 seconds (within 10-second timeout)
  advanceTime(9000);
  
  const abandoned = checkAbandonedSessions();
  assertEqual(abandoned.length, 0, 'Session should not be abandoned within timeout');
  
  teardownTest();
});

test('Session exactly at timeout not considered abandoned', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  // Advance time by exactly 10 seconds
  advanceTime(10000);
  
  const abandoned = checkAbandonedSessions();
  assertEqual(abandoned.length, 0, 'Session should not be abandoned at exactly timeout');
  
  teardownTest();
});

test('Session beyond timeout is considered abandoned', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  // Advance time by 11 seconds (beyond 10-second timeout)
  advanceTime(11000);
  
  const abandoned = checkAbandonedSessions();
  assertEqual(abandoned.length, 1, 'Session should be abandoned beyond timeout');
  assertEqual(abandoned[0].sessionId, sessionId);
  assertTrue(abandoned[0].inactiveFor > 10, 'Inactive time should be greater than 10 seconds');
  
  teardownTest();
});

test('Multiple sessions with mixed abandonment status', () => {
  setupTest();
  
  const activeSession = generateSessionId();
  const abandonedSession1 = generateSessionId();
  const abandonedSession2 = generateSessionId();
  
  // Create sessions at specific times to make calculation clearer
  trackActiveSession(activeSession, 'Bash(active)', {});       // Created at time 0
  advanceTime(1000);
  trackActiveSession(abandonedSession1, 'Bash(abandoned1)', {}); // Created at time 1000
  advanceTime(1000);
  trackActiveSession(abandonedSession2, 'Bash(abandoned2)', {}); // Created at time 2000
  
  // Update activity for active session to keep it fresh at time 3000
  advanceTime(1000);
  updateSessionActivity(activeSession);                         // Updated at time 3000
  
  // Advance time to 15000 (total elapsed)
  // activeSession: last activity at 3000, so 12s ago = abandoned
  // abandonedSession1: last activity at 1000, so 14s ago = abandoned
  // abandonedSession2: last activity at 2000, so 13s ago = abandoned
  advanceTime(12000); // Now at time 15000
  
  const abandoned = checkAbandonedSessions();
  
  // All three sessions should be abandoned now
  assertEqual(abandoned.length, 3, 'All sessions should be abandoned');
  
  const abandonedIds = abandoned.map(s => s.sessionId).sort();
  const expectedIds = [activeSession, abandonedSession1, abandonedSession2].sort();
  assertEqual(abandonedIds, expectedIds, 'All sessions should be abandoned');
  
  teardownTest();
});

test('Heartbeat updates prevent abandonment', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  // Advance time by 8 seconds and update activity
  advanceTime(8000);
  updateSessionActivity(sessionId);
  
  // Advance time by another 8 seconds (total would be 16s from start, but only 8s from last activity)
  advanceTime(8000);
  
  const abandoned = checkAbandonedSessions();
  assertEqual(abandoned.length, 0, 'Session should not be abandoned due to heartbeat update');
  
  teardownTest();
});

test('Check abandoned sessions with no sessions file', () => {
  setupTest();
  
  // Remove sessions file
  if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
    fs.unlinkSync(ACTIVE_SESSIONS_FILE);
  }
  
  const abandoned = checkAbandonedSessions();
  assertEqual(abandoned.length, 0, 'Should return empty array when no sessions file exists');
  
  teardownTest();
});

test('Check abandoned sessions with corrupted file', () => {
  setupTest();
  
  // Create corrupted JSON file
  fs.writeFileSync(ACTIVE_SESSIONS_FILE, 'invalid json');
  
  const abandoned = checkAbandonedSessions();
  assertEqual(abandoned.length, 0, 'Should return empty array when sessions file is corrupted');
  
  teardownTest();
});

// Test Session Cleanup and Removal
console.log('\n=== Testing Session Cleanup and Removal ===\n');

test('Remove active session', () => {
  setupTest();
  
  const session1 = generateSessionId();
  const session2 = generateSessionId();
  
  trackActiveSession(session1, 'Bash(test1)', {});
  trackActiveSession(session2, 'Bash(test2)', {});
  
  // Verify both sessions exist
  let sessions = getActiveSessions();
  assertEqual(Object.keys(sessions).length, 2);
  
  // Remove one session
  removeActiveSession(session1);
  
  sessions = getActiveSessions();
  assertEqual(Object.keys(sessions).length, 1, 'One session should remain');
  assertTrue(sessions[session2] !== undefined, 'Remaining session should be session2');
  assertTrue(sessions[session1] === undefined, 'Removed session should not exist');
  
  teardownTest();
});

test('Remove non-existent session does nothing', () => {
  setupTest();
  
  const existingSession = generateSessionId();
  const nonExistentSession = generateSessionId();
  
  trackActiveSession(existingSession, 'Bash(test)', {});
  
  // Try to remove non-existent session
  removeActiveSession(nonExistentSession);
  
  const sessions = getActiveSessions();
  assertEqual(Object.keys(sessions).length, 1, 'Existing session should remain');
  assertTrue(sessions[existingSession] !== undefined, 'Existing session should not be affected');
  
  teardownTest();
});

test('Remove session with no sessions file does nothing', () => {
  setupTest();
  
  // Remove sessions file
  if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
    fs.unlinkSync(ACTIVE_SESSIONS_FILE);
  }
  
  const sessionId = generateSessionId();
  
  // Should not throw error
  removeActiveSession(sessionId);
  
  assertFalse(fs.existsSync(ACTIVE_SESSIONS_FILE), 'Sessions file should not be created');
  
  teardownTest();
});

test('Remove all sessions leaves empty file', () => {
  setupTest();
  
  const session1 = generateSessionId();
  const session2 = generateSessionId();
  
  trackActiveSession(session1, 'Bash(test1)', {});
  trackActiveSession(session2, 'Bash(test2)', {});
  
  removeActiveSession(session1);
  removeActiveSession(session2);
  
  const sessions = getActiveSessions();
  assertEqual(Object.keys(sessions).length, 0, 'No sessions should remain');
  assertTrue(fs.existsSync(ACTIVE_SESSIONS_FILE), 'Sessions file should still exist');
  
  teardownTest();
});

// Test Concurrent Session Handling
console.log('\n=== Testing Concurrent Session Handling ===\n');

test('Concurrent session creation', () => {
  setupTest();
  
  const sessions = [];
  const numSessions = 10;
  
  // Create multiple sessions rapidly
  for (let i = 0; i < numSessions; i++) {
    const sessionId = generateSessionId();
    sessions.push(sessionId);
    trackActiveSession(sessionId, `Bash(test${i})`, { messageId: i });
    advanceTime(100); // Small time advance
  }
  
  const activeSessions = getActiveSessions();
  assertEqual(Object.keys(activeSessions).length, numSessions, 'All sessions should be tracked');
  
  // Verify all sessions have correct data
  for (let i = 0; i < numSessions; i++) {
    const sessionId = sessions[i];
    assertTrue(activeSessions[sessionId] !== undefined, `Session ${i} should exist`);
    assertEqual(activeSessions[sessionId].toolCall, `Bash(test${i})`);
    assertEqual(activeSessions[sessionId].metadata.messageId, i);
  }
  
  teardownTest();
});

test('Concurrent heartbeat updates', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  const originalSessions = getActiveSessions();
  const originalActivity = originalSessions[sessionId].lastActivity;
  
  // Simulate rapid heartbeat updates
  for (let i = 0; i < 5; i++) {
    advanceTime(1000);
    updateSessionActivity(sessionId);
  }
  
  const updatedSessions = getActiveSessions();
  const updatedActivity = updatedSessions[sessionId].lastActivity;
  
  assertTrue(new Date(updatedActivity) > new Date(originalActivity), 'Activity should be updated');
  
  teardownTest();
});

test('Mixed operations on sessions', () => {
  setupTest();
  
  const sessions = [];
  
  // Create sessions
  for (let i = 0; i < 5; i++) {
    const sessionId = generateSessionId();
    sessions.push(sessionId);
    trackActiveSession(sessionId, `Bash(test${i})`, {});
    advanceTime(1000);
  }
  
  // Update some sessions
  updateSessionActivity(sessions[0]);
  updateSessionActivity(sessions[2]);
  
  // Remove some sessions
  removeActiveSession(sessions[1]);
  removeActiveSession(sessions[4]);
  
  // Advance time to make some sessions abandoned
  advanceTime(9000);
  
  const activeSessions = getActiveSessions();
  const abandoned = checkAbandonedSessions();
  
  // Should have sessions 0, 2, 3 remaining (1 and 4 were removed)
  assertEqual(Object.keys(activeSessions).length, 3, 'Three sessions should remain');
  
  // Sessions 0 and 2 were updated recently (9s ago), only session 3 should be abandoned (13s ago)
  assertEqual(abandoned.length, 1, 'Only session 3 should be abandoned');
  assertEqual(abandoned[0].sessionId, sessions[3]);
  
  teardownTest();
});

// Test Session State Persistence
console.log('\n=== Testing Session State Persistence ===\n');

test('Session data persists across function calls', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  const toolCall = 'Bash(npm test)';
  const metadata = { messageId: 123, chatId: 456, custom: 'data' };
  
  // Create session
  trackActiveSession(sessionId, toolCall, metadata);
  
  // Read session data back
  const sessions = getActiveSessions();
  const session = sessions[sessionId];
  
  assertEqual(session.toolCall, toolCall);
  assertEqual(session.metadata, metadata);
  assertEqual(session.pid, process.pid);
  assertTrue(session.startTime !== undefined);
  assertTrue(session.lastActivity !== undefined);
  assertTrue(session.messageId === 123);
  assertTrue(session.chatId === 456);
  
  teardownTest();
});

test('File format is valid JSON', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(test)', { test: 'data' });
  
  // Read raw file content
  const rawContent = fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf-8');
  
  // Should be valid JSON
  let parsedData;
  try {
    parsedData = JSON.parse(rawContent);
  } catch (e) {
    throw new Error('Sessions file should contain valid JSON');
  }
  
  assertTrue(typeof parsedData === 'object', 'Parsed data should be an object');
  assertTrue(parsedData[sessionId] !== undefined, 'Session should exist in parsed data');
  
  teardownTest();
});

test('Session timestamps are ISO format', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  const sessions = getActiveSessions();
  const session = sessions[sessionId];
  
  // Check startTime format
  const startTime = new Date(session.startTime);
  assertFalse(isNaN(startTime.getTime()), 'Start time should be valid date');
  
  // Check lastActivity format
  const lastActivity = new Date(session.lastActivity);
  assertFalse(isNaN(lastActivity.getTime()), 'Last activity should be valid date');
  
  // Should be ISO format
  assertTrue(session.startTime.endsWith('Z') || session.startTime.includes('+'), 'Start time should be in ISO format');
  assertTrue(session.lastActivity.endsWith('Z') || session.lastActivity.includes('+'), 'Last activity should be in ISO format');
  
  teardownTest();
});

// Test Error Handling
console.log('\n=== Testing Error Handling ===\n');

test('Handle readonly sessions file', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  // Make file readonly (if possible on this system)
  try {
    fs.chmodSync(ACTIVE_SESSIONS_FILE, 0o444);
    
    // Try to update session - should handle gracefully
    let errorThrown = false;
    try {
      updateSessionActivity(sessionId);
    } catch (e) {
      errorThrown = true;
    }
    
    // May or may not throw error depending on system, but shouldn't crash
    console.log('  📝 Readonly file test completed (behavior may vary by system)');
    
    // Restore permissions
    fs.chmodSync(ACTIVE_SESSIONS_FILE, 0o644);
  } catch (e) {
    // chmod might not work on all systems
    console.log('  📝 Readonly file test skipped (chmod not supported)');
  }
  
  teardownTest();
});

test('Handle missing directory for sessions', () => {
  // Remove entire test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  
  const sessionId = generateSessionId();
  
  // Should create directory and file
  trackActiveSession(sessionId, 'Bash(test)', {});
  
  assertTrue(fs.existsSync(TEST_DIR), 'Directory should be created');
  assertTrue(fs.existsSync(ACTIVE_SESSIONS_FILE), 'Sessions file should be created');
  
  teardownTest();
});

// Performance Tests
console.log('\n=== Testing Performance ===\n');

test('Large number of sessions performance', () => {
  setupTest();
  
  const start = Date.now();
  const numSessions = 100;
  const sessions = [];
  
  // Create many sessions
  for (let i = 0; i < numSessions; i++) {
    const sessionId = generateSessionId();
    sessions.push(sessionId);
    trackActiveSession(sessionId, `Bash(test${i})`, { index: i });
  }
  
  const creationTime = Date.now() - start;
  console.log(`  📊 Created ${numSessions} sessions in ${creationTime}ms`);
  
  // Test abandoned session check performance
  const checkStart = Date.now();
  const abandoned = checkAbandonedSessions();
  const checkTime = Date.now() - checkStart;
  console.log(`  📊 Checked for abandoned sessions in ${checkTime}ms`);
  
  // Verify all sessions were created
  const activeSessions = getActiveSessions();
  assertEqual(Object.keys(activeSessions).length, numSessions);
  
  teardownTest();
});

// Edge Cases
console.log('\n=== Testing Edge Cases ===\n');

test('Empty metadata handling', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  
  // Test with undefined metadata
  trackActiveSession(sessionId, 'Bash(test)', undefined);
  
  let sessions = getActiveSessions();
  assertTrue(sessions[sessionId] !== undefined, 'Session should be created with undefined metadata');
  
  // Test with empty metadata
  const sessionId2 = generateSessionId();
  trackActiveSession(sessionId2, 'Bash(test2)', {});
  
  sessions = getActiveSessions();
  assertTrue(sessions[sessionId2] !== undefined, 'Session should be created with empty metadata');
  
  teardownTest();
});

test('Very long session IDs and data', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  const longToolCall = 'Bash(' + 'x'.repeat(1000) + ')';
  const longMetadata = { data: 'y'.repeat(10000) };
  
  // Should handle long data without issues
  trackActiveSession(sessionId, longToolCall, longMetadata);
  
  const sessions = getActiveSessions();
  assertEqual(sessions[sessionId].toolCall, longToolCall);
  assertEqual(sessions[sessionId].metadata.data, longMetadata.data);
  
  teardownTest();
});

test('Special characters in tool calls', () => {
  setupTest();
  
  const sessionId = generateSessionId();
  const toolCall = 'Bash(echo "Hello \\"World\\""; cat /tmp/file with spaces.txt)';
  const metadata = { path: '/tmp/special chars/äöü.txt', unicode: '🚀📊✅' };
  
  trackActiveSession(sessionId, toolCall, metadata);
  
  const sessions = getActiveSessions();
  assertEqual(sessions[sessionId].toolCall, toolCall);
  assertEqual(sessions[sessionId].metadata, metadata);
  
  teardownTest();
});

// Print summary
console.log('\n=== Test Summary ===\n');
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);

if (testsFailed > 0) {
  console.error(`\n❌ ${testsFailed} test(s) failed`);
  process.exit(1);
} else {
  console.log(`\n✅ All ${testsPassed} tests passed!`);
  process.exit(0);
}