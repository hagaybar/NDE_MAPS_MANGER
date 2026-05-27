# Phase 4b — Reconcile wizard "Added" group (#57) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Before promote, make the librarian decide per new unmapped shelf: **Add library info now** (inline form → appends a validated staged-CSV row), **Leave unmapped** (explicit), or **Not a real shelf** (discard + re-upload — no in-app SVG editing). Closes #57.

**Architecture:** New `add` action in `applyReconcileToStaging` (append a server-validated row); a new "Added" group + inline form in `reconcile-wizard.js`; passed-state panel gates Promote behind a "Review N new shelves" step. Client interpolation stays caller-side (`.replace`). Spec: `docs/superpowers/specs/2026-05-27-phase-4b-adds-design.md`.

**Tech Stack:** Node ESM Lambda (jest + aws-sdk-client-mock), vanilla-JS admin SPA (jest/jsdom), Playwright. Runners: `cd lambda && node --experimental-vm-modules node_modules/.bin/jest <f>`; `cd admin && node --experimental-vm-modules node_modules/.bin/jest <f>`.

---

## File Structure

- `lambda/applyReconcileToStaging.mjs` — Modify: handle `action: 'add'` (append validated rows; fetch staged SVG for the bundle check).
- `lambda/__tests__/applyReconcileToStaging.test.mjs` — Modify: add `add`-action tests.
- `admin/components/svg-manager/reconcile-wizard.js` — Modify: render an "Added" group + inline add-entry form; build `add` payload entries.
- `admin/__tests__/reconcile-wizard.test.js` — Modify: Added-group + form tests.
- `admin/components/svg-manager.js` — Modify: open the wizard for the adds case; submit adds → re-validate; track leave-unmapped; FALLBACKS for new strings.
- `admin/components/svg-manager/staging-panel.js` — Modify: when `newlyAddedShelves>0`, show "Review N new shelves" + gate Promote.
- `admin/__tests__/staging-panel.test.js` — Modify: gate behavior.
- `admin/i18n/en.json`, `admin/i18n/he.json` — Add `svg.staging.reconcile.added.*` (spec table).
- `e2e/tests/sot-staging.spec.ts` — Add the add-flow happy path.

---

## Task 1: Backend — `add` action in applyReconcileToStaging

**Files:** `lambda/applyReconcileToStaging.mjs`; test `lambda/__tests__/applyReconcileToStaging.test.mjs`.

- [ ] **Step 1: Write failing lambda tests**

Add to the describe block (mirror the file's existing aws-sdk-client-mock setup — read it first for the exact `s3Mock`/`streamFromString`/`event` helpers). Cover:
```js
test('add action appends a validated new-shelf row (#57)', async () => {
  // staged SVG floor 1 has the new shelf NEW_1; staged CSV does not reference it
  // (set up GetObject mocks for staging/.meta.json {locked,owner}, staging/data/mapping.csv,
  //  staging/maps/floor_1.svg containing <rect id="NEW_1" data-map-object="shelf"/>, PutObject ok)
  // POST { floor:1, reconcileMap: { NEW_1: { action:'add', fields:{ libraryName:'Lib', collectionName:'Coll', rangeStart:'A1', rangeEnd:'A9' } } } }
  // → 200; the PutObject body (staging/data/mapping.csv) now contains a row with svgCode NEW_1, floor 1, the fields.
});
test('add rejects 422 when a required field is missing', async () => { /* omit collectionName → 422 {error, svgCode:'NEW_1'} */ });
test('add rejects 422 when range start>end or prefix mismatch', async () => { /* rangeStart 'A9' rangeEnd 'A1' → 422 */ });
test('add rejects 422 when svgCode does not resolve on its floor', async () => { /* staged SVG lacks NEW_1 → 422 */ });
test('rename and add in one reconcileMap both apply', async () => { /* existing row CC_X rename→CC_Y + add NEW_1 → both in output */ });
```
(Use the exact mock idiom already in the file; assert on the `PutObjectCommand` input `Body` via `s3Mock.commandCalls(PutObjectCommand)`.)

- [ ] **Step 2: Run, verify FAIL**
Run: `cd lambda && node --experimental-vm-modules node_modules/.bin/jest applyReconcileToStaging`
Expected: FAIL (add unsupported → falls into the `Unknown action` 422, or row never appended).

- [ ] **Step 3: Implement the `add` action**

In `lambda/applyReconcileToStaging.mjs`:

(a) Add imports at top:
```js
import { parseSvg } from './shared/svg-shelves.mjs';
import { parseCallNumber, compareCallNumbers } from './range-validation.mjs';
```

(b) In the existing per-row loop, the `else` that returns `Unknown action` must NOT reject `add` (an add's svgCode normally has no existing row, so it won't be hit; but guard: treat `add` as pass-through there if a row coincidentally matches — skip changing existing rows for `add`). Simplest: in the loop, only act on `rename`/`delete`; for any other action leave the row as-is (`newRows.push(row)`), and validate unknown actions in the append pass instead. Replace the loop's `else { return 422 Unknown action }` with `else { newRows.push(row); }`.

(c) After the loop and BEFORE `serializeRowsToCsv`, append the adds. First load the floor's staged shelves for the bundle check:
```js
// New-shelf adds: append validated rows for reconcileMap entries with action 'add'.
const addEntries = Object.entries(reconcileMap).filter(([, e]) => e && e.action === 'add');
let stagedShelfIds = null;
if (addEntries.length) {
  let svg;
  try { svg = await fetchObject(`staging/maps/floor_${Number(floor)}.svg`); }
  catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') svg = await fetchObject(`maps/floor_${Number(floor)}.svg`);
    else throw err;
  }
  stagedShelfIds = new Set(parseSvg(svg).shelves);
}
for (const [svgCode, entry] of addEntries) {
  const f = entry.fields || {};
  const required = ['libraryName', 'collectionName', 'rangeStart', 'rangeEnd'];
  for (const k of required) {
    if (!String(f[k] ?? '').trim()) {
      return createAuthResponse(422, { error: `add action missing required field "${k}"`, svgCode }, CORS_HEADERS);
    }
  }
  const start = parseCallNumber(String(f.rangeStart));
  const end = parseCallNumber(String(f.rangeEnd));
  if (start.prefix !== end.prefix) {
    return createAuthResponse(422, { error: 'range start and end must share a prefix', svgCode }, CORS_HEADERS);
  }
  if (compareCallNumbers(String(f.rangeStart), String(f.rangeEnd)) > 0) {
    return createAuthResponse(422, { error: 'range start must be ≤ range end', svgCode }, CORS_HEADERS);
  }
  if (!stagedShelfIds.has(svgCode)) {
    return createAuthResponse(422, { error: 'svgCode does not resolve to a shelf on its floor', svgCode }, CORS_HEADERS);
  }
  const row = {};
  for (const col of COLUMNS) row[col] = String(f[col] ?? '');
  row.svgCode = svgCode;
  row.floor = String(Number(floor));
  newRows.push(row);
  affected += 1;
}
```
(`COLUMNS` is defined later in the file via hoisting of `const`? No — `const COLUMNS` is not hoisted for use above its definition. **Move the `COLUMNS` declaration up** to just under the imports so it's in scope here, or reference it after definition. Move `COLUMNS` to the top.)

- [ ] **Step 4: Run, verify PASS**
Run: `cd lambda && node --experimental-vm-modules node_modules/.bin/jest applyReconcileToStaging`
Expected: PASS (all existing rename/delete tests + the new add tests).

- [ ] **Step 5: Commit**
```bash
git add lambda/applyReconcileToStaging.mjs lambda/__tests__/applyReconcileToStaging.test.mjs
git commit -m "feat(reconcile): add action appends a validated new-shelf row (#57)"
```

---

## Task 2: Wizard "Added" group + inline add-entry form

**Files:** `admin/components/svg-manager/reconcile-wizard.js`; test `admin/__tests__/reconcile-wizard.test.js`.

**Context:** `renderReconcileWizard(host, diff, onSubmit, onCancel)` currently renders removed-ref cards and submits `{action:'rename'|'delete'}`. 4b adds an **Added mode**: when `diff.newlyAddedShelves` is present (and there are no removedRefs, i.e. the validation-passed entry path), render the Added group instead. Keep the existing removed-ref rendering untouched.

- [ ] **Step 1: Write failing wizard unit tests**

Add to `reconcile-wizard.test.js`:
```js
test('renders an Added card per newlyAddedShelves with Add/Leave choices', () => {
  renderReconcileWizard(host, { floor: 1, newlyAddedShelves: [{svgCode:'NEW_1',floor:1},{svgCode:'NEW_2',floor:1}] }, () => {}, () => {});
  expect(host.querySelectorAll('[data-added-card]').length).toBe(2);
  // Apply disabled until each card has a choice
  expect(host.querySelector('[data-action="submit-added"]').disabled).toBe(true);
});
test('choosing "add now" reveals the form; required fields gate Apply', () => { /* pick add-now on a card; Apply stays disabled until library/collection/range filled */ });
test('submit builds add entries from filled cards', async () => {
  let captured;
  renderReconcileWizard(host, { floor:1, newlyAddedShelves:[{svgCode:'NEW_1',floor:1}] }, (floor, map) => { captured = {floor, map}; }, ()=>{});
  // choose add-now, fill libraryName/collectionName/rangeStart/rangeEnd, click submit-added
  expect(captured.map.NEW_1).toEqual({ action:'add', fields: expect.objectContaining({ libraryName: expect.any(String), collectionName: expect.any(String), rangeStart: expect.any(String), rangeEnd: expect.any(String) }) });
});
test('leave-unmapped cards produce no map entry', () => { /* a card left "leave unmapped" → not a key in the submitted map */ });
```
(Match the file's existing test idiom + locale-forcing.)

- [ ] **Step 2: Run, verify FAIL**
Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest reconcile-wizard`
Expected: FAIL (no Added rendering).

- [ ] **Step 3: Implement the Added group**

In `reconcile-wizard.js`, add an Added-mode branch at the top of `renderReconcileWizard` (before the removed-refs rendering):
```js
const added = diff.newlyAddedShelves || [];
if (added.length && !(diff.removedRefs && diff.removedRefs.length)) {
  return renderAddedGroup(host, diff, added, onSubmit, onCancel);
}
```
Implement `renderAddedGroup`:
- Title `t('svg.staging.reconcile.added.title')`.
- One card per shelf (`data-added-card data-svg-code="..."`), each with two radios (`name="added-<code>"`): `value="add-now"` (label `…added.addNow`) and `value="leave"` (label `…added.leaveUnmapped`). When `add-now` is selected, reveal an inline form (initially hidden / built on toggle) with inputs for every CSV column: prefilled read-only `svgCode` + `floor`; **required** `libraryName`,`collectionName`,`rangeStart`,`rangeEnd`; optional `libraryNameHe`,`collectionNameHe`,`description`,`descriptionHe`,`shelfLabel`,`shelfLabelHe`,`notes`,`notesHe`. Use the **existing CSV-editor column i18n label keys** for field labels (read `csv-editor.js`/i18n for the exact keys, e.g. `csv.columns.libraryName` — grep to confirm) so no new label strings are needed.
- A separate footer block: `…added.notReal` heading + `…added.notRealHelp` + a `data-action="discard-from-added"` button (the SVG-manager wires it to the existing discard).
- `data-action="submit-added"` (label `…added.apply`), `data-action="cancel-added"` (reuse cancel label).
- **Apply enablement:** enabled iff every card has a radio chosen AND every `add-now` card has its 4 required inputs non-empty AND each `add-now` card's range passes the client range check (reuse the range validation already in `csv-editor.js` — import or replicate the same `rangeStart`/`rangeEnd` prefix+order check; if importing is awkward, do a minimal inline check: same leading-letters prefix and start ≤ end by the existing `parseCallNumber` logic mirrored client-side — keep it consistent with `admin/services` if a helper exists; grep first).
- **Submit:** build `map = {}`; for each `add-now` card, `map[code] = { action: 'add', fields: { ...collected non-empty columns } }`; `leave` cards contribute nothing. Call `onSubmit(diff.floor, map, { leftUnmapped: [codes...] })` (extend the callback with a 3rd arg listing leave-unmapped codes so the caller can track acknowledgement; the existing removed-ref path calls `onSubmit(floor, map)` — keep that working, 3rd arg optional).

Reuse the file's `escapeHtml`/`escapeAttr` + `t`.

- [ ] **Step 4: Run, verify PASS**
Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest reconcile-wizard`
Expected: PASS.

- [ ] **Step 5: Add i18n keys + validate parse** — add `svg.staging.reconcile.added.*` (spec table) to `en.json` + `he.json` + matching `FALLBACKS` in `reconcile-wizard.js`. Validate JSON parses.

- [ ] **Step 6: Commit**
```bash
git add admin/components/svg-manager/reconcile-wizard.js admin/__tests__/reconcile-wizard.test.js admin/i18n/en.json admin/i18n/he.json
git commit -m "feat(reconcile-wizard): Added group + inline add-entry form (#57)"
```

---

## Task 3: Panel gating + SVG-manager wiring

**Files:** `admin/components/svg-manager/staging-panel.js`, `admin/components/svg-manager.js`; tests `admin/__tests__/staging-panel.test.js`.

- [ ] **Step 1: Write failing panel test**

In `staging-panel.test.js`: when `lastValidated.ok` and `summary.newlyAddedShelves.length>0`, the panel shows a `[data-action="review-new-shelves"]` control and does NOT show an enabled `[data-action="promote-staging"]` (gated). When `newlyAddedShelves` is empty, Promote shows as before.

- [ ] **Step 2: Run, verify FAIL** — `cd admin && node --experimental-vm-modules node_modules/.bin/jest staging-panel` → FAIL.

- [ ] **Step 3: Implement gating + wiring**

(a) `staging-panel.js` (passed branch): compute `const needsReview = newlyAdded.length > 0;`. When `needsReview`, render a `review-new-shelves` button (label `…added.reviewButton` with `{count}`) in place of the promote button, plus a short gate line; otherwise the existing promote button. (Keep the renamed/removed/unlinked/pre-existing sections.) The "leave unmapped → unlock" state is held in `svg-manager.js` (Step 3c), which re-renders the panel passing a flag; simplest: `renderStagingPanel(host, status, { ...opts, addsReviewed: bool })` — when `addsReviewed` is true, show Promote even if `newlyAdded>0`.

(b) `svg-manager.js`: add a click handler for `[data-action="review-new-shelves"]` that opens the wizard in Added mode:
```js
renderReconcileWizard(wizardHost,
  { floor: <floor-of-first-new-shelf-or-multi>, newlyAddedShelves: summary.newlyAddedShelves },
  async (floor, map, info) => {
    if (Object.keys(map).length) {
      const resp = await fetch(`${STAGING_API_BASE}/reconcile`, { method:'POST', headers, body: JSON.stringify({ floor, reconcileMap: map }) });
      if (!resp.ok) { showToast(t('svg.staging.reconcileFailed')); return; }
    }
    // mark this session's adds as reviewed (added rows will drop from newlyAddedShelves on re-validate;
    // leave-unmapped codes are acknowledged) → re-validate + re-render with addsReviewed=true
    addsReviewed = true;
    await revalidateAndRefresh();
  },
  () => { /* cancel → close wizard, panel unchanged */ });
```
Track `addsReviewed` (module/closure flag) and **reset it whenever a new upload/validate starts** (so a fresh staging requires a fresh review). Wire `[data-action="discard-from-added"]` to the existing discard handler. Multi-floor note: `newlyAddedShelves` may span floors; submit per-floor reconcile calls (group `map` by `entry`'s floor) — or, since the form prefills floor per card, post one reconcile per distinct floor present in the chosen adds.

(c) Add `FALLBACKS` for any new svg-manager strings used (e.g. the reconcile-failed toast already exists).

- [ ] **Step 4: Run, verify PASS** — `cd admin && node --experimental-vm-modules node_modules/.bin/jest staging-panel svg-manager` → PASS.

- [ ] **Step 5: Full admin suite** — `cd admin && node --experimental-vm-modules node_modules/.bin/jest 2>&1 | tail -6` → green except the 14 known pre-existing failures.

- [ ] **Step 6: Commit**
```bash
git add admin/components/svg-manager/staging-panel.js admin/components/svg-manager.js admin/__tests__/staging-panel.test.js
git commit -m "feat(staging-panel): gate promote behind new-shelf review (#57)"
```

---

## Task 4: E2E + full verification

**Files:** `e2e/tests/sot-staging.spec.ts`.

- [ ] **Step 1: Add the add-flow happy path**

A test: mock validate to return `ok:true` with `summary.newlyAddedShelves:[{svgCode:'NEW_1',floor:1}]`; mock `/staging/reconcile` ok and `/staging/validate` (post-reconcile) to return `newlyAddedShelves:[]`; mock `/staging/promote` ok. Flow: upload → panel shows `[data-action="review-new-shelves"]` (Promote gated) → click it → wizard Added card → choose "add now" → fill library/collection/range → `[data-action="submit-added"]` → panel now allows `[data-action="promote-staging"]` → promote → "Your new map is now live." Mirror the existing `sot-staging` mock idiom + `localStorage.locale='en'`.

- [ ] **Step 2: Run e2e**
```bash
npx http-server . -p 8123 -c-1 --silent &
E2E_BASE_URL=http://localhost:8123 npx playwright test sot-staging --project=en-admin 2>&1 | tail -20
PID=$(ss -ltnp 2>/dev/null | grep ':8123' | grep -oP 'pid=\K[0-9]+' | head -1); [ -n "$PID" ] && kill "$PID"
```
Expected: the new add-flow test passes; the pre-existing reconcile-wizard removed-ref `[data-reconcile-row] select` failure remains the only failure (out of scope).

- [ ] **Step 3: Commit (if changed)**
```bash
git add e2e/tests/sot-staging.spec.ts
git commit -m "test(e2e): new-shelf add flow (#57)"
```

---

## Task 5: Deploy (gated)

- [ ] **Step 1: Deploy SPA** — `./redeploy.sh` (S3 + CloudFront `/admin/*`).
- [ ] **Step 2: Deploy the Lambda** — rebuild `lambda/dist/applyReconcileToStaging.zip` (same layout as the other staging Lambdas: the `.mjs` files at root incl. `range-validation.mjs` + `shared/*.mjs` + `node_modules/jose`; build with python `zipfile` since `zip` CLI is absent) and `aws lambda update-function-code --function-name primo-maps-applyReconcileToStaging --zip-file fileb://lambda/dist/applyReconcileToStaging.zip`. Wait for `LastUpdateStatus: Successful`.
- [ ] **Step 3: Verify live** — hard-refresh `https://d3h8i7y9p8lyw7.cloudfront.net/admin/`; stage an SVG with a new shelf → panel shows "Review N new shelves" → add entry → promote; confirm the new row landed.

---

## Self-Review

- **Spec coverage:** Backend add → T1; wizard Added group + form → T2; panel gate + wiring → T3; e2e → T4; deploy (SPA + applyReconcileToStaging Lambda) → T5. Acceptance 1 (gate)→T3; 2 (add row)→T1+T2; 3 (leave unmapped)→T2+T3; 4 (not-real → discard)→T2/T3; 5 (validation/parity)→T1+i18n. ✓
- **Placeholder scan:** backend code is concrete; client steps give the structure + key snippets and point at the spec i18n table + existing CSV-editor labels (read-and-reuse, not invent). The `COLUMNS` hoist note is called out.
- **Name consistency:** action `add` + `{fields}` shape identical across T1 (Lambda), T2 (wizard payload), T4 (e2e mock); `data-action` names (`review-new-shelves`, `submit-added`, `discard-from-added`) consistent across T2/T3; i18n `svg.staging.reconcile.added.*` consistent with the spec. ✓
