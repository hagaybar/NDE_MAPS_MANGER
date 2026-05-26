const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

// Per-floor record of the ETag last served for a rendered floor SVG. Used by
// the #50 poll-until-fresh refresh: after a promote, pollUntilFresh compares
// the served ETag to this baseline to detect when the CloudFront invalidation
// has propagated, then re-renders.
const _renderedEtag = {};
export function getRenderedEtag(floorNumber) { return _renderedEtag[floorNumber]; }

export async function loadFloorSvg(floorNumber, container, cacheBust) {
  // cache: 'no-cache' forces the browser to revalidate with the origin
  // (sends If-None-Match / If-Modified-Since). When the SVG hasn't changed,
  // the server returns 304 and the cached body is reused — no extra bandwidth.
  // When it has changed (e.g. after a CL-label fix), the new body is fetched.
  // Plain fetch() would let the browser serve a stale cached body across
  // sessions, which surfaced as a recurring "floor 2 shelves unclickable +
  // '210 unassigned' badge" bug whenever someone re-uploaded a floor SVG.
  //
  // cache: 'no-cache' revalidates the *browser* cache. It does NOT defeat the
  // CloudFront edge — so right after a promote (when CloudFront still holds the
  // pre-promote object) callers pass a unique `cacheBust` to append ?v=<token>.
  // The /maps/* cache behavior keys on `v`, so a new token is a cache miss and
  // CloudFront fetches fresh from S3. See issue #50 + the 2026-05-25 plan.
  const base = `${CLOUDFRONT_URL}/maps/floor_${floorNumber}.svg`;
  const url = cacheBust ? `${base}?v=${encodeURIComponent(cacheBust)}` : base;
  const resp = await fetch(url, { cache: 'no-cache' });
  if (!resp.ok) {
    container.innerHTML = `<p class="text-red-600 p-4">Could not load floor map.</p>`;
    throw new Error(`SVG load failed: floor ${floorNumber} (${resp.status})`);
  }
  const etag = resp.headers && resp.headers.get ? resp.headers.get('etag') : null;
  if (etag) _renderedEtag[floorNumber] = etag;
  const text = await resp.text();
  // Preserve any non-SVG element children (e.g. the orphan-panel host)
  // across reloads. innerHTML replacement would otherwise detach them.
  const preserved = Array.from(container.children).filter(
    el => el.tagName && el.tagName.toLowerCase() !== 'svg'
  );
  container.innerHTML = text;
  for (const el of preserved) {
    container.appendChild(el);
  }
  const svgRoot = container.querySelector('svg');
  makeSvgResponsive(svgRoot);
  return svgRoot;
}

/**
 * Make the injected floor SVG fit its container instead of rendering at its
 * native fixed size (issue #70). Production floor SVGs are Inkscape exports
 * with `width="1040" height="720"` and NO root `viewBox`, so the browser
 * renders them at 1040×720 and #map-canvas scrolls once the floor tabs/header
 * take their space.
 *
 * We give the root a `viewBox` (derived from width/height when missing) and
 * strip the hardcoded width/height so the CSS rule `#map-canvas > svg { width:
 * 100%; height: 100% }` can scale the map to fit while preserving aspect ratio
 * (default `preserveAspectRatio="xMidYMid meet"` centers + letterboxes it).
 * Runs on every load, so it reapplies after a #50 post-promote re-injection.
 * Hit-testing/selection still line up because viewBox scaling maps pointer
 * coordinates through the same transform.
 */
function makeSvgResponsive(svgRoot) {
  if (!svgRoot) return;
  if (!svgRoot.getAttribute('viewBox')) {
    const w = parseFloat(svgRoot.getAttribute('width'));
    const h = parseFloat(svgRoot.getAttribute('height'));
    if (w > 0 && h > 0) svgRoot.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  svgRoot.removeAttribute('width');
  svgRoot.removeAttribute('height');
}

/**
 * Resolve only known shelf svgCodes against the SVG.
 *
 * Production floor SVGs are Inkscape exports that contain hundreds of
 * `[id]` elements (defs, patterns, clip paths, raster images, etc.) — only
 * a handful are real shelves. Indexing every `[id]` would attach hover /
 * click handlers to internals like `pattern1`, `clip8`, `defs16`. We instead
 * resolve only the svgCodes referenced by the CSV (`knownSvgCodes`).
 *
 * @param {SVGElement} svgRoot
 * @param {Set<string>} knownSvgCodes
 * @returns {Map<string, SVGElement>} svgCode -> element (only those that exist)
 */
export function indexShelvesById(svgRoot, knownSvgCodes) {
  const map = new Map();
  if (!knownSvgCodes) return map;
  for (const code of knownSvgCodes) {
    if (!code) continue;
    const el = svgRoot.querySelector(`[id="${CSS.escape(code)}"]`);
    if (el) map.set(code, el);
  }
  return map;
}

/**
 * Build the set of svgCodes referenced by ranges on a given floor.
 * Single-purpose helper kept here so callers don't reach into shelf-state.
 *
 * @param {Array<{svgCode?: string}>} rangesOnFloor
 * @returns {Set<string>}
 */
export function buildKnownSvgCodes(rangesOnFloor) {
  return new Set(rangesOnFloor.map(r => r.svgCode).filter(Boolean));
}

export function buildRangeCountByShelf(rangesOnFloor) {
  const counts = new Map();
  for (const r of rangesOnFloor) {
    if (!r.svgCode) continue;
    counts.set(r.svgCode, (counts.get(r.svgCode) || 0) + 1);
  }
  return counts;
}
