# Orphan-panel audit — Map Editor (issue #14 phase 2a)

**Date:** 2026-05-12
**Method:** Playwright MCP, live admin + local static server, English + Hebrew traces, DOM and computed-style introspection.

---

## Summary

Three bugs found, in order of user impact:

1. **CRITICAL — RTL panel positioning broken.** Panel is partly visible in the canvas at all times in Hebrew mode, even when "closed." Caused by `#map-canvas { direction: ltr; }` (kept LTR on purpose for SVG-coordinate stability) combining badly with the panel's logical-property positioning + `[dir="rtl"]` transform override.
2. **CRITICAL — Module duplication causes E006 misfire.** The svg-parser is loaded twice (`./svg-parser.js` vs `./svg-parser.js?v=5`), so `validateRow` reads one cache while `preloadAllFloors` / the panel's warmup populate the other. Result: on a fresh badge click, the orphan list is *empty* even when the badge correctly counts orphans, because `isValidSvgCode` returns lenient "true" against an empty cache. PR #22's cache-warmup fix awaited the wrong instance.
3. **MEDIUM — Locale toggle leaves the panel shell stuck in mount-time language.** Switching language mid-session doesn't re-render the panel header. Less severe than the others because most users won't toggle mid-session.

The `kb1_28_b → kb2_28_b` cabinet-on-floor-2 "should not be clickable" finding from earlier in the session is unrelated; that's the original bug-report shelf (issue #16).

---

## Methodology

- Started a local static-file server (`python3 -m http.server 8080` from project root) to serve the admin SPA without needing Cognito.
- Used Playwright MCP to navigate, inject mock auth tokens into `sessionStorage`, and exercise the orphan panel.
- Probed runtime state via `browser_evaluate`: panel DOM, computed styles, getBoundingClientRect, ancestor `direction` trace, two-instance svg-parser cache comparison.
- Captured screenshots and timeline snapshots (every 50ms after badge click for 1.5s).

---

## Bug 1 — RTL panel positioning (CRITICAL)

### Repro

1. Open admin in **Hebrew** (`localStorage.locale = 'he'`, `<html dir="rtl">`).
2. Navigate to Map Editor (Hebrew label: "עורך מפות").

### Observed

The empty orphan-panel shell appears as a vertical white box floating in the **middle-right of the canvas**, even though the panel has not been opened. Bounding rect at audit time:

- Panel: `x: 889.5 .. 1229.5` (width 340).
- Canvas: `x: 322.5 .. 1570.5` (width 1248).

The panel's right edge is 341px shy of the canvas right edge — it should either be flush against the right edge in LTR or against the left edge in RTL.

Visual evidence: `.playwright-mcp/bug-a-hebrew-floor-0-panel-visible.png`.

### Root cause

`admin/styles/app.css:2693-2695` forces `direction: ltr` on `#map-canvas`. This is **intentional** — the SVG floor map is authored in LTR coordinate space, and inheriting `dir=rtl` from `<html>` shifts the SVG ~200px (closes issue #2, the original "SVG content not aligned" bug).

But the orphan panel positions itself with logical properties (`inset-inline-end: 0` from phase-2a CSS), and "inline-end" is resolved relative to the *element's own* writing direction. Because the panel is a descendant of `#map-canvas`, its computed `direction` is `ltr` — so `inset-inline-end: 0` resolves to **right: 0** (LTR semantics), anchoring the panel to the canvas's physical right edge.

Meanwhile, the phase-2a CSS has an RTL override that uses an attribute selector:

```css
[dir="rtl"] .map-orphan-panel {
  transform: translateX(-100%);
}
```

The attribute selector matches because `<html dir="rtl">` is an ancestor — independent of the computed-direction override on the canvas. So in Hebrew the panel is **anchored on the right** and **translated left by 100%**, leaving it half-on / half-off the canvas, fully visible.

### Trace

```
panelComputed.direction:        ltr   ← inherited from #map-canvas
panelComputed.insetInlineEnd:   0px
panelComputed.right:            0px
panelComputed.left:             906px (computed from insetInlineStart)
panelComputed.transform:        matrix(1, 0, 0, 1, -340, 0)  ← translateX(-100%)
```

Ancestor `direction` trace:
- HTML → `rtl`
- BODY → `rtl`
- MAIN → `rtl`
- #map-editor → `rtl`
- #map-editor-view → `rtl`
- **#map-canvas → `ltr`** ← override here
- .map-orphan-panel → `ltr` ← inherited

### Proposed fix

Switch the panel positioning from logical properties to physical, gated on `[dir="rtl"]`:

```css
/* Closed-state default (LTR): anchored to physical right, pushed off right. */
.map-orphan-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 340px;
  transform: translateX(100%);
  /* ... */
}

/* RTL override: anchored to physical left, pushed off left. */
[dir="rtl"] .map-orphan-panel {
  right: auto;
  left: 0;
  transform: translateX(-100%);
}

.map-orphan-panel--open,
[dir="rtl"] .map-orphan-panel--open {
  transform: translateX(0);
}
```

This makes the panel's positioning explicit and independent of the canvas's forced LTR direction.

### Files to change

- `admin/styles/app.css` — replace the `.map-orphan-panel` block (and the `[dir="rtl"]` rule below it) with the physical-properties version above.

---

## Bug 2 — Module duplication causes E006 misfire (CRITICAL)

### Repro

1. Reload admin fresh in Hebrew.
2. Click Floor 2 tab.
3. Verify badge appears: `"2 ללא שיוך"`.
4. Click the badge.

### Observed

Panel opens. For 1.5+ seconds, the panel shows the empty state `"אין שורות יתומות בקומה 2 — עברו ללשוניות אחרות"` even though the badge unambiguously reports 2 orphans on the same floor. No cards appear.

PR #22's cache-warmup fix (`await fetchAndParseSvg(currentFloor)` before deriving) was meant to prevent exactly this. It did not.

### Root cause

The svg-parser ES module is loaded twice, under two different URLs:

- **Module A:** `/admin/services/svg-parser.js` (no version suffix). Imported by `admin/services/data-model.js:7`. The `isValidSvgCode` function consulted by `validateRow`'s E006 rule lives in this instance.
- **Module B:** `/admin/services/svg-parser.js?v=5`. Imported by `admin/components/map-editor.js:14`, `admin/components/svg-autocomplete.js:3`, and (via `preloadAllFloors`) by `admin/app.js:21`.

In the ES-module spec, different URLs are different singletons with independent module-level state. The `svgCodeCache` Map is *per instance*.

Verified at audit time (after clicking the floor-2 badge):

```
Module A cache: { floor 0: empty, floor 1: empty, floor 2: 199 codes }
Module B cache: { floor 0: 13 codes, floor 1: 210 codes, floor 2: 199 codes }
```

Module A's floor-2 cache became populated only because the lenient cold-cache path of `isValidSvgCode` fires a fire-and-forget `fetchAndParseSvg` for *Module A's instance*. By the time the audit ran, that lazy-load had completed for floor 2 — but on the very first badge click, the cache was empty and `isValidSvgCode('kb1_28_b', '2')` returned lenient `true`, so `validateRow` did NOT emit E006, so the deriver returned zero orphans, so the panel rendered the empty state.

PR #22's fix called `fetchAndParseSvg(currentFloor)` via Module B (because map-editor.js imports svg-parser with `?v=5`). It correctly hydrated Module B's cache. But `validateRow` consults Module A's cache. Cross-talk: zero.

Same root cause likely explains the user's earlier observation that the Errors Dashboard showed E006 findings only after a refresh: the first dashboard render lenient-loaded the codes; the second render had the cache hot.

### Trace

Direct deriver call with a fresh module import (which by luck happened to be Module A or another fresh instance):

```js
deriveOrphansForFloor([{ ...kb1_28_b row on floor 2 }], '2')
// → 1 orphan: { rowId, kind: 'svgCode_not_on_floor', ... }
```

Same call from the running map-editor module: returns 0. Different state, different module instance.

### Proposed fix

**Align all imports of `svg-parser.js` and `data-model.js` to a single URL.** Drop the `?v=N` query-string suffix from these specific imports (or apply the same suffix everywhere consistently). The version-busting hack adds value only at deploy time for cache invalidation; CloudFront invalidation already gives us that, and inconsistent suffixes silently break module singletons.

Concrete changes — drop the `?v=N` suffix from:

- `admin/services/data-model.js:7` (already no suffix — good)
- `admin/components/svg-autocomplete.js:3` → from `?v=5` to no suffix
- `admin/components/map-editor.js:14` → from `?v=5` to no suffix
- `admin/app.js:21` (the `preloadAllFloors` import) → from `?v=5` to no suffix
- `admin/components/errors-dashboard.js:3` → from `?v=6` to no suffix (`data-model.js`)
- `admin/components/edit-location-dialog.js:5` → from `?v=6` to no suffix
- `admin/components/validation-panel.js:3` → from `?v=6` to no suffix
- `admin/components/validation.js:14` → already no suffix — good
- `admin/components/map-editor/range-validation.js:25` → already no suffix — good

After this, there's one Module A (svg-parser) and one Module C (data-model). `preloadAllFloors` populates the same cache that `validateRow` reads from. Phase-1's E006 detection works reliably; PR #22's cache-warmup actually does what it says.

**Audit hook to prevent regression:** add a small lint / test that imports svg-parser and data-model from two different paths (with and without `?v`) and asserts they resolve to the same singleton — or just visually verifies no `?v=` query string appears in any service-module import.

### Files to change

- `admin/components/svg-autocomplete.js`
- `admin/components/map-editor.js`
- `admin/app.js`
- `admin/components/errors-dashboard.js`
- `admin/components/edit-location-dialog.js`
- `admin/components/validation-panel.js`

(plus any e2e test that imports these paths — check)

### Side effect: PR #22 becomes mostly a no-op

Once bug 2 is fixed, the `await fetchAndParseSvg(...)` warmup in PR #22 will be redundant (the cache is already warmed by `preloadAllFloors` at init, and the only instance now sees the warm cache). Leave the `await` in for defense-in-depth — it costs nothing once the cache is hot.

---

## Bug 3 — Locale toggle doesn't re-render panel shell (MEDIUM)

### Repro

1. Open admin in English.
2. Navigate to Map Editor.
3. Toggle to Hebrew via the "עברית" button.

### Observed

Most of the page re-renders into Hebrew. The orphan-panel header continues to show the English title `"Shelf assignment needs fixing"` instead of the Hebrew `"שורות הזקוקות לתיקון הצמדת מדף"`.

### Root cause

`orphan-panel.js mount()` renders the shell once at admin init, while the locale is whatever it was at that moment. The drawer (`shelf-drawer.js`) listens to the `localeChanged` event and re-renders, but `orphan-panel.js` does not.

### Proposed fix

In `orphan-panel.js`, listen for `localeChanged` and re-render the shell (preserving open/closed state and current orphan list). Or, in `map-editor.js`, listen for `localeChanged` and call `mountOrphanPanel` again followed by an `openOrphanPanel` if the panel was open.

Smallest version:

```js
// orphan-panel.js
let lastOpenSnapshot = null;
function reMountForLocale() {
  if (!panel) return;
  const wasOpen = panel.classList.contains('map-orphan-panel--open');
  panel.innerHTML = renderShell(0);
  listEl = panel.querySelector('.map-orphan-panel__list');
  panel.querySelector('[data-action="close"]').addEventListener('click', close);
  if (wasOpen && lastOpenSnapshot) {
    open(lastOpenSnapshot.orphans, lastOpenSnapshot.options);
  }
}
document.addEventListener('localeChanged', reMountForLocale);
// (also stash {orphans, options} on every open() so we can re-render)
```

### Files to change

- `admin/components/map-editor/orphan-panel.js`

---

## Misc observations

- The `?v=N` query-string suffix in admin imports is used inconsistently across the codebase (v=1, v=2, v=3, v=5, v=6 all appear). Bug 2 is the worst manifestation but there are likely subtler ones. A repo-wide audit + standardization is worthwhile beyond this orphan-panel fix.
- The screenshot `bug-a-hebrew-floor-0-panel-visible.png` (committed under `.playwright-mcp/`) shows Bug 1 visually.

---

## Issues to file

1. **`Map Editor: orphan panel positioned wrong in RTL — visible inside canvas when closed`** (bug 1)
2. **`Map Editor: orphan panel shows empty state on first click even when orphans exist — svg-parser module duplication`** (bug 2)
3. **`Map Editor: orphan panel header doesn't follow mid-session locale toggle`** (bug 3)

A 4th tracking issue may be worthwhile: **`Repo-wide cleanup: standardize ?v=N query-string suffixes on admin module imports`** — bug 2's root cause is symptomatic of broader inconsistency.
