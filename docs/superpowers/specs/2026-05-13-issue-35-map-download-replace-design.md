# Issue #35 — Map Files: download + replace flow

**Status:** Spec approved 2026-05-13. Implementation pending.
**Issue:** [#35](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/35)
**Scope decision:** Per user direction ("not too complicated — a simple download button and replace existing map button"), this spec implements the minimum that closes the issue. The expansive ideas in #35's body (drop-on-card, bulk zip, visual diff, instant `mapeditor:svg-replaced` event) are deferred.

---

## Goal

Add two per-card buttons to the Map Files grid in the admin SPA:

1. **Download** — saves the SVG to the user's machine with its real filename (`floor_0.svg`, etc.).
2. **Replace** — uploads a new file under the **same filename**, with versioning handled by the existing backend.

Together they unblock the round-trip workflow: librarian downloads → coworker edits → librarian replaces.

## User flow

### Download

1. Open Map Files tab. Each card shows a file (e.g. `floor_2.svg`).
2. Click **Download** on the card.
3. Browser downloads the file as `floor_2.svg` to the user's default downloads folder.

No server call beyond the existing CloudFront GET. No confirm dialog. Available to all authenticated users.

### Replace

1. Click **Replace** on a card (admin role required — same gating as Delete).
2. Native file picker opens, restricted to `.svg`.
3. After selecting a file, a `confirm()` dialog appears:
   *"Replace `floor_2.svg` with the new file? The current version will be archived in Version History."*
4. On confirm: POST to `/api/svg` with `filename` set to the card's filename (not the user-selected file's name). The backend (`lambda/uploadSvg.mjs`) already writes the prior body to `versions/maps/${basename}_${timestamp}_${username}.svg` before overwriting — no Lambda changes needed.
5. On success: toast `Replaced floor_2.svg. Previous version archived.`, refresh the grid via the existing `loadFiles()`.
6. On failure: toast the error message. The backup-before-write design means the old body is untouched on failure.

The live Map Editor will pick up the new SVG automatically on its next floor-switch thanks to PR #34's `cache: 'no-cache'`. No instant-refresh event needed.

## Architecture

Everything stays in `admin/components/svg-manager.js`. No Lambda changes. No CloudFront changes. No new files except tests.

### Markup change — `renderFiles()`

Insert two buttons between the existing `.btn-preview` and `.btn-delete` in each card. New buttons share the existing `flex-1 px-3 py-1.5 text-sm` styling so the row keeps its four-buttons-fit-on-one-line layout. Colours:

- **Download** — `bg-gray-100 text-gray-700 hover:bg-gray-200` (matches Preview).
- **Replace** — `bg-amber-100 text-amber-800 hover:bg-amber-200` (visually distinct from red Delete to prevent fat-finger).

Replace carries `data-role-required="admin"` so editors see it greyed out by the existing role-based-UI machinery.

### New i18n FALLBACKS keys (add to the local `FALLBACKS` object at the top of `svg-manager.js`)

```js
'svg.download':         { en: 'Download',  he: 'הורד' },
'svg.replace':          { en: 'Replace',   he: 'החלף' },
'svg.confirmReplace':   { en: 'Replace {filename} with the new file? The current version will be archived in Version History.',
                          he: 'להחליף את {filename} בקובץ החדש? הגרסה הקודמת תיארכב בהיסטוריית הגרסאות.' },
'svg.replaceSuccess':   { en: 'Replaced {filename}. Previous version archived.',
                          he: 'הקובץ {filename} הוחלף. הגרסה הקודמת נשמרה.' },
'svg.replaceError':     { en: 'Failed to replace file.',
                          he: 'נכשל בהחלפת הקובץ.' },
```

No changes to `admin/i18n/en.json` or `admin/i18n/he.json` — matches the existing dashboard-component convention of inlining component-scoped strings.

### New helper — `replaceFile(targetFilename, file)`

A thin variant of the existing `uploadFile(file)` (`svg-manager.js:303`). The only difference: the POST body forces `filename` to `targetFilename` instead of using `file.name`. ~15 lines. Lives next to `uploadFile()` in the same file.

```js
async function replaceFile(targetFilename, file) {
  if (!file.name.toLowerCase().endsWith('.svg')) {
    showToast(i18n.t('svg.invalidFile') || 'Only SVG files are allowed', 'error');
    return;
  }
  try {
    const content = await file.text();
    const response = await fetch(`${API_ENDPOINT}/api/svg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ filename: targetFilename, content, username: getCurrentUsername() }),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Replace failed');
    showToast(t('svg.replaceSuccess').replace('{filename}', targetFilename), 'success');
    await loadFiles();
  } catch (err) {
    console.error('Failed to replace SVG:', err);
    showToast(t('svg.replaceError') || 'Failed to replace file', 'error');
  }
}
```

### Event handlers — delegated, added inside `setupManagerEvents()`

```js
// Download (delegated, no role gating — any authenticated user)
gridContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-download');
  if (!btn) return;
  const filename = btn.dataset.name;
  const a = document.createElement('a');
  a.href = `${CLOUDFRONT_URL}/maps/${encodeURIComponent(filename)}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// Replace (delegated, role-gated by the existing attribute)
gridContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-replace');
  if (!btn || btn.disabled) return;
  const filename = btn.dataset.filename;
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.svg';
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    if (!confirm(t('svg.confirmReplace').replace('{filename}', filename))) return;
    await replaceFile(filename, file);
  };
  picker.click();
});
```

Both handlers reuse the existing `gridContainer` event-delegation pattern already in `setupManagerEvents`. `CLOUDFRONT_URL` is already imported/declared near the top of `svg-manager.js`.

## Files to change

| File | Change |
|---|---|
| `admin/components/svg-manager.js` | i18n FALLBACKS additions, two new buttons per card in `renderFiles()`, two new delegated click handlers in `setupManagerEvents()`, new `replaceFile()` helper |
| `admin/__tests__/svg-manager.test.js` | **new** — Jest unit tests |
| `e2e/tests/svg-manager-download-replace.spec.ts` | **new** — Playwright e2e |

No Lambda, S3, or CloudFront changes.

## Tests

### Jest unit — `admin/__tests__/svg-manager.test.js`

- **renderFiles** emits cards with `.btn-download`, `.btn-replace`, and the existing `.btn-preview` / `.btn-delete` in that order.
- **Download handler**: clicking `.btn-download` creates an `<a download="<filename>">` whose `href` is the correct CloudFront URL.
- **Replace handler**: clicking `.btn-replace` opens a `<input type="file" accept=".svg">`.
- **replaceFile**: POSTs to `/api/svg` with `filename` overridden to the target (not the chosen file's name); shows the success toast on `{ ok: true, success: true }`; shows the error toast and does NOT call `loadFiles()` on a non-2xx response.
- **Confirm cancel**: simulating `confirm() → false` after selecting a file aborts the upload (no fetch call).

### Playwright e2e — `e2e/tests/svg-manager-download-replace.spec.ts`

Run under `en-admin` and `he-admin` (locale + role matrix). Smoke `en-editor` to confirm Replace is gated.

- Admin → Map Files → click Download on `floor_0.svg` → browser fires a download whose `suggestedFilename()` is `floor_0.svg`.
- Admin → click Replace on `floor_0.svg` → use Playwright's `setInputFiles` on the dynamically created `<input>` → accept the confirm dialog → toast appears, list reloads, no error.
- Editor → Map Files tab → Replace button is disabled (per the existing `data-role-required="admin"` machinery). Download is still enabled.

## Error handling

- **Download** can't fail in a meaningful sense — if the CloudFront URL 404s, the browser shows its own download-failed UI. We don't intercept.
- **Replace** failure modes already handled by `replaceFile()` above: bad filename type → toast + early return; non-2xx response or `success: false` → caught, error toast, no list refresh, old file untouched on S3 (backend backs up before overwriting).
- Confirm-dialog cancellation → silent no-op.

## Out of scope

- Drag-and-drop a file onto a card to trigger Replace.
- Bulk download (zip of all three floors).
- Visual diff between old and new before confirming.
- Custom `mapeditor:svg-replaced` event for instant in-app Map Editor refresh — deferred. PR #34's `cache: 'no-cache'` already covers the next floor-switch.
- A "Rename" action.

## Rollout

1. Feature branch `feat/issue-35-map-download-replace` off `main`.
2. Pre-feature rollback tag `pre-issue-35-download-replace`.
3. Standard babysitter-driven task-by-task implementation.
4. Open PR; merge; `./redeploy.sh`; invalidate `/admin/*`.

No data migrations. No backend changes.
