# Run History Insights

Digest of babysitter runs older than 7 days (cutoff 2026-05-05). Source: `.a5c/runs/<id>/`.

## Run History Summary

| Run (short) | Date | Process | Outcome | Tasks | Notes |
|---|---|---|---|---|---|
| 01KJCR08TV | 2026-02-26 | primo-maps/phase1-infrastructure | completed | 9 | Bootstrapped S3, CloudFront, CORS; uploaded mapping CSV and 3 floor SVGs |
| 01KJD4ESBB | 2026-02-26 | primo-maps/phase2-admin-ui | completed | 9 | Built admin SPA shell, i18n (en/he), Lambda CRUD for CSV+SVG |
| 01KJM3PS8D | 2026-03-01 | phase3-versioning-tdd | completed | 20 | TDD versioning: backend 87 tests, frontend 135 tests; 89% overall coverage (95% target partially met) |
| 01KJS77KRT | 2026-03-03 | primo-maps/e2e-playwright | completed | 9 | Playwright E2E to 100% pass rate in 2 iterations; locator + auth fixture fixes |
| 01KJT931XH | 2026-03-03 | editor-ui-redesign | completed | 56 | Multi-phase redesign driven by plan doc, quality target 90%; phases 0-5 all green |
| 01KJWM3P9N | 2026-03-04 | editor-ui-redesign | completed | 15 | Follow-up redesign run starting at phase 1 (continuation of prior session) |
| 01KJYHN1SW | 2026-03-05 | cradle/user-install | failed | 0 | TypeError: undefined `existingProfileDir` in plugin code — bad inputs (empty `{}`) |
| 01KJYHNSWQ | 2026-03-05 | cradle/user-install | completed | 8 | Retry of above succeeded after process-level fix |
| 01KJYK7FRH | 2026-03-05 | errors-dashboard-prototype | completed | 6 | Built errors dashboard component with i18n + CSS in 3 iterations |
| 01KJYV4BTR | 2026-03-05 | admin-client-logging | failed | 0 | TypeError: `ctx.log.info is not a function` — process code referenced wrong logger shape |
| 01KJYV5VFP | 2026-03-05 | admin-client-logging-v2 | completed | 5 | Rewritten v2 process succeeded in 8 iterations |
| 01KJZ8EFZP | 2026-03-05 | editor-range-restrictions | completed | 8 | Allowed-range filter: new utils, Lambda role-auth, range-filter-editor UI |
| 01KQ9Q0Z55 | 2026-04-28 | map-editor | completed | 22 | Big plan-driven build (20 plan tasks + corrective fix); 23/23 unit + 7/7 E2E green; pre-feature tag used |
| 01KQPDG2CN | 2026-05-03 | map-editor-ux-polish | completed | 15 | UX polish with 12 visual baselines approved (en/he, admin/editor); spec-driven |

## Key Decisions & Insights

- **Plan + spec docs drive the largest runs.** `map-editor`, `editor-ui-redesign`, and `map-editor-ux-polish` all consumed `planPath` / `specPath` from `docs/superpowers/` and outperformed unstructured runs in task count and traceability.
- **Pre-feature git tags are standard for non-trivial work.** `map-editor` created `pre-map-editor-2026-04-28`; `ux-polish` created `pre-map-editor-ux-polish`. Matches the user's MEMORY.md note on rollback safety.
- **TDD phase produced measurable coverage.** Phase 3 versioning shipped 87 backend + 135 frontend tests, 89% overall, 0 failing — coverage is tracked per file in the run output.
- **Quality gates with iteration caps work.** Editor-UI-redesign used `targetQuality=90, maxIterations=3` per phase; most phases converged in 1-3 iterations.
- **i18n (en/he) and RTL are first-class everywhere.** Every UI-touching run updates both `admin/i18n/en.json` and `he.json`; visual baselines double in count (en+he variants).
- **CSV mapping is the load-bearing data contract.** Multiple runs filter SVG `[id]` elements against `mapping.csv` to avoid false positives — surfaced as a corrective fix in `map-editor` (commit `baa1e2e`).
- **CORS + role-based UI are recurring traps.** E2E run had to add `applyRoleBasedUI()` after dynamic renders; CLAUDE.md already encodes this lesson.
- **Visual regression via Playwright screenshots is the QA pattern.** UX-polish run approved 12 baselines across locale × role matrices.
- **Process-level bugs cause RUN_FAILED before any task starts.** Both failures (cradle/user-install, admin-client-logging) blew up at process entry on iteration 0 with `TypeError`, not in agent logic.

## What Worked

- **Spec/plan-driven processes** (`docs/superpowers/plans/...`, `docs/superpowers/specs/...`) — high task counts, clean git histories with semantic commits, verifiable outputs.
- **Pre-feature tag + feature branch + per-phase commits** — gives clean rollback and granular review (see `map-editor` commit list).
- **TDD phase with explicit coverage targets** (`targetCoverage: 95`) — phase3-versioning produced real numbers and a per-file breakdown.
- **Locator/fixture iteration loops** for Playwright — e2e-playwright run converged to 100% pass rate in 2 iterations by fixing locators, auth injection, and `goto()` paths.
- **Re-running a failed process after rewriting it** — both `cradle/user-install` and `admin-client-logging` succeeded immediately on the retry (`-v2` variant).
- **Visual baseline approval per locale × role** — UX-polish run captured the en/he × admin/editor matrix systematically.

## What Didn't Work

- **`cradle/user-install` first attempt (01KJYHN1SW, failed)** — Crashed at process line 36 reading `existingProfileDir` from undefined inputs. The run had been invoked with empty inputs and the process didn't guard. **Retry 01KJYHNSWQ succeeded** (25s later) once inputs were supplied.
- **`admin-client-logging` first attempt (01KJYV4BTR, failed)** — Crashed at process line 22 calling `ctx.log.info(...)` — the SDK logger didn't expose `.info`. **Retry as `admin-client-logging-v2` (01KJYV5VFP) succeeded** within ~50s of the failure. Notable: v2 output was nearly empty (`{"integrationStatus": {}}`), suggesting the v2 process truncated its result schema.
- **`editor-ui-redesign` ran twice** (01KJT931XH then 01KJWM3P9N a day later, with `startPhase: 1`). Not a failure, but indicates the first 56-task run did not produce a fully-finished feature in a single pass; a continuation run was needed.
- **Phase 3 hit 89% coverage vs. 95% target** — backend coverage was dragged down by untested legacy Lambdas (`deleteSvg`, `listSvg`, `putCsv`, `uploadSvg`). New Phase 3 files exceeded the target individually.

## Recommendations

1. **Guard process entrypoints against missing inputs.** Both RUN_FAILED cases were `TypeError` at the top of `process()` on properties of `undefined`. Add `inputs ?? {}` defaults and validate required keys early so failures land in a task with a useful message instead of crashing the orchestrator.
2. **Stop the `-v2` pattern; fix in place.** Renaming `admin-client-logging` to `admin-client-logging-v2` leaves orphaned process files and split run history. Keep the same processId, fix the bug, re-invoke.
3. **Standardize on plan + pre-feature tag + branch for any run with >5 tasks.** This is already informal practice (`map-editor`, `map-editor-ux-polish`) and matches MEMORY.md. Make it explicit in process scaffolds.
4. **Backfill coverage on legacy Lambdas** to unblock the 95% global target — `deleteSvg.mjs`, `listSvg.mjs`, `putCsv.mjs`, `uploadSvg.mjs` were called out as untested.
5. **Capture visual baselines for en + he × admin + editor as a 2×2 matrix** in every UI run, the way `map-editor-ux-polish` did. It's the cleanest gate against RTL regressions.
