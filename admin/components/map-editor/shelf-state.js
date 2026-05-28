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
    clearSelection() { _selection = { kind: 'none', shelfIds: [] }; },

    isAllowed(rangeId) {
      return _permitted === null || _permitted.has(rangeId);
    },
    permission(rangeId) {
      return this.isAllowed(rangeId) ? 'edit' : 'readonly';
    },

    edit(rangeId, patch) {
      // If this row is a not-yet-saved add, merge the edit INTO the add so it
      // stays an 'add' (materialize only re-adds 'add' entries). Overwriting it
      // with a 'modify' would orphan the row — it isn't in _ranges yet — and
      // drop it on the next render (issue #81).
      const existing = _pending.get(rangeId);
      if (existing && existing.type === 'add') {
        _pending.set(rangeId, { type: 'add', range: { ...existing.range, ...patch } });
        return;
      }
      _pending.set(rangeId, { type: 'modify', patch: { ...(existing?.patch || {}), ...patch } });
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
