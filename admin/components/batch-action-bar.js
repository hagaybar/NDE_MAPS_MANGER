// Batch Action Bar Component - Floating bar for batch operations
import i18n from '../i18n.js?v=5';

// Fallback translations
const FALLBACKS = {
  'batch.selected': { en: '{count} selected', he: '{count} נבחרו' },
  'batch.edit': { en: 'Edit', he: 'עריכה' },
  'batch.delete': { en: 'Delete', he: 'מחיקה' },
  'batch.clearSelection': { en: 'Clear', he: 'נקה' },
  'batch.selectAll': { en: 'Select All', he: 'בחר הכל' }
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
let currentBar = null;
let selectedCount = 0;
let onEdit = null;
let onDelete = null;
let onClear = null;
let onSelectAll = null;

/**
 * Render the batch action bar HTML
 * @returns {string} HTML string
 */
function renderBar() {
  return `
    <div class="batch-action-bar" data-testid="batch-action-bar">
      <div class="batch-action-bar-content">
        <div class="batch-action-bar-info">
          <span class="batch-count">${escapeHtml(t('batch.selected').replace('{count}', selectedCount))}</span>
          <button data-testid="clear-selection-btn" class="batch-action-btn batch-action-btn-text">
            ${escapeHtml(t('batch.clearSelection'))}
          </button>
          <button data-testid="select-all-btn" class="batch-action-btn batch-action-btn-text">
            ${escapeHtml(t('batch.selectAll'))}
          </button>
        </div>
        <div class="batch-action-bar-actions">
          <button data-testid="batch-edit-btn" class="batch-action-btn batch-action-btn-primary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            ${escapeHtml(t('batch.edit'))}
          </button>
          <button data-testid="batch-delete-btn" class="batch-action-btn batch-action-btn-danger" data-role-required="admin">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            ${escapeHtml(t('batch.delete'))}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Set up event handlers
 */
function setupEventHandlers() {
  if (!currentBar) return;

  const editBtn = currentBar.querySelector('[data-testid="batch-edit-btn"]');
  const deleteBtn = currentBar.querySelector('[data-testid="batch-delete-btn"]');
  const clearBtn = currentBar.querySelector('[data-testid="clear-selection-btn"]');
  const selectAllBtn = currentBar.querySelector('[data-testid="select-all-btn"]');

  if (editBtn && typeof onEdit === 'function') {
    editBtn.addEventListener('click', onEdit);
  }

  if (deleteBtn && typeof onDelete === 'function') {
    deleteBtn.addEventListener('click', onDelete);
  }

  if (clearBtn && typeof onClear === 'function') {
    clearBtn.addEventListener('click', onClear);
  }

  if (selectAllBtn && typeof onSelectAll === 'function') {
    selectAllBtn.addEventListener('click', onSelectAll);
  }
}

/**
 * Show the batch action bar
 * @param {Object} options - Options
 * @param {number} options.count - Number of selected items
 * @param {Function} options.onEdit - Edit callback
 * @param {Function} options.onDelete - Delete callback
 * @param {Function} options.onClear - Clear selection callback
 * @param {Function} options.onSelectAll - Select all callback
 */
export function showBatchActionBar(options = {}) {
  selectedCount = options.count || 0;
  onEdit = options.onEdit;
  onDelete = options.onDelete;
  onClear = options.onClear;
  onSelectAll = options.onSelectAll;

  // Remove existing bar
  if (currentBar) {
    currentBar.remove();
  }

  // Create new bar
  const container = document.createElement('div');
  container.innerHTML = renderBar();
  currentBar = container.firstElementChild;

  // Add to DOM
  document.body.appendChild(currentBar);

  // Set up handlers
  setupEventHandlers();

  // Animate in
  requestAnimationFrame(() => {
    currentBar.classList.add('visible');
  });
}

/**
 * Update the selection count
 * @param {number} count - New count
 */
export function updateBatchCount(count) {
  selectedCount = count;

  if (count === 0) {
    hideBatchActionBar();
    return;
  }

  if (currentBar) {
    const countEl = currentBar.querySelector('.batch-count');
    if (countEl) {
      countEl.textContent = t('batch.selected').replace('{count}', count);
    }
  }
}

/**
 * Hide the batch action bar
 */
export function hideBatchActionBar() {
  if (currentBar) {
    currentBar.classList.remove('visible');
    setTimeout(() => {
      if (currentBar) {
        currentBar.remove();
        currentBar = null;
      }
    }, 200);
  }

  selectedCount = 0;
  onEdit = null;
  onDelete = null;
  onClear = null;
  onSelectAll = null;
}

/**
 * Check if batch action bar is visible
 * @returns {boolean} Whether bar is visible
 */
export function isBatchActionBarVisible() {
  return currentBar !== null;
}
