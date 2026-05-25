/**
 * Staging panel UI for the SVG Manager.
 *
 * Pure renderer: given a staging status object, paints a panel into the host
 * element. Emits user actions as DOM events with type "staging:*" so the
 * parent SVG Manager wires them to the appropriate Lambda call.
 *
 * @param {HTMLElement} host
 * @param {Object} status  Result of getStagingStatus Lambda.
 * @param {Object} [opts]  Optional. { currentUser } — used to detect "lock held by someone else."
 */
import i18n from '../../i18n.js?v=5';

// Same fallback-map idiom as svg-manager.js / staging-progress-modal.js — keeps
// labels readable when i18n hasn't loaded the bundle yet (cold-cache race) and
// lets unit tests assert copy without bootstrapping the async i18n fetch.
const FALLBACKS = {
  'svg.staging.validate.passed':          { en: '✓ Validation passed — ready to promote.', he: '✓ הבדיקה עברה — מוכן לקידום לייצור.' },
  'svg.staging.validate.newlyAdded':      { en: '{count} newly added shelf(s)', he: '{count} מדפים חדשים שנוספו' },
  'svg.staging.validate.newlyAddedHint':  { en: "On the uploaded map but not yet linked to library data — patrons won't find these in search until each map-code is mapped to a CSV row.", he: 'מופיעות במפה שהועלתה אך עדיין אינן מקושרות לנתוני ספרייה — משתמשים לא ימצאו אותן בחיפוש עד שכל קוד-מפה ימופה לשורת CSV.' },
  'svg.staging.validate.removed':         { en: '{count} shelf(s) removed from the map', he: '{count} מדפים הוסרו מהמפה' },
  'svg.staging.validate.unlinked':        { en: '{count} library entries will be unlinked', he: '{count} רשומות ספרייה ינותקו' },
  'svg.staging.validate.preExisting':     { en: '{count} pre-existing unmapped shelf(s) (unchanged by this upload)', he: '{count} מדפים לא ממופים מקודם (לא הושפעו מהעלאה זו)' },
  'svg.staging.validate.preExistingHint': { en: "On the map but missing library data (unchanged by this upload) — patrons can't find these in search until each map-code is mapped to a CSV row.", he: 'מופיעות במפה אך חסרות נתוני ספרייה (לא הושפעו מהעלאה זו) — משתמשים לא ימצאו אותן בחיפוש עד שכל קוד-מפה ימופה לשורת CSV.' },
  'svg.staging.validate.shelfFloor':      { en: 'Floor {floor}:', he: 'קומה {floor}:' },
};

function t(key) {
  const value = i18n.t(key);
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale?.() || 'en';
    return FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  return value;
}

export function renderStagingPanel(host, status, opts = {}) {
  host.innerHTML = '';

  if (!status.locked) {
    host.innerHTML = `
      <div class="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No staging area is currently active. Upload a new SVG to start a staged replace.
      </div>
    `;
    return;
  }

  const currentUser = opts.currentUser;
  const isOwner = !currentUser || status.owner === currentUser;
  if (!isOwner) {
    host.innerHTML = `
      <div class="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Staging is in use by <strong>${escapeHtml(status.owner)}</strong>.
        Wait for them to finish or contact them to discard.
      </div>
    `;
    return;
  }

  const validated = status.lastValidated;
  const files = (status.files || []).map(f => `<li class="font-mono text-xs">${escapeHtml(f)}</li>`).join('');

  let stateBlock = '';
  let actions = '';
  if (!validated) {
    stateBlock = `<div class="text-sm text-blue-700">⏳ Awaiting validation. Click <em>Validate</em> to check consistency.</div>`;
    actions = `
      <button data-action="validate-staging" class="px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200">Validate</button>
      <button data-action="discard-staging" class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Discard</button>
    `;
  } else if (validated.ok) {
    const summary = validated.summary || {};
    const newlyAdded = summary.newlyAddedShelves || [];
    const removed = summary.removedShelves || [];
    const removedRefs = summary.removedRefs || [];
    const unmapped = summary.unmappedShelves || [];

    // Pre-existing unmapped = staged-unmapped shelves that are NOT newly added
    // by this upload (matched by svgCode + floor). These are long-standing
    // orphans, surfaced separately so they aren't read as "new this upload."
    const newlyAddedKeys = new Set(newlyAdded.map(s => `${s.floor}::${s.svgCode}`));
    const preExisting = unmapped.filter(s => !newlyAddedKeys.has(`${s.floor}::${s.svgCode}`));

    const idList = (shelves) =>
      shelves.length
        ? `<ul class="list-disc pl-6 text-xs text-gray-600 mt-0.5">${shelves
            .map(s => {
              const floorLabel = escapeHtml(t('svg.staging.validate.shelfFloor').replace('{floor}', s.floor));
              return `<li>${floorLabel} <span class="font-mono">${escapeHtml(s.svgCode)}</span></li>`;
            })
            .join('')}</ul>`
        : '';

    const newlyAddedHint = newlyAdded.length
      ? `<div class="text-xs text-amber-700 mt-0.5">${escapeHtml(t('svg.staging.validate.newlyAddedHint'))}</div>`
      : '';

    const preExistingHint = preExisting.length
      ? `<div class="text-xs text-amber-700 mt-0.5">${escapeHtml(t('svg.staging.validate.preExistingHint'))}</div>`
      : '';

    stateBlock = `
      <div class="text-sm text-green-700">${escapeHtml(t('svg.staging.validate.passed'))}</div>
      <div class="text-xs text-gray-700 mt-2">${escapeHtml(t('svg.staging.validate.newlyAdded').replace('{count}', newlyAdded.length))}</div>
      ${idList(newlyAdded)}
      ${newlyAddedHint}
      <div class="text-xs text-gray-700 mt-2">${escapeHtml(t('svg.staging.validate.removed').replace('{count}', removed.length))}</div>
      ${idList(removed)}
      <div class="text-xs text-gray-700 mt-2">${escapeHtml(t('svg.staging.validate.unlinked').replace('{count}', removedRefs.length))}</div>
      <div class="text-xs text-gray-700 mt-2">${escapeHtml(t('svg.staging.validate.preExisting').replace('{count}', preExisting.length))}</div>
      ${preExistingHint}
      ${idList(preExisting)}
    `;
    actions = `
      <button data-action="promote-staging" class="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">Promote to production</button>
      <button data-action="discard-staging" class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Discard</button>
    `;
  } else {
    const removedRefs = validated.summary?.removedRefs || [];
    const removedSummary = removedRefs.map(r => `<li>${escapeHtml(r.svgCode)} (${r.affectedRowCount} row${r.affectedRowCount === 1 ? '' : 's'})</li>`).join('');
    stateBlock = `
      <div class="text-sm text-red-700">✗ Validation failed — ${validated.errors.length} issue${validated.errors.length === 1 ? '' : 's'}.</div>
      <ul class="list-disc pl-6 text-xs text-gray-700 mt-1">${removedSummary}</ul>
    `;
    actions = `
      <button data-action="open-reconcile-wizard" class="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600">Start reconcile wizard</button>
      <button data-action="discard-staging" class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Discard</button>
    `;
  }

  host.innerHTML = `
    <div class="rounded border border-blue-200 bg-blue-50 p-4">
      <div class="text-sm font-semibold mb-2">Staging area (owner: ${escapeHtml(status.owner)})</div>
      <ul class="list-disc pl-6 mb-2">${files}</ul>
      ${stateBlock}
      <div class="mt-3 flex gap-2">${actions}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
