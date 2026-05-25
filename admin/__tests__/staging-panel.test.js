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
    // Force English so FALLBACKS resolve to the en strings asserted below
    // (default locale is 'he'; same idiom as staging-progress-modal.test.js).
    const i18n = (await import('../i18n.js?v=5')).default;
    i18n.locale = 'en';
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

  test('GREEN state renders honest sections, not "no CSV changes needed"', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: true,
      owner: 'alice',
      files: ['maps/floor_1.svg'],
      lastValidated: {
        ok: true,
        errors: [],
        summary: {
          newlyAddedShelves: [{ svgCode: 'X', floor: 1 }],
          removedShelves: [{ svgCode: 'Y', floor: 1 }],
          removedRefs: [],
          unmappedShelves: [
            { svgCode: 'X', floor: 1 },
            { svgCode: 'ORPH', floor: 1 },
          ],
        },
      },
    });
    const host = document.getElementById('staging-panel-host');
    const text = host.textContent;

    // The misleading legacy string must be gone.
    expect(host.innerHTML).not.toContain('no CSV changes needed');

    // Newly added: count 1 + the id X.
    expect(text).toMatch(/1/);
    expect(text).toContain('X');

    // Removed shelves: count 1 + the id Y.
    expect(text).toContain('Y');

    // Library entries unlinked: explicit zero.
    expect(text).toMatch(/0 library entries will be unlinked/i);

    // Pre-existing unmapped = unmapped minus newly-added = ORPH (count 1).
    expect(text).toContain('ORPH');
    // Promote still available.
    expect(host.querySelector('[data-action="promote-staging"]')).not.toBeNull();
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
