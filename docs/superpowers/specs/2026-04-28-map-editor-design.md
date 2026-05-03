# Map-Based Range Editor — Design Spec

**Date:** 2026-04-28
**Status:** Design — awaiting implementation plan
**Scope:** Sub-project A of three (A: this map editor, B: password-reset flood fix, C: weekly Alma collection-name validation). B and C will be specified separately.

## 1. Goal

Add a third top-level editing surface to the admin SPA — a map-based range editor — that lets administrators and editors edit shelf ranges directly on the floor SVGs instead of (or alongside) the existing table-based CSV Editor and card-based Location Editor.

The map editor reads and writes the same `data/mapping.csv` as the existing editors. It does not introduce a parallel data layer.

## 2. User stories

- **As an admin**, I open the Map Editor, pick a floor tab, and see the floor's SVG with shelves overlaid. I hover a shelf, click it, and edit its ranges in a drawer at the bottom.
- **As an admin**, I drag a marquee or Ctrl-click multiple shelves and edit shared per-shelf fields (notes / shelfLabel / description) in bulk.
- **As an admin**, I add a new range to a shelf, with the shelf's existing collection pre-filled.
- **As an admin**, I move a range from one shelf to another by clicking ↗ Move and then either picking a destination shelf on the map or selecting one from a dropdown.
- **As an admin**, when ranges overlap or `start > end`, I see a yellow ⚠ on the affected shelf, a count banner in the drawer, and a ⚠ in each conflicting cell with a tooltip describing the conflict. I can save anyway.
- **As an editor**, when I open the Map Editor, shelves whose ranges I'm not permitted to edit appear hatched and are not clickable. I can still see the map and switch floors.

## 3. Decisions captured during brainstorming

| # | Decision | Rationale |
|---|---|---|
| Coexistence | Map Editor is a **third option** alongside CSV Editor (admin-only) and Location Editor (editor + admin). All three operate on the same CSV. | User intent: "add another option." |
| Roles | **Admin + editor**. Editor's row-range restrictions carry over to the map editor. | Existing role model; commits `a24edfc` / `ecfee5b`. |
| Multi-shelf bulk fields | `notes`, `shelfLabel`, `description` (all bilingual). | These are per-shelf, not per-range. |
| Multi-shelf editing UX | "Distinct values list + Replace all with…" textbox. | Protects against silent overwrite when shelves currently differ. |
| Overlap rule | Two ranges conflict iff same `(libraryName, floor, collectionName)` and intersection is more than a single point. Touching at a single boundary value is always OK, integer or fractional. Canonical examples: <br>– OK: A 100-105 + B 105-110 (integer touch). <br>– OK: A 105-106 + B 106-106 + C 106-107 (integer touches). <br>– OK: A 105-106 + B 107-108 (disjoint). <br>– OK: A 292-471.7 + B 471.7-475 (real-data fractional abutment). <br>– OK: A 100-123.45 + B 123.45-124 (fractional touch at the same point). <br>– **Conflict: A 100-123.45 + B 123.41-124** (intersection `[123.41, 123.45]` is wider than a point). <br>– Conflict: A 105-106 + B 105.93-106 (fractional encroachment). <br>– Conflict: D 190-195 + G 194-194.72 (interior point). | User-supplied rule. **Revised 2026-04-28** after observing real catalog data: catalogers use fractional abutments routinely (e.g., shelf "292-471.7" abuts "471.7-…"); flagging those as conflicts produced large false-positive counts. The earlier integer-vs-fractional asymmetry has been dropped. |
| Severity | Warn but allow save. Both overlap and `start > end` are warnings. | User decision (Q4b-a). |
| Pre-existing dirty data | Show all violations on load, in the same UI as live conflicts. | User decision (Q4c-a). |
| Save model | Explicit Save / Discard per drawer session. One CSV write per save. | Pairs with version-history workflow. |
| Add range default | Pre-fill collection from the shelf's existing ranges. | Smallest cognitive load. |
| Reassign | Yes, both map-pick (default) and dropdown picker (fallback / cross-floor). | Map-native primary path; dropdown for keyboard-driven users and cross-floor moves. |
| Orphan ranges | Surfaced as a per-floor count badge on the floor tab; link out to the existing CSV / Location Editor for cleanup. | Out of scope to fix orphans here. |
| Locked shelves (editor) | Whole shelf hatched + 🔒 if any range is locked; drawer shows all ranges with locked rows disabled. | Simplest correct behavior; defense-in-depth at commit time. |
| Layout | Floor tabs at top, large map area, drawer at bottom. | User picked Layout A. |
| Multi-select | **Shift-drag marquee** anywhere AND Ctrl/⌘-click extension. | Empty-area-drag breaks on dense floors where shelves tile most of the SVG; Shift-drag is unambiguous and works everywhere (Q7-C). |
| Drawer mode flip | Replace mode — single vs multi switches the entire drawer body. | Simpler than tabs (Q7-i). |
| Reassign flow | Banner with "Click destination on map, or [choose from list]." Source shelf amber, others pulse green. Confirm modal before commit to pendingEdits. | Map-native primary, list fallback (Q8-C). |
| Warning UI | Map ⚠ marker on conflicting shelves + count banner in drawer + ⚠ on each conflicting cell with hover tooltip. | Compact (Q9-W3). |
| Locked shelf visual | Whole shelf hatched + 🔒 if any range is locked. | Simpler than per-range hatching (Q9-L1). |
| Concurrency | Last-write-wins, same as existing editors. Version history is the audit / recovery path. | Out of scope to add optimistic locking. |
| Feature flag | None — single admin (the user) at this time. | User decision. |

## 4. Architecture

### 4.1 Files added

```
admin/components/
  map-editor.js                 # top-level view (lifecycle, state, init)
  map-editor/
    svg-interaction.js          # hover/click/marquee/keyboard on the SVG
    shelf-drawer.js             # single-shelf + multi-shelf drawer (mode flip)
    reassign-mode.js            # "pick destination on map" + dropdown picker
    range-validation.js         # overlap rule + start>end check; uses existing comparator
    svg-loader.js               # fetch floor SVG, index shelves by svgCode, attach handlers
    shelf-state.js              # in-memory model of selection & pending edits
```

### 4.2 Files modified

- `admin/index.html` — add `nav-map-editor` button + `<div id="map-editor" class="view hidden">…</div>`. Honor `data-role-required` for editor + admin.
- `admin/app.js` — wire the new view into the route/tab switcher; lazy-init on first activation.
- `admin/i18n/he.json` & `admin/i18n/en.json` — strings for tab label, dialog labels, warnings.
- `admin/styles/app.css` — map-editor scoped styles (drawer, hatched lock fill, ⚠ markers, marquee, pulse animation). Honor `@media (prefers-reduced-motion: reduce)` — the reassign-pick pulse falls back to a static green outline; no other animations are essential.

### 4.3 Reused without modification

- CSV load/save services (and version history they trigger).
- `auth-guard.js` role gating + the editor row-range restriction logic.
- The Dewey range comparator in `data-model.js` / `validation.js`. We **extend** its overlap helper if existing comparator gaps appear (e.g., `396(44)` vs `396.5`); we don't reimplement parsing.
- Toast service + errors-dashboard for save success/failure logging.

### 4.4 Module interfaces

- **`svg-interaction.js`** — emits events `shelf:hover`, `shelf:select`, `shelf:multi-select-changed`, `shelf:reassign-target-picked`. Knows nothing about ranges or CSV.
- **`shelf-drawer.js`** — consumes selection events from `shelf-state.js`; emits `range:changed`, `range:added`, `range:moved`, `range:deleted`. Knows nothing about SVG geometry.
- **`range-validation.js`** — pure functions over a list of ranges. Easy to unit-test.
- **`shelf-state.js`** — single source of truth for selection, pending edits, and per-range permission flags. `commit()` materializes pending edits and hands off to the existing CSV save service. `revert()` discards them.

This split is deliberate: each module fits in working memory, has a narrow interface, and can be tested independently. `location-editor.js` at 35 KB is already too big — `map-editor.js` won't repeat that pattern.

## 5. Component behavior

### 5.1 `svg-interaction.js`

Five mutually-exclusive interaction states:

| State | Trigger | Visual |
|---|---|---|
| **idle** | nothing selected | shelves at default fill |
| **hover** | pointer over a shelf | indigo hover fill; tooltip "Shelf X · N ranges" after ~400ms. The N comes from a `Map<svgCode, number>` precomputed once on floor load (see §6.1); hover never re-filters `floorRanges`. |
| **single-selected** | click a shelf | shelf turns amber; drawer opens in single-shelf mode |
| **multi-selected** | **Shift-drag marquee** anywhere on the SVG, or Ctrl/⌘-click ≥ 2 shelves | each amber; drawer opens in multi-shelf mode |
| **reassign-pick** | "Move" button in drawer | source amber, others pulse green; banner across top; click target → confirm; Esc cancels |

Shelves that contain any locked range render with hatched fill + 🔒 (per Q9-L1). They remain clickable — clicking opens the drawer in single-shelf mode with locked rows disabled and editable rows interactive. A shelf is only made click-no-op when **every** range on it is locked for the current user; in that case the cursor changes to `not-allowed` and the drawer does not open.

### 5.2 `shelf-drawer.js`

Two modes, one drawer (replace flip).

**Single-shelf mode:** header `Shelf <label> — <N> ranges` + Discard / Save. Body: list of range rows (collection dropdown, range-start input, range-end input, ↗ Move, × delete). `+ Add range` button at bottom — pre-fills collection from the shelf's existing ranges. Pre-existing overlap warnings shown immediately using the W3 pattern.

**Multi-shelf mode:** header `<N> shelves selected`. Body: notes / shelfLabel / description (bilingual). Each field uses the "distinct values" widget — a small list "current values: X (3 shelves), Y (2 shelves)", a `Replace all with…` textbox, and a separate `Clear on all selected` checkbox. **An empty textbox with the checkbox unchecked means "no change to this field"** — Save will not touch it. The checkbox is the only way to blank the field across the selection. Save writes the chosen value (or empty, if the checkbox is set) to all selected shelves.

**Empty state:** drawer is collapsed; subtle hint "Click a shelf to edit, Shift-drag or Ctrl-click to select multiple."

### 5.3 `reassign-mode.js`

1. ↗ Move clicked.
2. Banner: "Click a destination shelf, or [choose from list]."
3. SVG enters reassign-pick state; non-source shelves pulse green. Under `prefers-reduced-motion: reduce`, the pulse is replaced by a static green outline (no animation).
4. User picks via map click OR opens dropdown picker (filterable by svgCode + shelfLabel; lets you change floors).
5. Confirm modal: "Move *Sociology 301-305* to shelf B2?"
6. On confirm, recorded into `pendingEdits` as `{rangeId, newSvgCode, newFloor (if cross-floor), newLibrary (inherited)}`. Drawer flips back to source shelf; the moved range no longer appears in its list. Inline note: "Moved to shelf B2 — applied on Save."
7. **Floor-tab interaction:** if the user clicks a different floor tab while in reassign-pick state, reassign-pick auto-cancels (equivalent to Esc) and the floor switch proceeds. Cross-floor moves go through the dropdown picker, not by switching tabs mid-pick.
8. Esc cancels with no change.

Cross-floor reassignment is supported via the dropdown only; map-pick mode stays on the current floor.

### 5.4 `range-validation.js`

The module opens with a comment block stating the simplified rule (revised 2026-04-28 after real-data observation):

> Two ranges conflict iff they share the same `(libraryName, floor, collectionName)` AND their numeric `[start, end]` intervals overlap by **more than a single point**. Touching boundaries are always OK, regardless of whether the shared value is integer or fractional. Real catalog data uses fractional abutments routinely (e.g., shelf `292-471.7` next to shelf `471.7-…`); these are how the catalog is authored, not data errors.

```
overlapsConflict(rangeA, rangeB) → boolean
```
True iff:
- Same `libraryName`, same `floor`, same `collectionName`.
- AND intersection of numeric `[start, end]` is more than a single point. (Single-point touches at any value, integer or fractional, are OK.)

```
computeFloorConflicts(ranges) → Map<rangeId, conflictDetail[]>
```
Computed groupwise per `(library, floor, collection)`. Output drives the W3 UI.

```
validateRangeShape(range) → {ok} | {error: 'start > end' | 'invalid format'}
```

### 5.5 `shelf-state.js`

Holds:

- `floorRanges` — full list of ranges for the current floor, indexed by row id.
- `selection` — `{kind: 'none' | 'single' | 'multi', shelfIds: string[]}`.
- `pendingEdits` — additions, modifications, deletions, reassignments, keyed by row id (or temp id for additions). **`pendingEdits` is a single session-wide buffer spanning all floors. Switching floor tabs does not flush it; only Save or Discard do.** This makes cross-floor reassignment safe and means a user can edit on one floor, switch to verify something on another, and come back without losing work.
- `permission(rangeId)` — `'edit' | 'readonly'`, computed from the editor's row-range restrictions.

`commit()` materializes pending edits, filters out any edit whose row id isn't in the editor's permitted set, hands off to the existing CSV save service. `revert()` discards pending edits.

## 6. Data flow

### 6.1 Load

1. `Map Editor` tab clicked → `app.js` calls `initMapEditor()` (lazy, first activation only).
2. Role + permission scope read from `auth-guard.js`.
3. CSV fetched via existing service, parsed, cached in `shelf-state.js` for the session.
4. Active floor (default 0, or remembered via `localStorage` under the namespaced key `mapEditor.activeFloor.<deploymentId>` — using a deployment-scoped key prevents collisions if the browser ever serves two admin SPAs against different CSVs):
   - Filter `floorRanges` to that floor.
   - `svg-loader.js` fetches `/maps/floor_<n>.svg`, injects into the map container, indexes shelves by `id` (= `svgCode`), attaches pointer handlers, applies locked overlay where appropriate.
   - Build `rangeCountByShelf: Map<svgCode, number>` once for this floor — drives the hover tooltip's "N ranges" without per-hover filtering.
   - `range-validation.js` runs `computeFloorConflicts(floorRanges)`; conflicting shelves get the ⚠ marker.
5. Orphan-range count for this floor surfaces as a badge on the floor tab. Clicking the badge deep-links to the existing CSV Editor with a filter pre-applied to that floor's orphan rows. The filter is implemented by appending a query param the CSV Editor already understands; **if it doesn't yet support such a param, adding it is part of phase 1 scope** so this surface area is closed before the rest of the run starts.

### 6.2 Edit

1. User interaction → `svg-interaction.js` updates `shelf-state.js` selection → `shelf-drawer.js` re-renders.
2. Field changes, adds, deletes, and reassigns write to `pendingEdits` only.
3. `range-validation.js` re-runs against `mergedRanges = floorRanges + pendingEdits`, scoped to affected `(library, floor, collection)` groups for performance.
4. `Save` button enabled if `pendingEdits` is non-empty. Warnings do not block save.

### 6.3 Save

1. Save clicked → `shelf-state.commit()` produces the new CSV via the same serializer the other editors use.
2. POST to existing `putCsv` Lambda (versioning + CloudFront invalidation).
3. On success: toast, `pendingEdits` cleared across all floors, drawer stays open on the currently-selected shelf with fresh values from the new snapshot, conflict markers re-rendered.
4. On failure: toast with server message; `pendingEdits` preserved for retry.

## 7. Error handling

| Failure mode | Behavior |
|---|---|
| `start > end` | Cell tinted yellow, ⚠ on the row, tooltip explains. Save still allowed. |
| Overlap conflict | W3 pattern: ⚠ on shelf + count banner + per-cell ⚠ with tooltip. Save still allowed. |
| Pre-existing dirty data | Same UI as live conflicts; flagged on load. |
| Locked range edit attempt | Disabled at UI; defense-in-depth at `commit()` filters out illegal edits and logs to errors-dashboard. |
| Invalid svgCode (data drift) | Surfaces as orphan in the floor-tab badge. Never silently dropped. |
| CSV load failure | Existing service's error path (toast + retry); map editor renders empty state. |
| Save failure | Toast with error; `pendingEdits` preserved for retry. |
| SVG load failure | "Could not load floor map. Try another floor or reload." Drawer remains usable for navigation. |
| Concurrency / two admins editing | Last-write-wins (same as existing editors). Out of scope to change. |

## 8. Testing strategy

### 8.1 Unit (Jest)

- `range-validation.test.js` — pin the integer-touch rule with the full canonical example set:
  - OK: `A 100-105 + B 105-110` (boring integer-touch positive case)
  - OK: `A 105-106 + B 106-106 + C 106-107` (multi-shelf integer touches)
  - OK: `A 105-106 + B 107-108` (disjoint, sanity check)
  - **Conflict: `A 100-105.5 + B 105.5-110`** (single-point touch at a non-integer — the case most likely to be "simplified" wrong later)
  - Conflict: `A 105-106 + B 105.93-106` (fractional encroachment)
  - Conflict: `D 190-195 + G 194-194.72` (interior point)
  - Plus matrix: start>end, multi-collection, multi-floor, multi-library.
- `shelf-state.test.js` — pendingEdits accumulation, commit/revert, permission filtering.
- Reassign edge cases (same shelf no-op, cross-floor via dropdown).

### 8.2 Component (Jest + DOM)

- `shelf-drawer.test.js` — mode flip, distinct-values widget, Save enable/disable, warnings render.

### 8.3 E2E (Playwright)

New spec at `e2e/tests/map-editor.spec.ts`:

- Open Map Editor as admin → switch floors → hover → click → drawer opens.
- Edit a range → conflict warning visible → save anyway → reload → state persisted.
- Marquee-select two shelves → bulk-edit notes (Replace all with…) → save → reload → both shelves updated.
- Reassign via map-pick → confirm → save → range now on destination shelf.
- Reassign via dropdown (cross-floor) → confirm → save.
- Editor role: shelves outside permitted rows show as locked; clicking is a no-op.
- Orphan-count badge appears with a seeded orphan row.

Fixtures: small synthetic floor SVG (3-5 shelves) and a CSV with known conflicts under `e2e/fixtures/map-editor/`. Mocked CloudFront for fast deterministic runs.

## 9. Rollback & operations

### 9.1 Pre-implementation safety net

- Tag current `main` as `pre-map-editor-2026-04-28` before merging.
- Feature branch: `feat/map-editor`.
- All work happens on the branch + babysitter; no direct commits to `main` until the feature is acceptance-tested.

### 9.2 Deployment surface

- 100% client-side (admin SPA + i18n + CSS). No Lambda or API Gateway changes.
- Deploy = `aws s3 sync admin/ s3://tau-cenlib-primo-assets-hagay-3602/admin/` + CloudFront invalidation `/admin/*`.
- Roll back = re-deploy the tagged tree + invalidate. Recovery time: minutes.

### 9.3 Babysitter orchestration

- Implementation will be driven by **`babysitter:yolo`** (non-interactive). Breakpoints are minimized — the only mandatory checkpoint is at the very end of the run, after all phases pass. Per-phase checkpoints are emitted to the journal but do not pause execution.
- Process definitions go under `.a5c/processes/map-editor/`, following the existing convention (`editor-range-restrictions` is a fitting template).
- Phases — sequential within the single yolo run, each ending in a runnable, deployable state so a partial result can ship if needed:
  1. Skeleton + nav wiring + i18n strings + empty state.
  2. SVG loader + interaction layer + idle/hover/single-selected states.
  3. `range-validation.js` with full unit tests.
  4. Single-shelf drawer (read, edit, add, delete) + Save/Discard wiring.
  5. Multi-select (marquee + Ctrl-click) + multi-shelf drawer with distinct-values widget.
  6. Reassignment (map-pick + dropdown + confirm modal).
  7. Editor-role lock visuals + commit-time defense-in-depth filter.
  8. E2E test pass + Playwright fixtures.

### 9.4 No feature flag

Single active admin (the user). Ship to all roles at once on merge.

## 10. Out of scope

- Optimistic locking / multi-admin concurrency.
- Orphan-range repair within the map editor (handled in existing CSV / Location Editor).
- Sub-projects B (password-reset flood) and C (weekly Alma collection-name validation) — to be specified separately.
- Mobile-responsive layout — admin tooling is desktop-first.
- Pan / zoom on the SVG — existing maps fit at default scale; can be added later if needed.
- Multi-shelf batch editing (Shift-drag marquee, Ctrl-click multi-select, distinct-values widget, bulk per-shelf field replace/clear). Removed during UX polish — see issue #3.
