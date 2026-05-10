/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { ORPHAN_BAD_SVGCODE_F1, ORPHAN_MISSING_SVGCODE_F1 } from './fixtures/orphan-fixtures.js';

describe('renderOrphanCard', () => {
  let renderOrphanCard;

  beforeEach(async () => {
    jest.resetModules();
    ({ renderOrphanCard } = await import('../components/map-editor/orphan-card.js'));
  });

  test('renders collection name and shelf label', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    expect(card.textContent).toContain('KA');
    expect(card.textContent).toContain('61 Z');
  });

  test('renders the bad svgCode highlighted', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    const badCode = card.querySelector('.map-orphan-card__bad-svgcode');
    expect(badCode).not.toBeNull();
    expect(badCode.textContent).toContain('ka1_61_z');
  });

  test('renders [empty] for missing svgCode', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_MISSING_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    const badCode = card.querySelector('.map-orphan-card__bad-svgcode');
    expect(badCode.textContent).toContain('[empty]');
  });

  test('isActive=true adds active class', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: true,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    expect(card.classList.contains('map-orphan-card--active')).toBe(true);
  });

  test('isActive=false does not add active class', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    expect(card.classList.contains('map-orphan-card--active')).toBe(false);
  });

  test('clicking primary button fires onSetShelf with rowId', () => {
    const onSetShelf = jest.fn();
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf,
      onEditElsewhere: jest.fn(),
    });
    card.querySelector('[data-action="set-shelf"]').click();
    expect(onSetShelf).toHaveBeenCalledWith('row-101');
  });

  test('clicking secondary button fires onEditElsewhere with rowId', () => {
    const onEditElsewhere = jest.fn();
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      onSetShelf: jest.fn(),
      onEditElsewhere,
    });
    card.querySelector('[data-action="edit-elsewhere"]').click();
    expect(onEditElsewhere).toHaveBeenCalledWith('row-101');
  });

  test('readOnly=true disables primary button', () => {
    const card = renderOrphanCard({
      orphan: ORPHAN_BAD_SVGCODE_F1,
      isActive: false,
      locale: 'en',
      readOnly: true,
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    const btn = card.querySelector('[data-action="set-shelf"]');
    expect(btn.disabled).toBe(true);
    expect(btn.title || '').not.toBe('');
  });

  test('locale=he uses Hebrew collection name and shelf label', () => {
    const orphan = { ...ORPHAN_BAD_SVGCODE_F1, collectionNameHe: 'אוסף', shelfLabelHe: 'מדף' };
    const card = renderOrphanCard({
      orphan,
      isActive: false,
      locale: 'he',
      onSetShelf: jest.fn(),
      onEditElsewhere: jest.fn(),
    });
    expect(card.textContent).toContain('אוסף');
    expect(card.textContent).toContain('מדף');
  });
});
