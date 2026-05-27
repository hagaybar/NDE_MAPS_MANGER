# Issue #78 Phase 1 — Map-management flow: plain librarian language

**Date:** 2026-05-27
**Issue:** [#78](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/78) (app-wide plain language) — **Phase 1 = the map-management / replace-a-map flow** librarians use most.
**Continues:** #73 (validation panel), which established the first-person assistant voice.

## Goal

Rewrite the user-facing text of the map-replace flow into plain, reassuring, first-person librarian language; remove system jargon ("staging", "promote", "validate", "reconcile", "CSV reference"); name the real-world action and floor; keep en/he i18n parity. Move the reconcile wizard's currently-hardcoded English into i18n.

## Voice (from #73)

First-person assistant, reassuring. The panel/dialogs "speak" as the tool. Hebrew drafts below use masculine-present for progress verbs to match the existing `svg.staging.progress.*` style (`מעלה`/`בודק`/`מעדכן`); the user may adjust gender/register in review.

## Surface 1 — Progress modal (`admin/components/staging-progress-modal.js`)

Thread the **floor** into the modal: `showStagingProgressModal(opts)` accepts `{ floor }`; the heading interpolates it. `resolveStepText` no longer strips `{filename}` because the new step strings have no `{filename}`. `t(key, vars)` gains interpolation (same pattern as #73's staging-panel `t`).

| Key | English | Hebrew (draft) |
|---|---|---|
| `svg.staging.progress.heading` | Replacing the Floor {floor} map | מחליף את מפת קומה {floor} |
| `svg.staging.progress.uploading` | Sending your new map… | שולח את המפה החדשה… |
| `svg.staging.progress.validating` | Checking it against your shelf information… | בודק מול נתוני המדפים שלך… |
| `svg.staging.progress.refreshing` | Almost done… | כמעט סיימתי… |
| `svg.staging.progress.doNotClose` | Please keep this tab open — I'm still working. | נא להשאיר את הלשונית פתוחה — אני עדיין עובד על זה. |
| `svg.staging.progress.stuckWarning` | This is taking longer than usual — it may not have gone through. Keep waiting, or close and try again. | זה לוקח יותר זמן מהרגיל — ייתכן שזה לא הושלם. אפשר להמשיך להמתין, או לסגור ולנסות שוב. |
| `svg.staging.progress.forceClose` | Close anyway | סגור בכל זאת |
| `svg.staging.progress.leaveWarning` | I'm still working on your map — leaving now could leave it half-updated. | אני עדיין עובד על המפה שלך — יציאה עכשיו עלולה להשאיר אותה מעודכנת חלקית. |

**Floor source:** the replace flow has the filename (`floor_N.svg`, `replaceBtn.dataset.filename`); derive `floor` via `/floor_(\d+)\.svg/`. If it doesn't match, fall back to a generic heading key `svg.staging.progress.headingGeneric` ("Replacing the map" / "מחליף את המפה").

## Surface 2 — Map Files toasts/confirms (`admin/components/svg-manager.js`)

`confirmReplace`/`replaceSuccess` switch their `{filename}` placeholder to `{floor}` (derive as above; fall back to filename-based keys `confirmReplaceFile`/`replaceSuccessFile` when not a `floor_N.svg`).

| Key | English | Hebrew (draft) |
|---|---|---|
| `svg.staging.promoted` | Your new map is now live. | המפה החדשה שלך עכשיו פעילה באתר. |
| `svg.staging.promoteFailed` | I couldn't publish the map. Please try again. | לא הצלחתי לפרסם את המפה. נסו שוב. |
| `svg.staging.uploadFailed` | I couldn't take that map. Please try again. | לא הצלחתי לקבל את המפה. נסו שוב. |
| `svg.staging.reconcileFailed` | I couldn't apply those fixes. Please try again. | לא הצלחתי להחיל את התיקונים. נסו שוב. |
| `svg.staging.confirmDiscard` | Throw away this map and start over? | להשליך את המפה הזו ולהתחיל מחדש? |
| `svg.staging.discarding` | Throwing it away… | משליך… |
| `svg.staging.discarded` | Discarded — nothing was published. | הושלך — שום דבר לא פורסם. |
| `svg.staging.discardFailed` | I couldn't discard it. Please try again. | לא הצלחתי להשליך. נסו שוב. |
| `svg.confirmReplace` | Replace the Floor {floor} map with this file? I'll keep the current one in Version History so you can roll back. | להחליף את מפת קומה {floor} בקובץ הזה? אשמור את הקודמת בהיסטוריית הגרסאות כדי שתוכלו לחזור אליה. |
| `svg.replaceSuccess` | Done — the Floor {floor} map is updated. The previous one is saved in Version History. | בוצע — מפת קומה {floor} עודכנה. הקודמת נשמרה בהיסטוריית הגרסאות. |
| `svg.replaceError` | I couldn't replace that map. Please try again. | לא הצלחתי להחליף את המפה. נסו שוב. |
| `svg.confirmDelete` | Delete this map? Patrons won't see it anymore. | למחוק את המפה הזו? משתמשים לא יראו אותה יותר. |

Leave clear labels unchanged: `svg.title` (Map Files), `svg.upload`, `svg.delete`, `svg.preview`, `svg.download`, `svg.replace`, dropzone text.

## Surface 3 — Reconcile wizard (`admin/components/svg-manager/reconcile-wizard.js`)

Currently **hardcoded English, no i18n**. Add `import i18n` + a `FALLBACKS` map + interpolation-aware `t(key, vars)` (same idiom as staging-panel.js), and replace every hardcoded string. New key namespace: `svg.staging.reconcile.*`. Plural handling stays inline (`n === 1 ? … : …`) the way the file already does it, but via two keys (singular/plural) or an `{n}` + separate "entry/entries" word; simplest: keep computing the `entries` word in JS and interpolate `{entries}`.

| Key | English | Hebrew (draft) |
|---|---|---|
| `svg.staging.reconcile.title` | Before you publish: a few shelves on Floor {floor} changed — tell me what happened | לפני הפרסום: כמה מדפים בקומה {floor} השתנו — ספרו לי מה קרה |
| `svg.staging.reconcile.renameHeading` | Looks like a shelf was renamed | נראה שמדף שונה בשמו |
| `svg.staging.reconcile.sameShelf` | Same shelf on the map — it just has a new label. | אותו מדף במפה — פשוט עם תווית חדשה. |
| `svg.staging.reconcile.entriesUse` | {entries} currently use "{code}". | {entries} משתמשות כרגע ב"{code}". |
| `svg.staging.reconcile.applyRename` | Yes, same shelf — keep the entries | כן, אותו מדף — לשמור את הרשומות |
| `svg.staging.reconcile.notRename` | No, different shelf — remove those {entries} | לא, מדף אחר — להסיר את {entries} |
| `svg.staging.reconcile.differentShelf` | It became this shelf instead: | הוא הפך למדף הזה: |
| `svg.staging.reconcile.goneHeading` | "{code}" is no longer on the map | "{code}" כבר לא נמצא במפה |
| `svg.staging.reconcile.gonePrompt` | {entries} use it. What happened to it? | {entries} משתמשות בו. מה קרה לו? |
| `svg.staging.reconcile.renamedTo` | It became this shelf: | הוא הפך למדף: |
| `svg.staging.reconcile.removeEntries` | It's gone for good — remove those {entries} | הוא נעלם לתמיד — להסיר את {entries} |
| `svg.staging.reconcile.apply` | Apply these changes | החל את השינויים |
| `svg.staging.reconcile.cancel` | Cancel | ביטול |
| `svg.staging.reconcile.confirmDelete` | This permanently removes {entries} for shelves that are gone. Continue? | פעולה זו תסיר לצמיתות {entries} עבור מדפים שאינם קיימים יותר. להמשיך? |
| `svg.staging.reconcile.entry` | library entry | רשומת ספרייה |
| `svg.staging.reconcile.entries` | library entries | רשומות ספרייה |

`{entries}` = `{n} ` + (n===1 ? `entry` : `entries`) word, built in JS from the two keys above, so en reads "3 library entries" / "1 library entry" and he reads "3 רשומות ספרייה" / "רשומת ספרייה אחת" (Hebrew plural handled by the singular/plural keys; for n=1 the JS uses the singular key without the number, or "{n} {entry-word}" — keep en/he forms readable; user may refine Hebrew counting in review).

## Code changes

- `admin/components/staging-progress-modal.js`: `showStagingProgressModal({ floor })`; interpolation-aware `t(key, vars)`; heading uses `{floor}` (or generic fallback); `resolveStepText` drops the `{filename}` strip; `FALLBACKS` updated.
- `admin/components/svg-manager.js`: in the replace flow, derive `floor` from the filename and pass `{ floor }` to `showStagingProgressModal`; thread `{floor}` into confirmReplace/replaceSuccess (fallback to file-based keys); `FALLBACKS` + toast/confirm copy updated.
- `admin/components/svg-manager/reconcile-wizard.js`: add i18n (`import i18n`, `FALLBACKS`, `t(key,vars)`); replace all hardcoded strings.
- `admin/i18n/en.json` + `admin/i18n/he.json`: add/rewrite the keys above (incl. new `svg.staging.reconcile.*`, `svg.staging.progress.headingGeneric`, `svg.confirmReplaceFile`/`replaceSuccessFile`).

## Testing

- Update unit tests asserting old copy: `staging-progress-modal.test.js`, `svg-manager-replace-progress.test.js`, `svg-manager-discard-progress.test.js`, `svg-manager.test.js`, `svg-manager-promote-event.test.js`, `reconcile-wizard.test.js`. Add: modal heading shows "Replacing the Floor N map" given `{floor}`; reconcile wizard renders i18n copy.
- E2E: any sot-staging / progress-modal assertions on old headings → new copy (`data-testid="staging-progress-modal-heading"`, `data-action` selectors unchanged). Run via repo-root server (`npx http-server . -p 8123` + `E2E_BASE_URL`).
- Full admin jest green except the 14 known pre-existing failures.

## Acceptance

1. The progress modal heading reads "Replacing the Floor N map" (floor derived from the replaced file).
2. Map Files toasts/confirms and the reconcile wizard read in plain librarian language; no "staging"/"promote"/"reconcile"/"CSV reference" jargon in the default copy.
3. Reconcile wizard strings live in i18n (en + he) — no hardcoded English left in `reconcile-wizard.js`.
4. en/he parity; existing tests updated and green.

## Out of scope (later #78 phases)

CSV/Location editor, Users, Version History, Errors dashboard, auth screens. Also the pre-existing reconcile-wizard **e2e selector drift** (`[data-reconcile-row] select`, PR#74) — a behavior/test-structure fix tracked with #57/#59, separate from this copy pass.

## Deploy

After merge: `./redeploy.sh` (admin SPA + CloudFront `/admin/*`). **No Lambda change** in Phase 1 (all client-side), so no Lambda redeploy needed.
