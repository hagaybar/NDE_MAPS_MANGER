/** @jest-environment jsdom */
import { jest } from '@jest/globals';

function seed() { document.body.innerHTML = '<div id="svg-manager"></div><div id="toast-container"></div>'; }
const flush = () => new Promise(r => setTimeout(r, 0));

describe('#50 — SVG Manager map preview refreshes after promote', () => {
  let fetchSpy;
  beforeEach(() => { jest.resetModules(); window.__USE_STAGING_FLOW__ = true; });
  afterEach(() => { fetchSpy?.mockRestore(); delete window.__USE_STAGING_FLOW__; });

  test('thumbnail src gains ?v= for a promoted map', async () => {
    seed();
    const statusGreen = { locked: true, owner: 'unknown', files: ['maps/floor_1.svg'],
      lastValidated: { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } } };
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
      const u = typeof url === 'string' ? url : '';
      if (u.includes('/api/svg') && (!opts.method || opts.method === 'GET'))
        return { ok: true, json: async () => ({ success: true, files: [{ name: 'floor_1.svg', size: 1234 }] }) };
      if (u.includes('/api/staging/status')) return { ok: true, json: async () => statusGreen };
      if (u.includes('/api/staging/promote'))
        return { ok: true, status: 200, json: async () => ({ ok: true, promotedVersions: { 'maps/floor_1.svg': 'updated' } }) };
      return { ok: true, json: async () => ({}) };
    });

    const mod = await import('../components/svg-manager.js');
    mod.initSVGManager();
    for (let i = 0; i < 8; i++) await flush();

    const before = document.querySelector('#svg-grid img');
    expect(before.getAttribute('src')).toContain('/maps/floor_1.svg');
    expect(before.getAttribute('src')).not.toContain('?v=');

    document.querySelector('[data-action="promote-staging"]').click();
    for (let i = 0; i < 8; i++) await flush();

    const after = document.querySelector('#svg-grid img');
    expect(after.getAttribute('src')).toMatch(/\/maps\/floor_1\.svg\?v=/);
  });
});
