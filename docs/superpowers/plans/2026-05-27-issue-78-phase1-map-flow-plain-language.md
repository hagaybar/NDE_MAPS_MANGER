# Issue #78 Phase 1 — Map-flow Plain Language — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the map-replace flow's user-facing text into plain first-person librarian language: progress modal (with the floor threaded in), Map Files toasts/confirms, and the reconcile wizard (moving its hardcoded English into i18n). en/he parity.

**Architecture:** Client-only. Each surface keeps its existing `FALLBACKS` + `t(key)` idiom; **interpolation stays caller-side via `.replace('{token}', value)`** (matches the current code — no `t(key,vars)` needed). Floor is derived from the `floor_N.svg` filename the replace flow already has. Spec: `docs/superpowers/specs/2026-05-27-issue-78-phase1-map-flow-plain-language-design.md`.

**Tech Stack:** vanilla-JS admin SPA, jest/jsdom, Playwright. Test runner: `cd admin && node --experimental-vm-modules node_modules/.bin/jest <file>`.

---

## File Structure

- `admin/components/staging-progress-modal.js` — Modify: FALLBACKS + heading (floor) + step copy; `showStagingProgressModal({floor})`.
- `admin/components/svg-manager.js` — Modify: FALLBACKS + toast/confirm copy; thread floor into the modal + confirm/success.
- `admin/components/svg-manager/reconcile-wizard.js` — Modify: add i18n (`import i18n` + `FALLBACKS` + `t`); replace hardcoded strings.
- `admin/i18n/en.json`, `admin/i18n/he.json` — Modify: add/rewrite the keys.
- Tests: `admin/__tests__/staging-progress-modal.test.js`, `svg-manager-replace-progress.test.js`, `svg-manager-discard-progress.test.js`, `svg-manager.test.js`, `svg-manager-promote-event.test.js`, `reconcile-wizard.test.js`, `e2e/tests/sot-staging.spec.ts`.

---

## Task 1: Progress modal — floor in heading + plain step copy

**Files:** `admin/components/staging-progress-modal.js`; tests `admin/__tests__/staging-progress-modal.test.js`, `admin/__tests__/svg-manager-replace-progress.test.js`.

- [ ] **Step 1: Update the modal unit test to the new copy + floor**

Read `admin/__tests__/staging-progress-modal.test.js`. Update assertions that reference old copy ("Updating staged map", "Do not close this tab", "Force close", step text). Add/adjust a test that the heading shows the floor, e.g.:
```js
const modal = showStagingProgressModal({ floor: 1 });
expect(document.querySelector('[data-testid="staging-progress-modal-heading"]').textContent)
  .toContain('Replacing the Floor 1 map');
modal.close?.();
```
And a no-floor case → generic heading:
```js
const modal = showStagingProgressModal();
expect(document.querySelector('[data-testid="staging-progress-modal-heading"]').textContent)
  .toContain('Replacing the map');
```
(Match the file's existing open/close idiom; read it first.)

- [ ] **Step 2: Run, verify FAIL**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest staging-progress-modal`
Expected: FAIL (old copy; no floor in heading).

- [ ] **Step 3: Edit `staging-progress-modal.js`**

(a) Replace the relevant `FALLBACKS` entries with:
```js
  'svg.staging.progress.heading':        { en: 'Replacing the Floor {floor} map', he: 'מחליף את מפת קומה {floor}' },
  'svg.staging.progress.headingGeneric': { en: 'Replacing the map',                he: 'מחליף את המפה' },
  'svg.staging.progress.uploading':      { en: 'Sending your new map…',            he: 'שולח את המפה החדשה…' },
  'svg.staging.progress.validating':     { en: 'Checking it against your shelf information…', he: 'בודק מול נתוני המדפים שלך…' },
  'svg.staging.progress.refreshing':     { en: 'Almost done…',                     he: 'כמעט סיימתי…' },
  'svg.staging.progress.doNotClose':     { en: "Please keep this tab open — I'm still working.", he: 'נא להשאיר את הלשונית פתוחה — אני עדיין עובד על זה.' },
  'svg.staging.progress.stuckWarning':   { en: 'This is taking longer than usual — it may not have gone through. Keep waiting, or close and try again.', he: 'זה לוקח יותר זמן מהרגיל — ייתכן שזה לא הושלם. אפשר להמשיך להמתין, או לסגור ולנסות שוב.' },
  'svg.staging.progress.forceClose':     { en: 'Close anyway',                     he: 'סגור בכל זאת' },
```
Keep `leaveWarning` (lives in svg-manager.js, Task 2). If `uploading` previously had `{filename}`, it no longer does.

(b) `resolveStepText(step)` — remove the `{filename}` strip; just `return t(STEP_KEYS[step] || step)` (read the actual step-key map name in the file; the steps are `uploading|validating|refreshing`).

(c) `showStagingProgressModal(opts = {})` — accept a floor:
```js
export function showStagingProgressModal(opts = {}) {
  const floor = opts.floor;
  ...
  const headingText = (floor !== undefined && floor !== null && !Number.isNaN(Number(floor)))
    ? t('svg.staging.progress.heading').replace('{floor}', String(floor))
    : t('svg.staging.progress.headingGeneric');
```
and render `${escapeHtml(headingText)}` where the heading currently uses `t('svg.staging.progress.heading')`.

- [ ] **Step 4: Run, verify PASS**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest staging-progress-modal svg-manager-replace-progress`
Expected: PASS (update `svg-manager-replace-progress.test.js` heading/step assertions if they reference old copy — read and fix them).

- [ ] **Step 5: Mirror the strings into i18n JSON**

In `admin/i18n/en.json` and `admin/i18n/he.json`, update the `svg.staging.progress.*` block to match the FALLBACKS above and add `headingGeneric`. Validate: `node -e "JSON.parse(require('fs').readFileSync('admin/i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('admin/i18n/he.json','utf8'));console.log('ok')"` → `ok`.

- [ ] **Step 6: Commit**
```bash
git add admin/components/staging-progress-modal.js admin/__tests__/staging-progress-modal.test.js admin/__tests__/svg-manager-replace-progress.test.js admin/i18n/en.json admin/i18n/he.json
git commit -m "feat(progress-modal): plain copy + floor in heading (#78)"
```

---

## Task 2: Map Files toasts/confirms + thread floor into the modal

**Files:** `admin/components/svg-manager.js`; tests `admin/__tests__/svg-manager.test.js`, `svg-manager-discard-progress.test.js`, `svg-manager-promote-event.test.js`.

- [ ] **Step 1: Update unit tests to new copy**

Read the three test files; update assertions referencing old copy ("Staging promoted to production", "Discarding staging…", "Staging discarded", "Discard the staged changes?", "Promote failed", "Replaced {filename}…", confirm strings) to the new strings (Step 3). For floor-bearing strings assert the floor form (e.g. "the Floor 1 map is updated").

- [ ] **Step 2: Run, verify FAIL**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest svg-manager.test svg-manager-discard-progress svg-manager-promote-event`
Expected: FAIL.

- [ ] **Step 3: Edit `svg-manager.js`**

(a) Replace these `FALLBACKS` entries:
```js
  'svg.confirmReplace':     { en: "Replace the Floor {floor} map with this file? I'll keep the current one in Version History so you can roll back.", he: 'להחליף את מפת קומה {floor} בקובץ הזה? אשמור את הקודמת בהיסטוריית הגרסאות כדי שתוכלו לחזור אליה.' },
  'svg.confirmReplaceFile': { en: "Replace {filename} with this file? I'll keep the current one in Version History so you can roll back.", he: 'להחליף את {filename} בקובץ הזה? אשמור את הקודמת בהיסטוריית הגרסאות כדי שתוכלו לחזור אליה.' },
  'svg.replaceSuccess':     { en: 'Done — the Floor {floor} map is updated. The previous one is saved in Version History.', he: 'בוצע — מפת קומה {floor} עודכנה. הקודמת נשמרה בהיסטוריית הגרסאות.' },
  'svg.replaceSuccessFile': { en: 'Done — {filename} is updated. The previous one is saved in Version History.', he: 'בוצע — {filename} עודכן. הקודמת נשמרה בהיסטוריית הגרסאות.' },
  'svg.replaceError':       { en: "I couldn't replace that map. Please try again.", he: 'לא הצלחתי להחליף את המפה. נסו שוב.' },
  'svg.confirmDelete':      { en: "Delete this map? Patrons won't see it anymore.", he: 'למחוק את המפה הזו? משתמשים לא יראו אותה יותר.' },
  'svg.staging.promoted':        { en: 'Your new map is now live.',                  he: 'המפה החדשה שלך עכשיו פעילה באתר.' },
  'svg.staging.promoteFailed':   { en: "I couldn't publish the map. Please try again.", he: 'לא הצלחתי לפרסם את המפה. נסו שוב.' },
  'svg.staging.uploadFailed':    { en: "I couldn't take that map. Please try again.",  he: 'לא הצלחתי לקבל את המפה. נסו שוב.' },
  'svg.staging.reconcileFailed': { en: "I couldn't apply those fixes. Please try again.", he: 'לא הצלחתי להחיל את התיקונים. נסו שוב.' },
  'svg.staging.confirmDiscard':  { en: 'Throw away this map and start over?',         he: 'להשליך את המפה הזו ולהתחיל מחדש?' },
  'svg.staging.discarding':      { en: 'Throwing it away…',                           he: 'משליך…' },
  'svg.staging.discarded':       { en: 'Discarded — nothing was published.',          he: 'הושלך — שום דבר לא פורסם.' },
  'svg.staging.discardFailed':   { en: "I couldn't discard it. Please try again.",    he: 'לא הצלחתי להשליך. נסו שוב.' },
  'svg.staging.progress.leaveWarning': { en: "I'm still working on your map — leaving now could leave it half-updated.", he: 'אני עדיין עובד על המפה שלך — יציאה עכשיו עלולה להשאיר אותה מעודכנת חלקית.' },
```

(b) Replace-confirm handler — derive floor and pick the right key (read the handler near `t('svg.confirmReplace').replace('{filename}', filename)`):
```js
const fm = String(filename).match(/floor_(\d+)\.svg/);
const msg = fm
  ? t('svg.confirmReplace').replace('{floor}', fm[1])
  : t('svg.confirmReplaceFile').replace('{filename}', filename);
if (!confirm(msg)) return;
```

(c) Replace-success toast — same floor logic (find where `svg.replaceSuccess` is shown):
```js
const fm = String(filename).match(/floor_(\d+)\.svg/);
showToast(fm
  ? t('svg.replaceSuccess').replace('{floor}', fm[1])
  : t('svg.replaceSuccessFile').replace('{filename}', filename), 'success');
```

(d) `beginStagingSequence(filename)` — thread the floor into the modal:
```js
function beginStagingSequence(filename) {
  const fm = String(filename || '').match(/floor_(\d+)\.svg/);
  const modal = showStagingProgressModal(fm ? { floor: Number(fm[1]) } : {});
  ...
```
(Remove the now-accurate `eslint-disable no-unused-vars` since `filename` is used.)

- [ ] **Step 4: Run, verify PASS**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest svg-manager.test svg-manager-discard-progress svg-manager-promote-event`
Expected: PASS.

- [ ] **Step 5: Mirror into i18n JSON + validate parse** (same keys as 3(a) into `en.json`/`he.json`; add `confirmReplaceFile`/`replaceSuccessFile`). Validate JSON parses.

- [ ] **Step 6: Commit**
```bash
git add admin/components/svg-manager.js admin/__tests__/svg-manager.test.js admin/__tests__/svg-manager-discard-progress.test.js admin/__tests__/svg-manager-promote-event.test.js admin/i18n/en.json admin/i18n/he.json
git commit -m "feat(svg-manager): plain toasts/confirms + floor in replace copy (#78)"
```

---

## Task 3: Reconcile wizard — add i18n + plain copy

**Files:** `admin/components/svg-manager/reconcile-wizard.js`; test `admin/__tests__/reconcile-wizard.test.js`.

- [ ] **Step 1: Update the wizard unit test to the new i18n copy**

Read `admin/__tests__/reconcile-wizard.test.js`; update assertions on old hardcoded strings ("Looks like a rename", "Yes — apply this rename", "Confirm what changed on floor", "Apply", etc.) to the new copy (Step 3).

- [ ] **Step 2: Run, verify FAIL**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest reconcile-wizard`
Expected: FAIL.

- [ ] **Step 3: Edit `reconcile-wizard.js` — add i18n + replace hardcoded strings**

(a) At the top add:
```js
import i18n from '../../i18n.js?v=5';

const FALLBACKS = {
  'svg.staging.reconcile.title':          { en: 'Before you publish: a few shelves on Floor {floor} changed — tell me what happened', he: 'לפני הפרסום: כמה מדפים בקומה {floor} השתנו — ספרו לי מה קרה' },
  'svg.staging.reconcile.renameHeading':  { en: 'Looks like a shelf was renamed', he: 'נראה שמדף שונה בשמו' },
  'svg.staging.reconcile.sameShelf':      { en: 'Same shelf on the map — it just has a new label.', he: 'אותו מדף במפה — פשוט עם תווית חדשה.' },
  'svg.staging.reconcile.entriesUse':     { en: '{entries} currently use "{code}".', he: '{entries} משתמשות כרגע ב"{code}".' },
  'svg.staging.reconcile.applyRename':    { en: 'Yes, same shelf — keep the entries', he: 'כן, אותו מדף — לשמור את הרשומות' },
  'svg.staging.reconcile.notRename':      { en: 'No, different shelf — remove those {entries}', he: 'לא, מדף אחר — להסיר את {entries}' },
  'svg.staging.reconcile.differentShelf': { en: 'It became this shelf instead:', he: 'הוא הפך למדף הזה:' },
  'svg.staging.reconcile.goneHeading':    { en: '"{code}" is no longer on the map', he: '"{code}" כבר לא נמצא במפה' },
  'svg.staging.reconcile.gonePrompt':     { en: '{entries} use it. What happened to it?', he: '{entries} משתמשות בו. מה קרה לו?' },
  'svg.staging.reconcile.renamedTo':      { en: 'It became this shelf:', he: 'הוא הפך למדף:' },
  'svg.staging.reconcile.removeEntries':  { en: "It's gone for good — remove those {entries}", he: 'הוא נעלם לתמיד — להסיר את {entries}' },
  'svg.staging.reconcile.apply':          { en: 'Apply these changes', he: 'החל את השינויים' },
  'svg.staging.reconcile.cancel':         { en: 'Cancel', he: 'ביטול' },
  'svg.staging.reconcile.confirmDelete':  { en: 'This permanently removes {entries} for shelves that are gone. Continue?', he: 'פעולה זו תסיר לצמיתות {entries} עבור מדפים שאינם קיימים יותר. להמשיך?' },
  'svg.staging.reconcile.entryWord':      { en: 'library entry', he: 'רשומת ספרייה' },
  'svg.staging.reconcile.entriesWord':    { en: 'library entries', he: 'רשומות ספרייה' },
};

function t(key) {
  const value = i18n.t(key);
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale?.() || 'en';
    return FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  return value;
}

// "3 library entries" / "1 library entry" (en); he uses the same shape.
function entriesPhrase(n) {
  const word = n === 1 ? t('svg.staging.reconcile.entryWord') : t('svg.staging.reconcile.entriesWord');
  return `${n} ${word}`;
}
```

(b) Replace every hardcoded English string in the render with `t(...)` + `.replace(...)`. Concretely:
- `const entries = entriesPhrase(n);` (replaces the inline `${n} library ${...}` computation).
- Rename heading `↺ Looks like a rename` → `${escapeHtml(t('svg.staging.reconcile.renameHeading'))}` (keep the ↺ glyph prefix if present).
- `Same shelf on the map — just a new code.` → `t('svg.staging.reconcile.sameShelf')`.
- `${entries} currently point to "..."` → `t('svg.staging.reconcile.entriesUse').replace('{entries}', entries).replace('{code}', escapeHtml(code))` (build the line so `{code}` lands inside the existing `<span class="font-mono">`; if simpler, keep the span markup and only swap the surrounding words via two sub-strings — preserve the styled code span).
- `Yes — apply this rename` → `t('svg.staging.reconcile.applyRename')`.
- `No, it's not a rename — remove those N entries` → `t('svg.staging.reconcile.notRename').replace('{entries}', entriesPhrase(n))`.
- `It was renamed to a different shelf:` → `t('svg.staging.reconcile.differentShelf')`.
- `"{code}" is gone from the map` → `t('svg.staging.reconcile.goneHeading').replace('{code}', escapeHtml(code))` (preserve the `<span class="font-mono">` around code).
- `{entries} point to it. What should happen?` → `t('svg.staging.reconcile.gonePrompt').replace('{entries}', entries)`.
- `It was renamed to:` → `t('svg.staging.reconcile.renamedTo')`.
- `Remove those N library entries` → `t('svg.staging.reconcile.removeEntries').replace('{entries}', entriesPhrase(n))`.
- Wizard title `Confirm what changed on floor X before you promote` → `t('svg.staging.reconcile.title').replace('{floor}', escapeHtml(String(diff.floor)))`.
- Buttons `Apply` → `t('svg.staging.reconcile.apply')`; `Cancel` → `t('svg.staging.reconcile.cancel')`.
- Delete confirm → `t('svg.staging.reconcile.confirmDelete').replace('{entries}', entriesPhrase(deleteCount))`.

(c) Add an `escapeHtml` import/helper if the file doesn't already have one (it does — reuse it).

- [ ] **Step 4: Run, verify PASS**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest reconcile-wizard`
Expected: PASS.

- [ ] **Step 5: Mirror keys into i18n JSON + validate parse** (add the `svg.staging.reconcile.*` block to `en.json`/`he.json`). Validate JSON parses.

- [ ] **Step 6: Commit**
```bash
git add admin/components/svg-manager/reconcile-wizard.js admin/__tests__/reconcile-wizard.test.js admin/i18n/en.json admin/i18n/he.json
git commit -m "feat(reconcile-wizard): i18n + plain librarian copy (#78)"
```

---

## Task 4: E2E + full verification

**Files:** `e2e/tests/sot-staging.spec.ts` (+ any other spec asserting old map-flow copy).

- [ ] **Step 1: Update e2e assertions**

Grep the e2e specs for old strings the rewrite changed (e.g. progress-modal heading "Updating staged map", "Staging promoted", "No staging"). `sot-staging.spec.ts` already uses the #73 panel copy + `localStorage.locale='en'` and `data-action` selectors. Update any progress-modal heading / promote / discard text assertions to the new copy. Keep the known pre-existing reconcile-wizard `[data-reconcile-row] select` failure as-is (out of scope, tracked with #57/#59).

- [ ] **Step 2: Run e2e**

Run:
```bash
npx http-server . -p 8123 -c-1 --silent &
E2E_BASE_URL=http://localhost:8123 npx playwright test sot-staging --project=en-admin 2>&1 | tail -15
PID=$(ss -ltnp 2>/dev/null | grep ':8123' | grep -oP 'pid=\K[0-9]+' | head -1); [ -n "$PID" ] && kill "$PID"
```
Expected: same pass/fail profile as before the change except updated copy (the pre-existing reconcile-wizard-selector test stays the only failure).

- [ ] **Step 3: Full admin suite**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest 2>&1 | tail -5`
Expected: green except the 14 known pre-existing failures (validation, data-model, user-menu, edit-user-dialog).

- [ ] **Step 4: Commit (if e2e changed)**
```bash
git add e2e/tests/sot-staging.spec.ts
git commit -m "test(e2e): update map-flow assertions to new plain copy (#78)"
```

---

## Task 5: Deploy (gated)

- [ ] **Step 1: Deploy admin SPA** — `./redeploy.sh` (S3 + CloudFront `/admin/*`). **No Lambda redeploy** (Phase 1 is client-only).
- [ ] **Step 2: Verify live** — hard-refresh `https://d3h8i7y9p8lyw7.cloudfront.net/admin/`; replace a floor map → progress modal reads "Replacing the Floor N map", toasts/confirms + reconcile wizard read plain language (en + he).

---

## Self-Review

- **Spec coverage:** Surface 1 → Task 1; Surface 2 → Task 2 (+ floor threading via `beginStagingSequence`/replace handler); Surface 3 → Task 3; tests → Tasks 1-4; deploy → Task 5. Acceptance 1 (floor heading)→T1; 2 (plain, no jargon)→T1-3; 3 (wizard i18n)→T3; 4 (parity+tests)→all. ✓
- **Placeholder scan:** none — FALLBACKS/JSON strings + edits are concrete.
- **Name consistency:** key names match across FALLBACKS, JSON, and `t('…')` call sites; `entriesPhrase(n)` used consistently in Task 3; floor regex `/floor_(\d+)\.svg/` used in modal threading, confirm, and success. ✓
