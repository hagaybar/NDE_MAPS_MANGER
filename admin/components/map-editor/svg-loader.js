const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

export async function loadFloorSvg(floorNumber, container) {
  const resp = await fetch(`${CLOUDFRONT_URL}/maps/floor_${floorNumber}.svg`);
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
