import i18n from '../i18n.js?v=5';
import { applyRoleBasedUI } from '../auth-guard.js?v=5';

let initialized = false;

export function initMapEditor() {
  if (initialized) return;
  initialized = true;
  const container = document.getElementById('map-editor');
  container.innerHTML = `
    <div class="card bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold mb-4">${i18n.t('nav.mapEditor')}</h2>
      <p id="map-editor-empty" class="text-gray-500 text-sm">${i18n.t('mapEditor.empty')}</p>
    </div>
  `;
  applyRoleBasedUI(container);
}
