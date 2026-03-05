/**
 * Data Model Service for Primo Maps CSV Editor
 * Defines the CSV schema, validation rules, and data integrity checks
 * @module services/data-model
 */

/**
 * CSV Column names in order
 * @constant {string[]}
 */
export const CSV_COLUMNS = [
  'libraryName',
  'libraryNameHe',
  'collectionName',
  'collectionNameHe',
  'rangeStart',
  'rangeEnd',
  'svgCode',
  'description',
  'descriptionHe',
  'floor',
  'shelfLabel',
  'shelfLabelHe',
  'notes',
  'notesHe'
];

/**
 * Required fields that must have values
 * @constant {string[]}
 */
export const REQUIRED_FIELDS = [
  'libraryName',
  'libraryNameHe',
  'collectionName',
  'collectionNameHe',
  'rangeStart',
  'rangeEnd',
  'svgCode',
  'floor'
];

/**
 * Valid floor values
 * @constant {string[]}
 */
export const FLOOR_VALUES = ['0', '1', '2'];

/**
 * Validation error codes and messages
 * @constant {Object}
 */
export const VALIDATION_ERRORS = {
  E001: 'Required field is missing',
  E002: 'Range start must be less than or equal to range end',
  E003: 'Floor must be 0, 1, or 2',
  E004: 'Range start and end must have the same prefix',
  E005: 'Duplicate entry: this combination of collection, range, and SVG code already exists',
  E006: 'SVG code not found in floor map'
};

/**
 * Validation warning codes and messages
 * @constant {Object}
 */
export const VALIDATION_WARNINGS = {
  W001: 'Range overlaps with another entry in the same collection',
  W002: 'SVG code format is unusual',
  W003: 'Description field is empty'
};

/**
 * Validation rules configuration
 * @constant {Object}
 */
export const VALIDATION_RULES = {
  required: REQUIRED_FIELDS,
  floorValues: FLOOR_VALUES,
  uniqueKey: ['collectionName', 'rangeStart', 'rangeEnd', 'svgCode']
};

/**
 * Column configuration with display and validation metadata
 * @constant {Object}
 */
export const COLUMN_CONFIG = {
  libraryName: {
    type: 'text',
    required: true,
    bilingual: 'libraryNameHe',
    label: { en: 'Library Name', he: 'שם הספרייה' }
  },
  libraryNameHe: {
    type: 'text',
    required: true,
    bilingual: 'libraryName',
    label: { en: 'Library Name (Hebrew)', he: 'שם הספרייה (עברית)' }
  },
  collectionName: {
    type: 'text',
    required: true,
    bilingual: 'collectionNameHe',
    label: { en: 'Collection Name', he: 'שם האוסף' }
  },
  collectionNameHe: {
    type: 'text',
    required: true,
    bilingual: 'collectionName',
    label: { en: 'Collection Name (Hebrew)', he: 'שם האוסף (עברית)' }
  },
  rangeStart: {
    type: 'range',
    required: true,
    label: { en: 'Range Start', he: 'התחלת טווח' }
  },
  rangeEnd: {
    type: 'range',
    required: true,
    label: { en: 'Range End', he: 'סוף טווח' }
  },
  svgCode: {
    type: 'svgCode',
    required: true,
    label: { en: 'SVG Code', he: 'קוד SVG' }
  },
  description: {
    type: 'text',
    required: false,
    bilingual: 'descriptionHe',
    label: { en: 'Description', he: 'תיאור' }
  },
  descriptionHe: {
    type: 'text',
    required: false,
    bilingual: 'description',
    label: { en: 'Description (Hebrew)', he: 'תיאור (עברית)' }
  },
  floor: {
    type: 'select',
    required: true,
    options: FLOOR_VALUES,
    label: { en: 'Floor', he: 'קומה' }
  },
  shelfLabel: {
    type: 'text',
    required: false,
    bilingual: 'shelfLabelHe',
    label: { en: 'Shelf Label', he: 'תווית מדף' }
  },
  shelfLabelHe: {
    type: 'text',
    required: false,
    bilingual: 'shelfLabel',
    label: { en: 'Shelf Label (Hebrew)', he: 'תווית מדף (עברית)' }
  },
  notes: {
    type: 'text',
    required: false,
    bilingual: 'notesHe',
    label: { en: 'Notes', he: 'הערות' }
  },
  notesHe: {
    type: 'text',
    required: false,
    bilingual: 'notes',
    label: { en: 'Notes (Hebrew)', he: 'הערות (עברית)' }
  }
};

/**
 * Normalize a string for comparison (lowercase, remove spaces)
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  return (str ?? '').toString().trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Generates a unique key for a row based on collectionName + rangeStart + rangeEnd + svgCode
 * @param {Object} row - The row object containing CSV data
 * @returns {string} The unique key for this row
 */
export function getRowKey(row) {
  const collectionName = normalizeString(row.collectionName);
  const rangeStart = (row.rangeStart ?? '').toString().trim();
  const rangeEnd = (row.rangeEnd ?? '').toString().trim();
  const svgCode = (row.svgCode ?? '').toString().trim();
  return `${collectionName}|${rangeStart}|${rangeEnd}|${svgCode}`;
}

/**
 * Checks if two rows have the same unique key (are duplicates)
 * @param {Object} row1 - First row to compare
 * @param {Object} row2 - Second row to compare
 * @returns {boolean} True if rows have the same unique key
 */
export function areRowsEqual(row1, row2) {
  return getRowKey(row1) === getRowKey(row2);
}

/**
 * Finds duplicate rows in a dataset based on unique key
 * @param {Object[]} rows - Array of row objects
 * @returns {Array<{indices: number[], key: string}>} Array of duplicate groups with their indices
 */
export function findDuplicateRows(rows) {
  const keyMap = new Map();

  rows.forEach((row, index) => {
    const key = getRowKey(row);
    if (!keyMap.has(key)) {
      keyMap.set(key, []);
    }
    keyMap.get(key).push(index);
  });

  const duplicates = [];
  for (const [key, indices] of keyMap.entries()) {
    if (indices.length > 1) {
      duplicates.push({ key, indices });
    }
  }

  return duplicates;
}

/**
 * Parses a range value to a normalized number for comparison
 * Handles Dewey decimals, alphanumeric prefixes, and parenthetical suffixes like 396(44)
 * @param {string} rangeValue - The range value to parse
 * @returns {{ numeric: number|null, prefix: string, original: string }} Parsed range data
 */
export function parseRangeValue(rangeValue) {
  const original = (rangeValue ?? '').toString().trim();

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
  // The parenthetical number is a sub-classification that comes AFTER the base number
  // but BEFORE any decimal extension. Example ordering: 320 < 320(5694) < 320(5800) < 320.1
  const deweyMatch = original.match(/^(\d+(?:\.\d+)?)\((\d+)\)$/);
  if (deweyMatch) {
    const mainNum = parseFloat(deweyMatch[1]);
    const subNum = parseFloat(deweyMatch[2]);
    // Divide by 10,000,000 to ensure parenthetical value stays within 0.01 of main number
    // This preserves ordering: 320(5694) = 320.0005694 < 320.1
    const combined = mainNum + (subNum / 10000000);
    return { numeric: combined, prefix: '', original };
  }

  // Standard numeric Dewey decimal
  const numMatch = original.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return { numeric: parseFloat(numMatch[1]), prefix: '', original };
  }

  return { numeric: null, prefix: '', original };
}

/**
 * Checks if two ranges have a problematic overlap (interior overlap, not just boundary touch)
 *
 * Legitimate cases (returns false):
 * - Boundary touch: "870.9-873" and "873-880.82" (end of A = start of B)
 * - Identical ranges: "905-905" and "905-905" (same shelf classification, different cutters)
 *
 * Problematic overlap (returns true):
 * - Interior overlap: "100-110" and "109-111" (109-110 overlaps)
 *
 * @param {Object} range1 - First range with start and end properties
 * @param {Object} range2 - Second range with start and end properties
 * @returns {boolean} True if ranges have problematic interior overlap
 */
export function doRangesOverlap(range1, range2) {
  const start1 = parseRangeValue(range1.start);
  const end1 = parseRangeValue(range1.end);
  const start2 = parseRangeValue(range2.start);
  const end2 = parseRangeValue(range2.end);

  // If any value couldn't be parsed, can't determine overlap
  if (start1.numeric === null || end1.numeric === null ||
      start2.numeric === null || end2.numeric === null) {
    return false;
  }

  // Different prefixes don't overlap
  if (start1.prefix !== start2.prefix) {
    return false;
  }

  // Identical ranges are OK (multiple shelves for same classification with different cutters)
  if (start1.numeric === start2.numeric && end1.numeric === end2.numeric) {
    return false;
  }

  // Check for interior overlap using strict inequalities
  // Boundary touch (end1 = start2 or end2 = start1) is NOT a problematic overlap
  // Interior overlap exists when: start1 < end2 AND start2 < end1
  return start1.numeric < end2.numeric && start2.numeric < end1.numeric;
}

/**
 * Finds overlapping ranges within the same collection on the same floor
 * @param {Object[]} rows - Array of row objects
 * @returns {Array<{row1Index: number, row2Index: number, collection: string, floor: string}>} Overlapping range pairs
 */
export function findOverlappingRanges(rows) {
  const overlaps = [];

  // Group by collection name and floor
  const groups = new Map();

  rows.forEach((row, index) => {
    const collection = (row.collectionName ?? '').toString().trim().toLowerCase();
    const floor = (row.floor ?? '').toString().trim();
    const key = `${collection}|${floor}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({ row, index });
  });

  // Check for overlaps within each group
  for (const [key, entries] of groups.entries()) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const entry1 = entries[i];
        const entry2 = entries[j];

        const range1 = {
          start: entry1.row.rangeStart,
          end: entry1.row.rangeEnd
        };
        const range2 = {
          start: entry2.row.rangeStart,
          end: entry2.row.rangeEnd
        };

        if (doRangesOverlap(range1, range2)) {
          const [collection, floor] = key.split('|');
          overlaps.push({
            row1Index: entry1.index,
            row2Index: entry2.index,
            collection,
            floor
          });
        }
      }
    }
  }

  return overlaps;
}

/**
 * Creates an empty row with all CSV columns initialized to empty strings
 * @returns {Object} Empty row object
 */
export function createEmptyRow() {
  const row = {};
  for (const column of CSV_COLUMNS) {
    row[column] = '';
  }
  return row;
}

/**
 * Validates that a row has all required CSV columns
 * @param {Object} row - The row to validate
 * @returns {string[]} Array of missing column names
 */
export function getMissingColumns(row) {
  const missing = [];
  for (const column of CSV_COLUMNS) {
    if (!(column in row)) {
      missing.push(column);
    }
  }
  return missing;
}

/**
 * Gets column label for display based on locale
 * @param {string} column - Column name
 * @param {string} locale - Locale code ('en' or 'he')
 * @returns {string} Localized column label
 */
export function getColumnLabel(column, locale = 'en') {
  const config = COLUMN_CONFIG[column];
  if (!config || !config.label) {
    return column;
  }
  return config.label[locale] || config.label.en || column;
}

/**
 * Gets bilingual field pairs for side-by-side editing
 * @returns {Array<{en: string, he: string}>} Array of field pairs
 */
export function getBilingualFieldPairs() {
  const pairs = [];
  const processed = new Set();

  for (const [column, config] of Object.entries(COLUMN_CONFIG)) {
    if (config.bilingual && !processed.has(column)) {
      // Determine which is English and which is Hebrew
      const isHebrewField = column.endsWith('He');
      if (!isHebrewField) {
        pairs.push({
          en: column,
          he: config.bilingual
        });
        processed.add(column);
        processed.add(config.bilingual);
      }
    }
  }

  return pairs;
}

/**
 * Get field label for display
 * @param {string} field - Field name
 * @returns {string} Human-readable field label
 */
function getFieldLabel(field) {
  const labels = {
    libraryName: 'Library Name',
    libraryNameHe: 'Library Name (Hebrew)',
    collectionName: 'Collection Name',
    collectionNameHe: 'Collection Name (Hebrew)',
    rangeStart: 'Range Start',
    rangeEnd: 'Range End',
    svgCode: 'SVG Code',
    floor: 'Floor',
    description: 'Description',
    descriptionHe: 'Description (Hebrew)',
    shelfLabel: 'Shelf Label',
    shelfLabelHe: 'Shelf Label (Hebrew)',
    notes: 'Notes',
    notesHe: 'Notes (Hebrew)'
  };
  return labels[field] || field;
}

/**
 * Validate a single row against all validation rules
 * Returns detailed, actionable error messages with specific context
 * @param {Object} row - The row to validate
 * @param {Object[]} allRows - All rows for duplicate/overlap checking
 * @param {Object} [originalRow] - Original row if editing (for excluding from duplicate check)
 * @returns {{ valid: boolean, errors: Array<{field: string, code: string, message: string, details: Object}>, warnings: Array<{field: string, code: string, message: string, details: Object}> }}
 */
export function validateRow(row, allRows = [], originalRow = null) {
  const errors = [];
  const warnings = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    const value = (row[field] ?? '').toString().trim();
    if (!value) {
      const fieldLabel = getFieldLabel(field);
      errors.push({
        field,
        code: 'E001',
        message: `Required field "${fieldLabel}" is empty`,
        details: { missingField: field, fieldLabel }
      });
    }
  }

  // Check floor value
  const floor = (row.floor ?? '').toString().trim();
  if (floor && !FLOOR_VALUES.includes(floor)) {
    errors.push({
      field: 'floor',
      code: 'E003',
      message: `Floor value "${floor}" is invalid. Must be 0 (Ground), 1 (First), or 2 (Second)`,
      details: { invalidValue: floor, validValues: FLOOR_VALUES }
    });
  }

  // Check range validity
  const rangeStart = parseRangeValue(row.rangeStart);
  const rangeEnd = parseRangeValue(row.rangeEnd);

  if (rangeStart.numeric !== null && rangeEnd.numeric !== null) {
    // Check prefix match
    if (rangeStart.prefix !== rangeEnd.prefix) {
      errors.push({
        field: 'rangeEnd',
        code: 'E004',
        message: `Range prefix mismatch: Start "${row.rangeStart}" has prefix "${rangeStart.prefix || '(none)'}" but End "${row.rangeEnd}" has prefix "${rangeEnd.prefix || '(none)'}"`,
        details: {
          rangeStart: row.rangeStart,
          rangeEnd: row.rangeEnd,
          startPrefix: rangeStart.prefix,
          endPrefix: rangeEnd.prefix
        }
      });
    }
    // Check range order
    else if (rangeStart.numeric > rangeEnd.numeric) {
      errors.push({
        field: 'rangeEnd',
        code: 'E002',
        message: `Range order invalid: Start "${row.rangeStart}" (${rangeStart.numeric}) is greater than End "${row.rangeEnd}" (${rangeEnd.numeric})`,
        details: {
          rangeStart: row.rangeStart,
          rangeEnd: row.rangeEnd,
          startValue: rangeStart.numeric,
          endValue: rangeEnd.numeric
        }
      });
    }
  }

  // Check for duplicates (excluding original row if editing)
  const currentKey = getRowKey(row);
  let duplicateRow = null;
  let duplicateRowIndex = -1;

  for (let idx = 0; idx < allRows.length; idx++) {
    const r = allRows[idx];
    // Skip the original row when editing
    if (originalRow && r._index === originalRow._index) {
      continue;
    }
    if (getRowKey(r) === currentKey) {
      duplicateRow = r;
      duplicateRowIndex = r._index !== undefined ? r._index : idx;
      break;
    }
  }

  if (duplicateRow) {
    const collection = row.collectionName || row.collectionNameHe || 'Unknown';
    errors.push({
      field: 'svgCode',
      code: 'E005',
      message: `Duplicate entry found at Row ${duplicateRowIndex + 1}: Same collection "${collection}" with range "${row.rangeStart}-${row.rangeEnd}" and SVG code "${row.svgCode}" already exists`,
      details: {
        duplicateRowIndex: duplicateRowIndex + 1,
        duplicateRow: duplicateRow,
        collection: collection,
        rangeStart: row.rangeStart,
        rangeEnd: row.rangeEnd,
        svgCode: row.svgCode
      }
    });
  }

  // Check for range overlaps (warning only)
  const rowRange = { start: row.rangeStart, end: row.rangeEnd };
  const sameCollectionRows = allRows.filter(r => {
    // Skip the original row when editing
    if (originalRow && r._index === originalRow._index) {
      return false;
    }
    const sameCollection = (r.collectionName ?? '').toLowerCase() ===
                           (row.collectionName ?? '').toLowerCase();
    const sameFloor = (r.floor ?? '') === (row.floor ?? '');
    return sameCollection && sameFloor;
  });

  for (const otherRow of sameCollectionRows) {
    const otherRange = { start: otherRow.rangeStart, end: otherRow.rangeEnd };
    if (doRangesOverlap(rowRange, otherRange)) {
      const otherRowIndex = otherRow._index !== undefined ? otherRow._index : allRows.indexOf(otherRow);
      const collection = row.collectionName || row.collectionNameHe || 'Unknown';
      warnings.push({
        field: 'rangeStart',
        code: 'W001',
        message: `Range "${row.rangeStart}-${row.rangeEnd}" overlaps with Row ${otherRowIndex + 1}: "${otherRow.rangeStart}-${otherRow.rangeEnd}" in collection "${collection}" (Floor ${row.floor})`,
        details: {
          currentRange: { start: row.rangeStart, end: row.rangeEnd },
          overlappingRowIndex: otherRowIndex + 1,
          overlappingRange: { start: otherRow.rangeStart, end: otherRow.rangeEnd },
          collection: collection,
          floor: row.floor,
          overlappingRow: otherRow
        }
      });
      break; // Only report once
    }
  }

  // Check for empty description (warning)
  const description = (row.description ?? '').toString().trim();
  const descriptionHe = (row.descriptionHe ?? '').toString().trim();
  if (!description && !descriptionHe) {
    warnings.push({
      field: 'description',
      code: 'W003',
      message: `Both English and Hebrew description fields are empty for this location mapping`,
      details: {}
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export default {
  CSV_COLUMNS,
  REQUIRED_FIELDS,
  FLOOR_VALUES,
  COLUMN_CONFIG,
  VALIDATION_ERRORS,
  VALIDATION_WARNINGS,
  VALIDATION_RULES,
  getRowKey,
  areRowsEqual,
  findDuplicateRows,
  parseRangeValue,
  doRangesOverlap,
  findOverlappingRanges,
  createEmptyRow,
  getMissingColumns,
  getColumnLabel,
  getBilingualFieldPairs,
  validateRow
};
