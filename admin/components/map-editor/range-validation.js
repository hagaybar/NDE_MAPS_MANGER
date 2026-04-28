/*
 * Range-overlap rule (intentional asymmetry — DO NOT "fix" it):
 *
 * Integer touch-points (e.g., 100-105 next to 105-110) are accepted because
 * the data model uses integer shelf-range boundaries as the convention for
 * "these two shelves abut." A fractional touch-point (e.g., 100-105.5 next
 * to 105.5-110) is a data error: a fractional endpoint means real
 * interleaving, not a clean abutment, and the range entry was probably
 * mistyped.
 *
 * Conflict iff: same (library, floor, collection) AND
 *   intersection.length > 0 (more than a single point), OR
 *   intersection is exactly one point that is NOT an integer.
 */

// Reuses the Dewey range comparator from data-model.js / validation.js.
// We expose a numeric-only helper here for the overlap math; if a value
// can't be parsed as a number, the comparator from validation.js handles it.
import { parseRangeBoundary } from '../../services/data-model.js?v=5';

export function overlapsConflict(a, b) {
  if (a.libraryName !== b.libraryName) return false;
  if (String(a.floor) !== String(b.floor)) return false;
  if (a.collectionName !== b.collectionName) return false;

  const aStart = parseRangeBoundary(a.rangeStart);
  const aEnd = parseRangeBoundary(a.rangeEnd);
  const bStart = parseRangeBoundary(b.rangeStart);
  const bEnd = parseRangeBoundary(b.rangeEnd);

  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);

  if (lo > hi) return false;                   // disjoint
  if (lo === hi) return !Number.isInteger(lo); // touch — OK only at integer
  return true;                                  // genuine overlap
}

export function validateRangeShape(range) {
  const start = parseRangeBoundary(range.rangeStart);
  const end = parseRangeBoundary(range.rangeEnd);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { ok: false, error: 'invalid format' };
  }
  if (start > end) {
    return { ok: false, error: 'start > end' };
  }
  return { ok: true };
}

export function computeFloorConflicts(ranges) {
  const conflicts = new Map();
  // Group by (libraryName, floor, collectionName) for O(N²) within each small group only.
  const groups = new Map();
  for (const r of ranges) {
    const key = `${r.libraryName}|${r.floor}|${r.collectionName}`;
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(r);
  }
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (overlapsConflict(group[i], group[j])) {
          add(conflicts, group[i].id, {
            otherId: group[j].id,
            otherShelf: group[j].svgCode,
            otherRangeLabel: `${group[j].rangeStart}-${group[j].rangeEnd}`,
          });
          add(conflicts, group[j].id, {
            otherId: group[i].id,
            otherShelf: group[i].svgCode,
            otherRangeLabel: `${group[i].rangeStart}-${group[i].rangeEnd}`,
          });
        }
      }
    }
  }
  return conflicts;
}

function add(map, key, value) {
  let list = map.get(key);
  if (!list) { list = []; map.set(key, list); }
  list.push(value);
}
