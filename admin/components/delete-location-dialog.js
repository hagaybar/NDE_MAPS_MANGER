// Delete Location Confirm Dialog Component - Modal for confirming location deletion
import i18n from '../i18n.js?v=5';

// Fallback translations
const FALLBACKS = {
  'dialog.deleteLocation': { en: 'Delete Location', he: 'מחיקת מיקום' },
  'dialog.deleteConfirm': { en: 'Are you sure you want to delete this location?', he: 'האם אתה בטוח שברצונך למחוק מיקום זה?' },
  'dialog.moveToTrash': { en: 'Move to Trash', he: 'העבר לסל המחזור' },
  'dialog.trashInfo': { en: 'This item will be moved to trash and can be restored within 30 days.', he: 'פריט זה יועבר לסל המחזור וניתן יהיה לשחזרו תוך 30 יום.' },
  'dialog.delete': { en: 'Delete', he: 'מחק' },
  'dialog.cancel': { en: 'Cancel', he: 'ביטול' },
  'common.loading': { en: 'Loading...', he: 'טוען...' }
};

/**
 * Translation helper with fallbacks
 * @param {string} key - Translation key
 * @returns {string} Translated string
 */
function t(key) {
  const value = i18n.t(key);
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale() || 'en';
    return FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  return value;
}

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

// Module state
let currentOverlay = null;
let currentDialog = null;
let currentResolve = null;
let currentKeydownHandler = null;
let isLoading = false;
let currentRow = null;

/**
 * Format range for display
 * @param {Object} row - Row data
 * @returns {string} Formatted range
 */
function formatRange(row) {
  if (!row.rangeStart && !row.rangeEnd) return '-';
  if (row.rangeStart === row.rangeEnd) return row.rangeStart;
  return `${row.rangeStart || ''} - ${row.rangeEnd || ''}`;
}

/**
 * Get localized collection name
 * @param {Object} row - Row data
 * @returns {string} Collection name
 */
function getCollectionName(row) {
  const locale = i18n.getLocale() || 'en';
  return locale === 'he'
    ? (row.collectionNameHe || row.collectionName || '-')
    : (row.collectionName || row.collectionNameHe || '-');
}

/**
 * Create dialog HTML
 * @returns {string} HTML string
 */
function createDialogHtml() {
  const disabled = isLoading ? 'disabled' : '';
  const floor = currentRow?.floor || '0';
  const range = formatRange(currentRow || {});
  const collection = getCollectionName(currentRow || {});

  return `
    <div
      data-testid="delete-location-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-location-title"
      class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 relative z-50"
    >
      <div class="flex items-start mb-4">
        <div class="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 text-amber-600 me-4">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </div>
        <div class="flex-1">
          <h2 id="delete-location-title" class="text-xl font-semibold text-gray-900">
            ${escapeHtml(t('dialog.deleteLocation'))}
          </h2>
        </div>
        <button
          type="button"
          data-testid="close-button"
          class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
          ${disabled}
          aria-label="${escapeHtml(t('dialog.cancel'))}"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <p class="text-gray-600">${escapeHtml(t('dialog.deleteConfirm'))}</p>

        <!-- Location Preview -->
        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div class="flex items-center gap-3 mb-2">
            <span class="location-floor-badge floor-${floor} px-2 py-0.5 text-xs font-medium rounded-full">
              ${escapeHtml(t('field.floor'))} ${floor}
            </span>
            <span class="font-medium text-gray-900" dir="auto">${escapeHtml(range)}</span>
          </div>
          <div class="text-sm text-gray-600" dir="auto">${escapeHtml(collection)}</div>
          ${currentRow?.svgCode ? `
            <div class="mt-2">
              <span class="text-xs text-gray-500 font-mono bg-gray-200 px-2 py-0.5 rounded">
                ${escapeHtml(currentRow.svgCode)}
              </span>
            </div>
          ` : ''}
        </div>

        <!-- Trash Info -->
        <div class="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <svg class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-sm text-blue-700">${escapeHtml(t('dialog.trashInfo'))}</p>
        </div>

        ${isLoading ? `
          <div data-testid="loading-indicator" class="flex items-center justify-center py-2 text-blue-600">
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>${escapeHtml(t('common.loading'))}</span>
          </div>
        ` : ''}
      </div>

      <div class="flex justify-end gap-3 mt-6">
        <button
          data-testid="cancel-button"
          type="button"
          ${disabled}
          class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ${escapeHtml(t('dialog.cancel'))}
        </button>
        <button
          data-testid="delete-button"
          type="button"
          ${disabled}
          class="px-4 py-2 text-white bg-amber-600 rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg class="w-4 h-4 inline-block me-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          ${escapeHtml(t('dialog.moveToTrash'))}
        </button>
      </div>
    </div>
  `;
}

/**
 * Handle keydown
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeydown(e) {
  if (e.key === 'Escape' && !isLoading) {
    e.preventDefault();
    closeDialog({ cancelled: true });
  }
}

/**
 * Close the dialog
 * @param {Object} result - Result object
 */
function closeDialog(result) {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
  if (currentDialog) {
    currentDialog = null;
  }
  if (currentKeydownHandler) {
    document.removeEventListener('keydown', currentKeydownHandler);
    currentKeydownHandler = null;
  }
  if (currentResolve) {
    currentResolve(result);
    currentResolve = null;
  }

  isLoading = false;
  currentRow = null;
}

/**
 * Update dialog state
 */
function updateDialog() {
  if (!currentOverlay || !currentDialog) return;

  const newHtml = createDialogHtml();
  const temp = document.createElement('div');
  temp.innerHTML = newHtml;
  const newDialog = temp.firstElementChild;

  currentDialog.replaceWith(newDialog);
  currentDialog = newDialog;
  setupDialogEventHandlers();
}

/**
 * Set up event handlers
 */
function setupDialogEventHandlers() {
  if (!currentDialog) return;

  const deleteBtn = currentDialog.querySelector('[data-testid="delete-button"]');
  const cancelBtn = currentDialog.querySelector('[data-testid="cancel-button"]');
  const closeBtn = currentDialog.querySelector('[data-testid="close-button"]');

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!deleteBtn.disabled) {
        closeDialog({ confirmed: true, row: currentRow });
      }
    });
  }

  [cancelBtn, closeBtn].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        if (!btn.disabled) {
          closeDialog({ cancelled: true });
        }
      });
    }
  });

  // Prevent dialog close on click inside
  currentDialog.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

/**
 * Show the delete location dialog
 * @param {Object} options - Dialog options
 * @param {Object} options.row - Row data to delete
 * @param {number} options.index - Row index
 * @returns {Promise<Object>} Resolves with result
 */
export function showDeleteLocationDialog(options = {}) {
  const { row, index } = options;

  // Close any existing dialog
  if (currentOverlay) {
    currentOverlay.remove();
  }

  // Store state
  currentRow = row ? { ...row, _index: index } : null;
  isLoading = false;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.setAttribute('data-testid', 'delete-location-dialog-overlay');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  overlay.innerHTML = createDialogHtml();

  // Get dialog reference
  const dialog = overlay.querySelector('[data-testid="delete-location-dialog"]');

  // Store references
  currentOverlay = overlay;
  currentDialog = dialog;

  // Add to DOM
  document.body.appendChild(overlay);

  // Set up event handlers
  setupDialogEventHandlers();

  // Create promise
  const promise = new Promise((resolve) => {
    currentResolve = resolve;
  });

  // Set up keyboard handler
  currentKeydownHandler = handleKeydown;
  document.addEventListener('keydown', currentKeydownHandler);

  // Handle overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !isLoading) {
      closeDialog({ cancelled: true });
    }
  });

  // Focus delete button
  const deleteBtn = dialog.querySelector('[data-testid="delete-button"]');
  if (deleteBtn) {
    deleteBtn.focus();
  }

  return promise;
}

/**
 * Hide the dialog programmatically
 */
export function hideDeleteLocationDialog() {
  if (currentOverlay) {
    closeDialog({ cancelled: true });
  }
}
