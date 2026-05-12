import i18n from '../../i18n.js?v=5';
import { validateRangeShape } from './range-validation.js?v=1';

let host = null;

export function mountDrawer(elementId) {
  host = document.getElementById(elementId);
}

export function showSingleShelf({ shelfId, shelfLabel, rangesOnShelf, conflictsByRangeId, conflictingShelves, permission, collectionsList, onChange, onAdd, onMove, onDelete, onDiscard, onSave, onSelectShelf, onClose, hasPendingEdits }) {
  if (!host) return;
  host.classList.remove('map-drawer--hidden');
  const conflictCount = rangesOnShelf.reduce((n, r) => n + (conflictsByRangeId.get(r.id)?.length || 0), 0);
  const banner = buildConflictBanner(conflictCount, conflictingShelves || []);
  const closeLabel = i18n.t('mapEditor.close');
  const isEmpty = rangesOnShelf.length === 0;
  const body = isEmpty
    ? `
      <div class="map-drawer__empty-state">
        <p class="map-drawer__empty-state__message">${i18n.t('mapEditor.shelf.empty.message')}</p>
        <p class="map-drawer__empty-state__explanation">${i18n.t('mapEditor.shelf.empty.explanation')}</p>
        <button id="drawer-empty-cta" class="map-drawer__empty-state__cta" type="button">
          <span class="map-drawer__empty-state__cta__icon">➕</span>${i18n.t('mapEditor.shelf.empty.cta')}
        </button>
      </div>
    `
    : `
      <div class="map-drawer__rows" id="drawer-rows"></div>
      <button id="drawer-add" class="mt-2 px-3 py-1 text-sm border rounded">${i18n.t('mapEditor.addRange')}</button>
    `;
  host.innerHTML = `
    <div class="map-drawer__header">
      <h3 class="text-sm font-semibold">${i18n.t('mapEditor.shelf.header').replace('{label}', shelfLabel).replace('{n}', rangesOnShelf.length)}</h3>
      <div class="flex gap-2 items-center">
        <button id="drawer-discard" class="px-3 py-1 text-sm border rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.discard')}</button>
        <button id="drawer-save" class="px-3 py-1 text-sm bg-blue-600 text-white rounded" ${hasPendingEdits ? '' : 'disabled'}>${i18n.t('mapEditor.save')}</button>
        <button id="drawer-close" aria-label="${closeLabel}" title="${closeLabel}" class="px-2 py-1 text-gray-500 hover:text-gray-800 text-lg leading-none">×</button>
      </div>
    </div>
    ${banner}
    ${body}
  `;
  if (!isEmpty) {
    const rowsEl = host.querySelector('#drawer-rows');
    for (const r of rangesOnShelf) {
      const isLocked = permission(r.id) === 'readonly';
      const conflicts = conflictsByRangeId.get(r.id) || [];
      rowsEl.appendChild(buildRow(r, { isLocked, conflicts, collectionsList, onChange, onMove, onDelete }));
    }
    host.querySelector('#drawer-add').onclick = onAdd;
  } else {
    host.querySelector('#drawer-empty-cta').onclick = onAdd;
  }
  host.querySelector('#drawer-discard').onclick = onDiscard;
  host.querySelector('#drawer-save').onclick = onSave;
  const closeBtn = host.querySelector('#drawer-close');
  if (closeBtn) {
    closeBtn.onclick = () => { if (typeof onClose === 'function') onClose(); };
  }
  if (typeof onSelectShelf === 'function') {
    host.querySelectorAll('.map-drawer__warn-link').forEach(btn => {
      btn.addEventListener('click', () => onSelectShelf(btn.dataset.targetShelf));
    });
  }
}

function buildConflictBanner(conflictCount, conflictingShelves) {
  if (conflictCount === 0) return '';
  const countText = i18n.t('mapEditor.warning.banner').replace('{n}', conflictCount);
  if (!conflictingShelves.length) {
    return `<div class="map-drawer__warn-banner">⚠ ${countText}</div>`;
  }
  const links = conflictingShelves.map(s => {
    const tooltip = s.rangeLabels && s.rangeLabels.length
      ? `${s.rangeLabels.join(', ')}`
      : '';
    return `<button type="button" class="map-drawer__warn-link" data-target-shelf="${escape(s.svgCode)}" title="${escape(tooltip)}">${escape(s.label)}</button>`;
  }).join(' ');
  return `<div class="map-drawer__warn-banner">⚠ ${countText} ${i18n.t('mapEditor.warning.with')} ${links}</div>`;
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
    <select ${isLocked ? 'disabled' : ''} data-field="collectionName">
      ${collectionsList.map(c => `<option value="${escape(c)}" ${c === range.collectionName ? 'selected' : ''}>${escape(c)}</option>`).join('')}
    </select>
    <input ${isLocked ? 'disabled' : ''} data-field="rangeStart" value="${escape(range.rangeStart || '')}" />
    <input ${isLocked ? 'disabled' : ''} data-field="rangeEnd" value="${escape(range.rangeEnd || '')}" />
    <button ${isLocked ? 'disabled' : ''} data-action="move" class="text-xs px-2 border rounded">${i18n.t('mapEditor.move')}</button>
    <button ${isLocked ? 'disabled' : ''} data-action="delete" class="text-xs px-2 border rounded text-red-600">×</button>
  `;
  // Apply start > end tints + tooltips
  const shape = validateRangeShape(range);
  if (!shape.ok && shape.error === 'start > end') {
    row.querySelector('[data-field="rangeStart"]').classList.add('map-drawer__cell--invalid');
    row.querySelector('[data-field="rangeEnd"]').classList.add('map-drawer__cell--invalid');
    row.querySelector('[data-field="rangeStart"]').title = i18n.t('mapEditor.warning.startGtEnd');
    row.querySelector('[data-field="rangeEnd"]').title = i18n.t('mapEditor.warning.startGtEnd');
  }
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
