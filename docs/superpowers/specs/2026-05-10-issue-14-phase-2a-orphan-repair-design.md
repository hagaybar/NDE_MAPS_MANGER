# Issue #14 — Sub-phase 2a: Map Editor orphan repair

## Goal

Phase 1 of issue #14 detects and surfaces invalid `svgCode` values via the
Errors Dashboard. Phase 2 splits into three repair surfaces (one per
existing data-entry entry point):

- **2a — Map Editor orphan repair (this spec).** Spatial repair: librarian
  clicks the correct shelf on the floor map; the system updates the row's
  `svgCode` automatically.
- **2b — CSV Editor row indicators + svgCode authoring help.** Tabular repair.
- **2c — Errors Dashboard Fix-dialog enrichment.** Dashboard repair.

Sub-phase 2a is the highest priority because the Map Editor is the only
surface where the librarian can repair *without typing or knowing
svgCodes* — they identify the right shelf visually.

## Context

Today's Map Editor already has:

- A yellow `+N` badge on each floor tab counting "orphan" ranges (rows
  whose `svgCode` does not resolve to a clickable shelf on the floor).
  Implemented in `admin/components/map-editor.js:101` (`computeOrphanCounts`).
- A bottom drawer that opens when a shelf is clicked, showing that
  shelf's range rows with edit fields and a **Move** button per row.
- A reassign mode (`admin/components/map-editor/reassign-mode.js`) that
  the **Move** button triggers: dim the map, show "click any shelf to
  reassign" banner, on click confirm and update the row's `svgCode`.

What's missing: there's no way for the librarian to *act* on the orphan
count. Clicking the badge today follows a deep-link to the CSV editor's
filter, which only catches empty-svgCode rows (a subset of the badge's
count). The librarian sees the warning but has no map-driven path to
repair the rows.

This sub-phase adds that missing path.

## Decisions recap (from brainstorming)

- **Anchor:** right-side drawer in the Map Editor canvas, following
  reading direction (`inset-inline-end: 0` → physical right in English,
  physical left in Hebrew).
- **During reassign:** panel stays open; the card being reassigned gets
  an "active" highlight; other cards visually subdued; on confirm, card
  animates out and active state advances to the next card.
- **Mental-model differentiation:** "Set shelf on map" (repair) and
  "Move to another shelf" (move) are presented as different operations
  with different labels, banners, and confirmations, even though they
  share the same `startReassign` mechanic underneath. Post-action
  behavior also differs:
  - Repair → auto-advance to next orphan card in the panel.
  - Move → reopen the bottom drawer on the destination shelf.
- **Panel scope:** rows whose validator finding kind is
  `svgCode_not_on_floor` or `missing_svgCode` on the active floor.
  `unknown_floor` rows are out of scope (no floor anchor) — they surface
  in 2b/2c instead.

## Architecture

One new UI surface, one new state dimension, three new components.

**The new surface** is `map-orphan-panel`: a right-side drawer anchored
to the existing `map-canvas` container (not the page), so it doesn't
interfere with the global nav or other admin views. Its visibility is
keyed off a single boolean: "is the user actively triaging orphans for
the current floor?"

**The new state dimension** is `orphan-panel-open: bool`. The panel and
reassign mode are independent. All four combinations are valid (panel
open + reassign idle, panel open + reassigning, panel closed + idle,
panel closed + reassigning — though the last is unusual). During
reassign-while-panel-open, the active card gets the highlight; on
confirm, the card animates out and active focus advances.

**Three new components, each with one responsibility:**

| file | responsibility |
|---|---|
| `admin/components/map-editor/orphan-deriver.js` | Pure function `deriveOrphansForFloor(allRanges, floor, svgIdsByFloor)` → `Array<OrphanCard>`. Wraps `validateRow`, filters to `svgCode_not_on_floor` + `missing_svgCode`, projects each finding into a panel-friendly shape, stable sort by collection then shelfLabel. No DOM. |
| `admin/components/map-editor/orphan-card.js` | One DOM-returning render function `renderOrphanCard({orphan, isActive, locale, onSetShelf, onEditElsewhere})`. Card shows collection name (locale-aware), shelf label, range, the bad svgCode highlighted, kind badge. Two buttons: primary **Set shelf on map**, secondary **Edit in CSV editor** link. |
| `admin/components/map-editor/orphan-panel.js` | The right-side drawer container. Public surface: `mount(hostId)`, `open(orphanList)`, `close()`, `setActiveCard(rowId)`, `markRepaired(rowId)`, plus event subscribers. Handles slide-in animation, scroll, BiDi anchoring. Doesn't derive — receives a prepared list. |

The existing `map-editor.js` orchestrator wires these together: on
`mapeditor:floor-changed`, re-derive; on badge click, open; after every
successful save, re-derive and call `markRepaired` for any rows whose
findings disappeared.

## Data flow

Five flows, all driven by the existing `allRanges` array + validator
output.

**1. Orphan derivation (initial load + after every save).**
`allRanges` is filtered to the current floor; each row goes through
`validateRow` (the phase-1 validator); findings whose kind is
`svgCode_not_on_floor` or `missing_svgCode` are projected to a panel
shape and returned as the cards list. Single pure function. Identical
inputs always produce identical outputs.

**2. Repair workflow.** The librarian clicks **Set shelf on map** on a
card. The card is highlighted; the map enters reassign mode (banner:
"Click the shelf where this range belongs"). The librarian clicks a
shelf; a confirmation appears ("Set shelf for [Collection · range] to
[picked]?"). On confirm, the row's `svgCode` is set, the CSV is saved,
the orphan list is re-derived, the card animates out, and the panel
auto-advances to the next card. The whole experience feels like crossing
items off a punch list.

**3. Floor switch.** The librarian clicks a different floor tab. If
reassign mode was active, it cancels gracefully. The map switches; the
panel re-derives for the new floor and refreshes its content. If the
new floor has no orphans, the panel shows a "no orphans on floor N"
message rather than vanishing.

**4. All repaired.** When the last orphan on a floor is repaired, the
panel briefly shows "all repaired on this floor" (~1.5s, with
`aria-live="polite"` for screen readers) and auto-closes. The yellow
`+N` badge disappears too.

**5. Edit-in-CSV-editor deep-link.** Each card has a quieter secondary
**Edit in CSV editor** link that routes to
`#csv-editor?orphans=floor=N` (the existing deep-link). For 2a, this
deep-link's filter only catches empty-svgCode rows, not the broader
validator definition; rows with non-empty bad svgCodes won't appear in
the filter, and the librarian must scroll/search manually. This is a
documented limitation that sub-phase 2b widens to use the validator's
findings precisely.

## Components & files

**New files (admin/components/map-editor/):**

- `orphan-deriver.js`
- `orphan-card.js`
- `orphan-panel.js`

**Modified files:**

| file | what changes |
|---|---|
| `admin/components/map-editor.js` | Wire badge → `orphanPanel.open()`; on `mapeditor:floor-changed`, re-derive and refresh the panel content wholesale. After every successful save, diff the previous orphan list against the freshly-derived one: for each row that disappeared from the orphan set, call `markRepaired(rowId)` so it animates out individually (preserves visual continuity); for each newly-appeared orphan row, append it. ~30 lines added. |
| `admin/components/map-editor/reassign-mode.js` | Accept new `intent: 'repair' \| 'move'` parameter. Use it to pick banner copy and confirmation copy; drive post-action behavior — `intent: 'repair'` triggers the panel's auto-advance; `intent: 'move'` reopens the destination drawer. |
| `admin/components/map-editor/shelf-drawer.js` | Rename existing **Move** button label to **Move to another shelf**; pass `intent: 'move'` to `startReassign`. |
| `admin/styles/app.css` | New classes for the orphan panel and cards. Logical-property positioning so the drawer follows reading direction. |
| `admin/i18n/en.json` and `admin/i18n/he.json` | New keys (listed below). |

**No changes to:** `data-model.js`, `svg-parser.js`, `app.js`,
`errors-dashboard.js`, `csv-editor.js`, `validation.js`,
`validation-panel.js`. Sub-phase 2a is strictly additive on the Map
Editor side.

**New i18n keys:**

```
mapEditor.orphan.panel.title              "Rows needing shelf assignment" / "שורות הזקוקות להצמדת מדף"
mapEditor.orphan.panel.empty              "No orphans on floor {n} — switch tabs to see others" / "אין שורות יתומות בקומה {n} — עברו ללשוניות אחרות"
mapEditor.orphan.panel.allRepaired        "All orphans repaired on this floor" / "כל השורות היתומות תוקנו בקומה זו"
mapEditor.orphan.card.setShelf            "Set shelf on map" / "קבע מדף במפה"
mapEditor.orphan.card.editElsewhere       "Edit in CSV editor" / "ערוך בעורך ה-CSV"
mapEditor.orphan.card.kind.wrongSvgCode   "Wrong svgCode" / "קוד SVG שגוי"
mapEditor.orphan.card.kind.missingSvgCode "No svgCode set" / "ללא קוד SVG"
mapEditor.orphan.card.readOnly            "Read-only — ask an admin to repair this row" / "לקריאה בלבד — בקש ממנהל לתקן שורה זו"
mapEditor.reassign.banner.repair          "Click the shelf where this range belongs" / "לחץ על המדף שאליו שייך טווח זה"
mapEditor.reassign.banner.move            "Click the new shelf for this range" / "לחץ על המדף החדש לטווח זה"
mapEditor.reassign.confirm.repair         "Set shelf for {label} to {picked}?" / "להצמיד את {label} למדף {picked}?"
mapEditor.reassign.confirm.move           "Move {label} from {old} to {new}?" / "להעביר את {label} מהמדף {old} למדף {new}?"
mapEditor.move.button                     "Move to another shelf" / "העבר למדף אחר"
```

Hebrew text uses `dir="auto"` on dynamic content; interpolated values
(`{label}`, `{picked}`, etc.) are wrapped in `<bdi>` to prevent
direction bleed when collection names contain mixed scripts.

## Edge cases & error handling

**During an active repair:**

- **Esc / Cancel mid-pick.** Existing reassign code already handles
  cancellation. Panel restores the active card to neutral state; no row
  data changed.
- **Floor tab switched mid-pick.** Existing logic cancels reassign on
  `mapeditor:floor-changed`. Panel clears active card and re-derives.
- **Rapid clicks / race conditions.** While a card is active, all other
  cards' Set-shelf buttons are disabled (visually subdued). Re-clicking
  the active card's button is a no-op.

**Persistence / data hazards:**

- **CSV save fails after repair confirm.** Existing `saveCsv()` failure
  path shows error toast and preserves `pendingEdits` for retry. Card
  stays visible. Active state clears so librarian can retry.
- **All orphans repaired on a floor.** Panel briefly shows "all
  repaired" message, auto-closes, badge disappears. New orphans
  re-trigger the badge on next derivation cycle.
- **External CSV change.** Another admin saves from a different tab
  while this panel is open. The current admin's `allRanges` is stale.
  Cross-tab detection is out of scope for 2a — same staleness affects
  every other admin view; not making it worse.
- **Browser reload while panel was open.** Panel does not persist its
  open/closed state. Initial state on every load is "closed; badge
  visible if orphans exist."

**Layout / accessibility:**

- **Narrow viewport (<900px canvas).** Drawer collapses to a small
  toggle pill ("📋 N"); click expands the drawer over the canvas in
  semi-overlay mode; click again collapses. CSS-only.
- **Keyboard:** Tab moves focus through cards, Enter/Space activates
  the focused card's primary button, Esc closes the panel (when not in
  active-card state). Aria-live announces the "all repaired" success.

**Permission edge cases:**

- **Editor without write permission on a row.** The existing
  `getPermittedRowIds` machinery gates which rows an editor can edit.
  Orphan rows the editor can't write get the **Set shelf on map** button
  rendered as `disabled` with a "read-only — ask an admin" tooltip. Card
  is still visible (visibility) — just no repair action. Admins always
  see all rows.

**Multi-orphan UX:**

- **Many orphans, active card scrolls off-screen.** After
  `setActiveCard`, panel auto-scrolls so the active card is in view via
  `scrollIntoView({ block: 'nearest' })`.

**Known limitation (resolved in sub-phase 2b):**

- **Edit-in-CSV-editor deep-link is imprecise in 2a.** The existing
  `?orphans=floor=N` filter narrows by *empty svgCode* only, not by the
  validator's broader orphan definition. Cards representing rows with a
  non-empty bad svgCode (the typical E006 case) open the CSV editor to
  a list that doesn't include that specific row; the librarian must
  scroll or search manually. Sub-phase 2b widens the filter to use the
  validator's findings.

## Testing strategy

**Unit tests (Jest, no DOM) — `orphan-deriver.js`:**

- Empty `allRanges` → empty result.
- All rows valid → empty result.
- One row with `svgCode_not_on_floor` → one card with that kind.
- One row with `missing_svgCode` → one card with that kind.
- Mixed valid + invalid → only invalid returned.
- `unknown_floor` rows → NOT returned.
- Other validator findings (`range_overlap`, missing `libraryName`,
  etc.) → NOT returned.
- Floor filtering: rows on floor 2 don't appear when we ask for floor
  1's orphans.
- Stable sort: same input always returns cards in the same order.

**Component tests (Jest jsdom):**

- `orphan-card.js`: collection name + shelf label render in current
  locale; bad svgCode is highlighted; both buttons render and emit
  correct callbacks; `isActive` toggles class; read-only permission
  disables the primary button.
- `orphan-panel.js`: `mount() + open([])` shows empty state;
  `open(orphans)` renders one card per orphan in deriver order;
  `setActiveCard(rowId)` highlights only that card; `markRepaired(rowId)`
  animates out and advances cleanly; "all repaired" announces with
  `aria-live="polite"`; re-`open(newList)` swaps content cleanly;
  keyboard interactions work (Tab, Enter, Esc).

**End-to-end tests (Playwright):**

1. **Happy path:** seed CSV with one orphan → admin loads → badge shows
   `+1` on the right floor tab → click badge → panel opens with one
   card → click Set shelf on map → click a real shelf → confirm → card
   animates out → "all repaired" appears → badge gone.
2. **Floor switch mid-flight:** seed orphans on both floors → open
   panel → start Set-on-map for one card → click a different floor
   tab → reassign cancels → panel updates to new floor's orphans.
3. **Save failure:** seed an orphan → start repair → mock API to fail
   the save → confirm shows error toast → card stays in the panel →
   retry succeeds → card removed.

**Visual snapshots:**

Add 2 new Playwright snapshots to the existing phase-3 baselines:

- Panel closed, badge visible.
- Panel open with N cards, no active card.

The "active card during reassign" state is timing-sensitive; rely on
the e2e happy-path test for that.

**Test data:**

A small fixture file `admin/__tests__/fixtures/orphan-fixtures.js` with
4–6 representative rows covering each `kind`, valid rows for control,
and rows on multiple floors. Reused across unit and component tests.

## Rollback strategy

Three layers, in increasing severity of escape.

1. **Pre-feature tag + feature branch.** Tag `pre/issue-14-phase-2a`
   marks `main` before any work; branch `feat/issue-14-phase-2a`
   branches off it.
2. **Surgical PR boundary.** Three new files, small additions to
   `map-editor.js` (badge handler + auto-advance hook), CSS, and i18n
   strings. No structural changes to existing components. The bottom
   drawer, reassign-mode, shelf-state, etc. stay byte-identical except
   for the additive `intent` parameter and the **Move** button rename.
   `git revert <merge-commit>` removes the entire feature in one commit
   without leaving orphaned code.
3. **Documented fallback strategies.** If the right-side drawer feels
   wrong in practice, the alternative anchors from brainstorming
   remain pre-documented:
   - **Reuse the bottom drawer with a mode switch** — bottom drawer
     hosts either shelf-details or orphan-list, switched by what was
     last triggered.
   - **Floating overlay panel** — top-right corner overlay, draggable.

   Same components (`orphan-card.js`, `orphan-deriver.js`) are reusable;
   only the container changes.

The recovery path:
- *Light fix*: change the panel's CSS / anchor without touching logic.
- *Medium fix*: swap `orphan-panel.js` (container) for a bottom-drawer
  or overlay variant; cards and deriver stay.
- *Heavy fix*: `git revert` the merge; back to phase 1 state in one
  commit; iterate on a different design.

## Out of scope

- Sub-phase 2b (CSV Editor row indicators + svgCode authoring help) —
  separate session.
- Sub-phase 2c (Errors Dashboard Fix-dialog enrichment) — separate
  session.
- Save-time gating (warn-with-override / hard-block) — phase 3.
- Auto-suggesting svgCode fixes (e.g., "did you mean…?") — explicitly
  rejected during brainstorming for phase 1; remains rejected here.
- Cross-tab data-staleness detection — same staleness affects every
  admin view; out of 2a's scope.
- Role-based exposure of the orphan panel (admin-only vs editor) — left
  as a separate decision the user may make later; the implementation
  uses the existing `getPermittedRowIds` machinery, which already
  filters per-row writability.

## Acceptance criteria

- A clickable yellow `+N` badge on each floor tab opens a right-side
  panel listing orphan rows for that floor.
- Each card shows collection / shelf label / range / bad svgCode (or
  "[empty]") / a kind badge.
- Each card has a primary **Set shelf on map** button that drives the
  reassign flow with repair-specific banner and confirmation copy.
- During an active repair, the card is visually highlighted; other
  cards' primary buttons are disabled.
- After a successful repair, the card animates out and the next card
  becomes active. After the last card is repaired, the panel briefly
  shows "all repaired" and auto-closes; the badge disappears.
- Floor tab switching cancels any active reassign and refreshes the
  panel to the new floor's orphans.
- Existing **Move** button is renamed to **Move to another shelf**;
  it triggers the same reassign flow with move-specific banner and
  confirmation copy. After a successful move, the bottom drawer
  reopens on the destination shelf.
- All new strings are localized (en + he); RTL layout works.
- Keyboard navigation works (Tab/Enter/Esc).
- All Jest unit tests, component tests, and Playwright e2e tests pass;
  no new regressions in the existing 113-test e2e suite.
