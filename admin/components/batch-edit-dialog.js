// Batch Edit Dialog Component - Modal for editing multiple locations at once
import i18n from '../i18n.js?v=5';
import { renderSelectField } from './bilingual-field.js?v=5';

// Fallback translations
const FALLBACKS = {
  'batch.title': { en: 'Batch Edit', he: 'עריכה קבוצתית' },
  'batch.selectedCount': { en: '{count} locations selected', he: '{count} מיקומים נבחרו' },
  'batch.selectFields': { en: 'Select fields to update', he: 'בחר שדות לעדכון' },
  'batch.noFieldsSelected': { en: 'Select at least one field to update', he: 'בחר לפחות שדה אחד לעדכון' },
  'batch.apply': { en: 'Apply Changes', he: 'החל שינויים' },
  'batch.cancel': { en: 'Cancel', he: 'ביטול' },
  'batch.applying': { en: 'Applying...', he: 'מחיל...' },
  'batch.success': { en: 'Changes applied successfully', he: 'השינויים הוחלו בהצלחה' },
  'batch.floor': { en: 'Floor', he: 'קומה' },
  'batch.collection': { en: 'Collection', he: 'אוסף' },
  'batch.keepExisting': { en: 'Keep existing value', he: 'שמור ערך קיים' }
};

/**
 * Translation helper with fallbacks
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
let selectedRows = [];
let fieldSelections = {
  floor: false,
  collection: false
};
let fieldValues = {
  floor: '',
  collectionName: '',
  collectionNameHe: ''
};
let collectionOptions = [];

/**
 * Set available collections
 * @param {Array} collections - Array of {name, nameHe} objects
 */
export function setCollectionOptions(collections) {
  collectionOptions = collections;
}

/**
 * Create dialog HTML
 */
function createDialogHtml() {
  const disabled = isLoading ? 'disabled' : '';
  const count = selectedRows.length;
  const locale = i18n.getLocale() || 'en';

  const floorOptions = [
    { value: '', label: t('batch.keepExisting') },
    { value: '0', label: locale === 'he' ? 'קומת כניסה' : 'Entrance Floor' },
    { value: '1', label: locale === 'he' ? 'קומה ראשונה' : 'First Floor' },
    { value: '2', label: locale === 'he' ? 'קומה שנייה' : 'Second Floor' }
  ];

  const collectionOpts = [
    { value: '', label: t('batch.keepExisting') },
    ...collectionOptions.map(c => ({
      value: c.name,
      label: locale === 'he' ? (c.nameHe || c.name) : c.name
    }))
  ];

  const anyFieldSelected = fieldSelections.floor || fieldSelections.collection;

  return `
    <div
      data-testid="batch-edit-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-edit-title"
      class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 relative z-50"
    >
      <div class="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
        <div>
          <h2 id="batch-edit-title" class="text-xl font-semibold text-gray-900">
            ${escapeHtml(t('batch.title'))}
          </h2>
          <p class="text-sm text-gray-500 mt-1">
            ${escapeHtml(t('batch.selectedCount').replace('{count}', count))}
          </p>
        </div>
        <button
          type="button"
          data-testid="close-button"
          class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
          ${disabled}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <p class="text-sm text-gray-600">${escapeHtml(t('batch.selectFields'))}</p>

        <!-- Floor Field -->
        <div class="batch-field-group">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              data-field="floor"
              ${fieldSelections.floor ? 'checked' : ''}
              ${disabled}
              class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span class="font-medium text-gray-700">${escapeHtml(t('batch.floor'))}</span>
          </label>
          ${fieldSelections.floor ? `
            <div class="mt-2 ms-7">
              <select
                name="floor"
                class="form-select w-full"
                ${disabled}
              >
                ${floorOptions.map(opt => `
                  <option value="${escapeHtml(opt.value)}" ${fieldValues.floor === opt.value ? 'selected' : ''}>
                    ${escapeHtml(opt.label)}
                  </option>
                `).join('')}
              </select>
            </div>
          ` : ''}
        </div>

        <!-- Collection Field -->
        <div class="batch-field-group">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              data-field="collection"
              ${fieldSelections.collection ? 'checked' : ''}
              ${disabled}
              class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span class="font-medium text-gray-700">${escapeHtml(t('batch.collection'))}</span>
          </label>
          ${fieldSelections.collection ? `
            <div class="mt-2 ms-7">
              <select
                name="collectionName"
                class="form-select w-full"
                ${disabled}
              >
                ${collectionOpts.map(opt => `
                  <option value="${escapeHtml(opt.value)}" ${fieldValues.collectionName === opt.value ? 'selected' : ''}>
                    ${escapeHtml(opt.label)}
                  </option>
                `).join('')}
              </select>
            </div>
          ` : ''}
        </div>

        ${!anyFieldSelected ? `
          <p class="text-sm text-amber-600 bg-amber-50 p-3 rounded-md">
            ${escapeHtml(t('batch.noFieldsSelected'))}
          </p>
        ` : ''}

        ${isLoading ? `
          <div class="flex items-center justify-center py-2 text-blue-600">
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>${escapeHtml(t('batch.applying'))}</span>
          </div>
        ` : ''}
      </div>

      <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        <button
          data-testid="cancel-button"
          type="button"
          ${disabled}
          class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ${escapeHtml(t('batch.cancel'))}
        </button>
        <button
          data-testid="apply-button"
          type="button"
          ${disabled || !anyFieldSelected ? 'disabled' : ''}
          class="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ${escapeHtml(t('batch.apply'))}
        </button>
      </div>
    </div>
  `;
}

/**
 * Handle keydown
 */
function handleKeydown(e) {
  if (e.key === 'Escape' && !isLoading) {
    e.preventDefault();
    closeDialog({ cancelled: true });
  }
}

/**
 * Close the dialog
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
  selectedRows = [];
  fieldSelections = { floor: false, collection: false };
  fieldValues = { floor: '', collectionName: '', collectionNameHe: '' };
}

/**
 * Update dialog
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

  // Field checkboxes
  currentDialog.querySelectorAll('[data-field]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const field = e.target.dataset.field;
      fieldSelections[field] = e.target.checked;
      updateDialog();
    });
  });

  // Field value selects
  const floorSelect = currentDialog.querySelector('[name="floor"]');
  if (floorSelect) {
    floorSelect.addEventListener('change', (e) => {
      fieldValues.floor = e.target.value;
    });
  }

  const collectionSelect = currentDialog.querySelector('[name="collectionName"]');
  if (collectionSelect) {
    collectionSelect.addEventListener('change', (e) => {
      fieldValues.collectionName = e.target.value;
      // Find Hebrew name
      const collection = collectionOptions.find(c => c.name === e.target.value);
      fieldValues.collectionNameHe = collection?.nameHe || '';
    });
  }

  // Apply button
  const applyBtn = currentDialog.querySelector('[data-testid="apply-button"]');
  if (applyBtn) {
    applyBtn.addEventListener('click', handleApply);
  }

  // Cancel/Close buttons
  const cancelBtn = currentDialog.querySelector('[data-testid="cancel-button"]');
  const closeBtn = currentDialog.querySelector('[data-testid="close-button"]');
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
 * Handle apply button
 */
function handleApply() {
  if (isLoading) return;

  // Build changes object
  const changes = {};

  if (fieldSelections.floor && fieldValues.floor) {
    changes.floor = fieldValues.floor;
  }

  if (fieldSelections.collection && fieldValues.collectionName) {
    changes.collectionName = fieldValues.collectionName;
    changes.collectionNameHe = fieldValues.collectionNameHe;
  }

  if (Object.keys(changes).length === 0) {
    return;
  }

  closeDialog({
    applied: true,
    changes,
    indices: selectedRows.map(r => r._index)
  });
}

/**
 * Show the batch edit dialog
 * @param {Object} options - Dialog options
 * @param {Array} options.rows - Selected rows to edit
 * @param {Array} options.collections - Available collections
 * @returns {Promise<Object>} Resolves with result
 */
export function showBatchEditDialog(options = {}) {
  const { rows = [], collections = [] } = options;

  // Close any existing dialog
  if (currentOverlay) {
    currentOverlay.remove();
  }

  // Store state
  selectedRows = rows;
  collectionOptions = collections;
  isLoading = false;
  fieldSelections = { floor: false, collection: false };
  fieldValues = { floor: '', collectionName: '', collectionNameHe: '' };

  // Create overlay
  const overlay = document.createElement('div');
  overlay.setAttribute('data-testid', 'batch-edit-dialog-overlay');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  overlay.innerHTML = createDialogHtml();

  // Get dialog reference
  const dialog = overlay.querySelector('[data-testid="batch-edit-dialog"]');

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

  return promise;
}

/**
 * Hide the dialog programmatically
 */
export function hideBatchEditDialog() {
  if (currentOverlay) {
    closeDialog({ cancelled: true });
  }
}
