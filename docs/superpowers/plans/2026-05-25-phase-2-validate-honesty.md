# Phase 2 — Validate panel honesty (#51 + #56) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Make the staging Validate panel honest so a non-engineer can read it and answer *"what changed because of my upload?"*. Stop conflating pre-existing orphan shelves with genuinely new ones, surface SVG-removed shelves, rename CSV-impact for humans, and kill the misleading "no CSV changes needed" string.

**Why:** Per #51, `addedShelves` = "staged SVG shelves not in prod CSV refs" — it counts long-standing orphans as "new" (the *"5 new shelfes added"* confusion). Per #56, SVG→SVG removals are never surfaced ("did my rollback register?"). Plan source: `docs/superpowers/plans/2026-05-19-ux-redesign-phased.md` (Phase 2).

**Approach:** Additive backend metrics (keep `addedShelves`/`removedRefs` so the reconcile wizard keeps working until Phase 4) + honest panel sections + i18n. Touches `lambda/validateStaging.mjs`, `admin/components/svg-manager/staging-panel.js`, i18n. Needs a **validateStaging Lambda redeploy** + SPA redeploy.

**Branch:** `feat/phase-2-validate-honesty` (off main). Tag: `pre-phase-2-2026-05-25`.

**Tech:** Lambda ESM (`lambda/__tests__`, jest `--experimental-vm-modules`); admin ESM (`npm --prefix admin test -- <pattern>`). 14 known pre-existing admin failures are unrelated.

---

## Task 1: `validateStaging` computes honest metrics

**Files:** Modify `lambda/validateStaging.mjs` (diff region ~:33-79); Test `lambda/__tests__/validateStaging.test.mjs`.

Currently it loads `svgShelfIdsByFloor` = staged-or-fallback SVG shelves, and `prodRefsByFloor` = production CSV refs. It does **not** load the production SVG shelves — required to distinguish *new this upload* from *pre-existing*.

- [ ] **Step 1: failing tests** — in `validateStaging.test.mjs`, add cases (use the existing S3-mock idiom) for a staged floor that simultaneously: adds one genuinely new shelf, keeps a pre-existing CSV-unmapped orphan, and drops a shelf that was in the production SVG. Assert:
  - `summary.newlyAddedShelves` = only the genuinely new shelf (in staged SVG, NOT in prod SVG).
  - `summary.removedShelves` = the dropped shelf (in prod SVG, NOT in staged SVG).
  - `summary.unmappedShelves` = all staged shelves not referenced by CSV (new + orphan) — equals the legacy `addedShelves`.
  - `summary.addedShelves` and `summary.removedRefs` unchanged (back-compat).
- [ ] **Step 2:** `cd lambda && NODE_OPTIONS='--experimental-vm-modules' npx jest validateStaging` → RED.
- [ ] **Step 3: implement** — after the staged-or-fallback SVG loop, also load the **production** SVG shelves, and extend the diff:

```js
  // Production SVG shelves (always prod, never staged) — lets us tell shelves
  // that are NEW in this upload from ones that already existed in production.
  const prodSvgShelfIdsByFloor = {};
  for (const floor of [0, 1, 2]) {
    let prodSvg = null;
    try { prodSvg = await fetchObject(`maps/floor_${floor}.svg`); } catch { prodSvg = null; }
    prodSvgShelfIdsByFloor[floor] = new Set(prodSvg ? parseSvg(prodSvg).shelves : []);
  }
```

In the existing `for (const floor of [0,1,2])` diff loop, add the new metrics alongside `addedShelves`/`removedRefs`:

```js
  const newlyAddedShelves = [];
  const removedShelves = [];
  const unmappedShelves = [];
  // ... inside the floor loop, after the existing removedRefs/addedShelves logic:
    const prodShelves = prodSvgShelfIdsByFloor[floor] || new Set();
    for (const id of stagedShelves) {
      if (!prodRefs.has(id)) unmappedShelves.push({ svgCode: id, floor });   // orphan OR new (== addedShelves)
      if (!prodShelves.has(id)) newlyAddedShelves.push({ svgCode: id, floor }); // new in THIS upload
    }
    for (const id of prodShelves) {
      if (!stagedShelves.has(id)) removedShelves.push({ svgCode: id, floor }); // dropped from the SVG (#56)
    }
```

Extend the summary (keep the existing fields):

```js
  const summary = { addedShelves, removedRefs, newlyAddedShelves, removedShelves, unmappedShelves };
```

- [ ] **Step 4:** `cd lambda && NODE_OPTIONS='--experimental-vm-modules' npx jest validateStaging` → GREEN (new + pre-existing tests).
- [ ] **Step 5: commit** `feat(#51,#56): validateStaging surfaces newlyAdded/removed/unmapped shelves` (+ Co-Authored-By trailer).

---

## Task 2: Honest validate panel + i18n

**Files:** Modify `admin/components/svg-manager/staging-panel.js` (the `validated.ok` branch, :47-56); add i18n keys (en + he — locate the i18n bundle the panel/svg-manager uses); Test `admin/__tests__/staging-panel.test.js`.

- [ ] **Step 1: failing test** — in `staging-panel.test.js`, render the panel with a `validated.ok` summary containing `newlyAddedShelves:[{svgCode:'X',floor:1}]`, `removedShelves:[{svgCode:'Y',floor:1}]`, `removedRefs:[]`, `unmappedShelves:[{svgCode:'X',floor:1},{svgCode:'ORPH',floor:1}]`. Assert the rendered HTML:
  - does NOT contain the string `no CSV changes needed`;
  - shows the newly-added count (1) and id `X`;
  - shows the removed-shelf count (1) and id `Y`;
  - shows "0 library entries will be unlinked" (removedRefs empty);
  - shows a *separate* pre-existing-unmapped count (1: `ORPH`, i.e. unmapped minus newly-added).
- [ ] **Step 2:** `npm --prefix admin test -- staging-panel` → RED.
- [ ] **Step 3: implement** — replace the `else if (validated.ok)` block (`staging-panel.js:47-52`) with honest sections derived from the new summary fields. Compute `preExistingUnmapped = unmappedShelves \ newlyAddedShelves` (by svgCode+floor). Render four short lines: **Newly added shelves** (count + ids, with a "needs library data" hint when present), **Removed shelves** (count + ids, informational), **Library entries that will be unlinked** (`removedRefs.length` — explicit even when 0), **Pre-existing unmapped shelves** (count, informational). No "no CSV changes needed." Route all labels through the i18n helper used elsewhere in the file/module; add `en` + matching `he` strings.
- [ ] **Step 4:** `npm --prefix admin test -- staging-panel svg-manager` → GREEN.
- [ ] **Step 5: commit** `feat(#51,#56): honest validate panel — separate new/orphan/removed; drop "no CSV changes needed"`.

---

## Task 3: Test gate
- [ ] `cd lambda && NODE_OPTIONS='--experimental-vm-modules' npx jest` → all green. Then `npm --prefix admin test` → pass only if the sole failing suites are the 4 known pre-existing ones (no NEW failures).

## Task 4: Lambda deploy gate (human) → redeploy validateStaging
- [ ] **Breakpoint (deploy/destructive):** approve redeploy of `primo-maps-validateStaging`. Then rebuild its zip (replace `validateStaging.mjs` in `lambda/dist/validateStaging.zip`, preserving other entries — mirror the Phase-1 promoteStaging deploy idiom) and `aws lambda update-function-code`; wait `LastUpdateStatus=Successful`; smoke-invoke (empty payload → 200 wrapping 401/409, no 5xx).

## Task 5: SPA deploy gate (human) → deploy SPA
- [ ] **Breakpoint (deploy):** approve `bash redeploy.sh` (admin SPA + `/admin/*` invalidation).

## Task 6: Manual e2e gate (human) → PR
- [ ] **Breakpoint (manual e2e):** stage a replace that adds one new shelf to a floor that also has known orphans, then re-upload the original. Confirm the panel reads honestly: newly-added shows **1** (not the orphan count), removed-shelves surfaces the dropped shelf, "library entries unlinked" shows the real number, and pre-existing orphans are listed separately — and "no CSV changes needed" is gone. On approval, push `feat/phase-2-validate-honesty` and open the PR (`Closes #51`, `Closes #56`; use the `gh api` REST fallback if `gh pr create` hits the Projects-classic bug).

---

## Self-Review
- #51 (separate new vs orphan) ✓ Task 1 `newlyAddedShelves`/`unmappedShelves` + Task 2 separate sections.
- #56 (surface SVG removals) ✓ Task 1 `removedShelves` + Task 2 removed section.
- Kill "no CSV changes needed" ✓ Task 2.
- Back-compat: `addedShelves`/`removedRefs` preserved so the reconcile wizard (Phase 4) keeps working ✓.
- Names consistent across tasks: `newlyAddedShelves`, `removedShelves`, `unmappedShelves`, `removedRefs`, `addedShelves`.
- Deploy gates for the Lambda + SPA (alwaysBreakOn: deploy) ✓.
