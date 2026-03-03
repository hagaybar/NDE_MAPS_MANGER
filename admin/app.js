/**
 * Primo Maps Admin - Main Application Module
 * Handles bilingual support (Hebrew RTL / English LTR) and view management
 */

import i18n from './i18n.js?v=5';
import { initCSVEditor } from './components/csv-editor.js?v=5';
import { initSVGManager } from './components/svg-manager.js?v=5';
import { initVersionHistory } from './components/version-history.js?v=5';
import { showRestoreDialog, updateRestoreDialog, hideRestoreDialog } from './components/restore-confirm-dialog.js?v=5';
import { showVersionPreview, hideVersionPreview } from './components/version-preview.js?v=5';
import authService from './auth-service.js?v=5';
import authGuard from './auth-guard.js?v=5';
import { initUserMenu } from './components/user-menu.js?v=5';
import { initUserManagement } from './components/user-management.js?v=5';

/**
 * Get authorization headers for API calls
 * Uses ID token instead of access token because ID token contains custom attributes (like role)
 * @returns {object} Headers object with Authorization bearer token
 */
export function getAuthHeaders() {
    // Use ID token because it contains custom:role attribute
    // Access token doesn't include custom attributes in Cognito
    const token = authService.getIdToken();
    if (token) {
        return { 'Authorization': `Bearer ${token}` };
    }
    return {};
}

/**
 * Get the current username from auth token
 * @returns {string} Username or 'unknown'
 */
export function getCurrentUsername() {
    const user = authService.getUser();
    return user?.username || 'unknown';
}

/**
 * Initialize the application
 */
async function init() {
    try {
        // Initialize auth service first
        await authService.init();

        // Initialize i18n module
        await i18n.init();

        // Initialize auth guard (will show login overlay if not authenticated)
        await authGuard.init();

        // Initialize user menu in header
        initUserMenu('user-menu-container');

        // Update UI with current locale
        updateUI();

        // Set up event listeners
        setupEventListeners();

        // Apply role-based UI visibility
        authGuard.applyRoleBasedUI();

        // Show default view
        showView('csv');

        console.log('Primo Maps Admin initialized successfully');
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
}

/**
 * Update all translatable UI elements
 */
function updateUI() {
    // Update app title
    const appTitle = document.getElementById('app-title');
    if (appTitle) {
        appTitle.textContent = i18n.t('app.title');
    }

    // Update navigation tabs
    const navCsv = document.getElementById('nav-csv');
    if (navCsv) {
        navCsv.textContent = i18n.t('nav.csvEditor');
    }

    const navSvg = document.getElementById('nav-svg');
    if (navSvg) {
        navSvg.textContent = i18n.t('nav.svgManager');
    }

    const navVersions = document.getElementById('nav-versions');
    if (navVersions) {
        navVersions.textContent = i18n.t('nav.versionHistory');
    }

    const navUsers = document.getElementById('nav-users');
    if (navUsers) {
        navUsers.textContent = i18n.t('nav.users');
    }

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = i18n.t(key);
    });

    // Update language button active states
    const langEn = document.getElementById('lang-en');
    const langHe = document.getElementById('lang-he');
    const currentLocale = i18n.getLocale();

    if (langEn && langHe) {
        langEn.classList.toggle('active', currentLocale === 'en');
        langHe.classList.toggle('active', currentLocale === 'he');
    }

    // Update document direction and language
    const htmlElement = document.documentElement;
    htmlElement.lang = currentLocale;
    htmlElement.dir = currentLocale === 'he' ? 'rtl' : 'ltr';
}

/**
 * Set up event listeners for user interactions
 */
function setupEventListeners() {
    // Language toggle - English
    const langEn = document.getElementById('lang-en');
    if (langEn) {
        langEn.addEventListener('click', () => {
            i18n.setLocale('en');
        });
    }

    // Language toggle - Hebrew
    const langHe = document.getElementById('lang-he');
    if (langHe) {
        langHe.addEventListener('click', () => {
            i18n.setLocale('he');
        });
    }

    // Navigation - CSV Editor
    const navCsv = document.getElementById('nav-csv');
    if (navCsv) {
        navCsv.addEventListener('click', () => {
            showView('csv');
        });
    }

    // Navigation - SVG Manager
    const navSvg = document.getElementById('nav-svg');
    if (navSvg) {
        navSvg.addEventListener('click', () => {
            showView('svg');
        });
    }

    // Navigation - Version History
    const navVersions = document.getElementById('nav-versions');
    if (navVersions) {
        navVersions.addEventListener('click', () => {
            showView('versions');
        });
    }

    // Navigation - User Management (Admin Only)
    const navUsers = document.getElementById('nav-users');
    if (navUsers) {
        navUsers.addEventListener('click', () => {
            showView('users');
        });
    }

    // Listen for locale changes
    document.addEventListener('localeChanged', () => {
        updateUI();
    });
}

/**
 * Handle version preview - called when user clicks a version row
 * @param {string} versionId - The version ID to preview
 */
function handleVersionPreview(versionId) {
    showVersionPreview({
        versionId,
        onClose: () => {
            // Optional: Handle close action
        },
        onRestore: (versionId) => {
            hideVersionPreview();
            handleVersionRestore(versionId);
        }
    });
}

/**
 * Handle version restore - called when user clicks restore button
 * @param {string} versionId - The version ID to restore
 */
async function handleVersionRestore(versionId) {
    const API_ENDPOINT = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod';

    // Show confirmation dialog
    const result = await showRestoreDialog({
        version: { versionId },
        closeOnOverlayClick: true
    });

    if (!result.confirmed) {
        return;
    }

    // Show loading state
    showRestoreDialog({
        version: { versionId },
        showLoading: true
    });

    try {
        // Call restore API
        const response = await fetch(`${API_ENDPOINT}/api/versions/csv/${versionId}/restore`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Show success and close dialog
        updateRestoreDialog({
            version: { versionId },
            showSuccess: true
        });

        // Close dialog after a short delay and refresh the version list
        setTimeout(() => {
            hideRestoreDialog();
            // Refresh the version history view
            initVersionHistory({
                fileType: 'csv',
                onPreview: handleVersionPreview,
                onRestore: handleVersionRestore
            });
            showToast(i18n.t('dialog.restoreSuccess'), 'success');
        }, 1500);

    } catch (error) {
        console.error('Failed to restore version:', error);
        updateRestoreDialog({
            version: { versionId },
            showError: true,
            errorMessage: error.message
        });
    }
}

/**
 * Show a specific view and update navigation state
 * @param {string} view - The view to show ('csv', 'svg', or 'versions')
 */
function showView(view) {
    // Get view elements
    const csvEditor = document.getElementById('csv-editor');
    const svgManager = document.getElementById('svg-manager');
    const versionHistory = document.getElementById('version-history');
    const userManagement = document.getElementById('user-management');

    // Get navigation elements
    const navCsv = document.getElementById('nav-csv');
    const navSvg = document.getElementById('nav-svg');
    const navVersions = document.getElementById('nav-versions');
    const navUsers = document.getElementById('nav-users');

    // Hide all views
    if (csvEditor) csvEditor.classList.add('hidden');
    if (svgManager) svgManager.classList.add('hidden');
    if (versionHistory) versionHistory.classList.add('hidden');
    if (userManagement) userManagement.classList.add('hidden');

    // Remove active state from all nav tabs
    if (navCsv) {
        navCsv.classList.remove('active');
        navCsv.classList.add('border-transparent', 'text-gray-500');
    }
    if (navSvg) {
        navSvg.classList.remove('active');
        navSvg.classList.add('border-transparent', 'text-gray-500');
    }
    if (navVersions) {
        navVersions.classList.remove('active');
        navVersions.classList.add('border-transparent', 'text-gray-500');
    }
    if (navUsers) {
        navUsers.classList.remove('active');
        navUsers.classList.add('border-transparent', 'text-gray-500');
    }

    // Show selected view and update nav state
    switch (view) {
        case 'csv':
            if (csvEditor) {
                csvEditor.classList.remove('hidden');
                initCSVEditor();
            }
            if (navCsv) {
                navCsv.classList.add('active');
                navCsv.classList.remove('border-transparent', 'text-gray-500');
            }
            break;
        case 'svg':
            if (svgManager) {
                svgManager.classList.remove('hidden');
                initSVGManager();
            }
            if (navSvg) {
                navSvg.classList.add('active');
                navSvg.classList.remove('border-transparent', 'text-gray-500');
            }
            break;
        case 'versions':
            if (versionHistory) {
                versionHistory.classList.remove('hidden');
                initVersionHistory({
                    fileType: 'csv',
                    onPreview: handleVersionPreview,
                    onRestore: handleVersionRestore
                });
            }
            if (navVersions) {
                navVersions.classList.add('active');
                navVersions.classList.remove('border-transparent', 'text-gray-500');
            }
            break;
        case 'users':
            if (userManagement) {
                userManagement.classList.remove('hidden');
                initUserManagement();
            }
            if (navUsers) {
                navUsers.classList.add('active');
                navUsers.classList.remove('border-transparent', 'text-gray-500');
            }
            break;
        default:
            console.warn(`Unknown view: ${view}`);
    }

    // Apply role-based UI visibility after view is rendered
    // Use setTimeout to ensure DOM is fully updated
    setTimeout(() => {
        authGuard.applyRoleBasedUI();
    }, 0);
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The toast type ('success', 'error', 'info', 'warning')
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

// Initialize the application when DOM is ready
init();
