/**
 * Map Editor E2E Fixtures
 *
 * Mocks the production data sources (CloudFront-hosted SVG floor maps and
 * mapping.csv) with synthetic fixtures designed to exercise the map editor's
 * conflict detection, orphan detection, and permission-restricted scope flows.
 *
 * The synthetic SVG (`floor_test.svg`) defines four rect shelves: A1, B1, C1, D1.
 * The synthetic CSV (`mapping_with_conflicts.csv`) ships rows referencing those
 * shelves plus an orphan svgCode (`MISSING`) — all on floor 1.
 *
 * Style follows `e2e/fixtures/auth.fixture.ts` (`mockApiResponses`) and
 * `e2e/tests/editor-ranges.spec.ts` (`setupMockApiResponses`): use Playwright
 * `page.route` glob patterns so any environment (CloudFront, localhost) is
 * intercepted.
 */

import { Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// `package.json` uses `"type": "module"`, so CommonJS `__dirname` is
// unavailable. Resolve the fixtures directory relative to this module's URL.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'map-editor');

const SVG_BODY = readFileSync(join(FIXTURES_DIR, 'floor_test.svg'), 'utf-8');
const CSV_BODY = readFileSync(join(FIXTURES_DIR, 'mapping_with_conflicts.csv'), 'utf-8');

/**
 * Install Playwright route handlers that serve the synthetic map-editor
 * fixtures for every floor SVG and the mapping CSV the SPA fetches.
 *
 * Call this BEFORE navigating the page, in your `beforeEach` block.
 *
 * Matches both the production CloudFront URL and any other origin (the
 * `**\/maps\/floor_*.svg` glob covers `https://d3h8i7y9p8lyw7.cloudfront.net/...`
 * as well as relative paths under the local dev server).
 */
export async function mockFixtures(page: Page): Promise<void> {
  // Serve the same synthetic SVG for every floor (floor_0.svg, floor_1.svg,
  // floor_2.svg, etc.) — tests exercising floor switching can rely on the SVG
  // being available regardless of which tab is active.
  await page.route('**/maps/floor_*.svg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: SVG_BODY
    });
  });

  // Serve the seeded CSV with conflicts + orphan + restricted-scope rows.
  await page.route('**/data/mapping.csv', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: CSV_BODY
    });
  });
}

/**
 * Raw fixture bodies — exported for tests that want to assert on or modify
 * the fixture contents (e.g. inject a temporary CSV variant for one test).
 */
export const mapEditorFixtureBodies = {
  svg: SVG_BODY,
  csv: CSV_BODY
};
