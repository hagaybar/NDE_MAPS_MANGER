import i18n from '../../i18n.js?v=5';

let host = null;

export function mountDrawer(elementId) {
  host = document.getElementById(elementId);
}

export function showSingleShelf({ shelfId, shelfLabel, rangesOnShelf, conflictsByRangeId, permission, collectionsList, onChange, onAdd, onMove, onDelete, onDiscard, onSave, hasPendingEdits }) {
  if (!host) return;
  host.classList.remove('map-drawer--hidden');
  const conflictCount = rangesOnShelf.reduce((n, r) => n + (conflictsByRangeId.get(r.id)?.length || 0), 0);
  const banner = conflictCount > 0
    ? `<div class="map-drawer__warn-banner">⚠ ${conflictCount} ${i18n.t('mapEditor.warning.banner').replace('{n}', conflictCount)}</div>`
    : '';
  host.innerHTML = `
    <div class="map-drawer__header">
      <h3 class="text-sm font-semibold">${i18n.t('mapEditor.shelf.header').replace('{label}', shelfLabel).replace('{n}', rangesOnShelf.length)}</h3>
      <div class="flex gap-2">
        <button id="drawer-discard" class="px-3 py-1 text-sm border rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.discard')}</button>
        <button id="drawer-save" class="px-3 py-1 text-sm bg-blue-600 text-white rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.save')}</button>
      </div>
    </div>
    ${banner}
    <div class="map-drawer__rows" id="drawer-rows"></div>
    <button id="drawer-add" class="mt-2 px-3 py-1 text-sm border rounded">${i18n.t('mapEditor.addRange')}</button>
  `;
  const rowsEl = host.querySelector('#drawer-rows');
  for (const r of rangesOnShelf) {
    const isLocked = permission(r.id) === 'readonly';
    const conflicts = conflictsByRangeId.get(r.id) || [];
    rowsEl.appendChild(buildRow(r, { isLocked, conflicts, collectionsList, onChange, onMove, onDelete }));
  }
  host.querySelector('#drawer-discard').onclick = onDiscard;
  host.querySelector('#drawer-save').onclick = onSave;
  host.querySelector('#drawer-add').onclick = onAdd;
}

export function hideDrawer() {
  if (!host) return;
  host.classList.add('map-drawer--hidden');
  host.innerHTML = '';
}

function buildRow(range, { isLocked, conflicts, collectionsList, onChange, onMove, onDelete }) {
  const row = document.createElement('div');
  row.className = `map-drawer__row${isLocked ? ' map-drawer__row--locked' : ''}`;
  row.dataset.rangeId = range.id;
  row.innerHTML = `
    <select ${isLocked ? 'disabled' : ''} data-field="collection">
      ${collectionsList.map(c => `<option value="${escape(c)}" ${c === range.collection ? 'selected' : ''}>${escape(c)}</option>`).join('')}
    </select>
    <input ${isLocked ? 'disabled' : ''} data-field="rangeStart" value="${escape(range.rangeStart || '')}" />
    <input ${isLocked ? 'disabled' : ''} data-field="rangeEnd" value="${escape(range.rangeEnd || '')}" />
    <button ${isLocked ? 'disabled' : ''} data-action="move" class="text-xs px-2 border rounded">${i18n.t('mapEditor.move')}</button>
    <button ${isLocked ? 'disabled' : ''} data-action="delete" class="text-xs px-2 border rounded text-red-600">×</button>
  `;
  // Apply conflict tints + tooltips
  if (conflicts.length > 0) {
    const tip = conflicts.map(c => i18n.t('mapEditor.warning.overlap')
      .replace('{otherRangeLabel}', c.otherRangeLabel)
      .replace('{otherShelfLabel}', c.otherShelf)).join('\n');
    row.querySelector('[data-field="rangeStart"]').classList.add('map-drawer__cell--invalid');
    row.querySelector('[data-field="rangeEnd"]').classList.add('map-drawer__cell--invalid');
    row.querySelector('[data-field="rangeStart"]').title = tip;
    row.querySelector('[data-field="rangeEnd"]').title = tip;
  }
  if (!isLocked) {
    row.querySelectorAll('input,select').forEach(input => {
      input.addEventListener('input', () => onChange(range.id, { [input.dataset.field]: input.value }));
    });
    row.querySelector('[data-action="move"]').onclick = () => onMove(range.id);
    row.querySelector('[data-action="delete"]').onclick = () => onDelete(range.id);
  }
  return row;
}

function escape(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
