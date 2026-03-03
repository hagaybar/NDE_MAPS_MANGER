// Edit User Dialog Component - Modal dialog for editing user
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
let roleValue = 'editor';
let enabledValue = true;
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

  // Focus the role select
  const roleSelect = dialog.querySelector('[data-testid="role-select"]');
  if (roleSelect && !roleSelect.disabled) {
    roleSelect.focus();
  } else if (firstElement) {
    firstElement.focus();
  }
}

/**
 * Create dialog HTML
 * @returns {string} HTML string
 */
function createDialogHtml() {
  const titleId = generateId();
  const disabled = isLoading ? 'disabled' : '';

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
        <span>${escapeHtml(i18n.t('users.updateSuccess'))}</span>
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
      data-testid="edit-user-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="${titleId}"
      class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 relative z-50"
    >
      <h2
        id="${titleId}"
        data-testid="dialog-title"
        class="text-xl font-semibold text-gray-900 mb-4"
      >
        ${escapeHtml(i18n.t('users.editUser'))}
      </h2>

      <form data-testid="edit-user-form" class="space-y-4">
        <div>
          <label
            data-testid="username-label"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            ${escapeHtml(i18n.t('users.username'))}
          </label>
          <div
            data-testid="username-field"
            class="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600"
          >
            ${escapeHtml(currentUser?.username || '')}
          </div>
        </div>

        <div>
          <label
            data-testid="role-label"
            for="edit-user-role"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            ${escapeHtml(i18n.t('users.role'))}
          </label>
          <select
            id="edit-user-role"
            data-testid="role-select"
            ${disabled}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="editor" ${roleValue === 'editor' ? 'selected' : ''}>
              ${escapeHtml(i18n.t('auth.editor'))}
            </option>
            <option value="admin" ${roleValue === 'admin' ? 'selected' : ''}>
              ${escapeHtml(i18n.t('auth.admin'))}
            </option>
          </select>
        </div>

        <div>
          <label
            data-testid="status-label"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            ${escapeHtml(i18n.t('users.status'))}
          </label>
          <div class="flex items-center">
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                data-testid="enabled-toggle"
                ${enabledValue ? 'checked' : ''}
                ${disabled}
                class="sr-only peer"
              />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
              <span class="ml-3 text-sm font-medium text-gray-700" data-testid="enabled-status-text">
                ${enabledValue ? escapeHtml(i18n.t('users.enabled')) : escapeHtml(i18n.t('users.disabled'))}
              </span>
            </label>
          </div>
        </div>

        ${statusContent}
      </form>

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
          data-testid="save-button"
          type="button"
          ${disabled}
          class="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ${escapeHtml(i18n.t('common.save'))}
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
 * Handle Save button click
 */
async function handleSave() {
  if (isLoading) return;

  // Clear any previous errors
  apiError = null;
  isLoading = true;
  updateDialog();

  try {
    await currentUserService.updateUser(currentUser.username, {
      role: roleValue,
      enabled: enabledValue
    });

    // Show success
    isLoading = false;
    showSuccess = true;
    updateDialog();

    // Auto-close after success
    setTimeout(() => {
      closeDialog({
        success: true,
        username: currentUser.username,
        role: roleValue,
        enabled: enabledValue
      });
    }, 2000);
  } catch (error) {
    isLoading = false;
    if (error.code === 'CANNOT_MODIFY_SELF') {
      apiError = i18n.t('users.cannotModifySelf');
    } else {
      apiError = i18n.t('users.updateError');
    }
    updateDialog();
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

  const roleSelect = currentDialog.querySelector('[data-testid="role-select"]');
  const enabledToggle = currentDialog.querySelector('[data-testid="enabled-toggle"]');
  const saveBtn = currentDialog.querySelector('[data-testid="save-button"]');
  const cancelBtn = currentDialog.querySelector('[data-testid="cancel-button"]');

  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      roleValue = e.target.value;
    });
  }

  if (enabledToggle) {
    enabledToggle.addEventListener('change', (e) => {
      enabledValue = e.target.checked;
      // Update the status text
      const statusText = currentDialog.querySelector('[data-testid="enabled-status-text"]');
      if (statusText) {
        statusText.textContent = enabledValue ? i18n.t('users.enabled') : i18n.t('users.disabled');
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (!saveBtn.disabled) {
        handleSave();
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
  roleValue = 'editor';
  enabledValue = true;
  apiError = null;
  showSuccess = false;
}

/**
 * Show the edit user dialog
 * @param {Object} options - Dialog options
 * @param {Object} options.user - User object with username, role, enabled
 * @param {Object} options.userService - User service with updateUser method
 * @returns {Promise<Object>} Resolves with result
 */
export function showEditUserDialog(options = {}) {
  const { user, userService } = options;

  // Close any existing dialog
  if (currentOverlay) {
    currentOverlay.remove();
  }

  // Store user service and user data
  currentUserService = userService;
  currentUser = user;

  // Initialize form state from user
  roleValue = user?.role || 'editor';
  enabledValue = user?.enabled !== undefined ? user.enabled : true;
  apiError = null;
  showSuccess = false;
  isLoading = false;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.setAttribute('data-testid', 'edit-user-dialog-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40';
  overlay.innerHTML = createDialogHtml();

  // Get dialog reference
  const dialog = overlay.querySelector('[data-testid="edit-user-dialog"]');

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
 * Programmatically hide/close the edit user dialog
 */
export function hideEditUserDialog() {
  if (currentOverlay) {
    closeDialog({ cancelled: true });
  }
}
