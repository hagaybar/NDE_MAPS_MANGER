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

  test('localeChanged event re-renders the shell header in the new locale and preserves open state', async () => {
    // orphan-panel imports the real admin/i18n.js (the moduleNameMapper only
    // catches one-level imports). Seed its translations + locale directly.
    jest.resetModules();
    document.body.innerHTML = '<div id="orphan-host"></div>';
    // Use the exact URL orphan-panel imports — Jest treats different query
    // strings as separate module instances, so we must match its `?v=5` to
    // mutate the same singleton.
    const i18n = (await import('../i18n.js?v=5')).default;
    i18n.translations = {
      en: { mapEditor: { orphan: { panel: { title: 'TITLE_EN', empty: '0 on {n}', allRepaired: 'done' } } } },
      he: { mapEditor: { orphan: { panel: { title: 'TITLE_HE', empty: '0 ב{n}', allRepaired: 'הסתיים' } } } },
    };
    i18n.locale = 'en';

    const fresh = await import('../components/map-editor/orphan-panel.js');
    fresh.mount('orphan-host');
    fresh.open([ORPHAN_BAD_SVGCODE_F1], { floor: '1', locale: 'en', readOnly: false });

    const panel = document.querySelector('.map-orphan-panel');
    expect(panel.querySelector('.map-orphan-panel__title').textContent).toBe('TITLE_EN');
    expect(panel.classList.contains('map-orphan-panel--open')).toBe(true);

    i18n.locale = 'he';
    document.dispatchEvent(new CustomEvent('localeChanged'));

    expect(panel.querySelector('.map-orphan-panel__title').textContent).toBe('TITLE_HE');
    expect(panel.classList.contains('map-orphan-panel--open')).toBe(true);
    // The card list survives the re-render.
    expect(panel.querySelectorAll('.map-orphan-card')).toHaveLength(1);
  });
});
