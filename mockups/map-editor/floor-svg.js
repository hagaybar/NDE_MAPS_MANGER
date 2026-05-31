/* ------------------------------------------------------------------
 * Map Editor mockup — REAL floor SVG loader.
 * Loads the production floor plans (duplicated into this folder), makes
 * them responsive (the #70 fix: derive a viewBox, strip width/height so
 * CSS scales-to-fit), and reports the real shelf codes.
 *
 * Shelf rule (matches admin/services/svg-shelves.js):
 *   element has data-map-object="shelf" AND a non-empty id (= svgCode).
 * ------------------------------------------------------------------ */
(function () {
  'use strict';
  const cache = {};   // floorId -> { svg, codes }

  // Derive a viewBox from width/height and strip width/height on the ROOT <svg>
  // so the map scales to fit the canvas instead of rendering at native size.
  function makeResponsive(svgText) {
    return svgText.replace(/<svg\b[^>]*>/, (open) => {
      const w = (open.match(/\bwidth\s*=\s*"([\d.]+)[^"]*"/) || [])[1];
      const h = (open.match(/\bheight\s*=\s*"([\d.]+)[^"]*"/) || [])[1];
      let tag = open;
      if (!/\bviewBox\s*=/.test(tag) && w && h) tag = tag.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`);
      tag = tag.replace(/\s(width|height)\s*=\s*"[^"]*"/g, '');
      if (!/\bpreserveAspectRatio\s*=/.test(tag)) tag = tag.replace('<svg', '<svg preserveAspectRatio="xMidYMid meet"');
      return tag;
    });
  }

  function parseShelfCodes(svgText) {
    const tags = svgText.match(/<[a-zA-Z][^>]*?>/g) || [];
    const seen = new Set(); const codes = [];
    for (const t of tags) {
      if (!/\bdata-map-object\s*=\s*["']shelf["']/.test(t)) continue;
      const m = t.match(/\bid\s*=\s*["']([^"']+)["']/);
      if (!m || !m[1] || seen.has(m[1])) continue;
      seen.add(m[1]); codes.push(m[1]);
    }
    return codes;
  }

  async function loadFloorAssets(floorId) {
    if (cache[floorId]) return cache[floorId];
    const res = await fetch(`floor_${floorId}.svg`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`floor_${floorId}.svg → HTTP ${res.status}`);
    const raw = await res.text();
    const out = { svg: makeResponsive(raw), codes: parseShelfCodes(raw) };
    cache[floorId] = out;
    return out;
  }

  window.FloorSvg = { loadFloorAssets };
})();
