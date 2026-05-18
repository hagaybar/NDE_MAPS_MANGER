/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('staging-panel', () => {
  let renderStagingPanel;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="staging-panel-host"></div>';
    ({ renderStagingPanel } = await import('../components/svg-manager/staging-panel.js'));
  });

  test('renders empty state when no staging active', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: false, owner: null, files: [], lastValidated: null,
    });
    const host = document.getElementById('staging-panel-host');
    expect(host.textContent).toMatch(/no staging/i);
  });

  test('renders active staging with GREEN state and Promote button', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: true,
      owner: 'alice',
      files: ['maps/floor_1.svg'],
      lastValidated: { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } },
    });
    const host = document.getElementById('staging-panel-host');
    expect(host.querySelector('[data-action="promote-staging"]')).not.toBeNull();
    expect(host.querySelector('[data-action="discard-staging"]')).not.toBeNull();
  });

  test('renders RED state with reconcile wizard CTA', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: true,
      owner: 'alice',
      files: ['maps/floor_1.svg'],
      lastValidated: {
        ok: false,
        errors: [{ rowIndex: 5, svgCode: 'CC_X', floor: 1, type: 'shelf-not-found' }],
        summary: {
          addedShelves: [{ svgCode: 'CC_NEW', floor: 1 }],
          removedRefs: [{ svgCode: 'CC_X', floor: 1, affectedRowCount: 1 }],
        },
      },
    });
    const host = document.getElementById('staging-panel-host');
    expect(host.querySelector('[data-action="open-reconcile-wizard"]')).not.toBeNull();
    expect(host.querySelector('[data-action="discard-staging"]')).not.toBeNull();
  });

  test('renders lock-held-by-other warning when owner is different', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: true,
      owner: 'bob',
      files: ['maps/floor_1.svg'],
      lastValidated: null,
    }, { currentUser: 'alice' });
    const host = document.getElementById('staging-panel-host');
    expect(host.textContent).toMatch(/in use by bob/i);
    expect(host.querySelector('[data-action="promote-staging"]')).toBeNull();
  });
});
