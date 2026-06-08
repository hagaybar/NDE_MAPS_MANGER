/**
 * @jest-environment jsdom
 *
 * Listener-leak regression (same class as #133): initSearchBox registered a
 * fresh anonymous `localeChanged` document listener on every init (it is
 * re-init'd alongside the location editor). Bind exactly once.
 *
 * One test per file on purpose: the leak attaches document listeners that
 * persist across tests in a file.
 */
import { jest } from '@jest/globals';

let initSearchBox;

beforeEach(async () => {
  jest.resetModules();
  document.body.innerHTML = '<div id="search-box-container"></div>';

  ({ initSearchBox } = await import('../components/search-box.js'));
});

test('binds the localeChanged listener exactly once across repeated inits (leak class #133)', () => {
  const addSpy = jest.spyOn(document, 'addEventListener');

  initSearchBox();
  initSearchBox();
  initSearchBox();

  const localeBinds = addSpy.mock.calls.filter((c) => c[0] === 'localeChanged').length;
  expect(localeBinds).toBe(1); // before the fix: 3 (one per init)
});
