# Map Editor — side-panel layout redesign (design spec)

**Date:** 2026-05-31 (refreshed 2026-06-01)
**Status:** Approved; bug cluster (Phases 1–4) SHIPPED + owner-verified live 2026-06-01. Phase 5 (layout) approved to build with the refresh below.
**Mock-up:** `docs/map_editor_new_layout.png` · interactive 3-skin mockup `mockups/map-editor/` (Classic skin chosen)
**Plan:** `docs/superpowers/plans/2026-05-31-map-editor-side-panel-layout.md`
**Tracking issue:** [#97](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/97)

---

## 0. Refresh 2026-06-01 (post-mockup-feedback + #86 reality)

Folded into Phase 5 (full detail in the plan's "Refresh 2026-06-01" block):
- **Skin = Classic** (owner pick) — lift palette/type from `mockups/map-editor/themes.css`.
- **W1** idle copy → EN: *"To see the range and collection, pick a shelf on the map. At the top of the page you can choose a floor and display style."* / HE: *"להצגת הטווח והאוסף, בחרו מדף במפה. בראש העמוד תוכלו לבחור קומה וסגנון תצוגה."* (drop "three views" line) — revises §6.1/§6.5.
- **W2** no "back to map"; panel closes via a corner **✕** (carry the #86 close affordance) — revises §6.
- **M1/M2** selected-shelf highlight must be a **non-covering outline** that doesn't hide adjacent shelves — revises §4 map styling.
- **P1** Remove → **centred, separate confirmation modal** (not inline) — revises §6.4.
- **#86 reality:** the focus fix shipped as **capture/restore around full re-render** (not `updateRowInPlace`); `side-panel.js`/`shelf-card.js` must carry the `captureFocus`/`restoreFocus` mechanism. The #87 same-shelf-vs-cross-shelf wording (`overlapSameShelf`) moves into the card's inline message.

---

## 1. Goal

Replace the Map Editor's **bottom drawer** with a persistent **side panel**, so the floor
map can be larger *and* the editing interface is visible at the same time. The map
reclaims the scarce **vertical** space the bottom drawer used to eat (the #70 pain) and
the editor uses the abundant **horizontal** space of the librarians' desktop screens.

This is a **focused redesign of the existing `map-editor.js`**, not the paused #37
"Ranges Editor" rebuild (see §10). Along the way it finalizes the screen's structure and
closes the bug cluster that lives in the exact code being rewritten.

## 2. Current state (what we're changing)

`#map-editor-view` is a **vertical flex column** (`app.css:2672`):

```
#map-editor-view            (flex column, height fit-to-viewport)
  .map-editor__header       (floor tabs 0/1/2 + idle hint)
  #map-canvas               (flex:1; the SVG floor map; direction:ltr forced — #2 fix)
  #map-drawer               (bottom strip; display:none until a shelf is clicked)
```

There are **three** competing editing surfaces today — this fragmentation *is* the UX problem:

1. **Bottom drawer** (`shelf-drawer.js`) — per-shelf range editing; appears at the bottom, eats vertical space.
2. **Orphan panel** (`orphan-panel.js`) — "unassigned ranges" list; `position:absolute`, slides in from the right edge **over** the canvas, parks off-canvas via `translateX(100%)`. Mounted *inside* `#map-canvas` (`map-editor.js:549-552`).
3. **Reassign banner** (`reassign-mode.js`) — `position:fixed; top:60px; left:50%` floating banner for "click a destination shelf on the map" (used by Move and orphan-repair; can cross floors).

Key constraints baked into today's code:

- `#map-canvas { direction: ltr }` (`app.css:2712`) — fixes #2 (RTL displaced the LTR-authored SVG coordinate space). **Load-bearing; keep it.**
- The orphan panel's **physical** `left`/`right` + `[dir=rtl]` overrides + `translateX` (`app.css:2814-2826`) is the intentional **#23** fix — *only because the panel is trapped inside force-LTR `#map-canvas`* (see §4.1).
- Fit-viewport (#70): `fitMapEditorViewport()` (`map-editor.js:311`) sizes `#map-editor-view` height; `#map-canvas > svg { width:100%; height:100% }` scales-to-fit via viewBox. `#map-canvas { overflow-x:hidden }` clips the off-canvas-parked orphan panel.

## 3. Finalized design — overview

**One large map + one persistent side panel** that unifies all three of today's surfaces into a
single panel with **selection-driven modes**:

| Mode | When | Panel content |
|------|------|---------------|
| **idle** | nothing selected | Calm first-person hint ("Pick a shelf and I'll show what's on it") + a **collapsed** nudge "⚠ {n} shelves on this floor need attention →" shown **only when n>0**, expands the triage list on click. |
| **shelf** | a shelf is selected | That shelf's entries editor (collection, From/To, Move, Remove, Add-entry, Save/Discard) as **vertically stacked cards**. |
| **reassign** | Move / repair in progress | Passive "moving {X}…" summary + Cancel in the panel; the **instruction strip renders over the map** (where hands+eyes act). |
| **triage** | unassigned worklist opened deliberately | The "needs a shelf" list (today's orphan panel), entered from the idle nudge — **not** as a side-effect of deselecting. |

The map gets larger; the bottom drawer, the orphan overlay, and the floating reassign banner
are all retired into this one panel.

## 4. Layout architecture

### 4.1 Take the panel OUT of `#map-canvas` — this is the load-bearing move

New scaffold (replacing `map-editor.js:538-547`):

```
#map-editor-view            (flex column: header on top, split below)
  .map-editor__header       (floor tabs — full width, stays in the column)
  #map-editor-split         (CSS GRID — the NEW direction-aware parent)
    #map-canvas             (grid col 1 = 1fr; keeps direction:ltr — UNCHANGED, #2)
    #map-side-panel         (grid col 2 = var(--panel-w); sibling, NOT a child of #map-canvas)
```

```css
#map-editor-split {
  display: grid;
  grid-template-columns: 1fr var(--panel-w, 360px);  /* canvas | panel */
  min-height: 0;
  flex: 1;                /* fill the column below the header */
  /* NO direction override here — inherits document dir (RTL in he, LTR in en) */
}
#map-editor-split.is-collapsed { grid-template-columns: 1fr 0; }
#map-canvas     { min-width: 0; direction: ltr; overflow: hidden; }  /* keep #2; min-width:0 lets it shrink */
#map-side-panel { min-width: 0; overflow-y: auto; }
#map-canvas > svg { display: block; width: 100%; height: 100%; }     /* unchanged fit rule */
```

**Why this is correct and kills #23 at the root:** because `#map-side-panel` is now a **sibling**
of `#map-canvas` (not a descendant), it does **not** inherit the forced `direction:ltr`. It
inherits document `dir` normally, and a CSS Grid flows its columns in writing direction — so
column 2 lands at `inline-end`: **right in LTR/English, left in RTL/Hebrew**, automatically, with
**zero physical CSS and zero `[dir=rtl]` overrides**. The #23 precondition (a panel trapped in
force-LTR `#map-canvas` that needed physical hacks) **no longer exists**, so #23 cannot recur. The
`direction:ltr` stays only on `#map-canvas`, where the SVG geometry needs it.

The map auto-reflows on collapse via `min-width:0` on `#map-canvas` — **no JS width math needed**.
The collapse animates `grid-template-columns` (`var(--panel-w) → 0`), keeping the panel in flow
(focus order preserved). The old `translateX(100%)` parking trick and the `overflow-x:hidden`
clipping workaround are **deleted** (they only existed to manage the off-canvas-parked overlay).

### 4.2 Panel side: mirror by direction

The editing panel sits at the **trailing edge** (`inline-end`): **right in Hebrew/RTL** (matching
the mock-up), **left in English/LTR**. The eye lands on the map first in reading order. Achieved
purely via grid flow + document `dir` (§4.1) — never physical CSS, never `inset-inline` on the
panel itself.

### 4.3 Idle collapse / responsive

- **≥1366px:** split shown, panel persistent. `--panel-w: clamp(300px, 24%, 380px)`.
- **1024–1365px:** panel **auto-collapses to a thin rail/toggle by default**; user can expand it
  temporarily as an overlay anchored to the split (logical `inset-inline-end:0` — safe now that the
  split is not force-LTR). Replaces the old `@media (max-width:900px)` rule.
- **<1024px:** out of scope (desktop tool); allowed to scroll. Inherits #37's 1366×768 decision.

**Do not** fall back to a bottom drawer on narrow screens — maintaining two editing surfaces again
is the exact complexity this redesign removes.

### 4.4 Fit-viewport: keep height-only JS, strengthen the guard

`fitMapEditorViewport()` stays **height-only** (the grid + `min-width:0` handle width). The header
stays inside the flex **column**, above the split row, so the `getBoundingClientRect().top` math is
unchanged; the split gets `flex:1; min-height:0`.

The existing #70 guard is **false-green**: with `width:100%;height:100%` + viewBox letterboxing the
SVG *always* "fits" (it just shrinks), so `mapFitsW <= canvasW` passes even when the map is a tiny
letterboxed sliver. **Strengthen** (§8): assert canvas + panel **tile the split with no overflow**
(`canvasBox.width + panelBox.width <= splitBox.width + 1`) and the map isn't pathologically small,
in both panel states and both directions.

## 5. State model — one source of truth (root-cause fix)

The engine behind #86 / #91 / #92 is **three diverging sources of truth**: the module global
`allRanges`, `shelfState._ranges` (a by-value copy, `shelf-state.js:2`), and the post-save
`shelfState.revert()` (`map-editor.js:518`) that re-reads the *stale* baseline. A persistent panel
that stays open across saves and floor switches makes the divergence **permanent**, not transient.

### 5.1 `shelf-state.js` API (target surface)

```js
createShelfState({ ranges, permittedRowIds }) → {
  // queries
  ranges(), selection(), mode(), reassign(), pendingEdits(), pendingCount(),
  isAllowed(id), permission(id), materialize(),
  // selection / mode  (mode is first-class, replaces reassign-mode.js's module global)
  selectSingle(shelfId),        // → mode 'shelf'
  clearSelection(),             // → mode 'idle'
  openTriage(), closeTriage(),  // → mode 'triage' / back
  enterReassign({ rangeId, intent }),       // 'shelf'|'triage' → 'reassign'
  cancelReassign(),                          // → prior mode
  confirmReassignTarget({ svgCode, floor }), // apply move (add-safe) → 'shelf'(dest)|'idle'
  // edit ops — ALL add-safe (the #81/#92 contract, centralized)
  edit(id, patch), add(tempId, range), move(id, target), delete(id), revert(),
  // NEW: the save re-baseline (the ONLY baseline writer besides construction)
  commit(serverRows),
}
```

**`commit(serverRows)`** (fixes #86 cause 2 + the divergence): atomically `_ranges = serverRows`,
`_pending.clear()`. After commit, `materialize() === serverRows`. `saveCsv` calls `commit` **instead
of** `revert()`, and assigns the **same array reference** back to `allRanges` so divergence is
structurally impossible.

**Add-safe `move`/`delete`** (fixes #92, mirroring the #81 `edit` guard):

```js
move(id, target) {
  const e = _pending.get(id);
  if (e && e.type === 'add') { _pending.set(id, { type:'add', range:{ ...e.range, ...target } }); return; }
  _pending.set(id, { type:'move', target });
}
delete(id) {
  const e = _pending.get(id);
  if (e && e.type === 'add') { _pending.delete(id); return; }  // unsaved add → just drop it
  _pending.set(id, { type:'delete' });
}
```

Use a private `applyToPending(id, op)` helper so a future 5th op can't re-open the hole.

### 5.2 Mode transitions (the hard cases)

One rule: **a destructive context switch (different shelf, floor change, close, enter reassign of a
different row) must consult pending edits and is gated by a Save / Discard / Cancel decision.** Today
ESC prompts on pending edits but shelf→shelf navigation and floor switches **silently** carry
session-wide pending edits — that becomes the central hazard in a persistent panel.

| From | Trigger | Pending? | Semantics |
|------|---------|----------|-----------|
| shelf(A) | click shelf B | no | switch to shelf(B), in place |
| shelf(A) | click shelf B | yes | **prompt** Save/Discard/Cancel |
| shelf(A) | click same A | any | no-op (no re-render; no focus loss) |
| shelf(A) | click empty bg | no | → idle |
| shelf(A) | click empty bg | yes | **prompt** (never silently discard) |
| shelf(A) | floor tab switch | yes | **prompt** |
| shelf(A) | Move row r | edits on other rows | allowed (Move is itself an op); enter reassign, keep edits |
| shelf(A) | ESC | yes | prompt (keep today's behavior) |
| shelf(A) | Save OK | — | **stay on shelf(A)**, re-render from committed baseline, Save/Discard disabled |
| reassign | click target (same floor) | — | confirm → re-select dest shelf |
| reassign | click target (other floor via tab) | — | confirm → **auto-switch tab + select dest + toast** |
| reassign | floor tab switch | — | **stay in reassign**, re-arm pick targets for the new floor |
| reassign | ESC | — | cancel pick → prior mode (single ESC owner) |
| idle/triage | click shelf | — | → shelf |

Recommended default on the prompt = **Save** (librarians think per-shelf; global save-on-navigate
matches their model), with Discard and Cancel offered. The panel header shows the aggregate
`pendingCount()` chip at all times — a boolean (`hasPendingEdits`, `shelf-drawer.js:35`) hides that
edits on other shelves are queued for the global save.

### 5.3 Focus management (#86 cause 1) — structural vs in-place

Today `onChange` calls `renderDrawer()` on **every keystroke** (`map-editor.js:374`), which
`innerHTML`-wipes the host (`shelf-drawer.js:31`) and rebuilds every `<input>`, destroying focus.

Contract:

- **In-place (NEVER rebuild inputs):** typing in collection/From/To; conflict + start>end re-tint
  (extract `shelf-drawer.js:101-118` into `applyRowValidation(rowEl, range, conflicts)` and call it
  from the input handler); warning-banner count/links; Save/Discard enabled-state.
- **Structural (rebuild only `#drawer-rows`, never the whole panel):** add, delete, move, floor
  change, save (re-baseline), selection change.

The `input` handler does `edit()` → `refreshConflicts()` (map tints) → `applyRowValidation` on the
current row + `updateBanner()` + `updateSaveDiscardEnabled()`. **No `renderDrawer()`.**

### 5.4 Reassign inside the persistent panel

- Add `#map-canvas.is-picking`. While set, the canvas click handler (`svg-interaction.js:47`)
  early-returns from the normal `onSelect` and routes to `confirmReassignTarget(shelfId)` — removes
  the capture-phase `stopPropagation` hack (`reassign-mode.js:30-36`). One click handler, mode-aware.
- Instruction renders as a **strip over the map** (reuse the floating-banner position), not buried in
  the RTL-far panel. Panel shows passive "moving {collection} {from–to}" + Cancel. Pulse legal
  targets (`.map-pulse-target`); suppress hover tooltip + `--selected` affordance while picking.
- **Cross-floor:** keep reassign alive across `mapeditor:floor-changed` (remove the
  `if (isReassignActive()) cancelReassign()` at `map-editor.js:202`; re-arm targets instead). On
  confirm to another floor: **auto-switch the tab, select the destination shelf, toast "Moved {range}
  to {shelf} on Floor N"** — never leave the librarian on the wrong floor with no feedback.
- **Single ESC owner** keyed on `shelfState.mode()`. Delete `orphan-panel.js`'s independent keydown
  (`orphan-panel.js:71-85`).

### 5.5 Save semantics

Pessimistic (await the PUT; the bundle invariant can 422). On 200 → `commit(serverRows)`, stay on the
same shelf, the added row now shows its server-assigned id. On failure → keep `_pending` for retry,
surface the server's reason in the panel, stay on shelf.

## 6. Information architecture & content (librarian voice)

### 6.1 Idle is a calm hint, NOT the unassigned list

(Revised from the first draft on two independent critics' advice.) The tool is **shelf-centric**
("click a shelf, fix what's on it"). Making the orphan worklist the resting content inverts that and
violates the #73 "hide zero-count sections" pattern (a clean floor would greet every librarian with
an empty, jargon-y list). Idle content:

1. First-person hint: *"Pick a shelf on the map and I'll show what's on it."*
2. **Only if count > 0**: a single collapsed nudge *"⚠ {n} shelves on this floor need attention →"*
   that expands the triage list **on click** (mode → triage). Disappears at zero.

Repairing a triage item pivots to map-clicking anyway (`handleOrphanSetShelf` → reassign), so the
full list being one click away is all the workflow needs.

### 6.2 Mode signalling

Persistent panel header names the mode in plain words: idle = floor name; shelf = shelf name + a
clear **‹ Back to map / ×**; reassign = an **amber** header strip ("Now click the shelf where this
belongs") — the colour change is the "you're in a different mode" cue the lost spatial separation
used to provide.

### 6.3 Per-entry editor = vertical stacked card

Per entry, in a ~340px column:
- Line 1: collection dropdown, **full width** (values are long sentences, e.g. *"CB Bibliography
  Collection. Apply to the Reference Department, entrance floor"* — never two columns).
- Line 2: two **labelled** fields: `From [____]  To [____]` (the mock-up's `מ-`/`עד-` — keep the
  labels; today's inputs are bare).
- Line 3: quiet actions — **Move to another shelf** (text+icon, not a cramped button) and **Remove**
  (worded + confirm; the bare `×` is too terse).
- Below cards: **`+ Add another entry`**.

Mock-up affordance → current function:

| Mock-up | Current | Verdict |
|---------|---------|---------|
| `מדף A — 15 שורות` | `mapEditor.shelf.header` "Shelf {label} — {n} ranges" | keep label; **drop "{n} ranges"** from the headline |
| collection dropdown | `collectionName` `<select>` | keep; full width |
| `מ-`/`עד-` | `rangeStart`/`rangeEnd` | keep; **add visible labels** |
| `נווט מיקום אחר` | `onMove` → reassign | keep; "Move to another shelf" (not "location") |
| `+ הוסף טווח נוסף` | `onAdd` | keep; **blocked by #86 — fix first** |
| `בטל`/`שמור` | `onDiscard`/`onSave` | keep |
| red `נדרש תיקון` pill | conflict banner | keep as a **per-entry inline badge** (see §6.4) |

### 6.4 Errors inline, not tooltip-only

Today overlap/start>end is signalled **only** by a cell tint + `title=` tooltip — undiscoverable in a
narrow column. Add an always-visible amber line under the offending entry: *"These call numbers
overlap with {shelf}"* / *"'From' is higher than 'To'."* Keep the tint as reinforcement.

### 6.5 String table (EN copy + HE note)

First-person, jargon-free (no "orphan/range/conflict/svgCode/CSV"). New keys marked **(new)**. HE
follows the established masculine-present / plain-counting drafting; the user refines register. All
codes/numbers inside HE strings get `<bdi>` isolation (bidi-engineering pattern).

| Key | EN | HE note |
|-----|----|---------|
| `mapEditor.empty` | Pick a shelf on the map and I'll show what's on it. | בחר מדף במפה ואציג מה נמצא עליו. |
| `mapEditor.idle.nudge` **(new)** | ⚠ {n} shelves on this floor need attention | ⚠ {n} מדפים בקומה זו דורשים טיפול (only when n>0) |
| `mapEditor.idle.nudge.expand` **(new)** | Show me → | הצג לי ← |
| `mapEditor.triage.title` | Entries that aren't on the map yet | שורות שעדיין לא הוצמדו למפה |
| `mapEditor.triage.empty` | Nothing needs fixing on this floor. | אין מה לתקן בקומה זו. |
| `mapEditor.triage.card.wrongSvgCode` | Its shelf isn't on this map anymore | המדף שלה כבר לא נמצא במפה הזו |
| `mapEditor.triage.card.missingSvgCode` | No shelf chosen yet | עדיין לא נבחר מדף |
| `mapEditor.triage.card.setShelf` | Choose its shelf on the map | בחר את המדף שלה במפה |
| `mapEditor.triage.card.editElsewhere` | Fix this in the table instead | תקן את זה בטבלה במקום |
| `mapEditor.shelf.header` | Shelf {label} | מדף {label} (drop "— {n} ranges") |
| `mapEditor.shelf.count` **(new, optional)** | {n} entries here | {n} שורות כאן |
| `mapEditor.shelf.empty.message` | Nothing is on this shelf yet. | עדיין אין כלום על המדף הזה. |
| `mapEditor.shelf.empty.cta` | Add the first entry | הוסף שורה ראשונה |
| `mapEditor.field.from` **(new)** | From | מ- |
| `mapEditor.field.to` **(new)** | To | עד- |
| `mapEditor.field.collection` **(new)** | Collection | אוסף |
| `mapEditor.addRange` | + Add another entry | + הוסף שורה נוספת |
| `mapEditor.move` | Move to another shelf | העבר למדף אחר |
| `mapEditor.delete` | Remove | הסר |
| `mapEditor.warning.startGtEnd` | 'From' is higher than 'To' — please check. | ה-"מ-" גבוה מה-"עד-" — בדקו בבקשה. |
| `mapEditor.warning.overlap` | These call numbers overlap with {otherShelfLabel} | מספרי המיון האלה חופפים ל{otherShelfLabel} |
| `mapEditor.warning.banner` | {n} things to check on this shelf | {n} דברים לבדוק במדף זה |
| `mapEditor.warning.with` | Also on: | גם על: |
| `mapEditor.reassign.banner.move` | Now click the shelf where this belongs | עכשיו לחץ על המדף שאליו זה שייך |
| `mapEditor.reassign.banner.repair` | Now click this entry's shelf on the map | עכשיו לחץ על מדף השורה הזו במפה |
| `mapEditor.reassign.chooseFromList` | or pick from a list | או בחר מתוך רשימה |
| `mapEditor.reassign.cancel` | Never mind | ביטול |
| `mapEditor.save` | Save | שמור |
| `mapEditor.discard` | Undo my changes | בטל את השינויים שלי |
| `mapEditor.unsavedChangesConfirm` | You have changes you haven't saved. Leave without saving? | יש לך שינויים שלא נשמרו. לצאת בלי לשמור? |

## 7. The three additive seams (and honest deferral)

A future collection / batch-edit mode (#37's centerpiece) is **not free**. To make it a genuine later
*addition* rather than a rework, bake in exactly three cheap seams now — and build **nothing else**:

1. **`mode` enum** on `shelfState` (`idle | shelf | reassign | triage`) — a future `collection` mode is a new case.
2. **Tagged `selection.kind`** (already `{ kind }`) — a future `kind:'collection'` is a new shape, not a refactor.
3. **Idle list as a parameter** — pass the "what shows when expanded" renderer in, don't hardcode the triage list, so a collection list can be swapped later.

**Honestly named as NOT free later** (do not claim otherwise): zoom/pan + the transform layer, and the
batch write-path (`commit`-of-N-rows / "Apply to N" / mixed-value inputs). These are net-new whenever
#37's collection mode is built.

## 8. Testing strategy

### 8.1 Will break / rewrite

- **Unit:** `shelf-drawer.test.js` (bottom-drawer selectors → panel-mode), `orphan-panel.test.js`
  (standalone panel → triage mode; reconcile ESC with the single owner).
- **E2E:** `map-editor-ux.spec.ts` (4 full-page `toHaveScreenshot` baselines invalidated — regenerate;
  `#map-drawer` geometry assertions), `map-editor.spec.ts` (`#drawer-save`, `#map-reassign-banner`
  selectors), `map-editor-orphan-panel.spec.ts` + `map-editor-orphan-panel-positioning.spec.ts`
  (off-canvas `translateX` park assertions → persistent-panel geometry; re-express the #23 RTL guard),
  `map-editor-empty-shelf.spec.ts` (`.map-drawer__row`, `drawer-empty-cta` selectors).

### 8.2 Extend (don't break)

- `shelf-state.test.js`: `commit(rows)` becomes baseline + clears pending (`materialize()===rows`);
  **add→move** keeps the row; **add→delete** drops the pending entry with no orphan; existing #81
  add→edit tests stay.
- `map-editor-esc.test.js`: pending-edit prompt now also fires on shelf→shelf and floor switch; single
  ESC owner bails on `mode()==='reassign'`.
- `map-editor-fit-viewport.spec.ts`: **add** panel-OPEN and panel-COLLAPSED fit cases in LTR **and**
  RTL; add the "canvas + panel tile the split, no overflow" assertion (fixes the false-green guard).

### 8.3 New guards (mandatory)

- **#23 canary:** `#map-side-panel` is **not** a descendant of `#map-canvas`, and its computed
  `direction` matches `<html>` (LTR in en, RTL in he) — the architecture's tripwire.
- **#2 unchanged:** `#map-canvas` still computes `direction:ltr` in he; scaled-shelf click still hits.
- Mode transitions: idle→shelf→reassign→idle and shelf→shelf without leaking pending edits/selection.
- Focus retention on keystroke: assert **no full re-render on `input`** via stable input-node identity
  (focus itself is hard in jsdom; the no-rerender design *is* the contract).
- **#91:** failing-test-first that `loadMappingCsv` passes `{cache:'no-cache'}` (mirror `csv-editor-cache.test.js`).
- Survive untouched: `orphan-card.test.js`, `orphan-deriver.test.js`, `svg-loader*.test.js` (revisit
  svg-loader's `tagName!=='svg'` child-preservation only if the panel host moves out of `#map-canvas` — it does).

## 9. Deploy / rollback

- All-client (admin SPA); **no Lambda**. Rollback = redeploy previous `admin/`.
- **Bump `?v=` query params** on every changed ES module import (e.g. `shelf-drawer.js?v=`,
  `shelf-state.js?v=`, `map-editor/*`) or browsers serve stale module bodies post-deploy.
- **`redeploy.sh` runs `aws s3 sync admin/ --delete`** → deploying from `main` reverts any
  deployed-but-unmerged feature. While the layout PR is deployed-but-unmerged for QA, **deploy only
  from its branch, or merge first.** The small bug-fix PRs land fast to keep the deploy surface clean.
- **Pre-feature tag** `pre-mapeditor-panel-2026-05-31` on `main` before the layout PR.
- **CloudFront invalidation** (`/admin/*` or `/*`) after deploy; verify the live module carries the change.

## 10. #37 disposition & out-of-scope

**#37 → SLIM, don't close.** Edit it down to the genuinely-deferred, not-yet-built pieces: **batch
collection editing** ("Apply to N" + the 6 shared fields + mixed-value UX), the **Location-Editor
merge** decision, and **zoom/pan**. Drop its from-scratch `admin/components/ranges-editor/` rebuild
plan (superseded — build on the existing `map-editor/` modules). Add a note: "Layout / no-scroll /
panel-mode foundation delivered by the 2026-05-31 Map Editor redesign; this issue is now the additive
*collection-mode* layer on top of it, building on the seam left for it." Closing would discard the
only written record of the batch requirements; leaving it as-is keeps two issues claiming ownership of
the Map Editor layout.

**YAGNI / out of scope here:** batch collection editing, zoom/pan/drag, mixed-value inputs,
Location-Editor merge, the "Ranges Editor" rename (pure churn across i18n/nav/storage keys/e2e),
multi-shelf selection.

**#87 — verified already correct; re-scoped to verify-and-close (range-rule audit, 2026-05-31).** A
range audit of every surface found the conflict rule is *already* aligned with the catalog's authoring
conventions (confirmed with the user 2026-05-31), so #87 needs **no rule change**:

- **Both error-reporting surfaces are correct.** Map Editor conflicts use `overlapsConflict`
  (`map-editor/range-validation.js`); the Data Quality Dashboard uses `doRangesOverlap`
  (`services/data-model.js:315`). **Both** treat a single-point *touching* boundary (`lo === hi` /
  strict `<`) as **non-conflicting**, compare **numerically (float)**, and are **prefix-aware** (Dewey
  `""` vs LC `"ML"` never overlap). Real abutments (shelf `953–955.05` next to `955.05–956.01`) and
  deliberate gaps (shelf 21 A `912–912.999` + `914–915.6`, the `913` band absent) come back clean.
  Only genuine interior overlaps and `start > end` are flagged.
- **The one inclusive (`<= 0`) function is in the right place.** `doCallNumberRangesOverlap`
  (`lambda/range-validation.mjs` + `admin/utils/range-filter.js`) counts a touch as a match, but it is
  used **only** for **editor access-control** (`validateEditsAgainstRange` → "you can only edit rows
  within your assigned range", HTTP 422). Inclusive matching is *correct* there; it emits no data-error
  indication. **No server save path rejects on range overlap** (the bundle-invariant 422 is
  `svgCode → shelf` resolution only).
- **Phase 4 is therefore verification, not a code fix:** reproduce #87 against the live CSV; if it does
  not reproduce (expected), **close #87**; if it does, capture the exact row pair — the cause is then a
  stale deploy or a case outside the touching-boundary rule, *not* the rule itself.
- **Minor parity gap → tracked separately as #98 (low priority).** `doRangesOverlap` (Dashboard)
  groups by `collection + floor` but **not** `libraryName`, whereas `overlapsConflict` (Map Editor)
  groups by `library + floor + collection` — a rare cross-library false-positive on the Dashboard only.
  Cannot fire today (live data is single-library; 0 cross-library `(collection,floor)` pairs, verified
  2026-05-31). Not part of this work — see #98.

## 11. Phasing (summary — full detail in the plan)

Each phase is an independently shippable, failing-test-first PR; the risky layout churn lands last,
after the state/lifecycle contract is proven green on the current drawer.

1. **#91** — `cache:'no-cache'` on `loadMappingCsv` (one line).
2. **#92** — add-safe `move`/`delete` in `shelf-state.js`.
3. **#86** — `commit()` + saveCsv re-baseline + stop full-re-render-on-input, **on the current drawer**.
4. **#87** — verify on live data; the rule already treats touching boundaries as non-conflicts, so
   close if it does not reproduce (no rule change).
5. **Layout move** — grid split out of `#map-canvas`, 4-mode panel, vertical cards, plain-language
   strings, strengthened fit-viewport guards, reassign-as-mode, triage. Carries the now-proven
   contract; the only PR needing e2e/visual rebaselining.

This finalizes the screen in **one effort and one end-state** (nothing of the design is deferred to
later rework); the phased delivery is purely for bisectability and safe rollout.
