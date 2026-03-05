// Validation Panel Component - Summary of validation errors and warnings
import i18n from '../i18n.js?v=5';
import { validateRow } from '../services/data-model.js?v=6';

// Fallback translations
const FALLBACKS = {
  'validation.panelTitle': { en: 'Validation Issues', he: 'בעיות תקינות' },
  'validation.errors': { en: 'Errors', he: 'שגיאות' },
  'validation.warnings': { en: 'Warnings', he: 'אזהרות' },
  'validation.noIssues': { en: 'No validation issues found', he: 'לא נמצאו בעיות תקינות' },
  'validation.goToRow': { en: 'Go to row', he: 'עבור לשורה' },
  'validation.previousIssue': { en: 'Previous issue', he: 'בעיה קודמת' },
  'validation.nextIssue': { en: 'Next issue', he: 'בעיה הבאה' },
  'validation.filterErrors': { en: 'Show only errors', he: 'הצג שגיאות בלבד' },
  'validation.collapse': { en: 'Collapse', he: 'כווץ' },
  'validation.expand': { en: 'Expand', he: 'הרחב' }
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
let panelElement = null;
let issues = [];
let currentIssueIndex = -1;
let isCollapsed = false;
let showOnlyErrors = false;
let onNavigate = null;

/**
 * Get display label for a row
 */
function getRowLabel(row) {
  const locale = i18n.getLocale() || 'en';
  const collection = locale === 'he'
    ? (row.collectionNameHe || row.collectionName || '')
    : (row.collectionName || '');
  const range = row.rangeStart || '';
  return `${collection} - ${range}`;
}

/**
 * Create panel HTML
 */
function createPanelHtml() {
  const locale = i18n.getLocale() || 'en';
  const dir = locale === 'he' ? 'rtl' : 'ltr';

  const filteredIssues = showOnlyErrors
    ? issues.filter(i => i.type === 'error')
    : issues;

  const errorCount = issues.filter(i => i.type === 'error').length;
  const warningCount = issues.filter(i => i.type === 'warning').length;

  if (issues.length === 0) {
    return `
      <div class="validation-panel validation-panel-empty" dir="${dir}" data-testid="validation-panel">
        <div class="validation-panel-header">
          <span class="validation-panel-title">${escapeHtml(t('validation.panelTitle'))}</span>
        </div>
        <div class="validation-panel-body">
          <p class="validation-no-issues">${escapeHtml(t('validation.noIssues'))}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="validation-panel ${isCollapsed ? 'collapsed' : ''}" dir="${dir}" data-testid="validation-panel" role="region" aria-label="${escapeHtml(t('validation.panelTitle'))}">
      <button class="validation-panel-header" aria-expanded="${!isCollapsed}">
        <span class="validation-panel-title">
          ${escapeHtml(t('validation.panelTitle'))}
          <span class="validation-badge validation-badge-error" aria-label="${errorCount} ${t('validation.errors')}">${errorCount}</span>
          <span class="validation-badge validation-badge-warning" aria-label="${warningCount} ${t('validation.warnings')}">${warningCount}</span>
        </span>
        <span class="validation-toggle">
          ${isCollapsed ? escapeHtml(t('validation.expand')) : escapeHtml(t('validation.collapse'))}
          <svg class="w-4 h-4 ${isCollapsed ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </span>
      </button>

      ${!isCollapsed ? `
        <div class="validation-panel-toolbar">
          <label class="validation-filter">
            <input type="checkbox" ${showOnlyErrors ? 'checked' : ''} data-testid="filter-errors">
            ${escapeHtml(t('validation.filterErrors'))}
          </label>
          <div class="validation-nav">
            <button class="validation-nav-btn" data-testid="prev-issue" ${currentIssueIndex <= 0 ? 'disabled' : ''} aria-label="${escapeHtml(t('validation.previousIssue'))}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <span class="validation-nav-count">${currentIssueIndex + 1} / ${filteredIssues.length}</span>
            <button class="validation-nav-btn" data-testid="next-issue" ${currentIssueIndex >= filteredIssues.length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(t('validation.nextIssue'))}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>

        <ul class="validation-list" role="list">
          ${filteredIssues.map((issue, idx) => `
            <li class="validation-item ${issue.type} ${idx === currentIssueIndex ? 'active' : ''}" role="listitem">
              <button class="validation-item-btn" data-index="${idx}" data-row-index="${issue.rowIndex}" aria-label="${escapeHtml(t('validation.goToRow'))}">
                <span class="validation-item-icon">
                  ${issue.type === 'error' ? `
                    <svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                  ` : `
                    <svg class="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                  `}
                </span>
                <span class="validation-item-content">
                  <span class="validation-item-label">${escapeHtml(getRowLabel(issue.row))}</span>
                  <span class="validation-item-message">${escapeHtml(issue.message)}</span>
                </span>
                <svg class="validation-item-arrow w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </li>
          `).join('')}
        </ul>
      ` : ''}
    </div>
  `;
}

/**
 * Update panel
 */
function updatePanel() {
  if (!panelElement) return;

  const newHtml = createPanelHtml();
  panelElement.innerHTML = newHtml;
  setupEventHandlers();
}

/**
 * Set up event handlers
 */
function setupEventHandlers() {
  if (!panelElement) return;

  // Header toggle
  const header = panelElement.querySelector('.validation-panel-header');
  if (header) {
    header.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      updatePanel();
    });
  }

  // Filter checkbox
  const filterCheckbox = panelElement.querySelector('[data-testid="filter-errors"]');
  if (filterCheckbox) {
    filterCheckbox.addEventListener('change', (e) => {
      showOnlyErrors = e.target.checked;
      currentIssueIndex = issues.length > 0 ? 0 : -1;
      updatePanel();
    });
  }

  // Navigation buttons
  const prevBtn = panelElement.querySelector('[data-testid="prev-issue"]');
  const nextBtn = panelElement.querySelector('[data-testid="next-issue"]');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentIssueIndex > 0) {
        currentIssueIndex--;
        navigateToCurrentIssue();
        updatePanel();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const filteredIssues = showOnlyErrors
        ? issues.filter(i => i.type === 'error')
        : issues;
      if (currentIssueIndex < filteredIssues.length - 1) {
        currentIssueIndex++;
        navigateToCurrentIssue();
        updatePanel();
      }
    });
  }

  // Issue item clicks
  panelElement.querySelectorAll('.validation-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      currentIssueIndex = idx;
      navigateToCurrentIssue();
      updatePanel();
    });
  });
}

/**
 * Navigate to current issue
 */
function navigateToCurrentIssue() {
  const filteredIssues = showOnlyErrors
    ? issues.filter(i => i.type === 'error')
    : issues;

  if (currentIssueIndex >= 0 && currentIssueIndex < filteredIssues.length) {
    const issue = filteredIssues[currentIssueIndex];
    if (onNavigate) {
      onNavigate(issue.rowIndex, issue.row);
    }
  }
}

/**
 * Initialize the validation panel
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Options
 * @param {Function} options.onNavigate - Callback when navigating to a row
 * @returns {Object} Panel API
 */
export function initValidationPanel(container, options = {}) {
  panelElement = container;
  onNavigate = options.onNavigate || null;

  updatePanel();

  return {
    setIssues,
    refresh: updatePanel,
    destroy
  };
}

/**
 * Set validation issues
 * @param {Array} data - Data rows to validate
 */
export function setIssues(data) {
  issues = [];

  data.forEach((row, idx) => {
    const result = validateRow(row, data, null);

    result.errors.forEach(error => {
      issues.push({
        type: 'error',
        rowIndex: idx,
        row,
        field: error.field,
        code: error.code,
        message: error.message
      });
    });

    result.warnings.forEach(warning => {
      issues.push({
        type: 'warning',
        rowIndex: idx,
        row,
        field: warning.field,
        code: warning.code,
        message: warning.message
      });
    });
  });

  currentIssueIndex = issues.length > 0 ? 0 : -1;
  updatePanel();
}

/**
 * Destroy the panel
 */
export function destroy() {
  if (panelElement) {
    panelElement.innerHTML = '';
    panelElement = null;
  }
  issues = [];
  currentIssueIndex = -1;
  isCollapsed = false;
  showOnlyErrors = false;
  onNavigate = null;
}

/**
 * Get current issues count
 * @returns {{errors: number, warnings: number}}
 */
export function getIssuesCount() {
  return {
    errors: issues.filter(i => i.type === 'error').length,
    warnings: issues.filter(i => i.type === 'warning').length
  };
}
