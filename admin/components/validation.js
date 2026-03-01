import i18n from '../i18n.js';

const VALIDATION_RULES = {
  libraryName: { required: true },
  libraryNameHe: { required: true },
  collectionName: { required: true },
  collectionNameHe: { required: true },
  rangeStart: { required: true, pattern: /^[\d.]+$|^[A-Z]+\d*$/ },
  rangeEnd: { required: true, pattern: /^[\d.]+$|^[A-Z]+\d*$/ },
  svgCode: { required: true },
  floor: { required: true, pattern: /^[0-9]$/ }
};

/**
 * Validates a row object against the defined validation rules
 * @param {Object} row - The row data to validate
 * @returns {Array<{field: string, message: string}>} Array of validation errors
 */
export function validateRow(row) {
  const errors = [];

  // Iterate over validation rules
  for (const [field, rules] of Object.entries(VALIDATION_RULES)) {
    const value = row[field];
    const stringValue = value !== undefined && value !== null ? String(value).trim() : '';

    // Check required rule
    if (rules.required && stringValue === '') {
      errors.push({
        field,
        message: i18n.t('validation.required')
      });
      continue; // Skip pattern check if field is empty
    }

    // Check pattern rule
    if (rules.pattern && stringValue !== '' && !rules.pattern.test(stringValue)) {
      errors.push({
        field,
        message: i18n.t('validation.invalidFormat')
      });
    }
  }

  // Custom validation: check rangeStart <= rangeEnd if both are numeric
  const rangeStart = row.rangeStart !== undefined && row.rangeStart !== null ? String(row.rangeStart).trim() : '';
  const rangeEnd = row.rangeEnd !== undefined && row.rangeEnd !== null ? String(row.rangeEnd).trim() : '';

  if (rangeStart !== '' && rangeEnd !== '') {
    const startNum = parseFloat(rangeStart);
    const endNum = parseFloat(rangeEnd);

    if (!isNaN(startNum) && !isNaN(endNum) && startNum > endNum) {
      errors.push({
        field: 'rangeStart',
        message: i18n.t('validation.invalidRange')
      });
    }
  }

  return errors;
}

/**
 * Shows an error message for a specific input field
 * @param {HTMLElement} input - The input element to show error for
 * @param {string} message - The error message to display
 */
export function showFieldError(input, message) {
  // Add error border class to input
  input.classList.add('border-red-500');

  // Create error message span
  const errorSpan = document.createElement('span');
  errorSpan.className = 'text-red-500 text-sm field-error';
  errorSpan.textContent = message;

  // Append to input's parent node
  input.parentNode.appendChild(errorSpan);
}

/**
 * Clears all field errors within a container
 * @param {HTMLElement} container - The container element to clear errors from
 */
export function clearFieldErrors(container) {
  // Remove border-red-500 class from all elements
  const errorBorderElements = container.querySelectorAll('.border-red-500');
  errorBorderElements.forEach(element => {
    element.classList.remove('border-red-500');
  });

  // Remove all field-error elements
  const errorElements = container.querySelectorAll('.field-error');
  errorElements.forEach(element => {
    element.remove();
  });
}

/**
 * Highlights errors in a container based on validation results
 * @param {HTMLElement} container - The container element
 * @param {Array<{field: string, message: string}>} errors - Array of validation errors
 */
export function highlightErrors(container, errors) {
  // Clear existing errors first
  clearFieldErrors(container);

  // Highlight each error
  for (const error of errors) {
    const input = container.querySelector(`[data-field="${error.field}"]`);
    if (input) {
      showFieldError(input, error.message);
    }
  }
}
