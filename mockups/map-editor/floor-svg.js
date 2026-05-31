/* ------------------------------------------------------------------
 * Map Editor mockup — clean, hand-crafted sample floor SVGs.
 * Renders from window.MOCK.FLOORS. Shelves are clickable <g> with
 * data-code; CSS classes drive hover / selected / pulse / attention.
 * Direction-agnostic geometry (lives inside a direction:ltr canvas).
 * ------------------------------------------------------------------ */
(function () {
  'use strict';
  const VIEW_W = 880, VIEW_H = 560;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function decorMarkup(d, lang) {
    if (d.type === 'room') {
      const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
      return `<g class="decor decor-room">
        <rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="10"/>
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle">${esc(d[lang] || d.en)}</text>
      </g>`;
    }
    if (d.type === 'stairs') {
      let steps = '';
      const n = 6, sh = d.h / n;
      for (let i = 1; i < n; i++) steps += `<line x1="${d.x}" y1="${d.y + i * sh}" x2="${d.x + d.w}" y2="${d.y + i * sh}"/>`;
      return `<g class="decor decor-stairs"><rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="4"/>${steps}</g>`;
    }
    if (d.type === 'entrance') {
      return `<g class="decor decor-entrance">
        <circle cx="${d.x}" cy="${d.y - 6}" r="5"/>
        <text x="${d.x}" y="${d.y + 16}" text-anchor="middle">${esc(d[lang] || d.en)}</text>
      </g>`;
    }
    return '';
  }

  // primary tone = first entry's collection; empty shelves are neutral
  function shelfTone(shelf) { return shelf.entries && shelf.entries.length ? shelf.entries[0].col : null; }

  function shelfMarkup(shelf, lang) {
    const vertical = shelf.orient === 'v';
    const cx = shelf.x + shelf.w / 2, cy = shelf.y + shelf.h / 2;
    const tone = shelfTone(shelf);
    const empty = !(shelf.entries && shelf.entries.length);
    const cls = ['shelf', empty ? 'is-empty' : `tone-${tone}`].join(' ');
    const label = vertical
      ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${cx} ${cy})">${esc(shelf.code)}</text>`
      : `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle">${esc(shelf.code)}</text>`;
    return `<g class="${cls}" data-code="${esc(shelf.code)}" tabindex="0" role="button" aria-label="${esc(shelf.code)}">
      <rect class="shelf-body" x="${shelf.x}" y="${shelf.y}" width="${shelf.w}" height="${shelf.h}" rx="4"/>
      <rect class="shelf-spine" x="${shelf.x}" y="${shelf.y}" width="${vertical ? shelf.w : 5}" height="${vertical ? 5 : shelf.h}" rx="2"/>
      ${label}
    </g>`;
  }

  function renderFloorSvg(floor, lang) {
    const decor = (floor.decor || []).map(d => decorMarkup(d, lang)).join('');
    const shelves = (floor.shelves || []).map(s => shelfMarkup(s, lang)).join('');
    return `<svg class="floor-svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-label="Floor ${floor.id}">
      <rect class="floor-bg" x="6" y="6" width="${VIEW_W - 12}" height="${VIEW_H - 12}" rx="14"/>
      <g class="decor-layer">${decor}</g>
      <g class="shelf-layer">${shelves}</g>
    </svg>`;
  }

  window.renderFloorSvg = renderFloorSvg;
})();
