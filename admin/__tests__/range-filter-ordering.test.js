/**
 * Issue #100 — the editor range ACCESS-CONTROL path (range-filter.js).
 * Same call-number ordering rule; overlap here is INCLUSIVE (touching counts).
 * Behaviorally parity with lambda/range-validation.mjs.
 */
import { describe, test, expect } from '@jest/globals';
import { compareCallNumbers, isCallNumberInRange, doCallNumberRangesOverlap } from '../utils/range-filter.js';

describe('range-filter compareCallNumbers (#100)', () => {
  test('parenthetical + different-length + leading zeros + ML', () => {
    expect(compareCallNumbers('396(44)', '396.04')).toBe(-1);
    expect(compareCallNumbers('323.67(6761)', '323.67(73)')).toBe(-1);
    expect(compareCallNumbers('320(044)', '320(44)')).toBe(-1);
    expect(compareCallNumbers('ML5', 'ML113')).toBe(-1);   // natural number, not string
  });
});

describe('isCallNumberInRange (access-control containment)', () => {
  test('uses the corrected ordering', () => {
    expect(isCallNumberInRange('323.67(70)', '323.2', '323.67(73)')).toBe(true);   // 70 < 73 → inside
    expect(isCallNumberInRange('323.67(6761)', '323.67(73)', '325.3(73)')).toBe(false); // before start
    expect(isCallNumberInRange('ML50', 'ML5', 'ML113')).toBe(true);                // 5 <= 50 <= 113
    expect(isCallNumberInRange('ML200', 'ML5', 'ML113')).toBe(false);
  });
});

describe('doCallNumberRangesOverlap (inclusive)', () => {
  test('reported pair does not overlap (gap between (6761) and (73))', () => {
    expect(doCallNumberRangesOverlap(
      { start: '323.2', end: '323.67(6761)' },
      { start: '323.67(73)', end: '325.3(73)' }
    )).toBe(false);
  });
  test('touching boundary counts as overlap here (inclusive access-control semantics)', () => {
    expect(doCallNumberRangesOverlap({ start: '100', end: '200' }, { start: '200', end: '300' })).toBe(true);
  });
});
