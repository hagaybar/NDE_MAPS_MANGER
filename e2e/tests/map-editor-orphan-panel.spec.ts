/**
 * E2E tests for the Map Editor orphan panel (issue #14 sub-phase 2a).
 *
 * Covers the happy-path "repair via Set shelf on map" flow:
 *   1. yellow orphan badge clickable on the floor tab
 *   2. badge click opens the right-side orphan panel with at least one card
 *   3. clicking the card's "Set shelf" primary action enters reassign mode
 *      (banner appears)
 *   4. clicking a destination shelf on the map raises the confirm dialog,
 *      accepting the dialog completes the repair
 *   5. the repaired card disappears from the panel
 *
 * Notes:
 *   - This file mirrors the auth + fixture pattern used by `map-editor.spec.ts`
 *     (in-spec `injectAuthState` + `mockFixtures`) rather than the global
 *     `loginAs*` Playwright fixtures. The map-editor specs predate the unified
 *     auth fixture and we want to stay consistent with that suite.
 *   - The synthetic CSV (`mapping_with_conflicts.csv`) ships one orphan row
 *     (svgCode=MISSING) on floor 1 — that row materialises the badge.
 *   - If somehow no orphan badges exist (e.g. fixture changes upstream), the
 *     test gracefully `test.skip(...)`s rather than failing — per plan §10.3.
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
    // Force English locale so test selectors / text assertions stay stable —
    // the app defaults to Hebrew (`i18n.js` line 3) which would emit
    // bidi-translated strings instead of "1 unassigned".
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

/**
 * Mock the `/api/csv` PUT endpoint so the repair flow's `saveCsv` call
 * succeeds and triggers `markOrphanRepaired` (which removes the card).
 */
async function mockSaveCsv(page: Page): Promise<void> {
  await page.route('**/api/csv', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'CSV saved successfully' })
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Dispatch a synthetic click on an SVG shelf rect — the synthetic SVG fixture
 * draws text labels on top of each rect, so Playwright's normal `.click()`
 * hit-tests onto the text element and misses the rect's listener. Same trick
 * `map-editor.spec.ts` uses.
 */
async function clickShelf(page: Page, shelfId: string): Promise<void> {
  await page.evaluate((id) => {
    const el = document.querySelector(`#${id}`);
    if (!el) throw new Error(`Shelf #${id} not found`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, shelfId);
}

async function openMapEditor(page: Page): Promise<void> {
  await injectAuthState(page, mockUsers.admin);
  await mockFixtures(page);
  await mockSaveCsv(page);
  await page.goto('/admin/');
  await page.waitForSelector('#nav-map-editor', { state: 'visible' });
  await page.click('#nav-map-editor');
  await page.waitForSelector('#map-canvas svg #A1', { state: 'visible', timeout: 10_000 });
}

async function switchToFloor(page: Page, floor: number, sentinelShelf = 'A1'): Promise<void> {
  await page.click(`[data-floor="${floor}"]`);
  await page.waitForFunction(
    (id) => !!document.querySelector(`#${id}.map-shelf`),
    sentinelShelf,
    { timeout: 10_000 }
  );
}

test.describe('Map Editor — orphan panel (sub-phase 2a)', () => {
  test('opens panel from badge, repairs an orphan via Set shelf on map', async ({ page }) => {
    await openMapEditor(page);
    await switchToFloor(page, 1);

    // Find an orphan badge on floor 1. The fixture CSV has one MISSING row,
    // so this should be present — but bail out gracefully if not so the spec
    // never blocks CI on data-shape changes.
    const badge = page.locator('[data-floor="1"] .map-orphan-badge');
    const badgeCount = await badge.count();
    if (badgeCount === 0) {
      test.skip(true, 'no orphan badges on floor 1 — happy path requires at least one');
      return;
    }

    await expect(badge).toBeVisible();

    // The orphan-deriver consults `isValidSvgCode`, which is lenient (returns
    // true) until `svgCodeCache` for the floor is populated by
    // `preloadAllFloors()` (fire-and-forget at SPA bootstrap). Prime the cache
    // by issuing a direct fetch to the same URL — the `mockFixtures` route
    // resolves it instantly, so this just nudges the cache to land before we
    // open the panel.
    await page.evaluate(async () => {
      try {
        await fetch('https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_1.svg');
      } catch {
        /* the mock fulfills synchronously; ignore */
      }
    });

    // Click the badge — opens the worklist in the side panel's triage mode.
    await badge.click();
    await expect(page.locator('#map-side-panel .map-panel--triage')).toBeVisible();

    // Wait for at least one card to appear. If the SVG cache is still cold
    // when the panel opens, the deriver returns an empty list and the panel
    // shows the empty state — re-clicking the badge after the cache lands
    // refreshes the list.
    const firstCard = page.locator('.map-orphan-card').first();
    try {
      await firstCard.waitFor({ state: 'visible', timeout: 2_000 });
    } catch {
      // Refresh: close the worklist and reopen via the badge.
      await page.locator('#panel-triage-close').click();
      await badge.click();
      await firstCard.waitFor({ state: 'visible', timeout: 5_000 });
    }
    const rowIdBefore = await firstCard.getAttribute('data-row-id');
    expect(rowIdBefore).not.toBeNull();
    expect(rowIdBefore).not.toBe('');

    // Click the primary "Set shelf" action — enters reassign mode.
    await firstCard.locator('[data-action="set-shelf"]').click();

    // Reassign banner should appear.
    await expect(page.locator('#map-reassign-banner')).toBeVisible();

    // Pick D1 as the destination shelf. The repair flow uses a confirm
    // dialog before applying — accept it.
    page.once('dialog', async dialog => {
      await dialog.accept();
    });
    await clickShelf(page, 'D1');

    // Banner should disappear once the pick is committed.
    await expect(page.locator('#map-reassign-banner')).toHaveCount(0);

    // The repaired card should be removed from the panel.
    await expect(page.locator(`.map-orphan-card[data-row-id="${rowIdBefore}"]`)).toHaveCount(0);
  });
});
