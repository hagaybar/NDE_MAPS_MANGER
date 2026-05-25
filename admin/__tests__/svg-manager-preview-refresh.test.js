/** @jest-environment jsdom */
import { jest } from '@jest/globals';

function seed() { document.body.innerHTML = '<div id="svg-manager"></div><div id="toast-container"></div>'; }

describe('#50 — SVG Manager map preview polls until fresh after promote', () => {
  let fetchSpy;
  beforeEach(() => { jest.resetModules(); jest.useFakeTimers(); window.__USE_STAGING_FLOW__ = true; });
  afterEach(() => { fetchSpy?.mockRestore(); delete window.__USE_STAGING_FLOW__; jest.useRealTimers(); });

  test('thumbnail src is busted only AFTER the served ETag changes, not immediately', async () => {
    seed();
    const statusGreen = { locked: true, owner: 'unknown', files: ['maps/floor_1.svg'],
      lastValidated: { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } } };
    // The map asset's ETag flips to "new" only after a couple of polls — emulating
    // the CloudFront invalidation propagating. The poll fetches the bare /maps URL
    // with a browser-cache-bust (`_=`) param.
    let mapEtagCalls = 0;
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
      const u = typeof url === 'string' ? url : '';
      if (u.includes('/maps/floor_1.svg')) {
        mapEtagCalls += 1;
        return { ok: true, headers: { get: (h) => (h.toLowerCase() === 'etag' ? (mapEtagCalls >= 3 ? '"new"' : '"old"') : null) } };
      }
      if (u.includes('/api/svg') && (!opts.method || opts.method === 'GET'))
        return { ok: true, json: async () => ({ success: true, files: [{ name: 'floor_1.svg', size: 1234 }] }) };
      if (u.includes('/api/staging/status')) return { ok: true, json: async () => statusGreen };
      if (u.includes('/api/staging/promote'))
        return { ok: true, status: 200, json: async () => ({ ok: true, promotedVersions: { 'maps/floor_1.svg': 'updated' } }) };
      return { ok: true, json: async () => ({}) };
    });

    const mod = await import('../components/svg-manager.js');
    mod.initSVGManager();
    await jest.advanceTimersByTimeAsync(0);

    const before = document.querySelector('#svg-grid img');
    expect(before.getAttribute('src')).toContain('/maps/floor_1.svg');
    expect(before.getAttribute('src')).not.toContain('?v=');

    document.querySelector('[data-action="promote-staging"]').click();
    await jest.advanceTimersByTimeAsync(0);

    // Immediately after the promote chain, the thumbnail must NOT yet be busted —
    // the poll has not seen a changed ETag, so the grid still shows the bare URL.
    const justAfter = document.querySelector('#svg-grid img');
    expect(justAfter.getAttribute('src')).not.toContain('?v=');

    // Advance through a couple of poll intervals so the served ETag flips to "new".
    await jest.advanceTimersByTimeAsync(12000);

    const after = document.querySelector('#svg-grid img');
    expect(after.getAttribute('src')).toMatch(/\/maps\/floor_1\.svg\?v=/);
  });

  test('busts the thumbnail even when CloudFront is already fresh by the time the poll starts (baseline captured PRE-promote)', async () => {
    seed();
    const statusGreen = { locked: true, owner: 'unknown', files: ['maps/floor_1.svg'],
      lastValidated: { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } } };
    // Fast propagation: the bare /maps URL serves the NEW etag the instant the
    // promote POST happens. A baseline captured AFTER the POST would already read
    // "new" and the poll would never detect a change — the real-world #50 bug
    // observed 2026-05-25 (poll fetched fresh bytes but the thumbnail never
    // re-rendered). The baseline MUST be captured before the promote POST.
    let promoted = false;
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
      const u = typeof url === 'string' ? url : '';
      if (u.includes('/api/staging/promote')) {
        promoted = true;
        return { ok: true, status: 200, json: async () => ({ ok: true, promotedVersions: { 'maps/floor_1.svg': 'updated' } }) };
      }
      if (u.includes('/maps/floor_1.svg')) {
        const etag = promoted ? '"new"' : '"old"';
        return { ok: true, headers: { get: (h) => (h.toLowerCase() === 'etag' ? etag : null) } };
      }
      if (u.includes('/api/svg') && (!opts.method || opts.method === 'GET'))
        return { ok: true, json: async () => ({ success: true, files: [{ name: 'floor_1.svg', size: 1234 }] }) };
      if (u.includes('/api/staging/status')) return { ok: true, json: async () => statusGreen };
      return { ok: true, json: async () => ({}) };
    });

    const mod = await import('../components/svg-manager.js');
    mod.initSVGManager();
    await jest.advanceTimersByTimeAsync(0);

    document.querySelector('[data-action="promote-staging"]').click();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(12000);

    const after = document.querySelector('#svg-grid img');
    expect(after.getAttribute('src')).toMatch(/\/maps\/floor_1\.svg\?v=/);
  });
});
