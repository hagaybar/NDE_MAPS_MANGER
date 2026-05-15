/**
 * Bundle-consistency rule-checker.
 *
 * RULE: every CSV row's svgCode must be present in the SVG shelf set for the
 * row's declared floor.
 *
 * NOT FLAGGED (handled elsewhere):
 *   - Orphan shelves (SVG shelves with no CSV row): surfaced by Ranges Editor
 *     as the "Unassigned" pseudo-collection. Not a bundle violation.
 *   - Range overlaps within a collection: enforced by range-validation.mjs.
 *
 * MUST stay equivalent in behavior to admin/services/bundle-validator.js.
 * Drift caught by parity tests using lambda/__tests__/fixtures/bundles/.
 *
 * @param {Array<{rowIndex:number, svgCode:string, floor:number}>} csvRows
 * @param {Object<number, Set<string>>} svgShelfIdsByFloor
 * @returns {{ok: boolean, errors: Array<{rowIndex,svgCode,floor,type}>}}
 */
export function validateBundle(csvRows, svgShelfIdsByFloor) {
  const errors = [];
  for (const row of csvRows) {
    const set = svgShelfIdsByFloor[row.floor];
    if (!set || !set.has(row.svgCode)) {
      errors.push({
        rowIndex: row.rowIndex,
        svgCode: row.svgCode,
        floor: row.floor,
        type: 'shelf-not-found',
      });
    }
  }
  return { ok: errors.length === 0, errors };
}
