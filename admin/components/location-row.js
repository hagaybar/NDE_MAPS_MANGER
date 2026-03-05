// Location Row Component - Individual location display with actions
import i18n from '../i18n.js?v=5';

// Fallback translations
const FALLBACKS = {
  'row.selectRow': { en: 'Select row', he: 'בחר שורה' },
  'row.floor': { en: 'Floor', he: 'קומה' },
  'card.edit': { en: 'Edit', he: 'עריכה' },
  'card.delete': { en: 'Delete', he: 'מחיקה' }
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

/**
 * Validate a location row and return validation status
 * @param {Object} row - Row data
 * @returns {Object} Validation result { hasError: boolean, hasWarning: boolean, messages: string[] }
 */
export function validateRow(row) {
  const result = {
    hasError: false,
    hasWarning: false,
    messages: []
  };

  // Required field validation
  if (!row.rangeStart && !row.rangeEnd) {
    result.hasError = true;
    result.messages.push('Range is required');
  }

  if (!row.svgCode) {
    result.hasWarning = true;
    result.messages.push('SVG code is missing');
  }

  if (!row.floor && row.floor !== '0' && row.floor !== 0) {
    result.hasWarning = true;
    result.messages.push('Floor is not specified');
  }

  // Range validation (if both start and end exist)
  if (row.rangeStart && row.rangeEnd) {
    // Check if numeric ranges are in order
    const startNum = parseFloat(row.rangeStart);
    const endNum = parseFloat(row.rangeEnd);
    if (!isNaN(startNum) && !isNaN(endNum) && startNum > endNum) {
      result.hasError = true;
      result.messages.push('Range start must be less than or equal to range end');
    }
  }

  // Floor validation
  const floor = String(row.floor || '');
  if (floor && !['0', '1', '2'].includes(floor)) {
    result.hasError = true;
    result.messages.push('Floor must be 0, 1, or 2');
  }

  return result;
}

/**
 * Render a single location row
 * @param {Object} row - Row data
 * @param {string} floor - Floor number
 * @param {boolean} isSelected - Whether the row is selected
 * @param {Object} validationResult - Optional pre-computed validation result
 * @returns {string} HTML string
 */
export function renderLocationRow(row, floor, isSelected = false, validationResult = null) {
  const locale = i18n.getLocale() || 'en';

  // Format range display
  const range = formatRange(row.rangeStart, row.rangeEnd);

  // Get localized shelf label
  const shelfLabel = locale === 'he'
    ? (row.shelfLabelHe || row.shelfLabel || '-')
    : (row.shelfLabel || row.shelfLabelHe || '-');

  // Get localized collection name
  const collection = locale === 'he'
    ? (row.collectionNameHe || row.collectionName || '-')
    : (row.collectionName || row.collectionNameHe || '-');

  // Get validation status
  const validation = validationResult || validateRow(row);
  const statusClass = validation.hasError
    ? 'location-row--error'
    : (validation.hasWarning ? 'location-row--warning' : '');

  // Build tooltip for validation messages
  const tooltip = validation.messages.length > 0
    ? `title="${escapeHtml(validation.messages.join(', '))}"`
    : '';

  const selectLabel = FALLBACKS['row.selectRow'][locale];
  const floorLabel = FALLBACKS['row.floor'][locale];
  const editLabel = t('card.edit');
  const deleteLabel = t('card.delete');

  // Create accessible description for screen readers
  const rowDescription = `${collection}, ${range}, ${floorLabel} ${floor}`;

  return `
    <div class="location-row ${statusClass}"
         data-index="${row._index}"
         ${tooltip}
         role="listitem"
         aria-label="${escapeHtml(rowDescription)}">
      <div class="location-row-checkbox">
        <input type="checkbox"
               class="row-checkbox"
               data-index="${row._index}"
               ${isSelected ? 'checked' : ''}
               aria-label="${escapeHtml(selectLabel)}: ${escapeHtml(range)}">
      </div>
      <div class="location-row-content">
        <div class="location-row-main">
          <span class="location-floor-badge floor-${floor}" role="img" aria-label="${escapeHtml(floorLabel)} ${floor}">
            ${escapeHtml(floorLabel)} ${floor}
          </span>
          <span class="location-range" dir="auto">${escapeHtml(range)}</span>
          <span class="location-shelf" dir="auto">${escapeHtml(shelfLabel)}</span>
        </div>
        <div class="location-row-secondary">
          <span class="location-collection" dir="auto">${escapeHtml(collection)}</span>
          ${row.svgCode ? `<span class="location-svg-code">${escapeHtml(row.svgCode)}</span>` : ''}
        </div>
      </div>
      <div class="location-row-actions" role="group" aria-label="Actions">
        <button class="btn-row-action btn-edit"
                data-index="${row._index}"
                title="${escapeHtml(editLabel)}"
                aria-label="${escapeHtml(editLabel)}: ${escapeHtml(range)}"
                type="button">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button class="btn-row-action btn-delete"
                data-index="${row._index}"
                data-role-required="admin"
                title="${escapeHtml(deleteLabel)}"
                aria-label="${escapeHtml(deleteLabel)}: ${escapeHtml(range)}"
                type="button">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * Format range for display
 * @param {string} rangeStart - Start of range
 * @param {string} rangeEnd - End of range
 * @returns {string} Formatted range string
 */
function formatRange(rangeStart, rangeEnd) {
  if (!rangeStart && !rangeEnd) {
    return '-';
  }
  if (!rangeEnd || rangeStart === rangeEnd) {
    return rangeStart || '-';
  }
  if (!rangeStart) {
    return rangeEnd;
  }
  return `${rangeStart} - ${rangeEnd}`;
}

/**
 * Render a compact location row (for use in lists/selectors)
 * @param {Object} row - Row data
 * @returns {string} HTML string
 */
export function renderCompactRow(row) {
  const locale = i18n.getLocale() || 'en';
  const floor = String(row.floor || '0');
  const range = formatRange(row.rangeStart, row.rangeEnd);
  const shelfLabel = locale === 'he'
    ? (row.shelfLabelHe || row.shelfLabel || '-')
    : (row.shelfLabel || row.shelfLabelHe || '-');

  return `
    <div class="location-row-compact" data-index="${row._index}">
      <span class="location-floor-badge floor-${floor}">${floor}</span>
      <span class="location-range-compact" dir="auto">${escapeHtml(range)}</span>
      <span class="location-shelf-compact">${escapeHtml(shelfLabel)}</span>
    </div>
  `;
}

/**
 * Create row data object from form values
 * @param {Object} formData - Form data object
 * @returns {Object} Row data
 */
export function createRowFromForm(formData) {
  return {
    libraryName: formData.libraryName || 'Sourasky Central Library',
    libraryNameHe: formData.libraryNameHe || 'הספרייה המרכזית סוראסקי',
    collectionName: formData.collectionName || '',
    collectionNameHe: formData.collectionNameHe || '',
    rangeStart: formData.rangeStart || '',
    rangeEnd: formData.rangeEnd || '',
    svgCode: formData.svgCode || '',
    description: formData.description || '',
    descriptionHe: formData.descriptionHe || '',
    floor: String(formData.floor || '0'),
    shelfLabel: formData.shelfLabel || '',
    shelfLabelHe: formData.shelfLabelHe || '',
    notes: formData.notes || '',
    notesHe: formData.notesHe || ''
  };
}

/**
 * Compare two rows for equality
 * @param {Object} row1 - First row
 * @param {Object} row2 - Second row
 * @returns {boolean} Whether rows are equal
 */
export function rowsAreEqual(row1, row2) {
  const keys = [
    'libraryName', 'libraryNameHe', 'collectionName', 'collectionNameHe',
    'rangeStart', 'rangeEnd', 'svgCode', 'description', 'descriptionHe',
    'floor', 'shelfLabel', 'shelfLabelHe', 'notes', 'notesHe'
  ];

  return keys.every(key => String(row1[key] || '') === String(row2[key] || ''));
}

/**
 * Get row changes between original and modified
 * @param {Object} original - Original row data
 * @param {Object} modified - Modified row data
 * @returns {Object} Object with changed fields
 */
export function getRowChanges(original, modified) {
  const changes = {};
  const keys = [
    'libraryName', 'libraryNameHe', 'collectionName', 'collectionNameHe',
    'rangeStart', 'rangeEnd', 'svgCode', 'description', 'descriptionHe',
    'floor', 'shelfLabel', 'shelfLabelHe', 'notes', 'notesHe'
  ];

  keys.forEach(key => {
    const origVal = String(original[key] || '');
    const modVal = String(modified[key] || '');
    if (origVal !== modVal) {
      changes[key] = { from: origVal, to: modVal };
    }
  });

  return changes;
}
