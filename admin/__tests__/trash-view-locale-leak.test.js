/**
 * @jest-environment jsdom
 *
 * Listener-leak regression (same class as #133): initTrashView added a fresh
 * anonymous `localeChanged` document listener on every call (alongside its
 * `trashUpdated` listener), so re-opening the trash view accumulated handlers.
 * Bind the localeChanged listener exactly once.
 *
 * One test per file on purpose: the leak attaches document listeners that
 * persist across tests in a file.
 */
import { jest } from '@jest/globals';

let initTrashView;

beforeEach(async () => {
  jest.resetModules();
  ({ initTrashView } = await import('../components/trash-view.js'));
});

test('binds the localeChanged listener exactly once across repeated inits (leak class #133)', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const addSpy = jest.spyOn(document, 'addEventListener');

  initTrashView(container, {});
  initTrashView(container, {});
  initTrashView(container, {});

  const localeBinds = addSpy.mock.calls.filter((c) => c[0] === 'localeChanged').length;
  expect(localeBinds).toBe(1); // before the fix: 3 (one per init)
});
