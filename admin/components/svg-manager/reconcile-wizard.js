/**
 * Interactive reconcile wizard for the staged-SVG-replace flow.
 *
 * Renders one row per removed shelf; operator picks "rename" or "delete" for
 * each. Submit is gated on all rows having an action. Delete triggers a
 * confirm dialog before the map is built.
 *
 * @param {HTMLElement} host
 * @param {{
 *   floor: number,
 *   removedRefs: Array<{svgCode: string, affectedRowCount: number}>,
 *   addedShelves: Array<{svgCode: string}>
 * }} diff
 * @param {(floor: number, reconcileMap: object) => void} [onSubmit]
 */
export function renderReconcileWizard(host, diff, onSubmit) {
  const rowsHtml = diff.removedRefs.map(removed => {
    const options = [
      `<option value="">-- choose --</option>`,
      ...diff.addedShelves.map(added =>
        `<option value="rename:${escapeAttr(added.svgCode)}">Rename to ${escapeHtml(added.svgCode)}</option>`
      ),
      `<option value="delete">Delete ${removed.affectedRowCount} CSV row${removed.affectedRowCount === 1 ? '' : 's'}</option>`,
    ].join('');
    return `
      <tr data-reconcile-row data-svg-code="${escapeAttr(removed.svgCode)}">
        <td class="px-3 py-2 font-mono text-xs">${escapeHtml(removed.svgCode)}</td>
        <td class="px-3 py-2 text-xs">${removed.affectedRowCount}</td>
        <td class="px-3 py-2">
          <select class="border rounded px-2 py-1 text-sm">${options}</select>
        </td>
      </tr>
    `;
  }).join('');

  host.innerHTML = `
    <div class="rounded border border-amber-300 bg-amber-50 p-4">
      <div class="text-sm font-semibold mb-2">Reconcile removed shelves — floor ${diff.floor}</div>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs text-gray-600"><th>Removed shelf</th><th>Rows</th><th>Action</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="mt-3 flex gap-2 items-center">
        <button data-action="submit-reconcile" disabled
                class="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed">
          Apply and re-validate
        </button>
        <button data-action="cancel-reconcile"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </div>
  `;

  function updateSubmitState() {
    const allChosen = Array.from(host.querySelectorAll('[data-reconcile-row] select'))
      .every(sel => sel.value !== '');
    host.querySelector('[data-action="submit-reconcile"]').disabled = !allChosen;
  }

  host.querySelectorAll('[data-reconcile-row] select').forEach(sel => {
    sel.addEventListener('change', updateSubmitState);
  });

  host.querySelector('[data-action="submit-reconcile"]').addEventListener('click', () => {
    const map = {};
    let deleteCount = 0;
    host.querySelectorAll('[data-reconcile-row]').forEach(tr => {
      const svgCode = tr.dataset.svgCode;
      const value = tr.querySelector('select').value;
      if (value === 'delete') {
        map[svgCode] = { action: 'delete' };
        deleteCount += 1;
      } else if (value.startsWith('rename:')) {
        map[svgCode] = { action: 'rename', to: value.slice('rename:'.length) };
      }
    });

    if (deleteCount > 0) {
      const ok = window.confirm(
        `You are about to delete ${deleteCount} CSV reference${deleteCount === 1 ? '' : 's'}. ` +
        `This will remove the corresponding CSV row${deleteCount === 1 ? '' : 's'}. Continue?`
      );
      if (!ok) return;
    }
    if (typeof onSubmit === 'function') {
      onSubmit(diff.floor, map);
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
