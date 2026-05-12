# Issue #16 PR 2 — Empty-shelf clickability + UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make empty shelves (marked `data-map-object="shelf"`, zero CSV rows) clickable in the Map Editor; render a rich empty-state with a one-click CTA that creates the first range; show a dashed outline on the canvas.

**Architecture:** Surgical follow-up to PR 1. Drop the temporary "AND has CSV row" preservation filter in `loadFloor`; toggle a new `.map-shelf--empty` CSS class per shelf based on `rangeCountByShelf.has(id)`; add an empty-state branch to `shelf-drawer.js#showSingleShelf` that renders three elements (message + amber-bordered explanation + primary CTA) and wires the CTA to the existing `onAdd` callback. No new modules.

**Tech Stack:** Vanilla JS ES modules, Jest 29 (jsdom), Playwright (project matrix: `en-admin`, `he-admin`), CSS in `admin/styles/app.css`, i18n via JSON dictionaries in `admin/i18n/{en,he}.json`.

**Spec:** `docs/superpowers/specs/2026-05-12-issue-16-pr2-empty-shelf-ux-design.md`

---

## File Structure

**Created:**
- `admin/__tests__/shelf-drawer.test.js` — Jest unit tests for the empty-state branch (5 tests).
- `e2e/tests/map-editor-empty-shelf.spec.ts` — Playwright E2E spec covering the empty-shelf flow.

**Modified:**
- `admin/components/map-editor/shelf-drawer.js` — render rich empty-state when `rangesOnShelf.length === 0`.
- `admin/components/map-editor.js` — drop preservation filter; toggle `.map-shelf--empty`.
- `admin/styles/app.css` — append `.map-shelf--empty` and `.map-drawer__empty-state*` rules.
- `admin/i18n/en.json` — add `mapEditor.shelf.empty.{message,explanation,cta}`.
- `admin/i18n/he.json` — add same keys (Hebrew).
- `e2e/fixtures/map-editor/floor_test.svg` — add a 5th rect `E1` with `data-map-object="shelf"`, NOT referenced by the fixture CSV.

**Untouched:**
- `admin/components/map-editor/location-model.js` — already provides `indexShelfLocations` (PR 1).
- `maps/floor_{0,1,2}.svg` — markers already applied in PR 1; no SVG deploy in PR 2.
- `e2e/fixtures/map-editor/mapping_with_conflicts.csv` — leaving `E1` unreferenced is the whole point.

---

## Task 0: Setup branch and rollback tag

**Files:** none (branch metadata only).

- [ ] **Step 0.1: Confirm working tree is clean and on `main`**

Run: `cd /home/hagaybar/projects/primo_maps && git status --porcelain && git rev-parse --abbrev-ref HEAD`
Expected: empty porcelain output (or only untracked junk under `.a5c/cache/`, `.claude/`, `docs/orphan_panel_hebrew_UI_bug.png`, `docs/primo_maps_issues_mape_editor_feature.pdf`); current branch is `main`.

- [ ] **Step 0.2: Pull latest main**

Run: `cd /home/hagaybar/projects/primo_maps && git fetch origin && git pull --ff-only origin main`
Expected: "Already up to date." or a fast-forward update.

- [ ] **Step 0.3: Create pre-feature rollback tag**

Run: `cd /home/hagaybar/projects/primo_maps && git tag -a pre/issue-16-pr2 -m "Rollback anchor before issue #16 PR 2" && git push origin pre/issue-16-pr2`
Expected: tag created locally and pushed.

- [ ] **Step 0.4: Create and switch to feature branch**

Run: `cd /home/hagaybar/projects/primo_maps && git checkout -b feat/issue-16-pr2-empty-shelf-ux`
Expected: "Switched to a new branch 'feat/issue-16-pr2-empty-shelf-ux'".

- [ ] **Step 0.5: Confirm PR 1 foundation is in place**

Run: `cd /home/hagaybar/projects/primo_maps && grep -n "indexShelfLocations" admin/components/map-editor.js`
Expected: at least one match on a line that imports from `./map-editor/location-model.js` and at least one match inside `loadFloor`.

Run: `cd /home/hagaybar/projects/primo_maps && grep -c 'data-map-object="shelf"' maps/floor_0.svg maps/floor_1.svg maps/floor_2.svg`
Expected: `maps/floor_0.svg:1`, `maps/floor_1.svg:202`, `maps/floor_2.svg:191`.

---

## Task 1: Extend the e2e test fixture with an empty shelf

**Files:**
- Modify: `e2e/fixtures/map-editor/floor_test.svg`

- [ ] **Step 1.1: Add the `E1` rect + label**

Edit `e2e/fixtures/map-editor/floor_test.svg`. The current file is:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <rect id="A1" data-map-object="shelf" x="20" y="20" width="80" height="40" fill="#94a3b8"/>
  <rect id="B1" data-map-object="shelf" x="120" y="20" width="80" height="40" fill="#94a3b8"/>
  <rect id="C1" data-map-object="shelf" x="220" y="20" width="80" height="40" fill="#94a3b8"/>
  <rect id="D1" data-map-object="shelf" x="20" y="100" width="80" height="40" fill="#94a3b8"/>
  <text x="60" y="42" text-anchor="middle" font-size="10">A1</text>
  <text x="160" y="42" text-anchor="middle" font-size="10">B1</text>
  <text x="260" y="42" text-anchor="middle" font-size="10">C1</text>
  <text x="60" y="122" text-anchor="middle" font-size="10">D1</text>
</svg>
```

Replace it with (adds `E1` rect at 120/100 and a matching label at 160/122):

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <rect id="A1" data-map-object="shelf" x="20" y="20" width="80" height="40" fill="#94a3b8"/>
  <rect id="B1" data-map-object="shelf" x="120" y="20" width="80" height="40" fill="#94a3b8"/>
  <rect id="C1" data-map-object="shelf" x="220" y="20" width="80" height="40" fill="#94a3b8"/>
  <rect id="D1" data-map-object="shelf" x="20" y="100" width="80" height="40" fill="#94a3b8"/>
  <rect id="E1" data-map-object="shelf" x="120" y="100" width="80" height="40" fill="#94a3b8"/>
  <text x="60" y="42" text-anchor="middle" font-size="10">A1</text>
  <text x="160" y="42" text-anchor="middle" font-size="10">B1</text>
  <text x="260" y="42" text-anchor="middle" font-size="10">C1</text>
  <text x="60" y="122" text-anchor="middle" font-size="10">D1</text>
  <text x="160" y="122" text-anchor="middle" font-size="10">E1</text>
</svg>
```

- [ ] **Step 1.2: Verify the fixture CSV does NOT reference `E1`**

Run: `cd /home/hagaybar/projects/primo_maps && grep -c "^E1\|,E1," e2e/fixtures/map-editor/mapping_with_conflicts.csv || echo "0"`
Expected: `0` (or grep exits 1 with no matches — both indicate `E1` is unreferenced).

- [ ] **Step 1.3: Commit**

Run:
```bash
cd /home/hagaybar/projects/primo_maps && \
  git add e2e/fixtures/map-editor/floor_test.svg && \
  git commit -m "test(map-editor): add unreferenced E1 shelf to floor_test fixture

Sets up the empty-shelf path for PR 2's e2e spec — E1 carries
data-map-object=\"shelf\" but is absent from mapping_with_conflicts.csv."
```
Expected: one new commit on `feat/issue-16-pr2-empty-shelf-ux`.

---

## Task 2: Add i18n keys for the empty-state UI

**Files:**
- Modify: `admin/i18n/en.json`
- Modify: `admin/i18n/he.json`

- [ ] **Step 2.1: Add empty-state keys to `en.json`**

Locate the existing `"mapEditor.shelf"` block in `admin/i18n/en.json` (around line 385):

```json
    "shelf": {
      "header": "Shelf {label} — {n} ranges"
    },
```

Replace it with:

```json
    "shelf": {
      "header": "Shelf {label} — {n} ranges",
      "empty": {
        "message": "No ranges are mapped to this shelf yet.",
        "explanation": "This shelf is on the map but has no ranges assigned. Click 'Create the first range here' to add the first range — you can set the collection and the call-number range in the next step.",
        "cta": "Create the first range here"
      }
    },
```

- [ ] **Step 2.2: Add empty-state keys to `he.json`**

Locate the matching block in `admin/i18n/he.json` (around line 385):

```json
    "shelf": {
      "header": "מדף {label} — {n} טווחים"
    },
```

Replace it with:

```json
    "shelf": {
      "header": "מדף {label} — {n} טווחים",
      "empty": {
        "message": "אין כרגע טווחים ממופים למדף זה.",
        "explanation": "מדף זה מסומן במפה אך לא הוקצו לו טווחים. לחצו על 'צור טווח ראשון למדף זה' כדי להוסיף טווח ראשון — תוכלו לקבוע אוסף וטווח מספרי סיווג בשלב הבא.",
        "cta": "צור טווח ראשון למדף זה"
      }
    },
```

- [ ] **Step 2.3: Verify JSON validity for both files**

Run: `cd /home/hagaybar/projects/primo_maps && node -e "JSON.parse(require('fs').readFileSync('admin/i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('admin/i18n/he.json','utf8'));console.log('ok')"`
Expected: `ok` printed; no JSON parse error.

- [ ] **Step 2.4: Commit**

Run:
```bash
cd /home/hagaybar/projects/primo_maps && \
  git add admin/i18n/en.json admin/i18n/he.json && \
  git commit -m "i18n(map-editor): add empty-shelf message, explanation, CTA strings"
```

---

## Task 3: Write failing Jest unit tests for the empty-state drawer branch

**Files:**
- Create: `admin/__tests__/shelf-drawer.test.js`

- [ ] **Step 3.1: Create the test file**

Create `admin/__tests__/shelf-drawer.test.js` with the following content (exact):

```js
/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

describe('showSingleShelf — empty-state branch', () => {
  let mountDrawer;
  let showSingleShelf;
  let hideDrawer;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="drawer"></div>';

    // Minimal i18n mock — return the key path so tests can assert by key.
    await jest.unstable_mockModule('../i18n.js?v=5', () => ({
      default: {
        t: (key) => key,
        get locale() { return 'en'; },
      },
    }));

    // Minimal range-validation stub — empty-state has no rows to validate.
    await jest.unstable_mockModule('../components/map-editor/range-validation.js?v=1', () => ({
      validateRangeShape: () => ({ ok: true }),
    }));

    ({ mountDrawer, showSingleShelf, hideDrawer } = await import('../components/map-editor/shelf-drawer.js'));
    mountDrawer('drawer');
  });

  const baseProps = (overrides = {}) => ({
    shelfId: 'E1',
    shelfLabel: 'E1',
    rangesOnShelf: [],
    conflictsByRangeId: new Map(),
    conflictingShelves: [],
    permission: () => 'rw',
    collectionsList: [],
    onChange: jest.fn(),
    onAdd: jest.fn(),
    onMove: jest.fn(),
    onDelete: jest.fn(),
    onDiscard: jest.fn(),
    onSave: jest.fn(),
    onSelectShelf: jest.fn(),
    onClose: jest.fn(),
    hasPendingEdits: false,
    ...overrides,
  });

  test('renders .map-drawer__empty-state container when rangesOnShelf is empty', () => {
    showSingleShelf(baseProps());
    expect(document.querySelector('.map-drawer__empty-state')).not.toBeNull();
  });

  test('empty-state contains message, explanation, and CTA elements', () => {
    showSingleShelf(baseProps());
    const container = document.querySelector('.map-drawer__empty-state');
    expect(container.querySelector('.map-drawer__empty-state__message')).not.toBeNull();
    expect(container.querySelector('.map-drawer__empty-state__explanation')).not.toBeNull();
    expect(container.querySelector('.map-drawer__empty-state__cta')).not.toBeNull();
  });

  test('empty-state uses the i18n keys for message, explanation, and CTA', () => {
    showSingleShelf(baseProps());
    expect(document.querySelector('.map-drawer__empty-state__message').textContent)
      .toContain('mapEditor.shelf.empty.message');
    expect(document.querySelector('.map-drawer__empty-state__explanation').textContent)
      .toContain('mapEditor.shelf.empty.explanation');
    expect(document.querySelector('.map-drawer__empty-state__cta').textContent)
      .toContain('mapEditor.shelf.empty.cta');
  });

  test('clicking the empty-state CTA fires onAdd', () => {
    const onAdd = jest.fn();
    showSingleShelf(baseProps({ onAdd }));
    document.querySelector('.map-drawer__empty-state__cta').click();
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('empty-state container is NOT rendered when rangesOnShelf has at least one row', () => {
    showSingleShelf(baseProps({
      rangesOnShelf: [{
        id: 'r1',
        svgCode: 'E1',
        collectionName: 'GEN',
        rangeStart: 'A',
        rangeEnd: 'Z',
        shelfLabel: 'E1',
      }],
    }));
    expect(document.querySelector('.map-drawer__empty-state')).toBeNull();
  });
});
```

- [ ] **Step 3.2: Run the tests and verify they fail**

Run: `cd /home/hagaybar/projects/primo_maps && npx jest admin/__tests__/shelf-drawer.test.js`
Expected: 5 tests FAIL (the empty-state DOM elements don't exist yet — current `showSingleShelf` renders `#drawer-rows` and `#drawer-add` regardless of `rangesOnShelf.length`).

- [ ] **Step 3.3: Commit the failing tests**

Run:
```bash
cd /home/hagaybar/projects/primo_maps && \
  git add admin/__tests__/shelf-drawer.test.js && \
  git commit -m "test(map-editor): add failing unit tests for shelf-drawer empty-state branch"
```

---

## Task 4: Implement the empty-state branch in `shelf-drawer.js`

**Files:**
- Modify: `admin/components/map-editor/shelf-drawer.js`

- [ ] **Step 4.1: Replace the body of `showSingleShelf` with the empty-state-aware version**

In `admin/components/map-editor/shelf-drawer.js`, the current function is:

```js
export function showSingleShelf({ shelfId, shelfLabel, rangesOnShelf, conflictsByRangeId, conflictingShelves, permission, collectionsList, onChange, onAdd, onMove, onDelete, onDiscard, onSave, onSelectShelf, onClose, hasPendingEdits }) {
  if (!host) return;
  host.classList.remove('map-drawer--hidden');
  const conflictCount = rangesOnShelf.reduce((n, r) => n + (conflictsByRangeId.get(r.id)?.length || 0), 0);
  const banner = buildConflictBanner(conflictCount, conflictingShelves || []);
  const closeLabel = i18n.t('mapEditor.close');
  host.innerHTML = `
    <div class="map-drawer__header">
      <h3 class="text-sm font-semibold">${i18n.t('mapEditor.shelf.header').replace('{label}', shelfLabel).replace('{n}', rangesOnShelf.length)}</h3>
      <div class="flex gap-2 items-center">
        <button id="drawer-discard" class="px-3 py-1 text-sm border rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.discard')}</button>
        <button id="drawer-save" class="px-3 py-1 text-sm bg-blue-600 text-white rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.save')}</button>
        <button id="drawer-close" aria-label="${closeLabel}" title="${closeLabel}" class="px-2 py-1 text-gray-500 hover:text-gray-800 text-lg leading-none">×</button>
      </div>
    </div>
    ${banner}
    <div class="map-drawer__rows" id="drawer-rows"></div>
    <button id="drawer-add" class="mt-2 px-3 py-1 text-sm border rounded">${i18n.t('mapEditor.addRange')}</button>
  `;
  const rowsEl = host.querySelector('#drawer-rows');
  for (const r of rangesOnShelf) {
    const isLocked = permission(r.id) === 'readonly';
    const conflicts = conflictsByRangeId.get(r.id) || [];
    rowsEl.appendChild(buildRow(r, { isLocked, conflicts, collectionsList, onChange, onMove, onDelete }));
  }
  host.querySelector('#drawer-discard').onclick = onDiscard;
  host.querySelector('#drawer-save').onclick = onSave;
  host.querySelector('#drawer-add').onclick = onAdd;
  const closeBtn = host.querySelector('#drawer-close');
  if (closeBtn) {
    closeBtn.onclick = () => { if (typeof onClose === 'function') onClose(); };
  }
  if (typeof onSelectShelf === 'function') {
    host.querySelectorAll('.map-drawer__warn-link').forEach(btn => {
      btn.addEventListener('click', () => onSelectShelf(btn.dataset.targetShelf));
    });
  }
}
```

Replace it with:

```js
export function showSingleShelf({ shelfId, shelfLabel, rangesOnShelf, conflictsByRangeId, conflictingShelves, permission, collectionsList, onChange, onAdd, onMove, onDelete, onDiscard, onSave, onSelectShelf, onClose, hasPendingEdits }) {
  if (!host) return;
  host.classList.remove('map-drawer--hidden');
  const conflictCount = rangesOnShelf.reduce((n, r) => n + (conflictsByRangeId.get(r.id)?.length || 0), 0);
  const banner = buildConflictBanner(conflictCount, conflictingShelves || []);
  const closeLabel = i18n.t('mapEditor.close');
  const isEmpty = rangesOnShelf.length === 0;
  const body = isEmpty
    ? `
      <div class="map-drawer__empty-state">
        <p class="map-drawer__empty-state__message">${i18n.t('mapEditor.shelf.empty.message')}</p>
        <p class="map-drawer__empty-state__explanation">${i18n.t('mapEditor.shelf.empty.explanation')}</p>
        <button id="drawer-empty-cta" class="map-drawer__empty-state__cta" type="button">
          <span class="map-drawer__empty-state__cta__icon">➕</span>${i18n.t('mapEditor.shelf.empty.cta')}
        </button>
      </div>
    `
    : `
      <div class="map-drawer__rows" id="drawer-rows"></div>
      <button id="drawer-add" class="mt-2 px-3 py-1 text-sm border rounded">${i18n.t('mapEditor.addRange')}</button>
    `;
  host.innerHTML = `
    <div class="map-drawer__header">
      <h3 class="text-sm font-semibold">${i18n.t('mapEditor.shelf.header').replace('{label}', shelfLabel).replace('{n}', rangesOnShelf.length)}</h3>
      <div class="flex gap-2 items-center">
        <button id="drawer-discard" class="px-3 py-1 text-sm border rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.discard')}</button>
        <button id="drawer-save" class="px-3 py-1 text-sm bg-blue-600 text-white rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.save')}</button>
        <button id="drawer-close" aria-label="${closeLabel}" title="${closeLabel}" class="px-2 py-1 text-gray-500 hover:text-gray-800 text-lg leading-none">×</button>
      </div>
    </div>
    ${banner}
    ${body}
  `;
  if (!isEmpty) {
    const rowsEl = host.querySelector('#drawer-rows');
    for (const r of rangesOnShelf) {
      const isLocked = permission(r.id) === 'readonly';
      const conflicts = conflictsByRangeId.get(r.id) || [];
      rowsEl.appendChild(buildRow(r, { isLocked, conflicts, collectionsList, onChange, onMove, onDelete }));
    }
    host.querySelector('#drawer-add').onclick = onAdd;
  } else {
    host.querySelector('#drawer-empty-cta').onclick = onAdd;
  }
  host.querySelector('#drawer-discard').onclick = onDiscard;
  host.querySelector('#drawer-save').onclick = onSave;
  const closeBtn = host.querySelector('#drawer-close');
  if (closeBtn) {
    closeBtn.onclick = () => { if (typeof onClose === 'function') onClose(); };
  }
  if (typeof onSelectShelf === 'function') {
    host.querySelectorAll('.map-drawer__warn-link').forEach(btn => {
      btn.addEventListener('click', () => onSelectShelf(btn.dataset.targetShelf));
    });
  }
}
```

- [ ] **Step 4.2: Run the unit tests and verify they pass**

Run: `cd /home/hagaybar/projects/primo_maps && npx jest admin/__tests__/shelf-drawer.test.js`
Expected: all 5 tests PASS.

- [ ] **Step 4.3: Run the full admin Jest suite to verify no regression**

Run: `cd /home/hagaybar/projects/primo_maps && npx jest --testPathIgnorePatterns="node_modules"`
Expected: same pass/fail signature as `main` plus the 5 new tests passing. Pre-existing issue-#9 failures (if any) remain unchanged. No NEW failures.

- [ ] **Step 4.4: Commit**

Run:
```bash
cd /home/hagaybar/projects/primo_maps && \
  git add admin/components/map-editor/shelf-drawer.js && \
  git commit -m "feat(map-editor): render rich empty-state in shelf drawer

When the selected shelf has zero ranges, show a centered message, an
amber-bordered explanation, and a primary CTA wired to the existing
onAdd callback in place of the empty rows area + bare + Add range
button."
```

---

## Task 5: Add CSS rules for `.map-shelf--empty` and `.map-drawer__empty-state*`

**Files:**
- Modify: `admin/styles/app.css`

- [ ] **Step 5.1: Append the new rules to `admin/styles/app.css`**

Append the following block to the END of `admin/styles/app.css` (after the existing `.map-orphan-card__primary-icon` rule):

```css

/* Empty shelf visual treatment — dashed outline (issue #16 PR 2) */
.map-shelf--empty {
  stroke: #94a3b8;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  fill-opacity: 0.4;
}

/* Empty-state UI in the drawer (issue #16 PR 2) */
.map-drawer__empty-state {
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.map-drawer__empty-state__message {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  text-align: center;
  margin: 0;
}

.map-drawer__empty-state__explanation {
  font-size: 12px;
  color: #4b5563;
  line-height: 1.5;
  margin: 0;
  padding: 10px 12px;
  background: #f9fafb;
  border-inline-start: 3px solid #f59e0b;
  border-radius: 3px;
  max-width: 480px;
}

.map-drawer__empty-state__cta {
  background: #3b82f6;
  color: #fff;
  border: 0;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.map-drawer__empty-state__cta:hover {
  background: #2563eb;
}

.map-drawer__empty-state__cta__icon {
  font-size: 14px;
  line-height: 1;
}
```

- [ ] **Step 5.2: Verify the rules landed**

Run: `cd /home/hagaybar/projects/primo_maps && grep -c "map-shelf--empty\|map-drawer__empty-state" admin/styles/app.css`
Expected: at least `7` (one selector for `.map-shelf--empty`, six for empty-state variants — comment lines also match `__empty-state` substrings, so the actual count may be higher; the floor is 7).

- [ ] **Step 5.3: Commit**

Run:
```bash
cd /home/hagaybar/projects/primo_maps && \
  git add admin/styles/app.css && \
  git commit -m "style(map-editor): add empty-shelf dashed outline and drawer empty-state styles"
```

---

## Task 6: Drop the preservation filter and toggle `.map-shelf--empty` in `loadFloor`

**Files:**
- Modify: `admin/components/map-editor.js`

- [ ] **Step 6.1: Replace the preservation-filter block**

In `admin/components/map-editor.js`, the current block at lines ~256-266 is:

```js
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

Replace it with:

```js
  // PR 2: every shelf-kind Location is clickable. Empty shelves get the
  // dashed outline (.map-shelf--empty) toggled below after attachInteraction
  // has wired up its own class state.
  locationElements = indexShelfLocations(svgRoot);
```

- [ ] **Step 6.2: Add the `.map-shelf--empty` toggle next to the existing `.map-shelf--has-conflicts` toggle**

In `admin/components/map-editor.js`, the current block at lines ~294-298 is:

```js
  // Render conflict markers.
  for (const [locationId, el] of locationElements) {
    const shelfHasConflict = floorRanges.some(r => r.svgCode === locationId && floorConflicts.has(r.id));
    el.classList.toggle('map-shelf--has-conflicts', shelfHasConflict);
  }
```

Replace it with:

```js
  // Render conflict markers + empty-shelf dashed outline.
  for (const [locationId, el] of locationElements) {
    const shelfHasConflict = floorRanges.some(r => r.svgCode === locationId && floorConflicts.has(r.id));
    el.classList.toggle('map-shelf--has-conflicts', shelfHasConflict);
    el.classList.toggle('map-shelf--empty', !rangeCountByShelf.has(locationId));
  }
```

- [ ] **Step 6.3: Run the admin Jest suite — still no regression**

Run: `cd /home/hagaybar/projects/primo_maps && npx jest --testPathIgnorePatterns="node_modules"`
Expected: same pass/fail signature as after Task 4 (5 new shelf-drawer tests pass; pre-existing failures unchanged).

- [ ] **Step 6.4: Commit**

Run:
```bash
cd /home/hagaybar/projects/primo_maps && \
  git add admin/components/map-editor.js && \
  git commit -m "feat(map-editor): make every marked shelf clickable and outline empty ones

Removes the temporary PR 1 preservation filter (which kept empty shelves
non-clickable). locationElements is now the unfiltered marker-driven map
from indexShelfLocations(). Each shelf gets .map-shelf--empty toggled
when it has zero ranges on the active floor."
```

---

## Task 7: Write Playwright E2E spec for the empty-shelf flow

**Files:**
- Create: `e2e/tests/map-editor-empty-shelf.spec.ts`

- [ ] **Step 7.1: Inspect an existing minimal map-editor spec for the auth + fixture preamble**

Run: `cd /home/hagaybar/projects/primo_maps && sed -n '1,40p' e2e/tests/map-editor.spec.ts`
Expected: imports `mockFixtures` from `../fixtures/map-editor-fixtures` and uses a `beforeEach` that calls `mockFixtures(page)` then navigates. Use this same pattern.

- [ ] **Step 7.2: Create `e2e/tests/map-editor-empty-shelf.spec.ts`**

Create `e2e/tests/map-editor-empty-shelf.spec.ts` with the following content (exact):

```ts
/**
 * E2E spec — issue #16 PR 2: empty-shelf clickability + UX.
 *
 * The fixture floor_test.svg defines 5 shelves: A1, B1, C1, D1 (referenced
 * by mapping_with_conflicts.csv) and E1 (unreferenced — the empty-shelf
 * under test).
 */

import { test, expect } from '@playwright/test';
import { mockFixtures } from '../fixtures/map-editor-fixtures';

test.describe('Map Editor — empty shelf', () => {
  test.beforeEach(async ({ page }) => {
    await mockFixtures(page);
    await page.goto('/admin/');
    // Wait for the Map Editor tab/panel to be reachable; specs throughout the
    // suite click the same nav entry. Use the test id wired in the SPA.
    await page.getByTestId('nav-map-editor').click();
    await page.waitForSelector('#map-canvas svg', { state: 'visible' });
  });

  test('empty shelf E1 is clickable and opens the empty-state drawer', async ({ page }) => {
    // The dashed-outline class lands on every shelf with zero CSV rows. In
    // the fixture, only E1 qualifies — so the class count must be >= 1.
    const emptyCount = await page.evaluate(() =>
      document.querySelectorAll('.map-shelf--empty').length
    );
    expect(emptyCount).toBeGreaterThanOrEqual(1);

    // Click E1.
    await page.locator('#map-canvas svg #E1').click();

    // Drawer renders the empty-state UI.
    await expect(page.locator('.map-drawer__empty-state')).toBeVisible();
    await expect(page.locator('.map-drawer__empty-state__message')).toBeVisible();
    await expect(page.locator('.map-drawer__empty-state__explanation')).toBeVisible();
    await expect(page.locator('.map-drawer__empty-state__cta')).toBeVisible();

    // No range rows.
    expect(await page.locator('.map-drawer__row').count()).toBe(0);
  });

  test('clicking the empty-state CTA creates the first range', async ({ page }) => {
    await page.locator('#map-canvas svg #E1').click();
    await expect(page.locator('.map-drawer__empty-state__cta')).toBeVisible();

    await page.locator('.map-drawer__empty-state__cta').click();

    // Drawer transitions to populated UI.
    await expect(page.locator('.map-drawer__empty-state')).toHaveCount(0);
    await expect(page.locator('.map-drawer__row')).toHaveCount(1);

    // The new row's svgCode is captured in state — we proxy it via the drawer
    // header which uses both the shelf label and the range count.
    // Header template: "Shelf {label} — {n} ranges"
    const header = await page.locator('.map-drawer__header h3').textContent();
    expect(header).toContain('E1');
    expect(header).toContain('1');
  });
});
```

- [ ] **Step 7.3: Run the new spec in both locales (project matrix)**

Run: `cd /home/hagaybar/projects/primo_maps && npx playwright test e2e/tests/map-editor-empty-shelf.spec.ts --project=en-admin --project=he-admin --reporter=line`
Expected: 4 tests pass (2 tests × 2 projects). If any fail, STOP and report the discrepancy (do NOT mark the task complete).

- [ ] **Step 7.4: Commit**

Run:
```bash
cd /home/hagaybar/projects/primo_maps && \
  git add e2e/tests/map-editor-empty-shelf.spec.ts && \
  git commit -m "test(e2e): cover empty-shelf clickability and CTA in en + he"
```

---

## Task 8: Run the full Playwright suite — verify no regression

**Files:** none (verification only).

- [ ] **Step 8.1: Run the full suite across all projects**

Run: `cd /home/hagaybar/projects/primo_maps && npx playwright test --reporter=line`
Expected: same pass/fail signature as `main` PLUS 4 new passing tests from `map-editor-empty-shelf.spec.ts`. Existing anchors that MUST stay green: `map-editor-orphan-panel-positioning.spec.ts` (8/8 across the matrix), `map-editor-orphan-panel.spec.ts` (1 per project), `map-editor.spec.ts`, `map-editor-console-smoke.spec.ts`. Pre-existing issue-#9 failures may remain.

If any *previously-passing* spec fails, STOP and report `{ ok: false, discrepancy: "<which spec> failed: <one-line>", step: "8.1" }`.

- [ ] **Step 8.2: Save the run summary**

Run: `cd /home/hagaybar/projects/primo_maps && npx playwright show-report --help >/dev/null 2>&1 && echo "report available at playwright-report/"`
Expected: "report available at playwright-report/" (informational only — no commit).

---

## Task 9: Push branch, open PR, do NOT merge

**Files:** none (git remote + GitHub only).

- [ ] **Step 9.1: Push the branch**

Run: `cd /home/hagaybar/projects/primo_maps && git push -u origin feat/issue-16-pr2-empty-shelf-ux`
Expected: branch created on `origin`.

- [ ] **Step 9.2: Open the PR**

Run:
```bash
cd /home/hagaybar/projects/primo_maps && \
  gh pr create --base main --head feat/issue-16-pr2-empty-shelf-ux \
    --title "feat(map-editor): empty-shelf clickability + UX (issue #16 PR 2)" \
    --body "$(cat <<'EOF'
## Summary

- Drops the temporary PR 1 preservation filter — every shelf marked `data-map-object="shelf"` is now clickable.
- Renders a rich empty-state in the shelf drawer (message + amber-bordered explanation + primary CTA with `➕`) when a clicked shelf has zero CSV rows.
- Adds a dashed outline (`.map-shelf--empty`) on the canvas for empty shelves.
- CTA delegates to the existing `addNewRangeToShelf` flow; no new save path.

Spec: `docs/superpowers/specs/2026-05-12-issue-16-pr2-empty-shelf-ux-design.md`
Plan: `docs/superpowers/plans/2026-05-12-issue-16-pr2-empty-shelf-ux.md`

## Test plan

- [ ] Hard-refresh admin in English. Click `ka1_61_a` or `ka1_53_a` on floor 1 — drawer opens with the empty-state UI.
- [ ] Switch to Hebrew, repeat. Verify Hebrew strings render.
- [ ] Confirm dashed outline appears on empty shelves; populated shelves stay solid.
- [ ] Click the CTA — drawer transitions to populated UI with one pending row; svgCode matches the clicked shelf.
- [ ] Fill in the range + Save. After save, dashed outline disappears for that shelf.
- [ ] Discard / close with a pending row prompts for confirmation.
- [ ] Move-to-empty-shelf flow: open a populated shelf, click "Move to another shelf", pick an empty shelf — range relocates.
- [ ] Floor switch, hover, orphan panel: no regressions vs PR 1.
- [ ] All of the above pass in BOTH English AND Hebrew.

Rollback: `git revert <merge-commit>` on `main`, or hard-reset to tag `pre/issue-16-pr2`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: a PR URL is printed (e.g. `https://github.com/hagaybar/NDE_MAPS_MANGER/pull/N`).

- [ ] **Step 9.3: Capture the PR URL in the task output**

Return JSON `{ ok: true, summary: "PR opened for issue #16 PR 2", commitSha: null, prUrl: "<url from Step 9.2>" }`.

- [ ] **Step 9.4: Do NOT merge**

The user merges and deploys after their own review. This task ends with the PR open.

---

## Out of scope (do NOT do)

- Removing `indexShelvesById` from `svg-loader.js` — separate cleanup issue.
- Unifying `svg-parser.getAvailableCodes` with the marker — separate tech-debt issue.
- Adding `data-map-object="printer"` / `"toilet"` markers — deferred until a use case exists.
- CSV column renames — hard-blocked by NDE addon.
- Admin UI to mark new shelves visually — librarians use Inkscape.
- Surfacing empty-shelf counts in a badge or panel — dashed outline is the only discoverability signal.

## Closure gate

The issue is NOT considered closed until the 9-item manual verification checklist in the spec passes in BOTH English and Hebrew on the live deployed admin after redeploy + hard-refresh. The babysitter run ends at "PR open"; the user runs the manual gate.
