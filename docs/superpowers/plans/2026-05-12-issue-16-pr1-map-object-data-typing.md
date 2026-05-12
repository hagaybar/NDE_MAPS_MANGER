# Issue #16 PR 1 — Map-object data typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `data-map-object="shelf"` to every confirmed shelf element in the 3 floor SVGs; introduce `location-model.js` module that reads the marker; refactor `map-editor.js` to use it. Preserve user-visible behaviour exactly — clickability still requires "marked AND has CSV row".

**Architecture:** A one-time Python migration script (`scripts/migrate-svg-add-shelf-marker.py`) writes the marker to confirmed shelves across `maps/floor_{0,1,2}.svg`. A new code module (`admin/components/map-editor/location-model.js`) exposes `indexShelfLocations(svgRoot)` that returns a `Map<svgCode, SVGElement>` keyed by the marker. `map-editor.js` switches its detection call to use the new function, with a temporary preservation filter retaining today's behaviour. Two new Jest tests guard the migration alignment and the new model's behaviour.

**Tech Stack:** Python 3 with `xml.etree.ElementTree` (no extra deps) for the migration; Vanilla ES modules + Jest with jsdom for code; existing Playwright project for e2e regression.

**Spec:** `docs/superpowers/specs/2026-05-12-issue-16-pr1-map-object-data-typing-design.md`

---

## File map

**New:**
- `scripts/migrate-svg-add-shelf-marker.py` — one-time migration; reads `data/mapping.csv` + embedded librarian additions; writes the marker.
- `admin/components/map-editor/location-model.js` — exports `indexShelfLocations(svgRoot)`.
- `admin/__tests__/location-model.test.js` — 6 unit tests for the new module.
- `admin/__tests__/svg-marker-alignment.test.js` — 1 regression-guard test reading the live CSV + SVGs.

**Modified:**
- `maps/floor_0.svg`, `maps/floor_1.svg`, `maps/floor_2.svg` — markers added by the migration script.
- `admin/components/map-editor.js` — switch detection call + add preservation filter + variable renames.

**Unchanged on purpose:**
- `admin/components/map-editor/svg-loader.js` — `indexShelvesById` stays as defensive belt-and-suspenders (removed in a follow-up cleanup).
- `admin/components/svg-autocomplete.js` — still uses the regex universe; marker unification is a separate tech-debt issue.
- All other admin code (orphan-panel.js, orphan-card.js, etc.) — operates on CSV rows, no SVG-side concerns.

---

## Task 0: Setup branch and rollback tag

**Files:** none yet.

- [ ] **Step 0.1: Verify clean working tree on `main`**

Run: `git status --short && git rev-parse --abbrev-ref HEAD`
Expected: untracked-only entries (none staged or modified) and `main`.

- [ ] **Step 0.2: Create feature branch and pre-feature tag**

Run:
```bash
git checkout -b fix/issue-16-map-object-typing main
git tag pre/issue-16-pr1 main
```
Expected: switched to the new branch. The tag is local-only (rollback safety net).

---

## Task 1: Write the failing CSV ↔ marker alignment regression-guard test

**Files:**
- Create: `admin/__tests__/svg-marker-alignment.test.js`

Writing this test FIRST and verifying it FAILS proves the test actually checks what we expect. After the migration in Task 2, this same test will pass.

- [ ] **Step 1.1: Create the test file**

Create `admin/__tests__/svg-marker-alignment.test.js`:

```js
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
      if (!markedByFloor[floor].has(svgCode)) {
        offenders.push({ csvRow: idx + 2, floor, svgCode });
      }
    });

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 1.2: Run the test — confirm FAIL**

Run: `cd admin && npm test -- svg-marker-alignment.test.js 2>&1 | tail -20`
Expected: test FAILS. Failure message shows a non-empty `offenders` array — every CSV row whose svgCode is not yet marked. The total offender count should approximately equal "all CSV rows with a non-empty svgCode" (~380+ rows), since no SVG has the marker yet.

If the test passes with offenders=[], something is off (maybe the SVGs already have markers from a prior run). Investigate before continuing.

- [ ] **Step 1.3: Commit the failing test**

Run:
```bash
git add admin/__tests__/svg-marker-alignment.test.js
git commit -m "test(svg-marker): add failing CSV ↔ marker alignment regression guard"
```

---

## Task 2: Write and run the migration script

**Files:**
- Create: `scripts/migrate-svg-add-shelf-marker.py`
- Modify: `maps/floor_0.svg`, `maps/floor_1.svg`, `maps/floor_2.svg`

- [ ] **Step 2.1: Ensure the `scripts/` directory exists**

Run: `mkdir -p scripts && ls -la scripts/`
Expected: directory exists.

- [ ] **Step 2.2: Create the migration script**

Create `scripts/migrate-svg-add-shelf-marker.py`:

```python
#!/usr/bin/env python3
"""
One-time migration: add `data-map-object="shelf"` to every confirmed
shelf rect in maps/floor_{0,1,2}.svg.

Canonical shelf-id list per floor = union of:
  1. All svgCode values in data/mapping.csv on that floor.
  2. The 9 librarian-reviewed additions hardcoded in ADDITIONS_BY_FLOOR.

The script is idempotent: re-running on already-migrated SVGs sets
the same attribute on the same elements; rendered output is unchanged.

Verifies that every canonical id is found in its floor's SVG and the
attribute was set; exits non-zero with offending ids on failure.

Usage:
  python3 scripts/migrate-svg-add-shelf-marker.py
"""

import csv
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = REPO_ROOT / 'data' / 'mapping.csv'
SVG_DIR = REPO_ROOT / 'maps'

# Librarian-reviewed additions (svgCodes that are real shelves but not yet
# in the CSV).  Reviewed and confirmed during the brainstorming for #16.
ADDITIONS_BY_FLOOR = {
    '0': set(),
    '1': {'CL1_1', 'CP_ka1', 'CP_ka2', 'TP_ka2', 'ka1_53_a', 'ka1_61_a'},
    '2': {'CL2_2', 'CP_kb2', 'cy_28_b'},
}


def canonical_ids_by_floor():
    by_floor = {'0': set(), '1': set(), '2': set()}
    with CSV_PATH.open(encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            floor = (row.get('floor') or '').strip()
            code = (row.get('svgCode') or '').strip()
            if floor in by_floor and code:
                by_floor[floor].add(code)
    for floor, additions in ADDITIONS_BY_FLOOR.items():
        by_floor[floor] |= additions
    return by_floor


def migrate_floor(floor, ids_to_mark):
    svg_path = SVG_DIR / f'floor_{floor}.svg'
    # Preserve the default SVG namespace by registering an empty prefix
    # — otherwise ElementTree adds ns0: prefixes on rewrite, which some
    # renderers tolerate but it's ugly.
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    tree = ET.parse(svg_path)
    root = tree.getroot()

    found = set()
    for el in root.iter():
        eid = el.attrib.get('id')
        if eid and eid in ids_to_mark:
            el.attrib['data-map-object'] = 'shelf'
            found.add(eid)

    missing = ids_to_mark - found
    if missing:
        print(
            f'ERROR floor {floor}: {len(missing)} canonical id(s) not found '
            f'in SVG: {sorted(missing)}',
            file=sys.stderr,
        )
        return False

    tree.write(svg_path, encoding='utf-8', xml_declaration=True)
    print(f'floor {floor}: marked {len(found)} elements')
    return True


def main():
    ids = canonical_ids_by_floor()
    print(
        f'Canonical shelf-id counts: '
        f'floor 0 = {len(ids["0"])}, '
        f'floor 1 = {len(ids["1"])}, '
        f'floor 2 = {len(ids["2"])}'
    )

    ok = True
    for floor in ('0', '1', '2'):
        if not migrate_floor(floor, ids[floor]):
            ok = False

    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
```

- [ ] **Step 2.3: Make the script executable and run it**

Run:
```bash
chmod +x scripts/migrate-svg-add-shelf-marker.py
python3 scripts/migrate-svg-add-shelf-marker.py
```

Expected output (counts may differ by ±1 depending on live CSV state, but should be close):
```
Canonical shelf-id counts: floor 0 = 1, floor 1 = 202, floor 2 = 191
floor 0: marked 1 elements
floor 1: marked 202 elements
floor 2: marked 191 elements
```

Exit status: 0.

If the script reports any missing ids, STOP. The canonical list might have an id that doesn't exist in the SVG; surface the discrepancy.

- [ ] **Step 2.4: Verify the markers landed**

Run:
```bash
for f in 0 1 2; do
  count=$(grep -c 'data-map-object="shelf"' maps/floor_${f}.svg)
  echo "floor $f: $count marked elements in file"
done
```

Expected: counts roughly match the script's output (floor 0 = 1, floor 1 = 202, floor 2 = 191). Small variation OK if a single element has the attribute serialized on multiple lines — unlikely with ElementTree but possible.

- [ ] **Step 2.5: Re-run the alignment test — should PASS now**

Run: `cd admin && npm test -- svg-marker-alignment.test.js`
Expected: 1 test passes; the offenders array is now empty.

- [ ] **Step 2.6: Commit the script + migrated SVGs**

Run:
```bash
git add scripts/migrate-svg-add-shelf-marker.py maps/floor_0.svg maps/floor_1.svg maps/floor_2.svg
git commit -m "data(maps): add data-map-object=shelf to confirmed shelves on all floors

Migrated 394 elements across 3 floors via scripts/migrate-svg-add-shelf-marker.py.
Canonical id list = union of all live mapping.csv svgCodes + 9 librarian-reviewed
additions (CL1_1, CP_ka1, CP_ka2, TP_ka2, ka1_53_a, ka1_61_a on floor 1; CL2_2,
CP_kb2, cy_28_b on floor 2).

NDE addon impact: zero — addon reads SVG by ID only, ignores data-* attributes."
```

(The numbers in the commit message may need to be adjusted if the migration script reports slightly different counts.)

---

## Task 3: Write failing unit tests for `location-model.js`

**Files:**
- Create: `admin/__tests__/location-model.test.js`

- [ ] **Step 3.1: Create the test file**

Create `admin/__tests__/location-model.test.js`:

```js
/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

describe('indexShelfLocations', () => {
  let indexShelfLocations;

  beforeEach(async () => {
    jest.resetModules();
    ({ indexShelfLocations } = await import('../components/map-editor/location-model.js'));
  });

  function makeSvg(innerHtml) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = innerHtml;
    return svg;
  }

  test('empty SVG returns empty map', () => {
    const svg = makeSvg('');
    const result = indexShelfLocations(svg);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test('null / undefined svgRoot returns empty map', () => {
    expect(indexShelfLocations(null).size).toBe(0);
    expect(indexShelfLocations(undefined).size).toBe(0);
  });

  test('one marked shelf returns one entry', () => {
    const svg = makeSvg('<rect id="shelf_1" data-map-object="shelf" />');
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(1);
    expect(result.has('shelf_1')).toBe(true);
  });

  test('mixed map-object values returns only shelves', () => {
    const svg = makeSvg(`
      <rect id="shelf_a" data-map-object="shelf" />
      <rect id="printer_1" data-map-object="printer" />
      <rect id="shelf_b" data-map-object="shelf" />
      <rect id="lift_1" data-map-object="lift" />
    `);
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(2);
    expect(result.has('shelf_a')).toBe(true);
    expect(result.has('shelf_b')).toBe(true);
    expect(result.has('printer_1')).toBe(false);
    expect(result.has('lift_1')).toBe(false);
  });

  test('marked element without id is skipped', () => {
    const svg = makeSvg('<rect data-map-object="shelf" /><rect id="real" data-map-object="shelf" />');
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(1);
    expect(result.has('real')).toBe(true);
  });

  test('element with id but no marker is skipped', () => {
    const svg = makeSvg('<rect id="unmarked" /><rect id="marked" data-map-object="shelf" />');
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(1);
    expect(result.has('marked')).toBe(true);
    expect(result.has('unmarked')).toBe(false);
  });

  test('marked element nested inside <g> is found', () => {
    const svg = makeSvg('<g><rect id="nested" data-map-object="shelf" /></g>');
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(1);
    expect(result.has('nested')).toBe(true);
  });
});
```

- [ ] **Step 3.2: Run the tests — confirm they FAIL**

Run: `cd admin && npm test -- location-model.test.js 2>&1 | tail -10`
Expected: all 7 tests fail with `Cannot find module '../components/map-editor/location-model.js'`.

- [ ] **Step 3.3: Commit the failing tests**

Run:
```bash
git add admin/__tests__/location-model.test.js
git commit -m "test(location-model): add failing unit tests for indexShelfLocations"
```

---

## Task 4: Implement `location-model.js`

**Files:**
- Create: `admin/components/map-editor/location-model.js`

- [ ] **Step 4.1: Create the module**

Create `admin/components/map-editor/location-model.js`:

```js
/**
 * Location Model — generic abstraction over mappable SVG elements.
 *
 * Each Location corresponds to one SVG element classified by the
 * `data-map-object` attribute.  Today only `kind === "shelf"` is
 * surfaced via indexShelfLocations(); future kinds (printer, lift,
 * toilet, etc.) add new exports without restructuring this module.
 *
 * @module components/map-editor/location-model
 */

/**
 * Return every shelf-kind Location reachable from the given SVG root.
 *
 * @param {SVGElement | null | undefined} svgRoot
 * @returns {Map<string, SVGElement>}  svgCode → element
 */
export function indexShelfLocations(svgRoot) {
  const map = new Map();
  if (!svgRoot) return map;
  const matches = svgRoot.querySelectorAll('[data-map-object="shelf"][id]');
  for (const el of matches) {
    map.set(el.id, el);
  }
  return map;
}
```

- [ ] **Step 4.2: Run the unit tests — should PASS**

Run: `cd admin && npm test -- location-model.test.js`
Expected: all 7 tests pass.

- [ ] **Step 4.3: Run the full admin Jest suite — same signature as `main`**

Run: `cd admin && npm test 2>&1 | tail -15`
Expected: pre-existing issue-#9 failures (14 across 4 suites) remain unchanged. No NEW failures.

- [ ] **Step 4.4: Commit**

Run:
```bash
git add admin/components/map-editor/location-model.js
git commit -m "feat(map-editor): add location-model module reading data-map-object marker"
```

---

## Task 5: Refactor `map-editor.js` to use `indexShelfLocations`

**Files:**
- Modify: `admin/components/map-editor.js`

- [ ] **Step 5.1: Add the import**

Locate the existing svg-loader import in `admin/components/map-editor.js` (around line 5):
```js
import { loadFloorSvg, indexShelvesById, buildRangeCountByShelf, buildKnownSvgCodes } from './map-editor/svg-loader.js';
```

Insert immediately after it:
```js
import { indexShelfLocations } from './map-editor/location-model.js';
```

- [ ] **Step 5.2: Locate the `loadFloor` function**

Run: `grep -n "async function loadFloor" admin/components/map-editor.js`
Expected: one hit. Read ~30 lines from that point to understand the current shelf-detection logic.

- [ ] **Step 5.3: Replace the detection call and rename the module-level variable**

In `admin/components/map-editor.js`, find the module-level declaration:
```js
let shelfElements = null;       // Map<svgCode, SVGElement>
```

Replace with:
```js
let locationElements = null;       // Map<svgCode, SVGElement> — every shelf-kind Location on the active floor
```

Then find this block inside `loadFloor`:
```js
  const floorRanges = allRanges.filter(r => String(r.floor) === String(floorNumber));
  const knownSvgCodes = buildKnownSvgCodes(floorRanges);
  shelfElements = indexShelvesById(svgRoot, knownSvgCodes);

  rangeCountByShelf = buildRangeCountByShelf(floorRanges);
```

Replace with:
```js
  const floorRanges = allRanges.filter(r => String(r.floor) === String(floorNumber));
  rangeCountByShelf = buildRangeCountByShelf(floorRanges);

  // PR 1: read every shelf-kind Location from the marker.
  // The "AND has at least one CSV row" filter below preserves today's
  // clickability behaviour — empty shelves stay non-clickable until PR 2
  // removes the filter and adds the empty-state UX.
  const allShelfLocations = indexShelfLocations(svgRoot);
  locationElements = new Map();
  for (const [id, el] of allShelfLocations) {
    if (rangeCountByShelf.has(id)) {
      locationElements.set(id, el);
    }
  }
```

- [ ] **Step 5.4: Rename `shelfElements` references throughout `map-editor.js`**

Run: `grep -n "shelfElements" admin/components/map-editor.js`
Expected: a list of occurrences (likely 10–20 hits) where the old variable is read or passed as an argument.

For each occurrence, replace `shelfElements` with `locationElements`. The variable is used in:
- `attachInteraction({ shelfElements: ..., ... })` — keep the prop name as `shelfElements` in the call site because `svg-interaction.js` expects that prop name. Change the *value* to `locationElements` but the *key* stays `shelfElements`. Same for any other function that receives the map.

Concretely: where you see `shelfElements: shelfElements` (or just `shelfElements,` in shorthand), change to `shelfElements: locationElements`.

Where you see standalone reads like `shelfElements.has(...)`, `shelfElements.get(...)`, `[...shelfElements].filter(...)`, change to `locationElements.has(...)` etc.

Where you see assignments like `shelfElements = ...`, change to `locationElements = ...`.

Where you see destructuring on the function param side (inside `attachInteraction`, `handleEscape`, etc.), DON'T change — those are downstream files we aren't modifying.

- [ ] **Step 5.5: Rename `shelfId` → `locationId` in local scopes inside `map-editor.js`**

Run: `grep -n "shelfId" admin/components/map-editor.js`
Expected: a list of occurrences inside `loadFloor`, `attachInteraction` arg shape, and event handler callbacks.

These are all local variable names (callback parameters and local lets) that flow through `attachInteraction`. Rename `shelfId` → `locationId` ONLY where it's a local in `map-editor.js`. The callback parameter NAMES passed into `attachInteraction` don't change because that function's API stays the same — what we rename is the *body* that uses the parameter.

If unsure on a specific occurrence, leave it as `shelfId` rather than break an API boundary; the file is internally consistent either way once `locationElements` is in place.

- [ ] **Step 5.6: Verify the file still parses**

Run: `cd admin && node --check components/map-editor.js`
Expected: no output (success).

- [ ] **Step 5.7: Run the full admin Jest suite**

Run: `cd admin && npm test 2>&1 | tail -15`
Expected: same pass/fail signature as `main` — only pre-existing #9 failures.

- [ ] **Step 5.8: Commit**

Run:
```bash
git add admin/components/map-editor.js
git commit -m "refactor(map-editor): use location-model for shelf detection

Switch from indexShelvesById (CSV-driven) to indexShelfLocations
(marker-driven).  Preserve today's clickability behaviour with a
temporary 'AND has CSV row' filter — PR 2 removes the filter and
adds the empty-state UX.

Module-level variable renamed shelfElements → locationElements.
Variable rename stays inside map-editor.js; downstream svg-interaction.js
keeps the shelfElements prop name on its API."
```

---

## Task 6: Run full e2e suite — verify no regression

**Files:** none modified.

PR 1 preserves user-visible behaviour exactly. Every existing Playwright test should pass unchanged. Any new failure points at a real regression we need to investigate.

- [ ] **Step 6.1: Start the local test server**

Run (background-safe; if a server is already running on 8080 from a prior session, skip this step):
```bash
python3 -m http.server 8080 > /tmp/admin-server.log 2>&1 &
sleep 2
curl -fsS -o /dev/null -w "server check: %{http_code}\n" http://localhost:8080/admin/index.html
```
Expected: `server check: 200`.

- [ ] **Step 6.2: Run the orphan-panel positioning spec (added in #23) — confirm pass**

Run: `cd /home/hagaybar/projects/primo_maps && timeout 120 npx playwright test e2e/tests/map-editor-orphan-panel-positioning.spec.ts 2>&1 | tail -10`
Expected: 8 tests pass (en + he across all 4 projects).

- [ ] **Step 6.3: Run the orphan-panel happy-path spec (added in #20) — confirm pass**

Run: `cd /home/hagaybar/projects/primo_maps && timeout 60 npx playwright test e2e/tests/map-editor-orphan-panel.spec.ts --project=en-admin 2>&1 | tail -10`
Expected: 1 test passes.

- [ ] **Step 6.4: Run the full map-editor en-admin e2e suite — same signature as `main`**

Run: `cd /home/hagaybar/projects/primo_maps && timeout 240 npx playwright test e2e/tests/map-editor --project=en-admin 2>&1 | tail -15`
Expected: same pass/fail signature as `main`. Recent main baseline (post-#23): 18 pass + 1 unrelated skip + 0 failures.

If any NEW test fails (regression), STOP and surface the failure with playwright output. PR 1 is a pure refactor; any user-visible breakage must be a refactor issue.

- [ ] **Step 6.5: Stop the local server**

Run: `pkill -f 'python3 -m http.server 8080' || true`
Expected: server stopped (no error if it was never running).

---

## Task 7: Push branch and open PR

**Files:** none modified.

- [ ] **Step 7.1: Verify clean commit history**

Run: `git log --oneline main..HEAD`
Expected: 5 commits — failing alignment test, migration + SVGs, failing model tests, model implementation, map-editor refactor.

- [ ] **Step 7.2: Push the branch**

Run: `git push -u origin fix/issue-16-map-object-typing`
Expected: branch created on origin.

- [ ] **Step 7.3: Open the PR**

```bash
gh pr create --title "feat(map-editor): introduce data-map-object marker + location-model (#16 PR 1)" --body "$(cat <<'EOF'
## Summary

PR 1 of issue #16. Introduces explicit shelf classification in the SVG (`data-map-object="shelf"`) and a new `location-model.js` module that reads it. The Map Editor refactors to use the marker as the source of truth for "what's a shelf," replacing the regex-on-naming-convention inference that previously coupled the clickable universe to the CSV.

**User-visible behaviour: unchanged.** This PR preserves today's clickability rule via a temporary "AND has CSV row" filter inside `loadFloor`. PR 2 removes the filter and adds the empty-state drawer + dashed outline + "Create first range" CTA.

## What this PR does

- **Migration:** `scripts/migrate-svg-add-shelf-marker.py` writes `data-map-object="shelf"` to every confirmed shelf rect in the 3 floor SVGs.
  - Floor 0: 1 element (`CB_0`)
  - Floor 1: 202 elements (196 from CSV + 6 librarian-reviewed additions — `CL1_1`, `CP_ka1`, `CP_ka2`, `TP_ka2`, `ka1_53_a`, `ka1_61_a`)
  - Floor 2: 191 elements (188 from CSV + 3 additions — `CL2_2`, `CP_kb2`, `cy_28_b`)
- **New module:** `admin/components/map-editor/location-model.js` exports `indexShelfLocations(svgRoot)`.
- **Refactor:** `map-editor.js` switches to the marker; `shelfElements` → `locationElements` inside this file only.
- **Tests:** 7 unit tests for the new module + 1 CSV ↔ marker alignment regression-guard test.

## What this PR does NOT do

- No empty-shelf clickability — PR 2.
- No CSV column changes — NDE addon hard constraint.
- No removal of `indexShelvesById` from `svg-loader.js` — separate cleanup once we confirm nothing imports it.
- No unification of `svg-parser.getAvailableCodes` with the marker — separate tech-debt issue.

## NDE addon impact

Zero. The addon (TAU_customModule branch `feature/cenlib_map_multi_locations`) reads SVG elements by ID only (`container.querySelector('#${CSS.escape(code)}')` in `shelf-map-svg.component.ts:292`) and ignores any `data-*` attributes on SVG elements. Verified by inspecting addon code during the brainstorming.

## Test plan

- [x] Jest: 7 location-model unit tests + 1 alignment regression-guard test pass.
- [x] Full admin Jest suite shows the same pass/fail signature as main (pre-existing #9 failures only).
- [x] Map-editor en-admin Playwright suite — 18 pass + 1 skip + 0 fail (matches main baseline).
- [x] Orphan-panel positioning spec (#23 anchor) — 8/8 pass.
- [x] Orphan-panel happy-path spec (#20 anchor) — 1/1 pass.
- [ ] After merge + deploy: hard-refresh admin in both languages → confirm Map Editor still functions; empty shelves remain non-clickable; orphan panel still surfaces the 2 known orphans on floor 2.

## Rollback

Pre-feature tag `pre/issue-16-pr1` (local) marks pre-PR `main`. Revert the merge commit if anything regresses. PR 2 is independently rollback-able.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 7.4: Stop here — do NOT merge**

User reviews, merges, deploys via `redeploy.sh`, and verifies post-deploy. PR 2 follows once PR 1 is on `main` and verified clean.
