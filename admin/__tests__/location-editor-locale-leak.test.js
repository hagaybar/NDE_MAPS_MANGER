/**
 * @jest-environment jsdom
 *
 * Listener-leak regression (same class as #133): initLocationEditor registered
 * a fresh anonymous `localeChanged` document listener on every Location-tab
 * visit. Bind exactly once.
 *
 * One test per file on purpose: the leak attaches document listeners that
 * persist across tests in a file.
 */
import { jest } from '@jest/globals';

let initLocationEditor;

beforeEach(async () => {
  jest.resetModules();
  document.body.innerHTML = `
    <div id="location-editor"></div>
    <div id="search-box-container"></div>
  `;

  // Location editor loads the CSV; return a tiny header-only CSV.
  global.fetch = jest.fn().mockImplementation((url) => {
    const u = String(url);
    if (u.endsWith('.csv')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('floor,svgCode\n'),
        json: () => Promise.resolve({}),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<svg></svg>'),
      json: () => Promise.resolve({}),
    });
  });

  ({ initLocationEditor } = await import('../components/location-editor.js'));
});

async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); }

test('binds the localeChanged listener exactly once across repeated Location-tab visits (leak class #133)', async () => {
  const addSpy = jest.spyOn(document, 'addEventListener');

  initLocationEditor();
  await flush();
  initLocationEditor();
  await flush();
  initLocationEditor();
  await flush();

  const localeBinds = addSpy.mock.calls.filter((c) => c[0] === 'localeChanged').length;
  expect(localeBinds).toBe(1); // before the fix: 3 (one per visit)
});
