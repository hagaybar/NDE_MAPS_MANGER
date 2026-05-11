/**
 * Orphan Panel — right-side drawer for the Map Editor.
 *
 * Manages mount, open/close, active-card highlight, and per-row
 * removal after a successful repair.
 *
 * Public API:
 *   mount(hostId)
 *   open(orphans, { floor, locale, readOnly, onSetShelf, onEditElsewhere })
 *   close()
 *   setActiveCard(rowId | null)
 *   markRepaired(rowId)
 *
 * @module components/map-editor/orphan-panel
 */

import i18n from '../../i18n.js?v=5';
import { renderOrphanCard } from './orphan-card.js?v=1';

let host = null;
let panel = null;
let listEl = null;
let currentOptions = null;
let currentOrphans = [];
let activeRowId = null;
let escListener = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function renderShell(floor) {
  const title = i18n.t('mapEditor.orphan.panel.title');
  return `
    <div class="map-orphan-panel__header">
      <h3 class="map-orphan-panel__title">${escapeHtml(title)}</h3>
      <button type="button" class="map-orphan-panel__close" data-action="close" aria-label="Close">×</button>
    </div>
    <div class="map-orphan-panel__list" role="list"></div>
    <div class="map-orphan-panel__announce" aria-live="polite"></div>
  `;
}

function renderEmptyState(floor) {
  const empty = i18n.t('mapEditor.orphan.panel.empty').replace('{n}', String(floor));
  return `<div class="map-orphan-panel__empty">${escapeHtml(empty)}</div>`;
}

function renderCards(orphans, options) {
  listEl.innerHTML = '';
  for (const orphan of orphans) {
    const card = renderOrphanCard({
      orphan,
      isActive: orphan.rowId === activeRowId,
      locale: options.locale,
      readOnly: options.readOnly,
      onSetShelf: rowId => {
        if (typeof options.onSetShelf === 'function') options.onSetShelf(rowId);
      },
      onEditElsewhere: rowId => {
        if (typeof options.onEditElsewhere === 'function') options.onEditElsewhere(rowId);
      },
    });
    card.setAttribute('role', 'listitem');
    listEl.appendChild(card);
  }
}

function attachEsc() {
  if (escListener) return;
  escListener = e => {
    if (e.key !== 'Escape') return;
    if (activeRowId !== null) return; // mid-repair — let the reassign mode handle Esc
    close();
  };
  document.addEventListener('keydown', escListener);
}

function detachEsc() {
  if (!escListener) return;
  document.removeEventListener('keydown', escListener);
  escListener = null;
}

export function mount(hostId) {
  host = document.getElementById(hostId);
  if (!host) {
    throw new Error(`orphan-panel.mount: host element #${hostId} not found`);
  }
  panel = document.createElement('aside');
  panel.className = 'map-orphan-panel';
  host.appendChild(panel);
  panel.innerHTML = renderShell(0);
  listEl = panel.querySelector('.map-orphan-panel__list');
  panel.querySelector('[data-action="close"]').addEventListener('click', close);
}

export function open(orphans, options = {}) {
  if (!panel) throw new Error('orphan-panel.open called before mount');
  currentOrphans = orphans.slice();
  currentOptions = options;
  activeRowId = null;
  panel.innerHTML = renderShell(options.floor);
  listEl = panel.querySelector('.map-orphan-panel__list');
  panel.querySelector('[data-action="close"]').addEventListener('click', close);
  if (orphans.length === 0) {
    listEl.innerHTML = '';
    listEl.insertAdjacentHTML('beforebegin', renderEmptyState(options.floor));
  } else {
    renderCards(orphans, options);
  }
  panel.classList.add('map-orphan-panel--open');
  attachEsc();
}

export function close() {
  if (!panel) return;
  panel.classList.remove('map-orphan-panel--open');
  activeRowId = null;
  detachEsc();
}

export function setActiveCard(rowId) {
  activeRowId = rowId;
  if (!listEl) return;
  if (panel) {
    if (rowId !== null && rowId !== undefined) {
      panel.classList.add('map-orphan-panel--reassigning');
    } else {
      panel.classList.remove('map-orphan-panel--reassigning');
    }
  }
  for (const card of listEl.querySelectorAll('.map-orphan-card')) {
    if (card.dataset.rowId === rowId) {
      card.classList.add('map-orphan-card--active');
      if (typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ block: 'nearest' });
      }
    } else {
      card.classList.remove('map-orphan-card--active');
    }
  }
}

export function markRepaired(rowId) {
  if (!listEl) return;
  const card = listEl.querySelector(`.map-orphan-card[data-row-id="${rowId}"]`);
  if (card) card.remove();
  currentOrphans = currentOrphans.filter(o => o.rowId !== rowId);
  if (activeRowId === rowId) {
    // Auto-advance to the next card, if any.
    const next = listEl.querySelector('.map-orphan-card');
    activeRowId = next ? next.dataset.rowId : null;
    if (next) next.classList.add('map-orphan-card--active');
  }
  if (currentOrphans.length === 0) {
    const announce = panel.querySelector('.map-orphan-panel__announce');
    if (announce) announce.textContent = i18n.t('mapEditor.orphan.panel.allRepaired');
    setTimeout(() => close(), 1500);
  }
}
