// Version Preview Component - Side panel/modal showing read-only preview of CSV version content
import i18n from '../i18n.js?v=3';

const API_ENDPOINT = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod';

// Module-level variables
let currentOnClose = null;
let currentOnRestore = null;
let currentVersionId = null;
let escapeHandler = null;

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
 * @returns {Array} Array of row objects
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
 * Render the loading state
 * @returns {string} HTML for loading state
 */
function renderLoadingState() {
  return `
    <div data-testid="preview-loading" class="flex items-center justify-center py-12 text-gray-500">
      <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      ${escapeHtml(i18n.t('preview.loading'))}
    </div>
  `;
}

/**
 * Render the error state
 * @returns {string} HTML for error state
 */
function renderErrorState() {
  return `
    <div data-testid="preview-error" class="flex flex-col items-center justify-center py-12 text-red-500">
      <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
      <p>${escapeHtml(i18n.t('preview.error'))}</p>
    </div>
  `;
}

/**
 * Render the CSV table
 * @param {Object} csvData - Parsed CSV data with headers and rows
 * @returns {string} HTML for table
 */
function renderTable(csvData) {
  const { headers, rows } = csvData;

  if (headers.length === 0) {
    return '<p class="text-gray-500 text-center py-4">No data available</p>';
  }

  return `
    <table data-testid="preview-table" class="min-w-full border-collapse">
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
        ${rows.map(row => `
          <tr class="hover:bg-gray-50">
            ${row.map(cell => `
              <td class="px-3 py-2 text-sm text-gray-700 border-b border-gray-100" dir="auto">
                ${escapeHtml(cell)}
              </td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Render metadata section
 * @param {Object} metadata - Version metadata
 * @returns {string} HTML for metadata
 */
function renderMetadata(metadata) {
  const formattedTime = formatTimestamp(metadata.timestamp);

  return `
    <div data-testid="preview-metadata" class="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-4">
      <span>
        <strong>${escapeHtml(i18n.t('versions.timestamp'))}:</strong> ${escapeHtml(formattedTime)}
      </span>
      <span>
        <strong>${escapeHtml(i18n.t('versions.user'))}:</strong> ${escapeHtml(metadata.username)}
      </span>
    </div>
  `;
}

/**
 * Render the modal structure
 * @returns {string} HTML for modal shell
 */
function renderModal() {
  const titleId = 'preview-modal-title';

  return `
    <div
      data-testid="version-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="${titleId}"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <!-- Backdrop -->
      <div
        data-testid="preview-backdrop"
        class="absolute inset-0 bg-black bg-opacity-50"
      ></div>

      <!-- Modal content -->
      <div class="relative bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 id="${titleId}" class="text-xl font-semibold text-gray-800">
            ${escapeHtml(i18n.t('preview.title'))}
          </h2>
          <button
            data-testid="preview-close-button"
            class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="${escapeHtml(i18n.t('preview.close'))}"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div id="preview-body" class="flex-1 p-4 overflow-hidden flex flex-col">
          <!-- Metadata will be inserted here -->
          <div id="preview-metadata-container"></div>

          <!-- Scrollable table container -->
          <div
            data-testid="preview-scroll-container"
            class="flex-1 overflow-auto max-h-[60vh] border border-gray-200 rounded"
          >
            <div id="preview-content">
              ${renderLoadingState()}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button
            data-testid="preview-restore-button"
            class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            ${escapeHtml(i18n.t('preview.restoreThis'))}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Set up event listeners for the modal
 */
function setupEventListeners() {
  const modal = document.querySelector('[data-testid="version-preview-modal"]');
  if (!modal) return;

  // Close button
  const closeButton = modal.querySelector('[data-testid="preview-close-button"]');
  closeButton?.addEventListener('click', () => {
    const onClose = currentOnClose;
    hideVersionPreview();
    onClose?.();
  });

  // Backdrop click
  const backdrop = modal.querySelector('[data-testid="preview-backdrop"]');
  backdrop?.addEventListener('click', () => {
    const onClose = currentOnClose;
    hideVersionPreview();
    onClose?.();
  });

  // Restore button
  const restoreButton = modal.querySelector('[data-testid="preview-restore-button"]');
  restoreButton?.addEventListener('click', () => {
    const onRestore = currentOnRestore;
    const versionId = currentVersionId;
    onRestore?.(versionId);
  });

  // Escape key handler
  escapeHandler = (e) => {
    if (e.key === 'Escape') {
      const onClose = currentOnClose;
      hideVersionPreview();
      onClose?.();
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

/**
 * Fetch version content from API
 * @param {string} versionId - Version ID to fetch
 * @returns {Promise<Object>} Version content and metadata
 */
async function fetchVersionContent(versionId) {
  const response = await fetch(`${API_ENDPOINT}/api/versions/csv/${versionId}`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

/**
 * Show the version preview modal
 * @param {Object} options - Configuration options
 * @param {string} options.versionId - Version ID to preview
 * @param {Function} options.onClose - Callback when modal is closed
 * @param {Function} options.onRestore - Callback when restore button is clicked
 */
export async function showVersionPreview(options = {}) {
  const { versionId, onClose = null, onRestore = null } = options;

  // Remove any existing modal (don't clear callbacks yet)
  hideVersionPreview(false);

  // Store callbacks and versionId
  currentOnClose = onClose;
  currentOnRestore = onRestore;
  currentVersionId = versionId;

  // Create modal container
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = renderModal();
  document.body.appendChild(modalContainer.firstElementChild);

  // Set up event listeners
  setupEventListeners();

  // Fetch and display content
  const contentContainer = document.getElementById('preview-content');
  const metadataContainer = document.getElementById('preview-metadata-container');

  try {
    const data = await fetchVersionContent(versionId);

    // Parse CSV content
    const csvData = parseCSV(data.content);

    // Render metadata
    metadataContainer.innerHTML = renderMetadata({
      timestamp: data.timestamp,
      username: data.username
    });

    // Render table
    contentContainer.innerHTML = renderTable(csvData);
  } catch (error) {
    console.error('Failed to load version content:', error);
    contentContainer.innerHTML = renderErrorState();
  }
}

/**
 * Hide and remove the version preview modal
 * @param {boolean} clearCallbacks - Whether to clear stored callbacks (default: true)
 */
export function hideVersionPreview(clearCallbacks = true) {
  const modal = document.querySelector('[data-testid="version-preview-modal"]');
  if (modal) {
    modal.remove();
  }

  // Remove escape key handler
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }

  // Clear callbacks only if requested
  if (clearCallbacks) {
    currentOnClose = null;
    currentOnRestore = null;
    currentVersionId = null;
  }
}
