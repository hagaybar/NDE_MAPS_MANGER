/**
 * @jest-environment jsdom
 *
 * Regression test for #120: the broken-refs inline "Delete row" must remove the
 * row correctly for a range-restricted (non-admin) editor.
 *
 * The buggy handler did `csvData.splice(idx, 1)` only — it never nulled
 * `allCsvData[originalIndex]` nor spliced `originalIndices`, unlike the canonical
 * deleteRow(). For a filtered editor, buildFullCsvData() remaps each filtered row
 * back to allCsvData via originalIndices, so the one-off desync silently:
 *   - keeps the "deleted" row in the saved file (never nulled), and
 *   - shifts every following filtered row onto the previous row's source slot,
 *     duplicating the last row and dropping its edits.
 *
 * Admins are immune (buildFullCsvData returns csvData verbatim), so this asserts
 * at the editor save boundary — the CSV body PUT to /api/csv.
 */
import { jest } from '@jest/globals';

describe('CSV Editor — broken-refs Delete row for a filtered editor (#120)', () => {
  let initCSVEditor;
  let savedBodies;

  // 5 rows, distinct collectionName markers. Row index 2 (ColBROKEN) is the
  // broken ref the editor will delete. The editor's allowed ranges are
  // unrestricted, so the filtered view is the full dataset but isFiltered=true
  // (non-admin) — the exact condition under which the desync corrupts the save.
  const CSV = [
    'floor,svgCode,collectionName,rangeStart,rangeEnd',
    '1,shelf_a,ColA,000,099',
    '1,shelf_b,ColB,100,199',
    '1,MISSING,ColBROKEN,200,299',
    '1,shelf_d,ColC,300,399',
    '1,shelf_e,ColD,400,499',
  ].join('\n');

  beforeEach(async () => {
    jest.resetModules();
    savedBodies = [];
    window.location.hash = '#csv-editor';
    document.body.innerHTML = `<div id="csv-editor"></div>`;

    jest.unstable_mockModule('../components/toast.js', () => ({
      showToast: () => {},
    }));
    // Non-admin editor → the filtered save path (isFiltered=true). csv-editor
    // imports '../auth-guard.js?v=5', which admin/jest.config.js maps to a mock
    // file hardcoding isAdmin()=true; mock that exact specifier to flip it.
    jest.unstable_mockModule('../auth-guard.js?v=5', () => ({
      isAdmin: () => false,
      applyRoleBasedUI: () => {},
    }));
    jest.unstable_mockModule('../app.js', () => ({
      getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
      getCurrentUsername: () => 'editor@test',
    }));
    // Unrestricted range config → filtered view covers all rows.
    jest.unstable_mockModule('../auth-service.js', () => ({
      default: {
        getAllowedRanges: () => ({
          enabled: true,
          filterGroups: [{ collections: [], floors: [], callNumberRanges: [] }],
        }),
        getUser: () => ({ role: 'editor' }),
      },
    }));
    // The broken ref is the row whose svgCode === 'MISSING'. Make the mock
    // DATA-DRIVEN (mirrors the real getBrokenRefs) so it reflects deletions:
    // once the MISSING row is removed, no broken ref is reported. This keeps the
    // broken-refs filter working on load AND lets the #187 save-gate unblock
    // after the broken row is deleted, instead of blocking on a stale rowIndex.
    jest.unstable_mockModule('../services/data-model.js', () => ({
      getBrokenRefs: (rows = []) => rows
        .filter((r) => String(r.svgCode) === 'MISSING')
        .map((r) => ({ rowIndex: r.rowIndex, svgCode: r.svgCode, floor: r.floor, type: 'shelf-not-found' })),
      // csv-editor now imports csv-validation.js, which imports validateRow from
      // data-model.js. Provide a no-error stub so the import graph resolves and
      // the #187 save-gate stays inert for these delete-behavior assertions.
      validateRow: () => ({ errors: [], warnings: [] }),
    }));
    jest.unstable_mockModule('../services/svg-shelves.js', () => ({
      parseSvg: () => ({ shelves: [] }),
    }));

    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const u = String(url);
      const method = (opts && opts.method) || 'GET';
      if (u.endsWith('/api/csv') && method === 'PUT') {
        savedBodies.push(JSON.parse(opts.body));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) });
      }
      if (u.endsWith('.csv')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(CSV), json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg></svg>'), json: () => Promise.resolve({}) });
    });

    ({ initCSVEditor } = await import('../components/csv-editor.js'));
  });

  afterEach(() => { window.location.hash = ''; });

  async function flush() {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  }

  test('deleting a broken row drops exactly that row and leaves every other row intact', async () => {
    await initCSVEditor();
    await flush();

    // Sanity: the filtered editor sees all 5 rows rendered.
    const rows = document.querySelectorAll('#csv-table tr[data-row-index]');
    expect(rows.length).toBe(5);

    // Activate the broken-refs filter, then delete the broken row.
    document.querySelector('[data-action="toggle-broken-refs"]').click();
    const deleteBtn = document.querySelector('tr[data-row-index="2"] button[data-action="delete-broken-row"]');
    expect(deleteBtn).not.toBeNull();

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    deleteBtn.click();
    confirmSpy.mockRestore();

    document.getElementById('btn-save').click();
    await flush();

    expect(savedBodies).toHaveLength(1);
    const csv = savedBodies[0].csvContent;
    const dataLines = csv.split('\n').slice(1).filter((l) => l.trim() !== '');

    // Exactly one row removed — no count drift.
    expect(dataLines.length).toBe(4);

    // The four survivors each appear exactly once; the deleted row is gone.
    const count = (marker) => dataLines.filter((l) => l.includes(marker)).length;
    expect(count('ColBROKEN')).toBe(0); // deleted
    expect(count('ColA')).toBe(1);
    expect(count('ColB')).toBe(1);
    expect(count('ColC')).toBe(1); // not overwritten by its neighbour
    expect(count('ColD')).toBe(1); // not duplicated
  });
});
