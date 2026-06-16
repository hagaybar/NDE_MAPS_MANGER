/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// #190 — a per-row "Duplicate" action inserts a pre-filled copy directly below
// the source row (in context), reusing the existing values. Same harness as the
// save-gate test: real csv-validation/data-model, stubbed network + admin auth.
describe('csv-editor — duplicate row (#190)', () => {
  let initCSVEditor;
  let fetchSpy;

  const HEADERS = 'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe';
  const ROW0 = 'TAU,תל אביב,Stacks,מאגר,000,099,CB_0,d0,ד0,0,,,,';
  const ROW1 = 'TAU,תל אביב,Other,אחר,100,199,CC_1,d1,ד1,1,,,,';

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
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(`${HEADERS}\n${ROW0}\n${ROW1}`) });
      }
      if (u.includes('floor_0.svg')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg><rect id="CB_0" data-map-object="shelf"/></svg>') });
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg></svg>') });
    });
    global.fetch = fetchSpy;

    jest.unstable_mockModule('../auth-guard.js', () => ({
      __esModule: true, default: {}, isAdmin: () => true, applyRoleBasedUI: () => {},
    }));
    jest.unstable_mockModule('../app.js', () => ({
      getAuthHeaders: () => ({}), getCurrentUsername: () => 'tester',
    }));
    jest.unstable_mockModule('../components/toast.js', () => ({ showToast: jest.fn() }));

    const i18n = (await import('../i18n.js?v=5')).default;
    i18n.setLocale('en');

    initCSVEditor = (await import('../components/csv-editor.js')).initCSVEditor;
    await initCSVEditor();
    await Promise.resolve();
  });

  const rowInputs = (tr) => [...tr.querySelectorAll('input.csv-input')].map((i) => i.value);

  test('each row has a Duplicate action', () => {
    const firstRow = document.querySelector('#csv-table tr[data-row-index="0"]');
    expect(firstRow.querySelector('.btn-duplicate-row')).toBeTruthy();
  });

  test('duplicating a row inserts a matching copy directly below it', () => {
    const before = document.querySelectorAll('#csv-table tr[data-row-index]');
    expect(before.length).toBe(2);
    const row0Values = rowInputs(before[0]);

    before[0].querySelector('.btn-duplicate-row').click();

    const after = document.querySelectorAll('#csv-table tr[data-row-index]');
    expect(after.length).toBe(3);                         // exactly one new row
    expect(rowInputs(after[1])).toEqual(row0Values);       // copy sits directly below, pre-filled
    expect(rowInputs(after[0])).toEqual(row0Values);       // original row 0 unchanged
    // The row that used to be second is now third (pushed down, not overwritten).
    expect(rowInputs(after[2])[6]).toBe('CC_1');           // svgCode column of the old row 1
  });
});
