/**
 * Bundle-consistency rule-checker.
 *
 * RULE: every CSV row must declare a floor in {0,1,2}, and its svgCode must be
 * present in the SVG shelf set for that declared floor.
 *
 * Floors are validated here, not coerced. A blank/whitespace/out-of-range/
 * non-integer floor is an `invalid-floor` violation — never silently mapped to
 * a floor. Coercing a blank floor (`Number('')===0`) let a floor-0 svgCode pass
 * while the consumer defaulted the empty floor to 2, silently mislocating the
 * shelf in production Primo (#88). Pass the RAW floor value in; do not
 * `Number()`-coerce it at the call site.
 *
 * NOT FLAGGED (handled elsewhere):
 *   - Orphan shelves (SVG shelves with no CSV row): surfaced by Ranges Editor
 *     as the "Unassigned" pseudo-collection. Not a bundle violation.
 *   - Range overlaps within a collection: enforced by range-validation.mjs.
 *
 * MUST stay equivalent in behavior to admin/services/bundle-validator.js.
 * Drift caught by parity tests using lambda/__tests__/fixtures/bundles/.
 *
 * @param {Array<{rowIndex:number, svgCode:string, floor:(number|string)}>} csvRows
 * @param {Object<number, Set<string>>} svgShelfIdsByFloor
 * @returns {{ok: boolean, errors: Array<{rowIndex,svgCode,floor,type}>}}
 */
const VALID_FLOORS = new Set([0, 1, 2]);

export function validateBundle(csvRows, svgShelfIdsByFloor) {
  const errors = [];
  for (const row of csvRows) {
    const floorStr = String(row.floor ?? '').trim();
    const floorNum = Number(floorStr);
    const floorValid =
      floorStr !== '' && Number.isInteger(floorNum) && VALID_FLOORS.has(floorNum);
    if (!floorValid) {
      errors.push({
        rowIndex: row.rowIndex,
        svgCode: row.svgCode,
        floor: row.floor,
        type: 'invalid-floor',
      });
      continue;
    }
    const set = svgShelfIdsByFloor[floorNum];
    if (!set || !set.has(row.svgCode)) {
      errors.push({
        rowIndex: row.rowIndex,
        svgCode: row.svgCode,
        floor: floorNum,
        type: 'shelf-not-found',
      });
    }
  }
  return { ok: errors.length === 0, errors };
}
