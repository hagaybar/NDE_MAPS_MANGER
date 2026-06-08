/**
 * @jest-environment jsdom
 *
 * #138: the Errors-dashboard parseCSV silently dropped any row whose field count
 * != header count (and used text.trim().split('\n'), leaving a stray '\r' in the
 * last field on CRLF input). The dashboard exists to surface broken rows, so it
 * must KEEP count-mismatched rows (fill missing columns, ignore extras), not hide
 * them.
 */

import { describe, test, expect } from '@jest/globals';
import { parseCSV } from '../components/errors-dashboard.js';

const HEADERS = 'a,b,c';

describe('errors-dashboard parseCSV (#138)', () => {
  test('keeps a row with FEWER fields than headers (fills missing with "")', () => {
    const rows = parseCSV(`${HEADERS}\n1,2,3\nX,Y`);
    expect(rows).toHaveLength(2); // before the fix the short row was dropped
    expect(rows[1]).toMatchObject({ a: 'X', b: 'Y', c: '' });
  });

  test('keeps a row with MORE fields than headers (ignores extras)', () => {
    const rows = parseCSV(`${HEADERS}\n1,2,3,4,5`);
    expect(rows).toHaveLength(1); // before the fix the long row was dropped
    expect(rows[0]).toMatchObject({ a: '1', b: '2', c: '3' });
  });

  test('handles CRLF without leaking a trailing \\r and drops the trailing blank line', () => {
    const rows = parseCSV(`${HEADERS}\r\n1,2,3\r\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0].c).toBe('3'); // before the fix: "3\r"
  });

  test('_index stays line-based (row at file data-line N has _index N-1)', () => {
    const rows = parseCSV(`${HEADERS}\n1,2,3\n4,5,6`);
    expect(rows[0]._index).toBe(0);
    expect(rows[1]._index).toBe(1);
  });
});
