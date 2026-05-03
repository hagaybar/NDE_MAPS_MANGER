/**
 * Console-clean Playwright fixture (Phase 1 quality gate).
 *
 * Extends the base Playwright `test` with a `consoleMessages` fixture that
 * collects every console message the page emits during the test, then
 * automatically asserts there were no `console.error` or `console.warn`
 * entries when the test ends.
 *
 * Usage:
 *
 *   import { test, expect } from '../fixtures/console';
 *
 *   test('something', async ({ page, consoleMessages }) => {
 *     await page.goto('/admin/');
 *     // ... interact ...
 *     // afterEach() will fail the test if console.error / console.warn fired.
 *     // You can also call consoleMessages.assertClean() manually mid-test.
 *   });
 *
 * Notes:
 *   - We deliberately ignore expected noise from third-party AWS SDKs that the
 *     app already filters (e.g. Cognito refresh failures in test mode). If the
 *     allow-list grows we'll move it into a config object on the fixture.
 *   - Errors raised from page-level uncaught exceptions are also captured.
 */

import { test as base, expect, ConsoleMessage } from '@playwright/test';

/** Console message types we treat as failure conditions. */
const FAIL_TYPES = new Set(['error', 'warning']);

/**
 * Console-noise allow-list: regex matched against `msg.text()`. Any message
 * whose text matches one of these patterns is dropped before assertClean()
 * inspects the buffer. Keep this list TIGHT — the whole point of the gate is
 * to surface unexpected noise.
 */
const ALLOW_LIST: RegExp[] = [
  // E2E tests run with mocked auth; the auth-service emits one info-level
  // warning when it can't reach the real Cognito refresh endpoint. Harmless.
  /Failed to refresh token/i,
  // Browsers occasionally warn about source-map fetch failures for vendored
  // assets — also harmless and unrelated to the app's behaviour.
  /Source map error/i,
  // The admin SPA loads Tailwind via the CDN <script> in dev. Tailwind emits
  // a single warning telling production users to compile CSS instead. Not a
  // regression from any feature; just the build setup.
  /cdn\.tailwindcss\.com should not be used in production/i
];

export interface ConsoleBuffer {
  /** Raw messages captured (every level). */
  all: ConsoleMessage[];
  /** Messages whose type is in FAIL_TYPES, after the allow-list is applied. */
  failures: ConsoleMessage[];
  /**
   * Throw (via `expect`) if any failure-level messages were captured. Called
   * automatically in afterEach; expose it so tests can assert mid-flight.
   */
  assertClean: () => void;
}

interface ConsoleFixtures {
  consoleMessages: ConsoleBuffer;
}

export const test = base.extend<ConsoleFixtures>({
  consoleMessages: async ({ page }, use, testInfo) => {
    const all: ConsoleMessage[] = [];
    const failures: ConsoleMessage[] = [];

    const onConsole = (msg: ConsoleMessage) => {
      all.push(msg);
      if (!FAIL_TYPES.has(msg.type())) return;
      const text = msg.text();
      if (ALLOW_LIST.some((re) => re.test(text))) return;
      failures.push(msg);
    };

    page.on('console', onConsole);

    // pageerror = uncaught exception in the page. Surface as a failure too.
    const onPageError = (err: Error) => {
      // Synthesize a console-shaped record so assertClean's diagnostic format
      // stays uniform; we only stash the text.
      failures.push({
        type: () => 'error',
        text: () => `[pageerror] ${err.message}`,
        location: () => ({ url: '', lineNumber: 0, columnNumber: 0 })
      } as unknown as ConsoleMessage);
    };
    page.on('pageerror', onPageError);

    const buffer: ConsoleBuffer = {
      all,
      failures,
      assertClean: () => {
        if (failures.length === 0) return;
        const lines = failures.map((m) => `  [${m.type()}] ${m.text()}`).join('\n');
        expect(
          failures,
          `Expected zero console.error / console.warn messages but got ${failures.length}:\n${lines}`
        ).toEqual([]);
      }
    };

    await use(buffer);

    // Detach listeners before the auto-assert so a failing assertion doesn't
    // race with later console events from teardown.
    page.off('console', onConsole);
    page.off('pageerror', onPageError);

    // Only auto-assert if the test itself didn't already fail — otherwise the
    // real failure reason is more useful than a downstream console noise log.
    if (testInfo.status === testInfo.expectedStatus) {
      buffer.assertClean();
    }
  }
});

export { expect } from '@playwright/test';
