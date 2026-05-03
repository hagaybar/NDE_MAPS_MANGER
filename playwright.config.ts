import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Primo Maps Admin SPA E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e/tests',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: 'http://localhost:8080',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording on failure */
    video: 'retain-on-failure',
  },

  /* Global timeout for each test */
  timeout: 30000,

  /* Expect timeout */
  expect: {
    timeout: 5000
  },

  /*
   * Snapshot baselines live next to the spec under
   * `e2e/tests/__screenshots__/<spec>/<arg>` — no project/platform suffix is
   * appended because the snapshot tests bake the project matrix
   * (`{state}-{locale}-{role}`) into the filename themselves.
   */
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',

  /*
   * Configure projects: locale × role variants for Phase-3 snapshot suite.
   *
   * Role distinction is conveyed via the auth-mock injection in the test
   * itself (the test reads `test.info().project.name` and picks
   * `mockUsers.admin` or `mockUsers.editor`). Locale is read off the project
   * name and written into `localStorage.locale` via addInitScript — the
   * `use.locale` option here only affects `navigator.language`.
   *
   * The previous default `chromium` project was removed: snapshot tests bake
   * `{state}-{locale}-{role}.png` into filenames, so a generic chromium run
   * would collide with `en-admin` baselines.
   */
  projects: [
    {
      name: 'en-admin',
      use: { ...devices['Desktop Chrome'], locale: 'en' },
    },
    {
      name: 'he-admin',
      use: { ...devices['Desktop Chrome'], locale: 'he' },
    },
    {
      name: 'en-editor',
      use: { ...devices['Desktop Chrome'], locale: 'en' },
    },
    {
      name: 'he-editor',
      use: { ...devices['Desktop Chrome'], locale: 'he' },
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npx serve admin -p 8080',
  //   url: 'http://localhost:8080',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
