# Issue #14 — Sub-phase 2a: Map Editor orphan repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clickable yellow `+N` orphan badge that opens a right-side panel listing rows whose `svgCode` does not resolve on the active floor; let the librarian repair each row by clicking the correct shelf on the map. Differentiate "Set shelf on map" (repair) from the existing "Move to another shelf" (move) at the UX level.

**Architecture:** Three new files — `orphan-deriver.js` (pure validator-driven derivation), `orphan-card.js` (single-card render), `orphan-panel.js` (right-side drawer container) — wired together by additive changes to `map-editor.js`. The existing `reassign-mode.js` gains an `intent: 'repair' | 'move'` parameter that drives banner / confirmation copy and post-action behavior; the existing **Move** button label is renamed to **Move to another shelf**. No structural changes to existing code; rollback is `git revert <merge-commit>`.

**Tech Stack:** Vanilla ES modules (no bundler). Jest with `jest.unstable_mockModule` for ESM mocking, jsdom test environment. Playwright for E2E. Tailwind utility classes plus dedicated `.map-orphan-*` CSS for the panel.

**Spec:** `docs/superpowers/specs/2026-05-10-issue-14-phase-2a-orphan-repair-design.md`

---

## File map

**New (admin/components/map-editor/):**
- `orphan-deriver.js`
- `orphan-card.js`
- `orphan-panel.js`

**New (admin/__tests__/):**
- `orphan-deriver.test.js`
- `orphan-card.test.js`
- `orphan-panel.test.js`
- `fixtures/orphan-fixtures.js`

**New (e2e/tests/):**
- `map-editor-orphan-panel.spec.ts`

**Modified:**
- `admin/components/map-editor.js`
- `admin/components/map-editor/reassign-mode.js`
- `admin/components/map-editor/shelf-drawer.js`
- `admin/styles/app.css`
- `admin/i18n/en.json`
- `admin/i18n/he.json`

---

## Task 0: Setup branch and rollback tag

**Files:** none yet.

- [ ] **Step 0.1: Verify clean working tree on `main`**

Run: `git status --short && git rev-parse --abbrev-ref HEAD`
Expected: untracked-only entries (none staged or modified) and `main`.

- [ ] **Step 0.2: Create feature branch and pre-feature tag**

Run:
```bash
git checkout -b feat/issue-14-phase-2a main
git tag pre/issue-14-phase-2a main
```
Expected: `Switched to a new branch 'feat/issue-14-phase-2a'`. The tag is local-only (rollback safety net).

---

## Task 1: Add new i18n keys (en + he)

**Files:**
- Modify: `admin/i18n/en.json`
- Modify: `admin/i18n/he.json`

Adding the keys before any code references them so component output uses real localized text rather than raw key strings.

Key changes:
- **Replace** scalar `mapEditor.reassign.banner` and `mapEditor.reassign.confirm` with nested objects (`banner.repair`, `banner.move`, `confirm.repair`, `confirm.move`). Existing callers will be updated in Task 3.
- **Update** `mapEditor.move` value from `"Move"` (or whatever it currently says) to `"Move to another shelf"`. Key stays.
- **Add** new `mapEditor.orphan.*` keys.

- [ ] **Step 1.1: Read the existing `mapEditor` block in `en.json` to confirm the current shape**

Run: `python3 -c "import json; print(json.dumps(json.load(open('admin/i18n/en.json'))['mapEditor'], indent=2, ensure_ascii=False))"`
Purpose: confirm current values of `move`, `reassign.banner`, `reassign.confirm` so the diff is precise.

- [ ] **Step 1.2: Edit `admin/i18n/en.json`**

Update the `mapEditor` block with these changes:

1. Set `mapEditor.move` to `"Move to another shelf"`.
2. Replace the existing `mapEditor.reassign.banner` (string) with an object: `{ "repair": "Click the shelf where this range belongs", "move": "Click the new shelf for this range" }`.
3. Replace the existing `mapEditor.reassign.confirm` (string) with an object: `{ "repair": "Set shelf for {label} to {picked}?", "move": "Move {label} from {old} to {new}?" }`.
4. Add a new `mapEditor.orphan` block:

```json
"orphan": {
  "panel": {
    "title": "Rows needing shelf assignment",
    "empty": "No orphans on floor {n} — switch tabs to see others",
    "allRepaired": "All orphans repaired on this floor"
  },
  "card": {
    "setShelf": "Set shelf on map",
    "editElsewhere": "Edit in CSV editor",
    "readOnly": "Read-only — ask an admin to repair this row",
    "kind": {
      "wrongSvgCode": "Wrong svgCode",
      "missingSvgCode": "No svgCode set"
    }
  }
}
```

- [ ] **Step 1.3: Edit `admin/i18n/he.json`**

Apply the same structural changes with Hebrew text:

1. Set `mapEditor.move` to `"העבר למדף אחר"`.
2. Replace `mapEditor.reassign.banner` with: `{ "repair": "לחץ על המדף שאליו שייך טווח זה", "move": "לחץ על המדף החדש לטווח זה" }`.
3. Replace `mapEditor.reassign.confirm` with: `{ "repair": "להצמיד את {label} למדף {picked}?", "move": "להעביר את {label} מהמדף {old} למדף {new}?" }`.
4. Add `mapEditor.orphan`:

```json
"orphan": {
  "panel": {
    "title": "שורות הזקוקות להצמדת מדף",
    "empty": "אין שורות יתומות בקומה {n} — עברו ללשוניות אחרות",
    "allRepaired": "כל השורות היתומות תוקנו בקומה זו"
  },
  "card": {
    "setShelf": "קבע מדף במפה",
    "editElsewhere": "ערוך בעורך ה-CSV",
    "readOnly": "לקריאה בלבד — בקש ממנהל לתקן שורה זו",
    "kind": {
      "wrongSvgCode": "קוד SVG שגוי",
      "missingSvgCode": "ללא קוד SVG"
    }
  }
}
```

- [ ] **Step 1.4: Validate both files parse as JSON**

Run: `python3 -c "import json; json.load(open('admin/i18n/en.json')); json.load(open('admin/i18n/he.json')); print('OK')"`
Expected: `OK`. Any error means malformed JSON — fix before committing.

- [ ] **Step 1.5: Commit**

```bash
git add admin/i18n/en.json admin/i18n/he.json
git commit -m "i18n(map-editor): add orphan-panel keys; split reassign banner/confirm by intent"
```

---

## Task 2: Create the orphan-fixtures test fixture

**Files:**
- Create: `admin/__tests__/fixtures/orphan-fixtures.js`

This fixture is reused across the deriver and panel tests. It contains 6 representative rows: 2 valid, 4 orphan (across both kinds and both floors).

- [ ] **Step 2.1: Ensure fixtures directory exists**

Run: `mkdir -p admin/__tests__/fixtures`
(No-op if already there from phase 1.)

- [ ] **Step 2.2: Create `admin/__tests__/fixtures/orphan-fixtures.js`**

```js
// Fixtures for sub-phase 2a tests. Two valid rows, four orphan rows
// covering both kinds (svgCode_not_on_floor + missing_svgCode) on both
// floors 1 and 2. Used by orphan-deriver.test.js, orphan-card.test.js,
// and orphan-panel.test.js.

export const VALID_FLOOR_1 = {
  id: 'row-001',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CL1', collectionNameHe: 'CL1',
  rangeStart: '010', rangeEnd: '184',
  svgCode: 'cl1_106_a', floor: '1',
  shelfLabel: '106 A', shelfLabelHe: '106 א',
};

export const VALID_FLOOR_2 = {
  id: 'row-002',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CY', collectionNameHe: 'CY',
  rangeStart: '892.439', rangeEnd: '892.498',
  svgCode: 'cy_29_a', floor: '2',
  shelfLabel: '29 A', shelfLabelHe: '29 א',
};

// Orphan: svgCode does not resolve on declared floor.
export const ORPHAN_BAD_SVGCODE_F1 = {
  id: 'row-101',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'KA', collectionNameHe: 'KA',
  rangeStart: '300', rangeEnd: '305',
  svgCode: 'ka1_61_z', floor: '1',
  shelfLabel: '61 Z', shelfLabelHe: '61 ז',
};

export const ORPHAN_BAD_SVGCODE_F2 = {
  id: 'row-102',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CY', collectionNameHe: 'CY',
  rangeStart: '296.012', rangeEnd: '892.493',
  svgCode: 'kb1_28_b', floor: '2',
  shelfLabel: '28 B', shelfLabelHe: '28 ב',
};

// Orphan: svgCode is empty.
export const ORPHAN_MISSING_SVGCODE_F1 = {
  id: 'row-103',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CC', collectionNameHe: 'CC',
  rangeStart: '500', rangeEnd: '510',
  svgCode: '', floor: '1',
  shelfLabel: '5-12', shelfLabelHe: '5-12',
};

export const ORPHAN_MISSING_SVGCODE_F2 = {
  id: 'row-104',
  libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
  collectionName: 'CHI', collectionNameHe: 'CHI',
  rangeStart: '800', rangeEnd: '850',
  svgCode: '', floor: '2',
  shelfLabel: '220 A', shelfLabelHe: '220 א',
};

// Convenience: all rows.
export const ALL_ROWS = [
  VALID_FLOOR_1,
  VALID_FLOOR_2,
  ORPHAN_BAD_SVGCODE_F1,
  ORPHAN_BAD_SVGCODE_F2,
  ORPHAN_MISSING_SVGCODE_F1,
  ORPHAN_MISSING_SVGCODE_F2,
];

// SVG-id sets: only the codes the VALID rows reference.
// Used to mock services/svg-parser.js in tests.
export const SVG_IDS_BY_FLOOR = {
  '0': new Set([]),
  '1': new Set(['cl1_106_a']),
  '2': new Set(['cy_29_a']),
};
```

- [ ] **Step 2.3: Commit fixture**

```bash
git add admin/__tests__/fixtures/orphan-fixtures.js
git commit -m "test(orphan-fixtures): add shared fixtures for sub-phase 2a tests"
```

---

## Task 3: Implement `orphan-deriver.js` (TDD)

**Files:**
- Create: `admin/components/map-editor/orphan-deriver.js`
- Create: `admin/__tests__/orphan-deriver.test.js`

- [ ] **Step 3.1: Write the failing test file**

Create `admin/__tests__/orphan-deriver.test.js`:

```js
import { jest } from '@jest/globals';
import {
  VALID_FLOOR_1, VALID_FLOOR_2,
  ORPHAN_BAD_SVGCODE_F1, ORPHAN_BAD_SVGCODE_F2,
  ORPHAN_MISSING_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F2,
  ALL_ROWS, SVG_IDS_BY_FLOOR,
} from './fixtures/orphan-fixtures.js';

describe('deriveOrphansForFloor', () => {
  let deriveOrphansForFloor;

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule('../services/svg-parser.js', () => ({
      isValidSvgCode: (code, floor) => {
        const ids = SVG_IDS_BY_FLOOR[String(floor)];
        return ids ? ids.has(code) : false;
      },
    }));
    ({ deriveOrphansForFloor } = await import('../components/map-editor/orphan-deriver.js'));
  });

  test('empty allRanges returns empty array', () => {
    expect(deriveOrphansForFloor([], '1')).toEqual([]);
  });

  test('all valid rows return empty array', () => {
    const result = deriveOrphansForFloor([VALID_FLOOR_1, VALID_FLOOR_2], '1');
    expect(result).toEqual([]);
  });

  test('one row with svgCode_not_on_floor produces one orphan card', () => {
    const result = deriveOrphansForFloor([VALID_FLOOR_1, ORPHAN_BAD_SVGCODE_F1], '1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rowId: 'row-101',
      kind: 'svgCode_not_on_floor',
      collectionName: 'KA',
      shelfLabel: '61 Z',
      svgCode: 'ka1_61_z',
    });
  });

  test('one row with missing_svgCode produces one orphan card', () => {
    const result = deriveOrphansForFloor([VALID_FLOOR_1, ORPHAN_MISSING_SVGCODE_F1], '1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rowId: 'row-103',
      kind: 'missing_svgCode',
      collectionName: 'CC',
      svgCode: '',
    });
  });

  test('mixed valid + invalid returns only invalid', () => {
    const result = deriveOrphansForFloor(ALL_ROWS, '1');
    expect(result.map(o => o.rowId).sort()).toEqual(['row-101', 'row-103']);
  });

  test('floor filtering: floor 2 orphans are not returned for floor 1', () => {
    const result = deriveOrphansForFloor(ALL_ROWS, '1');
    expect(result.map(o => o.rowId)).not.toContain('row-102');
    expect(result.map(o => o.rowId)).not.toContain('row-104');
  });

  test('floor filtering: floor 1 orphans are not returned for floor 2', () => {
    const result = deriveOrphansForFloor(ALL_ROWS, '2');
    expect(result.map(o => o.rowId)).not.toContain('row-101');
    expect(result.map(o => o.rowId)).not.toContain('row-103');
  });

  test('stable sort: same input produces same order', () => {
    const r1 = deriveOrphansForFloor(ALL_ROWS, '1');
    const r2 = deriveOrphansForFloor(ALL_ROWS, '1');
    expect(r1.map(o => o.rowId)).toEqual(r2.map(o => o.rowId));
  });

  test('sort by collectionName then shelfLabel', () => {
    const result = deriveOrphansForFloor(ALL_ROWS, '1');
    // CC comes before KA alphabetically → row-103 (CC) before row-101 (KA)
    expect(result.map(o => o.collectionName)).toEqual(['CC', 'KA']);
  });

  test('orphan card preserves Hebrew fields', () => {
    const result = deriveOrphansForFloor([ORPHAN_BAD_SVGCODE_F1], '1');
    expect(result[0]).toMatchObject({
      collectionNameHe: 'KA',
      shelfLabelHe: '61 ז',
    });
  });
});
```

- [ ] **Step 3.2: Run tests, verify they fail with module-not-found**

Run: `cd admin && npm test -- orphan-deriver.test.js 2>&1 | tail -10`
Expected: tests fail with "Cannot find module '../components/map-editor/orphan-deriver.js'" — the deriver doesn't exist yet.

- [ ] **Step 3.3: Create the deriver**

Create `admin/components/map-editor/orphan-deriver.js`:

```js
/**
 * Orphan Deriver
 *
 * Pure function that takes the full ranges array + a floor number and
 * returns the orphan rows for that floor — rows whose svgCode does not
 * resolve to a real SVG element on the declared floor (E006) OR whose
 * svgCode field is empty (E001 with field='svgCode').
 *
 * No DOM, no fetches. Wraps the data-model.js validateRow.
 *
 * @module components/map-editor/orphan-deriver
 */

import { validateRow } from '../../services/data-model.js';

/**
 * Derive orphan cards for a given floor.
 *
 * @param {Array<Object>} allRanges - The full mapping CSV in memory.
 * @param {string|number} floor - The active floor number.
 * @returns {Array<{
 *   rowId: string,
 *   kind: 'svgCode_not_on_floor' | 'missing_svgCode',
 *   collectionName: string,
 *   collectionNameHe: string,
 *   shelfLabel: string,
 *   shelfLabelHe: string,
 *   svgCode: string,
 *   rangeStart: string,
 *   rangeEnd: string,
 *   message: string
 * }>}
 */
export function deriveOrphansForFloor(allRanges, floor) {
  const floorStr = String(floor);
  const onFloor = (allRanges || []).filter(r => String(r.floor) === floorStr);
  const out = [];

  for (const row of onFloor) {
    const result = validateRow(row, allRanges, row);
    const errors = (result && result.errors) || [];

    for (const err of errors) {
      let kind = null;
      if (err.code === 'E006') {
        kind = 'svgCode_not_on_floor';
      } else if (err.code === 'E001' && err.field === 'svgCode') {
        kind = 'missing_svgCode';
      }

      if (!kind) continue;

      out.push({
        rowId: row.id,
        kind,
        collectionName: row.collectionName || '',
        collectionNameHe: row.collectionNameHe || '',
        shelfLabel: row.shelfLabel || '',
        shelfLabelHe: row.shelfLabelHe || '',
        svgCode: row.svgCode || '',
        rangeStart: row.rangeStart || '',
        rangeEnd: row.rangeEnd || '',
        message: err.message || '',
      });

      // Stop after the first matching error per row (don't double-list a row).
      break;
    }
  }

  // Stable sort by (collectionName, shelfLabel).
  out.sort((a, b) => {
    const c = (a.collectionName || '').localeCompare(b.collectionName || '');
    if (c !== 0) return c;
    return (a.shelfLabel || '').localeCompare(b.shelfLabel || '');
  });

  return out;
}
```

- [ ] **Step 3.4: Run tests, verify they pass**

Run: `cd admin && npm test -- orphan-deriver.test.js`
Expected: all 10 tests pass.

- [ ] **Step 3.5: Verify no regressions in the full data-model suite**

Run: `cd admin && npm test -- data-model.test.js data-model-svgcode-smoke.test.js`
Expected: same pass/fail signature as on `main` (the phase-1 E006 tests + smoke pass; pre-existing issue-#9 failures unchanged).

- [ ] **Step 3.6: Commit**

```bash
git add admin/components/map-editor/orphan-deriver.js admin/__tests__/orphan-deriver.test.js
git commit -m "feat(map-editor): add orphan-deriver for sub-phase 2a"
```

---

## Task 4: Add `intent` parameter to `reassign-mode.js`

**Files:**
- Modify: `admin/components/map-editor/reassign-mode.js`

The existing `startReassign` function gets an `intent: 'repair' | 'move'` parameter that selects which i18n key to use for the banner and confirm text. Existing callers (the drawer's Move button) will be updated in Task 5.

- [ ] **Step 4.1: Read the current file to confirm the lines being changed**

Run: `sed -n '1,50p' admin/components/map-editor/reassign-mode.js`
Confirm: line 5 declares the function signature; lines 13–22 build the banner; line 35 builds the confirm text.

- [ ] **Step 4.2: Edit `reassign-mode.js`**

Replace the function body with this version. Three concrete changes:

1. Add `intent` to the destructured parameters (default `'move'` for backward compatibility).
2. Banner reads `mapEditor.reassign.banner.repair` or `.move` based on intent.
3. Confirmation reads `mapEditor.reassign.confirm.repair` or `.move` based on intent. The repair confirm uses `{label}` and `{picked}`; the move confirm uses `{label}`, `{old}`, and `{new}`. We pass `oldShelfLabel` (optional, only for move) so the existing "{old}" placeholder fills.

Apply via Edit (the import line stays as-is):

Replace:
```js
export function startReassign({ rangeId, rangeLabel, shelfElements, allShelves, onConfirm, onCancel }) {
  if (active) cancel();
  active = { rangeId, rangeLabel, allShelves, onConfirm, onCancel };

  // Banner
  const banner = document.createElement('div');
  banner.className = 'map-reassign-banner';
  banner.id = 'map-reassign-banner';
  banner.innerHTML = `
    <span>📍 ${i18n.t('mapEditor.reassign.banner').replace('{rangeLabel}', rangeLabel).replace('{chooseFromList}', `<a href="#" id="map-reassign-list" class="underline">${i18n.t('mapEditor.reassign.chooseFromList')}</a>`)}</span>
    <button id="map-reassign-cancel" class="px-2 py-1 text-xs border rounded">${i18n.t('mapEditor.reassign.cancel')}</button>
  `;
```

with:
```js
export function startReassign({ rangeId, rangeLabel, oldShelfLabel, shelfElements, allShelves, onConfirm, onCancel, intent = 'move' }) {
  if (active) cancel();
  active = { rangeId, rangeLabel, oldShelfLabel, allShelves, onConfirm, onCancel, intent };

  // Banner — copy depends on intent
  const bannerKey = intent === 'repair'
    ? 'mapEditor.reassign.banner.repair'
    : 'mapEditor.reassign.banner.move';
  const banner = document.createElement('div');
  banner.className = 'map-reassign-banner';
  banner.id = 'map-reassign-banner';
  banner.innerHTML = `
    <span>📍 ${i18n.t(bannerKey)} <span class="opacity-75">(${rangeLabel})</span> — <a href="#" id="map-reassign-list" class="underline">${i18n.t('mapEditor.reassign.chooseFromList')}</a></span>
    <button id="map-reassign-cancel" class="px-2 py-1 text-xs border rounded">${i18n.t('mapEditor.reassign.cancel')}</button>
  `;
```

Then replace the `onShelfClicked` body's confirm line:
```js
const ok = window.confirm(i18n.t('mapEditor.reassign.confirm').replace('{rangeLabel}', active.rangeLabel).replace('{shelfLabel}', target));
```

with:
```js
const confirmKey = active.intent === 'repair'
  ? 'mapEditor.reassign.confirm.repair'
  : 'mapEditor.reassign.confirm.move';
const confirmText = i18n.t(confirmKey)
  .replace('{label}', active.rangeLabel)
  .replace('{picked}', target)
  .replace('{old}', active.oldShelfLabel || '')
  .replace('{new}', target);
const ok = window.confirm(confirmText);
```

And inside `openDropdownPicker`'s click handler, update its confirm too:
```js
const ok = window.confirm(`Move ${active.rangeLabel} to ${b.dataset.id}?`);
```

with:
```js
const confirmKey = active.intent === 'repair'
  ? 'mapEditor.reassign.confirm.repair'
  : 'mapEditor.reassign.confirm.move';
const confirmText = i18n.t(confirmKey)
  .replace('{label}', active.rangeLabel)
  .replace('{picked}', b.dataset.id)
  .replace('{old}', active.oldShelfLabel || '')
  .replace('{new}', b.dataset.id);
const ok = window.confirm(confirmText);
```

- [ ] **Step 4.3: Verify the file still parses**

Run: `cd admin && node --check components/map-editor/reassign-mode.js`
Expected: no output (success).

- [ ] **Step 4.4: Run any existing tests for the Map Editor that import reassign-mode**

Run: `cd admin && npm test -- map-editor`
Expected: same pass/fail signature as `main` — no new regressions.

- [ ] **Step 4.5: Commit**

```bash
git add admin/components/map-editor/reassign-mode.js
git commit -m "feat(reassign-mode): add intent parameter for repair vs move workflows"
```

---

## Task 5: Update `shelf-drawer.js` — rename Move button + pass `intent: 'move'`

**Files:**
- Modify: `admin/components/map-editor/shelf-drawer.js`
- Modify: `admin/components/map-editor.js`

The existing **Move** button label is automatically updated by Task 1's i18n change (the `mapEditor.move` value is already "Move to another shelf"). What we need to do here is pass `intent: 'move'` and `oldShelfLabel` through the `onMove` callback into `startReassign`.

- [ ] **Step 5.1: Read map-editor.js around the existing onMove callback**

Run: `sed -n '258,285p' admin/components/map-editor.js`
Confirm: the `onMove` callback in `renderDrawer` calls `startReassign({...})`.

- [ ] **Step 5.2: Edit `admin/components/map-editor.js` to pass intent and oldShelfLabel**

Find this block (around line 259):
```js
onMove: (id) => {
  const range = shelfState.materialize().find(r => r.id === id);
  if (!range) return;
  const allShelves = allRanges
    .filter(r => r.svgCode)
    .reduce((acc, r) => {
      const key = `${r.svgCode}|${r.floor}`;
      if (!acc.has(key)) acc.set(key, { svgCode: r.svgCode, floor: r.floor, label: r.shelfLabel || r.svgCode });
      return acc;
    }, new Map());
  const allShelvesList = Array.from(allShelves.values()).sort((a, b) => a.label.localeCompare(b.label));
  startReassign({
    rangeId: id,
    rangeLabel: `${range.collectionName} ${range.rangeStart}-${range.rangeEnd}`,
    shelfElements: new Map([...shelfElements].filter(([sid]) => sid !== range.svgCode)),
    allShelves: allShelvesList,
    onConfirm: ({ newSvgCode, newFloor }) => {
      const target = { svgCode: newSvgCode };
      if (newFloor !== undefined) target.floor = newFloor;
      shelfState.move(id, target);
      refreshConflicts();
      renderDrawer();
    },
    onCancel: () => { /* nothing — banner already removed */ },
  });
},
```

Add two lines: `intent: 'move'` and `oldShelfLabel: range.shelfLabel || range.svgCode || ''` to the `startReassign` arguments. Final shape:

```js
startReassign({
  rangeId: id,
  rangeLabel: `${range.collectionName} ${range.rangeStart}-${range.rangeEnd}`,
  oldShelfLabel: range.shelfLabel || range.svgCode || '',
  shelfElements: new Map([...shelfElements].filter(([sid]) => sid !== range.svgCode)),
  allShelves: allShelvesList,
  onConfirm: ({ newSvgCode, newFloor }) => {
    const target = { svgCode: newSvgCode };
    if (newFloor !== undefined) target.floor = newFloor;
    shelfState.move(id, target);
    refreshConflicts();
    // Reopen-destination behavior for move intent: if the destination
    // shelf is on the current floor, shift the drawer's selection to
    // it so the librarian sees the moved range in its new context. If
    // the destination is on a different floor, the drawer closes
    // (renderDrawer with no current-floor selection) and the librarian
    // can switch tabs to inspect.
    if (shelfElements.has(newSvgCode)) {
      shelfState.selectSingle(newSvgCode);
      applySelection(shelfElements, shelfState.selection().shelfIds);
    }
    renderDrawer();
  },
  onCancel: () => { /* nothing — banner already removed */ },
  intent: 'move',
});
```

`shelf-drawer.js` itself does not change in this task — its **Move** button text reads from `mapEditor.move` whose value was updated in Task 1.

- [ ] **Step 5.3: Verify the file still parses**

Run: `cd admin && node --check components/map-editor.js`
Expected: no output.

- [ ] **Step 5.4: Verify map-editor tests still pass**

Run: `cd admin && npm test -- map-editor`
Expected: same pass/fail signature as `main`.

- [ ] **Step 5.5: Commit**

```bash
git add admin/components/map-editor.js
git commit -m "feat(map-editor): pass intent='move' to existing reassign flow"
```

---

## Task 6: Implement `orphan-card.js` (TDD)

**Files:**
- Create: `admin/components/map-editor/orphan-card.js`
- Create: `admin/__tests__/orphan-card.test.js`

A pure render function that returns a DOM node for one orphan row.

- [ ] **Step 6.1: Write failing tests**

Create `admin/__tests__/orphan-card.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1 } from './fixtures/orphan-fixtures.js';

describe('renderOrphanCard', () => {
  let renderOrphanCard;

  beforeEach(async () => {
    jest.resetModules();
    ({ renderOrphanCard } = await import('../components/map-editor/orphan-card.js'));
  });

  test('renders collection name and shelf label', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    expect(card.textContent).toContain('KA');
    expect(card.textContent).toContain('61 Z');
  });

  test('renders the bad svgCode highlighted', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    const badCode = card.querySelector('.map-orphan-card__bad-svgcode');
    expect(badCode).not.toBeNull();
    expect(badCode.textContent).toContain('ka1_61_z');
  });

  test('renders [empty] for missing svgCode', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_MISSING_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    const badCode = card.querySelector('.map-orphan-card__bad-svgcode');
    expect(badCode.textContent).toContain('[empty]');
  });

  test('isActive=true adds active class', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: true,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    expect(card.classList.contains('map-orphan-card--active')).toBe(true);
  });

  test('isActive=false does not add active class', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    expect(card.classList.contains('map-orphan-card--active')).toBe(false);
  });

  test('clicking primary button fires onSetShelf with rowId', () => {
    const onSetShelf = jest.fn();
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf,
      onEditElsewhere: jest.fn(),
    });
    card.querySelector('[data-action="set-shelf"]').click();
    expect(onSetShelf).toHaveBeenCalledWith('row-101');
  });

  test('clicking secondary button fires onEditElsewhere with rowId', () => {
    const onEditElsewhere = jest.fn();
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere,
    });
    card.querySelector('[data-action="edit-elsewhere"]').click();
    expect(onEditElsewhere).toHaveBeenCalledWith('row-101');
  });

  test('readOnly=true disables primary button', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      readOnly: true,
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    const btn = card.querySelector('[data-action="set-shelf"]');
    expect(btn.disabled).toBe(true);
    expect(btn.title || '').not.toBe('');
  });

  test('locale=he uses Hebrew collection name and shelf label', () => {
    const orphan = { ...ORPHAN_BAD_SVGCODE_F1, collectionNameHe: 'אוסף', shelfLabelHe: 'מדף' };
    const card = renderOrphanCard({
      orphan,
      isActive: false,
      locale: 'he',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    expect(card.textContent).toContain('אוסף');
    expect(card.textContent).toContain('מדף');
  });
});
```

- [ ] **Step 6.2: Run tests, verify failure with module-not-found**

Run: `cd admin && npm test -- orphan-card.test.js 2>&1 | tail -10`
Expected: tests fail because `orphan-card.js` doesn't exist.

- [ ] **Step 6.3: Create the card component**

Create `admin/components/map-editor/orphan-card.js`:

```js
/**
 * Orphan Card — pure render function for one orphan row.
 *
 * Returns a DOM element. Wires two callbacks: onSetShelf (primary,
 * "Set shelf on map") and onEditElsewhere (secondary, "Edit in CSV
 * editor").
 *
 * @module components/map-editor/orphan-card
 */

import i18n from '../../i18n.js?v=5';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * @param {{
 *   orphan: Object,
 *   isActive: boolean,
 *   locale: 'en' | 'he',
 *   readOnly?: boolean,
 *   onSetShelf: (rowId: string) => void,
 *   onEditElsewhere: (rowId: string) => void
 * }} args
 * @returns {HTMLElement}
 */
export function renderOrphanCard({ orphan, isActive, locale, readOnly, onSetShelf, onEditElsewhere }) {
  const card = document.createElement('div');
  card.className = `map-orphan-card${isActive ? ' map-orphan-card--active' : ''}`;
  card.dataset.rowId = orphan.rowId;

  const collection = locale === 'he'
    ? (orphan.collectionNameHe || orphan.collectionName || '')
    : (orphan.collectionName || '');
  const shelfLabel = locale === 'he'
    ? (orphan.shelfLabelHe || orphan.shelfLabel || '')
    : (orphan.shelfLabel || '');

  const range = orphan.rangeStart || orphan.rangeEnd
    ? `${orphan.rangeStart || ''} – ${orphan.rangeEnd || ''}`
    : '';

  const badCodeText = orphan.svgCode || '[empty]';
  const kindKey = orphan.kind === 'svgCode_not_on_floor'
    ? 'mapEditor.orphan.card.kind.wrongSvgCode'
    : 'mapEditor.orphan.card.kind.missingSvgCode';

  const setShelfDisabled = readOnly ? 'disabled' : '';
  const setShelfTitle = readOnly ? i18n.t('mapEditor.orphan.card.readOnly') : '';

  card.innerHTML = `
    <div class="map-orphan-card__header">
      <span class="map-orphan-card__collection">${escapeHtml(collection)}</span>
      <span class="map-orphan-card__shelf">${escapeHtml(shelfLabel)}</span>
    </div>
    <div class="map-orphan-card__body">
      <span class="map-orphan-card__range">${escapeHtml(range)}</span>
      <span class="map-orphan-card__bad-svgcode">${escapeHtml(badCodeText)}</span>
      <span class="map-orphan-card__kind-badge">${escapeHtml(i18n.t(kindKey))}</span>
    </div>
    <div class="map-orphan-card__actions">
      <button type="button" data-action="set-shelf" ${setShelfDisabled} title="${escapeHtml(setShelfTitle)}" class="map-orphan-card__primary">${escapeHtml(i18n.t('mapEditor.orphan.card.setShelf'))}</button>
      <button type="button" data-action="edit-elsewhere" class="map-orphan-card__secondary">${escapeHtml(i18n.t('mapEditor.orphan.card.editElsewhere'))}</button>
    </div>
  `;

  if (!readOnly) {
    card.querySelector('[data-action="set-shelf"]').addEventListener('click', () => onSetShelf(orphan.rowId));
  }
  card.querySelector('[data-action="edit-elsewhere"]').addEventListener('click', () => onEditElsewhere(orphan.rowId));

  return card;
}
```

- [ ] **Step 6.4: Run tests, verify pass**

Run: `cd admin && npm test -- orphan-card.test.js`
Expected: all 9 tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add admin/components/map-editor/orphan-card.js admin/__tests__/orphan-card.test.js
git commit -m "feat(map-editor): add orphan-card render component for sub-phase 2a"
```

---

## Task 7: Implement `orphan-panel.js` (TDD)

**Files:**
- Create: `admin/components/map-editor/orphan-panel.js`
- Create: `admin/__tests__/orphan-panel.test.js`

The right-side drawer container. Manages mount/open/close, the active card, and post-repair card removal.

- [ ] **Step 7.1: Write failing tests**

Create `admin/__tests__/orphan-panel.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import {
  ORPHAN_BAD_SVGCODE_F1, ORPHAN_BAD_SVGCODE_F2,
  ORPHAN_MISSING_SVGCODE_F1,
} from './fixtures/orphan-fixtures.js';

describe('orphan-panel', () => {
  let mount, open, close, setActiveCard, markRepaired;
  let host;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="orphan-host"></div>';
    host = document.getElementById('orphan-host');
    ({ mount, open, close, setActiveCard, markRepaired } = await import('../components/map-editor/orphan-panel.js'));
    mount('orphan-host');
  });

  test('mount + open([]) shows empty state', () => {
    open([], { floor: '1', locale: 'en', readOnly: false });
    const panel = host.querySelector('.map-orphan-panel');
    expect(panel).not.toBeNull();
    expect(panel.classList.contains('map-orphan-panel--open')).toBe(true);
    expect(host.querySelector('.map-orphan-panel__empty')).not.toBeNull();
  });

  test('open(orphans) renders one card per orphan in given order', () => {
    const orphans = [ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1];
    open(orphans, { floor: '1', locale: 'en', readOnly: false });
    const cards = host.querySelectorAll('.map-orphan-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].dataset.rowId).toBe('row-101');
    expect(cards[1].dataset.rowId).toBe('row-103');
  });

  test('close() hides the panel', () => {
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    close();
    const panel = host.querySelector('.map-orphan-panel');
    expect(panel.classList.contains('map-orphan-panel--open')).toBe(false);
  });

  test('setActiveCard highlights only that card', () => {
    open([ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    setActiveCard('row-103');
    const cards = host.querySelectorAll('.map-orphan-card');
    expect(cards[0].classList.contains('map-orphan-card--active')).toBe(false);
    expect(cards[1].classList.contains('map-orphan-card--active')).toBe(true);
  });

  test('setActiveCard(null) clears highlight on all cards', () => {
    open([ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    setActiveCard('row-101');
    setActiveCard(null);
    expect(host.querySelectorAll('.map-orphan-card--active')).toHaveLength(0);
  });

  test('markRepaired removes the card from the panel', () => {
    open([ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    markRepaired('row-101');
    const cards = host.querySelectorAll('.map-orphan-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.rowId).toBe('row-103');
  });

  test('marking the last card shows the all-repaired announcement', () => {
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    markRepaired('row-101');
    const announce = host.querySelector('[aria-live="polite"]');
    expect(announce).not.toBeNull();
    expect(announce.textContent.length).toBeGreaterThan(0);
  });

  test('re-open(newList) swaps content cleanly', () => {
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    open([ORPHAN_BAD_SVGCODE_F2], { floor: '2', locale: 'en', readOnly: false });
    const cards = host.querySelectorAll('.map-orphan-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.rowId).toBe('row-102');
  });

  test('Esc key closes the panel when no active card', () => {
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const panel = host.querySelector('.map-orphan-panel');
    expect(panel.classList.contains('map-orphan-panel--open')).toBe(false);
  });

  test('panel exposes onSetShelf and onEditElsewhere event subscribers', () => {
    const setShelfSpy = jest.fn();
    const editElsewhereSpy = jest.fn();
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false, onSetShelf: setShelfSpy, onEditElsewhere: editElsewhereSpy });
    host.querySelector('[data-action="set-shelf"]').click();
    expect(setShelfSpy).toHaveBeenCalledWith('row-101');
    host.querySelector('[data-action="edit-elsewhere"]').click();
    expect(editElsewhereSpy).toHaveBeenCalledWith('row-101');
  });
});
```

- [ ] **Step 7.2: Run tests, verify failure**

Run: `cd admin && npm test -- orphan-panel.test.js 2>&1 | tail -10`
Expected: tests fail because `orphan-panel.js` doesn't exist.

- [ ] **Step 7.3: Create the panel container**

Create `admin/components/map-editor/orphan-panel.js`:

```js
/**
 * Orphan Panel — right-side drawer for the Map Editor.
 *
 * Manages mount, open/close, active-card highlight, and per-row
 * removal after a successful repair.
 *
 * Public API:
 *   mount(hostId)
 *   open(orphans, { floor, locale, readOnly, onSetShelf, onEditElsewhere })
 *   close()
 *   setActiveCard(rowId | null)
 *   markRepaired(rowId)
 *
 * @module components/map-editor/orphan-panel
 */

import i18n from '../../i18n.js?v=5';
import { renderOrphanCard } from './orphan-card.js?v=1';

let host = null;
let panel = null;
let listEl = null;
let currentOptions = null;
let currentOrphans = [];
let activeRowId = null;
let escListener = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function renderShell(floor) {
  const title = i18n.t('mapEditor.orphan.panel.title');
  return `
    <div class="map-orphan-panel__header">
      <h3 class="map-orphan-panel__title">${escapeHtml(title)}</h3>
      <button type="button" class="map-orphan-panel__close" data-action="close" aria-label="Close">×</button>
    </div>
    <div class="map-orphan-panel__list" role="list"></div>
    <div class="map-orphan-panel__announce" aria-live="polite"></div>
  `;
}

function renderEmptyState(floor) {
  const empty = i18n.t('mapEditor.orphan.panel.empty').replace('{n}', String(floor));
  return `<div class="map-orphan-panel__empty">${escapeHtml(empty)}</div>`;
}

function renderCards(orphans, options) {
  listEl.innerHTML = '';
  for (const orphan of orphans) {
    const card = renderOrphanCard({
      orphan,
      isActive: orphan.rowId === activeRowId,
      locale: options.locale,
      readOnly: options.readOnly,
      onSetShelf: rowId => {
        if (typeof options.onSetShelf === 'function') options.onSetShelf(rowId);
      },
      onEditElsewhere: rowId => {
        if (typeof options.onEditElsewhere === 'function') options.onEditElsewhere(rowId);
      },
    });
    card.setAttribute('role', 'listitem');
    listEl.appendChild(card);
  }
}

function attachEsc() {
  if (escListener) return;
  escListener = e => {
    if (e.key !== 'Escape') return;
    if (activeRowId !== null) return; // mid-repair — let the reassign mode handle Esc
    close();
  };
  document.addEventListener('keydown', escListener);
}

function detachEsc() {
  if (!escListener) return;
  document.removeEventListener('keydown', escListener);
  escListener = null;
}

export function mount(hostId) {
  host = document.getElementById(hostId);
  if (!host) {
    throw new Error(`orphan-panel.mount: host element #${hostId} not found`);
  }
  panel = document.createElement('aside');
  panel.className = 'map-orphan-panel';
  host.appendChild(panel);
  panel.innerHTML = renderShell(0);
  listEl = panel.querySelector('.map-orphan-panel__list');
  panel.querySelector('[data-action="close"]').addEventListener('click', close);
}

export function open(orphans, options = {}) {
  if (!panel) throw new Error('orphan-panel.open called before mount');
  currentOrphans = orphans.slice();
  currentOptions = options;
  activeRowId = null;
  panel.innerHTML = renderShell(options.floor);
  listEl = panel.querySelector('.map-orphan-panel__list');
  panel.querySelector('[data-action="close"]').addEventListener('click', close);
  if (orphans.length === 0) {
    listEl.innerHTML = '';
    listEl.insertAdjacentHTML('beforebegin', renderEmptyState(options.floor));
  } else {
    renderCards(orphans, options);
  }
  panel.classList.add('map-orphan-panel--open');
  attachEsc();
}

export function close() {
  if (!panel) return;
  panel.classList.remove('map-orphan-panel--open');
  activeRowId = null;
  detachEsc();
}

export function setActiveCard(rowId) {
  activeRowId = rowId;
  if (!listEl) return;
  if (panel) {
    if (rowId !== null && rowId !== undefined) {
      panel.classList.add('map-orphan-panel--reassigning');
    } else {
      panel.classList.remove('map-orphan-panel--reassigning');
    }
  }
  for (const card of listEl.querySelectorAll('.map-orphan-card')) {
    if (card.dataset.rowId === rowId) {
      card.classList.add('map-orphan-card--active');
      card.scrollIntoView({ block: 'nearest' });
    } else {
      card.classList.remove('map-orphan-card--active');
    }
  }
}

export function markRepaired(rowId) {
  if (!listEl) return;
  const card = listEl.querySelector(`.map-orphan-card[data-row-id="${rowId}"]`);
  if (card) card.remove();
  currentOrphans = currentOrphans.filter(o => o.rowId !== rowId);
  if (activeRowId === rowId) {
    // Auto-advance to the next card, if any.
    const next = listEl.querySelector('.map-orphan-card');
    activeRowId = next ? next.dataset.rowId : null;
    if (next) next.classList.add('map-orphan-card--active');
  }
  if (currentOrphans.length === 0) {
    const announce = panel.querySelector('.map-orphan-panel__announce');
    if (announce) announce.textContent = i18n.t('mapEditor.orphan.panel.allRepaired');
    setTimeout(() => close(), 1500);
  }
}
```

- [ ] **Step 7.4: Run tests, verify pass**

Run: `cd admin && npm test -- orphan-panel.test.js`
Expected: all 10 tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add admin/components/map-editor/orphan-panel.js admin/__tests__/orphan-panel.test.js
git commit -m "feat(map-editor): add orphan-panel right-side drawer for sub-phase 2a"
```

---

## Task 8: Wire the panel into `map-editor.js`

**Files:**
- Modify: `admin/components/map-editor.js`

Five integration points: import the new modules, mount the panel, make the badge clickable, refresh on floor change, diff after save.

- [ ] **Step 8.1: Add imports**

In `admin/components/map-editor.js`, add these imports near the existing map-editor sub-module imports (after line 11):

```js
import { deriveOrphansForFloor } from './map-editor/orphan-deriver.js?v=1';
import { mount as mountOrphanPanel, open as openOrphanPanel, close as closeOrphanPanel, setActiveCard as setOrphanActive, markRepaired as markOrphanRepaired } from './map-editor/orphan-panel.js?v=1';
import i18nDefault from '../i18n.js?v=5';  // already imported as i18n; this is just to access getLocale if needed
```

(If `i18n` is already imported, skip the third line. `getLocale` is available on the existing `i18n` import — verify in Step 8.2.)

- [ ] **Step 8.2: Add panel mount in `initMapEditor`**

Find the existing line:
```js
mountDrawer('map-drawer');
```
(around line 409 in `initMapEditor`).

Immediately after it, add:
```js
const orphanHost = document.createElement('div');
orphanHost.id = 'map-orphan-host';
container.querySelector('#map-canvas').appendChild(orphanHost);
mountOrphanPanel('map-orphan-host');
```

- [ ] **Step 8.3: Make the orphan badge clickable**

Find this block in `renderFloorTabs` (around line 145):
```js
badge.addEventListener('click', (e) => {
  e.stopPropagation();
  window.location.hash = `#csv-editor?orphans=floor=${n}`;
  // Also switch views — the deep-link is meant to navigate, not just bookmark.
  const navCsv = document.getElementById('nav-csv');
  if (navCsv) navCsv.click();
});
```

Replace with:
```js
badge.addEventListener('click', (e) => {
  e.stopPropagation();
  // If clicked on the inactive floor's badge, switch to that floor first.
  if (n !== currentFloor) {
    saveActiveFloor(n);
    renderFloorTabs(n);
    window.dispatchEvent(new CustomEvent('mapeditor:floor-changed', { detail: { floor: n } }));
  }
  // Open the orphan panel for the (now) active floor.
  refreshOrphanPanel({ openIfClosed: true });
});
```

- [ ] **Step 8.4: Add a `refreshOrphanPanel` helper**

Add this function near the other helpers (e.g., after `computeOrphanCounts` at line 111):

```js
function refreshOrphanPanel({ openIfClosed = false } = {}) {
  if (currentFloor === null || !allRanges) return;
  const orphans = deriveOrphansForFloor(allRanges, currentFloor);
  const locale = (i18n.getLocale && i18n.getLocale()) || 'en';
  const options = {
    floor: currentFloor,
    locale,
    readOnly: false, // map-editor uses shelfState.permission per row; orphan-card honors readOnly per-card too — refined later if needed
    onSetShelf: handleOrphanSetShelf,
    onEditElsewhere: handleOrphanEditElsewhere,
  };
  if (openIfClosed || isOrphanPanelOpen()) {
    openOrphanPanel(orphans, options);
  }
}

function isOrphanPanelOpen() {
  const el = document.querySelector('.map-orphan-panel');
  return el ? el.classList.contains('map-orphan-panel--open') : false;
}

function handleOrphanSetShelf(rowId) {
  const range = shelfState.materialize().find(r => r.id === rowId);
  if (!range) return;
  setOrphanActive(rowId);
  const allShelves = allRanges
    .filter(r => r.svgCode)
    .reduce((acc, r) => {
      const key = `${r.svgCode}|${r.floor}`;
      if (!acc.has(key)) acc.set(key, { svgCode: r.svgCode, floor: r.floor, label: r.shelfLabel || r.svgCode });
      return acc;
    }, new Map());
  const allShelvesList = Array.from(allShelves.values()).sort((a, b) => a.label.localeCompare(b.label));
  startReassign({
    rangeId: rowId,
    rangeLabel: `${range.collectionName} ${range.rangeStart}-${range.rangeEnd}`,
    oldShelfLabel: range.shelfLabel || range.svgCode || '',
    shelfElements,
    allShelves: allShelvesList,
    onConfirm: ({ newSvgCode, newFloor }) => {
      const target = { svgCode: newSvgCode };
      if (newFloor !== undefined) target.floor = newFloor;
      shelfState.move(rowId, target);
      refreshConflicts();
      saveCsv().then(() => {
        markOrphanRepaired(rowId);
      });
    },
    onCancel: () => {
      setOrphanActive(null);
    },
    intent: 'repair',
  });
}

function handleOrphanEditElsewhere(rowId) {
  // 2a soft deep-link: filter CSV editor by floor's empty-svgCode rows.
  // 2b will widen this to use the validator's findings precisely.
  window.location.hash = `#csv-editor?orphans=floor=${currentFloor}`;
  const navCsv = document.getElementById('nav-csv');
  if (navCsv) navCsv.click();
}
```

- [ ] **Step 8.5: Refresh panel on floor change**

Find the existing line at the bottom of `loadFloor`:
```js
renderFloorTabs(currentFloor);
```

Add immediately after it:
```js
// If the orphan panel is open, refresh its contents for the new floor.
if (isOrphanPanelOpen()) {
  refreshOrphanPanel({ openIfClosed: false });
}
```

- [ ] **Step 8.6: Refresh panel after every successful save**

Find the `saveCsv` function. After this line:
```js
allRanges = merged;
```

Add:
```js
// Refresh orphan panel so newly-resolved rows animate out and any new
// orphans appear. markOrphanRepaired is called from handleOrphanSetShelf
// for the specific row that was just repaired; the wholesale refresh
// covers the case where the save included edits to other rows.
if (isOrphanPanelOpen()) {
  refreshOrphanPanel({ openIfClosed: false });
}
```

- [ ] **Step 8.7: Verify the file still parses**

Run: `cd admin && node --check components/map-editor.js`
Expected: no output.

- [ ] **Step 8.8: Run all map-editor tests + the new suites**

Run: `cd admin && npm test -- map-editor orphan`
Expected: all related tests pass; no new regressions.

- [ ] **Step 8.9: Commit**

```bash
git add admin/components/map-editor.js
git commit -m "feat(map-editor): wire orphan panel — badge click, floor change, post-save refresh"
```

---

## Task 9: Add CSS for the panel and cards

**Files:**
- Modify: `admin/styles/app.css`

- [ ] **Step 9.1: Append CSS to `admin/styles/app.css`**

```css
/* ============================================================
   Issue #14 phase 2a — Map Editor orphan panel
   ============================================================ */

.map-orphan-panel {
  position: absolute;
  inset-block-start: 0;
  inset-block-end: 0;
  inset-inline-end: 0;
  width: 340px;
  background: #fff;
  border-inline-start: 1px solid #e2e8f0;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 200ms ease;
  z-index: 20;
  overflow-y: auto;
}

.map-orphan-panel--open {
  transform: translateX(0);
}

[dir="rtl"] .map-orphan-panel {
  transform: translateX(-100%);
}

[dir="rtl"] .map-orphan-panel--open {
  transform: translateX(0);
}

.map-orphan-panel__header {
  padding: 12px 16px;
  border-block-end: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fafafa;
}

.map-orphan-panel__title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: #1f2937;
}

.map-orphan-panel__close {
  background: transparent;
  border: 0;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
  color: #6b7280;
}

.map-orphan-panel__close:hover {
  color: #1f2937;
}

.map-orphan-panel__list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.map-orphan-panel__empty {
  padding: 24px 16px;
  color: #6b7280;
  font-size: 13px;
  text-align: center;
}

.map-orphan-panel__announce {
  padding: 12px 16px;
  background: #ecfdf5;
  color: #047857;
  font-size: 13px;
  text-align: center;
  border-block-start: 1px solid #d1fae5;
}

.map-orphan-card {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.map-orphan-card--active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.map-orphan-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.map-orphan-card__collection {
  font-weight: 600;
  font-size: 13px;
  color: #1f2937;
}

.map-orphan-card__shelf {
  font-size: 12px;
  color: #6b7280;
}

.map-orphan-card__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.map-orphan-card__range {
  color: #6b7280;
}

.map-orphan-card__bad-svgcode {
  background: #fef2f2;
  color: #b91c1c;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.map-orphan-card__kind-badge {
  background: #fff7ed;
  color: #b45309;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}

.map-orphan-card__actions {
  display: flex;
  gap: 6px;
  margin-block-start: 4px;
}

.map-orphan-card__primary {
  flex: 1;
  background: #3b82f6;
  color: #fff;
  border: 0;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.map-orphan-card__primary:hover:not(:disabled) {
  background: #2563eb;
}

.map-orphan-card__primary:disabled {
  background: #cbd5e1;
  color: #94a3b8;
  cursor: not-allowed;
}

.map-orphan-card__secondary {
  background: transparent;
  color: #2563eb;
  border: 1px solid #2563eb;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
}

.map-orphan-card__secondary:hover {
  background: #eff6ff;
}

/* During an active reassign (panel knows via setActiveCard), subdue
   the inactive cards' primary buttons so the librarian can't click
   another orphan mid-pick. The active card stays interactive. */
.map-orphan-panel--reassigning .map-orphan-card:not(.map-orphan-card--active) .map-orphan-card__primary {
  opacity: 0.4;
  pointer-events: none;
}

/* Narrow viewport: collapse the panel to a small toggle. */
@media (max-width: 900px) {
  .map-orphan-panel {
    width: 280px;
  }
}
```

- [ ] **Step 9.2: Verify CSS file loads (no syntax errors)**

Run: `node -e "const fs=require('fs'); const css=fs.readFileSync('admin/styles/app.css','utf8'); const open=(css.match(/{/g)||[]).length; const close=(css.match(/}/g)||[]).length; if (open !== close) { console.error('Brace mismatch:', open, '!=', close); process.exit(1); } else { console.log('OK', open, 'rules'); }"`
Expected: `OK <count> rules` — paired braces.

- [ ] **Step 9.3: Commit**

```bash
git add admin/styles/app.css
git commit -m "style(map-editor): add CSS for orphan panel and cards"
```

---

## Task 10: Add Playwright E2E test

**Files:**
- Create: `e2e/tests/map-editor-orphan-panel.spec.ts`

The existing e2e suite already mounts the admin and has fixtures. Add one e2e spec covering the happy path.

- [ ] **Step 10.1: Inspect the existing e2e fixture pattern**

Run: `ls e2e/tests/ && head -40 e2e/tests/$(ls e2e/tests/ | grep map-editor | head -1)`
Purpose: confirm the import / setup pattern (Playwright fixtures, page object models, auth fixtures).

- [ ] **Step 10.2: Create the new spec file**

Create `e2e/tests/map-editor-orphan-panel.spec.ts` with the happy-path test. The test logs in as admin, navigates to the Map Editor, finds a floor with an orphan badge (one will exist as long as the live CSV has any unresolved svgCodes), opens the panel, picks a real shelf, confirms, asserts the card disappears.

```ts
import { test, expect } from '@playwright/test';

test.describe('Map Editor — orphan panel (sub-phase 2a)', () => {
  test('opens panel from badge, repairs an orphan via Set shelf on map', async ({ page }) => {
    // Existing project pattern uses page.goto with the admin URL and an auth fixture.
    // Adapt to whatever fixtures the rest of the e2e suite uses.
    await page.goto('/admin/');

    // Wait for the floor tabs to render.
    await page.waitForSelector('#map-floor-tabs');

    // Find an orphan badge on any floor tab.
    const badge = page.locator('.map-orphan-badge').first();
    if (await badge.count() === 0) {
      test.skip(true, 'no orphan badges on the live data — happy path requires at least one');
      return;
    }

    await badge.click();
    await expect(page.locator('.map-orphan-panel--open')).toBeVisible();

    const firstCard = page.locator('.map-orphan-card').first();
    const rowIdBefore = await firstCard.getAttribute('data-row-id');
    expect(rowIdBefore).not.toBeNull();

    // Click the primary action.
    await firstCard.locator('[data-action="set-shelf"]').click();

    // Reassign banner should appear.
    await expect(page.locator('#map-reassign-banner')).toBeVisible();

    // Click any clickable shelf on the map.
    const targetShelf = page.locator('.map-shelf').first();
    page.once('dialog', async dialog => {
      // Confirmation prompt — accept.
      await dialog.accept();
    });
    await targetShelf.click();

    // Banner should be gone after a successful pick.
    await expect(page.locator('#map-reassign-banner')).toHaveCount(0);

    // The repaired card should no longer be in the panel.
    await expect(page.locator(`.map-orphan-card[data-row-id="${rowIdBefore}"]`)).toHaveCount(0);
  });
});
```

(The exact auth setup mirrors whatever pattern the existing `e2e/` suite already uses. If it requires a `BasePage` import or a `loginAs` helper, copy the same pattern.)

- [ ] **Step 10.3: Run the new e2e spec locally**

Run: `npx playwright test e2e/tests/map-editor-orphan-panel.spec.ts --project=chromium 2>&1 | tail -20`
Expected: either the test passes, or it skips (if the live CSV has 0 orphans). Either is acceptable.

- [ ] **Step 10.4: Run the full e2e suite to confirm no regressions**

Run: `npx playwright test 2>&1 | tail -10`
Expected: same pass/fail signature as `main` — the existing 113 tests pass.

- [ ] **Step 10.5: Commit**

```bash
git add e2e/tests/map-editor-orphan-panel.spec.ts
git commit -m "test(e2e): add map-editor orphan-panel happy-path spec"
```

---

## Task 11: Push branch and open PR

**Files:** none.

- [ ] **Step 11.1: Verify clean commit history**

Run: `git log --oneline main..HEAD`
Expected: 9 commits — i18n, fixtures, deriver, reassign-mode, map-editor (move intent), card, panel, map-editor wiring, CSS, e2e (some commits may be merged depending on order).

- [ ] **Step 11.2: Push the branch**

Run: `git push -u origin feat/issue-14-phase-2a`
Expected: branch created on origin.

- [ ] **Step 11.3: Open the PR**

```bash
gh pr create --title "feat(map-editor): add orphan-repair right-side panel (issue #14 phase 2a)" --body "$(cat <<'EOF'
## Summary

Sub-phase 2a of issue #14. Adds a right-side panel to the Map Editor that lists orphan rows (rows whose svgCode does not resolve on the active floor) and lets the librarian repair each one by clicking the correct shelf on the floor map. Differentiates the repair workflow from the existing range-relocation workflow ("Move to another shelf") via separate labels, banner copy, and confirmation copy.

## What this PR does

- New `orphan-deriver.js` — pure function projecting validator findings into panel-friendly cards.
- New `orphan-card.js` — single-card render with `Set shelf on map` (primary) and `Edit in CSV editor` (secondary) actions.
- New `orphan-panel.js` — right-side drawer container (`mount`/`open`/`close`/`setActiveCard`/`markRepaired`).
- `map-editor.js` — wires badge click → panel; refreshes on floor change and after every save.
- `reassign-mode.js` — accepts `intent: 'repair' | 'move'`; banner and confirmation copy switch on intent.
- `shelf-drawer.js` "Move" button label changes to "Move to another shelf" (via i18n update).
- New CSS for the panel and cards; positioning uses logical properties so it follows reading direction.
- Tests: 10 unit tests (deriver), 9 component tests (card), 10 component tests (panel), 1 e2e happy-path.

## What this PR does NOT do

- No widening of `#csv-editor?orphans=floor=N` deep-link to use validator findings — sub-phase 2b.
- No CSS row indicator in the CSV editor — sub-phase 2b.
- No Errors Dashboard Fix-dialog enrichment — sub-phase 2c.
- No save-time gating — phase 3.
- No role-based exposure decision (admin vs editor) — orchestrator-level concern, not in 2a.

## Test plan

- [x] All Jest unit + component tests pass.
- [x] E2E happy-path test passes (or skips gracefully when live data has 0 orphans).
- [x] Full admin Jest suite shows the same pass/fail signature as `main` — no new regressions beyond pre-existing issue #9.
- [ ] After merge + deploy, hard-reload admin. With at least one orphan in the live CSV, the badge should be clickable, the panel should open with cards, "Set shelf on map" should drive the existing reassign flow with the new banner copy, and a successful repair should remove the card and (if last) show "all repaired" briefly before the panel auto-closes.

## Rollback

Pre-feature tag `pre/issue-14-phase-2a` (local) and pre-merge `main` (origin) both contain the prior state. Revert via the merge commit if a regression appears. The PR is strictly additive on the Map Editor side — no structural changes to existing components — so revert is surgical.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 11.4: Stop here — do NOT merge**

Phase 2a's PR opens for review. Wait for the human to:
1. Review the diff in GitHub.
2. Pull, deploy via redeploy.sh, and verify the panel works in the live admin.
3. Merge manually after smoke-test reasoning.
