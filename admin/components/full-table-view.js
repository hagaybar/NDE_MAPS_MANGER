// Full Table View Component - Read-only table view of all location data
import i18n from '../i18n.js?v=5';

// Fallback translations
const FALLBACKS = {
  'fullTable.title': { en: 'Full Table View', he: 'תצוגת טבלה מלאה' },
  'fullTable.export': { en: 'Export CSV', he: 'ייצוא CSV' },
  'fullTable.close': { en: 'Close', he: 'סגור' },
  'fullTable.rows': { en: 'rows', he: 'שורות' },
  'fullTable.showing': { en: 'Showing', he: 'מציג' },
  'fullTable.of': { en: 'of', he: 'מתוך' },
  'fullTable.filter': { en: 'Filter...', he: 'סנן...' },
  'fullTable.sortAsc': { en: 'Sort ascending', he: 'מיון עולה' },
  'fullTable.sortDesc': { en: 'Sort descending', he: 'מיון יורד' },
  'fullTable.noData': { en: 'No data to display', he: 'אין נתונים להצגה' }
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

// Column definitions
const COLUMNS = [
  { key: 'libraryName', labelEn: 'Library', labelHe: 'ספרייה' },
  { key: 'libraryNameHe', labelEn: 'Library (He)', labelHe: 'ספרייה (עברית)' },
  { key: 'collectionName', labelEn: 'Collection', labelHe: 'אוסף' },
  { key: 'collectionNameHe', labelEn: 'Collection (He)', labelHe: 'אוסף (עברית)' },
  { key: 'rangeStart', labelEn: 'Range Start', labelHe: 'תחילת טווח' },
  { key: 'rangeEnd', labelEn: 'Range End', labelHe: 'סוף טווח' },
  { key: 'svgCode', labelEn: 'SVG Code', labelHe: 'קוד SVG' },
  { key: 'floor', labelEn: 'Floor', labelHe: 'קומה' },
  { key: 'description', labelEn: 'Description', labelHe: 'תיאור' },
  { key: 'descriptionHe', labelEn: 'Description (He)', labelHe: 'תיאור (עברית)' },
  { key: 'shelfLabel', labelEn: 'Shelf Label', labelHe: 'תווית מדף' },
  { key: 'shelfLabelHe', labelEn: 'Shelf Label (He)', labelHe: 'תווית מדף (עברית)' },
  { key: 'notes', labelEn: 'Notes', labelHe: 'הערות' },
  { key: 'notesHe', labelEn: 'Notes (He)', labelHe: 'הערות (עברית)' }
];

// Module state
let currentOverlay = null;
let currentData = [];
let filteredData = [];
let sortColumn = null;
let sortDirection = 'asc';
let columnFilters = {};

/**
 * Get column label based on locale
 */
function getColumnLabel(column) {
  const locale = i18n.getLocale() || 'en';
  return locale === 'he' ? column.labelHe : column.labelEn;
}

/**
 * Create dialog HTML
 */
function createDialogHtml() {
  const locale = i18n.getLocale() || 'en';
  const dir = locale === 'he' ? 'rtl' : 'ltr';
  const totalCount = currentData.length;
  const filteredCount = filteredData.length;

  return `
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
         data-testid="full-table-overlay">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col"
           data-testid="full-table-dialog"
           role="dialog"
           aria-modal="true"
           aria-labelledby="full-table-title"
           dir="${dir}">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div class="flex items-center gap-4">
            <h2 id="full-table-title" class="text-xl font-semibold text-gray-900">
              ${escapeHtml(t('fullTable.title'))}
            </h2>
            <span class="text-sm text-gray-500">
              ${escapeHtml(t('fullTable.showing'))} ${filteredCount} ${escapeHtml(t('fullTable.of'))} ${totalCount} ${escapeHtml(t('fullTable.rows'))}
            </span>
          </div>
          <div class="flex items-center gap-3">
            <button
              data-testid="export-csv-btn"
              class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              ${escapeHtml(t('fullTable.export'))}
            </button>
            <button
              data-testid="close-table-btn"
              class="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="${escapeHtml(t('fullTable.close'))}"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Table Container -->
        <div class="flex-1 overflow-auto">
          ${filteredData.length === 0 ? `
            <div class="flex items-center justify-center h-full text-gray-500">
              <p>${escapeHtml(t('fullTable.noData'))}</p>
            </div>
          ` : `
            <table class="full-table w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  ${COLUMNS.map(col => `
                    <th class="full-table-header" data-column="${col.key}">
                      <div class="flex flex-col gap-1">
                        <button
                          class="flex items-center gap-1 font-medium text-gray-700 hover:text-gray-900 whitespace-nowrap"
                          data-sort="${col.key}"
                          aria-label="${sortColumn === col.key ? (sortDirection === 'asc' ? escapeHtml(t('fullTable.sortDesc')) : escapeHtml(t('fullTable.sortAsc'))) : escapeHtml(t('fullTable.sortAsc'))}"
                        >
                          ${escapeHtml(getColumnLabel(col))}
                          ${sortColumn === col.key ? `
                            <svg class="w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
                            </svg>
                          ` : ''}
                        </button>
                        <input
                          type="text"
                          class="full-table-filter"
                          placeholder="${escapeHtml(t('fullTable.filter'))}"
                          data-filter="${col.key}"
                          value="${escapeHtml(columnFilters[col.key] || '')}"
                        />
                      </div>
                    </th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${filteredData.map((row, idx) => `
                  <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors">
                    ${COLUMNS.map(col => `
                      <td class="full-table-cell" title="${escapeHtml(row[col.key] || '')}">
                        ${escapeHtml(row[col.key] || '')}
                      </td>
                    `).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    </div>
  `;
}

/**
 * Apply filters and sorting
 */
function applyFiltersAndSort() {
  // Start with all data
  filteredData = [...currentData];

  // Apply column filters
  Object.entries(columnFilters).forEach(([column, filterValue]) => {
    if (filterValue) {
      const lowerFilter = filterValue.toLowerCase();
      filteredData = filteredData.filter(row => {
        const value = String(row[column] || '').toLowerCase();
        return value.includes(lowerFilter);
      });
    }
  });

  // Apply sorting
  if (sortColumn) {
    filteredData.sort((a, b) => {
      const aVal = String(a[sortColumn] || '');
      const bVal = String(b[sortColumn] || '');
      const comparison = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }
}

/**
 * Update the table display
 */
function updateTable() {
  if (!currentOverlay) return;

  applyFiltersAndSort();

  const container = currentOverlay;
  const newHtml = createDialogHtml();

  const temp = document.createElement('div');
  temp.innerHTML = newHtml;
  const newOverlay = temp.firstElementChild;

  container.replaceWith(newOverlay);
  currentOverlay = newOverlay;

  setupEventHandlers();
}

/**
 * Handle sort click
 */
function handleSort(column) {
  if (sortColumn === column) {
    // Toggle direction
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    // New column, start with ascending
    sortColumn = column;
    sortDirection = 'asc';
  }
  updateTable();
}

/**
 * Handle filter input
 */
function handleFilter(column, value) {
  if (value) {
    columnFilters[column] = value;
  } else {
    delete columnFilters[column];
  }
  updateTable();
}

/**
 * Handle export to CSV
 */
function handleExport() {
  // Create CSV content
  const headers = COLUMNS.map(col => col.labelEn);
  const rows = filteredData.map(row =>
    COLUMNS.map(col => {
      const value = row[col.key] || '';
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    })
  );

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `location-mapping-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Close the dialog
 */
function closeDialog() {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }

  // Reset state
  currentData = [];
  filteredData = [];
  sortColumn = null;
  sortDirection = 'asc';
  columnFilters = {};

  // Remove keyboard handler
  document.removeEventListener('keydown', handleKeydown);
}

/**
 * Handle keyboard events
 */
function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeDialog();
  }
}

/**
 * Set up event handlers
 */
function setupEventHandlers() {
  if (!currentOverlay) return;

  // Close button
  const closeBtn = currentOverlay.querySelector('[data-testid="close-table-btn"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDialog);
  }

  // Export button
  const exportBtn = currentOverlay.querySelector('[data-testid="export-csv-btn"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExport);
  }

  // Sort buttons
  currentOverlay.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      handleSort(btn.dataset.sort);
    });
  });

  // Filter inputs
  currentOverlay.querySelectorAll('[data-filter]').forEach(input => {
    // Debounced filter
    let timeout;
    input.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        handleFilter(e.target.dataset.filter, e.target.value);
      }, 300);
    });
  });

  // Click overlay to close
  currentOverlay.addEventListener('click', (e) => {
    if (e.target === currentOverlay) {
      closeDialog();
    }
  });

  // Prevent dialog click from closing
  const dialog = currentOverlay.querySelector('[data-testid="full-table-dialog"]');
  if (dialog) {
    dialog.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
}

/**
 * Show the full table view
 * @param {Array} data - Array of row objects
 */
export function showFullTableView(data) {
  // Close any existing dialog
  if (currentOverlay) {
    currentOverlay.remove();
  }

  // Store data
  currentData = data;
  applyFiltersAndSort();

  // Create overlay
  const container = document.createElement('div');
  container.innerHTML = createDialogHtml();
  currentOverlay = container.firstElementChild;

  // Add to DOM
  document.body.appendChild(currentOverlay);

  // Set up event handlers
  setupEventHandlers();

  // Add keyboard handler
  document.addEventListener('keydown', handleKeydown);

  // Focus close button for accessibility
  const closeBtn = currentOverlay.querySelector('[data-testid="close-table-btn"]');
  if (closeBtn) {
    closeBtn.focus();
  }
}

/**
 * Hide the full table view
 */
export function hideFullTableView() {
  closeDialog();
}
