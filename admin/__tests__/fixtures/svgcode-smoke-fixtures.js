// Smoke-test fixtures for E006 validation. Hand-curated: small, realistic,
// and covering the cases we know about from the live data investigation
// (issue #11) on 2026-05-10.

export const SMOKE_ROWS = [
  // Resolves: cl1_* matches floor_1.svg (post-#17)
  {
    libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
    collectionName: 'CL1', collectionNameHe: 'CL1',
    rangeStart: '010', rangeEnd: '184',
    svgCode: 'cl1_106_a', floor: '1',
    shelfLabel: '106 A', shelfLabelHe: '106 א',
  },
  // Does NOT resolve: ka1_61_a is in the SVG, but if a typo'd row pointed
  // at ka1_61_z it would not.
  {
    libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
    collectionName: 'KA', collectionNameHe: 'KA',
    rangeStart: '300', rangeEnd: '305',
    svgCode: 'ka1_61_z', floor: '1',
    shelfLabel: '61 Z', shelfLabelHe: '61 ז',
  },
  // Does NOT resolve: wrong floor — ka1_53_a exists on floor 1, not floor 2.
  {
    libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
    collectionName: 'KA', collectionNameHe: 'KA',
    rangeStart: '500', rangeEnd: '510',
    svgCode: 'ka1_53_a', floor: '2',
    shelfLabel: '53 A', shelfLabelHe: '53 א',
  },
  // Does NOT resolve: original CL bug pre-#17 (cl1_* in CSV, cl_* in SVG).
  // We simulate the OLD pre-fix state to prove the rule catches it.
  {
    libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
    collectionName: 'CL_OLD', collectionNameHe: 'CL_OLD',
    rangeStart: '600', rangeEnd: '610',
    svgCode: 'cl_106_a', floor: '1',
    shelfLabel: '106 OLD', shelfLabelHe: '106 ישן',
  },
];

// Synthetic SVG-id set: only the IDs the rows above legitimately point at.
// Keys are floor numbers (string), values are Sets of valid ids.
export const SMOKE_SVG_IDS = {
  '0': new Set([]),
  '1': new Set(['cl1_106_a', 'ka1_61_a', 'ka1_53_a']),
  '2': new Set(['cl2_89_a']),
};
