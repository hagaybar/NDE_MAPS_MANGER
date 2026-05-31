/*
 * Range-overlap rule:
 *
 * Two ranges conflict iff they share the same (libraryName, floor,
 * collectionName) AND their numeric [start, end] intervals overlap by
 * MORE THAN A SINGLE POINT.
 *
 * Touching boundaries are always OK, regardless of whether the shared
 * value is integer or fractional. Real data uses fractional abutments
 * (e.g., shelf "292-471.7" next to shelf "471.7-…") — these are how
 * the catalog is authored, not data errors.
 *
 * Examples:
 *   OK:        100-105 + 105-110          (integer touch)
 *   OK:        100-123.45 + 123.45-124    (fractional touch)
 *   OK:        292-471.7 + 471.7-475      (real-data abutment)
 *   CONFLICT:  100-123.45 + 123.41-124    (interior overlap [123.41, 123.45])
 *   CONFLICT:  190-195 + 194-194.72       (interior point inside [190, 195])
 */

// Reuses the Dewey range comparator from data-model.js / validation.js.
// parseRangeValue preserves both the alphabetic prefix (e.g. "ML") and the
// numeric portion, so we can rule out cross-classification overlaps (Dewey vs
// LC, or ML vs MA) before doing numeric arithmetic.
import { parseRangeBoundary, compareCallNumbers, doRangesOverlap } from '../../services/data-model.js';

export function overlapsConflict(a, b) {
  if (a.libraryName !== b.libraryName) return false;
  if (String(a.floor) !== String(b.floor)) return false;
  if (a.collectionName !== b.collectionName) return false;

  // Shared overlap engine (issue #100): string-ordered, touching boundaries are
  // OK, and different classification systems (Dewey "" vs "ML") never overlap
  // because digits sort before letters.
  return doRangesOverlap(
    { start: a.rangeStart, end: a.rangeEnd },
    { start: b.rangeStart, end: b.rangeEnd }
  );
}

export function validateRangeShape(range) {
  const start = parseRangeBoundary(range.rangeStart);
  const end = parseRangeBoundary(range.rangeEnd);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { ok: false, error: 'invalid format' };
  }
  if (compareCallNumbers(range.rangeStart, range.rangeEnd) > 0) {
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
