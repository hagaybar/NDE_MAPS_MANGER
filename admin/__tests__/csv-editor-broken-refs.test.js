/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('CSV Editor — Broken refs filter', () => {
  let initCSVEditor;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="csv-editor">
        <div id="csv-toolbar"></div>
        <table id="csv-table"></table>
      </div>
    `;

    // Stub fetch so loadCSV and the floor SVG fetches don't blow up.
    // Returns an empty CSV (header only) and a minimal SVG body for any URL,
    // plus an empty JSON object for transitive i18n.init() calls.
    global.fetch = jest.fn().mockImplementation((url) => {
      const u = String(url);
      if (u.endsWith('.csv')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('floor,svgCode\n'),
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<svg></svg>'),
        json: () => Promise.resolve({}),
      });
    });

    // Mock data-model.getBrokenRefs.
    // csv-editor.js itself only needs getBrokenRefs, but it transitively pulls
    // app.js -> svg-parser.js / validation.js / errors-dashboard.js /
    // edit-location-dialog.js / orphan-deriver.js / range-validation.js, which
    // import a wider surface from data-model.js. We stub the symbols those
    // import paths use so the import graph resolves.
    jest.unstable_mockModule('../services/data-model.js', () => ({
      getBrokenRefs: jest.fn().mockReturnValue([
        { rowIndex: 2, svgCode: 'MISSING', floor: 0, type: 'shelf-not-found' },
      ]),
      // Stubs required by transitive imports through app.js etc.
      FLOOR_VALUES: ['0', '1', '2'],
      REQUIRED_FIELDS: [],
      VALIDATION_ERRORS: {},
      VALIDATION_WARNINGS: {},
      VALIDATION_RULES: {},
      validateRow: jest.fn().mockReturnValue({ errors: [], warnings: [] }),
      getRowKey: jest.fn().mockReturnValue(''),
      parseRangeValue: jest.fn().mockReturnValue(null),
      parseRangeBoundary: jest.fn().mockReturnValue(null),
      doRangesOverlap: jest.fn().mockReturnValue(false),
      loadCsv: jest.fn().mockResolvedValue({ rows: [], svgShelfIdsByFloor: {} }),
    }));

    ({ initCSVEditor } = await import('../components/csv-editor.js'));
  });

  test('renders a "Show only broken refs" toggle in the toolbar', async () => {
    initCSVEditor();
    // Allow async fetches in initCSVEditor to resolve so renderBrokenRefsToggle runs.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
    expect(toggle).not.toBeNull();
  });

  test('toggle shows live count of broken refs', async () => {
    initCSVEditor();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
    expect(toggle.textContent).toMatch(/\(1\)/);
  });

  test('clicking the toggle filters the table to only broken-ref rows', async () => {
    initCSVEditor();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // initCSVEditor() rewrites the #csv-editor container, replacing the test
    // setup's <table id="csv-table"> with a <div id="table-container"> that,
    // in the empty-CSV / no-access mock paths used here, never contains a
    // table. Re-inject a #csv-table so the filter has rows to act on.
    let csvTable = document.getElementById('csv-table');
    if (!csvTable) {
      csvTable = document.createElement('table');
      csvTable.id = 'csv-table';
      (document.getElementById('table-container') || document.body).appendChild(csvTable);
    }
    // Pretend we have 4 rows, only row 2 is broken
    csvTable.innerHTML = `
      <tr data-row-index="0"><td>OK</td></tr>
      <tr data-row-index="1"><td>OK</td></tr>
      <tr data-row-index="2"><td>BROKEN</td></tr>
      <tr data-row-index="3"><td>OK</td></tr>
    `;
    const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
    toggle.click();
    // After click, only the broken row should be visible
    const visibleRows = Array.from(document.querySelectorAll('#csv-table tr'))
      .filter(tr => tr.style.display !== 'none');
    expect(visibleRows).toHaveLength(1);
    expect(visibleRows[0].dataset.rowIndex).toBe('2');
  });

  test('each broken row gets an inline "Rename to" dropdown listing unclaimed shelves on its floor', async () => {
    initCSVEditor();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Override broken refs to a known shape
    const mock = await import('../services/data-model.js');
    mock.getBrokenRefs.mockReturnValue([
      { rowIndex: 0, svgCode: 'MISSING', floor: 0, type: 'shelf-not-found' },
    ]);
    // Re-inject #csv-table same as the prior test (initCSVEditor rewrites the container)
    let csvTable = document.getElementById('csv-table');
    if (!csvTable) {
      csvTable = document.createElement('table');
      csvTable.id = 'csv-table';
      (document.getElementById('table-container') || document.body).appendChild(csvTable);
    }
    csvTable.innerHTML = `
      <tr data-row-index="0"><td class="svg-code-cell">MISSING</td></tr>
    `;
    const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
    toggle.click();

    const dropdown = document.querySelector('tr[data-row-index="0"] select[data-action="rename-svgcode"]');
    expect(dropdown).not.toBeNull();
  });

  test('each broken row has a "Delete row" button that prompts before deleting', async () => {
    initCSVEditor();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Override broken refs to a known shape
    const mock = await import('../services/data-model.js');
    mock.getBrokenRefs.mockReturnValue([
      { rowIndex: 0, svgCode: 'MISSING', floor: 0, type: 'shelf-not-found' },
    ]);
    // Re-inject #csv-table same as the prior tests (initCSVEditor rewrites the container)
    let csvTable = document.getElementById('csv-table');
    if (!csvTable) {
      csvTable = document.createElement('table');
      csvTable.id = 'csv-table';
      (document.getElementById('table-container') || document.body).appendChild(csvTable);
    }
    csvTable.innerHTML = `
      <tr data-row-index="0"><td class="svg-code-cell">MISSING</td></tr>
    `;
    const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
    toggle.click();

    const deleteBtn = document.querySelector('tr[data-row-index="0"] button[data-action="delete-broken-row"]');
    expect(deleteBtn).not.toBeNull();

    // Mock window.confirm to return true
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    deleteBtn.click();
    expect(confirmSpy).toHaveBeenCalled();
    // The row should be marked for deletion (or removed from csvData)
    confirmSpy.mockRestore();
  });
});
