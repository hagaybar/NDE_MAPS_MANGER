# CLAUDE.md

## ⛔ Hard Rules — read WORKFLOW.md before resolving any issue

This repo is run by an **architect who does not read source code**. All work is
governed by [`WORKFLOW.md`](./WORKFLOW.md). Before touching any issue, read it.
The following are non-negotiable (full text and rationale in WORKFLOW.md):

- **HR1** Never weaken, skip, narrow, or delete a test to make a build pass.
- **HR2** If a test seems wrong, file a one-line Spec Dispute in the PR — do not edit the test.
- **HR3** Every behavioural change adds a test you observed go red→green this run; name it in the PR.
- **HR4** Test behaviour at stable boundaries (API contract, UI behaviour), never internal call structure.
- **HR5** Never ask the owner to read code. Surface decisions as acceptance criteria, tradeoffs, and the running app.
- **HR7** Never claim tests pass without executing them in this run.

The owner is the oracle: a green suite is a signal, never the reason to merge.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Primo Maps Management System - A web application to manage SVG maps and location mappings for the Primo NDE shelf-map addon at TAU Central Library. Replaces Google Sheets-based workflow with a self-hosted AWS solution.

## AWS Infrastructure

- **S3 Bucket**: `tau-cenlib-primo-assets-hagay-3602`
- **CloudFront Distribution ID**: `E5SR0E5GM5GSB`
- **CloudFront URL**: `https://d3h8i7y9p8lyw7.cloudfront.net`
- **API Gateway**: `tt3xt4tr09` - `https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod`
- **Cognito User Pool**: `us-east-1_g9q5cPhVg`

### Live URLs (Public - No Auth Required)
- CSV: `https://d3h8i7y9p8lyw7.cloudfront.net/data/mapping.csv`
- Maps: `https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_{0,1,2}.svg`
- Admin: `https://d3h8i7y9p8lyw7.cloudfront.net/admin/`

## Architecture

Serverless architecture using:
- S3 for storage (CSV mapping file, SVG maps, admin SPA)
- CloudFront CDN for public file serving with CORS support
- Lambda + API Gateway for admin operations (JWT protected)
- Cognito for authentication (admin/editor roles)

## Project Structure

```
admin/                   # Admin SPA (vanilla JS)
  components/            # UI components (csv-editor, svg-manager, etc.)
  app.js                 # Main application
  auth-guard.js          # Role-based access control
  i18n.js                # Internationalization (Hebrew/English)
lambda/                  # Lambda functions
  listSvg.mjs            # List SVG files
  deleteSvg.mjs          # Delete SVG with versioning
  putCsv.mjs             # Update CSV with versioning
  getCsv.mjs             # Get CSV content
  auth-middleware.mjs    # JWT validation
e2e/                     # Playwright E2E tests
  fixtures/              # Auth fixtures and mocks
  pages/                 # Page Object Models
  tests/                 # Test specs
docs/                    # Documentation
  AWS-INFRASTRUCTURE.md  # CloudFront/S3/CORS configuration
data/
  mapping.csv            # Location mapping data (419 rows, 14 columns)
maps/
  floor_{0,1,2}.svg      # Floor maps with element IDs for highlighting
```

## Key Integrations

- **Primo NDE**: Angular component consumes CSV and SVG files from CloudFront
- **CORS Allowed Origins**: `tau.primo.exlibrisgroup.com`, `localhost:4200`, `localhost:4201`

### CloudFront CORS Configuration

CloudFront uses `Managed-CORS-With-Preflight` Response Headers Policy for cross-origin requests:
- Policy ID: `5cc3b908-e619-4b99-88e5-2cf7f45965bd`
- AllowedMethods: GET, HEAD, OPTIONS

**If CORS issues occur:**
1. Verify Response Headers Policy is attached to CloudFront behavior
2. Ensure OPTIONS is in AllowedMethods
3. Invalidate CloudFront cache after changes

## Running Tests

```bash
# Install dependencies
npm install && npx playwright install chromium

# Run E2E tests (starts local server automatically)
npx playwright test

# Run with visible browser
npx playwright test --headed

# View test report
npx playwright show-report
```

**Test Coverage:** 113 tests covering authentication, CSV editor, SVG manager, version history, user management, language toggle, and role-based access.

## AWS CLI Commands

```bash
# Upload files to S3
aws s3 cp file.csv s3://tau-cenlib-primo-assets-hagay-3602/data/
aws s3 sync ./maps s3://tau-cenlib-primo-assets-hagay-3602/maps/

# List bucket contents
aws s3 ls s3://tau-cenlib-primo-assets-hagay-3602/

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id E5SR0E5GM5GSB --paths "/*"

# Check/update S3 CORS
aws s3api get-bucket-cors --bucket tau-cenlib-primo-assets-hagay-3602
aws s3api put-bucket-cors --bucket tau-cenlib-primo-assets-hagay-3602 --cors-configuration file://cors-config.json

# Update CloudFront (get config, modify, apply)
aws cloudfront get-distribution-config --id E5SR0E5GM5GSB > cf-config.json
# Edit cf-config.json, then:
aws cloudfront update-distribution --id E5SR0E5GM5GSB --distribution-config file://cf-dist-config.json --if-match <ETag>
```

## Common Issues & Fixes

### Role-based UI not updating for dynamic content
When rendering dynamic content (tables, grids), call `applyRoleBasedUI()` after rendering to ensure admin-only elements are properly hidden for editors.

### CORS errors from Primo NDE addon
1. CloudFront must have `Managed-CORS-With-Preflight` Response Headers Policy
2. CloudFront AllowedMethods must include OPTIONS
3. S3 CORS config must include the requesting origin
4. Invalidate CloudFront cache after any CORS changes

### Lambda CORS headers
All Lambda functions must return CORS headers in responses, including error responses. Use `createAuthResponse()` from `auth-middleware.mjs` for consistent headers.

### Floor SVG and `mapping.csv` fetches must use `cache: 'no-cache'`
`loadFloorSvg` (`admin/components/map-editor/svg-loader.js`), `fetchAndParseSvg` (`admin/services/svg-parser.js`), `loadCSV` (`admin/components/csv-editor.js`), and `fetchMappingCsvText` (`admin/components/map-editor/csv-loader.js`) all pass `{ cache: 'no-cache' }` to `fetch()`. This is a sticky fix for a recurring stale-cache bug: after any re-upload of `maps/floor_N.svg` or `data/mapping.csv`, browsers held the previous body in cache and the UI showed wrong state — Map Editor showed a wrong "N unassigned" badge with no clickable shelves; CSV Editor showed pre-save data after reload, making users think their save didn't take. Conditional fetches let CloudFront return 304 when unchanged (no extra bandwidth) and the new body when changed. Full investigation: `docs/audits/2026-05-13-floor-svg-stale-cache.md`. Regression-guarded by `admin/__tests__/svg-loader.test.js`, `admin/__tests__/svg-parser.test.js`, `admin/__tests__/csv-editor-cache.test.js`, and `admin/__tests__/map-editor-csv-cache.test.js`.

### Map Editor floor map must fit the viewport (no scrolling at default zoom)

Issue #70. The production floor SVGs are Inkscape exports with a fixed root
size (`width="1040" height="720"`) and NO root `viewBox`, so they'd render at
native size and scroll. Three pieces keep the whole map visible without
scrollbars at default zoom:

1. `makeSvgResponsive()` in `svg-loader.js` (called by `loadFloorSvg` on every
   load, incl. the #50 post-promote re-injection): derives a `viewBox` from
   `width`/`height` when missing, then **strips `width`/`height`** so CSS sizes
   the map. **Do not re-add `width`/`height` to the root `<svg>`.**
2. `#map-canvas > svg { width:100%; height:100% }` in `app.css` scales the map
   to fit (default `preserveAspectRatio="xMidYMid meet"` centers + letterboxes).
   viewBox scaling preserves hit-geometry, so shelves stay clickable.
3. `fitMapEditorViewport()` in `map-editor.js` sizes `#map-editor-view` to the
   space left below the page chrome (it sits under header+nav+`main` padding, so
   a flat `height:100vh` overflowed the body). Runs on init + window resize.

`#map-canvas` uses `overflow-x: hidden` (not `auto`): the closed orphan panel
parks off-canvas-right via `transform: translateX(100%)`, which would otherwise
add a horizontal scrollbar. Regression-guarded by
`admin/__tests__/svg-loader-responsive.test.js` (unit) and
`e2e/tests/map-editor-fit-viewport.spec.ts` (LTR+RTL fit, floor switch,
scaled-shelf click). Run e2e against a repo-root static server, e.g.
`npx http-server . -p 8123` then `E2E_BASE_URL=http://localhost:8123 npx playwright test`.

### Bundle invariant (CSV ↔ SVG consistency)

Every CSV row's `svgCode` must resolve to a shelf in the corresponding floor's
SVG. Enforced by `putCsv` Lambda when `BUNDLE_INVARIANT_ENABLED=true`. Logs to
CloudWatch metric `bundle.violations.csv_write` regardless of flag state.

**Current state (as of 2026-05-17): `BUNDLE_INVARIANT_ENABLED=true` is LIVE in
production.** Saves that introduce a `svgCode` not resolving on its floor are
rejected with HTTP 422. Check `aws lambda get-function-configuration
--function-name primo-maps-putCsv | jq '.Environment.Variables'` to confirm.

Migration cleanup tooling lives in CSV Editor as a "Broken refs" filter
toggle. See spec: `docs/superpowers/specs/2026-05-13-sot-bundle-invariant-design.md`.

Shared validation rule: `lambda/shared/validateBundle.mjs` (server) and
`admin/services/bundle-validator.js` (client). Drift caught by parity tests
using shared fixtures at `lambda/__tests__/fixtures/bundles/`.

Shared SVG-shelf parser: `lambda/shared/svg-shelves.mjs` (server) and
`admin/services/svg-shelves.js` (client). Drift caught by parity tests using
shared fixtures at `lambda/__tests__/fixtures/svg-shelves/`.

### CSV parser parity rule

`parseCSVLine` in `admin/components/csv-editor.js` and `parseCsvLine` in
`lambda/range-validation.mjs` MUST stay behaviorally equivalent — both handle
double-quoted fields (with internal commas and `""` escapes). The Lambda
previously used a naive `split(',')` which mis-aligned columns on any row
containing a quoted comma (PR #48); with bundle enforcement active this
manifested as silent column-shift that fabricated hundreds of phantom
`shelf-not-found` errors. Server-side regression test:
`lambda/__tests__/range-validation-parser.test.mjs`. If you change either
parser, run both files' tests against the same fixtures.
