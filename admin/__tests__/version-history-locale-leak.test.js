/**
 * @jest-environment jsdom
 *
 * #133: initVersionHistory registered a fresh anonymous `localeChanged` document
 * listener on every call (and the listener re-called initVersionHistory, adding
 * another), so after N tab-visits one language toggle ran N handlers → N
 * duplicate /api/versions fetches and an unbounded listener leak.
 *
 * One test per file on purpose: jsdom `document` persists across tests in a file
 * and the leak attaches document listeners, so a second test here would inherit
 * the first's listeners.
 */
import { jest } from '@jest/globals';

let initVersionHistory;

beforeEach(async () => {
  document.body.innerHTML = '<div id="version-history"></div>';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ versions: [] }),
  });
  jest.resetModules();
  ({ initVersionHistory } = await import('../components/version-history.js'));
});

async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); }

test('a single localeChanged toggle re-inits exactly once, no matter how many times the tab was opened (#133)', async () => {
  // Three "visits" to the Versions tab in one unreloaded session.
  await initVersionHistory({ fileType: 'csv' });
  await initVersionHistory({ fileType: 'csv' });
  await initVersionHistory({ fileType: 'csv' });

  global.fetch.mockClear();
  document.dispatchEvent(new Event('localeChanged'));
  await flush();

  const versionFetches = global.fetch.mock.calls.filter((c) =>
    String(c[0]).includes('/api/versions')).length;
  expect(versionFetches).toBe(1); // before the fix: one per accumulated listener (3+)
});
