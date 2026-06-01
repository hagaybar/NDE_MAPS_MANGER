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

describe('shelfState add-then-edit (issue #81)', () => {
  test('editing a freshly-added row keeps it and applies the value', () => {
    const s = createShelfState({
      ranges: [{ id: 'r1', svgCode: 'A1', floor: '0', rangeStart: '1', rangeEnd: '9' }],
      permittedRowIds: null,
    });
    s.add('temp-1', { svgCode: 'A1', floor: '0', rangeStart: '', rangeEnd: '' });
    expect(s.materialize().filter(r => r.svgCode === 'A1')).toHaveLength(2); // r1 + temp-1

    s.edit('temp-1', { rangeStart: '100' }); // librarian types into the new row

    const onShelf = s.materialize().filter(r => r.svgCode === 'A1');
    expect(onShelf).toHaveLength(2);                       // the new row must NOT vanish
    const added = onShelf.find(r => r.id === 'temp-1');
    expect(added).toBeDefined();
    expect(added.rangeStart).toBe('100');                  // and must carry the typed value
  });

  test('multiple edits to a new row accumulate into the pending add', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.add('temp-1', { svgCode: 'B1', floor: '1', rangeStart: '', rangeEnd: '' });
    s.edit('temp-1', { rangeStart: '100' });
    s.edit('temp-1', { rangeEnd: '199' });
    const added = s.materialize().find(r => r.id === 'temp-1');
    expect(added).toMatchObject({ svgCode: 'B1', floor: '1', rangeStart: '100', rangeEnd: '199' });
    expect(s.pendingEdits().get('temp-1').type).toBe('add'); // still an add, not a modify
  });
});

describe('shelfState add-then-move / add-then-delete (issue #92)', () => {
  test('moving a freshly-added row keeps it and applies the target', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.add('temp-1', { svgCode: 'B1', floor: '1', rangeStart: '100', rangeEnd: '199' });

    s.move('temp-1', { svgCode: 'C2' }); // drag the new shelf onto a different cell

    const moved = s.materialize().find(r => r.id === 'temp-1');
    expect(moved).toBeDefined();                              // must NOT vanish
    expect(moved.svgCode).toBe('C2');                         // and must carry the new target
    expect(moved).toMatchObject({ floor: '1', rangeStart: '100', rangeEnd: '199' });
    expect(s.pendingEdits().get('temp-1').type).toBe('add');  // still an add, not a move
  });

  test('deleting a freshly-added row removes it cleanly with no dangling pending entry', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.add('temp-1', { svgCode: 'B1', floor: '1', rangeStart: '100', rangeEnd: '199' });

    s.delete('temp-1'); // librarian adds a row then discards it

    expect(s.materialize().find(r => r.id === 'temp-1')).toBeUndefined();
    expect(s.pendingEdits().has('temp-1')).toBe(false); // no orphaned {type:'delete'} for an unsaved id
  });

  test('moving a SAVED row still records a move and applies the target', () => {
    const s = createShelfState({
      ranges: [{ id: 'r1', svgCode: 'A1', floor: '1', rangeStart: '100', rangeEnd: '110' }],
      permittedRowIds: null,
    });
    s.move('r1', { svgCode: 'Z9' });
    expect(s.pendingEdits().get('r1').type).toBe('move');
    expect(s.materialize().find(r => r.id === 'r1').svgCode).toBe('Z9');
  });
});

describe('shelfState.commit — saved range persists after save (issue #86)', () => {
  test('adopting the saved snapshot keeps an added row and clears pending', () => {
    const s = createShelfState({
      ranges: [{ id: 'r1', svgCode: 'A1', floor: '1', rangeStart: '100', rangeEnd: '110' }],
      permittedRowIds: null,
    });
    s.add('temp-1', { svgCode: 'A1', floor: '1', rangeStart: '200', rangeEnd: '299' });

    const merged = s.materialize();        // what the app PUTs to the server
    s.commit(merged);                      // server accepted it → new baseline

    expect(s.pendingEdits().size).toBe(0); // nothing outstanding after a save
    const after = s.materialize();
    // The just-added range must still be present — re-deriving from the new
    // baseline, NOT the stale pre-save one (the #86 regression).
    expect(after.find(r => r.id === 'temp-1')).toMatchObject({ rangeStart: '200', rangeEnd: '299' });
    expect(after.filter(r => r.svgCode === 'A1')).toHaveLength(2);
  });

  test('an edit made after commit applies on top of the new baseline', () => {
    const s = createShelfState({
      ranges: [{ id: 'r1', svgCode: 'A1', floor: '1', rangeStart: '100', rangeEnd: '110' }],
      permittedRowIds: null,
    });
    s.edit('r1', { rangeEnd: '120' });
    s.commit(s.materialize());             // r1 now saved as 100-120

    s.edit('r1', { rangeEnd: '130' });     // a fresh edit after the save
    expect(s.materialize().find(r => r.id === 'r1').rangeEnd).toBe('130');
    s.revert();                            // discard the fresh edit
    expect(s.materialize().find(r => r.id === 'r1').rangeEnd).toBe('120'); // back to the saved baseline
  });
});

describe('shelfState mode state machine (#97 Task 5.2)', () => {
  const mk = () => createShelfState({
    ranges: [
      { id: 'r1', svgCode: 'A1', floor: '1', collectionName: 'GEN', rangeStart: '100', rangeEnd: '110' },
    ],
    permittedRowIds: null,
  });

  test('starts idle; selectSingle → shelf; clearSelection → idle', () => {
    const s = mk();
    expect(s.mode()).toBe('idle');
    s.selectSingle('A1');
    expect(s.mode()).toBe('shelf');
    s.clearSelection();
    expect(s.mode()).toBe('idle');
  });

  test('openTriage → triage; closeTriage → back to idle', () => {
    const s = mk();
    s.openTriage();
    expect(s.mode()).toBe('triage');
    s.closeTriage();
    expect(s.mode()).toBe('idle');
  });

  test('selecting a shelf closes the triage worklist (triage → shelf)', () => {
    const s = mk();
    s.openTriage();
    s.selectSingle('A1');
    expect(s.mode()).toBe('shelf');
  });

  test('enterReassign from shelf → reassign, records descriptor, keeps pending edits', () => {
    const s = mk();
    s.selectSingle('A1');
    s.edit('r1', { rangeEnd: '111' });
    s.enterReassign({ rangeId: 'r1', intent: 'move' });
    expect(s.mode()).toBe('reassign');
    expect(s.reassign()).toMatchObject({ rangeId: 'r1', intent: 'move', originShelfId: 'A1' });
    expect(s.pendingEdits().size).toBe(1); // Move doesn't drop queued edits
  });

  test('cancelReassign returns to the prior mode (shelf if a shelf was selected)', () => {
    const s = mk();
    s.selectSingle('A1');
    s.enterReassign({ rangeId: 'r1', intent: 'move' });
    s.cancelReassign();
    expect(s.mode()).toBe('shelf');
    expect(s.reassign()).toBeNull();
  });

  test('cancelReassign from a triage-origin repair returns to triage', () => {
    const s = mk();
    s.openTriage();
    s.enterReassign({ rangeId: 'r1', intent: 'repair' });
    expect(s.mode()).toBe('reassign');   // reassign outranks triage
    s.cancelReassign();
    expect(s.mode()).toBe('triage');     // …and falls back to it on cancel
  });

  test('confirmReassignTarget applies an add-safe move, selects the destination, ends reassign', () => {
    const s = mk();
    s.selectSingle('A1');
    s.enterReassign({ rangeId: 'r1', intent: 'move' });
    s.confirmReassignTarget({ svgCode: 'B2' });
    expect(s.reassign()).toBeNull();
    expect(s.mode()).toBe('shelf');
    expect(s.selection().shelfIds).toEqual(['B2']); // dest selected
    expect(s.materialize().find(r => r.id === 'r1').svgCode).toBe('B2'); // moved
  });

  test('confirmReassignTarget carries floor for a cross-floor move', () => {
    const s = mk();
    s.selectSingle('A1');
    s.enterReassign({ rangeId: 'r1', intent: 'move' });
    s.confirmReassignTarget({ svgCode: 'C3', floor: '2' });
    const moved = s.materialize().find(r => r.id === 'r1');
    expect(moved.svgCode).toBe('C3');
    expect(moved.floor).toBe('2');
  });

  test('confirmReassignTarget on a freshly-added row keeps it (add-safe move)', () => {
    const s = createShelfState({ ranges: [], permittedRowIds: null });
    s.add('temp-1', { svgCode: 'A1', floor: '1', collectionName: 'GEN', rangeStart: '1', rangeEnd: '9' });
    s.selectSingle('A1');
    s.enterReassign({ rangeId: 'temp-1', intent: 'move' });
    s.confirmReassignTarget({ svgCode: 'B2' });
    const rows = s.materialize().filter(r => r.id === 'temp-1');
    expect(rows).toHaveLength(1);                 // not dropped
    expect(rows[0].svgCode).toBe('B2');
    expect(s.pendingEdits().get('temp-1').type).toBe('add'); // still an add
  });

  test('pendingCount reflects the number of queued edits across shelves', () => {
    const s = createShelfState({
      ranges: [
        { id: 'r1', svgCode: 'A1', floor: '1', rangeStart: '1', rangeEnd: '9' },
        { id: 'r2', svgCode: 'B2', floor: '2', rangeStart: '1', rangeEnd: '9' },
      ],
      permittedRowIds: null,
    });
    expect(s.pendingCount()).toBe(0);
    s.edit('r1', { rangeEnd: '8' });
    s.edit('r2', { rangeEnd: '8' });
    expect(s.pendingCount()).toBe(2);
  });
});
