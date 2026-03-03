// Restore Confirm Dialog Component - Modal confirmation for restore operations
import i18n from '../i18n.js?v=3';

// Store references for cleanup
let currentDialog = null;
let currentOverlay = null;
let currentResolve = null;
let currentKeydownHandler = null;
let isLoading = false;

/**
 * Generate unique ID for ARIA attributes
 * @returns {string} Unique ID
 */
function generateId() {
  return `dialog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

/**
 * Format timestamp in localized format
 * @param {string} timestamp - ISO timestamp string
 * @param {string} locale - Locale code ('en' or 'he')
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp, locale = 'en') {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return date.toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', options);
}

/**
 * Get focusable elements within a container
 * @param {HTMLElement} container - Container element
 * @returns {NodeList} Focusable elements
 */
function getFocusableElements(container) {
  return container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
  );
}

/**
 * Set up focus trap within dialog
 * @param {HTMLElement} dialog - Dialog element
 */
function setupFocusTrap(dialog) {
  const focusableElements = getFocusableElements(dialog);
  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  });

  // Focus the cancel button (safer default)
  const cancelBtn = dialog.querySelector('[data-testid="cancel-button"]');
  if (cancelBtn && !cancelBtn.disabled) {
    cancelBtn.focus();
  } else if (firstElement) {
    firstElement.focus();
  }
}

/**
 * Create dialog HTML
 * @param {Object} options - Dialog options
 * @returns {string} HTML string
 */
function createDialogHtml(options) {
  const {
    version = {},
    showLoading = false,
    showSuccess = false,
    showError = false,
    errorMessage = null
  } = options;

  const titleId = generateId();
  const descId = generateId();
  const locale = i18n.getLocale();
  const formattedTime = formatTimestamp(version?.timestamp, locale);
  const username = version?.username || '-';
  const disabled = showLoading ? 'disabled' : '';

  let statusContent = '';
  if (showLoading) {
    statusContent = `
      <div data-testid="loading-indicator" class="flex items-center justify-center py-2 text-blue-600">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>${escapeHtml(i18n.t('dialog.restoring'))}</span>
      </div>
    `;
  } else if (showSuccess) {
    statusContent = `
      <div data-testid="success-message" class="flex items-center py-2 px-3 bg-green-50 text-green-700 rounded border border-green-200">
        <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>${escapeHtml(i18n.t('dialog.restoreSuccess'))}</span>
      </div>
    `;
  } else if (showError) {
    const errorText = errorMessage || i18n.t('dialog.restoreError');
    statusContent = `
      <div data-testid="error-message" class="flex items-center py-2 px-3 bg-red-50 text-red-700 rounded border border-red-200">
        <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
        <span>${escapeHtml(errorText)}</span>
      </div>
    `;
  }

  return `
    <div
      data-testid="restore-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="${titleId}"
      aria-describedby="${descId}"
      class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 relative z-50"
    >
      <h2
        id="${titleId}"
        data-testid="dialog-title"
        class="text-xl font-semibold text-gray-900 mb-4"
      >
        ${escapeHtml(i18n.t('dialog.restoreConfirm'))}
      </h2>

      <div
        id="${descId}"
        data-testid="dialog-warning"
        class="text-gray-600 mb-4"
      >
        ${escapeHtml(i18n.t('dialog.restoreWarning'))}
      </div>

      <div
        data-testid="version-details"
        class="bg-gray-50 rounded p-3 mb-4 text-sm"
      >
        <div class="flex justify-between mb-1">
          <span class="text-gray-500">${escapeHtml(i18n.t('versions.timestamp'))}:</span>
          <span class="text-gray-800">${escapeHtml(formattedTime)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">${escapeHtml(i18n.t('versions.user'))}:</span>
          <span class="text-gray-800">${escapeHtml(username)}</span>
        </div>
      </div>

      ${statusContent}

      <div class="flex justify-end gap-3 mt-6">
        <button
          data-testid="cancel-button"
          type="button"
          ${disabled}
          class="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ${escapeHtml(i18n.t('dialog.cancel'))}
        </button>
        <button
          data-testid="confirm-button"
          type="button"
          ${disabled}
          class="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ${escapeHtml(i18n.t('dialog.confirm'))}
        </button>
      </div>
    </div>
  `;
}

/**
 * Handle keydown events for dialog
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeydown(e) {
  if (e.key === 'Escape' && !isLoading) {
    e.preventDefault();
    closeDialog(false);
  }
}

/**
 * Close the dialog and resolve the promise
 * @param {boolean} confirmed - Whether the user confirmed
 */
function closeDialog(confirmed) {
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
    currentResolve({ confirmed });
    currentResolve = null;
  }
  isLoading = false;
}

/**
 * Show the restore confirmation dialog
 * @param {Object} options - Dialog options
 * @param {Object} options.version - Version object with timestamp, username, versionId
 * @param {boolean} options.showLoading - Show loading state
 * @param {boolean} options.showSuccess - Show success message
 * @param {boolean} options.showError - Show error message
 * @param {string} options.errorMessage - Custom error message
 * @param {boolean} options.closeOnOverlayClick - Close when clicking overlay
 * @returns {Promise<{confirmed: boolean}>} Resolves with confirmation result
 */
export function showRestoreDialog(options = {}) {
  const { closeOnOverlayClick = false, showLoading = false } = options;

  // Close any existing dialog
  if (currentOverlay) {
    currentOverlay.remove();
  }

  isLoading = showLoading;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.setAttribute('data-testid', 'dialog-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40';
  overlay.innerHTML = createDialogHtml(options);

  // Get dialog reference
  const dialog = overlay.querySelector('[data-testid="restore-dialog"]');

  // Store references
  currentOverlay = overlay;
  currentDialog = dialog;

  // Add to DOM
  document.body.appendChild(overlay);

  // Set up focus trap
  setupFocusTrap(dialog);

  // Create promise
  const promise = new Promise((resolve) => {
    currentResolve = resolve;
  });

  // Set up button handlers
  const confirmBtn = dialog.querySelector('[data-testid="confirm-button"]');
  const cancelBtn = dialog.querySelector('[data-testid="cancel-button"]');

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (!confirmBtn.disabled) {
        closeDialog(true);
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (!cancelBtn.disabled) {
        closeDialog(false);
      }
    });
  }

  // Set up overlay click handler
  if (closeOnOverlayClick) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !isLoading) {
        closeDialog(false);
      }
    });
  }

  // Set up keyboard handler
  currentKeydownHandler = handleKeydown;
  document.addEventListener('keydown', currentKeydownHandler);

  // Prevent clicks inside dialog from bubbling to overlay
  dialog.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  return promise;
}

/**
 * Programmatically hide/close the restore dialog
 */
export function hideRestoreDialog() {
  if (currentOverlay) {
    closeDialog(false);
  }
}

/**
 * Update the dialog state (for loading, success, error)
 * @param {Object} options - New options
 */
export function updateRestoreDialog(options) {
  if (!currentOverlay || !currentDialog) return;

  const newHtml = createDialogHtml(options);

  // Create a temporary container to get the new dialog
  const temp = document.createElement('div');
  temp.innerHTML = newHtml;
  const newDialog = temp.firstElementChild;

  // Replace the current dialog
  currentDialog.replaceWith(newDialog);
  currentDialog = newDialog;

  // Update loading state
  isLoading = options.showLoading || false;

  // Re-setup focus trap if not loading
  if (!isLoading) {
    setupFocusTrap(currentDialog);
  }

  // Re-attach event handlers
  const confirmBtn = currentDialog.querySelector('[data-testid="confirm-button"]');
  const cancelBtn = currentDialog.querySelector('[data-testid="cancel-button"]');

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (!confirmBtn.disabled) {
        closeDialog(true);
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (!cancelBtn.disabled) {
        closeDialog(false);
      }
    });
  }

  // Prevent clicks inside dialog from bubbling
  currentDialog.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}
