/**
 * Closed-state positioning invariant for the orphan panel.
 *
 * Issue #23: in Hebrew mode, the panel inherits `direction: ltr` from the
 * canvas's forced-LTR override (kept for SVG coordinate stability — closes
 * issue #2). `inset-inline-end: 0` then anchors the panel to the physical
 * right, while `[dir="rtl"] .map-orphan-panel { transform: translateX(-100%) }`
 * pulls it left — landing it visible inside the canvas instead of off-screen.
 *
 * This test asserts that the panel, when closed, sits fully outside the
 * canvas's visible area, in both en-admin and he-admin projects.
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

test.describe('orphan panel — closed-state off-screen invariant', () => {
  test('en: closed panel is to the right of the canvas', async ({ page }) => {
    await openMapEditor(page, 'en');
    const panel = page.locator('.map-orphan-panel');
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveClass(/map-orphan-panel--open/);
    const panelBox = await panel.boundingBox();
    const canvasBox = await page.locator('#map-canvas').boundingBox();
    if (!panelBox || !canvasBox) throw new Error('bounding boxes not measurable');
    // In LTR, closed panel should be entirely to the RIGHT of canvas (or just touching).
    expect(panelBox.x).toBeGreaterThanOrEqual(canvasBox.x + canvasBox.width - 1);
  });

  test('he: closed panel is to the left of the canvas', async ({ page }) => {
    await openMapEditor(page, 'he');
    const panel = page.locator('.map-orphan-panel');
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveClass(/map-orphan-panel--open/);
    const panelBox = await panel.boundingBox();
    const canvasBox = await page.locator('#map-canvas').boundingBox();
    if (!panelBox || !canvasBox) throw new Error('bounding boxes not measurable');
    // In RTL, closed panel should be entirely to the LEFT of canvas (or just touching).
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(canvasBox.x + 1);
  });
});
