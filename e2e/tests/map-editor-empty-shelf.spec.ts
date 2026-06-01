/**
 * E2E spec — issue #16 PR 2: empty-shelf clickability + UX.
 *
 * The fixture floor_test.svg defines 5 shelves: A1, B1, C1, D1 (referenced
 * by mapping_with_conflicts.csv) and E1 (unreferenced — the empty-shelf
 * under test).
 */

import { test, expect, Page } from '@playwright/test';
import { mockUsers } from '../fixtures/auth.fixture';
import { mockFixtures } from '../fixtures/map-editor-fixtures';

/**
 * Build a JWT-shaped mock token (mirrors the helper used by
 * `map-editor.spec.ts` — duplicated here to avoid coupling to a non-exported
 * symbol).
 */
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

/**
 * Dispatch a synthetic click on an SVG shelf rect. Mirrors the helper in
 * `map-editor.spec.ts` — Playwright's `.click()` is intercepted by overlay
 * `<text>` labels in the synthetic SVG fixture, so we dispatch the event
 * directly on the rect to bypass hit-testing.
 */
async function clickShelf(page: Page, shelfId: string): Promise<void> {
  await page.evaluate((id) => {
    const el = document.querySelector(`#${id}`);
    if (!el) throw new Error(`Shelf #${id} not found`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, shelfId);
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
        role: user.role,
        ...(user.allowedRanges && { allowedRanges: user.allowedRanges })
      })
    },
    user
  });
}

test.describe('Map Editor — empty shelf', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthState(page, mockUsers.admin);
    await mockFixtures(page);
    await page.goto('/admin/');
    // Wait for the Map Editor tab/panel to be reachable; specs throughout the
    // suite click the same nav entry. Use the id wired in the SPA.
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');
    await page.waitForSelector('#map-canvas svg', { state: 'visible' });
    // Wait until the interaction handlers have been wired up — the
    // `.map-shelf` class is added inside `attachInteraction` once the click
    // listeners are bound.
    await page.waitForFunction(
      () => !!document.querySelector('#E1.map-shelf'),
      undefined,
      { timeout: 10_000 }
    );
  });

  test('empty shelf E1 is clickable and opens the empty-state drawer', async ({ page }) => {
    // The dashed-outline class lands on every shelf with zero CSV rows. In
    // the fixture, only E1 qualifies — so the class count must be >= 1.
    const emptyCount = await page.evaluate(() =>
      document.querySelectorAll('.map-shelf--empty').length
    );
    expect(emptyCount).toBeGreaterThanOrEqual(1);

    // Click E1.
    await clickShelf(page, 'E1');

    // Panel renders the empty-state UI.
    await expect(page.locator('.map-panel__empty')).toBeVisible();
    await expect(page.locator('.map-panel__empty-msg')).toBeVisible();
    await expect(page.locator('#panel-empty-cta')).toBeVisible();

    // No range cards.
    expect(await page.locator('.map-card').count()).toBe(0);
  });

  test('clicking the empty-state CTA creates the first range', async ({ page }) => {
    await clickShelf(page, 'E1');
    await expect(page.locator('#panel-empty-cta')).toBeVisible();

    await page.locator('#panel-empty-cta').click();

    // Panel transitions to populated UI: the empty state is gone and one card shows.
    await expect(page.locator('.map-panel__empty')).toHaveCount(0);
    await expect(page.locator('.map-card')).toHaveCount(1);

    // The panel header shows the shelf label (count dropped from the headline).
    const header = await page.locator('.map-panel__title').textContent();
    expect(header).toContain('E1');
  });
});
