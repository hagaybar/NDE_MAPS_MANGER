> **Status:** Historical · Created 2026-05-17 · Manual QA log — SoT foundation retest. Kept for the record.

# SoT Foundation Manual QA — Re-Test (post PR #41)

**Date:** 2026-05-17 (same day as initial QA, after fixes deployed)
**Tester:** Hagay
**Prior session:** `docs/manual-qa/2026-05-17-sot-foundation-test-session.md`
**Fix deployed:** PR #41 (`9e49a52`) + CloudFront invalidation `ID3VQZQ41M5H1QBY2NLT8V9CHM`

## Scope

Focused re-test of the two bugs PR #41 fixes:
1. Save button enabling on broken-row Rename/Delete
2. CSV reload returning fresh data without `cache: 'no-cache'` workaround

Other Section B steps (login, language toggle, tab switching, etc.) were verified clean in the initial QA and are not re-tested here.

## Session log

| Step | Result | Notes |
|---|---|---|
| R0 — Hard-reload + load CSV Editor (Disable cache OFF) | PASS | Toggle shows (2), matching production state (post-rename in initial B10). |
| R1 — Activate filter | PASS | Filter active, 2 broken rows with Rename + Delete inline actions. |
| R2 — Pick rename option (Save-button regression check) | **PASS — fix #1 verified** | Picked a rename option on one broken row. Save Changes button turned orange/clickable **immediately, with no workaround**. Count dropped (2) → (1). The renamed row left the filtered view. |
| R3 — Hard-reload to discard (Disable cache OFF) | **PASS — fix #2 verified** | Reload returned the count to (2). The unsaved rename was correctly discarded. With browser caching enabled, the reload pulled fresh data, confirming the no-cache fetch is reaching the network rather than returning stale browser cache. |

## Verdict

### Plan A: **VERIFIED** ✓

Both PR #41 fixes behave correctly in production:

1. **Fix #1 (Save-button enabling).** Picking a Rename option on a broken row now enables Save immediately, no cell-input workaround needed. The same code path is shared by Delete (covered by `csv-editor-broken-refs.test.js`); both inline handlers now route through `markChanged()`.
2. **Fix #2 (no-cache CSV fetch).** With the browser's "Disable cache" toggle OFF (i.e., normal caching behavior), hard-reload returns fresh data from CloudFront. Backed by `csv-editor-cache.test.js`.

No production data was changed during this re-test — all observations were of browser-local UI state, then discarded via hard-reload.

### Steps not re-tested

- B10/B13a (clicking Save end-to-end): already validated in the initial session and not gated on the fixes — the bugs were about UI state, not the save itself.
- B12 (delete confirm dialog): passed initially; the dialog text wasn't changed.
- B14–B19 (toggle off, normal edit, tab navigation): passed initially; unaffected by the fixes.

### Next actions

1. **Close issue #40** as Plan A verified.
2. Consider Section C (enforcement test, `BUNDLE_INVARIANT_ENABLED=true`) — now safe to run.
3. Plan B kickoff (staging flow / Stage 4 cutover) after Section C passes.
4. Address the unrelated bugs separately (#42 Version History Restore, #43 listSvg cold-start 502).

