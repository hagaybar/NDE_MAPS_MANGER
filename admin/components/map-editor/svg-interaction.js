const HOVER_TOOLTIP_DELAY_MS = 400;

export function attachInteraction({ shelfElements, rangeCountByShelf, onSelect, isLocked, isFullyLocked, getShelfLabel, container }) {
  let hoverTimer = null;
  let tooltipEl = null;

  function showTooltip(target, text) {
    hideTooltip();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'map-tooltip';
    tooltipEl.textContent = text;
    container.appendChild(tooltipEl);
    const rect = target.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    tooltipEl.style.left = `${rect.left - cRect.left + rect.width / 2}px`;
    tooltipEl.style.top = `${rect.top - cRect.top - 24}px`;
  }
  function hideTooltip() {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  }

  for (const [shelfId, el] of shelfElements) {
    el.classList.add('map-shelf');

    if (isFullyLocked(shelfId)) {
      el.classList.add('map-shelf--locked', 'map-shelf--fully-locked');
      // No interactivity at all.
      continue;
    }
    if (isLocked(shelfId)) {
      el.classList.add('map-shelf--locked'); // visually hatched, still clickable
    }

    el.addEventListener('mouseenter', () => {
      el.classList.add('map-shelf--hover');
      hoverTimer = setTimeout(() => {
        const n = rangeCountByShelf.get(shelfId) || 0;
        showTooltip(el, `${getShelfLabel(shelfId)} · ${n} ranges`);
      }, HOVER_TOOLTIP_DELAY_MS);
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('map-shelf--hover');
      clearTimeout(hoverTimer); hoverTimer = null;
      hideTooltip();
    });

    el.addEventListener('click', evt => {
      evt.preventDefault();
      onSelect(shelfId);
    });
  }
}

export function applySelection(shelfElements, selectedIds) {
  for (const [id, el] of shelfElements) {
    if (selectedIds.includes(id)) el.classList.add('map-shelf--selected');
    else el.classList.remove('map-shelf--selected');
  }
}
