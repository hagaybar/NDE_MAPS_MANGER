const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

// Module-local state captured on every loadFloorSvg() call so the
// 'svg-promoted' listener (issue #50) knows which floor + container to refresh
// without coupling svg-loader to map-editor's internal `currentFloor` variable.
// Null until the first call, in which case the listener is a no-op.
let _currentFloor = null;
let _currentContainer = null;

/**
 * Handler for the 'svg-promoted' DOM event dispatched by svg-manager after a
 * successful staging promote. Stored as a NAMED function reference so
 * disposeSvgPromotedListener() can remove the same identity that was added —
 * an anonymous arrow on the addEventListener call would silently leak.
 *
 * Idempotent: each invocation re-runs loadFloorSvg, which already uses
 * cache: 'no-cache' (CLAUDE.md sticky rule, PR #34). When bytes haven't
 * changed CloudFront returns 304 and the existing DOM is rebuilt from cache;
 * when they have, the new body is fetched.
 */
function _handleSvgPromoted() {
  if (_currentFloor === null || !_currentContainer) return;
  // Fire-and-forget; the surrounding event-dispatch context is sync, but
  // loadFloorSvg is async. Errors are surfaced inside loadFloorSvg's own
  // error path (it writes a fallback message into the container).
  loadFloorSvg(_currentFloor, _currentContainer).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Floor SVG refresh after promote failed:', err);
  });
}

// Install at module load so any future svg-manager → svg-promoted dispatch
// triggers a Map Editor refresh, even if Map Editor was never opened (in
// which case _currentFloor is null and the handler no-ops).
document.addEventListener('svg-promoted', _handleSvgPromoted);

/**
 * Remove the 'svg-promoted' listener installed at module init. Exported so
 * tests can tear down between cases and future component unmount logic can
 * call it. Uses the SAME function reference passed to addEventListener.
 */
export function disposeSvgPromotedListener() {
  document.removeEventListener('svg-promoted', _handleSvgPromoted);
}

export async function loadFloorSvg(floorNumber, container) {
  // Remember the most-recently-displayed floor + container so the
  // 'svg-promoted' listener can reload the same view after a staging promote.
  _currentFloor = floorNumber;
  _currentContainer = container;
  // cache: 'no-cache' forces the browser to revalidate with the origin
  // (sends If-None-Match / If-Modified-Since). When the SVG hasn't changed,
  // the server returns 304 and the cached body is reused — no extra bandwidth.
  // When it has changed (e.g. after a CL-label fix), the new body is fetched.
  // Plain fetch() would let the browser serve a stale cached body across
  // sessions, which surfaced as a recurring "floor 2 shelves unclickable +
  // '210 unassigned' badge" bug whenever someone re-uploaded a floor SVG.
  const resp = await fetch(`${CLOUDFRONT_URL}/maps/floor_${floorNumber}.svg`, { cache: 'no-cache' });
  if (!resp.ok) {
    container.innerHTML = `<p class="text-red-600 p-4">Could not load floor map.</p>`;
    throw new Error(`SVG load failed: floor ${floorNumber} (${resp.status})`);
  }
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
  return container.querySelector('svg');
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
