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
});
