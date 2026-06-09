export function createShelfState({ ranges, permittedRowIds }) {
  let _ranges = ranges.slice();
  let _selection = { kind: 'none', shelfIds: [] };
  let _reassign = null;         // { rangeId, intent, originShelfId } while picking a target, else null
  let _triageOpen = false;      // the "needs a shelf" worklist is open
  const _pending = new Map();   // session-wide; spans floors
  let _permitted = permittedRowIds; // null = unlimited (admin); replaceable via setPermitted

  return {
    ranges: () => _ranges,
    selection: () => _selection,
    pendingEdits: () => _pending,
    pendingCount: () => _pending.size,
    reassign: () => _reassign,

    // The panel renders one of four modes. Precedence reassign > triage > shelf >
    // idle means cancelReassign/closeTriage fall back to the prior mode for free —
    // selection + triage flags are left intact underneath an active reassign.
    mode() {
      if (_reassign) return 'reassign';
      if (_triageOpen) return 'triage';
      if (_selection.kind === 'single') return 'shelf';
      return 'idle';
    },

    selectSingle(shelfId) {
      _selection = { kind: 'single', shelfIds: [shelfId] };
      _triageOpen = false; // picking a shelf leaves the triage worklist (triage → shelf)
    },
    clearSelection() { _selection = { kind: 'none', shelfIds: [] }; },

    openTriage() { _triageOpen = true; },
    closeTriage() { _triageOpen = false; },

    // shelf|triage → reassign. Records what's being moved (and where from) for the
    // instruction strip + target filtering; does NOT touch selection/triage/pending,
    // so cancel restores the prior mode and queued edits survive a Move.
    enterReassign({ rangeId, intent }) {
      _reassign = { rangeId, intent, originShelfId: _selection.shelfIds[0] ?? null };
    },
    cancelReassign() { _reassign = null; }, // mode() re-derives to shelf/triage/idle

    // Apply the (add-safe) move to the picked target, end reassign + triage, and
    // select the destination so the panel shows the moved range in its new home.
    // floor is included only for a cross-floor move.
    confirmReassignTarget({ svgCode, floor }) {
      if (_reassign) {
        const target = floor !== undefined ? { svgCode, floor } : { svgCode };
        this.move(_reassign.rangeId, target);
      }
      _reassign = null;
      _triageOpen = false;
      if (svgCode) this.selectSingle(svgCode);
    },

    isAllowed(rangeId) {
      // A pending add belongs to the editor creating it — always editable (the
      // server validates its range on save). Existing rows stay range-gated (#126).
      if (_pending.get(rangeId)?.type === 'add') return true;
      return _permitted === null || _permitted.has(rangeId);
    },
    permission(rangeId) {
      return this.isAllowed(rangeId) ? 'edit' : 'readonly';
    },

    // Replace the permitted-row set. Called after a save once the app has
    // recomputed which (now-saved) rows fall in the editor's range, so a
    // just-saved in-range row becomes editable again instead of staying locked (#126).
    setPermitted(p) { _permitted = p; },

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
      // Deleting a not-yet-saved add just drops it — the row was never in
      // _ranges, so there's nothing to tombstone. Leaving a {type:'delete'}
      // keyed to a temp id would orphan a delete the server can't resolve (#92).
      const existing = _pending.get(rangeId);
      if (existing && existing.type === 'add') {
        _pending.delete(rangeId);
        return;
      }
      _pending.set(rangeId, { type: 'delete' });
    },
    move(rangeId, target) {
      // If this row is a not-yet-saved add, fold the move INTO the add so it
      // stays an 'add' (materialize only re-adds 'add' entries). Overwriting it
      // with a 'move' would orphan the row — it isn't in _ranges yet — and drop
      // it on the next render (same class as the #81 edit bug; #92).
      const existing = _pending.get(rangeId);
      if (existing && existing.type === 'add') {
        _pending.set(rangeId, { type: 'add', range: { ...existing.range, ...target } });
        return;
      }
      _pending.set(rangeId, { type: 'move', target });
    },
    revert() { _pending.clear(); },

    // Adopt `rows` as the new saved baseline and drop all pending edits. Called
    // after a successful save: without this, _ranges still holds the pre-save
    // baseline, so materialize() (with pending now cleared) re-derives the OLD
    // data and the just-saved range disappears from the drawer (issue #86).
    commit(rows) {
      _ranges = rows.slice();
      _pending.clear();
    },

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
