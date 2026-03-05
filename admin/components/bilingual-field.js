// Bilingual Field Component - Side-by-side English/Hebrew input fields
import i18n from '../i18n.js?v=5';

// Fallback translations
const FALLBACKS = {
  'field.english': { en: 'English', he: 'אנגלית' },
  'field.hebrew': { en: 'Hebrew', he: 'עברית' },
  'validation.required': { en: 'This field is required', he: 'שדה חובה' }
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

/**
 * Render a bilingual field (side-by-side English/Hebrew)
 * @param {Object} options - Field options
 * @param {string} options.name - Field name (base name, will add /He suffix)
 * @param {string} options.label - Field label translation key
 * @param {string} options.valueEn - English value
 * @param {string} options.valueHe - Hebrew value
 * @param {boolean} [options.required=false] - Whether field is required
 * @param {string} [options.type='text'] - Input type (text or textarea)
 * @param {string} [options.errorEn] - English field error message
 * @param {string} [options.errorHe] - Hebrew field error message
 * @param {boolean} [options.disabled=false] - Whether field is disabled
 * @returns {string} HTML string
 */
export function renderBilingualField(options) {
  const {
    name,
    label,
    valueEn = '',
    valueHe = '',
    required = false,
    type = 'text',
    errorEn = '',
    errorHe = '',
    disabled = false
  } = options;

  const locale = i18n.getLocale() || 'en';
  const labelText = i18n.t(label) !== label ? i18n.t(label) : label;
  const englishLabel = t('field.english');
  const hebrewLabel = t('field.hebrew');
  const requiredMark = required ? '<span class="text-red-500 ms-1" aria-hidden="true">*</span>' : '';
  const disabledAttr = disabled ? 'disabled' : '';

  const inputClasses = `bilingual-input form-input w-full px-3 py-2 border rounded-md
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    disabled:bg-gray-100 disabled:cursor-not-allowed`;

  const errorClasses = 'border-red-500 bg-red-50';

  // Determine field order based on locale (Hebrew first in RTL)
  const isRTL = locale === 'he';

  const enField = renderSingleField({
    name: name,
    value: valueEn,
    label: englishLabel,
    type,
    error: errorEn,
    disabled,
    inputClasses,
    errorClasses,
    dir: 'ltr'
  });

  const heField = renderSingleField({
    name: `${name}He`,
    value: valueHe,
    label: hebrewLabel,
    type,
    error: errorHe,
    disabled,
    inputClasses,
    errorClasses,
    dir: 'rtl'
  });

  return `
    <div class="bilingual-field mb-4" data-field="${escapeHtml(name)}">
      <label class="block text-sm font-medium text-gray-700 mb-2">
        ${escapeHtml(labelText)}${requiredMark}
      </label>
      <div class="bilingual-field-container grid grid-cols-2 gap-3">
        ${isRTL ? heField : enField}
        ${isRTL ? enField : heField}
      </div>
    </div>
  `;
}

/**
 * Render a single language field
 * @param {Object} options - Field options
 * @returns {string} HTML string
 */
function renderSingleField(options) {
  const { name, value, label, type, error, disabled, inputClasses, errorClasses, dir } = options;
  const disabledAttr = disabled ? 'disabled' : '';
  const hasError = error && error.length > 0;
  const classes = hasError ? `${inputClasses} ${errorClasses}` : inputClasses;

  const input = type === 'textarea'
    ? `<textarea
         name="${escapeHtml(name)}"
         class="${classes}"
         dir="${dir}"
         rows="2"
         ${disabledAttr}
         aria-invalid="${hasError}"
         ${hasError ? `aria-describedby="${name}-error"` : ''}
       >${escapeHtml(value)}</textarea>`
    : `<input
         type="text"
         name="${escapeHtml(name)}"
         value="${escapeHtml(value)}"
         class="${classes}"
         dir="${dir}"
         ${disabledAttr}
         aria-invalid="${hasError}"
         ${hasError ? `aria-describedby="${name}-error"` : ''}
       />`;

  return `
    <div class="bilingual-lang-field">
      <span class="text-xs text-gray-500 mb-1 block">${escapeHtml(label)}</span>
      ${input}
      ${hasError ? `<p id="${name}-error" class="text-xs text-red-600 mt-1">${escapeHtml(error)}</p>` : ''}
    </div>
  `;
}

/**
 * Render a simple single-language field
 * @param {Object} options - Field options
 * @param {string} options.name - Field name
 * @param {string} options.label - Field label translation key
 * @param {string} options.value - Field value
 * @param {boolean} [options.required=false] - Whether field is required
 * @param {string} [options.type='text'] - Input type
 * @param {string} [options.error] - Error message
 * @param {boolean} [options.disabled=false] - Whether field is disabled
 * @param {string} [options.dir='auto'] - Text direction
 * @param {string} [options.placeholder] - Placeholder text
 * @returns {string} HTML string
 */
export function renderField(options) {
  const {
    name,
    label,
    value = '',
    required = false,
    type = 'text',
    error = '',
    disabled = false,
    dir = 'auto',
    placeholder = ''
  } = options;

  const labelText = i18n.t(label) !== label ? i18n.t(label) : label;
  const requiredMark = required ? '<span class="text-red-500 ms-1" aria-hidden="true">*</span>' : '';
  const disabledAttr = disabled ? 'disabled' : '';
  const hasError = error && error.length > 0;

  const inputClasses = `form-input w-full px-3 py-2 border rounded-md
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    disabled:bg-gray-100 disabled:cursor-not-allowed
    ${hasError ? 'border-red-500 bg-red-50' : 'border-gray-300'}`;

  return `
    <div class="form-field mb-4" data-field="${escapeHtml(name)}">
      <label class="block text-sm font-medium text-gray-700 mb-1" for="field-${escapeHtml(name)}">
        ${escapeHtml(labelText)}${requiredMark}
      </label>
      <input
        type="${type}"
        id="field-${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        value="${escapeHtml(value)}"
        class="${inputClasses}"
        dir="${dir}"
        placeholder="${escapeHtml(placeholder)}"
        ${disabledAttr}
        ${required ? 'required' : ''}
        aria-invalid="${hasError}"
        ${hasError ? `aria-describedby="${name}-error"` : ''}
      />
      ${hasError ? `<p id="${name}-error" class="text-xs text-red-600 mt-1">${escapeHtml(error)}</p>` : ''}
    </div>
  `;
}

/**
 * Render a select/dropdown field
 * @param {Object} options - Field options
 * @param {string} options.name - Field name
 * @param {string} options.label - Field label translation key
 * @param {string} options.value - Selected value
 * @param {Array} options.options - Array of {value, label} options
 * @param {boolean} [options.required=false] - Whether field is required
 * @param {string} [options.error] - Error message
 * @param {boolean} [options.disabled=false] - Whether field is disabled
 * @returns {string} HTML string
 */
export function renderSelectField(options) {
  const {
    name,
    label,
    value = '',
    options: selectOptions = [],
    required = false,
    error = '',
    disabled = false
  } = options;

  const labelText = i18n.t(label) !== label ? i18n.t(label) : label;
  const requiredMark = required ? '<span class="text-red-500 ms-1" aria-hidden="true">*</span>' : '';
  const disabledAttr = disabled ? 'disabled' : '';
  const hasError = error && error.length > 0;

  const selectClasses = `form-select w-full px-3 py-2 border rounded-md
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    disabled:bg-gray-100 disabled:cursor-not-allowed
    ${hasError ? 'border-red-500 bg-red-50' : 'border-gray-300'}`;

  const optionsHtml = selectOptions.map(opt => {
    const optLabel = i18n.t(opt.label) !== opt.label ? i18n.t(opt.label) : opt.label;
    const selected = String(opt.value) === String(value) ? 'selected' : '';
    return `<option value="${escapeHtml(opt.value)}" ${selected}>${escapeHtml(optLabel)}</option>`;
  }).join('');

  return `
    <div class="form-field mb-4" data-field="${escapeHtml(name)}">
      <label class="block text-sm font-medium text-gray-700 mb-1" for="field-${escapeHtml(name)}">
        ${escapeHtml(labelText)}${requiredMark}
      </label>
      <select
        id="field-${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        class="${selectClasses}"
        ${disabledAttr}
        ${required ? 'required' : ''}
        aria-invalid="${hasError}"
        ${hasError ? `aria-describedby="${name}-error"` : ''}
      >
        ${optionsHtml}
      </select>
      ${hasError ? `<p id="${name}-error" class="text-xs text-red-600 mt-1">${escapeHtml(error)}</p>` : ''}
    </div>
  `;
}

/**
 * Get form data from bilingual fields
 * @param {HTMLFormElement} form - Form element
 * @returns {Object} Form data object
 */
export function getBilingualFormData(form) {
  const formData = new FormData(form);
  const data = {};

  for (const [key, value] of formData.entries()) {
    data[key] = value.trim();
  }

  return data;
}
