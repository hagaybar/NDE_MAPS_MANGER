/**
 * @jest-environment jsdom
 *
 * #161: the Edit Location dialog + svg-autocomplete leaked document listeners
 * and hung the prior promise on reopen-over-open.
 *  1. svg-autocomplete's `document` click listener was never removed on close
 *     (and re-added on every re-render) → it accumulated over a session.
 *  2. Reopening the dialog over an already-open one removed only the overlay,
 *     overwriting currentResolve/currentKeydownHandler without resolving the old
 *     promise → the first caller's `await` hung forever (and a keydown leaked).
 */

import { jest, describe, test, expect, afterEach } from '@jest/globals';
import { showEditLocationDialog, hideEditLocationDialog } from '../components/edit-location-dialog.js';

describe('Edit Location dialog: no listener leak / no hung promise (#161)', () => {
  afterEach(() => {
    hideEditLocationDialog(); // close anything still open
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('closing the dialog removes the autocomplete document click listener (no leak)', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    showEditLocationDialog({ row: { libraryName: 'L', collectionName: 'GEN', floor: '1' }, allRows: [] });
    const clickAdds = addSpy.mock.calls.filter((c) => c[0] === 'click').length;
    expect(clickAdds).toBeGreaterThanOrEqual(1); // autocomplete bound one on document

    hideEditLocationDialog();
    const clickRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'click').length;
    expect(clickRemoves).toBe(clickAdds); // before the fix: 0 removes → leak
  });

  test('reopening over an open dialog resolves the prior promise (no hang)', async () => {
    const first = showEditLocationDialog({ row: { libraryName: 'A', collectionName: 'GEN', floor: '1' }, allRows: [] });
    let settled = false;
    first.then(() => { settled = true; });

    // Reopen over the still-open dialog.
    showEditLocationDialog({ row: { libraryName: 'B', collectionName: 'GEN', floor: '2' }, allRows: [] });
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(true); // before the fix: the first promise hung forever
  });
});
