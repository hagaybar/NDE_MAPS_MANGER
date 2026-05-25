/** @jest-environment jsdom */
import { jest } from '@jest/globals';

function seed() { document.body.innerHTML = '<div id="svg-manager"></div><div id="toast-container"></div>'; }
const flush = () => new Promise(r => setTimeout(r, 0));

describe('#50 producer — svg-manager dispatches svg-promoted', () => {
  let fetchSpy;
  beforeEach(() => { jest.resetModules(); window.__USE_STAGING_FLOW__ = true; });
  afterEach(() => { fetchSpy?.mockRestore(); delete window.__USE_STAGING_FLOW__; });

  async function run({ promoteOk, promoteJson }) {
    seed();
    const statusGreen = { locked: true, owner: 'unknown', files: ['maps/floor_1.svg'],
      lastValidated: { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } } };
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
      const u = typeof url === 'string' ? url : '';
      if (u.includes('/api/svg') && (!opts.method || opts.method === 'GET'))
        return { ok: true, json: async () => ({ success: true, files: [] }) };
      if (u.includes('/api/staging/status')) return { ok: true, json: async () => statusGreen };
      if (u.includes('/api/staging/promote')) return { ok: promoteOk, status: promoteOk ? 200 : 422, json: async () => promoteJson };
      return { ok: true, json: async () => ({}) };
    });
    const mod = await import('../components/svg-manager.js');
    mod.initSVGManager();
    for (let i = 0; i < 8; i++) await flush();
    document.querySelector('[data-action="promote-staging"]').click();
    for (let i = 0; i < 8; i++) await flush();
  }

  test('dispatches svg-promoted with promotedVersions on a 200 promote', async () => {
    const events = [];
    const listener = e => events.push(e);
    document.addEventListener('svg-promoted', listener);
    try {
      await run({ promoteOk: true, promoteJson: { ok: true, promotedVersions: { 'maps/floor_1.svg': 'updated' } } });
      expect(events).toHaveLength(1);
      expect(events[0].detail).toHaveProperty('promotedVersions');
      expect(events[0].detail.promotedVersions).toEqual({ 'maps/floor_1.svg': 'updated' });
      expect(typeof events[0].detail.ts).toBe('number');
    } finally { document.removeEventListener('svg-promoted', listener); }
  });

  test('does NOT dispatch on a non-2xx promote', async () => {
    const events = [];
    const listener = e => events.push(e);
    document.addEventListener('svg-promoted', listener);
    try {
      await run({ promoteOk: false, promoteJson: { error: 'boom' } });
      expect(events).toHaveLength(0);
    } finally { document.removeEventListener('svg-promoted', listener); }
  });
});
