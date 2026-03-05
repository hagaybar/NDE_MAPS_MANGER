// Trash View Component - Display and manage deleted locations
import i18n from '../i18n.js?v=5';
import {
  getTrashItems,
  restoreFromTrash,
  permanentlyDelete,
  emptyTrash,
  restoreAll,
  getDaysRemaining,
  formatDeletedDate
} from '../services/trash-service.js?v=5';

// Fallback translations
const FALLBACKS = {
  'trash.title': { en: 'Trash', he: 'סל מחזור' },
  'trash.empty': { en: 'Trash is empty', he: 'סל המחזור ריק' },
  'trash.emptyHint': { en: 'Deleted items will appear here for 30 days', he: 'פריטים שנמחקו יופיעו כאן למשך 30 יום' },
  'trash.itemCount': { en: '{count} item(s) in trash', he: '{count} פריטים בסל המחזור' },
  'trash.expiresIn': { en: 'Expires in {days} days', he: 'יפוג בעוד {days} ימים' },
  'trash.deletedOn': { en: 'Deleted on {date}', he: 'נמחק ב-{date}' },
  'trash.restore': { en: 'Restore', he: 'שחזר' },
  'trash.deletePermanently': { en: 'Delete Permanently', he: 'מחק לצמיתות' },
  'trash.emptyTrash': { en: 'Empty Trash', he: 'רוקן סל מחזור' },
  'trash.restoreAll': { en: 'Restore All', he: 'שחזר הכל' },
  'trash.confirmEmpty': { en: 'Are you sure you want to permanently delete all items?', he: 'האם אתה בטוח שברצונך למחוק לצמיתות את כל הפריטים?' },
  'trash.confirmDelete': { en: 'This action cannot be undone.', he: 'לא ניתן לבטל פעולה זו.' }
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
 * Format range for display
 * @param {Object} row - Row data
 * @returns {string} Formatted range
 */
function formatRange(row) {
  if (!row.rangeStart && !row.rangeEnd) return '-';
  if (row.rangeStart === row.rangeEnd) return row.rangeStart;
  return `${row.rangeStart || ''} - ${row.rangeEnd || ''}`;
}

/**
 * Get localized collection name
 * @param {Object} row - Row data
 * @returns {string} Collection name
 */
function getCollectionName(row) {
  const locale = i18n.getLocale() || 'en';
  return locale === 'he'
    ? (row.collectionNameHe || row.collectionName || '-')
    : (row.collectionName || row.collectionNameHe || '-');
}

/**
 * Initialize the trash view
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Options
 * @param {Function} options.onRestore - Callback when item is restored
 */
export function initTrashView(container, options = {}) {
  if (!container) {
    console.error('[TrashView] Container not found');
    return;
  }

  const { onRestore } = options;

  // Initial render
  renderTrashView(container, onRestore);

  // Listen for trash updates
  document.addEventListener('trashUpdated', () => {
    renderTrashView(container, onRestore);
  });

  // Listen for locale changes
  document.addEventListener('localeChanged', () => {
    renderTrashView(container, onRestore);
  });
}

/**
 * Render the trash view
 * @param {HTMLElement} container - Container element
 * @param {Function} onRestore - Restore callback
 */
function renderTrashView(container, onRestore) {
  const items = getTrashItems();
  const locale = i18n.getLocale() || 'en';

  if (items.length === 0) {
    container.innerHTML = renderEmptyState();
    return;
  }

  container.innerHTML = `
    <div class="trash-view" data-testid="trash-view">
      <!-- Header with actions -->
      <div class="trash-header flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
        <div class="flex items-center gap-3">
          <h3 class="text-lg font-semibold text-gray-900">
            <svg class="w-5 h-5 inline-block me-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            ${escapeHtml(t('trash.title'))}
          </h3>
          <span class="text-sm text-gray-500">
            ${escapeHtml(t('trash.itemCount').replace('{count}', items.length))}
          </span>
        </div>
        <div class="flex gap-2">
          <button
            data-testid="restore-all-button"
            class="px-3 py-1.5 text-sm text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
          >
            ${escapeHtml(t('trash.restoreAll'))}
          </button>
          <button
            data-testid="empty-trash-button"
            class="px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
          >
            ${escapeHtml(t('trash.emptyTrash'))}
          </button>
        </div>
      </div>

      <!-- Trash items list -->
      <div class="trash-items space-y-3" data-testid="trash-items">
        ${items.map(item => renderTrashItem(item, locale)).join('')}
      </div>
    </div>
  `;

  // Set up event handlers
  setupTrashEventHandlers(container, onRestore);
}

/**
 * Render empty state
 * @returns {string} HTML string
 */
function renderEmptyState() {
  return `
    <div class="trash-empty-state flex flex-col items-center justify-center py-12 text-center" data-testid="trash-empty">
      <svg class="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
      <p class="text-lg font-medium text-gray-600 mb-2">${escapeHtml(t('trash.empty'))}</p>
      <p class="text-sm text-gray-400">${escapeHtml(t('trash.emptyHint'))}</p>
    </div>
  `;
}

/**
 * Render a single trash item
 * @param {Object} item - Trash item
 * @param {string} locale - Current locale
 * @returns {string} HTML string
 */
function renderTrashItem(item, locale) {
  const row = item.row;
  const floor = row.floor || '0';
  const range = formatRange(row);
  const collection = getCollectionName(row);
  const daysRemaining = getDaysRemaining(item.deletedAt);
  const deletedDate = formatDeletedDate(item.deletedAt, locale);

  const expiresText = t('trash.expiresIn').replace('{days}', daysRemaining);
  const deletedText = t('trash.deletedOn').replace('{date}', deletedDate);

  // Urgency indicator
  const urgencyClass = daysRemaining <= 3 ? 'text-red-600' : (daysRemaining <= 7 ? 'text-amber-600' : 'text-gray-500');

  return `
    <div class="trash-item bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors" data-trash-id="${escapeHtml(item.id)}">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-2">
            <span class="location-floor-badge floor-${floor} px-2 py-0.5 text-xs font-medium rounded-full">
              ${escapeHtml(t('field.floor') || 'Floor')} ${floor}
            </span>
            <span class="font-medium text-gray-900" dir="auto">${escapeHtml(range)}</span>
          </div>
          <div class="text-sm text-gray-600 mb-2" dir="auto">${escapeHtml(collection)}</div>
          <div class="flex items-center gap-3 text-xs">
            <span class="text-gray-400">${escapeHtml(deletedText)}</span>
            <span class="${urgencyClass} font-medium">${escapeHtml(expiresText)}</span>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <button
            data-testid="restore-button"
            data-trash-id="${escapeHtml(item.id)}"
            class="px-3 py-1.5 text-sm text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
            </svg>
            ${escapeHtml(t('trash.restore'))}
          </button>
          <button
            data-testid="permanent-delete-button"
            data-trash-id="${escapeHtml(item.id)}"
            class="px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors flex items-center gap-1"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            ${escapeHtml(t('trash.deletePermanently'))}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Set up event handlers for trash view
 * @param {HTMLElement} container - Container element
 * @param {Function} onRestore - Restore callback
 */
function setupTrashEventHandlers(container, onRestore) {
  // Restore single item
  container.querySelectorAll('[data-testid="restore-button"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const trashId = btn.dataset.trashId;
      const restoredRow = restoreFromTrash(trashId);

      if (restoredRow && typeof onRestore === 'function') {
        onRestore(restoredRow);
      }
    });
  });

  // Permanent delete single item
  container.querySelectorAll('[data-testid="permanent-delete-button"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const trashId = btn.dataset.trashId;

      // Show confirmation
      if (confirm(t('trash.confirmDelete'))) {
        permanentlyDelete(trashId);
      }
    });
  });

  // Restore all
  const restoreAllBtn = container.querySelector('[data-testid="restore-all-button"]');
  if (restoreAllBtn) {
    restoreAllBtn.addEventListener('click', () => {
      const restoredRows = restoreAll();

      if (typeof onRestore === 'function') {
        restoredRows.forEach(row => onRestore(row));
      }
    });
  }

  // Empty trash
  const emptyTrashBtn = container.querySelector('[data-testid="empty-trash-button"]');
  if (emptyTrashBtn) {
    emptyTrashBtn.addEventListener('click', () => {
      if (confirm(t('trash.confirmEmpty'))) {
        emptyTrash();
      }
    });
  }
}

/**
 * Get the current trash count
 * @returns {number} Number of items in trash
 */
export function getTrashItemCount() {
  return getTrashItems().length;
}
