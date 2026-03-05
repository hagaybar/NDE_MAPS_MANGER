// Results Container Component - Grouped display of location results
import i18n from '../i18n.js?v=5';
import { applyRoleBasedUI } from '../auth-guard.js?v=5';
import { renderLocationRow } from './location-row.js?v=5';

// Fallback translations
const FALLBACKS = {
  'results.noResults': { en: 'No results found', he: 'לא נמצאו תוצאות' },
  'results.tryDifferent': { en: 'Try a different search term', he: 'נסה מונח חיפוש אחר' },
  'results.locations': { en: 'locations', he: 'מיקומים' },
  'floors.floor0': { en: 'Entrance Floor', he: 'קומת כניסה' },
  'floors.floor1': { en: 'First Floor', he: 'קומה ראשונה' },
  'floors.floor2': { en: 'Second Floor', he: 'קומה שנייה' }
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
 * Group data by floor and then by collection
 * @param {Array} data - Data to group
 * @returns {Map} Grouped data structure: Map<floor, Map<collection, rows[]>>
 */
export function groupByFloorAndCollection(data) {
  const floorGroups = new Map();

  data.forEach(row => {
    const floor = String(row.floor || '0');
    const locale = i18n.getLocale() || 'en';
    const collection = locale === 'he'
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
 * Get floor label based on floor number and locale
 * @param {string} floor - Floor number
 * @returns {string} Floor label
 */
function getFloorLabel(floor) {
  const key = `floors.floor${floor}`;
  const label = t(key);
  if (label !== key) {
    return label;
  }
  // Fallback for unknown floors
  const locale = i18n.getLocale() || 'en';
  return locale === 'he' ? `קומה ${floor}` : `Floor ${floor}`;
}

/**
 * Render empty state when no results
 * @returns {string} HTML string
 */
export function renderEmptyState() {
  return `
    <div class="empty-state">
      <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <p class="empty-state-text">${escapeHtml(t('results.noResults'))}</p>
      <p class="empty-state-hint">${escapeHtml(t('results.tryDifferent'))}</p>
    </div>
  `;
}

/**
 * Render initial empty state (search prompt)
 * @returns {string} HTML string
 */
export function renderSearchPrompt() {
  const locale = i18n.getLocale() || 'en';
  const message = locale === 'he'
    ? 'חפש כדי למצוא מיפויי מיקומים'
    : 'Search to find location mappings';

  return `
    <div class="empty-state">
      <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <p class="empty-state-text">${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Render grouped results
 * @param {Map} grouped - Grouped data (Map<floor, Map<collection, rows[]>>)
 * @param {Set} selectedRows - Set of selected row indices
 * @returns {string} HTML string
 */
export function renderGroupedResults(grouped, selectedRows = new Set()) {
  if (!grouped || grouped.size === 0) {
    return renderEmptyState();
  }

  const locale = i18n.getLocale() || 'en';
  const locationsText = FALLBACKS['results.locations'][locale];
  let html = '';

  // Sort floors (0, 1, 2)
  const sortedFloors = [...grouped.keys()].sort((a, b) => Number(a) - Number(b));

  sortedFloors.forEach(floor => {
    const collections = grouped.get(floor);
    const floorLabel = getFloorLabel(floor);

    // Count total locations in this floor
    let floorCount = 0;
    collections.forEach(rows => {
      floorCount += rows.length;
    });

    html += `
      <div class="floor-group" data-floor="${floor}">
        <button class="floor-header collapsible-header" aria-expanded="true" type="button">
          <span class="floor-header-content">
            <svg class="collapse-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
            <span class="floor-title">${escapeHtml(floorLabel)}</span>
            <span class="floor-count">(${floorCount} ${locationsText})</span>
          </span>
        </button>
        <div class="floor-content collapsible-content">
          ${renderCollectionGroups(collections, floor, selectedRows)}
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
 * @param {Set} selectedRows - Set of selected row indices
 * @returns {string} HTML string
 */
function renderCollectionGroups(collections, floor, selectedRows) {
  let html = '';

  // Sort collections alphabetically
  const sortedCollections = [...collections.keys()].sort((a, b) => a.localeCompare(b));

  sortedCollections.forEach(collection => {
    const rows = collections.get(collection);

    html += `
      <div class="collection-group" data-collection="${escapeHtml(collection)}">
        <button class="collection-header collapsible-header" aria-expanded="true" type="button">
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

/**
 * Set up collapsible section event handlers
 * @param {HTMLElement} container - Container element
 */
export function setupCollapsibleSections(container) {
  if (!container) return;

  const headers = container.querySelectorAll('.collapsible-header');

  headers.forEach(header => {
    // Remove existing listeners to avoid duplicates
    const newHeader = header.cloneNode(true);
    header.parentNode.replaceChild(newHeader, header);

    newHeader.addEventListener('click', (e) => {
      e.preventDefault();
      const isExpanded = newHeader.getAttribute('aria-expanded') === 'true';
      newHeader.setAttribute('aria-expanded', String(!isExpanded));

      const content = newHeader.nextElementSibling;
      if (content && content.classList.contains('collapsible-content')) {
        content.classList.toggle('collapsed', isExpanded);
      }

      // Rotate collapse icon
      const icon = newHeader.querySelector('.collapse-icon');
      if (icon) {
        icon.classList.toggle('rotated', isExpanded);
      }
    });
  });
}

/**
 * Expand all sections
 * @param {HTMLElement} container - Container element
 */
export function expandAll(container) {
  if (!container) return;

  const headers = container.querySelectorAll('.collapsible-header');
  headers.forEach(header => {
    header.setAttribute('aria-expanded', 'true');
    const content = header.nextElementSibling;
    if (content) {
      content.classList.remove('collapsed');
    }
    const icon = header.querySelector('.collapse-icon');
    if (icon) {
      icon.classList.remove('rotated');
    }
  });
}

/**
 * Collapse all sections
 * @param {HTMLElement} container - Container element
 */
export function collapseAll(container) {
  if (!container) return;

  const headers = container.querySelectorAll('.collapsible-header');
  headers.forEach(header => {
    header.setAttribute('aria-expanded', 'false');
    const content = header.nextElementSibling;
    if (content) {
      content.classList.add('collapsed');
    }
    const icon = header.querySelector('.collapse-icon');
    if (icon) {
      icon.classList.add('rotated');
    }
  });
}

/**
 * Expand a specific floor
 * @param {HTMLElement} container - Container element
 * @param {string} floor - Floor number to expand
 */
export function expandFloor(container, floor) {
  if (!container) return;

  const floorGroup = container.querySelector(`.floor-group[data-floor="${floor}"]`);
  if (!floorGroup) return;

  const header = floorGroup.querySelector('.floor-header');
  if (header) {
    header.setAttribute('aria-expanded', 'true');
    const content = header.nextElementSibling;
    if (content) {
      content.classList.remove('collapsed');
    }
    const icon = header.querySelector('.collapse-icon');
    if (icon) {
      icon.classList.remove('rotated');
    }
  }
}

/**
 * Scroll to a specific row
 * @param {HTMLElement} container - Container element
 * @param {number} index - Row index to scroll to
 */
export function scrollToRow(container, index) {
  if (!container) return;

  const row = container.querySelector(`.location-row[data-index="${index}"]`);
  if (row) {
    // Expand parent sections if collapsed
    const collectionContent = row.closest('.collection-content');
    const floorContent = row.closest('.floor-content');

    if (collectionContent?.classList.contains('collapsed')) {
      const collectionHeader = collectionContent.previousElementSibling;
      collectionHeader?.click();
    }

    if (floorContent?.classList.contains('collapsed')) {
      const floorHeader = floorContent.previousElementSibling;
      floorHeader?.click();
    }

    // Scroll into view
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight briefly
    row.classList.add('location-row--highlighted');
    setTimeout(() => {
      row.classList.remove('location-row--highlighted');
    }, 2000);
  }
}
