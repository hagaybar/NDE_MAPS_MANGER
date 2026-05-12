#!/usr/bin/env python3
"""
One-time migration: add `data-map-object="shelf"` to every confirmed
shelf rect in maps/floor_{0,1,2}.svg.

Canonical shelf-id list per floor = union of:
  1. All svgCode values in data/mapping.csv on that floor.
  2. The 9 librarian-reviewed additions hardcoded in ADDITIONS_BY_FLOOR.

Uses regex-based text replacement to preserve SVG formatting exactly
(ElementTree's rewrite collapses whitespace unreviewably).

Idempotent: re-running adds the attribute only if not already present.

Stale CSV rows pointing at non-existent SVG elements (E006 orphans)
are logged as warnings, not errors — they're handled by the
errors-dashboard, not by this migration.

Usage:
  python3 scripts/migrate-svg-add-shelf-marker.py
"""

import csv
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = REPO_ROOT / 'data' / 'mapping.csv'
SVG_DIR = REPO_ROOT / 'maps'

ADDITIONS_BY_FLOOR = {
    '0': set(),
    '1': {'CL1_1', 'CP_ka1', 'CP_ka2', 'TP_ka2', 'ka1_53_a', 'ka1_61_a'},
    '2': {'CL2_2', 'CP_kb2', 'cy_28_b'},
}


def canonical_ids_by_floor():
    by_floor = {'0': set(), '1': set(), '2': set()}
    with CSV_PATH.open(encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            floor = (row.get('floor') or '').strip()
            code = (row.get('svgCode') or '').strip()
            if floor in by_floor and code:
                by_floor[floor].add(code)
    for floor, additions in ADDITIONS_BY_FLOOR.items():
        by_floor[floor] |= additions
    return by_floor


# Match an opening tag (anything but `>`) that contains id="<ID>" and
# does NOT already contain data-map-object=. Captures the entire tag
# so we can splice the attribute in after id="...".
def mark_id_in_text(text, target_id):
    """Return (new_text, marked_count). Idempotent."""
    # Escape the id for use in regex.
    id_re = re.escape(target_id)
    # Tag pattern: <tagname ... id="<target_id>" ... > / />
    # Avoid matching tags that already contain data-map-object.
    pattern = re.compile(
        r'(<[A-Za-z][A-Za-z0-9:_-]*\b[^>]*?\sid="' + id_re + r'")(?![^>]*\bdata-map-object=)([^>]*?/?>)',
        re.DOTALL,
    )
    def repl(m):
        return m.group(1) + ' data-map-object="shelf"' + m.group(2)
    new_text, count = pattern.subn(repl, text)
    return new_text, count


def migrate_floor(floor, ids_to_mark):
    svg_path = SVG_DIR / f'floor_{floor}.svg'
    text = svg_path.read_text(encoding='utf-8')

    marked_ids = []
    stale_ids = []
    for target_id in sorted(ids_to_mark):
        new_text, count = mark_id_in_text(text, target_id)
        if count == 0:
            # Either the id isn't in the SVG (stale CSV row) or it was
            # already marked by an earlier idempotent run. Distinguish:
            already = re.search(
                r'<[^>]*\bid="' + re.escape(target_id) + r'"[^>]*\bdata-map-object="shelf"',
                text,
                re.DOTALL,
            )
            if already:
                marked_ids.append(target_id)  # already marked, idempotent no-op
            else:
                stale_ids.append(target_id)
        else:
            marked_ids.append(target_id)
            text = new_text

    svg_path.write_text(text, encoding='utf-8')
    print(f'floor {floor}: marked {len(marked_ids)} elements')
    if stale_ids:
        print(
            f'  WARN: {len(stale_ids)} canonical id(s) not present in SVG '
            f'(stale CSV rows? E006 orphans?): {stale_ids}',
            file=sys.stderr,
        )
    return True


def main():
    ids = canonical_ids_by_floor()
    print(
        f'Canonical shelf-id counts: '
        f'floor 0 = {len(ids["0"])}, '
        f'floor 1 = {len(ids["1"])}, '
        f'floor 2 = {len(ids["2"])}'
    )

    for floor in ('0', '1', '2'):
        migrate_floor(floor, ids[floor])


if __name__ == '__main__':
    main()
