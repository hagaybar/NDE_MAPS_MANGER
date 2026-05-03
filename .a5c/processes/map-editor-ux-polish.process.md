# Map Editor UX Polish — Process Definition

## Overview

Three-phase initiative that resolves all six open Map Editor issues (#1 through #6) on a dedicated branch with a 100% quality gate, including human-approved visual-regression baselines.

This process is the executable counterpart of the design spec at `docs/superpowers/specs/2026-05-03-map-editor-ux-polish-design.md`. The spec is authoritative for *what* changes; this document is authoritative for *how* the babysitter run executes them.

## Inputs

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectRoot` | string | yes | `/home/hagaybar/projects/primo_maps` | Absolute path to the repo |
| `specPath` | string | yes | `docs/superpowers/specs/2026-05-03-map-editor-ux-polish-design.md` | Spec doc, relative to projectRoot |
| `brainstormScreenDir` | string | yes | — | Where approval-gate HTML fragments are written |
| `brainstormStateDir` | string | yes | — | Where the visual companion writes events JSONL |
| `brainstormUrl` | string | no | `http://localhost:60845` | URL the user opens to view approval prompts |
| `branchName` | string | no | `feat/map-editor-ux-polish` | Working branch |
| `preFeatureTag` | string | no | `pre-map-editor-ux-polish` | Rollback tag on `main` at branch cut |
| `startPhase` | number | no | `0` | Resume entry point (0 = branch setup, 1 = phase 1, etc.) |

## Outputs

| Field | Type | Description |
|---|---|---|
| `success` | boolean | Whether the run completed all phases + verification |
| `commits` | string[] | All commits the run produced on the branch |
| `baselinesApproved` | number | Total approved snapshot baselines (expected: 18) |
| `baselineApprovalsLog` | object[] | Audit trail of which baselines were approved per phase |
| `prUrl` | string | Optional — set if user chose "Open PR now" at the final gate |

## Phases

### Phase 0 — Branch and tag setup

| Task | Kind | What it does |
|---|---|---|
| `branchSetupTask` | agent | Verifies clean tree on main; creates pre-feature tag; cuts working branch. Idempotent — re-runs do not move existing tags or recreate the branch. |

No quality gate; no baselines.

### Phase 1 — Delete multi-shelf batch-editing (closes #3)

Pure deletion. Spec §5 enumerates the file list.

| Task | Kind | What it does |
|---|---|---|
| `phase1DeleteMultiShelfTask` | agent | Performs all 9 deletions/modifications and the single commit `refactor(map-editor): remove multi-shelf batch-editing (closes #3)` |
| `phase1QualityGateTask` | agent | (1) `grep -r` against four absent symbols returns zero matches; (2) Jest passes; (3) Playwright passes (113 existing tests); (4) console clean smoke-test |

If the gate fails, one refinement pass: re-invoke the implementation task with the failure feedback, then re-run the gate. Second failure terminates the run.

**No baseline-approval gate** — single-shelf flows are visually unchanged.

### Phase 2 — SVG alignment diagnosis + fix (closes #2)

Diagnostic-first.

| Task | Kind | What it does |
|---|---|---|
| `phase2DiagnoseTask` | agent | Probes three suspected causes (CSS bleed → hatch-defs collision → container scaling) in priority order. Each probe is reversible — diagnostic leaves the working tree clean. Returns the identified cause or `null`. |
| `phase2FixTask` | agent | Applies the permanent fix for the identified cause. Spec §6.1 maps cause → fix. Single commit `fix(map-editor): SVG text alignment in editor canvas (closes #2)` with the cause noted in the commit body. |
| `phase2QualityGateTask` | agent | Generates phase-2 snapshots (LTR + RTL aligned-canvas), verifies alignment vs CloudFront standalone, runs full E2E, console clean, unit tests. |
| `phase2BaselineApprovalGateTask` | agent | Posts 2 baseline PNGs to the brainstorm visual companion server. Polls `$STATE_DIR/events`. Returns `allApproved` + per-baseline reasons. |
| `phase2BaselineCommitTask` | agent (acts as shell wrapper) | Stages and commits the approved baselines: `test(map-editor): lock approved baselines for phase 2`. |

If diagnosis returns `null`, the run hits an explicit `ctx.breakpoint` asking the user how to proceed (manual fix + resume / retry probes / abort phase 2). If a baseline is rejected, `runBaselineApprovalLoop` triggers `phase2FixTask` with rejection feedback and re-runs the gate, up to 3 attempts.

### Phase 3 — Polish (closes #1, #4, #5, #6)

Composite phase. Three commits.

| Task | Kind | What it does |
|---|---|---|
| `phase3DesignTokensTask` | agent | Applies principles from `ui-design:spacing-system`, `ui-design:visual-hierarchy`, `ui-design:layout-grid`. Produces `admin/styles/design-tokens.css` (token values match spec §7.1 exactly). Modifies `admin/index.html` to link tokens before `app.css`. Commit: `feat(map-editor): design-tokens addendum for UX polish`. |
| `phase3LayoutFixTask` | agent | Issue #1: drawer-vs-canvas flex layout. Drops `position: fixed`. Adds new behavior assertion (drawer never overlaps canvas). Commit: `feat(map-editor): drawer no longer overlays canvas (closes #1)`. |
| `phase3DrawerPolishTask` | agent | Issues #4 + #5 + #6 in one commit: row spacing, input affordances, close button + Esc handler. New i18n keys (`mapEditor.close`, `mapEditor.unsavedChangesConfirm`). New unit test for the Esc-with-pending-edits branch. Four new behavior assertions in `e2e/tests/map-editor-ux.spec.ts`. Commit: `feat(map-editor): drawer close affordance + row polish (closes #4 #5 #6)`. |
| `phase3QualityGateTask` | agent | Configures Playwright projects (`en-admin`, `he-admin`, `en-editor`, `he-editor`). Runs the snapshot suite (16 PNGs across 4 states × 4 projects). Behavior assertions, full E2E (default project), console clean, unit tests. |
| `phase3ResponsiveAuditTask` | skill | Invokes `ui-design:responsive-audit` at viewport widths 1280, 1024, 768. Fails the gate on any new overflow / clipping. |
| `phase3BaselineApprovalGateTask` | agent | Posts 16 baseline PNGs (grouped by snapshot state) to brainstorm visual companion. Polls `$STATE_DIR/events` with 60-min timeout. |
| `phase3RefineTask` | agent | On rejection, addresses the rejection feedback per baseline. Targeted edits only — no refactoring. |
| `phase3BaselineCommitTask` | agent | Stages and commits the 16 approved baselines: `test(map-editor): lock approved baselines for phase 3 (16 snapshots × locale × role)`. |

Approval loop runs up to 3 attempts. If all 3 attempts have any rejection, run terminates with `failureReason` containing the unresolved feedback.

### Final — Verification + PR

| Task | Kind | What it does |
|---|---|---|
| `finalVerificationTask` | agent | Branch on `feat/map-editor-ux-polish`; pre-feature tag exists; all unit + E2E tests pass; working tree clean; spec-coverage cross-check against §12 done criteria; commit count ≤ 7 source + ≤ 2 baseline-lock; baseline-approval audit complete. |
| `openPullRequestTask` | agent | Pushes branch; opens PR via `gh pr create` with HEREDOC body listing closed issues, quality-gate items, baseline-approval audit. Captures PR URL. |

A breakpoint precedes `openPullRequestTask` to confirm the user wants to push + open PR now (or skip to do it manually).

## Quality Gate Items (per spec §8)

The gate evaluates **all 7** of these every phase that has source changes:

1. All 113 existing Playwright E2E tests pass.
2. New behavior assertions for #3 deletion-grep and #6 close/Esc pass.
3. Visual snapshots match approved baselines (or are generated and approved at this phase's gate).
4. Snapshots cover EN-LTR + HE-RTL (2 of the 4 projects).
5. Snapshots cover admin + editor roles (2 of the 4 projects).
6. Existing Jest unit tests pass + new `map-editor-esc.test.js` passes.
7. Console clean: no `console.error` / `console.warn` during any test.

## Breakpoints

The user profile sets `breakpointTolerance.global = 'minimal'`. This process accordingly limits breakpoints to:

- **Phase 2 diagnosis inconclusive** — explicit `ctx.breakpoint` to choose between manual fix, retry, or abort.
- **Phase 2 baseline approval** — embedded in the approval-gate task (visual companion + events polling).
- **Phase 3 baseline approval** — embedded in the approval-gate task (visual companion + events polling).
- **PR-open** — explicit `ctx.breakpoint` before pushing + opening PR (external mutation; matches `alwaysBreakOn: ['destructive-git', 'deploy']` policy).

There are no breakpoints between phases when no baseline approval is needed (Phase 0 → Phase 1, Phase 1 → Phase 2). The run flows through.

## Visual Companion Integration

The approval-gate tasks reuse the brainstorm visual companion server already running at `http://localhost:60845`. The contract:

| Direction | Mechanism |
|---|---|
| Babysitter → Browser | Write a content fragment to `${brainstormScreenDir}/<phase>-approval.html`. Server auto-serves the newest file. PNGs are base64-embedded inline. |
| Browser → Babysitter | User clicks `data-choice` options. Server records each click as a JSONL event in `${brainstormStateDir}/events`. |
| Polling | Approval-gate task re-reads the events file periodically until every baseline has at least one approve and zero rejects, OR until any baseline gets a reject (which triggers refine). |
| Out-of-band overrides | Terminal text (e.g., "approve all") is read alongside events; it can override the click pattern. |

If the server is not alive (`server-info` missing or `server-stopped` present), the approval-gate task fails fast with reason `brainstorm-server-down` so the orchestrator can prompt the user to restart it before resuming.

## Resume Semantics

The run is resumable via `babysitter:resume`. State persists in `.a5c/runs/<runId>/`. To resume past a specific phase, pass `startPhase` in the inputs:

- `startPhase: 0` (default) — full run from branch setup.
- `startPhase: 1` — skip branch setup; pick up at phase 1.
- `startPhase: 2` — skip phases 0–1; pick up at phase 2 diagnosis.
- `startPhase: 3` — skip phases 0–2; pick up at phase 3 design tokens.

Phase tasks are individually idempotent (e.g., `branchSetupTask` does not recreate an existing branch or move an existing tag), but skipping a phase does not skip its commits — those persist on the branch.

## Failure Modes

| Failure | Behavior |
|---|---|
| Phase 1 quality gate fails | One refinement pass with feedback. Second failure terminates the run. |
| Phase 2 diagnosis returns `null` after 2 attempts | Explicit breakpoint prompts the user; if they choose "abort phase 2", run continues to phase 3 with #2 unresolved. |
| Phase 2 fix fails | Run terminates immediately. No retry — the fix has a definite cause; if it doesn't apply cleanly the diagnostic was wrong. |
| Phase 3 baseline rejection persists across 3 attempts | Run terminates with rejection feedback; user resumes after manual investigation. |
| Brainstorm server down at approval-gate time | Approval-gate task fails fast; user restarts server and resumes. |
| Final verification fails | Run terminates; user investigates and resumes from final stage. |
| PR-open user choice "Skip" | Run completes successfully; user opens PR manually. |

## Process Library References

- `editor-ui-redesign.{js,process.md,diagram.md}` — multi-phase, breakpoint-per-phase pattern.
- `map-editor.{js,process.md,diagram.md}` — task-by-task plan execution with retry pass and final verification gate.
- Specializations consulted: `ux-ui-design`, `web-development`.
- Skills referenced in the process: `frontend-design`, `e2e-testing`, `spacing-system`, `visual-hierarchy`, `layout-grid`, `responsive-audit`.

## Estimated Duration

Rough budget per phase (assuming healthy LLM throughput, no major rework):

| Phase | Implementation | Quality gate | Approval | Total |
|---|---|---|---|---|
| 0 | ~2 min | — | — | ~2 min |
| 1 | ~10 min | ~3 min | — | ~15 min |
| 2 | ~15 min (diagnose) + ~5 min (fix) | ~3 min | up to 30 min (human) | ~55 min |
| 3 | ~25 min (3 commits) | ~5 min (4 projects × snapshots) | up to 60 min (16 baselines, human) | ~90 min |
| Final | ~3 min | — | — | ~3 min |

Total: ~3 hours, dominated by human approval time. Pure automation: ~75 min.
