# Issue #73 — Validation Panel: Honest + Plain Language — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the staging validation panel so it (1) stops falsely flagging a just-reconciled shelf as unlinked/unmapped, and (2) reads in plain first-person librarian language with zero-count sections hidden.

**Architecture:** One backend change in `lambda/validateStaging.mjs` (compute the summary diff against the staged CSV, not prod), and a frontend copy/structure rewrite in `admin/components/svg-manager/staging-panel.js` + the `i18n/{en,he}.json` bundles. No data-model or API-shape changes; `data-action` attributes are untouched.

**Tech Stack:** Node ESM Lambda (jest + aws-sdk-client-mock), vanilla-JS admin SPA (jest/jsdom), Playwright E2E. Spec: `docs/superpowers/specs/2026-05-26-issue-73-validation-panel-plain-language-design.md`.

**Test commands:**
- Lambda jest: `cd lambda && node --experimental-vm-modules node_modules/.bin/jest <file>`
- Admin jest: `cd admin && node --experimental-vm-modules node_modules/.bin/jest <file>`
- E2E: `npx http-server . -p 8123 -c-1 --silent &` then `E2E_BASE_URL=http://localhost:8123 npx playwright test <spec> --project=en-admin`

---

## File Structure

- `lambda/validateStaging.mjs` — Modify: build summary refs from the staged CSV `rows`.
- `lambda/__tests__/validateStaging.test.mjs` — Modify: add the reconcile-rename regression test.
- `admin/i18n/en.json`, `admin/i18n/he.json` — Modify: rewrite `svg.staging.validate.*` + add new `svg.staging.*` keys.
- `admin/components/svg-manager/staging-panel.js` — Modify: `FALLBACKS` + render rewrite (hide-zeros, first-person copy, i18n the hardcoded strings, button labels).
- `admin/__tests__/staging-panel.test.js` — Modify: assert hide-zero behavior + new copy + button labels.
- `e2e/tests/sot-staging.spec.ts` — Modify: update panel text assertions to the new copy.

---

## Task 1: Backend — compute the summary against the staged CSV

**Files:**
- Modify: `lambda/validateStaging.mjs` (the "Compute summary diff" block, ~lines 56-110)
- Test: `lambda/__tests__/validateStaging.test.mjs`

- [ ] **Step 1: Write the failing regression test**

Append this test inside the `describe('validateStaging', …)` block in `lambda/__tests__/validateStaging.test.mjs`:

```js
  test('after reconcile, a renamed shelf is NOT reported as unlinked/unmapped (#73)', async () => {
    // Staged floor-1 SVG: the shelf was renamed CB_OLD -> CB_NEW.
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CB_NEW" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    // Prod SVG (floor 1) still has the OLD code; floors 0/2 empty.
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CB_OLD" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    // Prod CSV still points at the OLD code.
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(streamFromString(
`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_OLD,,,1,,,,
`));
    // Staged CSV was reconciled to the NEW code.
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(streamFromString(
`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_NEW,,,1,,,,
`));
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'alice', files: ['maps/floor_1.svg', 'data/mapping.csv'] }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(true);
    const flagged = [
      ...body.summary.removedRefs.map(r => r.svgCode),
      ...body.summary.unmappedShelves.map(s => s.svgCode),
    ];
    expect(flagged).not.toContain('CB_NEW'); // would be unmapped vs prod CSV (the bug)
    expect(flagged).not.toContain('CB_OLD'); // would be "unlinked" vs prod CSV (the bug)
  });
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `cd lambda && node --experimental-vm-modules node_modules/.bin/jest validateStaging -t "after reconcile"`
Expected: FAIL — `flagged` contains `CB_OLD` (removedRefs vs prod CSV) and/or `CB_NEW` (unmappedShelves vs prod CSV).

- [ ] **Step 3: Fix `validateStaging.mjs`**

Replace the block that currently reads (around lines 56-63):

```js
  // Compute summary diff vs production (informational)
  const { rows: prodCsvRows } = parseCsvContent(await fetchObject('data/mapping.csv'));
  const prodRefsByFloor = {};
  for (const r of prodCsvRows) {
    const f = Number(r.floor);
    prodRefsByFloor[f] = prodRefsByFloor[f] || new Set();
    prodRefsByFloor[f].add(String(r.svgCode));
  }
```

with:

```js
  // Compute the summary diff against the STAGED CSV (the same `rows` already
  // parsed for result.ok) — NOT the prod CSV. After a reconcile writes
  // staging/data/mapping.csv, the prod CSV is stale and would flag the
  // just-reconciled shelf as "unlinked"/"unmapped" (#73). Before any reconcile
  // the staged CSV falls back to prod, so this is identical to the old behavior.
  const csvRefsByFloor = {};
  for (const r of rows) {
    const f = Number(r.floor);
    csvRefsByFloor[f] = csvRefsByFloor[f] || new Set();
    csvRefsByFloor[f].add(String(r.svgCode));
  }
```

Then in the per-floor loop, rename the two references:

- Change `const prodRefs = prodRefsByFloor[floor] || new Set();` → `const csvRefs = csvRefsByFloor[floor] || new Set();`
- Change `for (const ref of prodRefs) {` → `for (const ref of csvRefs) {`
- Change the `affectedRowCount` line from `prodCsvRows.filter(...)` to `rows.filter(...)`:
  `const affectedRowCount = rows.filter(r => Number(r.floor) === floor && String(r.svgCode) === ref).length;`
- Change `if (!prodRefs.has(id)) addedShelves.push(...)` → `if (!csvRefs.has(id)) addedShelves.push(...)`
- Change `if (!prodRefs.has(id)) unmappedShelves.push(...)` → `if (!csvRefs.has(id)) unmappedShelves.push(...)`

Leave everything that uses `prodShelves` / `prodSvgShelfIdsByFloor` (newlyAddedShelves, removedShelves) and the rename detection UNCHANGED — those correctly diff against the production SVG.

- [ ] **Step 4: Run the new test + the whole file, verify PASS**

Run: `cd lambda && node --experimental-vm-modules node_modules/.bin/jest validateStaging`
Expected: PASS — all existing validateStaging tests still green (pre-reconcile behavior is unchanged because staged CSV falls back to prod) + the new regression test passes.

- [ ] **Step 5: Commit**

```bash
git add lambda/validateStaging.mjs lambda/__tests__/validateStaging.test.mjs
git commit -m "fix(validateStaging): compute summary against staged CSV, not prod (#73)"
```

---

## Task 2: i18n strings (en + he)

**Files:**
- Modify: `admin/i18n/en.json` (the `svg.staging` object)
- Modify: `admin/i18n/he.json` (the `svg.staging` object)

- [ ] **Step 1: Rewrite the `svg.staging.validate` block + add new keys (en.json)**

In `admin/i18n/en.json`, replace the existing `"validate": { … }` object under `svg.staging` with:

```json
      "validate": {
        "passed": "The map you sent looks fine — it passed my checks and matches your shelf information. Want to start using it?",
        "renamed": "{count} shelf(s) were renamed — same physical shelf, new label:",
        "renamedNote": "(same shelf)",
        "renamedHint": "Same spot on the map — no patron-facing links break.",
        "newlyAdded": "This map has {count} new shelf(s) I don't have library info for yet — patrons won't find them in search until you add them:",
        "newlyAddedHint": "Each one needs a library entry (a CSV row) before patrons can find it in search.",
        "removed": "{count} shelf(s) from the old map aren't on this one anymore:",
        "unlinked": "Heads up: {count} library entr(y/ies) point to shelves that aren't on this map anymore — they'll stop showing up in search until you re-link them:",
        "preExisting": "{count} shelf(s) on the map still have no library info (already like this) — patrons can't find them until you add them:",
        "preExistingHint": "These were already unmapped before this upload.",
        "failed": "I checked the map and found {count} thing(s) that don't match your shelf data yet. Let's fix them together.",
        "failedItem": "Floor {floor}: {code} — {rows} affected",
        "shelfFloor": "Floor {floor}:"
      },
      "awaiting": "I haven't checked this map yet. Press \"Check the map\" when you're ready.",
      "noStaging": "No map is waiting for review. Upload a new map to start.",
      "lockedByOther": "{owner} is working on a map right now — wait for them to finish or ask them to discard it.",
      "header": "Map waiting for review (uploaded by {owner})",
      "actions": {
        "validate": "Check the map",
        "promote": "Start using this map",
        "reconcile": "Fix the mismatches",
        "discard": "Discard"
      }
```

(Place `awaiting`, `noStaging`, `lockedByOther`, `header`, `actions` as siblings of `validate` inside `svg.staging`. Keep any other existing `svg.staging` keys, e.g. `progress`.)

- [ ] **Step 2: Mirror in he.json (draft Hebrew — plural/neutral address)**

In `admin/i18n/he.json`, replace the `svg.staging.validate` object and add the sibling keys:

```json
      "validate": {
        "passed": "המפה ששלחתם נראית תקינה — היא עברה את הבדיקות שלי ותואמת את נתוני המדפים שלכם. רוצים להתחיל להשתמש בה?",
        "renamed": "{count} מדפים שונו בשמם — אותו מדף פיזי, תווית חדשה:",
        "renamedNote": "(אותו מדף)",
        "renamedHint": "אותו מקום במפה — אף קישור הפונה למשתמשים אינו נשבר.",
        "newlyAdded": "במפה הזו יש {count} מדפים חדשים שעדיין אין לי עבורם נתוני ספרייה — משתמשים לא ימצאו אותם בחיפוש עד שתוסיפו אותם:",
        "newlyAddedHint": "לכל אחד מהם דרושה רשומת ספרייה (שורת CSV) כדי שמשתמשים ימצאו אותו בחיפוש.",
        "removed": "{count} מדפים שהיו במפה הישנה אינם מופיעים יותר במפה הזו:",
        "unlinked": "לתשומת לבכם: {count} רשומות ספרייה מצביעות על מדפים שכבר אינם במפה — הן יפסיקו להופיע בחיפוש עד שתקשרו אותן מחדש:",
        "preExisting": "{count} מדפים במפה עדיין ללא נתוני ספרייה (כבר היו במצב הזה) — משתמשים לא ימצאו אותם עד שתוסיפו אותם:",
        "preExistingHint": "מדפים אלה כבר היו ללא מיפוי עוד לפני העלאה זו.",
        "failed": "בדקתי את המפה ומצאתי {count} דברים שעדיין אינם תואמים את נתוני המדפים שלכם. בואו נתקן אותם יחד.",
        "failedItem": "קומה {floor}: {code} — {rows} רשומות מושפעות",
        "shelfFloor": "קומה {floor}:"
      },
      "awaiting": "עדיין לא בדקתי את המפה הזו. לחצו על \"בדוק את המפה\" כשאתם מוכנים.",
      "noStaging": "אין מפה הממתינה לבדיקה. העלו מפה חדשה כדי להתחיל.",
      "lockedByOther": "{owner} עובד/ת כעת על מפה — המתינו לסיום או בקשו לבטל אותה.",
      "header": "מפה ממתינה לבדיקה (הועלתה על־ידי {owner})",
      "actions": {
        "validate": "בדוק את המפה",
        "promote": "התחילו להשתמש במפה",
        "reconcile": "תקנו את אי־ההתאמות",
        "discard": "בטל"
      }
```

- [ ] **Step 3: Validate JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('admin/i18n/en.json','utf8')); JSON.parse(require('fs').readFileSync('admin/i18n/he.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add admin/i18n/en.json admin/i18n/he.json
git commit -m "i18n(staging): plain-language validation panel strings, en+he (#73)"
```

---

## Task 3: Frontend panel rewrite + unit tests

**Files:**
- Modify: `admin/components/svg-manager/staging-panel.js`
- Test: `admin/__tests__/staging-panel.test.js`

- [ ] **Step 1: Update the unit tests to the new copy + hide-zero behavior**

In `admin/__tests__/staging-panel.test.js`:

(a) Empty-state test — replace the asserted copy:
```js
  test('renders empty state when no staging active', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: false, owner: null, files: [], lastValidated: null,
    });
    expect(document.getElementById('staging-panel-host').textContent)
      .toContain('No map is waiting for review');
  });
```

(b) Passed-with-items test ('GREEN state renders honest sections…') — keep the same `lastValidated` summary but change the assertions to:
```js
    const text = host.textContent;
    expect(host.innerHTML).not.toContain('no CSV changes needed');
    expect(text).toContain('The map you sent looks fine'); // plain passed headline
    expect(text).toContain('X');   // newly added shelf listed
    expect(text).toContain('ORPH'); // pre-existing unmapped listed
    expect(text).toContain('Floor 1:');
    // Zero-count sections are HIDDEN now (#73): no "unlinked" line when 0.
    expect(text).not.toMatch(/library entr/i);
    // Promote button present with the new label + unchanged data-action.
    expect(host.querySelector('[data-action="promote-staging"]').textContent)
      .toContain('Start using this map');
```

(c) Rename test ('GREEN state surfaces detected renames…') — keep the rename assertions (`CC_1-4 → CC_X-Y`, `Floor 1:`, `NEW_ADD`, `GONE`); the rename "same shelf" note assertion becomes:
```js
    expect(text).toContain('same shelf');
```

(d) RED-state test ('renders RED state with reconcile wizard CTA') — assert the new failed copy + button:
```js
    expect(host.textContent).toContain("don't match your shelf data");
    expect(host.querySelector('[data-action="open-reconcile-wizard"]').textContent)
      .toContain('Fix the mismatches');
```

(e) Lock-held test — assert new copy:
```js
    expect(document.getElementById('staging-panel-host').textContent)
      .toMatch(/is working on a map right now/);
```

(f) Awaiting-state — add a test:
```js
  test('renders awaiting state with the Check-the-map button', () => {
    const host = document.getElementById('staging-panel-host');
    renderStagingPanel(host, { locked: true, owner: 'alice', files: ['maps/floor_1.svg'], lastValidated: null });
    expect(host.textContent).toContain("I haven't checked this map yet");
    expect(host.querySelector('[data-action="validate-staging"]').textContent).toContain('Check the map');
  });
```

- [ ] **Step 2: Run the unit tests, verify they FAIL**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest staging-panel`
Expected: FAIL — old copy strings (e.g. "Validation passed", "Promote to production", "0 library entries will be unlinked") no longer match.

- [ ] **Step 3: Rewrite `staging-panel.js`**

Replace the `FALLBACKS` object (lines 17-29) with this expanded map (keeps the cold-cache fallback for every key the panel renders):

```js
const FALLBACKS = {
  'svg.staging.validate.passed':          { en: 'The map you sent looks fine — it passed my checks and matches your shelf information. Want to start using it?', he: 'המפה ששלחתם נראית תקינה — היא עברה את הבדיקות שלי ותואמת את נתוני המדפים שלכם. רוצים להתחיל להשתמש בה?' },
  'svg.staging.validate.renamed':         { en: '{count} shelf(s) were renamed — same physical shelf, new label:', he: '{count} מדפים שונו בשמם — אותו מדף פיזי, תווית חדשה:' },
  'svg.staging.validate.renamedNote':     { en: '(same shelf)', he: '(אותו מדף)' },
  'svg.staging.validate.renamedHint':     { en: 'Same spot on the map — no patron-facing links break.', he: 'אותו מקום במפה — אף קישור הפונה למשתמשים אינו נשבר.' },
  'svg.staging.validate.newlyAdded':      { en: "This map has {count} new shelf(s) I don't have library info for yet — patrons won't find them in search until you add them:", he: 'במפה הזו יש {count} מדפים חדשים שעדיין אין לי עבורם נתוני ספרייה — משתמשים לא ימצאו אותם בחיפוש עד שתוסיפו אותם:' },
  'svg.staging.validate.newlyAddedHint':  { en: 'Each one needs a library entry (a CSV row) before patrons can find it in search.', he: 'לכל אחד מהם דרושה רשומת ספרייה (שורת CSV) כדי שמשתמשים ימצאו אותו בחיפוש.' },
  'svg.staging.validate.removed':         { en: "{count} shelf(s) from the old map aren't on this one anymore:", he: '{count} מדפים שהיו במפה הישנה אינם מופיעים יותר במפה הזו:' },
  'svg.staging.validate.unlinked':        { en: "Heads up: {count} library entr(y/ies) point to shelves that aren't on this map anymore — they'll stop showing up in search until you re-link them:", he: 'לתשומת לבכם: {count} רשומות ספרייה מצביעות על מדפים שכבר אינם במפה — הן יפסיקו להופיע בחיפוש עד שתקשרו אותן מחדש:' },
  'svg.staging.validate.preExisting':     { en: "{count} shelf(s) on the map still have no library info (already like this) — patrons can't find them until you add them:", he: '{count} מדפים במפה עדיין ללא נתוני ספרייה (כבר היו במצב הזה) — משתמשים לא ימצאו אותם עד שתוסיפו אותם:' },
  'svg.staging.validate.preExistingHint': { en: 'These were already unmapped before this upload.', he: 'מדפים אלה כבר היו ללא מיפוי עוד לפני העלאה זו.' },
  'svg.staging.validate.failed':          { en: "I checked the map and found {count} thing(s) that don't match your shelf data yet. Let's fix them together.", he: 'בדקתי את המפה ומצאתי {count} דברים שעדיין אינם תואמים את נתוני המדפים שלכם. בואו נתקן אותם יחד.' },
  'svg.staging.validate.failedItem':      { en: 'Floor {floor}: {code} — {rows} affected', he: 'קומה {floor}: {code} — {rows} רשומות מושפעות' },
  'svg.staging.validate.shelfFloor':      { en: 'Floor {floor}:', he: 'קומה {floor}:' },
  'svg.staging.awaiting':                 { en: 'I haven\'t checked this map yet. Press "Check the map" when you\'re ready.', he: 'עדיין לא בדקתי את המפה הזו. לחצו על "בדוק את המפה" כשאתם מוכנים.' },
  'svg.staging.noStaging':                { en: 'No map is waiting for review. Upload a new map to start.', he: 'אין מפה הממתינה לבדיקה. העלו מפה חדשה כדי להתחיל.' },
  'svg.staging.lockedByOther':            { en: '{owner} is working on a map right now — wait for them to finish or ask them to discard it.', he: '{owner} עובד/ת כעת על מפה — המתינו לסיום או בקשו לבטל אותה.' },
  'svg.staging.header':                   { en: 'Map waiting for review (uploaded by {owner})', he: 'מפה ממתינה לבדיקה (הועלתה על־ידי {owner})' },
  'svg.staging.actions.validate':         { en: 'Check the map', he: 'בדוק את המפה' },
  'svg.staging.actions.promote':          { en: 'Start using this map', he: 'התחילו להשתמש במפה' },
  'svg.staging.actions.reconcile':        { en: 'Fix the mismatches', he: 'תקנו את אי־ההתאמות' },
  'svg.staging.actions.discard':          { en: 'Discard', he: 'בטל' },
};
```

Replace the `t` helper (lines 31-38) to support interpolation:

```js
function t(key, vars) {
  let value = i18n.t(key);
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale?.() || 'en';
    value = FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) value = value.split(`{${k}}`).join(String(v));
  }
  return value;
}
```

Replace the whole `renderStagingPanel` body (lines 40-163) with:

```js
export function renderStagingPanel(host, status, opts = {}) {
  host.innerHTML = '';

  if (!status.locked) {
    host.innerHTML = `
      <div class="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        ${escapeHtml(t('svg.staging.noStaging'))}
      </div>
    `;
    return;
  }

  const currentUser = opts.currentUser;
  const isOwner = !currentUser || status.owner === currentUser;
  if (!isOwner) {
    host.innerHTML = `
      <div class="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        ${escapeHtml(t('svg.staging.lockedByOther', { owner: status.owner }))}
      </div>
    `;
    return;
  }

  const validated = status.lastValidated;
  const files = (status.files || []).map(f => `<li class="font-mono text-xs">${escapeHtml(f)}</li>`).join('');

  const btn = (action, key, cls) =>
    `<button data-action="${action}" class="${cls}">${escapeHtml(t(key))}</button>`;
  const discardBtn = btn('discard-staging', 'svg.staging.actions.discard', 'px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200');

  let stateBlock = '';
  let actions = '';

  if (!validated) {
    stateBlock = `<div class="text-sm text-blue-700">${escapeHtml(t('svg.staging.awaiting'))}</div>`;
    actions = `
      ${btn('validate-staging', 'svg.staging.actions.validate', 'px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200')}
      ${discardBtn}
    `;
  } else if (validated.ok) {
    const summary = validated.summary || {};
    const renames = summary.renames || [];
    const newlyAdded = summary.newlyAddedShelves || [];
    const removed = summary.removedShelves || [];
    const removedRefs = summary.removedRefs || [];
    const unmapped = summary.unmappedShelves || [];

    // Pre-existing unmapped = staged-unmapped shelves NOT newly added this upload.
    const newlyAddedKeys = new Set(newlyAdded.map(s => `${s.floor}::${s.svgCode}`));
    const preExisting = unmapped.filter(s => !newlyAddedKeys.has(`${s.floor}::${s.svgCode}`));

    const idList = (shelves) =>
      shelves.length
        ? `<ul class="list-disc pl-6 text-xs text-gray-600 mt-0.5">${shelves
            .map(s => `<li>${escapeHtml(t('svg.staging.validate.shelfFloor', { floor: s.floor }))} <span class="font-mono">${escapeHtml(s.svgCode)}</span></li>`)
            .join('')}</ul>`
        : '';

    // Render a section only when it has items (#73: hide zero-count noise).
    const section = (count, key, listHtml, hintKey, hintCls) =>
      count
        ? `<div class="text-xs text-gray-700 mt-2">${escapeHtml(t(key, { count }))}</div>
           ${listHtml}
           ${hintKey ? `<div class="text-xs ${hintCls || 'text-amber-700'} mt-0.5">${escapeHtml(t(hintKey))}</div>` : ''}`
        : '';

    const renameList = renames.length
      ? `<ul class="list-disc pl-6 text-xs text-gray-600 mt-0.5">${renames
          .map(r => `<li>${escapeHtml(t('svg.staging.validate.shelfFloor', { floor: r.floor }))} <span class="font-mono">${escapeHtml(r.fromCode)} → ${escapeHtml(r.toCode)}</span> <span class="text-green-700">${escapeHtml(t('svg.staging.validate.renamedNote'))}</span></li>`)
          .join('')}</ul>`
      : '';

    stateBlock = `
      <div class="text-sm text-green-700">${escapeHtml(t('svg.staging.validate.passed'))}</div>
      ${section(renames.length, 'svg.staging.validate.renamed', renameList, 'svg.staging.validate.renamedHint', 'text-green-700')}
      ${section(newlyAdded.length, 'svg.staging.validate.newlyAdded', idList(newlyAdded), 'svg.staging.validate.newlyAddedHint')}
      ${section(removed.length, 'svg.staging.validate.removed', idList(removed), null)}
      ${section(removedRefs.length, 'svg.staging.validate.unlinked', '', null)}
      ${section(preExisting.length, 'svg.staging.validate.preExisting', idList(preExisting), 'svg.staging.validate.preExistingHint')}
    `;
    actions = `
      ${btn('promote-staging', 'svg.staging.actions.promote', 'px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700')}
      ${discardBtn}
    `;
  } else {
    const removedRefs = validated.summary?.removedRefs || [];
    const removedSummary = removedRefs
      .map(r => `<li>${escapeHtml(t('svg.staging.validate.failedItem', { floor: r.floor, code: r.svgCode, rows: r.affectedRowCount }))}</li>`)
      .join('');
    stateBlock = `
      <div class="text-sm text-red-700">${escapeHtml(t('svg.staging.validate.failed', { count: validated.errors.length }))}</div>
      <ul class="list-disc pl-6 text-xs text-gray-700 mt-1">${removedSummary}</ul>
    `;
    actions = `
      ${btn('open-reconcile-wizard', 'svg.staging.actions.reconcile', 'px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600')}
      ${discardBtn}
    `;
  }

  host.innerHTML = `
    <div class="rounded border border-blue-200 bg-blue-50 p-4">
      <div class="text-sm font-semibold mb-2">${escapeHtml(t('svg.staging.header', { owner: status.owner }))}</div>
      <ul class="list-disc pl-6 mb-2">${files}</ul>
      ${stateBlock}
      <div class="mt-3 flex gap-2">${actions}</div>
    </div>
  `;
}
```

(Keep the `escapeHtml` helper at the bottom unchanged, and the `import i18n` line at the top unchanged.)

- [ ] **Step 4: Run the unit tests, verify they PASS**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest staging-panel`
Expected: PASS — all staging-panel cases green.

- [ ] **Step 5: Run the full admin suite (catch other refs to old copy)**

Run: `cd admin && node --experimental-vm-modules node_modules/.bin/jest 2>&1 | tail -5`
Expected: Only the 14 known pre-existing failures (validation, data-model, user-menu, edit-user-dialog). If any *other* suite references old staging copy/button text, update that assertion to the new string.

- [ ] **Step 6: Commit**

```bash
git add admin/components/svg-manager/staging-panel.js admin/__tests__/staging-panel.test.js
git commit -m "feat(staging-panel): plain first-person copy, hide zero-count sections (#73)"
```

---

## Task 4: E2E — update sot-staging assertions

**Files:**
- Modify: `e2e/tests/sot-staging.spec.ts`

- [ ] **Step 1: Update the panel text assertions to the new copy**

In `e2e/tests/sot-staging.spec.ts`, change the assertions (button clicks via `data-action` stay unchanged):

- `await expect(panel).toContainText(/Validation passed/i, …)` → `await expect(panel).toContainText(/looks fine/i, { timeout: 10000 })`
- `await expect(panel).toContainText(/No staging/i, …)` → `await expect(panel).toContainText(/No map is waiting for review/i, { timeout: 10000 })`

(There are two `/Validation passed/i` sites — the happy-path test and the reconcile test — update both. The reconcile-wizard internals use their own selectors; only the panel headline text changes.)

- [ ] **Step 2: Start a repo-root server + run the spec**

Run:
```bash
npx http-server . -p 8123 -c-1 --silent &
E2E_BASE_URL=http://localhost:8123 npx playwright test sot-staging --project=en-admin 2>&1 | tail -15
```
Expected: PASS — all sot-staging tests green. (Stop the server afterward: find its PID via `ss -ltnp | grep :8123` and `kill` it.)

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/sot-staging.spec.ts
git commit -m "test(e2e): update sot-staging assertions to new validation copy (#73)"
```

---

## Task 5: Full verification + deploy (gated)

**Files:** none (verification + deploy only)

- [ ] **Step 1: Run both jest suites**

Run:
```bash
cd lambda && node --experimental-vm-modules node_modules/.bin/jest 2>&1 | tail -4
cd ../admin && node --experimental-vm-modules node_modules/.bin/jest 2>&1 | tail -4
```
Expected: lambda suite fully green; admin suite green except the 14 known pre-existing failures.

- [ ] **Step 2: Deploy — admin SPA**

Run: `./redeploy.sh`
Expected: S3 sync + CloudFront `/admin/*` invalidation created.

- [ ] **Step 3: Deploy — validateStaging Lambda**

Part 1 changes server code, so the `validateStaging` Lambda must be redeployed (zip + update-function-code, matching how the other staging Lambdas were deployed in prior phases — see `deploy-staging-lambdas.sh`). Confirm the function name via `aws lambda list-functions --query "Functions[?contains(FunctionName, 'validateStaging')].FunctionName"`.

- [ ] **Step 4: Verify live**

After the CloudFront invalidation completes, hard-refresh `https://d3h8i7y9p8lyw7.cloudfront.net/admin/` → Map Files → upload a map that triggers a rename → reconcile → re-validate → confirm the panel reads in plain language and does NOT report the reconciled shelf as unlinked/unmapped.

---

## Self-Review

- **Spec coverage:** Part 1 backend fix → Task 1 (+ regression test). Part 2 copy/structure → Tasks 2-3 (i18n + render). Failed/awaiting/locked/no-staging/buttons → Task 3 + Task 2. Tests → Tasks 1,3,4. Deploy → Task 5. Acceptance #1 → Task 1 test; Acceptance #2 → Task 3 tests. ✓
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type/name consistency:** `csvRefsByFloor`/`csvRefs` used consistently in Task 1; i18n keys in Task 2 match the `FALLBACKS` keys and `t('…')` calls in Task 3; `data-action` values (`validate-staging`, `promote-staging`, `open-reconcile-wizard`, `discard-staging`) unchanged from the current file and matched by Task 3 + Task 4. ✓
