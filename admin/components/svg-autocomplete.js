// SVG Code Autocomplete Component - Floor-aware SVG code selection
import i18n from '../i18n.js?v=5';
import { getAvailableCodes } from '../services/svg-parser.js?v=5';

// Fallback translations
const FALLBACKS = {
  'field.svgCode': { en: 'SVG Code', he: 'קוד SVG' },
  'autocomplete.noResults': { en: 'No matching codes', he: 'לא נמצאו קודים תואמים' },
  'autocomplete.selectFloor': { en: 'Select a floor first', he: 'בחר קומה תחילה' },
  'autocomplete.loading': { en: 'Loading codes...', he: 'טוען קודים...' },
  'validation.invalidCode': { en: 'SVG code not found in map', he: 'קוד SVG לא נמצא במפה' }
};

/**
 * Translation helper with fallbacks
 * @param {string} key - Translation key
 * @returns {string} Translated string
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
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// Module state
let activeDropdown = null;
let keyboardIndex = -1;

/**
 * Render SVG code autocomplete field
 * @param {Object} options - Field options
 * @param {string} options.name - Field name (default: 'svgCode')
 * @param {string} options.value - Current value
 * @param {string} options.floor - Current floor (0, 1, or 2)
 * @param {boolean} [options.required=true] - Whether field is required
 * @param {string} [options.error] - Error message
 * @param {boolean} [options.disabled=false] - Whether field is disabled
 * @returns {string} HTML string
 */
export function renderSvgAutocomplete(options) {
  const {
    name = 'svgCode',
    value = '',
    floor = '',
    required = true,
    error = '',
    disabled = false
  } = options;

  const labelText = t('field.svgCode');
  const requiredMark = required ? '<span class="text-red-500 ms-1" aria-hidden="true">*</span>' : '';
  const disabledAttr = disabled ? 'disabled' : '';
  const hasError = error && error.length > 0;

  const inputClasses = `svg-autocomplete-input form-input w-full px-3 py-2 border rounded-md
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    disabled:bg-gray-100 disabled:cursor-not-allowed
    ${hasError ? 'border-red-500 bg-red-50' : 'border-gray-300'}`;

  return `
    <div class="svg-autocomplete-wrapper form-field mb-4 relative" data-field="${escapeHtml(name)}" data-floor="${escapeHtml(floor)}">
      <label class="block text-sm font-medium text-gray-700 mb-1" for="field-${escapeHtml(name)}">
        ${escapeHtml(labelText)}${requiredMark}
      </label>
      <div class="relative">
        <input
          type="text"
          id="field-${escapeHtml(name)}"
          name="${escapeHtml(name)}"
          value="${escapeHtml(value)}"
          class="${inputClasses}"
          autocomplete="off"
          ${disabledAttr}
          ${required ? 'required' : ''}
          aria-invalid="${hasError}"
          aria-autocomplete="list"
          aria-expanded="false"
          aria-haspopup="listbox"
          ${hasError ? `aria-describedby="${name}-error"` : ''}
          data-svg-input="true"
        />
        <div class="svg-autocomplete-dropdown hidden absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
             role="listbox"
             id="${name}-dropdown">
        </div>
      </div>
      ${hasError ? `<p id="${name}-error" class="text-xs text-red-600 mt-1">${escapeHtml(error)}</p>` : ''}
    </div>
  `;
}

/**
 * Initialize SVG autocomplete behavior on a container
 * @param {HTMLElement} container - Container element with autocomplete fields
 * @param {Function} [onSelect] - Callback when a code is selected
 */
export function initSvgAutocomplete(container, onSelect) {
  const inputs = container.querySelectorAll('[data-svg-input="true"]');

  inputs.forEach(input => {
    const wrapper = input.closest('.svg-autocomplete-wrapper');
    const dropdown = wrapper.querySelector('.svg-autocomplete-dropdown');

    // Input event - filter and show dropdown
    input.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const floor = wrapper.dataset.floor;
      showDropdown(wrapper, dropdown, query, floor, input, onSelect);
    });

    // Focus event - show all options
    input.addEventListener('focus', () => {
      const query = input.value.toLowerCase();
      const floor = wrapper.dataset.floor;
      showDropdown(wrapper, dropdown, query, floor, input, onSelect);
    });

    // Blur event - hide dropdown (with delay for click)
    input.addEventListener('blur', () => {
      setTimeout(() => hideDropdown(dropdown, input), 150);
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      handleKeydown(e, dropdown, input, onSelect);
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (activeDropdown && !e.target.closest('.svg-autocomplete-wrapper')) {
      hideDropdown(activeDropdown.dropdown, activeDropdown.input);
    }
  });
}

/**
 * Show the autocomplete dropdown
 * @param {HTMLElement} wrapper - Wrapper element
 * @param {HTMLElement} dropdown - Dropdown element
 * @param {string} query - Search query
 * @param {string} floor - Floor number
 * @param {HTMLInputElement} input - Input element
 * @param {Function} onSelect - Selection callback
 */
async function showDropdown(wrapper, dropdown, query, floor, input, onSelect) {
  if (!floor) {
    dropdown.innerHTML = `<div class="px-3 py-2 text-gray-500 text-sm">${escapeHtml(t('autocomplete.selectFloor'))}</div>`;
    dropdown.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
    activeDropdown = { dropdown, input };
    return;
  }

  // Get available codes for this floor
  const codes = getAvailableCodes(floor);

  if (codes.length === 0) {
    dropdown.innerHTML = `<div class="px-3 py-2 text-gray-500 text-sm">${escapeHtml(t('autocomplete.loading'))}</div>`;
    dropdown.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
    activeDropdown = { dropdown, input };
    return;
  }

  // Filter codes by query
  const filtered = query
    ? codes.filter(code => code.toLowerCase().includes(query))
    : codes;

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="px-3 py-2 text-gray-500 text-sm">${escapeHtml(t('autocomplete.noResults'))}</div>`;
  } else {
    // Limit to first 50 results for performance
    const displayCodes = filtered.slice(0, 50);
    dropdown.innerHTML = displayCodes.map((code, idx) => `
      <div class="svg-autocomplete-option px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm"
           role="option"
           data-value="${escapeHtml(code)}"
           data-index="${idx}"
           tabindex="-1">
        ${highlightMatch(code, query)}
      </div>
    `).join('');

    // Add click handlers
    dropdown.querySelectorAll('.svg-autocomplete-option').forEach(option => {
      option.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectOption(option.dataset.value, input, dropdown, onSelect);
      });
    });
  }

  dropdown.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');
  activeDropdown = { dropdown, input };
  keyboardIndex = -1;
}

/**
 * Hide the autocomplete dropdown
 * @param {HTMLElement} dropdown - Dropdown element
 * @param {HTMLInputElement} input - Input element
 */
function hideDropdown(dropdown, input) {
  dropdown.classList.add('hidden');
  input.setAttribute('aria-expanded', 'false');
  activeDropdown = null;
  keyboardIndex = -1;
  clearHighlight(dropdown);
}

/**
 * Handle keyboard navigation
 * @param {KeyboardEvent} e - Keyboard event
 * @param {HTMLElement} dropdown - Dropdown element
 * @param {HTMLInputElement} input - Input element
 * @param {Function} onSelect - Selection callback
 */
function handleKeydown(e, dropdown, input, onSelect) {
  const options = dropdown.querySelectorAll('.svg-autocomplete-option');

  if (dropdown.classList.contains('hidden') || options.length === 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const floor = input.closest('.svg-autocomplete-wrapper').dataset.floor;
      showDropdown(input.closest('.svg-autocomplete-wrapper'), dropdown, input.value.toLowerCase(), floor, input, onSelect);
    }
    return;
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      keyboardIndex = Math.min(keyboardIndex + 1, options.length - 1);
      updateHighlight(options);
      break;

    case 'ArrowUp':
      e.preventDefault();
      keyboardIndex = Math.max(keyboardIndex - 1, 0);
      updateHighlight(options);
      break;

    case 'Enter':
      e.preventDefault();
      if (keyboardIndex >= 0 && keyboardIndex < options.length) {
        selectOption(options[keyboardIndex].dataset.value, input, dropdown, onSelect);
      }
      break;

    case 'Escape':
      e.preventDefault();
      hideDropdown(dropdown, input);
      break;

    case 'Tab':
      hideDropdown(dropdown, input);
      break;
  }
}

/**
 * Update keyboard highlight
 * @param {NodeList} options - Option elements
 */
function updateHighlight(options) {
  options.forEach((opt, idx) => {
    if (idx === keyboardIndex) {
      opt.classList.add('bg-blue-100');
      opt.setAttribute('aria-selected', 'true');
      opt.scrollIntoView({ block: 'nearest' });
    } else {
      opt.classList.remove('bg-blue-100');
      opt.setAttribute('aria-selected', 'false');
    }
  });
}

/**
 * Clear keyboard highlight
 * @param {HTMLElement} dropdown - Dropdown element
 */
function clearHighlight(dropdown) {
  dropdown.querySelectorAll('.svg-autocomplete-option').forEach(opt => {
    opt.classList.remove('bg-blue-100');
    opt.setAttribute('aria-selected', 'false');
  });
}

/**
 * Select an option
 * @param {string} value - Selected value
 * @param {HTMLInputElement} input - Input element
 * @param {HTMLElement} dropdown - Dropdown element
 * @param {Function} onSelect - Selection callback
 */
function selectOption(value, input, dropdown, onSelect) {
  input.value = value;
  hideDropdown(dropdown, input);

  // Trigger input event for validation
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  if (typeof onSelect === 'function') {
    onSelect(value);
  }
}

/**
 * Highlight matching text in a string
 * @param {string} text - Full text
 * @param {string} query - Query to highlight
 * @returns {string} HTML string with highlighted matches
 */
function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);

  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark class="bg-yellow-200">$1</mark>');
}

/**
 * Escape regex special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update the floor for an autocomplete field
 * @param {HTMLElement} wrapper - Autocomplete wrapper element
 * @param {string} floor - New floor value
 */
export function updateAutocompleteFloor(wrapper, floor) {
  wrapper.dataset.floor = floor;

  // Clear current value if it doesn't match new floor's codes
  const input = wrapper.querySelector('[data-svg-input="true"]');
  if (input && input.value) {
    const codes = getAvailableCodes(floor);
    if (codes.length > 0 && !codes.includes(input.value)) {
      // Don't clear automatically - just trigger validation
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

/**
 * Validate SVG code against floor
 * @param {string} code - SVG code
 * @param {string} floor - Floor number
 * @returns {Object} Validation result { valid: boolean, error?: string }
 */
export function validateSvgCode(code, floor) {
  if (!code) {
    return { valid: false, error: t('validation.required') };
  }

  if (!floor) {
    return { valid: true }; // Can't validate without floor
  }

  const codes = getAvailableCodes(floor);
  if (codes.length === 0) {
    return { valid: true }; // Codes not loaded yet
  }

  if (!codes.includes(code)) {
    return { valid: false, error: t('validation.invalidCode') };
  }

  return { valid: true };
}
