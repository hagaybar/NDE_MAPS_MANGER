export function createShelfState({ ranges, permittedRowIds }) {
  let _ranges = ranges.slice();
  let _selection = { kind: 'none', shelfIds: [] };
  const _pending = new Map();   // session-wide; spans floors
  const _permitted = permittedRowIds; // null = unlimited (admin)

  return {
    ranges: () => _ranges,
    selection: () => _selection,
    pendingEdits: () => _pending,

    selectSingle(shelfId) {
      _selection = { kind: 'single', shelfIds: [shelfId] };
    },
    selectMulti(shelfIds) {
      const unique = Array.from(new Set(shelfIds));
      _selection = unique.length <= 1
        ? { kind: unique.length === 1 ? 'single' : 'none', shelfIds: unique }
        : { kind: 'multi', shelfIds: unique };
    },
    addToSelection(shelfId) {
      const next = Array.from(new Set([..._selection.shelfIds, shelfId]));
      this.selectMulti(next);
    },
    removeFromSelection(shelfId) {
      const next = _selection.shelfIds.filter(id => id !== shelfId);
      this.selectMulti(next);
    },
    clearSelection() { _selection = { kind: 'none', shelfIds: [] }; },

    isAllowed(rangeId) {
      return _permitted === null || _permitted.has(rangeId);
    },
    permission(rangeId) {
      return this.isAllowed(rangeId) ? 'edit' : 'readonly';
    },

    edit(rangeId, patch) {
      _pending.set(rangeId, { type: 'modify', patch: { ...(_pending.get(rangeId)?.patch || {}), ...patch } });
    },
    add(tempId, range) {
      _pending.set(tempId, { type: 'add', range });
    },
    delete(rangeId) {
      _pending.set(rangeId, { type: 'delete' });
    },
    move(rangeId, target) {
      _pending.set(rangeId, { type: 'move', target });
    },
    revert() { _pending.clear(); },

    materialize() {
      // Apply pendingEdits to _ranges, filtering out anything not allowed.
      const result = _ranges.filter(r => {
        const e = _pending.get(r.id);
        return !(e && e.type === 'delete' && this.isAllowed(r.id));
      }).map(r => {
        const e = _pending.get(r.id);
        if (e && e.type === 'modify' && this.isAllowed(r.id)) return { ...r, ...e.patch };
        if (e && e.type === 'move' && this.isAllowed(r.id)) return { ...r, ...e.target };
        return r;
      });
      for (const [id, e] of _pending) {
        if (e.type === 'add') result.push({ ...e.range, id });
      }
      return result;
    },
  };
}
