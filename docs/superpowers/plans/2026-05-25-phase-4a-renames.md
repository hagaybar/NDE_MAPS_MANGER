# Phase 4a — Renames in the reconcile wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** When a CSV-referenced shelf is renamed in the SVG, the reconcile wizard pre-fills the **detected** rename (`old → new`, from Phase 3's `summary.renames`) as a one-click **Confirm**, with a **Treat as separate add+remove** fallback — and the rename target is no longer limited to a narrow dropdown. Confirming applies `old → new` to the staged CSV so validation passes.

**Architecture:** **Client-only.** The backend already supports the `rename` reconcile action (`applyReconcileToStaging` sets `row.svgCode = to`); the wizard already builds rename/delete maps. 4a only changes the wizard's *inputs and rendering*: feed it `summary.renames` + the union of unmapped/newly-added shelves as rename targets, and pre-select detected renames. No Lambda change → no Lambda deploy.

**Tech:** vanilla JS ES modules; admin jest via `npm --prefix admin test -- <pattern>`. Spec: `docs/superpowers/specs/2026-05-25-phase-4-reconcile-wizard-design.md` (the 4a slice). Closes the "rename targets limited to existing orphans" half of #59.

**Branch:** `feat/phase-4a-renames` (off main). Tag: `pre-phase-4a-2026-05-25`.

## File structure
- **Modify** `admin/components/svg-manager/reconcile-wizard.js` — accept `diff.renames` + `diff.candidateTargets`; pre-select detected renames; render a "detected rename" hint.
- **Modify** `admin/components/svg-manager.js` — the `open-reconcile-wizard` handler builds the per-floor `diff` to include `renames` and `candidateTargets` (newlyAdded ∪ unmapped for the floor).
- **Test** `admin/__tests__/reconcile-wizard.test.js`.

> Note: the wizard is currently English-only (no i18n); 4a keeps that style for new strings — wizard Hebrew/i18n is a pre-existing gap, out of 4a scope.

---

## Task 1: Wizard renders + pre-selects detected renames

**Files:** Modify `admin/components/map-editor`? no — `admin/components/svg-manager/reconcile-wizard.js`; Test `admin/__tests__/reconcile-wizard.test.js`.

- [ ] **Step 1: failing tests** — add to `reconcile-wizard.test.js`:

```js
/** @jest-environment jsdom */
import { renderReconcileWizard } from '../components/svg-manager/reconcile-wizard.js';

function host(){ const d=document.createElement('div'); document.body.appendChild(d); return d; }

test('a detected rename is pre-selected with a hint, and submit yields rename old->new', () => {
  const h = host();
  let submitted = null;
  renderReconcileWizard(h, {
    floor: 1,
    removedRefs: [{ svgCode: 'CC_1-4', affectedRowCount: 2 }],
    candidateTargets: [{ svgCode: 'CC_X-Y' }],
    renames: [{ fromCode: 'CC_1-4', toCode: 'CC_X-Y' }],
  }, (floor, map) => { submitted = { floor, map }; });
  const row = h.querySelector('[data-reconcile-row][data-svg-code="CC_1-4"]');
  expect(row.querySelector('select').value).toBe('rename:CC_X-Y');           // pre-selected
  expect(row.textContent).toMatch(/detected/i);                              // hint shown
  expect(h.querySelector('[data-action="submit-reconcile"]').disabled).toBe(false); // pre-selected ⇒ ready
  h.querySelector('[data-action="submit-reconcile"]').click();
  expect(submitted.map).toEqual({ 'CC_1-4': { action: 'rename', to: 'CC_X-Y' } });
});

test('treat-as-separate: switching a detected row to delete yields a delete action', () => {
  const h = host(); let submitted = null;
  window.confirm = () => true;
  renderReconcileWizard(h, { floor: 1, removedRefs:[{svgCode:'CC_1-4',affectedRowCount:1}], candidateTargets:[{svgCode:'CC_X-Y'}], renames:[{fromCode:'CC_1-4',toCode:'CC_X-Y'}] }, (f,m)=>{submitted={f,m}});
  const sel = h.querySelector('[data-reconcile-row] select'); sel.value='delete'; sel.dispatchEvent(new Event('change'));
  h.querySelector('[data-action="submit-reconcile"]').click();
  expect(submitted.m).toEqual({ 'CC_1-4': { action: 'delete' } });
});

test('un-detected removed ref can be renamed to any candidate target', () => {
  const h = host(); let submitted=null;
  renderReconcileWizard(h, { floor:1, removedRefs:[{svgCode:'OLD',affectedRowCount:1}], candidateTargets:[{svgCode:'NEW_A'},{svgCode:'NEW_B'}], renames:[] }, (f,m)=>{submitted={f,m}});
  const row=h.querySelector('[data-reconcile-row]');
  expect(row.querySelector('select').value).toBe('');                        // not pre-selected
  expect([...row.querySelectorAll('option')].some(o=>o.value==='rename:NEW_B')).toBe(true);
  row.querySelector('select').value='rename:NEW_B'; row.querySelector('select').dispatchEvent(new Event('change'));
  h.querySelector('[data-action="submit-reconcile"]').click();
  expect(submitted.m).toEqual({ 'OLD': { action: 'rename', to: 'NEW_B' } });
});
```

- [ ] **Step 2:** `npm --prefix admin test -- reconcile-wizard` → RED.
- [ ] **Step 3: implement** — update `renderReconcileWizard` so each removed-ref row supports `diff.renames` + `diff.candidateTargets` (fall back to the legacy `diff.addedShelves` if `candidateTargets` absent, for back-compat):

```js
export function renderReconcileWizard(host, diff, onSubmit) {
  const detected = {};
  (diff.renames || []).forEach(r => { detected[r.fromCode] = r.toCode; });
  const candidates = (diff.candidateTargets || diff.addedShelves || []).map(c => c.svgCode);

  const rowsHtml = diff.removedRefs.map(removed => {
    const det = detected[removed.svgCode];                 // detected new code, or undefined
    const targetCodes = [...candidates];
    if (det && !targetCodes.includes(det)) targetCodes.unshift(det); // ensure the detected target is selectable
    const options = [
      det ? '' : `<option value="">-- choose --</option>`, // detected rows start pre-selected
      ...targetCodes.map(code =>
        `<option value="rename:${escapeAttr(code)}"${code === det ? ' selected' : ''}>Rename to ${escapeHtml(code)}${code === det ? ' (detected)' : ''}</option>`
      ),
      `<option value="delete">Treat as separate / delete ${removed.affectedRowCount} CSV row${removed.affectedRowCount === 1 ? '' : 's'}</option>`,
    ].join('');
    const hint = det
      ? `<span class="ml-2 text-xs text-green-700">↺ detected rename → ${escapeHtml(det)}</span>`
      : '';
    return `
      <tr data-reconcile-row data-svg-code="${escapeAttr(removed.svgCode)}">
        <td class="px-3 py-2 font-mono text-xs">${escapeHtml(removed.svgCode)}${hint}</td>
        <td class="px-3 py-2 text-xs">${removed.affectedRowCount}</td>
        <td class="px-3 py-2"><select class="border rounded px-2 py-1 text-sm">${options}</select></td>
      </tr>`;
  }).join('');
  // ... the rest of the function (host.innerHTML template, updateSubmitState, change + submit
  //     listeners, the delete-confirm, onSubmit) stays exactly as today.
```

Keep `updateSubmitState`, the change/submit listeners, the delete-confirm, and the map-building submit handler unchanged — pre-selected detected rows already have a non-empty `select.value`, so the submit button enables correctly.

- [ ] **Step 4:** `npm --prefix admin test -- reconcile-wizard` → GREEN (3 tests).
- [ ] **Step 5: commit** `feat(#59): reconcile wizard pre-fills detected renames + broadens rename targets`.

---

## Task 2: Feed `renames` + candidate targets into the wizard

**Files:** Modify `admin/components/svg-manager.js` (the `open-reconcile-wizard` click handler).

- [ ] **Step 1:** In the `open-reconcile-wizard` handler, when building `byFloor`, also collect `renames` and candidate targets from `validated.summary`. Replace the current `removedRefs`/`addedShelves` grouping with:

```js
    const byFloor = {};
    const ensure = f => (byFloor[f] = byFloor[f] || { floor: f, removedRefs: [], candidateTargets: [], renames: [] });
    for (const r of validated.summary.removedRefs || []) ensure(r.floor).removedRefs.push(r);
    // candidate rename targets = shelves present in the staged SVG but unmapped (newly-added ∪ orphans)
    for (const a of validated.summary.newlyAddedShelves || []) ensure(a.floor).candidateTargets.push({ svgCode: a.svgCode });
    for (const u of validated.summary.unmappedShelves || []) {
      const f = ensure(u.floor);
      if (!f.candidateTargets.some(c => c.svgCode === u.svgCode)) f.candidateTargets.push({ svgCode: u.svgCode });
    }
    for (const rn of validated.summary.renames || []) ensure(rn.floor).renames.push(rn);
    const firstFloor = Object.values(byFloor)[0];
```

Then `renderReconcileWizard(document.getElementById('staging-panel-host'), firstFloor, async (floor, reconcileMap) => { ... })` — the onSubmit body (POST `/reconcile` → `/validate` → `refreshStagingPanel`) stays unchanged.

- [ ] **Step 2:** Manually confirm (covered by Task 1's unit tests for the wizard + the existing svg-manager suite): `npm --prefix admin test -- svg-manager reconcile-wizard` → no new failures.
- [ ] **Step 3: commit** `feat(#59): pass detected renames + unmapped candidates from validate summary to the wizard`.

---

## Task 3: Test gate
- [ ] `npm --prefix admin test` → only the 4 known pre-existing suites fail (data-model/validation/user-menu/edit-user-dialog); `reconcile-wizard` + `svg-manager` green.

## Task 4: SPA deploy gate (human) → deploy
- [ ] **Breakpoint (deploy):** approve `bash redeploy.sh` (admin SPA + `/admin/*` invalidation). No Lambda change in 4a.

## Task 5: Manual e2e gate (human) → PR
- [ ] **Breakpoint (manual e2e):** upload a `floor_N.svg` where a **CSV-referenced** shelf's `id` is renamed (keep its `data-shelf-uid`). Validate → it fails (CSV ref to the old code) → open the reconcile wizard → confirm the **detected rename is pre-filled** (`old → new`, "detected") → Apply → re-validate passes → promote. Also confirm an *un-detected* removed ref can be renamed to a newly-added shelf. On approval, push `feat/phase-4a-renames` and open the PR (`References #59`; `gh api` REST fallback if `gh pr create` hits the Projects-classic bug).

---

## Self-Review
- Pre-fill detected renames ✓ (Task 1 + 2). Treat-as-separate ✓ (Task 1 test 2). Broaden targets beyond orphans ✓ (candidateTargets = newlyAdded ∪ unmapped, Task 2). Backend unchanged (rename action exists) ✓. Client-only → SPA deploy only ✓.
- Names consistent: `diff.renames` `{fromCode,toCode}`, `diff.candidateTargets` `[{svgCode}]`, map `{action:'rename',to}` / `{action:'delete'}`.
- #59 note: 4a addresses the rename-targeting half; the delete-preserves-metadata half is 4c.
