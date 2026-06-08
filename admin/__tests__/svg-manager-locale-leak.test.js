/**
 * @jest-environment jsdom
 *
 * Listener-leak regression (same class as #133): initSVGManager registered a
 * fresh anonymous `localeChanged` document listener on every Map-Files visit.
 * Bind exactly once.
 *
 * One test per file on purpose: the leak attaches document listeners that
 * persist across tests in a file.
 */
import { jest } from '@jest/globals';

let initSVGManager;

beforeEach(async () => {
  jest.resetModules();
  document.body.innerHTML = '<div id="svg-manager"></div><div id="toast-container"></div>';

  global.fetch = jest.fn().mockImplementation(async (url, opts = {}) => {
    if (typeof url === 'string' && url.includes('/api/svg') && (!opts.method || opts.method === 'GET')) {
      return { ok: true, json: () => Promise.resolve({ success: true, files: [] }) };
    }
    return { ok: true, json: () => Promise.resolve({ success: true }) };
  });

  ({ initSVGManager } = await import('../components/svg-manager.js'));
});

async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); }

test('binds the localeChanged listener exactly once across repeated Map-Files visits (leak class #133)', async () => {
  const addSpy = jest.spyOn(document, 'addEventListener');

  initSVGManager();
  await flush();
  initSVGManager();
  await flush();
  initSVGManager();
  await flush();

  const localeBinds = addSpy.mock.calls.filter((c) => c[0] === 'localeChanged').length;
  expect(localeBinds).toBe(1); // before the fix: 3 (one per visit)
});
