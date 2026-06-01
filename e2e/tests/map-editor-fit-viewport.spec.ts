/**
 * E2E: Map Editor fits the viewport without scrolling at default zoom (#70).
 *
 * Reproduces the production condition: the floor SVG is served at a fixed
 * native size (1040×720) with NO root viewBox — exactly like the real
 * floor_*.svg Inkscape exports. Before the fix this injected at native size and
 * #map-canvas (plus the page body, via the `height:100vh` view) scrolled.
 *
 * Asserts the acceptance criteria:
 *   - whole map visible, no scrollbars on #map-canvas or the page (default zoom)
 *   - switching floors keeps the no-scroll fit
 *   - the responsive transform is applied in a real browser (viewBox added,
 *     native width/height stripped)
 *   - a scaled shelf is still clickable and selection lines up (real pointer
 *     click on the rect — the custom SVG has no text overlay, so the click
 *     hit-tests the scaled rect geometry directly)
 *
 * Runs across the locale×role project matrix, so it covers LTR (en-*) and
 * RTL (he-*) — satisfying the "works in Hebrew/RTL" criterion.
 */

import { test as base, expect, Page } from '@playwright/test';
import { mockUsers } from '../fixtures/auth.fixture';
import { mockFixtures } from '../fixtures/map-editor-fixtures';

const test = base;

// Serve this repo's root so `/admin/` resolves to admin/index.html. The shared
// 8080 server (used by the manual-QA bridge) serves admin/ AT root, where
// `/admin/` is a 404 — so this suite runs its own server (see globalSetup
// below) and points baseURL at it.
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:8123' });

// Production-shaped floor SVG: fixed width/height, NO viewBox, four shelf rects
// (ids match the CSV fixture's floor-1 rows) and deliberately NO text overlays
// so a real .click() hit-tests the scaled rect.
const PROD_SHAPED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="720">
  <rect id="A1" data-map-object="shelf" x="40" y="40" width="180" height="90" fill="#94a3b8"/>
  <rect id="B1" data-map-object="shelf" x="260" y="40" width="180" height="90" fill="#94a3b8"/>
  <rect id="C1" data-map-object="shelf" x="480" y="40" width="180" height="90" fill="#94a3b8"/>
  <rect id="D1" data-map-object="shelf" x="700" y="40" width="180" height="90" fill="#94a3b8"/>
</svg>`;

function createMockJwt(user: any): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    sub: `test-sub-${user.username}`,
    email: user.email,
    email_verified: true,
    'custom:role': user.role,
    'cognito:username': user.username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test'
  };
  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${b64(header)}.${b64(payload)}.fake-signature-for-testing`;
}

async function openMapEditor(page: Page, locale: 'en' | 'he'): Promise<void> {
  const idToken = createMockJwt(mockUsers.admin);
  await page.addInitScript((data) => {
    Object.entries(data.storage).forEach(([k, v]) => window.sessionStorage.setItem(k, v as string));
    window.localStorage.setItem('locale', data.locale);
    (window as any).__E2E_TEST_MODE__ = true;
  }, {
    locale,
    storage: {
      'primo_maps_access_token': idToken,
      'primo_maps_id_token': idToken,
      'primo_maps_refresh_token': 'mock-refresh-token',
      'primo_maps_token_expiry': (Date.now() + 3600000).toString(),
      'primo_maps_user': JSON.stringify({
        username: mockUsers.admin.username,
        email: mockUsers.admin.email,
        role: mockUsers.admin.role
      })
    }
  });

  await mockFixtures(page); // CSV (+ a small SVG); the SVG route below overrides it
  // Registered last → takes precedence for floor SVG requests.
  await page.route('**/maps/floor_*.svg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' },
      body: PROD_SHAPED_SVG
    });
  });

  await page.goto('/admin/');
  await page.waitForSelector('#nav-map-editor', { state: 'visible' });
  await page.click('#nav-map-editor');
  await page.waitForSelector('#map-canvas svg #A1', { state: 'visible', timeout: 10_000 });
}

/**
 * Measure whether the page scrolls and whether the floor map fits the canvas.
 * The page-level scroll sizes are the user-facing "are there scrollbars"
 * signal: the orphan panel parks off-canvas but #map-canvas clips the x-axis,
 * so a parked panel must NOT grow the document's scroll region.
 */
async function scrollMetrics(page: Page) {
  return page.evaluate(() => {
    const c = document.getElementById('map-canvas')!;
    const svg = document.querySelector('#map-canvas > svg') as SVGElement | null;
    const doc = document.documentElement;
    const cr = c.getBoundingClientRect();
    const sr = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
    return {
      // Page-level scrollbars (default zoom must have none).
      docScrollH: doc.scrollHeight, docClientH: doc.clientHeight,
      docScrollW: doc.scrollWidth, docClientW: doc.clientWidth,
      // The canvas must not need a vertical scrollbar (the map fits).
      canvasScrollH: c.scrollHeight, canvasClientH: c.clientHeight,
      // The map itself fits inside the canvas box.
      mapFitsW: sr.width <= cr.width + 1,
      mapFitsH: sr.height <= cr.height + 1,
    };
  });
}

for (const locale of ['en', 'he'] as const) {
  test(`[${locale}] floor map fits #map-canvas with no scrollbars at default zoom`, async ({ page }) => {
    await openMapEditor(page, locale);

    const m = await scrollMetrics(page);
    // 1px tolerance for sub-pixel rounding.
    expect(m.mapFitsW, 'map wider than canvas').toBe(true);
    expect(m.mapFitsH, 'map taller than canvas').toBe(true);
    expect(m.canvasScrollH, 'canvas vertical overflow').toBeLessThanOrEqual(m.canvasClientH + 1);
    expect(m.docScrollW, 'page horizontal scrollbar').toBeLessThanOrEqual(m.docClientW + 1);
    expect(m.docScrollH, 'page vertical scrollbar').toBeLessThanOrEqual(m.docClientH + 1);
  });

  test(`[${locale}] responsive transform is applied to the injected SVG`, async ({ page }) => {
    await openMapEditor(page, locale);

    const attrs = await page.evaluate(() => {
      const svg = document.querySelector('#map-canvas > svg')!;
      return {
        viewBox: svg.getAttribute('viewBox'),
        hasWidth: svg.hasAttribute('width'),
        hasHeight: svg.hasAttribute('height'),
      };
    });
    expect(attrs.viewBox).toBe('0 0 1040 720');
    expect(attrs.hasWidth).toBe(false);
    expect(attrs.hasHeight).toBe(false);
  });

  test(`[${locale}] switching floors keeps the no-scroll fit`, async ({ page }) => {
    await openMapEditor(page, locale);

    await page.click('[data-floor="2"]');
    await page.waitForFunction(() => !!document.querySelector('#A1.map-shelf'), null, { timeout: 10_000 });

    const m = await scrollMetrics(page);
    expect(m.mapFitsW, 'map wider than canvas after floor switch').toBe(true);
    expect(m.mapFitsH, 'map taller than canvas after floor switch').toBe(true);
    expect(m.canvasScrollH).toBeLessThanOrEqual(m.canvasClientH + 1);
    expect(m.docScrollW).toBeLessThanOrEqual(m.docClientW + 1);
    expect(m.docScrollH).toBeLessThanOrEqual(m.docClientH + 1);
  });

  test(`[${locale}] scaled shelf is still clickable and selection lines up`, async ({ page }) => {
    await openMapEditor(page, locale);

    // Real pointer click at the (scaled) rect's center — verifies hit-geometry
    // survives the viewBox scaling, not just the data wiring.
    await page.locator('#map-canvas > svg #A1').click();

    await expect(page.locator('#map-side-panel .map-panel--shelf')).toBeVisible();
    await expect(page.locator('#map-side-panel')).toContainText('A1');
  });
}
