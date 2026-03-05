/**
 * Client-side Logging Service for Primo Maps Admin Application
 * Provides structured logging with multiple levels, API tracking, and error handling
 * @module services/logger
 */

/**
 * Log levels enum with numeric priorities
 * @constant {Object}
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Log categories for organizing entries
 * @constant {Object}
 */
const LOG_CATEGORIES = {
  API: 'api',
  USER: 'user',
  ERROR: 'error',
  SYSTEM: 'system'
};

/**
 * Console color configurations for each log level
 * @constant {Object}
 */
const CONSOLE_STYLES = {
  debug: 'color: #6B7280; font-weight: normal;',
  info: 'color: #2563EB; font-weight: normal;',
  warn: 'color: #D97706; font-weight: bold;',
  error: 'color: #DC2626; font-weight: bold;'
};

/**
 * Category badge colors for console output
 * @constant {Object}
 */
const CATEGORY_STYLES = {
  api: 'background: #8B5CF6; color: white; padding: 2px 6px; border-radius: 3px;',
  user: 'background: #10B981; color: white; padding: 2px 6px; border-radius: 3px;',
  error: 'background: #EF4444; color: white; padding: 2px 6px; border-radius: 3px;',
  system: 'background: #6366F1; color: white; padding: 2px 6px; border-radius: 3px;'
};

/**
 * Maximum number of log entries to keep in buffer
 * @constant {number}
 */
const MAX_BUFFER_SIZE = 500;

/**
 * Circular buffer to store log entries
 * @type {Array<Object>}
 */
let logBuffer = [];

/**
 * Current write position in circular buffer
 * @type {number}
 */
let bufferIndex = 0;

/**
 * Total count of logs (may exceed buffer size)
 * @type {number}
 */
let totalLogCount = 0;

/**
 * Current minimum log level
 * @type {string}
 */
let currentLogLevel = 'debug';

/**
 * Whether console output is enabled
 * @type {boolean}
 */
let consoleEnabled = true;

/**
 * Counter for generating unique correlation IDs
 * @type {number}
 */
let correlationCounter = 0;

/**
 * Generates a unique correlation ID for tracking related events
 * @returns {string} Unique correlation ID
 */
function generateCorrelationId() {
  const timestamp = Date.now().toString(36);
  const counter = (++correlationCounter).toString(36).padStart(4, '0');
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${counter}-${random}`;
}

/**
 * Checks if the given level should be logged based on current minimum level
 * @param {string} level - Log level to check
 * @returns {boolean} True if level should be logged
 */
function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

/**
 * Creates a structured log entry
 * @param {string} level - Log level
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {Object} [data] - Optional additional data
 * @param {string} [correlationId] - Optional correlation ID
 * @returns {Object} Log entry object
 */
function createLogEntry(level, category, message, data = null, correlationId = null) {
  return {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    data: data || undefined,
    correlationId: correlationId || undefined
  };
}

/**
 * Adds a log entry to the circular buffer
 * @param {Object} entry - Log entry to add
 */
function addToBuffer(entry) {
  if (logBuffer.length < MAX_BUFFER_SIZE) {
    logBuffer.push(entry);
  } else {
    logBuffer[bufferIndex] = entry;
    bufferIndex = (bufferIndex + 1) % MAX_BUFFER_SIZE;
  }
  totalLogCount++;
}

/**
 * Outputs a log entry to the console with color coding
 * @param {Object} entry - Log entry to output
 */
function outputToConsole(entry) {
  if (!consoleEnabled) return;

  const { timestamp, level, category, message, data, correlationId } = entry;
  const time = timestamp.split('T')[1].split('.')[0];

  const levelStyle = CONSOLE_STYLES[level] || '';
  const categoryStyle = CATEGORY_STYLES[category] || CATEGORY_STYLES.system;

  // Build console output
  const prefix = `%c[${time}]%c %c${category.toUpperCase()}%c`;
  const styles = [
    'color: #9CA3AF;',
    '',
    categoryStyle,
    levelStyle
  ];

  let logMessage = `${prefix} ${message}`;

  if (correlationId) {
    logMessage += ` [${correlationId}]`;
  }

  // Use appropriate console method
  const consoleMethod = level === 'error' ? console.error :
                        level === 'warn' ? console.warn :
                        level === 'debug' ? console.debug :
                        console.log;

  if (data) {
    consoleMethod(logMessage, ...styles, data);
  } else {
    consoleMethod(logMessage, ...styles);
  }
}

/**
 * Core logging function
 * @param {string} level - Log level
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {Object} [data] - Optional additional data
 * @param {string} [correlationId] - Optional correlation ID
 */
function log(level, category, message, data = null, correlationId = null) {
  if (!shouldLog(level)) return;

  const entry = createLogEntry(level, category, message, data, correlationId);
  addToBuffer(entry);
  outputToConsole(entry);
}

/**
 * Logs a debug message
 * @param {string} category - Log category (api/user/error/system)
 * @param {string} message - Log message
 * @param {Object} [data] - Optional additional data
 */
export function debug(category, message, data) {
  log('debug', category, message, data);
}

/**
 * Logs an info message
 * @param {string} category - Log category (api/user/error/system)
 * @param {string} message - Log message
 * @param {Object} [data] - Optional additional data
 */
export function info(category, message, data) {
  log('info', category, message, data);
}

/**
 * Logs a warning message
 * @param {string} category - Log category (api/user/error/system)
 * @param {string} message - Log message
 * @param {Object} [data] - Optional additional data
 */
export function warn(category, message, data) {
  log('warn', category, message, data);
}

/**
 * Logs an error message
 * @param {string} category - Log category (api/user/error/system)
 * @param {string} message - Log message
 * @param {Object} [data] - Optional additional data
 */
export function error(category, message, data) {
  log('error', category, message, data);
}

/**
 * Wraps a fetch call with logging for request, response, and errors
 * Includes timing information and correlation tracking
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param {string} url - Request URL
 * @param {Object} [options] - Fetch options
 * @returns {Promise<Response>} Fetch response promise
 */
export async function apiCall(method, url, options = {}) {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();

  // Log request
  log('info', LOG_CATEGORIES.API, `${method} ${url} - Request started`, {
    method,
    url,
    headers: options.headers ? { ...options.headers } : undefined,
    hasBody: !!options.body
  }, correlationId);

  try {
    const fetchOptions = {
      method,
      ...options
    };

    const response = await fetch(url, fetchOptions);
    const duration = Math.round(performance.now() - startTime);

    // Log response
    const logLevel = response.ok ? 'info' : 'warn';
    log(logLevel, LOG_CATEGORIES.API, `${method} ${url} - Response ${response.status}`, {
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`,
      ok: response.ok
    }, correlationId);

    return response;
  } catch (err) {
    const duration = Math.round(performance.now() - startTime);

    // Log error
    log('error', LOG_CATEGORIES.API, `${method} ${url} - Request failed`, {
      method,
      url,
      error: err.message,
      errorName: err.name,
      duration: `${duration}ms`
    }, correlationId);

    throw err;
  }
}

/**
 * Logs a user action (click, navigation, form submission, etc.)
 * @param {string} action - Action type (click, navigate, submit, etc.)
 * @param {string} target - Target element or destination
 * @param {Object} [details] - Optional additional details
 */
export function userAction(action, target, details = null) {
  log('info', LOG_CATEGORIES.USER, `User ${action}: ${target}`, details);
}

/**
 * Gets logs from the buffer with optional filtering
 * @param {Object} [filter] - Filter options
 * @param {string} [filter.level] - Filter by minimum log level
 * @param {string} [filter.category] - Filter by category
 * @param {string} [filter.correlationId] - Filter by correlation ID
 * @param {string} [filter.search] - Search in message text
 * @param {string} [filter.startTime] - Filter logs after this ISO timestamp
 * @param {string} [filter.endTime] - Filter logs before this ISO timestamp
 * @param {number} [filter.limit] - Maximum number of logs to return
 * @returns {Array<Object>} Filtered log entries
 */
export function getLogs(filter = {}) {
  // Get logs in chronological order
  let logs;
  if (logBuffer.length < MAX_BUFFER_SIZE) {
    logs = [...logBuffer];
  } else {
    // Reorder circular buffer to chronological order
    logs = [
      ...logBuffer.slice(bufferIndex),
      ...logBuffer.slice(0, bufferIndex)
    ];
  }

  // Apply filters
  if (filter.level) {
    const minLevel = LOG_LEVELS[filter.level];
    logs = logs.filter(entry => LOG_LEVELS[entry.level] >= minLevel);
  }

  if (filter.category) {
    logs = logs.filter(entry => entry.category === filter.category);
  }

  if (filter.correlationId) {
    logs = logs.filter(entry => entry.correlationId === filter.correlationId);
  }

  if (filter.search) {
    const searchLower = filter.search.toLowerCase();
    logs = logs.filter(entry =>
      entry.message.toLowerCase().includes(searchLower) ||
      (entry.data && JSON.stringify(entry.data).toLowerCase().includes(searchLower))
    );
  }

  if (filter.startTime) {
    logs = logs.filter(entry => entry.timestamp >= filter.startTime);
  }

  if (filter.endTime) {
    logs = logs.filter(entry => entry.timestamp <= filter.endTime);
  }

  if (filter.limit && filter.limit > 0) {
    logs = logs.slice(-filter.limit);
  }

  return logs;
}

/**
 * Clears all logs from the buffer
 */
export function clearLogs() {
  logBuffer = [];
  bufferIndex = 0;
  totalLogCount = 0;
  log('info', LOG_CATEGORIES.SYSTEM, 'Log buffer cleared');
}

/**
 * Exports logs as a downloadable JSON file
 * @param {Object} [filter] - Optional filter to apply before export
 * @param {string} [filename] - Optional custom filename
 */
export function exportLogs(filter = null, filename = null) {
  const logs = filter ? getLogs(filter) : getLogs();

  const exportData = {
    exportedAt: new Date().toISOString(),
    totalLogsInBuffer: logBuffer.length,
    totalLogsEver: totalLogCount,
    currentLogLevel: currentLogLevel,
    filter: filter || 'none',
    logs
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const defaultFilename = `primo-maps-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || defaultFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  log('info', LOG_CATEGORIES.SYSTEM, `Exported ${logs.length} logs to file`);
}

/**
 * Sets the minimum log level
 * @param {string} level - Log level (debug/info/warn/error)
 */
export function setLevel(level) {
  if (!LOG_LEVELS.hasOwnProperty(level)) {
    console.error(`Invalid log level: ${level}. Valid levels are: ${Object.keys(LOG_LEVELS).join(', ')}`);
    return;
  }
  const previousLevel = currentLogLevel;
  currentLogLevel = level;
  log('info', LOG_CATEGORIES.SYSTEM, `Log level changed from ${previousLevel} to ${level}`);
}

/**
 * Gets the current log level
 * @returns {string} Current log level
 */
export function getLevel() {
  return currentLogLevel;
}

/**
 * Enables or disables console output
 * @param {boolean} enabled - Whether console output is enabled
 */
export function setConsoleEnabled(enabled) {
  consoleEnabled = !!enabled;
}

/**
 * Gets statistics about the log buffer
 * @returns {Object} Buffer statistics
 */
export function getStats() {
  const categoryCounts = {};
  const levelCounts = {};

  logBuffer.forEach(entry => {
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
    levelCounts[entry.level] = (levelCounts[entry.level] || 0) + 1;
  });

  return {
    bufferSize: logBuffer.length,
    maxBufferSize: MAX_BUFFER_SIZE,
    totalLogsEver: totalLogCount,
    currentLogLevel: currentLogLevel,
    consoleEnabled,
    categoryCounts,
    levelCounts
  };
}

/**
 * Initializes global error handlers for catching unhandled errors
 * Should be called once during application startup
 */
export function initErrorBoundary() {
  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    log('error', LOG_CATEGORIES.ERROR, 'Uncaught error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error ? {
        name: event.error.name,
        message: event.error.message,
        stack: event.error.stack
      } : null
    });
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    log('error', LOG_CATEGORIES.ERROR, 'Unhandled promise rejection', {
      reason: event.reason instanceof Error ? {
        name: event.reason.name,
        message: event.reason.message,
        stack: event.reason.stack
      } : event.reason
    });
  });

  log('info', LOG_CATEGORIES.SYSTEM, 'Error boundary initialized');
}

/**
 * Creates a tracked click handler that logs user clicks
 * @param {string} elementName - Name/description of the element
 * @param {Function} handler - Original click handler
 * @returns {Function} Wrapped click handler with logging
 */
export function trackClick(elementName, handler) {
  return function(event) {
    userAction('click', elementName, {
      target: event.target.tagName,
      className: event.target.className || undefined
    });
    return handler.call(this, event);
  };
}

/**
 * Creates a tracked form submit handler that logs form submissions
 * @param {string} formName - Name/description of the form
 * @param {Function} handler - Original submit handler
 * @returns {Function} Wrapped submit handler with logging
 */
export function trackFormSubmit(formName, handler) {
  return function(event) {
    userAction('submit', formName, {
      formId: event.target.id || undefined,
      formName: event.target.name || undefined
    });
    return handler.call(this, event);
  };
}

/**
 * Logs a navigation event
 * @param {string} from - Source location/page
 * @param {string} to - Destination location/page
 * @param {Object} [details] - Optional additional details
 */
export function trackNavigation(from, to, details = null) {
  userAction('navigate', `${from} -> ${to}`, details);
}

// Default export with all logger methods
const logger = {
  // Core logging methods
  debug,
  info,
  warn,
  error,

  // API tracking
  apiCall,

  // User action tracking
  userAction,
  trackClick,
  trackFormSubmit,
  trackNavigation,

  // Log management
  getLogs,
  clearLogs,
  exportLogs,
  setLevel,
  getLevel,
  getStats,

  // Configuration
  setConsoleEnabled,
  initErrorBoundary,

  // Constants
  LOG_LEVELS,
  LOG_CATEGORIES
};

export default logger;
