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
    const added = (validated.summary?.addedShelves || []).length;
    stateBlock = `
      <div class="text-sm text-green-700">✓ Validation passed — ready to promote.</div>
      <div class="text-xs text-gray-600 mt-1">${added} new shelf${added === 1 ? '' : 'es'} added; no CSV changes needed.</div>
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
