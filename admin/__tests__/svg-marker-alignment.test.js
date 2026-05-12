/**
 * Regression guard for issue #16 PR 1.
 *
 * Asserts that every svgCode value in mapping.csv on each floor
 * corresponds to an SVG element with data-map-object="shelf" on
 * that floor's SVG file.
 *
 * Initially fails (the migration hasn't run yet). Passes after the
 * migration script in scripts/migrate-svg-add-shelf-marker.py
 * applies the markers.
 *
 * Catches future drift where someone adds a CSV row pointing at an
 * unmarked element, or vice versa.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function collectMarkedIds(svgText) {
  const ids = new Set();
  const tagPattern = /<[a-zA-Z][a-zA-Z0-9:-]*\b[^>]*?\bdata-map-object="shelf"[^>]*?\/?>/g;
  for (const match of svgText.matchAll(tagPattern)) {
    const idMatch = match[0].match(/\bid="([^"]+)"/);
    if (idMatch) ids.add(idMatch[1]);
  }
  return ids;
}

// Known E006 orphans: CSV rows whose svgCode does not exist in the floor SVG.
// These are surfaced by the errors-dashboard (issue #14 phase 1) and are
// expected to be fixed via the orphan panel — they're not the migration's
// concern, so the alignment test skips them.
const KNOWN_STALE_ROWS = new Set([
  '1::ka2_61_a',
  '2::kb1_28_b',
  '2::kb2_46_b',
]);

describe('CSV ↔ SVG marker alignment', () => {
  test('every CSV svgCode has data-map-object="shelf" on its floor SVG', () => {
    const csvText = fs.readFileSync(path.join(REPO_ROOT, 'data', 'mapping.csv'), 'utf8');
    const rows = parseCsv(csvText);

    const markedByFloor = {};
    for (const f of ['0', '1', '2']) {
      const svgText = fs.readFileSync(path.join(REPO_ROOT, 'maps', `floor_${f}.svg`), 'utf8');
      markedByFloor[f] = collectMarkedIds(svgText);
    }

    const offenders = [];
    rows.forEach((row, idx) => {
      const svgCode = (row.svgCode || '').trim();
      const floor = (row.floor || '').trim();
      if (!svgCode) return; // missing-svgCode rows are out of scope here
      if (!['0', '1', '2'].includes(floor)) return; // unknown-floor rows handled elsewhere
      const key = `${floor}::${svgCode}`;
      if (KNOWN_STALE_ROWS.has(key)) return;
      if (!markedByFloor[floor].has(svgCode)) {
        offenders.push({ csvRow: idx + 2, floor, svgCode });
      }
    });

    expect(offenders).toEqual([]);
  });
});
