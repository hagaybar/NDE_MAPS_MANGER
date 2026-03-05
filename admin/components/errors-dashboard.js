// Errors Dashboard Component - Interactive dashboard for viewing and fixing validation issues
import i18n from '../i18n.js?v=5';
import { validateRow, VALIDATION_ERRORS, VALIDATION_WARNINGS } from '../services/data-model.js?v=6';
import { showEditLocationDialog, setCollections } from './edit-location-dialog.js?v=5';
import { getAuthHeaders } from '../app.js?v=5';

// CloudFront URL for fetching CSV data
const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';
const API_ENDPOINT = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod';

// Fallback translations
const FALLBACKS = {
  'errorsDashboard.title': { en: 'Data Quality Dashboard', he: 'לוח בקרת איכות נתונים' },
  'errorsDashboard.subtitle': { en: 'Click a category to view and fix issues', he: 'לחץ על קטגוריה לצפייה ותיקון בעיות' },
  'errorsDashboard.errors': { en: 'Errors', he: 'שגיאות' },
  'errorsDashboard.warnings': { en: 'Warnings', he: 'אזהרות' },
  'errorsDashboard.healthScore': { en: 'Data Health', he: 'בריאות נתונים' },
  'errorsDashboard.noIssues': { en: 'All data is valid!', he: 'כל הנתונים תקינים!' },
  'errorsDashboard.loading': { en: 'Loading data...', he: 'טוען נתונים...' },
  'errorsDashboard.loadError': { en: 'Failed to load data', he: 'שגיאה בטעינת הנתונים' },
  'errorsDashboard.refresh': { en: 'Refresh', he: 'רענן' },
  'errorsDashboard.back': { en: 'Back to Overview', he: 'חזרה לסקירה' },
  'errorsDashboard.fix': { en: 'Fix', he: 'תקן' },
  'errorsDashboard.fixAll': { en: 'Fix All in Category', he: 'תקן הכל בקטגוריה' },
  'errorsDashboard.totalRecords': { en: 'Total Records', he: 'סה"כ רשומות' },
  'errorsDashboard.issuesFound': { en: 'issues found', he: 'בעיות נמצאו' },
  'errorsDashboard.row': { en: 'Row', he: 'שורה' },
  'errorsDashboard.category.required': { en: 'Missing Required Fields', he: 'שדות חובה חסרים' },
  'errorsDashboard.category.range': { en: 'Range Validation Errors', he: 'שגיאות טווח' },
  'errorsDashboard.category.floor': { en: 'Invalid Floor Values', he: 'ערכי קומה שגויים' },
  'errorsDashboard.category.duplicate': { en: 'Duplicate Entries', he: 'רשומות כפולות' },
  'errorsDashboard.category.svgCode': { en: 'SVG Code Issues', he: 'בעיות קוד SVG' },
  'errorsDashboard.category.overlap': { en: 'Overlapping Ranges', he: 'טווחים חופפים' },
  'errorsDashboard.category.description': { en: 'Missing Descriptions', he: 'תיאורים חסרים' },
  'errorsDashboard.category.format': { en: 'Format Issues', he: 'בעיות פורמט' }
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
let containerElement = null;
let csvData = [];
let allIssues = [];
let categorizedIssues = {};
let currentView = 'summary'; // 'summary' or 'category'
let currentCategory = null;
let isLoading = false;
let loadError = null;

// Error code to category mapping
const ERROR_CATEGORIES = {
  E001: 'required',
  E002: 'range',
  E003: 'floor',
  E004: 'range',
  E005: 'duplicate',
  E006: 'svgCode',
  W001: 'overlap',
  W002: 'format',
  W003: 'description'
};

// Category metadata
const CATEGORY_META = {
  required: { icon: 'alert-circle', color: 'red', severity: 'error' },
  range: { icon: 'arrows-horizontal', color: 'red', severity: 'error' },
  floor: { icon: 'building', color: 'red', severity: 'error' },
  duplicate: { icon: 'copy', color: 'red', severity: 'error' },
  svgCode: { icon: 'code', color: 'orange', severity: 'error' },
  overlap: { icon: 'layers', color: 'yellow', severity: 'warning' },
  description: { icon: 'file-text', color: 'yellow', severity: 'warning' },
  format: { icon: 'alert-triangle', color: 'yellow', severity: 'warning' }
};

/**
 * Get row display label
 */
function getRowLabel(row) {
  const locale = i18n.getLocale() || 'en';
  const collection = locale === 'he'
    ? (row.collectionNameHe || row.collectionName || '')
    : (row.collectionName || '');
  const range = row.rangeStart ? `${row.rangeStart}${row.rangeEnd ? ' - ' + row.rangeEnd : ''}` : '';
  return `${collection} ${range}`.trim() || 'Unknown';
}

/**
 * Load CSV data from CloudFront
 */
async function loadCSVData() {
  isLoading = true;
  loadError = null;
  render();

  try {
    const response = await fetch(`${CLOUDFRONT_URL}/data/mapping.csv`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    csvData = parseCSV(text);

    // Extract unique collections for the edit dialog
    const collections = [...new Set(csvData.map(r => r.collectionName).filter(Boolean))]
      .map(name => {
        const row = csvData.find(r => r.collectionName === name);
        return { name, nameHe: row?.collectionNameHe || name };
      });
    setCollections(collections);

    validateAllRows();
  } catch (error) {
    console.error('[ErrorsDashboard] Failed to load CSV:', error);
    loadError = error.message;
  } finally {
    isLoading = false;
    render();
  }
}

/**
 * Parse CSV text to array of objects
 */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = { _index: i - 1 };
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

/**
 * Validate all rows and categorize issues
 */
function validateAllRows() {
  allIssues = [];
  categorizedIssues = {};

  // Initialize all categories
  Object.keys(CATEGORY_META).forEach(cat => {
    categorizedIssues[cat] = [];
  });

  csvData.forEach((row, idx) => {
    const result = validateRow(row, csvData, row);  // Pass row as originalRow to skip self-comparison

    result.errors.forEach(error => {
      const category = ERROR_CATEGORIES[error.code] || 'format';
      const issue = {
        type: 'error',
        rowIndex: idx,
        row,
        field: error.field,
        code: error.code,
        message: error.message,
        category
      };
      allIssues.push(issue);
      categorizedIssues[category].push(issue);
    });

    result.warnings.forEach(warning => {
      const category = ERROR_CATEGORIES[warning.code] || 'format';
      const issue = {
        type: 'warning',
        rowIndex: idx,
        row,
        field: warning.field,
        code: warning.code,
        message: warning.message,
        category
      };
      allIssues.push(issue);
      categorizedIssues[category].push(issue);
    });
  });
}

/**
 * Get statistics
 */
function getStats() {
  const errorCount = allIssues.filter(i => i.type === 'error').length;
  const warningCount = allIssues.filter(i => i.type === 'warning').length;
  const total = csvData.length;
  const rowsWithErrors = new Set(allIssues.filter(i => i.type === 'error').map(i => i.rowIndex)).size;
  const validRows = total - rowsWithErrors;
  const healthScore = total > 0 ? Math.round((validRows / total) * 100) : 100;

  return { errorCount, warningCount, total, validRows, healthScore };
}

/**
 * Save updated row to API
 */
async function saveRow(row) {
  try {
    // Update the row in csvData
    const idx = csvData.findIndex(r => r._index === row._index);
    if (idx !== -1) {
      csvData[idx] = { ...csvData[idx], ...row };
    }

    // Convert back to CSV and save
    const headers = Object.keys(csvData[0]).filter(k => k !== '_index');
    const csvLines = [headers.join(',')];
    csvData.forEach(r => {
      const values = headers.map(h => {
        const val = r[h] || '';
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      });
      csvLines.push(values.join(','));
    });

    const response = await fetch(`${API_ENDPOINT}/api/csv`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/csv',
        ...getAuthHeaders()
      },
      body: csvLines.join('\n')
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // Re-validate after save
    validateAllRows();
    render();

    return true;
  } catch (error) {
    console.error('[ErrorsDashboard] Failed to save:', error);
    return false;
  }
}

/**
 * Handle fix button click - open edit dialog
 */
async function handleFixClick(issue) {
  const result = await showEditLocationDialog({
    row: { ...issue.row },
    allRows: csvData,
    onSave: async (updatedRow) => {
      return await saveRow(updatedRow);
    }
  });

  if (result?.saved) {
    // Refresh data after successful save
    await loadCSVData();
  }
}

/**
 * Render the dashboard
 */
function render() {
  if (!containerElement) return;

  const locale = i18n.getLocale() || 'en';
  const dir = locale === 'he' ? 'rtl' : 'ltr';

  if (isLoading) {
    containerElement.innerHTML = `
      <div class="errors-dashboard errors-dashboard-loading" dir="${dir}">
        <div class="dashboard-loading">
          <svg class="loading-spinner" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.25"/>
            <path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
          </svg>
          <p>${escapeHtml(t('errorsDashboard.loading'))}</p>
        </div>
      </div>
    `;
    return;
  }

  if (loadError) {
    containerElement.innerHTML = `
      <div class="errors-dashboard errors-dashboard-error" dir="${dir}">
        <div class="dashboard-error">
          <svg class="error-icon" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
          <p>${escapeHtml(t('errorsDashboard.loadError'))}: ${escapeHtml(loadError)}</p>
          <button class="btn btn-secondary refresh-btn">${escapeHtml(t('errorsDashboard.refresh'))}</button>
        </div>
      </div>
    `;
    setupEventHandlers();
    return;
  }

  const stats = getStats();

  if (currentView === 'summary') {
    renderSummaryView(stats, dir);
  } else {
    renderCategoryView(dir);
  }

  setupEventHandlers();
}

/**
 * Render summary view with category cards
 */
function renderSummaryView(stats, dir) {
  const healthClass = stats.healthScore >= 80 ? 'good' : stats.healthScore >= 50 ? 'warning' : 'critical';

  // Get non-empty categories
  const activeCategories = Object.entries(categorizedIssues)
    .filter(([_, issues]) => issues.length > 0)
    .sort((a, b) => {
      // Sort by severity (errors first) then by count
      const aSeverity = CATEGORY_META[a[0]].severity === 'error' ? 0 : 1;
      const bSeverity = CATEGORY_META[b[0]].severity === 'error' ? 0 : 1;
      if (aSeverity !== bSeverity) return aSeverity - bSeverity;
      return b[1].length - a[1].length;
    });

  containerElement.innerHTML = `
    <div class="errors-dashboard" dir="${dir}">
      <!-- Header -->
      <div class="dashboard-header">
        <div class="dashboard-header-content">
          <h2 class="dashboard-title">${escapeHtml(t('errorsDashboard.title'))}</h2>
          <p class="dashboard-subtitle">${escapeHtml(t('errorsDashboard.subtitle'))}</p>
        </div>
        <button class="btn btn-secondary refresh-btn">
          <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          ${escapeHtml(t('errorsDashboard.refresh'))}
        </button>
      </div>

      <!-- Stats Overview -->
      <div class="dashboard-stats-bar">
        <div class="stat-item stat-health ${healthClass}">
          <span class="stat-value">${stats.healthScore}%</span>
          <span class="stat-label">${escapeHtml(t('errorsDashboard.healthScore'))}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item stat-total">
          <span class="stat-value">${stats.total}</span>
          <span class="stat-label">${escapeHtml(t('errorsDashboard.totalRecords'))}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item stat-errors">
          <span class="stat-value">${stats.errorCount}</span>
          <span class="stat-label">${escapeHtml(t('errorsDashboard.errors'))}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item stat-warnings">
          <span class="stat-value">${stats.warningCount}</span>
          <span class="stat-label">${escapeHtml(t('errorsDashboard.warnings'))}</span>
        </div>
      </div>

      ${activeCategories.length === 0 ? `
        <!-- No Issues -->
        <div class="dashboard-empty">
          <svg class="success-icon" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
          <p>${escapeHtml(t('errorsDashboard.noIssues'))}</p>
        </div>
      ` : `
        <!-- Category Cards Grid -->
        <div class="category-cards-grid">
          ${activeCategories.map(([category, issues]) => {
            const meta = CATEGORY_META[category];
            const errorCount = issues.filter(i => i.type === 'error').length;
            const warningCount = issues.filter(i => i.type === 'warning').length;

            return `
              <button class="category-card category-card-${meta.severity}" data-category="${category}">
                <div class="category-card-header">
                  <span class="category-icon category-icon-${meta.color}">${getCategoryIcon(meta.icon)}</span>
                  <span class="category-count">${issues.length}</span>
                </div>
                <div class="category-card-body">
                  <h3 class="category-title">${escapeHtml(t(`errorsDashboard.category.${category}`))}</h3>
                  <p class="category-summary">
                    ${errorCount > 0 ? `<span class="count-error">${errorCount} ${t('errorsDashboard.errors')}</span>` : ''}
                    ${warningCount > 0 ? `<span class="count-warning">${warningCount} ${t('errorsDashboard.warnings')}</span>` : ''}
                  </p>
                </div>
                <div class="category-card-footer">
                  <span class="view-details">${escapeHtml(t('errorsDashboard.fix'))} →</span>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

/**
 * Render category drilldown view
 */
function renderCategoryView(dir) {
  const issues = categorizedIssues[currentCategory] || [];
  const meta = CATEGORY_META[currentCategory] || { color: 'gray', severity: 'error' };

  containerElement.innerHTML = `
    <div class="errors-dashboard" dir="${dir}">
      <!-- Header -->
      <div class="dashboard-header">
        <div class="dashboard-header-content">
          <button class="back-btn">
            <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            ${escapeHtml(t('errorsDashboard.back'))}
          </button>
          <h2 class="dashboard-title">${escapeHtml(t(`errorsDashboard.category.${currentCategory}`))}</h2>
          <span class="issue-badge issue-badge-${meta.severity}">${issues.length} ${escapeHtml(t('errorsDashboard.issuesFound'))}</span>
        </div>
        <button class="btn btn-secondary refresh-btn">
          <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          ${escapeHtml(t('errorsDashboard.refresh'))}
        </button>
      </div>

      <!-- Issues List -->
      <div class="issues-list">
        ${issues.map((issue, idx) => `
          <div class="issue-card issue-card-${issue.type}" data-index="${idx}">
            <div class="issue-card-main">
              <div class="issue-header">
                <span class="issue-row-badge">${escapeHtml(t('errorsDashboard.row'))} ${issue.rowIndex + 1}</span>
                <span class="issue-code-badge issue-code-${issue.type}">${escapeHtml(issue.code)}</span>
              </div>
              <div class="issue-location">
                <span class="issue-label">${escapeHtml(getRowLabel(issue.row))}</span>
                ${issue.row.floor !== undefined ? `<span class="issue-floor">Floor ${escapeHtml(issue.row.floor)}</span>` : ''}
              </div>
              <div class="issue-message-box">
                <span class="issue-message">${escapeHtml(issue.message)}</span>
              </div>
              ${issue.details?.overlappingRowIndex ? `
                <div class="issue-related">
                  <span class="related-label">Related:</span>
                  <button class="related-link" data-go-to-row="${issue.details.overlappingRowIndex - 1}">
                    Go to Row ${issue.details.overlappingRowIndex}
                  </button>
                </div>
              ` : ''}
              ${issue.details?.duplicateRowIndex ? `
                <div class="issue-related">
                  <span class="related-label">Duplicate of:</span>
                  <button class="related-link" data-go-to-row="${issue.details.duplicateRowIndex - 1}">
                    Go to Row ${issue.details.duplicateRowIndex}
                  </button>
                </div>
              ` : ''}
            </div>
            <button class="fix-btn btn btn-primary" data-row-index="${issue.rowIndex}">
              <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
              ${escapeHtml(t('errorsDashboard.fix'))}
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Get SVG icon for category
 */
function getCategoryIcon(iconName) {
  const icons = {
    'alert-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    'arrows-horizontal': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 8l4 4-4 4M7 8l-4 4 4 4M3 12h18"/></svg>',
    'building': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>',
    'copy': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
    'code': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>',
    'layers': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 2,7 12,12 22,7"/><polyline points="2,17 12,22 22,17"/><polyline points="2,12 12,17 22,12"/></svg>',
    'file-text': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    'alert-triangle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };
  return icons[iconName] || icons['alert-circle'];
}

/**
 * Setup event handlers
 */
function setupEventHandlers() {
  if (!containerElement) return;

  // Refresh button
  const refreshBtn = containerElement.querySelector('.refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadCSVData());
  }

  // Back button
  const backBtn = containerElement.querySelector('.back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      currentView = 'summary';
      currentCategory = null;
      render();
    });
  }

  // Category cards
  containerElement.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      currentCategory = card.dataset.category;
      currentView = 'category';
      render();
    });
  });

  // Fix buttons
  containerElement.querySelectorAll('.fix-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rowIndex = parseInt(btn.dataset.rowIndex, 10);
      const issue = categorizedIssues[currentCategory]?.find(i => i.rowIndex === rowIndex);
      if (issue) {
        handleFixClick(issue);
      }
    });
  });

  // Related row links (Go to Row X)
  containerElement.querySelectorAll('.related-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      const rowIndex = parseInt(link.dataset.goToRow, 10);
      const relatedRow = csvData[rowIndex];
      if (relatedRow) {
        // Open the edit dialog for the related row
        handleFixClick({ row: relatedRow, rowIndex });
      }
    });
  });
}

/**
 * Initialize the errors dashboard
 * @param {string} containerId - Container element ID
 * @returns {Object} Dashboard API
 */
export function initErrorsDashboard(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[ErrorsDashboard] Container with id "${containerId}" not found`);
    return null;
  }

  containerElement = container;
  currentView = 'summary';
  currentCategory = null;

  loadCSVData();

  // Listen for locale changes
  document.addEventListener('localeChanged', render);

  return {
    refresh: loadCSVData,
    getStats,
    destroy: () => {
      containerElement = null;
      csvData = [];
      allIssues = [];
      categorizedIssues = {};
      document.removeEventListener('localeChanged', render);
    }
  };
}

export default { initErrorsDashboard };
