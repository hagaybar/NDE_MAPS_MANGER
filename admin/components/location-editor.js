// Location Editor Component - New card-based UI for location management
import i18n from '../i18n.js?v=5';
import { applyRoleBasedUI } from '../auth-guard.js?v=5';
import { renderLocationRow } from './location-row.js?v=5';
import { setupCollapsibleSections } from './results-container.js?v=5';
import { showEditLocationDialog, setCollections } from './edit-location-dialog.js?v=5';
import { showDeleteLocationDialog } from './delete-location-dialog.js?v=5';
import { addToTrash, getTrashCount } from '../services/trash-service.js?v=5';
import { initTrashView } from './trash-view.js?v=5';
import { showBatchEditDialog } from './batch-edit-dialog.js?v=5';
import { showBatchActionBar, hideBatchActionBar, updateBatchCount } from './batch-action-bar.js?v=5';
import { showFullTableView } from './full-table-view.js?v=5';
import { initKeyboardShortcuts, registerDefaultShortcuts, cleanupKeyboardShortcuts } from '../services/keyboard-shortcuts.js?v=5';

// Module-level variables
let csvData = [];
let filteredData = [];
let selectedRows = new Set();
const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

// Fallback translations
const FALLBACKS = {
  'locationEditor.title': { en: 'Location Editor', he: 'עורך מיקומים' },
  'locationEditor.emptyState': { en: 'Search to find location mappings', he: 'חפש כדי למצוא מיפויי מיקומים' },
  'locationEditor.loading': { en: 'Loading...', he: 'טוען...' },
  'locationEditor.error': { en: 'Failed to load data', he: 'שגיאה בטעינת הנתונים' },
  'locationEditor.addLocation': { en: 'Add Location', he: 'הוסף מיקום' },
  'locationEditor.viewTrash': { en: 'Trash', he: 'סל מחזור' },
  'locationEditor.backToSearch': { en: 'Back to Search', he: 'חזרה לחיפוש' },
  'fullTable.viewButton': { en: 'View Full Table', he: 'הצג טבלה מלאה' },
  'common.error': { en: 'An error occurred', he: 'אירעה שגיאה' }
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
 * Initialize the Location Editor component
 */
export function initLocationEditor() {
  const container = document.getElementById('location-editor');
  if (!container) {
    console.error('Location Editor container not found');
    return;
  }

  container.innerHTML = renderEditor();
  setupEditorEvents();
  loadCSVData();
  setupKeyboardShortcuts();

  // Listen for locale changes to re-render
  document.addEventListener('localeChanged', () => {
    container.innerHTML = renderEditor();
    setupEditorEvents();
    if (filteredData.length > 0) {
      renderResults();
    }
    applyRoleBasedUI();
  });
}

/**
 * Set up keyboard shortcuts for the editor
 */
function setupKeyboardShortcuts() {
  initKeyboardShortcuts();

  registerDefaultShortcuts({
    focusSearch: () => {
      const searchInput = document.getElementById('location-search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    },
    selectAll: () => {
      // Only select all if we have filtered results
      if (filteredData.length > 0 && currentView === 'search') {
        handleSelectAll();
      }
    },
    escape: () => {
      // Clear selection if any
      if (selectedRows.size > 0) {
        clearSelections();
      }
    }
  });
}

// Track current view mode
let currentView = 'search'; // 'search' or 'trash'

/**
 * Render the editor container HTML
 * @returns {string} HTML string
 */
function renderEditor() {
  const trashCount = getTrashCount();
  const trashBadge = trashCount > 0 ? `<span class="trash-badge">${trashCount}</span>` : '';

  return `
    <div class="location-editor-container">
      <!-- Action Bar -->
      <div class="location-editor-actions flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
        <div class="flex items-center gap-3">
          ${currentView === 'trash' ? `
            <button id="back-to-search-btn" class="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
              ${escapeHtml(t('locationEditor.backToSearch'))}
            </button>
          ` : `
            <button id="view-trash-btn" class="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors relative">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              ${escapeHtml(t('locationEditor.viewTrash'))}
              ${trashBadge}
            </button>
          `}
        </div>
        <div class="flex items-center gap-3">
          <button
            id="view-full-table-btn"
            class="view-full-table-btn"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            ${escapeHtml(t('fullTable.viewButton'))}
          </button>
          <button
            id="add-location-btn"
            class="btn btn-primary flex items-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            ${escapeHtml(t('locationEditor.addLocation'))}
          </button>
        </div>
      </div>

      ${currentView === 'trash' ? `
        <!-- Trash View Container -->
        <div id="trash-container"></div>
      ` : `
        <!-- Search Box Component Placeholder -->
        <div id="search-box-container" class="mb-6"></div>

        <!-- Results Container -->
        <div id="results-container" class="results-container">
          <div class="empty-state">
            <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <p class="empty-state-text">${escapeHtml(t('locationEditor.emptyState'))}</p>
          </div>
        </div>
      `}
    </div>
  `;
}

/**
 * Load CSV data from CloudFront
 */
async function loadCSVData() {
  try {
    const response = await fetch(`${CLOUDFRONT_URL}/data/mapping.csv`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    csvData = parseCSV(text);

    // Dispatch event to notify that data is loaded
    document.dispatchEvent(new CustomEvent('locationDataLoaded', {
      detail: { data: csvData, count: csvData.length }
    }));

    console.log(`[LocationEditor] Loaded ${csvData.length} location records`);
  } catch (error) {
    console.error('[LocationEditor] Failed to load CSV:', error);
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) {
      resultsContainer.innerHTML = `
        <div class="error-state">
          <svg class="error-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p class="error-state-text">${escapeHtml(t('common.error'))}: ${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }
}

/**
 * Parse CSV text into array of objects
 * @param {string} text - CSV text content
 * @returns {Array} Parsed data array
 */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = { _index: i - 1 }; // Store original index for editing
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }

  return data;
}

/**
 * Parse a single CSV line, handling quoted fields
 * @param {string} line - CSV line
 * @returns {Array} Parsed fields
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
 * Set up event listeners for the editor
 */
function setupEditorEvents() {
  // Listen for search events from search-box component
  document.addEventListener('locationSearch', handleSearch);

  // Listen for search clear events
  document.addEventListener('locationSearchClear', handleSearchClear);

  // Listen for edit events
  document.addEventListener('locationEdit', handleEditLocation);

  // Listen for delete events
  document.addEventListener('locationDelete', handleDeleteLocation);

  // Listen for trash updates
  document.addEventListener('trashUpdated', handleTrashUpdate);

  // Set up action bar buttons
  setupActionBarEvents();
}

/**
 * Set up action bar event handlers
 */
function setupActionBarEvents() {
  // Add Location button
  const addBtn = document.getElementById('add-location-btn');
  if (addBtn) {
    addBtn.addEventListener('click', handleAddLocation);
  }

  // View Full Table button
  const fullTableBtn = document.getElementById('view-full-table-btn');
  if (fullTableBtn) {
    fullTableBtn.addEventListener('click', handleViewFullTable);
  }

  // View Trash button
  const trashBtn = document.getElementById('view-trash-btn');
  if (trashBtn) {
    trashBtn.addEventListener('click', () => {
      switchView('trash');
    });
  }

  // Back to Search button
  const backBtn = document.getElementById('back-to-search-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      switchView('search');
    });
  }
}

/**
 * Handle view full table button click
 */
function handleViewFullTable() {
  if (csvData.length === 0) {
    console.warn('[LocationEditor] No data to display in full table');
    return;
  }
  showFullTableView(csvData);
}

/**
 * Switch between search and trash views
 * @param {string} view - 'search' or 'trash'
 */
function switchView(view) {
  currentView = view;
  const container = document.getElementById('location-editor');
  if (!container) return;

  container.innerHTML = renderEditor();
  setupActionBarEvents();

  if (view === 'trash') {
    const trashContainer = document.getElementById('trash-container');
    if (trashContainer) {
      initTrashView(trashContainer, {
        onRestore: handleRestoredItem
      });
    }
  } else {
    // Re-render search results if we had any
    if (filteredData.length > 0) {
      renderResults();
    }
  }

  applyRoleBasedUI();
}

/**
 * Handle restored item from trash
 * @param {Object} row - Restored row data
 */
async function handleRestoredItem(row) {
  // Add the row back to CSV data
  const newIndex = csvData.length;
  csvData.push({ ...row, _index: newIndex });

  // Save to server
  try {
    await saveRowToServer(row, newIndex, true);

    // Dispatch restore event
    document.dispatchEvent(new CustomEvent('locationRestored', {
      detail: { row }
    }));
  } catch (error) {
    console.error('[LocationEditor] Failed to restore item:', error);
    // Remove from local data on failure
    csvData.pop();
  }
}

/**
 * Handle trash update event
 */
function handleTrashUpdate() {
  // Update trash badge if in search view
  if (currentView === 'search') {
    const trashBtn = document.getElementById('view-trash-btn');
    if (trashBtn) {
      const count = getTrashCount();
      const badge = trashBtn.querySelector('.trash-badge');
      if (count > 0) {
        if (badge) {
          badge.textContent = count;
        } else {
          trashBtn.insertAdjacentHTML('beforeend', `<span class="trash-badge">${count}</span>`);
        }
      } else if (badge) {
        badge.remove();
      }
    }
  }
}

/**
 * Handle add location button click
 */
async function handleAddLocation() {
  // Extract unique collections for the dropdown
  const uniqueCollections = extractUniqueCollections();
  setCollections(uniqueCollections);

  try {
    const result = await showEditLocationDialog({
      row: null, // null indicates new row
      allRows: csvData,
      onSave: async (newRow, isNew) => {
        await saveRowToServer(newRow, csvData.length, true);
      }
    });

    if (result && result.success) {
      // Add to local data
      const newIndex = csvData.length;
      csvData.push({ ...result.row, _index: newIndex });

      // Dispatch add event
      document.dispatchEvent(new CustomEvent('locationAdded', {
        detail: { row: result.row, index: newIndex }
      }));

      // Refresh current view if showing results
      if (filteredData.length > 0) {
        // Re-run search to include new item
        const searchBox = document.getElementById('location-search-input');
        if (searchBox && searchBox.value) {
          handleSearch(new CustomEvent('locationSearch', {
            detail: { query: searchBox.value, criteria: 'all' }
          }));
        }
      }
    }
  } catch (error) {
    console.error('[LocationEditor] Add failed:', error);
    document.dispatchEvent(new CustomEvent('locationError', {
      detail: { message: error.message }
    }));
  }
}

/**
 * Handle search event from search box
 * @param {CustomEvent} event - Search event with query and criteria
 */
function handleSearch(event) {
  const { query, criteria } = event.detail;

  if (!query || query.trim() === '') {
    handleSearchClear();
    return;
  }

  const lowerQuery = query.toLowerCase().trim();

  // Filter data based on criteria
  filteredData = csvData.filter(row => {
    switch (criteria) {
      case 'callNumber':
        // Search in rangeStart and rangeEnd
        return (row.rangeStart || '').toLowerCase().includes(lowerQuery) ||
               (row.rangeEnd || '').toLowerCase().includes(lowerQuery);
      case 'collection':
        // Search in collectionName and collectionNameHe
        return (row.collectionName || '').toLowerCase().includes(lowerQuery) ||
               (row.collectionNameHe || '').toLowerCase().includes(lowerQuery);
      case 'shelfNumber':
        // Search in shelfLabel and shelfLabelHe
        return (row.shelfLabel || '').toLowerCase().includes(lowerQuery) ||
               (row.shelfLabelHe || '').toLowerCase().includes(lowerQuery);
      default:
        // Search all fields
        return Object.values(row).some(val =>
          String(val).toLowerCase().includes(lowerQuery)
        );
    }
  });

  renderResults();

  // Dispatch search results event
  document.dispatchEvent(new CustomEvent('locationSearchResults', {
    detail: { count: filteredData.length, query, criteria }
  }));
}

/**
 * Handle search clear event
 */
function handleSearchClear() {
  filteredData = [];
  selectedRows.clear();

  const resultsContainer = document.getElementById('results-container');
  if (resultsContainer) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <p class="empty-state-text">${escapeHtml(t('locationEditor.emptyState'))}</p>
      </div>
    `;
  }
}

/**
 * Handle edit location event
 * @param {CustomEvent} event - Edit event with row data
 */
async function handleEditLocation(event) {
  const { index, row } = event.detail;

  // Extract unique collections for the dropdown
  const uniqueCollections = extractUniqueCollections();
  setCollections(uniqueCollections);

  try {
    const result = await showEditLocationDialog({
      row,
      allRows: csvData,
      onSave: async (updatedRow, isNew) => {
        await saveRowToServer(updatedRow, index, isNew);
      }
    });

    if (result && result.success) {
      // Update local data
      csvData[index] = { ...result.row, _index: index };

      // Re-render if currently showing filtered results
      if (filteredData.length > 0) {
        // Update the row in filtered data too
        const filteredIndex = filteredData.findIndex(r => r._index === index);
        if (filteredIndex >= 0) {
          filteredData[filteredIndex] = csvData[index];
        }
        renderResults();
      }

      // Dispatch success event
      document.dispatchEvent(new CustomEvent('locationSaved', {
        detail: { index, row: result.row }
      }));
    }
  } catch (error) {
    console.error('[LocationEditor] Edit failed:', error);
    // Show error notification
    document.dispatchEvent(new CustomEvent('locationError', {
      detail: { message: error.message }
    }));
  }
}

/**
 * Handle delete location event
 * @param {CustomEvent} event - Delete event with row data
 */
async function handleDeleteLocation(event) {
  const { index, row } = event.detail;

  try {
    const result = await showDeleteLocationDialog({ row, index });

    if (result && result.confirmed) {
      // Get current user for audit
      const username = localStorage.getItem('username') || 'unknown';

      // Add to trash
      addToTrash(row, index, username);

      // Remove from csvData
      csvData.splice(index, 1);

      // Update indices for remaining rows
      csvData.forEach((r, i) => {
        r._index = i;
      });

      // Update filteredData
      filteredData = filteredData.filter(r => r._index !== index);
      filteredData.forEach((r) => {
        // Find new index in csvData
        const newIndex = csvData.findIndex(cr =>
          cr.rangeStart === r.rangeStart &&
          cr.rangeEnd === r.rangeEnd &&
          cr.svgCode === r.svgCode
        );
        if (newIndex >= 0) {
          r._index = newIndex;
        }
      });

      // Save to server
      await saveFullCsv();

      // Re-render results
      if (filteredData.length > 0) {
        renderResults();
      } else {
        handleSearchClear();
      }

      // Dispatch delete event
      document.dispatchEvent(new CustomEvent('locationDeleted', {
        detail: { index, row }
      }));
    }
  } catch (error) {
    console.error('[LocationEditor] Delete failed:', error);
    document.dispatchEvent(new CustomEvent('locationError', {
      detail: { message: error.message }
    }));
  }
}

/**
 * Save full CSV to server (after delete)
 */
async function saveFullCsv() {
  const token = localStorage.getItem('idToken');
  if (!token) {
    throw new Error('Not authenticated');
  }

  const csvText = convertToCSV(csvData);

  const response = await fetch('https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod/csv', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ csvContent: csvText })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to save changes');
  }
}

/**
 * Extract unique collections from CSV data
 * @returns {Array<{name: string, nameHe: string}>} Unique collections
 */
function extractUniqueCollections() {
  const collectionsMap = new Map();

  csvData.forEach(row => {
    const name = row.collectionName || '';
    const nameHe = row.collectionNameHe || '';

    if (name && !collectionsMap.has(name)) {
      collectionsMap.set(name, { name, nameHe });
    }
  });

  return Array.from(collectionsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/**
 * Save row to server via API
 * @param {Object} row - Row data to save
 * @param {number} index - Row index
 * @param {boolean} isNew - Whether this is a new row
 */
async function saveRowToServer(row, index, isNew) {
  // Get auth token
  const token = localStorage.getItem('idToken');
  if (!token) {
    throw new Error('Not authenticated');
  }

  // For now, we'll update the full CSV
  // In a real implementation, this would be a PATCH endpoint
  const updatedCsvData = [...csvData];
  if (isNew) {
    updatedCsvData.push(row);
  } else {
    updatedCsvData[index] = row;
  }

  // Convert to CSV format
  const csvText = convertToCSV(updatedCsvData);

  // Send to API
  const response = await fetch('https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod/csv', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/csv'
    },
    body: csvText
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to save changes');
  }
}

/**
 * Convert data array to CSV string
 * @param {Array} data - Array of row objects
 * @returns {string} CSV string
 */
function convertToCSV(data) {
  if (data.length === 0) return '';

  // Get headers from first row (excluding _index)
  const headers = Object.keys(data[0]).filter(h => h !== '_index');

  // Create CSV lines
  const lines = [headers.join(',')];

  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header] ?? '';
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

/**
 * Render search results grouped by Floor > Collection
 */
function renderResults() {
  const resultsContainer = document.getElementById('results-container');
  if (!resultsContainer) return;

  if (filteredData.length === 0) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="empty-state-text">${escapeHtml(t('search.noResults'))}</p>
        <p class="empty-state-hint">${escapeHtml(t('emptyState.tryDifferent'))}</p>
      </div>
    `;
    return;
  }

  // Group by floor, then by collection
  const grouped = groupByFloorAndCollection(filteredData);

  // Render grouped results
  resultsContainer.innerHTML = renderGroupedResults(grouped);

  // Set up event listeners for collapsible sections
  setupCollapsibleSections(resultsContainer);

  // Set up row events (checkboxes, edit, delete buttons)
  setupRowEvents();

  // Apply role-based UI for delete buttons
  applyRoleBasedUI();
}

/**
 * Group data by floor and then by collection
 * @param {Array} data - Filtered data
 * @returns {Map} Grouped data structure
 */
function groupByFloorAndCollection(data) {
  const floorGroups = new Map();

  data.forEach(row => {
    const floor = row.floor || '0';
    const collection = i18n.getLocale() === 'he'
      ? (row.collectionNameHe || row.collectionName || 'Unknown')
      : (row.collectionName || row.collectionNameHe || 'Unknown');

    if (!floorGroups.has(floor)) {
      floorGroups.set(floor, new Map());
    }

    const collections = floorGroups.get(floor);
    if (!collections.has(collection)) {
      collections.set(collection, []);
    }

    collections.get(collection).push(row);
  });

  return floorGroups;
}

/**
 * Render grouped results HTML
 * @param {Map} grouped - Grouped data
 * @returns {string} HTML string
 */
function renderGroupedResults(grouped) {
  const floorLabels = {
    '0': { en: 'Entrance Floor', he: 'קומת כניסה' },
    '1': { en: 'First Floor', he: 'קומה ראשונה' },
    '2': { en: 'Second Floor', he: 'קומה שנייה' }
  };

  const locale = i18n.getLocale() || 'en';
  let html = '';

  // Sort floors
  const sortedFloors = [...grouped.keys()].sort((a, b) => Number(a) - Number(b));

  sortedFloors.forEach(floor => {
    const collections = grouped.get(floor);
    const floorLabel = floorLabels[floor]
      ? floorLabels[floor][locale]
      : `${t('floors.title')} ${floor}`;

    // Count total locations in this floor
    let floorCount = 0;
    collections.forEach(rows => {
      floorCount += rows.length;
    });

    html += `
      <div class="floor-group" data-floor="${floor}">
        <button class="floor-header collapsible-header" aria-expanded="true">
          <span class="floor-header-content">
            <svg class="collapse-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
            <span class="floor-title">${escapeHtml(floorLabel)}</span>
            <span class="floor-count">(${floorCount} ${locale === 'he' ? 'מיקומים' : 'locations'})</span>
          </span>
        </button>
        <div class="floor-content collapsible-content">
          ${renderCollectionGroups(collections, floor)}
        </div>
      </div>
    `;
  });

  return html;
}

/**
 * Render collection groups within a floor
 * @param {Map} collections - Collection groups
 * @param {string} floor - Floor number
 * @returns {string} HTML string
 */
function renderCollectionGroups(collections, floor) {
  const locale = i18n.getLocale() || 'en';
  let html = '';

  // Sort collections alphabetically
  const sortedCollections = [...collections.keys()].sort((a, b) => a.localeCompare(b));

  sortedCollections.forEach(collection => {
    const rows = collections.get(collection);

    html += `
      <div class="collection-group" data-collection="${escapeHtml(collection)}">
        <button class="collection-header collapsible-header" aria-expanded="true">
          <span class="collection-header-content">
            <svg class="collapse-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
            <span class="collection-title">${escapeHtml(collection)}</span>
            <span class="collection-count">(${rows.length})</span>
          </span>
        </button>
        <div class="collection-content collapsible-content">
          ${rows.map(row => renderLocationRow(row, floor, selectedRows.has(row._index))).join('')}
        </div>
      </div>
    `;
  });

  return html;
}

// renderLocationRow and setupCollapsibleSections are imported from their respective modules

/**
 * Set up row event handlers (checkbox, edit, delete)
 */
function setupRowEvents() {
  const resultsContainer = document.getElementById('results-container');
  if (!resultsContainer) return;

  // Checkbox events
  resultsContainer.addEventListener('change', (e) => {
    if (e.target.classList.contains('row-checkbox')) {
      const index = parseInt(e.target.dataset.index, 10);
      if (e.target.checked) {
        selectedRows.add(index);
      } else {
        selectedRows.delete(index);
      }

      // Update batch action bar
      handleSelectionChange();

      // Dispatch selection change event
      document.dispatchEvent(new CustomEvent('locationSelectionChanged', {
        detail: { selectedCount: selectedRows.size, selectedIndices: [...selectedRows] }
      }));
    }
  });

  // Edit button events
  resultsContainer.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-edit');
    if (editBtn) {
      const index = parseInt(editBtn.dataset.index, 10);
      const row = csvData[index];

      // Dispatch edit event
      document.dispatchEvent(new CustomEvent('locationEdit', {
        detail: { index, row }
      }));
    }

    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      const index = parseInt(deleteBtn.dataset.index, 10);
      const row = csvData[index];

      // Dispatch delete event
      document.dispatchEvent(new CustomEvent('locationDelete', {
        detail: { index, row }
      }));
    }
  });
}

/**
 * Get the current CSV data
 * @returns {Array} CSV data array
 */
export function getCSVData() {
  return csvData;
}

/**
 * Get filtered data
 * @returns {Array} Filtered data array
 */
export function getFilteredData() {
  return filteredData;
}

/**
 * Get selected row indices
 * @returns {Set} Set of selected indices
 */
export function getSelectedRows() {
  return selectedRows;
}

/**
 * Clear all selections
 */
export function clearSelections() {
  selectedRows.clear();
  const checkboxes = document.querySelectorAll('.row-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = false;
  });
  hideBatchActionBar();
}

/**
 * Handle selection change - show/hide batch action bar
 */
function handleSelectionChange() {
  const count = selectedRows.size;

  if (count > 0) {
    showBatchActionBar({
      count,
      onEdit: handleBatchEdit,
      onDelete: handleBatchDelete,
      onClear: handleClearSelection,
      onSelectAll: handleSelectAll
    });
  } else {
    hideBatchActionBar();
  }
}

/**
 * Handle clear selection from batch action bar
 */
function handleClearSelection() {
  clearSelections();
  document.dispatchEvent(new CustomEvent('locationSelectionChanged', {
    detail: { selectedCount: 0, selectedIndices: [] }
  }));
}

/**
 * Handle select all from batch action bar
 */
function handleSelectAll() {
  // Select all visible (filtered) items
  filteredData.forEach(row => {
    selectedRows.add(row._index);
  });

  // Update checkboxes
  const checkboxes = document.querySelectorAll('.row-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = true;
  });

  // Update batch action bar
  updateBatchCount(selectedRows.size);

  // Dispatch selection change event
  document.dispatchEvent(new CustomEvent('locationSelectionChanged', {
    detail: { selectedCount: selectedRows.size, selectedIndices: [...selectedRows] }
  }));
}

/**
 * Handle batch edit from batch action bar
 */
async function handleBatchEdit() {
  if (selectedRows.size === 0) return;

  // Get selected row data
  const selectedData = [...selectedRows].map(index => csvData[index]).filter(Boolean);

  // Extract unique collections for the dropdown
  const uniqueCollections = extractUniqueCollections();

  try {
    const result = await showBatchEditDialog({
      rows: selectedData,
      collections: uniqueCollections
    });

    if (result && result.applied && result.changes) {
      // Apply changes to selected rows
      const changes = result.changes;
      const indicesToUpdate = result.indices || [...selectedRows];

      indicesToUpdate.forEach(index => {
        if (csvData[index]) {
          // Apply each change
          Object.keys(changes).forEach(field => {
            csvData[index][field] = changes[field];
          });
        }
      });

      // Save to server
      await saveFullCsv();

      // Update filtered data
      filteredData.forEach(row => {
        if (selectedRows.has(row._index)) {
          Object.keys(changes).forEach(field => {
            row[field] = changes[field];
          });
        }
      });

      // Re-render results
      renderResults();

      // Clear selection
      clearSelections();

      // Dispatch success event
      document.dispatchEvent(new CustomEvent('batchEditComplete', {
        detail: { count: indicesToUpdate.length, changes }
      }));
    }
  } catch (error) {
    console.error('[LocationEditor] Batch edit failed:', error);
    document.dispatchEvent(new CustomEvent('locationError', {
      detail: { message: error.message }
    }));
  }
}

/**
 * Handle batch delete from batch action bar
 */
async function handleBatchDelete() {
  if (selectedRows.size === 0) return;

  const count = selectedRows.size;
  const locale = i18n.getLocale() || 'en';

  // Confirm batch delete
  const confirmMsg = locale === 'he'
    ? `האם אתה בטוח שברצונך להעביר ${count} פריטים לסל המחזור?`
    : `Are you sure you want to move ${count} items to trash?`;

  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    const username = localStorage.getItem('username') || 'unknown';
    const indicesToDelete = [...selectedRows].sort((a, b) => b - a); // Sort descending to delete from end first

    // Add each to trash and remove from data
    indicesToDelete.forEach(index => {
      const row = csvData[index];
      if (row) {
        addToTrash(row, index, username);
      }
    });

    // Remove from csvData (from highest index to lowest to avoid index shifting issues)
    indicesToDelete.forEach(index => {
      csvData.splice(index, 1);
    });

    // Update indices for remaining rows
    csvData.forEach((r, i) => {
      r._index = i;
    });

    // Update filteredData
    filteredData = filteredData.filter(r => !selectedRows.has(r._index));
    filteredData.forEach(r => {
      // Find new index in csvData
      const newIndex = csvData.findIndex(cr =>
        cr.rangeStart === r.rangeStart &&
        cr.rangeEnd === r.rangeEnd &&
        cr.svgCode === r.svgCode
      );
      if (newIndex >= 0) {
        r._index = newIndex;
      }
    });

    // Save to server
    await saveFullCsv();

    // Clear selection
    clearSelections();

    // Re-render results
    if (filteredData.length > 0) {
      renderResults();
    } else {
      handleSearchClear();
    }

    // Dispatch delete event
    document.dispatchEvent(new CustomEvent('batchDeleteComplete', {
      detail: { count }
    }));

  } catch (error) {
    console.error('[LocationEditor] Batch delete failed:', error);
    document.dispatchEvent(new CustomEvent('locationError', {
      detail: { message: error.message }
    }));
  }
}

/**
 * Refresh the data from server
 */
export async function refreshData() {
  await loadCSVData();
  if (filteredData.length > 0) {
    // Re-run current search
    const searchBox = document.getElementById('location-search-input');
    if (searchBox && searchBox.value) {
      handleSearch(new CustomEvent('locationSearch', {
        detail: { query: searchBox.value, criteria: 'all' }
      }));
    }
  }
}
