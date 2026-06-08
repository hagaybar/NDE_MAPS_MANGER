// admin/components/errors-dashboard/overlap-clusters.js
/**
 * Root-cause overlap clustering for the Data Quality Dashboard.
 *
 * Turns the flat list of overlapping range PAIRS (from data-model's
 * findOverlappingRanges) into clusters keyed by a "hub" range — the range that
 * overlaps the most others. A hub that overlaps >= ROOT_CAUSE_MIN_BLAST ranges
 * is a root cause. Pure: no DOM, no fetch. Single source of truth for the
 * on-screen, print, and Excel views.
 *
 * @module components/errors-dashboard/overlap-clusters
 */
import { findOverlappingRanges, parseRangeBoundary } from '../../services/data-model.js';

export const ROOT_CAUSE_MIN_BLAST = 2;

/**
 * Catch-all detection (#158, dashboard-only framing): a range that spans
 * (near-)the entire Dewey scale (000–999) overlaps almost every other shelf, so
 * it is always the top hub and "go to this range" would point at the row the
 * librarian should usually NOT edit. We flag such hubs so the UI can reframe
 * them as "usually intentional — review the shelves below". CONSERVATIVE on
 * purpose: only obvious catch-alls (start ≤ 1 AND end ≥ 998); under-detect
 * rather than mislabel a real overlap.
 *
 * @param {Object} hubRow - the hub's csvData row.
 * @returns {boolean}
 */
function isCatchAllRange(hubRow) {
  if (!hubRow) return false;
  const start = parseRangeBoundary(hubRow.rangeStart);
  const end = parseRangeBoundary(hubRow.rangeEnd);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return start <= 1 && end >= 998;
}

/**
 * Canonical spreadsheet row number: header is line 1, the first data row is
 * line 2. `rowIndex` is 0-based into csvData, so the spreadsheet line is +2.
 * This is the SINGLE row-numbering convention read verbatim by the on-screen
 * renderer, the Excel export, and Print (#157) — they no longer compute their
 * own offsets.
 * @param {number} rowIndex
 * @returns {number}
 */
export function toRowNumber(rowIndex) {
  return rowIndex + 2;
}

/**
 * @param {Object[]} rows - the dashboard's csvData rows.
 * @returns {{ clusters: Array<{hubRowIndex, hubRowNumber, hubRow, blastRadius, isCatchAll, affectsShown, affected: Array<{rowIndex,rowNumber,row}>, collection, floor}>,
 *             hubConflicts: Array<{row1Index,row2Index,row1Number,row2Number,row1,row2,collection,floor}>,
 *             otherOverlaps: Array<{row1Index,row2Index,row1Number,row2Number,row1,row2,collection,floor}> }}
 *
 * Coverage invariant (#156): every pair returned by findOverlappingRanges is
 * represented EXACTLY ONCE across {cluster hub↔child edges} ∪ {hubConflicts} ∪
 * {otherOverlaps}. Nothing overlapping is hidden.
 */
export function buildOverlapClusters(rows) {
  const pairs = findOverlappingRanges(rows);

  const adj = new Map();   // index -> Set<index>
  const meta = new Map();  // index -> {collection, floor}
  const link = (a, b, collection, floor) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
    if (!meta.has(a)) meta.set(a, { collection, floor });
  };
  for (const p of pairs) {
    link(p.row1Index, p.row2Index, p.collection, p.floor);
    link(p.row2Index, p.row1Index, p.collection, p.floor);
  }

  const blast = (i) => (adj.has(i) ? adj.get(i).size : 0);

  // Hubs: degree >= threshold, ranked by blast radius desc then row index asc.
  const hubs = [...adj.keys()]
    .filter((i) => blast(i) >= ROOT_CAUSE_MIN_BLAST)
    .sort((a, b) => blast(b) - blast(a) || a - b);
  const hubSet = new Set(hubs);

  // Track which input pairs are already represented so otherOverlaps can be a
  // true catch-all (#156). Key is order-independent.
  const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const represented = new Set();

  const claimed = new Set();
  const clusters = [];
  for (const h of hubs) {
    const affected = [...adj.get(h)]
      .filter((i) => i !== h && !hubSet.has(i) && !claimed.has(i))
      .sort((a, b) => a - b);
    affected.forEach((i) => {
      claimed.add(i);
      represented.add(pairKey(h, i)); // hub↔child edge is now shown
    });
    // #156 follow-up: don't emit a childless "ROOT CAUSE" card. A hub whose
    // overlaps are all with other hubs (→ hubConflicts) or with rows already
    // claimed by an earlier hub (→ otherOverlaps catch-all) has nothing to list;
    // an empty card is noise and its overlaps are still shown elsewhere.
    if (affected.length === 0) continue;
    const m = meta.get(h) || { collection: '', floor: '' };
    clusters.push({
      hubRowIndex: h,
      hubRowNumber: toRowNumber(h),
      hubRow: rows[h],
      blastRadius: blast(h),
      isCatchAll: isCatchAllRange(rows[h]),
      affectsShown: affected.length,
      affected: affected.map((i) => ({
        rowIndex: i,
        rowNumber: toRowNumber(i),
        row: rows[i],
      })),
      collection: m.collection,
      floor: m.floor,
    });
  }

  const decorate = (p) => ({
    row1Index: p.row1Index,
    row2Index: p.row2Index,
    row1Number: toRowNumber(p.row1Index),
    row2Number: toRowNumber(p.row2Index),
    row1: rows[p.row1Index],
    row2: rows[p.row2Index],
    collection: p.collection,
    floor: p.floor,
  });

  // Hub-conflicts (#156): pairs where BOTH endpoints are hubs. Previously these
  // were dropped from both clusters' `affected` (!hubSet.has) AND from
  // otherOverlaps (both-hub filter) → shown nowhere. Now their own section.
  const hubConflicts = [];
  for (const p of pairs) {
    if (hubSet.has(p.row1Index) && hubSet.has(p.row2Index)) {
      hubConflicts.push(decorate(p));
      represented.add(pairKey(p.row1Index, p.row2Index));
    }
  }

  // Other overlaps = the CATCH-ALL: every input pair not already represented as
  // a cluster hub↔child edge and not a hub-conflict. This also captures the
  // subtle case of a non-hub `i` claimed by hub A that ALSO overlaps a
  // different hub B — that B↔i edge used to be silently dropped.
  const otherOverlaps = pairs
    .filter((p) => !represented.has(pairKey(p.row1Index, p.row2Index)))
    .map(decorate);

  return { clusters, hubConflicts, otherOverlaps };
}
