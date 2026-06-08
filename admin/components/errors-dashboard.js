// Errors Dashboard Component - Interactive dashboard for viewing and fixing validation issues
import i18n from '../i18n.js?v=5';
import { validateRow, VALIDATION_ERRORS, VALIDATION_WARNINGS } from '../services/data-model.js';
import { preloadAllFloors } from '../services/svg-parser.js';
import { showEditLocationDialog, setCollections } from './edit-location-dialog.js?v=7';
import { getAuthHeaders } from '../app.js?v=5';
import logger from '../services/logger.js?v=1';
import { buildReportWorkbookModel, writeWorkbook, reportFilename } from './errors-dashboard/report-export.js';
import { buildOverlapClusters } from './errors-dashboard/overlap-clusters.js';
import { showToast } from './toast.js?v=5';

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
  'errorsDashboard.export.cta': { en: '📥 Download errors report', he: '📥 הורד דוח שגיאות' },
  'errorsDashboard.export.empty': { en: 'No errors to export', he: 'אין שגיאות לייצוא' },
  'errorsDashboard.export.error': { en: 'Could not generate the report.', he: 'לא ניתן ליצור את הדוח.' },
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
  'errorsDashboard.category.format': { en: 'Format Issues', he: 'בעיות פורמט' },
  'errorsDashboard.overlap.summary': { en: '{causes} overlap groups · {affected} ranges affected', he: '{causes} קבוצות חפיפה · {affected} טווחים מושפעים' },
  'errorsDashboard.overlap.rootCause': { en: 'Widest overlapping range — start here', he: 'הטווח הרחב ביותר — התחילו כאן' },
  'errorsDashboard.overlap.catchAll': { en: 'Catch-all range (usually intentional) — review the {n} shelves below', he: 'טווח כולל (בדרך כלל מכוון) — בדקו את {n} המדפים שלמטה' },
  'errorsDashboard.overlap.affects': { en: 'affects {n} ranges', he: 'משפיע על {n} טווחים' },
  'errorsDashboard.overlap.fixRange': { en: 'Go to this range →', he: '← מעבר לטווח זה' },
  'errorsDashboard.overlap.other': { en: 'Other overlaps', he: 'חפיפות אחרות' },
  'errorsDashboard.overlap.goToRow': { en: 'Go to Row {n}', he: 'מעבר לשורה {n}' },
  'errorsDashboard.floor': { en: 'Floor {n}', he: 'קומה {n}' },
  'errorsDashboard.related': { en: 'Related', he: 'קשור' },
  'errorsDashboard.duplicateOf': { en: 'Duplicate of', he: 'כפילות של' },
  'errorsDashboard.goToRow': { en: 'Go to Row {n}', he: 'מעבר לשורה {n}' },
  'errorsDashboard.overlap.expand': { en: 'Show affected ranges', he: 'הצג טווחים מושפעים' },
  'errorsDashboard.print.cta': { en: '🖨 Print report', he: '🖨 הדפס דוח' }
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

// Error code to category mapping. Exported for #105 regression guards.
// W002 is declared in VALIDATION_WARNINGS but never emitted, so it is NOT mapped
// here — unknown codes still fall back to 'format' via `|| 'format'` below.
export const ERROR_CATEGORIES = {
  E001: 'required',
  E002: 'range',
  E003: 'floor',
  E004: 'range',
  E005: 'duplicate',
  E006: 'svgCode',
  W001: 'overlap',
  W003: 'description'
};

// Category metadata. Exported for #105 regression guards. `format` stays as the
// unknown-code fallback bucket and is hidden from the summary when it has no
// findings.
export const CATEGORY_META = {
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

  // Add cache-busting parameter to bypass CloudFront cache
  // This ensures we get fresh data after saves (CloudFront invalidation takes time)
  const cacheBuster = `?_t=${Date.now()}`;
  const url = `${CLOUDFRONT_URL}/data/mapping.csv${cacheBuster}`;

  logger.info('api', 'Loading CSV data from CloudFront', { url });

  try {
    const response = await fetch(url);

    logger.debug('api', 'CSV fetch response received', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    csvData = parseCSV(text);

    logger.info('api', 'CSV data loaded successfully', {
      rowCount: csvData.length,
      columns: csvData.length > 0 ? Object.keys(csvData[0]).filter(k => k !== '_index').length : 0
    });

    // Extract unique collections for the edit dialog
    const collections = [...new Set(csvData.map(r => r.collectionName).filter(Boolean))]
      .map(name => {
        const row = csvData.find(r => r.collectionName === name);
        return { name, nameHe: row?.collectionNameHe || name };
      });
    setCollections(collections);

    // #137: warm the SVG cache before validating, so E006 (svgCode not on its
    // floor's SVG) doesn't silently under-report while the cache is cold —
    // isValidSvgCode is lenient (returns true) until the cache lands. Mirrors the
    // Map Editor awaiting the SVG before deriving orphans. A preload failure must
    // not hide the dashboard, so it never rejects the load.
    await preloadAllFloors().catch(() => {});

    validateAllRows();
  } catch (error) {
    logger.error('error', 'Failed to load CSV data', {
      error: error.message,
      errorName: error.name,
      url: `${CLOUDFRONT_URL}/data/mapping.csv`
    });
    loadError = error.message;
  } finally {
    isLoading = false;
    render();
  }
}

/**
 * Parse CSV text to array of objects
 */
export function parseCSV(text) {
  // #138: split on CRLF or LF (canonical, matches csv-editor) — not
  // text.trim().split('\n'), which left a stray '\r' inside the last field.
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    // Skip genuinely blank lines (e.g. a trailing CRLF) WITHOUT shifting
    // _index, which stays line-based so "go to row" navigation lands correctly.
    if (lines[i].trim() === '') continue;
    const values = parseCSVLine(lines[i]);
    // #138: build a row for EVERY non-blank line — fill missing columns with ''
    // and ignore extras — instead of silently DROPPING count-mismatched rows.
    // The dashboard exists to surface broken rows; dropping them hid the very
    // data-integrity problems it's meant to report.
    const row = { _index: i - 1 };
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
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
        category,
        details: error.details  // #131: carry duplicateRowIndex etc. for "Go to Row"
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
        category,
        details: warning.details  // #131: carry overlappingRowIndex etc. for "Go to Row"
      };
      allIssues.push(issue);
      categorizedIssues[category].push(issue);
    });
  });

  // Log validation results
  const errorCount = allIssues.filter(i => i.type === 'error').length;
  const warningCount = allIssues.filter(i => i.type === 'warning').length;
  const categoryCounts = {};
  Object.entries(categorizedIssues).forEach(([cat, issues]) => {
    if (issues.length > 0) {
      categoryCounts[cat] = issues.length;
    }
  });

  logger.debug('system', 'Validation completed', {
    totalRows: csvData.length,
    errorCount,
    warningCount,
    totalIssues: allIssues.length,
    categoryCounts
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
  // Update the row in csvData
  const idx = csvData.findIndex(r => r._index === row._index);
  if (idx !== -1) {
    csvData[idx] = { ...csvData[idx], ...row };
  }

  // Convert back to CSV format
  const headers = Object.keys(csvData[0]).filter(k => k !== '_index');
  const csvLines = [headers.join(',')];
  csvData.forEach(r => {
    const values = headers.map(h => {
      const val = r[h] || '';
      return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    });
    csvLines.push(values.join(','));
  });

  const csvContent = csvLines.join('\n');

  // Log save operation start
  logger.info('api', 'Saving CSV data - request started', {
    url: `${API_ENDPOINT}/api/csv`,
    method: 'PUT',
    rowCount: csvData.length,
    rowIndex: row._index,
    contentLength: csvContent.length
  });

  let response;
  try {
    response = await fetch(`${API_ENDPOINT}/api/csv`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ csvContent })
    });
  } catch (networkError) {
    // Log network error (Failed to fetch, etc.)
    logger.error('error', 'Save request failed - network error', {
      url: `${API_ENDPOINT}/api/csv`,
      error: networkError.message,
      errorName: networkError.name,
      rowIndex: row._index
    });
    throw new Error(`Network error: ${networkError.message}`);
  }

  // Log response status
  logger.debug('api', 'Save response received', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok
  });

  if (!response.ok) {
    let errorDetail = '';
    let errorBody = null;
    try {
      errorBody = await response.json();
      errorDetail = errorBody.error || errorBody.message || '';
    } catch (e) {
      errorDetail = await response.text().catch(() => '');
    }

    // Log detailed error information based on status code
    const logData = {
      url: `${API_ENDPOINT}/api/csv`,
      status: response.status,
      statusText: response.statusText,
      errorDetail,
      errorBody,
      rowIndex: row._index
    };

    if (response.status === 401) {
      logger.error('error', 'Save failed - authentication error', logData);
    } else if (response.status === 403) {
      logger.error('error', 'Save failed - permission denied', logData);
    } else if (response.status === 400) {
      logger.error('error', 'Save failed - invalid request', logData);
    } else {
      logger.error('error', `Save failed - HTTP ${response.status}`, logData);
    }

    const errorMsg = response.status === 401 ? 'Authentication required. Please log in again.' :
                     response.status === 403 ? 'You do not have permission to save changes.' :
                     response.status === 400 ? `Invalid request: ${errorDetail}` :
                     `Failed to save: Server returned ${response.status}${errorDetail ? ` - ${errorDetail}` : ''}`;
    throw new Error(errorMsg);
  }

  const result = await response.json();

  // Log successful save
  logger.info('api', 'CSV data saved successfully', {
    rowIndex: row._index,
    version: result.version || 'unknown',
    result
  });

  // Re-validate after save
  validateAllRows();
  render();

  return true;
}

/**
 * Handle fix button click - open edit dialog
 */
async function handleFixClick(issue) {
  logger.userAction('click', 'Fix button', {
    rowIndex: issue.rowIndex,
    issueType: issue.type,
    issueCode: issue.code,
    category: issue.category
  });

  const result = await showEditLocationDialog({
    row: { ...issue.row },
    allRows: csvData,
    onSave: async (updatedRow) => {
      return await saveRow(updatedRow);
    }
  });

  if (result?.saved) {
    logger.info('user', 'Fix saved successfully', {
      rowIndex: issue.rowIndex,
      issueCode: issue.code
    });
    // Refresh data after successful save
    await loadCSVData();
  } else {
    logger.debug('user', 'Fix dialog closed without saving', {
      rowIndex: issue.rowIndex
    });
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
        <button class="btn btn-secondary print-btn">
          ${escapeHtml(t('errorsDashboard.print.cta'))}
        </button>
        <button class="btn btn-secondary export-btn" ${(!allIssues || allIssues.length === 0) ? `disabled title="${escapeHtml(t('errorsDashboard.export.empty'))}"` : ''}>
          ${escapeHtml(t('errorsDashboard.export.cta'))}
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

  if (currentCategory === 'overlap') {
    const { clusters, hubConflicts, otherOverlaps } = buildOverlapClusters(csvData);
    // Count what we actually list (distinct affected rows), not the raw blast
    // degree — blastRadius includes hub/claimed neighbors that get filtered out
    // of the children below, so it would over-report vs the rows shown.
    const affectedTotal = new Set(
      clusters.flatMap((c) => c.affected.map((a) => a.rowIndex))
    ).size;
    const summary = t('errorsDashboard.overlap.summary')
      .replace('{causes}', clusters.length)
      .replace('{affected}', affectedTotal);

    // Reusable "Go to Row N" jump button. data-row-index keeps the 0-based
    // index (the handler indexes csvData by it); the LABEL shows the canonical
    // spreadsheet row number from the model so it never re-derives the offset.
    const gotoBtn = (rowIndex, rowNumber) =>
      `<button class="overlap-goto-btn" data-row-index="${rowIndex}">${escapeHtml(t('errorsDashboard.overlap.goToRow').replace('{n}', rowNumber))}</button>`;

    // A pair line (used by both hub-conflicts and other-overlaps): two endpoints
    // with range detail + jump buttons, reading canonical numbers verbatim so
    // screen / Print / Excel all agree (#157).
    const pairLine = (p) => `
          <div class="overlap-affected">
            ${escapeHtml(t('errorsDashboard.row'))} ${p.row1Number}
            · <bdi>${escapeHtml(p.row1?.shelfLabel || '')}</bdi>
            · "<bdi>${escapeHtml(p.row1?.rangeStart ?? '')}–${escapeHtml(p.row1?.rangeEnd ?? '')}</bdi>"
            ${gotoBtn(p.row1Index, p.row1Number)}
            ↔ ${escapeHtml(t('errorsDashboard.row'))} ${p.row2Number}
            · <bdi>${escapeHtml(p.row2?.shelfLabel || '')}</bdi>
            · "<bdi>${escapeHtml(p.row2?.rangeStart ?? '')}–${escapeHtml(p.row2?.rangeEnd ?? '')}</bdi>"
            ${gotoBtn(p.row2Index, p.row2Number)}
          </div>`;

    const clusterHtml = clusters.map((c, ci) => {
      // One source for the displayed "affects N" count AND the data-affected
      // hook, so the header can never disagree with the rows actually listed.
      const affectsShown = c.affectsShown;
      // #158: a catch-all (000–999) hub overlaps almost everything, so "go to
      // this range" would point at the row the librarian should NOT edit. Reframe
      // it as likely-intentional; the per-shelf children stay the primary rows.
      const hubLabel = c.isCatchAll
        ? escapeHtml(t('errorsDashboard.overlap.catchAll').replace('{n}', affectsShown))
        : escapeHtml(t('errorsDashboard.overlap.rootCause'));
      return `
      <div class="overlap-cluster" data-cluster="${ci}" data-affected="${affectsShown}">
        <div class="overlap-cluster-header">
          <button type="button" class="overlap-cluster-toggle" aria-expanded="true" aria-controls="overlap-children-${ci}" aria-label="${escapeHtml(t('errorsDashboard.overlap.expand'))}" data-cluster-toggle="${ci}">▾</button>
          <strong>${hubLabel}</strong>
          · ${escapeHtml(t('errorsDashboard.row'))} ${c.hubRowNumber}
          · <bdi>${escapeHtml(c.hubRow.shelfLabel || '')}</bdi>
          "<bdi>${escapeHtml(c.hubRow.rangeStart)}–${escapeHtml(c.hubRow.rangeEnd)}</bdi>"
          · ${escapeHtml(t('errorsDashboard.overlap.affects').replace('{n}', affectsShown))}
          · ${escapeHtml(t('errorsDashboard.floor').replace('{n}', c.floor))} · <bdi>${escapeHtml(c.collection)}</bdi>
          <button class="btn btn-primary overlap-fix-btn" data-row-index="${c.hubRowIndex}">
            ${escapeHtml(t('errorsDashboard.overlap.fixRange'))}
          </button>
        </div>
        <div class="overlap-cluster-children" id="overlap-children-${ci}" data-cluster-children="${ci}">
          ${c.affected.map(a => `
            <div class="overlap-affected">
              ${escapeHtml(t('errorsDashboard.row'))} ${a.rowNumber}
              · <bdi>${escapeHtml(a.row.shelfLabel || '')}</bdi>
              · "<bdi>${escapeHtml(a.row.rangeStart)}–${escapeHtml(a.row.rangeEnd)}</bdi>"
              ${gotoBtn(a.rowIndex, a.rowNumber)}
            </div>`).join('')}
        </div>
      </div>`;
    }).join('');

    // #156: both-hub overlaps that used to be hidden everywhere now get their
    // own labelled section, with range detail + jump-to-row on each endpoint.
    const hubConflictsHtml = hubConflicts.length ? `
      <div class="overlap-hub-conflicts">
        <h3>${escapeHtml(t('errorsDashboard.overlap.hubConflicts'))}</h3>
        ${hubConflicts.map(pairLine).join('')}
      </div>` : '';

    const otherHtml = otherOverlaps.length ? `
      <div class="overlap-other">
        <h3>${escapeHtml(t('errorsDashboard.overlap.other'))}</h3>
        ${otherOverlaps.map(pairLine).join('')}
      </div>` : '';

    containerElement.innerHTML = `
      <div class="errors-dashboard" dir="${dir}">
        <div class="dashboard-header">
          <div class="dashboard-header-content">
            <button class="back-btn">
              <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
              ${escapeHtml(t('errorsDashboard.back'))}
            </button>
            <h2 class="dashboard-title">${escapeHtml(t('errorsDashboard.category.overlap'))}</h2>
          </div>
          <button class="btn btn-secondary print-btn">
            ${escapeHtml(t('errorsDashboard.print.cta'))}
          </button>
          <button class="btn btn-secondary export-btn" ${(!allIssues || allIssues.length === 0) ? `disabled title="${escapeHtml(t('errorsDashboard.export.empty'))}"` : ''}>
            ${escapeHtml(t('errorsDashboard.export.cta'))}
          </button>
        </div>
        <p class="overlap-summary">${escapeHtml(summary)}</p>
        <div class="overlap-clusters">${clusterHtml}${hubConflictsHtml}${otherHtml}</div>
      </div>`;
    return;
  }

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
        <button class="btn btn-secondary export-btn" ${(!allIssues || allIssues.length === 0) ? `disabled title="${escapeHtml(t('errorsDashboard.export.empty'))}"` : ''}>
          ${escapeHtml(t('errorsDashboard.export.cta'))}
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
                ${issue.row.floor !== undefined ? `<span class="issue-floor">${escapeHtml(t('errorsDashboard.floor').replace('{n}', issue.row.floor))}</span>` : ''}
              </div>
              <div class="issue-message-box">
                <span class="issue-message">${escapeHtml(issue.message)}</span>
              </div>
              ${issue.details?.overlappingRowIndex ? `
                <div class="issue-related">
                  <span class="related-label">${escapeHtml(t('errorsDashboard.related'))}:</span>
                  <button class="related-link" data-go-to-row="${issue.details.overlappingRowIndex - 1}">
                    ${escapeHtml(t('errorsDashboard.goToRow').replace('{n}', issue.details.overlappingRowIndex))}
                  </button>
                </div>
              ` : ''}
              ${issue.details?.duplicateRowIndex ? `
                <div class="issue-related">
                  <span class="related-label">${escapeHtml(t('errorsDashboard.duplicateOf'))}:</span>
                  <button class="related-link" data-go-to-row="${issue.details.duplicateRowIndex - 1}">
                    ${escapeHtml(t('errorsDashboard.goToRow').replace('{n}', issue.details.duplicateRowIndex))}
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
 * Build and trigger the download of the comprehensive errors report as a
 * styled .xlsx. Root-cause overlap groups come from the cluster engine; all
 * other categories come from `allIssues`.
 */
async function handleDownloadReport() {
  if (!allIssues || allIssues.length === 0) return;
  try {
    const clusterModel = buildOverlapClusters(csvData);
    const otherIssues = allIssues.filter(i => i.category !== 'overlap');
    const model = buildReportWorkbookModel(clusterModel, otherIssues, csvData);
    await writeWorkbook(model, reportFilename());
    logger.userAction('click', 'Download errors report', { count: model.rows.length });
  } catch (err) {
    logger.error('errors-dashboard', 'Report export failed', { error: String(err) });
    showToast(t('errorsDashboard.export.error'), 'error');
  }
}

/**
 * Expand every overlap cluster group, then trigger the browser print dialog
 * so paper output shows the affected ranges (which are collapsed on screen).
 */
function handlePrintReport() {
  containerElement.querySelectorAll('.overlap-cluster-children').forEach(el => { el.hidden = false; });
  window.print();
}

/**
 * Setup event handlers
 */
function setupEventHandlers() {
  if (!containerElement) return;

  // Refresh button
  const refreshBtn = containerElement.querySelector('.refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      logger.userAction('click', 'Refresh button');
      loadCSVData();
    });
  }

  // Export button
  const exportBtn = containerElement.querySelector('.export-btn');
  if (exportBtn && !exportBtn.disabled) {
    exportBtn.addEventListener('click', handleDownloadReport);
  }

  // Print button(s) — expand cluster groups then open the print dialog
  containerElement.querySelectorAll('.print-btn').forEach(btn => btn.addEventListener('click', handlePrintReport));

  // Back button
  const backBtn = containerElement.querySelector('.back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      logger.userAction('click', 'Back to Overview button', {
        fromCategory: currentCategory
      });
      currentView = 'summary';
      currentCategory = null;
      render();
    });
  }

  // Category cards
  containerElement.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const category = card.dataset.category;
      const issueCount = categorizedIssues[category]?.length || 0;

      logger.userAction('click', 'Category card', {
        category,
        issueCount
      });

      currentCategory = category;
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

  // Overlap cluster expand/collapse toggles
  containerElement.querySelectorAll('[data-cluster-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ci = btn.dataset.clusterToggle;
      const children = containerElement.querySelector(`[data-cluster-children="${ci}"]`);
      const open = children.hidden;
      children.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? '▾' : '▸';
    });
  });

  // Overlap cluster "Go to this range" buttons (jump to the hub row)
  containerElement.querySelectorAll('.overlap-fix-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rowIndex = parseInt(btn.dataset.rowIndex, 10);
      handleFixClick({ row: csvData[rowIndex], rowIndex });
    });
  });

  // "Go to Row N" buttons on affected children + Other-overlaps endpoints —
  // so every overlapping row is reachable, not just the hub (committee / #131).
  containerElement.querySelectorAll('.overlap-goto-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rowIndex = parseInt(btn.dataset.rowIndex, 10);
      handleFixClick({ row: csvData[rowIndex], rowIndex });
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
    logger.error('system', 'Failed to initialize errors dashboard - container not found', {
      containerId
    });
    return null;
  }

  logger.info('system', 'Errors dashboard initialized', { containerId });

  containerElement = container;
  currentView = 'summary';
  currentCategory = null;

  loadCSVData();

  // Listen for locale changes
  document.addEventListener('localeChanged', render);

  return {
    refresh: loadCSVData,
    getStats,
    getCategorizedIssues: () => categorizedIssues,
    destroy: () => {
      logger.debug('system', 'Errors dashboard destroyed');
      containerElement = null;
      csvData = [];
      allIssues = [];
      categorizedIssues = {};
      document.removeEventListener('localeChanged', render);
    }
  };
}

export default { initErrorsDashboard };
