---
name: primo-maps-dev
description: Use when changing NDE_MAPS_MANGER (Primo Maps) code or deploying it — caching and fetches of the floor SVGs or mapping.csv, the floor SVG files or Map Editor sizing, the bundle invariant, the CSV/SVG parsers and their parity tests, CORS (CloudFront, S3, Lambda responses), role-based UI, admin module ?v= tokens, or tau-deploy. Explains why each CLAUDE.md rule exists and how it is guarded.
---

# Primo Maps: the rules and why they exist

CLAUDE.md lists the rules in one line each. This is the reasoning, the files and the tests behind
them. AWS resource IDs and CLI diagnosis live in `docs/AWS-INFRASTRUCTURE.md`, not here.

## CORS: one owner, CloudFront
- CloudFront attaches the managed `Managed-CORS-With-Preflight` response-headers policy and serves
  `Access-Control-Allow-Origin: *` for `/data/*` and `/maps/*`.
- **Never re-add S3 bucket CORS.** The policy only adds headers when the origin sends none, and
  the `CachingOptimized` cache policy does not key on `Origin`. While S3 sent a per-origin
  header, CloudFront cached one requester's value and replayed it to everyone: the shelf map went
  invisible in production (2026-07-08). The old rule is kept as
  `cors-config.removed-2026-07-08.json` so a command that names the old file fails loudly.
- If the addon reports CORS errors: diagnosis steps are in `docs/AWS-INFRASTRUCTURE.md`,
  "Troubleshooting". All of them need AWS access: describe the symptom to the owner.
- **Lambda responses**, including errors, must carry CORS headers or the browser hides the real
  error behind a CORS failure. Build responses with `createAuthResponse()` from
  `lambda/auth-middleware.mjs`. Known gap: listSvg cold start returns 502 without CORS headers (#43).

## Stale-cache fetches: `cache: 'no-cache'`
Four fetches pass `{ cache: 'no-cache' }`: `loadFloorSvg` (`admin/components/map-editor/svg-loader.js`),
`fetchAndParseSvg` (`admin/services/svg-parser.js`), `loadCSV` (`admin/components/csv-editor.js`),
`fetchMappingCsvText` (`admin/components/map-editor/csv-loader.js`).
- Why: after a re-upload of `maps/floor_N.svg` or `data/mapping.csv`, browsers served the old body.
  The Map Editor showed a wrong "N unassigned" badge with unclickable shelves; the CSV Editor
  showed pre-save data after reload, so users thought the save had failed.
- `no-cache` is a conditional request: CloudFront answers 304 when unchanged, the new body when changed.
- Record: `docs/audits/2026-05-13-floor-svg-stale-cache.md`. Guards: `admin/__tests__/svg-loader.test.js`,
  `svg-parser.test.js`, `csv-editor-cache.test.js`, `map-editor-csv-cache.test.js`.
- A new fetch of either file needs the same option and a test.

## Module `?v=N` tokens
- The SPA has no bundler. ES-module imports carry `?v=N`; changing a module means bumping its
  token in **every** file of its import chain (and `index.html` if it loads it), or browsers
  mix old and new modules. `index.html` is deployed with `Cache-Control: no-cache`.
- Exception: `svg-parser.js` and `data-model.js` are never imported with `?v=`. Two URLs make two
  module singletons, which stop sharing cache state and break orphan detection (#24,
  `docs/audits/2026-05-12-orphan-panel-audit.md`). Guard: `admin/__tests__/no-duplicate-module-imports.test.js`.
- Standardising the tokens is open as #27.

## Floor SVGs and the Map Editor viewport (#70)
The production SVGs are Inkscape exports with a fixed root size (`width="1040" height="720"`) and
no root `viewBox`, so they would render at native size and scroll.
1. `makeSvgResponsive()` in `svg-loader.js` (run by `loadFloorSvg` on every load, including the
   post-promote re-injection) derives a `viewBox` from `width`/`height`, then strips them so CSS
   sizes the map. **Do not re-add `width`/`height` to the root `<svg>`**, in code or in a map file.
2. `#map-canvas > svg { width:100%; height:100% }` in `app.css` scales it; viewBox scaling keeps
   hit geometry, so shelves stay clickable.
3. `fitMapEditorViewport()` in `map-editor.js` sizes `#map-editor-view` to the space under the
   page chrome, on init and on resize.
`#map-canvas` uses `overflow-x: hidden`: the closed orphan panel parks off-canvas with
`translateX(100%)`. Guards: `admin/__tests__/svg-loader-responsive.test.js`,
`e2e/tests/map-editor-fit-viewport.spec.ts` (LTR and RTL, floor switch, scaled-shelf click).
A shelf is an element with `data-map-object="shelf"` and a non-empty `id`; `data-shelf-uid` is
stamped at promote and lets reconcile tell a rename from a delete.

## The bundle invariant
- Every CSV row's floor must be 0, 1 or 2, and its `svgCode` must be a shelf in that floor's SVG.
  `putCsv` rejects a violating save with HTTP 422 when `BUNDLE_INVARIANT_ENABLED=true` (live in
  production, recorded 2026-05-17), and logs the CloudWatch metric `bundle.violations.csv_write` either way.
- Blank floors are errors, never coerced: `Number('') === 0` once put a shelf on the wrong floor.
- Orphan shelves (in the SVG, no row) and range overlaps are deliberately not violations.
- Server rule `lambda/shared/validateBundle.mjs`; client copy `admin/services/bundle-validator.js`.
  Shelf parsers `lambda/shared/svg-shelves.mjs` ↔ `admin/services/svg-shelves.js`. Fixtures:
  `lambda/__tests__/fixtures/bundles/`, `.../svg-shelves/`. Change both sides and run both suites.
- Design: `docs/superpowers/specs/2026-05-13-sot-bundle-invariant-design.md`. Cleanup tooling:
  the CSV Editor's "Broken refs" filter. Flipping the flag is an env-var change: owner only.

## CSV parser parity
`parseCSVLine` (`admin/components/csv-editor.js`) and `parseCsvLine` (`lambda/range-validation.mjs`)
must behave the same on quoted fields (internal commas, `""` escapes). The Lambda once used
`split(',')`; any quoted comma shifted columns, and with enforcement on that produced hundreds of
phantom `shelf-not-found` errors (PR #48). Guards: `lambda/__tests__/range-validation-parser.test.mjs`
and `admin/__tests__/csv-parser-parity.test.js` (same fixtures, both parsers). Known drift in the
reconcile serializer: #140.

## Roles in the UI
Roles (`admin`, `editor`; unknown users are `viewer`) and editor scopes (`custom:allowedRanges`)
are enforced in the Lambdas. The SPA mirrors them in `admin/auth-guard.js`. After rendering
dynamic content (tables, grids, cards), call `applyRoleBasedUI()` again, or admin-only controls
appear for editors (the server still refuses the action, but the UI lies).

## Call numbers and floors
`compareCallNumbers` exists in `admin/utils/range-filter.js`, `admin/services/data-model.js` and
`lambda/range-validation.mjs`; change all three. Known comparator bug: #121. Floors are hardcoded
as `FLOOR_VALUES` (`data-model.js`) and `VALID_FLOORS` (`validateBundle.mjs`).

## Tests
- Jest needs `--experimental-vm-modules` (native ES modules); `npm test` in `admin/` and `lambda/` sets it.
- Playwright projects `en-admin`, `he-admin`, `en-editor`, `he-editor`; locale and role come from
  the project name. Screenshot baselines: `e2e/tests/__screenshots__/`. Auth is mocked
  (`e2e/fixtures/auth.fixture.ts`). Most specs open `/` and expect `admin/` served there
  (`npx http-server admin -p 8080`, the config default). `map-editor-fit-viewport.spec.ts` was
  written against a repo-root server (`npx http-server . -p 8123`, `E2E_BASE_URL=http://localhost:8123`);
  run the full suite against a repo-root server and most specs fail (they get a directory listing).
- No CI: paste the run output into the PR (template, HR7).

## Deploying from the sandbox
- `tau-deploy admin` syncs `admin/` (tests, `node_modules`, Jest config and `package*.json`
  excluded) to S3 with `--delete`, re-uploads `index.html` no-cache and invalidates `/admin/*`.
  `tau-deploy lambda <name>` packages one function from source like the live ones.
- The broker deploys only commits on `origin/main` and runs that side's Jest suite first; it
  backs up before each deploy and prints the deploy id for `tau-deploy rollback <id>`.
- Merge before deploying: because of `--delete`, deploying `main` removes anything deployed from
  an unmerged branch earlier.
- Not available to agents: API Gateway, IAM, CloudFront, bucket settings, Lambda environment,
  `deploy-staging-lambdas.sh`, direct `aws s3 cp` to `data/` or `maps/` (bypasses versioning).
