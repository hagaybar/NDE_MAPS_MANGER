/**
 * Location Model — generic abstraction over mappable SVG elements.
 *
 * Each Location corresponds to one SVG element classified by the
 * `data-map-object` attribute.  Today only `kind === "shelf"` is
 * surfaced via indexShelfLocations(); future kinds (printer, lift,
 * toilet, etc.) add new exports without restructuring this module.
 *
 * @module components/map-editor/location-model
 */

/**
 * Return every shelf-kind Location reachable from the given SVG root.
 *
 * @param {SVGElement | null | undefined} svgRoot
 * @returns {Map<string, SVGElement>}  svgCode → element
 */
export function indexShelfLocations(svgRoot) {
  const map = new Map();
  if (!svgRoot) return map;
  const matches = svgRoot.querySelectorAll('[data-map-object="shelf"][id]');
  for (const el of matches) {
    map.set(el.id, el);
  }
  return map;
}
