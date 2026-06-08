/**
 * @jest-environment jsdom
 *
 * Listener-leak regression (same class as #133): initCSVEditor registered a
 * fresh anonymous `localeChanged` document listener on every CSV-tab visit, so
 * after N visits one language toggle ran N re-renders. Bind exactly once.
 *
 * One test per file on purpose: jsdom `document` persists across tests in a
 * file and the leak attaches document listeners, so a second test here would
 * inherit the first's listeners.
 */
import { jest } from '@jest/globals';

let initCSVEditor;

beforeEach(async () => {
  jest.resetModules();
  document.body.innerHTML = `
    <div id="csv-editor">
      <div id="csv-toolbar"></div>
      <table id="csv-table"></table>
    </div>
  `;

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

async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); }

test('binds the localeChanged listener exactly once across repeated CSV-tab visits (leak class #133)', async () => {
  const addSpy = jest.spyOn(document, 'addEventListener');

  await initCSVEditor();
  await flush();
  await initCSVEditor();
  await flush();
  await initCSVEditor();
  await flush();

  const localeBinds = addSpy.mock.calls.filter((c) => c[0] === 'localeChanged').length;
  expect(localeBinds).toBe(1); // before the fix: 3 (one per visit)
});
