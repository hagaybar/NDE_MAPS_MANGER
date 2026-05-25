/** @jest-environment jsdom */
/**
 * Tests for the lightweight progress indicator on the staging Discard action
 * (data-action="discard-staging" handler in svg-manager.js).
 *
 * Before this change, clicking Discard fired POST /clear → refreshStagingPanel()
 * with no UI feedback, leaving a multi-second silent wait. The handler now:
 *   - disables the clicked button + sets aria-busy + swaps text to "Discarding…"
 *     while the /clear request is in flight,
 *   - on success lets refreshStagingPanel() re-render (button replaced),
 *   - on error re-enables the button, clears aria-busy, restores the text, and
 *     shows an error toast.
 *
 * Drives the real component via initSVGManager() so the actual Discard button
 * markup and wiring is exercised (same approach as svg-manager-promote-event).
 */
import { jest } from '@jest/globals';

const flush = () => new Promise(r => setTimeout(r, 0));

function seed() {
  document.body.innerHTML =
    '<div id="svg-manager"></div><div id="toast-container"></div>';
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// A locked staging panel with green validation renders the Discard button.
const STATUS_LOCKED_GREEN = {
  locked: true,
  owner: 'unknown',
  files: ['maps/floor_1.svg'],
  lastValidated: { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } },
};

describe('svg-manager staging Discard progress indicator', () => {
  let fetchSpy;
  let confirmSpy;
  let mod;

  beforeEach(async () => {
    jest.resetModules();
    seed();
    window.__USE_STAGING_FLOW__ = true;
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    mod = await import('../components/svg-manager.js');
    const i18n = (await import('../i18n.js?v=5')).default;
    i18n.locale = 'en';
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    confirmSpy?.mockRestore();
    delete window.__USE_STAGING_FLOW__;
  });

  async function renderPanel(clearImpl) {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
      const u = typeof url === 'string' ? url : '';
      if (u.includes('/api/svg') && (!opts.method || opts.method === 'GET'))
        return { ok: true, json: async () => ({ success: true, files: [] }) };
      if (u.includes('/api/staging/clear')) return clearImpl(url, opts);
      if (u.includes('/api/staging/status')) return { ok: true, json: async () => STATUS_LOCKED_GREEN };
      return { ok: true, json: async () => ({}) };
    });
    mod.initSVGManager();
    for (let i = 0; i < 8; i++) await flush();
  }

  test('disables the Discard button and shows "Discarding…" while /clear is in flight', async () => {
    const clearDef = deferred();
    await renderPanel(() => clearDef.promise);

    const btn = document.querySelector('[data-action="discard-staging"]');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-busy')).toBeNull();
    const originalText = btn.textContent;

    btn.click();
    await flush();

    const busyBtn = document.querySelector('[data-action="discard-staging"]');
    expect(busyBtn.disabled).toBe(true);
    expect(busyBtn.getAttribute('aria-busy')).toBe('true');
    expect(busyBtn.textContent).toMatch(/Discarding/i);
    expect(busyBtn.textContent).not.toBe(originalText);

    // Let the in-flight clear resolve so the test doesn't leak a pending fetch.
    clearDef.resolve({ ok: true, json: async () => ({}) });
    for (let i = 0; i < 8; i++) await flush();
  });

  test('on /clear failure: re-enables the button, clears aria-busy, restores text', async () => {
    const clearDef = deferred();
    await renderPanel(() => clearDef.promise);

    const btn = document.querySelector('[data-action="discard-staging"]');
    const originalText = btn.textContent;
    btn.click();
    await flush();
    expect(btn.disabled).toBe(true);

    clearDef.reject(new Error('network down'));
    for (let i = 0; i < 8; i++) await flush();

    const restored = document.querySelector('[data-action="discard-staging"]');
    expect(restored.disabled).toBe(false);
    expect(restored.getAttribute('aria-busy')).toBeNull();
    expect(restored.textContent).toBe(originalText);
  });
});
