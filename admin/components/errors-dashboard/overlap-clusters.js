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
import { findOverlappingRanges } from '../../services/data-model.js';

export const ROOT_CAUSE_MIN_BLAST = 2;

/**
 * @param {Object[]} rows - the dashboard's csvData rows.
 * @returns {{ clusters: Array<{hubRowIndex, hubRow, blastRadius, affected: Array<{rowIndex,row}>, collection, floor}>,
 *             otherOverlaps: Array<{row1Index,row2Index,collection,floor}> }}
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

  const claimed = new Set();
  const clusters = [];
  for (const h of hubs) {
    const affected = [...adj.get(h)]
      .filter((i) => i !== h && !hubSet.has(i) && !claimed.has(i))
      .sort((a, b) => a - b);
    affected.forEach((i) => claimed.add(i));
    const m = meta.get(h) || { collection: '', floor: '' };
    clusters.push({
      hubRowIndex: h,
      hubRow: rows[h],
      blastRadius: blast(h),
      affected: affected.map((i) => ({ rowIndex: i, row: rows[i] })),
      collection: m.collection,
      floor: m.floor,
    });
  }

  // Other overlaps: pairs where NEITHER endpoint is a hub (plain A<->B pairs).
  const otherOverlaps = pairs.filter(
    (p) => !hubSet.has(p.row1Index) && !hubSet.has(p.row2Index),
  );

  return { clusters, otherOverlaps };
}
