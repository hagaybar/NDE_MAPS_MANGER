/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('reconcile-wizard', () => {
  let renderReconcileWizard;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="wizard-host"></div>';
    ({ renderReconcileWizard } = await import('../components/svg-manager/reconcile-wizard.js'));
  });

  test('renders one row per removed ref with rename/delete dropdown', () => {
    renderReconcileWizard(document.getElementById('wizard-host'), {
      floor: 1,
      removedRefs: [
        { svgCode: 'CC_X', affectedRowCount: 1 },
        { svgCode: 'CC_Y', affectedRowCount: 2 },
      ],
      addedShelves: [{ svgCode: 'CC_NEW' }, { svgCode: 'CC_OTHER' }],
    });
    const rows = document.querySelectorAll('[data-reconcile-row]');
    expect(rows).toHaveLength(2);
    rows.forEach(r => {
      expect(r.querySelector('select')).not.toBeNull();
    });
  });

  test('submit button is disabled until every row has an action selected', () => {
    renderReconcileWizard(document.getElementById('wizard-host'), {
      floor: 1,
      removedRefs: [
        { svgCode: 'CC_X', affectedRowCount: 1 },
      ],
      addedShelves: [{ svgCode: 'CC_NEW' }],
    });
    const submit = document.querySelector('[data-action="submit-reconcile"]');
    expect(submit.disabled).toBe(true);

    const select = document.querySelector('[data-reconcile-row] select');
    select.value = 'rename:CC_NEW';
    select.dispatchEvent(new Event('change'));

    expect(submit.disabled).toBe(false);
  });

  test('builds correct reconcileMap on submit', () => {
    const onSubmit = jest.fn();
    renderReconcileWizard(document.getElementById('wizard-host'), {
      floor: 1,
      removedRefs: [
        { svgCode: 'CC_X', affectedRowCount: 1 },
        { svgCode: 'CC_Y', affectedRowCount: 2 },
      ],
      addedShelves: [{ svgCode: 'CC_NEW' }],
    }, onSubmit);

    const selects = document.querySelectorAll('[data-reconcile-row] select');
    selects[0].value = 'rename:CC_NEW';
    selects[0].dispatchEvent(new Event('change'));
    selects[1].value = 'delete';
    selects[1].dispatchEvent(new Event('change'));

    // Mock confirm so the delete passes the affirmation
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    document.querySelector('[data-action="submit-reconcile"]').click();

    expect(confirmSpy).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(1, {
      'CC_X': { action: 'rename', to: 'CC_NEW' },
      'CC_Y': { action: 'delete' },
    });

    confirmSpy.mockRestore();
  });

  test('a detected rename is pre-selected with a hint, and submit yields rename old->new', () => {
    const h = document.getElementById('wizard-host');
    let submitted = null;
    renderReconcileWizard(h, {
      floor: 1,
      removedRefs: [{ svgCode: 'CC_1-4', affectedRowCount: 2 }],
      candidateTargets: [{ svgCode: 'CC_X-Y' }],
      renames: [{ fromCode: 'CC_1-4', toCode: 'CC_X-Y' }],
    }, (floor, map) => { submitted = { floor, map }; });
    const row = h.querySelector('[data-reconcile-row][data-svg-code="CC_1-4"]');
    expect(row.querySelector('select').value).toBe('rename:CC_X-Y');           // pre-selected
    expect(row.textContent).toMatch(/detected/i);                              // hint shown
    expect(h.querySelector('[data-action="submit-reconcile"]').disabled).toBe(false); // pre-selected ⇒ ready
    h.querySelector('[data-action="submit-reconcile"]').click();
    expect(submitted.map).toEqual({ 'CC_1-4': { action: 'rename', to: 'CC_X-Y' } });
  });

  test('treat-as-separate: switching a detected row to delete yields a delete action', () => {
    const h = document.getElementById('wizard-host'); let submitted = null;
    window.confirm = () => true;
    renderReconcileWizard(h, { floor: 1, removedRefs:[{svgCode:'CC_1-4',affectedRowCount:1}], candidateTargets:[{svgCode:'CC_X-Y'}], renames:[{fromCode:'CC_1-4',toCode:'CC_X-Y'}] }, (f,m)=>{submitted={f,m}});
    const sel = h.querySelector('[data-reconcile-row] select'); sel.value='delete'; sel.dispatchEvent(new Event('change'));
    h.querySelector('[data-action="submit-reconcile"]').click();
    expect(submitted.m).toEqual({ 'CC_1-4': { action: 'delete' } });
  });

  test('un-detected removed ref can be renamed to any candidate target', () => {
    const h = document.getElementById('wizard-host'); let submitted=null;
    renderReconcileWizard(h, { floor:1, removedRefs:[{svgCode:'OLD',affectedRowCount:1}], candidateTargets:[{svgCode:'NEW_A'},{svgCode:'NEW_B'}], renames:[] }, (f,m)=>{submitted={f,m}});
    const row=h.querySelector('[data-reconcile-row]');
    expect(row.querySelector('select').value).toBe('');                        // not pre-selected
    expect([...row.querySelectorAll('option')].some(o=>o.value==='rename:NEW_B')).toBe(true);
    row.querySelector('select').value='rename:NEW_B'; row.querySelector('select').dispatchEvent(new Event('change'));
    h.querySelector('[data-action="submit-reconcile"]').click();
    expect(submitted.m).toEqual({ 'OLD': { action: 'rename', to: 'NEW_B' } });
  });
});
