import i18n from '../../i18n.js?v=5';
import { validateRangeShape } from './range-validation.js?v=1';

/**
 * Vertical, stacked per-entry card for the side panel (replaces the drawer's
 * grid row). Spec §6.3: full-width collection select, labelled From/To, worded
 * Move/Remove, and an ALWAYS-VISIBLE inline warning (§6.4) — not tooltip-only.
 * The input handler only calls onChange; the panel router re-renders and
 * restores focus/caret (the #86 mechanism), so cards never manage focus.
 */
function escape(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// The inline warning line for a card: start>end takes precedence, then overlaps.
// Overlap wording distinguishes same-shelf from cross-shelf (issue #87).
export function cardWarningText(range, conflicts = []) {
  const shape = validateRangeShape(range);
  if (!shape.ok && shape.error === 'start > end') {
    return i18n.t('mapEditor.warning.startGtEnd');
  }
  if (conflicts.length > 0) {
    return conflicts.map(c => {
      const key = c.otherShelf === range.svgCode
        ? 'mapEditor.warning.overlapSameShelf'
        : 'mapEditor.warning.overlap';
      return i18n.t(key)
        .replace('{otherRangeLabel}', c.otherRangeLabel)
        .replace('{otherShelfLabel}', c.otherShelf);
    }).join('\n');
  }
  return '';
}

export function buildShelfCard(range, { isLocked, conflicts = [], collectionsList = [], onChange, onMove, onDelete }) {
  const card = document.createElement('div');
  card.className = `map-card${isLocked ? ' map-card--locked' : ''}`;
  card.dataset.rangeId = range.id;
  const warn = cardWarningText(range, conflicts);

  card.innerHTML = `
    <select class="map-card__collection" data-field="collectionName"
            aria-label="${escape(i18n.t('mapEditor.field.collection'))}" ${isLocked ? 'disabled' : ''}>
      ${collectionsList.map(c =>
        `<option value="${escape(c)}" ${c === range.collectionName ? 'selected' : ''}>${escape(c)}</option>`).join('')}
    </select>
    <div class="map-card__range">
      <label class="map-card__field">
        <span class="map-card__label">${escape(i18n.t('mapEditor.field.from'))}</span>
        <input class="map-card__input" data-field="rangeStart" value="${escape(range.rangeStart || '')}" ${isLocked ? 'disabled' : ''} />
      </label>
      <label class="map-card__field">
        <span class="map-card__label">${escape(i18n.t('mapEditor.field.to'))}</span>
        <input class="map-card__input" data-field="rangeEnd" value="${escape(range.rangeEnd || '')}" ${isLocked ? 'disabled' : ''} />
      </label>
    </div>
    <div class="map-card__warn" ${warn ? '' : 'hidden'}>${escape(warn)}</div>
    <div class="map-card__actions">
      <button type="button" class="map-card__move" data-action="move" ${isLocked ? 'disabled' : ''}>↪ ${escape(i18n.t('mapEditor.move'))}</button>
      <button type="button" class="map-card__remove" data-action="delete" ${isLocked ? 'disabled' : ''}>${escape(i18n.t('mapEditor.delete'))}</button>
    </div>
  `;

  if (warn) {
    card.querySelector('[data-field="rangeStart"]').classList.add('map-card__cell--invalid');
    card.querySelector('[data-field="rangeEnd"]').classList.add('map-card__cell--invalid');
  }

  if (!isLocked) {
    card.querySelectorAll('input,select').forEach(input => {
      input.addEventListener('input', () => onChange(range.id, { [input.dataset.field]: input.value }));
    });
    card.querySelector('[data-action="move"]').onclick = () => onMove(range.id);
    card.querySelector('[data-action="delete"]').onclick = () => confirmRemove({
      label: `${range.rangeStart || ''}–${range.rangeEnd || ''}`,
      onConfirm: () => onDelete(range.id),
    });
  }
  return card;
}

/**
 * P1 (mockup feedback): removing an entry raises a prominent, separate
 * confirmation modal centred on the screen — not an inline confirm. Nothing is
 * destroyed until the librarian confirms (and even then it's a pending delete
 * undone by Discard before Save).
 */
export function confirmRemove({ label, onConfirm }) {
  const prior = document.getElementById('map-modal-overlay');
  if (prior) prior.remove();

  const overlay = document.createElement('div');
  overlay.id = 'map-modal-overlay';
  overlay.className = 'map-modal-overlay';
  overlay.innerHTML = `
    <div class="map-modal" role="dialog" aria-modal="true" aria-labelledby="map-modal-title">
      <h3 id="map-modal-title" class="map-modal__title">${escape(i18n.t('mapEditor.removeConfirm.title'))}</h3>
      <p class="map-modal__body">${escape(i18n.t('mapEditor.removeConfirm.body').replace('{label}', label))}</p>
      <div class="map-modal__actions">
        <button type="button" class="map-modal__cancel" data-action="cancel">${escape(i18n.t('mapEditor.removeConfirm.cancel'))}</button>
        <button type="button" class="map-modal__confirm" data-action="confirm">${escape(i18n.t('mapEditor.removeConfirm.confirm'))}</button>
      </div>
    </div>
  `;
  const close = () => overlay.remove();
  overlay.querySelector('[data-action="cancel"]').onclick = close;
  overlay.querySelector('[data-action="confirm"]').onclick = () => { close(); onConfirm(); };
  // Backdrop click cancels; Escape cancels.
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  document.body.appendChild(overlay);
  overlay.querySelector('[data-action="confirm"]').focus();
  return overlay;
}
