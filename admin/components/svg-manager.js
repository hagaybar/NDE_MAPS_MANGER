// SVG File Manager Component - Upload and Delete SVG Files
import i18n from '../i18n.js?v=5';
import { showToast } from './toast.js?v=5';
import { getAuthHeaders, getCurrentUsername } from '../app.js?v=5';
import { applyRoleBasedUI } from '../auth-guard.js?v=5';
import { renderStagingPanel } from './svg-manager/staging-panel.js?v=5';
import { renderReconcileWizard } from './svg-manager/reconcile-wizard.js?v=5';
import { showStagingProgressModal } from './staging-progress-modal.js?v=5';
import { pollUntilFresh, changedMapFiles } from './map-editor/promote-refresh.js?v=5';

// Fallback translations if i18n hasn't loaded yet
const FALLBACKS = {
  'svg.title': { en: 'Map Files', he: 'קבצי מפות' },
  'svg.upload': { en: 'Upload New Map', he: 'העלה מפה חדשה' },
  'svg.delete': { en: 'Delete', he: 'מחק' },
  'svg.preview': { en: 'Preview', he: 'תצוגה מקדימה' },
  'svg.confirmDelete': { en: 'Are you sure you want to delete this file?', he: 'האם אתה בטוח שברצונך למחוק קובץ זה?' },
  'svg.download': { en: 'Download', he: 'הורד' },
  'svg.replace': { en: 'Replace', he: 'החלף' },
  'svg.confirmReplace': { en: 'Replace {filename} with the new file? The current version will be archived in Version History.', he: 'להחליף את {filename} בקובץ החדש? הגרסה הקודמת תיארכב בהיסטוריית הגרסאות.' },
  'svg.replaceSuccess': { en: 'Replaced {filename}. Previous version archived.', he: 'הקובץ {filename} הוחלף. הגרסה הקודמת נשמרה.' },
  'svg.replaceError': { en: 'Failed to replace file.', he: 'נכשל בהחלפת הקובץ.' },
  'svg.staging.validateFailed':  { en: 'Validation request failed',                he: 'בקשת ולידציה נכשלה' },
  'svg.staging.promoteFailed':   { en: 'Promote failed',                           he: 'קידום נכשל' },
  'svg.staging.promoted':        { en: 'Staging promoted to production',           he: 'הסביבה קודמה לייצור' },
  'svg.staging.uploadFailed':    { en: 'Upload to staging failed',                 he: 'העלאה לסביבת בדיקה נכשלה' },
  'svg.staging.reconcileFailed': { en: 'Reconcile failed',                         he: 'יישוב נכשל' },
  'svg.staging.confirmDiscard':  { en: 'Discard the staged changes?',              he: 'להשליך את השינויים בסביבת הבדיקה?' },
  'svg.staging.discarding':      { en: 'Discarding staging…',                      he: 'מבטל את סביבת הבדיקה…' },
  'svg.staging.discarded':       { en: 'Staging discarded',                        he: 'סביבת הבדיקה בוטלה' },
  'svg.staging.discardFailed':   { en: 'Discard failed',                           he: 'הביטול נכשל' },
  'svg.staging.progress.uploading':    { en: 'Uploading {filename}…',                        he: 'מעלה את {filename}…' },
  'svg.staging.progress.validating':   { en: 'Validating staging…',                          he: 'בודק את סביבת הבדיקה…' },
  'svg.staging.progress.refreshing':   { en: 'Updating staging panel…',                      he: 'מעדכן את לוח סביבת הבדיקה…' },
  'svg.staging.progress.leaveWarning': { en: 'An upload is in progress. Leaving may leave staging in an inconsistent state.', he: 'העלאה מתבצעת. עזיבה כעת עלולה להשאיר את סביבת הבדיקה במצב לא עקבי.' },
  'common.error': { en: 'An error occurred', he: 'אירעה שגיאה' },
  'common.loading': { en: 'Loading...', he: 'טוען...' }
};

function t(key) {
  const value = i18n.t(key);
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale() || 'en';
    return FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  return value;
}

// Constants
const API_ENDPOINT = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod';
const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';
const STAGING_API_BASE = `${API_ENDPOINT}/api/staging`;

// Per-file cache-buster for map asset URLs, bumped after a promote so the
// Replace-tab thumbnails/preview/download refetch the new bytes. An <img> does
// not honor cache:'no-cache', so a fresh ?v= is the only way to refresh it.
//
// Issue #50 (Free-plan path): the bump is no longer done synchronously on the
// promote. The /maps/* CloudFront behavior is on the Free plan and cannot key
// on `v`, so a fresh ?v= on its own would still serve the stale edge object.
// Instead we poll the bare URL until the promote's invalidation propagates
// (ETag changes), THEN bump and re-render. The bare URL keeps serving Primo;
// the ?v= here is only a browser-side bust to force the <img> to refetch.
const mapCacheBusters = {};
function mapAssetUrl(filename) {
  const bust = mapCacheBusters[filename];
  const base = `${CLOUDFRONT_URL}/maps/${encodeURIComponent(filename)}`;
  return bust ? `${base}?v=${bust}` : base;
}

/**
 * Read the current ETag served for a map's bare CloudFront URL. Used as the
 * baseline before a promote so pollUntilFresh can detect when the new bytes
 * have propagated. Returns null on any error (poll then treats the first
 * non-null ETag it sees as "fresh", which is acceptable for the worst case).
 */
async function fetchMapEtag(filename) {
  try {
    const url = `${CLOUDFRONT_URL}/maps/${encodeURIComponent(filename)}`;
    const resp = await fetch(`${url}?_=${Date.now()}`, { cache: 'reload' });
    return resp && resp.headers && resp.headers.get ? resp.headers.get('etag') : null;
  } catch (_) {
    return null;
  }
}
// Feature flag: read from window for ease of A/B testing. Defaults to false.
// Once Task 16 cutover runs, this constant flips to true.
const USE_STAGING_FLOW = window.__USE_STAGING_FLOW__ === true;

// Module variables
let svgFiles = [];

/**
 * Initialize the SVG Manager component
 */
export function initSVGManager() {
  const container = document.getElementById('svg-manager');
  if (!container) {
    console.error('SVG Manager container not found');
    return;
  }

  container.innerHTML = renderManager();
  setupManagerEvents();
  loadFiles();

  // Listen for locale changes to re-render
  document.addEventListener('localeChanged', () => {
    container.innerHTML = renderManager();
    setupManagerEvents();
    renderGrid();
    applyRoleBasedUI();
    if (USE_STAGING_FLOW) {
      refreshStagingPanel().catch(err => console.error('Failed to refresh staging panel:', err));
    }
  });

  // External code can request a staging panel refresh (e.g. after an upload).
  document.addEventListener('staging:refresh', () => {
    if (USE_STAGING_FLOW) {
      refreshStagingPanel().catch(err => console.error('Failed to refresh staging panel:', err));
    }
  });
}

/**
 * Render the manager container HTML
 */
function renderManager() {
  return `
    <div class="card bg-white rounded-lg shadow p-6">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 class="text-xl font-semibold text-gray-800">${escapeHtml(t('svg.title'))}</h2>
        <button
          id="btn-upload-toggle"
          class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
          data-role-required="admin"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          ${escapeHtml(t('svg.upload'))}
        </button>
      </div>

      <!-- Upload Dropzone (hidden by default) -->
      <div id="upload-dropzone" class="hidden mb-6 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <p class="text-gray-600 mb-2">${escapeHtml(i18n.t('svg.dropzoneText') || 'Drop SVG files here or click to select')}</p>
        <p class="text-sm text-gray-400">${escapeHtml(i18n.t('svg.dropzoneHint') || 'Only .svg files are accepted')}</p>
        <input
          type="file"
          id="svg-file-input"
          accept=".svg"
          class="hidden"
        >
      </div>

      <!-- Staging Panel (gated by USE_STAGING_FLOW) -->
      <div id="staging-panel-host" class="mb-4"></div>

      <!-- File Grid -->
      <div id="svg-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="flex items-center justify-center py-12 text-gray-500 col-span-full">
          ${escapeHtml(i18n.t('common.loading'))}
        </div>
      </div>

      <!-- Preview Modal -->
      <div id="svg-preview-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] w-full overflow-hidden">
          <div class="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 id="preview-title" class="text-lg font-semibold text-gray-800"></h3>
            <button id="btn-close-preview" class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div id="preview-content" class="p-8 flex items-center justify-center overflow-auto" style="max-height: calc(90vh - 80px);">
            <!-- Preview image will be inserted here -->
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Load SVG files from the API
 */
async function loadFiles() {
  const gridContainer = document.getElementById('svg-grid');

  try {
    const response = await fetch(`${API_ENDPOINT}/api/svg`, {
      headers: {
        ...getAuthHeaders()
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    svgFiles = data.files || [];
    renderGrid();
    // Re-apply role-based UI visibility for dynamically added delete buttons
    applyRoleBasedUI();
    // Refresh the staging panel after the file grid renders (feature-gated).
    if (USE_STAGING_FLOW) {
      refreshStagingPanel().catch(err => console.error('Failed to refresh staging panel:', err));
    }
  } catch (error) {
    console.error('Failed to load SVG files:', error);
    gridContainer.innerHTML = `
      <div class="flex items-center justify-center py-12 text-red-500 col-span-full">
        ${escapeHtml(i18n.t('common.error'))}: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Fetch staging status and render the staging panel. No-op when the staging
 * flow is disabled or the mount point is absent.
 */
async function refreshStagingPanel() {
  const host = document.getElementById('staging-panel-host');
  if (!host) return;
  const resp = await fetch(`${STAGING_API_BASE}/status`, {
    headers: getAuthHeaders(),
  });
  if (!resp.ok) return;
  const status = await resp.json();
  renderStagingPanel(host, status, {
    currentUser: getCurrentUsername(),
  });
  wireStagingActions();
}

// One-time injection of a minimal keyframe so the discard spinner animates even
// if Tailwind's `animate-spin` utility isn't present (CDN race / test jsdom).
const DISCARD_SPINNER_STYLE_ID = 'discard-spinner-style';
function ensureDiscardSpinnerStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DISCARD_SPINNER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DISCARD_SPINNER_STYLE_ID;
  style.textContent = `
    @keyframes discard-spin { to { transform: rotate(360deg); } }
    [data-discard-spinner] {
      animation: discard-spin 0.7s linear infinite;
      border-radius: 9999px;
      border: 3px solid #bfdbfe;
      border-top-color: #2563eb;
      width: 1.75rem;
      height: 1.75rem;
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Paint a prominent, animated in-progress indicator over the staging panel
 * area the moment Discard is confirmed. Replaces the panel host's contents
 * with a centered spinner + "Discarding staging…" label so the click is
 * unmistakably acknowledged during the multi-second clear → refresh round-trip.
 *
 * Dedicated to the discard flow — intentionally NOT the shared blocking modal
 * (staging-progress-modal.js) used by upload/promote, to keep those flows
 * untouched.
 *
 * @param {HTMLElement} host  The staging-panel-host element.
 */
function showDiscardIndicator(host) {
  if (!host) return;
  ensureDiscardSpinnerStyles();
  host.innerHTML = `
    <div data-discard-indicator role="status" aria-live="polite"
         class="rounded border border-blue-200 bg-blue-50 p-6 flex flex-col items-center justify-center gap-3 text-center">
      <div data-discard-spinner class="animate-spin" aria-hidden="true"></div>
      <div class="text-sm font-medium text-blue-800">${escapeHtmlText(t('svg.staging.discarding'))}</div>
    </div>
  `;
}

function escapeHtmlText(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/**
 * Wire click handlers for the staging panel action buttons. Re-attached on
 * every render because the panel is fully re-rendered each refresh.
 */
function wireStagingActions() {
  const host = document.getElementById('staging-panel-host');
  if (!host) return;
  host.querySelector('[data-action="validate-staging"]')?.addEventListener('click', async () => {
    const resp = await fetch(`${STAGING_API_BASE}/validate`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!resp.ok) {
      showToast(t('svg.staging.validateFailed'));
      return;
    }
    await refreshStagingPanel();
  });

  host.querySelector('[data-action="promote-staging"]')?.addEventListener('click', async () => {
    // Issue #62: promote runs the same multi-fetch chain (promote → refresh
    // status → reload file grid) and was previously silent for 5–15s. Use
    // the same blocking modal as the staged-replace sequence so the user
    // can't dismiss or trigger duplicate actions while it's in flight.
    const sequence = beginStagingSequence('promote');
    sequence.setStep('uploading');
    // Issue #50 (Free-plan path): capture each displayed map's CURRENT
    // (pre-promote) ETag BEFORE the promote POST, while production still serves
    // the OLD bytes. Capturing after the POST risks reading the already-
    // propagated NEW etag on a fast invalidation, so pollUntilFresh would wait
    // for a change that already happened and never re-render the thumbnail
    // (observed 2026-05-25). We don't yet know which files will be promoted, so
    // baseline every map currently in the grid; the poll below uses the relevant ones.
    const baselineEtags = {};
    await Promise.all((svgFiles || []).map(async f => {
      baselineEtags[f.name] = await fetchMapEtag(f.name);
    }));
    try {
      const resp = await fetch(`${STAGING_API_BASE}/promote`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!resp.ok) {
        const err = await resp.json();
        showToast(`${t('svg.staging.promoteFailed')}: ${err.error}`);
        return;
      }
      // Capture promotedVersions BEFORE the panel refresh — its KEYS name the
      // production files that changed, which map-editor uses to decide whether
      // to refresh the current floor (issue #50). Value is a placeholder; the
      // consumer generates its own cache-buster.
      let promotedVersions = {};
      try {
        const body = await resp.json();
        promotedVersions = body?.promotedVersions || {};
      } catch (_) {
        // Tolerate missing/non-JSON body — dispatch still goes out (empty map).
      }
      // Issue #50 (Free-plan path): poll the bare URL until the promote's
      // CloudFront invalidation propagates (served ETag differs from the
      // pre-promote baseline captured above), then bump the buster + re-render
      // the grid so the thumbnail refetches the promoted bytes. The bare
      // thumbnail keeps serving Primo throughout; the ?v= bust is purely a
      // browser-side refetch trigger for the Replace-tab <img>.
      // Only map files have a thumbnail to refetch; excluding non-maps/ files
      // (e.g. data/mapping.csv, staged by a reconcile) avoids polling
      // /maps/mapping.csv, which 403s forever (the CSV lives at /data/).
      const changedMapNames = changedMapFiles(promotedVersions);
      sequence.setStep('validating');
      await refreshStagingPanel();
      sequence.setStep('refreshing');
      await loadFiles();  // existing function that re-fetches the production file grid
      showToast(t('svg.staging.promoted'));
      // Start one poll per changed map. On freshness, bump that file's buster and
      // re-render the grid so its thumbnail refetches the promoted bytes.
      for (const name of changedMapNames) {
        pollUntilFresh({
          url: `${CLOUDFRONT_URL}/maps/${encodeURIComponent(name)}`,
          baselineEtag: baselineEtags[name],
          onFresh: () => {
            mapCacheBusters[name] = Date.now().toString(36);
            renderGrid();
          },
        });
      }
      // Issue #50: tell the Map Editor production SVG bytes changed so it can
      // re-render the affected floor. Dispatched only on a successful promote
      // (the !resp.ok branch returns early above).
      document.dispatchEvent(new CustomEvent('svg-promoted', {
        detail: { promotedVersions, ts: Date.now() },
      }));
    } catch (err) {
      console.error('Failed to promote staging:', err);
      showToast(t('svg.staging.promoteFailed'));
    } finally {
      sequence.end();
    }
  });

  host.querySelector('[data-action="discard-staging"]')?.addEventListener('click', async (e) => {
    if (!window.confirm(t('svg.staging.confirmDiscard'))) return;
    // The instant Discard is confirmed, paint a prominent animated-spinner
    // indicator over the panel's state/actions region so the user clearly sees
    // the click registered — the /clear → refresh round-trip is multi-second
    // and was previously near-silent (only a subtle button-text swap). This is
    // a dedicated, isolated indicator (NOT the shared blocking modal used by
    // upload/promote) to avoid any regression to those flows.
    const btn = e.currentTarget
      || host.querySelector('[data-action="discard-staging"]');
    // Defense in depth: keep the button disabled while in flight even though
    // the overlay sits on top of it.
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    }
    showDiscardIndicator(host);
    try {
      await fetch(`${STAGING_API_BASE}/clear`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: '{}',
      });
      // Success: refreshStagingPanel() re-renders the panel back to its
      // idle/empty state (clearing the indicator), then a completion toast
      // confirms the discard finished.
      await refreshStagingPanel();
      showToast(t('svg.staging.discarded'), 'success');
    } catch (err) {
      console.error('Failed to discard staging:', err);
      // Restore the panel (re-render from current status) so the indicator is
      // cleared and the Discard button comes back, then surface the error.
      await refreshStagingPanel().catch(() => {});
      showToast(t('svg.staging.discardFailed'), 'error');
    }
  });

  host.querySelector('[data-action="open-reconcile-wizard"]')?.addEventListener('click', async () => {
    const statusResp = await fetch(`${STAGING_API_BASE}/status`, { headers: getAuthHeaders() });
    const status = await statusResp.json();
    const validated = status.lastValidated;
    if (!validated || validated.ok) return;
    // For v1, assume reconcile is for a single floor; pick the floor with the most removedRefs
    const byFloor = {};
    const ensure = f => (byFloor[f] = byFloor[f] || { floor: f, removedRefs: [], candidateTargets: [], renames: [] });
    for (const r of validated.summary.removedRefs || []) ensure(r.floor).removedRefs.push(r);
    // candidate rename targets = shelves present in the staged SVG but unmapped (newly-added ∪ orphans)
    for (const a of validated.summary.newlyAddedShelves || []) ensure(a.floor).candidateTargets.push({ svgCode: a.svgCode });
    for (const u of validated.summary.unmappedShelves || []) {
      const f = ensure(u.floor);
      if (!f.candidateTargets.some(c => c.svgCode === u.svgCode)) f.candidateTargets.push({ svgCode: u.svgCode });
    }
    for (const rn of validated.summary.renames || []) ensure(rn.floor).renames.push(rn);
    const firstFloor = Object.values(byFloor)[0];
    renderReconcileWizard(
      document.getElementById('staging-panel-host'),
      firstFloor,
      async (floor, reconcileMap) => {
        const resp = await fetch(`${STAGING_API_BASE}/reconcile`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ floor, reconcileMap }),
        });
        if (!resp.ok) {
          showToast(t('svg.staging.reconcileFailed'));
          return;
        }
        // Re-validate immediately after applying
        await fetch(`${STAGING_API_BASE}/validate`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: '{}',
        });
        await refreshStagingPanel();
      },
      () => refreshStagingPanel()
    );
  });
}

/**
 * Encode a File as a base64 string suitable for JSON transport to the
 * staging-upload Lambda.
 */
async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Render the file grid
 */
function renderGrid() {
  const gridContainer = document.getElementById('svg-grid');

  if (!gridContainer) return;

  if (svgFiles.length === 0) {
    gridContainer.innerHTML = `
      <div class="flex items-center justify-center py-12 text-gray-500 col-span-full">
        ${escapeHtml(i18n.t('svg.noFiles') || 'No SVG files found')}
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = svgFiles.map(file => {
    const filename = file.name;
    const thumbnailUrl = mapAssetUrl(file.name);
    const formattedSize = formatSize(file.size);

    return `
      <div class="svg-card bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow" data-name="${escapeHtml(file.name)}">
        <div class="aspect-square bg-gray-50 p-4 flex items-center justify-center border-b border-gray-200">
          <img
            src="${escapeHtml(thumbnailUrl)}"
            alt="${escapeHtml(filename)}"
            class="max-w-full max-h-full object-contain"
            onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text x=%2212%22 y=%2212%22 text-anchor=%22middle%22>?</text></svg>';"
          >
        </div>
        <div class="p-3">
          <p class="text-sm font-medium text-gray-800 truncate mb-1" title="${escapeHtml(filename)}">
            ${escapeHtml(filename)}
          </p>
          <p class="text-xs text-gray-500 mb-3">
            ${escapeHtml(formattedSize)}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              class="btn-preview flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              data-name="${escapeHtml(file.name)}"
            >
              ${escapeHtml(t('svg.preview'))}
            </button>
            <button
              class="btn-download flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              data-name="${escapeHtml(file.name)}"
            >
              ${escapeHtml(t('svg.download'))}
            </button>
            <button
              class="btn-replace flex-1 px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded hover:bg-amber-200 transition-colors"
              data-filename="${escapeHtml(filename)}"
              data-role-required="admin"
            >
              ${escapeHtml(t('svg.replace'))}
            </button>
            <button
              class="btn-delete flex-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              data-filename="${escapeHtml(filename)}"
              data-role-required="admin"
            >
              ${escapeHtml(t('svg.delete'))}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Set up event listeners for the manager
 */
function setupManagerEvents() {
  const uploadToggleBtn = document.getElementById('btn-upload-toggle');
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('svg-file-input');
  const gridContainer = document.getElementById('svg-grid');
  const previewModal = document.getElementById('svg-preview-modal');
  const closePreviewBtn = document.getElementById('btn-close-preview');

  // Toggle dropzone visibility
  uploadToggleBtn?.addEventListener('click', () => {
    dropzone.classList.toggle('hidden');
  });

  // Dropzone click to trigger file input
  dropzone?.addEventListener('click', (e) => {
    if (e.target !== fileInput) {
      fileInput.click();
    }
  });

  // File input change
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFile(file);
      fileInput.value = ''; // Reset input
    }
  });

  // Drag and drop events
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('border-blue-500', 'bg-blue-50');
  });

  dropzone?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('border-blue-500', 'bg-blue-50');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('border-blue-500', 'bg-blue-50');

    const file = e.dataTransfer.files[0];
    if (file) {
      uploadFile(file);
    }
  });

  // Preview / Download / Replace / Delete button clicks (delegated)
  gridContainer?.addEventListener('click', (e) => {
    const previewBtn = e.target.closest('.btn-preview');
    if (previewBtn) {
      const name = previewBtn.dataset.name;
      showPreview(name);
      return;
    }

    const downloadBtn = e.target.closest('.btn-download');
    if (downloadBtn) {
      const filename = downloadBtn.dataset.name;
      const a = document.createElement('a');
      a.href = mapAssetUrl(filename);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const replaceBtn = e.target.closest('.btn-replace');
    if (replaceBtn && !replaceBtn.disabled) {
      const filename = replaceBtn.dataset.filename;
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = '.svg';
      picker.onchange = async () => {
        const file = picker.files?.[0];
        if (!file) return;
        const msg = t('svg.confirmReplace').replace('{filename}', filename);
        if (!confirm(msg)) return;
        await replaceFile(filename, file);
      };
      picker.click();
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      const filename = deleteBtn.dataset.filename;
      deleteFile(filename);
    }
  });

  // Close preview button
  closePreviewBtn?.addEventListener('click', () => {
    previewModal.classList.add('hidden');
  });

  // Close preview on backdrop click
  previewModal?.addEventListener('click', (e) => {
    if (e.target === previewModal) {
      previewModal.classList.add('hidden');
    }
  });

  // Close preview on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) {
      previewModal.classList.add('hidden');
    }
  });
}

/**
 * Upload an SVG file
 */
async function uploadFile(file) {
  // Validate file type
  if (!file.name.toLowerCase().endsWith('.svg')) {
    showToast(i18n.t('svg.invalidFile') || 'Only SVG files are allowed', 'error');
    return;
  }

  try {
    // Read file content
    const content = await file.text();

    // Upload to API
    const response = await fetch(`${API_ENDPOINT}/api/svg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        filename: file.name,
        content: content,
        username: getCurrentUsername()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      showToast(i18n.t('svg.uploadSuccess') || 'File uploaded successfully', 'success');
      // Hide dropzone after successful upload
      document.getElementById('upload-dropzone')?.classList.add('hidden');
      // Reload file list
      await loadFiles();
    } else {
      throw new Error(result.message || 'Upload failed');
    }
  } catch (error) {
    console.error('Failed to upload SVG:', error);
    showToast(i18n.t('svg.uploadError') || 'Failed to upload file', 'error');
  }
}

/**
 * Selectors for file-grid action buttons that should be locked while a
 * staging sequence is in flight. Keeps the user from triggering concurrent
 * destructive operations (replace/delete) or starting a second upload.
 */
const STAGING_BUSY_SELECTORS = [
  '#svg-grid .btn-replace',
  '#svg-grid .btn-delete',
  '#svg-grid .btn-download',
  '#btn-upload-toggle',
];

/**
 * Begin the staged-replace UI sequence: disables the file-grid action
 * buttons, marks them aria-busy, mounts the blocking progress modal, and
 * attaches a beforeunload guard. Returns a small controller with
 * `setStep(name)` and `end()` so the caller can update progress between
 * network calls and tear down the UI state in a finally block.
 *
 * The beforeunload listener is stored on the controller as a single bound
 * function reference so add/remove pair correctly — attaching one anonymous
 * function and removing a different one would silently leak the listener.
 *
 * The button-disable and beforeunload guard remain even though the modal
 * already blocks every viewport interaction — they're complementary defense
 * in depth: the modal stops user clicks, the disable stops programmatic
 * triggers, and beforeunload catches tab-close attempts (which the modal
 * cannot intercept).
 *
 * Issue #62: the modal is the primary visual; the inline status-text element
 * from #58 has been removed in favor of the modal's own step indicator.
 *
 * @param {string} filename — currently unused (modal copy is generic) but
 *   kept in the signature for future per-file telemetry.
 */
function beginStagingSequence(filename) { // eslint-disable-line no-unused-vars
  const buttons = Array.from(document.querySelectorAll(STAGING_BUSY_SELECTORS.join(',')));
  for (const btn of buttons) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }

  const modal = showStagingProgressModal();

  const beforeUnloadHandler = (event) => {
    const msg = t('svg.staging.progress.leaveWarning');
    event.returnValue = msg;
    return msg;
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  let finished = false;
  return {
    setStep(name) {
      modal.updateStep(name);
    },
    end() {
      if (finished) return;
      finished = true;
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      for (const btn of buttons) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
      modal.close();
    },
  };
}

/**
 * Replace an existing SVG file with a new body, preserving the original filename.
 *
 * Backend (`lambda/uploadSvg.mjs`) writes the prior body to
 * `versions/maps/${basename}_${timestamp}_${username}.svg` before overwriting,
 * so a failed replace leaves the old file untouched.
 *
 * @param {string} targetFilename — the filename to keep on S3 (e.g. 'floor_2.svg')
 * @param {File} file — the user-picked file; its `name` is intentionally ignored
 */
async function replaceFile(targetFilename, file) {
  if (!file.name.toLowerCase().endsWith('.svg')) {
    showToast(i18n.t('svg.invalidFile') || 'Only SVG files are allowed', 'error');
    return;
  }

  // Staged-replace branch: upload to /staging/upload, then trigger validation.
  // Feature-flagged so the existing direct-PUT flow remains the default until
  // Task 16 flips USE_STAGING_FLOW to true.
  if (USE_STAGING_FLOW) {
    // Issue #58: provide per-step UI feedback during the upload → validate →
    // refresh sequence. Without this, librarians sit through 3-15s of silent
    // UI and frequently double-click Replace or close the tab mid-flight.
    const sequence = beginStagingSequence(targetFilename);
    try {
      const base64 = await fileToBase64(file);
      const floor = Number(targetFilename.match(/floor_(\d+)\.svg/)?.[1]);
      sequence.setStep('uploading');
      const resp = await fetch(`${STAGING_API_BASE}/upload`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ floor, svgBase64: base64 }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        showToast(`${t('svg.staging.uploadFailed')}: ${err.error || resp.status}`);
        return;
      }
      // Trigger validation immediately
      sequence.setStep('validating');
      await fetch(`${STAGING_API_BASE}/validate`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: '{}',
      });
      sequence.setStep('refreshing');
      await refreshStagingPanel();
    } catch (err) {
      console.error('Failed to upload SVG to staging:', err);
      showToast(t('svg.staging.uploadFailed'));
    } finally {
      sequence.end();
    }
    return;
  }

  try {
    const content = await file.text();
    const response = await fetch(`${API_ENDPOINT}/api/svg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        filename: targetFilename,
        content,
        username: getCurrentUsername(),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Replace failed');
    }

    showToast(t('svg.replaceSuccess').replace('{filename}', targetFilename), 'success');
    await loadFiles();
  } catch (err) {
    console.error('Failed to replace SVG:', err);
    showToast(t('svg.replaceError') || 'Failed to replace file', 'error');
  }
}

/**
 * Delete an SVG file
 */
async function deleteFile(filename) {
  // Confirm with user
  const confirmMessage = i18n.t('svg.confirmDelete') || `Are you sure you want to delete "${filename}"?`;
  if (!confirm(confirmMessage.replace('{filename}', filename))) {
    return;
  }

  try {
    const response = await fetch(`${API_ENDPOINT}/api/svg`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        filename: filename,
        username: getCurrentUsername()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      showToast(i18n.t('svg.deleteSuccess') || 'File deleted successfully', 'success');
      // Reload file list
      await loadFiles();
    } else {
      throw new Error(result.message || 'Delete failed');
    }
  } catch (error) {
    console.error('Failed to delete SVG:', error);
    showToast(i18n.t('svg.deleteError') || 'Failed to delete file', 'error');
  }
}

/**
 * Show preview of an SVG file
 */
function showPreview(name) {
  const previewModal = document.getElementById('svg-preview-modal');
  const previewTitle = document.getElementById('preview-title');
  const previewContent = document.getElementById('preview-content');

  if (!previewModal || !previewTitle || !previewContent) return;

  const filename = name;
  const imageUrl = mapAssetUrl(name);

  previewTitle.textContent = filename;
  previewContent.innerHTML = `
    <img
      src="${escapeHtml(imageUrl)}"
      alt="${escapeHtml(filename)}"
      class="max-w-full max-h-full object-contain"
      style="max-height: calc(90vh - 120px);"
    >
  `;

  previewModal.classList.remove('hidden');
}

/**
 * Format file size in human-readable format
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// Test-only surface — exposes internal helpers to Jest without leaking them into
// the public module API. Keep this block at the very bottom of the file.
export const __test = {
  replaceFile,
  renderGrid,
  setSvgFiles(files) { svgFiles = files; },
};
