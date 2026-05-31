/**
 * Issue #100 — server-side call-number ordering must stay in parity with
 * admin/utils/range-filter.js (same rule: string compare + ML/MT natural number).
 */
import { describe, test, expect } from '@jest/globals';
import { compareCallNumbers, doCallNumberRangesOverlap } from '../range-validation.mjs';

describe('lambda compareCallNumbers (#100 parity)', () => {
  test('matches the canonical rule', () => {
    expect(compareCallNumbers('396(44)', '396.04')).toBe(-1);
    expect(compareCallNumbers('323.67(6761)', '323.67(73)')).toBe(-1);
    expect(compareCallNumbers('320(044)', '320(44)')).toBe(-1);
    expect(compareCallNumbers('913', '913(32)')).toBe(-1);
    expect(compareCallNumbers('ML5', 'ML113')).toBe(-1);
    expect(compareCallNumbers('471', 'ML5')).toBe(-1);
    expect(compareCallNumbers('471.7', '471.7')).toBe(0);
  });

  test('access-control overlap (inclusive): reported pair does not overlap', () => {
    expect(doCallNumberRangesOverlap(
      { start: '323.2', end: '323.67(6761)' },
      { start: '323.67(73)', end: '325.3(73)' }
    )).toBe(false);
  });
});
