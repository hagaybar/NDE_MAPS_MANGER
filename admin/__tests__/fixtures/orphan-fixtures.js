// Fixtures for sub-phase 2a tests. Two valid rows, four orphan rows
// covering both kinds (svgCode_not_on_floor + missing_svgCode) on both
// floors 1 and 2. Used by orphan-deriver.test.js, orphan-card.test.js,
// and orphan-panel.test.js.

export const VALID_FLOOR_1 = {
  id: 'row-001',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CL1', collectionNameHe: 'CL1',
  rangeStart: '010', rangeEnd: '184',
  svgCode: 'cl1_106_a', floor: '1',
  shelfLabel: '106 A', shelfLabelHe: '106 א',
};

export const VALID_FLOOR_2 = {
  id: 'row-002',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CY', collectionNameHe: 'CY',
  rangeStart: '892.439', rangeEnd: '892.498',
  svgCode: 'cy_29_a', floor: '2',
  shelfLabel: '29 A', shelfLabelHe: '29 א',
};

// Orphan: svgCode does not resolve on declared floor.
export const ORPHAN_BAD_SVGCODE_F1 = {
  id: 'row-101',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'KA', collectionNameHe: 'KA',
  rangeStart: '300', rangeEnd: '305',
  svgCode: 'ka1_61_z', floor: '1',
  shelfLabel: '61 Z', shelfLabelHe: '61 ז',
};

export const ORPHAN_BAD_SVGCODE_F2 = {
  id: 'row-102',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CY', collectionNameHe: 'CY',
  rangeStart: '296.012', rangeEnd: '892.493',
  svgCode: 'kb1_28_b', floor: '2',
  shelfLabel: '28 B', shelfLabelHe: '28 ב',
};

// Orphan: svgCode is empty.
export const ORPHAN_MISSING_SVGCODE_F1 = {
  id: 'row-103',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CC', collectionNameHe: 'CC',
  rangeStart: '500', rangeEnd: '510',
  svgCode: '', floor: '1',
  shelfLabel: '5-12', shelfLabelHe: '5-12',
};

export const ORPHAN_MISSING_SVGCODE_F2 = {
  id: 'row-104',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CHI', collectionNameHe: 'CHI',
  rangeStart: '800', rangeEnd: '850',
  svgCode: '', floor: '2',
  shelfLabel: '220 A', shelfLabelHe: '220 א',
};

// Convenience: all rows.
export const ALL_ROWS = [
  VALID_FLOOR_1,
  VALID_FLOOR_2,
  ORPHAN_BAD_SVGCODE_F1,
  ORPHAN_BAD_SVGCODE_F2,
  ORPHAN_MISSING_SVGCODE_F1,
  ORPHAN_MISSING_SVGCODE_F2,
];

// SVG-id sets: only the codes the VALID rows reference.
// Used to mock services/svg-parser.js in tests.
export const SVG_IDS_BY_FLOOR = {
  '0': new Set([]),
  '1': new Set(['cl1_106_a']),
  '2': new Set(['cy_29_a']),
};
