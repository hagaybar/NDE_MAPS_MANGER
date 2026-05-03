import { createShelfState } from '../components/map-editor/shelf-state.js';

describe('shelfState selection', () => {
  test('starts with no selection', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    expect(s.selection()).toEqual({ kind: 'none', shelfIds: [] });
  });

  test('selectSingle sets single selection', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.selectSingle('A1');
    expect(s.selection()).toEqual({ kind: 'single', shelfIds: ['A1'] });
  });

  test('clear resets to none', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.selectSingle('A1');
    s.clearSelection();
    expect(s.selection().kind).toBe('none');
  });
});

describe('shelfState.pendingEdits is session-wide', () => {
  test('edits accumulate across floor switches (no implicit flush)', () => {
    const s = createShelfState({ ranges: [
      { id: 'r1', floor: '1', rangeStart: '100', rangeEnd: '110' },
      { id: 'r2', floor: '2', rangeStart: '200', rangeEnd: '210' },
    ], permittedRowIds: null });
    s.edit('r1', { rangeEnd: '111' });
    s.edit('r2', { rangeEnd: '215' });
    expect(s.pendingEdits().size).toBe(2);
    // Switching floors is purely a UI concern; state holds both.
  });

  test('revert() clears all pending edits across floors', () => {
    const s = createShelfState({ ranges: [
      { id: 'r1', floor: '1', rangeStart: '100', rangeEnd: '110' },
      { id: 'r2', floor: '2', rangeStart: '200', rangeEnd: '210' },
    ], permittedRowIds: null });
    s.edit('r1', { rangeEnd: '111' });
    s.edit('r2', { rangeEnd: '215' });
    s.revert();
    expect(s.pendingEdits().size).toBe(0);
  });
});

describe('shelfState.materialize permission filter', () => {
  test('drops edits to rows outside permittedRowIds', () => {
    const s = createShelfState({
      ranges: [
        { id: 'allowed', rangeStart: '100', rangeEnd: '110' },
        { id: 'forbidden', rangeStart: '200', rangeEnd: '210' },
      ],
      permittedRowIds: new Set(['allowed']),
    });
    s.edit('allowed', { rangeEnd: '111' });
    s.edit('forbidden', { rangeEnd: '215' });
    const out = s.materialize();
    expect(out.find(r => r.id === 'allowed').rangeEnd).toBe('111');
    expect(out.find(r => r.id === 'forbidden').rangeEnd).toBe('210'); // unchanged
  });

  test('drops delete on forbidden row', () => {
    const s = createShelfState({
      ranges: [{ id: 'forbidden', rangeStart: '200', rangeEnd: '210' }],
      permittedRowIds: new Set(),
    });
    s.delete('forbidden');
    const out = s.materialize();
    expect(out).toHaveLength(1);
  });
});
