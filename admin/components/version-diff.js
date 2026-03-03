// Version Diff Component - Side-by-side diff view comparing current data vs selected version
import i18n from '../i18n.js?v=3';

// Module-level variables
let currentOnClose = null;
let escapeHandler = null;
let syncScrollHandler = null;

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
 * Parse CSV text into array of objects
 * @param {string} text - CSV content
 * @returns {Object} Object with headers and rows arrays
 */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    rows.push(values);
  }

  return { headers, rows };
}

/**
 * Parse a single CSV line, handling quoted fields
 * @param {string} line - CSV line
 * @returns {Array} Array of field values
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());

  return result;
}

/**
 * Format timestamp in localized format
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const locale = i18n.getLocale() === 'he' ? 'he-IL' : 'en-US';
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return date.toLocaleString(locale, options);
}

/**
 * Create a row key for comparison (using first column as identifier)
 * @param {Array} row - Row data
 * @returns {string} Row key
 */
function getRowKey(row) {
  return row[0] || '';
}

/**
 * Compare two rows to check if they are equal
 * @param {Array} row1 - First row
 * @param {Array} row2 - Second row
 * @returns {boolean} True if rows are equal
 */
function rowsEqual(row1, row2) {
  if (!row1 || !row2) return false;
  if (row1.length !== row2.length) return false;
  return row1.every((val, idx) => val === row2[idx]);
}

/**
 * Compute diff between current and version data
 * @param {Object} currentData - Parsed current CSV data
 * @param {Object} versionData - Parsed version CSV data
 * @returns {Object} Diff result with added, removed, changed, and unchanged
 */
function computeDiff(currentData, versionData) {
  const currentMap = new Map();
  const versionMap = new Map();

  // Build maps using first column as key
  currentData.rows.forEach((row, idx) => {
    const key = getRowKey(row);
    currentMap.set(key, { row, index: idx });
  });

  versionData.rows.forEach((row, idx) => {
    const key = getRowKey(row);
    versionMap.set(key, { row, index: idx });
  });

  const added = []; // In version but not in current
  const removed = []; // In current but not in version
  const changed = []; // In both but different values
  const unchanged = []; // Identical in both

  // Find removed and changed rows (from current perspective)
  currentMap.forEach((data, key) => {
    if (!versionMap.has(key)) {
      removed.push({ key, row: data.row, index: data.index });
    } else {
      const versionRow = versionMap.get(key).row;
      if (rowsEqual(data.row, versionRow)) {
        unchanged.push({ key, currentRow: data.row, versionRow, currentIndex: data.index, versionIndex: versionMap.get(key).index });
      } else {
        changed.push({ key, currentRow: data.row, versionRow, currentIndex: data.index, versionIndex: versionMap.get(key).index });
      }
    }
  });

  // Find added rows (in version but not in current)
  versionMap.forEach((data, key) => {
    if (!currentMap.has(key)) {
      added.push({ key, row: data.row, index: data.index });
    }
  });

  return { added, removed, changed, unchanged };
}

/**
 * Render a table for diff view
 * @param {Object} csvData - Parsed CSV data
 * @param {Object} diff - Computed diff
 * @param {string} side - 'current' or 'version'
 * @returns {string} HTML for table
 */
function renderDiffTable(csvData, diff, side) {
  const { headers, rows } = csvData;

  if (headers.length === 0) {
    return '<p class="text-gray-500 text-center py-4">No data available</p>';
  }

  const testIdPrefix = side === 'current' ? 'diff-current' : 'diff-version';

  // Build a map of row indices to diff status
  const rowStatus = new Map();

  if (side === 'current') {
    diff.removed.forEach(item => rowStatus.set(item.index, 'removed'));
    diff.changed.forEach(item => rowStatus.set(item.currentIndex, 'changed'));
  } else {
    diff.added.forEach(item => rowStatus.set(item.index, 'added'));
    diff.changed.forEach(item => rowStatus.set(item.versionIndex, 'changed'));
  }

  return `
    <table data-testid="${testIdPrefix}-table" class="min-w-full border-collapse">
      <thead class="bg-gray-50 sticky top-0">
        <tr>
          ${headers.map(header => `
            <th class="px-3 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
              ${escapeHtml(header)}
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        ${rows.map((row, idx) => {
          const status = rowStatus.get(idx) || '';
          const statusClass = status ? `diff-${status}` : '';
          const bgClass = status === 'added' ? 'bg-green-50' :
                         status === 'removed' ? 'bg-red-50' :
                         status === 'changed' ? 'bg-yellow-50' : '';

          return `
            <tr class="hover:bg-gray-50 ${statusClass} ${bgClass}">
              ${row.map(cell => `
                <td class="px-3 py-2 text-sm text-gray-700 border-b border-gray-100" dir="auto">
                  ${escapeHtml(cell)}
                </td>
              `).join('')}
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Render the summary section
 * @param {Object} diff - Computed diff
 * @returns {string} HTML for summary
 */
function renderSummary(diff) {
  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

  if (!hasChanges) {
    return `
      <div data-testid="diff-summary" class="flex items-center justify-center gap-4 p-3 bg-gray-50 rounded-lg mb-4">
        <span class="text-gray-600">${escapeHtml(i18n.t('diff.noChanges'))}</span>
      </div>
    `;
  }

  return `
    <div data-testid="diff-summary" class="flex flex-wrap items-center justify-center gap-4 p-3 bg-gray-50 rounded-lg mb-4">
      <span data-testid="diff-added-count" class="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded">
        <span class="w-3 h-3 bg-green-500 rounded-full"></span>
        ${escapeHtml(i18n.t('diff.added'))}: ${diff.added.length}
      </span>
      <span data-testid="diff-removed-count" class="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded">
        <span class="w-3 h-3 bg-red-500 rounded-full"></span>
        ${escapeHtml(i18n.t('diff.removed'))}: ${diff.removed.length}
      </span>
      <span data-testid="diff-changed-count" class="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
        <span class="w-3 h-3 bg-yellow-500 rounded-full"></span>
        ${escapeHtml(i18n.t('diff.changed'))}: ${diff.changed.length}
      </span>
    </div>
  `;
}

/**
 * Render version metadata
 * @param {Object} metadata - Version metadata
 * @returns {string} HTML for metadata
 */
function renderVersionMetadata(metadata) {
  if (!metadata || !metadata.timestamp) return '';

  const formattedTime = formatTimestamp(metadata.timestamp);

  return `
    <div class="text-xs text-gray-500 mt-1">
      ${escapeHtml(i18n.t('versions.timestamp'))}: ${escapeHtml(formattedTime)}
      ${metadata.username ? ` | ${escapeHtml(i18n.t('versions.user'))}: ${escapeHtml(metadata.username)}` : ''}
    </div>
  `;
}

/**
 * Render the modal structure
 * @param {Object} currentParsed - Parsed current CSV data
 * @param {Object} versionParsed - Parsed version CSV data
 * @param {Object} diff - Computed diff
 * @param {Object} versionMetadata - Version metadata
 * @returns {string} HTML for modal
 */
function renderModal(currentParsed, versionParsed, diff, versionMetadata) {
  const titleId = 'diff-modal-title';
  const isRTL = i18n.isRTL();

  return `
    <div
      data-testid="version-diff-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="${titleId}"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <!-- Backdrop -->
      <div
        data-testid="diff-backdrop"
        class="absolute inset-0 bg-black bg-opacity-50"
      ></div>

      <!-- Modal content -->
      <div class="relative bg-white rounded-lg shadow-xl max-w-7xl w-full mx-4 max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 id="${titleId}" class="text-xl font-semibold text-gray-800">
            ${escapeHtml(i18n.t('diff.title'))}
          </h2>
          <button
            data-testid="diff-close-button"
            class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="${escapeHtml(i18n.t('diff.close'))}"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Summary -->
        <div class="px-4 pt-4">
          ${renderSummary(diff)}
        </div>

        <!-- Body with side-by-side panels -->
        <div class="flex-1 p-4 overflow-hidden">
          <div
            data-testid="diff-panels-container"
            class="flex flex-col lg:flex-row gap-4 h-full ${isRTL ? 'lg:flex-row-reverse' : ''}"
          >
            <!-- Current Panel -->
            <div
              data-testid="diff-current-panel"
              class="flex-1 flex flex-col min-w-0"
              aria-label="${escapeHtml(i18n.t('diff.current'))}"
            >
              <h3 class="text-lg font-medium text-gray-700 mb-2">
                ${escapeHtml(i18n.t('diff.current'))}
              </h3>
              <div
                data-testid="diff-current-scroll"
                class="flex-1 overflow-auto border border-gray-200 rounded max-h-[50vh] lg:max-h-[60vh]"
              >
                ${renderDiffTable(currentParsed, diff, 'current')}
              </div>
            </div>

            <!-- Version Panel -->
            <div
              data-testid="diff-version-panel"
              class="flex-1 flex flex-col min-w-0"
              aria-label="${escapeHtml(i18n.t('diff.version'))}"
            >
              <h3 class="text-lg font-medium text-gray-700 mb-2">
                ${escapeHtml(i18n.t('diff.version'))}
                ${renderVersionMetadata(versionMetadata)}
              </h3>
              <div
                data-testid="diff-version-scroll"
                class="flex-1 overflow-auto border border-gray-200 rounded max-h-[50vh] lg:max-h-[60vh]"
              >
                ${renderDiffTable(versionParsed, diff, 'version')}
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button
            data-testid="diff-close-footer-button"
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            ${escapeHtml(i18n.t('diff.close'))}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Set up synchronized scrolling between panels
 */
function setupSyncScroll() {
  const currentScroll = document.querySelector('[data-testid="diff-current-scroll"]');
  const versionScroll = document.querySelector('[data-testid="diff-version-scroll"]');

  if (!currentScroll || !versionScroll) return;

  let isSyncing = false;

  const syncScrollFromCurrent = () => {
    if (isSyncing) return;
    isSyncing = true;
    versionScroll.scrollTop = currentScroll.scrollTop;
    versionScroll.scrollLeft = currentScroll.scrollLeft;
    requestAnimationFrame(() => { isSyncing = false; });
  };

  const syncScrollFromVersion = () => {
    if (isSyncing) return;
    isSyncing = true;
    currentScroll.scrollTop = versionScroll.scrollTop;
    currentScroll.scrollLeft = versionScroll.scrollLeft;
    requestAnimationFrame(() => { isSyncing = false; });
  };

  currentScroll.addEventListener('scroll', syncScrollFromCurrent);
  versionScroll.addEventListener('scroll', syncScrollFromVersion);

  // Store cleanup function
  syncScrollHandler = () => {
    currentScroll.removeEventListener('scroll', syncScrollFromCurrent);
    versionScroll.removeEventListener('scroll', syncScrollFromVersion);
  };
}

/**
 * Set up event listeners for the modal
 */
function setupEventListeners() {
  const modal = document.querySelector('[data-testid="version-diff-modal"]');
  if (!modal) return;

  // Close button (header)
  const closeButton = modal.querySelector('[data-testid="diff-close-button"]');
  closeButton?.addEventListener('click', () => {
    const onClose = currentOnClose;
    hideVersionDiff();
    onClose?.();
  });

  // Close button (footer)
  const closeFooterButton = modal.querySelector('[data-testid="diff-close-footer-button"]');
  closeFooterButton?.addEventListener('click', () => {
    const onClose = currentOnClose;
    hideVersionDiff();
    onClose?.();
  });

  // Backdrop click
  const backdrop = modal.querySelector('[data-testid="diff-backdrop"]');
  backdrop?.addEventListener('click', () => {
    const onClose = currentOnClose;
    hideVersionDiff();
    onClose?.();
  });

  // Escape key handler
  escapeHandler = (e) => {
    if (e.key === 'Escape') {
      const onClose = currentOnClose;
      hideVersionDiff();
      onClose?.();
    }
  };
  document.addEventListener('keydown', escapeHandler);

  // Set up synchronized scrolling
  setupSyncScroll();
}

/**
 * Show the version diff modal
 * @param {Object} options - Configuration options
 * @param {string} options.currentData - Current CSV data as string
 * @param {string} options.versionData - Version CSV data as string
 * @param {Object} options.versionMetadata - Version metadata (timestamp, username)
 * @param {Function} options.onClose - Callback when modal is closed
 */
export async function showVersionDiff(options = {}) {
  const { currentData, versionData, versionMetadata = {}, onClose = null } = options;

  // Remove any existing modal
  hideVersionDiff(false);

  // Store callback
  currentOnClose = onClose;

  // Parse CSV data
  const currentParsed = parseCSV(currentData || '');
  const versionParsed = parseCSV(versionData || '');

  // Compute diff
  const diff = computeDiff(currentParsed, versionParsed);

  // Create modal container
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = renderModal(currentParsed, versionParsed, diff, versionMetadata);
  document.body.appendChild(modalContainer.firstElementChild);

  // Set up event listeners
  setupEventListeners();
}

/**
 * Hide and remove the version diff modal
 * @param {boolean} clearCallbacks - Whether to clear stored callbacks (default: true)
 */
export function hideVersionDiff(clearCallbacks = true) {
  const modal = document.querySelector('[data-testid="version-diff-modal"]');
  if (modal) {
    modal.remove();
  }

  // Remove escape key handler
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }

  // Remove scroll sync handlers
  if (syncScrollHandler) {
    syncScrollHandler();
    syncScrollHandler = null;
  }

  // Clear callbacks only if requested
  if (clearCallbacks) {
    currentOnClose = null;
  }
}
