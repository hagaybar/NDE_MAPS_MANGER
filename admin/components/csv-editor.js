// CSV Editor Component - Bilingual CSV Table Editor
import i18n from '../i18n.js?v=5';
import { showToast } from './toast.js?v=5';
import { getAuthHeaders, getCurrentUsername } from '../app.js?v=5';
import { applyRoleBasedUI, isAdmin } from '../auth-guard.js?v=5';
import authService from '../auth-service.js?v=5';
import { filterRowsByRange, getMatchingRowIndices } from '../utils/range-filter.js?v=5';

// Fallback translations if i18n hasn't loaded yet
const FALLBACKS = {
  'csv.title': { en: 'Location Mapping Editor', he: 'עורך מיפוי מיקומים' },
  'csv.save': { en: 'Save Changes', he: 'שמור שינויים' },
  'csv.addRow': { en: 'Add Row', he: 'הוסף שורה' },
  'csv.search': { en: 'Search...', he: 'חיפוש...' },
  'csv.saveSuccess': { en: 'Changes saved successfully', he: 'השינויים נשמרו בהצלחה' },
  'csv.saveError': { en: 'Failed to save changes', he: 'שמירת השינויים נכשלה' },
  'csv.filteredRows': { en: 'Showing {shown} of {total} rows (filtered by your permissions)', he: 'מציג {shown} מתוך {total} שורות (מסונן לפי ההרשאות שלך)' },
  'csv.noAccess': { en: 'No Access to Data', he: 'אין גישה לנתונים' },
  'csv.noAccessDescription': { en: 'Your account does not have permission to edit any locations.', he: 'לחשבון שלך אין הרשאה לערוך מיקומים.' },
  'csv.contactAdmin': { en: 'Please contact an administrator to configure your access permissions.', he: 'נא לפנות למנהל כדי להגדיר את הרשאות הגישה שלך.' },
  'common.error': { en: 'An error occurred', he: 'אירעה שגיאה' },
  'common.loading': { en: 'Loading...', he: 'טוען...' }
};

function t(key) {
  const value = i18n.t(key);
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale() || 'en';
    return FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  return value;
}

// Module-level variables
let csvData = [];           // Data currently being edited (may be filtered for editors)
let originalData = [];      // Original data for change detection
let allCsvData = [];        // Complete unfiltered CSV data (for save merging)
let originalIndices = [];   // Maps filtered row index to original row index in allCsvData
let totalRowCount = 0;      // Total number of rows before filtering
let hasChanges = false;
let isFiltered = false;     // Whether data is filtered by range restrictions
let hasNoAccess = false;    // Whether editor has no access (disabled ranges or no filter groups)
const API_ENDPOINT = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod';
const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

/**
 * Initialize the CSV Editor component
 */
export function initCSVEditor() {
  const container = document.getElementById('csv-editor');
  if (!container) {
    console.error('CSV Editor container not found');
    return;
  }

  container.innerHTML = renderEditor();
  setupEditorEvents();
  loadCSV();

  // Listen for locale changes to re-render
  document.addEventListener('localeChanged', () => {
    const searchValue = document.getElementById('csv-search')?.value || '';
    container.innerHTML = renderEditor();
    setupEditorEvents();
    renderFilterBanner();
    renderTable();
    applyRoleBasedUI();
    if (searchValue) {
      document.getElementById('csv-search').value = searchValue;
      filterTable(searchValue);
    }
    updateSaveButton();
  });
}

/**
 * Render the editor container HTML
 */
function renderEditor() {
  return `
    <div class="card bg-white rounded-lg shadow p-6">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 class="text-xl font-semibold text-gray-800">${escapeHtml(t('csv.title'))}</h2>
        <div class="flex flex-wrap items-center gap-3">
          <input
            type="text"
            id="csv-search"
            placeholder="${escapeHtml(t('csv.search'))}"
            class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            dir="auto"
          >
          <button
            id="btn-add-row"
            class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            ${escapeHtml(t('csv.addRow'))}
          </button>
          <button
            id="btn-save"
            class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            disabled
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            ${escapeHtml(t('csv.save'))}
          </button>
        </div>
      </div>
      <div id="filter-info-banner"></div>
      <div id="table-container" class="overflow-x-auto">
        <div class="flex items-center justify-center py-12 text-gray-500">
          ${escapeHtml(t('common.loading'))}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the filter info banner (for editors with range restrictions)
 */
function renderFilterBanner() {
  const bannerContainer = document.getElementById('filter-info-banner');
  if (!bannerContainer) return;

  // Admin users don't see the banner
  if (isAdmin()) {
    bannerContainer.innerHTML = '';
    return;
  }

  // No access state
  if (hasNoAccess) {
    bannerContainer.innerHTML = `
      <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>
            <p class="text-red-800 font-medium">${escapeHtml(t('csv.noAccess'))}</p>
            <p class="text-red-600 text-sm">${escapeHtml(t('csv.noAccessDescription'))}</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Filtered state - show count
  if (isFiltered) {
    const filteredCount = csvData.length;
    const message = t('csv.filteredRows')
      .replace('{shown}', filteredCount.toString())
      .replace('{total}', totalRowCount.toString());

    bannerContainer.innerHTML = `
      <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-blue-800 text-sm">${escapeHtml(message)}</p>
        </div>
      </div>
    `;
    return;
  }

  // Not filtered - clear banner
  bannerContainer.innerHTML = '';
}

/**
 * Load CSV data from CloudFront
 */
async function loadCSV() {
  const tableContainer = document.getElementById('table-container');

  try {
    const response = await fetch(`${CLOUDFRONT_URL}/data/mapping.csv`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    const parsedData = parseCSV(text);

    // Store full data for reference
    allCsvData = JSON.parse(JSON.stringify(parsedData));
    totalRowCount = parsedData.length;

    // Apply filtering for editors based on their allowed ranges
    if (!isAdmin()) {
      const allowedRanges = authService.getAllowedRanges();

      // Check if editor has no access (no ranges or disabled)
      if (!allowedRanges || allowedRanges.enabled === false) {
        hasNoAccess = true;
        isFiltered = false;
        csvData = [];
        originalData = [];
        originalIndices = [];
        renderFilterBanner();
        renderTable();
        return;
      }

      // Check if filterGroups is empty
      if (!Array.isArray(allowedRanges.filterGroups) || allowedRanges.filterGroups.length === 0) {
        hasNoAccess = true;
        isFiltered = false;
        csvData = [];
        originalData = [];
        originalIndices = [];
        renderFilterBanner();
        renderTable();
        return;
      }

      // Filter rows based on allowed ranges
      hasNoAccess = false;
      isFiltered = true;
      originalIndices = getMatchingRowIndices(parsedData, allowedRanges);
      csvData = originalIndices.map(idx => JSON.parse(JSON.stringify(parsedData[idx])));
      originalData = JSON.parse(JSON.stringify(csvData));
    } else {
      // Admin sees all data
      hasNoAccess = false;
      isFiltered = false;
      csvData = parsedData;
      originalData = JSON.parse(JSON.stringify(csvData));
      originalIndices = parsedData.map((_, idx) => idx);
    }

    renderFilterBanner();
    renderTable();
    // Re-apply role-based UI visibility for dynamically added delete buttons
    applyRoleBasedUI();
  } catch (error) {
    console.error('Failed to load CSV:', error);
    tableContainer.innerHTML = `
      <div class="flex items-center justify-center py-12 text-red-500">
        ${escapeHtml(t('common.error'))}: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Parse CSV text into array of objects
 * Handles quoted fields with commas inside
 */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }

  return data;
}

/**
 * Parse a single CSV line, handling quoted fields
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
 * Render the data table
 */
function renderTable() {
  const tableContainer = document.getElementById('table-container');

  // Handle no access state for editors
  if (hasNoAccess) {
    tableContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-gray-500">
        <svg class="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        <p class="text-gray-600 font-medium">${escapeHtml(t('csv.noAccess'))}</p>
        <p class="text-gray-400 text-sm mt-1">${escapeHtml(t('csv.contactAdmin'))}</p>
      </div>
    `;
    return;
  }

  if (csvData.length === 0) {
    tableContainer.innerHTML = `
      <div class="flex items-center justify-center py-12 text-gray-500">
        No data available
      </div>
    `;
    return;
  }

  const headers = Object.keys(csvData[0]);

  tableContainer.innerHTML = `
    <table class="min-w-full border-collapse" id="csv-table">
      <thead class="bg-gray-50 sticky top-0">
        <tr>
          ${headers.map(header => `
            <th class="px-3 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
              ${escapeHtml(header)}
            </th>
          `).join('')}
          <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 w-16">
            ${escapeHtml(t('csv.deleteRow'))}
          </th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        ${csvData.map((row, rowIndex) => `
          <tr class="csv-row hover:bg-gray-50" data-row-index="${rowIndex}">
            ${headers.map(header => `
              <td class="px-2 py-2 border-b border-gray-100">
                <input
                  type="text"
                  class="csv-input w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  data-row="${rowIndex}"
                  data-column="${escapeHtml(header)}"
                  value="${escapeHtml(row[header] || '')}"
                  dir="auto"
                >
              </td>
            `).join('')}
            <td class="px-2 py-2 text-center border-b border-gray-100">
              <button
                class="btn-delete-row p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                data-row="${rowIndex}"
                data-role-required="admin"
                title="${escapeHtml(t('csv.deleteRow'))}"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Set up event listeners for the editor
 */
function setupEditorEvents() {
  const tableContainer = document.getElementById('table-container');
  const searchInput = document.getElementById('csv-search');
  const addRowBtn = document.getElementById('btn-add-row');
  const saveBtn = document.getElementById('btn-save');

  // Delegate input change events
  tableContainer?.addEventListener('input', (e) => {
    if (e.target.classList.contains('csv-input')) {
      const rowIndex = parseInt(e.target.dataset.row, 10);
      const column = e.target.dataset.column;
      csvData[rowIndex][column] = e.target.value;
      markChanged();
    }
  });

  // Delegate delete button clicks
  tableContainer?.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.btn-delete-row');
    if (deleteBtn) {
      const rowIndex = parseInt(deleteBtn.dataset.row, 10);
      deleteRow(rowIndex);
    }
  });

  // Add row button
  addRowBtn?.addEventListener('click', () => {
    addRow();
  });

  // Save button
  saveBtn?.addEventListener('click', () => {
    saveCSV();
  });

  // Search input
  searchInput?.addEventListener('input', (e) => {
    filterTable(e.target.value);
  });
}

/**
 * Mark the editor as having unsaved changes
 */
function markChanged() {
  hasChanges = true;
  updateSaveButton();
}

/**
 * Update the save button state
 */
function updateSaveButton() {
  const saveBtn = document.getElementById('btn-save');
  if (saveBtn) {
    saveBtn.disabled = !hasChanges;
  }
}

/**
 * Add a new row to the table
 */
function addRow() {
  // Don't allow adding rows if editor has no access
  if (hasNoAccess) return;

  // Need at least one row to get headers, or use allCsvData
  const sourceForHeaders = csvData.length > 0 ? csvData[0] : (allCsvData.length > 0 ? allCsvData[0] : null);
  if (!sourceForHeaders) return;

  const headers = Object.keys(sourceForHeaders);
  const newRow = {};
  headers.forEach(header => {
    newRow[header] = '';
  });

  csvData.push(newRow);

  // For filtered data, track that this is a new row (not in original data)
  // We'll add it to allCsvData during save - use -1 to indicate new row
  if (isFiltered) {
    originalIndices.push(-1); // -1 indicates a new row to be added
  }

  markChanged();
  renderTable();
  renderFilterBanner(); // Update row count in banner

  // Scroll to the new row
  const tableContainer = document.getElementById('table-container');
  tableContainer.scrollTop = tableContainer.scrollHeight;
}

/**
 * Delete a row from the table
 */
function deleteRow(rowIndex) {
  if (rowIndex < 0 || rowIndex >= csvData.length) return;

  // For filtered data, we need to mark this row for deletion in allCsvData
  if (isFiltered && originalIndices[rowIndex] !== -1) {
    // Mark the original row for deletion by setting it to null
    // We'll filter out nulls during buildFullCsvData
    const originalIndex = originalIndices[rowIndex];
    if (originalIndex >= 0 && originalIndex < allCsvData.length) {
      allCsvData[originalIndex] = null; // Mark for deletion
    }
  }

  csvData.splice(rowIndex, 1);
  originalIndices.splice(rowIndex, 1);
  markChanged();
  renderTable();
  renderFilterBanner(); // Update row count in banner
}

/**
 * Build the full CSV data by merging editor's changes into the complete dataset
 * For editors with filtered access, this merges their changes back into allCsvData
 * @returns {Object[]} Complete CSV data with editor's changes merged in
 */
function buildFullCsvData() {
  // Admin sees all data - just return csvData directly
  if (isAdmin() || !isFiltered) {
    return csvData;
  }

  // Editor with filtered data - merge changes back into full dataset
  // Start with allCsvData (which may have null entries for deleted rows)
  const fullData = [];
  const newRows = [];

  // First, process existing rows (skip nulls - they were deleted)
  allCsvData.forEach((row, idx) => {
    if (row !== null) {
      fullData.push(JSON.parse(JSON.stringify(row)));
    }
  });

  // Now apply editor's changes
  csvData.forEach((row, filteredIndex) => {
    const originalIndex = originalIndices[filteredIndex];

    if (originalIndex === -1) {
      // New row - add to the end
      newRows.push(JSON.parse(JSON.stringify(row)));
    } else {
      // Find the row in fullData by matching its position
      // Since we removed nulls, we need to map the original index
      let adjustedIndex = 0;
      let nullCount = 0;
      for (let i = 0; i < originalIndex; i++) {
        if (allCsvData[i] === null) {
          nullCount++;
        }
      }
      adjustedIndex = originalIndex - nullCount;

      if (adjustedIndex >= 0 && adjustedIndex < fullData.length) {
        fullData[adjustedIndex] = JSON.parse(JSON.stringify(row));
      }
    }
  });

  // Add new rows at the end
  return [...fullData, ...newRows];
}

/**
 * Save CSV data to the server
 */
async function saveCSV() {
  const saveBtn = document.getElementById('btn-save');

  // Prevent saving if no access
  if (hasNoAccess) {
    showToast(t('csv.noAccess'), 'error');
    return;
  }

  try {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `
      <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
      </svg>
      ${escapeHtml(t('common.loading'))}
    `;

    // Build full CSV data (merge editor changes for filtered views)
    const dataToSave = buildFullCsvData();
    const csvContent = toCSV(dataToSave);

    const response = await fetch(`${API_ENDPOINT}/api/csv`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        csvContent,
        username: getCurrentUsername()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      hasChanges = false;
      originalData = JSON.parse(JSON.stringify(csvData));
      // Update allCsvData to reflect saved state
      allCsvData = JSON.parse(JSON.stringify(dataToSave));
      showToast(t('csv.saveSuccess'), 'success');
    } else {
      throw new Error(result.message || 'Save failed');
    }
  } catch (error) {
    console.error('Failed to save CSV:', error);
    showToast(t('csv.saveError'), 'error');
  } finally {
    saveBtn.disabled = !hasChanges;
    saveBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      ${escapeHtml(t('csv.save'))}
    `;
  }
}

/**
 * Convert array of objects to CSV string
 */
function toCSV(data) {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const lines = [];

  // Add header row
  lines.push(headers.map(h => escapeCSVField(h)).join(','));

  // Add data rows
  data.forEach(row => {
    const values = headers.map(header => escapeCSVField(row[header] || ''));
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

/**
 * Escape a CSV field value (handle quotes and commas)
 */
function escapeCSVField(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Filter table rows based on search query
 */
function filterTable(query) {
  const rows = document.querySelectorAll('.csv-row');
  const lowerQuery = query.toLowerCase().trim();

  rows.forEach(row => {
    if (!lowerQuery) {
      row.style.display = '';
      return;
    }

    const inputs = row.querySelectorAll('.csv-input');
    let match = false;

    inputs.forEach(input => {
      if (input.value.toLowerCase().includes(lowerQuery)) {
        match = true;
      }
    });

    row.style.display = match ? '' : 'none';
  });
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
