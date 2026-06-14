/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// Real validateDataset + data-model (so the gate is exercised end-to-end),
// but stub the network and auth-guard (admin). Floor-1 SVG lacks the shelf so
// E006/E001 paths are reachable without real SVG fetches.
describe('csv-editor — save gate (#187)', () => {
  let initCSVEditor, addRowForTest, saveForTest, updateProblemIndicatorForTest;
  let fetchSpy, toastSpy;

  const HEADERS = 'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe';
  // One valid row (CB_0 on floor 0) + header. CB_0 is in the floor_0 SVG mock.
  const VALID_ROW = 'TAU,תל אביב,Stacks,מאגר,000,099,CB_0,d,ד,0,,,,';

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="csv-editor">
        <div id="csv-toolbar"></div>
        <button id="btn-add-row"></button>
        <button id="btn-save"></button>
        <input id="csv-search" />
        <div id="filter-info-banner"></div>
        <div id="table-container"></div>
      </div>
      <div id="toast-container"></div>`;

    fetchSpy = jest.fn().mockImplementation((url) => {
      const u = String(url);
      if (u.endsWith('mapping.csv')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(`${HEADERS}\n${VALID_ROW}`) });
      }
      if (u.includes('floor_0.svg')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg><rect id="CB_0" data-map-object="shelf"/></svg>') });
      }
      if (u.endsWith('.svg')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg></svg>') });
      }
      // PUT /api/csv
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) });
    });
    global.fetch = fetchSpy;

    // Mock the bare specifiers — jest's ESM mock registry strips the `?v=5`
    // query, so mocking '../app.js' / '../auth-guard.js' also intercepts the
    // '...?v=5' imports the editor uses. isAdmin() must be true so loadCSV()
    // takes the admin branch and populates csvData (the editor branch
    // early-returns with empty data).
    jest.unstable_mockModule('../auth-guard.js', () => ({
      __esModule: true,
      default: {},
      isAdmin: () => true,
      applyRoleBasedUI: () => {},
    }));
    jest.unstable_mockModule('../app.js', () => ({
      getAuthHeaders: () => ({}),
      getCurrentUsername: () => 'tester',
    }));
    // ESM module namespaces are read-only, so the real showToast can't be
    // spied with jest.spyOn. Mock the toast module with a jest.fn() and assert
    // on the message argument (the stable boundary: what text the user sees).
    toastSpy = jest.fn();
    jest.unstable_mockModule('../components/toast.js', () => ({ showToast: toastSpy }));

    const mod = await import('../components/csv-editor.js');
    initCSVEditor = mod.initCSVEditor;
    // helpers exported in Step 3 for test access:
    addRowForTest = mod.__addRowForTest;
    saveForTest = mod.__saveForTest;
    updateProblemIndicatorForTest = mod.__updateProblemIndicatorForTest;

    await initCSVEditor();
    // Let the awaited SVG loads settle.
    await Promise.resolve();
  });

  test('a blocking row prevents the PUT (no /api/csv call)', async () => {
    addRowForTest();                 // pushes an all-empty row → E001 on every required field
    fetchSpy.mockClear();
    await saveForTest();
    const putCalls = fetchSpy.mock.calls.filter(([u, opts]) => String(u).includes('/api/csv') && opts?.method === 'PUT');
    expect(putCalls.length).toBe(0); // gate blocked the save
  });

  test('warnings-only saves (PUT happens)', async () => {
    // The loaded file is fully valid (no blocking, no warnings) → save proceeds.
    fetchSpy.mockClear();
    await saveForTest();
    const putCalls = fetchSpy.mock.calls.filter(([u, opts]) => String(u).includes('/api/csv') && opts?.method === 'PUT');
    expect(putCalls.length).toBe(1);
  });

  test('a server 422 surfaces the server message, not the generic toast', async () => {
    // Force the PUT to return a specific 422 body. The file is valid so the
    // gate passes and the request is actually sent.
    fetchSpy.mockImplementation((url, opts) => {
      const u = String(url);
      if (u.includes('/api/csv') && opts?.method === 'PUT') {
        return Promise.resolve({
          ok: false, status: 422,
          json: () => Promise.resolve({ error: 'Bundle invariant violation' }),
        });
      }
      if (u.endsWith('mapping.csv')) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(`${HEADERS}\n${VALID_ROW}`) });
      if (u.includes('floor_0.svg')) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg><rect id="CB_0" data-map-object="shelf"/></svg>') });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg></svg>') });
    });

    toastSpy.mockClear();
    await saveForTest();

    const messages = toastSpy.mock.calls.map(c => c[0]);
    expect(messages.some(m => /Bundle invariant violation/.test(m))).toBe(true);
  });
});
