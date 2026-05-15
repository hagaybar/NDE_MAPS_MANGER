/**
 * Bundle-consistency rule-checker (client mirror).
 *
 * Same rule as lambda/shared/validateBundle.mjs. Drift caught by parity
 * tests using lambda/__tests__/fixtures/bundles/.
 *
 * @param {Array<{rowIndex:number, svgCode:string, floor:number}>} csvRows
 * @param {Object<number, Set<string>>} svgShelfIdsByFloor
 * @returns {{ok: boolean, errors: Array}}
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
