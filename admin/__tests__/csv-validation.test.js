/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { validateDataset } from '../services/csv-validation.js';

// Minimal valid row factory (all required fields present, legal floor/range).
function row(overrides = {}) {
  return {
    libraryName: 'TAU', libraryNameHe: 'תל אביב',
    collectionName: 'Stacks', collectionNameHe: 'מאגר',
    rangeStart: '000', rangeEnd: '099',
    svgCode: 'CB_0', description: 'd', descriptionHe: 'ד',
    floor: '0', shelfLabel: '', shelfLabelHe: '', notes: '', notesHe: '',
    ...overrides,
  };
}

// Shelf sets: CB_0 exists on floor 0; floor 1 has CC_1; floor 2 empty.
const SHELVES = { 0: new Set(['CB_0']), 1: new Set(['CC_1']), 2: new Set() };

describe('validateDataset', () => {
  test('a fully valid file has no blocking problems', () => {
    const res = validateDataset([row()], SHELVES);
    expect(res.hasBlocking).toBe(false);
    expect(res.blockingCount).toBe(0);
    expect(res.blockingRowIndexes).toEqual([]);
  });

  test('an empty required field (floor) blocks (E001)', () => {
    const res = validateDataset([row({ floor: '' })], SHELVES);
    expect(res.hasBlocking).toBe(true);
    expect(res.blockingRowIndexes).toEqual([0]);
    const p = res.problemsByRow.get(0);
    expect(p.errors.some(e => e.code === 'E001' && e.field === 'floor')).toBe(true);
  });

  test('an illegal floor blocks (E003)', () => {
    const res = validateDataset([row({ floor: '3' })], SHELVES);
    expect(res.blockingRowIndexes).toEqual([0]);
    expect(res.problemsByRow.get(0).errors.some(e => e.code === 'E003')).toBe(true);
  });

  test('start>end blocks (E002)', () => {
    const res = validateDataset([row({ rangeStart: '500', rangeEnd: '100' })], SHELVES);
    expect(res.problemsByRow.get(0).errors.some(e => e.code === 'E002')).toBe(true);
    expect(res.hasBlocking).toBe(true);
  });

  test('an svgCode not on its floor blocks (E006) deterministically from the shelf sets', () => {
    // CB_0 is a floor-0 shelf; declaring it on floor 1 must be a blocking E006.
    const res = validateDataset([row({ floor: '1', svgCode: 'CB_0' })], SHELVES);
    expect(res.problemsByRow.get(0).errors.some(e => e.code === 'E006')).toBe(true);
    expect(res.hasBlocking).toBe(true);
  });

  test('a range overlap is a WARNING, not blocking', () => {
    // Two rows, same collection+floor, overlapping ranges → W001 only.
    const a = row({ rangeStart: '000', rangeEnd: '100', svgCode: 'CB_0', floor: '0' });
    const b = row({ rangeStart: '050', rangeEnd: '150', svgCode: 'CB_0', floor: '0' });
    const res = validateDataset([a, b], { 0: new Set(['CB_0']), 1: new Set(), 2: new Set() });
    expect(res.hasBlocking).toBe(false);            // overlaps never block
    expect(res.warningRowIndexes.length).toBeGreaterThan(0);
  });

  test('an exact duplicate blocks both rows (E005)', () => {
    const res = validateDataset([row(), row()], SHELVES);
    expect(res.blockingRowIndexes).toEqual([0, 1]);
    expect(res.problemsByRow.get(0).errors.some(e => e.code === 'E005')).toBe(true);
  });

  // #187 regression: on a cold page load the floor SVGs haven't loaded yet, so
  // every floor's shelf set is empty. E006 must be LENIENT then — otherwise the
  // first render flags every svgCode red (the bug the owner saw). A valid row
  // against all-empty sets must NOT be flagged E006 and must not block.
  test('does NOT flag E006 when the floor shelf sets are not loaded yet (cold load is lenient)', () => {
    const cold = { 0: new Set(), 1: new Set(), 2: new Set() };
    const res = validateDataset([row()], cold); // valid floor-0 CB_0 row
    expect(res.problemsByRow.get(0)?.errors.some(e => e.code === 'E006')).toBeFalsy();
    expect(res.hasBlocking).toBe(false);
  });

  // A floor that IS loaded (set has shelves) but lacks this svgCode is still a
  // real broken ref — leniency only covers the not-loaded case.
  test('still flags E006 on a LOADED floor whose set lacks the svgCode', () => {
    const partial = { 0: new Set(['CB_0']), 1: new Set(['CC_1']), 2: new Set() };
    const res = validateDataset([row({ floor: '1', svgCode: 'CB_0' })], partial);
    expect(res.problemsByRow.get(0).errors.some(e => e.code === 'E006')).toBe(true);
  });
});
