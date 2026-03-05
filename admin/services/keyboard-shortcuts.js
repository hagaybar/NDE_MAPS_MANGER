// Keyboard Shortcuts Service - Global keyboard shortcut handling
import i18n from '../i18n.js?v=5';

// Registered shortcuts
const shortcuts = new Map();
let isEnabled = true;

// Modifier key detection (Mac vs Windows)
const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

/**
 * Normalize key event to shortcut string
 * @param {KeyboardEvent} e - Keyboard event
 * @returns {string} Normalized shortcut string
 */
function normalizeEvent(e) {
  const parts = [];

  // Use Cmd on Mac, Ctrl on Windows
  if (e.metaKey || e.ctrlKey) {
    parts.push('mod');
  }
  if (e.shiftKey) {
    parts.push('shift');
  }
  if (e.altKey) {
    parts.push('alt');
  }

  // Normalize key
  let key = e.key.toLowerCase();
  if (key === 'escape') key = 'esc';
  if (key === ' ') key = 'space';

  parts.push(key);

  return parts.join('+');
}

/**
 * Parse shortcut string to normalized format
 * @param {string} shortcut - Shortcut string (e.g., "mod+s", "esc")
 * @returns {string} Normalized shortcut string
 */
function parseShortcut(shortcut) {
  return shortcut.toLowerCase().trim();
}

/**
 * Handle keydown event
 */
function handleKeydown(e) {
  if (!isEnabled) return;

  // Don't handle shortcuts when typing in inputs (unless it's Escape)
  const target = e.target;
  const isInput = target.tagName === 'INPUT' ||
                  target.tagName === 'TEXTAREA' ||
                  target.isContentEditable;

  const normalized = normalizeEvent(e);

  // Allow Escape in inputs
  if (normalized !== 'esc' && isInput) {
    return;
  }

  const handler = shortcuts.get(normalized);
  if (handler) {
    e.preventDefault();
    e.stopPropagation();
    handler.callback(e);
  }
}

/**
 * Initialize keyboard shortcuts
 */
export function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeydown);
}

/**
 * Cleanup keyboard shortcuts
 */
export function cleanupKeyboardShortcuts() {
  document.removeEventListener('keydown', handleKeydown);
  shortcuts.clear();
}

/**
 * Register a keyboard shortcut
 * @param {string} shortcut - Shortcut string (e.g., "mod+s", "mod+f", "esc")
 * @param {Function} callback - Callback function
 * @param {Object} options - Options
 * @param {string} options.description - Human-readable description
 * @param {string} options.scope - Scope (e.g., "global", "dialog")
 */
export function registerShortcut(shortcut, callback, options = {}) {
  const normalized = parseShortcut(shortcut);
  shortcuts.set(normalized, {
    callback,
    description: options.description || '',
    scope: options.scope || 'global'
  });
}

/**
 * Unregister a keyboard shortcut
 * @param {string} shortcut - Shortcut string
 */
export function unregisterShortcut(shortcut) {
  const normalized = parseShortcut(shortcut);
  shortcuts.delete(normalized);
}

/**
 * Enable all shortcuts
 */
export function enableShortcuts() {
  isEnabled = true;
}

/**
 * Disable all shortcuts
 */
export function disableShortcuts() {
  isEnabled = false;
}

/**
 * Get all registered shortcuts
 * @returns {Array<{shortcut: string, description: string, scope: string}>}
 */
export function getRegisteredShortcuts() {
  return Array.from(shortcuts.entries()).map(([shortcut, info]) => ({
    shortcut,
    displayShortcut: formatShortcut(shortcut),
    ...info
  }));
}

/**
 * Format shortcut for display
 * @param {string} shortcut - Shortcut string
 * @returns {string} Display string
 */
export function formatShortcut(shortcut) {
  const parts = shortcut.split('+');
  return parts.map(part => {
    switch (part) {
      case 'mod': return isMac ? '⌘' : 'Ctrl';
      case 'shift': return isMac ? '⇧' : 'Shift';
      case 'alt': return isMac ? '⌥' : 'Alt';
      case 'esc': return 'Esc';
      case 'enter': return '↵';
      case 'space': return 'Space';
      case 'arrowup': return '↑';
      case 'arrowdown': return '↓';
      case 'arrowleft': return '←';
      case 'arrowright': return '→';
      default: return part.toUpperCase();
    }
  }).join(isMac ? '' : '+');
}

/**
 * Register default application shortcuts
 * @param {Object} handlers - Handler functions
 */
export function registerDefaultShortcuts(handlers = {}) {
  const locale = i18n.getLocale() || 'en';

  if (handlers.focusSearch) {
    registerShortcut('mod+f', handlers.focusSearch, {
      description: locale === 'he' ? 'מיקוד בחיפוש' : 'Focus search',
      scope: 'global'
    });
  }

  if (handlers.save) {
    registerShortcut('mod+s', handlers.save, {
      description: locale === 'he' ? 'שמירה' : 'Save',
      scope: 'global'
    });
  }

  if (handlers.escape) {
    registerShortcut('esc', handlers.escape, {
      description: locale === 'he' ? 'סגור / ביטול' : 'Close / Cancel',
      scope: 'global'
    });
  }

  if (handlers.selectAll) {
    registerShortcut('mod+a', handlers.selectAll, {
      description: locale === 'he' ? 'בחר הכל' : 'Select all',
      scope: 'global'
    });
  }
}
