// Delete User Confirm Dialog Component - Modal dialog for confirming user deletion
import i18n from '../i18n.js?v=5';

// Store references for cleanup
let currentOverlay = null;
let currentDialog = null;
let currentResolve = null;
let currentKeydownHandler = null;
let isLoading = false;
let currentUserService = null;

// Form state
let currentUser = null;
let confirmValue = '';
let apiError = null;
let showSuccess = false;

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
 * Get focusable elements within a container
 * @param {HTMLElement} container - Container element
 * @returns {NodeList} Focusable elements
 */
function getFocusableElements(container) {
  return container.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
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

  // Focus the confirmation input
  const confirmInput = dialog.querySelector('[data-testid="confirm-input"]');
  if (confirmInput && !confirmInput.disabled) {
    confirmInput.focus();
  } else if (firstElement) {
    firstElement.focus();
  }
}

/**
 * Get the display name for a user (prefer email over UUID username)
 * @returns {string} Display name
 */
function getUserDisplayName() {
  return currentUser?.email || currentUser?.username || '';
}

/**
 * Check if username confirmation matches
 * @returns {boolean} True if matches
 */
function isConfirmationValid() {
  const displayName = getUserDisplayName();
  return confirmValue === displayName;
}

/**
 * Create dialog HTML
 * @returns {string} HTML string
 */
function createDialogHtml() {
  const titleId = generateId();
  const disabled = isLoading ? 'disabled' : '';
  const deleteDisabled = (isLoading || !isConfirmationValid()) ? 'disabled' : '';

  let statusContent = '';
  if (isLoading) {
    statusContent = `
      <div data-testid="loading-indicator" class="flex items-center justify-center py-2 text-blue-600">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>${escapeHtml(i18n.t('common.loading'))}</span>
      </div>
    `;
  } else if (showSuccess) {
    statusContent = `
      <div data-testid="success-message" class="flex items-center py-2 px-3 bg-green-50 text-green-700 rounded border border-green-200">
        <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>${escapeHtml(i18n.t('users.deleteSuccess'))}</span>
      </div>
    `;
  } else if (apiError) {
    statusContent = `
      <div data-testid="api-error" class="flex items-center py-2 px-3 bg-red-50 text-red-700 rounded border border-red-200">
        <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
        <span>${escapeHtml(apiError)}</span>
      </div>
    `;
  }

  return `
    <div
      data-testid="delete-user-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="${titleId}"
      class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 relative z-50"
    >
      <div class="flex items-start mb-4">
        <div
          data-testid="warning-icon"
          class="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-600 mr-4"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        </div>
        <div class="flex-1">
          <h2
            id="${titleId}"
            data-testid="dialog-title"
            class="text-xl font-semibold text-gray-900"
          >
            ${escapeHtml(i18n.t('users.deleteUser'))}
          </h2>
        </div>
      </div>

      <div class="space-y-4">
        <p data-testid="warning-message" class="text-gray-600">
          ${escapeHtml(i18n.t('users.confirmDelete'))}
        </p>

        <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <span class="text-sm text-gray-500">${escapeHtml(i18n.t('users.email'))}:</span>
          <span data-testid="username-display" class="ml-2 font-medium text-gray-900">
            ${escapeHtml(getUserDisplayName())}
          </span>
        </div>

        <div>
          <label
            data-testid="confirm-instruction"
            for="delete-confirm-input"
            class="block text-sm font-medium text-gray-700 mb-2"
          >
            ${escapeHtml(i18n.t('users.typeToConfirm'))}
          </label>
          <input
            type="text"
            id="delete-confirm-input"
            data-testid="confirm-input"
            value="${escapeHtml(confirmValue)}"
            ${disabled}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder="${escapeHtml(getUserDisplayName())}"
            autocomplete="off"
          />
        </div>

        ${statusContent}
      </div>

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
          data-testid="delete-button"
          type="button"
          ${deleteDisabled}
          class="px-4 py-2 text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ${escapeHtml(i18n.t('users.delete'))}
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
    closeDialog({ cancelled: true });
  }
}

/**
 * Handle Delete button click
 */
async function handleDelete() {
  if (isLoading || !isConfirmationValid()) return;

  // Clear any previous errors
  apiError = null;
  isLoading = true;
  updateDialog();

  try {
    await currentUserService.deleteUser(currentUser.username);

    // Show success
    isLoading = false;
    showSuccess = true;
    updateDialog();

    // Auto-close after success
    setTimeout(() => {
      closeDialog({
        success: true,
        username: currentUser.username
      });
    }, 2000);
  } catch (error) {
    isLoading = false;
    if (error.code === 'CANNOT_DELETE_SELF') {
      apiError = i18n.t('users.cannotDeleteSelf');
    } else {
      apiError = i18n.t('users.deleteError');
    }
    updateDialog();
  }
}

/**
 * Update only the delete button's disabled state (without re-rendering)
 */
function updateDeleteButtonState() {
  if (!currentDialog) return;

  const deleteBtn = currentDialog.querySelector('[data-testid="delete-button"]');
  if (deleteBtn) {
    const shouldDisable = isLoading || !isConfirmationValid();
    deleteBtn.disabled = shouldDisable;
  }
}

/**
 * Update the dialog content
 */
function updateDialog() {
  if (!currentOverlay || !currentDialog) return;

  const newHtml = createDialogHtml();

  // Create a temporary container to get the new dialog
  const temp = document.createElement('div');
  temp.innerHTML = newHtml;
  const newDialog = temp.firstElementChild;

  // Replace the current dialog
  currentDialog.replaceWith(newDialog);
  currentDialog = newDialog;

  // Re-attach event handlers
  setupDialogEventHandlers();
}

/**
 * Set up event handlers on the dialog
 */
function setupDialogEventHandlers() {
  if (!currentDialog) return;

  const confirmInput = currentDialog.querySelector('[data-testid="confirm-input"]');
  const deleteBtn = currentDialog.querySelector('[data-testid="delete-button"]');
  const cancelBtn = currentDialog.querySelector('[data-testid="cancel-button"]');

  if (confirmInput) {
    confirmInput.addEventListener('input', (e) => {
      confirmValue = e.target.value;
      // Only update delete button disabled state, don't re-render whole dialog
      updateDeleteButtonState();
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!deleteBtn.disabled) {
        handleDelete();
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (!cancelBtn.disabled) {
        closeDialog({ cancelled: true });
      }
    });
  }

  // Prevent clicks inside dialog from bubbling to overlay
  currentDialog.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

/**
 * Close the dialog and resolve the promise
 * @param {Object} result - Result to resolve with
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
  currentUserService = null;

  // Reset form state
  currentUser = null;
  confirmValue = '';
  apiError = null;
  showSuccess = false;
}

/**
 * Show the delete user confirm dialog
 * @param {Object} options - Dialog options
 * @param {Object} options.user - User object with username
 * @param {Object} options.userService - User service with deleteUser method
 * @returns {Promise<Object>} Resolves with result
 */
export function showDeleteUserConfirmDialog(options = {}) {
  const { user, userService } = options;

  // Close any existing dialog
  if (currentOverlay) {
    currentOverlay.remove();
  }

  // Store user service and user data
  currentUserService = userService;
  currentUser = user;

  // Reset form state
  confirmValue = '';
  apiError = null;
  showSuccess = false;
  isLoading = false;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.setAttribute('data-testid', 'delete-user-confirm-dialog-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40';
  overlay.innerHTML = createDialogHtml();

  // Get dialog reference
  const dialog = overlay.querySelector('[data-testid="delete-user-confirm-dialog"]');

  // Store references
  currentOverlay = overlay;
  currentDialog = dialog;

  // Add to DOM
  document.body.appendChild(overlay);

  // Set up event handlers
  setupDialogEventHandlers();

  // Set up focus trap
  setupFocusTrap(dialog);

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

  return promise;
}

/**
 * Programmatically hide/close the delete user confirm dialog
 */
export function hideDeleteUserConfirmDialog() {
  if (currentOverlay) {
    closeDialog({ cancelled: true });
  }
}
