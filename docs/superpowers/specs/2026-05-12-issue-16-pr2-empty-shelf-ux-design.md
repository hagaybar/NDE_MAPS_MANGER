# Issue #16 PR 2 — Empty-shelf clickability + UX

## Goal

Make empty shelves (drawn in the SVG, marked `data-map-object="shelf"`, but with zero CSV rows pointing at them) clickable in the Map Editor. Show a rich empty-state in the drawer with a one-click CTA that creates the first range pointing at the clicked shelf. Make empty shelves visually discoverable on the canvas via a subtle dashed outline.

This is the **user-facing payoff** of issue #16. PR 1 (already shipped, commit `630727c`) laid the data + code foundation with zero user-visible behaviour change; PR 2 delivers the actual feature.

## Context

Phase 2a's foundation (shipped) makes every shelf in the SVG marker-driven: `indexShelfLocations(svgRoot)` returns a `Map<svgCode, SVGElement>` of every `[data-map-object="shelf"]` element. Today's `loadFloor` filters that map down to "shelves that also have at least one CSV row" — a temporary preservation step that kept user-visible behaviour identical during the PR 1 migration.

PR 2 removes that filter. Every marked shelf becomes clickable. For shelves with zero ranges:

- The drawer's `showSingleShelf` previously rendered a header + empty rows area + bare `+ Add range` button. Today's behaviour: drawer opens, no rows visible, librarian has to discover the `+ Add range` button at the bottom. Not a great empty-state experience.
- PR 2 replaces that empty rows area with a rich empty-state UI mirroring the polish we shipped for the orphan card in phase-2a: centered message + amber-bordered explanatory paragraph + prominent primary CTA with a `➕` icon.

The CTA delegates to the existing `addNewRangeToShelf(shelfId)` flow in `map-editor.js` (already implemented; no changes there). It creates a new pending row via `shelfState.add(...)`. The drawer re-renders, finds `rangesOnShelf.length === 1`, falls through to the existing populated-shelf branch, and shows the new row in normal range-editing UI.

The NDE addon impact is zero (PR 1 already verified the addon reads SVG by ID only and ignores `data-*` attributes; PR 2 doesn't touch the SVGs).

## Decisions

- **Detection mechanism:** inherited from PR 1 — `indexShelfLocations(svgRoot)` reads `data-map-object="shelf"` markers.
- **Clickability rule:** every marked shelf is clickable. Drop the temporary "AND has CSV row" filter from `loadFloor`.
- **Permissions:** clickable for all users (admin + editor). Save-time enforcement at the API is the gate; no preview-style gating in the UI.
- **Visual on map:** subtle dashed outline for shelves with zero ranges via a new `.map-shelf--empty` class toggled in `loadFloor`.
- **Empty-state styling:** "rich" pattern mirroring orphan-card phase-2a polish (centered message + amber-bordered explanation paragraph + primary CTA with `➕` icon).
- **CTA action:** existing `addNewRangeToShelf(shelfId)` — drawer transitions to populated UI with the new pending row.
- **Reassign-mode destinations:** empty shelves automatically become valid destinations once the preservation filter is removed (no separate code change).
- **Test fixture extension:** add one new rect (`id="E1"` with `data-map-object="shelf"`) to `e2e/fixtures/map-editor/floor_test.svg` to exercise the empty-shelf path without disturbing existing specs.
- **Closure gate:** **manual verification (9-item checklist below) is the authoritative test for closing #16.** Automated suites guard regressions; the manual run-through proves the feature works end-to-end in both languages.

## Architecture

Three behavioural changes:

**1. Remove the preservation filter in `loadFloor`.**

Currently:
```js
const allShelfLocations = indexShelfLocations(svgRoot);
locationElements = new Map();
for (const [id, el] of allShelfLocations) {
  if (rangeCountByShelf.has(id)) {
    locationElements.set(id, el);
  }
}
```

Becomes:
```js
locationElements = indexShelfLocations(svgRoot);
```

**2. Apply `map-shelf--empty` class per shelf in `loadFloor`.**

Alongside the existing `map-shelf--has-conflicts` toggle (which sits inside `attachInteraction`'s setup loop). After `attachInteraction` runs, walk `locationElements` and toggle the empty class:

```js
for (const [locationId, el] of locationElements) {
  el.classList.toggle('map-shelf--empty', !rangeCountByShelf.has(locationId));
}
```

**3. Empty-state branch in `shelf-drawer.js showSingleShelf`.**

When `rangesOnShelf.length === 0`, render the rich empty-state UI in place of the empty rows area. The primary CTA wires to the existing `onAdd` callback (which `map-editor.js` already binds to `addNewRangeToShelf`).

## Component details

### Empty-state UI structure

Conceptually:

```
.map-drawer__empty-state
├─ .map-drawer__empty-state__message  (centered, h3-ish)
├─ .map-drawer__empty-state__explanation  (amber-bordered paragraph, same styling as .map-orphan-card__explanation)
└─ button.map-drawer__empty-state__cta  (primary blue button with ➕ icon)
```

The container is rendered as a child of the existing drawer host. The standard drawer header (with × close button from #6, Discard/Save buttons) remains visible above it — no change to header. The `+ Add range` button that today sits below the rows area is hidden in empty state (the CTA replaces it semantically).

### i18n keys

New keys in both `en.json` and `he.json`:

```
mapEditor.shelf.empty.message
  en: "No ranges are mapped to this shelf yet."
  he: "אין כרגע טווחים ממופים למדף זה."

mapEditor.shelf.empty.explanation
  en: "This shelf is on the map but has no ranges assigned. Click 'Create the first range here' to add the first range — you can set the collection and the call-number range in the next step."
  he: "מדף זה מסומן במפה אך לא הוקצו לו טווחים. לחצו על 'צור טווח ראשון למדף זה' כדי להוסיף טווח ראשון — תוכלו לקבוע אוסף וטווח מספרי סיווג בשלב הבא."

mapEditor.shelf.empty.cta
  en: "Create the first range here"
  he: "צור טווח ראשון למדף זה"
```

### CSS

New rules appended to `admin/styles/app.css`:

```css
/* Empty shelf visual treatment — dashed outline */
.map-shelf--empty {
  stroke: #94a3b8;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  fill-opacity: 0.4;
}

/* Empty-state UI in the drawer */
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

### Test fixture addition

`e2e/fixtures/map-editor/floor_test.svg` currently has 4 rects (A1, B1, C1, D1) all of which are referenced by the fixture CSV. Add one new rect:

```xml
<rect id="E1" data-map-object="shelf" x="..." y="..." width="..." height="..." fill="..." />
```

The coordinates can mirror an existing rect's pattern. `E1` is NOT added to the fixture CSV, so it's a genuine empty shelf for the new spec to exercise.

## Edge cases

**Permission edge cases.** Editor with limited write access clicks an empty shelf → drawer opens with full empty-state UI → CTA enabled → CTA click calls `addNewRangeToShelf` which adds a pending row → editor fills + saves → existing CSV save path enforces permission, returns 403 if denied → existing error toast fires; the pending row is preserved for retry. No new permission gating in the UI layer.

**State transitions.** User clicks CTA → `shelfState.add(...)` creates a pending row → `renderDrawer()` runs → `rangesOnShelf.length === 1` → falls through to existing populated-shelf branch → normal range-editing UI shows. User clicks Discard → `shelfState.revert()` clears the pending row → `renderDrawer()` runs → `rangesOnShelf.length === 0` → empty-state UI returns. User closes drawer with pending row → existing `handleEscape` / close-button confirmation prompt fires (no new code path).

**Visual edge cases.** Shelf becomes empty after the user deletes its last range → next save rebuilds `rangeCountByShelf` → next `loadFloor` (or post-save refresh) reapplies `map-shelf--empty`. Many empty shelves on a floor → multiple dashed outlines visible; intended signal. Hover over empty shelf → existing tooltip code shows `"{label} · 0 ranges"` (no change; current code handles `count = 0` correctly).

**Conflicts with adjacent flows.**
- **Move-to-empty:** PR 2 makes empty shelves valid destinations in the "Move to another shelf" reassign flow. A populated-shelf range can be moved into a previously-empty shelf. After the move, the destination shelf is no longer empty (dashed outline disappears).
- **Reassign-mode "Set shelf on map" (orphan-panel):** orphan rows can also be reassigned to empty shelves. Same expansion.

**Data hazards.** External CSV change while drawer is open — unchanged from existing behaviour; local view stays out-of-date until reload. Concurrent edits to the same shelf by two admins — existing optimistic-concurrency model handles at save time.

**Known limitations (not bugs).**
- CTA creates exactly one new row; multiple-range additions use the existing `+ Add range` button (visible once at least one range exists).
- Dashed outline doesn't differentiate "empty marked shelf" from "marked shelf with orphan rows pointing here but on the wrong floor" — both flag as empty visually. The orphan panel surfaces the latter case separately.

## Testing strategy

**Layer 1 — Unit tests (Jest jsdom):** create `admin/__tests__/shelf-drawer.test.js` if it doesn't exist; otherwise extend. Add tests:

- `showSingleShelf({rangesOnShelf: []})` renders `.map-drawer__empty-state` container.
- Empty-state shows the message text, the explanation text, AND the CTA button.
- Clicking the CTA fires the `onAdd` callback with the `shelfId`.
- Empty-state container NOT rendered when `rangesOnShelf.length > 0`.
- Locale-aware: rendering with `locale = 'he'` uses Hebrew strings.

5 tests, ~80 lines.

**Layer 2 — Playwright E2E:** new spec `e2e/tests/map-editor-empty-shelf.spec.ts`. Assertions:

1. Click the unreferenced `E1` shelf in the fixture SVG — drawer opens.
2. Drawer renders message + explanation + CTA elements.
3. No range rows rendered in the empty state.
4. Click the CTA — drawer transitions to populated UI; at least one range row visible (pending state).
5. Inspect the new row's svgCode value — equals `E1`.
6. `document.querySelectorAll('.map-shelf--empty').length` > 0 after the page loads (the `E1` shelf and any other unreferenced marked shelf in the fixture).

Runs in both `en-admin` and `he-admin` projects via the existing project-matrix.

**Layer 3 — Existing suites must still pass:**

- Orphan-panel positioning spec (#23 anchor) — 8/8.
- Orphan-panel happy-path spec (#20 anchor) — 1/1 per project.
- SVG marker alignment regression-guard — 1/1.
- Location-model unit tests — 7/7.
- `@phase-3` UX snapshots — rebaseline as needed if any frame captures a canvas area with empty shelves visible (dashed outline appears).
- Pre-existing issue-#9 failures remain unchanged.

**Manual verification — the closure gate.** The issue is NOT considered closed until ALL of these pass in the live admin after deploy + hard-refresh, in BOTH English and Hebrew:

1. Empty shelf is now clickable. Click `ka1_61_a` or `ka1_53_a` on floor 1 — drawer opens with the empty-state UI in the current language.
2. Empty-state UI renders correctly. Header shows shelf label; centered message; amber-bordered explanation paragraph; primary CTA with `➕` icon.
3. Dashed outline visible on the canvas around empty shelves; populated shelves stay solid.
4. Clicking the CTA creates a new range row. Drawer transitions to the populated-shelf UI; the new row's `svgCode` matches the clicked shelf.
5. Filling in the range + Save persists the row. After save, the shelf is no longer empty.
6. Discard or close with a pending new row prompts for confirmation (existing behaviour, regression-checked).
7. Move-to-empty-shelf flow: open a populated shelf, click "Move to another shelf", click an empty shelf — confirm dialog appears; on accept, the range relocates; originally-empty shelf is now populated.
8. Floor switch, hover, orphan panel all continue to behave as in PR 1 — no regressions.
9. All of the above pass in BOTH English AND Hebrew.

If any of these fail, the issue stays open and we iterate.

## Rollback strategy

Three layers, in increasing severity:

1. **Pre-feature tag + feature branch.** `pre/issue-16-pr2` marks `main` before any work; `feat/issue-16-pr2-empty-shelf-ux` branches off it.
2. **Surgical PR boundary.** ~7 paths touched (2 code files, 1 CSS, 2 i18n, 1 new spec, 1 fixture). `git revert <merge-commit>` removes the entire change in one step.
3. **CloudFront cache.** Standard `redeploy.sh` (`/admin/*` invalidation) covers code + CSS + i18n. No `maps/` deploy in PR 2.

Reverting PR 2 leaves PR 1's data foundation in place. The Map Editor returns to "marked shelves with CSV rows are clickable; empty shelves remain non-clickable." No data loss; no broken state.

## Out of scope

- **Adding new map-object kinds** (`data-map-object="printer"`, `"toilet"`, etc.) — schema supports it; deferred until a real use case exists.
- **Removing `indexShelvesById` from `svg-loader.js`** — separate cleanup once we confirm nothing imports it.
- **Unifying `svg-parser.getAvailableCodes` with the marker** — separate tech-debt issue.
- **CSV column rename** — hard-blocked by NDE addon.
- **Admin UI to mark new shelves visually on the map** — librarians still use Inkscape's XML editor pane for new shelf additions.
- **Surfacing "empty shelves" as a count badge or panel** — dashed outline on the map is the discoverability signal; orphan panel stays focused on the bad-svgCode problem.
- **`allowedRanges` per-row permission revisit** — deferred architectural conversation.

## Acceptance criteria

- Preservation filter removed from `loadFloor`; `locationElements` is the unfiltered `indexShelfLocations(svgRoot)` result.
- `map-shelf--empty` class toggled per shelf based on `rangeCountByShelf.has(id) === false`.
- `shelf-drawer.js showSingleShelf` renders the rich empty-state UI when `rangesOnShelf.length === 0`.
- New i18n keys present in both `en.json` and `he.json`.
- New CSS rules in `app.css` (`.map-shelf--empty`, `.map-drawer__empty-state*`).
- New e2e spec `e2e/tests/map-editor-empty-shelf.spec.ts` passes in both `en-admin` and `he-admin` projects.
- New 5th rect (`E1` with `data-map-object="shelf"`) added to `e2e/fixtures/map-editor/floor_test.svg`.
- All 5 new shelf-drawer unit tests pass.
- Pre-existing Jest + Playwright suites show the same pass/fail signature as `main`.
- **Manual verification all 9 items pass in both languages — the closure gate.**
