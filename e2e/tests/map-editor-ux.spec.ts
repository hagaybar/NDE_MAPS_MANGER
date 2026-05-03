/**
 * UX-polish behaviour assertions for the Map Editor (Phase 3).
 *
 * Phase 3a (this spec): the bottom drawer must NEVER overlay the canvas. Pre-fix
 * the drawer was `position: fixed; bottom: 0` and covered the canvas's lower
 * shelves. The fix turns `#map-editor-view` into a flex column so the drawer
 * pushes the canvas region rather than stacking on top of it.
 *
 * Auth/fixture wiring mirrors `e2e/tests/map-editor-console-smoke.spec.ts`
 * (intentional duplication; the file-level note there explains the rationale).
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/console';
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
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test'
  };
  const base64url = (obj: object) => {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };
  return `${base64url(header)}.${base64url(payload)}.fake-signature-for-testing`;
}

async function injectAuthState(page: Page, user: any): Promise<void> {
  const idToken = createMockJwt(user);
  const accessToken = idToken;
  const tokenExpiry = (Date.now() + 3600000).toString();

  await page.addInitScript((data) => {
    Object.entries(data.storage).forEach(([key, value]) => {
      window.sessionStorage.setItem(key, value as string);
    });
    window.localStorage.setItem('locale', 'en');
    (window as any).__E2E_TEST_MODE__ = true;
    (window as any).__E2E_USER__ = data.user;
  }, {
    storage: {
      'primo_maps_access_token': accessToken,
      'primo_maps_id_token': idToken,
      'primo_maps_refresh_token': 'mock-refresh-token',
      'primo_maps_token_expiry': tokenExpiry,
      'primo_maps_user': JSON.stringify({
        username: user.username,
        email: user.email,
        role: user.role
      })
    },
    user
  });
}

async function clickShelf(page: Page, shelfId: string): Promise<void> {
  await page.evaluate((id) => {
    const el = document.querySelector(`#${id}`);
    if (!el) throw new Error(`Shelf #${id} not found`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, shelfId);
}

test.describe('@phase-3 Map Editor UX polish', () => {
  test('drawer does not overlay canvas (#1)', async ({ page, consoleMessages }) => {
    await injectAuthState(page, mockUsers.admin);
    await mockFixtures(page);

    await page.goto('/admin/');
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');

    // Switch to Floor 1 so attachInteraction wires up shelf clicks. Mirrors
    // the console-smoke spec's flow.
    await page.click('[data-floor="1"]');
    await page.waitForFunction(
      () => !!document.querySelector('#A1.map-shelf'),
      null,
      { timeout: 10_000 }
    );

    // Open the drawer by selecting a shelf — only then is the layout under
    // test (drawer is `display: none` while hidden, so its bounding box is null).
    await clickShelf(page, 'A1');
    await expect(page.locator('#map-drawer')).toBeVisible();

    // Allow the flex layout one frame to settle before measuring.
    await page.waitForTimeout(50);

    const canvasBox = await page.locator('#map-canvas').boundingBox();
    const drawerBox = await page.locator('#map-drawer').boundingBox();
    expect(canvasBox, 'canvas must have a layout box').not.toBeNull();
    expect(drawerBox, 'drawer must have a layout box once visible').not.toBeNull();

    // Drawer top edge must sit at or below the canvas's bottom edge. The
    // `- 1` slack accounts for sub-pixel rounding from the browser's layout
    // engine; an actual overlay would clear this threshold by tens of pixels.
    expect(drawerBox!.y).toBeGreaterThanOrEqual(canvasBox!.y + canvasBox!.height - 1);

    // The console fixture's afterEach also asserts cleanliness; do it mid-test
    // so a regression points at the layout interaction rather than teardown.
    consoleMessages.assertClean();
  });
});
