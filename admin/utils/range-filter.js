/**
 * Range Filter Utility for Editor Restrictions
 * Provides validation and filtering of CSV rows based on editor range configurations
 *
 * This module is designed to work in both browser (frontend) and Node.js (Lambda) environments.
 *
 * @module utils/range-filter
 */

// Use ES module exports for browser compatibility, also works in Node.js with ESM

/**
 * Schema definition for editor range configuration
 * @constant {Object}
 */
export const RANGE_SCHEMA = {
  type: 'object',
  required: ['enabled', 'filterGroups'],
  properties: {
    enabled: {
      type: 'boolean',
      description: 'Whether the range restriction is active. If false, editor has no access.'
    },
    filterGroups: {
      type: 'array',
      description: 'Array of filter groups. A row matches if it matches ANY filter group (OR logic).',
      items: {
        type: 'object',
        properties: {
          collections: {
            type: 'array',
            items: { type: 'string' },
            description: 'Collection name patterns. Supports wildcards (*). Empty array means all collections.'
          },
          floors: {
            type: 'array',
            items: { type: 'number', enum: [0, 1, 2] },
            description: 'Floor numbers (0, 1, 2). Empty array means all floors.'
          },
          callNumberRanges: {
            type: 'array',
            items: {
              type: 'object',
              required: ['start', 'end'],
              properties: {
                start: { type: 'string', description: 'Start of call number range (inclusive)' },
                end: { type: 'string', description: 'End of call number range (inclusive)' }
              }
            },
            description: 'Call number ranges. Empty array means all call numbers.'
          }
        }
      }
    }
  }
};

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
 * Result of range validation
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the range configuration is valid
 * @property {Array<{type: string, message: string, path: string}>} errors - Validation errors
 */

/**
 * Validates a range configuration against the schema
 * @param {Object} rangeConfig - The range configuration to validate
 * @returns {ValidationResult} Validation result with any errors
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
 * Handles:
 * - Pure numeric Dewey decimals: "100", "123.45"
 * - Dewey with parentheses: "396(44)", "677.54(44)"
 * - Alphanumeric prefixes: "ML001", "M1812"
 *
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
    // Extract numeric portion after prefix
    const numMatch = numericPart.match(/^(\d+(?:\.\d+)?)/);
    const numeric = numMatch ? parseFloat(numMatch[1]) : 0;
    return { numeric, prefix, original };
  }

  // Handle Dewey with parentheses like "320(5694)" or "677.54(44)"
  // The parenthetical number is a sub-classification
  const deweyMatch = original.match(/^(\d+(?:\.\d+)?)\((\d+)\)$/);
  if (deweyMatch) {
    const mainNum = parseFloat(deweyMatch[1]);
    const subNum = parseFloat(deweyMatch[2]);
    // Divide by 10,000,000 to ensure parenthetical value stays within 0.01 of main number
    const combined = mainNum + (subNum / 10000000);
    return { numeric: combined, prefix: '', original };
  }

  // Standard numeric Dewey decimal
  const numMatch = original.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return { numeric: parseFloat(numMatch[1]), prefix: '', original };
  }

  // If no numeric match, treat as alphabetic (sort by string)
  return { numeric: null, prefix: original.toUpperCase(), original };
}

/**
 * Compares two call numbers for ordering
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 *
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
    // Both non-numeric, compare original strings
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
 * Checks if a call number falls within a given range (inclusive)
 *
 * @param {string} callNumber - The call number to check
 * @param {string} rangeStart - Start of the range (inclusive)
 * @param {string} rangeEnd - End of the range (inclusive)
 * @returns {boolean} True if call number is within range
 */
export function isCallNumberInRange(callNumber, rangeStart, rangeEnd) {
  const comparison = {
    toStart: compareCallNumbers(callNumber, rangeStart),
    toEnd: compareCallNumbers(callNumber, rangeEnd)
  };

  // Must be >= rangeStart and <= rangeEnd
  return comparison.toStart >= 0 && comparison.toEnd <= 0;
}

/**
 * Checks if two call number ranges overlap
 *
 * @param {Object} range1 - First range with start and end
 * @param {Object} range2 - Second range with start and end
 * @returns {boolean} True if ranges overlap
 */
export function doCallNumberRangesOverlap(range1, range2) {
  // Ranges overlap if: start1 <= end2 AND start2 <= end1
  const start1VsEnd2 = compareCallNumbers(range1.start, range2.end);
  const start2VsEnd1 = compareCallNumbers(range2.start, range1.end);

  return start1VsEnd2 <= 0 && start2VsEnd1 <= 0;
}

/**
 * Converts a wildcard pattern to a regular expression
 * Supports * for any characters and ? for single character
 *
 * @param {string} pattern - The wildcard pattern (e.g., "CK Science*")
 * @returns {RegExp} Regular expression for matching
 */
export function wildcardToRegex(pattern) {
  // Escape regex special characters except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Convert wildcards to regex
  const regexStr = escaped
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`, 'i');
}

/**
 * Checks if a collection name matches a pattern (supports wildcards)
 *
 * @param {string} collectionName - The collection name to check
 * @param {string} pattern - The pattern to match against (supports * and ? wildcards)
 * @returns {boolean} True if collection matches pattern
 */
export function matchesCollectionPattern(collectionName, pattern) {
  const normalizedName = (collectionName ?? '').toString().trim();
  const normalizedPattern = (pattern ?? '').toString().trim();

  if (!normalizedPattern) {
    return true; // Empty pattern matches everything
  }

  // If pattern has wildcards, use regex
  if (normalizedPattern.includes('*') || normalizedPattern.includes('?')) {
    const regex = wildcardToRegex(normalizedPattern);
    return regex.test(normalizedName);
  }

  // Exact match (case-insensitive)
  return normalizedName.toLowerCase() === normalizedPattern.toLowerCase();
}

/**
 * Checks if a CSV row matches a single filter group
 * Within a filter group, all specified criteria must match (AND logic)
 * Empty/undefined criteria matches all values for that dimension
 *
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
  // Empty collections array or undefined = matches all collections

  // Check floor match
  if (Array.isArray(floors) && floors.length > 0) {
    const rowFloor = parseInt((row.floor ?? '').toString().trim(), 10);
    if (!floors.includes(rowFloor)) {
      return false;
    }
  }
  // Empty floors array or undefined = matches all floors

  // Check call number range match
  if (Array.isArray(callNumberRanges) && callNumberRanges.length > 0) {
    const rowRangeStart = (row.rangeStart ?? '').toString().trim();
    const rowRangeEnd = (row.rangeEnd ?? '').toString().trim();

    // A row matches if its range overlaps with ANY of the allowed call number ranges
    const matchesAnyRange = callNumberRanges.some(range => {
      // Check if the row's range overlaps with this allowed range
      // This handles both single-point ranges (rangeStart === rangeEnd) and spans
      return doCallNumberRangesOverlap(
        { start: rowRangeStart, end: rowRangeEnd },
        { start: range.start, end: range.end }
      );
    });

    if (!matchesAnyRange) {
      return false;
    }
  }
  // Empty callNumberRanges array or undefined = matches all call numbers

  // All criteria matched
  return true;
}

/**
 * Checks if a CSV row matches a range configuration
 * A row matches if it matches ANY filter group (OR logic across groups)
 *
 * @param {Object} row - The CSV row to check
 * @param {Object} rangeConfig - The range configuration
 * @returns {boolean} True if row matches the configuration
 */
export function rowMatchesRange(row, rangeConfig) {
  // Validate config structure
  if (!rangeConfig || typeof rangeConfig !== 'object') {
    return false;
  }

  // Disabled range = no access
  if (rangeConfig.enabled === false) {
    return false;
  }

  // No filter groups or empty array = no access
  const { filterGroups } = rangeConfig;
  if (!Array.isArray(filterGroups) || filterGroups.length === 0) {
    return false;
  }

  // Check if row matches ANY filter group (OR logic)
  return filterGroups.some(group => rowMatchesFilterGroup(row, group));
}

/**
 * Filters an array of CSV rows based on a range configuration
 *
 * @param {Object[]} rows - Array of CSV rows to filter
 * @param {Object} rangeConfig - The range configuration
 * @returns {Object[]} Filtered array of rows that match the configuration
 */
export function filterRowsByRange(rows, rangeConfig) {
  // Validate input
  if (!Array.isArray(rows)) {
    return [];
  }

  // Validate config structure
  if (!rangeConfig || typeof rangeConfig !== 'object') {
    return [];
  }

  // Disabled range = no access (return empty array)
  if (rangeConfig.enabled === false) {
    return [];
  }

  // No filter groups = no access (return empty array)
  const { filterGroups } = rangeConfig;
  if (!Array.isArray(filterGroups) || filterGroups.length === 0) {
    return [];
  }

  // Filter rows
  return rows.filter(row => rowMatchesRange(row, rangeConfig));
}

/**
 * Gets the indices of rows that match a range configuration
 * Useful for UI highlighting
 *
 * @param {Object[]} rows - Array of CSV rows
 * @param {Object} rangeConfig - The range configuration
 * @returns {number[]} Array of indices of matching rows
 */
export function getMatchingRowIndices(rows, rangeConfig) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const indices = [];
  rows.forEach((row, index) => {
    if (rowMatchesRange(row, rangeConfig)) {
      indices.push(index);
    }
  });

  return indices;
}

/**
 * Creates an empty/default range configuration
 * This configuration gives no access (disabled state)
 *
 * @returns {Object} Empty range configuration
 */
export function createEmptyRangeConfig() {
  return {
    enabled: false,
    filterGroups: []
  };
}

/**
 * Creates a filter group that matches all rows (unrestricted access)
 *
 * @returns {Object} Filter group that matches everything
 */
export function createUnrestrictedFilterGroup() {
  return {
    collections: [],      // Empty = all collections
    floors: [],           // Empty = all floors
    callNumberRanges: []  // Empty = all call numbers
  };
}

/**
 * Creates a range configuration with unrestricted access
 *
 * @returns {Object} Range configuration with full access
 */
export function createUnrestrictedRangeConfig() {
  return {
    enabled: true,
    filterGroups: [createUnrestrictedFilterGroup()]
  };
}

/**
 * Merges multiple range configurations (union of all filter groups)
 * Useful for combining restrictions from multiple sources
 *
 * @param {Object[]} configs - Array of range configurations to merge
 * @returns {Object} Merged range configuration
 */
export function mergeRangeConfigs(configs) {
  if (!Array.isArray(configs) || configs.length === 0) {
    return createEmptyRangeConfig();
  }

  // Filter to only enabled configs
  const enabledConfigs = configs.filter(c => c && c.enabled === true);

  if (enabledConfigs.length === 0) {
    return createEmptyRangeConfig();
  }

  // Merge all filter groups
  const mergedGroups = [];
  enabledConfigs.forEach(config => {
    if (Array.isArray(config.filterGroups)) {
      mergedGroups.push(...config.filterGroups);
    }
  });

  return {
    enabled: true,
    filterGroups: mergedGroups
  };
}

/**
 * Serializes a range configuration to JSON string
 *
 * @param {Object} rangeConfig - The range configuration
 * @returns {string} JSON string representation
 */
export function serializeRangeConfig(rangeConfig) {
  return JSON.stringify(rangeConfig, null, 2);
}

/**
 * Deserializes a JSON string to a range configuration
 * Returns validation result along with parsed config
 *
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

// Default export for convenient imports
export default {
  // Schema
  RANGE_SCHEMA,
  VALID_FLOORS,
  ValidationErrorType,

  // Validation
  validateRangeConfig,

  // Call number utilities
  parseCallNumber,
  compareCallNumbers,
  isCallNumberInRange,
  doCallNumberRangesOverlap,

  // Collection pattern matching
  wildcardToRegex,
  matchesCollectionPattern,

  // Row matching
  rowMatchesFilterGroup,
  rowMatchesRange,

  // Filtering
  filterRowsByRange,
  getMatchingRowIndices,

  // Config creation helpers
  createEmptyRangeConfig,
  createUnrestrictedFilterGroup,
  createUnrestrictedRangeConfig,

  // Config operations
  mergeRangeConfigs,
  serializeRangeConfig,
  deserializeRangeConfig
};
