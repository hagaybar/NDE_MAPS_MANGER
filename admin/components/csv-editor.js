// CSV Editor Component - Bilingual CSV Table Editor
import i18n from '../i18n.js?v=5';
import { showToast } from './toast.js?v=5';
import { getAuthHeaders, getCurrentUsername } from '../app.js?v=5';
import { applyRoleBasedUI } from '../auth-guard.js?v=5';

// Fallback translations if i18n hasn't loaded yet
const FALLBACKS = {
  'csv.title': { en: 'Location Mapping Editor', he: 'עורך מיפוי מיקומים' },
  'csv.save': { en: 'Save Changes', he: 'שמור שינויים' },
  'csv.addRow': { en: 'Add Row', he: 'הוסף שורה' },
  'csv.search': { en: 'Search...', he: 'חיפוש...' },
  'csv.saveSuccess': { en: 'Changes saved successfully', he: 'השינויים נשמרו בהצלחה' },
  'csv.saveError': { en: 'Failed to save changes', he: 'שמירת השינויים נכשלה' },
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
let csvData = [];
let originalData = [];
let hasChanges = false;
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
      <div id="table-container" class="overflow-x-auto">
        <div class="flex items-center justify-center py-12 text-gray-500">
          ${escapeHtml(t('common.loading'))}
        </div>
      </div>
    </div>
  `;
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
    csvData = parseCSV(text);
    originalData = JSON.parse(JSON.stringify(csvData)); // Deep copy
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
  if (csvData.length === 0) return;

  const headers = Object.keys(csvData[0]);
  const newRow = {};
  headers.forEach(header => {
    newRow[header] = '';
  });

  csvData.push(newRow);
  markChanged();
  renderTable();

  // Scroll to the new row
  const tableContainer = document.getElementById('table-container');
  tableContainer.scrollTop = tableContainer.scrollHeight;
}

/**
 * Delete a row from the table
 */
function deleteRow(rowIndex) {
  if (rowIndex < 0 || rowIndex >= csvData.length) return;

  csvData.splice(rowIndex, 1);
  markChanged();
  renderTable();
}

/**
 * Save CSV data to the server
 */
async function saveCSV() {
  const saveBtn = document.getElementById('btn-save');

  try {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `
      <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
      </svg>
      ${escapeHtml(t('common.loading'))}
    `;

    const csvContent = toCSV(csvData);

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
