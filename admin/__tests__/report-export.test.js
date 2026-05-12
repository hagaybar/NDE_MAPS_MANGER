/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

describe('report-export', () => {
  let buildReportRows, toCsv, escapeCsvField, reportFilename;

  beforeEach(async () => {
    jest.resetModules();
    ({ buildReportRows, toCsv, escapeCsvField, reportFilename } = await import(
      '../components/errors-dashboard/report-export.js'
    ));
  });

  describe('buildReportRows', () => {
    it('maps every column for a single error issue', () => {
      const issue = {
        type: 'error',
        rowIndex: 0,
        row: {
          floor: '1',
          libraryName: 'Central',
          collectionName: 'Yiddish',
          shelfLabel: 'A-1',
          svgCode: 'ka1_01_a',
          rangeStart: 'A 100',
          rangeEnd: 'A 200',
        },
        category: 'svgCode',
        code: 'E006',
        field: 'svgCode',
        message: 'svgCode does not resolve on floor 1',
      };
      const rows = buildReportRows([issue]);
      expect(rows).toEqual([{
        floor: '1',
        libraryName: 'Central',
        collectionName: 'Yiddish',
        shelfLabel: 'A-1',
        svgCode: 'ka1_01_a',
        rangeStart: 'A 100',
        rangeEnd: 'A 200',
        csvRowIndex: 2,
        category: 'svgCode',
        code: 'E006',
        severity: 'error',
        field: 'svgCode',
        message: 'svgCode does not resolve on floor 1',
      }]);
    });

    it('maps a warning issue with severity = "warning"', () => {
      const issue = {
        type: 'warning',
        rowIndex: 5,
        row: { floor: '2', libraryName: '', collectionName: 'CY', shelfLabel: '', svgCode: 'kb2_46_b', rangeStart: '', rangeEnd: '' },
        category: 'overlap',
        code: 'W001',
        field: '',
        message: 'Overlaps with row 6',
      };
      const rows = buildReportRows([issue]);
      expect(rows[0].severity).toBe('warning');
      expect(rows[0].csvRowIndex).toBe(7);
    });

    it('converts null/undefined fields to empty strings', () => {
      const issue = {
        type: 'error',
        rowIndex: 0,
        row: { floor: null, libraryName: undefined, collectionName: null, shelfLabel: undefined, svgCode: null, rangeStart: null, rangeEnd: null },
        category: 'required',
        code: 'E001',
        field: null,
        message: null,
      };
      const rows = buildReportRows([issue]);
      expect(rows[0]).toEqual({
        floor: '', libraryName: '', collectionName: '', shelfLabel: '', svgCode: '', rangeStart: '', rangeEnd: '',
        csvRowIndex: 2, category: 'required', code: 'E001', severity: 'error', field: '', message: '',
      });
    });

    it('returns an empty array for empty input', () => {
      expect(buildReportRows([])).toEqual([]);
    });
  });

  describe('escapeCsvField', () => {
    it('returns plain strings unchanged', () => {
      expect(escapeCsvField('hello')).toBe('hello');
    });

    it('quotes values containing comma', () => {
      expect(escapeCsvField('a,b')).toBe('"a,b"');
    });

    it('doubles inner quotes and wraps in outer quotes', () => {
      expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('quotes values containing newline', () => {
      expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('quotes values containing carriage return', () => {
      expect(escapeCsvField('line1\rline2')).toBe('"line1\rline2"');
    });

    it('stringifies non-strings', () => {
      expect(escapeCsvField(42)).toBe('42');
    });
  });

  describe('toCsv', () => {
    it('produces just the header row for empty input', () => {
      expect(toCsv([])).toBe(
        'floor,libraryName,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd,csvRowIndex,category,code,severity,field,message'
      );
    });

    it('produces header + data row in column order', () => {
      const row = {
        floor: '1', libraryName: 'Central', collectionName: 'Yiddish', shelfLabel: 'A-1',
        svgCode: 'ka1_01_a', rangeStart: 'A 100', rangeEnd: 'A 200', csvRowIndex: 2,
        category: 'svgCode', code: 'E006', severity: 'error', field: 'svgCode',
        message: 'bad code',
      };
      const csv = toCsv([row]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('floor,libraryName,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd,csvRowIndex,category,code,severity,field,message');
      expect(lines[1]).toBe('1,Central,Yiddish,A-1,ka1_01_a,A 100,A 200,2,svgCode,E006,error,svgCode,bad code');
    });

    it('escapes special characters per CSV rules', () => {
      const row = {
        floor: '1', libraryName: 'Central, Main', collectionName: '',
        shelfLabel: 'A "Special" Shelf', svgCode: '', rangeStart: '', rangeEnd: '',
        csvRowIndex: 2, category: 'format', code: 'W002', severity: 'warning', field: '',
        message: 'multi\nline',
      };
      const csv = toCsv([row]);
      const dataLine = csv.split('\n').slice(1).join('\n');
      expect(dataLine).toContain('"Central, Main"');
      expect(dataLine).toContain('"A ""Special"" Shelf"');
      expect(dataLine).toContain('"multi\nline"');
    });
  });

  describe('reportFilename', () => {
    it('formats as errors-report-YYYY-MM-DD.csv using UTC', () => {
      const fixed = new Date('2026-05-12T23:59:59Z');
      expect(reportFilename(fixed)).toBe('errors-report-2026-05-12.csv');
    });

    it('uses the current date when no argument is passed', () => {
      const name = reportFilename();
      expect(name).toMatch(/^errors-report-\d{4}-\d{2}-\d{2}\.csv$/);
    });
  });
});
