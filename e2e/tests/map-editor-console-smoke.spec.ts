/**
 * Console-clean smoke test for the Map Editor (Phase 1 quality gate).
 *
 * Verifies that opening the admin SPA, navigating to the Map Editor, and
 * clicking a shelf does not emit any console.error / console.warn messages.
 * The `consoleMessages` fixture asserts cleanliness automatically in its
 * fixture teardown — this spec only needs to drive the UI.
 *
 * Implementation notes:
 *   - Auth + map-editor fixture wiring is duplicated from
 *     `e2e/tests/map-editor.spec.ts` rather than imported, because that file
 *     uses the bare `@playwright/test` `test` and we need the `console.ts`
 *     extended one. The duplication is intentional and minimal.
 *   - We dispatch the click as a synthetic SVG event for the same reason the
 *     existing map-editor specs do — text-label overlays would otherwise
 *     intercept Playwright's hit-test.
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
    // Force English locale so any future text assertions stay stable; the app
    // defaults to Hebrew.
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

test('Map Editor: clicking a shelf produces no console errors or warnings', async ({ page, consoleMessages }) => {
  await injectAuthState(page, mockUsers.admin);
  await mockFixtures(page);

  await page.goto('/admin/');
  await page.waitForSelector('#nav-map-editor', { state: 'visible' });
  await page.click('#nav-map-editor');

  // Click the Floor 1 tab so the floor's SVG renders and attachInteraction
  // wires up shelf click handlers (adds the `.map-shelf` class). Without this
  // explicit floor switch the test races the default-floor render. Mirrors
  // `switchToFloor` in `map-editor.spec.ts`.
  await page.click('[data-floor="1"]');
  await page.waitForFunction(
    () => !!document.querySelector('#A1.map-shelf'),
    null,
    { timeout: 10_000 }
  );

  // Click a shelf to exercise the selection path.
  await clickShelf(page, 'A1');
  await expect(page.locator('#map-drawer')).toBeVisible();

  // Allow any deferred logging to flush before the fixture's afterEach asserts.
  await page.waitForTimeout(250);

  // Assert mid-test as well so a failure points at this exact action rather
  // than the fixture teardown.
  consoleMessages.assertClean();
});
