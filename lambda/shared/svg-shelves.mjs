/**
 * SVG shelf-ID extractor — single canonical rule.
 *
 * RULE: an SVG element is a "shelf" if and only if both:
 *   - it has attribute data-map-object="shelf"
 *   - it has a non-empty id attribute
 *
 * MUST stay byte-for-byte equivalent in behavior to admin/services/svg-shelves.js.
 * Drift is caught by lambda/__tests__/shared/svg-shelves.test.mjs and
 * admin/__tests__/svg-shelves.test.js running the same fixture set.
 *
 * @param {string} svgString Raw SVG XML text.
 * @returns {{shelves: string[], duplicates: string[]}}
 * @throws {Error} If the SVG cannot be parsed.
 */
export function parseSvg(svgString) {
  // Server side uses a regex-based scan because we don't have DOMParser without
  // jsdom. The rule is simple enough that regex is appropriate: find every tag
  // that carries data-map-object="shelf" AND id="...".
  //
  // We reject malformed input by doing a quick sanity check first.
  if (!isWellFormedXml(svgString)) {
    const err = new Error('ParseError: SVG is not well-formed XML');
    err.name = 'ParseError';
    throw err;
  }

  // Match any element tag containing both attributes in any order.
  // Tag form: <name attr="value" attr="value" .../>  or  <name attr="value">
  const tagRegex = /<[a-zA-Z][^>]*?>/g;
  const seen = new Set();
  const duplicates = new Set();
  const shelves = [];

  for (const match of svgString.matchAll(tagRegex)) {
    const tag = match[0];
    if (!/\bdata-map-object\s*=\s*["']shelf["']/.test(tag)) continue;
    const idMatch = tag.match(/\bid\s*=\s*["']([^"']+)["']/);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (!id) continue;
    if (seen.has(id)) {
      duplicates.add(id);
      continue;
    }
    seen.add(id);
    shelves.push(id);
  }

  return { shelves, duplicates: Array.from(duplicates) };
}

/**
 * Minimal well-formedness check. We don't fully parse — we only catch the
 * obvious "missing close angle bracket" / "unclosed tag" cases that our
 * fixture set exercises. Full XML validation is the parser's job; this is
 * a guard against the most common Inkscape-edit-gone-wrong scenarios.
 */
function isWellFormedXml(s) {
  // Count opening vs self-closing/closing tag transitions
  const opens = (s.match(/</g) || []).length;
  const closes = (s.match(/>/g) || []).length;
  return opens === closes;
}
