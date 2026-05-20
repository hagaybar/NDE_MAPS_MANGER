# 2026-05-19 — Plan B follow-up: Phased UX redesign

## Context

Plan B (SoT staging flow) shipped 2026-05-18 and was deployed to production. Manual QA on 2026-05-19 surfaced 11 issues (#43 plus #50–#60). The core staging pipeline works end-to-end — upload, validate, promote, CloudFront invalidation — but the user-facing wizard and validate panel expose storage concepts in ways that confuse even the developer, let alone end-user librarians.

After mid-QA reflection, the decision was to **pause QA and fix issues gradually** before resuming. This plan describes that gradual fix as four phases, each ending in a testable state.

## Design philosophy

**The storage architecture is sound.** SVG (geometry, editable in Inkscape) + CSV (library metadata, editable as a spreadsheet) + bundle invariant (`every CSV svgCode resolves to an SVG shelf id`) is a reasonable split that justifies two best-of-class editors. The reverse direction (SVG shelves without CSV) is and should remain informational.

**The UI is the problem.** The validate panel and reconcile wizard ask the user to reason in storage terms (`addedShelves`, `removedRefs`, "reconcile map", "bundle invariant violation"). This is engineer language. Librarians need to reason in **shelf-centric language**: shelves get renamed, added, removed; library data attaches to shelves.

**Rule**: from this point forward, no user-facing copy mentions "CSV row," "SVG shelf," "bundle invariant," "added shelves," or "removed refs." Speak about *shelves* and *library entries* / *collections*.

**What we do not change in these phases**: SVG file format, CSV file format, the bundle invariant rule, the Lambda set, the CloudFront pipeline, the lock semantics. All of those are working as designed.

## Phase 1 — Foundation fixes

Independent of the mental-model rethink. Prevent fresh data loss; deliver immediate quality-of-life wins.

| Issue | Summary | Surface |
|---|---|---|
| #60 | Promote creates version backups before overwriting | `lambda/promoteStaging.mjs` + retention parity with `putCsv` |
| #58 | Upload progress feedback (button state, spinner, beforeunload guard) | `admin/components/svg-manager.js` replace flow |
| #50 | Map Editor refreshes after promote (custom event + listener) | Cross-component event in `svg-manager.js` + `map-editor/svg-loader.js` |

**Test point at end of Phase 1**: do a small replace+promote in staging; verify (a) a versioned backup of the prior SVG and CSV exist in `versions/`, (b) the upload button disables and shows progress text during the 3 sequential calls, (c) the Map Editor view picks up the new SVG without a manual tab switch.

**Tag before Phase 1**: `pre-phase-1-2026-05-19`. Feature branch `feat/phase-1-foundation-fixes`. Babysitter orchestrates.

## Phase 2 — Validate panel honesty

Replace storage-ese with shelf-centric language. Surface symmetry. No backend logic change beyond a new diff direction.

**Scope**:

- `lambda/validateStaging.mjs` — compute a third metric, `removedShelves` (in production SVG but not in staged SVG), distinct from `removedRefs` (CSV-impact only).
- `lambda/validateStaging.mjs` — split current `addedShelves` into `newlyAddedShelves` (in staged SVG but not in production SVG) and `unmappedShelves` (in SVG but not in CSV — the long-standing orphans).
- Staging panel UI — render three honest sections:
  - **Renamed (when Phase 3 lands)** — deferred to Phase 3.
  - **Newly added shelves** — count + ids, with "needs library data" hint if no metadata exists yet (foreshadows Phase 4's additions flow).
  - **Removed shelves** — count + ids, informational.
  - **Library entries that will be unlinked** — i.e., the current `removedRefs` but renamed for humans.
  - **Pre-existing unmapped shelves** — i.e., the long-standing orphans, surfaced separately so they stop polluting "new" counts.
- Kill the misleading string "no CSV changes needed." Replace with explicit positives like "0 library entries will be unlinked."

Closes #51 and #56.

**Test point at end of Phase 2**: a non-engineer reads the validate panel after a replace and can answer in plain language: *"what changed because of my upload?"* The current panel cannot pass this test.

**Tag**: `pre-phase-2-2026-05-19`. Branch `feat/phase-2-validate-honesty`.

## Phase 3 — Rename detection

The biggest single fix for the confusion that broke today's QA. Auto-detect that `CC_1-4 → CC_X-Y` is a rename (same geometry, different id) and surface it that way instead of as separate add+remove.

**Algorithm**:

1. For each shelf in `removedShelves`, find candidates in `newlyAddedShelves` on the same floor.
2. Score candidates by **geometric similarity**: exact `(x, y, width, height)` match is the strongest signal; small positional drift (within N pixels — N to be chosen, see Open Question below) is a weaker signal; tag name match (`<rect>` ↔ `<rect>`) is required.
3. If exactly one strong-match candidate exists, surface as a confident rename (preselected).
4. If multiple candidates score similarly, surface as ambiguous: show the user the candidates with previews and let them pick.
5. If no candidate matches, surface as a true removal (Phase 4's removal flow handles it).

**Open question — strictness of geometry match**:

- **Strict** (exact `(x, y, width, height)` only): zero false positives, but won't catch renames combined with nudges.
- **Tolerant** (within ~5px or some configurable threshold): catches more renames, introduces a parameter that may need tuning.
- **Heuristic + manual override**: system's best guess is preselected, user can override in the wizard.

**Recommendation**: heuristic + manual override, with exact match as the strong signal and a small tolerance (default ~3px, configurable) for fuzzy matches.

**Scope**:

- `lambda/shared/svg-shelves.mjs` — extend to return geometry per shelf, not just ids (new export, backward-compatible).
- `lambda/validateStaging.mjs` — compute rename pairs from `removedShelves` + `newlyAddedShelves`.
- Validate panel UI — render the renamed pairs distinctly: `CC_1-4 → CC_X-Y (position unchanged)` with confirm/break options.

**Test point at end of Phase 3**: re-run today's core-3 scenario (rename `CC_1-4 → CC_X-Y`). The system auto-detects the rename, surfaces it as a single line, and the user confirms with one click. No dropdown hunting.

**Tag**: `pre-phase-3-2026-05-19`. Branch `feat/phase-3-rename-detection`.

## Phase 4 — Reconcile wizard redesign

Final mental-model fix. Wizard becomes shelf-centric, non-destructive by default.

**New wizard structure** (per change category):

- **Renames** (detected, confident) — show pair, [Confirm] / [Treat as separate add+remove].
- **Renames** (detected, ambiguous) — show old shelf preview, show candidate previews, pick one.
- **Adds** (newly added shelves without library data) — three actions:
  - **Add library entry now** — inline form prefilled with floor + svgCode.
  - **Leave unmapped** — confirm decorative or future-mapping intent.
  - **Remove from SVG** — undo the addition before promote.
- **Removes** (true removals, not part of rename) — preview affected library entries, two actions:
  - **Unlink library entry** — like today's "delete row" but soft: row's metadata is preserved in an "unlinked entries" pool, reassignable later.
  - **Cancel removal** — revert this floor's SVG to production before promote.

**Library-entry pool**:

- New storage convention: `versions/unlinked/<timestamp>_<svgCode>.csv` — single-row CSV files containing the unlinked row.
- CSV editor gets a new filter / panel: *"Unlinked library entries (N)"* — shows the pool, with per-row action *"Reassign to shelf id …"* (validates new id exists in current SVG before saving).
- Survives across promotes; expires after 90 days with a daily cleanup (analogous to Plan B's 7-day staging cleanup).

Closes #57 (additions side coverage), #59 (delete preserves metadata).

**Test point at end of Phase 4**: a fresh librarian (not the developer) walks through a complete edit cycle — rename one shelf, add one new shelf with metadata, remove one shelf — without engineer help, completes the promote, and can re-find the unlinked-then-reassigned shelf in the CSV editor.

**Tag**: `pre-phase-4-2026-05-19`. Branch `feat/phase-4-wizard-redesign`.

## Beyond Phase 4 — not in this plan

These are future drivers that influence later architectural choices but are not part of the current rework:

- **Typed map objects** (printers, study rooms, restrooms in addition to shelves). When this becomes real, the CSV-per-row-with-NULL-able-columns model breaks down. Likely refactor: JSON metadata keyed by SVG id, schema per type. Replaces `mapping.csv`. Bundle invariant generalizes.
- **In-app map editing**. When in-app editing of geometry becomes a real product requirement, the SVG-as-external-file rationale weakens and a unified editor (in-app for routine, Inkscape for major redraws) becomes the workflow. The Phase 4 wizard is the natural foundation for this — it already presents shelves as unified entities.
- **CSV restore + bundle invariant** (#55). Restore Lambda should validate the restored CSV against current SVGs before persisting. Independent of these phases; do it whenever convenient.
- **Smoke tests for API routes** (#54) and **stale Jest mocks** (#53). Test-debt cleanup; should ideally be done before or alongside Phase 1 so future phases land on a more trustworthy test surface.

## Working conventions

- Each phase on its own feature branch from `main`.
- Pre-phase tag (`pre-phase-N-YYYY-MM-DD`) for clean rollback.
- Babysitter orchestrates each phase as a single run with strict-plan agents.
- Each phase ends with a PR to `main`. Merge only after the phase's test point passes.
- No phase mixed with another in the same branch.

## References

- Plan B implementation: `docs/superpowers/plans/2026-05-13-sot-staging-flow.md`
- Plan A foundation: `docs/superpowers/plans/2026-05-13-sot-bundle-invariant-foundation.md`
- Issue tracker (this batch): #50, #51, #52, #56, #57, #58, #59, #60. Adjacent: #43, #53, #54, #55.
- QA session that surfaced these: discussion transcript 2026-05-19; partial state in `/tmp/plan-b-qa-state.json` (preserved).
