/**
 * Interactive reconcile wizard for the staged-SVG-replace flow.
 *
 * Renders one plain-language card per removed shelf. Each card asks, in
 * everyday wording, what should happen to the shelf and the CSV rows that
 * point at it. The operator answers with radio buttons (and, where relevant, a
 * dropdown of candidate target shelves). Submit is gated on every card having a
 * resolvable choice. Any card that resolves to a delete triggers a confirm
 * dialog before the reconcile map is built and submitted.
 *
 * @param {HTMLElement} host
 * @param {{
 *   floor: number,
 *   removedRefs: Array<{svgCode: string, affectedRowCount: number}>,
 *   candidateTargets?: Array<{svgCode: string}>,
 *   renames?: Array<{fromCode: string, toCode: string}>,
 *   addedShelves?: Array<{svgCode: string}>
 * }} diff
 * @param {(floor: number, reconcileMap: object) => void} [onSubmit]
 * @param {() => void} [onCancel]
 */
import i18n from '../../i18n.js?v=5';
import { parseRangeValue } from '../../services/data-model.js';

// Canonical CSV column order (mirrors lambda/applyReconcileToStaging.mjs COLUMNS).
const COLUMNS = [
  'libraryName', 'libraryNameHe', 'collectionName', 'collectionNameHe',
  'rangeStart', 'rangeEnd', 'svgCode', 'description', 'descriptionHe',
  'floor', 'shelfLabel', 'shelfLabelHe', 'notes', 'notesHe',
];
const REQUIRED_FIELDS = ['libraryName', 'collectionName', 'rangeStart', 'rangeEnd'];
const READONLY_FIELDS = ['svgCode', 'floor'];

const FALLBACKS = {
  'svg.staging.reconcile.title':          { en: 'Before you publish: a few shelves on Floor {floor} changed — tell me what happened', he: 'לפני הפרסום: כמה מדפים בקומה {floor} השתנו — ספרו לי מה קרה' },
  'svg.staging.reconcile.renameHeading':  { en: 'Looks like a shelf was renamed', he: 'נראה שמדף שונה בשמו' },
  'svg.staging.reconcile.sameShelf':      { en: 'Same shelf on the map — it just has a new label.', he: 'אותו מדף במפה — פשוט עם תווית חדשה.' },
  'svg.staging.reconcile.entriesUse':     { en: '{entries} currently use "{code}".', he: '{entries} משתמשות כרגע ב"{code}".' },
  'svg.staging.reconcile.applyRename':    { en: 'Yes, same shelf — keep the entries', he: 'כן, אותו מדף — לשמור את הרשומות' },
  'svg.staging.reconcile.notRename':      { en: 'No, different shelf — remove those {entries}', he: 'לא, מדף אחר — להסיר את {entries}' },
  'svg.staging.reconcile.differentShelf': { en: 'It became this shelf instead:', he: 'הוא הפך למדף הזה:' },
  'svg.staging.reconcile.goneHeading':    { en: '"{code}" is no longer on the map', he: '"{code}" כבר לא נמצא במפה' },
  'svg.staging.reconcile.gonePrompt':     { en: '{entries} use it. What happened to it?', he: '{entries} משתמשות בו. מה קרה לו?' },
  'svg.staging.reconcile.renamedTo':      { en: 'It became this shelf:', he: 'הוא הפך למדף:' },
  'svg.staging.reconcile.removeEntries':  { en: "It's gone for good — remove those {entries}", he: 'הוא נעלם לתמיד — להסיר את {entries}' },
  'svg.staging.reconcile.apply':          { en: 'Apply these changes', he: 'החל את השינויים' },
  'svg.staging.reconcile.cancel':         { en: 'Cancel', he: 'ביטול' },
  'svg.staging.reconcile.confirmDelete':  { en: 'This permanently removes {entries} for shelves that are gone. Continue?', he: 'פעולה זו תסיר לצמיתות {entries} עבור מדפים שאינם קיימים יותר. להמשיך?' },
  'svg.staging.reconcile.entryWord':      { en: 'library entry', he: 'רשומת ספרייה' },
  'svg.staging.reconcile.entriesWord':    { en: 'library entries', he: 'רשומות ספרייה' },
  'svg.staging.reconcile.added.reviewButton':  { en: 'Review {count} new shelves', he: 'בדקו {count} מדפים חדשים' },
  'svg.staging.reconcile.added.title':         { en: 'These shelves are on the new map but have no library info yet — tell me what each one is', he: 'המדפים האלה נמצאים במפה החדשה אך עדיין ללא נתוני ספרייה — ספרו לי מה כל אחד מהם' },
  'svg.staging.reconcile.added.addNow':        { en: 'Add its library info now', he: 'הוסיפו עכשיו את נתוני הספרייה שלו' },
  'svg.staging.reconcile.added.leaveUnmapped': { en: "Leave it unmapped (decorative / I'll map it later)", he: 'להשאיר ללא מיפוי (דקורטיבי / אמפה מאוחר יותר)' },
  'svg.staging.reconcile.added.notReal':       { en: 'Is one of these not a real shelf?', he: 'אחד מהם אינו מדף אמיתי?' },
  'svg.staging.reconcile.added.notRealHelp':   { en: "That's a map-editing mistake. Discard this upload, remove the element from your map file, and upload it again.", he: 'זו טעות בעריכת המפה. השליכו את ההעלאה הזו, הסירו את הרכיב מקובץ המפה, והעלו שוב.' },
  'svg.staging.reconcile.added.formTitle':     { en: 'New shelf {svgCode} · Floor {floor}', he: 'מדף חדש {svgCode} · קומה {floor}' },
  'svg.staging.reconcile.added.apply':         { en: 'Save these entries', he: 'שמרו את הרשומות' },
  'svg.staging.reconcile.added.requiredHint':  { en: 'Library, collection, and range are required; the rest are optional.', he: 'ספרייה, אוסף וטווח הם שדות חובה; השאר אופציונליים.' },
  'svg.staging.reconcile.added.discard':       { en: 'Discard this upload', he: 'השליכו את ההעלאה הזו' },
};

function t(key) {
  const value = i18n.t(key);
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale?.() || 'en';
    return FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  return value;
}

// "3 library entries" / "1 library entry" (en); he uses the same shape.
function entriesPhrase(n) {
  const word = n === 1 ? t('svg.staging.reconcile.entryWord') : t('svg.staging.reconcile.entriesWord');
  return `${n} ${word}`;
}

export function renderReconcileWizard(host, diff, onSubmit, onCancel) {
  const added = diff.newlyAddedShelves || [];
  if (added.length && !(diff.removedRefs && diff.removedRefs.length)) {
    return renderAddedGroup(host, diff, added, onSubmit, onCancel);
  }

  const detected = {};
  (diff.renames || []).forEach(r => { detected[r.fromCode] = r.toCode; });
  const candidates = (diff.candidateTargets || diff.addedShelves || []).map(c => c.svgCode);

  const cardsHtml = diff.removedRefs.map(removed => {
    const code = removed.svgCode;
    const det = detected[code]; // detected new code, or undefined
    const n = removed.affectedRowCount;
    const entries = entriesPhrase(n);
    const name = `reconcile-${escapeAttr(code)}`;

    if (det) {
      // Candidate targets for the "different shelf" option exclude the detected NEW.
      const otherTargets = candidates.filter(c => c !== det);
      const entriesUse = t('svg.staging.reconcile.entriesUse')
        .replace('{entries}', entries)
        .replace('{code}', `<span class="font-mono">${escapeHtml(code)}</span>`);
      return `
        <div data-reconcile-card data-svg-code="${escapeAttr(code)}" data-detected="${escapeAttr(det)}"
             class="rounded border border-gray-200 bg-white p-4 mb-3">
          <div class="text-sm font-semibold text-gray-800">↺ ${escapeHtml(t('svg.staging.reconcile.renameHeading'))}</div>
          <div class="mt-1 font-mono text-sm">
            <span class="px-1.5 py-0.5 bg-gray-100 rounded">${escapeHtml(code)}</span>
            <span class="mx-1 text-gray-400">→</span>
            <span class="px-1.5 py-0.5 bg-green-100 rounded">${escapeHtml(det)}</span>
          </div>
          <div class="mt-1 text-xs text-gray-600">${escapeHtml(t('svg.staging.reconcile.sameShelf'))}</div>
          <div class="mt-1 text-xs text-gray-600">${entriesUse}</div>
          <div class="mt-3 space-y-2 text-sm">
            <label class="flex items-center gap-2">
              <input type="radio" name="${name}" value="apply-rename" checked>
              <span>${escapeHtml(t('svg.staging.reconcile.applyRename'))}</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" name="${name}" value="not-rename-delete">
              <span>${escapeHtml(t('svg.staging.reconcile.notRename').replace('{entries}', entriesPhrase(n)))}</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" name="${name}" value="different-shelf">
              <span>${escapeHtml(t('svg.staging.reconcile.differentShelf'))}</span>
              <select data-role="target-select" disabled
                      class="border rounded px-2 py-1 text-sm disabled:opacity-50">
                ${renderTargetOptions(otherTargets)}
              </select>
            </label>
          </div>
        </div>
      `;
    }

    // Non-detected removed ref: no default; user must choose.
    const goneHeading = t('svg.staging.reconcile.goneHeading')
      .replace('{code}', `<span class="font-mono">${escapeHtml(code)}</span>`);
    return `
      <div data-reconcile-card data-svg-code="${escapeAttr(code)}"
           class="rounded border border-gray-200 bg-white p-4 mb-3">
        <div class="text-sm font-semibold text-gray-800">${goneHeading}</div>
        <div class="mt-1 text-xs text-gray-600">${escapeHtml(t('svg.staging.reconcile.gonePrompt').replace('{entries}', entries))}</div>
        <div class="mt-3 space-y-2 text-sm">
          <label class="flex items-center gap-2">
            <input type="radio" name="${name}" value="renamed-to">
            <span>${escapeHtml(t('svg.staging.reconcile.renamedTo'))}</span>
            <select data-role="target-select" disabled
                    class="border rounded px-2 py-1 text-sm disabled:opacity-50">
              ${renderTargetOptions(candidates)}
            </select>
          </label>
          <label class="flex items-center gap-2">
            <input type="radio" name="${name}" value="remove">
            <span>${escapeHtml(t('svg.staging.reconcile.removeEntries').replace('{entries}', entriesPhrase(n)))}</span>
          </label>
        </div>
      </div>
    `;
  }).join('');

  host.innerHTML = `
    <div class="rounded border border-amber-300 bg-amber-50 p-4">
      <div class="text-sm font-semibold mb-3">${escapeHtml(t('svg.staging.reconcile.title').replace('{floor}', String(diff.floor)))}</div>
      ${cardsHtml}
      <div class="mt-3 flex gap-2 items-center">
        <button data-action="submit-reconcile" disabled
                class="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed">
          ${escapeHtml(t('svg.staging.reconcile.apply'))}
        </button>
        <button data-action="cancel-reconcile"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
          ${escapeHtml(t('svg.staging.reconcile.cancel'))}
        </button>
      </div>
    </div>
  `;

  // Resolve a single card to a reconcile decision, or null if not yet resolvable.
  // Returns { action: 'rename', to } | { action: 'delete' } | null.
  function resolveCard(card) {
    const selected = card.querySelector('input[type="radio"]:checked');
    if (!selected) return null;
    const detTarget = card.dataset.detected;
    switch (selected.value) {
      case 'apply-rename':
        return { action: 'rename', to: detTarget };
      case 'not-rename-delete':
      case 'remove':
        return { action: 'delete' };
      case 'different-shelf':
      case 'renamed-to': {
        const sel = card.querySelector('select[data-role="target-select"]');
        const to = sel && sel.value;
        return to ? { action: 'rename', to } : null;
      }
      default:
        return null;
    }
  }

  function syncCardSelects(card) {
    const usesSelect = card.querySelector('input[type="radio"][value="different-shelf"], input[type="radio"][value="renamed-to"]');
    if (!usesSelect) return;
    const sel = card.querySelector('select[data-role="target-select"]');
    if (!sel) return;
    sel.disabled = !usesSelect.checked;
  }

  function updateSubmitState() {
    const cards = Array.from(host.querySelectorAll('[data-reconcile-card]'));
    cards.forEach(syncCardSelects);
    const allResolved = cards.every(c => resolveCard(c) !== null);
    host.querySelector('[data-action="submit-reconcile"]').disabled = !allResolved;
  }

  host.querySelectorAll('[data-reconcile-card]').forEach(card => {
    card.addEventListener('change', updateSubmitState);
  });
  updateSubmitState(); // detected-rename cards are pre-selected ⇒ submit can be enabled on first render

  host.querySelector('[data-action="submit-reconcile"]').addEventListener('click', () => {
    const map = {};
    let deleteCount = 0;
    host.querySelectorAll('[data-reconcile-card]').forEach(card => {
      const svgCode = card.dataset.svgCode;
      const decision = resolveCard(card);
      if (!decision) return;
      map[svgCode] = decision;
      if (decision.action === 'delete') deleteCount += 1;
    });

    if (deleteCount > 0) {
      const ok = window.confirm(
        t('svg.staging.reconcile.confirmDelete').replace('{entries}', entriesPhrase(deleteCount))
      );
      if (!ok) return;
    }
    if (typeof onSubmit === 'function') {
      onSubmit(diff.floor, map);
    }
  });

  host.querySelector('[data-action="cancel-reconcile"]').addEventListener('click', () => {
    host.innerHTML = '';
    if (typeof onCancel === 'function') {
      onCancel();
    }
  });
}

// Client-side range check, consistent with admin/services/data-model.js
// (parseRangeValue) and lambda/range-validation.mjs: start/end must share a
// prefix and start must be <= end. Empty inputs are treated as "not yet valid".
function rangeOk(rangeStart, rangeEnd) {
  const start = String(rangeStart ?? '').trim();
  const end = String(rangeEnd ?? '').trim();
  if (!start || !end) return false;
  const s = parseRangeValue(start);
  const e = parseRangeValue(end);
  if (s.prefix !== e.prefix) return false;
  if (s.numeric === null || e.numeric === null) {
    // Both unparseable-as-number but same prefix: fall back to string order.
    return start <= end;
  }
  return s.numeric <= e.numeric;
}

function renderAddedGroup(host, diff, added, onSubmit, onCancel) {
  const cardsHtml = added.map(shelf => {
    const code = shelf.svgCode;
    const floor = shelf.floor != null ? shelf.floor : diff.floor;
    const name = `added-${escapeAttr(code)}`;
    const formTitle = t('svg.staging.reconcile.added.formTitle')
      .replace('{svgCode}', escapeHtml(code))
      .replace('{floor}', escapeHtml(String(floor)));

    const fieldRows = COLUMNS.map(col => {
      const readOnly = READONLY_FIELDS.includes(col);
      const required = REQUIRED_FIELDS.includes(col);
      const label = t(`columns.${col}`);
      const prefill = col === 'svgCode' ? code : col === 'floor' ? String(floor) : '';
      const reqMark = required ? ' <span class="text-red-500">*</span>' : '';
      return `
        <label class="block text-xs text-gray-700">
          <span class="block mb-0.5">${escapeHtml(label)}${reqMark}</span>
          <input type="text" data-field="${escapeAttr(col)}"
                 value="${escapeAttr(prefill)}"
                 ${readOnly ? 'readonly' : ''} ${required ? 'data-required' : ''}
                 class="w-full border rounded px-2 py-1 text-sm${readOnly ? ' bg-gray-100 text-gray-600' : ''}">
        </label>`;
    }).join('');

    return `
      <div data-added-card data-svg-code="${escapeAttr(code)}"
           class="rounded border border-gray-200 bg-white p-4 mb-3">
        <div class="text-sm font-semibold text-gray-800 font-mono">${escapeHtml(String(floor))}: ${escapeHtml(code)}</div>
        <div class="mt-3 space-y-2 text-sm">
          <label class="flex items-center gap-2">
            <input type="radio" name="${name}" value="add-now">
            <span>${escapeHtml(t('svg.staging.reconcile.added.addNow'))}</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="radio" name="${name}" value="leave">
            <span>${escapeHtml(t('svg.staging.reconcile.added.leaveUnmapped'))}</span>
          </label>
        </div>
        <div data-add-form hidden class="mt-3 border-t pt-3">
          <div class="text-xs font-semibold text-gray-700 mb-1">${formTitle}</div>
          <div class="text-xs text-gray-500 mb-2">${escapeHtml(t('svg.staging.reconcile.added.requiredHint'))}</div>
          <div class="grid grid-cols-2 gap-2">
            ${fieldRows}
          </div>
        </div>
      </div>`;
  }).join('');

  host.innerHTML = `
    <div class="rounded border border-amber-300 bg-amber-50 p-4">
      <div class="text-sm font-semibold mb-3">${escapeHtml(t('svg.staging.reconcile.added.title'))}</div>
      ${cardsHtml}
      <div class="mt-2 rounded border border-gray-200 bg-white p-3">
        <div class="text-sm font-semibold text-gray-800">${escapeHtml(t('svg.staging.reconcile.added.notReal'))}</div>
        <div class="mt-1 text-xs text-gray-600">${escapeHtml(t('svg.staging.reconcile.added.notRealHelp'))}</div>
        <button data-action="discard-from-added"
                class="mt-2 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">
          ${escapeHtml(t('svg.staging.reconcile.added.discard'))}
        </button>
      </div>
      <div class="mt-3 flex gap-2 items-center">
        <button data-action="submit-added" disabled
                class="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed">
          ${escapeHtml(t('svg.staging.reconcile.added.apply'))}
        </button>
        <button data-action="cancel-added"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
          ${escapeHtml(t('svg.staging.reconcile.cancel'))}
        </button>
      </div>
    </div>
  `;

  // Returns 'add-now' | 'leave' | null
  function cardChoice(card) {
    const selected = card.querySelector('input[type="radio"]:checked');
    return selected ? selected.value : null;
  }

  function cardFields(card) {
    const fields = {};
    card.querySelectorAll('[data-field]').forEach(input => {
      fields[input.dataset.field] = input.value;
    });
    return fields;
  }

  function cardAddValid(card) {
    const fields = cardFields(card);
    for (const k of REQUIRED_FIELDS) {
      if (!String(fields[k] ?? '').trim()) return false;
    }
    return rangeOk(fields.rangeStart, fields.rangeEnd);
  }

  function syncCardForm(card) {
    const form = card.querySelector('[data-add-form]');
    if (!form) return;
    form.hidden = cardChoice(card) !== 'add-now';
  }

  function updateSubmitState() {
    const cards = Array.from(host.querySelectorAll('[data-added-card]'));
    cards.forEach(syncCardForm);
    const allOk = cards.every(card => {
      const choice = cardChoice(card);
      if (!choice) return false;
      if (choice === 'leave') return true;
      return cardAddValid(card);
    });
    host.querySelector('[data-action="submit-added"]').disabled = !allOk;
  }

  host.querySelectorAll('[data-added-card]').forEach(card => {
    card.addEventListener('change', updateSubmitState);
    card.addEventListener('input', updateSubmitState);
  });
  updateSubmitState();

  host.querySelector('[data-action="submit-added"]').addEventListener('click', () => {
    const map = {};
    const leftUnmapped = [];
    host.querySelectorAll('[data-added-card]').forEach(card => {
      const code = card.dataset.svgCode;
      const choice = cardChoice(card);
      if (choice === 'leave') {
        leftUnmapped.push(code);
        return;
      }
      if (choice === 'add-now') {
        const raw = cardFields(card);
        const fields = {};
        for (const col of COLUMNS) {
          const v = String(raw[col] ?? '').trim();
          if (v) fields[col] = v;
        }
        map[code] = { action: 'add', fields };
      }
    });
    if (typeof onSubmit === 'function') {
      onSubmit(diff.floor, map, { leftUnmapped });
    }
  });

  host.querySelector('[data-action="cancel-added"]').addEventListener('click', () => {
    host.innerHTML = '';
    if (typeof onCancel === 'function') {
      onCancel();
    }
  });
}

function renderTargetOptions(codes) {
  return [
    `<option value="">choose ▾</option>`,
    ...codes.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`),
  ].join('');
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
