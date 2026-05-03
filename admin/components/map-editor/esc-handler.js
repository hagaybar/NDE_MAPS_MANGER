/**
 * Esc-key handler for the Map Editor drawer.
 *
 * Extracted from `initMapEditor` so the pending-edits-confirm branch is
 * deterministically testable. Wire by passing this function to
 * `document.addEventListener('keydown', e => handleEscape({ ...deps, event: e }))`
 * in the parent module (see admin/components/map-editor.js).
 *
 * Behaviour:
 *   - No-op for non-Escape keys.
 *   - No-op while reassign-mode is active (that mode has its own Esc cancel).
 *   - With pending edits: prompt the user (window.confirm by default, override
 *     via `confirmFn` for tests). On false → no state change. On true → revert
 *     pendingEdits, refresh conflicts, then close the drawer/clear selection.
 *   - With no pending edits: close the drawer / clear selection silently.
 */
export function handleEscape({
  event,
  shelfState,
  applySelection,
  shelfElements,
  refreshConflicts,
  isReassignActive,
  i18n,
  confirmFn = (msg) => window.confirm(msg),
}) {
  if (!event || event.key !== 'Escape') return;
  if (typeof isReassignActive === 'function' && isReassignActive()) return;

  const pendingCount = shelfState.pendingEdits().size;
  if (pendingCount > 0) {
    const ok = confirmFn(i18n.t('mapEditor.unsavedChangesConfirm'));
    if (!ok) return;
    shelfState.revert();
    if (typeof refreshConflicts === 'function') refreshConflicts();
  }

  shelfState.clearSelection();
  applySelection(shelfElements, []);
  window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
}
