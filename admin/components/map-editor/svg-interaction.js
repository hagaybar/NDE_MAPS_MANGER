const HOVER_TOOLTIP_DELAY_MS = 400;

export function attachInteraction({ shelfElements, rangeCountByShelf, onSelect, onMultiToggle, isLocked, isFullyLocked, getShelfLabel, container }) {
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
      if (evt.ctrlKey || evt.metaKey) {
        onMultiToggle(shelfId);   // caller toggles add/remove based on current selection
      } else {
        onSelect(shelfId);
      }
    });
  }
}

export function applySelection(shelfElements, selectedIds) {
  for (const [id, el] of shelfElements) {
    if (selectedIds.includes(id)) el.classList.add('map-shelf--selected');
    else el.classList.remove('map-shelf--selected');
  }
}

export function attachMarquee({ container, getShelfElements, onMarqueeComplete }) {
  let startX = 0, startY = 0, marqueeEl = null;

  container.addEventListener('mousedown', evt => {
    if (!evt.shiftKey) return;            // Shift-drag only
    const cRect = container.getBoundingClientRect();
    startX = evt.clientX - cRect.left;
    startY = evt.clientY - cRect.top;
    marqueeEl = document.createElement('div');
    Object.assign(marqueeEl.style, {
      position: 'absolute', border: '2px dashed #0ea5e9',
      background: 'rgba(14,165,233,0.1)', pointerEvents: 'none', zIndex: 25,
    });
    marqueeEl.style.left = `${startX}px`;
    marqueeEl.style.top = `${startY}px`;
    container.appendChild(marqueeEl);

    function onMove(e) {
      const x = e.clientX - cRect.left, y = e.clientY - cRect.top;
      marqueeEl.style.left = `${Math.min(startX, x)}px`;
      marqueeEl.style.top = `${Math.min(startY, y)}px`;
      marqueeEl.style.width = `${Math.abs(x - startX)}px`;
      marqueeEl.style.height = `${Math.abs(y - startY)}px`;
    }
    function onUp() {
      const rect = marqueeEl.getBoundingClientRect();
      const intersected = [];
      const shelfElements = getShelfElements() || new Map();
      for (const [id, el] of shelfElements) {
        const r = el.getBoundingClientRect();
        if (r.right >= rect.left && r.left <= rect.right && r.bottom >= rect.top && r.top <= rect.bottom) {
          intersected.push(id);
        }
      }
      marqueeEl.remove(); marqueeEl = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onMarqueeComplete(intersected);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    evt.preventDefault();
  });
}
