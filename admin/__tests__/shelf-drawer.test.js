/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

describe('showSingleShelf — empty-state branch', () => {
  let mountDrawer;
  let showSingleShelf;
  let hideDrawer;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="drawer"></div>';

    // Minimal i18n mock — return the key path so tests can assert by key.
    await jest.unstable_mockModule('../i18n.js', () => ({
      default: {
        t: (key) => key,
        get locale() { return 'en'; },
      },
    }));

    // Minimal range-validation stub — empty-state has no rows to validate.
    await jest.unstable_mockModule('../components/map-editor/range-validation.js', () => ({
      validateRangeShape: () => ({ ok: true }),
    }));

    ({ mountDrawer, showSingleShelf, hideDrawer } = await import('../components/map-editor/shelf-drawer.js'));
    mountDrawer('drawer');
  });

  const baseProps = (overrides = {}) => ({
    shelfId: 'E1',
    shelfLabel: 'E1',
    rangesOnShelf: [],
    conflictsByRangeId: new Map(),
    conflictingShelves: [],
    permission: () => 'rw',
    collectionsList: [],
    onChange: jest.fn(),
    onAdd: jest.fn(),
    onMove: jest.fn(),
    onDelete: jest.fn(),
    onDiscard: jest.fn(),
    onSave: jest.fn(),
    onSelectShelf: jest.fn(),
    onClose: jest.fn(),
    hasPendingEdits: false,
    ...overrides,
  });

  test('renders .map-drawer__empty-state container when rangesOnShelf is empty', () => {
    showSingleShelf(baseProps());
    expect(document.querySelector('.map-drawer__empty-state')).not.toBeNull();
  });

  test('empty-state contains message, explanation, and CTA elements', () => {
    showSingleShelf(baseProps());
    const container = document.querySelector('.map-drawer__empty-state');
    expect(container.querySelector('.map-drawer__empty-state__message')).not.toBeNull();
    expect(container.querySelector('.map-drawer__empty-state__explanation')).not.toBeNull();
    expect(container.querySelector('.map-drawer__empty-state__cta')).not.toBeNull();
  });

  test('empty-state uses the i18n keys for message, explanation, and CTA', () => {
    showSingleShelf(baseProps());
    expect(document.querySelector('.map-drawer__empty-state__message').textContent)
      .toContain('mapEditor.shelf.empty.message');
    expect(document.querySelector('.map-drawer__empty-state__explanation').textContent)
      .toContain('mapEditor.shelf.empty.explanation');
    expect(document.querySelector('.map-drawer__empty-state__cta').textContent)
      .toContain('mapEditor.shelf.empty.cta');
  });

  test('clicking the empty-state CTA fires onAdd', () => {
    const onAdd = jest.fn();
    showSingleShelf(baseProps({ onAdd }));
    document.querySelector('.map-drawer__empty-state__cta').click();
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('empty-state container is NOT rendered when rangesOnShelf has at least one row', () => {
    showSingleShelf(baseProps({
      rangesOnShelf: [{
        id: 'r1',
        svgCode: 'E1',
        collectionName: 'GEN',
        rangeStart: 'A',
        rangeEnd: 'Z',
        shelfLabel: 'E1',
      }],
    }));
    expect(document.querySelector('.map-drawer__empty-state')).toBeNull();
  });

  describe('focus preservation across re-render (issue #86)', () => {
    const rowProps = (overrides = {}) => baseProps({
      rangesOnShelf: [{
        id: 'r1', svgCode: 'E1', collectionName: 'GEN',
        rangeStart: '100', rangeEnd: '200', shelfLabel: 'E1',
      }],
      collectionsList: ['GEN'],
      ...overrides,
    });

    test('focus + caret on a range input survive a re-render', () => {
      showSingleShelf(rowProps());
      const input = document.querySelector('.map-drawer__row [data-field="rangeStart"]');
      input.focus();
      input.value = '105';
      input.setSelectionRange(3, 3);
      expect(document.activeElement).toBe(input); // sanity

      // Simulate the app loop: onChange re-renders the drawer with the new value.
      showSingleShelf(rowProps({
        rangesOnShelf: [{
          id: 'r1', svgCode: 'E1', collectionName: 'GEN',
          rangeStart: '105', rangeEnd: '200', shelfLabel: 'E1',
        }],
        hasPendingEdits: true,
      }));

      const after = document.querySelector('.map-drawer__row [data-field="rangeStart"]');
      expect(after).not.toBe(input);             // it really is a new element
      expect(document.activeElement).toBe(after); // …but focus came back to it
      expect(after.selectionStart).toBe(3);       // and the caret is preserved
      expect(after.value).toBe('105');
    });

    test('does not steal focus when nothing in the drawer was focused', () => {
      showSingleShelf(rowProps());
      const outside = document.createElement('input');
      document.body.appendChild(outside);
      outside.focus();

      showSingleShelf(rowProps({ hasPendingEdits: true }));

      expect(document.activeElement).toBe(outside);
    });
  });

  describe('overlap warning wording distinguishes same-shelf vs cross-shelf (issue #87)', () => {
    // i18n mock returns the key verbatim, so the rendered title IS the key used.
    const conflictRow = (otherShelf) => baseProps({
      rangesOnShelf: [{
        id: 'r1', svgCode: 'E1', collectionName: 'GEN',
        rangeStart: '300', rangeEnd: '400', shelfLabel: 'E1',
      }],
      collectionsList: ['GEN'],
      conflictsByRangeId: new Map([['r1', [{ otherShelf, otherRangeLabel: '350-360' }]]]),
    });

    test('a same-shelf overlap uses the overlapSameShelf message', () => {
      showSingleShelf(conflictRow('E1')); // other range is on the SAME shelf
      const title = document.querySelector('[data-field="rangeStart"]').title;
      expect(title).toBe('mapEditor.warning.overlapSameShelf');
    });

    test('a cross-shelf overlap uses the generic overlap message', () => {
      showSingleShelf(conflictRow('E2')); // other range is on a DIFFERENT shelf
      const title = document.querySelector('[data-field="rangeStart"]').title;
      expect(title).toBe('mapEditor.warning.overlap');
    });
  });
});
