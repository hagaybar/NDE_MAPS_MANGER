/**
 * @jest-environment jsdom
 *
 * Tests for issue #58 — Phase 1 UX feedback during the staged-replace
 * sequence in svg-manager.js. Covers:
 *   - Button disable + aria-busy lifecycle (set on entry, cleared on resolve)
 *   - Progress text transitions across upload → validate → refresh steps
 *   - beforeunload listener attach/remove with the SAME function reference
 *
 * The staging flow is gated by `window.__USE_STAGING_FLOW__ === true`,
 * which is read at module-load time. The flag is set before importing.
 */

import { jest } from '@jest/globals';

const FAKE_CONTENT = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="x" /></svg>';

function makeFile(name, content = FAKE_CONTENT) {
  const f = new File([content], name, { type: 'image/svg+xml' });
  f.text = async () => content;
  // jsdom doesn't always implement File.arrayBuffer; pin it using Node's
  // Buffer (TextEncoder isn't globally available in this jsdom setup).
  f.arrayBuffer = async () => {
    const buf = Buffer.from(content, 'utf-8');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  };
  return f;
}

/**
 * Build a deferred promise that we can resolve/reject from outside. Lets the
 * test pause the replaceFile sequence between network calls and inspect DOM
 * state mid-flight.
 */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Seed the SVG manager DOM with a Replace button matching what renderGrid
 * would produce, so we can verify it gets disabled/re-enabled.
 */
function seedSvgGrid() {
  document.body.innerHTML = `
    <div id="svg-manager">
      <button id="btn-upload-toggle">Upload</button>
      <div id="staging-panel-host"></div>
      <div id="svg-grid">
        <div class="svg-card" data-name="floor_2.svg">
          <button class="btn-preview" data-name="floor_2.svg">Preview</button>
          <button class="btn-download" data-name="floor_2.svg">Download</button>
          <button class="btn-replace" data-filename="floor_2.svg">Replace</button>
          <button class="btn-delete" data-filename="floor_2.svg">Delete</button>
        </div>
      </div>
    </div>
    <div id="toast-container"></div>
  `;
}

/**
 * Wait one microtask tick so awaited promises inside the SUT can progress.
 * Useful when we've resolved a deferred fetch and want subsequent code in
 * replaceFile to run before we inspect the DOM.
 */
function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('svg-manager staged-replace UX feedback (issue #58)', () => {
  let mod;
  let fetchSpy;
  let addListenerSpy;
  let removeListenerSpy;

  beforeEach(async () => {
    jest.resetModules();
    seedSvgGrid();
    // Enable the staging flow BEFORE importing the module — the flag is
    // captured into a const at module-load time.
    window.__USE_STAGING_FLOW__ = true;

    // Track beforeunload attach/remove. The component MUST pass the same
    // function reference to both add and remove for the listener to actually
    // come off; a different reference silently leaks the listener and we'd
    // ship the "leaving locks staging" prompt to subsequent navigations.
    addListenerSpy = jest.spyOn(window, 'addEventListener');
    removeListenerSpy = jest.spyOn(window, 'removeEventListener');

    mod = await import('../components/svg-manager.js');
    // Force English locale on the SAME i18n module svg-manager imports
    // (`../i18n.js?v=5`). The default is 'he', which would route assertions
    // through the Hebrew copy of the FALLBACKS map.
    const i18n = (await import('../i18n.js?v=5')).default;
    i18n.locale = 'en';
  });

  afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore();
    addListenerSpy.mockRestore();
    removeListenerSpy.mockRestore();
    delete window.__USE_STAGING_FLOW__;
  });

  test('disables the Replace button and marks aria-busy while the sequence is in flight; clears on success', async () => {
    // Three sequential network calls in the staging branch: upload, validate,
    // status (inside refreshStagingPanel). Use deferreds to pause between
    // them and inspect DOM state at each step.
    const uploadDef = deferred();
    const validateDef = deferred();
    const statusDef = deferred();

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (typeof url === 'string') {
        if (url.includes('/api/staging/upload')) return uploadDef.promise;
        if (url.includes('/api/staging/validate')) return validateDef.promise;
        if (url.includes('/api/staging/status')) return statusDef.promise;
      }
      return { ok: true, json: async () => ({}) };
    });

    const replaceBtn = document.querySelector('.btn-replace');
    expect(replaceBtn.disabled).toBe(false);
    expect(replaceBtn.getAttribute('aria-busy')).toBeNull();

    const file = makeFile('floor_2.svg');
    const callPromise = mod.__test.replaceFile('floor_2.svg', file);

    // Let synchronous + microtask code in replaceFile run up to the first await.
    await flush();
    expect(replaceBtn.disabled).toBe(true);
    expect(replaceBtn.getAttribute('aria-busy')).toBe('true');

    // Step 1 resolves → we should still be disabled (entering validate).
    uploadDef.resolve({ ok: true, json: async () => ({}) });
    await flush();
    expect(replaceBtn.disabled).toBe(true);
    expect(replaceBtn.getAttribute('aria-busy')).toBe('true');

    // Step 2 resolves → still disabled (entering status refresh).
    validateDef.resolve({ ok: true, json: async () => ({}) });
    await flush();
    expect(replaceBtn.disabled).toBe(true);
    expect(replaceBtn.getAttribute('aria-busy')).toBe('true');

    // Step 3 resolves → sequence done, button should be re-enabled.
    statusDef.resolve({
      ok: true,
      json: async () => ({ locked: false, owner: null, files: [], lastValidated: null }),
    });
    await callPromise;
    expect(replaceBtn.disabled).toBe(false);
    expect(replaceBtn.getAttribute('aria-busy')).toBeNull();
  });

  test('shows per-step progress in the blocking modal across upload → validate → refresh and unmounts on success', async () => {
    const uploadDef = deferred();
    const validateDef = deferred();
    const statusDef = deferred();

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (typeof url === 'string') {
        if (url.includes('/api/staging/upload')) return uploadDef.promise;
        if (url.includes('/api/staging/validate')) return validateDef.promise;
        if (url.includes('/api/staging/status')) return statusDef.promise;
      }
      return { ok: true, json: async () => ({}) };
    });

    const file = makeFile('floor_2.svg');
    const callPromise = mod.__test.replaceFile('floor_2.svg', file);

    // Step 1: Uploading… — modal is mounted and shows the uploading copy.
    await flush();
    let modal = document.querySelector('[data-testid="staging-progress-modal"]');
    expect(modal).not.toBeNull();
    let stepEl = modal.querySelector('[data-testid="staging-progress-modal-step"]');
    expect(stepEl.textContent).toMatch(/Uploading/i);

    // Step 2: Validating…
    uploadDef.resolve({ ok: true, json: async () => ({}) });
    await flush();
    modal = document.querySelector('[data-testid="staging-progress-modal"]');
    expect(modal).not.toBeNull();
    stepEl = modal.querySelector('[data-testid="staging-progress-modal-step"]');
    expect(stepEl.textContent).toMatch(/Validating/i);
    expect(stepEl.textContent).not.toMatch(/Uploading/i);

    // Step 3: Updating staging panel…
    validateDef.resolve({ ok: true, json: async () => ({}) });
    await flush();
    modal = document.querySelector('[data-testid="staging-progress-modal"]');
    expect(modal).not.toBeNull();
    stepEl = modal.querySelector('[data-testid="staging-progress-modal-step"]');
    expect(stepEl.textContent).toMatch(/Updating staging panel/i);

    // Resolve → modal removed.
    statusDef.resolve({
      ok: true,
      json: async () => ({ locked: false, owner: null, files: [], lastValidated: null }),
    });
    await callPromise;
    expect(document.querySelector('[data-testid="staging-progress-modal"]')).toBeNull();
  });

  test('attaches a beforeunload listener while in flight and removes the SAME reference on success', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (typeof url === 'string') {
        if (url.includes('/api/staging/upload')) return { ok: true, json: async () => ({}) };
        if (url.includes('/api/staging/validate')) return { ok: true, json: async () => ({}) };
        if (url.includes('/api/staging/status')) {
          return {
            ok: true,
            json: async () => ({ locked: false, owner: null, files: [], lastValidated: null }),
          };
        }
      }
      return { ok: true, json: async () => ({}) };
    });

    const file = makeFile('floor_2.svg');
    await mod.__test.replaceFile('floor_2.svg', file);

    const addedBeforeUnload = addListenerSpy.mock.calls.filter(([type]) => type === 'beforeunload');
    const removedBeforeUnload = removeListenerSpy.mock.calls.filter(([type]) => type === 'beforeunload');

    expect(addedBeforeUnload).toHaveLength(1);
    expect(removedBeforeUnload).toHaveLength(1);
    // CRITICAL: same function reference on both calls. Otherwise the
    // listener is leaked and subsequent page navigations get the warning.
    expect(addedBeforeUnload[0][1]).toBe(removedBeforeUnload[0][1]);

    // The handler should set returnValue to a non-empty string (browser will
    // show its native prompt). Simulate firing it.
    const handler = addedBeforeUnload[0][1];
    const fakeEvent = {};
    handler(fakeEvent);
    expect(typeof fakeEvent.returnValue).toBe('string');
    expect(fakeEvent.returnValue.length).toBeGreaterThan(0);
  });

  test('on upload error: still re-enables the button, clears progress text, and removes the beforeunload listener', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('/api/staging/upload')) {
        return {
          ok: false,
          status: 423,
          json: async () => ({ error: 'staging locked by other user' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const replaceBtn = document.querySelector('.btn-replace');
    const file = makeFile('floor_2.svg');
    await mod.__test.replaceFile('floor_2.svg', file);

    expect(replaceBtn.disabled).toBe(false);
    expect(replaceBtn.getAttribute('aria-busy')).toBeNull();

    // Modal must be unmounted on error so the user sees the error toast.
    expect(document.querySelector('[data-testid="staging-progress-modal"]')).toBeNull();

    const addedBeforeUnload = addListenerSpy.mock.calls.filter(([type]) => type === 'beforeunload');
    const removedBeforeUnload = removeListenerSpy.mock.calls.filter(([type]) => type === 'beforeunload');
    expect(addedBeforeUnload).toHaveLength(1);
    expect(removedBeforeUnload).toHaveLength(1);
    expect(addedBeforeUnload[0][1]).toBe(removedBeforeUnload[0][1]);
  });

  test('on network exception during validate: also re-enables and removes beforeunload listener', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (typeof url === 'string') {
        if (url.includes('/api/staging/upload')) return { ok: true, json: async () => ({}) };
        if (url.includes('/api/staging/validate')) throw new Error('network down');
      }
      return { ok: true, json: async () => ({}) };
    });

    const replaceBtn = document.querySelector('.btn-replace');
    const file = makeFile('floor_2.svg');
    await mod.__test.replaceFile('floor_2.svg', file);

    expect(replaceBtn.disabled).toBe(false);
    expect(replaceBtn.getAttribute('aria-busy')).toBeNull();

    const addedBeforeUnload = addListenerSpy.mock.calls.filter(([type]) => type === 'beforeunload');
    const removedBeforeUnload = removeListenerSpy.mock.calls.filter(([type]) => type === 'beforeunload');
    expect(addedBeforeUnload).toHaveLength(1);
    expect(removedBeforeUnload).toHaveLength(1);
    expect(addedBeforeUnload[0][1]).toBe(removedBeforeUnload[0][1]);
  });
});
