// Edit User Dialog Component - Modal dialog for editing user
import i18n from '../i18n.js?v=5';
import { validateRangeConfig, createEmptyRangeConfig, VALID_FLOORS } from '../utils/range-filter.js';

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

// Editable ranges state
let rangesEnabled = false;
let filterGroups = [];
let rangesSectionExpanded = false;
let rangeValidationErrors = [];

// Available collections (will be populated from CSV data or passed in)
let availableCollections = [];

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
 * Create an empty filter group
 * @returns {Object} Empty filter group
 */
function createEmptyFilterGroup() {
  return {
    collections: [],
    floors: [],
    callNumberRanges: []
  };
}

/**
 * Generate HTML for a call number range input pair
 * @param {number} groupIndex - Filter group index
 * @param {number} rangeIndex - Range index within group
 * @param {Object} range - Range object with start and end
 * @param {boolean} disabled - Whether inputs should be disabled
 * @returns {string} HTML string
 */
function createCallNumberRangeHtml(groupIndex, rangeIndex, range, disabled) {
  const disabledAttr = disabled ? 'disabled' : '';
  return `
    <div class="flex items-center gap-2 mb-2" data-range-index="${rangeIndex}">
      <input
        type="text"
        data-testid="range-start-${groupIndex}-${rangeIndex}"
        data-group="${groupIndex}"
        data-range="${rangeIndex}"
        data-field="start"
        value="${escapeHtml(range.start || '')}"
        placeholder="${escapeHtml(i18n.t('ranges.rangeStartPlaceholder'))}"
        ${disabledAttr}
        class="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      />
      <span class="text-gray-500">-</span>
      <input
        type="text"
        data-testid="range-end-${groupIndex}-${rangeIndex}"
        data-group="${groupIndex}"
        data-range="${rangeIndex}"
        data-field="end"
        value="${escapeHtml(range.end || '')}"
        placeholder="${escapeHtml(i18n.t('ranges.rangeEndPlaceholder'))}"
        ${disabledAttr}
        class="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      />
      <button
        type="button"
        data-testid="remove-range-${groupIndex}-${rangeIndex}"
        data-action="remove-range"
        data-group="${groupIndex}"
        data-range="${rangeIndex}"
        ${disabledAttr}
        class="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        title="${escapeHtml(i18n.t('ranges.removeRange'))}"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  `;
}

/**
 * Generate HTML for a single filter group
 * @param {number} groupIndex - Filter group index
 * @param {Object} group - Filter group data
 * @param {boolean} disabled - Whether controls should be disabled
 * @returns {string} HTML string
 */
function createFilterGroupHtml(groupIndex, group, disabled) {
  const disabledAttr = disabled ? 'disabled' : '';

  // Collections multi-select (checkboxes)
  const collectionsHtml = availableCollections.map(collection => {
    const isChecked = group.collections && group.collections.includes(collection) ? 'checked' : '';
    return `
      <label class="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
        <input
          type="checkbox"
          data-testid="collection-${groupIndex}-${collection.replace(/[^a-zA-Z0-9]/g, '_')}"
          data-group="${groupIndex}"
          data-collection="${escapeHtml(collection)}"
          ${isChecked}
          ${disabledAttr}
          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
        />
        <span class="truncate">${escapeHtml(collection)}</span>
      </label>
    `;
  }).join('');

  // Floors checkboxes
  const floorsHtml = VALID_FLOORS.map(floor => {
    const isChecked = group.floors && group.floors.includes(floor) ? 'checked' : '';
    const floorLabel = i18n.t(`floor.${floor}`);
    return `
      <label class="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
        <input
          type="checkbox"
          data-testid="floor-${groupIndex}-${floor}"
          data-group="${groupIndex}"
          data-floor="${floor}"
          ${isChecked}
          ${disabledAttr}
          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
        />
        <span>${escapeHtml(floorLabel)}</span>
      </label>
    `;
  }).join('');

  // Call number ranges
  const ranges = group.callNumberRanges || [];
  const rangesHtml = ranges.length > 0
    ? ranges.map((range, rangeIndex) => createCallNumberRangeHtml(groupIndex, rangeIndex, range, disabled)).join('')
    : `<p class="text-sm text-gray-500 italic">${escapeHtml(i18n.t('ranges.noRanges'))}</p>`;

  return `
    <div class="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50" data-testid="filter-group-${groupIndex}" data-group-index="${groupIndex}">
      <div class="flex justify-between items-center mb-3">
        <h4 class="font-medium text-gray-700">
          ${escapeHtml(i18n.t('ranges.filterGroup'))} ${groupIndex + 1}
        </h4>
        ${filterGroups.length > 1 ? `
          <button
            type="button"
            data-testid="remove-group-${groupIndex}"
            data-action="remove-group"
            data-group="${groupIndex}"
            ${disabledAttr}
            class="text-sm text-red-600 hover:text-red-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ${escapeHtml(i18n.t('ranges.removeGroup'))}
          </button>
        ` : ''}
      </div>

      <!-- Collections -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-600 mb-1">
          ${escapeHtml(i18n.t('ranges.collections'))}
        </label>
        <div class="max-h-32 overflow-y-auto border border-gray-200 rounded p-2 bg-white">
          ${collectionsHtml || `<p class="text-sm text-gray-500 italic">${escapeHtml(i18n.t('ranges.noCollectionsAvailable'))}</p>`}
        </div>
        <p class="mt-1 text-xs text-gray-500">${escapeHtml(i18n.t('ranges.collectionsHelp'))}</p>
      </div>

      <!-- Floors -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-600 mb-1">
          ${escapeHtml(i18n.t('ranges.floors'))}
        </label>
        <div class="flex flex-wrap gap-4">
          ${floorsHtml}
        </div>
        <p class="mt-1 text-xs text-gray-500">${escapeHtml(i18n.t('ranges.floorsHelp'))}</p>
      </div>

      <!-- Call Number Ranges -->
      <div>
        <label class="block text-sm font-medium text-gray-600 mb-1">
          ${escapeHtml(i18n.t('ranges.callNumberRanges'))}
        </label>
        <div data-testid="ranges-container-${groupIndex}" class="mb-2">
          ${rangesHtml}
        </div>
        <button
          type="button"
          data-testid="add-range-${groupIndex}"
          data-action="add-range"
          data-group="${groupIndex}"
          ${disabledAttr}
          class="text-sm text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + ${escapeHtml(i18n.t('ranges.addRange'))}
        </button>
        <p class="mt-1 text-xs text-gray-500">${escapeHtml(i18n.t('ranges.callNumberHelp'))}</p>
      </div>
    </div>
  `;
}

/**
 * Generate HTML for the editable ranges section
 * @param {boolean} disabled - Whether controls should be disabled
 * @returns {string} HTML string
 */
function createRangesSectionHtml(disabled) {
  const disabledAttr = disabled ? 'disabled' : '';
  const isEditor = roleValue === 'editor';

  if (!isEditor) {
    return ''; // Don't show for admins
  }

  const expandIcon = rangesSectionExpanded
    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>'
    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>';

  const validationErrorsHtml = rangeValidationErrors.length > 0 ? `
    <div class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
      <p class="font-medium">${escapeHtml(i18n.t('ranges.validationErrors'))}:</p>
      <ul class="list-disc list-inside mt-1">
        ${rangeValidationErrors.map(err => `<li>${escapeHtml(err.message)}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const filterGroupsHtml = filterGroups.map((group, index) =>
    createFilterGroupHtml(index, group, disabled)
  ).join('');

  const contentHtml = rangesSectionExpanded ? `
    <div class="mt-3 pt-3 border-t border-gray-200">
      <!-- Enable/Disable Toggle -->
      <div class="flex items-center mb-4">
        <label class="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            data-testid="ranges-enabled-toggle"
            ${rangesEnabled ? 'checked' : ''}
            ${disabledAttr}
            class="sr-only peer"
          />
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
          <span class="ms-3 text-sm font-medium text-gray-700" data-testid="ranges-enabled-text">
            ${rangesEnabled ? escapeHtml(i18n.t('ranges.restrictionsEnabled')) : escapeHtml(i18n.t('ranges.restrictionsDisabled'))}
          </span>
        </label>
      </div>

      ${rangesEnabled ? `
        <!-- Filter Groups -->
        <div data-testid="filter-groups-container">
          ${filterGroupsHtml || `
            <p class="text-sm text-gray-500 italic mb-3">${escapeHtml(i18n.t('ranges.noFilterGroups'))}</p>
          `}
        </div>

        <!-- Add Filter Group Button -->
        <button
          type="button"
          data-testid="add-filter-group"
          data-action="add-group"
          ${disabledAttr}
          class="text-sm text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + ${escapeHtml(i18n.t('ranges.addFilterGroup'))}
        </button>

        <!-- OR Logic Explanation -->
        <p class="mt-3 text-xs text-gray-500 bg-blue-50 p-2 rounded">
          <strong>${escapeHtml(i18n.t('ranges.note'))}:</strong> ${escapeHtml(i18n.t('ranges.orLogicExplanation'))}
        </p>

        ${validationErrorsHtml}
      ` : `
        <p class="text-sm text-gray-500 italic">
          ${escapeHtml(i18n.t('ranges.disabledExplanation'))}
        </p>
      `}
    </div>
  ` : '';

  return `
    <div class="mt-4 border border-gray-200 rounded-lg" data-testid="editable-ranges-section">
      <button
        type="button"
        data-testid="ranges-section-toggle"
        data-action="toggle-ranges-section"
        class="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span class="font-medium text-gray-700">${escapeHtml(i18n.t('ranges.editableRanges'))}</span>
        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          ${expandIcon}
        </svg>
      </button>
      ${contentHtml}
    </div>
  `;
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
      class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 relative z-50 max-h-[90vh] overflow-y-auto"
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
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
              <span class="ms-3 text-sm font-medium text-gray-700" data-testid="enabled-status-text">
                ${enabledValue ? escapeHtml(i18n.t('users.enabled')) : escapeHtml(i18n.t('users.disabled'))}
              </span>
            </label>
          </div>
        </div>

        ${createRangesSectionHtml(isLoading)}

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
 * Build the allowedRanges configuration from form state
 * @returns {Object|null} Range configuration or null if not applicable
 */
function buildAllowedRanges() {
  // Only build for editors
  if (roleValue !== 'editor') {
    return null;
  }

  // If ranges are not enabled, return a disabled config
  if (!rangesEnabled) {
    return createEmptyRangeConfig();
  }

  // Build the config from filter groups
  const config = {
    enabled: true,
    filterGroups: filterGroups.map(group => ({
      collections: group.collections || [],
      floors: group.floors || [],
      callNumberRanges: (group.callNumberRanges || []).filter(r => r.start || r.end)
    }))
  };

  return config;
}

/**
 * Validate the range configuration before saving
 * @returns {boolean} True if valid
 */
function validateRanges() {
  rangeValidationErrors = [];

  // Only validate for editors with enabled ranges
  if (roleValue !== 'editor' || !rangesEnabled) {
    return true;
  }

  const config = buildAllowedRanges();
  if (!config) {
    return true;
  }

  const validation = validateRangeConfig(config);
  if (!validation.valid) {
    rangeValidationErrors = validation.errors;
    return false;
  }

  // Additional validation: check that call number ranges have both start and end
  for (let groupIndex = 0; groupIndex < filterGroups.length; groupIndex++) {
    const group = filterGroups[groupIndex];
    if (group.callNumberRanges) {
      for (let rangeIndex = 0; rangeIndex < group.callNumberRanges.length; rangeIndex++) {
        const range = group.callNumberRanges[rangeIndex];
        if ((range.start && !range.end) || (!range.start && range.end)) {
          rangeValidationErrors.push({
            type: 'INCOMPLETE_RANGE',
            message: i18n.t('ranges.incompleteRange', {
              group: groupIndex + 1,
              range: rangeIndex + 1
            }),
            path: `filterGroups[${groupIndex}].callNumberRanges[${rangeIndex}]`
          });
        }
      }
    }
  }

  return rangeValidationErrors.length === 0;
}

/**
 * Handle Save button click
 */
async function handleSave() {
  if (isLoading) return;

  // Validate ranges before saving
  if (!validateRanges()) {
    updateDialog();
    return;
  }

  // Clear any previous errors
  apiError = null;
  isLoading = true;
  updateDialog();

  try {
    // Build update payload
    const updatePayload = {
      role: roleValue,
      enabled: enabledValue
    };

    // Include allowedRanges for editors
    const allowedRanges = buildAllowedRanges();
    if (allowedRanges !== null) {
      updatePayload.allowedRanges = allowedRanges;
    }

    await currentUserService.updateUser(currentUser.username, updatePayload);

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
        enabled: enabledValue,
        allowedRanges: allowedRanges
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
      // Re-render to show/hide ranges section based on role
      updateDialog();
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

  // Set up ranges section event handlers
  setupRangesEventHandlers();

  // Prevent clicks inside dialog from bubbling to overlay
  currentDialog.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

/**
 * Set up event handlers for the editable ranges section
 */
function setupRangesEventHandlers() {
  if (!currentDialog) return;

  // Toggle ranges section expand/collapse
  const toggleBtn = currentDialog.querySelector('[data-testid="ranges-section-toggle"]');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      rangesSectionExpanded = !rangesSectionExpanded;
      updateDialog();
    });
  }

  // Ranges enabled toggle
  const rangesEnabledToggle = currentDialog.querySelector('[data-testid="ranges-enabled-toggle"]');
  if (rangesEnabledToggle) {
    rangesEnabledToggle.addEventListener('change', (e) => {
      rangesEnabled = e.target.checked;
      // Initialize with one filter group if enabling for the first time
      if (rangesEnabled && filterGroups.length === 0) {
        filterGroups.push(createEmptyFilterGroup());
      }
      updateDialog();
    });
  }

  // Add filter group button
  const addGroupBtn = currentDialog.querySelector('[data-testid="add-filter-group"]');
  if (addGroupBtn) {
    addGroupBtn.addEventListener('click', () => {
      filterGroups.push(createEmptyFilterGroup());
      updateDialog();
    });
  }

  // Handle clicks on dynamic buttons (remove group, add range, remove range)
  currentDialog.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action');
    const groupIndex = parseInt(btn.getAttribute('data-group'), 10);
    const rangeIndex = parseInt(btn.getAttribute('data-range'), 10);

    btn.addEventListener('click', () => {
      if (btn.disabled) return;

      switch (action) {
        case 'remove-group':
          if (filterGroups.length > 1) {
            filterGroups.splice(groupIndex, 1);
            updateDialog();
          }
          break;
        case 'add-range':
          if (filterGroups[groupIndex]) {
            if (!filterGroups[groupIndex].callNumberRanges) {
              filterGroups[groupIndex].callNumberRanges = [];
            }
            filterGroups[groupIndex].callNumberRanges.push({ start: '', end: '' });
            updateDialog();
          }
          break;
        case 'remove-range':
          if (filterGroups[groupIndex] && filterGroups[groupIndex].callNumberRanges) {
            filterGroups[groupIndex].callNumberRanges.splice(rangeIndex, 1);
            updateDialog();
          }
          break;
      }
    });
  });

  // Collection checkboxes
  currentDialog.querySelectorAll('input[data-collection]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const groupIndex = parseInt(e.target.getAttribute('data-group'), 10);
      const collection = e.target.getAttribute('data-collection');

      if (filterGroups[groupIndex]) {
        if (!filterGroups[groupIndex].collections) {
          filterGroups[groupIndex].collections = [];
        }

        if (e.target.checked) {
          if (!filterGroups[groupIndex].collections.includes(collection)) {
            filterGroups[groupIndex].collections.push(collection);
          }
        } else {
          const index = filterGroups[groupIndex].collections.indexOf(collection);
          if (index > -1) {
            filterGroups[groupIndex].collections.splice(index, 1);
          }
        }
      }
    });
  });

  // Floor checkboxes
  currentDialog.querySelectorAll('input[data-floor]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const groupIndex = parseInt(e.target.getAttribute('data-group'), 10);
      const floor = parseInt(e.target.getAttribute('data-floor'), 10);

      if (filterGroups[groupIndex]) {
        if (!filterGroups[groupIndex].floors) {
          filterGroups[groupIndex].floors = [];
        }

        if (e.target.checked) {
          if (!filterGroups[groupIndex].floors.includes(floor)) {
            filterGroups[groupIndex].floors.push(floor);
          }
        } else {
          const index = filterGroups[groupIndex].floors.indexOf(floor);
          if (index > -1) {
            filterGroups[groupIndex].floors.splice(index, 1);
          }
        }
      }
    });
  });

  // Call number range inputs
  currentDialog.querySelectorAll('input[data-field="start"], input[data-field="end"]').forEach(input => {
    input.addEventListener('input', (e) => {
      const groupIndex = parseInt(e.target.getAttribute('data-group'), 10);
      const rangeIndex = parseInt(e.target.getAttribute('data-range'), 10);
      const field = e.target.getAttribute('data-field');

      if (filterGroups[groupIndex] && filterGroups[groupIndex].callNumberRanges &&
          filterGroups[groupIndex].callNumberRanges[rangeIndex]) {
        filterGroups[groupIndex].callNumberRanges[rangeIndex][field] = e.target.value;
      }
    });
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

  // Reset ranges state
  rangesEnabled = false;
  filterGroups = [];
  rangesSectionExpanded = false;
  rangeValidationErrors = [];
  availableCollections = [];
}

/**
 * Show the edit user dialog
 * @param {Object} options - Dialog options
 * @param {Object} options.user - User object with username, role, enabled, allowedRanges
 * @param {Object} options.userService - User service with updateUser method
 * @param {string[]} options.collections - Available collection names for selection
 * @returns {Promise<Object>} Resolves with result
 */
export function showEditUserDialog(options = {}) {
  const { user, userService, collections = [] } = options;

  // Close any existing dialog
  if (currentOverlay) {
    currentOverlay.remove();
  }

  // Store user service and user data
  currentUserService = userService;
  currentUser = user;

  // Set available collections
  availableCollections = collections;

  // Initialize form state from user
  roleValue = user?.role || 'editor';
  enabledValue = user?.enabled !== undefined ? user.enabled : true;
  apiError = null;
  showSuccess = false;
  isLoading = false;

  // Initialize ranges state from user's existing configuration
  rangesSectionExpanded = false;
  rangeValidationErrors = [];

  if (user?.allowedRanges && typeof user.allowedRanges === 'object') {
    rangesEnabled = user.allowedRanges.enabled === true;
    filterGroups = Array.isArray(user.allowedRanges.filterGroups)
      ? JSON.parse(JSON.stringify(user.allowedRanges.filterGroups)) // Deep copy
      : [];
    // Expand section if user has existing ranges configured
    if (rangesEnabled && filterGroups.length > 0) {
      rangesSectionExpanded = true;
    }
  } else {
    rangesEnabled = false;
    filterGroups = [];
  }

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
