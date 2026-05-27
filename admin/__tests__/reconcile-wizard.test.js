/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('reconcile-wizard (card layout)', () => {
  let renderReconcileWizard;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="wizard-host"></div>';
    // Force English on the same i18n module the SUT consumes.
    const i18n = (await import('../i18n.js?v=5')).default;
    i18n.locale = 'en';
    ({ renderReconcileWizard } = await import('../components/svg-manager/reconcile-wizard.js'));
  });

  function host() { return document.getElementById('wizard-host'); }

  test('detected rename: card shows rename heading + OLD → NEW, default-applies, submit yields rename', () => {
    let submitted = null;
    renderReconcileWizard(host(), {
      floor: 1,
      removedRefs: [{ svgCode: 'OLD', affectedRowCount: 3 }],
      candidateTargets: [{ svgCode: 'OTHER' }],
      renames: [{ fromCode: 'OLD', toCode: 'NEW' }],
    }, (floor, map) => { submitted = { floor, map }; });

    const card = host().querySelector('[data-reconcile-card][data-svg-code="OLD"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toMatch(/Looks like a shelf was renamed/i);
    expect(card.textContent).toContain('OLD');
    expect(card.textContent).toContain('NEW');

    // Default-selected radio is "Yes, same shelf — keep the entries"
    const checked = card.querySelector('input[type="radio"]:checked');
    expect(checked).not.toBeNull();
    expect(checked.value).toBe('apply-rename');

    // Apply enabled immediately
    const apply = host().querySelector('[data-action="submit-reconcile"]');
    expect(apply.disabled).toBe(false);
    expect(apply.textContent).toMatch(/Apply these changes/i);

    apply.click();
    expect(submitted.floor).toBe(1);
    expect(submitted.map).toEqual({ OLD: { action: 'rename', to: 'NEW' } });
  });

  test('treat-as-separate: choosing "No, different shelf — remove" then Apply yields delete', () => {
    let submitted = null;
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderReconcileWizard(host(), {
      floor: 1,
      removedRefs: [{ svgCode: 'OLD', affectedRowCount: 2 }],
      candidateTargets: [{ svgCode: 'OTHER' }],
      renames: [{ fromCode: 'OLD', toCode: 'NEW' }],
    }, (floor, map) => { submitted = { floor, map }; });

    const card = host().querySelector('[data-reconcile-card][data-svg-code="OLD"]');
    const removeRadio = card.querySelector('input[type="radio"][value="not-rename-delete"]');
    expect(removeRadio).not.toBeNull();
    removeRadio.checked = true;
    removeRadio.dispatchEvent(new Event('change', { bubbles: true }));

    host().querySelector('[data-action="submit-reconcile"]').click();
    expect(confirmSpy).toHaveBeenCalled();
    expect(submitted.map).toEqual({ OLD: { action: 'delete' } });
    confirmSpy.mockRestore();
  });

  test('non-detected ref: no default; choosing "renamed to" + a candidate then Apply yields rename', () => {
    let submitted = null;
    renderReconcileWizard(host(), {
      floor: 1,
      removedRefs: [{ svgCode: 'OLD', affectedRowCount: 1 }],
      candidateTargets: [{ svgCode: 'NEW_A' }, { svgCode: 'NEW_B' }],
      renames: [],
    }, (floor, map) => { submitted = { floor, map }; });

    const card = host().querySelector('[data-reconcile-card][data-svg-code="OLD"]');
    expect(card).not.toBeNull();
    // No default selection
    expect(card.querySelector('input[type="radio"]:checked')).toBeNull();

    const apply = host().querySelector('[data-action="submit-reconcile"]');
    expect(apply.disabled).toBe(true);

    // Choose "renamed to" radio, then pick a candidate in its select
    const renameRadio = card.querySelector('input[type="radio"][value="renamed-to"]');
    expect(renameRadio).not.toBeNull();
    renameRadio.checked = true;
    renameRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const select = card.querySelector('select');
    expect([...select.querySelectorAll('option')].some(o => o.value === 'NEW_B')).toBe(true);
    select.value = 'NEW_B';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(apply.disabled).toBe(false);
    apply.click();
    expect(submitted.map).toEqual({ OLD: { action: 'rename', to: 'NEW_B' } });
  });

  test('Cancel button invokes onCancel callback once', () => {
    const onCancel = jest.fn();
    renderReconcileWizard(host(), {
      floor: 1,
      removedRefs: [{ svgCode: 'OLD', affectedRowCount: 1 }],
      candidateTargets: [{ svgCode: 'NEW_A' }],
      renames: [],
    }, () => {}, onCancel);

    const cancel = host().querySelector('[data-action="cancel-reconcile"]');
    expect(cancel).not.toBeNull();
    expect(cancel.textContent).toMatch(/Cancel/i);

    cancel.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
