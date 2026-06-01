/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('shelf-card — vertical per-entry card (#97 Task 5.4)', () => {
  let buildShelfCard;
  let confirmRemove;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '';

    await jest.unstable_mockModule('../i18n.js', () => ({
      default: { t: (key) => key, get locale() { return 'en'; } },
    }));
    // Deterministic shape check: start>end iff numeric start > numeric end.
    await jest.unstable_mockModule('../components/map-editor/range-validation.js', () => ({
      validateRangeShape: (r) =>
        Number(r.rangeStart) > Number(r.rangeEnd) ? { ok: false, error: 'start > end' } : { ok: true },
    }));

    ({ buildShelfCard, confirmRemove } = await import('../components/map-editor/shelf-card.js'));
  });

  const baseRange = (o = {}) => ({
    id: 'r1', svgCode: 'E1', floor: '1', collectionName: 'GEN',
    rangeStart: '100', rangeEnd: '200', shelfLabel: 'E1', ...o,
  });
  const opts = (o = {}) => ({
    isLocked: false, conflicts: [], collectionsList: ['GEN', 'REF'],
    onChange: jest.fn(), onMove: jest.fn(), onDelete: jest.fn(), ...o,
  });

  test('renders a full-width collection select and labelled From/To inputs', () => {
    const card = buildShelfCard(baseRange(), opts());
    expect(card.querySelector('select[data-field="collectionName"]')).not.toBeNull();
    expect(card.querySelector('input[data-field="rangeStart"]').value).toBe('100');
    expect(card.querySelector('input[data-field="rangeEnd"]').value).toBe('200');
    const labels = [...card.querySelectorAll('.map-card__label')].map(l => l.textContent);
    expect(labels).toContain('mapEditor.field.from');
    expect(labels).toContain('mapEditor.field.to');
  });

  test('renders worded Move and Remove actions (not a bare ×)', () => {
    const card = buildShelfCard(baseRange(), opts());
    expect(card.querySelector('[data-action="move"]').textContent).toContain('mapEditor.move');
    const remove = card.querySelector('[data-action="delete"]');
    expect(remove.textContent).toContain('mapEditor.delete');
    expect(remove.textContent.trim()).not.toBe('×');
  });

  test('typing fires onChange with the field patch (no card rebuild here)', () => {
    const onChange = jest.fn();
    const card = buildShelfCard(baseRange(), opts({ onChange }));
    const input = card.querySelector('input[data-field="rangeStart"]');
    input.value = '150';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('r1', { rangeStart: '150' });
  });

  test('shows an always-visible inline warning when From > To (not tooltip-only)', () => {
    const card = buildShelfCard(baseRange({ rangeStart: '500', rangeEnd: '100' }), opts());
    const warn = card.querySelector('.map-card__warn');
    expect(warn.hasAttribute('hidden')).toBe(false);
    expect(warn.textContent).toContain('mapEditor.warning.startGtEnd');
  });

  test('overlap warning uses same-shelf wording when the other range is on this shelf', () => {
    const card = buildShelfCard(baseRange(), opts({
      conflicts: [{ otherShelf: 'E1', otherRangeLabel: '150-160' }], // same shelf
    }));
    expect(card.querySelector('.map-card__warn').textContent).toContain('mapEditor.warning.overlapSameShelf');
  });

  test('overlap warning uses cross-shelf wording when the other range is elsewhere', () => {
    const card = buildShelfCard(baseRange(), opts({
      conflicts: [{ otherShelf: 'E2', otherRangeLabel: '150-160' }],
    }));
    const txt = card.querySelector('.map-card__warn').textContent;
    expect(txt).toContain('mapEditor.warning.overlap');
    expect(txt).not.toContain('overlapSameShelf');
  });

  test('no warning line shown for a clean entry', () => {
    const card = buildShelfCard(baseRange(), opts());
    expect(card.querySelector('.map-card__warn').hasAttribute('hidden')).toBe(true);
  });

  test('locked card disables inputs and actions and wires no handlers', () => {
    const onChange = jest.fn();
    const card = buildShelfCard(baseRange(), opts({ isLocked: true, onChange }));
    expect(card.querySelector('input[data-field="rangeStart"]').disabled).toBe(true);
    expect(card.querySelector('[data-action="move"]').disabled).toBe(true);
    const input = card.querySelector('input[data-field="rangeStart"]');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  describe('P1: Remove opens a centred confirmation modal', () => {
    test('clicking Remove does NOT delete immediately — it opens the modal', () => {
      const onDelete = jest.fn();
      const card = buildShelfCard(baseRange(), opts({ onDelete }));
      document.body.appendChild(card);
      card.querySelector('[data-action="delete"]').click();
      expect(onDelete).not.toHaveBeenCalled();              // not immediate
      expect(document.querySelector('.map-modal-overlay')).not.toBeNull(); // modal shown
      expect(document.querySelector('.map-modal[role="dialog"]')).not.toBeNull();
    });

    test('confirming the modal calls onDelete and dismisses it', () => {
      const onDelete = jest.fn();
      const card = buildShelfCard(baseRange(), opts({ onDelete }));
      document.body.appendChild(card);
      card.querySelector('[data-action="delete"]').click();
      document.querySelector('.map-modal__confirm').click();
      expect(onDelete).toHaveBeenCalledWith('r1');
      expect(document.querySelector('.map-modal-overlay')).toBeNull();
    });

    test('cancelling the modal does not delete', () => {
      const onDelete = jest.fn();
      confirmRemove({ label: '100–200', onConfirm: onDelete });
      document.querySelector('.map-modal__cancel').click();
      expect(onDelete).not.toHaveBeenCalled();
      expect(document.querySelector('.map-modal-overlay')).toBeNull();
    });
  });
});
