import i18n from '../../i18n.js?v=5';

let active = null;

export function startReassign({ rangeId, rangeLabel, oldShelfLabel, shelfElements, allShelves, onConfirm, onCancel, intent = 'move' }) {
  if (active) cancel();
  active = { rangeId, rangeLabel, oldShelfLabel, allShelves, onConfirm, onCancel, intent };

  // Banner — copy depends on intent
  const bannerKey = intent === 'repair'
    ? 'mapEditor.reassign.banner.repair'
    : 'mapEditor.reassign.banner.move';
  const banner = document.createElement('div');
  banner.className = 'map-reassign-banner';
  banner.id = 'map-reassign-banner';
  banner.innerHTML = `
    <span>📍 ${i18n.t(bannerKey)} <span class="opacity-75">(${rangeLabel})</span> — <a href="#" id="map-reassign-list" class="underline">${i18n.t('mapEditor.reassign.chooseFromList')}</a></span>
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
  const confirmKey = active.intent === 'repair'
    ? 'mapEditor.reassign.confirm.repair'
    : 'mapEditor.reassign.confirm.move';
  const confirmText = i18n.t(confirmKey)
    .replace('{label}', active.rangeLabel)
    .replace('{picked}', target)
    .replace('{old}', active.oldShelfLabel || '')
    .replace('{new}', target);
  const ok = window.confirm(confirmText);
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
  // Tear down the "choose from list" picker overlay too, if it is open — else a
  // cancel (Esc / floor switch) orphans a full-screen overlay over the app (#125).
  active?.pickerOverlay?.remove();
  document.removeEventListener('keydown', onEsc);
  document.querySelectorAll('.map-pulse-target').forEach(el => {
    el.classList.remove('map-pulse-target');
    el.removeEventListener('click', onShelfClicked, { capture: true });
  });
  active = null;
}

function openDropdownPicker() {
  if (!active) return;
  const allShelves = active.allShelves || [];   // pass through startReassign
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:white;border-radius:8px;padding:16px;width:360px;max-height:60vh;display:flex;flex-direction:column">
      <input type="text" id="map-picker-filter" placeholder="Filter shelves…" class="px-2 py-1 border rounded mb-2 text-sm" />
      <div id="map-picker-list" style="overflow-y:auto;flex:1;border:1px solid #e2e8f0;border-radius:4px"></div>
      <div class="flex justify-end mt-2"><button id="map-picker-cancel" class="px-3 py-1 text-sm border rounded">Cancel</button></div>
    </div>
  `;
  document.body.appendChild(overlay);
  active.pickerOverlay = overlay;   // tie the overlay to the reassign lifecycle so cleanup() removes it (#125)
  function renderList(filter) {
    const list = overlay.querySelector('#map-picker-list');
    list.innerHTML = allShelves
      .filter(s => !filter || s.label.toLowerCase().includes(filter.toLowerCase()) || s.svgCode.toLowerCase().includes(filter.toLowerCase()))
      .map(s => `<button data-id="${s.svgCode}" data-floor="${s.floor}" class="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 border-b">${s.label} — ${s.svgCode} (Floor ${s.floor})</button>`)
      .join('');
    list.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        if (!active) { overlay.remove(); return; }   // reassign was cancelled out from under the picker — stay inert, don't crash (#125)
        const confirmKey = active.intent === 'repair'
          ? 'mapEditor.reassign.confirm.repair'
          : 'mapEditor.reassign.confirm.move';
        const confirmText = i18n.t(confirmKey)
          .replace('{label}', active.rangeLabel)
          .replace('{picked}', b.dataset.id)
          .replace('{old}', active.oldShelfLabel || '')
          .replace('{new}', b.dataset.id);
        const ok = window.confirm(confirmText);
        if (!ok) return;
        const { onConfirm } = active;
        overlay.remove();
        cleanup();
        onConfirm({ newSvgCode: b.dataset.id, newFloor: b.dataset.floor });
      };
    });
  }
  overlay.querySelector('#map-picker-filter').addEventListener('input', e => renderList(e.target.value));
  overlay.querySelector('#map-picker-cancel').onclick = () => overlay.remove();
  renderList('');
}

export function isReassignActive() { return active !== null; }
export function cancelReassign() { cancel(); }
