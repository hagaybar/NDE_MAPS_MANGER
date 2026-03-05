// Edit Location Dialog Component - Modal for editing location rows
import i18n from '../i18n.js?v=5';
import { renderBilingualField, renderField, renderSelectField, getBilingualFormData } from './bilingual-field.js?v=5';
import { renderSvgAutocomplete, initSvgAutocomplete, updateAutocompleteFloor, validateSvgCode } from './svg-autocomplete.js?v=5';
import { validateRow, VALIDATION_RULES, VALIDATION_ERRORS, VALIDATION_WARNINGS } from '../services/data-model.js?v=6';

// Fallback translations
const FALLBACKS = {
  'dialog.editLocation': { en: 'Edit Location', he: 'עריכת מיקום' },
  'dialog.addLocation': { en: 'Add Location', he: 'הוספת מיקום' },
  'dialog.save': { en: 'Save', he: 'שמור' },
  'dialog.cancel': { en: 'Cancel', he: 'ביטול' },
  'dialog.saving': { en: 'Saving...', he: 'שומר...' },
  'dialog.unsavedChanges': { en: 'You have unsaved changes', he: 'יש שינויים שלא נשמרו' },
  'dialog.discardChanges': { en: 'Discard changes?', he: 'לבטל שינויים?' },
  'field.library': { en: 'Library', he: 'ספרייה' },
  'field.collection': { en: 'Collection', he: 'אוסף' },
  'field.rangeStart': { en: 'Range Start', he: 'תחילת טווח' },
  'field.rangeEnd': { en: 'Range End', he: 'סוף טווח' },
  'field.floor': { en: 'Floor', he: 'קומה' },
  'field.svgCode': { en: 'SVG Code', he: 'קוד SVG' },
  'field.description': { en: 'Description', he: 'תיאור' },
  'field.shelfLabel': { en: 'Shelf Label', he: 'תווית מדף' },
  'field.notes': { en: 'Notes', he: 'הערות' },
  'validation.hasErrors': { en: 'Please fix errors before saving', he: 'נא לתקן שגיאות לפני שמירה' },
  'validation.hasWarnings': { en: 'Continue with warnings?', he: 'להמשיך עם אזהרות?' }
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
let currentRow = null;
let originalRow = null;
let isLoading = false;
let fieldErrors = {};
let currentKeydownHandler = null;
let currentAllRows = [];
let currentOnSave = null;
let currentIsNew = false;

// Predefined options
const FLOOR_OPTIONS = [
  { value: '0', label: 'floor.0' },
  { value: '1', label: 'floor.1' },
  { value: '2', label: 'floor.2' }
];

const LIBRARY_OPTIONS = [
  { value: 'Sourasky Central Library', label: 'Sourasky Central Library' }
];

// Collection options (will be populated from data)
let collectionOptions = [];

/**
 * Set available collections
 * @param {Array} collections - Array of {name, nameHe} objects
 */
export function setCollections(collections) {
  collectionOptions = collections.map(c => ({
    value: c.name,
    label: c.name,
    nameHe: c.nameHe
  }));
}

/**
 * Show the edit location dialog
 * @param {Object} options - Dialog options
 * @param {Object} [options.row] - Row data to edit (null for new row)
 * @param {Array} [options.allRows] - All rows for duplicate checking
 * @param {Function} [options.onSave] - Save callback
 * @returns {Promise<Object>} Resolves with result
 */
export function showEditLocationDialog(options = {}) {
  const { row = null, allRows = [], onSave } = options;
  const isNew = !row;

  // Close any existing dialog
  if (currentOverlay) {
    currentOverlay.remove();
  }

  // Initialize state
  currentRow = row ? { ...row } : createEmptyRow();
  originalRow = row ? { ...row } : null;
  isLoading = false;
  fieldErrors = {};
  currentAllRows = allRows;
  currentOnSave = onSave;
  currentIsNew = isNew;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.setAttribute('data-testid', 'edit-location-dialog-overlay');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  overlay.innerHTML = createDialogHtml(isNew);

  // Get dialog reference
  const dialog = overlay.querySelector('[data-testid="edit-location-dialog"]');

  // Store references
  currentOverlay = overlay;
  currentDialog = dialog;

  // Add to DOM
  document.body.appendChild(overlay);

  // Initialize autocomplete
  initSvgAutocomplete(dialog, (code) => {
    currentRow.svgCode = code;
  });

  // Set up event handlers
  setupDialogEventHandlers(allRows, onSave, isNew);

  // Create promise
  const promise = new Promise((resolve) => {
    currentResolve = resolve;
  });

  // Set up keyboard handler
  currentKeydownHandler = (e) => handleKeydown(e);
  document.addEventListener('keydown', currentKeydownHandler);

  // Handle overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !isLoading) {
      handleCancel();
    }
  });

  // Focus first field
  const firstInput = dialog.querySelector('input:not([disabled]), select:not([disabled])');
  if (firstInput) {
    firstInput.focus();
  }

  return promise;
}

/**
 * Create empty row data
 * @returns {Object} Empty row
 */
function createEmptyRow() {
  return {
    libraryName: 'Sourasky Central Library',
    libraryNameHe: 'הספרייה המרכזית סוראסקי',
    collectionName: '',
    collectionNameHe: '',
    rangeStart: '',
    rangeEnd: '',
    svgCode: '',
    description: '',
    descriptionHe: '',
    floor: '0',
    shelfLabel: '',
    shelfLabelHe: '',
    notes: '',
    notesHe: ''
  };
}

/**
 * Create dialog HTML
 * @param {boolean} isNew - Whether this is a new row
 * @returns {string} HTML string
 */
function createDialogHtml(isNew) {
  const titleKey = isNew ? 'dialog.addLocation' : 'dialog.editLocation';
  const title = t(titleKey);
  const saveText = isLoading ? t('dialog.saving') : t('dialog.save');
  const cancelText = t('dialog.cancel');
  const disabled = isLoading ? 'disabled' : '';

  // Build collection options from current row context
  const collectionOpts = collectionOptions.length > 0
    ? collectionOptions
    : [{ value: currentRow.collectionName, label: currentRow.collectionName }];

  return `
    <div
      data-testid="edit-location-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-dialog-title"
      class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h2 id="edit-dialog-title" class="text-xl font-semibold text-gray-900">
          ${escapeHtml(title)}
        </h2>
        <button
          type="button"
          data-testid="close-button"
          class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
          ${disabled}
          aria-label="${escapeHtml(cancelText)}"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <form data-testid="edit-form" class="flex-1 overflow-y-auto px-6 py-4">
        <div class="space-y-4">
          <!-- Library & Collection -->
          <div class="grid grid-cols-2 gap-4">
            ${renderSelectField({
              name: 'floor',
              label: 'field.floor',
              value: currentRow.floor,
              options: FLOOR_OPTIONS.map(o => ({ ...o, label: t(o.label) || `Floor ${o.value}` })),
              required: true,
              error: fieldErrors.floor,
              disabled: isLoading
            })}
            ${renderSelectField({
              name: 'collectionName',
              label: 'field.collection',
              value: currentRow.collectionName,
              options: collectionOpts,
              required: true,
              error: fieldErrors.collectionName,
              disabled: isLoading
            })}
          </div>

          <!-- Range -->
          <div class="grid grid-cols-2 gap-4">
            ${renderField({
              name: 'rangeStart',
              label: 'field.rangeStart',
              value: currentRow.rangeStart,
              required: true,
              error: fieldErrors.rangeStart,
              disabled: isLoading,
              placeholder: 'e.g., 570 or ML001'
            })}
            ${renderField({
              name: 'rangeEnd',
              label: 'field.rangeEnd',
              value: currentRow.rangeEnd,
              required: true,
              error: fieldErrors.rangeEnd,
              disabled: isLoading,
              placeholder: 'e.g., 580 or ML099'
            })}
          </div>

          <!-- SVG Code -->
          ${renderSvgAutocomplete({
            name: 'svgCode',
            value: currentRow.svgCode,
            floor: currentRow.floor,
            required: true,
            error: fieldErrors.svgCode,
            disabled: isLoading
          })}

          <!-- Shelf Label (bilingual) -->
          ${renderBilingualField({
            name: 'shelfLabel',
            label: 'field.shelfLabel',
            valueEn: currentRow.shelfLabel,
            valueHe: currentRow.shelfLabelHe,
            required: false,
            errorEn: fieldErrors.shelfLabel,
            errorHe: fieldErrors.shelfLabelHe,
            disabled: isLoading
          })}

          <!-- Description (bilingual) -->
          ${renderBilingualField({
            name: 'description',
            label: 'field.description',
            valueEn: currentRow.description,
            valueHe: currentRow.descriptionHe,
            required: false,
            type: 'textarea',
            errorEn: fieldErrors.description,
            errorHe: fieldErrors.descriptionHe,
            disabled: isLoading
          })}

          <!-- Notes (bilingual) -->
          ${renderBilingualField({
            name: 'notes',
            label: 'field.notes',
            valueEn: currentRow.notes,
            valueHe: currentRow.notesHe,
            required: false,
            type: 'textarea',
            errorEn: fieldErrors.notes,
            errorHe: fieldErrors.notesHe,
            disabled: isLoading
          })}
        </div>

        ${renderValidationSummary()}
      </form>

      <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
        <button
          type="button"
          data-testid="cancel-button"
          class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          ${disabled}
        >
          ${escapeHtml(cancelText)}
        </button>
        <button
          type="button"
          data-testid="save-button"
          class="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          ${disabled}
        >
          ${isLoading ? `
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ` : ''}
          ${escapeHtml(saveText)}
        </button>
      </div>
    </div>
  `;
}

// Field name to label key mapping
const FIELD_LABELS = {
  floor: 'field.floor',
  collectionName: 'field.collection',
  rangeStart: 'field.rangeStart',
  rangeEnd: 'field.rangeEnd',
  svgCode: 'field.svgCode',
  shelfLabel: 'field.shelfLabel',
  shelfLabelHe: 'field.shelfLabel',
  description: 'field.description',
  descriptionHe: 'field.description',
  notes: 'field.notes',
  notesHe: 'field.notes',
  _save: 'common.error'
};

/**
 * Render validation summary with detailed error list
 * @returns {string} HTML string
 */
function renderValidationSummary() {
  const errorEntries = Object.entries(fieldErrors).filter(([_, e]) => e && e.length > 0);
  if (errorEntries.length === 0) return '';

  const errorList = errorEntries.map(([field, error]) => {
    const labelKey = FIELD_LABELS[field] || field;
    const fieldLabel = t(labelKey) || field;
    return `<li><strong>${escapeHtml(fieldLabel)}:</strong> ${escapeHtml(error)}</li>`;
  }).join('');

  return `
    <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-md" data-testid="validation-summary">
      <p class="text-sm text-red-700 font-medium mb-2">${escapeHtml(t('validation.hasErrors'))}</p>
      <ul class="text-sm text-red-600 list-disc list-inside space-y-1">
        ${errorList}
      </ul>
    </div>
  `;
}

/**
 * Set up event handlers on the dialog
 * @param {Array} allRows - All rows for validation
 * @param {Function} onSave - Save callback
 * @param {boolean} isNew - Whether this is a new row
 */
function setupDialogEventHandlers(allRows, onSave, isNew) {
  if (!currentDialog) return;

  const form = currentDialog.querySelector('[data-testid="edit-form"]');
  const saveBtn = currentDialog.querySelector('[data-testid="save-button"]');
  const cancelBtn = currentDialog.querySelector('[data-testid="cancel-button"]');
  const closeBtn = currentDialog.querySelector('[data-testid="close-button"]');
  const floorSelect = currentDialog.querySelector('[name="floor"]');

  // Track form changes
  if (form) {
    form.addEventListener('input', (e) => {
      const { name, value } = e.target;
      updateCurrentRow(name, value);
      validateField(name, value, allRows);
    });

    form.addEventListener('change', (e) => {
      const { name, value } = e.target;
      updateCurrentRow(name, value);

      // Update SVG autocomplete floor when floor changes
      if (name === 'floor') {
        const svgWrapper = currentDialog.querySelector('.svg-autocomplete-wrapper');
        if (svgWrapper) {
          updateAutocompleteFloor(svgWrapper, value);
          // Revalidate SVG code
          validateField('svgCode', currentRow.svgCode, allRows);
        }
      }

      // When collection changes, also set collectionNameHe from the options
      if (name === 'collectionName' && value) {
        const selectedCollection = collectionOptions.find(c => c.value === value);
        if (selectedCollection && selectedCollection.nameHe) {
          currentRow.collectionNameHe = selectedCollection.nameHe;
        } else {
          // Fallback: use the same value if Hebrew name not available
          currentRow.collectionNameHe = value;
        }
      }
    });

    // Blur validation
    form.addEventListener('blur', (e) => {
      const { name, value } = e.target;
      if (name) {
        validateField(name, value, allRows);
      }
    }, true);
  }

  // Save button
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (!saveBtn.disabled) {
        handleSave(allRows, onSave, isNew);
      }
    });
  }

  // Cancel buttons
  [cancelBtn, closeBtn].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        if (!btn.disabled) {
          handleCancel();
        }
      });
    }
  });

  // Prevent dialog close on form click
  currentDialog.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

/**
 * Update current row data
 * @param {string} name - Field name
 * @param {string} value - Field value
 */
function updateCurrentRow(name, value) {
  if (name && name in currentRow) {
    currentRow[name] = value;
  }
}

/**
 * Validate a single field
 * @param {string} name - Field name
 * @param {string} value - Field value
 * @param {Array} allRows - All rows for duplicate checking
 */
function validateField(name, value, allRows) {
  let error = '';

  // Required fields
  const requiredFields = ['rangeStart', 'rangeEnd', 'svgCode', 'floor', 'collectionName'];
  if (requiredFields.includes(name) && !value) {
    error = t('validation.required') || 'This field is required';
  }

  // Floor validation
  if (name === 'floor' && value && !['0', '1', '2'].includes(value)) {
    error = VALIDATION_ERRORS?.E003 || 'Floor must be 0, 1, or 2';
  }

  // SVG code validation
  if (name === 'svgCode' && value && currentRow.floor) {
    const svgResult = validateSvgCode(value, currentRow.floor);
    if (!svgResult.valid && svgResult.error) {
      error = svgResult.error;
    }
  }

  // Range validation
  if (name === 'rangeEnd' && currentRow.rangeStart && value) {
    const startNum = parseFloat(currentRow.rangeStart);
    const endNum = parseFloat(value);
    if (!isNaN(startNum) && !isNaN(endNum) && startNum > endNum) {
      error = VALIDATION_ERRORS?.E004 || 'Range end must be >= start';
    }
  }

  fieldErrors[name] = error;

  // Update field UI
  updateFieldError(name, error);
}

/**
 * Update field error display
 * @param {string} name - Field name
 * @param {string} error - Error message
 */
function updateFieldError(name, error) {
  if (!currentDialog) return;

  const fieldWrapper = currentDialog.querySelector(`[data-field="${name}"]`);
  if (!fieldWrapper) return;

  const input = fieldWrapper.querySelector(`[name="${name}"]`);
  const errorEl = fieldWrapper.querySelector(`#${name}-error`);

  if (input) {
    input.setAttribute('aria-invalid', error ? 'true' : 'false');
    input.classList.toggle('border-red-500', !!error);
    input.classList.toggle('bg-red-50', !!error);
  }

  if (error) {
    if (!errorEl) {
      const newError = document.createElement('p');
      newError.id = `${name}-error`;
      newError.className = 'text-xs text-red-600 mt-1';
      newError.textContent = error;
      input?.parentNode?.appendChild(newError);
    } else {
      errorEl.textContent = error;
    }
  } else if (errorEl) {
    errorEl.remove();
  }
}

/**
 * Handle save button click
 * @param {Array} allRows - All rows
 * @param {Function} onSave - Save callback
 * @param {boolean} isNew - Whether this is a new row
 */
async function handleSave(allRows, onSave, isNew) {
  if (isLoading) return;

  // Validate all required fields
  const requiredFields = ['rangeStart', 'rangeEnd', 'svgCode', 'floor', 'collectionName'];
  let hasErrors = false;

  requiredFields.forEach(field => {
    validateField(field, currentRow[field], allRows);
    if (fieldErrors[field]) {
      hasErrors = true;
    }
  });

  if (hasErrors) {
    // Show validation summary
    updateValidationSummary();
    return;
  }

  // Full row validation
  const validation = validateRow(currentRow, allRows, originalRow);
  if (validation.errors && validation.errors.length > 0) {
    // Map errors to fields
    validation.errors.forEach(err => {
      const fieldMatch = err.message?.match(/field|range|svg|floor|collection/i);
      if (err.field) {
        fieldErrors[err.field] = err.message;
        updateFieldError(err.field, err.message);
      }
    });
    hasErrors = true;
  }

  if (hasErrors) {
    updateValidationSummary();
    return;
  }

  // Handle warnings - could show confirmation dialog
  if (validation.warnings && validation.warnings.length > 0) {
    // For now, allow save with warnings
    console.log('Saving with warnings:', validation.warnings);
  }

  isLoading = true;
  updateDialogState(isNew);

  try {
    if (typeof onSave === 'function') {
      const result = await onSave(currentRow, isNew);
      // Handle explicit false return (save failed but didn't throw)
      if (result === false) {
        throw new Error('Save operation failed');
      }
    }

    closeDialog({
      success: true,
      row: currentRow,
      isNew
    });
  } catch (error) {
    isLoading = false;
    updateDialogState(isNew);
    console.error('Save failed:', error);
    // Show error message to user
    fieldErrors._save = error.message || 'Failed to save changes';
    updateValidationSummary();
  }
}

/**
 * Update validation summary display with detailed error list
 */
function updateValidationSummary() {
  if (!currentDialog) return;

  const form = currentDialog.querySelector('[data-testid="edit-form"]');
  let summary = form.querySelector('[data-testid="validation-summary"]');

  const errorEntries = Object.entries(fieldErrors).filter(([_, e]) => e && e.length > 0);

  if (errorEntries.length > 0) {
    const errorList = errorEntries.map(([field, error]) => {
      const labelKey = FIELD_LABELS[field] || field;
      const fieldLabel = t(labelKey) || field;
      return `<li><strong>${escapeHtml(fieldLabel)}:</strong> ${escapeHtml(error)}</li>`;
    }).join('');

    const html = `
      <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-md" data-testid="validation-summary">
        <p class="text-sm text-red-700 font-medium mb-2">${escapeHtml(t('validation.hasErrors'))}</p>
        <ul class="text-sm text-red-600 list-disc list-inside space-y-1">
          ${errorList}
        </ul>
      </div>
    `;
    if (summary) {
      summary.outerHTML = html;
    } else {
      form.insertAdjacentHTML('beforeend', html);
    }
  } else if (summary) {
    summary.remove();
  }
}

/**
 * Update dialog state (loading, etc.)
 * @param {boolean} isNew - Whether this is a new row
 */
function updateDialogState(isNew) {
  if (!currentDialog || !currentOverlay) return;

  const newHtml = createDialogHtml(isNew);
  const temp = document.createElement('div');
  temp.innerHTML = newHtml;
  const newDialog = temp.firstElementChild;

  currentDialog.replaceWith(newDialog);
  currentDialog = newDialog;

  // Re-setup all event handlers using stored module state
  setupDialogEventHandlers(currentAllRows, currentOnSave, currentIsNew);

  // Re-init SVG autocomplete
  initSvgAutocomplete(currentDialog, (code) => {
    currentRow.svgCode = code;
  });
}

/**
 * Handle cancel
 */
function handleCancel() {
  // Check for unsaved changes
  if (originalRow && hasChanges()) {
    // Could show confirmation dialog
    // For now, just close
  }

  closeDialog({ cancelled: true });
}

/**
 * Check if row has changes
 * @returns {boolean} Whether row has changes
 */
function hasChanges() {
  if (!originalRow) return false;

  const keys = Object.keys(currentRow);
  return keys.some(key => String(currentRow[key] || '') !== String(originalRow[key] || ''));
}

/**
 * Handle keydown
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeydown(e) {
  if (e.key === 'Escape' && !isLoading) {
    e.preventDefault();
    handleCancel();
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
  originalRow = null;
  fieldErrors = {};
}

/**
 * Hide the dialog programmatically
 */
export function hideEditLocationDialog() {
  if (currentOverlay) {
    closeDialog({ cancelled: true });
  }
}
