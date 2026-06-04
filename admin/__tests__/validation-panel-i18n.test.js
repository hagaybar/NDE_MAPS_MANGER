/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { readFileSync } from 'fs';

// #96 finding 1: validation-panel resolved keys under `validation.*`, but en/he.json
// define them under `validationPanel.*` with different leaf names — so the bundle
// values (incl. Hebrew / future librarian edits) never rendered; the component
// always fell through to its hardcoded FALLBACKS. The fix aligns the component to
// the keys that actually exist in the bundle.
//
// Spy on the i18n the component consumes and assert it now requests the
// validationPanel.* keys (which exist in the bundle), not the drifted validation.*.
const i18n = (await import('../i18n.js?v=5')).default;
const tSpy = jest.spyOn(i18n, 't');
const { initValidationPanel, setIssues } = await import('../components/validation-panel.js');

const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8'));
const he = JSON.parse(readFileSync(new URL('../i18n/he.json', import.meta.url), 'utf8'));

test('validation panel requests the validationPanel.* bundle keys, not the drifted validation.* (#96)', () => {
  document.body.innerHTML = '<div id="vp"></div>';
  tSpy.mockClear();
  initValidationPanel(document.getElementById('vp'));
  setIssues([{ type: 'error', message: 'oops', row: 1 }]);

  const requested = tSpy.mock.calls.map((c) => c[0]).filter((k) => String(k).startsWith('validation'));

  // Requests the bundle namespace…
  expect(requested).toContain('validationPanel.title');
  expect(requested).toContain('validationPanel.errors');
  // …and NOT the old drifted keys that the bundle never defined.
  expect(requested).not.toContain('validation.panelTitle');
  expect(requested).not.toContain('validation.errors');

  // The requested keys actually resolve from the bundle (both locales).
  for (const key of ['title', 'errors', 'warnings', 'noIssues', 'goToRow', 'previousIssue', 'nextIssue', 'filterErrors', 'collapse', 'expand']) {
    expect(en.validationPanel[key]).toBeTruthy();
    expect(he.validationPanel[key]).toBeTruthy();
  }
});
