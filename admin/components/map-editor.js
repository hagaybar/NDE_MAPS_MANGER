import i18n from '../i18n.js?v=5';
import { applyRoleBasedUI, getPermittedRowIds } from '../auth-guard.js?v=5';
import { showToast } from './toast.js?v=5';
import { getAuthHeaders, getCurrentUsername } from '../app.js?v=5';
import { loadFloorSvg, indexShelvesById, buildRangeCountByShelf, buildKnownSvgCodes } from './map-editor/svg-loader.js?v=2';
import { fetchMappingCsvText } from './map-editor/csv-loader.js?v=1';
import { buildMapEditorScaffold } from './map-editor/scaffold.js?v=1';
import { installPromoteRefreshListener, getFloorCacheBust } from './map-editor/promote-refresh.js?v=1';
import { indexShelfLocations } from './map-editor/location-model.js';
import { attachInteraction, applySelection } from './map-editor/svg-interaction.js?v=1';
import { createShelfState } from './map-editor/shelf-state.js?v=1';
import { computeFloorConflicts } from './map-editor/range-validation.js?v=1';
import { mountSidePanel, renderPanel, hidePanel } from './map-editor/side-panel.js?v=1';
import { startReassign, cancelReassign, isReassignActive } from './map-editor/reassign-mode.js?v=1';
import { handleEscape } from './map-editor/esc-handler.js?v=1';
import { deriveOrphansForFloor } from './map-editor/orphan-deriver.js?v=1';
import { mount as mountOrphanPanel, open as openOrphanPanel, close as closeOrphanPanel, setActiveCard as setOrphanActive, markRepaired as markOrphanRepaired } from './map-editor/orphan-panel.js?v=1';
import { fetchAndParseSvg } from '../services/svg-parser.js';

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
  // cache:'no-cache' lives in csv-loader.js so it stays testable (#91).
  const text = await fetchMappingCsvText(CLOUDFRONT_URL);
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
  if (!locationElements || currentFloor == null) return byFloor;
  for (const r of allRanges) {
    if (String(r.floor) !== String(currentFloor)) continue;
    if (!r.svgCode || !locationElements.has(r.svgCode)) {
      byFloor.set(currentFloor, (byFloor.get(currentFloor) || 0) + 1);
    }
  }
  return byFloor;
}

async function refreshOrphanPanel({ openIfClosed = false } = {}) {
  if (currentFloor === null || !allRanges) return;
  // Warm the svg-parser cache for the current floor before deriving.
  // isValidSvgCode (which validateRow → E006 transitively consults) is
  // lenient when the cache is cold — it returns `true` so we don't false-
  // positive during page load. That same leniency makes the orphan deriver
  // see ZERO orphans on the first click after init, until the cache lands
  // a moment later. Awaiting fetchAndParseSvg here pins it down: the panel
  // always opens with the actual list, never with the empty state by
  // accident.
  await fetchAndParseSvg(String(currentFloor));
  const orphans = deriveOrphansForFloor(allRanges, currentFloor);
  const locale = (i18n.getLocale && i18n.getLocale()) || 'en';
  const options = {
    floor: currentFloor,
    locale,
    readOnly: false, // map-editor uses shelfState.permission per row; orphan-card honors readOnly per-card too — refined later if needed
    onSetShelf: handleOrphanSetShelf,
    onEditElsewhere: handleOrphanEditElsewhere,
  };
  if (openIfClosed || isOrphanPanelOpen()) {
    openOrphanPanel(orphans, options);
  }
}

function isOrphanPanelOpen() {
  const el = document.querySelector('.map-orphan-panel');
  return el ? el.classList.contains('map-orphan-panel--open') : false;
}

function handleOrphanSetShelf(rowId) {
  const range = shelfState.materialize().find(r => r.id === rowId);
  if (!range) return;
  setOrphanActive(rowId);
  const allShelves = allRanges
    .filter(r => r.svgCode)
    .reduce((acc, r) => {
      const key = `${r.svgCode}|${r.floor}`;
      if (!acc.has(key)) acc.set(key, { svgCode: r.svgCode, floor: r.floor, label: r.shelfLabel || r.svgCode });
      return acc;
    }, new Map());
  const allShelvesList = Array.from(allShelves.values()).sort((a, b) => a.label.localeCompare(b.label));
  startReassign({
    rangeId: rowId,
    rangeLabel: `${range.collectionName} ${range.rangeStart}-${range.rangeEnd}`,
    oldShelfLabel: range.shelfLabel || range.svgCode || '',
    shelfElements: locationElements,
    allShelves: allShelvesList,
    onConfirm: ({ newSvgCode, newFloor }) => {
      const target = { svgCode: newSvgCode };
      if (newFloor !== undefined) target.floor = newFloor;
      shelfState.move(rowId, target);
      refreshConflicts();
      saveCsv().then(() => {
        markOrphanRepaired(rowId);
      });
    },
    onCancel: () => {
      setOrphanActive(null);
    },
    intent: 'repair',
  });
}

function handleOrphanEditElsewhere(rowId) {
  // 2a soft deep-link: filter CSV editor by floor's empty-svgCode rows.
  // 2b will widen this to use the validator's findings precisely.
  window.location.hash = `#csv-editor?orphans=floor=${currentFloor}`;
  const navCsv = document.getElementById('nav-csv');
  if (navCsv) navCsv.click();
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
    badge.addEventListener('click', async (e) => {
      e.stopPropagation();
      // If clicked on the inactive floor's badge, switch to that floor first.
      if (n !== currentFloor) {
        saveActiveFloor(n);
        renderFloorTabs(n);
        window.dispatchEvent(new CustomEvent('mapeditor:floor-changed', { detail: { floor: n } }));
      }
      // Open the orphan panel for the (now) active floor. Await so the
      // panel always opens with the actual orphan list, never the empty
      // state due to a cold svg-parser cache (see refreshOrphanPanel).
      await refreshOrphanPanel({ openIfClosed: true });
    });
    tab.appendChild(badge);
  }
}

let currentFloor = null;
let locationElements = null;       // Map<svgCode, SVGElement> — every shelf-kind Location on the active floor
let rangeCountByShelf = null;   // Map<svgCode, number>
let allRanges = [];             // populated in Task 5
let shelfState = null;
let floorConflicts = new Map();

async function loadFloor(floorNumber) {
  currentFloor = floorNumber;
  const canvas = document.getElementById('map-canvas');
  const svgRoot = await loadFloorSvg(floorNumber, canvas, getFloorCacheBust(floorNumber));

  // Compute floorRanges BEFORE indexing — production SVGs are Inkscape exports
  // with hundreds of internal `[id]` elements (patterns, defs, clip-paths). We
  // only want to index the svgCodes the CSV references on this floor.
  const floorRanges = allRanges.filter(r => String(r.floor) === String(floorNumber));
  rangeCountByShelf = buildRangeCountByShelf(floorRanges);

  // PR 2: every shelf-kind Location is clickable. Empty shelves get the
  // dashed outline (.map-shelf--empty) toggled below after attachInteraction
  // has wired up its own class state.
  locationElements = indexShelfLocations(svgRoot);
  floorConflicts = computeFloorConflicts(floorRanges);

  // Permitted IDs come from auth-guard: null = admin (unlimited);
  // Set<rangeId> for editors (empty Set when editor has no allowedRanges).
  const permitted = getPermittedRowIds(allRanges);
  shelfState = shelfState || createShelfState({ ranges: allRanges, permittedRowIds: permitted });

  attachInteraction({
    shelfElements: locationElements,
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
      applySelection(locationElements, shelfState.selection().shelfIds);
      window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
    },
  });

  // Render conflict markers + empty-shelf dashed outline.
  for (const [locationId, el] of locationElements) {
    const shelfHasConflict = floorRanges.some(r => r.svgCode === locationId && floorConflicts.has(r.id));
    el.classList.toggle('map-shelf--has-conflicts', shelfHasConflict);
    el.classList.toggle('map-shelf--empty', !rangeCountByShelf.has(locationId));
  }

  // Re-render floor tabs so the orphan badge picks up this floor's count
  // now that locationElements is indexed.
  renderFloorTabs(currentFloor);
  // If the orphan panel is open, refresh its contents for the new floor.
  if (isOrphanPanelOpen()) {
    refreshOrphanPanel({ openIfClosed: false });
  }
}

// Issue #70: the Map Editor must show the whole floor map without scrolling at
// default zoom. The view sits below the page header, nav, and <main> padding,
// so a flat `height: 100vh` (the CSS fallback) overflowed the viewport and
// produced a body scrollbar. Size the view to the space actually left below
// the chrome — innerHeight minus the view's distance from the top minus
// <main>'s bottom padding — so it fits exactly. The map itself then scales to
// the canvas via the `#map-canvas > svg` CSS rule. Reapplies on resize.
function fitMapEditorViewport() {
  const view = document.getElementById('map-editor-view');
  if (!view || !view.offsetParent) return; // not mounted / not visible
  const top = view.getBoundingClientRect().top;
  const main = view.closest('main');
  const bottomGap = main ? (parseFloat(getComputedStyle(main).paddingBottom) || 0) : 0;
  const available = window.innerHeight - top - bottomGap;
  view.style.height = `${Math.max(available, 320)}px`;
}

window.addEventListener('resize', fitMapEditorViewport);
window.addEventListener('mapeditor:floor-changed', e => loadFloor(e.detail.floor));

// Issue #50 redo: a successful staging promote (svg-manager dispatches
// 'svg-promoted') re-runs the FULL loadFloor for the current floor with a fresh
// cache-buster, so the map shows the new bytes and stays interactive without a
// page refresh. No-ops until a floor has been displayed (currentFloor null).
installPromoteRefreshListener({
  getCurrentFloor: () => currentFloor,
  reloadFloor: (floor) => loadFloor(floor),
});

window.addEventListener('mapeditor:selection-changed', () => renderDrawer());

function renderDrawer() {
  // The persistent side panel renders one of four modes, driven by
  // shelfState.mode(). The active "click a target" instruction strip lives over
  // the map (reassign-mode.js); the panel shows the passive reassign summary.
  const mode = shelfState.mode();

  if (mode === 'reassign') {
    const r = shelfState.reassign();
    const range = r ? shelfState.materialize().find(x => x.id === r.rangeId) : null;
    const summary = range
      ? `${(range.collectionName || '').trim()} ${range.rangeStart || ''}-${range.rangeEnd || ''}`.trim()
      : '';
    renderPanel({ mode: 'reassign', reassignSummary: summary, onCancelReassign: () => cancelReassign() });
    return;
  }

  if (mode !== 'shelf') {
    // idle (triage is wired in Task 5.7; the nudge opens the worklist overlay for now)
    const orphanCount = currentFloor === null ? 0 : deriveOrphansForFloor(allRanges, currentFloor).length;
    renderPanel({
      mode: 'idle',
      orphanCount,
      onOpenTriage: () => refreshOrphanPanel({ openIfClosed: true }),
    });
    return;
  }

  {
    const sel = shelfState.selection();
    const locationId = sel.shelfIds[0];
    const merged = shelfState.materialize();
    const mergedFloor = merged.filter(r => String(r.floor) === String(currentFloor));
    const rangesOnShelf = mergedFloor.filter(r => r.svgCode === locationId);
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

    renderPanel({
      mode: 'shelf',
      shelfLabel: rangesOnShelf[0]?.shelfLabel || locationId,
      rangesOnShelf,
      conflictsByRangeId,
      conflictingShelves,
      permission: shelfState.permission.bind(shelfState),
      collectionsList,
      hasPendingEdits: shelfState.pendingEdits().size > 0,
      pendingCount: shelfState.pendingCount(),
      onChange: (id, patch) => { shelfState.edit(id, patch); refreshConflicts(); renderDrawer(); },
      onAdd: () => addNewRangeToShelf(locationId),
      onMove: (id) => beginReassign(id, 'move'),
      onDelete: (id) => { shelfState.delete(id); renderDrawer(); },
      onDiscard: () => { shelfState.revert(); renderDrawer(); refreshConflicts(); },
      onSave: () => saveCsv(),
      onSelectShelf: (targetSvgCode) => {
        if (!targetSvgCode || !locationElements.has(targetSvgCode)) return;
        shelfState.selectSingle(targetSvgCode);
        applySelection(locationElements, shelfState.selection().shelfIds);
        window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
      },
      onClose: () => {
        shelfState.clearSelection();
        applySelection(locationElements, []);
        window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
      },
    });
  }
}

// Move (intent 'move') or orphan-repair (intent 'repair'): drive reassign through
// shelfState so the panel shows the passive "moving …" summary + Cancel, while
// reusing reassign-mode.js's over-map instruction strip + target picking. The
// single ESC owner during reassign is reassign-mode.js (the global esc-handler
// bails while isReassignActive). (#97 Task 5.6, spec §5.4)
function beginReassign(id, intent) {
  const range = shelfState.materialize().find(r => r.id === id);
  if (!range) return;
  const allShelvesList = Array.from(
    allRanges.filter(r => r.svgCode).reduce((acc, r) => {
      const key = `${r.svgCode}|${r.floor}`;
      if (!acc.has(key)) acc.set(key, { svgCode: r.svgCode, floor: r.floor, label: r.shelfLabel || r.svgCode });
      return acc;
    }, new Map()).values()
  ).sort((a, b) => a.label.localeCompare(b.label));

  shelfState.enterReassign({ rangeId: id, intent });
  renderDrawer(); // panel → passive reassign summary + Cancel

  startReassign({
    rangeId: id,
    rangeLabel: `${range.collectionName} ${range.rangeStart}-${range.rangeEnd}`,
    oldShelfLabel: range.shelfLabel || range.svgCode || '',
    shelfElements: new Map([...locationElements].filter(([sid]) => sid !== range.svgCode)),
    allShelves: allShelvesList,
    onConfirm: ({ newSvgCode, newFloor }) => {
      const crossFloor = newFloor !== undefined && String(newFloor) !== String(currentFloor);
      shelfState.confirmReassignTarget(crossFloor ? { svgCode: newSvgCode, floor: String(newFloor) } : { svgCode: newSvgCode });
      refreshConflicts();
      if (crossFloor) {
        completeCrossFloorMove(newSvgCode, String(newFloor), range);
      } else {
        if (locationElements.has(newSvgCode)) {
          applySelection(locationElements, shelfState.selection().shelfIds);
        }
        renderDrawer();
      }
    },
    onCancel: () => { shelfState.cancelReassign(); renderDrawer(); },
    intent,
  });
}

// Cross-floor confirm: the move is already applied and the destination is selected
// in shelfState. Switch to the destination floor, re-apply the selection on the
// freshly-bound elements, and toast — never strand the librarian on the origin floor.
async function completeCrossFloorMove(newSvgCode, newFloor, range) {
  saveActiveFloor(Number(newFloor));
  renderFloorTabs(Number(newFloor));
  await loadFloor(Number(newFloor));
  if (locationElements.has(newSvgCode)) {
    applySelection(locationElements, [newSvgCode]);
  }
  renderDrawer();
  const label = `${(range.collectionName || '').trim()} ${range.rangeStart || ''}-${range.rangeEnd || ''}`.trim();
  showToast(
    i18n.t('mapEditor.reassign.moved')
      .replace('{range}', label)
      .replace('{shelf}', newSvgCode)
      .replace('{n}', String(newFloor)),
    'success'
  );
}

function refreshConflicts() {
  const merged = shelfState.materialize();
  const floorRanges = merged.filter(r => String(r.floor) === String(currentFloor));
  floorConflicts = computeFloorConflicts(floorRanges);
  for (const [id, el] of locationElements) {
    const has = floorRanges.some(r => r.svgCode === id && floorConflicts.has(r.id));
    el.classList.toggle('map-shelf--has-conflicts', has);
  }
}

function addNewRangeToShelf(locationId) {
  const floorRanges = allRanges.filter(r => String(r.floor) === String(currentFloor));
  const rangesOnShelf = floorRanges.filter(r => r.svgCode === locationId);
  const defaultCollection = rangesOnShelf[0]?.collectionName || (allRanges[0]?.collectionName || '');
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  shelfState.add(tempId, {
    svgCode: locationId,
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
    // Refresh orphan panel so newly-resolved rows animate out and any new
    // orphans appear. markOrphanRepaired is called from handleOrphanSetShelf
    // for the specific row that was just repaired; the wholesale refresh
    // covers the case where the save included edits to other rows.
    if (isOrphanPanelOpen()) {
      refreshOrphanPanel({ openIfClosed: false });
    }
    shelfState.commit(merged);  // adopt saved snapshot as the new baseline + clear pending (#86)
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
  // Re-fit on every entry (showView calls this each time the tab is opened) so
  // the view re-measures if the window changed size while it was hidden — the
  // resize listener bails while the view is not visible (issue #70).
  if (initialized) { fitMapEditorViewport(); return; }
  initialized = true;
  const container = document.getElementById('map-editor');
  // Scaffold lives in scaffold.js so the #23 grid-sibling invariant is unit-tested
  // (map-editor-scaffold.test.js). The panel now sits in #map-editor-split beside
  // the canvas instead of as a bottom drawer.
  container.innerHTML = buildMapEditorScaffold();
  mountSidePanel('map-side-panel');
  const orphanHost = document.createElement('div');
  orphanHost.id = 'map-orphan-host';
  container.querySelector('#map-canvas').appendChild(orphanHost);
  mountOrphanPanel('map-orphan-host');

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
  fitMapEditorViewport();

  try {
    const rows = await loadMappingCsv();
    allRanges = rows.map((row, idx) => ({ ...row, id: row.id || `row-${idx}` }));
  } catch (err) {
    console.error('[MapEditor] Failed to load mapping CSV:', err);
    allRanges = [];
  }

  await loadFloor(loadActiveFloor());

  // Global Esc handler: close drawer / clear selection. With pending edits,
  // prompt for confirmation first. Reassign mode handles its own Esc, so we
  // bail early there. Extracted to esc-handler.js for testability.
  document.addEventListener('keydown', (event) => {
    handleEscape({
      event,
      shelfState,
      applySelection,
      shelfElements: locationElements,
      refreshConflicts,
      isReassignActive,
      i18n,
    });
  });
}
