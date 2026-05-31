# Map Editor Side-Panel Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Map Editor's bottom drawer with a persistent, direction-aware side panel (larger map + editing together), fixing the drawer-lifecycle bug cluster in the same effort.

**Architecture:** Five independently-shippable, failing-test-first PRs. Phases 1–4 fix the state/data/validation bugs **on the current bottom drawer** so they are bisectable and proven green. Phase 5 moves the now-correct surface into a CSS-Grid side panel (`#map-editor-split`) that lives **outside** `#map-canvas`, with a four-mode panel (`idle | shelf | reassign | triage`). One finalized end-state; phased only for safe rollout.

**Tech Stack:** Vanilla ES modules (no framework), CSS Grid + logical/`dir`-driven layout, Jest (jsdom) unit tests, Playwright e2e. AWS S3 + CloudFront static hosting; `redeploy.sh` deploy.

**Spec:** `docs/superpowers/specs/2026-05-31-map-editor-side-panel-layout-design.md`

---

## File structure

**Phases 1–4 (bug fixes, current drawer):**
- `admin/components/map-editor.js` — `loadMappingCsv` cache flag (#91); `saveCsv` calls `commit()` (#86); `onChange` stops full re-render (#86).
- `admin/components/map-editor/shelf-state.js` — `commit()`, add-safe `move`/`delete` (#86/#92).
- `admin/components/map-editor/shelf-drawer.js` — extract `applyRowValidation`; in-place update path (#86).
- `admin/components/map-editor/range-validation.js` — same-shelf/same-collection sub-range rule (#87).
- Tests: `admin/__tests__/shelf-state.test.js`, `admin/__tests__/shelf-drawer.test.js`, `admin/__tests__/map-editor-csv-cache.test.js` (new), `admin/__tests__/range-validation.test.js`.

**Phase 5 (layout):**
- `admin/components/map-editor.js` — new scaffold (`#map-editor-split`), mode orchestration, `fitMapEditorViewport` stays height-only.
- `admin/components/map-editor/side-panel.js` (new) — the panel host + mode router (absorbs `shelf-drawer.js`).
- `admin/components/map-editor/shelf-card.js` (new) — vertical stacked per-entry card (replaces the grid row).
- `admin/components/map-editor/reassign-mode.js` — instruction strip over the map; mode read from `shelfState`.
- `admin/components/map-editor/orphan-panel.js` — becomes the `triage` mode renderer inside the panel.
- `admin/styles/app.css` — `#map-editor-split` grid; delete `translateX` parking + `overflow-x:hidden`; collapse + responsive.
- `admin/i18n/en.json`, `admin/i18n/he.json` — plain-language strings (spec §6.5).
- Tests: `admin/__tests__/side-panel.test.js` (new), `admin/__tests__/shelf-card.test.js` (new); e2e rewrites/rebaselines (spec §8).

> **Cache-bust rule (every phase):** when you change an ES module, bump its `?v=` in the importer (e.g. `shelf-state.js?v=1` → `?v=2` in `map-editor.js`). Otherwise browsers serve stale bodies (same class as #91).

---

## Phase 1 — #91: `mapping.csv` fetched without `cache:'no-cache'`

### Task 1.1: Guard the CSV fetch cache mode

**Files:**
- Test: `admin/__tests__/map-editor-csv-cache.test.js` (create)
- Modify: `admin/components/map-editor.js:29`

- [ ] **Step 1: Write the failing test** (mirror `admin/__tests__/csv-editor-cache.test.js`)

```js
// admin/__tests__/map-editor-csv-cache.test.js
import { jest } from '@jest/globals';

test("loadMappingCsv fetches mapping.csv with cache:'no-cache'", async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => 'svgCode,floor\n',
  });
  global.fetch = fetchMock;

  // loadMappingCsv is module-private; assert via the documented invariant:
  // read the source and confirm the mapping.csv fetch passes no-cache.
  const src = (await import('fs')).readFileSync(
    new URL('../components/map-editor.js', import.meta.url), 'utf8');
  const m = src.match(/fetch\(`\$\{CLOUDFRONT_URL\}\/data\/mapping\.csv`[^)]*\)/);
  expect(m).not.toBeNull();
  expect(m[0]).toContain("cache: 'no-cache'");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest map-editor-csv-cache -c admin/jest.config.* 2>/dev/null || npx jest map-editor-csv-cache`
Expected: FAIL — the regex match has no `cache: 'no-cache'`.

- [ ] **Step 3: Implement** — edit `admin/components/map-editor.js:29`

```js
  const response = await fetch(`${CLOUDFRONT_URL}/data/mapping.csv`, { cache: 'no-cache' });
```

- [ ] **Step 4: Run it, verify it passes.** Expected: PASS.

- [ ] **Step 5: Run the full admin suite for no regressions**

Run: `npx jest` (from repo root)
Expected: same baseline as before (722 pass / 14 known-fail per project memory) + the new test passing.

- [ ] **Step 6: Commit**

```bash
git add admin/components/map-editor.js admin/__tests__/map-editor-csv-cache.test.js
git commit -m "fix(map-editor): fetch mapping.csv with cache:'no-cache' (#91)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — #92: `move`/`delete` drop an unsaved added range

### Task 2.1: Make `move()` add-safe

**Files:**
- Test: `admin/__tests__/shelf-state.test.js` (extend)
- Modify: `admin/components/map-editor/shelf-state.js` (`move`)

- [ ] **Step 1: Write the failing test**

```js
test('add → move keeps the row as a pending add with the new target', () => {
  const s = createShelfState({ ranges: [], permittedRowIds: null });
  s.add('temp-1', { svgCode: 'A', floor: '2', collectionName: 'X', rangeStart: '1', rangeEnd: '9' });
  s.move('temp-1', { svgCode: 'B' });
  const rows = s.materialize().filter(r => r.id === 'temp-1');
  expect(rows).toHaveLength(1);            // not dropped
  expect(rows[0].svgCode).toBe('B');       // target applied
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest shelf-state`
Expected: FAIL — `materialize()` drops the row (today `move` overwrites the pending `add` with `{type:'move'}`, which `materialize` does not re-add).

- [ ] **Step 3: Implement** — in `shelf-state.js`, replace `move`:

```js
  move(id, target) {
    const e = _pending.get(id);
    if (e && e.type === 'add') {
      _pending.set(id, { type: 'add', range: { ...e.range, ...target } });
      return;
    }
    _pending.set(id, { type: 'move', target });
  },
```

- [ ] **Step 4: Run it, verify it passes.** Expected: PASS.

### Task 2.2: Make `delete()` add-safe

- [ ] **Step 1: Write the failing test**

```js
test('add → delete drops the pending add entirely (no orphan row)', () => {
  const s = createShelfState({ ranges: [], permittedRowIds: null });
  s.add('temp-2', { svgCode: 'A', floor: '2', collectionName: 'X', rangeStart: '1', rangeEnd: '9' });
  s.delete('temp-2');
  expect(s.materialize().some(r => r.id === 'temp-2')).toBe(false);
  expect(s.pendingEdits().has('temp-2')).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails.** Expected: FAIL — a `{type:'delete'}` pending entry lingers / row handling is wrong.

- [ ] **Step 3: Implement** — replace `delete`:

```js
  delete(id) {
    const e = _pending.get(id);
    if (e && e.type === 'add') { _pending.delete(id); return; }
    _pending.set(id, { type: 'delete' });
  },
```

- [ ] **Step 4: Run it, verify it passes.** Expected: PASS.

- [ ] **Step 5: Run `npx jest shelf-state`** — all add→edit (#81), add→move, add→delete green.

- [ ] **Step 6: Commit**

```bash
git add admin/components/map-editor/shelf-state.js admin/__tests__/shelf-state.test.js
git commit -m "fix(map-editor): add-safe move/delete in shelf-state (#92)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — #86: focus loss + saved range vanishes (current drawer)

### Task 3.1: `commit(rows)` re-baselines state (fixes the "vanish")

**Files:**
- Test: `admin/__tests__/shelf-state.test.js` (extend)
- Modify: `admin/components/map-editor/shelf-state.js` (add `commit`)

- [ ] **Step 1: Write the failing test**

```js
test('commit(rows) becomes the new baseline and clears pending', () => {
  const s = createShelfState({ ranges: [{ id: 'r1', svgCode: 'A', rangeStart: '1', rangeEnd: '5' }], permittedRowIds: null });
  s.edit('r1', { rangeEnd: '9' });
  const saved = [{ id: 'r1', svgCode: 'A', rangeStart: '1', rangeEnd: '9' }];
  s.commit(saved);
  expect(s.materialize()).toEqual(saved);    // baseline reflects the save
  expect(s.pendingEdits().size).toBe(0);     // pending cleared
});
```

- [ ] **Step 2: Run it, verify it fails.** Expected: FAIL — `commit` is undefined.

- [ ] **Step 3: Implement** — add to the returned object in `shelf-state.js`:

```js
  commit(rows) {
    _ranges = rows.slice();
    _pending.clear();
  },
```

- [ ] **Step 4: Run it, verify it passes.** Expected: PASS.

### Task 3.2: `saveCsv` re-baselines via `commit` and keeps `allRanges` identical

**Files:**
- Modify: `admin/components/map-editor.js` (`saveCsv`, ~`:510-520`)

- [ ] **Step 1: Write the failing test** (`admin/__tests__/map-editor-save.test.js`, create)

```js
// Assert the source no longer calls revert() in saveCsv and instead commits the
// saved snapshot, keeping allRanges and the baseline the same array.
test('saveCsv commits the saved snapshot instead of reverting', async () => {
  const src = (await import('fs')).readFileSync(
    new URL('../components/map-editor.js', import.meta.url), 'utf8');
  const save = src.slice(src.indexOf('async function saveCsv'), src.indexOf('let initialized'));
  expect(save).toContain('shelfState.commit(merged)');
  expect(save).not.toContain('shelfState.revert()');
});
```

- [ ] **Step 2: Run it, verify it fails.** Expected: FAIL — `saveCsv` still calls `revert()`.

- [ ] **Step 3: Implement** — in `saveCsv`, replace the post-save block:

```js
    // Re-baseline from the snapshot the server accepted. commit() is the ONLY
    // baseline writer besides construction — allRanges and shelfState share it,
    // so the drawer can never show stale data after a save (#86).
    allRanges = merged;
    shelfState.commit(merged);
    if (isOrphanPanelOpen()) {
      refreshOrphanPanel({ openIfClosed: false });
    }
    refreshConflicts();
    renderDrawer();             // drawer stays open with fresh, saved values
    showToast(i18n.t('csv.saveSuccess'), 'success');
```

- [ ] **Step 4: Run it, verify it passes.** Expected: PASS.

### Task 3.3: Extract `applyRowValidation` (in-place tinting helper)

**Files:**
- Test: `admin/__tests__/shelf-drawer.test.js` (extend)
- Modify: `admin/components/map-editor/shelf-drawer.js` (extract from `buildRow:101-118`)

- [ ] **Step 1: Write the failing test**

```js
import { applyRowValidation } from '../components/map-editor/shelf-drawer.js';

test('applyRowValidation tints start/end on overlap without rebuilding inputs', () => {
  document.body.innerHTML = `<div class="map-drawer__row">
    <input data-field="rangeStart"><input data-field="rangeEnd"></div>`;
  const row = document.querySelector('.map-drawer__row');
  const startBefore = row.querySelector('[data-field="rangeStart"]');
  applyRowValidation(row, { rangeStart: '5', rangeEnd: '1' }, []);  // start > end
  expect(startBefore.classList.contains('map-drawer__cell--invalid')).toBe(true);
  // same node — not rebuilt
  expect(row.querySelector('[data-field="rangeStart"]')).toBe(startBefore);
});
```

- [ ] **Step 2: Run it, verify it fails.** Expected: FAIL — `applyRowValidation` not exported.

- [ ] **Step 3: Implement** — in `shelf-drawer.js`, export the helper and call it from `buildRow` (replacing the inline `:101-118` block):

```js
export function applyRowValidation(row, range, conflicts) {
  const start = row.querySelector('[data-field="rangeStart"]');
  const end = row.querySelector('[data-field="rangeEnd"]');
  for (const el of [start, end]) { el.classList.remove('map-drawer__cell--invalid'); el.title = ''; }
  const shape = validateRangeShape(range);
  if (!shape.ok && shape.error === 'start > end') {
    for (const el of [start, end]) { el.classList.add('map-drawer__cell--invalid'); el.title = i18n.t('mapEditor.warning.startGtEnd'); }
  }
  if (conflicts.length > 0) {
    const tip = conflicts.map(c => i18n.t('mapEditor.warning.overlap')
      .replace('{otherRangeLabel}', c.otherRangeLabel)
      .replace('{otherShelfLabel}', c.otherShelf)).join('\n');
    for (const el of [start, end]) { el.classList.add('map-drawer__cell--invalid'); el.title = tip; }
  }
}
```

- [ ] **Step 4: Run it, verify it passes.** Expected: PASS.

### Task 3.4: Stop full re-render on keystroke (fixes focus loss)

**Files:**
- Modify: `admin/components/map-editor.js` (`renderDrawer`'s `onChange`, `:374`)
- Modify: `admin/components/map-editor/shelf-drawer.js` (input handler calls `applyRowValidation` in place)

- [ ] **Step 1: Write the failing test** (`shelf-drawer.test.js`, extend) — assert the input handler does NOT wipe the host

```js
test('typing in a range field does not rebuild the drawer DOM', () => {
  // Render a single-shelf drawer, capture an input node, fire `input`,
  // assert the same node is still in the DOM (focus would survive in a browser).
  // (Full wiring per the existing showSingleShelf tests in this file.)
  const before = document.querySelector('#drawer-rows [data-field="rangeStart"]');
  before.value = '7';
  before.dispatchEvent(new Event('input', { bubbles: true }));
  const after = document.querySelector('#drawer-rows [data-field="rangeStart"]');
  expect(after).toBe(before);          // node identity preserved → no full re-render
});
```

- [ ] **Step 2: Run it, verify it fails.** Expected: FAIL — `onChange` → `renderDrawer()` replaces the node.

- [ ] **Step 3: Implement.**
  - In `map-editor.js` `renderDrawer`, change `onChange` to update state + conflict markers **without** `renderDrawer()`:

```js
      onChange: (id, patch) => {
        shelfState.edit(id, patch);
        refreshConflicts();              // map tints
        // in-place: re-tint only the edited row + refresh banner/save state
        updateRowInPlace(id);            // defined in shelf-drawer (see below)
      },
```

  - In `shelf-drawer.js`, export `updateRowInPlace(id)` that finds the row by `data-range-id`, recomputes its conflicts from the latest materialized data passed via a closure, calls `applyRowValidation`, and toggles the Save/Discard `disabled` state — never touching the inputs' identity. Re-render the whole rows region only on add/delete/move/save/selection-change.

- [ ] **Step 4: Run it, verify it passes.** Expected: PASS.

- [ ] **Step 5: e2e focus check** — run the existing focused-input snapshot

Run: `npx http-server . -p 8123 &` then `E2E_BASE_URL=http://localhost:8123 npx playwright test map-editor-ux -g "input-focused"`
Expected: PASS (typing keeps focus). Regenerate the snapshot only if the markup legitimately changed.

- [ ] **Step 6: Commit**

```bash
git add admin/components/map-editor.js admin/components/map-editor/shelf-state.js admin/components/map-editor/shelf-drawer.js admin/__tests__/shelf-state.test.js admin/__tests__/shelf-drawer.test.js admin/__tests__/map-editor-save.test.js
git commit -m "fix(map-editor): keep focus on keystroke + show saved ranges after save (#86)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — #87: same-shelf, same-collection sub-range false conflict

> **Decision gate (record in the issue before coding):** is a same-shelf, same-collection *sub-range* a real conflict? Recommended: **suppress** (a collection split across adjacent call-number bands on one shelf is normal). If the user decides "reword" instead, change the message key rather than the predicate.

### Task 4.1: Exclude same-shelf same-collection pairs from conflict detection

**Files:**
- Test: `admin/__tests__/range-validation.test.js` (extend/create)
- Modify: `admin/components/map-editor/range-validation.js` (`computeFloorConflicts`)

- [ ] **Step 1: Write the failing test**

```js
test('two sub-ranges of the same collection on the same shelf are not a conflict', () => {
  const conflicts = computeFloorConflicts([
    { id: 'a', svgCode: 'S1', collectionName: 'C', rangeStart: '1', rangeEnd: '5' },
    { id: 'b', svgCode: 'S1', collectionName: 'C', rangeStart: '6', rangeEnd: '9' },
  ]);
  expect(conflicts.size).toBe(0);
});

test('overlapping sub-ranges of the same collection on the same shelf STILL conflict', () => {
  const conflicts = computeFloorConflicts([
    { id: 'a', svgCode: 'S1', collectionName: 'C', rangeStart: '1', rangeEnd: '5' },
    { id: 'b', svgCode: 'S1', collectionName: 'C', rangeStart: '4', rangeEnd: '9' },
  ]);
  expect(conflicts.size).toBeGreaterThan(0);   // genuine overlap is still flagged
});
```

- [ ] **Step 2: Run it, verify it fails.** Expected: FAIL — adjacent same-collection sub-ranges currently flagged.

- [ ] **Step 3: Implement** — in `computeFloorConflicts`, skip the pair only when same shelf **and** same collection **and** the ranges do **not** actually overlap (keep flagging true overlaps). (Exact predicate depends on the current overlap test; gate the *adjacent/non-overlapping* same-collection case, not all same-collection pairs.)

- [ ] **Step 4: Run it, verify it passes.** Expected: PASS (both tests).

- [ ] **Step 5: Run `npx jest range-validation`** + the parity test if present.

- [ ] **Step 6: Commit**

```bash
git add admin/components/map-editor/range-validation.js admin/__tests__/range-validation.test.js
git commit -m "fix(map-editor): don't flag adjacent same-collection sub-ranges as conflicts (#87)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Side-panel layout (the move)

> Branch off `main` as `feat/map-editor-side-panel`. Tag `pre-mapeditor-panel-2026-05-31` on `main` first. This is the only phase needing e2e/visual rebaselining; isolate it so the rebaseline diff is expected and reviewable. Deploy **only from this branch** while it is deployed-but-unmerged for QA.

### Task 5.1: Grid split scaffold — move the panel host OUT of `#map-canvas`

**Files:**
- Modify: `admin/components/map-editor.js` (`initMapEditor` scaffold `:538-552`)
- Modify: `admin/styles/app.css` (`#map-editor-view`, add `#map-editor-split`, `#map-side-panel`; delete orphan `translateX` park + `#map-canvas overflow-x`)
- Test: `admin/__tests__/side-panel.test.js` (create)

- [ ] **Step 1: Write the failing test (#23 architecture canary)**

```js
test('#map-side-panel is NOT a descendant of #map-canvas', () => {
  document.body.innerHTML = `
    <div id="map-editor-view"><div class="map-editor__header"></div>
      <div id="map-editor-split"><div id="map-canvas"></div><div id="map-side-panel"></div></div>
    </div>`;
  const canvas = document.getElementById('map-canvas');
  const panel = document.getElementById('map-side-panel');
  expect(canvas.contains(panel)).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails** (before the scaffold change the panel host is appended inside `#map-canvas`). Expected: FAIL.

- [ ] **Step 3: Implement the scaffold** — in `initMapEditor`:

```js
  container.innerHTML = `
    <div id="map-editor-view">
      <div class="bg-white rounded-lg shadow p-4 map-editor__header">
        <div id="map-floor-tabs" class="flex gap-2 border-b border-gray-200" role="tablist"></div>
      </div>
      <div id="map-editor-split">
        <div id="map-canvas" class="relative bg-gray-50 border border-gray-200 rounded"></div>
        <div id="map-side-panel"></div>
      </div>
    </div>`;
  mountSidePanel('map-side-panel');   // replaces mountDrawer + mountOrphanPanel
```

- [ ] **Step 4: Implement the CSS** (`app.css`) — add the grid (spec §4.1), delete `.map-orphan-panel { transform: translateX(...) }` parking + `[dir=rtl]` translateX overrides + `#map-canvas { overflow-x: hidden }`; set `#map-canvas { overflow: hidden; min-width: 0 }`.

- [ ] **Step 5: Run it, verify it passes.** Expected: PASS.

- [ ] **Step 6: Commit** (`feat(map-editor): grid split scaffold; panel out of #map-canvas (#NN)`).

### Task 5.2: Mode state machine in `shelf-state.js`

**Files:**
- Test: `admin/__tests__/shelf-state.test.js` (extend)
- Modify: `admin/components/map-editor/shelf-state.js` (add `mode`, `reassign`, `pendingCount`, `openTriage`/`closeTriage`, `enterReassign`/`cancelReassign`/`confirmReassignTarget`)

- [ ] **Step 1: Write failing tests** for the transition table (spec §5.2): `selectSingle`→`mode()==='shelf'`; `clearSelection`→`'idle'`; `openTriage`→`'triage'`; `enterReassign`→`'reassign'` and preserves `pendingEdits`; `cancelReassign`→prior; `confirmReassignTarget` applies an add-safe move and returns to `'shelf'`(dest)/`'idle'`; `pendingCount()` counts queued edits across shelves.

- [ ] **Step 2: Run, verify fail.** Expected: FAIL — methods undefined.

- [ ] **Step 3: Implement** the mode field + methods (spec §5.1 API). `mode()` derives from selection + reassign/triage flags; `enterReassign` stores `{ rangeId, intent, originShelfId }`; `confirmReassignTarget` calls the add-safe `move`.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.**

### Task 5.3: `side-panel.js` mode router (absorbs the drawer)

**Files:**
- Create: `admin/components/map-editor/side-panel.js`
- Test: `admin/__tests__/side-panel.test.js` (extend)
- Modify: `admin/components/map-editor.js` (replace `renderDrawer` body to call `renderPanel(mode, ...)`; delete `shelf-drawer` mount)

- [ ] **Step 1: Write failing tests** — `renderPanel` shows: idle hint + nudge only when `n>0` (hidden at 0, spec §6.1); shelf mode renders one `shelf-card` per entry; reassign mode shows the passive summary + Cancel; triage mode renders the orphan list. Assert the idle nudge is absent when count is 0.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `side-panel.js` with `mountSidePanel(id)` + `renderPanel({ mode, ... })` that switches on `mode` and delegates: shelf→`shelf-card` list + header (`mapEditor.shelf.header`, drop the count) + Save/Discard + `pendingCount()` chip; idle→hint + conditional nudge; triage→orphan list renderer (passed in as a parameter — the additive seam, spec §7); reassign→summary + Cancel.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.**

### Task 5.4: `shelf-card.js` — vertical stacked per-entry card

**Files:**
- Create: `admin/components/map-editor/shelf-card.js` (re-flow of `buildRow`)
- Create: `admin/__tests__/shelf-card.test.js`
- Modify: `admin/styles/app.css` (card layout; remove `.map-drawer__row` grid)

- [ ] **Step 1: Write failing tests** — card renders: full-width collection select; labelled `From`/`To` (`mapEditor.field.from`/`.to`); "Move to another shelf" (`mapEditor.move`); "Remove" (`mapEditor.delete`, worded not `×`); an **always-visible** inline overlap/start>end message (spec §6.4), not tooltip-only; locked (readonly) card disables inputs.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `shelf-card.js` using `applyRowValidation` (Phase 3) for tints and adding the inline message line. Keep the in-place input handler contract (no full re-render on keystroke).

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.**

### Task 5.5: Plain-language i18n strings

**Files:**
- Modify: `admin/i18n/en.json`, `admin/i18n/he.json` (spec §6.5 table — add new keys, update existing)
- Test: `admin/__tests__/i18n-mapEditor.test.js` (create) — assert each new key exists in both locales

- [ ] **Step 1: Write failing test** — for each key in spec §6.5, `en.json` and `he.json` both define it.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** the string additions (EN copy + HE draft from spec §6.5). Wrap interpolated codes/`{label}` in `<bdi>` where rendered into HE strings.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.**

### Task 5.6: Reassign-as-mode — instruction strip over the map; single ESC owner

**Files:**
- Modify: `admin/components/map-editor/reassign-mode.js` (strip over map, not `document.body` banner; read `shelfState.mode()`)
- Modify: `admin/components/map-editor/svg-interaction.js:47` (early-return to `confirmReassignTarget` when `mode()==='reassign'`; add `#map-canvas.is-picking`)
- Modify: `admin/components/map-editor.js` (`:202` — keep reassign alive across floor change; cross-floor confirm auto-switches tab + toast)
- Modify: `admin/components/map-editor/esc-handler.js`, delete `orphan-panel.js:71-85` keydown (single ESC owner)
- Test: `admin/__tests__/map-editor-esc.test.js` (extend), `reassign` unit coverage

- [ ] **Step 1: Write failing tests** — pending-edit prompt fires on shelf→shelf and floor switch; ESC owner bails on `mode()==='reassign'`; floor switch mid-pick stays in reassign; cross-floor confirm switches tab + toasts.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** per spec §5.4.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.**

### Task 5.7: `triage` mode — orphan list inside the panel

**Files:**
- Modify: `admin/components/map-editor/orphan-panel.js` → render into `#map-side-panel` triage mode (drop standalone slide/park)
- Modify: `admin/components/map-editor.js` (`refreshOrphanPanel`/`openTriage` wiring; idle nudge opens triage)
- Test: `admin/__tests__/orphan-panel.test.js` (rewrite to triage-mode), keep `orphan-card.test.js`/`orphan-deriver.test.js` green

- [ ] **Step 1: Write failing tests** — opening triage from the idle nudge renders the "needs a shelf" list; "Choose its shelf on the map" enters reassign (intent repair); empty floor shows `mapEditor.triage.empty`; no second ESC owner.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.**

### Task 5.8: Fit-viewport guards + collapse/responsive

**Files:**
- Modify: `admin/components/map-editor.js` (`fitMapEditorViewport` stays height-only; collapse toggle sets `#map-editor-split.is-collapsed`)
- Modify: `admin/styles/app.css` (collapse animation; `@media (max-width:1365px)` auto-collapse rail)
- Modify: `e2e/tests/map-editor-fit-viewport.spec.ts` (strengthen)

- [ ] **Step 1: Write the failing e2e** — assert in EN **and** HE, panel-OPEN **and** panel-COLLAPSED: `canvasBox.width + panelBox.width <= splitBox.width + 1` (no overflow) and the map is not pathologically small; no body scrollbar (the existing #70 check). Add: `#map-side-panel` computed `direction` matches `<html>`; `#map-canvas` still `direction:ltr` in HE.

- [ ] **Step 2: Run, verify fail.**

Run: `npx http-server . -p 8123 &` then `E2E_BASE_URL=http://localhost:8123 npx playwright test map-editor-fit-viewport`

- [ ] **Step 3: Implement** the collapse toggle + responsive CSS (spec §4.3).

- [ ] **Step 4: Run, verify pass** (both directions, both states).

- [ ] **Step 5: Commit.**

### Task 5.9: e2e rewrites + visual rebaseline

**Files:**
- Rewrite: `e2e/tests/map-editor-ux.spec.ts` (drawer→panel selectors; regenerate the 4 `toHaveScreenshot` baselines), `map-editor.spec.ts` (`#drawer-save`/`#map-reassign-banner`→panel), `map-editor-orphan-panel*.spec.ts` (persistent-panel geometry + re-expressed #23 RTL guard), `map-editor-empty-shelf.spec.ts` (selectors)

- [ ] **Step 1: Update selectors** to the new panel DOM across the listed specs.

- [ ] **Step 2: Run the map-editor e2e suite**

Run: `E2E_BASE_URL=http://localhost:8123 npx playwright test map-editor`
Expected: FAIL on visual snapshots only (markup legitimately changed).

- [ ] **Step 3: Regenerate baselines**

Run: `E2E_BASE_URL=http://localhost:8123 npx playwright test map-editor --update-snapshots`
Then visually inspect the new PNGs in the report (`npx playwright show-report`) to confirm they show the intended layout — not a broken one.

- [ ] **Step 4: Re-run** the suite green; run `npx jest` for the full unit baseline.

- [ ] **Step 5: Commit** (separate commit for the rebaseline so the diff is self-evident).

### Task 5.10: Deploy + verify (per project ritual)

- [ ] Bump `?v=` on every changed module import in `map-editor.js` and `app.js`.
- [ ] Deploy **from the feature branch** (`./redeploy.sh`), then `aws cloudfront create-invalidation --distribution-id E5SR0E5GM5GSB --paths "/admin/*"`.
- [ ] Verify live: fetch the deployed `side-panel.js` / `map-editor.js` carry the change; manual QA in EN + HE (panel side mirrors; map larger; add/edit-range keeps focus; save shows the saved value; reassign strip over map; cross-floor move toasts).
- [ ] Open the PR; after merge, redeploy from `main` is safe.

---

## Self-review (against the spec)

- **Spec §4 layout** → Tasks 5.1, 5.8. **§5 state/modes** → 3.1–3.2, 5.2, 5.6. **§5.3 focus** → 3.3–3.4. **§6 IA/content** → 5.3, 5.4, 5.5. **§7 seams** → 5.2 (mode enum), selection.kind (existing), 5.3 (idle-list param). **§8 tests** → guards embedded per task + 5.8/5.9. **§9 deploy** → 5.10. **§10 #87** → Phase 4. **#86/#92/#91** → Phases 3/2/1. ✅ no spec section without a task.
- **Placeholders:** Phase 5 tasks intentionally describe contracts + reference spec sections for full code, because the exact code depends on file state *after* earlier phases land (and Phase 5 runs in its own branch/session). Phases 1–4 carry literal code. The `computeFloorConflicts` predicate (4.1 step 3) and a few Phase-5 bodies are described, not literal — flagged here as the known soft spots to firm up at execution time against the then-current files.
- **Type consistency:** `commit(rows)`, `mode()`, `enterReassign`/`confirmReassignTarget`/`cancelReassign`, `openTriage`, `pendingCount()`, `applyRowValidation`, `updateRowInPlace`, `renderPanel`, `mountSidePanel` used consistently across tasks and match spec §5.1 / §6.

---

## Execution handoff

Phases 1–4 are subagent-friendly (small, literal, TDD). Phase 5 is best run with **subagent-driven-development** (fresh subagent per task, review between tasks) on a dedicated worktree/branch. Pick up execution from Phase 1.
