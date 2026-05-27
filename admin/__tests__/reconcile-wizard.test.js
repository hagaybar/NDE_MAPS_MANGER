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

describe('reconcile-wizard (Added group — #57)', () => {
  let renderReconcileWizard;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="wizard-host"></div>';
    const i18n = (await import('../i18n.js?v=5')).default;
    i18n.locale = 'en';
    ({ renderReconcileWizard } = await import('../components/svg-manager/reconcile-wizard.js'));
  });

  function host() { return document.getElementById('wizard-host'); }

  // Pick the "add now" radio of a card and dispatch change.
  function chooseAddNow(card) {
    const radio = card.querySelector('input[type="radio"][value="add-now"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function chooseLeave(card) {
    const radio = card.querySelector('input[type="radio"][value="leave"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function fillForm(card, fields) {
    Object.entries(fields).forEach(([name, val]) => {
      const input = card.querySelector(`[data-field="${name}"]`);
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  test('renders an Added card per newlyAddedShelves with Add/Leave choices', () => {
    renderReconcileWizard(host(), {
      floor: 1,
      newlyAddedShelves: [{ svgCode: 'NEW_1', floor: 1 }, { svgCode: 'NEW_2', floor: 1 }],
    }, () => {}, () => {});

    const cards = host().querySelectorAll('[data-added-card]');
    expect(cards.length).toBe(2);
    expect(cards[0].dataset.svgCode).toBe('NEW_1');
    expect(cards[1].dataset.svgCode).toBe('NEW_2');

    // Each card offers add-now + leave radios.
    cards.forEach(card => {
      expect(card.querySelector('input[type="radio"][value="add-now"]')).not.toBeNull();
      expect(card.querySelector('input[type="radio"][value="leave"]')).not.toBeNull();
    });

    // Apply disabled until each card has a choice.
    const apply = host().querySelector('[data-action="submit-added"]');
    expect(apply).not.toBeNull();
    expect(apply.disabled).toBe(true);

    // Not-real discard escape present.
    expect(host().querySelector('[data-action="discard-from-added"]')).not.toBeNull();
  });

  test('all cards chosen as leave enables Apply', () => {
    renderReconcileWizard(host(), {
      floor: 1,
      newlyAddedShelves: [{ svgCode: 'NEW_1', floor: 1 }, { svgCode: 'NEW_2', floor: 1 }],
    }, () => {}, () => {});

    const apply = host().querySelector('[data-action="submit-added"]');
    const cards = host().querySelectorAll('[data-added-card]');
    chooseLeave(cards[0]);
    expect(apply.disabled).toBe(true); // one card still unchosen
    chooseLeave(cards[1]);
    expect(apply.disabled).toBe(false);
  });

  test('choosing "add now" reveals the form; required fields gate Apply', () => {
    renderReconcileWizard(host(), {
      floor: 1,
      newlyAddedShelves: [{ svgCode: 'NEW_1', floor: 1 }],
    }, () => {}, () => {});

    const card = host().querySelector('[data-added-card]');
    const apply = host().querySelector('[data-action="submit-added"]');

    chooseAddNow(card);
    // Form revealed
    const form = card.querySelector('[data-add-form]');
    expect(form).not.toBeNull();
    expect(form.hidden).toBe(false);
    // svgCode + floor prefilled read-only
    const svgInput = card.querySelector('[data-field="svgCode"]');
    expect(svgInput.value).toBe('NEW_1');
    expect(svgInput.readOnly).toBe(true);
    const floorInput = card.querySelector('[data-field="floor"]');
    expect(floorInput.value).toBe('1');
    expect(floorInput.readOnly).toBe(true);

    // Apply still disabled: required fields empty.
    expect(apply.disabled).toBe(true);

    // Fill 3 of 4 required → still disabled.
    fillForm(card, { libraryName: 'Lib', collectionName: 'Coll', rangeStart: 'A1' });
    expect(apply.disabled).toBe(true);

    // Fill the 4th with valid range → enabled.
    fillForm(card, { rangeEnd: 'A9' });
    expect(apply.disabled).toBe(false);
  });

  test('invalid range (start>end) keeps Apply disabled', () => {
    renderReconcileWizard(host(), {
      floor: 1,
      newlyAddedShelves: [{ svgCode: 'NEW_1', floor: 1 }],
    }, () => {}, () => {});

    const card = host().querySelector('[data-added-card]');
    const apply = host().querySelector('[data-action="submit-added"]');
    chooseAddNow(card);
    fillForm(card, { libraryName: 'Lib', collectionName: 'Coll', rangeStart: 'A9', rangeEnd: 'A1' });
    expect(apply.disabled).toBe(true);
  });

  test('submit builds add entries from filled cards', () => {
    let captured = null;
    renderReconcileWizard(host(), {
      floor: 1,
      newlyAddedShelves: [{ svgCode: 'NEW_1', floor: 1 }],
    }, (floor, map, info) => { captured = { floor, map, info }; }, () => {});

    const card = host().querySelector('[data-added-card]');
    chooseAddNow(card);
    fillForm(card, { libraryName: 'Main', collectionName: 'Stacks', rangeStart: 'A1', rangeEnd: 'A9', notes: 'hi' });

    const apply = host().querySelector('[data-action="submit-added"]');
    expect(apply.disabled).toBe(false);
    apply.click();

    expect(captured.floor).toBe(1);
    expect(captured.map.NEW_1).toEqual({
      action: 'add',
      fields: expect.objectContaining({
        libraryName: 'Main',
        collectionName: 'Stacks',
        rangeStart: 'A1',
        rangeEnd: 'A9',
        notes: 'hi',
      }),
    });
  });

  test('leave-unmapped cards produce no map entry', () => {
    let captured = null;
    renderReconcileWizard(host(), {
      floor: 1,
      newlyAddedShelves: [{ svgCode: 'NEW_1', floor: 1 }, { svgCode: 'NEW_2', floor: 1 }],
    }, (floor, map, info) => { captured = { floor, map, info }; }, () => {});

    const cards = host().querySelectorAll('[data-added-card]');
    // NEW_1 add-now, NEW_2 leave
    chooseAddNow(cards[0]);
    fillForm(cards[0], { libraryName: 'Main', collectionName: 'Stacks', rangeStart: 'A1', rangeEnd: 'A9' });
    chooseLeave(cards[1]);

    const apply = host().querySelector('[data-action="submit-added"]');
    expect(apply.disabled).toBe(false);
    apply.click();

    expect(captured.map.NEW_1).toBeDefined();
    expect(captured.map.NEW_2).toBeUndefined();
    expect(Object.keys(captured.map)).toEqual(['NEW_1']);
    // leave-unmapped codes reported in the 3rd arg.
    expect(captured.info.leftUnmapped).toEqual(['NEW_2']);
  });

  test('Cancel button invokes onCancel callback once', () => {
    const onCancel = jest.fn();
    renderReconcileWizard(host(), {
      floor: 1,
      newlyAddedShelves: [{ svgCode: 'NEW_1', floor: 1 }],
    }, () => {}, onCancel);

    const cancel = host().querySelector('[data-action="cancel-added"]');
    expect(cancel).not.toBeNull();
    cancel.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
