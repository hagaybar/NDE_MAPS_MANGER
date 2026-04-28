import i18n from '../i18n.js?v=5';
import { applyRoleBasedUI, getPermittedRowIds } from '../auth-guard.js?v=5';
import { showToast } from './toast.js?v=5';
import { getAuthHeaders, getCurrentUsername } from '../app.js?v=5';
import { loadFloorSvg, indexShelvesById, buildRangeCountByShelf, buildKnownSvgCodes } from './map-editor/svg-loader.js?v=2';
import { attachInteraction, applySelection, attachMarquee } from './map-editor/svg-interaction.js?v=1';
import { createShelfState } from './map-editor/shelf-state.js?v=1';
import { computeFloorConflicts } from './map-editor/range-validation.js?v=1';
import { mountDrawer, showSingleShelf, showMultiShelf, hideDrawer } from './map-editor/shelf-drawer.js?v=1';
import { startReassign, cancelReassign, isReassignActive } from './map-editor/reassign-mode.js?v=1';

const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';
const API_ENDPOINT = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod';
const DEPLOYMENT_ID = location.host.replace(/[^a-z0-9]+/gi, '-');
const STORAGE_KEY_FLOOR = `mapEditor.activeFloor.${DEPLOYMENT_ID}`;

/**
 * Fetch + parse the mapping CSV.
 * Mirrors the CSV-load pattern used by csv-editor.js / location-editor.js
 * (no shared service module exists yet — see deviations note for Task 7).
 */
async function loadMappingCsv() {
  const response = await fetch(`${CLOUDFRONT_URL}/data/mapping.csv`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const text = await response.text();
  return parseCsv(text);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }
  return data;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

function loadActiveFloor() {
  const v = localStorage.getItem(STORAGE_KEY_FLOOR);
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : 0;
}

function saveActiveFloor(n) {
  localStorage.setItem(STORAGE_KEY_FLOOR, String(n));
}

const FLOORS = [0, 1, 2];

/**
 * Compute orphan-range counts per floor.
 *
 * Returns Map<floor, count>. An orphan is a row whose svgCode does not match
 * any element on its floor's loaded SVG. We only have shelf elements indexed
 * for the active floor (cheaper than loading every SVG up-front), so we only
 * compute the count for `currentFloor` here. Counts for inactive floors are
 * derived lazily on tab change — every time `loadFloor()` runs, the next
 * `renderFloorTabs()` call will pick up that floor's count.
 */
function computeOrphanCounts() {
  const byFloor = new Map();
  if (!shelfElements || currentFloor == null) return byFloor;
  for (const r of allRanges) {
    if (String(r.floor) !== String(currentFloor)) continue;
    if (!r.svgCode || !shelfElements.has(r.svgCode)) {
      byFloor.set(currentFloor, (byFloor.get(currentFloor) || 0) + 1);
    }
  }
  return byFloor;
}

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
      if (isReassignActive()) cancelReassign();
      saveActiveFloor(n);
      renderFloorTabs(n);
      // SVG render hook — wired in Task 3.
      window.dispatchEvent(new CustomEvent('mapeditor:floor-changed', { detail: { floor: n } }));
    });
  });

  // Orphan badges — only floors with a known count get one (currently the active floor).
  const counts = computeOrphanCounts();
  for (const n of FLOORS) {
    const count = counts.get(n);
    if (!count) continue;
    const tab = root.querySelector(`[data-floor="${n}"]`);
    if (!tab) continue;
    const badge = document.createElement('span');
    badge.className = 'map-orphan-badge inline-block ml-1 px-1.5 py-0.5 text-xs bg-yellow-200 text-yellow-800 rounded cursor-pointer';
    badge.textContent = i18n.t('mapEditor.tab.orphans').replace('{n}', count);
    badge.title = 'View unassigned ranges in CSV Editor';
    badge.dataset.floor = String(n);
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.hash = `#csv-editor?orphans=floor=${n}`;
      // Also switch views — the deep-link is meant to navigate, not just bookmark.
      const navCsv = document.getElementById('nav-csv');
      if (navCsv) navCsv.click();
    });
    tab.appendChild(badge);
  }
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

  // Compute floorRanges BEFORE indexing — production SVGs are Inkscape exports
  // with hundreds of internal `[id]` elements (patterns, defs, clip-paths). We
  // only want to index the svgCodes the CSV references on this floor.
  const floorRanges = allRanges.filter(r => String(r.floor) === String(floorNumber));
  const knownSvgCodes = buildKnownSvgCodes(floorRanges);
  shelfElements = indexShelvesById(svgRoot, knownSvgCodes);

  rangeCountByShelf = buildRangeCountByShelf(floorRanges);
  floorConflicts = computeFloorConflicts(floorRanges);

  // Permitted IDs come from auth-guard: null = admin (unlimited);
  // Set<rangeId> for editors (empty Set when editor has no allowedRanges).
  const permitted = getPermittedRowIds(allRanges);
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

  // Re-render floor tabs so the orphan badge picks up this floor's count
  // now that shelfElements is indexed.
  renderFloorTabs(currentFloor);
}

window.addEventListener('mapeditor:floor-changed', e => loadFloor(e.detail.floor));

window.addEventListener('mapeditor:selection-changed', () => renderDrawer());

function renderDrawer() {
  const sel = shelfState.selection();
  if (sel.kind === 'none') { hideDrawer(); return; }
  if (sel.kind === 'single') {
    const shelfId = sel.shelfIds[0];
    const merged = shelfState.materialize();
    const mergedFloor = merged.filter(r => String(r.floor) === String(currentFloor));
    const rangesOnShelf = mergedFloor.filter(r => r.svgCode === shelfId);
    const conflictsByRangeId = floorConflicts;
    const collectionsList = Array.from(new Set(allRanges.map(r => r.collectionName).filter(Boolean))).sort();

    // Aggregate the OTHER shelves involved in this shelf's conflicts.
    const shelfLabelByCode = new Map();
    for (const r of allRanges) {
      if (r.svgCode && r.shelfLabel && !shelfLabelByCode.has(r.svgCode)) {
        shelfLabelByCode.set(r.svgCode, r.shelfLabel);
      }
    }
    const otherShelfMap = new Map();
    for (const r of rangesOnShelf) {
      const cs = conflictsByRangeId.get(r.id) || [];
      for (const c of cs) {
        if (!c.otherShelf) continue;
        if (!otherShelfMap.has(c.otherShelf)) {
          otherShelfMap.set(c.otherShelf, { svgCode: c.otherShelf, label: shelfLabelByCode.get(c.otherShelf) || c.otherShelf, rangeLabels: [] });
        }
        otherShelfMap.get(c.otherShelf).rangeLabels.push(c.otherRangeLabel);
      }
    }
    const conflictingShelves = Array.from(otherShelfMap.values()).sort((a, b) => a.label.localeCompare(b.label));

    showSingleShelf({
      shelfId,
      shelfLabel: rangesOnShelf[0]?.shelfLabel || shelfId,
      rangesOnShelf,
      conflictsByRangeId,
      conflictingShelves,
      permission: shelfState.permission.bind(shelfState),
      collectionsList,
      onChange: (id, patch) => { shelfState.edit(id, patch); refreshConflicts(); renderDrawer(); },
      onAdd: () => addNewRangeToShelf(shelfId),
      onMove: (id) => {
        const range = shelfState.materialize().find(r => r.id === id);
        if (!range) return;
        const allShelves = allRanges
          .filter(r => r.svgCode)
          .reduce((acc, r) => {
            const key = `${r.svgCode}|${r.floor}`;
            if (!acc.has(key)) acc.set(key, { svgCode: r.svgCode, floor: r.floor, label: r.shelfLabel || r.svgCode });
            return acc;
          }, new Map());
        const allShelvesList = Array.from(allShelves.values()).sort((a, b) => a.label.localeCompare(b.label));
        startReassign({
          rangeId: id,
          rangeLabel: `${range.collectionName} ${range.rangeStart}-${range.rangeEnd}`,
          shelfElements: new Map([...shelfElements].filter(([sid]) => sid !== range.svgCode)),
          allShelves: allShelvesList,
          onConfirm: ({ newSvgCode, newFloor }) => {
            const target = { svgCode: newSvgCode };
            if (newFloor !== undefined) target.floor = newFloor;
            shelfState.move(id, target);
            refreshConflicts();
            renderDrawer();
          },
          onCancel: () => { /* nothing — banner already removed */ },
        });
      },
      onDelete: (id) => { shelfState.delete(id); renderDrawer(); },
      onDiscard: () => { shelfState.revert(); renderDrawer(); refreshConflicts(); },
      onSave: () => saveCsv(),
      onSelectShelf: (targetSvgCode) => {
        if (!targetSvgCode || !shelfElements.has(targetSvgCode)) return;
        shelfState.selectSingle(targetSvgCode);
        applySelection(shelfElements, shelfState.selection().shelfIds);
        window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
      },
      hasPendingEdits: shelfState.pendingEdits().size > 0,
    });
  }
  if (sel.kind === 'multi') {
    const merged = shelfState.materialize();
    const shelvesData = sel.shelfIds.map(id => {
      const onShelf = merged.find(r => r.svgCode === id) || {};
      return { svgCode: id, notes: onShelf.notes, notesHe: onShelf.notesHe,
               shelfLabel: onShelf.shelfLabel, shelfLabelHe: onShelf.shelfLabelHe,
               description: onShelf.description, descriptionHe: onShelf.descriptionHe };
    });
    showMultiShelf({
      shelfIds: sel.shelfIds,
      shelvesData,
      onFieldChange: (field, op) => {
        if (op.mode === 'noop') return;
        const nextValue = op.mode === 'clear' ? '' : op.replaceWith;
        for (const id of sel.shelfIds) {
          // Find every range on this shelf and patch the field on each (denormalized in CSV).
          merged.filter(r => r.svgCode === id).forEach(r => {
            shelfState.edit(r.id, { [field]: nextValue });
          });
        }
        renderDrawer();
      },
      onDiscard: () => { shelfState.revert(); renderDrawer(); refreshConflicts(); },
      onSave: () => saveCsv(),
      hasPendingEdits: shelfState.pendingEdits().size > 0,
    });
  }
}

function refreshConflicts() {
  const merged = shelfState.materialize();
  const floorRanges = merged.filter(r => String(r.floor) === String(currentFloor));
  floorConflicts = computeFloorConflicts(floorRanges);
  for (const [id, el] of shelfElements) {
    const has = floorRanges.some(r => r.svgCode === id && floorConflicts.has(r.id));
    el.classList.toggle('map-shelf--has-conflicts', has);
  }
}

function addNewRangeToShelf(shelfId) {
  const floorRanges = allRanges.filter(r => String(r.floor) === String(currentFloor));
  const rangesOnShelf = floorRanges.filter(r => r.svgCode === shelfId);
  const defaultCollection = rangesOnShelf[0]?.collectionName || (allRanges[0]?.collectionName || '');
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  shelfState.add(tempId, {
    svgCode: shelfId,
    floor: String(currentFloor),
    libraryName: rangesOnShelf[0]?.libraryName || allRanges[0]?.libraryName || '',
    collectionName: defaultCollection,
    rangeStart: '',
    rangeEnd: '',
  });
  // Local view: include the new row by re-deriving from materialize() in renderDrawer().
  renderDrawer();
}

/**
 * Serialize an array of row objects to CSV text.
 * Mirrors the toCSV / escapeCSVField helpers in csv-editor.js
 * (no shared service module exists yet — see deviations note for Task 7).
 * Drops the in-memory `id` column we tag onto rows in initMapEditor().
 */
function toCSV(data) {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]).filter(h => h !== 'id');
  const lines = [headers.map(escapeCSVField).join(',')];
  for (const row of data) {
    lines.push(headers.map(h => escapeCSVField(row[h] != null ? row[h] : '')).join(','));
  }
  return lines.join('\n');
}

function escapeCSVField(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function saveCsv() {
  try {
    const merged = shelfState.materialize();
    const csvContent = toCSV(merged);

    const response = await fetch(`${API_ENDPOINT}/api/csv`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        csvContent,
        username: getCurrentUsername()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Save failed');
    }

    // Refresh local state from the new snapshot.
    allRanges = merged;
    shelfState.revert();        // clears pendingEdits
    refreshConflicts();
    renderDrawer();             // drawer stays open with fresh values
    showToast(i18n.t('csv.saveSuccess'), 'success');
  } catch (err) {
    console.error('[MapEditor] Failed to save CSV:', err);
    showToast(i18n.t('csv.saveError'), 'error');
    // pendingEdits preserved for retry — do nothing else.
  }
}

let initialized = false;

export async function initMapEditor() {
  if (initialized) return;
  initialized = true;
  const container = document.getElementById('map-editor');
  container.innerHTML = `
    <div class="bg-white rounded-lg shadow p-4">
      <div id="map-floor-tabs" class="flex gap-2 mb-4 border-b border-gray-200" role="tablist"></div>
      <div id="map-canvas" class="relative bg-gray-50 border border-gray-200 rounded min-h-96"></div>
      <p id="map-editor-empty" class="text-gray-500 text-sm mt-3">${i18n.t('mapEditor.empty')}</p>
    </div>
    <div id="map-drawer" class="map-drawer map-drawer--hidden"></div>
  `;
  mountDrawer('map-drawer');

  const canvas = document.getElementById('map-canvas');
  attachMarquee({
    container: canvas,
    getShelfElements: () => shelfElements,        // closure read; updated by loadFloor
    onMarqueeComplete: (ids) => {
      if (ids.length === 0) return;
      shelfState.selectMulti(ids);
      applySelection(shelfElements, shelfState.selection().shelfIds);
      window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
    },
  });
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

  try {
    const rows = await loadMappingCsv();
    allRanges = rows.map((row, idx) => ({ ...row, id: row.id || `row-${idx}` }));
  } catch (err) {
    console.error('[MapEditor] Failed to load mapping CSV:', err);
    allRanges = [];
  }

  await loadFloor(loadActiveFloor());
}
