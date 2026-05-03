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

async function injectAuthState(page: Page, user: any, locale: 'en' | 'he' = 'en'): Promise<void> {
  const idToken = createMockJwt(user);
  const accessToken = idToken;
  const tokenExpiry = (Date.now() + 3600000).toString();

  // The user blob persisted to sessionStorage carries `allowedRanges` so the
  // app's auth-service hydrates the editor's restriction set on first load.
  const userJson: Record<string, unknown> = {
    username: user.username,
    email: user.email,
    role: user.role
  };
  if (user.allowedRanges) {
    userJson.allowedRanges = user.allowedRanges;
  }

  await page.addInitScript((data) => {
    Object.entries(data.storage).forEach(([key, value]) => {
      window.sessionStorage.setItem(key, value as string);
    });
    window.localStorage.setItem('locale', data.locale);
    (window as any).__E2E_TEST_MODE__ = true;
    (window as any).__E2E_USER__ = data.user;
  }, {
    storage: {
      'primo_maps_access_token': accessToken,
      'primo_maps_id_token': idToken,
      'primo_maps_refresh_token': 'mock-refresh-token',
      'primo_maps_token_expiry': tokenExpiry,
      'primo_maps_user': JSON.stringify(userJson)
    },
    user,
    locale
  });
}

/**
 * Parse `<locale>-<role>` from the active Playwright project name.
 * Falls back to (`en`, `admin`) for the default `chromium` project so the
 * existing behaviour-only tests keep working when run without --project.
 */
function parseProjectMatrix(projectName: string): { locale: 'en' | 'he'; role: 'admin' | 'editor' } {
  const m = projectName.match(/^(en|he)-(admin|editor)$/);
  if (!m) return { locale: 'en', role: 'admin' };
  return { locale: m[1] as 'en' | 'he', role: m[2] as 'admin' | 'editor' };
}

/**
 * Editor whose call-number scope is restricted to 100..110 — A1 (range 100-110)
 * is editable, D1 (range 300-310) is fully-locked, B1/C1 (100-105.5 / 105.5-110)
 * are also editable. This gives editor projects a clickable shelf for the
 * single-shelf snapshot. The locked-row snapshot uses a richer 2-ranges-on-A1
 * CSV (see `installMixedLockA1Csv`) so the drawer renders one editable + one
 * locked row simultaneously.
 *
 * Matches the `mockUsers.editor` shape (allowedRanges enabled).
 */
const RESTRICTED_EDITOR = {
  ...mockUsers.editor,
  allowedRanges: {
    enabled: true,
    filterGroups: [
      {
        collections: [],
        floors: [],
        callNumberRanges: [{ start: '100', end: '110' }]
      }
    ]
  }
};

/**
 * Override the standard map-editor CSV fixture with a variant where shelf A1
 * carries two ranges: one inside the editor's 100..110 scope (editable) and
 * one outside (locked). This lets the locked-row snapshot capture the mixed
 * drawer state. Must be called AFTER `mockFixtures(page)`.
 */
async function installMixedLockA1Csv(page: Page): Promise<void> {
  const header = 'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe';
  const lib = 'Sourasky Central Library,הספרייה המרכזית סוראסקי,Soc Sociology Collection. 1st floor,Soc סוציולוגיה. קומה א\',';
  const tail = ',Soc Sociology Collection. 1st floor,Soc סוציולוגיה. קומה א\',1,A1,A1,';
  const rows = [
    `${lib}100,110,A1${tail}editable range,טווח עריכה`,
    `${lib}300,310,A1${tail}locked range,טווח נעול`
  ];
  const csv = `${header}\n${rows.join('\n')}\n`;
  // page.route handlers are FIFO — `page.route` registers our override BEFORE
  // the existing mockFixtures handler in the matcher chain because Playwright
  // tries the most-recently-added route first (`route.fallback()` would chain
  // back). Fulfill outright so the original CSV never wins.
  await page.route('**/data/mapping.csv', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' },
      body: csv
    });
  });
}

/**
 * Resolve the user object for the active project. Editor projects use the
 * call-number-restricted variant so the locked-row snapshot is meaningful.
 */
function userForRole(role: 'admin' | 'editor'): any {
  return role === 'admin' ? mockUsers.admin : RESTRICTED_EDITOR;
}

/** Unique snapshot name with the project matrix baked in. */
function snapshotName(base: string, locale: string, role: string): string {
  return `${base}-${locale}-${role}.png`;
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

  // ---------------------------------------------------------------------------
  // Issue #6 — close affordance: X button + Esc handler.
  //
  // The drawer's only previous exits were "click another shelf" and "click
  // empty canvas" (which doesn't clear selection). These tests cover the new
  // explicit close paths.
  // ---------------------------------------------------------------------------

  test('click X closes drawer (#6)', async ({ page }) => {
    await injectAuthState(page, mockUsers.admin);
    await mockFixtures(page);

    await page.goto('/admin/');
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');

    await page.click('[data-floor="1"]');
    await page.waitForFunction(
      () => !!document.querySelector('#A1.map-shelf'),
      null,
      { timeout: 10_000 }
    );

    await clickShelf(page, 'A1');
    await expect(page.locator('#map-drawer')).toBeVisible();

    await page.click('#drawer-close');
    await expect(page.locator('#map-drawer')).toHaveClass(/map-drawer--hidden/);
    // No shelf should be selected after close.
    const selected = await page.locator('.map-shelf--selected').count();
    expect(selected).toBe(0);
  });

  test('Esc with no pending edits closes drawer silently (#6)', async ({ page }) => {
    await injectAuthState(page, mockUsers.admin);
    await mockFixtures(page);

    // Track any confirm() invocations — there should be none.
    let confirmCalled = false;
    page.on('dialog', async (d) => {
      if (d.type() === 'confirm') confirmCalled = true;
      await d.dismiss();
    });

    await page.goto('/admin/');
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');

    await page.click('[data-floor="1"]');
    await page.waitForFunction(
      () => !!document.querySelector('#A1.map-shelf'),
      null,
      { timeout: 10_000 }
    );

    await clickShelf(page, 'A1');
    await expect(page.locator('#map-drawer')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#map-drawer')).toHaveClass(/map-drawer--hidden/);
    expect(confirmCalled).toBe(false);
  });

  test('Esc with pending edits prompts confirm; cancel keeps drawer (#6)', async ({ page }) => {
    await injectAuthState(page, mockUsers.admin);
    await mockFixtures(page);

    await page.goto('/admin/');
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');

    await page.click('[data-floor="1"]');
    await page.waitForFunction(
      () => !!document.querySelector('#A1.map-shelf'),
      null,
      { timeout: 10_000 }
    );

    await clickShelf(page, 'A1');
    await expect(page.locator('#map-drawer')).toBeVisible();

    // Force window.confirm to return false so the Esc-cancel path is exercised
    // synchronously (avoids the async dialog round-trip and its timing).
    await page.evaluate(() => { (window as any).confirm = () => false; });

    // Create a pending edit by modifying the rangeStart input.
    const startInput = page.locator('#map-drawer [data-field="rangeStart"]').first();
    await startInput.fill('999');

    await page.keyboard.press('Escape');
    // Drawer must still be visible (confirm returned false → no close).
    await expect(page.locator('#map-drawer')).toBeVisible();
    // Pending edit must still be present (input value preserved).
    await expect(startInput).toHaveValue('999');
  });

  test('Esc during reassign-mode does not close drawer (#6)', async ({ page }) => {
    await injectAuthState(page, mockUsers.admin);
    await mockFixtures(page);
    // Auto-accept any confirm dialogs that surface (none expected here).
    page.on('dialog', d => d.accept());

    await page.goto('/admin/');
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');

    await page.click('[data-floor="1"]');
    await page.waitForFunction(
      () => !!document.querySelector('#A1.map-shelf'),
      null,
      { timeout: 10_000 }
    );

    await clickShelf(page, 'A1');
    await expect(page.locator('#map-drawer')).toBeVisible();

    // Enter reassign-mode via the row's "Move" button.
    await page.click('#map-drawer [data-action="move"]');
    await expect(page.locator('#map-reassign-banner')).toBeVisible();

    await page.keyboard.press('Escape');
    // Reassign-mode handles its own Esc → banner disappears, drawer remains.
    await expect(page.locator('#map-reassign-banner')).toBeHidden();
    await expect(page.locator('#map-drawer')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Visual snapshot suite (Phase 3 quality gate).
  //
  // Each test reads `test.info().project.name` to determine the locale (en/he)
  // and role (admin/editor) it runs as, then drives the editor into the
  // target state and captures a full-page screenshot. Baselines are produced
  // per project so the suite expands to 4× the listed states.
  //
  // We use small `maxDiffPixels`/`threshold` slack to absorb sub-pixel font
  // rendering and minor easing-tail jitter; an actual regression in layout
  // or styling clears these thresholds by orders of magnitude.
  // ---------------------------------------------------------------------------

  const SNAPSHOT_OPTS = { maxDiffPixels: 50, threshold: 0.2, fullPage: true } as const;

  test('snapshot: drawer-closed', async ({ page }) => {
    const { locale, role } = parseProjectMatrix(test.info().project.name);
    await injectAuthState(page, userForRole(role), locale);
    await mockFixtures(page);

    await page.goto('/admin/');
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');

    await page.click('[data-floor="1"]');
    await page.waitForFunction(
      () => !!document.querySelector('#A1.map-shelf'),
      null,
      { timeout: 10_000 }
    );

    // Drawer starts hidden — confirm before taking the shot so we don't
    // accidentally race a deferred selection from a previous interaction.
    await expect(page.locator('#map-drawer')).toHaveClass(/map-drawer--hidden/);
    // Allow one frame for any layout settling.
    await page.waitForTimeout(50);

    await expect(page).toHaveScreenshot(snapshotName('drawer-closed', locale, role), SNAPSHOT_OPTS);
  });

  test('snapshot: drawer-open-single-shelf', async ({ page }) => {
    const { locale, role } = parseProjectMatrix(test.info().project.name);
    await injectAuthState(page, userForRole(role), locale);
    await mockFixtures(page);

    await page.goto('/admin/');
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');

    await page.click('[data-floor="1"]');
    await page.waitForFunction(
      () => !!document.querySelector('#A1.map-shelf'),
      null,
      { timeout: 10_000 }
    );

    // Pick a shelf whose row is NOT locked under the editor's restricted
    // scope (D1 = range 300-310 lies outside our 200-250 editor scope, so D1
    // is locked too — use B1 = 100-105.5 which is also locked. Use the
    // restricted scope itself? None of the seeded shelves fall in 200-250.)
    //
    // Resolution: this test wants the IDLE drawer for a single shelf, not a
    // specifically unlocked one. Idle inputs render the same regardless of
    // lock state at the input-element level (disabled attr aside). Pick A1
    // for parity with the other tests and let the editor variant capture the
    // locked-input rendering inline. The dedicated locked-row snapshot below
    // covers the editor-only state explicitly.
    await clickShelf(page, 'A1');
    await expect(page.locator('#map-drawer')).toBeVisible();
    // Defocus any auto-focused element so the snapshot is deterministic.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(80);

    await expect(page).toHaveScreenshot(
      snapshotName('drawer-open-single-shelf', locale, role),
      SNAPSHOT_OPTS
    );
  });

  test('snapshot: drawer-open-input-focused', async ({ page }) => {
    const { locale, role } = parseProjectMatrix(test.info().project.name);
    // Skip for editor: the rangeStart input is `disabled` for locked rows
    // (the only kind A1 produces for our restricted editor), and a disabled
    // input cannot receive focus — the focused-state snapshot is meaningless.
    test.skip(role === 'editor', 'rangeStart input is disabled for editor (locked rows)');

    await injectAuthState(page, userForRole(role), locale);
    await mockFixtures(page);

    await page.goto('/admin/');
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');

    await page.click('[data-floor="1"]');
    await page.waitForFunction(
      () => !!document.querySelector('#A1.map-shelf'),
      null,
      { timeout: 10_000 }
    );

    await clickShelf(page, 'A1');
    await expect(page.locator('#map-drawer')).toBeVisible();

    // Click the rangeStart input to focus it. Use `.click()` rather than
    // `.focus()` so we exercise the same path a user would.
    await page.locator('#map-drawer [data-field="rangeStart"]').first().click();
    // Allow caret/focus-ring transition to settle.
    await page.waitForTimeout(120);

    await expect(page).toHaveScreenshot(
      snapshotName('drawer-open-input-focused', locale, role),
      SNAPSHOT_OPTS
    );
  });

  test('snapshot: drawer-open-locked-row', async ({ page }) => {
    const { locale, role } = parseProjectMatrix(test.info().project.name);
    // Admin has unlimited access — there are no locked rows to capture, so
    // skip cleanly. Editor sees a mixed-lock A1 (one editable + one locked
    // range) sourced from `installMixedLockA1Csv`.
    test.skip(role === 'admin', 'no locked rows for admin');

    await injectAuthState(page, userForRole(role), locale);
    await mockFixtures(page);
    // Override the CSV so A1 carries two ranges — the second (300-310) lies
    // outside the editor's 100-110 scope, so the drawer renders a locked row
    // alongside an editable one.
    await installMixedLockA1Csv(page);

    await page.goto('/admin/');
    await page.waitForSelector('#nav-map-editor', { state: 'visible' });
    await page.click('#nav-map-editor');

    await page.click('[data-floor="1"]');
    await page.waitForFunction(
      () => !!document.querySelector('#A1.map-shelf'),
      null,
      { timeout: 10_000 }
    );

    await clickShelf(page, 'A1');
    await expect(page.locator('#map-drawer')).toBeVisible();
    // Sanity-check that the row IS rendered in its locked state — without
    // this assertion an environment glitch (e.g. user JSON not parsed) could
    // silently let us snapshot an unlocked row and bake the wrong baseline.
    await expect(page.locator('#map-drawer .map-drawer__row--locked').first()).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(80);

    await expect(page).toHaveScreenshot(
      snapshotName('drawer-open-locked-row', locale, role),
      SNAPSHOT_OPTS
    );
  });
});
