/**
 * Tests for parseCsvContent in lambda/range-validation.mjs.
 *
 * The naive `split(',')` it used initially mis-aligned columns whenever a
 * field contained a quoted comma (real production case: a `collectionName`
 * like `"Reference Department, entrance floor"`). This made the bundle
 * invariant validator see hundreds of phantom `shelf-not-found` errors and
 * blocked all saves when BUNDLE_INVARIANT_ENABLED was flipped on.
 */
import { describe, test, expect } from '@jest/globals';
import { parseCsvContent } from '../range-validation.mjs';

describe('parseCsvContent (lambda/range-validation.mjs)', () => {
  test('parses simple unquoted CSV correctly', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6';
    const { headers, rows } = parseCsvContent(csv);
    expect(headers).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
  });

  test('honors double-quoted fields containing commas (regression)', () => {
    // A row mirroring the real-world production row #0 that broke the
    // bundle invariant validator: `collectionName` has a literal comma.
    const csv =
      'libraryName,collectionName,svgCode,floor\n' +
      'Sourasky,"CB Bibliography Collection. Apply to the Reference Department, entrance floor",CB_0,0';
    const { rows } = parseCsvContent(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].libraryName).toBe('Sourasky');
    expect(rows[0].collectionName).toBe(
      'CB Bibliography Collection. Apply to the Reference Department, entrance floor'
    );
    expect(rows[0].svgCode).toBe('CB_0');
    expect(rows[0].floor).toBe('0');
  });

  test('honors escaped double-quotes inside a quoted field', () => {
    const csv = 'a,b\n"he said ""hi""",2';
    const { rows } = parseCsvContent(csv);
    expect(rows[0].a).toBe('he said "hi"');
    expect(rows[0].b).toBe('2');
  });

  test('returns empty result for empty input', () => {
    expect(parseCsvContent('')).toEqual({ headers: [], rows: [] });
  });

  test('skips blank lines', () => {
    const csv = 'a,b\n\n1,2\n\n';
    const { rows } = parseCsvContent(csv);
    expect(rows).toEqual([{ a: '1', b: '2' }]);
  });

  test('keeps trailing empty fields', () => {
    const csv = 'a,b,c\n1,,3';
    const { rows } = parseCsvContent(csv);
    expect(rows[0]).toEqual({ a: '1', b: '', c: '3' });
  });
});
