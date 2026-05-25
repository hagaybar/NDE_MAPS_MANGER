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

/**
 * Per-shelf detail extractor used by rename detection.
 *
 * Same shelf rule as parseSvg (data-map-object="shelf" + non-empty id), but
 * returns richer info per shelf instead of just the id list. Backward-compatible
 * addition — does NOT change parseSvg's {shelves, duplicates} shape.
 *
 *   uid      = value of data-shelf-uid attribute, or null if absent.
 *   x/y/     = numeric geometry via parseFloat when the attribute is present
 *   width/     (rect shelves), else null (e.g. <path> shelves with no x/y).
 *   height
 *
 * Unlike parseSvg, this does NOT de-duplicate by id: every matching shelf tag
 * yields one entry (rename detection needs all occurrences). It also does not
 * throw on malformed XML — it scans tags best-effort.
 *
 * MUST stay byte-for-byte equivalent in behavior to the corresponding function
 * in lambda/shared/svg-shelves.mjs (parity tests over shared fixtures).
 *
 * @param {string} svgString Raw SVG XML text.
 * @returns {Array<{id: string, uid: string|null, x: number|null, y: number|null, width: number|null, height: number|null}>}
 */
export function parseSvgShelfDetails(svgString) {
  const tagRegex = /<[a-zA-Z][^>]*?>/g;
  const details = [];

  for (const match of svgString.matchAll(tagRegex)) {
    const tag = match[0];
    if (!/\bdata-map-object\s*=\s*["']shelf["']/.test(tag)) continue;
    const id = getAttr(tag, 'id');
    if (!id) continue;
    details.push({
      id,
      uid: getAttr(tag, 'data-shelf-uid'),
      x: getNumAttr(tag, 'x'),
      y: getNumAttr(tag, 'y'),
      width: getNumAttr(tag, 'width'),
      height: getNumAttr(tag, 'height'),
    });
  }

  return details;
}

function getAttr(tag, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*["\']([^"\']*)["\']');
  const m = tag.match(re);
  if (!m) return null;
  const value = m[1];
  return value === '' ? null : value;
}

function getNumAttr(tag, name) {
  const raw = getAttr(tag, name);
  if (raw === null) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function isWellFormedXml(s) {
  const opens = (s.match(/</g) || []).length;
  const closes = (s.match(/>/g) || []).length;
  return opens === closes;
}
