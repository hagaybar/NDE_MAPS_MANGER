# Issue #35 — Map Files download + replace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two per-card buttons to the Map Files grid (`Download` and `Replace`) so a librarian can hand off an SVG to a coworker, get edits back, and put the new version on the same filename without an interim delete.

**Architecture:** UI-only feature inside `admin/components/svg-manager.js`. Backend already versions overwrites via `lambda/uploadSvg.mjs` (writes the previous body to `versions/maps/${basename}_${timestamp}_${username}.svg` before overwriting). Download uses the existing CloudFront URL + a transient `<a download>` anchor. Replace = same `POST /api/svg` as the existing `Upload New Map` flow, but with `filename` forced to the card's filename rather than the user-selected file's name. Admin-only by reusing the existing `data-role-required="admin"` attribute already on Delete.

**Tech Stack:** Vanilla JS ES modules, jsdom Jest tests, Playwright e2e. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-13-issue-35-map-download-replace-design.md`

---

## Task 0: Setup branch + rollback tag

**Files:** none (git state only).

- [ ] **Step 0.1: Verify clean tree and that main is current**

Run: `cd /home/hagaybar/projects/primo_maps && git status --short`
Expected: empty output (clean tree).

Run: `cd /home/hagaybar/projects/primo_maps && git rev-parse --abbrev-ref HEAD`
Expected: `main`

- [ ] **Step 0.2: Sync local main to origin**

Run: `cd /home/hagaybar/projects/primo_maps && git fetch origin && git reset --hard origin/main`
Expected: `HEAD is now at <sha> ...` matching `origin/main`.

- [ ] **Step 0.3: Tag the pre-feature rollback point**

Run: `cd /home/hagaybar/projects/primo_maps && git tag pre-issue-35-download-replace`
Expected: silent success. Verify: `git tag --list pre-issue-35-download-replace` returns the tag name.

- [ ] **Step 0.4: Create and check out the feature branch**

Run: `cd /home/hagaybar/projects/primo_maps && git checkout -b feat/issue-35-map-download-replace`
Expected: `Switched to a new branch 'feat/issue-35-map-download-replace'`.

---

## Task 1: Write failing Jest unit tests for `replaceFile` + the new event handlers

**Files:**
- Test: `admin/__tests__/svg-manager.test.js` (new)

- [ ] **Step 1.1: Create the test file**

Write the following EXACT content to `/home/hagaybar/projects/primo_maps/admin/__tests__/svg-manager.test.js`:

```js
/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

const FAKE_CONTENT = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="x" /></svg>';

function makeFile(name, content = FAKE_CONTENT) {
  return new File([content], name, { type: 'image/svg+xml' });
}

describe('svg-manager — replace + download (issue #35)', () => {
  let mod;
  let fetchSpy;
  let confirmSpy;
  let toastSpy;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="svg-manager"></div>';

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
```

The plan exposes `replaceFile`, `renderGrid`, and a tiny `setSvgFiles(files)` setter through a test-only `__test` object on `svg-manager.js` (added in Task 2). `renderGrid` reads from the module-scope `svgFiles` array and writes to `#svg-grid`, so the test seeds the array via the setter, triggers the render, and asserts on the resulting DOM. This avoids leaking implementation details into the public module surface while keeping the helpers reachable from unit tests.

- [ ] **Step 1.2: Run the new tests and verify they fail (module-not-exporting-`__test`)**

Run: `cd /home/hagaybar/projects/primo_maps/admin && NODE_OPTIONS=--experimental-vm-modules npx jest svg-manager.test.js 2>&1 | tail -25`
Expected: tests fail with `TypeError: Cannot read properties of undefined (reading 'replaceFile')` or similar — because `mod.__test` doesn't exist yet.

- [ ] **Step 1.3: Commit the failing tests**

```bash
cd /home/hagaybar/projects/primo_maps && git add admin/__tests__/svg-manager.test.js && \
  git commit -m "$(cat <<'EOF'
test(svg-manager): add failing unit tests for download + replace

TDD red phase for issue #35.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add FALLBACKS keys + `replaceFile` helper + `__test` export

**Files:**
- Modify: `admin/components/svg-manager.js`

This task adds (a) the i18n strings, (b) the `replaceFile()` helper, and (c) the test-only `__test` export so Task 1's tests can pass. UI buttons + click handlers arrive in Task 3.

- [ ] **Step 2.1: Add three FALLBACKS entries**

Find the `FALLBACKS` object near the top of `/home/hagaybar/projects/primo_maps/admin/components/svg-manager.js`:

```js
const FALLBACKS = {
  'svg.title': { en: 'Map Files', he: 'קבצי מפות' },
  'svg.upload': { en: 'Upload New Map', he: 'העלה מפה חדשה' },
  'svg.delete': { en: 'Delete', he: 'מחק' },
  'svg.preview': { en: 'Preview', he: 'תצוגה מקדימה' },
  'svg.confirmDelete': { en: 'Are you sure you want to delete this file?', he: 'האם אתה בטוח שברצונך למחוק קובץ זה?' },
  'common.error': { en: 'An error occurred', he: 'אירעה שגיאה' },
  'common.loading': { en: 'Loading...', he: 'טוען...' }
};
```

Modify it to add the new keys (immediately after the `svg.confirmDelete` line):

```js
const FALLBACKS = {
  'svg.title': { en: 'Map Files', he: 'קבצי מפות' },
  'svg.upload': { en: 'Upload New Map', he: 'העלה מפה חדשה' },
  'svg.delete': { en: 'Delete', he: 'מחק' },
  'svg.preview': { en: 'Preview', he: 'תצוגה מקדימה' },
  'svg.confirmDelete': { en: 'Are you sure you want to delete this file?', he: 'האם אתה בטוח שברצונך למחוק קובץ זה?' },
  'svg.download': { en: 'Download', he: 'הורד' },
  'svg.replace': { en: 'Replace', he: 'החלף' },
  'svg.confirmReplace': { en: 'Replace {filename} with the new file? The current version will be archived in Version History.', he: 'להחליף את {filename} בקובץ החדש? הגרסה הקודמת תיארכב בהיסטוריית הגרסאות.' },
  'svg.replaceSuccess': { en: 'Replaced {filename}. Previous version archived.', he: 'הקובץ {filename} הוחלף. הגרסה הקודמת נשמרה.' },
  'svg.replaceError': { en: 'Failed to replace file.', he: 'נכשל בהחלפת הקובץ.' },
  'common.error': { en: 'An error occurred', he: 'אירעה שגיאה' },
  'common.loading': { en: 'Loading...', he: 'טוען...' }
};
```

- [ ] **Step 2.2: Add the `replaceFile` helper immediately after the existing `uploadFile` function**

Find the existing `uploadFile` function (starts around line 303 with `async function uploadFile(file) {`). After its closing brace, add this new function:

```js
/**
 * Replace an existing SVG file with a new body, preserving the original filename.
 *
 * Backend (`lambda/uploadSvg.mjs`) writes the prior body to
 * `versions/maps/${basename}_${timestamp}_${username}.svg` before overwriting,
 * so a failed replace leaves the old file untouched.
 *
 * @param {string} targetFilename — the filename to keep on S3 (e.g. 'floor_2.svg')
 * @param {File} file — the user-picked file; its `name` is intentionally ignored
 */
async function replaceFile(targetFilename, file) {
  if (!file.name.toLowerCase().endsWith('.svg')) {
    showToast(i18n.t('svg.invalidFile') || 'Only SVG files are allowed', 'error');
    return;
  }

  try {
    const content = await file.text();
    const response = await fetch(`${API_ENDPOINT}/api/svg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        filename: targetFilename,
        content,
        username: getCurrentUsername(),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Replace failed');
    }

    showToast(t('svg.replaceSuccess').replace('{filename}', targetFilename), 'success');
    await loadFiles();
  } catch (err) {
    console.error('Failed to replace SVG:', err);
    showToast(t('svg.replaceError') || 'Failed to replace file', 'error');
  }
}
```

- [ ] **Step 2.3: Add a `__test` export at the very end of the file**

Find the bottom of `/home/hagaybar/projects/primo_maps/admin/components/svg-manager.js`. After the last function/export, append:

```js
// Test-only surface — exposes internal helpers to Jest without leaking them into
// the public module API. Keep this block at the very bottom of the file.
export const __test = {
  replaceFile,
  renderGrid,
  setSvgFiles(files) { svgFiles = files; },
};
```

`renderGrid` is the existing internal function that writes the per-card markup into `#svg-grid` (around line 152). It reads from the module-scope `svgFiles` array, so `setSvgFiles` is a tiny helper that lets tests seed that array before calling `renderGrid`. The closure captures the module-level `let svgFiles` binding, so assignments from inside `setSvgFiles` propagate to subsequent reads in `renderGrid`.

- [ ] **Step 2.4: Re-run the Jest tests; the `replaceFile` test should now pass, the markup test should still fail**

Run: `cd /home/hagaybar/projects/primo_maps/admin && NODE_OPTIONS=--experimental-vm-modules npx jest svg-manager.test.js 2>&1 | tail -25`
Expected:
- `POSTs to /api/svg with filename overridden to the target (not file.name)` → **passes**.
- `rejects non-SVG files without calling fetch` → **passes**.
- `renderFiles emits .btn-download and .btn-replace alongside preview + delete` → **still fails** (Task 3 adds those buttons).

- [ ] **Step 2.5: Commit**

```bash
cd /home/hagaybar/projects/primo_maps && git add admin/components/svg-manager.js && \
  git commit -m "$(cat <<'EOF'
feat(svg-manager): add replaceFile helper + i18n fallbacks (issue #35)

Backend-side overwriting is unchanged — `uploadSvg.mjs` already
versions the prior body to versions/maps/${basename}_<ts>_<user>.svg
before writing the new body. This adds the client helper that targets
a specific filename rather than letting the picker name win.

Buttons and click wiring arrive in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add Download + Replace buttons + delegated click handlers

**Files:**
- Modify: `admin/components/svg-manager.js`

- [ ] **Step 3.1: Add the two new buttons in `renderFiles()`**

Find the per-card button block in `renderFiles()` (around lines 188–202):

```js
          <div class="flex gap-2">
            <button
              class="btn-preview flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              data-name="${escapeHtml(file.name)}"
            >
              ${escapeHtml(i18n.t('svg.preview'))}
            </button>
            <button
              class="btn-delete flex-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              data-filename="${escapeHtml(filename)}"
              data-role-required="admin"
            >
              ${escapeHtml(i18n.t('svg.delete'))}
            </button>
          </div>
```

Replace it with this (Download + Replace inserted between Preview and Delete; `flex flex-wrap` so the row wraps gracefully on narrow viewports):

```js
          <div class="flex flex-wrap gap-2">
            <button
              class="btn-preview flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              data-name="${escapeHtml(file.name)}"
            >
              ${escapeHtml(t('svg.preview'))}
            </button>
            <button
              class="btn-download flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              data-name="${escapeHtml(file.name)}"
            >
              ${escapeHtml(t('svg.download'))}
            </button>
            <button
              class="btn-replace flex-1 px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded hover:bg-amber-200 transition-colors"
              data-filename="${escapeHtml(filename)}"
              data-role-required="admin"
            >
              ${escapeHtml(t('svg.replace'))}
            </button>
            <button
              class="btn-delete flex-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              data-filename="${escapeHtml(filename)}"
              data-role-required="admin"
            >
              ${escapeHtml(t('svg.delete'))}
            </button>
          </div>
```

The Preview / Delete labels were switched from `i18n.t(...)` to `t(...)` so the fallback strings render correctly when the language file isn't loaded yet — matching the existing pattern used elsewhere in the file.

- [ ] **Step 3.2: Add the delegated click handlers inside `setupManagerEvents()`**

Find `setupManagerEvents()` (starts around line 212). Locate the existing block that handles `.btn-preview` and `.btn-delete` clicks (around lines 265–278):

```js
  // Preview button clicks (delegated)
  gridContainer?.addEventListener('click', (e) => {
    const previewBtn = e.target.closest('.btn-preview');
    if (previewBtn) {
      const name = previewBtn.dataset.name;
      showPreview(name);
    }

    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      const filename = deleteBtn.dataset.filename;
      deleteFile(filename);
    }
  });
```

Extend that same handler with the new Download and Replace branches:

```js
  // Preview / Download / Replace / Delete button clicks (delegated)
  gridContainer?.addEventListener('click', (e) => {
    const previewBtn = e.target.closest('.btn-preview');
    if (previewBtn) {
      const name = previewBtn.dataset.name;
      showPreview(name);
      return;
    }

    const downloadBtn = e.target.closest('.btn-download');
    if (downloadBtn) {
      const filename = downloadBtn.dataset.name;
      const a = document.createElement('a');
      a.href = `${CLOUDFRONT_URL}/maps/${encodeURIComponent(filename)}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const replaceBtn = e.target.closest('.btn-replace');
    if (replaceBtn && !replaceBtn.disabled) {
      const filename = replaceBtn.dataset.filename;
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = '.svg';
      picker.onchange = async () => {
        const file = picker.files?.[0];
        if (!file) return;
        const msg = t('svg.confirmReplace').replace('{filename}', filename);
        if (!confirm(msg)) return;
        await replaceFile(filename, file);
      };
      picker.click();
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      const filename = deleteBtn.dataset.filename;
      deleteFile(filename);
    }
  });
```

- [ ] **Step 3.3: Re-run the Jest unit tests; all three should pass**

Run: `cd /home/hagaybar/projects/primo_maps/admin && NODE_OPTIONS=--experimental-vm-modules npx jest svg-manager.test.js 2>&1 | tail -15`
Expected: 3 tests pass.

- [ ] **Step 3.4: Run the full Jest suite to check for regressions**

Run: `cd /home/hagaybar/projects/primo_maps/admin && NODE_OPTIONS=--experimental-vm-modules npx jest 2>&1 | tail -8`
Expected: same pass/fail signature as before (the 14 pre-existing issue-#9 failures may remain). If a NEW failure appears, STOP and report `{ ok: false, discrepancy: "<spec name> failed: <one-line>", step: "3.4" }`.

- [ ] **Step 3.5: Commit**

```bash
cd /home/hagaybar/projects/primo_maps && git add admin/components/svg-manager.js && \
  git commit -m "$(cat <<'EOF'
feat(svg-manager): add Download + Replace per-card buttons (issue #35)

Download saves the SVG via a transient <a download> anchor pointed at
the existing CloudFront URL — no server call, no auth requirements.

Replace opens a file picker, prompts for confirmation, and reuses the
existing POST /api/svg path with the filename forced to the card's
filename so versioned overwriting kicks in. Admin-only via
data-role-required="admin".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Write Playwright e2e for download + replace + role-gating

**Files:**
- Create: `e2e/tests/svg-manager-download-replace.spec.ts`
- Create: `e2e/fixtures/floor_test_replacement.svg` (test asset, see Step 4.1)

- [ ] **Step 4.1: Create the test fixture SVG**

Run: `mkdir -p /home/hagaybar/projects/primo_maps/e2e/fixtures && cat > /home/hagaybar/projects/primo_maps/e2e/fixtures/floor_test_replacement.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect id="kb1_1_a" data-map-object="shelf" x="10" y="10" width="20" height="10" />
  <text x="50" y="50" text-anchor="middle">replacement-fixture</text>
</svg>
EOF`
Expected: silent success.

- [ ] **Step 4.2: Confirm the e2e auth fixture path used by other admin specs**

Run: `grep -n "from '../fixtures/auth" /home/hagaybar/projects/primo_maps/e2e/tests/svg-manager.spec.ts | head -2`
Expected: `import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';`

(If the import path differs, mirror it in Step 4.3.)

- [ ] **Step 4.3: Write the e2e spec**

Write the following EXACT content to `/home/hagaybar/projects/primo_maps/e2e/tests/svg-manager-download-replace.spec.ts`:

```ts
import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import * as path from 'path';

const REPLACEMENT_SVG = path.resolve(__dirname, '..', 'fixtures', 'floor_test_replacement.svg');

test.describe('SVG Manager — download + replace (issue #35)', () => {
  test.beforeEach(async ({ page, loginAsAdmin }) => {
    await mockApiResponses(page);
    await loginAsAdmin();
    // Navigate via the nav button so the SVG Manager tab renders.
    await page.click('#nav-svg-manager, [data-tab="svg-manager"]');
    await page.waitForSelector('.btn-preview', { timeout: 10000 });
  });

  test('Download button triggers a browser download with the card\'s filename', async ({ page }) => {
    const firstCardName = await page.locator('.btn-download').first().getAttribute('data-name');
    expect(firstCardName).toBeTruthy();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.btn-download').first().click(),
    ]);
    expect(download.suggestedFilename()).toBe(firstCardName);
  });

  test('Replace button opens a file picker scoped to .svg', async ({ page }) => {
    const replaceBtn = page.locator('.btn-replace').first();
    await expect(replaceBtn).toBeVisible();
    // Set the file *after* clicking — the handler creates the <input> on click.
    page.once('dialog', d => d.accept());
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      replaceBtn.click(),
    ]);
    expect(chooser).toBeTruthy();
    await chooser.setFiles(REPLACEMENT_SVG);
    // After the confirm dialog accepts, the upload should fire and a toast appears.
    await expect(page.locator('.toast, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('SVG Manager — download + replace — editor role', () => {
  test('Replace button is disabled for editors; Download is enabled', async ({ page, loginAsEditor }) => {
    await mockApiResponses(page);
    await loginAsEditor();
    await page.click('#nav-svg-manager, [data-tab="svg-manager"]');
    await page.waitForSelector('.btn-preview', { timeout: 10000 });

    const replaceBtn = page.locator('.btn-replace').first();
    const downloadBtn = page.locator('.btn-download').first();
    await expect(downloadBtn).toBeEnabled();
    await expect(replaceBtn).toBeDisabled();
  });
});
```

If the nav-button selector (`#nav-svg-manager, [data-tab="svg-manager"]`) doesn't match the actual admin HTML, fix it by running `grep -nE "nav-svg|svg-manager" /home/hagaybar/projects/primo_maps/admin/index.html` and using whichever id/data-attribute exists.

- [ ] **Step 4.4: Run JUST this spec on en-admin to verify it executes**

Run: `cd /home/hagaybar/projects/primo_maps && npx playwright test e2e/tests/svg-manager-download-replace.spec.ts --project=en-admin --reporter=line 2>&1 | tail -25`
Expected: all three tests pass on `en-admin` (or whichever subset of the 4-project matrix the spec runs on for the editor branch).

If any test fails because of a stale auth-fixture import or selector mismatch, fix it inline per the hint in Step 4.3 and re-run.

- [ ] **Step 4.5: Commit**

```bash
cd /home/hagaybar/projects/primo_maps && git add e2e/tests/svg-manager-download-replace.spec.ts e2e/fixtures/floor_test_replacement.svg && \
  git commit -m "$(cat <<'EOF'
test(e2e): cover svg-manager download + replace + role gating

Verifies the Download button fires a browser download with the card's
filename, the Replace button opens an .svg file picker, and the
Replace button is disabled for editors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Run the full test suites — verify no regression

**Files:** none (verification only).

- [ ] **Step 5.1: Full Jest suite**

Run: `cd /home/hagaybar/projects/primo_maps/admin && NODE_OPTIONS=--experimental-vm-modules npx jest --reporters=default 2>&1 | tail -10`
Expected: the new `svg-manager.test.js` tests are in the pass count. Pre-existing issue-#9 failures may still appear and are out of scope. If a NEW failure appears, STOP and report `{ ok: false, discrepancy: "<spec name> failed: <one-line>", step: "5.1" }`.

- [ ] **Step 5.2: Full Playwright suite**

Run: `cd /home/hagaybar/projects/primo_maps && npx playwright test --reporter=line 2>&1 | tail -20`
Expected: same pass/fail signature as `main` plus the new `svg-manager-download-replace.spec.ts` tests passing. Anchor specs that MUST stay green: `map-editor.spec.ts`, `map-editor-empty-shelf.spec.ts`, `map-editor-orphan-panel.spec.ts`, `map-editor-orphan-panel-positioning.spec.ts`, `map-editor-console-smoke.spec.ts`, `errors-report-export.spec.ts`, `svg-manager.spec.ts`. Pre-existing issue-#9 failures may remain.

If any *previously-passing* spec fails, STOP and report `{ ok: false, discrepancy: "<which spec> failed: <one-line>", step: "5.2" }`.

---

## Task 6: Push the branch and open the PR

**Files:** none (git remote + GitHub only).

- [ ] **Step 6.1: Push the branch**

Run: `cd /home/hagaybar/projects/primo_maps && git push -u origin feat/issue-35-map-download-replace`
Expected: branch created on `origin`.

- [ ] **Step 6.2: Open the PR**

Run:

```bash
cd /home/hagaybar/projects/primo_maps && \
  gh pr create --base main --head feat/issue-35-map-download-replace \
    --title "feat(svg-manager): per-card Download + Replace buttons (closes #35)" \
    --body "$(cat <<'EOF'
## Summary

- Adds **Download** and **Replace** buttons to every card in the Map Files grid.
- **Download** triggers a browser save of the SVG with its real filename (\`floor_0.svg\`, etc.) via a transient \`<a download>\` anchor on the existing CloudFront URL. No server call. Available to all roles.
- **Replace** opens a file picker scoped to \`.svg\`, confirms with a native dialog, then POSTs to \`/api/svg\` with \`filename\` overridden to the card's filename. The existing \`lambda/uploadSvg.mjs\` versions the prior body to \`versions/maps/${basename}_<ts>_<username>.svg\` before overwriting — failure is non-destructive. Admin-only via the existing \`data-role-required="admin"\` attribute.
- Five new \`FALLBACKS\` strings (en + he): \`svg.download\`, \`svg.replace\`, \`svg.confirmReplace\`, \`svg.replaceSuccess\`, \`svg.replaceError\`.
- Unit tests in \`admin/__tests__/svg-manager.test.js\` cover the filename-override behaviour, non-SVG rejection, and the per-card markup.
- Playwright e2e in \`e2e/tests/svg-manager-download-replace.spec.ts\` covers the download flow, the replace file-picker, and editor-role gating.

No Lambda, S3, or CloudFront changes. The Map Editor automatically picks up replaced SVGs on its next floor-switch thanks to PR #34's \`cache: 'no-cache'\`.

Spec: \`docs/superpowers/specs/2026-05-13-issue-35-map-download-replace-design.md\`
Plan: \`docs/superpowers/plans/2026-05-13-issue-35-map-download-replace.md\`

Closes #35.

## Test plan

- [x] Jest unit suite green (new \`svg-manager\` tests pass; pre-existing #9 failures unchanged).
- [x] Playwright full suite green across the en/he × admin/editor matrix; new spec covers download + replace + editor gating.
- [ ] Manual UI smoke after merge & deploy: download each floor SVG; edit one in Inkscape; replace via the new button; verify Map Editor still works and the previous version appears in the Version History tab.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: \`gh\` prints the PR URL. Capture the URL.

- [ ] **Step 6.3: Return the PR URL as part of the task result**

The PR URL printed in Step 6.2 should be returned in the task's JSON result under \`prUrl\`.

---

## Notes on rollback

The pre-feature tag \`pre-issue-35-download-replace\` lets you reset:

```bash
git reset --hard pre-issue-35-download-replace
git tag -d pre-issue-35-download-replace
```

Only do this if the PR commits have not been merged. After merge, use a revert PR instead.
