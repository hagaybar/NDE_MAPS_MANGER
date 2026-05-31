# Batching plan — open issues

> **Decision recorded 2026-05-31.** The owner reviewed the three batching options
> originally proposed here (by `area:`, by coupling, by `priority:`) and
> **selected Option B — by coupling**. The other two options have been removed to
> keep a single unambiguous plan. **The active first batch is [B1](#b1--active-first-batch).**
> Selection happens per [`WORKFLOW.md`](../WORKFLOW.md) step 3; this document is
> now the working batch plan, not a menu.

- **chosen axis:** coupling (issues that must move together)
- **active batch:** B1 (Map-Editor drawer/shelf-state + side-panel redesign)
- **openIssueCount at decision time:** 37
- **conforms to:** the `batchingProposal` shape in
  [`workflow.schema.json`](../workflow.schema.json) (Option B is the retained `batchOption`)

---

## Issue inventory (the 37 in scope at decision time)

| # | Title | type | area(s) | priority |
|---|-------|------|---------|----------|
| 97 | Map Editor side-panel layout — unify drawer/orphan/reassign into one 4-mode panel | enhancement | map-editor | high |
| 96 | i18n/BiDi defects in admin: validation-panel key drift, hardcoded English, svgCode bidi | bug | validation | medium |
| 95 | CSV-parser parity rule has no client-side guarding test; admin parseCSVLine unexported | tech-debt | testing | low |
| 94 | getVersion versionId validator rejects email-named versions putCsv writes | bug | validation | medium |
| 93 | CSV editor orphan deep-link: applyUrlFilter collapses distinct rows → save/delete corruption | bug | csv-editor | medium |
| 92 | shelf-state move()/delete() drop an unsaved added range (#81-class path the fix missed) | bug | map-editor | medium |
| 91 | Map Editor loadMappingCsv() fetches mapping.csv without cache:'no-cache' | bug | map-editor | medium |
| 90 | Lambda JWT verification omits token_use and audience/client_id checks | bug | auth | high |
| 89 | promoteStaging publishes CSV + floor SVGs non-atomically | bug | integrations | high |
| 88 | Empty floor column: producer→0, consumer→2 — silent highlight failure (cross-repo) | bug | integrations | high |
| 87 | Map Editor: same-shelf, same-collection sub-range flagged as a conflict | bug | map-editor, validation | low |
| 86 | Map Editor: range inputs lose focus on every keystroke + saved ranges vanish from drawer | bug | map-editor | high |
| 85 | Wrong-file guard: warn when a replaced map differs drastically from the current one | enhancement | validation | medium |
| 84 | CSV sanitation: remove empty/partial rows from mapping.csv | bug | csv-editor, validation | medium |
| 83 | Nav tabs: reorder + role-scope per admin/editor (suppress, don't remove) | enhancement | — | medium |
| 78 | App-wide: rewrite all user-facing text to plain, librarian-friendly language | enhancement | — | medium |
| 75 | Re-verify the #50 /maps/mapping.csv 403-spam fix in production (PR #74) | — | map-editor | low |
| 72 | Staging actions lack in-flight feedback (Validate, reconcile open + Apply) | enhancement | validation | medium |
| 71 | Phase 4 (meta) — Reconcile wizard redesign: shelf-centric, non-destructive (#57 + #59) | enhancement | — | medium |
| 65 | CloudFront /maps/* versioned ?v= cache-busting — deferred (Free plan blocks it) | — | — | — |
| 64 | Session handoff (2026-05-20) — Phase 1 awaits manual UI verification + merge | investigation | — | medium |
| 63 | Security audit: sensitive data leaks to terminal or files | — | — | — |
| 59 | Reconcile wizard: Delete loses CSV row metadata; Rename targets limited to existing orphans | bug | csv-editor, validation | medium |
| 55 | CSV restore bypasses bundle invariant check; can produce invalid state | bug | validation | medium |
| 54 | API route smoke tests do not validate the authenticated path | tech-debt | testing | medium |
| 52 | promoteStaging does not stamp lastPromotedAt in staging .meta.json | tech-debt | — | low |
| 49 | Plan B kickoff — SoT staging flow / Stage 4 cutover | enhancement (legacy) | — | — |
| 43 | listSvg Lambda: cold-start returns 502 + missing CORS headers on first request | bug (legacy) | — | — |
| 38 | Single source of truth: CSV vs MAP — architecture brainstorm | — | — | — |
| 37 | Ranges Editor: no-scroll layout + zoom box + collection-view + rename (brainstorm) | — | — | — |
| 27 | Admin tech-debt: standardize / remove ?v=N query-string suffix on module imports | tech-debt | map-editor, csv-editor, validation, auth | low |
| 14 | Map Editor: tighten CSV validation — every row svgCode must resolve to a shelf on its floor | enhancement | map-editor, csv-editor, validation | high |
| 12 | Map Editor: define product behavior for catch-all 000–999 collections (CP) | design-decision | map-editor | medium |
| 9 | Pre-existing jest failures: data-model + validation + user-menu + edit-user-dialog (14 tests) | tech-debt | testing | low |
| 8 | Sub-project C: Weekly Alma collection-name validation against admin CSV | enhancement | validation, integrations | medium |
| 7 | Sub-project B: Admin-triggered password reset sends 10+ emails; flow doesn't complete | bug | auth | high |

---

## Chosen plan — Option B (by coupling)

Axis: **coupling**. Issues that **must move together** (a fix and the issue it
references, or several issues editing the same code path where changing one would
break another's test) are kept in one batch. Issues with no hard coupling ship
alone (B-IND).

Each batch lists: **member issues**, **rationale**, **blast radius**
(low/med/high), and **owner-can-eyeball?** (y/n).

### B1 — ACTIVE (first batch)
**Map-Editor drawer/shelf-state + side-panel redesign**
- **Members:** 97, 86, 92, 91, 87
- **Blast radius:** high · **Owner-can-eyeball?:** **y**
- **Rationale:** #97 explicitly *rewrites the exact code* the bug cluster lives in
  and folds the orphan/reassign surfaces into one panel; 86/92 are `shelf-state.js`
  merge-semantics bugs, 91 is the same file's CSV load, 87 is conflict-detection
  in the same editor (verified already-correct → verify-and-close). Sequencing them
  apart causes rework, so they move together.
- **Spec:** `docs/superpowers/specs/2026-05-31-map-editor-side-panel-layout-design.md`
  · **Plan:** `docs/superpowers/plans/2026-05-31-map-editor-side-panel-layout.md`

### B2 — Reconcile 4c + CSV-row metadata
- **Members:** 71, 59 · **Blast:** med · **Eyeball?:** y
- #71's checklist item *4c "Closes #59"* — the soft-unlink/reassign work and the
  "Delete loses row metadata / Rename limited" bug are the same deliverable.

### B3 — Bundle-invariant integrity
- **Members:** 14, 55, 84, 12 · **Blast:** high · **Eyeball?:** partial
- All hinge on the shared bundle/validation rule (`validateBundle.mjs` /
  `bundle-validator.js`): tighten save-time validation (14), close the restore
  bypass (55), define+remove empty rows (84), decide catch-all 000–999 semantics
  (12). Changing the rule in one moves the others' tests.

### B4 — promoteStaging publish path
- **Members:** 89, 52 · **Blast:** high · **Eyeball?:** n
- Both edit the `promoteStaging` Lambda's publish step; an atomicity rewrite (89)
  and the `lastPromotedAt` stamp (52) should land in one pass, not two rewrites of
  the same function.

### B5 — Cache-busting / versioning thread
- **Members:** 65, 27, 75 · **Blast:** med · **Eyeball?:** partial
- One decision: adopting versioned `?v=` (65) determines what the `?v=N` suffix
  cleanup (27) standardizes and whether the #50 403-spam re-verify (75) still holds.

### B6 — i18n / plain-language strings
- **Members:** 96, 78 · **Blast:** med · **Eyeball?:** y
- Both rewrite the same i18n JSON + fallbacks (key-drift/BiDi fixes 96, plain-language
  pass 78); done apart they edit the same strings twice and conflict.

### B-IND — Independent (no hard coupling; each ships alone)
- **Members:** 90, 7, 93, 94, 98, 85, 72, 83, 88, 8, 54, 95, 9, 43, 63, 64, 49, 38, 37
- **Blast/Eyeball:** vary per issue. Under the coupling axis each is its own
  1-issue batch (e.g. 93 csv low-eyeball-y; 90/7 auth high-eyeball-partial; 88
  integrations high-eyeball-n). Prioritize individually when B1–B6 are clear.

---

## Sequencing note

B1 is first by owner decision (highest user pain — the add/edit-range flow is
currently unusable — and the most eyeball-able). Within B1, the spec phases the
delivery as: #91 → #92 → #86 (on the current drawer) → #87 (verify-and-close) →
the layout move (last, the only PR needing visual rebaselining). Subsequent batch
order across B2–B6 + B-IND is revisited after B1 ships.
