/**
 * Map Editor view scaffold.
 *
 * Extracted from initMapEditor so the layout structure is unit-testable without
 * booting the whole editor (auth/CSV/SVG). The load-bearing invariant guarded by
 * `map-editor-scaffold.test.js`: `#map-side-panel` is a SIBLING of `#map-canvas`
 * inside the `#map-editor-split` CSS grid — NOT a descendant. Nesting the panel
 * inside the force-LTR `#map-canvas` is the precondition for #23 (RTL panel
 * displacement); keeping it a grid sibling lets it mirror by document `dir` for
 * free and makes #23 impossible to recur. See the side-panel layout spec §4.1.
 */
export function buildMapEditorScaffold() {
  // The idle hint now lives in the side panel (idle mode), so the old header
  // empty-message <p> is gone. The panel host is the grid sibling that
  // side-panel.js mounts onto.
  return `
    <div id="map-editor-view">
      <div class="bg-white rounded-lg shadow p-4 map-editor__header">
        <div id="map-floor-tabs" class="flex gap-2 border-b border-gray-200" role="tablist"></div>
      </div>
      <div id="map-editor-split">
        <div id="map-canvas" class="relative bg-gray-50 border border-gray-200 rounded"></div>
        <div id="map-side-panel"></div>
      </div>
    </div>
  `;
}
