/**
 * @jest-environment jsdom
 *
 * Tests for issue #50 — Map Editor view doesn't auto-refresh after staging promote.
 *
 * Behavioral contract:
 *
 *   1. Producer (svg-manager.js promote handler): after a successful
 *      POST /api/staging/promote (200) and the existing
 *      refreshStagingPanel()+loadFiles() calls, the module dispatches a
 *      CustomEvent('svg-promoted') on `document` with detail
 *      { promotedVersions, ts }. On any non-2xx promote response, no event
 *      fires.
 *
 *   2. Consumer (map-editor/svg-loader.js): on module init, an
 *      'svg-promoted' listener is installed on `document`. When fired, it
 *      re-invokes loadFloorSvg(currentFloor, currentContainer) for the most
 *      recently-displayed floor. The listener is idempotent (safe to fire
 *      twice; loadFloorSvg already uses cache: 'no-cache').
 *
 *   3. Disposability: svg-loader exports disposeSvgPromotedListener() that
 *      removes the SAME function reference used for addEventListener. The
 *      handler must NOT be an anonymous closure that can't be cleaned up.
 */

import { jest } from '@jest/globals';

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="x" /></svg>';

/**
 * Seed the SVG manager DOM as initSVGManager would, plus a staging-panel host
 * already populated with the "ready to promote" GREEN-state button.
 */
function seedSvgManagerDom() {
  document.body.innerHTML = `
    <div id="svg-manager"></div>
    <div id="toast-container"></div>
  `;
}

/**
 * Wait for queued microtasks + a macro tick so async chains inside the
 * handlers (refreshStagingPanel → renderStagingPanel → wireStagingActions →
 * loadFiles) have a chance to resolve before assertions run.
 */
function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('issue #50 — Map Editor auto-refresh after staging promote', () => {
  let fetchSpy;
  let originalAddEventListener;

  beforeEach(() => {
    jest.resetModules();
    // The producer feature gate. Read at module-load time as a const.
    window.__USE_STAGING_FLOW__ = true;
  });

  afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore();
    delete window.__USE_STAGING_FLOW__;
  });

  describe('Producer (svg-manager.js)', () => {
    /**
     * Drive svg-manager through initSVGManager + a simulated promote click.
     * Returns the awaited promise so the test can assert post-flow state.
     *
     * The status fetch returns a GREEN "ready to promote" payload so
     * wireStagingActions actually renders the Promote button.
     */
    async function runPromoteFlow({ promoteResponse, promoteJson = {} }) {
      seedSvgManagerDom();
      // Owner must match getCurrentUsername() (returns 'unknown' when no auth
      // token is set in jsdom) — otherwise renderStagingPanel renders the
      // "lock held by someone else" warning and no promote button.
      const statusGreen = {
        locked: true,
        owner: 'unknown',
        files: ['maps/floor_2.svg'],
        lastValidated: { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } },
      };

      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
        const u = typeof url === 'string' ? url : '';
        // loadFiles GET → empty file list
        if (u.includes('/api/svg') && (!opts.method || opts.method === 'GET')) {
          return { ok: true, json: async () => ({ success: true, files: [] }) };
        }
        if (u.includes('/api/staging/status')) {
          return { ok: true, json: async () => statusGreen };
        }
        if (u.includes('/api/staging/promote')) {
          return promoteResponse({ json: async () => promoteJson });
        }
        return { ok: true, json: async () => ({}) };
      });

      const mod = await import('../components/svg-manager.js');
      mod.initSVGManager();
      // Let initSVGManager() chain through loadFiles → refreshStagingPanel →
      // renderStagingPanel → wireStagingActions so the Promote button is in
      // the DOM with its click handler attached. Multiple flushes drain
      // nested await chains (fetch → response.json → render).
      for (let i = 0; i < 8; i++) await flush();

      const btn = document.querySelector('[data-action="promote-staging"]');
      expect(btn).not.toBeNull();
      btn.click();
      // Let the promote click handler resolve all its awaited calls
      // (promote → refreshStagingPanel → loadFiles).
      for (let i = 0; i < 8; i++) await flush();
    }

    test('dispatches CustomEvent svg-promoted on document after a successful promote', async () => {
      const events = [];
      const listener = (e) => events.push(e);
      document.addEventListener('svg-promoted', listener);

      try {
        await runPromoteFlow({
          promoteResponse: (extra) => ({ ok: true, status: 200, ...extra }),
          promoteJson: { ok: true, promotedVersions: { 'floor_2.svg': 'v123' } },
        });

        expect(events.length).toBe(1);
        const evt = events[0];
        expect(evt).toBeInstanceOf(CustomEvent);
        expect(evt.type).toBe('svg-promoted');
        expect(evt.detail).toBeDefined();
        // promotedVersions is the structural payload Plan B returns; we just
        // verify the field exists in detail so consumers can read it.
        expect(evt.detail).toHaveProperty('promotedVersions');
        expect(typeof evt.detail.ts).toBe('number');
      } finally {
        document.removeEventListener('svg-promoted', listener);
      }
    });

    test('does NOT dispatch svg-promoted when promote returns non-2xx', async () => {
      const events = [];
      const listener = (e) => events.push(e);
      document.addEventListener('svg-promoted', listener);

      try {
        await runPromoteFlow({
          promoteResponse: (extra) => ({ ok: false, status: 422, ...extra }),
          promoteJson: { error: 'validation failed' },
        });

        expect(events.length).toBe(0);
      } finally {
        document.removeEventListener('svg-promoted', listener);
      }
    });
  });

  describe('Consumer (map-editor/svg-loader.js)', () => {
    /**
     * Build a mocked svg-loader environment: jsdom container + mocked fetch
     * returning a minimal SVG. Returns the module under test plus helpers.
     */
    async function setupLoader() {
      document.body.innerHTML = '<div id="map-canvas"></div>';
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => FAKE_SVG,
      });
      const mod = await import('../components/map-editor/svg-loader.js');
      const canvas = document.getElementById('map-canvas');
      return { mod, canvas };
    }

    test('listener installed on document at module init re-invokes loadFloorSvg with the most-recently-displayed floor', async () => {
      const { mod, canvas } = await setupLoader();

      // Display floor 1 first so the loader knows what "current" means.
      await mod.loadFloorSvg(1, canvas);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toMatch(/floor_1\.svg/);

      // Fire the event the producer dispatches after a successful promote.
      document.dispatchEvent(new CustomEvent('svg-promoted', {
        detail: { promotedVersions: {}, ts: Date.now() },
      }));
      // The handler is async (calls loadFloorSvg which awaits fetch); flush.
      await flush();
      await flush();

      // Exactly one additional fetch for the same floor (floor 1).
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[1][0]).toMatch(/floor_1\.svg/);

      // Idempotent: a second event triggers a second reload, also for floor 1.
      document.dispatchEvent(new CustomEvent('svg-promoted', {
        detail: { promotedVersions: {}, ts: Date.now() },
      }));
      await flush();
      await flush();
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(fetchSpy.mock.calls[2][0]).toMatch(/floor_1\.svg/);

      // Cleanup so the listener doesn't leak across tests.
      mod.disposeSvgPromotedListener();
    });

    test('handler is a no-op when no floor has been displayed yet', async () => {
      const { mod } = await setupLoader();

      // No loadFloorSvg call has happened — nothing to refresh.
      document.dispatchEvent(new CustomEvent('svg-promoted', {
        detail: { promotedVersions: {}, ts: Date.now() },
      }));
      await flush();

      expect(fetchSpy).toHaveBeenCalledTimes(0);

      mod.disposeSvgPromotedListener();
    });

    test('disposeSvgPromotedListener() removes the listener so subsequent events do not call loadFloorSvg', async () => {
      const { mod, canvas } = await setupLoader();
      await mod.loadFloorSvg(2, canvas);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      mod.disposeSvgPromotedListener();

      document.dispatchEvent(new CustomEvent('svg-promoted', {
        detail: { promotedVersions: {}, ts: Date.now() },
      }));
      await flush();
      await flush();

      // Still only the initial load — the dispose call must have unhooked
      // the listener.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('disposeSvgPromotedListener uses the SAME function reference passed to addEventListener (clean teardown)', async () => {
      // Verify the listener identity contract by spying on the document's
      // add/remove pair. If the implementation uses an anonymous arrow on
      // each addEventListener call, removeEventListener will silently no-op.
      const addSpy = jest.spyOn(document, 'addEventListener');
      const removeSpy = jest.spyOn(document, 'removeEventListener');

      try {
        const { mod } = await setupLoader();
        const adds = addSpy.mock.calls.filter(([type]) => type === 'svg-promoted');
        expect(adds.length).toBe(1);
        const installedHandler = adds[0][1];

        mod.disposeSvgPromotedListener();
        const removes = removeSpy.mock.calls.filter(([type]) => type === 'svg-promoted');
        expect(removes.length).toBe(1);
        expect(removes[0][1]).toBe(installedHandler);
      } finally {
        addSpy.mockRestore();
        removeSpy.mockRestore();
      }
    });
  });
});
