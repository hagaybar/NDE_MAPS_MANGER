# Issue #16 PR 1 — Map-object data typing (foundation)

## Goal

Make *"is this SVG element a shelf?"* an explicit, version-controlled fact in the SVG markup instead of a regex-on-naming-convention inference. Lay the groundwork for future map-object kinds (printer-editor, lift-status-editor, etc.) without committing to building any of them now.

This is the **foundation** of issue #16. It introduces the data classification + code abstraction; user-visible behaviour does not change. PR 2 will remove the temporary preservation filter and add the empty-shelf clickable / drawer-empty-state UX.

## Context

The Map Editor today determines clickability via `indexShelvesById(svgRoot, knownSvgCodes)` (in `admin/components/map-editor/svg-loader.js`), where `knownSvgCodes` is the set of `svgCode` values referenced by CSV rows on the active floor. SVG elements that exist on the map but have no CSV row pointing at them (e.g. `ka1_61_a`, `cy_28_b`, the entire CP-collection set) are invisible to clicks.

The bug being fixed in #16 — *"empty shelves are unreachable"* — requires a different way to identify the universe of clickable shelves. After a longer architectural discussion, the chosen direction is to mark shelves explicitly in the SVG itself (`data-map-object="shelf"`) rather than infer them from naming conventions. The trade-off (one-time migration cost vs. brittle convention) favours explicit data classification because:

- The classification scales naturally to future map-object kinds (printer, lift, toilet, etc.) without restructuring.
- It removes the regex-vs-data-truth divergence that surfaced as bug #24 (svg-parser module duplication).
- It documents the librarian's domain knowledge ("this rect is a shelf, that one is a toilet") in version control.

The NDE addon (TAU_customModule, branch `feature/cenlib_map_multi_locations`) consumes the SVGs by ID-based lookup only (`container.querySelector('#${CSS.escape(code)}')` in `shelf-map-svg.component.ts:292`) and reads no `data-*` attributes on SVG elements. The migration is therefore additive and addon-invisible.

## Decisions

- **Attribute name:** `data-map-object="shelf"`. Value-based so future kinds use the same attribute (`"printer"`, `"lift"`, etc.) without inventing new attributes.
- **CSV schema:** unchanged. The NDE addon's `CsvRow` interface (`libraryName, …, svgCode, …, shelfLabel, shelfLabelHe, …`) is a hard constraint.
- **Vocabulary rename scope:** internal to `admin/components/map-editor/` only. CSV-side code (everything that touches `row.svgCode` / `row.shelfLabel`) keeps the existing "shelf" terminology because the CSV is shelf-specific.
- **Migration mechanism:** one-time Python script committed to the repo at `scripts/migrate-svg-add-shelf-marker.py`. Hardcoded canonical id list per floor (37 ambiguous items reviewed and confirmed by the librarian; merged with all existing CSV svgCodes).
- **Phase split:** this PR ships the foundation with **zero user-visible behaviour change**; PR 2 ships the empty-shelf clickability + empty-state drawer + dashed outline.
- **Permissions for empty locations:** the existing `getPermittedRowIds` machinery is unchanged. PR 2 will make empty locations fully clickable for all users; the save path remains the authoritative permission gate.
- **Non-shelf SVG elements** (printers, lifts, toilets, Trom, info-kiosks, lab regions): not clickable. They have no `data-map-object="shelf"` marker. Future map-object kinds will be added by giving them their own marker value and (when needed) their own editor.

## Architecture

Three concrete changes:

1. **SVG metadata.** Every confirmed shelf rect in `maps/floor_{0,1,2}.svg` gets `data-map-object="shelf"`. Existing IDs, coordinates, fills, text content, and layer structure are untouched.

2. **New code module — `admin/components/map-editor/location-model.js`.** Single responsibility: given an SVG root, return the map-object Locations on it. PR 1 exports one function, `indexShelfLocations(svgRoot)`, which returns `Map<svgCode, SVGElement>` for elements with `data-map-object="shelf"`. Future kinds add new exports without restructuring.

3. **Map Editor refactor.** `admin/components/map-editor.js` switches from `indexShelvesById(svgRoot, knownSvgCodes)` to `indexShelfLocations(svgRoot)`. Internal variables rename `shelfElements` → `locationElements`, `shelfId` → `locationId` (within this file only). A temporary preservation filter — *"clickable iff marked AND has at least one CSV row"* — preserves today's behaviour in PR 1; PR 2 removes it.

`svg-loader.js`, `svg-interaction.js`, `shelf-state.js`, `shelf-drawer.js`, `reassign-mode.js`, `range-validation.js`, `orphan-deriver.js`, `orphan-panel.js`, `orphan-card.js` — all unchanged. They either operate on CSV rows (no SVG-side concerns) or accept the location map as an opaque parameter and don't care about its name.

The existing `indexShelvesById` function stays in `svg-loader.js` (no consumer after this PR, but defensive belt-and-suspenders during transition; removed in a follow-up cleanup).

## Migration approach

**Canonical shelf-id list** (locked during brainstorming, librarian-reviewed):

- **Floor 0:** 1 element — `CB_0` (already in CSV).
- **Floor 1:** 202 elements — 196 already in CSV + 6 additions:
  - `CL1_1` (CL1 collection block)
  - `CP_ka1`, `CP_ka2` (CP cabinets)
  - `TP_ka2` (TP collection cabinet)
  - `ka1_53_a` (side-a of cabinet 53, the original 53א' bug)
  - `ka1_61_a` (side-a of cabinet 61, the original 61א' bug)
- **Floor 2:** 191 elements — 188 already in CSV + 3 additions:
  - `CL2_2` (CL2 collection block)
  - `CP_kb2` (CP cabinet)
  - `cy_28_b` (the CY cabinet from the audit)

**Excluded as confirmed non-shelves** (no marker): toilets (`KA_AT`, `KA_MT`, `KA_WT`), printers (`Printer_*`), lifts (`lift_*`), Trom book-return staging (`Trom_*`), service desks (`Circ_*`, `Circulation_*`, `ILL_0`, `Super_0`, `Guard_0`), labs (`DH_Lab_0`, `XR_VR_Lab`), Inkscape path artifacts (`path19-5`, `path403-9`, `rect448-9`, `text449-4`, `text450-8`, `text451-8`).

**Migration script — `scripts/migrate-svg-add-shelf-marker.py`:**

Pure Python using `xml.etree.ElementTree`. Algorithm:

1. Embed the canonical id list per floor (hardcoded).
2. For each `maps/floor_{0,1,2}.svg`:
   - `ET.parse(...)` to read.
   - Walk every descendant element; if `element.attrib['id']` is in this floor's canonical list, set `element.attrib['data-map-object'] = 'shelf'`.
   - Self-check: for every id in the canonical list, assert the element was found and the attribute was set. If any are missing, exit non-zero with the offending ids.
   - `tree.write(...)` back to the same path.

**Known cosmetic side-effect.** `ElementTree` may reorder attributes alphabetically and normalise whitespace on rewrite. The rendered output is identical (browsers ignore attribute order); the diff will be larger than the strict minimum. Acceptable for a one-time migration; the SVGs are authored in Inkscape and not hand-formatted.

**Deploy.** `redeploy.sh` syncs `maps/` to S3 and invalidates CloudFront `/maps/*`. Same path used for every prior SVG update (e.g. #17).

**Future shelves.** When the librarian adds a new shelf to an SVG via Inkscape, they manually add `data-map-object="shelf"` to the new element via Inkscape's XML editor pane. We accept this manual step for now. A small admin UI to mark shelves visually is plausible future work, out of scope here.

## Testing strategy

**Layer 1 — Migration verification** (built into the Python script):

For every CSV svgCode on each floor, assert that the corresponding SVG element now carries `data-map-object="shelf"`. Catches "I forgot to include X in the canonical list" before any file is committed. Script exits non-zero with offending ids on failure.

**Layer 2 — Jest unit tests for `location-model.js`** (jsdom env):

- Empty SVG → returns empty map.
- One marked element → one entry.
- Mixed `data-map-object` values (`"shelf"`, `"printer"`, none) → only shelves returned.
- Element with `data-map-object="shelf"` but no `id` → skipped.
- Element with `id` but no `data-map-object` → skipped.
- Nested under `<g>` → still found (`querySelectorAll` is recursive).

**Layer 3 — Jest regression-guard test for CSV ↔ marker alignment:**

Reads `data/mapping.csv` and the 3 floor SVGs, asserts that every CSV svgCode on each floor corresponds to an element bearing `data-map-object="shelf"` on that floor's SVG. Catches future drift where someone adds a CSV row pointing at an unmarked element.

**Layer 4 — Existing Playwright suite must show the same pass/fail signature as `main`** (with no user-visible behaviour change, every existing test should pass unchanged). The map-editor-orphan-panel-positioning spec (#23) and the orphan-panel happy-path (#20) are the anchors.

**Manual verification (post-deploy):**

- Hard-refresh admin in Hebrew and English. Confirm the Map Editor opens cleanly (regression check for #23).
- Click a populated shelf — drawer opens normally.
- Click an un-populated shelf (e.g. `ka1_61_a` on floor 1) — *still does nothing*. This is intentional in PR 1; PR 2 makes empty shelves clickable.
- Orphan panel: badge clickable; opens directly to orphan list; the 2 live orphans on floor 2 still surface as before.

## Rollback strategy

Three layers, in increasing severity:

1. **Pre-feature tag + feature branch.** `pre/issue-16-pr1` marks `main` before any work; `fix/issue-16-map-object-typing` branches off it.
2. **Surgical PR boundary.** PR touches: 3 SVG files, 1 new code file, 1 modified code file, 2 new test files, 1 migration script. `git revert <merge-commit>` removes the entire change in one step.
3. **CloudFront re-deploy.** `redeploy.sh` syncs and invalidates `/maps/*` and `/admin/*`. If anything breaks after deploy, revert + redeploy gets back to the prior state.

PR 2 is independently rollback-able from PR 1.

## Out of scope

- **Empty-shelf clickability, empty-state drawer, dashed outline, "Create first range here" CTA, related i18n** — PR 2.
- **Unifying `svg-parser.getAvailableCodes` with the marker** — separate tech-debt issue. PR 1 leaves the regex universe intact because it's still the right answer for `svg-autocomplete.js`.
- **Removing the deprecated `indexShelvesById` from `svg-loader.js`** — separate cleanup issue after we confirm nothing imports it.
- **Marking non-shelf kinds** (`data-map-object="printer"`, `"toilet"`, etc.) — deferred until a use case exists.
- **A visual admin UI to mark new shelves on the map** — deferred. Librarians use Inkscape's XML editor pane manually for now.
- **CSV column-name migration** (`shelfLabel` → `locationLabel`) — hard-blocked by NDE addon dependency.
- **`allowedRanges` per-row permission revisit** — separate architectural conversation.

## Acceptance criteria

- `scripts/migrate-svg-add-shelf-marker.py` committed with the canonical id list embedded.
- 3 floor SVGs updated in place: floor 0 has 1 marked element, floor 1 has 202, floor 2 has 191.
- `admin/components/map-editor/location-model.js` exports `indexShelfLocations(svgRoot)`.
- `admin/components/map-editor.js` uses `indexShelfLocations`; temporary "AND has CSV row" filter preserves today's clickability behaviour.
- `admin/__tests__/location-model.test.js` — 6 tests pass.
- `admin/__tests__/svg-marker-alignment.test.js` — 1 regression-guard test passes.
- Full admin Jest suite shows the same pass/fail signature as `main` (only pre-existing #9 failures remain).
- Full Playwright suite shows the same pass/fail signature as `main`.
- Variable rename: `shelfElements` → `locationElements`, `shelfId` → `locationId` — applied within `admin/components/map-editor.js` only.
- Post-deploy manual verification: empty shelves remain non-clickable (PR 1 preserves behaviour); orphan panel and populated-shelf flows unchanged.
