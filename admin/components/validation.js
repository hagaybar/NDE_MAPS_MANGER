/**
 * Validation Service for Primo Maps CSV Editor
 * Provides row validation with errors and warnings
 * @module components/validation
 */

import i18n from '../i18n.js?v=3';
import {
  REQUIRED_FIELDS,
  FLOOR_VALUES,
  getRowKey,
  parseRangeValue,
  doRangesOverlap
} from '../services/data-model.js';

/**
 * Validation severity levels
 * @readonly
 * @enum {string}
 */
export const ValidationSeverity = {
  ERROR: 'error',
  WARNING: 'warning'
};

/**
 * Base validation rules for fields
 * @constant {Object}
 */
const VALIDATION_RULES = {
  libraryName: { required: true },
  libraryNameHe: { required: true },
  collectionName: { required: true },
  collectionNameHe: { required: true },
  // Updated pattern to allow Dewey with parentheses: 396(44), 355.1(6)
  rangeStart: { required: true, pattern: /^[\d.]+(?:\(\d+\))?$|^[A-Z]+\d*$/ },
  rangeEnd: { required: true, pattern: /^[\d.]+(?:\(\d+\))?$|^[A-Z]+\d*$/ },
  svgCode: { required: true },
  floor: { required: true, pattern: /^[0-2]$/ }
};

/**
 * Reference to SVG parser for code validation (lazy loaded)
 * @type {Object|null}
 */
let svgParserRef = null;

/**
 * Sets the SVG parser reference for validation
 * @param {Object} parser - The SVG parser service instance
 */
export function setSvgParser(parser) {
  svgParserRef = parser;
}

/**
 * Validates a single row against all validation rules
 * Returns both errors (blocking) and warnings (non-blocking)
 * @param {Object} row - The row data to validate
 * @param {Object} [options={}] - Validation options
 * @param {Object[]} [options.allRows=[]] - All rows for duplicate/overlap checking
 * @param {number} [options.rowIndex=-1] - Index of this row in allRows
 * @param {boolean} [options.checkDuplicates=true] - Whether to check for duplicates
 * @param {boolean} [options.checkOverlaps=true] - Whether to check for overlaps
 * @param {boolean} [options.checkSvgCodes=true] - Whether to validate SVG codes
 * @returns {{errors: Array<{field: string, message: string}>, warnings: Array<{field: string, message: string}>}}
 */
export function validateRow(row, options = {}) {
  const {
    allRows = [],
    rowIndex = -1,
    checkDuplicates = true,
    checkOverlaps = true,
    checkSvgCodes = true
  } = options;

  const errors = [];
  const warnings = [];

  // Basic field validation
  for (const [field, rules] of Object.entries(VALIDATION_RULES)) {
    const value = row[field];
    const stringValue = value !== undefined && value !== null ? String(value).trim() : '';

    // Check required rule
    if (rules.required && stringValue === '') {
      errors.push({
        field,
        message: i18n.t('validation.required')
      });
      continue;
    }

    // Check pattern rule
    if (rules.pattern && stringValue !== '' && !rules.pattern.test(stringValue)) {
      errors.push({
        field,
        message: i18n.t('validation.invalidFormat')
      });
    }
  }

  // Validate floor value
  const floor = row.floor !== undefined ? String(row.floor).trim() : '';
  if (floor && !FLOOR_VALUES.includes(floor)) {
    errors.push({
      field: 'floor',
      message: i18n.t('validation.invalidFloor')
    });
  }

  // Range validation: check rangeStart <= rangeEnd
  const rangeStart = row.rangeStart !== undefined && row.rangeStart !== null
    ? String(row.rangeStart).trim()
    : '';
  const rangeEnd = row.rangeEnd !== undefined && row.rangeEnd !== null
    ? String(row.rangeEnd).trim()
    : '';

  if (rangeStart !== '' && rangeEnd !== '') {
    const parsedStart = parseRangeValue(rangeStart);
    const parsedEnd = parseRangeValue(rangeEnd);

    if (parsedStart.numeric !== null && parsedEnd.numeric !== null) {
      // Check prefixes match
      if (parsedStart.prefix !== parsedEnd.prefix) {
        errors.push({
          field: 'rangeStart',
          message: i18n.t('validation.rangePrefixMismatch')
        });
      } else if (parsedStart.numeric > parsedEnd.numeric) {
        errors.push({
          field: 'rangeStart',
          message: i18n.t('validation.invalidRange')
        });
      }
    }
  }

  // SVG code validation against floor's SVG file
  if (checkSvgCodes && svgParserRef && floor) {
    const svgCode = row.svgCode !== undefined ? String(row.svgCode).trim() : '';
    if (svgCode && !svgParserRef.isValidSvgCode(svgCode, floor)) {
      warnings.push({
        field: 'svgCode',
        message: i18n.t('validation.svgCodeNotFound')
      });
    }
  }

  // Duplicate key detection
  if (checkDuplicates && allRows.length > 0 && rowIndex >= 0) {
    const currentKey = getRowKey(row);
    const duplicateIndex = allRows.findIndex((otherRow, idx) => {
      if (idx === rowIndex) return false;
      return getRowKey(otherRow) === currentKey;
    });

    if (duplicateIndex !== -1) {
      errors.push({
        field: 'svgCode',
        message: i18n.t('validation.duplicateKey')
      });
    }
  }

  // Range overlap warning (same collection, same floor)
  if (checkOverlaps && allRows.length > 0 && rowIndex >= 0) {
    const currentCollection = (row.collectionName ?? '').toString().trim().toLowerCase();
    const currentFloor = floor;

    for (let i = 0; i < allRows.length; i++) {
      if (i === rowIndex) continue;

      const otherRow = allRows[i];
      const otherCollection = (otherRow.collectionName ?? '').toString().trim().toLowerCase();
      const otherFloor = (otherRow.floor ?? '').toString().trim();

      // Only check same collection and floor
      if (currentCollection === otherCollection && currentFloor === otherFloor) {
        const range1 = { start: row.rangeStart, end: row.rangeEnd };
        const range2 = { start: otherRow.rangeStart, end: otherRow.rangeEnd };

        if (doRangesOverlap(range1, range2)) {
          warnings.push({
            field: 'rangeStart',
            message: i18n.t('validation.rangeOverlap')
          });
          break; // Only report once
        }
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validates all rows in a dataset
 * @param {Object[]} rows - Array of rows to validate
 * @param {Object} [options={}] - Validation options
 * @returns {Array<{rowIndex: number, errors: Array, warnings: Array}>}
 */
export function validateAllRows(rows, options = {}) {
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i], {
      ...options,
      allRows: rows,
      rowIndex: i
    });

    if (result.errors.length > 0 || result.warnings.length > 0) {
      results.push({
        rowIndex: i,
        ...result
      });
    }
  }

  return results;
}

/**
 * Checks if a dataset has any validation errors (not warnings)
 * @param {Object[]} rows - Array of rows to check
 * @returns {boolean} True if any row has errors
 */
export function hasValidationErrors(rows) {
  const results = validateAllRows(rows);
  return results.some(r => r.errors.length > 0);
}

/**
 * Shows an error message for a specific input field
 * @param {HTMLElement} input - The input element to show error for
 * @param {string} message - The error message to display
 * @param {string} [severity='error'] - Severity level ('error' or 'warning')
 */
export function showFieldError(input, message, severity = 'error') {
  const isWarning = severity === ValidationSeverity.WARNING;
  const colorClass = isWarning ? 'border-yellow-500' : 'border-red-500';
  const textClass = isWarning ? 'text-yellow-600' : 'text-red-500';

  // Add border class to input
  input.classList.add(colorClass);

  // Create message span
  const errorSpan = document.createElement('span');
  errorSpan.className = `${textClass} text-sm field-error`;
  errorSpan.dataset.severity = severity;
  errorSpan.textContent = message;

  // Append to input's parent node
  input.parentNode.appendChild(errorSpan);
}

/**
 * Shows a warning message for a specific input field
 * @param {HTMLElement} input - The input element
 * @param {string} message - The warning message
 */
export function showFieldWarning(input, message) {
  showFieldError(input, message, ValidationSeverity.WARNING);
}

/**
 * Clears all field errors within a container
 * @param {HTMLElement} container - The container element to clear errors from
 */
export function clearFieldErrors(container) {
  // Remove all border color classes from elements
  const errorBorderElements = container.querySelectorAll('.border-red-500, .border-yellow-500');
  errorBorderElements.forEach(element => {
    element.classList.remove('border-red-500', 'border-yellow-500');
  });

  // Remove all field-error elements
  const errorElements = container.querySelectorAll('.field-error');
  errorElements.forEach(element => {
    element.remove();
  });
}

/**
 * Highlights errors and warnings in a container based on validation results
 * @param {HTMLElement} container - The container element
 * @param {{errors: Array<{field: string, message: string}>, warnings: Array<{field: string, message: string}>}} validation
 */
export function highlightErrors(container, validation) {
  // Clear existing errors first
  clearFieldErrors(container);

  // Support both old format (array of errors) and new format (object with errors/warnings)
  const errors = Array.isArray(validation) ? validation : (validation.errors || []);
  const warnings = validation.warnings || [];

  // Highlight errors
  for (const error of errors) {
    const input = container.querySelector(`[data-field="${error.field}"]`);
    if (input) {
      showFieldError(input, error.message, ValidationSeverity.ERROR);
    }
  }

  // Highlight warnings
  for (const warning of warnings) {
    const input = container.querySelector(`[data-field="${warning.field}"]`);
    if (input) {
      // Don't overwrite errors with warnings
      if (!input.classList.contains('border-red-500')) {
        showFieldError(input, warning.message, ValidationSeverity.WARNING);
      }
    }
  }
}

/**
 * Validates an SVG code against a floor's available codes
 * @param {string} code - The SVG code to validate
 * @param {string} floor - The floor number
 * @returns {boolean} True if valid
 */
export function isValidSvgCode(code, floor) {
  if (!svgParserRef) {
    // No parser available, assume valid
    return true;
  }
  return svgParserRef.isValidSvgCode(code, floor);
}

export default {
  ValidationSeverity,
  validateRow,
  validateAllRows,
  hasValidationErrors,
  showFieldError,
  showFieldWarning,
  clearFieldErrors,
  highlightErrors,
  setSvgParser,
  isValidSvgCode
};
