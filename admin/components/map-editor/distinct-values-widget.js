import i18n from '../../i18n.js?v=5';

export function buildDistinctValuesWidget({ field, values, onChange }) {
  const distinct = new Map();
  for (const v of values) {
    distinct.set(v ?? '', (distinct.get(v ?? '') || 0) + 1);
  }
  const widget = document.createElement('div');
  widget.className = 'border-b py-2';
  widget.innerHTML = `
    <label class="block text-xs font-semibold mb-1">${field}</label>
    <div class="text-xs text-gray-500 mb-1">${i18n.t('mapEditor.distinctValues').replace('{valuesList}', Array.from(distinct.entries()).map(([v, n]) => `${v || '∅'} (${n})`).join(', '))}</div>
    <div class="flex items-center gap-2">
      <input type="text" data-role="replace" placeholder="${i18n.t('mapEditor.replaceAllWith')}" class="flex-1 px-2 py-1 border rounded text-sm" />
      <label class="text-xs flex items-center gap-1">
        <input type="checkbox" data-role="clear" />
        ${i18n.t('mapEditor.clearOnSelected')}
      </label>
    </div>
  `;
  const replaceInput = widget.querySelector('[data-role="replace"]');
  const clearCheckbox = widget.querySelector('[data-role="clear"]');
  function emit() {
    if (clearCheckbox.checked) onChange({ replaceWith: '', mode: 'clear' });
    else if (replaceInput.value !== '') onChange({ replaceWith: replaceInput.value, mode: 'replace' });
    else onChange({ mode: 'noop' });
  }
  replaceInput.addEventListener('input', emit);
  clearCheckbox.addEventListener('change', () => {
    if (clearCheckbox.checked) replaceInput.value = '';
    emit();
  });
  return widget;
}
