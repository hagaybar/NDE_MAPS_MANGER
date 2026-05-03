import {
  overlapsConflict,
  validateRangeShape,
  computeFloorConflicts,
} from '../components/map-editor/range-validation.js';

const r = (libraryName, floor, collectionName, start, end) =>
  ({ libraryName, floor, collectionName, rangeStart: start, rangeEnd: end });

describe('overlapsConflict — integer-touch positives', () => {
  test('A 100-105 + B 105-110: integer touch is OK', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '105'),
      r('Cen', '1', 'Soc', '105', '110'),
    )).toBe(false);
  });
});

describe('overlapsConflict — canonical positives (no conflict)', () => {
  test('A 105-106 + B 106-106 + C 106-107: integer touches between three shelves', () => {
    const A = r('Cen', '1', 'Soc', '105', '106');
    const B = r('Cen', '1', 'Soc', '106', '106');
    const C = r('Cen', '1', 'Soc', '106', '107');
    expect(overlapsConflict(A, B)).toBe(false);
    expect(overlapsConflict(B, C)).toBe(false);
    expect(overlapsConflict(A, C)).toBe(false);
  });

  test('A 105-106 + B 107-108: disjoint', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '105', '106'),
      r('Cen', '1', 'Soc', '107', '108'),
    )).toBe(false);
  });

  test('A 100-105.5 + B 105.5-110: fractional touch at the same point is OK', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '105.5'),
      r('Cen', '1', 'Soc', '105.5', '110'),
    )).toBe(false);
  });

  test('A 292-471.7 + B 471.7-475: real-data fractional abutment is OK', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '292', '471.7'),
      r('Cen', '1', 'Soc', '471.7', '475'),
    )).toBe(false);
  });
});

describe('overlapsConflict — canonical conflicts', () => {
  test('A 100-123.45 + B 123.41-124: interior overlap [123.41, 123.45]', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '123.45'),
      r('Cen', '1', 'Soc', '123.41', '124'),
    )).toBe(true);
  });

  test('A 105-106 + B 105.93-106: fractional encroachment', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '105', '106'),
      r('Cen', '1', 'Soc', '105.93', '106'),
    )).toBe(true);
  });

  test('D 190-195 + G 194-194.72: interior point', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '190', '195'),
      r('Cen', '1', 'Soc', '194', '194.72'),
    )).toBe(true);
  });
});

describe('overlapsConflict — classification prefixes', () => {
  test('LC ML range and Dewey range with overlapping numerics do not conflict (real data: 87 B ML455-ML1700 vs 49 B 813.54-818.3)', () => {
    expect(overlapsConflict(
      r('Sourasky', '2', 'Reading room 2 B - 2nd floor', 'ML455', 'ML1700'),
      r('Sourasky', '2', 'Reading room 2 B - 2nd floor', '813.54', '818.3'),
    )).toBe(false);
  });

  test('Different LC classes (ML vs MA) do not conflict even when numerics overlap', () => {
    expect(overlapsConflict(
      r('Cen', '2', 'Soc', 'ML100', 'ML500'),
      r('Cen', '2', 'Soc', 'MA200', 'MA400'),
    )).toBe(false);
  });

  test('Same LC class with interior numeric overlap does conflict', () => {
    expect(overlapsConflict(
      r('Cen', '2', 'Soc', 'ML100', 'ML500'),
      r('Cen', '2', 'Soc', 'ML400', 'ML600'),
    )).toBe(true);
  });

  test('Same LC class with boundary touch does not conflict', () => {
    expect(overlapsConflict(
      r('Cen', '2', 'Soc', 'ML100', 'ML500'),
      r('Cen', '2', 'Soc', 'ML500', 'ML600'),
    )).toBe(false);
  });
});

describe('overlapsConflict — grouping', () => {
  test('Different libraries do not conflict', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '110'),
      r('Law', '1', 'Soc', '100', '110'),
    )).toBe(false);
  });

  test('Different floors do not conflict', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '110'),
      r('Cen', '2', 'Soc', '100', '110'),
    )).toBe(false);
  });

  test('Different collections do not conflict', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '110'),
      r('Cen', '1', 'Phil', '100', '110'),
    )).toBe(false);
  });
});

describe('validateRangeShape', () => {
  test('start > end → error', () => {
    expect(validateRangeShape({ rangeStart: '110', rangeEnd: '100' }))
      .toEqual({ ok: false, error: 'start > end' });
  });
  test('valid range → ok', () => {
    expect(validateRangeShape({ rangeStart: '100', rangeEnd: '110' }))
      .toEqual({ ok: true });
  });
  test('non-numeric → invalid format', () => {
    expect(validateRangeShape({ rangeStart: 'abc', rangeEnd: '100' }))
      .toEqual({ ok: false, error: 'invalid format' });
  });
});

describe('computeFloorConflicts', () => {
  test('returns symmetric entries for both halves of a conflicting pair', () => {
    const ranges = [
      { id: '1', libraryName: 'Cen', floor: '1', collectionName: 'Soc', rangeStart: '100', rangeEnd: '123.45', svgCode: 'A' },
      { id: '2', libraryName: 'Cen', floor: '1', collectionName: 'Soc', rangeStart: '123.41', rangeEnd: '124', svgCode: 'B' },
    ];
    const c = computeFloorConflicts(ranges);
    expect(c.get('1')).toHaveLength(1);
    expect(c.get('2')).toHaveLength(1);
    expect(c.get('1')[0].otherId).toBe('2');
    expect(c.get('2')[0].otherId).toBe('1');
  });

  test('disjoint group → empty map', () => {
    const ranges = [
      { id: '1', libraryName: 'Cen', floor: '1', collectionName: 'Soc', rangeStart: '100', rangeEnd: '105' },
      { id: '2', libraryName: 'Cen', floor: '1', collectionName: 'Soc', rangeStart: '105', rangeEnd: '110' },
    ];
    expect(computeFloorConflicts(ranges).size).toBe(0);
  });
});
