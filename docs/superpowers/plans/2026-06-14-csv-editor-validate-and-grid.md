# CSV Editor — Validate-Before-Save + Usable Wide Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin CSV Editor block saving invalid data (whole file must be valid) and show the reason up front, and make the wide edit grid usable (frozen header + frozen left anchor column + always-visible horizontal scrollbar, LTR & RTL).

**Architecture:** Reuse the existing `validateRow` (data-model.js) for per-row errors/warnings and the existing `getBrokenRefs` (deterministic E006 from the editor's already-loaded `svgShelfIdsByFloor`). A new focused, DOM-free helper `csv-validation.js` validates the whole dataset and reports blocking rows. `csv-editor.js` consumes it to gate `saveCSV`, drive a live problem indicator, mark cells inline, and surface server errors. Grid usability is pure CSS (`app.css`) plus a JS viewport-fit (mirroring the map editor's `fitMapEditorViewport`) and a read-only anchor column.

**Tech Stack:** Vanilla ES modules, Jest (jsdom, `NODE_OPTIONS=--experimental-vm-modules`, run from `admin/`), Playwright (real Chromium, run against a repo-root static server), Tailwind CDN + `admin/styles/app.css`.

**Tracking issue:** #187. **Spec:** `docs/superpowers/specs/2026-06-14-csv-editor-validate-and-grid-design.md`.

**Branch/sequencing note:** This plan's branch (`feat/csv-editor-validate-grid`) is cut from `main` *before* #88 (PR #186) merged. #88 also edits `csv-editor.js` (`getCsvRowsForValidation` floor handling) and `bundle-validator.js`. They are functionally independent — this plan blocks blank/illegal floors via `validateRow` E001/E003, not via the bundle rule — but to avoid a merge conflict, **rebase this branch onto `main` after #186 merges** (or merge #186 first). Do this before Task 1 if #186 is already merged.

---

## File Structure

- **Create** `admin/services/csv-validation.js` — DOM-free whole-dataset validator (`validateDataset`). One responsibility: turn rows + shelf sets into per-row problems + a blocking summary.
- **Create** `admin/__tests__/csv-validation.test.js` — unit tests for `validateDataset`.
- **Create** `admin/__tests__/csv-editor-save-gate.test.js` — gate + server-error + empty-row behavior (jsdom).
- **Create** `e2e/tests/csv-editor-grid.spec.ts` — frozen header / anchor column / visible scrollbar, LTR + RTL.
- **Modify** `admin/components/csv-editor.js` — wire validation into save, render, indicator, anchor column, viewport fit.
- **Modify** `admin/styles/app.css` — bounded scroll viewport + sticky header + sticky anchor column.
- **Reuse unchanged** `admin/services/data-model.js` (`validateRow`, `getBrokenRefs`).

---

## Task 1: `validateDataset` helper (the blocking-rules engine)

**Files:**
- Create: `admin/services/csv-validation.js`
- Test: `admin/__tests__/csv-validation.test.js`

- [ ] **Step 1: Write the failing test**

Create `admin/__tests__/csv-validation.test.js`:

```js
/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { validateDataset } from '../services/csv-validation.js';

// Minimal valid row factory (all required fields present, legal floor/range).
function row(overrides = {}) {
  return {
    libraryName: 'TAU', libraryNameHe: 'תל אביב',
    collectionName: 'Stacks', collectionNameHe: 'מאגר',
    rangeStart: '000', rangeEnd: '099',
    svgCode: 'CB_0', description: 'd', descriptionHe: 'ד',
    floor: '0', shelfLabel: '', shelfLabelHe: '', notes: '', notesHe: '',
    ...overrides,
  };
}

// Shelf sets: CB_0 exists on floor 0; floor 1 has CC_1; floor 2 empty.
const SHELVES = { 0: new Set(['CB_0']), 1: new Set(['CC_1']), 2: new Set() };

describe('validateDataset', () => {
  test('a fully valid file has no blocking problems', () => {
    const res = validateDataset([row()], SHELVES);
    expect(res.hasBlocking).toBe(false);
    expect(res.blockingCount).toBe(0);
    expect(res.blockingRowIndexes).toEqual([]);
  });

  test('an empty required field (floor) blocks (E001)', () => {
    const res = validateDataset([row({ floor: '' })], SHELVES);
    expect(res.hasBlocking).toBe(true);
    expect(res.blockingRowIndexes).toEqual([0]);
    const p = res.problemsByRow.get(0);
    expect(p.errors.some(e => e.code === 'E001' && e.field === 'floor')).toBe(true);
  });

  test('an illegal floor blocks (E003)', () => {
    const res = validateDataset([row({ floor: '3' })], SHELVES);
    expect(res.blockingRowIndexes).toEqual([0]);
    expect(res.problemsByRow.get(0).errors.some(e => e.code === 'E003')).toBe(true);
  });

  test('start>end blocks (E002)', () => {
    const res = validateDataset([row({ rangeStart: '500', rangeEnd: '100' })], SHELVES);
    expect(res.problemsByRow.get(0).errors.some(e => e.code === 'E002')).toBe(true);
    expect(res.hasBlocking).toBe(true);
  });

  test('an svgCode not on its floor blocks (E006) deterministically from the shelf sets', () => {
    // CB_0 is a floor-0 shelf; declaring it on floor 1 must be a blocking E006.
    const res = validateDataset([row({ floor: '1', svgCode: 'CB_0' })], SHELVES);
    expect(res.problemsByRow.get(0).errors.some(e => e.code === 'E006')).toBe(true);
    expect(res.hasBlocking).toBe(true);
  });

  test('a range overlap is a WARNING, not blocking', () => {
    // Two rows, same collection+floor, overlapping ranges → W001 only.
    const a = row({ rangeStart: '000', rangeEnd: '100', svgCode: 'CB_0', floor: '0' });
    const b = row({ rangeStart: '050', rangeEnd: '150', svgCode: 'CB_0', floor: '0' });
    const res = validateDataset([a, b], { 0: new Set(['CB_0']), 1: new Set(), 2: new Set() });
    expect(res.hasBlocking).toBe(false);            // overlaps never block
    expect(res.warningRowIndexes.length).toBeGreaterThan(0);
  });

  test('an exact duplicate blocks both rows (E005)', () => {
    const res = validateDataset([row(), row()], SHELVES);
    expect(res.blockingRowIndexes).toEqual([0, 1]);
    expect(res.problemsByRow.get(0).errors.some(e => e.code === 'E005')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `admin/`): `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-validation.test.js`
Expected: FAIL — `Cannot find module '../services/csv-validation.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `admin/services/csv-validation.js`:

```js
/**
 * Whole-dataset validator for the CSV Editor save-gate (#187).
 *
 * Combines per-row validateRow (E001–E005 + warnings) with getBrokenRefs
 * (E006 — svgCode not present on its declared floor). E006 is taken from
 * getBrokenRefs (which uses the editor's already-loaded shelf sets) rather
 * than validateRow's separate isValidSvgCode cache, so it is deterministic
 * regardless of cache-warm timing.
 *
 * Pure / DOM-free so it is unit-testable in the node jest environment.
 *
 * @param {Object[]} rows - the full dataset that would be saved
 * @param {Object<number,Set<string>>} svgShelfIdsByFloor
 * @returns {{
 *   problemsByRow: Map<number,{errors:Array<{field,code,message}>, warnings:Array<{field,code,message}>}>,
 *   blockingRowIndexes: number[],
 *   warningRowIndexes: number[],
 *   hasBlocking: boolean,
 *   blockingCount: number
 * }}
 */
import { validateRow, getBrokenRefs } from './data-model.js';

export function validateDataset(rows, svgShelfIdsByFloor) {
  // Tag rows with _index so validateRow's self-skip (for E005 duplicate /
  // W001 overlap) excludes only the row itself, not every untagged row.
  const indexed = (rows || []).map((r, i) => ({ ...r, _index: i }));
  const problemsByRow = new Map();
  const ensure = (i) => {
    if (!problemsByRow.has(i)) problemsByRow.set(i, { errors: [], warnings: [] });
    return problemsByRow.get(i);
  };

  indexed.forEach((row, i) => {
    const { errors, warnings } = validateRow(row, indexed, row);
    if (errors.length) {
      ensure(i).errors.push(...errors.map(e => ({ field: e.field, code: e.code, message: e.message })));
    }
    if (warnings.length) {
      ensure(i).warnings.push(...warnings.map(w => ({ field: w.field, code: w.code, message: w.message })));
    }
  });

  // E006 — deterministic from the passed shelf sets.
  const refRows = (rows || []).map((r, i) => ({
    rowIndex: i,
    svgCode: String(r.svgCode || ''),
    floor: Number(r.floor),
  }));
  for (const b of getBrokenRefs(refRows, svgShelfIdsByFloor)) {
    const p = ensure(b.rowIndex);
    if (!p.errors.some(e => e.code === 'E006')) {
      p.errors.push({ field: 'svgCode', code: 'E006', message: `SVG code "${b.svgCode}" not found on floor ${b.floor}` });
    }
  }

  const blockingRowIndexes = [];
  const warningRowIndexes = [];
  for (const [i, p] of problemsByRow) {
    if (p.errors.length) blockingRowIndexes.push(i);
    else if (p.warnings.length) warningRowIndexes.push(i);
  }
  blockingRowIndexes.sort((a, b) => a - b);
  warningRowIndexes.sort((a, b) => a - b);

  return {
    problemsByRow,
    blockingRowIndexes,
    warningRowIndexes,
    hasBlocking: blockingRowIndexes.length > 0,
    blockingCount: blockingRowIndexes.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `admin/`): `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-validation.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add admin/services/csv-validation.js admin/__tests__/csv-validation.test.js
git commit -m "feat(#187): validateDataset — whole-file blocking-rule engine for CSV editor"
```

---

## Task 2: Gate `saveCSV` — block the network PUT on any blocking error

**Files:**
- Modify: `admin/components/csv-editor.js` (imports near top; `saveCSV` ~line 889; FALLBACKS ~line 12)
- Test: `admin/__tests__/csv-editor-save-gate.test.js`

- [ ] **Step 1: Write the failing test**

Create `admin/__tests__/csv-editor-save-gate.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// Real validateDataset + data-model (so the gate is exercised end-to-end),
// but stub the network and auth-guard (admin). Floor-1 SVG lacks the shelf so
// E006/E001 paths are reachable without real SVG fetches.
describe('csv-editor — save gate (#187)', () => {
  let initCSVEditor, addRowForTest, saveForTest;
  let fetchSpy;

  const HEADERS = 'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe';
  // One valid row (CB_0 on floor 0) + header. CB_0 is in the floor_0 SVG mock.
  const VALID_ROW = 'TAU,תל אביב,Stacks,מאגר,000,099,CB_0,d,ד,0,,,,';

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="csv-editor">
        <div id="csv-toolbar"></div>
        <button id="btn-add-row"></button>
        <button id="btn-save"></button>
        <input id="csv-search" />
        <div id="filter-info-banner"></div>
        <div id="table-container"></div>
      </div>`;

    fetchSpy = jest.fn().mockImplementation((url) => {
      const u = String(url);
      if (u.endsWith('mapping.csv')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(`${HEADERS}\n${VALID_ROW}`) });
      }
      if (u.includes('floor_0.svg')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg><rect id="CB_0" data-map-object="shelf"/></svg>') });
      }
      if (u.endsWith('.svg')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg></svg>') });
      }
      // PUT /api/csv
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) });
    });
    global.fetch = fetchSpy;

    jest.unstable_mockModule('../auth-guard.js?v=5', () => ({
      __esModule: true,
      default: {},
      isAdmin: () => true,
      applyRoleBasedUI: () => {},
    }));
    jest.unstable_mockModule('../app.js?v=5', () => ({
      getAuthHeaders: () => ({}),
      getCurrentUsername: () => 'tester',
    }));

    const mod = await import('../components/csv-editor.js');
    initCSVEditor = mod.initCSVEditor;
    // helpers exported in Step 3 for test access:
    addRowForTest = mod.__addRowForTest;
    saveForTest = mod.__saveForTest;

    await initCSVEditor();
    // Let the awaited SVG loads settle.
    await Promise.resolve();
  });

  test('a blocking row prevents the PUT (no /api/csv call)', async () => {
    addRowForTest();                 // pushes an all-empty row → E001 on every required field
    fetchSpy.mockClear();
    await saveForTest();
    const putCalls = fetchSpy.mock.calls.filter(([u, opts]) => String(u).includes('/api/csv') && opts?.method === 'PUT');
    expect(putCalls.length).toBe(0); // gate blocked the save
  });

  test('warnings-only saves (PUT happens)', async () => {
    // The loaded file is fully valid (no blocking, no warnings) → save proceeds.
    fetchSpy.mockClear();
    await saveForTest();
    const putCalls = fetchSpy.mock.calls.filter(([u, opts]) => String(u).includes('/api/csv') && opts?.method === 'PUT');
    expect(putCalls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `admin/`): `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-editor-save-gate.test.js`
Expected: FAIL — `mod.__addRowForTest` / `mod.__saveForTest` undefined, and (once exported) the blocking-row test fails because `saveCSV` currently PUTs unconditionally.

- [ ] **Step 3: Write minimal implementation**

In `admin/components/csv-editor.js`:

(a) Add the import after the existing `getBrokenRefs` import (near line 8):

```js
import { validateDataset } from '../services/csv-validation.js';
```

(b) Add fallback strings to the `FALLBACKS` object (near line 12), keeping librarian-plain language:

```js
  'csv.saveBlocked': { en: '{count} problem(s) must be fixed before saving. They are highlighted below.', he: 'יש לתקן {count} בעיות לפני השמירה. הן מסומנות למטה.' },
  'csv.noProblems': { en: 'No problems — ready to save', he: 'אין בעיות — מוכן לשמירה' },
  'csv.problemCount': { en: '{count} problem(s) to fix', he: '{count} בעיות לתיקון' },
  'csv.anchorColumn': { en: 'Row', he: 'שורה' },
```

(c) Replace the top of `saveCSV` (the `if (hasNoAccess) {…}` block stays; insert the gate right after it, before the `try`). Find:

```js
  // Prevent saving if no access
  if (hasNoAccess) {
    showToast(t('csv.noAccess'), 'error');
    return;
  }

  try {
```

Replace with:

```js
  // Prevent saving if no access
  if (hasNoAccess) {
    showToast(t('csv.noAccess'), 'error');
    return;
  }

  // --- Save gate (#187): the whole file must be valid. Block before any
  // network call so the reason is shown up front instead of a slow,
  // unexplained server rejection. ---
  const dataToSave = buildFullCsvData();
  const gate = validateDataset(dataToSave, svgShelfIdsByFloor);
  if (gate.hasBlocking) {
    showToast(t('csv.saveBlocked').replace('{count}', String(gate.blockingCount)), 'error');
    renderTable();            // re-render so the inline error marks (Task 5) show
    updateProblemIndicator();  // refresh the count + keep Save disabled (Task 4)
    return;                    // do NOT contact the server
  }

  try {
```

(d) In the `try` body, reuse `dataToSave` instead of recomputing it. Find:

```js
    // Build full CSV data (merge editor changes for filtered views)
    const dataToSave = buildFullCsvData();
    const csvContent = toCSV(dataToSave);
```

Replace with:

```js
    const csvContent = toCSV(dataToSave);
```

(e) At the very bottom of the file (before any trailing `export` block, or just append), export thin test hooks so the jsdom test can drive add/save without a real click:

```js
// Test-only hooks (no behavioral effect in the app).
export const __addRowForTest = () => addRow();
export const __saveForTest = () => saveCSV();
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `admin/`): `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-editor-save-gate.test.js`
Expected: PASS (both tests). If `updateProblemIndicator` is not yet defined (it lands in Task 4), temporarily define a no-op `function updateProblemIndicator() {}` near the other helpers; Task 4 fills it in.

- [ ] **Step 5: Commit**

```bash
git add admin/components/csv-editor.js admin/__tests__/csv-editor-save-gate.test.js
git commit -m "feat(#187): gate CSV save — block the PUT when the file has blocking errors"
```

---

## Task 3: Surface the server's real reason on a failed save (closes #134 for this editor)

**Files:**
- Modify: `admin/components/csv-editor.js` (`saveCSV` response handling + catch)
- Test: `admin/__tests__/csv-editor-save-gate.test.js` (add a case)

- [ ] **Step 1: Write the failing test**

Append to `admin/__tests__/csv-editor-save-gate.test.js` inside the `describe`:

```js
  test('a server 422 surfaces the server message, not the generic toast', async () => {
    // Force the PUT to return a specific 422 body. The file is valid so the
    // gate passes and the request is actually sent.
    fetchSpy.mockImplementation((url, opts) => {
      const u = String(url);
      if (u.includes('/api/csv') && opts?.method === 'PUT') {
        return Promise.resolve({
          ok: false, status: 422,
          json: () => Promise.resolve({ error: 'Bundle invariant violation' }),
        });
      }
      if (u.endsWith('mapping.csv')) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(`${HEADERS}\n${VALID_ROW}`) });
      if (u.includes('floor_0.svg')) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg><rect id="CB_0" data-map-object="shelf"/></svg>') });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg></svg>') });
    });

    const toast = await import('../components/toast.js?v=5');
    const toastSpy = jest.spyOn(toast, 'showToast');

    await saveForTest();

    const messages = toastSpy.mock.calls.map(c => c[0]);
    expect(messages.some(m => /Bundle invariant violation/.test(m))).toBe(true);
  });
```

Note: `showToast` is imported in csv-editor as `import { showToast } from './toast.js?v=5'`. The spy above targets that same module specifier.

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-editor-save-gate.test.js -t "surfaces the server message"`
Expected: FAIL — current code shows the generic `t('csv.saveError')` instead of the server `error`.

- [ ] **Step 3: Write minimal implementation**

In `saveCSV`, find:

```js
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
```

Replace with:

```js
    if (!response.ok) {
      // #134/#187: surface the server's specific reason instead of a generic
      // toast. The putCsv Lambda returns it under the `error` key.
      let serverMsg = '';
      try { const body = await response.json(); serverMsg = body?.error || body?.message || ''; } catch (_) { /* non-JSON body */ }
      throw new Error(serverMsg || `HTTP error! status: ${response.status}`);
    }
```

And in the `catch` block, find:

```js
  } catch (error) {
    console.error('Failed to save CSV:', error);
    showToast(t('csv.saveError'), 'error');
  } finally {
```

Replace with:

```js
  } catch (error) {
    console.error('Failed to save CSV:', error);
    showToast(error?.message || t('csv.saveError'), 'error');
  } finally {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-editor-save-gate.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add admin/components/csv-editor.js admin/__tests__/csv-editor-save-gate.test.js
git commit -m "feat(#187): surface server save-rejection reason in CSV editor (closes #134 here)"
```

---

## Task 4: Live problem indicator + Save disabled while problems exist + click-to-filter

**Files:**
- Modify: `admin/components/csv-editor.js` (`renderEditor` toolbar ~line 139; `updateSaveButton` ~770; input handler ~725; `initCSVEditor`/`loadCSV`; add `updateProblemIndicator` + `applyProblemsFilter`)
- Test: `admin/__tests__/csv-editor-save-gate.test.js` (add cases)

- [ ] **Step 1: Write the failing test**

Append inside the `describe`:

```js
  test('the indicator shows the blocking count and disables Save', async () => {
    addRowForTest();                       // empty row → blocking
    updateProblemIndicatorForTest();       // exported hook (Step 3)
    const indicator = document.getElementById('csv-problem-count');
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toMatch(/1/);          // 1 problem row
    expect(document.getElementById('btn-save').disabled).toBe(true);
  });

  test('with no problems the indicator says ready and Save is enabled after a change', async () => {
    // Edit the valid row in place (marks changed) without introducing an error.
    document.querySelector('input.csv-input[data-column="notes"]')?.dispatchEvent(new Event('input'));
    updateProblemIndicatorForTest();
    const indicator = document.getElementById('csv-problem-count');
    expect(indicator.textContent).toMatch(/No problems|ready/i);
  });
```

(Export `export const __updateProblemIndicatorForTest = () => updateProblemIndicator();` alongside the other hooks, and bind `const updateProblemIndicatorForTest = mod.__updateProblemIndicatorForTest;` in `beforeEach`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-editor-save-gate.test.js -t "indicator"`
Expected: FAIL — no `#csv-problem-count` element / hook.

- [ ] **Step 3: Write minimal implementation**

(a) Add a module-level state var near the other `let` declarations (~line 54):

```js
let lastBlockingCount = 0;          // #187: blocking-error rows in the current file
let problemsFilterActive = false;   // #187: "show only problem rows" view filter
```

(b) Add the indicator element to the toolbar in `renderEditor()`. Find the Save button block and add, immediately AFTER the closing `</button>` of `#btn-save` (still inside `#csv-toolbar`):

```js
          <button
            id="csv-problem-count"
            class="px-3 py-1.5 text-sm rounded hidden"
            type="button"
            title="${escapeHtml(t('csv.problemCount'))}"
          ></button>
```

(c) Add `updateProblemIndicator` and `applyProblemsFilter` near the other helpers (e.g. after `updateSaveButton`):

```js
/**
 * #187: recompute the whole-file blocking count, update the indicator, and
 * keep Save disabled while problems remain. Clicking the indicator toggles a
 * "show only problem rows" filter so the user can jump straight to them.
 */
function updateProblemIndicator() {
  const indicator = document.getElementById('csv-problem-count');
  const gate = validateDataset(csvData, svgShelfIdsByFloor);
  lastBlockingCount = gate.blockingCount;

  if (indicator) {
    if (gate.blockingCount > 0) {
      indicator.textContent = t('csv.problemCount').replace('{count}', String(gate.blockingCount));
      indicator.className = 'px-3 py-1.5 text-sm rounded bg-red-100 text-red-800 hover:bg-red-200';
      indicator.onclick = () => { problemsFilterActive = !problemsFilterActive; applyProblemsFilter(); };
    } else {
      indicator.textContent = t('csv.noProblems');
      indicator.className = 'px-3 py-1.5 text-sm rounded bg-green-100 text-green-800';
      indicator.onclick = null;
      if (problemsFilterActive) { problemsFilterActive = false; applyProblemsFilter(); }
    }
  }
  updateSaveButton();
}

/**
 * #187: when active, hide every row that is NOT a blocking-error row.
 */
function applyProblemsFilter() {
  const gate = validateDataset(csvData, svgShelfIdsByFloor);
  const blocking = new Set(gate.blockingRowIndexes.map(String));
  document.querySelectorAll('#csv-table tr[data-row-index]').forEach(tr => {
    if (!problemsFilterActive) { tr.style.display = ''; return; }
    tr.style.display = blocking.has(tr.dataset.rowIndex) ? '' : 'none';
  });
}
```

(d) Make `updateSaveButton` also respect the blocking count. Replace:

```js
function updateSaveButton() {
  const saveBtn = document.getElementById('btn-save');
  if (saveBtn) {
    saveBtn.disabled = !hasChanges;
  }
}
```

with:

```js
function updateSaveButton() {
  const saveBtn = document.getElementById('btn-save');
  if (saveBtn) {
    saveBtn.disabled = !hasChanges || lastBlockingCount > 0;
  }
}
```

(e) Recompute the indicator whenever data changes. In the input handler (`tableContainer?.addEventListener('input', …)`), after `markChanged();` add:

```js
      updateProblemIndicator();
```

In `addRow()` and `deleteRow()`, after their `renderTable();` calls add:

```js
  updateProblemIndicator();
```

And at the end of `loadCSV()` (after the first `renderTable()` / once data is in), call `updateProblemIndicator();` so the indicator reflects the loaded file. Also call it once at the end of `initCSVEditor()` after the SVG sets load (right after `renderBrokenRefsToggle();`).

(f) Replace the temporary no-op `updateProblemIndicator` from Task 2 (if present) with this real one, and add the test hook near the other exports:

```js
export const __updateProblemIndicatorForTest = () => updateProblemIndicator();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-editor-save-gate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/components/csv-editor.js admin/__tests__/csv-editor-save-gate.test.js
git commit -m "feat(#187): live problem-count indicator, Save-disabled gate, click-to-filter problem rows"
```

---

## Task 5: Inline error/warning marking on cells

**Files:**
- Modify: `admin/components/csv-editor.js` (`renderTable` cell render ~line 677)
- Modify: `admin/styles/app.css`
- Test: `admin/__tests__/csv-editor-save-gate.test.js` (add a case)

- [ ] **Step 1: Write the failing test**

Append inside the `describe`:

```js
  test('a cell with a blocking error renders the error class + the reason in its title', async () => {
    addRowForTest();          // empty row → E001 on required fields incl. floor
    // renderTable runs inside addRow; find the new row (last data-row-index).
    const rows = [...document.querySelectorAll('#csv-table tr[data-row-index]')];
    const last = rows[rows.length - 1];
    const floorCell = last.querySelector('input.csv-input[data-column="floor"]');
    expect(floorCell.closest('td').classList.contains('csv-cell-error')).toBe(true);
    expect(floorCell.closest('td').getAttribute('title')).toMatch(/required|empty|Required/i);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-editor-save-gate.test.js -t "error class"`
Expected: FAIL — cells carry no `csv-cell-error` class/title.

- [ ] **Step 3: Write minimal implementation**

(a) In `renderTable`, compute validation once before building the rows. After `const headers = Object.keys(csvData[0]);` add:

```js
  const gate = validateDataset(csvData, svgShelfIdsByFloor);
  // field -> {kind:'error'|'warning', message} for a given row index
  const problemFor = (rowIndex, header) => {
    const p = gate.problemsByRow.get(rowIndex);
    if (!p) return null;
    const err = p.errors.find(e => e.field === header);
    if (err) return { kind: 'error', message: err.message };
    const warn = p.warnings.find(w => w.field === header);
    if (warn) return { kind: 'warning', message: warn.message };
    return null;
  };
```

(b) Replace the data-cell `<td>` template inside the `csvData.map(...)` body. Find:

```js
            ${headers.map(header => `
              <td class="px-2 py-2 border-b border-gray-100">
                <input
                  type="text"
                  class="csv-input w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  data-row="${rowIndex}"
                  data-column="${escapeHtml(header)}"
                  value="${escapeHtml(row[header] || '')}"
                  dir="auto"
                >
              </td>
            `).join('')}
```

Replace with:

```js
            ${headers.map(header => {
              const prob = problemFor(rowIndex, header);
              const tdClass = 'px-2 py-2 border-b border-gray-100'
                + (prob?.kind === 'error' ? ' csv-cell-error' : prob?.kind === 'warning' ? ' csv-cell-warning' : '');
              const titleAttr = prob ? ` title="${escapeHtml(prob.message)}"` : '';
              return `
              <td class="${tdClass}"${titleAttr}>
                <input
                  type="text"
                  class="csv-input w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  data-row="${rowIndex}"
                  data-column="${escapeHtml(header)}"
                  value="${escapeHtml(row[header] || '')}"
                  dir="auto"
                >
              </td>`;
            }).join('')}
```

(c) Add the cell styles to `admin/styles/app.css` (append at end):

```css
/* #187 CSV Editor — inline validation marks */
#csv-table td.csv-cell-error { background: #fef2f2; box-shadow: inset 0 0 0 1px #f87171; }   /* red-50 / red-400 */
#csv-table td.csv-cell-error input { color: #991b1b; }                                       /* red-800 */
#csv-table td.csv-cell-warning { background: #fffbeb; box-shadow: inset 0 0 0 1px #fcd34d; }  /* amber-50 / amber-300 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-editor-save-gate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/components/csv-editor.js admin/styles/app.css admin/__tests__/csv-editor-save-gate.test.js
git commit -m "feat(#187): inline red/yellow cell marks with the specific reason on hover"
```

---

## Task 6: Empty added row is blocked and one-click removable (verification)

**Files:**
- Test only: `admin/__tests__/csv-editor-save-gate.test.js`

This behavior already emerges from Task 2 (empty row → E001 → blocked) and the existing per-row delete button. This task pins it down with explicit tests so the guarantee can't silently regress (HR3). No production code change expected.

- [ ] **Step 1: Write the test**

Append inside the `describe`:

```js
  test('an empty added row blocks save, and removing it unblocks', async () => {
    addRowForTest();
    fetchSpy.mockClear();
    await saveForTest();
    let puts = fetchSpy.mock.calls.filter(([u, o]) => String(u).includes('/api/csv') && o?.method === 'PUT');
    expect(puts.length).toBe(0);   // blocked

    // Remove the just-added (last) row via its delete button.
    const rows = [...document.querySelectorAll('#csv-table tr[data-row-index]')];
    rows[rows.length - 1].querySelector('.btn-delete-row').click();

    fetchSpy.mockClear();
    await saveForTest();
    puts = fetchSpy.mock.calls.filter(([u, o]) => String(u).includes('/api/csv') && o?.method === 'PUT');
    expect(puts.length).toBe(1);   // unblocked, save proceeds
  });
```

- [ ] **Step 2: Run test to verify it passes (no red expected — it documents existing behavior)**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-editor-save-gate.test.js -t "empty added row blocks"`
Expected: PASS. If it FAILS, the delete path doesn't reset `lastBlockingCount` — fix by ensuring `deleteRow` calls `updateProblemIndicator()` (added in Task 4 Step 3e); re-run.

- [ ] **Step 3: Commit**

```bash
git add admin/__tests__/csv-editor-save-gate.test.js
git commit -m "test(#187): empty added row blocks save and removing it unblocks"
```

---

## Task 7: Usable wide grid — bounded viewport, frozen header, frozen anchor column (CSS + anchor column + viewport fit)

**Files:**
- Modify: `admin/components/csv-editor.js` (`renderTable` header + body to add the anchor column; `initCSVEditor` + a resize listener to call `fitCsvEditorViewport`)
- Modify: `admin/styles/app.css`

This task is layout/RTL — its acceptance is the e2e in Task 8 (jsdom can't compute sticky/scroll). Keep the jsdom suite green.

- [ ] **Step 1: Add the anchor column to `renderTable`**

In the `<thead>` row, BEFORE the `${headers.map(...)}` header cells, add the anchor header:

```js
          <th class="csv-anchor-cell px-3 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap bg-gray-50">
            ${escapeHtml(t('csv.anchorColumn'))}
          </th>
```

In each body `<tr>`, BEFORE the `${headers.map(...)}` data cells, add the anchor cell (read-only identity = row # · svgCode):

```js
            <td class="csv-anchor-cell px-3 py-2 border-b border-gray-100 text-xs text-gray-500 whitespace-nowrap bg-white">
              ${rowIndex + 1} · ${escapeHtml(row.svgCode || '—')}
            </td>
```

- [ ] **Step 2: Add the viewport-fit helper**

Add near the other helpers in `csv-editor.js`:

```js
/**
 * #187: size the table's own scroll window to the space below the toolbar so
 * the header freezes visibly and the horizontal scrollbar stays on screen.
 * Mirrors fitMapEditorViewport in map-editor.js.
 */
function fitCsvEditorViewport() {
  const container = document.getElementById('table-container');
  if (!container) return;
  const top = container.getBoundingClientRect().top;
  const bottomMargin = 24; // px breathing room
  const h = Math.max(200, window.innerHeight - top - bottomMargin);
  container.style.maxHeight = `${h}px`;
}
```

Call `fitCsvEditorViewport()` at the end of `initCSVEditor()` and after each `renderTable()` in `initCSVEditor`/`loadCSV`; and bind once (guard like the locale listener) a `window.addEventListener('resize', fitCsvEditorViewport)`.

- [ ] **Step 3: Add the grid CSS** to `admin/styles/app.css` (append):

```css
/* #187 CSV Editor — bounded scroll viewport + frozen header + frozen anchor column.
   The container scrolls on BOTH axes so the sticky header has a real scroll
   context (no longer slides under the page nav) and the horizontal scrollbar
   stays on screen instead of at the bottom of all rows. */
#table-container { overflow: auto; }            /* max-height is set by fitCsvEditorViewport() */

#csv-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f9fafb;                            /* opaque gray-50 so rows don't bleed through */
}

/* Frozen left anchor column. inset-inline-start pins it to the start edge —
   left in English (LTR), right in Hebrew (RTL) — automatically. */
#csv-table .csv-anchor-cell {
  position: sticky;
  inset-inline-start: 0;
  z-index: 1;
}
#csv-table tbody .csv-anchor-cell { background: #ffffff; }   /* opaque so columns don't show through */
#csv-table thead .csv-anchor-cell { z-index: 3; background: #f9fafb; }   /* corner: above header + column */
```

- [ ] **Step 4: Keep the unit suite green + manual sanity**

Run (from `admin/`): `NODE_OPTIONS=--experimental-vm-modules npx jest`
Expected: PASS (the new anchor `<td>`/`<th>` don't break existing selectors; existing tests target `input.csv-input[data-column]` and `tr[data-row-index]`, which are unchanged).

- [ ] **Step 5: Commit**

```bash
git add admin/components/csv-editor.js admin/styles/app.css
git commit -m "feat(#187): bounded scroll viewport, frozen header, frozen left anchor column (LTR+RTL)"
```

---

## Task 8: e2e — frozen header / anchor column / visible scrollbar (LTR + RTL)

**Files:**
- Create: `e2e/tests/csv-editor-grid.spec.ts`

Run e2e against a repo-root static server (per CLAUDE.md): `npx http-server . -p 8123` then `E2E_BASE_URL=http://localhost:8123 npx playwright test e2e/tests/csv-editor-grid.spec.ts`. Reuse the existing admin auth fixture in `e2e/fixtures` (same import the other admin specs use) so the CSV Editor mounts as an admin with data.

- [ ] **Step 1: Write the test**

Create `e2e/tests/csv-editor-grid.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
// Reuse the project's admin-auth setup. Match the import path the existing
// admin specs use (e.g. ../fixtures/auth) — adjust to the actual fixture export.
import { loginAsAdmin, seedWideCsv } from '../fixtures/auth';

test.describe('CSV Editor grid (#187)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);                 // existing helper
    await seedWideCsv(page, { rows: 60 });    // existing/added helper: many rows so it scrolls
    await page.goto('/admin/#csv');
    await page.locator('#csv-table').waitFor();
  });

  test('header stays visible when the table scrolls vertically', async ({ page }) => {
    const container = page.locator('#table-container');
    const headerCell = page.locator('#csv-table thead th').first();
    const before = await headerCell.boundingBox();
    await container.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const after = await headerCell.boundingBox();
    // The header tracks the top of the scroll container (does not scroll away).
    expect(Math.abs((after!.y) - (before!.y))).toBeLessThan(4);
    expect(await headerCell.evaluate(el => getComputedStyle(el).position)).toBe('sticky');
  });

  test('anchor column stays visible when the table scrolls horizontally', async ({ page }) => {
    const container = page.locator('#table-container');
    const anchor = page.locator('#csv-table tbody .csv-anchor-cell').first();
    const before = await anchor.boundingBox();
    await container.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const after = await anchor.boundingBox();
    expect(Math.abs((after!.x) - (before!.x))).toBeLessThan(4);
    expect(await anchor.evaluate(el => getComputedStyle(el).position)).toBe('sticky');
  });

  test('the table scrolls horizontally inside its own bounded viewport', async ({ page }) => {
    const metrics = await page.locator('#table-container').evaluate(el => ({
      hOverflow: el.scrollWidth > el.clientWidth,
      bounded: el.clientHeight < el.scrollHeight,         // vertical content exceeds the window
      withinViewport: el.getBoundingClientRect().bottom <= window.innerHeight + 1,
    }));
    expect(metrics.hOverflow).toBe(true);                 // wide enough to need horizontal scroll
    expect(metrics.bounded).toBe(true);                   // the table has its own scroll window
    expect(metrics.withinViewport).toBe(true);            // the bottom (with its scrollbar) is on screen
  });

  test('RTL: anchor column pins to the right (inline-start) edge', async ({ page }) => {
    await page.locator('#lang-he').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('#csv-table').waitFor();
    const { containerRight, anchorRight } = await page.evaluate(() => {
      const c = document.getElementById('table-container')!.getBoundingClientRect();
      const a = document.querySelector('#csv-table tbody .csv-anchor-cell')!.getBoundingClientRect();
      return { containerRight: c.right, anchorRight: a.right };
    });
    // In RTL the frozen anchor hugs the right (start) edge of the container.
    expect(Math.abs(containerRight - anchorRight)).toBeLessThan(24);
  });
});
```

- [ ] **Step 2: Run it and verify (red → green)**

Run: `npx http-server . -p 8123 &` then `E2E_BASE_URL=http://localhost:8123 npx playwright test e2e/tests/csv-editor-grid.spec.ts`
Expected: GREEN after Task 7. If the fixture helper names differ (`loginAsAdmin`/`seedWideCsv`), adapt to the actual exports in `e2e/fixtures` (check a sibling admin spec) — do NOT weaken the assertions to make them pass (HR1).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/csv-editor-grid.spec.ts
git commit -m "test(#187): e2e — frozen header, frozen anchor column, visible scrollbar (LTR+RTL)"
```

---

## Task 9: i18n parity + full-suite verification + PR

**Files:**
- Modify: `admin/i18n/en.json`, `admin/i18n/he.json` (mirror the new FALLBACKS keys)
- Modify: `admin/index.html` + `admin/app.js` (`?v=` bump for the changed module chain)

- [ ] **Step 1: Add the i18n keys** to `admin/i18n/en.json` and `admin/i18n/he.json` (under the existing `csv.*` group), mirroring the FALLBACKS added in Task 2 (`csv.saveBlocked`, `csv.noProblems`, `csv.problemCount`, `csv.anchorColumn`). Keep en/he parity. (Confirm the exact i18n file paths with `ls admin/i18n`; if the project stores them elsewhere, match that location.)

- [ ] **Step 2: Run the FULL admin suite (regression guard, HR7)**

Run (from `admin/`): `NODE_OPTIONS=--experimental-vm-modules npx jest`
Expected: all suites PASS (existing 949 + the new csv-validation and save-gate tests). Investigate any red — do not weaken existing tests (HR1).

- [ ] **Step 3: Cache-bust the changed module chain** (deploy correctness — same rule used for #88): bump `csv-editor.js?v=` where `app.js` imports it, and bump `app.js?v=` in `index.html`. (Coordinate the exact numbers with whatever is on `main` after #186 merges.)

```bash
git add admin/i18n/en.json admin/i18n/he.json admin/index.html admin/app.js
git commit -m "chore(#187): i18n parity for new strings + ?v= cache-bust for the csv-editor chain"
```

- [ ] **Step 4: Push + open the PR** using the repo PR template, filling the AC↔test map:

| AC | Test |
|----|------|
| AC1 error blocks | `csv-editor-save-gate` "blocking row prevents the PUT" + `csv-validation` E001/E002/E003/E005/E006 cases |
| AC2 warnings-only saves | `csv-editor-save-gate` "warnings-only saves" + `csv-validation` overlap-is-warning |
| AC3 reason inline | `csv-editor-save-gate` "error class + title" |
| AC4 count + Save disabled + filter | `csv-editor-save-gate` "indicator…" cases |
| AC5 empty row blocked + removable | `csv-editor-save-gate` "empty added row blocks…" |
| AC6 server reason surfaced | `csv-editor-save-gate` "server 422 surfaces the server message" |
| AC7–AC10 grid LTR+RTL | `e2e/tests/csv-editor-grid.spec.ts` |

```bash
git push -u origin feat/csv-editor-validate-grid
gh pr create --title "CSV Editor: validate before save + usable wide grid (#187)" --body "Closes #187. <fill template + AC↔test map + paste suite output>"
```

- [ ] **Step 5: Owner app-check (WORKFLOW step 7).** Deploy from the branch for QA (3 SPA files; no Lambda change), then the owner exercises: add a row with a blank floor → Save is blocked with the reason shown; the header and anchor column stay put while scrolling; the horizontal scrollbar is visible without scrolling to the bottom; repeat in Hebrew.

---

## Self-Review

- **Spec coverage:** AC1→T2/T1; AC2→T2/T1; AC3→T5; AC4→T4; AC5→T6; AC6→T3; AC7–AC10→T7+T8. Decisions table (whole-file-valid, errors-block/overlap-warns, freeze header+anchor) all implemented. "Live file is clean" → no migration task needed (correct). #134 (this editor) → T3; #84 at-source → T2+T6. All spec sections map to a task.
- **Placeholder scan:** No TBD/TODO; every code step shows real code. The only adapt-to-reality notes are the e2e fixture export names (Task 8) and i18n file paths (Task 9) — both call out exactly what to confirm, not vague hand-waves.
- **Type/name consistency:** `validateDataset` shape (`problemsByRow`, `blockingRowIndexes`, `warningRowIndexes`, `hasBlocking`, `blockingCount`) is identical across T1, T2, T4, T5. Helper/hook names (`updateProblemIndicator`, `applyProblemsFilter`, `fitCsvEditorViewport`, `__addRowForTest`, `__saveForTest`, `__updateProblemIndicatorForTest`) are consistent. Cell classes (`csv-cell-error`, `csv-cell-warning`, `csv-anchor-cell`) match between JS and CSS.
- **Ordering risk:** Task 2 references `updateProblemIndicator` (defined in Task 4) — Step 4 of Task 2 calls out the temporary no-op so the suite stays green between tasks; Task 4 replaces it. Flagged inline.
