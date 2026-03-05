// Search Box Component - Debounced search with criteria dropdown
import i18n from '../i18n.js?v=5';

// Module-level variables
let debounceTimer = null;
const DEBOUNCE_DELAY = 300; // milliseconds

// Fallback translations
const FALLBACKS = {
  'searchBox.placeholder': { en: 'Search locations...', he: 'חיפוש מיקומים...' },
  'searchBox.criteria.all': { en: 'All Fields', he: 'כל השדות' },
  'searchBox.criteria.callNumber': { en: 'Call Number', he: 'סימן קריאה' },
  'searchBox.criteria.collection': { en: 'Collection', he: 'אוסף' },
  'searchBox.criteria.shelfNumber': { en: 'Shelf Number', he: 'מספר מדף' },
  'searchBox.clear': { en: 'Clear search', he: 'נקה חיפוש' },
  'searchBox.resultsCount': { en: '{count} results', he: '{count} תוצאות' }
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
 * Initialize the Search Box component
 * @param {string} containerId - ID of the container element
 */
export function initSearchBox(containerId = 'search-box-container') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Search Box container "${containerId}" not found`);
    return;
  }

  container.innerHTML = renderSearchBox();
  setupSearchEvents();

  // Listen for locale changes to re-render
  document.addEventListener('localeChanged', () => {
    const currentQuery = document.getElementById('location-search-input')?.value || '';
    const currentCriteria = document.getElementById('search-criteria')?.value || 'all';

    container.innerHTML = renderSearchBox();
    setupSearchEvents();

    // Restore values
    const searchInput = document.getElementById('location-search-input');
    const criteriaSelect = document.getElementById('search-criteria');
    if (searchInput) searchInput.value = currentQuery;
    if (criteriaSelect) criteriaSelect.value = currentCriteria;

    // Update clear button visibility
    updateClearButtonVisibility(currentQuery);
  });

  // Listen for search results to update count
  document.addEventListener('locationSearchResults', (e) => {
    updateResultsCount(e.detail.count);
  });
}

/**
 * Render the search box HTML
 * @returns {string} HTML string
 */
function renderSearchBox() {
  return `
    <div class="search-box">
      <div class="search-box-input-wrapper">
        <svg class="search-box-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          type="text"
          id="location-search-input"
          class="search-box-input"
          placeholder="${escapeHtml(t('searchBox.placeholder'))}"
          dir="auto"
          autocomplete="off"
        >
        <button
          id="search-clear-btn"
          class="search-clear-btn hidden"
          type="button"
          title="${escapeHtml(t('searchBox.clear'))}"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="search-box-criteria-wrapper">
        <select id="search-criteria" class="search-criteria-select">
          <option value="all">${escapeHtml(t('searchBox.criteria.all'))}</option>
          <option value="callNumber">${escapeHtml(t('searchBox.criteria.callNumber'))}</option>
          <option value="collection">${escapeHtml(t('searchBox.criteria.collection'))}</option>
          <option value="shelfNumber">${escapeHtml(t('searchBox.criteria.shelfNumber'))}</option>
        </select>
      </div>
      <div id="search-results-count" class="search-results-count hidden"></div>
    </div>
  `;
}

/**
 * Set up event listeners for the search box
 */
function setupSearchEvents() {
  const searchInput = document.getElementById('location-search-input');
  const criteriaSelect = document.getElementById('search-criteria');
  const clearBtn = document.getElementById('search-clear-btn');

  // Input event with debounce
  searchInput?.addEventListener('input', (e) => {
    const query = e.target.value;

    // Update clear button visibility
    updateClearButtonVisibility(query);

    // Debounce search
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      emitSearchEvent(query, criteriaSelect?.value || 'all');
    }, DEBOUNCE_DELAY);
  });

  // Criteria change - trigger immediate search
  criteriaSelect?.addEventListener('change', () => {
    const query = searchInput?.value || '';
    if (query.trim()) {
      // Clear existing debounce and search immediately
      clearTimeout(debounceTimer);
      emitSearchEvent(query, criteriaSelect.value);
    }
  });

  // Clear button
  clearBtn?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    updateClearButtonVisibility('');
    clearTimeout(debounceTimer);

    // Emit clear event
    document.dispatchEvent(new CustomEvent('locationSearchClear'));

    // Hide results count
    const countEl = document.getElementById('search-results-count');
    if (countEl) {
      countEl.classList.add('hidden');
    }
  });

  // Handle Enter key
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      emitSearchEvent(searchInput.value, criteriaSelect?.value || 'all');
    }
    if (e.key === 'Escape') {
      clearBtn?.click();
    }
  });
}

/**
 * Emit search event with query and criteria
 * @param {string} query - Search query
 * @param {string} criteria - Search criteria
 */
function emitSearchEvent(query, criteria) {
  document.dispatchEvent(new CustomEvent('locationSearch', {
    detail: { query, criteria }
  }));
}

/**
 * Update clear button visibility based on query
 * @param {string} query - Current query value
 */
function updateClearButtonVisibility(query) {
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) {
    if (query && query.trim()) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  }
}

/**
 * Update the results count display
 * @param {number} count - Number of results
 */
function updateResultsCount(count) {
  const countEl = document.getElementById('search-results-count');
  if (!countEl) return;

  if (count > 0) {
    const locale = i18n.getLocale() || 'en';
    const text = FALLBACKS['searchBox.resultsCount'][locale].replace('{count}', count);
    countEl.textContent = text;
    countEl.classList.remove('hidden');
  } else {
    countEl.classList.add('hidden');
  }
}

/**
 * Get current search query
 * @returns {string} Current query
 */
export function getQuery() {
  const input = document.getElementById('location-search-input');
  return input?.value || '';
}

/**
 * Get current search criteria
 * @returns {string} Current criteria
 */
export function getCriteria() {
  const select = document.getElementById('search-criteria');
  return select?.value || 'all';
}

/**
 * Set search query programmatically
 * @param {string} query - Query to set
 * @param {boolean} triggerSearch - Whether to trigger search event
 */
export function setQuery(query, triggerSearch = false) {
  const input = document.getElementById('location-search-input');
  if (input) {
    input.value = query;
    updateClearButtonVisibility(query);

    if (triggerSearch) {
      emitSearchEvent(query, getCriteria());
    }
  }
}

/**
 * Clear the search box
 */
export function clearSearch() {
  const clearBtn = document.getElementById('search-clear-btn');
  clearBtn?.click();
}

/**
 * Focus the search input
 */
export function focus() {
  const input = document.getElementById('location-search-input');
  input?.focus();
}
