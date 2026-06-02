// admin/__tests__/overlap-clusters.test.js
/** @jest-environment node */
import { jest } from '@jest/globals';

// Stub data-model.findOverlappingRanges so the engine is tested in isolation.
let PAIRS = [];
jest.unstable_mockModule('../services/data-model.js', () => ({
  findOverlappingRanges: () => PAIRS,
}));
const { buildOverlapClusters, ROOT_CAUSE_MIN_BLAST } =
  await import('../components/errors-dashboard/overlap-clusters.js');

// Helper: rows indexed 0..N; only identity matters for these tests.
const rows = Array.from({ length: 12 }, (_, i) => ({ _index: i, collectionName: 'C', floor: '2' }));

afterEach(() => { PAIRS = []; });

test('one giant range over N small ranges => 1 cluster, hub = giant, blast = N', () => {
  // Row 5 overlaps rows 1,2,3 (a star). findOverlappingRanges emits each pair once.
  PAIRS = [
    { row1Index: 1, row2Index: 5, collection: 'C', floor: '2' },
    { row1Index: 2, row2Index: 5, collection: 'C', floor: '2' },
    { row1Index: 3, row2Index: 5, collection: 'C', floor: '2' },
  ];
  const { clusters, otherOverlaps } = buildOverlapClusters(rows);
  expect(clusters).toHaveLength(1);
  expect(clusters[0].hubRowIndex).toBe(5);
  expect(clusters[0].blastRadius).toBe(3);
  expect(clusters[0].affected.map(a => a.rowIndex)).toEqual([1, 2, 3]);
  expect(otherOverlaps).toHaveLength(0);
});

test('two independent simple pairs => no clusters, both pairs in otherOverlaps', () => {
  PAIRS = [
    { row1Index: 1, row2Index: 2, collection: 'C', floor: '2' },
    { row1Index: 7, row2Index: 8, collection: 'C', floor: '2' },
  ];
  const { clusters, otherOverlaps } = buildOverlapClusters(rows);
  expect(clusters).toHaveLength(0);
  expect(otherOverlaps).toHaveLength(2);
});

test('chain A-B-C (B overlaps both) => hub = B, affected = [A, C]', () => {
  PAIRS = [
    { row1Index: 1, row2Index: 2, collection: 'C', floor: '2' }, // A-B
    { row1Index: 2, row2Index: 3, collection: 'C', floor: '2' }, // B-C
  ];
  const { clusters } = buildOverlapClusters(rows);
  expect(clusters).toHaveLength(1);
  expect(clusters[0].hubRowIndex).toBe(2);
  expect(clusters[0].affected.map(a => a.rowIndex)).toEqual([1, 3]);
});

test('hubs sorted by blast radius desc, tie broken by row index asc', () => {
  // Row 9 overlaps 1,2,3 (blast 3); Row 4 overlaps 5,6 (blast 2).
  PAIRS = [
    { row1Index: 1, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 2, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 3, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 5, row2Index: 4, collection: 'C', floor: '2' },
    { row1Index: 6, row2Index: 4, collection: 'C', floor: '2' },
  ];
  const { clusters } = buildOverlapClusters(rows);
  expect(clusters.map(c => c.hubRowIndex)).toEqual([9, 4]);
});

test('two overlapping hubs are not nested under each other; no row listed twice', () => {
  // Rows 4 and 9 are both hubs and also overlap each other.
  PAIRS = [
    { row1Index: 1, row2Index: 4, collection: 'C', floor: '2' },
    { row1Index: 2, row2Index: 4, collection: 'C', floor: '2' },
    { row1Index: 6, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 7, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 4, row2Index: 9, collection: 'C', floor: '2' }, // hub-hub edge
  ];
  const { clusters } = buildOverlapClusters(rows);
  const hubIndexes = clusters.map(c => c.hubRowIndex).sort((a, b) => a - b);
  expect(hubIndexes).toEqual([4, 9]);
  // No hub appears as another hub's affected child.
  const allAffected = clusters.flatMap(c => c.affected.map(a => a.rowIndex));
  expect(allAffected).not.toContain(4);
  expect(allAffected).not.toContain(9);
  // No affected row listed under two hubs.
  expect(new Set(allAffected).size).toBe(allAffected.length);
});

test('ROOT_CAUSE_MIN_BLAST is 2', () => {
  expect(ROOT_CAUSE_MIN_BLAST).toBe(2);
});
