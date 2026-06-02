/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('csv-editor — CSV fetch cache behavior', () => {
  let initCSVEditor;
  let fetchSpy;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="csv-editor">
        <div id="csv-toolbar"></div>
        <table id="csv-table"></table>
      </div>
    `;

    fetchSpy = jest.fn().mockImplementation((url) => {
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
    global.fetch = fetchSpy;

    jest.unstable_mockModule('../services/data-model.js', () => ({
      getBrokenRefs: jest.fn().mockReturnValue([]),
      FLOOR_VALUES: ['0', '1', '2'],
      REQUIRED_FIELDS: [],
      VALIDATION_ERRORS: {},
      VALIDATION_WARNINGS: {},
      VALIDATION_RULES: {},
      validateRow: jest.fn().mockReturnValue({ errors: [], warnings: [] }),
      getRowKey: jest.fn().mockReturnValue(''),
      parseRangeValue: jest.fn().mockReturnValue(null),
      parseRangeBoundary: jest.fn().mockReturnValue(null),
      compareCallNumbers: jest.fn((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      doRangesOverlap: jest.fn().mockReturnValue(false),
      findOverlappingRanges: jest.fn().mockReturnValue([]),
      loadCsv: jest.fn().mockResolvedValue({ rows: [], svgShelfIdsByFloor: {} }),
    }));

    ({ initCSVEditor } = await import('../components/csv-editor.js'));
  });

  test('mapping.csv fetch passes cache: "no-cache" so reloads after save see fresh data', async () => {
    initCSVEditor();
    // Allow async fetches in initCSVEditor to resolve.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const csvCalls = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/data/mapping.csv'));
    expect(csvCalls.length).toBeGreaterThan(0);
    const [, opts] = csvCalls[0];
    expect(opts).toEqual({ cache: 'no-cache' });
  });
});
