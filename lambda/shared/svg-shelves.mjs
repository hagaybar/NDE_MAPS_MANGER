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
 * in admin/services/svg-shelves.js (parity tests over shared fixtures).
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

/**
 * Extract a string attribute value from a single tag string, or null if absent.
 * @param {string} tag A single opening/self-closing tag including angle brackets.
 * @param {string} name Attribute name (regex-safe literal).
 * @returns {string|null}
 */
function getAttr(tag, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*["\']([^"\']*)["\']');
  const m = tag.match(re);
  if (!m) return null;
  const value = m[1];
  return value === '' ? null : value;
}

/**
 * Extract a numeric attribute value via parseFloat, or null if the attribute is
 * absent or does not parse to a finite number.
 * @param {string} tag A single opening/self-closing tag including angle brackets.
 * @param {string} name Attribute name (regex-safe literal).
 * @returns {number|null}
 */
function getNumAttr(tag, name) {
  const raw = getAttr(tag, name);
  if (raw === null) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Structural well-formedness scan (kept byte-identical with
 * admin/services/svg-shelves.js). A '>' only closes a tag when we're inside one
 * and not inside a quoted attribute value, so a literal '>' in an attribute, a
 * <style> block, or a text node is fine (#132) — the old char-count heuristic
 * false-rejected those valid files. A '<' while already inside a tag is
 * malformed, and any unclosed tag or quote at the end fails.
 */
function isWellFormedXml(s) {
  let inTag = false;
  let quote = null; // "'" or '"' while inside an attribute value, else null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inTag) {
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '<') {
        return false; // '<' inside a tag => malformed
      } else if (ch === '>') {
        inTag = false;
      }
    } else if (ch === '<') {
      inTag = true;
    }
    // a '>' outside a tag is literal text content — ignored
  }
  return !inTag && !quote;
}
