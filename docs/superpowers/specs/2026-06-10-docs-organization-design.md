# Docs Organization — Design

> **Status:** Current · Created 2026-06-10 · Design spec for reorganizing the
> project's loose documentation so each doc's status/provenance is obvious
> at a glance. Drives the implementation plan of the same date.

## Problem

The owner (who does not read source code) is getting lost in the project's
documentation. Opening a file like `docs/PHASE-1-TASKS.md` gives no signal of
**when it was written, why, or whether it still matters** without reading the
whole thing. Three concrete pains:

1. **No provenance at a glance** — loose `docs/*.md` files don't declare their
   own status (current vs. superseded vs. point-in-time history).
2. **No single catalog** — there's no front door listing what exists and what's
   live, so "what's true today" is smeared across several files.
3. **Root clutter** — throwaway `.png` screenshots parked at the repo root for
   no reason.

## Goals

- Make every document's **status and purpose visible without opening it**.
- Provide **one front-door index** that catalogs the docs and points at the
  living ones.
- Physically separate **finished history** from **living references**.
- Remove root-level scratch files.
- **Zero code changes, zero test impact.** This is a docs-only reorganization.
- **Reversible.** Use `git mv` (preserves history); the only deletions are
  untracked throwaway screenshots.

## Non-goals

- **Do not touch `docs/superpowers/`** (specs + plans). The owner trusts this
  tree as-is; it is already self-organized and dated. Leaving it alone also
  avoids breaking its ~40 internal cross-links, the CLAUDE.md spec reference,
  and the `.a5c/processes/*.js` babysitter configs that point at plan paths.
- No rewrite of doc *content* (the owner will separately update the living
  `issues-plain-language-overview` to current state — out of scope here).
- No new tooling/automation to maintain the index (it is hand-maintained).

## Decisions (resolved during brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Outcome | One-time cleanup **and** a durable convention. |
| 2 | Audience | **Owner first** (Claude-facing docs kept but out of the way). |
| 3 | Disposition of stale docs | **Archive, keep all** (nothing deleted except untracked scratch). |
| 4 | Status signal | **Folders + headers + index** (max signal). |
| 5 | Scope | Reorganize the **loose `docs/*` files + root clutter only**; leave `superpowers/` untouched. |
| 6 | Untracked root PNGs | **Delete** (throwaway debug screenshots). |
| 7 | `manual-qa/` | Archive the **dated outputs**; keep the reusable harness in place. |
| 8 | `issues-plain-language-overview` | **Keep at root, Current** (owner maintains it as the live "today" doc). |
| 9 | `04-PROJECT-PHASES.md` | **Archive** (original Feb roadmap, all phases shipped; its "Phase 4" naming collides with later "Phase 4a/4b" work). |

## Status vocabulary

Every doc in scope gets a one-line header (a Markdown blockquote at the very
top). `Status:` is exactly one of:

- **Current** — describes how things are now; trustworthy. (e.g. `01–03`,
  `AWS-INFRASTRUCTURE.md`, `issues-plain-language-overview`, `INDEX.md`)
- **Historical** — point-in-time record, superseded; kept for the record.
  (everything moved into `archive/`)
- **Pinned** — kept at a **fixed path** because a script or CLAUDE.md
  references it; do not move. (`batches.md`, `run-history-insights.md`,
  `audits/*`)

Header format:

```
> **Status:** <Current|Historical|Pinned> · <Created YYYY-MM-DD> · <one-line what & why>.
> [Historical only:] Superseded by <X>; kept for the record.
> [Pinned only:] Fixed path — <script/CLAUDE.md> writes/reads this here.
```

Root governance files (`CLAUDE.md`, `WORKFLOW.md`) are self-evidently current
and are **excluded** from the header convention.

## Target layout

```
docs/
  INDEX.md                    ← NEW. Front-door catalog (see below).

  01-PROJECT-OVERVIEW.md      ← stays root · Current
  02-REQUIREMENTS.md          ← stays root · Current
  03-ARCHITECTURE.md          ← stays root · Current
  AWS-INFRASTRUCTURE.md       ← stays root · Current
  issues-plain-language-overview-2026-06-09.md  ← stays root · Current
  batches.md                  ← stays root · Pinned (WORKFLOW.md)
  run-history-insights.md     ← stays root · Pinned (cleanup-runs.js)

  superpowers/                ← UNTOUCHED
  audits/                     ← stays in place · Pinned (CLAUDE.md + a test); header each
    2026-05-12-orphan-panel-audit.md
    2026-05-13-floor-svg-stale-cache.md

  manual-qa/                  ← harness stays; dated outputs move out
    qa-server.py  qa-watch.sh  qa-reply.sh   ← stay (reusable tooling)

  archive/                    ← NEW. All finished history, grouped:
    phases/    PHASE-1-TASKS, PHASE-2-TASKS, PHASE-4-PLAN, 04-PROJECT-PHASES
    handoffs/  HANDOFF-2026-05-25-phase-4a, HANDOFF-2026-05-31
    sessions/  2026-06-08-summary
    qa/        the dated manual-qa *.md + *.html outputs
    images/    map_editor_new_layout.png, orphan_panel_hebrew_UI_bug.png,
               primo_maps_issues_mape_editor_feature.pdf
```

### Moves (use `git mv`)

| Into | Files |
|------|-------|
| `archive/phases/` | `docs/PHASE-1-TASKS.md`, `docs/PHASE-2-TASKS.md`, `docs/PHASE-4-PLAN.md`, `docs/04-PROJECT-PHASES.md` |
| `archive/handoffs/` | `docs/HANDOFF-2026-05-25-phase-4a.md`, `docs/HANDOFF-2026-05-31.md` |
| `archive/sessions/` | `docs/sessions/2026-06-08-summary.md` (then remove empty `docs/sessions/`) |
| `archive/qa/` | dated `docs/manual-qa/*.md` (3) + `*.html` (6) |
| `archive/images/` | `docs/map_editor_new_layout.png`, `docs/orphan_panel_hebrew_UI_bug.png`, `docs/primo_maps_issues_mape_editor_feature.pdf` |

### Deletes (untracked scratch)

`editor-add-line-FIXED.png`, `editor-add-line-locked.png`,
`editor-map-unlocked.png` (repo root).

## `docs/INDEX.md` design

A **catalog, not a competing status narrative.** Structure:

1. **Short orientation** (3–4 lines): "Start here. For what's open today →
   `issues-plain-language-overview`. For infrastructure → `AWS-INFRASTRUCTURE`.
   For feature design history → `superpowers/`."
2. **Catalog table** of every doc **outside `superpowers/`**: columns
   *Doc · Status · Date · What & why (one line)*. Living docs listed first,
   then a clearly separated **Archive** section.

The index does not duplicate the open-issues status — that stays in the
owner-maintained `issues-plain-language-overview`.

## Reference safety

`superpowers/` and `audits/` stay in place, so the known hard references
(CLAUDE.md ×2, the test comment, `batches.md` in WORKFLOW.md,
`run-history-insights.md` in cleanup-runs.js) are **untouched**.

For each **moved** file, the implementation must, in the same commit:
1. `git grep` the repo for inbound references to the file's old path/name
   (other docs embedding an image, `qa-watch.sh`/`qa-server.py` hardcoding a
   dashboard path, etc.).
2. Update any references found.
3. Verify with a final `git grep` that no stale path to a moved file remains.

Memory files under `~/.claude/...` may reference old doc paths; those are
outside the repo and out of scope (note, don't edit).

## Open items (flag, don't block)

- **`EDITOR-UI-REQUIREMENTS.md`** (repo root, Mar 5) — likely superseded by the
  shipped editor + map-editor redesign, but unread. Verify, then either header
  it Current or move to `archive/`. Not in the agreed scope; surface to owner.
- **Repo-root `archive/index.html`** (18 KB, Feb 25, unread) — a stray legacy
  HTML at the repo root. Surface to owner; do not move blindly.

## Acceptance criteria

1. `docs/INDEX.md` exists and lists every non-`superpowers/` doc with a status,
   date, and one-line purpose; the Archive section is clearly separated.
2. Every in-scope loose doc and each `audits/*` file carries a status header.
3. `docs/archive/{phases,handoffs,sessions,qa,images}/` contain exactly the
   files listed above; `git log --follow` still shows their history.
4. The 3 untracked root PNGs are gone.
5. `git grep` finds **no** stale references to any moved file.
6. No files under `docs/superpowers/`, `docs/audits/`, and no code/test files
   are modified (except reference updates strictly required by a move).
7. The test suite is unaffected (docs-only change) — spot-confirm the doc-path
   test comment in `admin/__tests__/no-duplicate-module-imports.test.js` still
   resolves (it points at `audits/`, which did not move).
