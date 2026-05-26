# #50 Option 2 — poll-until-fresh (Free-plan compatible) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** After a staging promote, the Map Editor *and* the SVG Manager "Replace" thumbnail re-render the changed floor **automatically** (no hard refresh) — without any CloudFront change — by polling until the promote's CloudFront invalidation has propagated, then re-rendering.

**Why (not `?v=`):** Distribution `E5SR0E5GM5GSB` is on CloudFront's Free pricing plan, which rejects both custom cache policies and legacy `ForwardedValues`, so query-string cache keys are impossible. The promote already issues a CloudFront invalidation; once it propagates (~tens of seconds) the bare URL serves fresh bytes. We detect that via an **ETag change** and re-render. The clean `?v=` upgrade is deferred to **issue #65**.

**Builds on:** branch `fix/50-map-editor-refresh` (commits already present: `loadFloorSvg(...,cacheBust)`, `promote-refresh.js`, map-editor wiring, `svg-promoted` producer, SVG Manager `mapAssetUrl`/`mapCacheBusters`). This plan **modifies** the refresh mechanism; it does not start over. Rollback tag `pre-50-redo-2026-05-25`.

**Tech:** Vanilla JS ES modules; Jest via `npm --prefix admin test -- <pattern>` (fake timers for poll loops). Same-origin (`/admin/` and `/maps/` both on the CloudFront host) → response `ETag` is readable.

**Design:** `loadFloorSvg` records the rendered ETag per floor. On `svg-promoted`, `pollUntilFresh()` re-fetches the map (browser-cache-busted) every ~3s, comparing the served ETag to the last-rendered one; on change it re-renders via `loadFloor()` (Map Editor) / `renderGrid()` (SVG Manager). Cap ~60s; on timeout, stop quietly (rare worst case still needs a manual refresh — accepted trade-off).

---

## Task 1: `loadFloorSvg` records the rendered ETag

**Files:** Modify `admin/components/map-editor/svg-loader.js`; Test `admin/__tests__/svg-loader-etag.test.js` (create).

- [ ] **Step 1: failing test**

```js
/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { loadFloorSvg, getRenderedEtag } from '../components/map-editor/svg-loader.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="x"/></svg>';
describe('loadFloorSvg records rendered ETag', () => {
  let canvas;
  beforeEach(() => { document.body.innerHTML = '<div id="c"></div>'; canvas = document.getElementById('c'); });
  test('captures the response ETag for the floor', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, headers: { get: (h) => (h.toLowerCase() === 'etag' ? '"abc"' : null) }, text: async () => SVG,
    });
    await loadFloorSvg(1, canvas);
    expect(getRenderedEtag(1)).toBe('"abc"');
  });
});
```

- [ ] **Step 2:** `npm --prefix admin test -- svg-loader-etag` → RED (no `getRenderedEtag`).
- [ ] **Step 3: implement** — in `svg-loader.js` add a module map + export, and record on load:

```js
const _renderedEtag = {};
export function getRenderedEtag(floorNumber) { return _renderedEtag[floorNumber]; }
```
Inside `loadFloorSvg`, after `const resp = await fetch(...)` and the `resp.ok` check, before/after reading text, capture:
```js
  const etag = resp.headers && resp.headers.get ? resp.headers.get('etag') : null;
  if (etag) _renderedEtag[floorNumber] = etag;
```
Keep the existing `cacheBust` param and `cache:'no-cache'` + preserved-children logic.

- [ ] **Step 4:** `npm --prefix admin test -- svg-loader-etag svg-loader svg-loader-cachebust` → GREEN.
- [ ] **Step 5: commit** `feat(#50): loadFloorSvg records rendered ETag per floor` (+ Co-Authored-By trailer).

---

## Task 2: `promote-refresh` polls until fresh, then reloads

**Files:** Modify `admin/components/map-editor/promote-refresh.js`; Modify `admin/__tests__/promote-refresh.test.js`.

- [ ] **Step 1: failing tests** — add (using fake timers + a fetch whose ETag changes on the Nth call) that `pollUntilFresh` calls `onFresh` once when the served ETag differs from the baseline, and does NOT call it if the ETag never changes before the timeout. Example:

```js
test('pollUntilFresh fires onFresh when the ETag changes', async () => {
  jest.useFakeTimers();
  let calls = 0;
  jest.spyOn(global, 'fetch').mockImplementation(async () => ({ ok: true, headers: { get: () => (++calls >= 3 ? '"new"' : '"old"') } }));
  const onFresh = jest.fn();
  const { pollUntilFresh } = await import('../components/map-editor/promote-refresh.js');
  pollUntilFresh({ url: 'https://x/maps/floor_1.svg', baselineEtag: '"old"', onFresh, intervalMs: 1000, timeoutMs: 10000 });
  await jest.advanceTimersByTimeAsync(3000);
  expect(onFresh).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
```
Add a timeout test: ETag stays `"old"`, advance past `timeoutMs`, assert `onFresh` not called.

- [ ] **Step 2:** run → RED.
- [ ] **Step 3: implement** — add `pollUntilFresh` and rewire the listener handler:

```js
/**
 * Poll a URL until its ETag differs from baseline (CloudFront invalidation has
 * propagated), then fire onFresh once. Free-plan path for #50 (no ?v= edge key).
 */
export function pollUntilFresh({ url, baselineEtag, onFresh, intervalMs = 3000, timeoutMs = 60000 }) {
  const started = Date.now();
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const bust = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`; // browser-cache bust only
      const resp = await fetch(bust, { cache: 'reload' });
      const etag = resp && resp.headers && resp.headers.get ? resp.headers.get('etag') : null;
      if (etag && etag !== baselineEtag) { stopped = true; onFresh(); return; }
    } catch (_) { /* transient; keep polling */ }
    if (Date.now() - started >= timeoutMs) { stopped = true; return; }
    setTimeout(tick, intervalMs);
  };
  setTimeout(tick, intervalMs);
  return () => { stopped = true; };
}
```
Rewire `installPromoteRefreshListener` so its handler, when the current floor changed, calls `pollUntilFresh({ url: <CloudFront>/maps/floor_<floor>.svg, baselineEtag: getRenderedEtag(floor) from svg-loader, onFresh: () => { _floorCacheBust[floor] = nextCacheBust(); reloadFloor(floor); } })`. Import `getRenderedEtag` from `./svg-loader.js`. Keep `nextCacheBust`/`floorChangedInPromote`/`getFloorCacheBust` exports. Update the existing listener tests to drive fake timers (the reload now happens after a poll detects the ETag change), keeping the "no-op when floor unchanged / currentFloor null" and dispose tests.

- [ ] **Step 4:** `npm --prefix admin test -- promote-refresh` → GREEN.
- [ ] **Step 5: commit** `feat(#50): poll until CloudFront invalidation propagates, then reload floor`.

---

## Task 3: SVG Manager thumbnail polls until fresh

**Files:** Modify `admin/components/svg-manager.js`; Modify/Create `admin/__tests__/svg-manager-preview-refresh.test.js`.

- [ ] **Step 1: failing test** — after a mocked promote, with fetch's ETag changing after a couple of polls (fake timers), assert the grid `<img>` for `floor_1.svg` ends with a busted src (`floor_1.svg?v=` / `&_=`) AND that the grid re-rendered after the ETag change (not before).
- [ ] **Step 2:** run → RED.
- [ ] **Step 3: implement** — in the promote handler, replace the immediate `mapCacheBusters[...] = previewBust; await loadFiles()` for changed maps with: for each changed map file, `pollUntilFresh({ url: mapAssetUrl-bare, baselineEtag: <captured pre-promote etag via a HEAD/GET at handler start, or the last grid render>, onFresh: () => { mapCacheBusters[name] = Date.now().toString(36); renderGrid(); } })`. Import `pollUntilFresh` from `./map-editor/promote-refresh.js`. Keep `mapAssetUrl`/`mapCacheBusters` from the existing commit. The bare thumbnail still works for Primo; only changed maps poll+rerender.
- [ ] **Step 4:** `npm --prefix admin test -- svg-manager-preview-refresh svg-manager svg-manager-promote-event` → GREEN.
- [ ] **Step 5: commit** `feat(#50): SVG Manager thumbnail polls until promoted map is fresh`.

---

## Task 4: Test gate
- [ ] Run `npm --prefix admin test`; pass only if the sole failing suites are the 4 known pre-existing ones (data-model, validation, user-menu, edit-user-dialog). No NEW failures.

## Task 5: Deploy gate (human) → deploy SPA
- [ ] **Breakpoint (deploy):** approve `bash redeploy.sh`. Then run it (admin SPA + `/admin/*` invalidation). No CloudFront behavior change in this plan.

## Task 6: Manual e2e gate (human) → PR
- [ ] **Breakpoint (manual e2e):** promote a real floor change; confirm BOTH the Map Editor and the SVG Manager thumbnail update on their own within ~tens of seconds (no hard refresh) and shelves stay clickable. On approval, push `fix/50-map-editor-refresh` and open the PR (`Closes #50`; note: ships the Free-plan poll approach; instant `?v=` upgrade tracked in #65). Use the `gh api` REST fallback if `gh pr create` hits the Projects-classic bug.

---

## Self-Review
- Builds on existing commits; only the cache-bust mechanism changes to ETag-poll. ✓
- Covers Map Editor (T1/T2) and the SVG Manager thumbnail (T3) — both views the user flagged. ✓
- No CloudFront/Lambda change; Primo bare URL untouched. ✓
- Accepted trade-off (timeout worst-case → manual refresh) documented; #65 tracks the clean `?v=` upgrade. ✓
- Names consistent: `getRenderedEtag`, `pollUntilFresh`, `nextCacheBust`, `getFloorCacheBust`, `floorChangedInPromote`, `installPromoteRefreshListener`. ✓
