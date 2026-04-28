# Map-Based Range Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution will be driven by `babysitter:yolo` per spec §9.3 — minimal breakpoints, only the final acceptance is a hard gate.

**Goal:** Add a third top-level editing surface (the Map Editor) to the admin SPA that lets administrators and editors edit shelf ranges directly on floor-map SVGs, sharing the same `data/mapping.csv` as the existing CSV Editor and Location Editor.

**Architecture:** New top-level view (`admin/components/map-editor.js`) plus six small modules under `admin/components/map-editor/`. Reuses the existing CSV load/save services, role guard, range-restriction logic, and Dewey range comparator. No Lambda or API Gateway changes.

**Tech Stack:** Vanilla JS (ESM) + Tailwind CDN + Jest (`admin/__tests__/`) + Playwright (`e2e/tests/`). Assets deployed to S3 + CloudFront. Cognito for auth (already wired).

**Spec:** `docs/superpowers/specs/2026-04-28-map-editor-design.md` — read it before starting.

---

## File map

```
admin/components/
  map-editor.js                   NEW   top-level view, lifecycle, state wiring
  map-editor/
    svg-loader.js                 NEW   fetch + inject floor SVG, index by svgCode
    svg-interaction.js            NEW   pointer states (idle / hover / single / multi / reassign-pick)
    shelf-state.js                NEW   selection + pendingEdits (session-wide buffer)
    shelf-drawer.js               NEW   single + multi mode (replace flip)
    range-validation.js           NEW   overlap + start>end rules (with asymmetry comment)
    reassign-mode.js              NEW   "pick on map" + dropdown picker
    distinct-values-widget.js     NEW   multi-shelf bulk-edit field
    orphan-badge.js               NEW   per-floor orphan count + deep-link
admin/
  index.html                      MOD   nav-map-editor button + view shell
  app.js                          MOD   route + lazy init
  i18n/he.json                    MOD   strings
  i18n/en.json                    MOD   strings
  styles/app.css                  MOD   map-editor scoped styles + prefers-reduced-motion
  components/csv-editor.js        MOD   accept ?orphans=floor=N URL param
admin/__tests__/
  range-validation.test.js        NEW   canonical conflict matrix
  shelf-state.test.js             NEW   selection, pendingEdits, commit/revert
  shelf-drawer.test.js            NEW   mode flip, distinct-values widget
e2e/tests/
  map-editor.spec.ts              NEW   end-to-end flows
e2e/fixtures/map-editor/
  floor_test.svg                  NEW   3-shelf synthetic floor map
  mapping_with_conflicts.csv      NEW   seeded conflicts + orphan
.a5c/processes/map-editor/
  process.yaml                    NEW   babysitter process definition
```

---

## Task 0 — Pre-flight setup

**Files:**
- Create: `.a5c/processes/map-editor/process.yaml`
- Tag and branch on git.

- [ ] **Step 1: Tag current `main` for rollback**

```bash
git -C /home/hagaybar/projects/primo_maps tag pre-map-editor-2026-04-28 main
git -C /home/hagaybar/projects/primo_maps tag --list pre-map-editor-2026-04-28
```

Expected: prints `pre-map-editor-2026-04-28`.

- [ ] **Step 2: Create feature branch**

```bash
git -C /home/hagaybar/projects/primo_maps checkout -b feat/map-editor
git -C /home/hagaybar/projects/primo_maps branch --show-current
```

Expected: prints `feat/map-editor`.

- [ ] **Step 3: Scaffold babysitter process definition**

Create `.a5c/processes/map-editor/process.yaml` modelled on `editor-range-restrictions`:

```yaml
name: map-editor
description: Map-based range editor (sub-project A)
mode: yolo
breakpoints:
  - end-of-run        # only mandatory checkpoint
spec: docs/superpowers/specs/2026-04-28-map-editor-design.md
plan: docs/superpowers/plans/2026-04-28-map-editor.md
working_directory: /home/hagaybar/projects/primo_maps
branch: feat/map-editor
```

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add .a5c/processes/map-editor/process.yaml
git -C /home/hagaybar/projects/primo_maps commit -m "chore: scaffold map-editor babysitter process"
```

---

## Task 1 — Map Editor view skeleton + nav wiring

**Files:**
- Modify: `admin/index.html`
- Modify: `admin/app.js`
- Modify: `admin/i18n/he.json`, `admin/i18n/en.json`
- Create: `admin/components/map-editor.js`

- [ ] **Step 1: Add tab + view shell to `index.html`**

In the navigation `<nav>` block, after the `nav-location-editor` button, add:

```html
<button id="nav-map-editor" class="nav-tab px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 transition-colors" data-i18n="nav.mapEditor">
    Map Editor
</button>
```

In the main content area, after `<div id="location-editor">…</div>`, add:

```html
<div id="map-editor" class="view hidden"></div>
```

Both nav button and view container are visible to **admin and editor** (no `data-role-required` attribute).

- [ ] **Step 2: Add i18n strings**

In `admin/i18n/en.json` and `admin/i18n/he.json`, add under `nav`:

```json
"mapEditor": "Map Editor"
```
(English) and:
```json
"mapEditor": "עורך מפות"
```
(Hebrew).

Also add stub strings for the rest of the feature; the babysitter run will fill them as components land. Add now to en.json:

```json
"mapEditor.empty": "Click a shelf to edit, Shift-drag or Ctrl-click to select multiple.",
"mapEditor.tab.floor": "Floor {n}",
"mapEditor.tab.orphans": "{n} unassigned",
"mapEditor.discard": "Discard",
"mapEditor.save": "Save",
"mapEditor.addRange": "+ Add range",
"mapEditor.move": "↗ Move",
"mapEditor.delete": "Delete",
"mapEditor.reassign.banner": "Click a destination shelf, or {chooseFromList} for {rangeLabel}",
"mapEditor.reassign.chooseFromList": "choose from list",
"mapEditor.reassign.cancel": "Cancel",
"mapEditor.reassign.confirm": "Move {rangeLabel} to shelf {shelfLabel}?",
"mapEditor.warning.overlap": "Overlaps {otherRangeLabel} on shelf {otherShelfLabel}",
"mapEditor.warning.startGtEnd": "Start is greater than end.",
"mapEditor.warning.banner": "{n} conflict(s) on this shelf",
"mapEditor.shelves.selected": "{n} shelves selected",
"mapEditor.shelf.header": "Shelf {label} — {n} ranges",
"mapEditor.replaceAllWith": "Replace all with…",
"mapEditor.clearOnSelected": "Clear on all selected",
"mapEditor.distinctValues": "current values: {valuesList}",
"mapEditor.locked": "Locked"
```

Translate each into Hebrew in `he.json` (translator can use the existing strings as a reference).

- [ ] **Step 3: Stub `map-editor.js`**

Create `admin/components/map-editor.js`:

```javascript
import i18n from '../i18n.js?v=5';
import { applyRoleBasedUI } from '../auth-guard.js?v=5';

let initialized = false;

export function initMapEditor() {
  if (initialized) return;
  initialized = true;
  const container = document.getElementById('map-editor');
  container.innerHTML = `
    <div class="card bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold mb-4">${i18n.t('nav.mapEditor')}</h2>
      <p id="map-editor-empty" class="text-gray-500 text-sm">${i18n.t('mapEditor.empty')}</p>
    </div>
  `;
  applyRoleBasedUI(container);
}
```

- [ ] **Step 4: Wire route in `app.js`**

In `admin/app.js`, add an import:

```javascript
import { initMapEditor } from './components/map-editor.js?v=1';
```

And in the existing tab-click handler / view switcher, add a case for `'map-editor'` that calls `initMapEditor()` on first activation, then unhides the `#map-editor` div and hides the others — exactly matching the pattern used for `nav-location-editor`.

- [ ] **Step 5: Manual smoke test**

Run `npx playwright test --headed` is overkill here; instead start a static server in the repo root and load `admin/index.html`:

```bash
cd /home/hagaybar/projects/primo_maps && python3 -m http.server 8080 &
sleep 1
curl -s http://localhost:8080/admin/index.html | grep -c "nav-map-editor"
kill %1
```

Expected: prints `1` (the new button is in the HTML). Visit `http://localhost:8080/admin/` in a browser, click **Map Editor** — empty card with the hint should render.

- [ ] **Step 6: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/index.html admin/app.js admin/i18n/he.json admin/i18n/en.json admin/components/map-editor.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): scaffold view + nav + i18n strings"
```

---

## Task 2 — Floor tabs + active-floor persistence

**Files:**
- Modify: `admin/components/map-editor.js`

- [ ] **Step 1: Define a deployment-scoped storage key helper**

Add at the top of `map-editor.js`:

```javascript
const DEPLOYMENT_ID = location.host.replace(/[^a-z0-9]+/gi, '-');
const STORAGE_KEY_FLOOR = `mapEditor.activeFloor.${DEPLOYMENT_ID}`;

function loadActiveFloor() {
  const v = localStorage.getItem(STORAGE_KEY_FLOOR);
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : 0;
}

function saveActiveFloor(n) {
  localStorage.setItem(STORAGE_KEY_FLOOR, String(n));
}
```

- [ ] **Step 2: Render floor tabs**

Replace the `container.innerHTML` block in `initMapEditor()`:

```javascript
container.innerHTML = `
  <div class="bg-white rounded-lg shadow p-4">
    <div id="map-floor-tabs" class="flex gap-2 mb-4 border-b border-gray-200" role="tablist"></div>
    <div id="map-canvas" class="relative bg-gray-50 border border-gray-200 rounded min-h-96"></div>
    <p id="map-editor-empty" class="text-gray-500 text-sm mt-3">${i18n.t('mapEditor.empty')}</p>
  </div>
`;
renderFloorTabs(loadActiveFloor());
```

Add the helper:

```javascript
const FLOORS = [0, 1, 2];

function renderFloorTabs(active) {
  const root = document.getElementById('map-floor-tabs');
  root.innerHTML = FLOORS.map(n => `
    <button data-floor="${n}"
      class="floor-tab px-3 py-2 text-sm font-medium ${n === active ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}"
      role="tab" aria-selected="${n === active}">
      ${i18n.t('mapEditor.tab.floor').replace('{n}', n)}
    </button>
  `).join('');
  root.querySelectorAll('.floor-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.floor, 10);
      saveActiveFloor(n);
      renderFloorTabs(n);
      // SVG render hook — wired in Task 3.
      window.dispatchEvent(new CustomEvent('mapeditor:floor-changed', { detail: { floor: n } }));
    });
  });
}
```

- [ ] **Step 3: Verify tab switching persists**

Manually: open Map Editor, click Floor 2, refresh, Floor 2 should still be active. Verify in DevTools that `localStorage.getItem('mapEditor.activeFloor.<host>')` returns `"2"`.

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): floor tabs with deployment-scoped persistence"
```

---

## Task 3 — SVG loader + per-shelf range-count map

**Files:**
- Create: `admin/components/map-editor/svg-loader.js`
- Modify: `admin/components/map-editor.js`

- [ ] **Step 1: Implement `svg-loader.js`**

Create `admin/components/map-editor/svg-loader.js`:

```javascript
const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

export async function loadFloorSvg(floorNumber, container) {
  const resp = await fetch(`${CLOUDFRONT_URL}/maps/floor_${floorNumber}.svg`);
  if (!resp.ok) {
    container.innerHTML = `<p class="text-red-600 p-4">Could not load floor map.</p>`;
    throw new Error(`SVG load failed: floor ${floorNumber} (${resp.status})`);
  }
  const text = await resp.text();
  container.innerHTML = text;
  return container.querySelector('svg');
}

export function indexShelvesById(svgRoot) {
  const map = new Map();
  svgRoot.querySelectorAll('[id]').forEach(el => {
    const id = el.getAttribute('id');
    if (id) map.set(id, el);
  });
  return map;
}

export function buildRangeCountByShelf(rangesOnFloor) {
  const counts = new Map();
  for (const r of rangesOnFloor) {
    if (!r.svgCode) continue;
    counts.set(r.svgCode, (counts.get(r.svgCode) || 0) + 1);
  }
  return counts;
}
```

- [ ] **Step 2: Wire load on floor-change in `map-editor.js`**

Add at the top of `map-editor.js`:

```javascript
import { loadFloorSvg, indexShelvesById, buildRangeCountByShelf } from './map-editor/svg-loader.js?v=1';
```

Add a state-holder and handler:

```javascript
let currentFloor = null;
let shelfElements = null;       // Map<svgCode, SVGElement>
let rangeCountByShelf = null;   // Map<svgCode, number>
let allRanges = [];             // populated in Task 5

async function loadFloor(floorNumber) {
  currentFloor = floorNumber;
  const canvas = document.getElementById('map-canvas');
  const svgRoot = await loadFloorSvg(floorNumber, canvas);
  shelfElements = indexShelvesById(svgRoot);
  rangeCountByShelf = buildRangeCountByShelf(
    allRanges.filter(r => String(r.floor) === String(floorNumber))
  );
}

window.addEventListener('mapeditor:floor-changed', e => loadFloor(e.detail.floor));
```

Call `loadFloor(loadActiveFloor())` at the end of `initMapEditor()`.

- [ ] **Step 3: Manual smoke test**

Open Map Editor — the SVG for floor 0 should render in `#map-canvas`. Click Floor 1, Floor 2 — each loads. Open DevTools Console, run `document.querySelectorAll('#map-canvas svg [id]').length` — should match the number of identified shelves.

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor/svg-loader.js admin/components/map-editor.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): load floor SVG + index shelves + range count map"
```

---

## Task 4 — `range-validation.js` with TDD

**Files:**
- Create: `admin/components/map-editor/range-validation.js`
- Create: `admin/__tests__/range-validation.test.js`

- [ ] **Step 1: Confirm Jest setup**

```bash
cd /home/hagaybar/projects/primo_maps/admin && npx jest --listTests 2>&1 | head -5
```

Expected: lists existing test files. If Jest config is missing for this folder, copy patterns from `admin/__tests__/` — config is in `admin/jest.config.js`.

- [ ] **Step 2: Write the asymmetry comment block + module skeleton**

Create `admin/components/map-editor/range-validation.js`:

```javascript
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
```

(Verify `parseRangeBoundary` exists in `admin/services/data-model.js`. If named differently, use the existing parser. If not present, add a thin wrapper there that exposes the existing internal logic — do this as a sub-step rather than reimplementing parsing.)

- [ ] **Step 3: Write the first failing test (canonical OK case)**

Create `admin/__tests__/range-validation.test.js`:

```javascript
import { overlapsConflict } from '../components/map-editor/range-validation.js';

const r = (library, floor, collection, start, end) =>
  ({ library, floor, collection, rangeStart: start, rangeEnd: end });

describe('overlapsConflict — integer-touch positives', () => {
  test('A 100-105 + B 105-110: integer touch is OK', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '105'),
      r('Cen', '1', 'Soc', '105', '110'),
    )).toBe(false);
  });
});
```

Run it:

```bash
cd /home/hagaybar/projects/primo_maps/admin && npx jest range-validation -t "integer touch is OK" 2>&1 | tail -15
```

Expected: FAIL — `overlapsConflict is not a function`.

- [ ] **Step 4: Implement minimal `overlapsConflict`**

Add to `range-validation.js`:

```javascript
export function overlapsConflict(a, b) {
  if (a.library !== b.library) return false;
  if (String(a.floor) !== String(b.floor)) return false;
  if (a.collection !== b.collection) return false;

  const aStart = parseRangeBoundary(a.rangeStart);
  const aEnd = parseRangeBoundary(a.rangeEnd);
  const bStart = parseRangeBoundary(b.rangeStart);
  const bEnd = parseRangeBoundary(b.rangeEnd);

  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);

  if (lo > hi) return false;                 // disjoint
  if (lo === hi) return !Number.isInteger(lo); // touch — OK only at integer
  return true;                                // genuine overlap
}
```

(If `parseRangeBoundary` doesn't already return a `Number`, wrap with `Number(...)` after parsing.)

Run the test again:

```bash
cd /home/hagaybar/projects/primo_maps/admin && npx jest range-validation -t "integer touch is OK" 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 5: Add the remaining canonical test cases**

Append to `admin/__tests__/range-validation.test.js`:

```javascript
describe('overlapsConflict — canonical positives (no conflict)', () => {
  test('A 105-106 + B 106-106 + C 106-107: integer touches between three shelves', () => {
    const A = r('Cen', '1', 'Soc', '105', '106');
    const B = r('Cen', '1', 'Soc', '106', '106');
    const C = r('Cen', '1', 'Soc', '106', '107');
    expect(overlapsConflict(A, B)).toBe(false);
    expect(overlapsConflict(B, C)).toBe(false);
    expect(overlapsConflict(A, C)).toBe(false);
  });

  test('A 105-106 + B 107-108: disjoint', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '105', '106'),
      r('Cen', '1', 'Soc', '107', '108'),
    )).toBe(false);
  });
});

describe('overlapsConflict — canonical conflicts', () => {
  test('A 100-105.5 + B 105.5-110: single-point touch at non-integer', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '105.5'),
      r('Cen', '1', 'Soc', '105.5', '110'),
    )).toBe(true);
  });

  test('A 105-106 + B 105.93-106: fractional encroachment', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '105', '106'),
      r('Cen', '1', 'Soc', '105.93', '106'),
    )).toBe(true);
  });

  test('D 190-195 + G 194-194.72: interior point', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '190', '195'),
      r('Cen', '1', 'Soc', '194', '194.72'),
    )).toBe(true);
  });
});

describe('overlapsConflict — grouping', () => {
  test('Different libraries do not conflict', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '110'),
      r('Law', '1', 'Soc', '100', '110'),
    )).toBe(false);
  });

  test('Different floors do not conflict', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '110'),
      r('Cen', '2', 'Soc', '100', '110'),
    )).toBe(false);
  });

  test('Different collections do not conflict', () => {
    expect(overlapsConflict(
      r('Cen', '1', 'Soc', '100', '110'),
      r('Cen', '1', 'Phil', '100', '110'),
    )).toBe(false);
  });
});
```

Run the full test file:

```bash
cd /home/hagaybar/projects/primo_maps/admin && npx jest range-validation 2>&1 | tail -25
```

Expected: ALL PASS.

- [ ] **Step 6: Add `validateRangeShape`**

Add to `range-validation.js`:

```javascript
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
```

Add to test file:

```javascript
import { validateRangeShape } from '../components/map-editor/range-validation.js';

describe('validateRangeShape', () => {
  test('start > end → error', () => {
    expect(validateRangeShape({ rangeStart: '110', rangeEnd: '100' }))
      .toEqual({ ok: false, error: 'start > end' });
  });
  test('valid range → ok', () => {
    expect(validateRangeShape({ rangeStart: '100', rangeEnd: '110' }))
      .toEqual({ ok: true });
  });
  test('non-numeric → invalid format', () => {
    expect(validateRangeShape({ rangeStart: 'abc', rangeEnd: '100' }))
      .toEqual({ ok: false, error: 'invalid format' });
  });
});
```

Run, expect all PASS.

- [ ] **Step 7: Add `computeFloorConflicts`**

Add to `range-validation.js`:

```javascript
export function computeFloorConflicts(ranges) {
  const conflicts = new Map();
  // Group by (library, floor, collection) for O(N²) within each small group only.
  const groups = new Map();
  for (const r of ranges) {
    const key = `${r.library}|${r.floor}|${r.collection}`;
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(r);
  }
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (overlapsConflict(group[i], group[j])) {
          add(conflicts, group[i].id, { otherId: group[j].id, otherShelf: group[j].svgCode, otherRangeLabel: `${group[j].rangeStart}-${group[j].rangeEnd}` });
          add(conflicts, group[j].id, { otherId: group[i].id, otherShelf: group[i].svgCode, otherRangeLabel: `${group[i].rangeStart}-${group[i].rangeEnd}` });
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
```

Add a test:

```javascript
import { computeFloorConflicts } from '../components/map-editor/range-validation.js';

describe('computeFloorConflicts', () => {
  test('returns symmetric entries for both halves of a conflicting pair', () => {
    const ranges = [
      { id: '1', library: 'Cen', floor: '1', collection: 'Soc', rangeStart: '100', rangeEnd: '105.5', svgCode: 'A' },
      { id: '2', library: 'Cen', floor: '1', collection: 'Soc', rangeStart: '105.5', rangeEnd: '110', svgCode: 'B' },
    ];
    const c = computeFloorConflicts(ranges);
    expect(c.get('1')).toHaveLength(1);
    expect(c.get('2')).toHaveLength(1);
    expect(c.get('1')[0].otherId).toBe('2');
    expect(c.get('2')[0].otherId).toBe('1');
  });

  test('disjoint group → empty map', () => {
    const ranges = [
      { id: '1', library: 'Cen', floor: '1', collection: 'Soc', rangeStart: '100', rangeEnd: '105' },
      { id: '2', library: 'Cen', floor: '1', collection: 'Soc', rangeStart: '105', rangeEnd: '110' },
    ];
    expect(computeFloorConflicts(ranges).size).toBe(0);
  });
});
```

Run, expect PASS.

- [ ] **Step 8: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor/range-validation.js admin/__tests__/range-validation.test.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): range-validation with full canonical test matrix"
```

---

## Task 5 — `shelf-state.js` with TDD

**Files:**
- Create: `admin/components/map-editor/shelf-state.js`
- Create: `admin/__tests__/shelf-state.test.js`

- [ ] **Step 1: Failing test — selection transitions**

Create `admin/__tests__/shelf-state.test.js`:

```javascript
import { createShelfState } from '../components/map-editor/shelf-state.js';

describe('shelfState selection', () => {
  test('starts with no selection', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    expect(s.selection()).toEqual({ kind: 'none', shelfIds: [] });
  });

  test('selectSingle sets single selection', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.selectSingle('A1');
    expect(s.selection()).toEqual({ kind: 'single', shelfIds: ['A1'] });
  });

  test('selectMulti with one element flips to single', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.selectMulti(['A1']);
    expect(s.selection().kind).toBe('single');
  });

  test('selectMulti with two flips to multi', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.selectMulti(['A1', 'B1']);
    expect(s.selection().kind).toBe('multi');
  });

  test('clear resets to none', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.selectSingle('A1');
    s.clearSelection();
    expect(s.selection().kind).toBe('none');
  });
});
```

Run:

```bash
cd /home/hagaybar/projects/primo_maps/admin && npx jest shelf-state 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 2: Implement minimum to pass**

Create `admin/components/map-editor/shelf-state.js`:

```javascript
export function createShelfState({ ranges, permittedRowIds }) {
  let _ranges = ranges.slice();
  let _selection = { kind: 'none', shelfIds: [] };
  const _pending = new Map();   // session-wide; spans floors
  const _permitted = permittedRowIds; // null = unlimited (admin)

  return {
    ranges: () => _ranges,
    selection: () => _selection,
    pendingEdits: () => _pending,

    selectSingle(shelfId) {
      _selection = { kind: 'single', shelfIds: [shelfId] };
    },
    selectMulti(shelfIds) {
      const unique = Array.from(new Set(shelfIds));
      _selection = unique.length <= 1
        ? { kind: unique.length === 1 ? 'single' : 'none', shelfIds: unique }
        : { kind: 'multi', shelfIds: unique };
    },
    addToSelection(shelfId) {
      const next = Array.from(new Set([..._selection.shelfIds, shelfId]));
      this.selectMulti(next);
    },
    removeFromSelection(shelfId) {
      const next = _selection.shelfIds.filter(id => id !== shelfId);
      this.selectMulti(next);
    },
    clearSelection() { _selection = { kind: 'none', shelfIds: [] }; },

    isAllowed(rangeId) {
      return _permitted === null || _permitted.has(rangeId);
    },
    permission(rangeId) {
      return this.isAllowed(rangeId) ? 'edit' : 'readonly';
    },

    edit(rangeId, patch) {
      _pending.set(rangeId, { type: 'modify', patch: { ...(_pending.get(rangeId)?.patch || {}), ...patch } });
    },
    add(tempId, range) {
      _pending.set(tempId, { type: 'add', range });
    },
    delete(rangeId) {
      _pending.set(rangeId, { type: 'delete' });
    },
    move(rangeId, target) {
      _pending.set(rangeId, { type: 'move', target });
    },
    revert() { _pending.clear(); },

    materialize() {
      // Apply pendingEdits to _ranges, filtering out anything not allowed.
      const result = _ranges.filter(r => {
        const e = _pending.get(r.id);
        return !(e && e.type === 'delete' && this.isAllowed(r.id));
      }).map(r => {
        const e = _pending.get(r.id);
        if (e && e.type === 'modify' && this.isAllowed(r.id)) return { ...r, ...e.patch };
        if (e && e.type === 'move' && this.isAllowed(r.id)) return { ...r, ...e.target };
        return r;
      });
      for (const [id, e] of _pending) {
        if (e.type === 'add') result.push({ ...e.range, id });
      }
      return result;
    },
  };
}
```

Run, expect PASS.

- [ ] **Step 3: Failing test — pendingEdits is session-wide**

Add to test file:

```javascript
describe('shelfState.pendingEdits is session-wide', () => {
  test('edits accumulate across floor switches (no implicit flush)', () => {
    const s = createShelfState({ ranges: [
      { id: 'r1', floor: '1', rangeStart: '100', rangeEnd: '110' },
      { id: 'r2', floor: '2', rangeStart: '200', rangeEnd: '210' },
    ], permittedRowIds: null });
    s.edit('r1', { rangeEnd: '111' });
    s.edit('r2', { rangeEnd: '215' });
    expect(s.pendingEdits().size).toBe(2);
    // Switching floors is purely a UI concern; state holds both.
  });

  test('revert() clears all pending edits across floors', () => {
    const s = createShelfState({ ranges: [
      { id: 'r1', floor: '1', rangeStart: '100', rangeEnd: '110' },
      { id: 'r2', floor: '2', rangeStart: '200', rangeEnd: '210' },
    ], permittedRowIds: null });
    s.edit('r1', { rangeEnd: '111' });
    s.edit('r2', { rangeEnd: '215' });
    s.revert();
    expect(s.pendingEdits().size).toBe(0);
  });
});
```

Run, expect PASS (the implementation already supports this).

- [ ] **Step 4: Failing test — permission filtering at materialize**

```javascript
describe('shelfState.materialize permission filter', () => {
  test('drops edits to rows outside permittedRowIds', () => {
    const s = createShelfState({
      ranges: [
        { id: 'allowed', rangeStart: '100', rangeEnd: '110' },
        { id: 'forbidden', rangeStart: '200', rangeEnd: '210' },
      ],
      permittedRowIds: new Set(['allowed']),
    });
    s.edit('allowed', { rangeEnd: '111' });
    s.edit('forbidden', { rangeEnd: '215' });
    const out = s.materialize();
    expect(out.find(r => r.id === 'allowed').rangeEnd).toBe('111');
    expect(out.find(r => r.id === 'forbidden').rangeEnd).toBe('210'); // unchanged
  });

  test('drops delete on forbidden row', () => {
    const s = createShelfState({
      ranges: [{ id: 'forbidden', rangeStart: '200', rangeEnd: '210' }],
      permittedRowIds: new Set(),
    });
    s.delete('forbidden');
    const out = s.materialize();
    expect(out).toHaveLength(1);
  });
});
```

Run, expect PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor/shelf-state.js admin/__tests__/shelf-state.test.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): shelf-state with session-wide pendingEdits + permission filter"
```

---

## Task 6 — SVG interaction (idle / hover / single-selected)

**Files:**
- Create: `admin/components/map-editor/svg-interaction.js`
- Modify: `admin/components/map-editor.js`
- Modify: `admin/styles/app.css`

- [ ] **Step 1: Define interaction states + visual tokens in CSS**

Append to `admin/styles/app.css`:

```css
.map-shelf { cursor: pointer; transition: fill .12s ease; }
.map-shelf--hover { fill: rgb(99 102 241 / 0.85); }
.map-shelf--selected { fill: rgb(245 158 11); }
.map-shelf--locked {
  fill: url(#map-shelf-hatch);
  cursor: default;
}
.map-shelf--fully-locked { cursor: not-allowed; }
.map-shelf--has-conflicts { /* ⚠ marker drawn separately */ }
.map-tooltip {
  position: absolute; pointer-events: none; z-index: 30;
  background: #1e293b; color: white; font-size: 11px; padding: 4px 8px;
  border-radius: 4px; white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .map-shelf { transition: none; }
  .map-pulse-target { animation: none !important; outline: 2px solid #15803d; }
}
@media (prefers-reduced-motion: no-preference) {
  .map-pulse-target { animation: map-pulse 1.5s ease-in-out infinite; }
  @keyframes map-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }
}
```

Add the SVG hatch pattern to the canvas in `map-editor.js` (in `initMapEditor()`, after setting `innerHTML`):

```javascript
// Inject hatch pattern definition once (used by .map-shelf--locked)
const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.style.position = 'absolute';
defs.innerHTML = `<defs><pattern id="map-shelf-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
  <rect width="6" height="6" fill="#cbd5e1"/>
  <rect width="3" height="6" fill="#94a3b8"/>
</pattern></defs>`;
container.prepend(defs);
```

- [ ] **Step 2: Implement `svg-interaction.js`**

Create `admin/components/map-editor/svg-interaction.js`:

```javascript
const HOVER_TOOLTIP_DELAY_MS = 400;

export function attachInteraction({ shelfElements, rangeCountByShelf, onSelect, onMultiToggle, isLocked, isFullyLocked, getShelfLabel, container }) {
  let hoverTimer = null;
  let tooltipEl = null;

  function showTooltip(target, text) {
    hideTooltip();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'map-tooltip';
    tooltipEl.textContent = text;
    container.appendChild(tooltipEl);
    const rect = target.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    tooltipEl.style.left = `${rect.left - cRect.left + rect.width / 2}px`;
    tooltipEl.style.top = `${rect.top - cRect.top - 24}px`;
  }
  function hideTooltip() {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  }

  for (const [shelfId, el] of shelfElements) {
    el.classList.add('map-shelf');

    if (isFullyLocked(shelfId)) {
      el.classList.add('map-shelf--locked', 'map-shelf--fully-locked');
      // No interactivity at all.
      continue;
    }
    if (isLocked(shelfId)) {
      el.classList.add('map-shelf--locked'); // visually hatched, still clickable
    }

    el.addEventListener('mouseenter', () => {
      el.classList.add('map-shelf--hover');
      hoverTimer = setTimeout(() => {
        const n = rangeCountByShelf.get(shelfId) || 0;
        showTooltip(el, `${getShelfLabel(shelfId)} · ${n} ranges`);
      }, HOVER_TOOLTIP_DELAY_MS);
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('map-shelf--hover');
      clearTimeout(hoverTimer); hoverTimer = null;
      hideTooltip();
    });

    el.addEventListener('click', evt => {
      evt.preventDefault();
      if (evt.ctrlKey || evt.metaKey) {
        onMultiToggle(shelfId);   // caller toggles add/remove based on current selection
      } else {
        onSelect(shelfId);
      }
    });
  }
}

export function applySelection(shelfElements, selectedIds) {
  for (const [id, el] of shelfElements) {
    if (selectedIds.includes(id)) el.classList.add('map-shelf--selected');
    else el.classList.remove('map-shelf--selected');
  }
}
```

- [ ] **Step 3: Wire into `map-editor.js`**

In `map-editor.js`, after `loadFloor`, attach interaction. Also import:

```javascript
import { attachInteraction, applySelection } from './map-editor/svg-interaction.js?v=1';
import { createShelfState } from './map-editor/shelf-state.js?v=1';
import { computeFloorConflicts } from './map-editor/range-validation.js?v=1';
```

Add a state holder:

```javascript
let shelfState = null;
let floorConflicts = new Map();
```

Update `loadFloor`:

```javascript
async function loadFloor(floorNumber) {
  currentFloor = floorNumber;
  const canvas = document.getElementById('map-canvas');
  const svgRoot = await loadFloorSvg(floorNumber, canvas);
  shelfElements = indexShelvesById(svgRoot);

  const floorRanges = allRanges.filter(r => String(r.floor) === String(floorNumber));
  rangeCountByShelf = buildRangeCountByShelf(floorRanges);
  floorConflicts = computeFloorConflicts(floorRanges);

  // Permitted IDs come from auth-guard; null for admins.
  const permitted = window.__editorPermittedRowIds || null;
  shelfState = shelfState || createShelfState({ ranges: allRanges, permittedRowIds: permitted });

  attachInteraction({
    shelfElements,
    rangeCountByShelf,
    container: canvas,
    isLocked: shelfId => floorRanges.some(r => r.svgCode === shelfId && shelfState.permission(r.id) === 'readonly'),
    isFullyLocked: shelfId => {
      const inThisShelf = floorRanges.filter(r => r.svgCode === shelfId);
      return inThisShelf.length > 0 && inThisShelf.every(r => shelfState.permission(r.id) === 'readonly');
    },
    getShelfLabel: shelfId => {
      const range = floorRanges.find(r => r.svgCode === shelfId);
      return (range && (range.shelfLabel || shelfId)) || shelfId;
    },
    onSelect: shelfId => {
      shelfState.selectSingle(shelfId);
      applySelection(shelfElements, shelfState.selection().shelfIds);
      window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
    },
    onMultiToggle: shelfId => {
      const current = shelfState.selection().shelfIds;
      if (current.includes(shelfId)) shelfState.removeFromSelection(shelfId);
      else shelfState.addToSelection(shelfId);
      applySelection(shelfElements, shelfState.selection().shelfIds);
      window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
    },
  });

  // Render conflict markers.
  for (const [shelfId, el] of shelfElements) {
    const shelfHasConflict = floorRanges.some(r => r.svgCode === shelfId && floorConflicts.has(r.id));
    el.classList.toggle('map-shelf--has-conflicts', shelfHasConflict);
  }
}
```

(Note: `allRanges` is populated in Task 7 when we wire the CSV load. Leave it `[]` for now — the SVG renders, no shelves are clickable for ranges yet.)

- [ ] **Step 4: Manual smoke test**

Open Map Editor → see SVG → hover a shelf → after ~400ms, tooltip with "Shelf X · 0 ranges". Click → shelf turns amber. No drawer yet (next task).

- [ ] **Step 5: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor/svg-interaction.js admin/components/map-editor.js admin/styles/app.css
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): hover + single-select interaction states with locked-shelf treatment"
```

---

## Task 7 — Hook the CSV data layer (load existing ranges)

**Files:**
- Modify: `admin/components/map-editor.js`

- [ ] **Step 1: Find the existing CSV-load function**

```bash
grep -n "fetchCsv\|loadCsv\|getCsv\|parseCSV" /home/hagaybar/projects/primo_maps/admin/components/csv-editor.js /home/hagaybar/projects/primo_maps/admin/services/*.js 2>&1 | head -20
```

Identify the function (e.g., `loadCsvData`, `fetchMappingCsv`) that returns parsed rows. Use the **same function** the CSV Editor and Location Editor use.

- [ ] **Step 2: Wire CSV load into `initMapEditor`**

Add an import for the CSV loader (use the actual path/name found above; example):

```javascript
import { fetchCsvData } from '../services/csv-service.js?v=5';
```

In `initMapEditor`, before `loadFloor(loadActiveFloor())`:

```javascript
const rows = await fetchCsvData();
allRanges = rows.map((row, idx) => ({ ...row, id: row.id || `row-${idx}` }));
```

Make `initMapEditor` `async`. Update its caller in `app.js` to `await` it.

- [ ] **Step 3: Verify**

Open Map Editor → hover a shelf that has ranges → tooltip shows the actual range count.

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor.js admin/app.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): load mapping CSV via existing service"
```

---

## Task 8 — `shelf-drawer.js` single-shelf mode (read-only render)

**Files:**
- Create: `admin/components/map-editor/shelf-drawer.js`
- Modify: `admin/components/map-editor.js`
- Modify: `admin/styles/app.css`

- [ ] **Step 1: Drawer container CSS**

Append to `admin/styles/app.css`:

```css
.map-drawer {
  position: fixed; left: 0; right: 0; bottom: 0;
  background: white; border-top: 2px solid #0ea5e9;
  box-shadow: 0 -4px 12px rgba(0,0,0,0.08);
  padding: 12px 24px; z-index: 20;
  max-height: 50vh; overflow-y: auto;
}
.map-drawer--hidden { display: none; }
.map-drawer__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.map-drawer__rows { display: flex; flex-direction: column; gap: 6px; }
.map-drawer__row {
  display: grid; grid-template-columns: 1.4fr 1fr 1fr auto auto; gap: 8px;
  align-items: center; padding: 4px 0;
}
.map-drawer__row--locked input, .map-drawer__row--locked select {
  background: #e2e8f0; color: #94a3b8; cursor: not-allowed;
}
.map-drawer__warn-banner {
  background: #fef3c7; border: 1px solid #f59e0b; color: #78350f;
  padding: 6px 10px; border-radius: 4px; font-size: 12px; margin-bottom: 6px;
}
.map-drawer__cell--invalid { background: #fef3c7 !important; border-color: #f59e0b !important; }
```

- [ ] **Step 2: Add drawer container to view**

In `map-editor.js`, append to `container.innerHTML` inside `initMapEditor`:

```html
<div id="map-drawer" class="map-drawer map-drawer--hidden"></div>
```

- [ ] **Step 3: Implement read render in `shelf-drawer.js`**

Create `admin/components/map-editor/shelf-drawer.js`:

```javascript
import i18n from '../../i18n.js?v=5';

let host = null;

export function mountDrawer(elementId) {
  host = document.getElementById(elementId);
}

export function showSingleShelf({ shelfId, shelfLabel, rangesOnShelf, conflictsByRangeId, permission, collectionsList, onChange, onAdd, onMove, onDelete, onDiscard, onSave, hasPendingEdits }) {
  if (!host) return;
  host.classList.remove('map-drawer--hidden');
  const conflictCount = rangesOnShelf.reduce((n, r) => n + (conflictsByRangeId.get(r.id)?.length || 0), 0);
  const banner = conflictCount > 0
    ? `<div class="map-drawer__warn-banner">⚠ ${conflictCount} ${i18n.t('mapEditor.warning.banner').replace('{n}', conflictCount)}</div>`
    : '';
  host.innerHTML = `
    <div class="map-drawer__header">
      <h3 class="text-sm font-semibold">${i18n.t('mapEditor.shelf.header').replace('{label}', shelfLabel).replace('{n}', rangesOnShelf.length)}</h3>
      <div class="flex gap-2">
        <button id="drawer-discard" class="px-3 py-1 text-sm border rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.discard')}</button>
        <button id="drawer-save" class="px-3 py-1 text-sm bg-blue-600 text-white rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.save')}</button>
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
}

export function hideDrawer() {
  if (!host) return;
  host.classList.add('map-drawer--hidden');
  host.innerHTML = '';
}

function buildRow(range, { isLocked, conflicts, collectionsList, onChange, onMove, onDelete }) {
  const row = document.createElement('div');
  row.className = `map-drawer__row${isLocked ? ' map-drawer__row--locked' : ''}`;
  row.dataset.rangeId = range.id;
  row.innerHTML = `
    <select ${isLocked ? 'disabled' : ''} data-field="collection">
      ${collectionsList.map(c => `<option value="${escape(c)}" ${c === range.collection ? 'selected' : ''}>${escape(c)}</option>`).join('')}
    </select>
    <input ${isLocked ? 'disabled' : ''} data-field="rangeStart" value="${escape(range.rangeStart || '')}" />
    <input ${isLocked ? 'disabled' : ''} data-field="rangeEnd" value="${escape(range.rangeEnd || '')}" />
    <button ${isLocked ? 'disabled' : ''} data-action="move" class="text-xs px-2 border rounded">${i18n.t('mapEditor.move')}</button>
    <button ${isLocked ? 'disabled' : ''} data-action="delete" class="text-xs px-2 border rounded text-red-600">×</button>
  `;
  // Apply conflict tints + tooltips
  if (conflicts.length > 0) {
    const tip = conflicts.map(c => i18n.t('mapEditor.warning.overlap')
      .replace('{otherRangeLabel}', c.otherRangeLabel)
      .replace('{otherShelfLabel}', c.otherShelf)).join('\n');
    row.querySelector('[data-field="rangeStart"]').classList.add('map-drawer__cell--invalid');
    row.querySelector('[data-field="rangeEnd"]').classList.add('map-drawer__cell--invalid');
    row.querySelector('[data-field="rangeStart"]').title = tip;
    row.querySelector('[data-field="rangeEnd"]').title = tip;
  }
  if (!isLocked) {
    row.querySelectorAll('input,select').forEach(input => {
      input.addEventListener('input', () => onChange(range.id, { [input.dataset.field]: input.value }));
    });
    row.querySelector('[data-action="move"]').onclick = () => onMove(range.id);
    row.querySelector('[data-action="delete"]').onclick = () => onDelete(range.id);
  }
  return row;
}

function escape(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
```

- [ ] **Step 4: Mount + open on selection**

In `map-editor.js`, import:

```javascript
import { mountDrawer, showSingleShelf, hideDrawer } from './map-editor/shelf-drawer.js?v=1';
```

After `initMapEditor` builds `container.innerHTML`, call `mountDrawer('map-drawer')`.

Add a selection listener:

```javascript
window.addEventListener('mapeditor:selection-changed', () => renderDrawer());

function renderDrawer() {
  const sel = shelfState.selection();
  if (sel.kind === 'none') { hideDrawer(); return; }
  if (sel.kind === 'single') {
    const shelfId = sel.shelfIds[0];
    const floorRanges = allRanges.filter(r => String(r.floor) === String(currentFloor));
    const rangesOnShelf = floorRanges.filter(r => r.svgCode === shelfId);
    const conflictsByRangeId = floorConflicts;
    const collectionsList = Array.from(new Set(allRanges.map(r => r.collection))).sort();

    showSingleShelf({
      shelfId,
      shelfLabel: rangesOnShelf[0]?.shelfLabel || shelfId,
      rangesOnShelf,
      conflictsByRangeId,
      permission: shelfState.permission.bind(shelfState),
      collectionsList,
      onChange: (id, patch) => { shelfState.edit(id, patch); renderDrawer(); refreshConflicts(); },
      onAdd: () => addNewRangeToShelf(shelfId),
      onMove: (id) => { /* Task 13 */ },
      onDelete: (id) => { shelfState.delete(id); renderDrawer(); },
      onDiscard: () => { shelfState.revert(); renderDrawer(); refreshConflicts(); },
      onSave: () => saveCsv(),
      hasPendingEdits: shelfState.pendingEdits().size > 0,
    });
  }
  // multi mode wired in Task 12.
}

function refreshConflicts() {
  const merged = shelfState.materialize();
  const floorRanges = merged.filter(r => String(r.floor) === String(currentFloor));
  floorConflicts = computeFloorConflicts(floorRanges);
  for (const [id, el] of shelfElements) {
    const has = floorRanges.some(r => r.svgCode === id && floorConflicts.has(r.id));
    el.classList.toggle('map-shelf--has-conflicts', has);
  }
}
```

Stub `addNewRangeToShelf` (filled in Task 9):

```javascript
function addNewRangeToShelf(shelfId) { /* Task 9 */ }
```

Stub `saveCsv` (filled in Task 11):

```javascript
function saveCsv() { /* Task 11 */ }
```

- [ ] **Step 5: Manual smoke test**

Open Map Editor → click a shelf → drawer opens at the bottom showing the shelf's ranges read-only-render. Save/Discard buttons disabled (no edits yet). Click another shelf → drawer updates. Click empty area on the SVG → drawer stays open showing the last selection (good — keep open until explicit close in next task or selection of another shelf).

- [ ] **Step 6: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor/shelf-drawer.js admin/components/map-editor.js admin/styles/app.css
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): single-shelf drawer renders ranges read-only"
```

---

## Task 9 — Single-shelf drawer: edit + add + delete

**Files:**
- Modify: `admin/components/map-editor.js`

- [ ] **Step 1: Implement `addNewRangeToShelf`**

Replace the stub:

```javascript
function addNewRangeToShelf(shelfId) {
  const floorRanges = allRanges.filter(r => String(r.floor) === String(currentFloor));
  const rangesOnShelf = floorRanges.filter(r => r.svgCode === shelfId);
  const defaultCollection = rangesOnShelf[0]?.collection || (allRanges[0]?.collection || '');
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  shelfState.add(tempId, {
    svgCode: shelfId,
    floor: String(currentFloor),
    library: rangesOnShelf[0]?.library || allRanges[0]?.library || '',
    collection: defaultCollection,
    rangeStart: '',
    rangeEnd: '',
  });
  // Local view: include the new row by re-deriving from materialize() in renderDrawer().
  renderDrawer();
}
```

- [ ] **Step 2: Update `renderDrawer` to use materialized view**

Inside `renderDrawer` for the single branch, replace `const rangesOnShelf = floorRanges.filter(...)` with:

```javascript
const merged = shelfState.materialize();
const mergedFloor = merged.filter(r => String(r.floor) === String(currentFloor));
const rangesOnShelf = mergedFloor.filter(r => r.svgCode === shelfId);
```

This way new rows from `pendingEdits` show up immediately, and deleted rows disappear.

- [ ] **Step 3: Manual smoke test**

Click a shelf → click `+ Add range` → new empty row appears with the collection pre-filled. Type into start/end → buttons enable. Click `×` on a row → row disappears. Click `Discard` → all edits revert.

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): drawer add/edit/delete via pendingEdits"
```

---

## Task 10 — Live conflict + start>end validation in drawer

**Files:**
- Modify: `admin/components/map-editor.js`

- [ ] **Step 1: Compute per-range start>end + apply tints**

In `shelf-drawer.js` `buildRow`, add before the `if (conflicts.length > 0)` block:

```javascript
import { validateRangeShape } from './range-validation.js?v=1';
// ... inside buildRow:
const shape = validateRangeShape(range);
if (!shape.ok && shape.error === 'start > end') {
  row.querySelector('[data-field="rangeStart"]').classList.add('map-drawer__cell--invalid');
  row.querySelector('[data-field="rangeEnd"]').classList.add('map-drawer__cell--invalid');
  row.querySelector('[data-field="rangeStart"]').title = i18n.t('mapEditor.warning.startGtEnd');
  row.querySelector('[data-field="rangeEnd"]').title = i18n.t('mapEditor.warning.startGtEnd');
}
```

- [ ] **Step 2: Refresh conflicts on every edit**

In `map-editor.js`, the `onChange` already calls `refreshConflicts()`. Verify it's calling `renderDrawer()` AFTER `refreshConflicts()` so the drawer's W3 markers update with the new conflict map.

Adjust:

```javascript
onChange: (id, patch) => { shelfState.edit(id, patch); refreshConflicts(); renderDrawer(); },
```

- [ ] **Step 3: Manual smoke test**

Edit a range to overlap with another → cell tints yellow → tooltip shows the conflict description. Edit it back → tint disappears. Set `rangeStart` to be larger than `rangeEnd` → cells tint with the start>end tooltip.

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor.js admin/components/map-editor/shelf-drawer.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): live W3-pattern overlap + start>end warnings"
```

---

## Task 11 — Save / Discard flow

**Files:**
- Modify: `admin/components/map-editor.js`

- [ ] **Step 1: Find existing save service**

```bash
grep -nE "(saveCsv|putCsv|uploadCsv|uploadMapping)" /home/hagaybar/projects/primo_maps/admin/services/*.js /home/hagaybar/projects/primo_maps/admin/components/csv-editor.js | head -10
```

Identify the function (e.g., `saveCsvData` in `services/csv-service.js`).

- [ ] **Step 2: Implement `saveCsv`**

Replace the stub (use the actual service name found above):

```javascript
import { saveCsvData } from '../services/csv-service.js?v=5';
// ...
async function saveCsv() {
  try {
    const merged = shelfState.materialize();
    await saveCsvData(merged);  // existing serializer + Lambda call + CloudFront invalidation
    // Refresh local state from new snapshot.
    allRanges = merged;
    shelfState.revert();        // clears pendingEdits
    refreshConflicts();
    renderDrawer();             // drawer stays open with fresh values
    window.showToast?.(i18n.t('toast.saveSuccess') || 'Saved', 'success');
  } catch (err) {
    window.showToast?.(`Save failed: ${err.message}`, 'error');
    // pendingEdits preserved for retry — do nothing else.
  }
}
```

(If `showToast` isn't exposed on window, use the existing toast import the other components use — check `admin/components/toast.js`.)

- [ ] **Step 3: Manual smoke test**

Edit a range → click Save → toast → reload page → edit persists. Edit another → click Discard → row reverts to original.

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): save via existing CSV service; discard reverts pendingEdits"
```

---

## Task 12 — Multi-select (Shift-drag marquee + Ctrl-click) + multi-shelf drawer

**Files:**
- Modify: `admin/components/map-editor/svg-interaction.js`
- Create: `admin/components/map-editor/distinct-values-widget.js`
- Modify: `admin/components/map-editor/shelf-drawer.js`
- Modify: `admin/components/map-editor.js`

- [ ] **Step 1: Add Shift-drag marquee in `svg-interaction.js`**

Append:

```javascript
export function attachMarquee({ container, getShelfElements, onMarqueeComplete }) {
  let startX = 0, startY = 0, marqueeEl = null;

  container.addEventListener('mousedown', evt => {
    if (!evt.shiftKey) return;            // Shift-drag only
    const cRect = container.getBoundingClientRect();
    startX = evt.clientX - cRect.left;
    startY = evt.clientY - cRect.top;
    marqueeEl = document.createElement('div');
    Object.assign(marqueeEl.style, {
      position: 'absolute', border: '2px dashed #0ea5e9',
      background: 'rgba(14,165,233,0.1)', pointerEvents: 'none', zIndex: 25,
    });
    marqueeEl.style.left = `${startX}px`;
    marqueeEl.style.top = `${startY}px`;
    container.appendChild(marqueeEl);

    function onMove(e) {
      const x = e.clientX - cRect.left, y = e.clientY - cRect.top;
      marqueeEl.style.left = `${Math.min(startX, x)}px`;
      marqueeEl.style.top = `${Math.min(startY, y)}px`;
      marqueeEl.style.width = `${Math.abs(x - startX)}px`;
      marqueeEl.style.height = `${Math.abs(y - startY)}px`;
    }
    function onUp() {
      const rect = marqueeEl.getBoundingClientRect();
      const intersected = [];
      const shelfElements = getShelfElements() || new Map();
      for (const [id, el] of shelfElements) {
        const r = el.getBoundingClientRect();
        if (r.right >= rect.left && r.left <= rect.right && r.bottom >= rect.top && r.top <= rect.bottom) {
          intersected.push(id);
        }
      }
      marqueeEl.remove(); marqueeEl = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onMarqueeComplete(intersected);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    evt.preventDefault();
  });
}
```

- [ ] **Step 2: Wire marquee in `map-editor.js`**

Import `attachMarquee` and call it **once** from `initMapEditor` (NOT from `loadFloor` — the canvas element persists across floor switches, so attaching repeatedly would stack listeners). The handler reads the current `shelfElements` via closure on the module-level variable; it stays correct across floor changes:

```javascript
import { attachMarquee } from './map-editor/svg-interaction.js?v=1';

// Inside initMapEditor, after `mountDrawer('map-drawer')`:
const canvas = document.getElementById('map-canvas');
attachMarquee({
  container: canvas,
  getShelfElements: () => shelfElements,        // closure read; updated by loadFloor
  onMarqueeComplete: (ids) => {
    if (ids.length === 0) return;
    shelfState.selectMulti(ids);
    applySelection(shelfElements, shelfState.selection().shelfIds);
    window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
  },
});
```

Update `attachMarquee`'s signature in `svg-interaction.js` accordingly — replace the `shelfElements` parameter with `getShelfElements`, and inside the `onUp` handler use `const els = getShelfElements();` before iterating.

- [ ] **Step 3: Implement `distinct-values-widget.js`**

Create:

```javascript
import i18n from '../../i18n.js?v=5';

export function buildDistinctValuesWidget({ field, values, onChange }) {
  const distinct = new Map();
  for (const v of values) {
    distinct.set(v ?? '', (distinct.get(v ?? '') || 0) + 1);
  }
  const widget = document.createElement('div');
  widget.className = 'border-b py-2';
  widget.innerHTML = `
    <label class="block text-xs font-semibold mb-1">${field}</label>
    <div class="text-xs text-gray-500 mb-1">${i18n.t('mapEditor.distinctValues').replace('{valuesList}', Array.from(distinct.entries()).map(([v, n]) => `${v || '∅'} (${n})`).join(', '))}</div>
    <div class="flex items-center gap-2">
      <input type="text" data-role="replace" placeholder="${i18n.t('mapEditor.replaceAllWith')}" class="flex-1 px-2 py-1 border rounded text-sm" />
      <label class="text-xs flex items-center gap-1">
        <input type="checkbox" data-role="clear" />
        ${i18n.t('mapEditor.clearOnSelected')}
      </label>
    </div>
  `;
  const replaceInput = widget.querySelector('[data-role="replace"]');
  const clearCheckbox = widget.querySelector('[data-role="clear"]');
  function emit() {
    if (clearCheckbox.checked) onChange({ replaceWith: '', mode: 'clear' });
    else if (replaceInput.value !== '') onChange({ replaceWith: replaceInput.value, mode: 'replace' });
    else onChange({ mode: 'noop' });
  }
  replaceInput.addEventListener('input', emit);
  clearCheckbox.addEventListener('change', () => {
    if (clearCheckbox.checked) replaceInput.value = '';
    emit();
  });
  return widget;
}
```

- [ ] **Step 4: Add `showMultiShelf` to `shelf-drawer.js`**

```javascript
import { buildDistinctValuesWidget } from './distinct-values-widget.js?v=1';

export function showMultiShelf({ shelfIds, shelvesData, onFieldChange, onDiscard, onSave, hasPendingEdits }) {
  if (!host) return;
  host.classList.remove('map-drawer--hidden');
  host.innerHTML = `
    <div class="map-drawer__header">
      <h3 class="text-sm font-semibold">${i18n.t('mapEditor.shelves.selected').replace('{n}', shelfIds.length)}</h3>
      <div class="flex gap-2">
        <button id="drawer-discard" class="px-3 py-1 text-sm border rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.discard')}</button>
        <button id="drawer-save" class="px-3 py-1 text-sm bg-blue-600 text-white rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.save')}</button>
      </div>
    </div>
    <div id="drawer-fields"></div>
  `;
  const fieldsRoot = host.querySelector('#drawer-fields');
  const fields = ['notes', 'notesHe', 'shelfLabel', 'shelfLabelHe', 'description', 'descriptionHe'];
  for (const f of fields) {
    const values = shelvesData.map(s => s[f]);
    fieldsRoot.appendChild(buildDistinctValuesWidget({
      field: f,
      values,
      onChange: (op) => onFieldChange(f, op),
    }));
  }
  host.querySelector('#drawer-discard').onclick = onDiscard;
  host.querySelector('#drawer-save').onclick = onSave;
}
```

- [ ] **Step 5: Branch `renderDrawer` for multi**

```javascript
import { showMultiShelf } from './map-editor/shelf-drawer.js?v=1';

function renderDrawer() {
  const sel = shelfState.selection();
  if (sel.kind === 'none') { hideDrawer(); return; }
  if (sel.kind === 'single') { /* unchanged */ }
  if (sel.kind === 'multi') {
    const merged = shelfState.materialize();
    const shelvesData = sel.shelfIds.map(id => {
      const onShelf = merged.find(r => r.svgCode === id) || {};
      return { svgCode: id, notes: onShelf.notes, notesHe: onShelf.notesHe,
               shelfLabel: onShelf.shelfLabel, shelfLabelHe: onShelf.shelfLabelHe,
               description: onShelf.description, descriptionHe: onShelf.descriptionHe };
    });
    showMultiShelf({
      shelfIds: sel.shelfIds,
      shelvesData,
      onFieldChange: (field, op) => {
        if (op.mode === 'noop') return;
        const nextValue = op.mode === 'clear' ? '' : op.replaceWith;
        for (const id of sel.shelfIds) {
          // Find every range on this shelf and patch the field on each (denormalized in CSV).
          merged.filter(r => r.svgCode === id).forEach(r => {
            shelfState.edit(r.id, { [field]: nextValue });
          });
        }
        renderDrawer();
      },
      onDiscard: () => { shelfState.revert(); renderDrawer(); refreshConflicts(); },
      onSave: () => saveCsv(),
      hasPendingEdits: shelfState.pendingEdits().size > 0,
    });
  }
}
```

- [ ] **Step 6: Manual smoke test**

Hold Shift and drag a rectangle over two shelves → both turn amber, drawer flips to multi mode, distinct values shown. Type a new value → all selected shelves get patched on save. Toggle the `Clear on all selected` checkbox → fields blank on save.

- [ ] **Step 7: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor/svg-interaction.js admin/components/map-editor/distinct-values-widget.js admin/components/map-editor/shelf-drawer.js admin/components/map-editor.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): Shift-drag marquee + multi-shelf drawer with distinct-values widget"
```

---

## Task 13 — Reassignment: map-pick mode

**Files:**
- Create: `admin/components/map-editor/reassign-mode.js`
- Modify: `admin/components/map-editor.js`
- Modify: `admin/styles/app.css`

- [ ] **Step 1: Reassign-mode banner styles**

Append to `admin/styles/app.css`:

```css
.map-reassign-banner {
  position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
  background: #fef3c7; border: 1px solid #f59e0b; color: #78350f;
  padding: 8px 16px; border-radius: 6px; z-index: 40;
  display: flex; gap: 12px; align-items: center;
}
```

- [ ] **Step 2: Implement `reassign-mode.js`**

```javascript
import i18n from '../../i18n.js?v=5';

let active = null;

export function startReassign({ rangeId, rangeLabel, shelfElements, onConfirm, onCancel }) {
  if (active) cancel();
  active = { rangeId, rangeLabel, onConfirm, onCancel };

  // Banner
  const banner = document.createElement('div');
  banner.className = 'map-reassign-banner';
  banner.id = 'map-reassign-banner';
  banner.innerHTML = `
    <span>📍 ${i18n.t('mapEditor.reassign.banner').replace('{rangeLabel}', rangeLabel).replace('{chooseFromList}', `<a href="#" id="map-reassign-list" class="underline">${i18n.t('mapEditor.reassign.chooseFromList')}</a>`)}</span>
    <button id="map-reassign-cancel" class="px-2 py-1 text-xs border rounded">${i18n.t('mapEditor.reassign.cancel')}</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector('#map-reassign-cancel').onclick = cancel;
  banner.querySelector('#map-reassign-list').onclick = (e) => {
    e.preventDefault();
    openDropdownPicker();
  };

  // Highlight other shelves
  for (const [id, el] of shelfElements) {
    el.classList.add('map-pulse-target');
    el.addEventListener('click', onShelfClicked, { capture: true });
  }
  document.addEventListener('keydown', onEsc);
}

function onShelfClicked(evt) {
  evt.stopPropagation(); evt.preventDefault();
  const target = evt.currentTarget.id;
  const ok = window.confirm(i18n.t('mapEditor.reassign.confirm').replace('{rangeLabel}', active.rangeLabel).replace('{shelfLabel}', target));
  if (ok) {
    const { onConfirm } = active;
    cleanup();
    onConfirm({ newSvgCode: target });
  }
}

function onEsc(e) { if (e.key === 'Escape') cancel(); }

function cancel() {
  if (!active) return;
  const { onCancel } = active;
  cleanup();
  onCancel?.();
}

function cleanup() {
  document.getElementById('map-reassign-banner')?.remove();
  document.removeEventListener('keydown', onEsc);
  document.querySelectorAll('.map-pulse-target').forEach(el => {
    el.classList.remove('map-pulse-target');
    el.removeEventListener('click', onShelfClicked, { capture: true });
  });
  active = null;
}

function openDropdownPicker() { /* Task 14 */ }

export function isReassignActive() { return active !== null; }
export function cancelReassign() { cancel(); }
```

- [ ] **Step 3: Wire `onMove` in `map-editor.js`**

Import and use:

```javascript
import { startReassign, cancelReassign, isReassignActive } from './map-editor/reassign-mode.js?v=1';
```

In `renderDrawer()` single branch, set:

```javascript
onMove: (id) => {
  const range = shelfState.materialize().find(r => r.id === id);
  if (!range) return;
  startReassign({
    rangeId: id,
    rangeLabel: `${range.collection} ${range.rangeStart}-${range.rangeEnd}`,
    shelfElements: new Map([...shelfElements].filter(([sid]) => sid !== range.svgCode)),
    onConfirm: ({ newSvgCode }) => {
      shelfState.move(id, { svgCode: newSvgCode });
      refreshConflicts();
      renderDrawer();
    },
    onCancel: () => { /* nothing — banner already removed */ },
  });
},
```

- [ ] **Step 4: Floor-tab during reassign auto-cancels (per spec §5.3 step 7)**

In `renderFloorTabs` the click handler, before `saveActiveFloor`:

```javascript
if (isReassignActive()) cancelReassign();
```

- [ ] **Step 5: Manual smoke test**

Click a range's `↗ Move` → banner appears, other shelves pulse green → click a target shelf → confirm → drawer reflects the move (range disappears from source shelf list). Cancel via Esc or button works. Clicking a different floor tab while in reassign → reassign cancels first, floor switches.

- [ ] **Step 6: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor/reassign-mode.js admin/components/map-editor.js admin/styles/app.css
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): map-pick reassignment mode + Esc + floor-tab auto-cancel"
```

---

## Task 14 — Reassignment dropdown picker (cross-floor)

**Files:**
- Modify: `admin/components/map-editor/reassign-mode.js`
- Modify: `admin/components/map-editor.js`

- [ ] **Step 1: Implement `openDropdownPicker`**

Replace the stub in `reassign-mode.js`:

```javascript
function openDropdownPicker() {
  if (!active) return;
  const allShelves = active.allShelves || [];   // pass through startReassign
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:white;border-radius:8px;padding:16px;width:360px;max-height:60vh;display:flex;flex-direction:column">
      <input type="text" id="map-picker-filter" placeholder="Filter shelves…" class="px-2 py-1 border rounded mb-2 text-sm" />
      <div id="map-picker-list" style="overflow-y:auto;flex:1;border:1px solid #e2e8f0;border-radius:4px"></div>
      <div class="flex justify-end mt-2"><button id="map-picker-cancel" class="px-3 py-1 text-sm border rounded">Cancel</button></div>
    </div>
  `;
  document.body.appendChild(overlay);
  function renderList(filter) {
    const list = overlay.querySelector('#map-picker-list');
    list.innerHTML = allShelves
      .filter(s => !filter || s.label.toLowerCase().includes(filter.toLowerCase()) || s.svgCode.toLowerCase().includes(filter.toLowerCase()))
      .map(s => `<button data-id="${s.svgCode}" data-floor="${s.floor}" class="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 border-b">${s.label} — ${s.svgCode} (Floor ${s.floor})</button>`)
      .join('');
    list.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        const ok = window.confirm(`Move ${active.rangeLabel} to ${b.dataset.id}?`);
        if (!ok) return;
        const { onConfirm } = active;
        overlay.remove();
        cleanup();
        onConfirm({ newSvgCode: b.dataset.id, newFloor: b.dataset.floor });
      };
    });
  }
  overlay.querySelector('#map-picker-filter').addEventListener('input', e => renderList(e.target.value));
  overlay.querySelector('#map-picker-cancel').onclick = () => overlay.remove();
  renderList('');
}
```

- [ ] **Step 2: Pass `allShelves` from `map-editor.js`**

In the `onMove` callback, before `startReassign(...)`:

```javascript
const allShelves = allRanges
  .filter(r => r.svgCode)
  .reduce((acc, r) => {
    const key = `${r.svgCode}|${r.floor}`;
    if (!acc.has(key)) acc.set(key, { svgCode: r.svgCode, floor: r.floor, label: r.shelfLabel || r.svgCode });
    return acc;
  }, new Map());
const allShelvesList = Array.from(allShelves.values()).sort((a, b) => a.label.localeCompare(b.label));
```

Pass `allShelves: allShelvesList` to `startReassign`.

In `reassign-mode.js`, store `active.allShelves = allShelves` from the options.

- [ ] **Step 3: Manual smoke test**

Click `↗ Move` → banner → click `choose from list` → modal with searchable list (cross-floor) → pick a shelf on a different floor → confirm → drawer note shows the move; saving applies it.

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor/reassign-mode.js admin/components/map-editor.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): cross-floor reassignment via dropdown picker"
```

---

## Task 15 — Editor row-range permission scope on load

**Files:**
- Modify: `admin/components/map-editor.js`

- [ ] **Step 1: Find how Location Editor reads permitted-row-ids**

```bash
grep -nE "(permittedRow|allowedRow|rangeRestriction|filterRows)" /home/hagaybar/projects/primo_maps/admin/components/location-editor.js /home/hagaybar/projects/primo_maps/admin/auth-guard.js | head -10
```

Identify the existing helper (e.g., `getPermittedRowIndices(currentUser)`).

- [ ] **Step 2: Compute `permittedRowIds`**

Replace the placeholder `window.__editorPermittedRowIds || null` in `loadFloor` with:

```javascript
import { getCurrentUser, getPermittedRowIds } from '../auth-guard.js?v=5';
// ...
const user = getCurrentUser();
const permitted = (user.role === 'editor') ? getPermittedRowIds(user) : null;
```

(Use the actual function names found in step 1. If a helper that returns a `Set` doesn't exist, write a thin wrapper inside `auth-guard.js` that does — its existence is what `shelf-state.js` already expects.)

- [ ] **Step 3: Manual smoke test (admin path only)**

Log in as admin → all shelves clickable, no hatching, all inputs enabled. (Editor-role test is in Task 21 / E2E.)

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor.js admin/auth-guard.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): wire editor row-range permissions to shelf-state"
```

---

## Task 16 — Orphan-range badge + CSV-Editor deep-link query param

**Files:**
- Create: `admin/components/map-editor/orphan-badge.js`
- Modify: `admin/components/map-editor.js`
- Modify: `admin/components/csv-editor.js` (consumer of `?orphans=floor=N`)

- [ ] **Step 1: Compute orphan counts per floor**

In `map-editor.js`:

```javascript
function computeOrphanCounts() {
  const validIds = new Set();
  // Build per-floor sets of valid svg ids by loading each floor's SVG metadata.
  // Cheaper alternative: use the floor whose SVG is currently loaded — for the
  // active floor only — and surface only that count. Counts for inactive floors
  // are computed lazily on tab change.
  const byFloor = new Map();
  // For now, count rows whose svgCode does not match any element on the active floor.
  if (!shelfElements) return byFloor;
  for (const r of allRanges) {
    if (String(r.floor) !== String(currentFloor)) continue;
    if (!r.svgCode || !shelfElements.has(r.svgCode)) {
      byFloor.set(currentFloor, (byFloor.get(currentFloor) || 0) + 1);
    }
  }
  return byFloor;
}
```

- [ ] **Step 2: Render badge on the active floor tab**

In `renderFloorTabs(active)`, after innerHTML:

```javascript
const counts = computeOrphanCounts();
for (const n of FLOORS) {
  const count = counts.get(n);
  if (!count) continue;
  const tab = root.querySelector(`[data-floor="${n}"]`);
  const badge = document.createElement('span');
  badge.className = 'inline-block ml-1 px-1.5 py-0.5 text-xs bg-yellow-200 text-yellow-800 rounded cursor-pointer';
  badge.textContent = i18n.t('mapEditor.tab.orphans').replace('{n}', count);
  badge.title = 'View unassigned ranges in CSV Editor';
  badge.onclick = (e) => { e.stopPropagation(); window.location.hash = `#csv-editor?orphans=floor=${n}`; };
  tab.appendChild(badge);
}
```

- [ ] **Step 3: Add query-param consumption in `csv-editor.js`**

In `csv-editor.js`'s init function, after CSV load:

```javascript
function applyUrlFilter() {
  const m = location.hash.match(/orphans=floor=(\d+)/);
  if (!m) return;
  const floor = m[1];
  const filtered = allCsvData.filter(r =>
    String(r.floor) === floor && (!r.svgCode || r.svgCode === '')
  );
  csvData = filtered;
  // Re-render the table.
  renderTable?.();
}
applyUrlFilter();
window.addEventListener('hashchange', applyUrlFilter);
```

(Adapt to actual function names in `csv-editor.js`.)

- [ ] **Step 4: Manual smoke test**

Seed an orphan row in the CSV (svgCode set to a non-existent id). Open Map Editor → badge appears on the affected floor tab. Click the badge → switches to CSV Editor → table filtered to that floor's orphan rows.

- [ ] **Step 5: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add admin/components/map-editor/orphan-badge.js admin/components/map-editor.js admin/components/csv-editor.js
git -C /home/hagaybar/projects/primo_maps commit -m "feat(map-editor): orphan badge + CSV-Editor ?orphans=floor=N deep-link"
```

---

## Task 17 — E2E test fixtures

**Files:**
- Create: `e2e/fixtures/map-editor/floor_test.svg`
- Create: `e2e/fixtures/map-editor/mapping_with_conflicts.csv`

- [ ] **Step 1: Create synthetic SVG**

`e2e/fixtures/map-editor/floor_test.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <rect id="A1" x="20" y="20" width="80" height="40" fill="#94a3b8"/>
  <rect id="B1" x="120" y="20" width="80" height="40" fill="#94a3b8"/>
  <rect id="C1" x="220" y="20" width="80" height="40" fill="#94a3b8"/>
  <rect id="D1" x="20" y="100" width="80" height="40" fill="#94a3b8"/>
  <text x="60" y="42" text-anchor="middle" font-size="10">A1</text>
  <text x="160" y="42" text-anchor="middle" font-size="10">B1</text>
  <text x="260" y="42" text-anchor="middle" font-size="10">C1</text>
  <text x="60" y="122" text-anchor="middle" font-size="10">D1</text>
</svg>
```

- [ ] **Step 2: Create seeded CSV**

`e2e/fixtures/map-editor/mapping_with_conflicts.csv` — minimal columns matching the production CSV, with:

- 1 clean range on A1 (Soc 100-110)
- 2 conflicting ranges on B1 + C1 (Soc 100-105.5 and Soc 105.5-110 — single-point at non-integer)
- 1 orphan range with svgCode = `MISSING` on floor 1
- 1 range on D1 with locked permission for editor (test seeds an editor user with restricted rows)

The exact column header order must match `data/mapping.csv`. Copy the header from the production file and add 4 data rows.

- [ ] **Step 3: Add fixture loader for the test**

Inside `e2e/tests/map-editor.spec.ts` (created in next task), arrange Playwright to:
- Intercept `GET /maps/floor_*.svg` and serve `floor_test.svg`.
- Intercept `GET /data/mapping.csv` and serve `mapping_with_conflicts.csv`.

- [ ] **Step 4: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add e2e/fixtures/map-editor/
git -C /home/hagaybar/projects/primo_maps commit -m "test(map-editor): synthetic SVG + CSV fixtures with conflicts and orphan"
```

---

## Task 18 — E2E tests

**Files:**
- Create: `e2e/tests/map-editor.spec.ts`

Each test below is one step's worth of authoring. Use the existing `e2e/fixtures/auth.fixture.ts` for the admin / editor login fixtures (same as other specs).

- [ ] **Step 1: Test — open + switch floors + click + drawer opens**

```typescript
import { test, expect } from '@playwright/test';
import { adminAuth } from '../fixtures/auth.fixture';
import { mockFixtures } from '../fixtures/map-editor-fixtures';

test.use(adminAuth);

test('Map Editor: select shelf opens drawer', async ({ page }) => {
  await mockFixtures(page);
  await page.goto('/admin/');
  await page.click('#nav-map-editor');
  await page.click('[data-floor="1"]');
  await page.click('#A1');
  await expect(page.locator('#map-drawer')).toBeVisible();
  await expect(page.locator('#map-drawer')).toContainText('A1');
});
```

- [ ] **Step 2: Test — edit range + warning + save**

```typescript
test('Map Editor: warning shown on overlap, save still allowed', async ({ page }) => {
  await mockFixtures(page);
  await page.goto('/admin/');
  await page.click('#nav-map-editor');
  await page.click('#B1');
  // B1 has a 100-105.5 range; create overlap by editing C1's range to 100-110.
  await page.click('#C1');
  const startInput = page.locator('#map-drawer [data-field="rangeStart"]').first();
  await startInput.fill('100');
  await expect(page.locator('.map-drawer__warn-banner')).toBeVisible();
  await page.click('#drawer-save');
  await expect(page.locator('.toast', { hasText: 'Saved' })).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 3: Test — marquee + bulk edit notes**

```typescript
test('Map Editor: Shift-drag marquee selects multiple, bulk edit notes', async ({ page }) => {
  await mockFixtures(page);
  await page.goto('/admin/');
  await page.click('#nav-map-editor');
  // Shift-drag from above A1 to below B1.
  const canvas = page.locator('#map-canvas');
  const a1 = await page.locator('#A1').boundingBox();
  const b1 = await page.locator('#B1').boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(a1.x - 10, a1.y - 10);
  await page.mouse.down();
  await page.mouse.move(b1.x + b1.width + 10, b1.y + b1.height + 10);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('#map-drawer')).toContainText('shelves selected');
  // Type into the notes "Replace all with…" field.
  const notesInput = page.locator('#drawer-fields .border-b').first().locator('[data-role="replace"]');
  await notesInput.fill('Bulk note');
  await page.click('#drawer-save');
  await expect(page.locator('.toast', { hasText: 'Saved' })).toBeVisible();
});
```

- [ ] **Step 4: Test — reassign via map-pick**

```typescript
test('Map Editor: reassign via map-pick', async ({ page }) => {
  await mockFixtures(page);
  page.on('dialog', d => d.accept());
  await page.goto('/admin/');
  await page.click('#nav-map-editor');
  await page.click('#A1');
  await page.click('#map-drawer [data-action="move"]');
  await expect(page.locator('#map-reassign-banner')).toBeVisible();
  await page.click('#D1');   // pick D1 as destination
  await expect(page.locator('#map-reassign-banner')).toBeHidden();
  // The moved range no longer appears under A1.
  await page.click('#A1');
  await expect(page.locator('#map-drawer__rows')).not.toContainText('Soc 100-110');
});
```

- [ ] **Step 5: Test — reassign via dropdown (cross-floor)**

```typescript
test('Map Editor: reassign via dropdown picker (cross-floor)', async ({ page }) => {
  await mockFixtures(page);
  page.on('dialog', d => d.accept());
  await page.goto('/admin/');
  await page.click('#nav-map-editor');
  await page.click('#A1');
  await page.click('#map-drawer [data-action="move"]');
  await page.click('#map-reassign-list');
  await page.locator('#map-picker-filter').fill('B1');
  await page.locator('#map-picker-list button', { hasText: 'B1' }).click();
  await expect(page.locator('#map-reassign-banner')).toBeHidden();
});
```

- [ ] **Step 6: Test — editor role + locked shelves**

```typescript
import { editorAuth } from '../fixtures/auth.fixture';

test.describe('Map Editor as editor', () => {
  test.use(editorAuth);

  test('locked shelves are hatched and unclickable when fully locked', async ({ page }) => {
    await mockFixtures(page);
    await page.goto('/admin/');
    await page.click('#nav-map-editor');
    // D1 is fully locked for the editor fixture.
    const d1 = page.locator('#D1');
    await expect(d1).toHaveClass(/map-shelf--fully-locked/);
    await d1.click();
    await expect(page.locator('#map-drawer')).toBeHidden();
  });
});
```

- [ ] **Step 7: Test — orphan badge + deep-link**

```typescript
test('Map Editor: orphan badge deep-links to CSV Editor with floor filter', async ({ page }) => {
  await mockFixtures(page);
  await page.goto('/admin/');
  await page.click('#nav-map-editor');
  const badge = page.locator('[data-floor="1"] >> text=unassigned');
  await expect(badge).toBeVisible();
  await badge.click();
  await expect(page).toHaveURL(/orphans=floor=1/);
  await expect(page.locator('#csv-editor')).toBeVisible();
});
```

- [ ] **Step 8: Run all map-editor E2E tests**

```bash
cd /home/hagaybar/projects/primo_maps && npx playwright test e2e/tests/map-editor.spec.ts 2>&1 | tail -25
```

Expected: all tests PASS.

- [ ] **Step 9: Run the full E2E suite to catch regressions**

```bash
cd /home/hagaybar/projects/primo_maps && npx playwright test 2>&1 | tail -10
```

Expected: existing 113 tests + new map-editor tests all PASS. If any existing test fails, fix before proceeding (likely caused by the new nav button shifting selectors).

- [ ] **Step 10: Commit**

```bash
git -C /home/hagaybar/projects/primo_maps add e2e/tests/map-editor.spec.ts e2e/fixtures/map-editor-fixtures.ts
git -C /home/hagaybar/projects/primo_maps commit -m "test(map-editor): E2E for select/edit/marquee/reassign/locked/orphan flows"
```

---

## Task 19 — Final verification + acceptance gate

**Files:** none (verification only)

- [ ] **Step 1: Run unit tests**

```bash
cd /home/hagaybar/projects/primo_maps/admin && npx jest 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 2: Run E2E tests**

```bash
cd /home/hagaybar/projects/primo_maps && npx playwright test 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 3: Manual smoke (golden path)**

In a real browser against the deployed admin (or local server):
- Open Map Editor as admin → all 3 floors load.
- Click a shelf → drawer opens with ranges.
- Edit one → warning shows correctly when triggered.
- Save → toast → reload → persisted.
- Shift-drag two shelves → multi-shelf drawer → bulk edit notes → save.
- Click `↗ Move` on a range → map-pick → confirm → save.
- Click `↗ Move` again → choose from list → cross-floor pick → confirm → save.
- Verify orphan badge clicks through to CSV Editor with the filter applied.

- [ ] **Step 4: Manual smoke as editor**

Log in as a configured editor → open Map Editor → verify hatched shelves, locked rows in drawer, fully-locked shelves are click-no-op.

- [ ] **Step 5: Final commit (if any tweaks made during smoke)**

```bash
git -C /home/hagaybar/projects/primo_maps add -A
git -C /home/hagaybar/projects/primo_maps status
# only commit if there are real fixes
```

- [ ] **Step 6: Acceptance gate (mandatory checkpoint per spec §9.3)**

This is the only mandatory breakpoint in the babysitter run. Pause here and wait for the user to confirm acceptance before merging `feat/map-editor` into `main`. Show a summary:

```
Map Editor implementation complete.
- 19 tasks, ~80 commits on feat/map-editor.
- Unit tests: PASS.
- E2E tests: PASS (X total, Y new).
- Manual smoke: PASS (admin and editor flows).
- Pre-feature tag: pre-map-editor-2026-04-28
- Branch: feat/map-editor

Awaiting your "merge & deploy" or "hold for changes" decision.
```

If accepted, the merge + deploy are user-driven (out of plan scope).

---

## Spec coverage cross-check

| Spec section | Covered in task |
|---|---|
| §3 Coexistence as third option | Task 1 |
| §3 Roles admin + editor | Tasks 1, 15, 18 |
| §3 Multi-shelf bulk fields | Task 12 |
| §3 Distinct values + Replace + Clear | Task 12 |
| §3 Overlap rule (full canonical set) | Task 4 |
| §3 Severity warn-not-block | Task 10 |
| §3 Pre-existing dirty data | Task 6 (initial computeFloorConflicts on load) |
| §3 Save model explicit | Task 11 |
| §3 Add range default | Task 9 |
| §3 Reassign yes (both paths) | Tasks 13, 14 |
| §3 Orphan ranges (badge + deep-link) | Task 16 |
| §3 Locked shelves (any range hatched) | Tasks 6, 8, 15 |
| §3 Layout floor tabs at top | Task 2 |
| §3 Multi-select Shift-drag + Ctrl-click | Task 12 |
| §3 Drawer mode replace flip | Tasks 8, 12 |
| §3 Reassign banner + list link | Tasks 13, 14 |
| §3 Warning UI W3 | Tasks 6, 10 |
| §3 Locked shelf visual L1 | Task 6 |
| §3 Concurrency last-write-wins | Task 11 (no locking added) |
| §3 No feature flag | (n/a — none added) |
| §4.4 module interfaces | Tasks 4, 5, 6, 8, 12, 13 |
| §5 component behavior all | Tasks 6 — 16 |
| §6 data flow load/edit/save | Tasks 3, 7, 8, 11 |
| §7 error handling matrix | Task 11 (save failure preserves pendingEdits); Task 6 (locked no-op); Task 8 (W3 warnings) |
| §8.1 unit canonical matrix | Task 4 |
| §8.2 component tests | (intentionally folded into E2E in Task 18 to avoid Jest+DOM brittleness in vanilla-JS components; the unit-level coverage in Task 5 + Task 4 is the heavy lift) |
| §8.3 E2E flows | Task 18 |
| §9.1 tag + branch | Task 0 |
| §9.2 deployment | (out of plan scope — runbook in spec §9.2) |
| §9.3 babysitter:yolo | Task 0 + Task 19 acceptance gate |
| §9.4 no flag | (n/a) |
| Asymmetry comment block | Task 4 step 2 |
| `prefers-reduced-motion` | Task 6 step 1 (CSS), Task 13 step 2 (banner uses `.map-pulse-target`) |
| Namespaced `localStorage` key | Task 2 |
| Precomputed range-count Map | Task 3 |
| Session-wide `pendingEdits` | Task 5 |
| Floor-tab during reassign auto-cancels | Task 13 |
| Save: drawer stays open with fresh values | Task 11 |
| Orphan deep-link query param fallback | Task 16 |

If anything is missing, add the task before execution starts.
