/**
 * Primo Maps Admin - Main Application Module
 * Handles bilingual support (Hebrew RTL / English LTR) and view management
 */

import i18n from './i18n.js?v=3';
import { initCSVEditor } from './components/csv-editor.js?v=3';
import { initSVGManager } from './components/svg-manager.js?v=3';

/**
 * Initialize the application
 */
async function init() {
    try {
        // Initialize i18n module
        await i18n.init();

        // Update UI with current locale
        updateUI();

        // Set up event listeners
        setupEventListeners();

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

    // Listen for locale changes
    document.addEventListener('localeChanged', () => {
        updateUI();
    });
}

/**
 * Show a specific view and update navigation state
 * @param {string} view - The view to show ('csv' or 'svg')
 */
function showView(view) {
    // Get view elements
    const csvEditor = document.getElementById('csv-editor');
    const svgManager = document.getElementById('svg-manager');

    // Get navigation elements
    const navCsv = document.getElementById('nav-csv');
    const navSvg = document.getElementById('nav-svg');

    // Hide all views
    if (csvEditor) csvEditor.classList.add('hidden');
    if (svgManager) svgManager.classList.add('hidden');

    // Remove active state from all nav tabs
    if (navCsv) {
        navCsv.classList.remove('active');
        navCsv.classList.add('border-transparent', 'text-gray-500');
    }
    if (navSvg) {
        navSvg.classList.remove('active');
        navSvg.classList.add('border-transparent', 'text-gray-500');
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
        default:
            console.warn(`Unknown view: ${view}`);
    }
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
