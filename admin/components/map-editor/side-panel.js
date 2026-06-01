import i18n from '../../i18n.js?v=5';
import { buildShelfCard } from './shelf-card.js?v=1';

/**
 * The persistent side panel: one host, four selection-driven modes
 * (idle | shelf | reassign | triage) — replacing the bottom drawer, the orphan
 * overlay, and the reassign banner. The map-editor computes state and calls
 * renderPanel({ mode, ... }); this module owns the DOM and, critically, the
 * focus/caret capture-restore around every full re-render (the #86 fix carried
 * over from shelf-drawer.js, since the panel re-renders on each keystroke).
 *
 * Spec §6. W1 = idle copy; W2 = corner ✕ close, no "back to map".
 */

let host = null;

export function mountSidePanel(elementId) {
  host = document.getElementById(elementId);
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function renderPanel(props = {}) {
  if (!host) return;
  const focusInfo = captureFocus();
  const mode = props.mode || 'idle';
  host.dataset.mode = mode;
  host.classList.remove('map-side-panel--hidden');

  if (mode === 'shelf') renderShelf(props);
  else if (mode === 'reassign') renderReassign(props);
  else if (mode === 'triage') renderTriage(props);
  else renderIdle(props);

  restoreFocus(focusInfo);
}

// --- idle: calm, shelf-centric hint + a nudge ONLY when something needs attention (§6.1) ---
function renderIdle({ orphanCount = 0, onOpenTriage }) {
  const nudge = orphanCount > 0
    ? `<button type="button" class="map-panel__nudge" id="panel-nudge">
         <span class="map-panel__nudge-text">${escape(i18n.t('mapEditor.idle.nudge').replace('{n}', orphanCount))}</span>
         <span class="map-panel__nudge-expand">${escape(i18n.t('mapEditor.idle.expand'))}</span>
       </button>`
    : '';
  host.innerHTML = `
    <div class="map-panel map-panel--idle">
      <p class="map-panel__hint">${escape(i18n.t('mapEditor.idle.hint'))}</p>
      ${nudge}
    </div>`;
  if (orphanCount > 0 && typeof onOpenTriage === 'function') {
    host.querySelector('#panel-nudge').onclick = onOpenTriage;
  }
}

// --- shelf: the per-entry editor ---
function renderShelf(props) {
  const {
    shelfLabel, rangesOnShelf = [], conflictsByRangeId = new Map(), conflictingShelves = [],
    permission = () => 'rw', collectionsList = [], hasPendingEdits = false, pendingCount = 0,
    onChange, onAdd, onMove, onDelete, onDiscard, onSave, onSelectShelf, onClose,
  } = props;

  const closeLabel = i18n.t('mapEditor.close');
  const isEmpty = rangesOnShelf.length === 0;
  const conflictCount = rangesOnShelf.reduce((n, r) => n + (conflictsByRangeId.get(r.id)?.length || 0), 0);
  const pendingChip = pendingCount > 0
    ? `<span class="map-panel__pending-chip" title="${escape(i18n.t('mapEditor.save'))}">${pendingCount}</span>`
    : '';

  host.innerHTML = `
    <div class="map-panel map-panel--shelf">
      <div class="map-panel__header">
        <h3 class="map-panel__title">${escape(i18n.t('mapEditor.shelf.header').replace('{label}', shelfLabel))}</h3>
        <div class="map-panel__header-actions">
          ${pendingChip}
          <button id="panel-discard" class="map-panel__btn" ${hasPendingEdits ? '' : 'disabled'}>${escape(i18n.t('mapEditor.discard'))}</button>
          <button id="panel-save" class="map-panel__btn map-panel__btn--primary" ${hasPendingEdits ? '' : 'disabled'}>${escape(i18n.t('mapEditor.save'))}</button>
          <button id="panel-close" class="map-panel__close" aria-label="${escape(closeLabel)}" title="${escape(closeLabel)}">×</button>
        </div>
      </div>
      ${buildConflictBanner(conflictCount, conflictingShelves)}
      ${isEmpty
        ? `<div class="map-panel__empty">
             <p class="map-panel__empty-msg">${escape(i18n.t('mapEditor.shelf.empty.message'))}</p>
             <button id="panel-empty-cta" class="map-panel__btn map-panel__btn--primary">${escape(i18n.t('mapEditor.shelf.empty.cta'))}</button>
           </div>`
        : `<div class="map-panel__cards" id="panel-cards"></div>
           <button id="panel-add" class="map-panel__add">${escape(i18n.t('mapEditor.addRange'))}</button>`}
    </div>`;

  if (!isEmpty) {
    const cardsEl = host.querySelector('#panel-cards');
    for (const r of rangesOnShelf) {
      cardsEl.appendChild(buildShelfCard(r, {
        isLocked: permission(r.id) === 'readonly',
        conflicts: conflictsByRangeId.get(r.id) || [],
        collectionsList, onChange, onMove, onDelete,
      }));
    }
    host.querySelector('#panel-add').onclick = onAdd;
  } else {
    host.querySelector('#panel-empty-cta').onclick = onAdd;
  }

  host.querySelector('#panel-discard').onclick = onDiscard;
  host.querySelector('#panel-save').onclick = onSave;
  host.querySelector('#panel-close').onclick = () => { if (typeof onClose === 'function') onClose(); };
  if (typeof onSelectShelf === 'function') {
    host.querySelectorAll('.map-panel__warn-link').forEach(btn => {
      btn.addEventListener('click', () => onSelectShelf(btn.dataset.targetShelf));
    });
  }
}

// --- reassign: passive summary + Cancel; the active instruction strip is over the map (Task 5.6) ---
function renderReassign({ reassignSummary = '', onCancelReassign }) {
  host.innerHTML = `
    <div class="map-panel map-panel--reassign">
      <p class="map-panel__reassign-summary">${escape(reassignSummary)}</p>
      <button id="panel-reassign-cancel" class="map-panel__btn">${escape(i18n.t('mapEditor.reassign.cancel'))}</button>
    </div>`;
  if (typeof onCancelReassign === 'function') {
    host.querySelector('#panel-reassign-cancel').onclick = onCancelReassign;
  }
}

// --- triage: the orphan worklist. The list itself is rendered by a callback
// (the additive seam, spec §7) so this module stays decoupled from orphan-deriver. ---
function renderTriage({ renderTriageList, onCloseTriage }) {
  const closeLabel = i18n.t('mapEditor.close');
  host.innerHTML = `
    <div class="map-panel map-panel--triage">
      <div class="map-panel__header">
        <h3 class="map-panel__title">${escape(i18n.t('mapEditor.triage.title'))}</h3>
        <button id="panel-triage-close" class="map-panel__close" aria-label="${escape(closeLabel)}" title="${escape(closeLabel)}">×</button>
      </div>
      <div class="map-panel__triage-list" id="panel-triage-list"></div>
    </div>`;
  if (typeof renderTriageList === 'function') {
    renderTriageList(host.querySelector('#panel-triage-list'));
  }
  if (typeof onCloseTriage === 'function') {
    host.querySelector('#panel-triage-close').onclick = onCloseTriage;
  }
}

function buildConflictBanner(conflictCount, conflictingShelves) {
  if (conflictCount === 0) return '';
  const countText = i18n.t('mapEditor.warning.banner').replace('{n}', conflictCount);
  if (!conflictingShelves.length) {
    return `<div class="map-panel__warn-banner">⚠ ${escape(countText)}</div>`;
  }
  const links = conflictingShelves.map(s => {
    const tip = s.rangeLabels && s.rangeLabels.length ? s.rangeLabels.join(', ') : '';
    return `<button type="button" class="map-panel__warn-link" data-target-shelf="${escape(s.svgCode)}" title="${escape(tip)}">${escape(s.label)}</button>`;
  }).join(' ');
  return `<div class="map-panel__warn-banner">⚠ ${escape(countText)} ${escape(i18n.t('mapEditor.warning.with'))} ${links}</div>`;
}

export function hidePanel() {
  if (!host) return;
  host.classList.add('map-side-panel--hidden');
  host.innerHTML = '';
  delete host.dataset.mode;
}

// --- focus preservation across re-render (issue #86, carried from shelf-drawer.js) ---
function captureFocus() {
  if (!host) return null;
  const el = document.activeElement;
  if (!el || !el.dataset || !host.contains(el)) return null;
  const field = el.dataset.field;
  if (!field) return null;
  const card = el.closest('.map-card');
  const info = { field, rangeId: card ? card.dataset.rangeId : null };
  if (typeof el.selectionStart === 'number') {
    info.start = el.selectionStart;
    info.end = el.selectionEnd;
  }
  return info;
}

function restoreFocus(info) {
  if (!info || !host) return;
  let scope = host;
  if (info.rangeId) {
    const card = host.querySelector(`.map-card[data-range-id="${cssAttr(info.rangeId)}"]`);
    if (card) scope = card;
  }
  const el = scope.querySelector(`[data-field="${cssAttr(info.field)}"]`);
  if (!el) return;
  el.focus();
  if (typeof info.start === 'number' && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(info.start, info.end); } catch { /* not a text input */ }
  }
}

function cssAttr(value) { return String(value).replace(/(["\\])/g, '\\$1'); }
