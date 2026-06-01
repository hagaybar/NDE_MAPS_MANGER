/**
 * Unit tests for Validation Service
 * Tests validation rules, error/warning handling, and field highlighting
 */

import {
  ValidationSeverity,
  validateRow,
  validateAllRows,
  hasValidationErrors,
  setSvgParser
} from '../components/validation.js';

describe('Validation Service', () => {
  beforeEach(() => {
    // Reset SVG parser
    setSvgParser(null);
  });

  describe('ValidationSeverity', () => {
    test('has ERROR and WARNING levels', () => {
      expect(ValidationSeverity.ERROR).toBe('error');
      expect(ValidationSeverity.WARNING).toBe('warning');
    });
  });

  describe('validateRow', () => {
    test('returns errors for missing required fields', () => {
      const row = {};
      const result = validateRow(row);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'libraryName')).toBe(true);
      expect(result.errors.some(e => e.field === 'rangeStart')).toBe(true);
      expect(result.errors.some(e => e.field === 'floor')).toBe(true);
    });

    test('returns no errors for valid row', () => {
      const row = {
        libraryName: 'Test Library',
        libraryNameHe: 'ספרייה',
        collectionName: 'Test Collection',
        collectionNameHe: 'אוסף',
        rangeStart: '100',
        rangeEnd: '200',
        svgCode: 'shelf_a',
        floor: '1'
      };
      const result = validateRow(row);

      expect(result.errors).toHaveLength(0);
    });

    test('validates Dewey format with parentheses', () => {
      const row = {
        libraryName: 'Test',
        libraryNameHe: 'Test',
        collectionName: 'Test',
        collectionNameHe: 'Test',
        rangeStart: '396(44)',
        rangeEnd: '400',
        svgCode: 'shelf_a',
        floor: '1'
      };
      const result = validateRow(row);

      // Should not have format error for rangeStart
      const formatErrors = result.errors.filter(
        e => e.field === 'rangeStart' && e.message.includes('format')
      );
      expect(formatErrors).toHaveLength(0);
    });

    test('validates alphanumeric range format', () => {
      const row = {
        libraryName: 'Test',
        libraryNameHe: 'Test',
        collectionName: 'Test',
        collectionNameHe: 'Test',
        rangeStart: 'ML001',
        rangeEnd: 'ML100',
        svgCode: 'shelf_a',
        floor: '1'
      };
      const result = validateRow(row);

      // Should not have format errors
      const formatErrors = result.errors.filter(
        e => (e.field === 'rangeStart' || e.field === 'rangeEnd') &&
             e.message.includes('format')
      );
      expect(formatErrors).toHaveLength(0);
    });

    test('accepts real call-number formats: double-parens + alpha-with-decimal (#106)', () => {
      const valid = [
        '327(47)(56)', '327(73)(47)', '382.1(54)(47)', '382.1(56)(5694)',  // double parens
        'E990.4', 'E114.5', 'ML336.5', 'ML336.7',                          // alpha + decimal
        '396(44)', '323.67', 'ML5', 'M1812', '100'                         // already-valid baselines
      ];
      for (const v of valid) {
        const result = validateRow({
          libraryName: 'T', libraryNameHe: 'T', collectionName: 'T', collectionNameHe: 'T',
          rangeStart: v, rangeEnd: v, svgCode: 'shelf_a', floor: '1'
        });
        const fmt = result.errors.filter(
          e => (e.field === 'rangeStart' || e.field === 'rangeEnd') && e.message.toLowerCase().includes('format')
        );
        expect({ value: v, formatErrors: fmt.length }).toEqual({ value: v, formatErrors: 0 });
      }
    });

    test('rejects malformed range values incl. pure-letters with no number (#106)', () => {
      const invalid = ['ML', 'abc', '12.3.4xyz', '(44)', '396((44))'];
      for (const v of invalid) {
        const result = validateRow({
          libraryName: 'T', libraryNameHe: 'T', collectionName: 'T', collectionNameHe: 'T',
          rangeStart: v, rangeEnd: '500', svgCode: 'shelf_a', floor: '1'
        });
        const fmt = result.errors.filter(
          e => e.field === 'rangeStart' && e.message.toLowerCase().includes('format')
        );
        expect({ value: v, flagged: fmt.length > 0 }).toEqual({ value: v, flagged: true });
      }
    });

    test('validates floor values', () => {
      const row = {
        libraryName: 'Test',
        libraryNameHe: 'Test',
        collectionName: 'Test',
        collectionNameHe: 'Test',
        rangeStart: '100',
        rangeEnd: '200',
        svgCode: 'shelf_a',
        floor: '5' // Invalid floor
      };
      const result = validateRow(row);

      expect(result.errors.some(e => e.field === 'floor')).toBe(true);
    });

    test('validates range order', () => {
      const row = {
        libraryName: 'Test',
        libraryNameHe: 'Test',
        collectionName: 'Test',
        collectionNameHe: 'Test',
        rangeStart: '300',
        rangeEnd: '100', // End before start
        svgCode: 'shelf_a',
        floor: '1'
      };
      const result = validateRow(row);

      expect(result.errors.some(e => e.field === 'rangeStart')).toBe(true);
    });

    test('detects duplicate keys', () => {
      const allRows = [
        {
          libraryName: 'Test',
          libraryNameHe: 'Test',
          collectionName: 'Test',
          collectionNameHe: 'Test',
          rangeStart: '100',
          rangeEnd: '200',
          svgCode: 'shelf_a',
          floor: '1'
        },
        {
          libraryName: 'Test2',
          libraryNameHe: 'Test2',
          collectionName: 'Test',      // same collection as row 0 — identity includes collection (#9)
          collectionNameHe: 'Test',
          rangeStart: '100',
          rangeEnd: '200',
          svgCode: 'shelf_a', // Same key as first row (collection|start|end|svgCode)
          floor: '1'
        }
      ];

      const result = validateRow(allRows[1], {
        allRows,
        rowIndex: 1,
        checkDuplicates: true
      });

      expect(result.errors.some(e => e.field === 'svgCode')).toBe(true);
    });

    test('detects range overlaps', () => {
      const allRows = [
        {
          libraryName: 'Test',
          libraryNameHe: 'Test',
          collectionName: 'Same Collection',
          collectionNameHe: 'Test',
          rangeStart: '100',
          rangeEnd: '200',
          svgCode: 'shelf_a',
          floor: '1'
        },
        {
          libraryName: 'Test2',
          libraryNameHe: 'Test2',
          collectionName: 'Same Collection',
          collectionNameHe: 'Test2',
          rangeStart: '150',
          rangeEnd: '250',
          svgCode: 'shelf_b',
          floor: '1'
        }
      ];

      const result = validateRow(allRows[1], {
        allRows,
        rowIndex: 1,
        checkOverlaps: true
      });

      expect(result.warnings.some(w => w.field === 'rangeStart')).toBe(true);
    });

    test('validates SVG code against parser when available', () => {
      let calledWith = null;
      const mockParser = {
        isValidSvgCode: (code, floor) => {
          calledWith = { code, floor };
          return false;
        }
      };
      setSvgParser(mockParser);

      const row = {
        libraryName: 'Test',
        libraryNameHe: 'Test',
        collectionName: 'Test',
        collectionNameHe: 'Test',
        rangeStart: '100',
        rangeEnd: '200',
        svgCode: 'invalid_code',
        floor: '1'
      };
      const result = validateRow(row, { checkSvgCodes: true });

      expect(calledWith.code).toBe('invalid_code');
      expect(calledWith.floor).toBe('1');
      expect(result.warnings.some(w => w.field === 'svgCode')).toBe(true);
    });
  });

  describe('validateAllRows', () => {
    test('validates multiple rows', () => {
      const rows = [
        { libraryName: '', floor: '1' }, // Missing required fields
        {
          libraryName: 'Test',
          libraryNameHe: 'Test',
          collectionName: 'Test',
          collectionNameHe: 'Test',
          rangeStart: '100',
          rangeEnd: '200',
          svgCode: 'shelf_a',
          floor: '1'
        }
      ];

      const results = validateAllRows(rows);

      // First row should have errors
      expect(results.some(r => r.rowIndex === 0)).toBe(true);
      // Second row should be valid
      const secondRowResult = results.find(r => r.rowIndex === 1);
      if (secondRowResult) {
        expect(secondRowResult.errors).toHaveLength(0);
      }
    });

    test('returns empty array for all valid rows', () => {
      const rows = [
        {
          libraryName: 'Test1',
          libraryNameHe: 'Test1',
          collectionName: 'Test1',
          collectionNameHe: 'Test1',
          rangeStart: '100',
          rangeEnd: '200',
          svgCode: 'shelf_a',
          floor: '1'
        },
        {
          libraryName: 'Test2',
          libraryNameHe: 'Test2',
          collectionName: 'Test2',
          collectionNameHe: 'Test2',
          rangeStart: '300',
          rangeEnd: '400',
          svgCode: 'shelf_b',
          floor: '2'
        }
      ];

      const results = validateAllRows(rows);
      const errorResults = results.filter(r => r.errors.length > 0);

      expect(errorResults).toHaveLength(0);
    });
  });

  describe('hasValidationErrors', () => {
    test('returns true when rows have errors', () => {
      const rows = [
        { libraryName: '', floor: '1' } // Missing required fields
      ];

      expect(hasValidationErrors(rows)).toBe(true);
    });

    test('returns false when all rows are valid', () => {
      const rows = [
        {
          libraryName: 'Test',
          libraryNameHe: 'Test',
          collectionName: 'Test',
          collectionNameHe: 'Test',
          rangeStart: '100',
          rangeEnd: '200',
          svgCode: 'shelf_a',
          floor: '1'
        }
      ];

      expect(hasValidationErrors(rows)).toBe(false);
    });
  });
});
