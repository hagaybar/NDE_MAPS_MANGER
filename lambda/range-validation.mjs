/**
 * Range Validation Utilities for Lambda Functions
 * Provides validation and filtering of CSV rows based on editor range configurations
 *
 * This is a Lambda-compatible version of admin/utils/range-filter.js
 *
 * @module lambda/range-validation
 */

/**
 * Valid floor values
 * @constant {number[]}
 */
export const VALID_FLOORS = [0, 1, 2];

/**
 * Validation error types
 * @readonly
 * @enum {string}
 */
export const ValidationErrorType = {
  INVALID_TYPE: 'INVALID_TYPE',
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  INVALID_FLOOR: 'INVALID_FLOOR',
  INVALID_CALL_NUMBER_RANGE: 'INVALID_CALL_NUMBER_RANGE',
  INVALID_PATTERN: 'INVALID_PATTERN'
};

/**
 * Validates a range configuration against the schema
 * @param {Object} rangeConfig - The range configuration to validate
 * @returns {{valid: boolean, errors: Array}} Validation result with any errors
 */
export function validateRangeConfig(rangeConfig) {
  const errors = [];

  // Check if config is an object
  if (rangeConfig === null || typeof rangeConfig !== 'object') {
    errors.push({
      type: ValidationErrorType.INVALID_TYPE,
      message: 'Range configuration must be an object',
      path: ''
    });
    return { valid: false, errors };
  }

  // Check required 'enabled' field
  if (typeof rangeConfig.enabled !== 'boolean') {
    errors.push({
      type: ValidationErrorType.MISSING_REQUIRED,
      message: 'Field "enabled" is required and must be a boolean',
      path: 'enabled'
    });
  }

  // Check required 'filterGroups' field
  if (!Array.isArray(rangeConfig.filterGroups)) {
    errors.push({
      type: ValidationErrorType.MISSING_REQUIRED,
      message: 'Field "filterGroups" is required and must be an array',
      path: 'filterGroups'
    });
    return { valid: errors.length === 0, errors };
  }

  // Validate each filter group
  rangeConfig.filterGroups.forEach((group, groupIndex) => {
    const groupPath = `filterGroups[${groupIndex}]`;

    if (group === null || typeof group !== 'object') {
      errors.push({
        type: ValidationErrorType.INVALID_TYPE,
        message: 'Filter group must be an object',
        path: groupPath
      });
      return;
    }

    // Validate collections (optional array of strings)
    if (group.collections !== undefined) {
      if (!Array.isArray(group.collections)) {
        errors.push({
          type: ValidationErrorType.INVALID_TYPE,
          message: 'Field "collections" must be an array of strings',
          path: `${groupPath}.collections`
        });
      } else {
        group.collections.forEach((pattern, patternIndex) => {
          if (typeof pattern !== 'string') {
            errors.push({
              type: ValidationErrorType.INVALID_TYPE,
              message: 'Collection pattern must be a string',
              path: `${groupPath}.collections[${patternIndex}]`
            });
          }
        });
      }
    }

    // Validate floors (optional array of valid floor numbers)
    if (group.floors !== undefined) {
      if (!Array.isArray(group.floors)) {
        errors.push({
          type: ValidationErrorType.INVALID_TYPE,
          message: 'Field "floors" must be an array of numbers',
          path: `${groupPath}.floors`
        });
      } else {
        group.floors.forEach((floor, floorIndex) => {
          if (typeof floor !== 'number' || !VALID_FLOORS.includes(floor)) {
            errors.push({
              type: ValidationErrorType.INVALID_FLOOR,
              message: `Invalid floor value "${floor}". Must be one of: ${VALID_FLOORS.join(', ')}`,
              path: `${groupPath}.floors[${floorIndex}]`
            });
          }
        });
      }
    }

    // Validate callNumberRanges (optional array of range objects)
    if (group.callNumberRanges !== undefined) {
      if (!Array.isArray(group.callNumberRanges)) {
        errors.push({
          type: ValidationErrorType.INVALID_TYPE,
          message: 'Field "callNumberRanges" must be an array',
          path: `${groupPath}.callNumberRanges`
        });
      } else {
        group.callNumberRanges.forEach((range, rangeIndex) => {
          const rangePath = `${groupPath}.callNumberRanges[${rangeIndex}]`;

          if (range === null || typeof range !== 'object') {
            errors.push({
              type: ValidationErrorType.INVALID_TYPE,
              message: 'Call number range must be an object with start and end',
              path: rangePath
            });
            return;
          }

          if (typeof range.start !== 'string' || range.start.trim() === '') {
            errors.push({
              type: ValidationErrorType.INVALID_CALL_NUMBER_RANGE,
              message: 'Call number range "start" is required and must be a non-empty string',
              path: `${rangePath}.start`
            });
          }

          if (typeof range.end !== 'string' || range.end.trim() === '') {
            errors.push({
              type: ValidationErrorType.INVALID_CALL_NUMBER_RANGE,
              message: 'Call number range "end" is required and must be a non-empty string',
              path: `${rangePath}.end`
            });
          }
        });
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Parses a call number value to a normalized format for comparison.
 * @param {string} callNumber - The call number to parse
 * @returns {{ numeric: number|null, prefix: string, original: string }} Parsed call number data
 */
export function parseCallNumber(callNumber) {
  const original = (callNumber ?? '').toString().trim();

  if (!original) {
    return { numeric: null, prefix: '', original };
  }

  // Check for alphanumeric prefix like "ML001", "M1812"
  const prefixMatch = original.match(/^([A-Z]+)(\d+.*)?$/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toUpperCase();
    const numericPart = prefixMatch[2] || '';
    const numMatch = numericPart.match(/^(\d+(?:\.\d+)?)/);
    const numeric = numMatch ? parseFloat(numMatch[1]) : 0;
    return { numeric, prefix, original };
  }

  // Handle Dewey with parentheses like "320(5694)" or "677.54(44)"
  const deweyMatch = original.match(/^(\d+(?:\.\d+)?)\((\d+)\)$/);
  if (deweyMatch) {
    const mainNum = parseFloat(deweyMatch[1]);
    const subNum = parseFloat(deweyMatch[2]);
    const combined = mainNum + (subNum / 10000000);
    return { numeric: combined, prefix: '', original };
  }

  // Standard numeric Dewey decimal
  const numMatch = original.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return { numeric: parseFloat(numMatch[1]), prefix: '', original };
  }

  // If no numeric match, treat as alphabetic
  return { numeric: null, prefix: original.toUpperCase(), original };
}

/**
 * Compares two call numbers for ordering
 * @param {string} a - First call number
 * @param {string} b - Second call number
 * @returns {number} Comparison result (-1, 0, or 1)
 */
export function compareCallNumbers(a, b) {
  const parsedA = parseCallNumber(a);
  const parsedB = parseCallNumber(b);

  // Different prefixes: compare alphabetically
  if (parsedA.prefix !== parsedB.prefix) {
    if (parsedA.prefix < parsedB.prefix) return -1;
    if (parsedA.prefix > parsedB.prefix) return 1;
    return 0;
  }

  // Same prefix or no prefix: compare numerics
  if (parsedA.numeric === null && parsedB.numeric === null) {
    if (parsedA.original < parsedB.original) return -1;
    if (parsedA.original > parsedB.original) return 1;
    return 0;
  }

  if (parsedA.numeric === null) return -1;
  if (parsedB.numeric === null) return 1;

  if (parsedA.numeric < parsedB.numeric) return -1;
  if (parsedA.numeric > parsedB.numeric) return 1;
  return 0;
}

/**
 * Checks if two call number ranges overlap
 * @param {Object} range1 - First range with start and end
 * @param {Object} range2 - Second range with start and end
 * @returns {boolean} True if ranges overlap
 */
export function doCallNumberRangesOverlap(range1, range2) {
  const start1VsEnd2 = compareCallNumbers(range1.start, range2.end);
  const start2VsEnd1 = compareCallNumbers(range2.start, range1.end);
  return start1VsEnd2 <= 0 && start2VsEnd1 <= 0;
}

/**
 * Converts a wildcard pattern to a regular expression
 * @param {string} pattern - The wildcard pattern
 * @returns {RegExp} Regular expression for matching
 */
export function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = escaped
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`, 'i');
}

/**
 * Checks if a collection name matches a pattern
 * @param {string} collectionName - The collection name to check
 * @param {string} pattern - The pattern to match against
 * @returns {boolean} True if collection matches pattern
 */
export function matchesCollectionPattern(collectionName, pattern) {
  const normalizedName = (collectionName ?? '').toString().trim();
  const normalizedPattern = (pattern ?? '').toString().trim();

  if (!normalizedPattern) {
    return true;
  }

  if (normalizedPattern.includes('*') || normalizedPattern.includes('?')) {
    const regex = wildcardToRegex(normalizedPattern);
    return regex.test(normalizedName);
  }

  return normalizedName.toLowerCase() === normalizedPattern.toLowerCase();
}

/**
 * Checks if a CSV row matches a single filter group
 * @param {Object} row - The CSV row to check
 * @param {Object} filterGroup - The filter group configuration
 * @returns {boolean} True if row matches the filter group
 */
export function rowMatchesFilterGroup(row, filterGroup) {
  if (!filterGroup || typeof filterGroup !== 'object') {
    return false;
  }

  const { collections, floors, callNumberRanges } = filterGroup;

  // Check collection match
  if (Array.isArray(collections) && collections.length > 0) {
    const rowCollection = (row.collectionName ?? '').toString().trim();
    const matchesAnyCollection = collections.some(pattern =>
      matchesCollectionPattern(rowCollection, pattern)
    );
    if (!matchesAnyCollection) {
      return false;
    }
  }

  // Check floor match
  if (Array.isArray(floors) && floors.length > 0) {
    const rowFloor = parseInt((row.floor ?? '').toString().trim(), 10);
    if (!floors.includes(rowFloor)) {
      return false;
    }
  }

  // Check call number range match
  if (Array.isArray(callNumberRanges) && callNumberRanges.length > 0) {
    const rowRangeStart = (row.rangeStart ?? '').toString().trim();
    const rowRangeEnd = (row.rangeEnd ?? '').toString().trim();

    const matchesAnyRange = callNumberRanges.some(range => {
      return doCallNumberRangesOverlap(
        { start: rowRangeStart, end: rowRangeEnd },
        { start: range.start, end: range.end }
      );
    });

    if (!matchesAnyRange) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a CSV row matches a range configuration
 * @param {Object} row - The CSV row to check
 * @param {Object} rangeConfig - The range configuration
 * @returns {boolean} True if row matches the configuration
 */
export function rowMatchesRange(row, rangeConfig) {
  if (!rangeConfig || typeof rangeConfig !== 'object') {
    return false;
  }

  if (rangeConfig.enabled === false) {
    return false;
  }

  const { filterGroups } = rangeConfig;
  if (!Array.isArray(filterGroups) || filterGroups.length === 0) {
    return false;
  }

  return filterGroups.some(group => rowMatchesFilterGroup(row, group));
}

/**
 * Parses CSV content into an array of row objects
 * @param {string} csvContent - The CSV content string
 * @returns {{ headers: string[], rows: Object[] }} Parsed CSV data
 */
export function parseCsvContent(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ? values[index].trim() : '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Converts row objects back to CSV content
 * @param {string[]} headers - CSV headers
 * @param {Object[]} rows - Array of row objects
 * @returns {string} CSV content string
 */
export function rowsToCsvContent(headers, rows) {
  const headerLine = headers.join(',');
  const dataLines = rows.map(row =>
    headers.map(h => row[h] || '').join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Deserializes a JSON string to a range configuration
 * @param {string} jsonString - The JSON string to parse
 * @returns {{ config: Object|null, valid: boolean, errors: Array }} Parse result
 */
export function deserializeRangeConfig(jsonString) {
  try {
    const config = JSON.parse(jsonString);
    const validation = validateRangeConfig(config);
    return {
      config: validation.valid ? config : null,
      valid: validation.valid,
      errors: validation.errors
    };
  } catch (parseError) {
    return {
      config: null,
      valid: false,
      errors: [{
        type: 'PARSE_ERROR',
        message: `Failed to parse JSON: ${parseError.message}`,
        path: ''
      }]
    };
  }
}

/**
 * Validates that all modified rows are within the user's allowed ranges
 * @param {Object[]} originalRows - Original CSV rows
 * @param {Object[]} newRows - New CSV rows after edit
 * @param {Object} rangeConfig - User's allowed range configuration
 * @returns {{ valid: boolean, violations: Object[] }} Validation result
 */
export function validateEditsAgainstRange(originalRows, newRows, rangeConfig) {
  const violations = [];

  // Create a map of original rows by a composite key for comparison
  const createRowKey = (row) => {
    return `${row.collectionName || ''}|${row.floor || ''}|${row.rangeStart || ''}|${row.rangeEnd || ''}`;
  };

  const originalRowMap = new Map();
  originalRows.forEach((row, index) => {
    originalRowMap.set(createRowKey(row), { row, index });
  });

  const newRowMap = new Map();
  newRows.forEach((row, index) => {
    newRowMap.set(createRowKey(row), { row, index });
  });

  // Find added rows (in new but not in original)
  newRows.forEach((newRow, newIndex) => {
    const key = createRowKey(newRow);
    if (!originalRowMap.has(key)) {
      // This is a new row - check if within range
      if (!rowMatchesRange(newRow, rangeConfig)) {
        violations.push({
          type: 'ADD',
          rowIndex: newIndex,
          row: newRow,
          message: `Cannot add row outside your assigned range: collection="${newRow.collectionName}", floor=${newRow.floor}, range=${newRow.rangeStart}-${newRow.rangeEnd}`
        });
      }
    }
  });

  // Find deleted rows (in original but not in new)
  originalRows.forEach((origRow, origIndex) => {
    const key = createRowKey(origRow);
    if (!newRowMap.has(key)) {
      // This row was deleted - check if within range
      if (!rowMatchesRange(origRow, rangeConfig)) {
        violations.push({
          type: 'DELETE',
          rowIndex: origIndex,
          row: origRow,
          message: `Cannot delete row outside your assigned range: collection="${origRow.collectionName}", floor=${origRow.floor}, range=${origRow.rangeStart}-${origRow.rangeEnd}`
        });
      }
    }
  });

  // Find modified rows by comparing all fields
  const compareRows = (row1, row2) => {
    const keys = new Set([...Object.keys(row1), ...Object.keys(row2)]);
    for (const key of keys) {
      if ((row1[key] || '') !== (row2[key] || '')) {
        return false;
      }
    }
    return true;
  };

  // Check each new row to see if it's a modification of an existing row
  newRows.forEach((newRow, newIndex) => {
    const key = createRowKey(newRow);
    const originalEntry = originalRowMap.get(key);

    if (originalEntry && !compareRows(originalEntry.row, newRow)) {
      // Row was modified - check if within range
      if (!rowMatchesRange(newRow, rangeConfig)) {
        violations.push({
          type: 'MODIFY',
          rowIndex: newIndex,
          row: newRow,
          originalRow: originalEntry.row,
          message: `Cannot modify row outside your assigned range: collection="${newRow.collectionName}", floor=${newRow.floor}, range=${newRow.rangeStart}-${newRow.rangeEnd}`
        });
      }
    }
  });

  return {
    valid: violations.length === 0,
    violations
  };
}

export default {
  VALID_FLOORS,
  ValidationErrorType,
  validateRangeConfig,
  parseCallNumber,
  compareCallNumbers,
  doCallNumberRangesOverlap,
  wildcardToRegex,
  matchesCollectionPattern,
  rowMatchesFilterGroup,
  rowMatchesRange,
  parseCsvContent,
  rowsToCsvContent,
  deserializeRangeConfig,
  validateEditsAgainstRange
};
