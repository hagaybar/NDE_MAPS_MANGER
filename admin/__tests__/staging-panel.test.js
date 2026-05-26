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
    expect(document.getElementById('staging-panel-host').textContent)
      .toContain('No map is waiting for review');
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
    expect(host.innerHTML).not.toContain('no CSV changes needed');
    expect(text).toContain('The map you sent looks fine'); // plain passed headline
    expect(text).toContain('X');   // newly added shelf listed
    expect(text).toContain('ORPH'); // pre-existing unmapped listed
    expect(text).toContain('Floor 1:');
    // Zero-count sections are HIDDEN now (#73): the "unlinked" line must not
    // appear when removedRefs is empty. Target the unlinked line's distinctive
    // phrase (NOT /library entr/, which also matches the newlyAdded hint copy).
    expect(text).not.toContain("point to shelves that aren't on this map anymore");
    // Promote button present with the new label + unchanged data-action.
    expect(host.querySelector('[data-action="promote-staging"]').textContent)
      .toContain('Start using this map');
  });

  test('GREEN state surfaces detected renames as one "same shelf" line, not add+remove', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: true,
      owner: 'alice',
      files: ['maps/floor_1.svg'],
      lastValidated: {
        ok: true,
        errors: [],
        summary: {
          renames: [{ fromCode: 'CC_1-4', toCode: 'CC_X-Y', floor: 1, via: 'uid' }],
          newlyAddedShelves: [{ svgCode: 'NEW_ADD', floor: 2 }],
          removedShelves: [{ svgCode: 'GONE', floor: 0 }],
          removedRefs: [],
          unmappedShelves: [],
        },
      },
    });
    const host = document.getElementById('staging-panel-host');
    const text = host.textContent;

    // The renamed pair renders as a single floor-led "old → new" line.
    expect(text).toContain('CC_1-4 → CC_X-Y');
    expect(text).toContain('Floor 1:');

    // A reassuring "same shelf" note distinguishes it from a real add/remove.
    expect(text).toContain('same shelf');

    // The renamed codes must NOT also appear under newly-added/removed sections.
    // Locate the renamed line, then scope the search to the rest of the panel.
    expect(text.match(/CC_1-4/g)).toHaveLength(1);
    expect(text.match(/CC_X-Y/g)).toHaveLength(1);

    // Genuine add/remove still render alongside the rename section.
    expect(text).toContain('NEW_ADD');
    expect(text).toContain('GONE');

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
    expect(host.textContent).toContain("don't match your shelf data");
    expect(host.querySelector('[data-action="open-reconcile-wizard"]').textContent)
      .toContain('Fix the mismatches');
    expect(host.querySelector('[data-action="discard-staging"]')).not.toBeNull();
  });

  test('renders lock-held-by-other warning when owner is different', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: true,
      owner: 'bob',
      files: ['maps/floor_1.svg'],
      lastValidated: null,
    }, { currentUser: 'alice' });
    expect(document.getElementById('staging-panel-host').textContent)
      .toMatch(/is working on a map right now/);
    expect(document.getElementById('staging-panel-host').querySelector('[data-action="promote-staging"]')).toBeNull();
  });

  test('renders awaiting state with the Check-the-map button', () => {
    const host = document.getElementById('staging-panel-host');
    renderStagingPanel(host, { locked: true, owner: 'alice', files: ['maps/floor_1.svg'], lastValidated: null });
    expect(host.textContent).toContain("I haven't checked this map yet");
    expect(host.querySelector('[data-action="validate-staging"]').textContent).toContain('Check the map');
  });
});
