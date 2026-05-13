# Floor SVG stale browser cache — recurring badge / clickability bug

**Date:** 2026-05-13
**Fix:** PR #34 (`fix(map-editor): force revalidate floor SVGs to avoid stale browser cache`), commit `3476ff0`.
**Author of investigation:** Hagay Bar + Claude (live Playwright MCP).

---

## Symptom

After re-uploading any floor SVG to S3 (PR #29's `data-map-object="shelf"` marker pass, the CL1_1 fix `d49d65b`, the CL2_2 fix `1e7c9f2`, or any future SVG edit), a subset of users would see — sometimes immediately, sometimes hours later:

- Map Editor → Floor 2 (or whichever floor was edited) → shelves not clickable.
- Badge on the floor tab reading **"N ללא שיוך"** / **"N unassigned"** where N is the total CSV-row count for the floor (210 on floor 2, 208 on floor 1 — not the actual orphan count).
- The orphan-repair panel, opened by clicking the badge, would show the **correct** small count (e.g. 2 on floor 2). The badge and the panel disagreed.

The bug "recurred" because we kept attributing it to a one-off CloudFront / browser-cache issue and worked around it with manual `aws cloudfront create-invalidation --paths "/maps/*"` plus Ctrl/Cmd+Shift+R. Both worked, neither was sticky — the next SVG edit reopened the wound.

## Root cause

Two SVG-fetching call sites:

- `admin/components/map-editor/svg-loader.js` → `loadFloorSvg(floorNumber, container)` — feeds `indexShelfLocations()`, which produces both the click handlers and the badge count via `computeOrphanCounts()`.
- `admin/services/svg-parser.js` → `fetchAndParseSvg(floor)` — feeds the orphan-deriver panel (regex-based ID extraction).

Both called plain `fetch(url)` with no cache directive. The CloudFront response for `/maps/floor_N.svg` also didn't set an explicit `Cache-Control` header, so browsers fell back to heuristic caching (typically ~10% of the time since `Last-Modified`, capped at 1 day). After we'd re-uploaded a floor SVG and invalidated CloudFront, the **edge** was fresh, but the **browser** kept its old copy across sessions. Result:

- Browser served the pre-marker SVG to `loadFloorSvg` → `indexShelfLocations()` found zero `[data-map-object="shelf"][id]` elements → `locationElements` was empty → `computeOrphanCounts()` flagged every CSV row on the floor as orphan → badge "210".
- The orphan-deriver path used `extractIdsFromSvg` (regex over the SVG text) which doesn't depend on the marker, so it still found the *correct* 2 orphans. The two paths' divergence is what made the bug confusing.

## Fix

Pass `{ cache: 'no-cache' }` to both fetch calls.

```js
// admin/components/map-editor/svg-loader.js
const resp = await fetch(`${CLOUDFRONT_URL}/maps/floor_${floorNumber}.svg`, { cache: 'no-cache' });

// admin/services/svg-parser.js
const response = await fetch(`${CLOUDFRONT_URL}/maps/floor_${floor}.svg`, { cache: 'no-cache' });
```

`cache: 'no-cache'` makes the browser send a conditional request every time (`If-None-Match` / `If-Modified-Since`). When the SVG hasn't changed, CloudFront/S3 return **304 Not Modified** and the cached body is reused — no extra bandwidth, just one tiny round-trip per floor switch. When it *has* changed, the new body is fetched immediately. The entire class of "I re-uploaded an SVG and now a user has stale state" bugs is eliminated.

Regression guards in `admin/__tests__/svg-loader.test.js` and `admin/__tests__/svg-parser.test.js` assert the fetch options on both call sites, so accidentally removing the directive will fail CI.

## Why not CloudFront `Cache-Control`?

You could also fix this by attaching a Response Headers Policy that emits `Cache-Control: no-cache, must-revalidate` for `/maps/*`. It works and would close the bug for any future client too. But:

1. CloudFront config drift is harder to spot than code drift — a policy change isn't visible in `git log`.
2. The application can be deployed to other hosts (different CDN, S3 direct, local dev server) and the bug would recur. `cache: 'no-cache'` is host-agnostic.
3. The cost of one conditional request per floor switch is invisible to the user (latency well under 50ms in practice).

If we ever add many more SVG-like assets that revalidate every time would be wasteful, this trade-off should be revisited.

## Investigation method (for future audits)

1. Reproduce in a **fresh** Playwright MCP browser session (no shared state with the developer's actual browser). If the bug doesn't reproduce there, it's a cache / state issue, not a code issue.
2. Compare:
   - `curl -sI` of the asset URL → confirms what CloudFront serves.
   - `aws s3 ls` of the asset → confirms what's on origin.
   - `grep -c marker` on the local repo file → confirms source of truth.
   - In-page `await fetch(url).then(r => r.text())` → confirms what the user's browser is *currently* serving.
3. If origin, CDN, and source agree, but the in-page fetch disagrees, you're staring at a stale browser cache. Fix it with `cache: 'no-cache'` on the fetch, never with another invalidation.
