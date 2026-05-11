/**
 * Orphan Card — pure render function for one orphan row.
 *
 * Returns a DOM element. Wires two callbacks: onSetShelf (primary,
 * "Set shelf on map") and onEditElsewhere (secondary, "Edit in CSV
 * editor").
 *
 * @module components/map-editor/orphan-card
 */

import i18n from '../../i18n.js?v=5';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * @param {{
 *   orphan: Object,
 *   isActive: boolean,
 *   locale: 'en' | 'he',
 *   readOnly?: boolean,
 *   onSetShelf: (rowId: string) => void,
 *   onEditElsewhere: (rowId: string) => void
 * }} args
 * @returns {HTMLElement}
 */
export function renderOrphanCard({ orphan, isActive, locale, readOnly, onSetShelf, onEditElsewhere }) {
  const card = document.createElement('div');
  card.className = `map-orphan-card${isActive ? ' map-orphan-card--active' : ''}`;
  card.dataset.rowId = orphan.rowId;

  const collection = locale === 'he'
    ? (orphan.collectionNameHe || orphan.collectionName || '')
    : (orphan.collectionName || '');
  const shelfLabel = locale === 'he'
    ? (orphan.shelfLabelHe || orphan.shelfLabel || '')
    : (orphan.shelfLabel || '');

  const range = orphan.rangeStart || orphan.rangeEnd
    ? `${orphan.rangeStart || ''} – ${orphan.rangeEnd || ''}`
    : '';

  const badCodeText = orphan.svgCode || '[empty]';
  const isWrongSvgCode = orphan.kind === 'svgCode_not_on_floor';
  const kindKey = isWrongSvgCode
    ? 'mapEditor.orphan.card.kind.wrongSvgCode'
    : 'mapEditor.orphan.card.kind.missingSvgCode';
  const explanationKey = isWrongSvgCode
    ? 'mapEditor.orphan.card.explanation.wrongSvgCode'
    : 'mapEditor.orphan.card.explanation.missingSvgCode';

  const setShelfDisabled = readOnly ? 'disabled' : '';
  const setShelfTitle = readOnly ? i18n.t('mapEditor.orphan.card.readOnly') : '';

  card.innerHTML = `
    <div class="map-orphan-card__header">
      <span class="map-orphan-card__collection">${escapeHtml(collection)}</span>
      <span class="map-orphan-card__shelf">${escapeHtml(shelfLabel)}</span>
    </div>
    <div class="map-orphan-card__body">
      <span class="map-orphan-card__range">${escapeHtml(range)}</span>
      <span class="map-orphan-card__bad-svgcode">${escapeHtml(badCodeText)}</span>
      <span class="map-orphan-card__kind-badge">${escapeHtml(i18n.t(kindKey))}</span>
    </div>
    <p class="map-orphan-card__explanation">${escapeHtml(i18n.t(explanationKey))}</p>
    <div class="map-orphan-card__actions">
      <button type="button" data-action="set-shelf" ${setShelfDisabled} title="${escapeHtml(setShelfTitle)}" class="map-orphan-card__primary"><span class="map-orphan-card__primary-icon" aria-hidden="true">📍</span> ${escapeHtml(i18n.t('mapEditor.orphan.card.setShelf'))}</button>
      <button type="button" data-action="edit-elsewhere" class="map-orphan-card__secondary">${escapeHtml(i18n.t('mapEditor.orphan.card.editElsewhere'))}</button>
    </div>
  `;

  if (!readOnly) {
    card.querySelector('[data-action="set-shelf"]').addEventListener('click', () => onSetShelf(orphan.rowId));
  }
  card.querySelector('[data-action="edit-elsewhere"]').addEventListener('click', () => onEditElsewhere(orphan.rowId));

  return card;
}
