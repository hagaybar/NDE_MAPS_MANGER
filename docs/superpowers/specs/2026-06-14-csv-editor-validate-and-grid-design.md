# CSV Editor — Validate-Before-Save + Usable Wide Grid — Design

> **Status:** Current · Created 2026-06-14 · Design spec for revising the admin
> CSV Editor so it (1) blocks saving invalid data and shows the reason up front,
> and (2) makes the wide edit grid usable (frozen header, frozen anchor column,
> always-visible scrollbar). Drives the implementation plan of the same date.
> Owner-approved (brainstorming, 2026-06-14). Tracking issue: **#187**.

## Problem

While QA-ing the #88 blank-floor fix, the owner added a new row in the admin
**CSV Editor** without a floor and saved. The save **failed after a delay with
no explanation**. Investigation confirmed two stacked gaps plus two grid-usability
complaints:

1. **No client-side validation before save.** `saveCSV()`
   (`admin/components/csv-editor.js`) serializes and PUTs the whole file with
   zero checking. The "delay" is the server round-trip; the rejection (now
   correctly a 422 from the #88 fix) is real but invisible.
2. **Generic failure message.** On a non-2xx response the editor shows a generic
   `csv.saveError` toast and discards the server's specific reason. (This is
   issue **#134**, which notes the same bug exists in the CSV editor.)
3. **Header doesn't freeze in practice.** `<thead class="sticky top-0">` exists,
   but because only the whole page scrolls vertically (the table has no bounded
   scroll area), the sticky header slides up under the top nav and looks
   un-frozen.
4. **Horizontal scrollbar is hard to find.** The grid is 14 columns wide; the
   only horizontal scrollbar sits at the bottom of all 422 rows, so it's missed.

The app **already has** a full row validator (`validateRow` in
`admin/services/data-model.js`, codes E001–E006 errors + W001–W003 warnings) —
it is simply not wired into the CSV Editor's save path. So most of the
validation work is *connecting what exists*, not building it.

## Decisions (owner-approved)

| Decision | Choice |
|---|---|
| Scope | The **whole admin CSV Editor**: save-validation **and** table UX. CSV Editor only. |
| Block scope | **The whole file must be valid** to save (not just touched rows). |
| What blocks vs warns | **Errors block** (E001 empty required, E002 start>end, E003 illegal floor, E004 prefix mismatch, E005 duplicate, E006 svgCode not on its floor). **Warnings don't block** (W001 overlap, W002 unusual svgCode, W003 empty description). |
| Table freeze | Freeze the **header row** AND a **left anchor column** (row # · svgCode); bounded scroll viewport with an always-visible horizontal scrollbar. |

**Feasibility verified:** the live `data/mapping.csv` (422 rows) was checked
against all six blocking rules and has **0 violations** (E001/E002/E003/E004/E005
computed directly; E006 guaranteed by the live bundle invariant). So
"whole file must be valid" cannot lock the owner out on day one, and **no
one-time data cleanup is a prerequisite**.

## Design

### A. Validation + save gate

- **Single source of truth:** reuse `validateRow(row, allRows, originalRow)`. No
  new validator. Validation runs over the **entire** dataset (`allCsvData`), not
  the filtered/visible view, so the gate reflects the whole file.
- **E006 wiring:** `validateRow`'s E006 (svgCode-on-floor) relies on an SVG
  shelf cache. The CSV Editor already loads `svgShelfIdsByFloor` for the
  Broken-refs filter; the implementation must ensure E006 evaluates against
  those sets (populate the cache the validator reads, or route E006 through the
  already-loaded sets). E006 must stay lenient while the SVG sets are still
  loading (no false positives on page load), consistent with current behavior.
- **Live, inline feedback:** when a cell is edited or a row added, re-validate
  the affected row(s). A cell with a blocking **error** is marked red with the
  specific plain-language reason available on hover (title/tooltip or inline
  text). A **warning** is marked yellow and does **not** block.
- **Save gate:** a live indicator near Save shows `✓ No problems` or
  `⚠ N problems must be fixed before saving`. Save is disabled (and, if invoked,
  short-circuits before any network call) while ≥1 blocking error exists in the
  file. Activating the indicator filters the grid to the problem rows, reusing
  the existing Broken-refs filter machinery (extended from "broken refs" to "all
  blocking problems"). Warnings never gate.
- **Empty/partial rows (closes #84 at source for this editor):** a blank added
  row fails E001 (empty required) and therefore blocks the save until filled or
  removed; provide a one-click remove on each row.
- **Server-error backstop (closes #134 for this editor):** if a save still
  returns a non-2xx with a specific error body, surface that message (parsed
  from the response `error` key) instead of the generic toast.

### B. Table UX

- **Bounded scroll viewport:** the table container gets a fixed/max height sized
  to the space under the toolbar (reuse the viewport-fitting pattern already used
  by `fitMapEditorViewport` in `map-editor.js`), with `overflow: auto` on both
  axes. This is the root fix — it gives the header a real scroll context and
  brings the horizontal scrollbar on-screen.
- **Frozen header:** `thead` sticky to the top of the viewport (works once the
  container is the scroll context).
- **Frozen left anchor column:** a pinned identity column (row # · svgCode),
  sticky to the inline-start edge; the top-left corner cell is sticky on both
  axes. Bidi-correct: pins to the **start** side — left in LTR (English), right
  in RTL (Hebrew). Use logical/`dir`-aware CSS (see `bidi-engineering` guidance;
  cf. the orphan-panel RTL lesson — physical offsets are a known footgun here).
- **Always-visible horizontal scrollbar:** a consequence of the bounded
  viewport; no separate mechanism.

### C. Scope boundaries (YAGNI)

- **In:** `admin/components/csv-editor.js` + wiring to existing
  `admin/services/data-model.js`; CSS for the grid.
- **Out (deliberately):** the Map Editor and Location Editor; the
  "deprecate Location Editor / which editor per role" architecture question
  (#83); the Map Editor's copy of the #134 generic-error bug; the grid paradigm
  itself (stays an inline grid, just made usable); any one-time prod CSV cleanup
  (file already clean).
- **One revertable unit, one area** (HR6). Filed as a **new issue** cross-linking
  #134, #84, #87.

## Acceptance Criteria (plain-language, Given/When/Then)

Validation / save gate (unit-testable):

- **AC1 — Error blocks save.** *Given* the editor holds a file with at least one
  blocking error (empty required field, floor ∉ {0,1,2}, start>end, prefix
  mismatch, duplicate row, or svgCode not on its floor), *When* the user saves,
  *Then* no network PUT is made and the user is told problems must be fixed.
- **AC2 — Warnings-only saves.** *Given* a file whose only issues are warnings
  (overlap, unusual svgCode, empty description) and zero blocking errors, *When*
  the user saves, *Then* the save proceeds (PUT happens).
- **AC3 — Specific reason shown inline.** *Given* a cell with a blocking error,
  *When* the grid renders, *Then* that cell is marked as an error and its
  specific plain-language reason is available (e.g. on hover).
- **AC4 — Live problem count + jump.** *Given* a file with N blocking-error rows,
  *Then* the editor shows "N problems…" and Save is disabled; activating the
  indicator filters to those rows; *When* N becomes 0, *Then* Save is enabled and
  the indicator shows no problems.
- **AC5 — Empty added row blocks + removable.** *Given* a freshly added blank
  row, *When* the user saves without filling required fields, *Then* the save is
  blocked, and the row can be removed in one click.
- **AC6 — Server reason surfaced (backstop).** *Given* the server rejects a save
  with a specific error body, *When* the response returns, *Then* the editor
  shows that server message, not the generic "Failed to save".

Table UX (real-browser / Playwright, LTR + RTL):

- **AC7 — Header freezes.** *Given* a tall table scrolled vertically inside its
  viewport, *Then* the header row stays visible at the top of the table viewport
  (not hidden under the page nav).
- **AC8 — Anchor column freezes.** *Given* a wide table scrolled horizontally,
  *Then* the left anchor column (row # · svgCode) stays visible.
- **AC9 — Scrollbar on screen.** *Given* a wide table, *Then* the horizontal
  scrollbar is within the visible viewport without scrolling past all rows.
- **AC10 — RTL parity.** *Given* the app in Hebrew (RTL), *Then* AC7–AC9 hold,
  with the anchor column pinned to the inline-start (right) edge.

## Testing strategy

- **Unit (admin jest, jsdom):** AC1–AC6. Drive the save path with crafted
  `csvData`/`allCsvData`; assert the network PUT is/ isn't attempted, the
  problem count, inline error marking, empty-row block, and server-message
  surfacing (mock a 422 with an `error` body). Each AC maps to a test observed
  red→green (HR3).
- **e2e (Playwright, real Chromium):** AC7–AC10 in **both** LTR and RTL — layout
  and RTL freezing don't reproduce in jsdom (verify-UI-in-real-Chromium rule).
  Run against a repo-root static server per the project e2e note.

## Related issues

- **#134** — generic save-error toast hides server reason (this closes the CSV
  Editor half; the Map Editor half stays open).
- **#84** — empty/partial rows in mapping.csv (this closes the at-source CSV
  Editor path; one-time cleanup N/A — file already clean).
- **#87** — sub-range overlaps flagged as conflicts (informs the "overlaps warn,
  don't block" decision).
- **#83** — nav reorder + role-scope / Location Editor deprecation (the parked
  architecture decision; explicitly out of scope here).

## Open questions

None blocking. Minor implementation choice deferred to the plan: exact rendering
of the inline reason (native `title` tooltip vs. a small inline message row) and
the anchor column's exact contents (row # · svgCode confirmed; whether to also
show collection is a plan-time detail).
