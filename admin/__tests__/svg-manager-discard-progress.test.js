/** @jest-environment jsdom */
/**
 * Tests for the progress indicator on the staging Discard action
 * (data-action="discard-staging" handler in svg-manager.js).
 *
 * Before this change, clicking Discard fired POST /clear → refreshStagingPanel()
 * with no UI feedback, leaving a multi-second silent wait. The handler now:
 *   - disables the clicked button (defense in depth) AND replaces the panel's
 *     state/actions region with a prominent animated-spinner overlay carrying
 *     the "Throwing it away…" text, the instant Discard is confirmed,
 *   - on success lets refreshStagingPanel() re-render (panel reset to idle) and
 *     shows a success toast,
 *   - on error re-renders the panel (restore) and shows an error toast.
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

  test('shows a prominent animated spinner with "Discarding staging…" in the panel while /clear is in flight, then a success toast on resolve', async () => {
    const clearDef = deferred();
    await renderPanel(() => clearDef.promise);

    const btn = document.querySelector('[data-action="discard-staging"]');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-busy')).toBeNull();

    btn.click();
    await flush();

    // Prominent in-panel indicator appears immediately (at the start of the
    // await), not after the round-trip completes.
    const indicator = document.querySelector('[data-discard-indicator]');
    expect(indicator).not.toBeNull();
    expect(indicator.textContent).toMatch(/Throwing it away/i);
    // Animated spinner element present inside the indicator.
    expect(indicator.querySelector('[data-discard-spinner]')).not.toBeNull();

    // Defense in depth: the Discard button stays disabled while in flight.
    const busyBtn = document.querySelector('[data-action="discard-staging"]');
    if (busyBtn) {
      expect(busyBtn.disabled).toBe(true);
      expect(busyBtn.getAttribute('aria-busy')).toBe('true');
    }

    // Resolve the clear → success path re-renders the panel (idle/empty state)
    // and shows a completion toast.
    clearDef.resolve({ ok: true, json: async () => ({}) });
    for (let i = 0; i < 8; i++) await flush();

    // Indicator gone after the panel reset.
    expect(document.querySelector('[data-discard-indicator]')).toBeNull();
    // Success toast surfaced.
    const toastContainer = document.getElementById('toast-container');
    expect(toastContainer.textContent).toMatch(/Discarded — nothing was published/i);
  });

  test('on /clear failure: restores the panel (Discard button back) and shows an error toast', async () => {
    const clearDef = deferred();
    await renderPanel(() => clearDef.promise);

    const btn = document.querySelector('[data-action="discard-staging"]');
    btn.click();
    await flush();
    // Spinner indicator present while in flight.
    expect(document.querySelector('[data-discard-indicator]')).not.toBeNull();

    clearDef.reject(new Error('network down'));
    for (let i = 0; i < 8; i++) await flush();

    // Panel restored: Discard button is back and usable, indicator gone.
    const restored = document.querySelector('[data-action="discard-staging"]');
    expect(restored).not.toBeNull();
    expect(restored.disabled).toBe(false);
    expect(restored.getAttribute('aria-busy')).toBeNull();
    expect(document.querySelector('[data-discard-indicator]')).toBeNull();
    // Error toast surfaced.
    const toastContainer = document.getElementById('toast-container');
    expect(toastContainer.textContent).toMatch(/I couldn't discard it/i);
  });
});
