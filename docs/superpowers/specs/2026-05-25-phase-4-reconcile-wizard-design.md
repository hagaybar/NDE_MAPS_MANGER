# Phase 4 — Reconcile Wizard Redesign — Design

**Status:** design approved via the planning dashboard (2026-05-25). Closes #57 + #59.

## Overview & goal

Make the reconcile wizard **shelf-centric and non-destructive by default**, so a non-engineer can complete a full edit cycle (rename a shelf, add a new one with library data, remove one) without losing data or engineer help. Builds on Phase 3's `summary.renames`. Branch family `feat/phase-4-*`; tag `pre-phase-4-2026-05-25`.

## Settled decisions (planning dashboard, 2026-05-25)

1. **Decompose into three specs** (each its own plan → PR), tracked by a meta-issue.
2. **Soft-delete:** removing a shelf must be **recoverable** — its CSV row is set aside, not destroyed.
3. **Storage:** one small file per set-aside row, `versions/unlinked/<ISO-ts>_<svgCode>.csv` (one row each).
4. **Cleanup:** auto-expire the pool after **90 days** via an **S3 lifecycle rule** on `versions/unlinked/` (same mechanism as the 7-day staging rule — no code).
5. **Reassign:** a CSV-editor panel **“Unlinked entries (N)”**, each with **“Reassign to shelf …”** that validates the target shelf id exists on its floor before saving.
6. **Adds (#57):** per new shelf, three actions — **add library entry now** (inline form), **leave unmapped**, **remove from SVG**.
7. **Renames:** show the detected pair (`old → new`) with **Confirm** / **Treat as separate add+remove**; ambiguous → show candidate previews and pick.
8. **Wizard structure:** grouped by change type — **Renamed / Added / Removed** — nothing destructive without an explicit choice.

## Architecture

### The unlinked-entries pool (soft delete) — 4c
- On a **soft-unlink** of a CSV-referenced shelf during reconcile, `applyReconcileToStaging` writes the removed row to `versions/unlinked/<ts>_<svgCode>.csv` (single-row CSV, full original columns preserved) **instead of dropping it**, then removes it from the staged CSV so validation passes.
- The pool lives under `versions/` so it **survives promotes** (it's not in `staging/`). Per-file storage means each entry expires independently.
- **Cleanup:** an S3 lifecycle rule `expire-unlinked-after-90-days` on the `versions/unlinked/` prefix (added via `aws s3api put-bucket-lifecycle-configuration`, alongside the existing `expire-staging-after-7-days` rule).

### Reassign flow — 4c
- CSV editor gains an **“Unlinked entries (N)”** panel: lists pool rows (`svgCode`, floor, description). Each row: **Reassign to shelf id …** — input/select validated against the **current production SVG shelves on that floor** (reuse `parseSvg`/`parseSvgShelfDetails`). On save: write the row back into `mapping.csv` with the new `svgCode`, delete its pool file. Must satisfy the bundle invariant (new id resolves on its floor).

### The wizard (grouped, non-destructive) — 4a + 4b + (4c removes)
Driven by `validateStaging.summary` (`renames`, `newlyAddedShelves`, `removedShelves`, `removedRefs`):
- **Renamed** (4a): each `summary.renames` pair → `old → new` with **Confirm** (apply `rename` to staged CSV — backend already supports the `rename` action) / **Treat as separate add+remove**. Ambiguous (no single uid/geometry match) → candidate previews, pick one. Removes the "rename targets limited to existing orphans" limitation (#59).
- **Added** (4b, #57): each `newlyAddedShelves` → **Add library entry now** (inline form prefilled with floor + svgCode → appends a CSV row), **Leave unmapped** (allow promote; recorded intent), **Remove from SVG** (mutate the staged SVG to drop the shelf before promote).
- **Removed** (4c, #59): each true removal (a `removedRefs`/`removedShelves` not part of a rename) → **Unlink (keep data)** (soft-delete to the pool) / **Cancel removal** (revert that floor's staged SVG to production).

## Decomposition, order, dependencies

- **4a — Renames** (first; smallest, highest immediate value). Consumes Phase 3 `summary.renames`; backend `rename` action already exists. Wizard renders confirmable rename pairs (+ ambiguous pick). *Addresses the rename half of #59.*
- **4b — Adds (#57)** (second). Wizard adds the three new-shelf actions; needs an inline add-entry form (client) + a **staged-SVG edit** capability for "remove from SVG". *Closes #57.*
- **4c — Soft-unlink pool + reassign + CSV panel + cleanup (#59)** (third; largest). New `versions/unlinked/` storage, `applyReconcileToStaging` soft-unlink, CSV-editor reassign panel, S3 lifecycle rule. *Closes #59.*

Each is independently shippable. 4a and 4b don't depend on the pool; 4c is self-contained. Order = value + risk, smallest-first.

## Data flow (per confirmed wizard action)

- **Confirm rename** → `applyReconcileToStaging` sets the staged CSV row's `svgCode = new` → re-validate (should pass) → promote.
- **Add entry (new shelf)** → append a row to the staged CSV (floor + svgCode + library fields) → re-validate → promote.
- **Remove from SVG (new shelf)** → edit the staged SVG to delete that shelf element → re-validate → promote.
- **Unlink (true removal)** → write `versions/unlinked/<ts>_<svgCode>.csv`, drop the row from staged CSV → re-validate → promote. Later: CSV-editor reassign pulls it back.
- **Cancel removal** → restore that floor's staged SVG from production.

## Error handling / validation
- Reassign and add-entry both enforce the **bundle invariant** (svgCode must resolve to a shelf on its floor) before write; reject otherwise with a clear message.
- Soft-unlink is atomic per row (write pool file, then drop from CSV); on failure, leave staged CSV unchanged.
- All staging mutations keep the existing lock/owner model and the #60 promote backups.

## Testing
- Per spec: lambda jest (applyReconcileToStaging actions, pool write/read, reassign validation) + admin jest (wizard rendering per group, inline add form, reassign panel). Manual e2e per spec (a librarian completes a rename / add / remove cycle, then re-finds a reassigned row).

## Out of scope (future)
- Bulk reassign; pool search/filter UI beyond the basic panel; typed map objects / in-app SVG editing (separate future plan).

## Open items (resolve during each sub-spec's planning)
- "Remove from SVG" (4b): exact staged-SVG edit mechanism (regex delete of the shelf tag vs DOM) — decide in 4b's plan.
- Pool file column set: full `mapping.csv` columns vs a minimal subset — default to **full columns** (lossless) unless 4c planning finds a reason otherwise.
