import { test, expect, mockApiResponses, mockUsers } from '../fixtures/auth.fixture';
import type { MockUser } from '../fixtures/auth.fixture';
import type { Page } from '@playwright/test';

/**
 * E2E coverage for the staged-SVG-replace flow (Plan B — Task 12).
 *
 * The staging endpoints live on the production API Gateway, so we stub the
 * `**\/staging\/*` routes with a stateful in-memory mock keyed by Playwright
 * worker (each `test()` gets its own mock state via beforeEach). The mock
 * mirrors the small state machine inside `lambda/shared/staging-meta.mjs`:
 *
 *   1. status starts unlocked → "No staging area" panel
 *   2. /staging/upload → locks staging, records file, clears lastValidated
 *   3. /staging/validate → records lastValidated (ok/errors per the file body)
 *   4. /staging/reconcile → records reconcileMap, marks lastValidated ok
 *   5. /staging/promote → unlocks (back to step 1)
 *   6. /staging/clear → unlocks (back to step 1)
 *
 * The test toggles `window.__USE_STAGING_FLOW__ = true` via addInitScript so
 * the SVG Manager renders the staging panel. The flag defaults to false in
 * `admin/components/svg-manager.js` until Task 16 flips it on globally.
 */

interface StagingValidated {
  ok: boolean;
  errors: Array<{ code: string; svgCode?: string }>;
  summary: {
    addedShelves: Array<{ floor: number; svgCode: string }>;
    removedRefs: Array<{ floor: number; svgCode: string; affectedRowCount: number }>;
  };
  at?: string;
}

interface StagingMeta {
  locked: boolean;
  owner: string | null;
  files: string[];
  lastValidated: StagingValidated | null;
}

interface StagingMockOptions {
  /** Username to record as the lock owner on upload. */
  owner: string;
  /** Pre-determined validation outcome to apply when /staging/validate is hit. */
  pendingValidation: StagingValidated;
  /**
   * Optional override applied after /staging/reconcile is hit (so a test can
   * model the wizard transitioning the panel from failed to ok).
   */
  postReconcileValidation?: StagingValidated;
}

/**
 * Install stateful mocks for every staging endpoint plus the standard auth/CSV/SVG
 * mocks. Call this BEFORE `loginAsAdmin()` to keep the request order aligned
 * with the existing svg-manager specs.
 */
async function mockStagingApi(page: Page, opts: StagingMockOptions): Promise<void> {
  // Mutable state shared across the route handlers below.
  const meta: StagingMeta = {
    locked: false,
    owner: null,
    files: [],
    lastValidated: null,
  };

  await page.route('**/staging/status', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, body: '' });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(meta),
    });
  });

  await page.route('**/staging/upload', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, body: '' });
    }
    const body = JSON.parse(route.request().postData() || '{}');
    const floor = body.floor;
    meta.locked = true;
    meta.owner = opts.owner;
    const file = `maps/floor_${floor}.svg`;
    if (!meta.files.includes(file)) meta.files.push(file);
    meta.lastValidated = null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, file }),
    });
  });

  await page.route('**/staging/validate', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, body: '' });
    }
    meta.lastValidated = { ...opts.pendingValidation, at: new Date().toISOString() };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(meta.lastValidated),
    });
  });

  await page.route('**/staging/reconcile', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, body: '' });
    }
    // After a reconcile pass, the SVG Manager re-invokes /staging/validate, so
    // we swap the pending validation here. If the test did not supply one we
    // default to "ok" (the typical happy outcome of a wizard run).
    opts.pendingValidation =
      opts.postReconcileValidation ?? { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/staging/promote', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, body: '' });
    }
    meta.locked = false;
    meta.owner = null;
    meta.files = [];
    meta.lastValidated = null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/staging/clear', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, body: '' });
    }
    meta.locked = false;
    meta.owner = null;
    meta.files = [];
    meta.lastValidated = null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

/** Enable the staging-flow feature flag before any page script runs. */
async function enableStagingFlowFlag(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __USE_STAGING_FLOW__: boolean }).__USE_STAGING_FLOW__ = true;
  });
}

/** Locate the Replace button on a specific floor's card. */
function replaceButtonFor(page: Page, filename: string) {
  return page.locator(`.svg-card[data-name="${filename}"] .btn-replace`);
}

test.describe('SoT — staged SVG replace', () => {
  test.beforeEach(async ({ page, loginAsAdmin }) => {
    // Mock prod-bucket reads + admin Lambdas (CSV/SVG list/etc). Staging
    // endpoints are mocked inside each test so the state machine starts fresh.
    await mockApiResponses(page);
    await enableStagingFlowFlag(page);
    await loginAsAdmin();
    // The local Playwright server roots the admin SPA at `/`, but production
    // serves it under `/admin/`. Try the admin path first and fall back to `/`
    // so the spec passes in both environments (mirrors `BasePage.goto()`).
    const resp = await page.goto('/admin/');
    if (!resp || resp.status() === 404) {
      await page.goto('/');
    }
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#nav-svg', { timeout: 10000 });
    await page.click('#nav-svg');
    await page.waitForSelector('.btn-replace', { timeout: 10000 });
  });

  test('strict-superset upload promotes successfully', async ({ page }) => {
    // Validation succeeds with one new shelf and no removed refs — the happy
    // "strict superset" case described in the Plan B spec.
    await mockStagingApi(page, {
      owner: 'test-admin',
      pendingValidation: {
        ok: true,
        errors: [],
        summary: {
          addedShelves: [{ floor: 1, svgCode: 'NEW_SHELF' }],
          removedRefs: [],
        },
      },
    });

    // The replace handler triggers a confirm() before uploading.
    page.on('dialog', d => d.accept().catch(() => {}));

    const fileChooserPromise = page.waitForEvent('filechooser');
    await replaceButtonFor(page, 'floor_1.svg').click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'floor_1.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg">' +
          '<rect id="EXISTING" data-map-object="shelf"/>' +
          '<rect id="NEW_SHELF" data-map-object="shelf"/>' +
        '</svg>'
      ),
    });

    // After upload + validate, the panel rerenders with the "Validation passed"
    // copy from staging-panel.js.
    const panel = page.locator('#staging-panel-host');
    await expect(panel).toContainText(/Validation passed/i, { timeout: 10000 });

    await panel.locator('[data-action="promote-staging"]').click();
    await expect(panel).toContainText(/No staging/i, { timeout: 10000 });
  });

  test('removed-ref upload triggers reconcile wizard and resolves green', async ({ page }) => {
    // Validation fails with a removed shelf reference. After the wizard
    // submits a rename map, /staging/reconcile flips the pending validation to
    // ok (via postReconcileValidation), so the next refresh shows green.
    await mockStagingApi(page, {
      owner: 'test-admin',
      pendingValidation: {
        ok: false,
        errors: [{ code: 'shelf-not-found', svgCode: 'OLD_SHELF' }],
        summary: {
          addedShelves: [{ floor: 1, svgCode: 'REPLACEMENT_SHELF' }],
          removedRefs: [{ floor: 1, svgCode: 'OLD_SHELF', affectedRowCount: 3 }],
        },
      },
      postReconcileValidation: {
        ok: true,
        errors: [],
        summary: {
          addedShelves: [{ floor: 1, svgCode: 'REPLACEMENT_SHELF' }],
          removedRefs: [],
        },
      },
    });

    page.on('dialog', d => d.accept().catch(() => {}));

    const fileChooserPromise = page.waitForEvent('filechooser');
    await replaceButtonFor(page, 'floor_1.svg').click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'floor_1.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg">' +
          '<rect id="REPLACEMENT_SHELF" data-map-object="shelf"/>' +
        '</svg>'
      ),
    });

    const panel = page.locator('#staging-panel-host');
    await expect(panel.locator('[data-action="open-reconcile-wizard"]')).toBeVisible({ timeout: 10000 });
    await panel.locator('[data-action="open-reconcile-wizard"]').click();

    // The wizard's open handler is async (fetch → render), so wait for the
    // first <select> to appear before counting rows.
    const selects = panel.locator('[data-reconcile-row] select');
    await expect(selects.first()).toBeVisible({ timeout: 10000 });
    // Pick the first non-empty option (rename) for every removed-ref row. The
    // wizard's submit button is disabled until every <select> has a value.
    const count = await selects.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await selects.nth(i).selectOption({ index: 1 });
    }

    await panel.locator('[data-action="submit-reconcile"]').click();
    await expect(panel).toContainText(/Validation passed/i, { timeout: 10000 });

    await panel.locator('[data-action="promote-staging"]').click();
    await expect(panel).toContainText(/No staging/i, { timeout: 10000 });
  });

  test('discard staging clears the staging area', async ({ page }) => {
    await mockStagingApi(page, {
      owner: 'test-admin',
      pendingValidation: {
        ok: true,
        errors: [],
        summary: { addedShelves: [], removedRefs: [] },
      },
    });

    // The replace flow fires a confirm() (replace) and discard fires another
    // confirm() (discard). Auto-accept both via the persistent listener.
    page.on('dialog', d => d.accept().catch(() => {}));

    const fileChooserPromise = page.waitForEvent('filechooser');
    await replaceButtonFor(page, 'floor_1.svg').click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'floor_1.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg">' +
          '<rect id="EXISTING" data-map-object="shelf"/>' +
        '</svg>'
      ),
    });

    const panel = page.locator('#staging-panel-host');
    await expect(panel.locator('[data-action="discard-staging"]')).toBeVisible({ timeout: 10000 });
    await panel.locator('[data-action="discard-staging"]').click();
    await expect(panel).toContainText(/No staging/i, { timeout: 10000 });
  });
});

/**
 * Inject the auth session for an arbitrary mock user into a fresh page (mirrors
 * the private helper inside `auth.fixture.ts`). The fixture only exposes
 * `loginAsAdmin/Editor/Viewer` against the test's shared `page`; the
 * lock-conflict test below builds two separate browser contexts and needs
 * distinct usernames per context so the staging panel renders the "in use by
 * <other operator>" banner (hidden when `status.owner === currentUser`).
 */
async function injectAuthAs(page: Page, user: MockUser): Promise<void> {
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
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  const idToken = `${b64url(header)}.${b64url(payload)}.fake-signature-for-testing`;
  const storage: Record<string, string> = {
    primo_maps_access_token: idToken,
    primo_maps_id_token: idToken,
    primo_maps_refresh_token: 'mock-refresh-token',
    primo_maps_token_expiry: (Date.now() + 3600_000).toString(),
    primo_maps_user: JSON.stringify({
      username: user.username,
      email: user.email,
      role: user.role,
    }),
  };
  await page.addInitScript((data) => {
    Object.entries(data.storage).forEach(([key, value]) => {
      window.sessionStorage.setItem(key, value as string);
    });
    (window as unknown as { __E2E_TEST_MODE__: boolean }).__E2E_TEST_MODE__ = true;
    (window as unknown as { __E2E_USER__: typeof data.user }).__E2E_USER__ = data.user;
  }, { storage, user });
}

/** Shape of the in-memory staging meta record shared across operators A & B. */
interface SharedLockState {
  locked: boolean;
  owner: string | null;
  files: string[];
}

/**
 * Install staging mocks on a page using a *shared* lock-state object. Operator
 * A's mocks mutate the state (upload locks, discard/promote/clear unlock).
 * Operator B's mocks read the same object, so any `/staging/status` request
 * from B sees A's lock — that's what triggers the "in use by" banner.
 *
 * In addition (per the Task 13 spec — HTTP 423 from `uploadStagingSvg`), if
 * staging is already locked by someone other than `actingUser`, the upload
 * route returns 423 with a JSON error body. This branch isn't exercised by
 * the panel-banner assertion below, but it pins down the contract the SVG
 * Manager will hit if Operator B does try to upload anyway, and guarantees
 * the test never falls through to the real API Gateway.
 */
function installSharedStagingMocks(
  page: Page,
  state: SharedLockState,
  actingUser: string,
): void {
  const optionsOk = (route: import('@playwright/test').Route) =>
    route.fulfill({ status: 200, body: '' });

  page.route('**/staging/status', async (route) => {
    if (route.request().method() === 'OPTIONS') return optionsOk(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        locked: state.locked,
        owner: state.owner,
        files: state.files,
        lastValidated: null,
      }),
    });
  });

  page.route('**/staging/upload', async (route) => {
    if (route.request().method() === 'OPTIONS') return optionsOk(route);
    if (state.locked && state.owner !== actingUser) {
      // Lock-conflict path: real uploadStagingSvg returns HTTP 423.
      await route.fulfill({
        status: 423,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'staging-locked', owner: state.owner }),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() || '{}');
    const file = `maps/floor_${body.floor}.svg`;
    state.locked = true;
    state.owner = actingUser;
    if (!state.files.includes(file)) state.files.push(file);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, file }),
    });
  });

  // The other endpoints aren't exercised by the lock-conflict flow, but we
  // stub them so an unexpected click never escapes to AWS.
  for (const path of ['validate', 'reconcile', 'promote'] as const) {
    page.route(`**/staging/${path}`, async (route) => {
      if (route.request().method() === 'OPTIONS') return optionsOk(route);
      if (path === 'promote') {
        state.locked = false;
        state.owner = null;
        state.files = [];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
  }

  page.route('**/staging/clear', async (route) => {
    if (route.request().method() === 'OPTIONS') return optionsOk(route);
    state.locked = false;
    state.owner = null;
    state.files = [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

/** Bring a freshly-authenticated page into the SVG Manager view. */
async function openSvgManager(page: Page): Promise<void> {
  const resp = await page.goto('/admin/');
  if (!resp || resp.status() === 404) {
    await page.goto('/');
  }
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#nav-svg', { timeout: 10000 });
  await page.click('#nav-svg');
  await page.waitForSelector('.btn-replace', { timeout: 10000 });
}

test.describe('SoT — staging lock conflict', () => {
  test('second operator sees "in use" banner when lock is held', async ({ browser }) => {
    // Shared lock state: Operator A's upload flips `locked = true`, and
    // Operator B's `/staging/status` reads the same object → banner appears.
    const sharedState: SharedLockState = { locked: false, owner: null, files: [] };
    const operatorA: MockUser = { ...mockUsers.admin, username: 'admin-a', email: 'a@test.com' };
    const operatorB: MockUser = { ...mockUsers.admin, username: 'admin-b', email: 'b@test.com' };

    // ── Operator A's session ────────────────────────────────────────────────
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.addInitScript(() => {
      (window as unknown as { __USE_STAGING_FLOW__: boolean }).__USE_STAGING_FLOW__ = true;
    });
    await injectAuthAs(pageA, operatorA);
    await mockApiResponses(pageA);
    installSharedStagingMocks(pageA, sharedState, operatorA.username);
    pageA.on('dialog', d => d.accept().catch(() => {}));
    await openSvgManager(pageA);

    // A uploads, taking the lock. We use the same Replace helper Task 12 reuses.
    const fileChooserPromise = pageA.waitForEvent('filechooser');
    await replaceButtonFor(pageA, 'floor_1.svg').click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'floor_1.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect id="EXISTING" data-map-object="shelf"/></svg>'
      ),
    });
    // The staging panel rerenders with the owner's discard button once the
    // upload completes and the next /staging/status returns locked=true.
    await pageA.waitForSelector('#staging-panel-host [data-action="discard-staging"]', { timeout: 10000 });
    expect(sharedState.locked).toBe(true);
    expect(sharedState.owner).toBe(operatorA.username);

    // ── Operator B's session ────────────────────────────────────────────────
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.addInitScript(() => {
      (window as unknown as { __USE_STAGING_FLOW__: boolean }).__USE_STAGING_FLOW__ = true;
    });
    await injectAuthAs(pageB, operatorB);
    await mockApiResponses(pageB);
    installSharedStagingMocks(pageB, sharedState, operatorB.username);
    await openSvgManager(pageB);

    // The panel must show A as the lock owner with the "in use by" copy from
    // `staging-panel.js`.
    const panelB = pageB.locator('#staging-panel-host');
    await expect(panelB).toContainText(/in use by/i, { timeout: 10000 });
    await expect(panelB).toContainText(operatorA.username);
    // And no owner-only actions render for B.
    await expect(panelB.locator('[data-action="discard-staging"]')).toHaveCount(0);
    await expect(panelB.locator('[data-action="promote-staging"]')).toHaveCount(0);

    // If Operator B were to retry the upload anyway, the mock returns 423.
    // (We don't drive that through the UI here — the SVG Manager hides the
    // Replace button behind the staging panel for non-owners — but the
    // assertion below pins the contract directly and proves nothing escapes
    // to AWS even if the UI evolved.)
    const conflictResp = await pageB.evaluate(async () => {
      const r = await fetch(
        'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod/staging/upload',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ floor: 1, contentBase64: '' }),
        }
      );
      return { status: r.status, body: await r.json() };
    });
    expect(conflictResp.status).toBe(423);
    expect(conflictResp.body).toMatchObject({ error: 'staging-locked', owner: operatorA.username });

    // ── Cleanup: A discards so the shared lock state ends clean. ────────────
    await pageA.locator('#staging-panel-host [data-action="discard-staging"]').click();
    await expect(pageA.locator('#staging-panel-host')).toContainText(/No staging/i, { timeout: 10000 });

    await contextA.close();
    await contextB.close();
  });
});
