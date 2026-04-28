import i18n from '../../i18n.js?v=5';

let active = null;

export function startReassign({ rangeId, rangeLabel, shelfElements, onConfirm, onCancel }) {
  if (active) cancel();
  active = { rangeId, rangeLabel, onConfirm, onCancel };

  // Banner
  const banner = document.createElement('div');
  banner.className = 'map-reassign-banner';
  banner.id = 'map-reassign-banner';
  banner.innerHTML = `
    <span>📍 ${i18n.t('mapEditor.reassign.banner').replace('{rangeLabel}', rangeLabel).replace('{chooseFromList}', `<a href="#" id="map-reassign-list" class="underline">${i18n.t('mapEditor.reassign.chooseFromList')}</a>`)}</span>
    <button id="map-reassign-cancel" class="px-2 py-1 text-xs border rounded">${i18n.t('mapEditor.reassign.cancel')}</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector('#map-reassign-cancel').onclick = cancel;
  banner.querySelector('#map-reassign-list').onclick = (e) => {
    e.preventDefault();
    openDropdownPicker();
  };

  // Highlight other shelves
  for (const [id, el] of shelfElements) {
    el.classList.add('map-pulse-target');
    el.addEventListener('click', onShelfClicked, { capture: true });
  }
  document.addEventListener('keydown', onEsc);
}

function onShelfClicked(evt) {
  evt.stopPropagation(); evt.preventDefault();
  const target = evt.currentTarget.id;
  const ok = window.confirm(i18n.t('mapEditor.reassign.confirm').replace('{rangeLabel}', active.rangeLabel).replace('{shelfLabel}', target));
  if (ok) {
    const { onConfirm } = active;
    cleanup();
    onConfirm({ newSvgCode: target });
  }
}

function onEsc(e) { if (e.key === 'Escape') cancel(); }

function cancel() {
  if (!active) return;
  const { onCancel } = active;
  cleanup();
  onCancel?.();
}

function cleanup() {
  document.getElementById('map-reassign-banner')?.remove();
  document.removeEventListener('keydown', onEsc);
  document.querySelectorAll('.map-pulse-target').forEach(el => {
    el.classList.remove('map-pulse-target');
    el.removeEventListener('click', onShelfClicked, { capture: true });
  });
  active = null;
}

function openDropdownPicker() { /* Task 14 */ }

export function isReassignActive() { return active !== null; }
export function cancelReassign() { cancel(); }
