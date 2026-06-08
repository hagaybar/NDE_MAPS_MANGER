/**
 * Auth Guard - Route protection and role-based UI visibility
 * Protects admin views and manages feature visibility based on user roles
 */

import authService from './auth-service.js?v=5';
import i18n from './i18n.js?v=5';
import { getMatchingRowIndices } from './utils/range-filter.js?v=5';

// Permission matrix - matches backend role-auth.mjs
const PERMISSIONS = {
  admin: ['read', 'write', 'delete', 'manage-users', 'restore-versions'],
  editor: ['read', 'write', 'restore-versions']
};

// Elements that require specific roles
const ADMIN_ONLY_SELECTORS = [
  '[data-role-required="admin"]',
  '.role-admin-only',
  '.delete-btn',
  '#settings-section',
  '#user-management'
];

let initialized = false;
let currentRole = null;

/**
 * Reset auth guard state (for testing)
 * @private
 */
export function _resetForTesting() {
  initialized = false;
  currentRole = null;
}

/**
 * Initialize the auth guard
 * Checks authentication and sets up UI visibility
 * @returns {Promise<boolean>} Whether user is authenticated
 */
export async function init() {
  if (initialized) return authService.isAuthenticated();

  // Wait for auth service to initialize
  await authService.init();

  const isAuth = authService.isAuthenticated();

  if (!isAuth) {
    // Show login required message
    showLoginRequired();
    return false;
  }

  // Get user role and apply UI visibility
  const user = authService.getUser();
  currentRole = user?.role || 'viewer';

  // #63: log a non-PII signal only — never the user object (it carries
  // email / username / allowedRanges, which would land in the browser console).
  console.log('[AuthGuard] User authenticated', { role: currentRole });

  applyRoleBasedUI();

  // Subscribe to auth state changes
  authService.onAuthStateChanged((authenticated, user) => {
    // #63: do not log `authenticated`/`user` — they nest the librarian's PII.
    console.log('[AuthGuard] auth state changed', { role: currentRole });
    if (authenticated) {
      // Only update role if we get a valid role from the user object
      // Don't downgrade from admin to viewer
      const newRole = user?.role;
      if (newRole) {
        currentRole = newRole;
      } else if (!currentRole) {
        currentRole = 'viewer';
      }
      hideLoginRequired();
      applyRoleBasedUI();
    } else {
      currentRole = null;
      showLoginRequired();
    }
  });

  initialized = true;
  return true;
}

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export function isAuthenticated() {
  return authService.isAuthenticated();
}

/**
 * Check if current user has permission for an action
 * @param {string} action - The action to check (read, write, delete, manage-users, restore-versions)
 * @returns {boolean}
 */
export function hasPermission(action) {
  if (!currentRole) return false;

  const rolePermissions = PERMISSIONS[currentRole] || [];
  return rolePermissions.includes(action);
}

/**
 * Get current user's role
 * @returns {string|null} Role name or null if not authenticated
 */
export function getRole() {
  return currentRole;
}

/**
 * Check if current user is admin
 * @returns {boolean}
 */
export function isAdmin() {
  return currentRole === 'admin';
}

/**
 * Get the current authenticated user (raw object from auth-service).
 * @returns {object|null} User object with `role`, `allowedRanges`, etc., or null.
 */
export function getCurrentUser() {
  return authService.getUser();
}

/**
 * Compute the set of row ids the current user is permitted to edit.
 *
 * Mirrors the filtering pattern used by csv-editor.js (uses
 * `getMatchingRowIndices` against `user.allowedRanges`). Unlike csv-editor,
 * this returns a `Set<rangeId>` keyed off the row's `id` field (which
 * map-editor assigns as `row.id || \`row-${idx}\``) — that's the shape
 * `shelf-state.js` expects for `permittedRowIds`.
 *
 * Returns:
 * - `null` for admin users (unlimited — shelf-state treats null as "all allowed")
 * - `Set<string>` of permitted row ids for editors
 * - empty `Set` when the editor has no access (no allowedRanges / disabled / empty filterGroups)
 *
 * @param {object[]} rows - Array of CSV rows; each must have an `id` field
 *                           (assigned upstream as `row.id || \`row-${idx}\``).
 * @returns {Set<string>|null}
 */
export function getPermittedRowIds(rows) {
  // Admin (or any non-editor role) gets unlimited access.
  if (isAdmin()) return null;

  if (!Array.isArray(rows)) return new Set();

  const user = authService.getUser();
  const allowedRanges = user?.allowedRanges || null;

  // No restrictions configured / disabled / no filter groups → no access.
  if (!allowedRanges || allowedRanges.enabled === false) return new Set();
  if (!Array.isArray(allowedRanges.filterGroups) || allowedRanges.filterGroups.length === 0) {
    return new Set();
  }

  const indices = getMatchingRowIndices(rows, allowedRanges);
  const permitted = new Set();
  for (const idx of indices) {
    const row = rows[idx];
    if (row && row.id) permitted.add(row.id);
  }
  return permitted;
}

/**
 * Show element only if user is admin
 * @param {HTMLElement} element - Element to show/hide
 */
export function showIfAdmin(element) {
  if (!element) return;

  if (isAdmin()) {
    element.style.display = '';
    element.removeAttribute('hidden');
  } else {
    element.style.display = 'none';
    element.setAttribute('hidden', 'true');
  }
}

/**
 * Hide element if user is editor (not admin)
 * @param {HTMLElement} element - Element to hide
 */
export function hideIfEditor(element) {
  if (!element) return;

  if (currentRole === 'editor') {
    element.style.display = 'none';
    element.setAttribute('hidden', 'true');
  } else {
    element.style.display = '';
    element.removeAttribute('hidden');
  }
}

/**
 * Apply role-based visibility to all elements with role requirements
 */
export function applyRoleBasedUI() {
  console.log('[AuthGuard] applyRoleBasedUI called, isAdmin:', isAdmin(), 'currentRole:', currentRole);

  // Hide all admin-only elements for non-admin users
  ADMIN_ONLY_SELECTORS.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`[AuthGuard] Selector "${selector}" found ${elements.length} elements`);
    elements.forEach(el => {
      showIfAdmin(el);
    });
  });

  // Also check for data-permission-required attributes
  document.querySelectorAll('[data-permission-required]').forEach(el => {
    const requiredPermission = el.getAttribute('data-permission-required');
    if (hasPermission(requiredPermission)) {
      el.style.display = '';
      el.removeAttribute('hidden');
    } else {
      el.style.display = 'none';
      el.setAttribute('hidden', 'true');
    }
  });
}

/**
 * Show a permission denied message
 * @param {string} action - The action that was denied
 */
export function showPermissionDenied(action) {
  const message = i18n.t('auth.permissionDenied') ||
    (i18n.getLocale() === 'he' ? 'אין לך הרשאה לפעולה זו' : 'You do not have permission for this action');

  // Use toast if available, otherwise alert
  if (typeof showToast === 'function') {
    showToast(message, 'error');
  } else {
    alert(message);
  }
}

/**
 * Show login required overlay/message
 */
function showLoginRequired() {
  // Check if overlay already exists
  let overlay = document.getElementById('auth-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50';

    // Get translations with proper fallbacks (i18n.t returns key if not found)
    const msgKey = 'auth.unauthorized';
    const msgTranslated = i18n.t(msgKey);
    const message = (msgTranslated !== msgKey) ? msgTranslated :
      (i18n.getLocale() === 'he' ? 'נא להתחבר כדי להמשיך' : 'Please log in to continue');

    const loginKey = 'auth.login';
    const loginTranslated = i18n.t(loginKey);
    const loginText = (loginTranslated !== loginKey) ? loginTranslated :
      (i18n.getLocale() === 'he' ? 'התחברות' : 'Login');

    overlay.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl p-8 max-w-md text-center">
        <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        <p class="text-gray-600 mb-6">${message}</p>
        <button id="auth-login-btn" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          ${loginText}
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Add login button handler
    document.getElementById('auth-login-btn')?.addEventListener('click', () => {
      authService.login();
    });
  }

  overlay.style.display = 'flex';
}

/**
 * Hide login required overlay
 */
function hideLoginRequired() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Guard a function to require authentication
 * @param {Function} fn - Function to guard
 * @returns {Function} Guarded function
 */
export function requireAuth(fn) {
  return async (...args) => {
    if (!isAuthenticated()) {
      showLoginRequired();
      return null;
    }
    return fn(...args);
  };
}

/**
 * Guard a function to require admin role
 * @param {Function} fn - Function to guard
 * @returns {Function} Guarded function
 */
export function requireAdmin(fn) {
  return async (...args) => {
    if (!isAuthenticated()) {
      showLoginRequired();
      return null;
    }
    if (!isAdmin()) {
      showPermissionDenied('admin');
      return null;
    }
    return fn(...args);
  };
}

/**
 * Guard a function to require specific permission
 * @param {string} permission - Required permission
 * @param {Function} fn - Function to guard
 * @returns {Function} Guarded function
 */
export function requirePermission(permission, fn) {
  return async (...args) => {
    if (!isAuthenticated()) {
      showLoginRequired();
      return null;
    }
    if (!hasPermission(permission)) {
      showPermissionDenied(permission);
      return null;
    }
    return fn(...args);
  };
}

export default {
  init,
  isAuthenticated,
  hasPermission,
  getRole,
  isAdmin,
  getCurrentUser,
  getPermittedRowIds,
  showIfAdmin,
  hideIfEditor,
  applyRoleBasedUI,
  showPermissionDenied,
  requireAuth,
  requireAdmin,
  requirePermission
};
