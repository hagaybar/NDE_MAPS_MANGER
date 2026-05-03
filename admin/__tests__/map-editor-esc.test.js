/**
 * Unit tests for the Map Editor's Esc-key handler.
 *
 * The handler is extracted to `components/map-editor/esc-handler.js` so the
 * pending-edits-confirm branch can be exercised without booting the whole
 * `initMapEditor` pipeline (which depends on auth, CSV fetch, SVG load, etc.).
 *
 * We mock the dependencies the handler reads (shelfState, applySelection,
 * refreshConflicts, isReassignActive, i18n) and assert the revert/clear path
 * runs only when `confirmFn` returns true.
 */

import { jest, describe, test, expect } from '@jest/globals';
import { handleEscape } from '../components/map-editor/esc-handler.js';

function makeI18n() {
  return { t: (key) => key };
}

function makeShelfState({ pendingSize = 0 } = {}) {
  const state = {
    _pending: new Map(),
    _selection: { kind: 'single', shelfIds: ['A1'] },
    revert: jest.fn(() => state._pending.clear()),
    clearSelection: jest.fn(() => { state._selection = { kind: 'none', shelfIds: [] }; }),
    pendingEdits: jest.fn(() => state._pending),
    selection: jest.fn(() => state._selection),
  };
  for (let i = 0; i < pendingSize; i++) state._pending.set(`r${i}`, { type: 'modify', patch: {} });
  return state;
}

describe('handleEscape', () => {
  test('non-Escape keys are ignored', () => {
    const shelfState = makeShelfState({ pendingSize: 1 });
    const applySelection = jest.fn();
    const refreshConflicts = jest.fn();
    const confirmFn = jest.fn(() => true);

    handleEscape({
      event: { key: 'Enter' },
      shelfState,
      applySelection,
      shelfElements: new Map(),
      refreshConflicts,
      isReassignActive: () => false,
      i18n: makeI18n(),
      confirmFn,
    });

    expect(confirmFn).not.toHaveBeenCalled();
    expect(shelfState.revert).not.toHaveBeenCalled();
    expect(shelfState.clearSelection).not.toHaveBeenCalled();
    expect(applySelection).not.toHaveBeenCalled();
  });

  test('reassign-active Esc is a no-op (reassign-mode handles its own Esc)', () => {
    const shelfState = makeShelfState({ pendingSize: 1 });
    const applySelection = jest.fn();
    const refreshConflicts = jest.fn();
    const confirmFn = jest.fn(() => true);

    handleEscape({
      event: { key: 'Escape' },
      shelfState,
      applySelection,
      shelfElements: new Map(),
      refreshConflicts,
      isReassignActive: () => true,
      i18n: makeI18n(),
      confirmFn,
    });

    expect(confirmFn).not.toHaveBeenCalled();
    expect(shelfState.revert).not.toHaveBeenCalled();
    expect(shelfState.clearSelection).not.toHaveBeenCalled();
  });

  test('Esc with no pending edits closes silently (no confirm prompt)', () => {
    const shelfState = makeShelfState({ pendingSize: 0 });
    const applySelection = jest.fn();
    const refreshConflicts = jest.fn();
    const confirmFn = jest.fn(() => true);

    handleEscape({
      event: { key: 'Escape' },
      shelfState,
      applySelection,
      shelfElements: new Map(),
      refreshConflicts,
      isReassignActive: () => false,
      i18n: makeI18n(),
      confirmFn,
    });

    expect(confirmFn).not.toHaveBeenCalled();
    expect(shelfState.revert).not.toHaveBeenCalled();
    expect(refreshConflicts).not.toHaveBeenCalled();
    expect(shelfState.clearSelection).toHaveBeenCalledTimes(1);
    expect(applySelection).toHaveBeenCalledTimes(1);
    expect(applySelection).toHaveBeenCalledWith(expect.any(Map), []);
  });

  test('Esc with pending edits + confirm true reverts and clears', () => {
    const shelfState = makeShelfState({ pendingSize: 2 });
    const applySelection = jest.fn();
    const refreshConflicts = jest.fn();
    const confirmFn = jest.fn(() => true);

    handleEscape({
      event: { key: 'Escape' },
      shelfState,
      applySelection,
      shelfElements: new Map(),
      refreshConflicts,
      isReassignActive: () => false,
      i18n: makeI18n(),
      confirmFn,
    });

    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(shelfState.revert).toHaveBeenCalledTimes(1);
    expect(refreshConflicts).toHaveBeenCalledTimes(1);
    expect(shelfState.clearSelection).toHaveBeenCalledTimes(1);
    expect(applySelection).toHaveBeenCalledTimes(1);
  });

  test('Esc with pending edits + confirm false leaves state intact', () => {
    const shelfState = makeShelfState({ pendingSize: 2 });
    const applySelection = jest.fn();
    const refreshConflicts = jest.fn();
    const confirmFn = jest.fn(() => false);

    handleEscape({
      event: { key: 'Escape' },
      shelfState,
      applySelection,
      shelfElements: new Map(),
      refreshConflicts,
      isReassignActive: () => false,
      i18n: makeI18n(),
      confirmFn,
    });

    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(shelfState.revert).not.toHaveBeenCalled();
    expect(refreshConflicts).not.toHaveBeenCalled();
    expect(shelfState.clearSelection).not.toHaveBeenCalled();
    expect(applySelection).not.toHaveBeenCalled();
  });

  test('confirm true once and false once: only the true call performs the revert/clear path', () => {
    const shelfState = makeShelfState({ pendingSize: 2 });
    const applySelection = jest.fn();
    const refreshConflicts = jest.fn();
    const confirmFn = jest.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);

    // First Esc: confirm returns true → revert + clear runs.
    handleEscape({
      event: { key: 'Escape' },
      shelfState,
      applySelection,
      shelfElements: new Map(),
      refreshConflicts,
      isReassignActive: () => false,
      i18n: makeI18n(),
      confirmFn,
    });

    expect(shelfState.revert).toHaveBeenCalledTimes(1);
    expect(shelfState.clearSelection).toHaveBeenCalledTimes(1);

    // Re-add pending edits to set up the second-call scenario.
    shelfState._pending.set('r0', { type: 'modify', patch: {} });
    shelfState._pending.set('r1', { type: 'modify', patch: {} });

    // Second Esc: confirm returns false → no further revert/clear.
    handleEscape({
      event: { key: 'Escape' },
      shelfState,
      applySelection,
      shelfElements: new Map(),
      refreshConflicts,
      isReassignActive: () => false,
      i18n: makeI18n(),
      confirmFn,
    });

    expect(confirmFn).toHaveBeenCalledTimes(2);
    expect(shelfState.revert).toHaveBeenCalledTimes(1);
    expect(shelfState.clearSelection).toHaveBeenCalledTimes(1);
  });
});
