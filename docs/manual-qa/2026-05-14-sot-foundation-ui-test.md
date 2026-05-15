# Manual UI Test — SoT Bundle Invariant Foundation (Plan A)

**Scope:** Hands-on UI verification after merging `feature/sot-bundle-invariant-foundation` to `main`. Targets the user-visible changes from Plan A: the new "Broken refs" filter in CSV Editor + the bundle-invariant rejection in the `putCsv` Lambda.

**Prerequisites:**

- [ ] Branch `feature/sot-bundle-invariant-foundation` is merged into `main` and deployed (admin SPA + Lambda).
- [ ] `BUNDLE_INVARIANT_ENABLED` env var on the `putCsv` Lambda is **unset or `"false"`** (default state for Section B).
- [ ] You can log in as an **admin** user.
- [ ] Browser DevTools is open (F12) — keep an eye on the Console tab for errors throughout.
- [ ] AWS CLI is configured (only needed for Section C step 15 if you choose to flip the flag).

**How to use this doc:** Walk top-to-bottom. Tick each row's checkbox if it matches the expected result. If something diverges, jot a note inline before moving on (or stop if the divergence is severe).

---

## Section A — Pre-test sanity (optional, 1 minute)

| # | Action | Expected | ✓ |
|---|---|---|---|
| A1 | Open the admin SPA URL | Standard login screen appears | ☐ |
| A2 | Open DevTools → Console | Tab is empty (no red errors before login) | ☐ |
| A3 | Note current branch + commit on the host (`git -C <repo> log --oneline -1`) | Reflects the merged feature commit | ☐ |

---

## Section B — Foundation smoke test (flag OFF) — **required**

Run every step. This is the validation that Plan A's deployment is safe and the new UI works. Nothing here can cause data loss; the flag is off so the Lambda only logs violations, never rejects them.

### B.1 — Login + entry to CSV Editor

| # | Action | Expected | ✓ | Notes |
|---|---|---|---|---|
| B1 | Log in as admin | Lands in the admin SPA. Top nav shows CSV Editor / SVG Manager / Version History / Users etc. | ☐ | |
| B2 | Click **CSV Editor** tab | View loads. Table populates after a brief Loading… state. No console errors. | ☐ | |

### B.2 — The new toggle

| # | Action | Expected | ✓ | Notes |
|---|---|---|---|---|
| B3 | Look at the toolbar (top of CSV Editor view) alongside Search / Add Row / Save | A new **amber-colored button** is appended. English label: **"Show only broken refs (N)"**. Hebrew label: **"הצג רק רפרנסים שבורים (N)"**. **N** is a non-negative integer. | ☐ | Record N here: `N = ___` |
| B4 | Switch UI language (if available) and switch back | The toggle button re-renders correctly in the new language. Count `N` is preserved. | ☐ | |

### B.3 — Activate the filter

| # | Action | Expected | ✓ | Notes |
|---|---|---|---|---|
| B5 | Click the toggle | Button turns solid amber. Table filters down to **exactly N rows** (the broken ones). All other rows are hidden via `style.display: none` (they still exist in the DOM — confirm via DevTools Elements). | ☐ | |
| B6 | If **N = 0**: skip to step B14. If **N > 0**: continue to B7. | — | ☐ | |
| B7 | Look at any visible filtered row | The row has all its normal cells **plus** two inline action elements appended at the end: a `<select data-action="rename-svgcode">` dropdown and a red `<button data-action="delete-broken-row">`. | ☐ | |

### B.4 — Cleanup: rename action

| # | Action | Expected | ✓ | Notes |
|---|---|---|---|---|
| B8 | Click the first broken row's **Rename to ▾** dropdown | Dropdown opens. First option is the placeholder `-- Rename to --`. Following options list shelf IDs from the **same floor** as that row, **excluding** any shelf already claimed by another CSV row. If the floor has no unclaimed shelves, only the placeholder appears. | ☐ | Was the dropdown empty? `___` |
| B9 | (If dropdown has options) Select any non-placeholder option | The row's `svgCode` cell updates to the picked value. Toggle count decrements: now reads **(N-1)**. The row disappears from the filtered view. The Save button (previously disabled) becomes enabled. | ☐ | |
| B10 | Click **Save** | Toast appears: **"Changes saved successfully"** (or Hebrew equivalent). Save button disables again. No errors. | ☐ | |
| B11 | Hard-reload the page (Ctrl+Shift+R / Cmd+Shift+R) and toggle Broken refs back on | Count is now **(N-1)**. The row you renamed is no longer in the list — its new `svgCode` resolved to a real shelf. | ☐ | |

### B.5 — Cleanup: delete action

| # | Action | Expected | ✓ | Notes |
|---|---|---|---|---|
| B12 | (If count > 0) Click a remaining broken row's red **Delete row** button | Native browser confirm dialog appears with text containing `"Delete row {idx} (svgCode "...")"`. The Hebrew variant says `"מחק שורה {idx} (svgCode \"...\")"`. | ☐ | |
| B13 | Click **OK / Confirm** | Row removed from local state immediately. Count decrements. Save enables. | ☐ | |
| B13a | Click **Save** | Toast on success. Hard-reload + toggle back on: row is gone from production. Count reflects the deletion. | ☐ | |

### B.6 — Toggle off + regression sanity

| # | Action | Expected | ✓ | Notes |
|---|---|---|---|---|
| B14 | Toggle Broken refs **OFF** | Button returns to outline style. Table shows all rows. Inline action elements are removed from previously-broken rows. | ☐ | |
| B15 | Edit any row normally (change a `description` cell, for example) and Save | Existing CSV edit flow still works. Toast confirms. Hard-reload persists. | ☐ | |
| B16 | Switch to **SVG Manager** tab | View loads. Files list renders. No console errors. | ☐ | |
| B17 | Switch to **Version History** tab | View loads. List of past CSV versions renders. No console errors. | ☐ | |
| B18 | Switch to **User Management** tab (admin only) | View loads. User list renders. No console errors. | ☐ | |
| B19 | Return to **CSV Editor**. Re-verify the toggle still appears with a non-stale count. | Toggle is there. Count is correct after the cleanup steps above. | ☐ | |

### B.7 — Optional: CloudWatch peek

| # | Action | Expected | ✓ | Notes |
|---|---|---|---|---|
| B20 | Open AWS CloudWatch Logs → `/aws/lambda/putCsv` log group → latest log stream | If any Save in Section B touched a CSV that had broken refs (before cleanup), you should see a structured JSON log line: `{ "level": "WARN", "metric": "bundle.violations.csv_write", "enforced": false, "errorCount": N, "errors": [...] }`. Absence is also fine if all your Saves were after cleanup. | ☐ | |

**End of required section.**

If steps B1–B19 all passed, the foundation is deployed cleanly and Plan A is verified. Stop here unless you also want to exercise hard-rule enforcement.

---

## Section C — Enforcement test (flag ON) — **optional**

**Pre-condition:** Section B is complete AND the cleanup steps brought the broken-refs count to **0** (verified by hard-reload + toggle on showing 0). Flipping the flag with broken refs still present will reject any subsequent save, even unrelated ones.

| # | Action | Expected | ✓ | Notes |
|---|---|---|---|---|
| C1 | Run the AWS CLI command below to flip the flag: | AWS responds with the updated function configuration JSON. Lambda picks it up on its next cold start (usually a few seconds). | ☐ | |
|    | `aws lambda update-function-configuration --function-name putCsv --environment "Variables={BUNDLE_INVARIANT_ENABLED=true,COGNITO_USER_POOL_ID=us-east-1_g9q5cPhVg}"` | | | |
| C2 | Back in CSV Editor, edit any one row's `svgCode` cell to an obviously bogus value, e.g. `DOES_NOT_EXIST_XYZ` | Cell updates locally. Save button enables. | ☐ | |
| C3 | Open DevTools → Network tab. Click **Save**. | Toast shows an error (something like "Failed to save changes"). In Network: the `PUT /prod/api/csv` request returns **HTTP 422**. Response body is JSON: `{ "error": "Bundle invariant violation", "errors": [{ "rowIndex": ..., "svgCode": "DOES_NOT_EXIST_XYZ", "floor": ..., "type": "shelf-not-found" }] }`. | ☐ | |
| C4 | Hard-reload the page | The bogus `svgCode` is **NOT** persisted — the cell shows the original value. Confirms the 422 truly blocked the write. | ☐ | |
| C5 | Edit the same row's `svgCode` back to a known-valid shelf ID, Save | Save succeeds. Toast confirms. Hard-reload persists. Confirms the rejection is targeted, not blanket. | ☐ | |
| C6 | (Optional) In CSV Editor, edit a completely unrelated, valid row (e.g., change a `description`) and Save | Succeeds. Confirms unrelated edits aren't accidentally caught up in the gate. | ☐ | |

### C.7 — Rollback (only if anything in C1–C6 misbehaved)

| # | Action | Expected | ✓ |
|---|---|---|---|
| C7 | Run: `aws lambda update-function-configuration --function-name putCsv --environment "Variables={BUNDLE_INVARIANT_ENABLED=false,COGNITO_USER_POOL_ID=us-east-1_g9q5cPhVg}"` | Flag is off again. Lambda reverts to log-only mode within seconds. No data is at risk in either state. | ☐ |

---

## Troubleshooting

### The toggle doesn't appear at all

- Hard-reload (Ctrl+Shift+R). The admin SPA may be serving a cached `csv-editor.js`.
- Open DevTools → Network → reload → look at `csv-editor.js`. Confirm it's the new version (search for `data-action="toggle-broken-refs"` inside the response).
- If still missing, check that the merged branch's `admin/components/csv-editor.js` actually deployed. CloudFront cache invalidation may be needed: `aws cloudfront create-invalidation --distribution-id E5SR0E5GM5GSB --paths "/admin/components/csv-editor.js"`.

### The count is `(0)` but you know data has broken refs

- The "Broken refs" rule checks against the **current SVG**. If `data-map-object="shelf"` markers are missing on a floor (notably floor 0 today), the parser returns an empty shelf set for that floor — and rows on that floor will count as orphans **and** broken refs depending on how svg-shelves resolves. Re-check `maps/floor_0.svg` has shelf markers if floor 0 is involved.
- Hard-reload first. The initial render runs `renderBrokenRefsToggle()` before the floor SVG fetches resolve; the count updates once they're back.

### Rename dropdown is always empty for every broken row

- The dropdown only lists shelves that exist on the floor **and** are not claimed by any other CSV row. If every shelf on a floor is already claimed, the dropdown stays empty. Use Delete instead, or fix the SVG to add the missing shelf.

### The 422 response in Section C never comes — every save succeeds

- The Lambda's env var may not have picked up the flag flip. Check via: `aws lambda get-function-configuration --function-name putCsv | jq '.Environment.Variables.BUNDLE_INVARIANT_ENABLED'`. Should print `"true"`.
- The Lambda may be holding a warm container with the old env. Force a cold start by saving a config-touching change again (`update-function-configuration` triggers redeploy).

### A save in Section B fails unexpectedly

- The flag may have been on accidentally. Check `BUNDLE_INVARIANT_ENABLED` (see above) and set to `"false"` if so.
- Note the failing row(s) and revisit Section B's cleanup steps before retrying.

---

## Test session result

Fill this in at the end of your run.

| Field | Value |
|---|---|
| Tester | |
| Date / time | |
| Browser + version | |
| Branch SHA tested (`git log -1`) | |
| `BUNDLE_INVARIANT_ENABLED` at test time | |
| Section B result | PASS / PARTIAL / FAIL |
| Section C result (if run) | PASS / PARTIAL / FAIL / SKIPPED |
| Broken refs count before cleanup (B3) | |
| Broken refs count after cleanup | |
| Console errors observed (Y/N + summary) | |
| Notes / surprises | |
| Recommended next step | Push to staging / Ship / Rollback / Investigate |

---

## Related references

- Spec: `docs/superpowers/specs/2026-05-13-sot-bundle-invariant-design.md`
- Plan (with execution status): `docs/superpowers/plans/2026-05-13-sot-bundle-invariant-foundation.md`
- Follow-up plan (staging flow + Stage 4 cutover): `docs/superpowers/plans/2026-05-13-sot-staging-flow.md`
- Pre-feature rollback tag: `pre-sot-foundation` (use `git reset --hard pre-sot-foundation` if a global rollback is needed)
