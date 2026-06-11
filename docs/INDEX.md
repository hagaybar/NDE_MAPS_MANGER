# Documentation Index

> **Status:** Current · Created 2026-06-10 · Front-door catalog of every doc
> outside `superpowers/`. Hand-maintained — update it when you add, move, or
> retire a doc.

**Start here.** For what's open **today**, read
[`issues-plain-language-overview-2026-06-09.md`](issues-plain-language-overview-2026-06-09.md).
For infrastructure, read [`AWS-INFRASTRUCTURE.md`](AWS-INFRASTRUCTURE.md).
For **feature design history** (specs + plans, one per feature, dated and
self-organized), browse [`superpowers/`](superpowers/) — it is trusted as-is
and not cataloged here.

**Status legend:** **Current** = trust it · **Historical** = finished record,
kept for the archive · **Pinned** = kept at a fixed path because a script or
CLAUDE.md references it.

## Current — living references (repo: `docs/`)

| Doc | Status | Date | What & why |
|-----|--------|------|------------|
| `01-PROJECT-OVERVIEW.md` | Current | 2026-02-26 | What Primo Maps is and why. |
| `02-REQUIREMENTS.md` | Current | 2026-02-26 | Functional / non-functional requirements. |
| `03-ARCHITECTURE.md` | Current | 2026-02-26 | Serverless architecture reference. |
| `AWS-INFRASTRUCTURE.md` | Current | 2026-05-18 | CloudFront / S3 / CORS configuration. |
| `EDITOR-UI-REQUIREMENTS.md` | Current | 2026-03-04 | Spec of record for the live Location Editor (v2.0). |
| `issues-plain-language-overview-2026-06-09.md` | Current | 2026-06-09 | Plain-language open-issues overview — the live "today" doc. |

## Pinned — fixed path, do not move

| Doc | Status | What & why |
|-----|--------|------------|
| `batches.md` | Pinned | WORKFLOW.md regenerates the 3 batching options here. |
| `run-history-insights.md` | Pinned | `.a5c/processes/cleanup-runs.js` writes this here. |
| `audits/2026-05-12-orphan-panel-audit.md` | Pinned | Referenced by a test; investigation record. |
| `audits/2026-05-13-floor-svg-stale-cache.md` | Pinned | Referenced by CLAUDE.md; investigation record. |

## Dashboards

| Path | What |
|------|------|
| [`dashboards/`](dashboards/) | **Live** HTML dashboard outputs. Built with the global `html-dashboard` skill (static or interactive); the repo carries no engine. See [`dashboards/README.md`](dashboards/README.md). |
| [`archive/dashboards/`](archive/dashboards/) | Archived dated QA dashboards + the old custom `qa-server.py` bridge (superseded by the skill). |

## Figures (referenced by `superpowers/` design docs — kept in place)

| File | Used by |
|------|---------|
| `map_editor_new_layout.png` | `superpowers/specs/2026-05-31-map-editor-side-panel-layout-design.md` |
| `orphan_panel_hebrew_UI_bug.png` | `superpowers/plans/2026-05-12-issue-16-pr2-empty-shelf-ux.md` |
| `primo_maps_issues_mape_editor_feature.pdf` | `superpowers/plans/2026-05-12-issue-16-pr2-empty-shelf-ux.md` |

## Archive — finished history (`docs/archive/`)

| Doc | Status | Date | What |
|-----|--------|------|------|
| `archive/phases/PHASE-1-TASKS.md` | Historical | 2026-02-26 | Phase-1 (Foundation) task breakdown. |
| `archive/phases/PHASE-2-TASKS.md` | Historical | 2026-02-26 | Phase-2 (Admin UI) task breakdown. |
| `archive/phases/PHASE-4-PLAN.md` | Historical | 2026-03-01 | Phase-4 (Auth) plan. |
| `archive/phases/04-PROJECT-PHASES.md` | Historical | 2026-02-26 | Original 5-phase roadmap (all delivered). |
| `archive/handoffs/HANDOFF-2026-05-25-phase-4a.md` | Historical | 2026-05-25 | Session handoff — Phase 4a renames. |
| `archive/handoffs/HANDOFF-2026-05-31.md` | Historical | 2026-05-31 | Session handoff — map-editor side panel. |
| `archive/sessions/2026-06-08-summary.md` | Historical | 2026-06-08 | Session summary (2026-06-08). |
| `archive/qa/2026-05-14-sot-foundation-ui-test.md` | Historical | 2026-05-14 | Manual QA log — SoT foundation UI test. |
| `archive/qa/2026-05-17-sot-foundation-retest.md` | Historical | 2026-05-17 | Manual QA log — SoT foundation retest. |
| `archive/qa/2026-05-17-sot-foundation-test-session.md` | Historical | 2026-05-17 | Manual QA log — SoT foundation test session. |
| `archive/legacy/index.html` | Historical | 2026-02-25 | Legacy "Welcome" splash page; not project docs, kept for the record. |
| `archive/dashboards/` (6 html + bridge) | Historical | 2026-06-11 | Dated QA dashboards + the old custom `qa-server.py` bridge; superseded by the `html-dashboard` skill. See its README. |

## Open items

None outstanding. (`EDITOR-UI-REQUIREMENTS.md` is kept as Current in `docs/`;
the legacy root `archive/` welcome page moved to `archive/legacy/index.html`.)
