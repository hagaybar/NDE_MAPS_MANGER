import { randomUUID } from 'node:crypto';

/**
 * Stamp a stable per-shelf UID (`data-shelf-uid`) onto SVG shelf elements.
 *
 * RULE (same shelf rule as parseSvg in svg-shelves.mjs): an element is a "shelf"
 * iff it has attribute data-map-object="shelf" AND a non-empty id attribute. For
 * every shelf tag that lacks `data-shelf-uid`, we insert
 * `data-shelf-uid="<crypto.randomUUID()>"`. Everything else is preserved verbatim.
 *
 * The UID is ground truth for rename detection (#68): it persists through
 * librarian Inkscape edits the way data-map-object does, so a removed code +
 * a newly-added code that share a uid is a *rename*, not an add+remove.
 *
 * Idempotent: a shelf that already carries a `data-shelf-uid` is left untouched,
 * so re-stamping already-stamped bytes is a no-op (modulo nothing — byte-stable).
 *
 * @param {string} svgString Raw SVG XML text (staged map bytes).
 * @returns {string} The SVG with uids stamped on previously-unstamped shelves.
 */
export function stampShelfUids(svgString) {
  // Scan every opening/self-closing tag. We rewrite only the tags that are
  // shelves lacking a uid; all other bytes (including the tags we skip) are
  // copied through unchanged.
  const tagRegex = /<[a-zA-Z][^>]*?>/g;

  return svgString.replace(tagRegex, (tag) => {
    if (!/\bdata-map-object\s*=\s*["']shelf["']/.test(tag)) return tag;
    const idMatch = tag.match(/\bid\s*=\s*["']([^"']+)["']/);
    if (!idMatch || !idMatch[1]) return tag; // no non-empty id → not a shelf
    if (/\bdata-shelf-uid\s*=\s*["']/.test(tag)) return tag; // already stamped

    const uid = randomUUID();
    const attr = ` data-shelf-uid="${uid}"`;

    // Insert the attribute just before the tag's closing delimiter, preserving
    // the self-closing slash and all existing attribute bytes verbatim.
    if (/\/>$/.test(tag)) {
      // "<rect .../>"  ->  "<rect ... data-shelf-uid="...""/>"
      return tag.slice(0, -2) + attr + '/>';
    }
    // "<rect ...>"  ->  "<rect ... data-shelf-uid="...">"
    return tag.slice(0, -1) + attr + '>';
  });
}
