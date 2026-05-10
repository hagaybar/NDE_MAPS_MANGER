/**
 * Orphan Deriver
 *
 * Pure function that takes the full ranges array + a floor number and
 * returns the orphan rows for that floor — rows whose svgCode does not
 * resolve to a real SVG element on the declared floor (E006) OR whose
 * svgCode field is empty (E001 with field='svgCode').
 *
 * No DOM, no fetches. Wraps the data-model.js validateRow.
 *
 * @module components/map-editor/orphan-deriver
 */

import { validateRow } from '../../services/data-model.js';

/**
 * Derive orphan cards for a given floor.
 *
 * @param {Array<Object>} allRanges - The full mapping CSV in memory.
 * @param {string|number} floor - The active floor number.
 * @returns {Array<{
 *   rowId: string,
 *   kind: 'svgCode_not_on_floor' | 'missing_svgCode',
 *   collectionName: string,
 *   collectionNameHe: string,
 *   shelfLabel: string,
 *   shelfLabelHe: string,
 *   svgCode: string,
 *   rangeStart: string,
 *   rangeEnd: string,
 *   message: string
 * }>}
 */
export function deriveOrphansForFloor(allRanges, floor) {
  const floorStr = String(floor);
  const onFloor = (allRanges || []).filter(r => String(r.floor) === floorStr);
  const out = [];

  for (const row of onFloor) {
    const result = validateRow(row, allRanges, row);
    const errors = (result && result.errors) || [];

    for (const err of errors) {
      let kind = null;
      if (err.code === 'E006') {
        kind = 'svgCode_not_on_floor';
      } else if (err.code === 'E001' && err.field === 'svgCode') {
        kind = 'missing_svgCode';
      }

      if (!kind) continue;

      out.push({
        rowId: row.id,
        kind,
        collectionName: row.collectionName || '',
        collectionNameHe: row.collectionNameHe || '',
        shelfLabel: row.shelfLabel || '',
        shelfLabelHe: row.shelfLabelHe || '',
        svgCode: row.svgCode || '',
        rangeStart: row.rangeStart || '',
        rangeEnd: row.rangeEnd || '',
        message: err.message || '',
      });

      // Stop after the first matching error per row (don't double-list a row).
      break;
    }
  }

  // Stable sort by (collectionName, shelfLabel).
  out.sort((a, b) => {
    const c = (a.collectionName || '').localeCompare(b.collectionName || '');
    if (c !== 0) return c;
    return (a.shelfLabel || '').localeCompare(b.shelfLabel || '');
  });

  return out;
}
