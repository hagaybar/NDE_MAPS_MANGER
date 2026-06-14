/**
 * Whole-dataset validator for the CSV Editor save-gate (#187).
 *
 * Combines per-row validateRow (E001–E005 + warnings) with getBrokenRefs
 * (E006 — svgCode not present on its declared floor). E006 is taken from
 * getBrokenRefs (which uses the editor's already-loaded shelf sets) rather
 * than validateRow's separate isValidSvgCode cache, so it is deterministic
 * regardless of cache-warm timing.
 *
 * Pure / DOM-free so it is unit-testable in the node jest environment.
 *
 * @param {Object[]} rows - the full dataset that would be saved
 * @param {Object<number,Set<string>>} svgShelfIdsByFloor
 * @returns {{
 *   problemsByRow: Map<number,{errors:Array<{field,code,message}>, warnings:Array<{field,code,message}>}>,
 *   blockingRowIndexes: number[],
 *   warningRowIndexes: number[],
 *   hasBlocking: boolean,
 *   blockingCount: number
 * }}
 */
import { validateRow, getBrokenRefs } from './data-model.js';

export function validateDataset(rows, svgShelfIdsByFloor) {
  // Tag rows with _index so validateRow's self-skip (for E005 duplicate /
  // W001 overlap) excludes only the row itself, not every untagged row.
  const indexed = (rows || []).map((r, i) => ({ ...r, _index: i }));
  const problemsByRow = new Map();
  const ensure = (i) => {
    if (!problemsByRow.has(i)) problemsByRow.set(i, { errors: [], warnings: [] });
    return problemsByRow.get(i);
  };

  indexed.forEach((row, i) => {
    const { errors, warnings } = validateRow(row, indexed, row);
    // Drop validateRow's own E006: it reads svg-parser's isValidSvgCode cache,
    // whose warm/cold timing is non-deterministic. E006 is re-derived below
    // solely from the passed shelf sets (getBrokenRefs) so the result depends
    // only on inputs, per this module's documented contract.
    const nonE006 = errors.filter(e => e.code !== 'E006');
    if (nonE006.length) {
      ensure(i).errors.push(...nonE006.map(e => ({ field: e.field, code: e.code, message: e.message })));
    }
    if (warnings.length) {
      ensure(i).warnings.push(...warnings.map(w => ({ field: w.field, code: w.code, message: w.message })));
    }
  });

  // E006 — deterministic from the passed shelf sets.
  const refRows = (rows || []).map((r, i) => ({
    rowIndex: i,
    svgCode: String(r.svgCode || ''),
    floor: Number(r.floor),
  }));
  for (const b of getBrokenRefs(refRows, svgShelfIdsByFloor)) {
    const p = ensure(b.rowIndex);
    if (!p.errors.some(e => e.code === 'E006')) {
      p.errors.push({ field: 'svgCode', code: 'E006', message: `SVG code "${b.svgCode}" not found on floor ${b.floor}` });
    }
  }

  const blockingRowIndexes = [];
  const warningRowIndexes = [];
  for (const [i, p] of problemsByRow) {
    if (p.errors.length) blockingRowIndexes.push(i);
    else if (p.warnings.length) warningRowIndexes.push(i);
  }
  blockingRowIndexes.sort((a, b) => a - b);
  warningRowIndexes.sort((a, b) => a - b);

  return {
    problemsByRow,
    blockingRowIndexes,
    warningRowIndexes,
    hasBlocking: blockingRowIndexes.length > 0,
    blockingCount: blockingRowIndexes.length,
  };
}
