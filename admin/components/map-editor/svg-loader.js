const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

export async function loadFloorSvg(floorNumber, container) {
  const resp = await fetch(`${CLOUDFRONT_URL}/maps/floor_${floorNumber}.svg`);
  if (!resp.ok) {
    container.innerHTML = `<p class="text-red-600 p-4">Could not load floor map.</p>`;
    throw new Error(`SVG load failed: floor ${floorNumber} (${resp.status})`);
  }
  const text = await resp.text();
  container.innerHTML = text;
  return container.querySelector('svg');
}

export function indexShelvesById(svgRoot) {
  const map = new Map();
  svgRoot.querySelectorAll('[id]').forEach(el => {
    const id = el.getAttribute('id');
    if (id) map.set(id, el);
  });
  return map;
}

export function buildRangeCountByShelf(rangesOnFloor) {
  const counts = new Map();
  for (const r of rangesOnFloor) {
    if (!r.svgCode) continue;
    counts.set(r.svgCode, (counts.get(r.svgCode) || 0) + 1);
  }
  return counts;
}
