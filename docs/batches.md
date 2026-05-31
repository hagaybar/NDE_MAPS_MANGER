# Batching proposal — open issues

> **Analysis only.** This document proposes how the open issues *could* be
> grouped for the resolution loop defined in [`WORKFLOW.md`](../WORKFLOW.md)
> (step 1). It does **not** select a batch, modify/label/close any issue, or
> implement anything. The owner selects at step 3.

- **generatedAt:** 2026-05-31
- **openIssueCount:** 37
- **options:** 3 (A — by `area:` · B — by coupling · C — by `priority:`)
- **conforms to:** the `batchingProposal` shape in
  [`workflow.schema.json`](../workflow.schema.json)

Each batch lists: **name**, **member issues** (number + title), **axis**,
**one-line rationale**, **blast radius** (low/med/high), and
**owner-can-eyeball?** (y/n) — whether the owner can verify it by clicking the
running app.

---

## Issue inventory (the 37 being batched)

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

## Option A — by `area:` label

Axis: **area**. Goal: maximise independent revertability — one bucket per
`area:` label, each its own deployable surface. Issues carrying multiple `area:`
labels are placed in their *primary* surface (cross-listings noted). The
12 issues with **no** `area:` label are grouped by nature (A7–A9) and flagged as
"not classified by the area axis."

| Batch | Member issues | Blast | Eyeball? | One-line rationale |
|-------|---------------|-------|----------|--------------------|
| **A1 — Map Editor** | 97, 92, 91, 87, 86, 75, 14, 12 | high | **y** | All live in the SVG shelf editor; verifiable by opening Map Editor and clicking shelves. (87/14 also touch validation; 14 also csv.) |
| **A2 — Validation** | 98, 96, 94, 85, 72, 55 | med | **y** | Validation panel / Data Quality Dashboard / version-history rules; visible in those screens. |
| **A3 — CSV editor** | 93, 84, 59 | med | **y** | CSV table editor row handling; visible by filtering/saving/deleting rows. (84/59 also touch validation.) |
| **A4 — Auth** | 90, 7 | high | **partial** | Cognito/JWT + password-reset; security-critical and largely invisible — **excluded from pilot per WORKFLOW.md.** |
| **A5 — Integrations** | 89, 88, 8 | high | **n** | Server-side publish atomicity, cross-repo floor default, Alma sync — hard to eyeball — **excluded from pilot.** |
| **A6 — Testing** | 95, 54, 9 | low | **n** | Test-infra only; no user-facing surface, so the running-app oracle does not apply. |
| **A7 — App-wide UX / roles** *(no area label)* | 78, 83 | med | **y** | Cross-cutting copy + nav role-scoping; visible across every screen. |
| **A8 — Meta / brainstorm / handoff** *(no code)* | 71, 64, 49, 38, 37 | n/a | **n** | Trackers and paused brainstorms — not directly resolvable as code; need owner triage/close first. |
| **A9 — Infra / housekeeping** *(no area label)* | 27, 43, 52, 63, 65 | med | **n** | Cache-suffix cleanup, cold-start 502, meta-stamp, security audit, deferred ?v= — infra, not screen-visible. |

---

## Option B — by coupling

Axis: **coupling**. Goal: keep issues that **must move together** in one batch —
a fix and the issue it references, or several issues that edit the same code path
where changing one would break another's test. Issues with no hard coupling ship
alone (B-IND).

| Batch | Member issues | Blast | Eyeball? | One-line rationale |
|-------|---------------|-------|----------|--------------------|
| **B1 — Map-Editor drawer/shelf-state + side-panel redesign** | 97, 86, 92, 91, 87 | high | **y** | #97 explicitly *rewrites the exact code* the bug cluster lives in and folds the orphan/reassign surfaces; 86/92 are `shelf-state.js` merge-semantics bugs, 91 is the same file's CSV load, 87 is conflict-detect in the same editor. Sequencing them apart causes rework. |
| **B2 — Reconcile 4c + CSV-row metadata** | 71, 59 | med | **y** | #71's checklist item *4c "Closes #59"* — the soft-unlink/reassign work and the "Delete loses row metadata / Rename limited" bug are the same deliverable. |
| **B3 — Bundle-invariant integrity** | 14, 55, 84, 12 | high | **partial** | All hinge on the shared bundle/validation rule (`validateBundle.mjs` / `bundle-validator.js`): tighten save-time validation (14), close the restore bypass (55), define+remove empty rows (84), and decide catch-all 000–999 semantics (12). Changing the rule in one moves the others' tests. |
| **B4 — promoteStaging publish path** | 89, 52 | high | **n** | Both edit the `promoteStaging` Lambda's publish step; an atomicity rewrite (89) and the `lastPromotedAt` stamp (52) should land in one pass, not two rewrites of the same function. |
| **B5 — Cache-busting / versioning thread** | 65, 27, 75 | med | **partial** | One decision: adopting versioned `?v=` (65) determines what the `?v=N` suffix cleanup (27) standardizes and whether the #50 403-spam re-verify (75) still holds. Interlocking. |
| **B6 — i18n / plain-language strings** | 96, 78 | med | **y** | Both rewrite the same i18n JSON + fallbacks (key-drift/BiDi fixes 96, plain-language pass 78); done apart they edit the same strings twice and conflict. |
| **B-IND — Independent (no hard coupling; each ships alone)** | 90, 7, 93, 94, 98, 85, 72, 83, 88, 8, 54, 95, 9, 43, 63, 64, 49, 38, 37 | varies | varies | Listed together only because the coupling axis does not cluster them — under this axis each is its own 1-issue batch (blast/eyeball assessed per issue, e.g. 93 csv low-eyeball-y, 90/7 auth high-eyeball-partial, 88 integrations high-eyeball-n). |

---

## Option C — by `priority:` label

Axis: **priority**. Goal: fastest user impact first. Buckets are the raw
`priority:` labels; the owner would still sub-split a large bucket (C2) before
selecting, since priority cuts across areas and coupling.

| Batch | Member issues | Blast | Eyeball? | One-line rationale |
|-------|---------------|-------|----------|--------------------|
| **C1 — priority: high** | 97, 90, 89, 88, 86, 14, 7 | high | **mixed** | Highest user/operational impact, but spans auth (90/7) + integrations (89/88) + editor (97/86/14) — not a single revertable unit; would be split before work. |
| **C2 — priority: medium** | 96, 94, 93, 92, 91, 85, 84, 83, 78, 72, 71, 64, 59, 55, 54, 12, 8 | mixed | **mixed** | 17 issues — too large to ship as one; useful as a priority ranking, not as a batch. |
| **C3 — priority: low** | 98, 95, 87, 75, 52, 27, 9 | low | **mixed** | Polish / nice-to-have; lowest urgency, several are good low-risk warm-ups. |
| **C4 — unprioritized** *(no priority label)* | 65, 63, 49, 43, 38, 37 | n/a | **n** | No `priority:` label — needs owner triage (legacy/meta/brainstorm/infra) before it can be ordered. |

---

## Pilot recommendation

**Pilot = Batch B1 narrowed to #86 + #92** (the Map-Editor range-edit bug pair in
`shelf-state.js`): **small** (2 issues, same module), **maximally eyeball-able**
(owner opens Map Editor, adds a range, types — the inputs keep focus and the
saved range stays in the drawer; the whole AC is visible in seconds), **low blast
radius** (client-only, single module + the drawer render path; no Lambda, auth,
integration, or data-format surface; test-guardable), and **not auth/integrations**.
#86 is `priority: high` and the add-range flow is currently unusable, so the
loop's very first turn delivers real librarian value while stress-testing every
gate. *Caveat to surface at step 3:* #97 plans to rewrite this same code, so if
the owner later picks #97 these fixes may be superseded — fixing them now is still
correct (immediate value) and leaves #97 ready-made red→green regression tests.
