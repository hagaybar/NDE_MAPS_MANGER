# Documentation Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the project's loose documentation so every doc declares its status/provenance at a glance, via status headers + a `docs/INDEX.md` catalog + a `docs/archive/` for finished history.

**Architecture:** Docs-only change. Use `git mv` to relocate finished-history docs into `docs/archive/<group>/` (preserving history), add a one-line status blockquote header to each in-scope doc, write a hand-maintained `docs/INDEX.md` catalog, and delete 3 untracked scratch PNGs. `docs/superpowers/`, `docs/audits/`, the `manual-qa/` harness + its `.html` dashboards, and the `docs/*.png/.pdf` figures are deliberately left in place to avoid breaking references. No application or test code is modified.

**Tech Stack:** Markdown, git, shell (`git mv`, `git grep`). Verification via `git grep` (stale-reference checks) and the existing Jest suite (spot-confirm no code impact).

**Spec:** `docs/superpowers/specs/2026-06-10-docs-organization-design.md`

---

## File Structure

**Created:**
- `docs/INDEX.md` — front-door catalog of every doc outside `superpowers/`.
- `docs/archive/phases/`, `docs/archive/handoffs/`, `docs/archive/sessions/`, `docs/archive/qa/` — grouped finished history.

**Moved (`git mv`):**
- `docs/PHASE-1-TASKS.md`, `docs/PHASE-2-TASKS.md`, `docs/PHASE-4-PLAN.md`, `docs/04-PROJECT-PHASES.md` → `docs/archive/phases/`
- `docs/HANDOFF-2026-05-25-phase-4a.md`, `docs/HANDOFF-2026-05-31.md` → `docs/archive/handoffs/`
- `docs/sessions/2026-06-08-summary.md` → `docs/archive/sessions/`
- `docs/manual-qa/2026-05-14-sot-foundation-ui-test.md`, `docs/manual-qa/2026-05-17-sot-foundation-retest.md`, `docs/manual-qa/2026-05-17-sot-foundation-test-session.md` → `docs/archive/qa/`

**Modified (headers / link fix):**
- In-place Current docs: `docs/01-PROJECT-OVERVIEW.md`, `docs/02-REQUIREMENTS.md`, `docs/03-ARCHITECTURE.md`, `docs/AWS-INFRASTRUCTURE.md`, `docs/issues-plain-language-overview-2026-06-09.md`
- In-place Pinned docs: `docs/batches.md`, `docs/run-history-insights.md`, `docs/audits/2026-05-12-orphan-panel-audit.md`, `docs/audits/2026-05-13-floor-svg-stale-cache.md`
- Link fix: `docs/issues-plain-language-overview-2026-06-09.md:9` (session-summary path)

**Deleted (untracked scratch):**
- `editor-add-line-FIXED.png`, `editor-add-line-locked.png`, `editor-map-unlocked.png` (repo root)

**Left untouched:** all of `docs/superpowers/`, the `manual-qa/` harness + 6 `*.html` dashboards, the 3 `docs/*.png/.pdf` figures, `CLAUDE.md`, `WORKFLOW.md`.

---

## Task 1: Create the archive scaffold

**Files:**
- Create: `docs/archive/phases/.gitkeep`, `docs/archive/handoffs/.gitkeep`, `docs/archive/sessions/.gitkeep`, `docs/archive/qa/.gitkeep`

- [ ] **Step 1: Create the archive subfolders**

```bash
cd /home/hagaybar/projects/primo_maps
mkdir -p docs/archive/phases docs/archive/handoffs docs/archive/sessions docs/archive/qa
touch docs/archive/phases/.gitkeep docs/archive/handoffs/.gitkeep docs/archive/sessions/.gitkeep docs/archive/qa/.gitkeep
```

- [ ] **Step 2: Verify the structure exists**

Run: `find docs/archive -type d | sort`
Expected:
```
docs/archive
docs/archive/handoffs
docs/archive/phases
docs/archive/qa
docs/archive/sessions
```

- [ ] **Step 3: Commit**

```bash
git add docs/archive
git commit -m "docs: scaffold archive/ structure for finished-history docs"
```

---

## Task 2: Archive the PHASE docs (with headers)

**Files:**
- Move: `docs/PHASE-1-TASKS.md`, `docs/PHASE-2-TASKS.md`, `docs/PHASE-4-PLAN.md`, `docs/04-PROJECT-PHASES.md` → `docs/archive/phases/`

- [ ] **Step 1: Move the four files with `git mv`**

```bash
cd /home/hagaybar/projects/primo_maps
git mv docs/PHASE-1-TASKS.md docs/archive/phases/PHASE-1-TASKS.md
git mv docs/PHASE-2-TASKS.md docs/archive/phases/PHASE-2-TASKS.md
git mv docs/PHASE-4-PLAN.md docs/archive/phases/PHASE-4-PLAN.md
git mv docs/04-PROJECT-PHASES.md docs/archive/phases/04-PROJECT-PHASES.md
```

- [ ] **Step 2: Add a status header to the top of each moved file**

Insert these exact lines as the first lines of each file (header block, then a blank line, then the existing content). Use the Edit tool to prepend before the existing first line.

`docs/archive/phases/PHASE-1-TASKS.md`:
```
> **Status:** Historical · Created 2026-02-26 · Phase-1 (Foundation) task breakdown. Shipped long ago; kept for the record.
```

`docs/archive/phases/PHASE-2-TASKS.md`:
```
> **Status:** Historical · Created 2026-02-26 · Phase-2 (Admin UI) task breakdown. Shipped long ago; kept for the record.
```

`docs/archive/phases/PHASE-4-PLAN.md`:
```
> **Status:** Historical · Created 2026-03-01 · Phase-4 (Auth) plan. Shipped long ago; kept for the record.
```

`docs/archive/phases/04-PROJECT-PHASES.md`:
```
> **Status:** Historical · Created 2026-02-26 · Original 5-phase roadmap; all phases delivered. NOTE: its "Phase 4 = Authentication" numbering is unrelated to the later "Phase 4a/4b" reconcile-wizard work — do not confuse the two.
```

- [ ] **Step 3: Verify no stale references and headers present**

Run: `git grep -l -E "PHASE-1-TASKS|PHASE-2-TASKS|PHASE-4-PLAN|04-PROJECT-PHASES" -- ':!docs/superpowers/specs/2026-06-10-docs-organization-design.md' ':!docs/superpowers/plans/2026-06-10-docs-organization.md' | grep -v '^docs/archive/phases/'`
Expected: (no output — nothing outside the archive references these)

Run: `head -1 docs/archive/phases/04-PROJECT-PHASES.md`
Expected: starts with `> **Status:** Historical`

- [ ] **Step 4: Commit**

```bash
git add docs/archive/phases
git commit -m "docs: archive PHASE-* planning docs with status headers"
```

---

## Task 3: Archive the handoffs and session summary (with headers + link fix)

**Files:**
- Move: `docs/HANDOFF-2026-05-25-phase-4a.md`, `docs/HANDOFF-2026-05-31.md` → `docs/archive/handoffs/`
- Move: `docs/sessions/2026-06-08-summary.md` → `docs/archive/sessions/`
- Modify: `docs/issues-plain-language-overview-2026-06-09.md:9` (fix the moved path)

- [ ] **Step 1: Move the files with `git mv`**

```bash
cd /home/hagaybar/projects/primo_maps
git mv docs/HANDOFF-2026-05-25-phase-4a.md docs/archive/handoffs/HANDOFF-2026-05-25-phase-4a.md
git mv docs/HANDOFF-2026-05-31.md docs/archive/handoffs/HANDOFF-2026-05-31.md
git mv docs/sessions/2026-06-08-summary.md docs/archive/sessions/2026-06-08-summary.md
rmdir docs/sessions
```

- [ ] **Step 2: Add a status header to each moved file**

`docs/archive/handoffs/HANDOFF-2026-05-25-phase-4a.md`:
```
> **Status:** Historical · Created 2026-05-25 · Session handoff for Phase 4a (reconcile-wizard renames). Superseded by shipped work; kept for the record.
```

`docs/archive/handoffs/HANDOFF-2026-05-31.md`:
```
> **Status:** Historical · Created 2026-05-31 · Session handoff (2026-05-31, map-editor side-panel). Superseded by shipped work; kept for the record.
```

`docs/archive/sessions/2026-06-08-summary.md`:
```
> **Status:** Historical · Created 2026-06-08 · Session summary (2026-06-08). Point-in-time record; kept for the record.
```

- [ ] **Step 3: Fix the inbound link in the live issues overview**

Use the Edit tool on `docs/issues-plain-language-overview-2026-06-09.md`:
- Old: `> technical record of what shipped, see ` `` `docs/sessions/2026-06-08-summary.md` `` `.`
- New: `> technical record of what shipped, see ` `` `docs/archive/sessions/2026-06-08-summary.md` `` `.`

(Only the path inside the backticks changes: `docs/sessions/` → `docs/archive/sessions/`.)

- [ ] **Step 4: Verify no stale references remain**

Run: `git grep -n "docs/sessions/" -- ':!docs/superpowers/plans/2026-06-10-docs-organization.md' ':!docs/superpowers/specs/2026-06-10-docs-organization-design.md'`
Expected: (no output)

Run: `git grep -n "HANDOFF-2026" -- ':!docs/archive/*' ':!docs/superpowers/*'`
Expected: (no output)

- [ ] **Step 5: Commit**

```bash
git add -A docs/
git commit -m "docs: archive handoffs + session summary; fix inbound link"
```

---

## Task 4: Archive the dated manual-QA logs (keep harness + dashboards)

**Files:**
- Move: `docs/manual-qa/2026-05-14-sot-foundation-ui-test.md`, `docs/manual-qa/2026-05-17-sot-foundation-retest.md`, `docs/manual-qa/2026-05-17-sot-foundation-test-session.md` → `docs/archive/qa/`
- Leave in place: `qa-server.py`, `qa-watch.sh`, `qa-reply.sh`, all 6 `*.html` dashboards.

- [ ] **Step 1: Move only the three `.md` QA logs**

```bash
cd /home/hagaybar/projects/primo_maps
git mv docs/manual-qa/2026-05-14-sot-foundation-ui-test.md docs/archive/qa/2026-05-14-sot-foundation-ui-test.md
git mv docs/manual-qa/2026-05-17-sot-foundation-retest.md docs/archive/qa/2026-05-17-sot-foundation-retest.md
git mv docs/manual-qa/2026-05-17-sot-foundation-test-session.md docs/archive/qa/2026-05-17-sot-foundation-test-session.md
```

- [ ] **Step 2: Add a status header to each moved log**

`docs/archive/qa/2026-05-14-sot-foundation-ui-test.md`:
```
> **Status:** Historical · Created 2026-05-14 · Manual QA log — SoT foundation UI test. Kept for the record.
```

`docs/archive/qa/2026-05-17-sot-foundation-retest.md`:
```
> **Status:** Historical · Created 2026-05-17 · Manual QA log — SoT foundation retest. Kept for the record.
```

`docs/archive/qa/2026-05-17-sot-foundation-test-session.md`:
```
> **Status:** Historical · Created 2026-05-17 · Manual QA log — SoT foundation test session. Kept for the record.
```

- [ ] **Step 3: Verify the harness and dashboards stayed put**

Run: `ls docs/manual-qa/*.html docs/manual-qa/qa-server.py | wc -l`
Expected: `7` (6 dashboards + qa-server.py)

Run: `ls docs/archive/qa/*.md | wc -l`
Expected: `3`

- [ ] **Step 4: Commit**

```bash
git add -A docs/
git commit -m "docs: archive dated manual-QA logs (harness + dashboards stay)"
```

---

## Task 5: Add status headers to the in-place Current + Pinned docs

**Files (header-only edits, no moves):**
- `docs/01-PROJECT-OVERVIEW.md`, `docs/02-REQUIREMENTS.md`, `docs/03-ARCHITECTURE.md`, `docs/AWS-INFRASTRUCTURE.md`, `docs/issues-plain-language-overview-2026-06-09.md`
- `docs/batches.md`, `docs/run-history-insights.md`, `docs/audits/2026-05-12-orphan-panel-audit.md`, `docs/audits/2026-05-13-floor-svg-stale-cache.md`

- [ ] **Step 1: Prepend the status header to each Current doc**

Use the Edit tool to insert each header as the first line (then a blank line before the existing content).

`docs/01-PROJECT-OVERVIEW.md`:
```
> **Status:** Current · Created 2026-02-26 · High-level overview of what Primo Maps is and why it exists.
```

`docs/02-REQUIREMENTS.md`:
```
> **Status:** Current · Created 2026-02-26 · Functional and non-functional requirements for the system.
```

`docs/03-ARCHITECTURE.md`:
```
> **Status:** Current · Created 2026-02-26 · Serverless architecture reference (S3 / CloudFront / Lambda / Cognito).
```

`docs/AWS-INFRASTRUCTURE.md`:
```
> **Status:** Current · Updated 2026-05-18 · CloudFront / S3 / CORS configuration reference.
```

`docs/issues-plain-language-overview-2026-06-09.md`:
```
> **Status:** Current · Created 2026-06-09 · Plain-language overview of open issues — the live "what's open today" doc for the owner.
```

- [ ] **Step 2: Prepend the status header to each Pinned doc**

`docs/batches.md`:
```
> **Status:** Pinned · Regenerated each grooming cycle · Fixed path — WORKFLOW.md writes the 3 batching options here.
```

`docs/run-history-insights.md`:
```
> **Status:** Pinned · Updated by cleanup runs · Fixed path — `.a5c/processes/cleanup-runs.js` writes this here.
```

`docs/audits/2026-05-12-orphan-panel-audit.md`:
```
> **Status:** Pinned · Created 2026-05-12 · Investigation record. Fixed path — referenced by `admin/__tests__/no-duplicate-module-imports.test.js`.
```

`docs/audits/2026-05-13-floor-svg-stale-cache.md`:
```
> **Status:** Pinned · Created 2026-05-13 · Investigation record (stale-cache bug). Fixed path — referenced by CLAUDE.md (the no-cache sticky fix).
```

- [ ] **Step 3: Verify every in-place doc now has a status header**

Run: `for f in docs/01-PROJECT-OVERVIEW.md docs/02-REQUIREMENTS.md docs/03-ARCHITECTURE.md docs/AWS-INFRASTRUCTURE.md docs/issues-plain-language-overview-2026-06-09.md docs/batches.md docs/run-history-insights.md docs/audits/2026-05-12-orphan-panel-audit.md docs/audits/2026-05-13-floor-svg-stale-cache.md; do head -1 "$f" | grep -q '> \*\*Status:\*\*' && echo "OK  $f" || echo "MISSING  $f"; done`
Expected: every line starts with `OK`

- [ ] **Step 4: Commit**

```bash
git add docs/01-PROJECT-OVERVIEW.md docs/02-REQUIREMENTS.md docs/03-ARCHITECTURE.md docs/AWS-INFRASTRUCTURE.md docs/issues-plain-language-overview-2026-06-09.md docs/batches.md docs/run-history-insights.md docs/audits
git commit -m "docs: add status headers to current + pinned docs"
```

---

## Task 6: Write the front-door catalog `docs/INDEX.md`

**Files:**
- Create: `docs/INDEX.md`

- [ ] **Step 1: Write `docs/INDEX.md` with this exact content**

```markdown
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
| `issues-plain-language-overview-2026-06-09.md` | Current | 2026-06-09 | Plain-language open-issues overview — the live "today" doc. |

## Pinned — fixed path, do not move

| Doc | Status | What & why |
|-----|--------|------------|
| `batches.md` | Pinned | WORKFLOW.md regenerates the 3 batching options here. |
| `run-history-insights.md` | Pinned | `.a5c/processes/cleanup-runs.js` writes this here. |
| `audits/2026-05-12-orphan-panel-audit.md` | Pinned | Referenced by a test; investigation record. |
| `audits/2026-05-13-floor-svg-stale-cache.md` | Pinned | Referenced by CLAUDE.md; investigation record. |

## Tooling (not docs)

| Path | What |
|------|------|
| `manual-qa/qa-server.py`, `qa-watch.sh`, `qa-reply.sh` | Reusable live QA dashboard harness. |
| `manual-qa/*.html` (6 dated dashboards) | Served by the harness; kept alongside it. |

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

## Open items (owner decision)

- `EDITOR-UI-REQUIREMENTS.md` (repo root, 2026-03-05) — likely superseded by the
  shipped editor; verify, then header Current or move to `archive/`.
- `archive/index.html` (repo root, 2026-02-25) — stray legacy HTML; review and
  decide keep/move/delete.
```

- [ ] **Step 2: Verify the index links resolve**

Run: `grep -oE '\]\([^)]+\)' docs/INDEX.md | sed -E 's/\]\(|\)//g' | grep -vE '^https?:' | while read p; do t="docs/$p"; [ -e "$t" ] && echo "OK  $p" || echo "BROKEN  $p"; done`
Expected: every line starts with `OK` (the `superpowers/` link resolves to the directory)

- [ ] **Step 3: Commit**

```bash
git add docs/INDEX.md
git commit -m "docs: add INDEX.md front-door catalog"
```

---

## Task 7: Delete the untracked root scratch PNGs

**Files:**
- Delete: `editor-add-line-FIXED.png`, `editor-add-line-locked.png`, `editor-map-unlocked.png` (repo root, untracked)

- [ ] **Step 1: Confirm they are untracked scratch before deleting**

Run: `git status --porcelain | grep -E '\.png$'`
Expected:
```
?? editor-add-line-FIXED.png
?? editor-add-line-locked.png
?? editor-map-unlocked.png
```
(All `??` = untracked. If any show as tracked/modified, STOP and surface to the owner.)

- [ ] **Step 2: Delete them**

```bash
cd /home/hagaybar/projects/primo_maps
rm editor-add-line-FIXED.png editor-add-line-locked.png editor-map-unlocked.png
```

- [ ] **Step 3: Verify they are gone and the tree is clean**

Run: `ls editor-*.png 2>&1`
Expected: `ls: cannot access 'editor-*.png': No such file or directory`

(No commit — deleting untracked files leaves nothing for git to record.)

---

## Task 8: Final verification

- [ ] **Step 1: No stale references to any moved file anywhere in the repo**

Run:
```bash
cd /home/hagaybar/projects/primo_maps
git grep -nE "docs/(PHASE-[124]|04-PROJECT-PHASES|HANDOFF-2026|sessions/2026-06-08|manual-qa/2026-05-(14|17)-sot)" \
  -- ':!docs/archive/*' ':!docs/INDEX.md' \
  ':!docs/superpowers/specs/2026-06-10-docs-organization-design.md' \
  ':!docs/superpowers/plans/2026-06-10-docs-organization.md'
```
Expected: (no output)

- [ ] **Step 2: The audits test reference still resolves (audits did NOT move)**

Run: `test -f docs/audits/2026-05-13-floor-svg-stale-cache.md && grep -q "docs/audits/2026-05-12-orphan-panel-audit.md" admin/__tests__/no-duplicate-module-imports.test.js && echo "audit refs intact"`
Expected: `audit refs intact`

- [ ] **Step 3: The Jest suite is unaffected (docs-only change)**

Run: `cd admin && NODE_OPTIONS=--experimental-vm-modules npx jest no-duplicate-module-imports 2>&1 | tail -5`
Expected: the targeted suite passes (no new failures introduced by the docs move).

- [ ] **Step 4: Final tree sanity check**

Run: `ls docs/*.md && echo "---archive---" && find docs/archive -name '*.md' | sort`
Expected: `docs/*.md` shows only `01/02/03`, `AWS-INFRASTRUCTURE`, `INDEX`, `issues-plain-language-overview`, `batches`, `run-history-insights` (no `PHASE-*`, no `04-PROJECT-PHASES`, no `HANDOFF-*`); the archive list shows the 10 relocated docs.

- [ ] **Step 5: Confirm clean working tree**

Run: `git status --short`
Expected: empty (everything committed; the 3 scratch PNGs gone).

---

## Self-Review

**Spec coverage:** Every spec section maps to a task — archive scaffold (T1), the moves grouped phases/handoffs/sessions/qa (T2–T4), status headers on Current + Pinned in-place docs (T5), INDEX catalog (T6), root-PNG deletion (T7), reference-safety + zero-code-impact verification (T8). The spec's "leave untouched" set (`superpowers/`, `audits/`, manual-qa harness + dashboards, `docs/*.png/.pdf` figures) is honored: no task moves or edits them except adding headers to the two pinned `audits/*` files (allowed by the spec). Open items (`EDITOR-UI-REQUIREMENTS.md`, root `archive/index.html`) are surfaced in INDEX, not actioned — matching the spec's "flag, don't block."

**Placeholder scan:** No TBD/TODO; every header's exact text is given; every command has expected output.

**Type/name consistency:** Folder names (`phases/handoffs/sessions/qa`), the `> **Status:**` header format, and the three status values (Current/Historical/Pinned) are identical across the spec, every task, and INDEX.md.
