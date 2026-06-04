/**
 * @jest-environment jsdom
 *
 * #95: the CSV-parser parity rule (CLAUDE.md) says the admin parser and the
 * Lambda parser must stay behaviorally equivalent, but only the server side had
 * a test. This guards the CLIENT side by running the admin `parseCSV` and the
 * Lambda `parseCsvContent` over the same fixtures and asserting identical rows —
 * the boundary that actually prevents the #48 quoted-comma column-shift class.
 *
 * (The line parsers trim at different stages — admin in parseCSVLine, Lambda in
 * parseCsvContent — but that nets out at the content level, which is what this
 * asserts.)
 */
import { jest } from '@jest/globals';
import { parseCsvContent } from '../../lambda/range-validation.mjs';

// csv-editor.js pulls a wide import graph; stub data-model + fetch so it loads
// (mirrors admin/__tests__/csv-editor-broken-refs.test.js).
global.fetch = jest.fn().mockResolvedValue({
  ok: true, status: 200, text: () => Promise.resolve('floor,svgCode\n'), json: () => Promise.resolve({}),
});
jest.unstable_mockModule('../services/data-model.js', () => ({
  getBrokenRefs: jest.fn().mockReturnValue([]),
  FLOOR_VALUES: ['0', '1', '2'], REQUIRED_FIELDS: [], VALIDATION_ERRORS: {}, VALIDATION_WARNINGS: {}, VALIDATION_RULES: {},
  validateRow: jest.fn().mockReturnValue({ errors: [], warnings: [] }),
  getRowKey: jest.fn().mockReturnValue(''),
  parseRangeValue: jest.fn().mockReturnValue(null), parseRangeBoundary: jest.fn().mockReturnValue(null),
  compareCallNumbers: jest.fn((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  doRangesOverlap: jest.fn().mockReturnValue(false), findOverlappingRanges: jest.fn().mockReturnValue([]),
  loadCsv: jest.fn().mockResolvedValue({ rows: [], svgShelfIdsByFloor: {} }),
}));

const { parseCSV, parseCSVLine } = await import('../components/csv-editor.js');

// Same classes the server test (range-validation-parser.test.mjs) exercises,
// plus whitespace-after-comma and CRLF.
const FIXTURES = {
  'simple unquoted': 'a,b,c\n1,2,3\n4,5,6',
  '#48 quoted comma in a field': 'libraryName,collectionName,svgCode,floor\nSourasky,"CB Bibliography. Apply to the Reference Department, entrance floor",CB_0,0',
  'escaped double-quotes': 'a,b\n"he said ""hi""",2',
  'trailing empty field': 'a,b,c\n1,,3',
  'whitespace after comma': 'a,b\n1, 2',
  'CRLF line endings': 'a,b\r\n1,2\r\n',
  'blank lines': 'a,b\n\n1,2\n\n',
};

describe('CSV parser client↔server parity (#95)', () => {
  for (const [name, csv] of Object.entries(FIXTURES)) {
    test(`admin parseCSV matches Lambda parseCsvContent — ${name}`, () => {
      expect(parseCSV(csv)).toEqual(parseCsvContent(csv).rows);
    });
  }

  // The #48 failure mode at the line level: a quoted comma stays one field.
  test('parseCSVLine keeps a quoted comma inside one field (no column shift)', () => {
    expect(parseCSVLine('Sourasky,"Ref Dept, entrance",CB_0,0'))
      .toEqual(['Sourasky', 'Ref Dept, entrance', 'CB_0', '0']);
  });
});
