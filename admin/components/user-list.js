// User List Component - Display paginated table of users with actions
import i18n from '../i18n.js?v=5';

// Default debounce delay for search
const DEBOUNCE_DELAY = 300;

// Status mapping for consistent handling
const STATUS_CONFIG = {
  Enabled: { translationKey: 'users.enabled', testId: 'status-enabled', className: 'text-green-600' },
  Disabled: { translationKey: 'users.disabled', testId: 'status-disabled', className: 'text-red-600' },
  FORCE_CHANGE_PASSWORD: { translationKey: 'users.forceChangePassword', testId: 'status-force-change', className: 'text-yellow-600' }
};

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
 * Format timestamp in localized format
 * @param {string} timestamp - ISO timestamp string
 * @param {string} locale - Locale code ('en' or 'he')
 * @returns {string} Formatted timestamp
 */
function formatDate(timestamp, locale = 'en') {
  if (!timestamp) {
    return '-';
  }
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return '-';
  }
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', options);
}

/**
 * Debounce function to limit function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * UserList Component
 * Displays a paginated table of users with search, filtering, and action buttons
 */
class UserList {
  constructor(container) {
    this.container = container;
    this.users = [];
    this.filteredUsers = [];
    this.currentPage = 1;
    this.pageSize = 10;
    this.searchQuery = '';
    this.loading = false;

    // Bind methods
    this.render = this.render.bind(this);
    this.handleSearch = debounce(this.handleSearch.bind(this), DEBOUNCE_DELAY);
  }

  /**
   * Initialize the component
   * @param {Object} options - Configuration options
   * @param {Array} options.users - Array of user objects
   * @param {number} options.pageSize - Number of users per page
   * @param {boolean} options.loading - Whether to show loading state
   */
  async init(options = {}) {
    const { users = [], pageSize = 10, loading = false } = options;

    this.users = users;
    this.filteredUsers = [...users];
    this.pageSize = pageSize;
    this.loading = loading;
    this.currentPage = 1;
    this.searchQuery = '';

    this.render();
    this.setupEventListeners();
  }

  /**
   * Update users list without full re-initialization
   * @param {Array} users - New array of user objects
   */
  updateUsers(users) {
    this.users = users;
    this.filterUsers(this.searchQuery);
    this.render();
    this.setupEventListeners();
  }

  /**
   * Set loading state
   * @param {boolean} loading - Whether to show loading state
   */
  setLoading(loading) {
    this.loading = loading;
    this.render();
    if (!loading) {
      this.setupEventListeners();
    }
  }

  /**
   * Get translation with fallback
   * @param {string} key - Translation key
   * @returns {string} Translated string
   */
  t(key) {
    return i18n.t(key);
  }

  /**
   * Get current locale
   * @returns {string} Current locale code
   */
  getLocale() {
    return i18n.getLocale() || 'en';
  }

  /**
   * Check if current locale is RTL
   * @returns {boolean} True if RTL
   */
  isRTL() {
    return i18n.isRTL();
  }

  /**
   * Get paginated users for current page
   * @returns {Array} Users for current page
   */
  getPaginatedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredUsers.slice(start, end);
  }

  /**
   * Get total number of pages
   * @returns {number} Total pages
   */
  getTotalPages() {
    return Math.ceil(this.filteredUsers.length / this.pageSize);
  }

  /**
   * Filter users based on search query
   * @param {string} query - Search query
   */
  filterUsers(query) {
    this.searchQuery = query.toLowerCase();

    if (!this.searchQuery) {
      this.filteredUsers = [...this.users];
    } else {
      this.filteredUsers = this.users.filter(user =>
        user.username.toLowerCase().includes(this.searchQuery) ||
        user.email.toLowerCase().includes(this.searchQuery)
      );
    }

    this.currentPage = 1;
  }

  /**
   * Handle search input
   * @param {string} query - Search query
   */
  handleSearch(query) {
    this.filterUsers(query);
    this.render();
    this.setupEventListeners();
  }

  /**
   * Navigate to a specific page
   * @param {number} page - Page number
   */
  goToPage(page) {
    const totalPages = this.getTotalPages();
    if (page >= 1 && page <= totalPages) {
      this.currentPage = page;
      this.render();
      this.setupEventListeners();
    }
  }

  /**
   * Render role badge
   * @param {string} role - User role
   * @returns {string} HTML for role badge
   */
  renderRoleBadge(role) {
    const isAdmin = role === 'admin';
    const label = isAdmin ? this.t('auth.admin') : this.t('auth.editor');
    const testId = isAdmin ? 'role-badge-admin' : 'role-badge-editor';
    const bgColor = isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';

    return `
      <span
        data-testid="${testId}"
        class="px-2 py-1 text-xs font-medium rounded-full ${bgColor}"
      >
        ${escapeHtml(label)}
      </span>
    `;
  }

  /**
   * Render status badge
   * @param {string} status - User status
   * @returns {string} HTML for status badge
   */
  renderStatusBadge(status) {
    const config = STATUS_CONFIG[status] || {
      translationKey: null,
      testId: 'status-unknown',
      className: 'text-gray-600'
    };

    const label = config.translationKey ? this.t(config.translationKey) : status;

    return `
      <span
        data-testid="${config.testId}"
        class="text-sm ${config.className}"
      >
        ${escapeHtml(label)}
      </span>
    `;
  }

  /**
   * Render action buttons for a user
   * @param {Object} user - User object
   * @returns {string} HTML for action buttons
   */
  renderActionButtons(user) {
    return `
      <div class="flex gap-2">
        <button
          data-testid="edit-button"
          data-username="${escapeHtml(user.username)}"
          class="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="${escapeHtml(this.t('users.edit'))} ${escapeHtml(user.username)}"
        >
          ${escapeHtml(this.t('users.edit'))}
        </button>
        <button
          data-testid="reset-password-button"
          data-username="${escapeHtml(user.username)}"
          class="px-2 py-1 text-xs font-medium text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500"
          aria-label="${escapeHtml(this.t('users.resetPassword'))} ${escapeHtml(user.username)}"
        >
          ${escapeHtml(this.t('users.resetPassword'))}
        </button>
        <button
          data-testid="delete-button"
          data-username="${escapeHtml(user.username)}"
          class="px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label="${escapeHtml(this.t('users.delete'))} ${escapeHtml(user.username)}"
        >
          ${escapeHtml(this.t('users.delete'))}
        </button>
      </div>
    `;
  }

  /**
   * Render range restrictions indicator
   * @param {Object} user - User object
   * @returns {string} HTML for restrictions indicator
   */
  renderRestrictionsIndicator(user) {
    // Only show for editors with configured ranges
    if (user.role !== 'editor' || !user.allowedRanges) {
      return '';
    }

    const ranges = user.allowedRanges;
    const hasRestrictions = ranges.enabled && ranges.filterGroups && ranges.filterGroups.length > 0;

    if (!hasRestrictions) {
      return '';
    }

    // Build tooltip text
    const groupCount = ranges.filterGroups.length;
    const tooltipText = this.t('users.hasRangeRestrictions').replace('{count}', groupCount);

    return `
      <span
        class="inline-flex items-center ms-2 text-orange-500 cursor-help"
        title="${escapeHtml(tooltipText)}"
        data-testid="restrictions-indicator"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
      </span>
    `;
  }

  /**
   * Render a single user row
   * @param {Object} user - User object
   * @returns {string} HTML for user row
   */
  renderUserRow(user) {
    const locale = this.getLocale();
    const formattedDate = formatDate(user.created, locale);

    return `
      <tr data-testid="user-row" class="hover:bg-gray-50 border-b border-gray-100">
        <td data-testid="user-username" class="px-4 py-3 text-sm text-gray-900">
          <div class="font-medium">${escapeHtml(user.email)}</div>
        </td>
        <td class="px-4 py-3 text-sm">
          <div class="flex items-center">
            ${this.renderRoleBadge(user.role)}
            ${this.renderRestrictionsIndicator(user)}
          </div>
        </td>
        <td class="px-4 py-3 text-sm">
          ${this.renderStatusBadge(user.status)}
        </td>
        <td data-testid="user-created" class="px-4 py-3 text-sm text-gray-700">
          ${escapeHtml(formattedDate)}
        </td>
        <td class="px-4 py-3 text-sm">
          ${this.renderActionButtons(user)}
        </td>
      </tr>
    `;
  }

  /**
   * Render pagination controls
   * @returns {string} HTML for pagination controls
   */
  renderPagination() {
    const totalPages = this.getTotalPages();

    if (totalPages <= 1) {
      return '';
    }

    const isPrevDisabled = this.currentPage === 1;
    const isNextDisabled = this.currentPage === totalPages;

    return `
      <div data-testid="pagination" class="flex items-center justify-between px-4 py-3 border-t border-gray-200">
        <button
          data-testid="pagination-prev"
          class="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
          ${isPrevDisabled ? 'disabled' : ''}
        >
          &laquo;
        </button>
        <span data-testid="pagination-info" class="text-sm text-gray-700">
          ${this.currentPage} / ${totalPages}
        </span>
        <button
          data-testid="pagination-next"
          class="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
          ${isNextDisabled ? 'disabled' : ''}
        >
          &raquo;
        </button>
      </div>
    `;
  }

  /**
   * Render loading state
   * @returns {string} HTML for loading state
   */
  renderLoadingState() {
    return `
      <div data-testid="loading-state" class="flex items-center justify-center py-12 text-gray-500">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        ${escapeHtml(this.t('common.loading'))}
      </div>
    `;
  }

  /**
   * Render empty state
   * @returns {string} HTML for empty state
   */
  renderEmptyState() {
    return `
      <div data-testid="empty-state" class="flex flex-col items-center justify-center py-12 text-gray-500">
        <svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
        </svg>
        <p>${escapeHtml(this.t('users.noUsers'))}</p>
      </div>
    `;
  }

  /**
   * Render search input
   * @returns {string} HTML for search input
   */
  renderSearchInput() {
    return `
      <div class="mb-4">
        <input
          type="text"
          data-testid="user-search"
          placeholder="${escapeHtml(this.t('users.search'))}"
          aria-label="${escapeHtml(this.t('users.search'))}"
          value="${escapeHtml(this.searchQuery)}"
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    `;
  }

  /**
   * Render the table
   * @returns {string} HTML for table
   */
  renderTable() {
    const paginatedUsers = this.getPaginatedUsers();

    return `
      <div class="overflow-x-auto">
        <table class="min-w-full" role="table">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                ${escapeHtml(this.t('users.email'))}
              </th>
              <th scope="col" class="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                ${escapeHtml(this.t('users.role'))}
              </th>
              <th scope="col" class="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                ${escapeHtml(this.t('users.status'))}
              </th>
              <th scope="col" class="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                ${escapeHtml(this.t('users.created'))}
              </th>
              <th scope="col" class="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                ${escapeHtml(this.t('users.actions'))}
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${paginatedUsers.map(user => this.renderUserRow(user)).join('')}
          </tbody>
        </table>
      </div>
      ${this.renderPagination()}
    `;
  }

  /**
   * Render the component
   */
  render() {
    if (!this.container) return;

    let content;

    if (this.loading) {
      content = this.renderLoadingState();
    } else if (this.filteredUsers.length === 0) {
      content = `
        ${this.renderSearchInput()}
        ${this.renderEmptyState()}
      `;
    } else {
      content = `
        ${this.renderSearchInput()}
        ${this.renderTable()}
      `;
    }

    this.container.innerHTML = `
      <div class="card bg-white rounded-lg shadow p-6">
        ${content}
      </div>
    `;
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    if (!this.container) return;

    // Search input
    const searchInput = this.container.querySelector('[data-testid="user-search"]');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Pagination buttons
    const prevButton = this.container.querySelector('[data-testid="pagination-prev"]');
    const nextButton = this.container.querySelector('[data-testid="pagination-next"]');

    if (prevButton) {
      prevButton.addEventListener('click', () => {
        this.goToPage(this.currentPage - 1);
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', () => {
        this.goToPage(this.currentPage + 1);
      });
    }

    // Action buttons
    this.container.addEventListener('click', (e) => {
      const editButton = e.target.closest('[data-testid="edit-button"]');
      const resetButton = e.target.closest('[data-testid="reset-password-button"]');
      const deleteButton = e.target.closest('[data-testid="delete-button"]');

      if (editButton) {
        const username = editButton.getAttribute('data-username');
        const user = this.users.find(u => u.username === username);
        this.container.dispatchEvent(new CustomEvent('user-edit', {
          detail: user,
          bubbles: true
        }));
      }

      if (resetButton) {
        const username = resetButton.getAttribute('data-username');
        const user = this.users.find(u => u.username === username);
        this.container.dispatchEvent(new CustomEvent('user-reset-password', {
          detail: user,
          bubbles: true
        }));
      }

      if (deleteButton) {
        const username = deleteButton.getAttribute('data-username');
        const user = this.users.find(u => u.username === username);
        this.container.dispatchEvent(new CustomEvent('user-delete', {
          detail: user,
          bubbles: true
        }));
      }
    });
  }
}

export default UserList;
