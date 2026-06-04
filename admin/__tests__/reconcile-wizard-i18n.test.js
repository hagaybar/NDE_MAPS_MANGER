/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// #96 findings 2 + 4 in the reconcile wizard.
let renderReconcileWizard, i18n;

beforeEach(async () => {
  jest.resetModules();
  document.body.innerHTML = '<div id="wizard-host"></div>';
  i18n = (await import('../i18n.js?v=5')).default;
  i18n.locale = 'en';
  ({ renderReconcileWizard } = await import('../components/svg-manager/reconcile-wizard.js'));
});

function host() { return document.getElementById('wizard-host'); }

// A detected-rename card: renders the entriesUse sentence (svgCode interpolation,
// #4) and a "different shelf" <select> with the choose placeholder (#2).
const DATA = {
  floor: 1,
  removedRefs: [{ svgCode: 'OLD', affectedRowCount: 3 }],
  candidateTargets: [{ svgCode: 'OTHER' }],
  renames: [{ fromCode: 'OLD', toCode: 'NEW' }],
};

test('#4: an svgCode interpolated into a sentence is BiDi-isolated with <bdi>', () => {
  renderReconcileWizard(host(), DATA, () => {});
  const card = host().querySelector('[data-reconcile-card][data-svg-code="OLD"]');
  const bdi = card.querySelector('bdi');
  expect(bdi).not.toBeNull();             // before the fix it was a plain <span>
  expect(bdi.textContent).toBe('OLD');
});

test('#2: the target-select placeholder is localized, not a hardcoded English "choose"', () => {
  i18n.locale = 'he';
  renderReconcileWizard(host(), DATA, () => {});
  const placeholder = host().querySelector(
    '[data-reconcile-card][data-svg-code="OLD"] select[data-role="target-select"] option[value=""]');
  expect(placeholder).not.toBeNull();
  expect(placeholder.textContent).toContain('בחר');     // Hebrew
  expect(placeholder.textContent).not.toContain('choose'); // not the hardcoded English
});
