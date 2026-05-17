# SoT Foundation Manual QA — Test Session

**Date:** 2026-05-17
**Tester:** Hagay
**Test plan:** `docs/manual-qa/2026-05-14-sot-foundation-ui-test.md`

## Session log

| Step | Result | Notes |
|---|---|---|
| B1 — Login + landing | PASS | Console: Tailwind CDN dev-mode warning + favicon 403. Both cosmetic / pre-existing, not Plan A regressions. |
| B2 — Open CSV Editor | PASS | CSV Editor loaded cleanly. Separately observed: first navigation to **Map Files** failed with CORS+502 on `GET /api/svg`; second visit succeeded. Classic Lambda cold-start (502 → no CORS headers attached). Unrelated to Plan A — logged as follow-up. |
| B3 — Toggle button visible | PASS | Amber "Show only broken refs (N)" button present in toolbar. **N = 3** at session start. |
| B4 — Language toggle preserves label + count | PASS | Switched EN→HE→EN. Label re-rendered correctly each time, count stayed at 3. |
| B5 — Activate filter | PASS | Button filled (solid amber), table filtered to exactly 3 rows. |
| B7 — Inline actions on broken rows | PASS | All 3 rows show the Rename dropdown + red Delete button. |
| B8 — Rename dropdown options | PASS | Dropdown has real options. Floor 1 and floor 2 rows show different option sets (floor-scoped, as designed). |
| B9 — Pick rename option | PARTIAL / **BUG** | Renamed `ka2_61_a` → `ka1_61_a`. Cell updated locally; amber count dropped 3 → 2; renamed row left the filtered view. **BUT** Save button stayed disabled (grey with checkmark). Root cause: `csv-editor.js:265` sets `hasChanges = true` directly without calling `updateSaveButton()` — the dirty-flag flips but the button's `disabled` attribute never refreshes. Same bug expected on the delete-broken-row handler (line 276). |
| B10 — Click Save | PASS (via workaround) | After type-and-delete in a description cell to enable Save, click succeeded. Toast confirmed "changes saved successfully". |
| B11 — Hard reload + persistence check | PARTIAL / **BUG** | Save genuinely persisted: S3 + CloudFront (`age: 11s`) both serve the new value `ka1_61_a`. But after Ctrl+Shift+R the UI still showed old data (count = 3, old shelf ID present). Cause: `csv-editor.js:346` calls `fetch(.../mapping.csv)` with no `cache: 'no-cache'` option → browser serves stale cached body. Same bug class as the floor-SVG cache bug (PR #34, documented in CLAUDE.md). Verified by toggling DevTools → "Disable cache" → reload: count drops to 2 as expected. |
| B12 — Delete-row confirm dialog | PASS | Native confirm dialog: `Delete row 275 (svgCode "kb1_28_b")? This cannot be undone here — recover via S3 version history if needed.` — matches expected format, plus a nice safety message about S3 version recovery. |
| B13 / B13a — Confirm + Save | DEFERRED | Cancelled by tester to avoid losing metadata. Persistence round-trip already validated in B10/B11; same Save-button bug would apply. Re-test after the Save-button fix is shipped. |
| B14 — Toggle OFF | PASS | Button returned to outline style, full table restored, inline actions removed from formerly-broken rows. |
| B15 — Normal CSV edit + save | PASS | Edit → Save → reload round-trip works cleanly on normal rows. Confirms the Save-button bug is localized to the new rename/delete-broken-row handlers, not the broader edit flow. |
| B16 — SVG Manager tab | PASS (with caveat) | View loaded, maps + buttons rendered. Console showed the listSvg 502 again on initial call — same cold-start pattern already logged from B2. UI recovered (likely Lambda warmed + retry or partial fallback). Worth verifying whether the recovery is intentional retry logic or accidental. |
| B17 — Version History tab | PASS | View loaded, versions listed, no console errors. |
| B18 — User Management tab | PASS | Loaded cleanly, user list rendered, no console errors. |
| B19 — Return to CSV Editor, toggle re-check | PASS | Toggle present, count = 2 (consistent with one rename in B10, no deletion). |

## Issues / follow-ups

- **listSvg Lambda cold-start 502** (observed B2): First navigation to Map Files after admin login fails with `502 Bad Gateway` on `GET /prod/api/svg`; browser reports it as CORS because API Gateway doesn't attach CORS headers on Lambda errors. Self-heals on second visit (warm container). Candidate fixes: bump Lambda memory/timeout, add provisioned concurrency, or add a tiny warmup ping. Not blocking Plan A — open as separate GitHub issue.
- **Save button not enabled after Rename / Delete on broken rows** (observed B9, blocks B10/B11/B13a): `admin/components/csv-editor.js` lines 265 and 276 set `hasChanges = true` directly instead of calling `markChanged()`. The dirty flag flips but `updateSaveButton()` is never called, so the Save button stays disabled. Fix: replace `hasChanges = true;` with `markChanged();` on both lines. **This is a Plan A regression and should be patched before declaring Plan A verified.** Workaround for the rest of this session: trigger any normal cell `input` event to enable Save.
- **CSV fetched without `cache: 'no-cache'`** (observed B11): `admin/components/csv-editor.js:346` fetches `mapping.csv` without the cache-busting option. After a successful save, even a hard reload (Ctrl+Shift+R) can return the stale cached body. Same bug pattern as PR #34's floor-SVG fix; CLAUDE.md already warns about this for floor SVGs. **Fix: add `{ cache: 'no-cache' }` to the fetch on line 346.** Also worth adding a regression test mirroring `admin/__tests__/svg-loader.test.js`, and updating CLAUDE.md to extend the no-cache rule to the CSV. |
- **Version History "Restore" button does nothing** (observed mid-B12, outside test plan): Clicking Restore on a CSV version in the Version History view produces no console output, no network request, no dialog. Click handler isn't reaching `handleVersionRestore` in `admin/app.js:284`. Suspected causes: event delegation broken (e.g., `#version-history` container wasn't present when `setupEventListeners` ran), `onRestoreCallback` never set, or CloudFront serving stale JS. **Important because it breaks the documented rollback safety net** referenced in the delete-row confirm dialog and the test plan's "recover via S3 version history" guidance. Needs a dedicated investigation + GitHub issue. |

## Final summary

### Plan A status: **NOT VERIFIED — re-test required after fixes**

Both Plan A user-visible additions exist and mostly behave as designed (toggle, count, dropdown options, delete confirm, language toggle, floor-scoping, server persistence). However, **two real Plan A regressions** were found that break the primary user flow of the new feature:

1. **Save button doesn't enable after Rename / Delete on broken rows.** Without the cell-input workaround, a user cannot save the cleanup actions the feature is designed for.
2. **CSV fetched without `cache: 'no-cache'`.** Even after a successful save, hard-reload returns stale data — making the user think nothing happened, exactly what we saw in B11.

Both fixes are tiny (1–2 lines each) but they are blocking — a non-engineer tester would have concluded the feature is broken.

### Per-section result

| Section | Result |
|---|---|
| B — Foundation smoke test (flag OFF) | **PARTIAL** — 13/15 attempted steps PASS; B9 & B11 are PARTIAL (BUG); B13/B13a deferred. |
| C — Enforcement test (flag ON) | **SKIPPED** — deferred until B fixes are applied and a clean re-run is possible. |

### Recommended next steps (in order)

1. **Fix the Save-button bug** — `admin/components/csv-editor.js:265` and `:276` → replace `hasChanges = true;` with `markChanged();`. Adds 2 character edits + redeploy admin SPA.
2. **Fix the CSV cache bug** — `admin/components/csv-editor.js:346` → add `{ cache: 'no-cache' }` to the `fetch()` call. Adds a regression test in `admin/__tests__/` mirroring `svg-loader.test.js`. Update CLAUDE.md to extend the no-cache rule to the CSV.
3. **Redeploy admin SPA** + CloudFront invalidation on `/admin/components/csv-editor.js`.
4. **Re-run this manual QA** from B5 onward — should pass cleanly without workarounds. Then mark Plan A verified and close issue #40.
5. **Then** (and only then) consider Section C (flag-on enforcement test).

### Side issues (outside Plan A scope — separate GitHub issues)

- **Version History "Restore" silently does nothing.** Severity: medium-high (undermines the rollback safety net Plan A's UI explicitly points users to).
- **listSvg Lambda cold-start returns 502 + missing CORS headers.** Severity: low (self-heals on retry, UI mostly recovers), but creates noisy console errors and confusing first-visit UX.

### Test session result (per test plan template)

| Field | Value |
|---|---|
| Tester | Hagay |
| Date / time | 2026-05-17 |
| Browser + version | (record from your DevTools — User-Agent in Network tab → any request → Request Headers) |
| Branch SHA tested | `77c7234` (current `main` HEAD) |
| `BUNDLE_INVARIANT_ENABLED` at test time | `false` (default) |
| Section B result | **PARTIAL** (2 bugs blocking the new feature's primary path) |
| Section C result | SKIPPED |
| Broken refs count before cleanup (B3) | 3 |
| Broken refs count after cleanup | 2 (one rename via workaround; deletion deferred) |
| Console errors observed | Yes: (1) Tailwind CDN dev-mode warning, (2) favicon 403, (3) listSvg 502/CORS on first SVG Manager visit. Items 1–2 are cosmetic; item 3 is the cold-start issue. |
| Notes / surprises | Two Plan A bugs found; one tangential bug (Version History Restore) found. All three have clear fixes. |
| Recommended next step | **Fix Save-button bug + CSV cache bug → redeploy → re-test B from B5. Do not declare Plan A verified yet.** |

