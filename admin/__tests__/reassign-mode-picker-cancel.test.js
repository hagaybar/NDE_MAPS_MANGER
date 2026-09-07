/**
 * Regression tests for #125 — the Map Editor reassign "choose from list" picker
 * overlay is orphaned (and crashes) when reassign is cancelled while it is open.
 *
 * The picker is a full-screen fixed overlay appended to document.body. Before the
 * fix it was not tied to the reassign lifecycle: cancelling reassign (Esc or the
 * programmatic cancelReassign() used on floor switch) nulled `active` and removed
 * the banner but LEFT the overlay in the DOM — a full-screen modal lockout — and a
 * subsequent list-button click dereferenced the now-null `active`, throwing.
 *
 * These tests drive the real module against jsdom and assert user-observable
 * behaviour: after a cancel, the overlay is gone and a stale button click is inert.
 */

import { jest, describe, test, expect, afterEach } from '@jest/globals';
import {
  startReassign,
  cancelReassign,
  isReassignActive,
} from '../components/map-editor/reassign-mode.js';

function start(overrides = {}) {
  startReassign({
    rangeId: 'r1',
    rangeLabel: '100-150',
    oldShelfLabel: 'A1',
    shelfElements: new Map(),
    allShelves: [
      { label: 'Shelf B2', svgCode: 'B2', floor: '1' },
      { label: 'Shelf C3', svgCode: 'C3', floor: '2' },
    ],
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    intent: 'move',
    ...overrides,
  });
}

// Open the picker the way a librarian does: click the "choose from list" link.
function openPicker() {
  document.getElementById('map-reassign-list').click();
}

afterEach(() => {
  if (isReassignActive()) cancelReassign();
  document.body.innerHTML = '';
});

describe('#125 reassign picker overlay lifecycle', () => {
  test('Esc while the picker is open removes the picker overlay (no orphaned lockout)', () => {
    start();
    openPicker();
    expect(document.getElementById('map-picker-filter')).not.toBeNull(); // picker is open

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.getElementById('map-picker-filter')).toBeNull(); // overlay is gone
    expect(isReassignActive()).toBe(false);
  });

  test('cancelReassign() (e.g. on floor switch) while the picker is open removes the overlay', () => {
    start();
    openPicker();
    expect(document.getElementById('map-picker-filter')).not.toBeNull();

    cancelReassign();

    expect(document.getElementById('map-picker-filter')).toBeNull();
    expect(isReassignActive()).toBe(false);
  });

  test('a list-button click after reassign was cancelled does not crash', () => {
    start();
    openPicker();
    const btn = document.querySelector('#map-picker-list button');
    expect(btn).not.toBeNull();

    cancelReassign(); // overlay removed, `active` nulled

    // The universal-modal-dismiss reflex can leave a click in flight against a
    // stale button reference; it must be inert, not a TypeError.
    expect(() => btn.click()).not.toThrow();
  });
});
