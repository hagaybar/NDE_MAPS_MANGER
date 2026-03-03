/**
 * User Menu Component
 * Displays login button when unauthenticated, or user menu with role badge and logout when authenticated
 * Supports bilingual UI (English/Hebrew) and RTL layout
 */

import authService from '../auth-service.js?v=5';
import i18n from '../i18n.js?v=5';

/**
 * Translate a key with optional parameter interpolation
 * @param {string} key - Translation key
 * @param {object} params - Parameters for interpolation
 * @returns {string} - Translated string
 */
// Fallback translations if i18n hasn't loaded yet
const FALLBACKS = {
  'auth.login': { en: 'Login', he: 'התחברות' },
  'auth.logout': { en: 'Logout', he: 'התנתקות' },
  'auth.admin': { en: 'Admin', he: 'מנהל' },
  'auth.editor': { en: 'Editor', he: 'עורך' },
  'auth.welcome': { en: 'Welcome, {name}', he: 'שלום, {name}' }
};

function t(key, params = {}) {
  let value = i18n.t(key);
  // If i18n returned the key itself, use fallback
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale() || 'en';
    value = FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  if (typeof value === 'string' && params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      value = value.replace(`{${paramKey}}`, paramValue);
    });
  }
  return value;
}

/**
 * Get role badge color class based on role
 * @param {string} role - User role ('admin' or 'editor')
 * @returns {string} - Tailwind CSS classes for badge color
 */
function getRoleBadgeColor(role) {
  return role === 'admin'
    ? 'bg-blue-500 text-white'
    : 'bg-green-500 text-white';
}

/**
 * Create the login button HTML
 * @returns {string} - HTML string for login button
 */
function createLoginButtonHTML() {
  const loginText = t('auth.login');
  return `
    <button
      data-testid="login-button"
      class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      ${loginText}
    </button>
  `;
}

/**
 * Create the user menu HTML
 * @param {object} user - User object with username, email, role
 * @returns {string} - HTML string for user menu
 */
function createUserMenuHTML(user) {
  const welcomeText = t('auth.welcome', { name: user.username });
  const roleText = t(`auth.${user.role}`);
  const logoutText = t('auth.logout');
  const roleBadgeColor = getRoleBadgeColor(user.role);
  const isRTL = i18n.isRTL();

  return `
    <div data-testid="user-menu" class="relative${isRTL ? ' rtl' : ''}">
      <button
        data-testid="user-menu-toggle"
        class="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span data-testid="username-display" class="text-gray-700 dark:text-gray-200 font-medium">
          ${user.username}
        </span>
        <span
          data-testid="role-badge"
          class="${roleBadgeColor} px-2 py-0.5 text-xs rounded-full font-medium"
        >
          ${roleText}
        </span>
        <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>

      <div
        data-testid="user-menu-dropdown"
        class="hidden absolute ${isRTL ? 'left-0' : 'right-0'} mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
      >
        <div class="p-4 border-b border-gray-200 dark:border-gray-700">
          <p data-testid="welcome-message" class="text-gray-800 dark:text-gray-200 font-medium">
            ${welcomeText}
          </p>
          <div class="mt-2 flex items-center gap-2">
            <span
              data-testid="role-badge"
              class="${roleBadgeColor} px-2 py-0.5 text-xs rounded-full font-medium"
            >
              ${roleText}
            </span>
            <span class="text-gray-500 dark:text-gray-400 text-sm">${user.email}</span>
          </div>
        </div>
        <div class="p-2">
          <button
            data-testid="logout-button"
            class="w-full text-${isRTL ? 'right' : 'left'} px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
          >
            ${logoutText}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize the user menu component
 * @param {string} containerId - ID of the container element
 * @throws {Error} - If container element is not found
 */
export function initUserMenu(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container element with ID "${containerId}" not found`);
  }

  let unsubscribe = null;

  /**
   * Render the component based on current auth state
   * @param {object} state - Auth state { isAuthenticated, user }
   */
  function render(state) {
    const { isAuthenticated, user } = state;

    if (isAuthenticated && user) {
      container.innerHTML = createUserMenuHTML(user);
      setupUserMenuEventListeners(container);
    } else {
      container.innerHTML = createLoginButtonHTML();
      setupLoginButtonEventListeners(container);
    }
  }

  /**
   * Setup event listeners for login button
   * @param {HTMLElement} container - Container element
   */
  function setupLoginButtonEventListeners(container) {
    const loginButton = container.querySelector('[data-testid="login-button"]');
    if (loginButton) {
      loginButton.addEventListener('click', () => {
        authService.login();
      });
    }
  }

  /**
   * Setup event listeners for user menu
   * @param {HTMLElement} container - Container element
   */
  function setupUserMenuEventListeners(container) {
    const toggleButton = container.querySelector('[data-testid="user-menu-toggle"]');
    const dropdown = container.querySelector('[data-testid="user-menu-dropdown"]');
    const logoutButton = container.querySelector('[data-testid="logout-button"]');

    if (toggleButton && dropdown) {
      toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
          dropdown.classList.add('hidden');
        }
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', () => {
        authService.logout();
      });
    }
  }

  /**
   * Handle locale changes
   */
  function handleLocaleChange() {
    const isAuthenticated = authService.isAuthenticated();
    const user = authService.getUser();
    render({ isAuthenticated, user });
  }

  // Subscribe to auth state changes
  unsubscribe = authService.onAuthStateChanged(render);

  // Listen for locale changes
  document.addEventListener('localeChanged', handleLocaleChange);

  // Return cleanup function
  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
    document.removeEventListener('localeChanged', handleLocaleChange);
  };
}

export default { initUserMenu };
