/**
 * Issue #100 — call-number ordering + range overlap.
 * Rule (owner-confirmed): plain string comparison, with ML/MT prefixes ordered
 * by the natural number after the prefix. Touching boundaries are not overlaps.
 */
import { describe, test, expect } from '@jest/globals';
import { compareCallNumbers, doRangesOverlap } from '../services/data-model.js';

const lt = (a, b) => expect(compareCallNumbers(a, b)).toBe(-1);
const gt = (a, b) => expect(compareCallNumbers(a, b)).toBe(1);
const eq = (a, b) => expect(compareCallNumbers(a, b)).toBe(0);

describe('compareCallNumbers (#100)', () => {
  test('plain Dewey by magnitude (zero-padded to 3 digits)', () => {
    lt('099.5', '100');
    lt('292', '471.7');
  });

  test('parenthetical sorts right after the base, before any decimal', () => {
    lt('396(44)', '396.04');   // owner-confirmed
    lt('396.04', '396.4');
    lt('396.4', '396.5');
    lt('320(5800)', '320.1');  // '(' < '.'
  });

  test('different-length parentheticals order digit-by-digit (the reported bug)', () => {
    lt('323.67(6761)', '323.67(73)');  // 6 < 7 at first differing digit
    gt('323.67(73)', '323.67(6761)');
    lt('323.67(73)', '323.7');
  });

  test('leading zeros are significant', () => {
    lt('320(044)', '320(44)');
    lt('320(044)', '320(1)');
  });

  test('double parentheticals compare digit-by-digit', () => {
    lt('327(47)(56)', '327(73)(47)');  // 4 < 7
  });

  test('a base sorts before its own parenthetical sub-classification', () => {
    lt('913', '913(32)');
  });

  test('equal values compare equal (a touching boundary)', () => {
    eq('471.7', '471.7');
  });

  test('ML / MT prefixes order by the natural number after the prefix', () => {
    lt('ML5', 'ML113');     // 5 < 113 (NOT string order, where "ML5" > "ML113")
    lt('ML5', 'ML10');
    lt('ML10', 'ML100');
    lt('ML100', 'ML234');
    lt('MT5', 'MT113');
  });

  test('Dewey (digit-leading) sorts before alpha-prefixed', () => {
    lt('471', 'ML5');
  });
});

describe('doRangesOverlap (#100)', () => {
  const ov = (s1, e1, s2, e2) => doRangesOverlap({ start: s1, end: e1 }, { start: s2, end: e2 });

  test('reported false positive (rows 171/172) does NOT overlap', () => {
    expect(ov('323.2', '323.67(6761)', '323.67(73)', '325.3(73)')).toBe(false);
  });

  test('genuine interior overlap is detected', () => {
    expect(ov('100', '200', '150', '250')).toBe(true);
    expect(ov('100', '300', '150', '200')).toBe(true);
  });

  test('a touching boundary is not an overlap', () => {
    expect(ov('100', '200', '200', '300')).toBe(false);
    expect(ov('292', '471.7', '471.7', '475')).toBe(false);
  });

  test('disjoint ranges do not overlap', () => {
    expect(ov('100', '200', '300', '400')).toBe(false);
  });

  test('a point range sitting INSIDE a wider range is a conflict', () => {
    expect(ov('305', '305', '302', '309')).toBe(true);   // both claim 305
    expect(ov('951.03', '951.03', '951', '951.22')).toBe(true);
  });

  test('a point range only TOUCHING a boundary is not a conflict', () => {
    expect(ov('305', '305', '305', '309')).toBe(false);  // shares only the endpoint 305
    expect(ov('309', '309', '302', '309')).toBe(false);
  });

  test('identical ranges (incl. identical points) are not a conflict', () => {
    expect(ov('905', '905', '905', '905')).toBe(false);
    expect(ov('100', '200', '100', '200')).toBe(false);
  });

  test('ML ranges: ML5–ML113 is a valid forward range and overlaps ML100–ML200', () => {
    expect(ov('ML5', 'ML113', 'ML100', 'ML200')).toBe(true);
    expect(ov('ML5', 'ML113', 'ML200', 'ML300')).toBe(false);
  });
});
