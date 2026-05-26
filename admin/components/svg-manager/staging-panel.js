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
  'svg.staging.validate.passed':          { en: 'The map you sent looks fine — it passed my checks and matches your shelf information. Want to start using it?', he: 'המפה ששלחתם נראית תקינה — היא עברה את הבדיקות שלי ותואמת את נתוני המדפים שלכם. רוצים להתחיל להשתמש בה?' },
  'svg.staging.validate.renamed':         { en: '{count} shelf(s) were renamed — same physical shelf, new label:', he: '{count} מדפים שונו בשמם — אותו מדף פיזי, תווית חדשה:' },
  'svg.staging.validate.renamedNote':     { en: '(same shelf)', he: '(אותו מדף)' },
  'svg.staging.validate.renamedHint':     { en: 'Same spot on the map — no patron-facing links break.', he: 'אותו מקום במפה — אף קישור הפונה למשתמשים אינו נשבר.' },
  'svg.staging.validate.newlyAdded':      { en: "This map has {count} new shelf(s) I don't have library info for yet — patrons won't find them in search until you add them:", he: 'במפה הזו יש {count} מדפים חדשים שעדיין אין לי עבורם נתוני ספרייה — משתמשים לא ימצאו אותם בחיפוש עד שתוסיפו אותם:' },
  'svg.staging.validate.newlyAddedHint':  { en: 'Each one needs a library entry (a CSV row) before patrons can find it in search.', he: 'לכל אחד מהם דרושה רשומת ספרייה (שורת CSV) כדי שמשתמשים ימצאו אותו בחיפוש.' },
  'svg.staging.validate.removed':         { en: "{count} shelf(s) from the old map aren't on this one anymore:", he: '{count} מדפים שהיו במפה הישנה אינם מופיעים יותר במפה הזו:' },
  'svg.staging.validate.unlinked':        { en: "Heads up: {count} library entr(y/ies) point to shelves that aren't on this map anymore — they'll stop showing up in search until you re-link them:", he: 'לתשומת לבכם: {count} רשומות ספרייה מצביעות על מדפים שכבר אינם במפה — הן יפסיקו להופיע בחיפוש עד שתקשרו אותן מחדש:' },
  'svg.staging.validate.preExisting':     { en: "{count} shelf(s) on the map still have no library info (already like this) — patrons can't find them until you add them:", he: '{count} מדפים במפה עדיין ללא נתוני ספרייה (כבר היו במצב הזה) — משתמשים לא ימצאו אותם עד שתוסיפו אותם:' },
  'svg.staging.validate.preExistingHint': { en: 'These were already unmapped before this upload.', he: 'מדפים אלה כבר היו ללא מיפוי עוד לפני העלאה זו.' },
  'svg.staging.validate.failed':          { en: "I checked the map and found {count} thing(s) that don't match your shelf data yet. Let's fix them together.", he: 'בדקתי את המפה ומצאתי {count} דברים שעדיין אינם תואמים את נתוני המדפים שלכם. בואו נתקן אותם יחד.' },
  'svg.staging.validate.failedItem':      { en: 'Floor {floor}: {code} — {rows} affected', he: 'קומה {floor}: {code} — {rows} רשומות מושפעות' },
  'svg.staging.validate.shelfFloor':      { en: 'Floor {floor}:', he: 'קומה {floor}:' },
  'svg.staging.awaiting':                 { en: 'I haven\'t checked this map yet. Press "Check the map" when you\'re ready.', he: 'עדיין לא בדקתי את המפה הזו. לחצו על "בדוק את המפה" כשאתם מוכנים.' },
  'svg.staging.noStaging':                { en: 'No map is waiting for review. Upload a new map to start.', he: 'אין מפה הממתינה לבדיקה. העלו מפה חדשה כדי להתחיל.' },
  'svg.staging.lockedByOther':            { en: '{owner} is working on a map right now — wait for them to finish or ask them to discard it.', he: '{owner} עובד/ת כעת על מפה — המתינו לסיום או בקשו לבטל אותה.' },
  'svg.staging.header':                   { en: 'Map waiting for review (uploaded by {owner})', he: 'מפה ממתינה לבדיקה (הועלתה על־ידי {owner})' },
  'svg.staging.actions.validate':         { en: 'Check the map', he: 'בדוק את המפה' },
  'svg.staging.actions.promote':          { en: 'Start using this map', he: 'התחילו להשתמש במפה' },
  'svg.staging.actions.reconcile':        { en: 'Fix the mismatches', he: 'תקנו את אי־ההתאמות' },
  'svg.staging.actions.discard':          { en: 'Discard', he: 'בטל' },
};

function t(key, vars) {
  let value = i18n.t(key);
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale?.() || 'en';
    value = FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) value = value.split(`{${k}}`).join(String(v));
  }
  return value;
}

export function renderStagingPanel(host, status, opts = {}) {
  host.innerHTML = '';

  if (!status.locked) {
    host.innerHTML = `
      <div class="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        ${escapeHtml(t('svg.staging.noStaging'))}
      </div>
    `;
    return;
  }

  const currentUser = opts.currentUser;
  const isOwner = !currentUser || status.owner === currentUser;
  if (!isOwner) {
    host.innerHTML = `
      <div class="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        ${escapeHtml(t('svg.staging.lockedByOther', { owner: status.owner }))}
      </div>
    `;
    return;
  }

  const validated = status.lastValidated;
  const files = (status.files || []).map(f => `<li class="font-mono text-xs">${escapeHtml(f)}</li>`).join('');

  const btn = (action, key, cls) =>
    `<button data-action="${action}" class="${cls}">${escapeHtml(t(key))}</button>`;
  const discardBtn = btn('discard-staging', 'svg.staging.actions.discard', 'px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200');

  let stateBlock = '';
  let actions = '';

  if (!validated) {
    stateBlock = `<div class="text-sm text-blue-700">${escapeHtml(t('svg.staging.awaiting'))}</div>`;
    actions = `
      ${btn('validate-staging', 'svg.staging.actions.validate', 'px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200')}
      ${discardBtn}
    `;
  } else if (validated.ok) {
    const summary = validated.summary || {};
    const renames = summary.renames || [];
    const newlyAdded = summary.newlyAddedShelves || [];
    const removed = summary.removedShelves || [];
    const removedRefs = summary.removedRefs || [];
    const unmapped = summary.unmappedShelves || [];

    // Pre-existing unmapped = staged-unmapped shelves NOT newly added this upload.
    const newlyAddedKeys = new Set(newlyAdded.map(s => `${s.floor}::${s.svgCode}`));
    const preExisting = unmapped.filter(s => !newlyAddedKeys.has(`${s.floor}::${s.svgCode}`));

    const idList = (shelves) =>
      shelves.length
        ? `<ul class="list-disc pl-6 text-xs text-gray-600 mt-0.5">${shelves
            .map(s => `<li>${escapeHtml(t('svg.staging.validate.shelfFloor', { floor: s.floor }))} <span class="font-mono">${escapeHtml(s.svgCode)}</span></li>`)
            .join('')}</ul>`
        : '';

    // Render a section only when it has items (#73: hide zero-count noise).
    const section = (count, key, listHtml, hintKey, hintCls) =>
      count
        ? `<div class="text-xs text-gray-700 mt-2">${escapeHtml(t(key, { count }))}</div>
           ${listHtml}
           ${hintKey ? `<div class="text-xs ${hintCls || 'text-amber-700'} mt-0.5">${escapeHtml(t(hintKey))}</div>` : ''}`
        : '';

    const renameList = renames.length
      ? `<ul class="list-disc pl-6 text-xs text-gray-600 mt-0.5">${renames
          .map(r => `<li>${escapeHtml(t('svg.staging.validate.shelfFloor', { floor: r.floor }))} <span class="font-mono">${escapeHtml(r.fromCode)} → ${escapeHtml(r.toCode)}</span> <span class="text-green-700">${escapeHtml(t('svg.staging.validate.renamedNote'))}</span></li>`)
          .join('')}</ul>`
      : '';

    stateBlock = `
      <div class="text-sm text-green-700">${escapeHtml(t('svg.staging.validate.passed'))}</div>
      ${section(renames.length, 'svg.staging.validate.renamed', renameList, 'svg.staging.validate.renamedHint', 'text-green-700')}
      ${section(newlyAdded.length, 'svg.staging.validate.newlyAdded', idList(newlyAdded), 'svg.staging.validate.newlyAddedHint')}
      ${section(removed.length, 'svg.staging.validate.removed', idList(removed), null)}
      ${section(removedRefs.length, 'svg.staging.validate.unlinked', '', null)}
      ${section(preExisting.length, 'svg.staging.validate.preExisting', idList(preExisting), 'svg.staging.validate.preExistingHint')}
    `;
    actions = `
      ${btn('promote-staging', 'svg.staging.actions.promote', 'px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700')}
      ${discardBtn}
    `;
  } else {
    const removedRefs = validated.summary?.removedRefs || [];
    const removedSummary = removedRefs
      .map(r => `<li>${escapeHtml(t('svg.staging.validate.failedItem', { floor: r.floor, code: r.svgCode, rows: r.affectedRowCount }))}</li>`)
      .join('');
    stateBlock = `
      <div class="text-sm text-red-700">${escapeHtml(t('svg.staging.validate.failed', { count: validated.errors.length }))}</div>
      <ul class="list-disc pl-6 text-xs text-gray-700 mt-1">${removedSummary}</ul>
    `;
    actions = `
      ${btn('open-reconcile-wizard', 'svg.staging.actions.reconcile', 'px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600')}
      ${discardBtn}
    `;
  }

  host.innerHTML = `
    <div class="rounded border border-blue-200 bg-blue-50 p-4">
      <div class="text-sm font-semibold mb-2">${escapeHtml(t('svg.staging.header', { owner: status.owner }))}</div>
      <ul class="list-disc pl-6 mb-2">${files}</ul>
      ${stateBlock}
      <div class="mt-3 flex gap-2">${actions}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
