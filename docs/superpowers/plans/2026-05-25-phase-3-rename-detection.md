# Phase 3 — Rename detection via stable shelf UID (#68) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Detect that a *removed* shelf and a *newly-added* shelf are the **same shelf relabeled** (`CC_1-4 → CC_X-Y`) and surface it as one "renamed" line in the Validate panel — using a **stable per-shelf UID** as ground truth, with geometry as a transitional fallback. (Applying the rename to the CSV stays with the reconcile wizard, Phase 4.)

**Why UID (not geometry-first):** a UID is true identity across a code change; geometry is a heuristic. The project already proves `data-*` attributes survive Inkscape round-trips (`data-map-object="shelf"` does), so a `data-shelf-uid` we **stamp server-side** will persist through librarian edits. See #68.

**Branch:** `feat/phase-3-rename-detection` (off main). Tag: `pre-phase-3-2026-05-25`.

**Tech:** Lambda ESM (`lambda/__tests__`, jest `--experimental-vm-modules`); admin ESM (`npm --prefix admin test -- <pattern>`). Shared parser has a **parity rule** (CLAUDE.md): `lambda/shared/svg-shelves.mjs` ↔ `admin/services/svg-shelves.js` must stay behaviorally identical, guarded by parity tests over shared fixtures in `lambda/__tests__/fixtures/svg-shelves/`.

**Deploys:** promoteStaging Lambda + validateStaging Lambda + SPA. (Two Lambdas this phase.)

---

## Task 0: Prerequisite — confirm `data-shelf-uid` survives Inkscape

- [ ] **Manual (human):** download a floor SVG, add `data-shelf-uid="test-uid-123"` to one shelf in Inkscape, re-export, and confirm the attribute is still present. (Strong prior: `data-map-object` survives.) If it does NOT survive, STOP and reconsider — the geometry fallback (built below) still works, but the uid primary path would be moot. Record the result in #68.

> The rest of the plan is designed so that **even if uids are absent**, geometry fallback detects renames — so the transition period (before any floor is stamped) works regardless.

---

## Task 1: Shared parser returns uid + geometry (parity-maintained)

**Files:** `lambda/shared/svg-shelves.mjs`, `admin/services/svg-shelves.js`; fixtures under `lambda/__tests__/fixtures/svg-shelves/`; parity tests `lambda/__tests__/shared/svg-shelves.test.mjs` + `admin/__tests__/svg-shelves.test.js`.

Add a NEW backward-compatible export (do NOT change `parseSvg`'s `{shelves, duplicates}` shape — many callers depend on it):

```js
// Returns per-shelf detail used by rename detection. Same shelf rule as parseSvg
// (data-map-object="shelf" + non-empty id). uid = data-shelf-uid (or null);
// geometry = numeric x/y/width/height when present (rect), else null.
export function parseSvgShelfDetails(svgString) // -> [{ id, uid, x, y, width, height }]
```

- [ ] Step 1: add shared fixtures — a SVG with shelves that have `data-shelf-uid` + x/y/width/height, one shelf without a uid, one non-rect shelf (no geometry) — plus the `.expected.json` for `parseSvgShelfDetails`.
- [ ] Step 2: write failing parity tests in BOTH `lambda/__tests__/shared/svg-shelves.test.mjs` and `admin/__tests__/svg-shelves.test.js` asserting `parseSvgShelfDetails(fixture)` equals the expected for each fixture. Run both → RED.
- [ ] Step 3: implement `parseSvgShelfDetails` in BOTH files behaviorally identically (server regex; client must produce the SAME output for the fixtures — match the existing file's technique). Parse `data-shelf-uid` and numeric `x/y/width/height` (parseFloat; null if absent).
- [ ] Step 4: run both suites → GREEN. The two `.expected.json` are shared; outputs MUST match byte-for-byte.
- [ ] Step 5: commit `feat(#68): shared parser returns shelf uid + geometry (parity)`.

---

## Task 2: `promoteStaging` stamps `data-shelf-uid` (idempotent)

**Files:** `lambda/promoteStaging.mjs`; Test `lambda/__tests__/promoteStaging.test.mjs`.

Before copying each `maps/floor_N.svg` from staging to production, stamp a stable uid onto every shelf element that lacks one.

- [ ] Step 1: failing tests — promoting a staged SVG whose shelves lack `data-shelf-uid` results in the promoted bytes having a `data-shelf-uid="<uuid>"` on each shelf; a shelf that already has a uid keeps it unchanged (idempotent); non-shelf elements are untouched. (Assert on the bytes passed to the prod `PutObject`/`CopyObject` path — may require switching the SVG promote to read+stamp+Put instead of a plain server-side Copy; keep the existing version-backup behavior from #60.)
- [ ] Step 2: run `cd lambda && NODE_OPTIONS='--experimental-vm-modules' npx jest promoteStaging` → RED.
- [ ] Step 3: implement a `stampShelfUids(svgString)` helper (in `lambda/shared/` so it can be unit-tested + reused): for each shelf tag (data-map-object="shelf" + id) lacking `data-shelf-uid`, insert `data-shelf-uid="<crypto.randomUUID()>"`. Preserve everything else verbatim. In promoteStaging, for SVG files (maps/*.svg) read the staged bytes, stamp, and `PutObject` the stamped bytes to prod (instead of/around the existing `CopyObjectCommand`), keeping the #60 version backup of the prior prod object. Non-SVG files (CSV) keep the existing copy path.
- [ ] Step 4: run → GREEN (new + existing promoteStaging tests, incl. the #60 backup tests).
- [ ] Step 5: commit `feat(#68): stamp stable data-shelf-uid on shelves during promote`.

---

## Task 3: `validateStaging` — uid-primary rename detection (geometry fallback)

**Files:** `lambda/validateStaging.mjs`; Test `lambda/__tests__/validateStaging.test.mjs`.

**Detection model — a join on `data-shelf-uid` (per floor):**
- uid present in BOTH prod & staged, **same** code → unchanged.
- uid present in BOTH, **different** code → **rename** `{ fromCode, toCode, floor, via:'uid' }`.
- uid present in prod but **absent** from staged → **removed**.
- staged shelf with **no uid** → **new** (genuinely added; gets stamped on promote).

- [ ] Step 1: failing tests — (a) a shelf keeps its `data-shelf-uid` but changes its `id` → `summary.renames=[{fromCode,toCode,floor,via:'uid'}]`, and that pair is NOT also in `removedShelves`/`newlyAddedShelves`; (b) a prod uid absent from staged → `removedShelves`; (c) a staged shelf with no uid → `newlyAddedShelves`; (d) transition case: NO uids anywhere but identical geometry across a code change → rename `via:'geometry'`.
- [ ] Step 2: run `validateStaging` jest → RED.
- [ ] Step 3: implement — use `parseSvgShelfDetails` for prod + staged per floor and key the diff on `data-shelf-uid` per the model above (uid-join: same-uid+different-code = rename; prod-uid-absent = removed; staged-no-uid = new). **Transition fallback** (only when the relevant shelves have NO uid yet — i.e. a floor not yet stamped): pair a removed-by-id shelf with an added-by-id shelf by geometry (exact, then ≤3px) as a rename `via:'geometry'`; ambiguous (multiple geometry candidates) → leave as true add/remove. Emit `summary.renames` and exclude renamed pairs from `removedShelves`/`newlyAddedShelves`. Keep `addedShelves`/`removedRefs`/`unmappedShelves` semantics from Phase 2.
- [ ] Step 4: run → GREEN.
- [ ] Step 5: commit `feat(#68): validateStaging detects renames (uid-primary, geometry fallback)`.

---

## Task 4: Validate panel surfaces renames

**Files:** `admin/components/svg-manager/staging-panel.js`; i18n en+he; Test `admin/__tests__/staging-panel.test.js`.

- [ ] Step 1: failing test — with `summary.renames=[{fromCode:'CC_1-4',toCode:'CC_X-Y',floor:1,via:'uid'}]`, assert the panel renders a distinct renamed line like `CC_1-4 → CC_X-Y` (with a "same shelf" note), and those codes do NOT also appear under newly-added/removed.
- [ ] Step 2: `npm --prefix admin test -- staging-panel` → RED.
- [ ] Step 3: implement — add a "Renamed" section above the others rendering each pair `fromCode → toCode (renamed — same shelf)`; route labels through i18n (en + he). Keep the Phase 2 sections.
- [ ] Step 4: `npm --prefix admin test -- staging-panel svg-manager` → GREEN.
- [ ] Step 5: commit `feat(#68): validate panel surfaces detected renames`.

---

## Task 5: Test gate
- [ ] `cd lambda && NODE_OPTIONS='--experimental-vm-modules' npx jest` → all green (incl. parity, promoteStaging, validateStaging). Then `npm --prefix admin test` → only the 4 known pre-existing suites fail (incl. parity green).

## Task 6: Deploy gates (human) → deploy
- [ ] **Breakpoint (deploy/destructive):** approve redeploy of BOTH `primo-maps-promoteStaging` and `primo-maps-validateStaging` (shared parser changed → both need the new code). Rebuild each zip (handler + shared/*.mjs) + update-function-code + smoke (200 wrapping 401/409).
- [ ] **Breakpoint (deploy):** approve `bash redeploy.sh` (SPA + /admin/* invalidation).

## Task 7: Manual e2e gate (human) → PR
- [ ] **Breakpoint (manual e2e):** Cycle A — promote any floor once (stamps uids into prod). Cycle B — download that floor, rename a shelf's code in Inkscape (keeping its `data-shelf-uid`), re-upload, Validate → confirm the panel shows a single `old → new (renamed)` line via uid, not a scary add+remove. Also confirm a no-uid/geometry case still pairs. On approval, push `feat/phase-3-rename-detection` and open the PR (`Closes #68`; `gh api` REST fallback if `gh pr create` hits the Projects-classic bug).

---

## Self-Review
- UID primary + geometry fallback covers the transition (pre-stamp floors) ✓ (Task 3).
- Parser parity maintained (both sides + fixtures) ✓ (Task 1).
- Stamping idempotent + preserves #60 backups ✓ (Task 2).
- Two-Lambda deploy gate (shared parser → both) ✓ (Task 6).
- Detection only (apply = Phase 4) ✓.
- Prerequisite (Inkscape survival) flagged; fallback de-risks it ✓ (Task 0).
- Names consistent: `parseSvgShelfDetails`, `stampShelfUids`, `data-shelf-uid`, `summary.renames`.
