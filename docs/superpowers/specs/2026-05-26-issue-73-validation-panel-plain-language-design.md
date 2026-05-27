# Issue #73 — Validation panel: honest after reconcile + plain librarian language

**Date:** 2026-05-26
**Issue:** [#73](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/73) (type: bug, area: validation, priority: high)
**Continues:** Phase 2 "honest validation" work ([#51/#56], PR #67) and Phase 4a renames (PR #74).

## Problem

Two related defects in the staging **validation panel**, both about being honest and legible to the librarians who use it.

### Problem 1 — over-reports after a reconcile (looks like data loss) 🐞

After applying a rename in the reconcile wizard and re-validating, the panel shows **"Validation passed — ready to promote"** but *also* reports `N library entries will be unlinked` and lists the very shelf code the operator just reconciled under "pre-existing unmapped." A librarian reasonably concludes the CSV row was deleted. It was not — the *staged* CSV contains the row; the summary is computed against the wrong CSV.

**Root cause** (`lambda/validateStaging.mjs`):
- `result.ok` is computed against the **staged** CSV (`fetchObjectOrFallback('staging/data/mapping.csv', 'data/mapping.csv')`, parsed into `rows`).
- The informational `summary` (`removedRefs`, `unmappedShelves`) is computed against the **production** CSV (`prodRefsByFloor`, built from `fetchObject('data/mapping.csv')`).

After a reconcile writes `staging/data/mapping.csv`, the two disagree: the bundle check passes (staged CSV resolves), while the summary still diffs the staged SVG against **prod** CSV refs and flags the just-reconciled shelf as unlinked/unmapped.

### Problem 2 — copy is too dense + technical for librarians ✏️

The panel reads like an engineer's diff: it always shows every category (including `0 newly added`, `0 removed`, `0 unlinked` …), uses data-model jargon ("validation", "unlinked", "bundle", "promote"), and several strings are hardcoded English (no i18n at all). The operator asked for plain, reassuring language aimed at a librarian.

## Design

### Part 1 — Backend: compute the summary against the staged CSV

In `lambda/validateStaging.mjs`:

- Build the CSV-ref index from the **staged** `rows` (already parsed for `result.ok`) instead of the prod CSV. Rename `prodRefsByFloor` → `csvRefsByFloor`, populated from `rows`.
- `removedRefs[].affectedRowCount` counts the **staged** `rows` (not `prodCsvRows`).
- Remove the now-unused `const { rows: prodCsvRows } = parseCsvContent(await fetchObject('data/mapping.csv'))` fetch.
- **Unchanged:** `newlyAddedShelves` and `removedShelves` still diff against the **production SVG** (`prodSvgShelfIdsByFloor`) — those are correct ("new/dropped in this upload") and not part of the bug. Rename detection unchanged.

**Why this is safe:** before any reconcile, the staged CSV falls back to prod (`fetchObjectOrFallback`), so `rows` == prod rows and behavior is byte-for-byte identical. Only *after* a reconcile do they diverge — and then the staged CSV is the correct source, so the reconciled shelf stops being reported as unlinked/unmapped.

This also corrects the **failed-state** `removedRefs` list (same `csvRefsByFloor`): before reconcile it's identical to today; it can never be "wrong" the way the passed state was.

**Regression test** (`lambda/__tests__/validateStaging.test.mjs`, or a focused new file): set up staged SVG with a renamed shelf code + a staged CSV that references the new code → call the handler with mocked S3 → assert `result.ok === true`, and `summary.removedRefs` and `summary.unmappedShelves` do **not** contain the reconciled code (old or new).

### Part 2 — Frontend: plain first-person copy, hide zero-count sections

**Voice:** first-person assistant (the panel "speaks" as the tool), reassuring.
**Structure:** render only sections that have items; a section with count 0 is omitted entirely. The passed headline always shows.
**i18n:** move ALL panel strings (including currently-hardcoded ones) into `i18n/en.json` + `i18n/he.json` under `svg.staging.*`, with matching `FALLBACKS` entries in `staging-panel.js`. en/he parity required.
**Buttons:** only the visible labels change; `data-action` attributes are untouched (wiring intact).

#### String table

`{count}`, `{floor}`, `{owner}` are interpolated. Hebrew is a **draft for review** (see note on gender/address below). Existing keys are *rewritten*; new keys are marked **(new)**.

| Key | English | Hebrew (draft) |
|---|---|---|
| `svg.staging.validate.passed` | The map you sent looks fine — it passed my checks and matches your shelf information. Want to start using it? | המפה ששלחתם נראית תקינה — היא עברה את הבדיקות שלי ותואמת את נתוני המדפים שלכם. רוצים להתחיל להשתמש בה? |
| `svg.staging.validate.renamed` | {count} shelf(s) were renamed — same physical shelf, new label: | {count} מדפים שונו בשמם — אותו מדף פיזי, תווית חדשה: |
| `svg.staging.validate.renamedNote` | (same shelf) | (אותו מדף) |
| `svg.staging.validate.renamedHint` | Same spot on the map — no patron-facing links break. | אותו מקום במפה — אף קישור הפונה למשתמשים אינו נשבר. |
| `svg.staging.validate.newlyAdded` | This map has {count} new shelf(s) I don't have library info for yet — patrons won't find them in search until you add them: | במפה הזו יש {count} מדפים חדשים שעדיין אין לי עבורם נתוני ספרייה — משתמשים לא ימצאו אותם בחיפוש עד שתוסיפו אותם: |
| `svg.staging.validate.removed` | {count} shelf(s) from the old map aren't on this one anymore: | {count} מדפים שהיו במפה הישנה אינם מופיעים יותר במפה הזו: |
| `svg.staging.validate.unlinked` | Heads up: {count} library entr(y/ies) point to shelves that aren't on this map anymore — they'll stop showing up in search until you re-link them: | לתשומת לבכם: {count} רשומות ספרייה מצביעות על מדפים שכבר אינם במפה — הן יפסיקו להופיע בחיפוש עד שתקשרו אותן מחדש: |
| `svg.staging.validate.preExisting` | {count} shelf(s) on the map still have no library info (already like this) — patrons can't find them until you add them: | {count} מדפים במפה עדיין ללא נתוני ספרייה (כבר היו במצב הזה) — משתמשים לא ימצאו אותם עד שתוסיפו אותם: |
| `svg.staging.validate.shelfFloor` | Floor {floor}: | קומה {floor}: |
| `svg.staging.validate.failed` **(new)** | I checked the map and found {count} thing(s) that don't match your shelf data yet. Let's fix them together. | בדקתי את המפה ומצאתי {count} דברים שעדיין אינם תואמים את נתוני המדפים שלכם. בואו נתקן אותם יחד. |
| `svg.staging.validate.failedItem` **(new)** | Floor {floor}: {code} — {rows} affected | קומה {floor}: {code} — {rows} רשומות מושפעות |
| `svg.staging.awaiting` **(new)** | I haven't checked this map yet. Press "Check the map" when you're ready. | עדיין לא בדקתי את המפה הזו. לחצו על "בדוק את המפה" כשאתם מוכנים. |
| `svg.staging.noStaging` **(new)** | No map is waiting for review. Upload a new map to start. | אין מפה הממתינה לבדיקה. העלו מפה חדשה כדי להתחיל. |
| `svg.staging.lockedByOther` **(new)** | {owner} is working on a map right now — wait for them to finish or ask them to discard it. | {owner} עובד/ת כעת על מפה — המתינו לסיום או בקשו לבטל אותה. |
| `svg.staging.header` **(new)** | Map waiting for review (uploaded by {owner}) | מפה ממתינה לבדיקה (הועלתה על־ידי {owner}) |
| `svg.staging.actions.validate` **(new)** | Check the map | בדוק את המפה |
| `svg.staging.actions.promote` **(new)** | Start using this map | התחילו להשתמש במפה |
| `svg.staging.actions.reconcile` **(new)** | Fix the mismatches | תקנו את אי־ההתאמות |
| `svg.staging.actions.discard` **(new)** | Discard | בטל |

**Hebrew note for review:** drafts use **plural address** (תוסיפו / לחצו / המתינו / בואו) for gender-neutral politeness, consistent with how the existing he.json hints read. The user (native Hebrew, library context) should confirm/adjust address form and button phrasing (noun-gerund vs. imperative) during spec review.

#### Section ordering (passed state)

Most-reassuring first, action-needed after: **renamed → newly added → removed → unlinked → pre-existing**. Each rendered only when its list is non-empty. "Pre-existing unmapped" = staged-unmapped shelves not in `newlyAddedShelves` (existing derivation in `staging-panel.js`, unchanged).

### Components touched

- `lambda/validateStaging.mjs` — Part 1 fix.
- `admin/components/svg-manager/staging-panel.js` — Part 2 render rewrite + `FALLBACKS` update; hide-zero logic; i18n the hardcoded `noStaging` / `lockedByOther` / `awaiting` / header / button strings.
- `admin/i18n/en.json`, `admin/i18n/he.json` — rewritten + new `svg.staging.*` keys.

## Testing

- **Lambda regression** (`lambda/__tests__`): reconcile-rename → staged CSV references new code → `summary.removedRefs`/`unmappedShelves` exclude it; `result.ok` true. (Acceptance #1.)
- **Admin unit** (`admin/__tests__/staging-panel.test.js`): passed state hides zero-count sections; shows only non-empty sections with the new copy; failed/awaiting/locked/no-staging states render the new strings; buttons carry the new labels but unchanged `data-action`. (Acceptance #2.)
- **E2E** (`e2e/tests/sot-staging.spec.ts`): update text/label assertions to the new copy (selectors keyed on `data-action` stay valid). Run via repo-root server: `npx http-server . -p 8123` + `E2E_BASE_URL=http://localhost:8123 npx playwright test`.
- Full admin jest + lambda jest suites green (14 pre-existing admin failures remain, unrelated).

## Acceptance criteria (from the issue)

1. After a reconcile + re-validate, the reconciled shelf is **not** reported as unlinked/unmapped. → Part 1 + lambda regression test.
2. The panel's primary states read in plain librarian language (no "validation"/"unlinked"/"bundle"/"promote" jargon in the default view). → Part 2 copy + i18n.

## Out of scope

- Reconcile wizard behavior (#57/#59 — Phase 4b/4c).
- The `?v=` CloudFront work (#65).
- Pluralization engine: keep `{count}`-interpolated "(s)" forms; only the easy singular/plural inline cases (already present for the failed-count) are handled. Full ICU plural is not introduced.

## Deploy

After merge: `./redeploy.sh` (admin SPA → S3 + CloudFront `/admin/*` invalidation) **and** redeploy the `validateStaging` Lambda (Part 1 changes server code). Confirm live, then hard-refresh.
