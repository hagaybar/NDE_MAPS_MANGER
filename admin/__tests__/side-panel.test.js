/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('side-panel mode router (#97 Task 5.3)', () => {
  let mountSidePanel, renderPanel, hidePanel;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="panel"></div>';
    await jest.unstable_mockModule('../i18n.js', () => ({
      default: { t: (key) => key, get locale() { return 'en'; } },
    }));
    await jest.unstable_mockModule('../components/map-editor/range-validation.js', () => ({
      validateRangeShape: () => ({ ok: true }),
    }));
    ({ mountSidePanel, renderPanel, hidePanel } = await import('../components/map-editor/side-panel.js'));
    mountSidePanel('panel');
  });

  const ranges = (n = 1) => Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, svgCode: 'E1', floor: '1', collectionName: 'GEN',
    rangeStart: '100', rangeEnd: '200', shelfLabel: 'E1',
  }));
  const shelfProps = (o = {}) => ({
    mode: 'shelf', shelfLabel: 'E1', rangesOnShelf: ranges(2),
    conflictsByRangeId: new Map(), conflictingShelves: [], permission: () => 'rw',
    collectionsList: ['GEN'], hasPendingEdits: false, pendingCount: 0,
    onChange: jest.fn(), onAdd: jest.fn(), onMove: jest.fn(), onDelete: jest.fn(),
    onDiscard: jest.fn(), onSave: jest.fn(), onSelectShelf: jest.fn(), onClose: jest.fn(),
    ...o,
  });

  describe('idle', () => {
    test('shows the hint and NO nudge when nothing needs attention', () => {
      renderPanel({ mode: 'idle', orphanCount: 0 });
      expect(document.querySelector('.map-panel__hint').textContent).toContain('mapEditor.idle.hint');
      expect(document.querySelector('.map-panel__nudge')).toBeNull();
    });
    test('shows the nudge only when orphanCount > 0 and fires onOpenTriage', () => {
      const onOpenTriage = jest.fn();
      renderPanel({ mode: 'idle', orphanCount: 3, onOpenTriage });
      const nudge = document.querySelector('.map-panel__nudge');
      expect(nudge).not.toBeNull();
      expect(nudge.textContent).toContain('mapEditor.idle.nudge');
      nudge.click();
      expect(onOpenTriage).toHaveBeenCalled();
    });
  });

  describe('shelf', () => {
    test('renders one card per entry and a corner ✕ close (W2), no "back to map"', () => {
      renderPanel(shelfProps());
      expect(document.querySelectorAll('.map-card')).toHaveLength(2);
      expect(document.getElementById('panel-close')).not.toBeNull();
      expect(document.body.textContent).not.toMatch(/back to map/i);
    });
    test('header is just the shelf label (no "{n} ranges")', () => {
      renderPanel(shelfProps());
      const title = document.querySelector('.map-panel__title').textContent;
      expect(title).toContain('mapEditor.shelf.header'); // key (mock); count interpolation gone
    });
    test('Save/Discard disabled with no pending edits; pending chip hidden', () => {
      renderPanel(shelfProps({ hasPendingEdits: false, pendingCount: 0 }));
      expect(document.getElementById('panel-save').disabled).toBe(true);
      expect(document.getElementById('panel-discard').disabled).toBe(true);
      expect(document.querySelector('.map-panel__pending-chip')).toBeNull();
    });
    test('Save/Discard enabled + pending chip shows the count when edits are queued', () => {
      renderPanel(shelfProps({ hasPendingEdits: true, pendingCount: 4 }));
      expect(document.getElementById('panel-save').disabled).toBe(false);
      expect(document.querySelector('.map-panel__pending-chip').textContent).toBe('4');
    });
    test('✕ close fires onClose', () => {
      const onClose = jest.fn();
      renderPanel(shelfProps({ onClose }));
      document.getElementById('panel-close').click();
      expect(onClose).toHaveBeenCalled();
    });
    test('empty shelf shows the CTA wired to onAdd', () => {
      const onAdd = jest.fn();
      renderPanel(shelfProps({ rangesOnShelf: [], onAdd }));
      document.getElementById('panel-empty-cta').click();
      expect(onAdd).toHaveBeenCalled();
    });
  });

  describe('reassign / triage', () => {
    test('reassign shows the summary + Cancel', () => {
      const onCancelReassign = jest.fn();
      renderPanel({ mode: 'reassign', reassignSummary: 'moving GEN 100-200', onCancelReassign });
      expect(document.querySelector('.map-panel__reassign-summary').textContent).toContain('moving GEN');
      document.getElementById('panel-reassign-cancel').click();
      expect(onCancelReassign).toHaveBeenCalled();
    });
    test('triage delegates the list to renderTriageList', () => {
      const renderTriageList = jest.fn();
      renderPanel({ mode: 'triage', renderTriageList });
      expect(renderTriageList).toHaveBeenCalledWith(document.getElementById('panel-triage-list'));
    });
  });

  describe('focus preservation across re-render (#86 carried over)', () => {
    test('focus + caret on a card input survive a re-render', () => {
      renderPanel(shelfProps({ rangesOnShelf: ranges(1) }));
      const input = document.querySelector('.map-card [data-field="rangeStart"]');
      input.focus();
      input.value = '105';
      input.setSelectionRange(3, 3);

      renderPanel(shelfProps({ rangesOnShelf: ranges(1), hasPendingEdits: true })); // re-render

      const after = document.querySelector('.map-card [data-field="rangeStart"]');
      expect(after).not.toBe(input);
      expect(document.activeElement).toBe(after);
      expect(after.selectionStart).toBe(3);
    });
  });
});
