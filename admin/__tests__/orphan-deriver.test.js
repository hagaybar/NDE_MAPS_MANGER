import { jest } from '@jest/globals';
import {
  VALID_FLOOR_1, VALID_FLOOR_2,
  ORPHAN_BAD_SVGCODE_F1, ORPHAN_BAD_SVGCODE_F2,
  ORPHAN_MISSING_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F2,
  ALL_ROWS, SVG_IDS_BY_FLOOR,
} from './fixtures/orphan-fixtures.js';

describe('deriveOrphansForFloor', () => {
  let deriveOrphansForFloor;

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule('../services/svg-parser.js', () => ({
      isValidSvgCode: (code, floor) => {
        const ids = SVG_IDS_BY_FLOOR[String(floor)];
        return ids ? ids.has(code) : false;
      },
    }));
    ({ deriveOrphansForFloor } = await import('../components/map-editor/orphan-deriver.js'));
  });

  test('empty allRanges returns empty array', () => {
    expect(deriveOrphansForFloor([], '1')).toEqual([]);
  });

  test('all valid rows return empty array', () => {
    const result = deriveOrphansForFloor([VALID_FLOOR_1, VALID_FLOOR_2], '1');
    expect(result).toEqual([]);
  });

  test('one row with svgCode_not_on_floor produces one orphan card', () => {
    const result = deriveOrphansForFloor([VALID_FLOOR_1, ORPHAN_BAD_SVGCODE_F1], '1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rowId: 'row-101',
      kind: 'svgCode_not_on_floor',
      collectionName: 'KA',
      shelfLabel: '61 Z',
      svgCode: 'ka1_61_z',
    });
  });

  test('one row with missing_svgCode produces one orphan card', () => {
    const result = deriveOrphansForFloor([VALID_FLOOR_1, ORPHAN_MISSING_SVGCODE_F1], '1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rowId: 'row-103',
      kind: 'missing_svgCode',
      collectionName: 'CC',
      svgCode: '',
    });
  });

  test('mixed valid + invalid returns only invalid', () => {
    const result = deriveOrphansForFloor(ALL_ROWS, '1');
    expect(result.map(o => o.rowId).sort()).toEqual(['row-101', 'row-103']);
  });

  test('floor filtering: floor 2 orphans are not returned for floor 1', () => {
    const result = deriveOrphansForFloor(ALL_ROWS, '1');
    expect(result.map(o => o.rowId)).not.toContain('row-102');
    expect(result.map(o => o.rowId)).not.toContain('row-104');
  });

  test('floor filtering: floor 1 orphans are not returned for floor 2', () => {
    const result = deriveOrphansForFloor(ALL_ROWS, '2');
    expect(result.map(o => o.rowId)).not.toContain('row-101');
    expect(result.map(o => o.rowId)).not.toContain('row-103');
  });

  test('stable sort: same input produces same order', () => {
    const r1 = deriveOrphansForFloor(ALL_ROWS, '1');
    const r2 = deriveOrphansForFloor(ALL_ROWS, '1');
    expect(r1.map(o => o.rowId)).toEqual(r2.map(o => o.rowId));
  });

  test('sort by collectionName then shelfLabel', () => {
    const result = deriveOrphansForFloor(ALL_ROWS, '1');
    // CC comes before KA alphabetically → row-103 (CC) before row-101 (KA)
    expect(result.map(o => o.collectionName)).toEqual(['CC', 'KA']);
  });

  test('orphan card preserves Hebrew fields', () => {
    const result = deriveOrphansForFloor([ORPHAN_BAD_SVGCODE_F1], '1');
    expect(result[0]).toMatchObject({
      collectionNameHe: 'KA',
      shelfLabelHe: '61 ז',
    });
  });
});
