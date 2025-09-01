#!/usr/bin/env node
// Centralized Telegram API mocking for AFK tests
// Provides consistent, configurable Telegram Bot API simulation

const https = require('https');

class TelegramMock {
  constructor() {
    this.responses = new Map();
    this.requests = [];
    this.originalHttpsRequest = null;
    this.isActive = false;
  }

  // Activate the mock system
  activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.originalHttpsRequest = https.request;
    const self = this;
    
    // Create a mock request function
    const mockRequest = function(options, callback) {
      // Capture request for validation
      const requestData = {
        hostname: options.hostname,
        path: options.path,
        method: options.method,
        headers: options.headers,
        timestamp: Date.now()
      };

      // Create mock response object
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: function(event, handler) {
          if (event === 'data') {
            setImmediate(() => {
              const responseKey = self._getResponseKey(options.path);
              const responseData = self.responses.get(responseKey) || { ok: true, result: { message_id: 12345, chat: { id: 123456789 } } };
              handler(JSON.stringify(responseData));
            });
          } else if (event === 'end') {
            setImmediate(() => handler());
          }
        }
      };

      // Create mock request object
      const mockRequestObj = {
        on: function(event, handler) {
          if (event === 'error') {
            const errorKey = self._getResponseKey(options.path) + '_error';
            if (self.responses.has(errorKey)) {
              setImmediate(() => handler(self.responses.get(errorKey)));
            }
          } else if (event === 'timeout') {
            const timeoutKey = self._getResponseKey(options.path) + '_timeout';
            if (self.responses.has(timeoutKey)) {
              setImmediate(() => {
                mockRequest.destroy();
                handler();
              });
            }
          }
        },
        write: function(data) {
          requestData.body = data;
        },
        end: function() {
          // Push request to array when end() is called to ensure we capture all requests
          self.requests.push(requestData);
          if (callback) {
            setImmediate(() => callback(mockResponse));
          }
        },
        destroy: function() {
          // Mock request destruction
        }
      };

      return mockRequestObj;
    };
    
    // Override the https.request
    https.request = mockRequest;
  }

  // Deactivate the mock system
  deactivate() {
    if (!this.isActive) return;
    
    https.request = this.originalHttpsRequest;
    this.isActive = false;
    this.clear();
  }

  // Set response for a specific endpoint
  setResponse(endpoint, response) {
    const key = this._getResponseKey(endpoint);
    this.responses.set(key, response);
  }

  // Set error response for endpoint
  setError(endpoint, error) {
    const key = this._getResponseKey(endpoint) + '_error';
    this.responses.set(key, error);
  }

  // Set timeout for endpoint
  setTimeout(endpoint) {
    const key = this._getResponseKey(endpoint) + '_timeout';
    this.responses.set(key, true);
  }

  // Get captured requests
  getRequests() {
    return [...this.requests];
  }

  // Clear all responses and requests
  clear() {
    this.responses.clear();
    this.requests = [];
  }

  // Helper to normalize endpoint paths
  _getResponseKey(path) {
    if (path.includes('/sendMessage')) return 'sendMessage';
    if (path.includes('/sendPhoto')) return 'sendPhoto';
    if (path.includes('/sendDocument')) return 'sendDocument';
    return 'default';
  }
}

// Pre-configured response helpers
const TelegramResponses = {
  success: {
    sendMessage: { ok: true, result: { message_id: 12345, chat: { id: 123456789 } } },
    sendPhoto: { ok: true, result: { message_id: 12346, chat: { id: 123456789 }, photo: [{ file_id: 'test-photo' }] } },
    sendDocument: { ok: true, result: { message_id: 12347, chat: { id: 123456789 }, document: { file_id: 'test-doc' } } }
  },
  
  error: {
    badRequest: { ok: false, error_code: 400, description: 'Bad Request: invalid parameters' },
    unauthorized: { ok: false, error_code: 401, description: 'Unauthorized: bot token invalid' },
    photoTooLarge: { ok: false, error_code: 413, description: 'Request Entity Too Large: photo is too big' },
    invalidDimensions: { ok: false, error_code: 400, description: 'Bad Request: PHOTO_INVALID_DIMENSIONS' }
  },
  
  networkError: new Error('Network error'),
  timeoutError: new Error('Request timeout')
};

// Configuration helpers
function setupSuccessfulTelegram(mock) {
  mock.setResponse('/sendMessage', TelegramResponses.success.sendMessage);
  mock.setResponse('/sendPhoto', TelegramResponses.success.sendPhoto);  
  mock.setResponse('/sendDocument', TelegramResponses.success.sendDocument);
}

function setupFailingTelegram(mock) {
  mock.setResponse('/sendMessage', TelegramResponses.error.badRequest);
  mock.setResponse('/sendPhoto', TelegramResponses.error.photoTooLarge);
  mock.setResponse('/sendDocument', TelegramResponses.error.badRequest);
}

function setupNetworkError(mock) {
  mock.setError('/sendMessage', TelegramResponses.networkError);
  mock.setError('/sendPhoto', TelegramResponses.networkError);
  mock.setError('/sendDocument', TelegramResponses.networkError);
}

// Validation helpers
function validateMultipartFormData(requestBody) {
  if (!requestBody || typeof requestBody !== 'string' && !Buffer.isBuffer(requestBody)) {
    return { valid: false, error: 'Request body is missing or invalid' };
  }

  const bodyStr = Buffer.isBuffer(requestBody) ? requestBody.toString() : requestBody;
  
  // Check for multipart boundary
  if (!bodyStr.includes('Content-Disposition: form-data')) {
    return { valid: false, error: 'Missing multipart form data structure' };
  }

  // Check for required fields
  const requiredFields = ['chat_id'];
  for (const field of requiredFields) {
    if (!bodyStr.includes(`name="${field}"`)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  return { valid: true };
}

function extractFormFields(requestBody) {
  if (!requestBody) return {};
  
  const bodyStr = Buffer.isBuffer(requestBody) ? requestBody.toString() : requestBody;
  const fields = {};
  
  // Simple extraction for testing purposes
  const chatIdMatch = bodyStr.match(/name="chat_id"\r?\n\r?\n([^\r\n]+)/);
  if (chatIdMatch) fields.chat_id = chatIdMatch[1];
  
  const captionMatch = bodyStr.match(/name="caption"\r?\n\r?\n([^\r\n]+)/);
  if (captionMatch) fields.caption = captionMatch[1];
  
  const filenameMatch = bodyStr.match(/filename="([^"]+)"/);
  if (filenameMatch) fields.filename = filenameMatch[1];
  
  return fields;
}

module.exports = {
  TelegramMock,
  TelegramResponses,
  setupSuccessfulTelegram,
  setupFailingTelegram,  
  setupNetworkError,
  validateMultipartFormData,
  extractFormFields
};