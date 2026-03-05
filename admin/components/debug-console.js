/**
 * Debug Console Component for Primo Maps Admin Application
 * A floating panel that displays real-time log entries with filtering capabilities
 * @module components/debug-console
 */

import logger from '../services/logger.js?v=1';

// Module state
let panelElement = null;
let isVisible = false;
let refreshInterval = null;
let lastLogCount = 0;

// Filter state
let levelFilters = {
  debug: true,
  info: true,
  warn: true,
  error: true
};

let categoryFilters = {
  api: true,
  user: true,
  error: true,
  system: true
};

let searchQuery = '';
let expandedEntries = new Set();

/**
 * CSS styles for the debug console
 */
const STYLES = `
  .debug-console-overlay {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 500px;
    max-width: calc(100vw - 32px);
    max-height: 400px;
    background: #1e1e1e;
    border: 1px solid #3c3c3c;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    color: #d4d4d4;
  }

  .debug-console-overlay[dir="rtl"] {
    right: auto;
    left: 16px;
  }

  .debug-console-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #2d2d2d;
    border-bottom: 1px solid #3c3c3c;
    border-radius: 8px 8px 0 0;
    cursor: move;
    flex-shrink: 0;
  }

  .debug-console-title {
    font-weight: 600;
    color: #569cd6;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .debug-console-title-icon {
    width: 16px;
    height: 16px;
    fill: #569cd6;
  }

  .debug-console-close {
    background: none;
    border: none;
    color: #808080;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .debug-console-close:hover {
    background: #3c3c3c;
    color: #d4d4d4;
  }

  .debug-console-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
    background: #252526;
    border-bottom: 1px solid #3c3c3c;
    flex-shrink: 0;
  }

  .debug-console-filter-group {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .debug-console-filter-label {
    color: #808080;
    font-size: 10px;
    text-transform: uppercase;
    margin-left: 4px;
  }

  [dir="rtl"] .debug-console-filter-label {
    margin-left: 0;
    margin-right: 4px;
  }

  .debug-console-checkbox {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    user-select: none;
  }

  .debug-console-checkbox input {
    margin: 0;
    cursor: pointer;
  }

  .debug-console-checkbox.level-debug { color: #808080; }
  .debug-console-checkbox.level-info { color: #569cd6; }
  .debug-console-checkbox.level-warn { color: #ce9178; }
  .debug-console-checkbox.level-error { color: #f14c4c; }

  .debug-console-checkbox.cat-api { color: #c586c0; }
  .debug-console-checkbox.cat-user { color: #4ec9b0; }
  .debug-console-checkbox.cat-error { color: #f14c4c; }
  .debug-console-checkbox.cat-system { color: #569cd6; }

  .debug-console-search {
    flex: 1;
    min-width: 120px;
    padding: 4px 8px;
    background: #3c3c3c;
    border: 1px solid #4c4c4c;
    border-radius: 4px;
    color: #d4d4d4;
    font-family: inherit;
    font-size: 11px;
  }

  .debug-console-search:focus {
    outline: none;
    border-color: #569cd6;
  }

  .debug-console-search::placeholder {
    color: #808080;
  }

  .debug-console-actions {
    display: flex;
    gap: 4px;
  }

  .debug-console-btn {
    padding: 4px 8px;
    background: #3c3c3c;
    border: 1px solid #4c4c4c;
    border-radius: 4px;
    color: #d4d4d4;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
  }

  .debug-console-btn:hover {
    background: #4c4c4c;
  }

  .debug-console-btn.danger {
    color: #f14c4c;
  }

  .debug-console-btn.danger:hover {
    background: #4c2020;
  }

  .debug-console-logs {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    min-height: 100px;
    max-height: 280px;
  }

  .debug-console-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100px;
    color: #808080;
    font-style: italic;
  }

  .debug-console-entry {
    padding: 4px 12px;
    border-bottom: 1px solid #2d2d2d;
    cursor: pointer;
  }

  .debug-console-entry:hover {
    background: #252526;
  }

  .debug-console-entry.level-debug { border-left: 3px solid #808080; }
  .debug-console-entry.level-info { border-left: 3px solid #569cd6; }
  .debug-console-entry.level-warn { border-left: 3px solid #ce9178; }
  .debug-console-entry.level-error { border-left: 3px solid #f14c4c; }

  [dir="rtl"] .debug-console-entry.level-debug { border-left: none; border-right: 3px solid #808080; }
  [dir="rtl"] .debug-console-entry.level-info { border-left: none; border-right: 3px solid #569cd6; }
  [dir="rtl"] .debug-console-entry.level-warn { border-left: none; border-right: 3px solid #ce9178; }
  [dir="rtl"] .debug-console-entry.level-error { border-left: none; border-right: 3px solid #f14c4c; }

  .debug-console-entry-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .debug-console-time {
    color: #808080;
    font-size: 10px;
  }

  .debug-console-level {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 2px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .debug-console-level.level-debug { background: #3c3c3c; color: #808080; }
  .debug-console-level.level-info { background: #1e3a5f; color: #569cd6; }
  .debug-console-level.level-warn { background: #4d3319; color: #ce9178; }
  .debug-console-level.level-error { background: #4d1f1f; color: #f14c4c; }

  .debug-console-category {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 2px;
    text-transform: uppercase;
    font-weight: 500;
  }

  .debug-console-category.cat-api { background: #3d2c47; color: #c586c0; }
  .debug-console-category.cat-user { background: #1f3d37; color: #4ec9b0; }
  .debug-console-category.cat-error { background: #4d1f1f; color: #f14c4c; }
  .debug-console-category.cat-system { background: #1e3a5f; color: #569cd6; }

  .debug-console-message {
    flex: 1;
    color: #d4d4d4;
    word-break: break-word;
  }

  .debug-console-expand {
    color: #808080;
    font-size: 10px;
    margin-right: auto;
  }

  [dir="rtl"] .debug-console-expand {
    margin-right: 0;
    margin-left: auto;
  }

  .debug-console-data {
    margin-top: 8px;
    padding: 8px;
    background: #1a1a1a;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    color: #9cdcfe;
    font-size: 11px;
    max-height: 150px;
    overflow-y: auto;
  }

  .debug-console-correlation {
    color: #6a9955;
    font-size: 10px;
    margin-top: 2px;
  }

  .debug-console-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: #2d2d2d;
    border-top: 1px solid #3c3c3c;
    border-radius: 0 0 8px 8px;
    font-size: 10px;
    color: #808080;
    flex-shrink: 0;
  }

  .debug-console-stats {
    display: flex;
    gap: 12px;
  }

  .debug-console-stat {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .debug-console-stat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .debug-console-stat-dot.level-debug { background: #808080; }
  .debug-console-stat-dot.level-info { background: #569cd6; }
  .debug-console-stat-dot.level-warn { background: #ce9178; }
  .debug-console-stat-dot.level-error { background: #f14c4c; }

  .debug-console-shortcut {
    color: #6a9955;
  }
`;

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted time string
 */
function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  } catch (e) {
    return timestamp;
  }
}

/**
 * Format data object for display
 * @param {Object} data - Data object to format
 * @returns {string} Formatted JSON string
 */
function formatData(data) {
  try {
    return JSON.stringify(data, null, 2);
  } catch (e) {
    return String(data);
  }
}

/**
 * Get filtered logs based on current filter state
 * @returns {Array} Filtered log entries
 */
function getFilteredLogs() {
  const allLogs = logger.getLogs();

  return allLogs.filter(entry => {
    // Level filter
    if (!levelFilters[entry.level]) return false;

    // Category filter
    if (!categoryFilters[entry.category]) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const messageMatch = entry.message.toLowerCase().includes(query);
      const dataMatch = entry.data && JSON.stringify(entry.data).toLowerCase().includes(query);
      if (!messageMatch && !dataMatch) return false;
    }

    return true;
  });
}

/**
 * Generate unique ID for log entry
 * @param {Object} entry - Log entry
 * @param {number} index - Index in array
 * @returns {string} Unique ID
 */
function getEntryId(entry, index) {
  return `${entry.timestamp}-${index}`;
}

/**
 * Create panel HTML
 * @returns {string} HTML string
 */
function createPanelHtml() {
  const logs = getFilteredLogs();
  const stats = logger.getStats();
  const dir = document.documentElement.dir || 'ltr';

  const logsHtml = logs.length === 0
    ? '<div class="debug-console-empty">No logs to display</div>'
    : logs.map((entry, idx) => {
        const entryId = getEntryId(entry, idx);
        const isExpanded = expandedEntries.has(entryId);
        const hasData = entry.data && Object.keys(entry.data).length > 0;

        return `
          <div class="debug-console-entry level-${entry.level}" data-entry-id="${entryId}">
            <div class="debug-console-entry-header">
              <span class="debug-console-time">${escapeHtml(formatTime(entry.timestamp))}</span>
              <span class="debug-console-level level-${entry.level}">${escapeHtml(entry.level)}</span>
              <span class="debug-console-category cat-${entry.category}">${escapeHtml(entry.category)}</span>
              <span class="debug-console-message">${escapeHtml(entry.message)}</span>
              ${hasData ? `<span class="debug-console-expand">${isExpanded ? '[-]' : '[+]'}</span>` : ''}
            </div>
            ${entry.correlationId ? `<div class="debug-console-correlation">ID: ${escapeHtml(entry.correlationId)}</div>` : ''}
            ${hasData && isExpanded ? `<pre class="debug-console-data">${escapeHtml(formatData(entry.data))}</pre>` : ''}
          </div>
        `;
      }).join('');

  return `
    <div class="debug-console-overlay" dir="${dir}" data-testid="debug-console">
      <div class="debug-console-header">
        <span class="debug-console-title">
          <svg class="debug-console-title-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
          </svg>
          Debug Console
        </span>
        <button class="debug-console-close" data-testid="debug-console-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div class="debug-console-toolbar">
        <div class="debug-console-filter-group">
          <span class="debug-console-filter-label">Level:</span>
          <label class="debug-console-checkbox level-debug">
            <input type="checkbox" data-filter="level" data-value="debug" ${levelFilters.debug ? 'checked' : ''}>
            debug
          </label>
          <label class="debug-console-checkbox level-info">
            <input type="checkbox" data-filter="level" data-value="info" ${levelFilters.info ? 'checked' : ''}>
            info
          </label>
          <label class="debug-console-checkbox level-warn">
            <input type="checkbox" data-filter="level" data-value="warn" ${levelFilters.warn ? 'checked' : ''}>
            warn
          </label>
          <label class="debug-console-checkbox level-error">
            <input type="checkbox" data-filter="level" data-value="error" ${levelFilters.error ? 'checked' : ''}>
            error
          </label>
        </div>

        <div class="debug-console-filter-group">
          <span class="debug-console-filter-label">Category:</span>
          <label class="debug-console-checkbox cat-api">
            <input type="checkbox" data-filter="category" data-value="api" ${categoryFilters.api ? 'checked' : ''}>
            api
          </label>
          <label class="debug-console-checkbox cat-user">
            <input type="checkbox" data-filter="category" data-value="user" ${categoryFilters.user ? 'checked' : ''}>
            user
          </label>
          <label class="debug-console-checkbox cat-error">
            <input type="checkbox" data-filter="category" data-value="error" ${categoryFilters.error ? 'checked' : ''}>
            error
          </label>
          <label class="debug-console-checkbox cat-system">
            <input type="checkbox" data-filter="category" data-value="system" ${categoryFilters.system ? 'checked' : ''}>
            system
          </label>
        </div>

        <input
          type="text"
          class="debug-console-search"
          placeholder="Search logs..."
          value="${escapeHtml(searchQuery)}"
          data-testid="debug-console-search"
        >

        <div class="debug-console-actions">
          <button class="debug-console-btn danger" data-action="clear" data-testid="debug-console-clear">Clear</button>
          <button class="debug-console-btn" data-action="export" data-testid="debug-console-export">Export</button>
        </div>
      </div>

      <div class="debug-console-logs" data-testid="debug-console-logs">
        ${logsHtml}
      </div>

      <div class="debug-console-footer">
        <div class="debug-console-stats">
          <span class="debug-console-stat">
            <span class="debug-console-stat-dot level-debug"></span>
            ${stats.levelCounts.debug || 0}
          </span>
          <span class="debug-console-stat">
            <span class="debug-console-stat-dot level-info"></span>
            ${stats.levelCounts.info || 0}
          </span>
          <span class="debug-console-stat">
            <span class="debug-console-stat-dot level-warn"></span>
            ${stats.levelCounts.warn || 0}
          </span>
          <span class="debug-console-stat">
            <span class="debug-console-stat-dot level-error"></span>
            ${stats.levelCounts.error || 0}
          </span>
          <span>| Total: ${stats.bufferSize}/${stats.maxBufferSize}</span>
        </div>
        <span class="debug-console-shortcut">Ctrl+Shift+D to toggle</span>
      </div>
    </div>
  `;
}

/**
 * Inject styles into the document
 */
function injectStyles() {
  const existingStyle = document.getElementById('debug-console-styles');
  if (existingStyle) return;

  const style = document.createElement('style');
  style.id = 'debug-console-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

/**
 * Update the panel content
 */
function updatePanel() {
  if (!panelElement || !isVisible) return;

  const currentLogCount = logger.getStats().bufferSize;

  // Only update if logs have changed or forced
  if (currentLogCount !== lastLogCount || currentLogCount === 0) {
    lastLogCount = currentLogCount;
    panelElement.innerHTML = createPanelHtml();
    setupEventHandlers();

    // Auto-scroll to bottom
    const logsContainer = panelElement.querySelector('.debug-console-logs');
    if (logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }
}

/**
 * Force update the panel (e.g., after filter change)
 */
function forceUpdatePanel() {
  lastLogCount = -1; // Force update
  updatePanel();
}

/**
 * Set up event handlers for the panel
 */
function setupEventHandlers() {
  if (!panelElement) return;

  // Close button
  const closeBtn = panelElement.querySelector('[data-testid="debug-console-close"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', hidePanel);
  }

  // Level filter checkboxes
  panelElement.querySelectorAll('input[data-filter="level"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const level = e.target.dataset.value;
      levelFilters[level] = e.target.checked;
      forceUpdatePanel();
    });
  });

  // Category filter checkboxes
  panelElement.querySelectorAll('input[data-filter="category"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const category = e.target.dataset.value;
      categoryFilters[category] = e.target.checked;
      forceUpdatePanel();
    });
  });

  // Search input
  const searchInput = panelElement.querySelector('[data-testid="debug-console-search"]');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      forceUpdatePanel();
      // Re-focus the input after update
      const newInput = panelElement.querySelector('[data-testid="debug-console-search"]');
      if (newInput) {
        newInput.focus();
        newInput.selectionStart = newInput.selectionEnd = newInput.value.length;
      }
    });
  }

  // Clear button
  const clearBtn = panelElement.querySelector('[data-action="clear"]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      logger.clearLogs();
      expandedEntries.clear();
      forceUpdatePanel();
    });
  }

  // Export button
  const exportBtn = panelElement.querySelector('[data-action="export"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      // Build filter based on current state
      const filter = {};

      // Only set category filter if not all categories are selected
      const selectedCategories = Object.entries(categoryFilters)
        .filter(([, v]) => v)
        .map(([k]) => k);

      if (selectedCategories.length === 1) {
        filter.category = selectedCategories[0];
      }

      if (searchQuery) {
        filter.search = searchQuery;
      }

      logger.exportLogs(Object.keys(filter).length > 0 ? filter : null);
    });
  }

  // Log entry click to expand/collapse data
  panelElement.querySelectorAll('.debug-console-entry').forEach(entry => {
    entry.addEventListener('click', () => {
      const entryId = entry.dataset.entryId;
      if (expandedEntries.has(entryId)) {
        expandedEntries.delete(entryId);
      } else {
        expandedEntries.add(entryId);
      }
      forceUpdatePanel();
    });
  });
}

/**
 * Show the debug panel
 */
function showPanel() {
  if (!panelElement) {
    panelElement = document.createElement('div');
    panelElement.id = 'debug-console-container';
    document.body.appendChild(panelElement);
  }

  isVisible = true;
  localStorage.setItem('debugMode', 'true');
  forceUpdatePanel();

  // Start refresh interval
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(updatePanel, 500);

  logger.info('system', 'Debug console opened');
}

/**
 * Hide the debug panel
 */
function hidePanel() {
  isVisible = false;
  localStorage.setItem('debugMode', 'false');

  if (panelElement) {
    panelElement.innerHTML = '';
  }

  // Stop refresh interval
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }

  logger.info('system', 'Debug console closed');
}

/**
 * Toggle panel visibility
 */
function togglePanel() {
  if (isVisible) {
    hidePanel();
  } else {
    showPanel();
  }
}

/**
 * Handle keyboard shortcut
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeydown(e) {
  // Ctrl+Shift+D to toggle debug console
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    togglePanel();
  }
}

/**
 * Initialize the debug console
 * Sets up keyboard shortcut and auto-shows if debugMode is enabled
 */
export function initDebugConsole() {
  // Inject styles
  injectStyles();

  // Set up keyboard shortcut
  document.addEventListener('keydown', handleKeydown);

  // Check if debugMode is enabled in localStorage
  const debugMode = localStorage.getItem('debugMode');
  if (debugMode === 'true') {
    showPanel();
  }

  logger.debug('system', 'Debug console initialized (Ctrl+Shift+D to toggle)');

  // Return API for programmatic control
  return {
    show: showPanel,
    hide: hidePanel,
    toggle: togglePanel,
    isVisible: () => isVisible
  };
}

export default {
  initDebugConsole
};
