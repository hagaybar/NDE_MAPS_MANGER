/**
 * Layout invariant for the Map Editor side panel (#97 redesign).
 *
 * The old orphan overlay (which this file used to test for #23 off-screen
 * parking) is retired — the worklist is now a panel mode. The panel is a CSS-grid
 * SIBLING of #map-canvas, and per librarian request the layout is fixed
 * physically: map on the LEFT, panel on the RIGHT, the SAME in both Hebrew and
 * English. This test asserts that placement (and that the panel is not nested in
 * the canvas, so #23 cannot recur) in both en-admin and he-admin projects.
 */

import { test, expect, Page } from '@playwright/test';
import { mockUsers } from '../fixtures/auth.fixture';
import { mockFixtures } from '../fixtures/map-editor-fixtures';

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
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
  };
  const base64url = (obj: object) => {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };
  return `${base64url(header)}.${base64url(payload)}.fake-signature-for-testing`;
}

async function injectAuth(page: Page, user: any, locale: 'en' | 'he'): Promise<void> {
  const idToken = createMockJwt(user);
  await page.addInitScript((data) => {
    Object.entries(data.storage).forEach(([k, v]) => window.sessionStorage.setItem(k, v as string));
    window.localStorage.setItem('locale', data.locale);
    (window as any).__E2E_TEST_MODE__ = true;
  }, {
    storage: {
      primo_maps_access_token: idToken,
      primo_maps_id_token: idToken,
      primo_maps_refresh_token: 'mock',
      primo_maps_token_expiry: String(Date.now() + 3600000),
      primo_maps_user: JSON.stringify({ username: user.username, email: user.email, role: user.role }),
    },
    locale,
  });
}

async function openMapEditor(page: Page, locale: 'en' | 'he') {
  await injectAuth(page, mockUsers.admin, locale);
  await mockFixtures(page);
  await page.goto('/admin/');
  await page.waitForSelector('#nav-map-editor', { state: 'visible' });
  await page.click('#nav-map-editor');
  await page.waitForSelector('#map-canvas svg #A1', { state: 'visible', timeout: 10_000 });
}

test.describe('side panel — layout invariant (map left, panel right)', () => {
  for (const locale of ['en', 'he'] as const) {
    test(`${locale}: panel sits to the right of the map, the same in both languages (#97)`, async ({ page }) => {
      await openMapEditor(page, locale);
      const panel = page.locator('#map-side-panel');
      const canvas = page.locator('#map-canvas');
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      const canvasBox = await canvas.boundingBox();
      if (!panelBox || !canvasBox) throw new Error('bounding boxes not measurable');
      // Map on the LEFT, panel on the RIGHT — fixed physically in BOTH languages
      // (librarian request). The panel starts after the canvas's right edge.
      expect(panelBox.x).toBeGreaterThanOrEqual(canvasBox.x + canvasBox.width - 1);
      // And the panel is NOT a descendant of the canvas — the #23 precondition
      // (panel trapped inside the force-LTR canvas) no longer exists.
      const nested = await page.evaluate(() =>
        document.getElementById('map-canvas').contains(document.getElementById('map-side-panel'))
      );
      expect(nested).toBe(false);
    });
  }
});
