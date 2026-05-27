/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

const FAKE_CONTENT = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="x" /></svg>';

function makeFile(name, content = FAKE_CONTENT) {
  const f = new File([content], name, { type: 'image/svg+xml' });
  // jsdom's File doesn't always implement async .text(); pin it explicitly.
  f.text = async () => content;
  return f;
}

describe('svg-manager — replace + download (issue #35)', () => {
  let mod;
  let fetchSpy;
  let confirmSpy;
  let toastSpy;

  beforeEach(async () => {
    jest.resetModules();
    // showToast (admin/components/toast.js) appends into #toast-container.
    // Without it, every replaceFile call throws on the success-path toast.
    document.body.innerHTML = '<div id="svg-manager"></div><div id="toast-container"></div>';

    // Mock fetch globally
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
      // listSvg GET → empty list so initSVGManager doesn't blow up
      if (typeof url === 'string' && url.includes('/api/svg') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, json: () => Promise.resolve({ success: true, files: [] }) };
      }
      // POST → success by default
      return { ok: true, json: () => Promise.resolve({ success: true }) };
    });

    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    // Import the module under test AFTER mocks are in place.
    mod = await import('../components/svg-manager.js');
    // Toast/confirm copy assertions below are written against the English copy.
    const i18n = (await import('../i18n.js?v=5')).default;
    i18n.locale = 'en';
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    confirmSpy.mockRestore();
    if (toastSpy) toastSpy.mockRestore();
  });

  describe('replaceFile', () => {
    test('POSTs to /api/svg with filename overridden to the target (not file.name)', async () => {
      const file = makeFile('coworker-edit-floor_2-v3.svg');
      await mod.__test.replaceFile('floor_2.svg', file);

      const postCalls = fetchSpy.mock.calls.filter(([, opts]) => opts && opts.method === 'POST');
      expect(postCalls).toHaveLength(1);
      const [, opts] = postCalls[0];
      const body = JSON.parse(opts.body);
      expect(body.filename).toBe('floor_2.svg');
      expect(body.filename).not.toBe('coworker-edit-floor_2-v3.svg');
      expect(typeof body.content).toBe('string');
      expect(body.content).toContain('<svg');

      // Success toast names the floor derived from the target filename.
      const toastContainer = document.getElementById('toast-container');
      expect(toastContainer.textContent).toMatch(/the Floor 2 map is updated/i);
    });

    test('rejects non-SVG files without calling fetch', async () => {
      const file = new File(['not svg'], 'cat.png', { type: 'image/png' });
      const postCallsBefore = fetchSpy.mock.calls.filter(([, opts]) => opts && opts.method === 'POST').length;
      await mod.__test.replaceFile('floor_2.svg', file);
      const postCallsAfter = fetchSpy.mock.calls.filter(([, opts]) => opts && opts.method === 'POST').length;
      expect(postCallsAfter).toBe(postCallsBefore);
    });
  });

  describe('per-card markup', () => {
    test('renderGrid emits .btn-download and .btn-replace alongside preview + delete', () => {
      // renderGrid() writes to #svg-grid based on module-scope svgFiles.
      // Seed it via __test.setSvgFiles, then trigger renderGrid, then read the DOM.
      document.body.innerHTML = '<div id="svg-manager"><div id="svg-grid"></div></div>';
      mod.__test.setSvgFiles([{ name: 'floor_0.svg', size: 100, lastModified: '2026-05-12T00:00:00Z' }]);
      mod.__test.renderGrid();
      const html = document.getElementById('svg-grid').innerHTML;
      expect(html).toMatch(/class="[^"]*btn-preview/);
      expect(html).toMatch(/class="[^"]*btn-download/);
      expect(html).toMatch(/class="[^"]*btn-replace/);
      expect(html).toMatch(/class="[^"]*btn-delete/);
      // Replace carries the admin gating attribute, matching Delete.
      expect(html).toMatch(/btn-replace[^>]*data-role-required="admin"/);
    });
  });
});
