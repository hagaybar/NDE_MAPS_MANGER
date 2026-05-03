# Map Editor UX Polish — Process Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  MAP EDITOR UX POLISH — RUN SHAPE                            │
│              Branch: feat/map-editor-ux-polish (cut from main)               │
│                Tag at cut point: pre-map-editor-ux-polish                    │
│         Spec: docs/superpowers/specs/2026-05-03-map-editor-ux-polish-...     │
└─────────────────────────────────────────────────────────────────────────────┘

╔═════════════════════════════════════════════════════════════════════════════╗
║ PHASE 0: BRANCH SETUP                                                        ║
║ ┌──────────────────────────────────────────────────────────────────────┐    ║
║ │ branchSetupTask  — verify clean tree → tag main → cut working branch │    ║
║ │ idempotent (no recreation if branch/tag already exist)               │    ║
║ └──────────────────────────────────────────────────────────────────────┘    ║
║                                no breakpoint                                 ║
╚═════════════════════════════════╤═══════════════════════════════════════════╝
                                  │
                                  ▼
╔═════════════════════════════════════════════════════════════════════════════╗
║ PHASE 1: DELETE MULTI-SHELF (closes #3)                                      ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────┐    ║
║ │ phase1DeleteMultiShelfTask                                            │    ║
║ │   • Delete distinct-values-widget.js                                  │    ║
║ │   • Strip attachMarquee, onMultiToggle, showMultiShelf, selectMulti   │    ║
║ │   • Remove 4 i18n keys (EN + HE)                                      │    ║
║ │   • Strip multi-mode unit + E2E tests                                 │    ║
║ │   • Move bulk-edit decisions to spec out-of-scope                     │    ║
║ │   COMMIT: refactor(map-editor): remove multi-shelf batch-editing      │    ║
║ │                                                                       │    ║
║ │                              ▼                                        │    ║
║ │ phase1QualityGateTask                                                 │    ║
║ │   • grep absence: zero matches for 4 symbols                          │    ║
║ │   • Jest passes • Playwright passes • Console clean                   │    ║
║ │                                                                       │    ║
║ │   ┌───── on fail ─────┐                                              │    ║
║ │   │ refine once with  │ → re-run gate → still fail = TERMINATE        │    ║
║ │   │ failure feedback  │                                              │    ║
║ │   └───────────────────┘                                              │    ║
║ └──────────────────────────────────────────────────────────────────────┘    ║
║                       no baselines · no breakpoint                          ║
╚═════════════════════════════════╤═══════════════════════════════════════════╝
                                  │
                                  ▼
╔═════════════════════════════════════════════════════════════════════════════╗
║ PHASE 2: SVG ALIGNMENT (closes #2)                                           ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────┐    ║
║ │ phase2DiagnoseTask                                                    │    ║
║ │   Probe in priority order, each reversible (clean tree after each):   │    ║
║ │     a. CSS bleed → :where(rect.map-shelf, path.map-shelf)             │    ║
║ │     b. Hatch-defs collision → move <defs> into loaded SVG             │    ║
║ │     c. Container scaling → set width/height from viewBox              │    ║
║ │   Returns foundCause or null                                          │    ║
║ └──────────────────────┬───────────────────────────────────────────────┘    ║
║                        │                                                    ║
║              ┌─────────┴─────────┐                                          ║
║              │                   │                                          ║
║         null │                   │ found-cause                              ║
║              ▼                   ▼                                          ║
║   ┌──────────────────┐ ┌──────────────────────────────────────────┐         ║
║   │ ⚠ BREAKPOINT     │ │ phase2FixTask                            │         ║
║   │ Diagnosis        │ │   apply permanent fix for cause          │         ║
║   │ inconclusive     │ │ COMMIT: fix(map-editor): SVG text align  │         ║
║   │  • manual+resume │ │                                          │         ║
║   │  • retry probes  │ │   ▼                                      │         ║
║   │  • abort phase 2 │ │ phase2QualityGateTask                    │         ║
║   └──────────────────┘ │   2 baselines (LTR + RTL aligned-canvas) │         ║
║                        │   E2E full · console · unit tests         │         ║
║                        └────────────────┬─────────────────────────┘         ║
║                                         ▼                                    ║
║                        ┌──────────────────────────────────────────┐         ║
║                        │ ⏸  APPROVAL GATE (human)                  │         ║
║                        │ phase2BaselineApprovalGateTask           │         ║
║                        │   • Push 2 PNGs to brainstorm screen     │         ║
║                        │   • Poll $STATE_DIR/events               │         ║
║                        │   • Reject → loop refine + regate (≤3)    │         ║
║                        │   • Approve all → continue                │         ║
║                        └────────────────┬─────────────────────────┘         ║
║                                         ▼                                    ║
║                        ┌──────────────────────────────────────────┐         ║
║                        │ phase2BaselineCommitTask                  │         ║
║                        │ COMMIT: test(map-editor): lock approved    │         ║
║                        │         baselines for phase 2              │         ║
║                        └────────────────┬─────────────────────────┘         ║
╚═════════════════════════════════════════╤═══════════════════════════════════╝
                                          │
                                          ▼
╔═════════════════════════════════════════════════════════════════════════════╗
║ PHASE 3: POLISH (closes #1, #4, #5, #6)                                      ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────┐    ║
║ │ phase3DesignTokensTask  ←  ui-design:spacing-system                   │    ║
║ │                          ←  ui-design:visual-hierarchy                │    ║
║ │                          ←  ui-design:layout-grid                     │    ║
║ │   admin/styles/design-tokens.css (--space-*, --border-*, --bg-*, ...)  │    ║
║ │   admin/index.html links tokens BEFORE app.css                        │    ║
║ │ COMMIT: feat(map-editor): design-tokens addendum for UX polish        │    ║
║ │                                                                       │    ║
║ │                              ▼                                        │    ║
║ │ phase3LayoutFixTask                              (closes #1)          │    ║
║ │   #map-editor-view: flex column · #map-canvas: flex 1 · drawer:       │    ║
║ │   flex-shrink 0 · drop position:fixed                                 │    ║
║ │   New behavior assertion: drawer never overlays canvas                │    ║
║ │ COMMIT: feat(map-editor): drawer no longer overlays canvas            │    ║
║ │                                                                       │    ║
║ │                              ▼                                        │    ║
║ │ phase3DrawerPolishTask                       (closes #4 #5 #6)        │    ║
║ │   #4: row spacing tokens, hover tint, row separator                   │    ║
║ │   #5: input border/bg/focus tokens (locked-row override last)         │    ║
║ │   #6: × close button + Esc handler (with-pending-edits confirm)        │    ║
║ │   New i18n keys: mapEditor.close, mapEditor.unsavedChangesConfirm     │    ║
║ │   New unit test: map-editor-esc.test.js                               │    ║
║ │   4 new E2E behavior assertions                                       │    ║
║ │ COMMIT: feat(map-editor): drawer close affordance + row polish        │    ║
║ │                                                                       │    ║
║ │                              ▼                                        │    ║
║ │ phase3QualityGateTask                                                 │    ║
║ │   16 baselines = 4 states × 4 projects:                               │    ║
║ │     drawer-closed                                                     │    ║
║ │     drawer-open-single-shelf                                          │    ║
║ │     drawer-open-input-focused                                         │    ║
║ │     drawer-open-locked-row                                            │    ║
║ │   Projects: en-admin · he-admin · en-editor · he-editor               │    ║
║ │   + behavior, full E2E, console, unit                                  │    ║
║ │                                                                       │    ║
║ │                              ▼                                        │    ║
║ │ phase3ResponsiveAuditTask  ← ui-design:responsive-audit               │    ║
║ │   widths: 1280 · 1024 · 768                                           │    ║
║ └────────────────────────────────┬──────────────────────────────────────┘    ║
║                                  ▼                                           ║
║ ┌──────────────────────────────────────────────────────────────────────┐    ║
║ │ ⏸  APPROVAL GATE (human)                                              │    ║
║ │ phase3BaselineApprovalGateTask                                        │    ║
║ │   • Push 16 PNGs grouped by snapshot state to brainstorm screen       │    ║
║ │   • Poll $STATE_DIR/events (60-min timeout)                           │    ║
║ │   • Per-baseline approve/reject + terminal-text overrides             │    ║
║ │                                                                       │    ║
║ │   ┌── on reject ──┐                                                  │    ║
║ │   │ phase3Refine  │ → quality regate → approval (attempts ≤ 3)         │    ║
║ │   │ targeted edit │                                                   │    ║
║ │   └───────────────┘                                                  │    ║
║ │                                                                       │    ║
║ │ phase3BaselineCommitTask                                              │    ║
║ │ COMMIT: test(map-editor): lock approved baselines for phase 3         │    ║
║ │         (16 snapshots × locale × role)                                │    ║
║ └──────────────────────────────────────────────────────────────────────┘    ║
╚═════════════════════════════════════════╤═══════════════════════════════════╝
                                          │
                                          ▼
╔═════════════════════════════════════════════════════════════════════════════╗
║ FINAL: VERIFY + PR                                                           ║
║                                                                              ║
║ ┌──────────────────────────────────────────────────────────────────────┐    ║
║ │ finalVerificationTask                                                 │    ║
║ │   • Branch + tag exist                                                │    ║
║ │   • Jest + Playwright pass (113 + 5 + 18 baselines × 4 projects)      │    ║
║ │   • Working tree clean                                                │    ║
║ │   • Spec §12 cross-check: each issue closed by a corresponding commit │    ║
║ └────────────────────────────────┬──────────────────────────────────────┘    ║
║                                  ▼                                           ║
║ ┌──────────────────────────────────────────────────────────────────────┐    ║
║ │ ⏸  BREAKPOINT: open PR?                                               │    ║
║ │   options: open now · skip · stop and review                          │    ║
║ └────────────────────────────────┬──────────────────────────────────────┘    ║
║                                  ▼                                           ║
║                          (if open now)                                       ║
║ ┌──────────────────────────────────────────────────────────────────────┐    ║
║ │ openPullRequestTask                                                   │    ║
║ │   git push -u origin feat/map-editor-ux-polish                        │    ║
║ │   gh pr create --base main --title ... --body ...                      │    ║
║ │   PR body lists closed issues + quality gate + baseline audit          │    ║
║ │ Returns prUrl                                                         │    ║
║ └──────────────────────────────────────────────────────────────────────┘    ║
╚═════════════════════════════════════════════════════════════════════════════╝

EXPECTED COMMIT TIMELINE ON BRANCH:

    pre-map-editor-ux-polish  (tag on main)
              │
              ▼
    [phase 0]  feat/map-editor-ux-polish  (branch cut)
              │
              ▼
    [phase 1]  refactor(map-editor): remove multi-shelf batch-editing
              │
              ▼
    [phase 2]  fix(map-editor): SVG text alignment in editor canvas
              │
              ▼
    [phase 2]  test(map-editor): lock approved baselines for phase 2
              │
              ▼
    [phase 3]  feat(map-editor): design-tokens addendum
              │
              ▼
    [phase 3]  feat(map-editor): drawer no longer overlays canvas
              │
              ▼
    [phase 3]  feat(map-editor): drawer close affordance + row polish
              │
              ▼
    [phase 3]  test(map-editor): lock approved baselines for phase 3
              │
              ▼
    [final]    PR opened to main
              (≤ 7 source commits + 2 baseline-lock commits)


HUMAN-IN-LOOP MOMENTS (only these block the run):

  1. Phase 2 diagnosis inconclusive (rare)         → choose action
  2. Phase 2 baseline approval                      → 2 baselines
  3. Phase 3 baseline approval                      → 16 baselines
  4. PR-open confirmation                           → push + open

Everything else is autonomous: implementation, tests, snapshots, refinements,
loops, retries.
```
