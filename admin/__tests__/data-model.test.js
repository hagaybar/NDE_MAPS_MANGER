/**
 * Unit tests for Data Model Service
 * Tests row uniqueness, range overlap detection, and validation rules
 */

import {
  CSV_COLUMNS,
  REQUIRED_FIELDS,
  FLOOR_VALUES,
  getRowKey,
  areRowsEqual,
  findDuplicateRows,
  parseRangeValue,
  doRangesOverlap,
  findOverlappingRanges,
  createEmptyRow,
  getMissingColumns,
  getColumnLabel,
  getBilingualFieldPairs
} from '../services/data-model.js';

describe('Data Model Service', () => {
  describe('Constants', () => {
    test('CSV_COLUMNS has 14 columns', () => {
      expect(CSV_COLUMNS).toHaveLength(14);
    });

    test('CSV_COLUMNS includes all required fields', () => {
      for (const field of REQUIRED_FIELDS) {
        expect(CSV_COLUMNS).toContain(field);
      }
    });

    test('FLOOR_VALUES contains 0, 1, 2', () => {
      expect(FLOOR_VALUES).toEqual(['0', '1', '2']);
    });

    test('REQUIRED_FIELDS includes critical fields', () => {
      expect(REQUIRED_FIELDS).toContain('libraryName');
      expect(REQUIRED_FIELDS).toContain('collectionName');
      expect(REQUIRED_FIELDS).toContain('rangeStart');
      expect(REQUIRED_FIELDS).toContain('rangeEnd');
      expect(REQUIRED_FIELDS).toContain('svgCode');
      expect(REQUIRED_FIELDS).toContain('floor');
    });
  });

  describe('getRowKey', () => {
    test('generates key from rangeStart, rangeEnd, and svgCode', () => {
      const row = {
        rangeStart: '100',
        rangeEnd: '200',
        svgCode: 'shelf_a'
      };
      expect(getRowKey(row)).toBe('100|200|shelf_a');
    });

    test('handles empty values', () => {
      const row = {
        rangeStart: '',
        rangeEnd: '',
        svgCode: ''
      };
      expect(getRowKey(row)).toBe('||');
    });

    test('handles undefined values', () => {
      const row = {};
      expect(getRowKey(row)).toBe('||');
    });

    test('handles null values', () => {
      const row = {
        rangeStart: null,
        rangeEnd: null,
        svgCode: null
      };
      expect(getRowKey(row)).toBe('||');
    });

    test('trims whitespace', () => {
      const row = {
        rangeStart: '  100  ',
        rangeEnd: '  200  ',
        svgCode: '  shelf_a  '
      };
      expect(getRowKey(row)).toBe('100|200|shelf_a');
    });
  });

  describe('areRowsEqual', () => {
    test('returns true for identical rows', () => {
      const row1 = { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a' };
      const row2 = { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a' };
      expect(areRowsEqual(row1, row2)).toBe(true);
    });

    test('returns false for different rows', () => {
      const row1 = { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a' };
      const row2 = { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_b' };
      expect(areRowsEqual(row1, row2)).toBe(false);
    });

    test('ignores non-key fields', () => {
      const row1 = { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a', floor: '1' };
      const row2 = { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a', floor: '2' };
      expect(areRowsEqual(row1, row2)).toBe(true);
    });
  });

  describe('findDuplicateRows', () => {
    test('returns empty array for no duplicates', () => {
      const rows = [
        { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a' },
        { rangeStart: '200', rangeEnd: '300', svgCode: 'shelf_b' }
      ];
      expect(findDuplicateRows(rows)).toEqual([]);
    });

    test('finds duplicate rows', () => {
      const rows = [
        { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a' },
        { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a' },
        { rangeStart: '200', rangeEnd: '300', svgCode: 'shelf_b' }
      ];
      const duplicates = findDuplicateRows(rows);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].indices).toEqual([0, 1]);
      expect(duplicates[0].key).toBe('100|200|shelf_a');
    });

    test('finds multiple groups of duplicates', () => {
      const rows = [
        { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a' },
        { rangeStart: '100', rangeEnd: '200', svgCode: 'shelf_a' },
        { rangeStart: '200', rangeEnd: '300', svgCode: 'shelf_b' },
        { rangeStart: '200', rangeEnd: '300', svgCode: 'shelf_b' }
      ];
      const duplicates = findDuplicateRows(rows);
      expect(duplicates).toHaveLength(2);
    });
  });

  describe('parseRangeValue', () => {
    test('parses simple numeric values', () => {
      const result = parseRangeValue('100');
      expect(result.numeric).toBe(100);
      expect(result.prefix).toBe('');
    });

    test('parses Dewey decimals', () => {
      const result = parseRangeValue('292.5');
      expect(result.numeric).toBe(292.5);
      expect(result.prefix).toBe('');
    });

    test('parses Dewey with parentheses', () => {
      const result = parseRangeValue('396(44)');
      expect(result.numeric).toBeCloseTo(396.044, 3);
      expect(result.prefix).toBe('');
    });

    test('parses alphanumeric prefixes', () => {
      const result = parseRangeValue('ML001');
      expect(result.numeric).toBe(1);
      expect(result.prefix).toBe('ML');
    });

    test('parses prefix-only values', () => {
      const result = parseRangeValue('M1812');
      expect(result.numeric).toBe(1812);
      expect(result.prefix).toBe('M');
    });

    test('handles empty values', () => {
      const result = parseRangeValue('');
      expect(result.numeric).toBeNull();
      expect(result.prefix).toBe('');
    });

    test('handles null values', () => {
      const result = parseRangeValue(null);
      expect(result.numeric).toBeNull();
    });

    test('preserves original value', () => {
      const result = parseRangeValue('396(44)');
      expect(result.original).toBe('396(44)');
    });
  });

  describe('doRangesOverlap', () => {
    test('returns true for overlapping ranges', () => {
      const range1 = { start: '100', end: '200' };
      const range2 = { start: '150', end: '250' };
      expect(doRangesOverlap(range1, range2)).toBe(true);
    });

    test('returns true for contained ranges', () => {
      const range1 = { start: '100', end: '300' };
      const range2 = { start: '150', end: '200' };
      expect(doRangesOverlap(range1, range2)).toBe(true);
    });

    test('returns false for non-overlapping ranges', () => {
      const range1 = { start: '100', end: '200' };
      const range2 = { start: '300', end: '400' };
      expect(doRangesOverlap(range1, range2)).toBe(false);
    });

    test('returns true for adjacent ranges (touching)', () => {
      const range1 = { start: '100', end: '200' };
      const range2 = { start: '200', end: '300' };
      expect(doRangesOverlap(range1, range2)).toBe(true);
    });

    test('returns false for different prefixes', () => {
      const range1 = { start: 'ML001', end: 'ML100' };
      const range2 = { start: 'M001', end: 'M100' };
      expect(doRangesOverlap(range1, range2)).toBe(false);
    });

    test('handles Dewey decimals', () => {
      const range1 = { start: '292', end: '471.7' };
      const range2 = { start: '400', end: '500' };
      expect(doRangesOverlap(range1, range2)).toBe(true);
    });
  });

  describe('findOverlappingRanges', () => {
    test('returns empty array for no overlaps', () => {
      const rows = [
        { collectionName: 'A', floor: '1', rangeStart: '100', rangeEnd: '200' },
        { collectionName: 'A', floor: '1', rangeStart: '300', rangeEnd: '400' }
      ];
      expect(findOverlappingRanges(rows)).toEqual([]);
    });

    test('finds overlapping ranges in same collection and floor', () => {
      const rows = [
        { collectionName: 'A', floor: '1', rangeStart: '100', rangeEnd: '200' },
        { collectionName: 'A', floor: '1', rangeStart: '150', rangeEnd: '250' }
      ];
      const overlaps = findOverlappingRanges(rows);
      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].row1Index).toBe(0);
      expect(overlaps[0].row2Index).toBe(1);
    });

    test('does not flag overlaps in different collections', () => {
      const rows = [
        { collectionName: 'A', floor: '1', rangeStart: '100', rangeEnd: '200' },
        { collectionName: 'B', floor: '1', rangeStart: '150', rangeEnd: '250' }
      ];
      expect(findOverlappingRanges(rows)).toEqual([]);
    });

    test('does not flag overlaps on different floors', () => {
      const rows = [
        { collectionName: 'A', floor: '1', rangeStart: '100', rangeEnd: '200' },
        { collectionName: 'A', floor: '2', rangeStart: '150', rangeEnd: '250' }
      ];
      expect(findOverlappingRanges(rows)).toEqual([]);
    });

    test('is case-insensitive for collection names', () => {
      const rows = [
        { collectionName: 'Collection A', floor: '1', rangeStart: '100', rangeEnd: '200' },
        { collectionName: 'collection a', floor: '1', rangeStart: '150', rangeEnd: '250' }
      ];
      const overlaps = findOverlappingRanges(rows);
      expect(overlaps).toHaveLength(1);
    });
  });

  describe('createEmptyRow', () => {
    test('creates row with all columns', () => {
      const row = createEmptyRow();
      expect(Object.keys(row)).toHaveLength(14);
      for (const column of CSV_COLUMNS) {
        expect(row).toHaveProperty(column);
        expect(row[column]).toBe('');
      }
    });
  });

  describe('getMissingColumns', () => {
    test('returns empty array for complete row', () => {
      const row = createEmptyRow();
      expect(getMissingColumns(row)).toEqual([]);
    });

    test('returns missing columns', () => {
      const row = { libraryName: 'Test', collectionName: 'Test' };
      const missing = getMissingColumns(row);
      expect(missing).toContain('rangeStart');
      expect(missing).toContain('floor');
      expect(missing).not.toContain('libraryName');
    });
  });

  describe('getColumnLabel', () => {
    test('returns English label for en locale', () => {
      expect(getColumnLabel('libraryName', 'en')).toBe('Library Name');
    });

    test('returns Hebrew label for he locale', () => {
      expect(getColumnLabel('libraryName', 'he')).toBe('שם הספרייה');
    });

    test('returns column name for unknown column', () => {
      expect(getColumnLabel('unknownColumn', 'en')).toBe('unknownColumn');
    });

    test('defaults to English for missing locale', () => {
      expect(getColumnLabel('libraryName', 'fr')).toBe('Library Name');
    });
  });

  describe('getBilingualFieldPairs', () => {
    test('returns array of bilingual field pairs', () => {
      const pairs = getBilingualFieldPairs();
      expect(Array.isArray(pairs)).toBe(true);
      expect(pairs.length).toBeGreaterThan(0);
    });

    test('pairs have en and he properties', () => {
      const pairs = getBilingualFieldPairs();
      for (const pair of pairs) {
        expect(pair).toHaveProperty('en');
        expect(pair).toHaveProperty('he');
      }
    });

    test('includes libraryName pair', () => {
      const pairs = getBilingualFieldPairs();
      const libraryPair = pairs.find(p => p.en === 'libraryName');
      expect(libraryPair).toBeDefined();
      expect(libraryPair.he).toBe('libraryNameHe');
    });
  });
});
