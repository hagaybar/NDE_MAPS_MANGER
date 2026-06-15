/**
 * @jest-environment jsdom
 *
 * Regression tests for #119: the Map Editor "edit in the table" orphan
 * deep-link (#csv-editor?orphans=floor=N) must be a VIEW filter only — it may
 * hide rows from view, but it must never change what Save writes. Before the
 * fix, applyUrlFilter() repointed csvData to the orphan subset and
 * buildFullCsvData() returned that subset for admins, so an admin who edited an
 * orphan and hit Save silently collapsed mapping.csv to a handful of rows.
 */
import { jest } from '@jest/globals';

describe('CSV Editor — orphan deep-link is a view filter, not a save filter (#119)', () => {
  let initCSVEditor;
  let savedBodies;

  // floor 1 has one orphan (empty svgCode); floor 2 has an assigned row that the
  // buggy subset-save would drop; floor 0 has an orphan on a different floor.
  const CSV = [
    'floor,svgCode,collectionName,rangeStart,rangeEnd',
    '1,shelf_a,Books,000,099',
    '1,,Books,100,199',
    '1,shelf_c,Books,200,299',
    '2,shelf_d,Music,000,099',
    '0,,Maps,000,099',
  ].join('\n');

  beforeEach(async () => {
    jest.resetModules();
    savedBodies = [];
    window.location.hash = '#csv-editor?orphans=floor=1';
    document.body.innerHTML = `<div id="csv-editor"></div>`;

    jest.unstable_mockModule('../components/toast.js', () => ({
      showToast: () => {},
    }));
    jest.unstable_mockModule('../auth-guard.js', () => ({
      isAdmin: () => true,
      applyRoleBasedUI: () => {},
    }));
    jest.unstable_mockModule('../app.js', () => ({
      getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
      getCurrentUsername: () => 'admin@test',
    }));
    jest.unstable_mockModule('../auth-service.js', () => ({
      default: { getAllowedRanges: () => null, getUser: () => ({ role: 'admin' }) },
    }));
    jest.unstable_mockModule('../services/data-model.js', () => ({
      getBrokenRefs: () => [],
      // csv-editor now imports csv-validation.js, which imports validateRow from
      // data-model.js. Provide a no-error stub so the import graph resolves and
      // the #187 save-gate stays inert for these view-filter / save assertions.
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

  test('does not collapse the dataset — all rows stay in the DOM, only non-orphans are hidden', async () => {
    await initCSVEditor();
    await flush();

    const allRows = document.querySelectorAll('#csv-table tr[data-row-index]');
    expect(allRows.length).toBe(5); // full dataset rendered, not the 1-row subset

    const visible = Array.from(allRows).filter((tr) => tr.style.display !== 'none');
    expect(visible.length).toBe(1); // only the floor-1 orphan is shown
    expect(visible[0].querySelector('input[data-column="svgCode"]').value).toBe('');
  });

  test('admin edits an orphan and Save writes the FULL file, not the visible subset', async () => {
    await initCSVEditor();
    await flush();

    const visibleRow = Array.from(document.querySelectorAll('#csv-table tr[data-row-index]'))
      .find((tr) => tr.style.display !== 'none');
    const input = visibleRow.querySelector('input[data-column="collectionName"]');
    input.value = 'EDITED';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    document.getElementById('btn-save').click();
    await flush();

    expect(savedBodies).toHaveLength(1);
    const csv = savedBodies[0].csvContent;
    const dataLines = csv.split('\n').slice(1).filter((l) => l.trim() !== '');
    expect(dataLines).toHaveLength(5); // all rows preserved, not collapsed to the orphan
    expect(csv).toContain('shelf_d'); // floor-2 assigned row survives
    expect(csv).toContain('EDITED'); // the orphan edit is applied
  });

  test("a 'Show all rows' control clears the orphan view filter", async () => {
    await initCSVEditor();
    await flush();

    const clearBtn = document.querySelector('[data-action="clear-orphan-filter"]');
    expect(clearBtn).not.toBeNull();

    clearBtn.click();
    await flush();

    const visible = Array.from(document.querySelectorAll('#csv-table tr[data-row-index]'))
      .filter((tr) => tr.style.display !== 'none');
    expect(visible.length).toBe(5);
  });
});
