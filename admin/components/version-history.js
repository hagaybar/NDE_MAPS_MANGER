// Version History Component - Displays version history for CSV/SVG files
import i18n from '../i18n.js?v=5';
import { getAuthHeaders } from '../app.js?v=5';

const API_ENDPOINT = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod';

// Fallback translations if i18n hasn't loaded yet
const FALLBACKS = {
  'versions.title': { en: 'Version History', he: 'היסטוריית גרסאות' },
  'versions.timestamp': { en: 'Date', he: 'תאריך' },
  'versions.user': { en: 'User', he: 'משתמש' },
  'versions.size': { en: 'Size', he: 'גודל' },
  'versions.restore': { en: 'Restore', he: 'שחזר' },
  'versions.preview': { en: 'Preview', he: 'תצוגה מקדימה' },
  'versions.noVersions': { en: 'No versions available', he: 'אין גרסאות זמינות' },
  'versions.loadError': { en: 'Failed to load versions', he: 'טעינת הגרסאות נכשלה' },
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

// Callbacks for external handlers
let onPreviewCallback = null;
let onRestoreCallback = null;

/**
 * Format file size in human-readable format (B, KB, MB, GB)
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;

  if (bytes < k) {
    return `${bytes} B`;
  }

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * Format timestamp in localized format
 * @param {string} timestamp - ISO timestamp string
 * @param {string} locale - Locale code ('en' or 'he')
 * @returns {string} Formatted timestamp
 */
export function formatTimestamp(timestamp, locale = 'en') {
  const date = new Date(timestamp);
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };

  return date.toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', options);
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
 * Render loading state
 * @returns {string} HTML for loading state
 */
function renderLoadingState() {
  return `
    <div class="card bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold text-gray-800 mb-6">${escapeHtml(t('versions.title'))}</h2>
      <div data-testid="loading-state" class="flex items-center justify-center py-12 text-gray-500">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        ${escapeHtml(t('common.loading'))}
      </div>
    </div>
  `;
}

/**
 * Render empty state
 * @returns {string} HTML for empty state
 */
function renderEmptyState() {
  return `
    <div class="card bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold text-gray-800 mb-6">${escapeHtml(t('versions.title'))}</h2>
      <div data-testid="empty-state" class="flex flex-col items-center justify-center py-12 text-gray-500">
        <svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>${escapeHtml(t('versions.noVersions'))}</p>
      </div>
    </div>
  `;
}

/**
 * Render error state
 * @returns {string} HTML for error state
 */
function renderErrorState() {
  return `
    <div class="card bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold text-gray-800 mb-6">${escapeHtml(t('versions.title'))}</h2>
      <div data-testid="error-state" class="flex flex-col items-center justify-center py-12 text-red-500">
        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <p>${escapeHtml(t('versions.loadError'))}</p>
      </div>
    </div>
  `;
}

/**
 * Render version row
 * @param {Object} version - Version data
 * @param {string} locale - Current locale
 * @returns {string} HTML for version row
 */
function renderVersionRow(version, locale) {
  const formattedTime = formatTimestamp(version.timestamp, locale);
  const formattedSize = formatFileSize(version.size);

  return `
    <tr
      data-testid="version-row"
      data-version-id="${escapeHtml(version.versionId)}"
      role="button"
      tabindex="0"
      class="hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100"
    >
      <td data-testid="version-timestamp" class="px-4 py-3 text-sm text-gray-700">
        ${escapeHtml(formattedTime)}
      </td>
      <td data-testid="version-user" class="px-4 py-3 text-sm text-gray-700">
        ${escapeHtml(version.username)}
      </td>
      <td data-testid="version-size" class="px-4 py-3 text-sm text-gray-700">
        ${escapeHtml(formattedSize)}
      </td>
      <td class="px-4 py-3 text-sm">
        <button
          data-testid="restore-button"
          data-version-id="${escapeHtml(version.versionId)}"
          class="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="${escapeHtml(t('versions.restore'))} ${escapeHtml(formattedTime)}"
        >
          ${escapeHtml(t('versions.restore'))}
        </button>
      </td>
    </tr>
  `;
}

/**
 * Render the version list
 * @param {Array} versions - Array of version objects
 * @returns {string} HTML for version list
 */
function renderVersionList(versions) {
  const locale = i18n.getLocale();

  // Sort versions by timestamp (newest first)
  const sortedVersions = [...versions].sort((a, b) => {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  return `
    <div class="card bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold text-gray-800 mb-6">${escapeHtml(t('versions.title'))}</h2>
      <div class="overflow-x-auto">
        <table class="min-w-full" role="table">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                ${escapeHtml(t('versions.timestamp'))}
              </th>
              <th scope="col" class="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                ${escapeHtml(t('versions.user'))}
              </th>
              <th scope="col" class="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                ${escapeHtml(t('versions.size'))}
              </th>
              <th scope="col" class="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                ${escapeHtml(t('versions.restore'))}
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${sortedVersions.map(v => renderVersionRow(v, locale)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Set up event listeners for interactive elements
 */
function setupEventListeners() {
  const container = document.getElementById('version-history');
  if (!container) return;

  // Handle row clicks for preview
  container.addEventListener('click', (e) => {
    const row = e.target.closest('[data-testid="version-row"]');
    const restoreButton = e.target.closest('[data-testid="restore-button"]');

    if (restoreButton) {
      // Handle restore button click
      e.stopPropagation();
      const versionId = restoreButton.getAttribute('data-version-id');
      if (onRestoreCallback && versionId) {
        onRestoreCallback(versionId);
      }
    } else if (row) {
      // Handle row click for preview
      const versionId = row.getAttribute('data-version-id');
      if (onPreviewCallback && versionId) {
        onPreviewCallback(versionId);
      }
    }
  });

  // Handle keyboard navigation
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const row = e.target.closest('[data-testid="version-row"]');
      if (row) {
        e.preventDefault();
        const versionId = row.getAttribute('data-version-id');
        if (onPreviewCallback && versionId) {
          onPreviewCallback(versionId);
        }
      }
    }
  });
}

/**
 * Fetch versions from the API
 * @param {string} fileType - Type of file ('csv' or 'svg')
 * @returns {Promise<Array>} Array of version objects
 */
async function fetchVersions(fileType) {
  const response = await fetch(`${API_ENDPOINT}/api/versions/${fileType}`, {
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.versions || [];
}

/**
 * Initialize the Version History component
 * @param {Object} options - Configuration options
 * @param {string} options.fileType - Type of file ('csv' or 'svg'), defaults to 'csv'
 * @param {Function} options.onPreview - Callback when a version row is clicked
 * @param {Function} options.onRestore - Callback when restore button is clicked
 */
export async function initVersionHistory(options = {}) {
  const { fileType = 'csv', onPreview = null, onRestore = null } = options;

  // Store callbacks
  onPreviewCallback = onPreview;
  onRestoreCallback = onRestore;

  const container = document.getElementById('version-history');
  if (!container) {
    console.error('Version history container not found');
    return;
  }

  // Show loading state
  container.innerHTML = renderLoadingState();

  try {
    const versions = await fetchVersions(fileType);

    if (versions.length === 0) {
      container.innerHTML = renderEmptyState();
    } else {
      container.innerHTML = renderVersionList(versions);
      setupEventListeners();
    }
  } catch (error) {
    console.error('Failed to load versions:', error);
    container.innerHTML = renderErrorState();
  }

  // Listen for locale changes to re-render
  document.addEventListener('localeChanged', async () => {
    // Re-initialize with same options
    await initVersionHistory(options);
  });
}
