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
});
