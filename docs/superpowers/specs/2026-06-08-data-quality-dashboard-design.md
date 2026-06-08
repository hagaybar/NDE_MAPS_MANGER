# Data Quality Dashboard — design & phased plan (2026-06-08)

**Goal:** make the Data Quality report **trustworthy → triage-able → clear**. It's the
librarian's safety net for catching bad shelf data before patrons hit it; today it
can hide real problems, contradict itself across formats, and lump everything into
one undifferentiated "warnings" pile.

Covers issues **#156, #157** (Phase 1), **#105** (Phase 2), **#158** (Phase 3).
All work is **client-only** (dashboard UI + Excel/Print export) — no Lambda/AWS/Cognito.
Each phase is an independent PR + SPA redeploy, built TDD; you can stop after any phase.

**Locked decisions (this session):**
- Scope = all three phases, shipped phase-by-phase.
- #156 = minimal fix (stop hiding overlaps; keep the current hub grouping).
- A broken shelf-code (svgCode not found on its floor) = **Error**, consistently.

**Open defaults (proposed; tweak during review or per phase):**
- **Row-number convention (#157):** use the **spreadsheet/CSV line number** everywhere
  (header = row 1, first data row = row 2). This is what Excel already uses and matches
  a spreadsheet. ⚠️ Visible change: on-screen overlap rows currently show a number one
  lower; they'll shift up by one to agree with Excel/Print.
- **"ROOT CAUSE" wording (#158):** replace with neutral, task-oriented copy —
  proposed *"Widest overlapping range — start here."*
- **Catch-all detection (#158):** treat a range that overlaps (almost) every other shelf
  as an intentional catch-all and frame it as "review the specific shelves below."

---

## Phase 1 — Trustworthy (fix the lies) · #156 + #157

**Why first:** until the report shows *every* overlap and says the *same thing*
everywhere, it can't be trusted as complete — a librarian could fix everything listed
and still have overlaps, or fail to tell that "Row 3" on screen is "Row 4" in Excel.

### What changes (plain language)
- **Nothing overlapping is hidden anymore.** When two *wide* ranges overlap each other
  (both are "hubs"), that overlap is currently dropped from every list. A triangle of
  three wide ranges shows three cards each saying "affects 2" with **empty** lists — the
  three real overlaps invisible. Add a clearly-labelled **"These wide ranges also overlap
  each other"** section so every overlap appears exactly once, with a jump-to-row on each
  side.
- **Screen, Excel, and Print agree.** The same problem shows the **same row number and
  the same count** in all three, and Print carries the same detail as Excel (today Print
  is just the screen DOM, so it inherits the screen's numbers and drops detail).

### Acceptance criteria
- *Every* overlapping pair the system finds appears somewhere in the report (cluster child,
  "other overlaps", or the new "wide ranges" section) — never nowhere.
- A 3-way (triangle) overlap of wide ranges shows all three overlaps, not empty cards.
- The same row reads the same number on screen, in the downloaded Excel, and in Print.
- Print from any view includes the same overlap detail as the Excel export.

### Approach (technical, underneath)
- In `overlap-clusters.js` `buildOverlapClusters`, add a `hubConflicts` bucket = pairs
  where *both* endpoints are hubs (currently excluded by `!hubSet.has(i)` and the
  both-hub `otherOverlaps` filter). Add a **coverage-invariant test**: every pair from
  `findOverlappingRanges` lands in exactly one of {cluster child, otherOverlaps,
  hubConflicts}.
- Compute **display-ready fields once** in/beside `buildOverlapClusters` — one canonical
  row number (spreadsheet line number), an `affectsShown` count, pre-formatted messages —
  and have the screen renderer, `report-export.js` (Excel), and `handlePrintReport` all
  read them verbatim. Rebaseline `overlap-clusters.test.js`, `errors-dashboard-overlaps.test.js`,
  `report-export.test.js`.
- Builds on #154 (already aligned screen "affects N" with rows shown).

### Effort: medium. Risk: low (additive bucket + a single source of truth; well-tested).

---

## Phase 2 — Triage-able (make it useful) · #105

**Why second:** once the report is honest, make it *workable* — let a librarian sort the
pile by problem type instead of scrolling one big "warnings" list (today ≈all 61 warnings
are overlaps; several categories are permanently empty; you can't filter).

### What changes (plain language)
- **A real count per problem type** (overlaps · broken shelf-codes · duplicates ·
  start-after-end / prefix mismatch · missing required fields · invalid floor · …), and
  those counts **add up to the headline totals**.
- **Filter to one type** — "show me only the broken shelf-codes," etc.
- **No dead categories** — types that never occur are hidden (the #73 "hide zero-count"
  pattern), so an empty section isn't mistaken for "all clear."
- **Consistent severity** — a broken shelf-code is an **Error** both where it's detected
  and where it's shown (today it's emitted as a warning but displayed as an error).

### Acceptance criteria
- Per-type counts are shown and **sum to the totals**.
- Selecting a type filters the issue list to just that type.
- Zero-count types are hidden.
- Every finding's severity matches between detection and display (broken shelf-code = Error).

### Approach (technical, underneath)
- Enumerate the finding codes `validateRow` actually emits; build per-type counts from them.
- Reconcile `CATEGORY_META` with reality: drop or correctly populate the dead
  `description`/`format` categories; fix the `svgCode` severity mismatch (→ Error).
- Add a type filter to the issue list. Tests: count-reconciliation, filter behaviour,
  severity consistency.
- Bonus: per-type filtering is the core lever for the future range audit (classify
  true/false positives by call-number type).

### Effort: medium. Risk: low–medium (touches the summary + list + a severity decision).

---

## Phase 3 — Clearer (polish + wording) · #158

**Why last:** pure UX/wording on top of a now-correct report — decisions, not correctness.

### What changes (plain language)
- **Affected rows show expanded by default** (today they're hidden behind a ▸ toggle on
  first open; Print already force-expands them — a tell that collapsed is the wrong default).
  Keep the toggle to collapse finished clusters.
- **Stop calling the widest range the "ROOT CAUSE."** Overlap is mutual, so labelling one
  side the culprit pushes librarians to edit the wrong row. Reword to neutral, task-oriented
  copy (*"Widest overlapping range — start here"*), in the established librarian voice (#73).
- **Handle the 000–999 "catch-all."** A catch-all row overlaps every shelf, so it's always
  the top "hub" and its "Fix range" points at the row the librarian must *not* edit. Detect
  it and frame it as "this catch-all is usually intentional — review the specific shelves
  below," with the per-shelf rows as the primary things to click. (The broader product
  decision about catch-all behaviour lives in #12; here it's only the dashboard framing.)

### Acceptance criteria
- Affected rows are visible without clicking on first open.
- No "root cause / culprit" wording; copy is neutral and task-oriented.
- A catch-all hub is labelled as likely-intentional, with the specific shelves as the
  primary navigable items.

### Approach (technical, underneath)
- Flip the collapsed default (one-line **HR2 spec dispute** on the existing
  "collapsed by default" assertion in `errors-dashboard-overlaps.test.js`).
- Swap the hub label string (i18n en/he). Add a near-full-span / `degree == N-1` detection
  to switch the catch-all framing.

### Effort: small–medium. Risk: low (UX + wording + one detection rule).

---

## Sequencing & delivery
1. **Phase 1** (#156 + #157) — one PR, TDD, SPA redeploy. Closes #156, #157.
2. **Phase 2** (#105) — one PR, TDD, SPA redeploy. Closes #105.
3. **Phase 3** (#158) — one PR, TDD, SPA redeploy. Closes #158.

Each phase is independently shippable and reversible (feature branch + redeploy). When a
phase is greenlit, generate a task-by-task implementation plan for it (writing-plans /
babysitter) and execute with the usual red→green + live-verify discipline.
