/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import {
  ORPHAN_BAD_SVGCODE_F1, ORPHAN_BAD_SVGCODE_F2,
  ORPHAN_MISSING_SVGCODE_F1,
} from './fixtures/orphan-fixtures.js';

describe('orphan-panel', () => {
  let mount, open, close, setActiveCard, markRepaired;
  let host;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="orphan-host"></div>';
    host = document.getElementById('orphan-host');
    ({ mount, open, close, setActiveCard, markRepaired } = await import('../components/map-editor/orphan-panel.js'));
    mount('orphan-host');
  });

  test('mount + open([]) shows empty state', () => {
    open([], { floor: '1', locale: 'en', readOnly: false });
    const panel = host.querySelector('.map-orphan-panel');
    expect(panel).not.toBeNull();
    expect(panel.classList.contains('map-orphan-panel--open')).toBe(true);
    expect(host.querySelector('.map-orphan-panel__empty')).not.toBeNull();
  });

  test('open(orphans) renders one card per orphan in given order', () => {
    const orphans = [ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1];
    open(orphans, { floor: '1', locale: 'en', readOnly: false });
    const cards = host.querySelectorAll('.map-orphan-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].dataset.rowId).toBe('row-101');
    expect(cards[1].dataset.rowId).toBe('row-103');
  });

  test('close() hides the panel', () => {
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    close();
    const panel = host.querySelector('.map-orphan-panel');
    expect(panel.classList.contains('map-orphan-panel--open')).toBe(false);
  });

  test('setActiveCard highlights only that card', () => {
    open([ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    setActiveCard('row-103');
    const cards = host.querySelectorAll('.map-orphan-card');
    expect(cards[0].classList.contains('map-orphan-card--active')).toBe(false);
    expect(cards[1].classList.contains('map-orphan-card--active')).toBe(true);
  });

  test('setActiveCard(null) clears highlight on all cards', () => {
    open([ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    setActiveCard('row-101');
    setActiveCard(null);
    expect(host.querySelectorAll('.map-orphan-card--active')).toHaveLength(0);
  });

  test('markRepaired removes the card from the panel', () => {
    open([ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    markRepaired('row-101');
    const cards = host.querySelectorAll('.map-orphan-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.rowId).toBe('row-103');
  });

  test('marking the last card shows the all-repaired announcement', () => {
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    markRepaired('row-101');
    const announce = host.querySelector('[aria-live="polite"]');
    expect(announce).not.toBeNull();
    expect(announce.textContent.length).toBeGreaterThan(0);
  });

  test('re-open(newList) swaps content cleanly', () => {
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    open([ORPHAN_BAD_SVGCODE_F2], { floor: '2', locale: 'en', readOnly: false });
    const cards = host.querySelectorAll('.map-orphan-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.rowId).toBe('row-102');
  });

  test('Esc key closes the panel when no active card', () => {
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const panel = host.querySelector('.map-orphan-panel');
    expect(panel.classList.contains('map-orphan-panel--open')).toBe(false);
  });

  test('panel exposes onSetShelf and onEditElsewhere event subscribers', () => {
    const setShelfSpy = jest.fn();
    const editElsewhereSpy = jest.fn();
    open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false, onSetShelf: setShelfSpy, onEditElsewhere: editElsewhereSpy });
    host.querySelector('[data-action="set-shelf"]').click();
    expect(setShelfSpy).toHaveBeenCalledWith('row-101');
    host.querySelector('[data-action="edit-elsewhere"]').click();
    expect(editElsewhereSpy).toHaveBeenCalledWith('row-101');
  });
});
