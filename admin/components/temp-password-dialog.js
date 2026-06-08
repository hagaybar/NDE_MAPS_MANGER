// Temp Password Dialog Component — shows the admin-set temporary password.
//
// #152 redesign: "Reset password" now SETS a temporary password server-side
// (Cognito AdminSetUserPassword, Permanent:false) and sends NO email. The
// temporary password is returned once in the response for the admin to relay to
// the user out-of-band (phone / in person). This dialog is the ONLY place it is
// shown: a readonly field + Copy button + instructions naming the user.
//
// SECURITY: the password is never logged. It is placed in the DOM only as a
// readonly input value and copied to the clipboard on demand.
import i18n from '../i18n.js?v=5';

// FALLBACKS: used when an i18n key is missing (keeps the dialog honest offline /
// before translations land). {username} is interpolated caller-side via replace.
const FALLBACKS = {
  'users.tempPasswordTitle': 'Temporary password set',
  'users.tempPasswordInstructions':
    "Give this temporary password to {username}. They'll be asked to choose their own password the next time they sign in.",
  'users.tempPasswordCopy': 'Copy',
  'users.tempPasswordCopied': 'Copied',
  'dialog.close': 'Close'
};

let currentOverlay = null;
let currentKeydownHandler = null;

/**
 * Translate with a local fallback.
 * @param {string} key
 * @returns {string}
 */
function t(key) {
  const value = i18n.t(key);
  // i18n.t returns the key itself when missing; fall back to our English copy.
  if (!value || value === key) {
    return FALLBACKS[key] || key;
  }
  return value;
}

/**
 * Generate unique ID for ARIA attributes.
 * @returns {string}
 */
function generateId() {
  return `temp-password-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Close the dialog and clean up listeners.
 */
export function hideTempPasswordDialog() {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
  if (currentKeydownHandler) {
    document.removeEventListener('keydown', currentKeydownHandler);
    currentKeydownHandler = null;
  }
}

/**
 * Show the temporary-password dialog.
 * @param {Object} options
 * @param {string} options.username - Display name of the user (email preferred).
 * @param {string} options.temporaryPassword - The server-set temporary password.
 */
export function showTempPasswordDialog(options = {}) {
  const { username = '', temporaryPassword = '' } = options;

  // Close any existing instance first.
  hideTempPasswordDialog();

  const titleId = generateId();
  const instructions = t('users.tempPasswordInstructions').replace('{username}', username);
  const copyLabel = t('users.tempPasswordCopy');

  const overlay = document.createElement('div');
  overlay.setAttribute('data-testid', 'temp-password-dialog-overlay');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40';
  overlay.innerHTML = `
    <div
      data-testid="temp-password-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="${titleId}"
      class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 relative z-50"
    >
      <div class="flex items-start mb-4">
        <div
          class="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 text-green-600 me-4"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <div class="flex-1">
          <h2
            id="${titleId}"
            data-testid="temp-password-title"
            class="text-xl font-semibold text-gray-900"
          >
            ${escapeHtml(t('users.tempPasswordTitle'))}
          </h2>
        </div>
      </div>

      <div class="space-y-4">
        <p data-testid="temp-password-instructions" class="text-gray-600">
          ${escapeHtml(instructions)}
        </p>

        <div class="flex gap-2">
          <input
            type="text"
            data-testid="temp-password-value"
            readonly
            value="${escapeHtml(temporaryPassword)}"
            class="flex-1 px-3 py-2 font-mono text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 select-all"
            aria-label="${escapeHtml(t('users.tempPasswordTitle'))}"
          />
          <button
            data-testid="temp-password-copy"
            type="button"
            class="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors whitespace-nowrap"
          >
            ${escapeHtml(copyLabel)}
          </button>
        </div>
      </div>

      <div class="flex justify-end mt-6">
        <button
          data-testid="temp-password-close"
          type="button"
          class="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors"
        >
          ${escapeHtml(t('dialog.close'))}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  currentOverlay = overlay;

  const dialog = overlay.querySelector('[data-testid="temp-password-dialog"]');
  const valueField = overlay.querySelector('[data-testid="temp-password-value"]');
  const copyBtn = overlay.querySelector('[data-testid="temp-password-copy"]');
  const closeBtn = overlay.querySelector('[data-testid="temp-password-close"]');

  // Keep clicks inside the dialog from dismissing via the overlay handler.
  dialog.addEventListener('click', (e) => e.stopPropagation());

  // Copy: prefer the async Clipboard API, fall back to execCommand.
  copyBtn.addEventListener('click', async () => {
    const password = valueField.value;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(password);
        copied = true;
      } else {
        valueField.select();
        copied = document.execCommand && document.execCommand('copy');
      }
    } catch (_) {
      copied = false;
    }
    if (copied) {
      copyBtn.textContent = t('users.tempPasswordCopied');
      setTimeout(() => {
        if (copyBtn.isConnected) copyBtn.textContent = copyLabel;
      }, 2000);
    }
  });

  closeBtn.addEventListener('click', () => hideTempPasswordDialog());

  // Click outside the dialog closes it.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideTempPasswordDialog();
  });

  // Escape closes it.
  currentKeydownHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideTempPasswordDialog();
    }
  };
  document.addEventListener('keydown', currentKeydownHandler);

  // Focus the value field so the admin can immediately read / copy it.
  if (valueField && typeof valueField.focus === 'function') {
    valueField.focus();
  }
}

export default { showTempPasswordDialog, hideTempPasswordDialog };
