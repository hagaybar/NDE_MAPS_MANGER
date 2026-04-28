import i18n from '../i18n.js?v=5';
import { applyRoleBasedUI } from '../auth-guard.js?v=5';
import { loadFloorSvg, indexShelvesById, buildRangeCountByShelf } from './map-editor/svg-loader.js?v=1';
import { attachInteraction, applySelection } from './map-editor/svg-interaction.js?v=1';
import { createShelfState } from './map-editor/shelf-state.js?v=1';
import { computeFloorConflicts } from './map-editor/range-validation.js?v=1';

const DEPLOYMENT_ID = location.host.replace(/[^a-z0-9]+/gi, '-');
const STORAGE_KEY_FLOOR = `mapEditor.activeFloor.${DEPLOYMENT_ID}`;

function loadActiveFloor() {
  const v = localStorage.getItem(STORAGE_KEY_FLOOR);
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : 0;
}

function saveActiveFloor(n) {
  localStorage.setItem(STORAGE_KEY_FLOOR, String(n));
}

const FLOORS = [0, 1, 2];

function renderFloorTabs(active) {
  const root = document.getElementById('map-floor-tabs');
  root.innerHTML = FLOORS.map(n => `
    <button data-floor="${n}"
      class="floor-tab px-3 py-2 text-sm font-medium ${n === active ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}"
      role="tab" aria-selected="${n === active}">
      ${i18n.t('mapEditor.tab.floor').replace('{n}', n)}
    </button>
  `).join('');
  root.querySelectorAll('.floor-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.floor, 10);
      saveActiveFloor(n);
      renderFloorTabs(n);
      // SVG render hook — wired in Task 3.
      window.dispatchEvent(new CustomEvent('mapeditor:floor-changed', { detail: { floor: n } }));
    });
  });
}

let currentFloor = null;
let shelfElements = null;       // Map<svgCode, SVGElement>
let rangeCountByShelf = null;   // Map<svgCode, number>
let allRanges = [];             // populated in Task 5
let shelfState = null;
let floorConflicts = new Map();

async function loadFloor(floorNumber) {
  currentFloor = floorNumber;
  const canvas = document.getElementById('map-canvas');
  const svgRoot = await loadFloorSvg(floorNumber, canvas);
  shelfElements = indexShelvesById(svgRoot);

  const floorRanges = allRanges.filter(r => String(r.floor) === String(floorNumber));
  rangeCountByShelf = buildRangeCountByShelf(floorRanges);
  floorConflicts = computeFloorConflicts(floorRanges);

  // Permitted IDs come from auth-guard; null for admins.
  const permitted = window.__editorPermittedRowIds || null;
  shelfState = shelfState || createShelfState({ ranges: allRanges, permittedRowIds: permitted });

  attachInteraction({
    shelfElements,
    rangeCountByShelf,
    container: canvas,
    isLocked: shelfId => floorRanges.some(r => r.svgCode === shelfId && shelfState.permission(r.id) === 'readonly'),
    isFullyLocked: shelfId => {
      const inThisShelf = floorRanges.filter(r => r.svgCode === shelfId);
      return inThisShelf.length > 0 && inThisShelf.every(r => shelfState.permission(r.id) === 'readonly');
    },
    getShelfLabel: shelfId => {
      const range = floorRanges.find(r => r.svgCode === shelfId);
      return (range && (range.shelfLabel || shelfId)) || shelfId;
    },
    onSelect: shelfId => {
      shelfState.selectSingle(shelfId);
      applySelection(shelfElements, shelfState.selection().shelfIds);
      window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
    },
    onMultiToggle: shelfId => {
      const current = shelfState.selection().shelfIds;
      if (current.includes(shelfId)) shelfState.removeFromSelection(shelfId);
      else shelfState.addToSelection(shelfId);
      applySelection(shelfElements, shelfState.selection().shelfIds);
      window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
    },
  });

  // Render conflict markers.
  for (const [shelfId, el] of shelfElements) {
    const shelfHasConflict = floorRanges.some(r => r.svgCode === shelfId && floorConflicts.has(r.id));
    el.classList.toggle('map-shelf--has-conflicts', shelfHasConflict);
  }
}

window.addEventListener('mapeditor:floor-changed', e => loadFloor(e.detail.floor));

let initialized = false;

export function initMapEditor() {
  if (initialized) return;
  initialized = true;
  const container = document.getElementById('map-editor');
  container.innerHTML = `
    <div class="bg-white rounded-lg shadow p-4">
      <div id="map-floor-tabs" class="flex gap-2 mb-4 border-b border-gray-200" role="tablist"></div>
      <div id="map-canvas" class="relative bg-gray-50 border border-gray-200 rounded min-h-96"></div>
      <p id="map-editor-empty" class="text-gray-500 text-sm mt-3">${i18n.t('mapEditor.empty')}</p>
    </div>
  `;
  // Inject hatch pattern definition once (used by .map-shelf--locked)
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.style.position = 'absolute';
  defs.innerHTML = `<defs><pattern id="map-shelf-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
  <rect width="6" height="6" fill="#cbd5e1"/>
  <rect width="3" height="6" fill="#94a3b8"/>
</pattern></defs>`;
  container.prepend(defs);
  renderFloorTabs(loadActiveFloor());
  applyRoleBasedUI(container);
  (async () => { await loadFloor(loadActiveFloor()); })();
}
