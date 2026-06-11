/**
 * Bundle-consistency rule-checker (client mirror).
 *
 * Same rule as lambda/shared/validateBundle.mjs — including the floor-validity
 * check: a blank/whitespace/out-of-range/non-integer floor is an
 * `invalid-floor` violation, never coerced to a floor (#88). Pass the RAW
 * floor value in. Drift caught by parity tests using
 * lambda/__tests__/fixtures/bundles/.
 *
 * @param {Array<{rowIndex:number, svgCode:string, floor:(number|string)}>} csvRows
 * @param {Object<number, Set<string>>} svgShelfIdsByFloor
 * @returns {{ok: boolean, errors: Array}}
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
