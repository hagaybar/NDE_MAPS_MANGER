/**
 * SVG shelf-ID extractor — single canonical rule.
 *
 * RULE: an SVG element is a "shelf" if and only if both:
 *   - it has attribute data-map-object="shelf"
 *   - it has a non-empty id attribute
 *
 * MUST stay byte-for-byte equivalent in behavior to
 * lambda/shared/svg-shelves.mjs. Drift is caught by parity tests:
 *   - lambda/__tests__/shared/svg-shelves.test.mjs
 *   - admin/__tests__/svg-shelves.test.js
 *
 * Both tests load the same fixture set at lambda/__tests__/fixtures/svg-shelves/.
 *
 * @param {string} svgString Raw SVG XML text.
 * @returns {{shelves: string[], duplicates: string[]}}
 * @throws {Error} If the SVG cannot be parsed.
 */
export function parseSvg(svgString) {
  if (!isWellFormedXml(svgString)) {
    const err = new Error('ParseError: SVG is not well-formed XML');
    err.name = 'ParseError';
    throw err;
  }

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

function isWellFormedXml(s) {
  const opens = (s.match(/</g) || []).length;
  const closes = (s.match(/>/g) || []).length;
  return opens === closes;
}
