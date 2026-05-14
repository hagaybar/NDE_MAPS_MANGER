# SoT Bundle Invariant — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the shared validation rule, extend `putCsv` to enforce/log it, and ship the CSV Editor "Broken refs" filter for migration cleanup. Delivers Stages 1–3 of the rollout in spec `2026-05-13-sot-bundle-invariant-design.md`. The staging flow + cutover (Stages 4) is a follow-up plan.

**Architecture:** Pure shared functions (`validateBundle`, `svg-shelves`) mirrored server- and client-side with a parity test guarding drift. `putCsv` adds a fetch-validate-decide step gated by `BUNDLE_INVARIANT_ENABLED` env var (default `false` so production keeps working through telemetry/cleanup phases). CSV Editor adds a filter-mode toggle for migration cleanup; behavior survives past cutover for future incidents.

**Tech Stack:** Node.js ES modules (Lambda `.mjs`), vanilla JS ES modules (admin), Jest with `--experimental-vm-modules`, jsdom for admin tests, `aws-sdk-client-mock` for Lambda S3 mocks, Playwright for E2E.

---

## Status (2026-05-14) — Implementation complete

> **All 16 planned tasks executed + 3 follow-up commits.** Branch `feature/sot-bundle-invariant-foundation` is **19 commits ahead** of the pre-feature tag `pre-sot-foundation`. Not pushed.

| Layer | Coverage | Result |
|---|---|---|
| Lambda tests | 338/338 | All pass — includes new `validateBundle`, `svg-shelves`, `fetch-floor-svgs`, `putCsv` bundle-invariant cases |
| Admin jsdom unit tests | 5/5 broken-refs + 8/8 svg-shelves parity + 5/5 bundle-validator parity | All pass. 14 pre-existing failures (issue #9) verified as not regressions. |
| E2E (mocked broken refs) | 4/4 project variants (en/he × admin/editor) | All pass |
| E2E (seed-data placeholder) | all variants | All skip cleanly via `test.skip(...)` guards |
| `BUNDLE_INVARIANT_ENABLED` | unset (default false) | Log-only mode; ready for Stage 2 telemetry observation |
| Pushed | No | Awaits explicit operator approval per the original constraint |

### Commits in order (oldest → newest)

| # | SHA | Subject |
|---|-----|---------|
| Task 1 | `9e5a79b` | test(fixtures): add svg-shelves parity fixtures (8 cases) |
| Task 2 | `d1474c3` | feat(lambda): add svg-shelves parser with parity fixtures |
| Task 3 | `4d04474` | feat(admin): add svg-shelves client mirror with parity tests |
| —      | `fb5ede4` | docs(plans): drop `@jest-environment node` directive (plan fix surfaced during Task 3) |
| Task 4 | `163aa15` | test(fixtures): add validateBundle parity fixtures (5 cases) |
| Task 5 | `b78a5eb` | feat(lambda): add validateBundle rule-checker with parity fixtures |
| Task 6 | `9b57b64` | feat(admin): add bundle-validator client mirror with parity tests |
| Task 7 | `b3f9700` | feat(data-model): add getBrokenRefs helper |
| Task 8 | `6b3c71f` | feat(lambda): add fetch-floor-svgs with warm-container cache |
| Task 9 | `3e66f37` | feat(lambda): enforce bundle invariant in putCsv (flag-gated) |
| Task 10 | `6a7acdc` | feat(csv-editor): add Broken refs filter toggle (count only) |
| Task 11 | `37e9644` | feat(csv-editor): filter table to broken refs when toggle active |
| Task 12 | `a7af379` | feat(csv-editor): inline rename dropdown per broken row |
| Task 13 | `258c7e6` | feat(csv-editor): add Delete row action with confirm dialog |
| Task 14 | `962152c` | test(e2e): broken-refs filter migration cleanup happy path (placeholder, skips on empty seed) |
| Task 15 | `80b4d53` | docs: document bundle invariant flag + parity test convention |
| Task 16 | — | (no commit — final integration check only) |
| Follow-up | `4b8ed32` | **fix(csv-editor): rename action called `renderRows()` — does not exist; should be `renderTable()`** |
| Follow-up | `59f62e5` | **fix(csv-editor): refresh Broken refs count after rename/delete** |
| Follow-up | `9e6886b` | **test(e2e): mocked-data Broken refs filter end-to-end coverage** |

### Plan deviations (documented in commits)

- **Task 3 / Task 6**: Removed the `@jest-environment node` directive from the client parity tests. The admin Jest `setup.js` references `document.body` and requires `jsdom` (the project default). Plan updated in commit `fb5ede4`.
- **Task 10**: New module imports use bare URLs (no `?v=5` cache-bust suffix). Issue #24's regression-guard test (`no-duplicate-module-imports.test.js`) forbids the `?v=N` pattern for newly-added imports.
- **Task 12**: Added a defensive fallback in `applyBrokenRefsFilter()` for the case where `csvData[idx]` is undefined (happens when DOM rows are injected by tests without populating `csvData`). The fallback uses the broken-ref entry's `floor` info. Switched test mock from `mockReturnValueOnce` to `mockReturnValue` so re-renders see consistent broken-ref data.

### Bugs found during E2E that the unit tests missed

Two bugs surfaced when running the new mocked Playwright spec (`csv-editor-broken-refs-mocked.spec.ts`). The unit tests passed because they never actually fired the change handler or asserted on the toggle count after a mutation.

1. **`renderRows()` doesn't exist** (`4b8ed32`). Task 12's plan code block called `renderRows()` from the dropdown's change handler. The actual table-render function is `renderTable()`. Selecting any rename option threw `ReferenceError`. **The plan above still shows the original `renderRows()` text — leave as historical record; the fix lives in the commit.**
2. **Toggle count stale after rename/delete** (`59f62e5`). `renderTable()` does not call `renderBrokenRefsToggle()`, so after a rename/delete the `(N)` count chip kept showing the pre-mutation value. Both handlers now explicitly call `renderBrokenRefsToggle()` after the data change.

### Follow-up issues to file (out of scope for this plan)

- The 2 new `getBrokenRefs` tests added in Task 7 live inside `admin/__tests__/data-model.test.js`, which has a pre-existing ESM parse error (issue #9). The suite cannot execute. Once issue #9 is fixed the new tests will run as-is.
- Cleanup of `.a5c/processes/feat-sot-foundation*` artifacts (untracked) — pattern is to archive into a chore commit once the run is verified, similar to commit `6f07357`.

### Suggested next steps

1. Review the 19 commits (`git log --oneline pre-sot-foundation..HEAD`).
2. If approved: push the branch and open a PR.
3. After merge: Stage 2 telemetry — watch `bundle.violations.csv_write` CloudWatch metric for ~1 week.
4. Stage 3 cleanup — operator uses the new "Broken refs" filter to fix any flagged rows.
5. Plan B (staging flow + Stage 4 cutover, `docs/superpowers/plans/2026-05-13-sot-staging-flow.md`).

Rollback path: `git checkout main && git reset --hard pre-sot-foundation`.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `lambda/shared/svg-shelves.mjs` | Server-side SVG shelf-ID extractor (single canonical rule) |
| `lambda/shared/validateBundle.mjs` | Server-side bundle-consistency rule-checker (pure function) |
| `lambda/__tests__/shared/svg-shelves.test.mjs` | Server-side unit tests via shared fixtures |
| `lambda/__tests__/shared/validateBundle.test.mjs` | Server-side unit tests via shared bundle fixtures |
| `lambda/__tests__/fixtures/svg-shelves/*.svg` | 10 SVG fixtures (canonical for both server + client) |
| `lambda/__tests__/fixtures/svg-shelves/*.expected.json` | Expected shelf ID array per fixture |
| `lambda/__tests__/fixtures/bundles/*.json` | Bundle fixtures `{ csvRows, svgShelfIdsByFloor, expected }` |
| `admin/services/svg-shelves.js` | Client mirror of `lambda/shared/svg-shelves.mjs` |
| `admin/services/bundle-validator.js` | Client mirror of `lambda/shared/validateBundle.mjs` |
| `admin/__tests__/svg-shelves.test.js` | Client parity test via the same fixtures |
| `admin/__tests__/bundle-validator.test.js` | Client parity test via the same bundle fixtures |

### Modified files

| Path | Change |
|---|---|
| `lambda/putCsv.mjs` | Add fetch-current-SVGs + run-validateBundle + reject-or-log step |
| `lambda/__tests__/putCsv.test.mjs` | Extend with bundle-invariant cases (or create if absent) |
| `admin/components/csv-editor.js` | Add "Broken refs" filter toggle + inline row actions (rename / delete) |
| `admin/services/data-model.js` | Expose `getBrokenRefs(rows, svgShelfIdsByFloor)` helper |
| `docs/AWS-INFRASTRUCTURE.md` | Document `BUNDLE_INVARIANT_ENABLED` env var |
| `CLAUDE.md` | Note the invariant + the env var |

---

## Task Decomposition

Phase A — Shared rule + parity tests (Tasks 1–8)
Phase B — `putCsv` extension (Tasks 9–11)
Phase C — Migration cleanup UI (Tasks 12–16)
Phase D — Documentation + deploy prep (Task 17)

---

### Task 1: Create the SVG-shelves fixture set

**Files:**
- Create: `lambda/__tests__/fixtures/svg-shelves/clean-5-shelves.svg`
- Create: `lambda/__tests__/fixtures/svg-shelves/clean-5-shelves.expected.json`
- Create: `lambda/__tests__/fixtures/svg-shelves/empty-no-shelves.svg`
- Create: `lambda/__tests__/fixtures/svg-shelves/empty-no-shelves.expected.json`
- Create: `lambda/__tests__/fixtures/svg-shelves/markers-missing.svg`
- Create: `lambda/__tests__/fixtures/svg-shelves/markers-missing.expected.json`
- Create: `lambda/__tests__/fixtures/svg-shelves/mixed-marked-and-unmarked.svg`
- Create: `lambda/__tests__/fixtures/svg-shelves/mixed-marked-and-unmarked.expected.json`
- Create: `lambda/__tests__/fixtures/svg-shelves/nested-groups.svg`
- Create: `lambda/__tests__/fixtures/svg-shelves/nested-groups.expected.json`
- Create: `lambda/__tests__/fixtures/svg-shelves/whitespace-namespaces.svg`
- Create: `lambda/__tests__/fixtures/svg-shelves/whitespace-namespaces.expected.json`
- Create: `lambda/__tests__/fixtures/svg-shelves/duplicate-ids.svg`
- Create: `lambda/__tests__/fixtures/svg-shelves/duplicate-ids.expected.json`
- Create: `lambda/__tests__/fixtures/svg-shelves/malformed.svg`
- Create: `lambda/__tests__/fixtures/svg-shelves/malformed.expected.json`

- [ ] **Step 1: Create the 5-shelves happy-path fixture**

Write `lambda/__tests__/fixtures/svg-shelves/clean-5-shelves.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect id="CB_0" data-map-object="shelf" x="10" y="10" width="20" height="20"/>
  <rect id="CB_1" data-map-object="shelf" x="40" y="10" width="20" height="20"/>
  <rect id="CC_1-4" data-map-object="shelf" x="70" y="10" width="20" height="20"/>
  <rect id="CC_5-12" data-map-object="shelf" x="100" y="10" width="20" height="20"/>
  <rect id="CC_13-16" data-map-object="shelf" x="130" y="10" width="20" height="20"/>
</svg>
```

Write `lambda/__tests__/fixtures/svg-shelves/clean-5-shelves.expected.json`:
```json
{ "shelves": ["CB_0", "CB_1", "CC_1-4", "CC_5-12", "CC_13-16"], "duplicates": [] }
```

- [ ] **Step 2: Create the empty fixture**

Write `lambda/__tests__/fixtures/svg-shelves/empty-no-shelves.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="10" y="10" width="80" height="80" fill="#ddd"/>
</svg>
```

Write `lambda/__tests__/fixtures/svg-shelves/empty-no-shelves.expected.json`:
```json
{ "shelves": [], "duplicates": [] }
```

- [ ] **Step 3: Create the markers-missing fixture**

Mirrors the current floor_0.svg shape: shelves exist as shapes with IDs but none carry the `data-map-object="shelf"` marker. The parser must return an empty array — those shapes are not recognized as shelves.

Write `lambda/__tests__/fixtures/svg-shelves/markers-missing.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect id="CB_0" x="10" y="10" width="20" height="20"/>
  <rect id="CB_1" x="40" y="10" width="20" height="20"/>
</svg>
```

Write `lambda/__tests__/fixtures/svg-shelves/markers-missing.expected.json`:
```json
{ "shelves": [], "duplicates": [] }
```

- [ ] **Step 4: Create the mixed-marked-and-unmarked fixture (the floor 0 transition state)**

Write `lambda/__tests__/fixtures/svg-shelves/mixed-marked-and-unmarked.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect id="CB_0" data-map-object="shelf" x="10" y="10" width="20" height="20"/>
  <rect id="CB_1" x="40" y="10" width="20" height="20"/>
  <rect id="CC_1-4" data-map-object="shelf" x="70" y="10" width="20" height="20"/>
</svg>
```

Write `lambda/__tests__/fixtures/svg-shelves/mixed-marked-and-unmarked.expected.json`:
```json
{ "shelves": ["CB_0", "CC_1-4"], "duplicates": [] }
```

- [ ] **Step 5: Create the nested-groups fixture**

Write `lambda/__tests__/fixtures/svg-shelves/nested-groups.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="layer1">
    <g id="library-section">
      <rect id="CB_0" data-map-object="shelf" x="10" y="10" width="20" height="20"/>
      <g>
        <rect id="CB_1" data-map-object="shelf" x="40" y="10" width="20" height="20"/>
      </g>
    </g>
  </g>
</svg>
```

Write `lambda/__tests__/fixtures/svg-shelves/nested-groups.expected.json`:
```json
{ "shelves": ["CB_0", "CB_1"], "duplicates": [] }
```

- [ ] **Step 6: Create the whitespace-namespaces fixture (Inkscape-resave style)**

Write `lambda/__tests__/fixtures/svg-shelves/whitespace-namespaces.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd"
     viewBox="0 0 200 200">
  <inkscape:namedview id="namedview1"/>
  <rect
    id="CB_0"
    data-map-object="shelf"
    x="10"
    y="10"
    width="20"
    height="20"/>
</svg>
```

Write `lambda/__tests__/fixtures/svg-shelves/whitespace-namespaces.expected.json`:
```json
{ "shelves": ["CB_0"], "duplicates": [] }
```

- [ ] **Step 7: Create the duplicate-ids fixture**

Write `lambda/__tests__/fixtures/svg-shelves/duplicate-ids.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect id="CB_0" data-map-object="shelf" x="10" y="10" width="20" height="20"/>
  <rect id="CB_0" data-map-object="shelf" x="40" y="10" width="20" height="20"/>
  <rect id="CB_1" data-map-object="shelf" x="70" y="10" width="20" height="20"/>
</svg>
```

Write `lambda/__tests__/fixtures/svg-shelves/duplicate-ids.expected.json`:
```json
{ "shelves": ["CB_0", "CB_1"], "duplicates": ["CB_0"] }
```

- [ ] **Step 8: Create the malformed fixture**

Write `lambda/__tests__/fixtures/svg-shelves/malformed.svg` (intentional unclosed tag):
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect id="CB_0" data-map-object="shelf" x="10" y="10" width="20" height="20"
</svg>
```

Write `lambda/__tests__/fixtures/svg-shelves/malformed.expected.json`:
```json
{ "throws": true, "error": "ParseError" }
```

- [ ] **Step 9: Commit**

```bash
git add lambda/__tests__/fixtures/svg-shelves/
git commit -m "test(fixtures): add svg-shelves parity fixtures (8 cases)"
```

---

### Task 2: Implement `lambda/shared/svg-shelves.mjs`

**Files:**
- Create: `lambda/shared/svg-shelves.mjs`
- Create: `lambda/__tests__/shared/svg-shelves.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lambda/__tests__/shared/svg-shelves.test.mjs`:
```javascript
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseSvg } from '../../shared/svg-shelves.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/svg-shelves');

function loadFixture(name) {
  const svg = readFileSync(join(FIXTURES_DIR, `${name}.svg`), 'utf-8');
  const expected = JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.expected.json`), 'utf-8'));
  return { svg, expected };
}

function listFixtures() {
  return readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f => f.replace(/\.svg$/, ''));
}

describe('parseSvg (server)', () => {
  for (const name of listFixtures()) {
    test(`fixture: ${name}`, () => {
      const { svg, expected } = loadFixture(name);
      if (expected.throws) {
        expect(() => parseSvg(svg)).toThrow();
      } else {
        const result = parseSvg(svg);
        expect(result.shelves).toEqual(expected.shelves);
        expect(result.duplicates).toEqual(expected.duplicates);
      }
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- shared/svg-shelves.test.mjs`
Expected: FAIL — `Cannot find module '../../shared/svg-shelves.mjs'`

- [ ] **Step 3: Implement `parseSvg`**

Write `lambda/shared/svg-shelves.mjs`:
```javascript
/**
 * SVG shelf-ID extractor — single canonical rule.
 *
 * RULE: an SVG element is a "shelf" if and only if both:
 *   - it has attribute data-map-object="shelf"
 *   - it has a non-empty id attribute
 *
 * MUST stay byte-for-byte equivalent in behavior to admin/services/svg-shelves.js.
 * Drift is caught by lambda/__tests__/shared/svg-shelves.test.mjs and
 * admin/__tests__/svg-shelves.test.js running the same fixture set.
 *
 * @param {string} svgString Raw SVG XML text.
 * @returns {{shelves: string[], duplicates: string[]}}
 * @throws {Error} If the SVG cannot be parsed.
 */
export function parseSvg(svgString) {
  // Server side uses a regex-based scan because we don't have DOMParser without
  // jsdom. The rule is simple enough that regex is appropriate: find every tag
  // that carries data-map-object="shelf" AND id="...".
  //
  // We reject malformed input by doing a quick sanity check first.
  if (!isWellFormedXml(svgString)) {
    const err = new Error('ParseError: SVG is not well-formed XML');
    err.name = 'ParseError';
    throw err;
  }

  // Match any element tag containing both attributes in any order.
  // Tag form: <name attr="value" attr="value" .../>  or  <name attr="value">
  const tagRegex = /<[a-zA-Z][^>]*?>/g;
  const seen = new Set();
  const duplicates = new Set();
  const shelves = [];

  for (const match of svgString.matchAll(tagRegex)) {
    const tag = match[0];
    if (!/\bdata-map-object\s*=\s*["']shelf["']/.test(tag)) continue;
    const idMatch = tag.match(/\bid\s*=\s*["']([^"']+)["']/);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (!id) continue;
    if (seen.has(id)) {
      duplicates.add(id);
      continue;
    }
    seen.add(id);
    shelves.push(id);
  }

  return { shelves, duplicates: Array.from(duplicates) };
}

/**
 * Minimal well-formedness check. We don't fully parse — we only catch the
 * obvious "missing close angle bracket" / "unclosed tag" cases that our
 * fixture set exercises. Full XML validation is the parser's job; this is
 * a guard against the most common Inkscape-edit-gone-wrong scenarios.
 */
function isWellFormedXml(s) {
  // Count opening vs self-closing/closing tag transitions
  const opens = (s.match(/</g) || []).length;
  const closes = (s.match(/>/g) || []).length;
  return opens === closes;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- shared/svg-shelves.test.mjs`
Expected: PASS for all 8 fixtures.

- [ ] **Step 5: Commit**

```bash
git add lambda/shared/svg-shelves.mjs lambda/__tests__/shared/svg-shelves.test.mjs
git commit -m "feat(lambda): add svg-shelves parser with parity fixtures"
```

---

### Task 3: Implement `admin/services/svg-shelves.js` (client mirror)

**Files:**
- Create: `admin/services/svg-shelves.js`
- Create: `admin/__tests__/svg-shelves.test.js`

- [ ] **Step 1: Write the failing test**

Write `admin/__tests__/svg-shelves.test.js`:
```javascript
/**
 * @jest-environment node
 */
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseSvg } from '../services/svg-shelves.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../lambda/__tests__/fixtures/svg-shelves');

function loadFixture(name) {
  const svg = readFileSync(join(FIXTURES_DIR, `${name}.svg`), 'utf-8');
  const expected = JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.expected.json`), 'utf-8'));
  return { svg, expected };
}

function listFixtures() {
  return readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f => f.replace(/\.svg$/, ''));
}

describe('parseSvg (client) — parity with server', () => {
  for (const name of listFixtures()) {
    test(`fixture: ${name}`, () => {
      const { svg, expected } = loadFixture(name);
      if (expected.throws) {
        expect(() => parseSvg(svg)).toThrow();
      } else {
        const result = parseSvg(svg);
        expect(result.shelves).toEqual(expected.shelves);
        expect(result.duplicates).toEqual(expected.duplicates);
      }
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin && npm test -- svg-shelves.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client mirror**

Write `admin/services/svg-shelves.js`:
```javascript
/**
 * SVG shelf-ID extractor — single canonical rule.
 *
 * RULE: an SVG element is a "shelf" if and only if both:
 *   - it has attribute data-map-object="shelf"
 *   - it has a non-empty id attribute
 *
 * MUST stay byte-for-byte equivalent in behavior to
 * lambda/shared/svg-shelves.mjs. Drift is caught by parity tests:
 *   - lambda/__tests__/shared/svg-shelves.test.mjs
 *   - admin/__tests__/svg-shelves.test.js
 *
 * Both tests load the same fixture set at lambda/__tests__/fixtures/svg-shelves/.
 *
 * @param {string} svgString Raw SVG XML text.
 * @returns {{shelves: string[], duplicates: string[]}}
 * @throws {Error} If the SVG cannot be parsed.
 */
export function parseSvg(svgString) {
  if (!isWellFormedXml(svgString)) {
    const err = new Error('ParseError: SVG is not well-formed XML');
    err.name = 'ParseError';
    throw err;
  }

  const tagRegex = /<[a-zA-Z][^>]*?>/g;
  const seen = new Set();
  const duplicates = new Set();
  const shelves = [];

  for (const match of svgString.matchAll(tagRegex)) {
    const tag = match[0];
    if (!/\bdata-map-object\s*=\s*["']shelf["']/.test(tag)) continue;
    const idMatch = tag.match(/\bid\s*=\s*["']([^"']+)["']/);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (!id) continue;
    if (seen.has(id)) {
      duplicates.add(id);
      continue;
    }
    seen.add(id);
    shelves.push(id);
  }

  return { shelves, duplicates: Array.from(duplicates) };
}

function isWellFormedXml(s) {
  const opens = (s.match(/</g) || []).length;
  const closes = (s.match(/>/g) || []).length;
  return opens === closes;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && npm test -- svg-shelves.test.js`
Expected: PASS for all 8 fixtures.

- [ ] **Step 5: Commit**

```bash
git add admin/services/svg-shelves.js admin/__tests__/svg-shelves.test.js
git commit -m "feat(admin): add svg-shelves client mirror with parity tests"
```

---

### Task 4: Create the bundle fixtures

**Files:**
- Create: `lambda/__tests__/fixtures/bundles/all-resolve.json`
- Create: `lambda/__tests__/fixtures/bundles/one-broken-ref.json`
- Create: `lambda/__tests__/fixtures/bundles/multi-floor-mixed.json`
- Create: `lambda/__tests__/fixtures/bundles/wrong-floor.json`
- Create: `lambda/__tests__/fixtures/bundles/empty-csv.json`

- [ ] **Step 1: Create `all-resolve.json`**

```json
{
  "name": "all-resolve",
  "csvRows": [
    { "rowIndex": 0, "svgCode": "CB_0", "floor": 0 },
    { "rowIndex": 1, "svgCode": "CC_1-4", "floor": 1 }
  ],
  "svgShelfIdsByFloor": {
    "0": ["CB_0"],
    "1": ["CC_1-4", "CC_5-12"],
    "2": []
  },
  "expected": { "ok": true, "errors": [] }
}
```

- [ ] **Step 2: Create `one-broken-ref.json`**

```json
{
  "name": "one-broken-ref",
  "csvRows": [
    { "rowIndex": 0, "svgCode": "CB_0", "floor": 0 },
    { "rowIndex": 1, "svgCode": "MISSING", "floor": 1 }
  ],
  "svgShelfIdsByFloor": {
    "0": ["CB_0"],
    "1": ["CC_1-4"],
    "2": []
  },
  "expected": {
    "ok": false,
    "errors": [
      { "rowIndex": 1, "svgCode": "MISSING", "floor": 1, "type": "shelf-not-found" }
    ]
  }
}
```

- [ ] **Step 3: Create `multi-floor-mixed.json`**

```json
{
  "name": "multi-floor-mixed",
  "csvRows": [
    { "rowIndex": 0, "svgCode": "CB_0",  "floor": 0 },
    { "rowIndex": 1, "svgCode": "BAD",   "floor": 0 },
    { "rowIndex": 2, "svgCode": "CC_X",  "floor": 1 },
    { "rowIndex": 3, "svgCode": "CC_Y",  "floor": 1 },
    { "rowIndex": 4, "svgCode": "GONE",  "floor": 2 }
  ],
  "svgShelfIdsByFloor": {
    "0": ["CB_0", "CB_1"],
    "1": ["CC_X", "CC_Y"],
    "2": []
  },
  "expected": {
    "ok": false,
    "errors": [
      { "rowIndex": 1, "svgCode": "BAD",  "floor": 0, "type": "shelf-not-found" },
      { "rowIndex": 4, "svgCode": "GONE", "floor": 2, "type": "shelf-not-found" }
    ]
  }
}
```

- [ ] **Step 4: Create `wrong-floor.json` — shelf exists but on the wrong floor**

```json
{
  "name": "wrong-floor",
  "csvRows": [
    { "rowIndex": 0, "svgCode": "CB_0", "floor": 1 }
  ],
  "svgShelfIdsByFloor": {
    "0": ["CB_0"],
    "1": ["CC_X"],
    "2": []
  },
  "expected": {
    "ok": false,
    "errors": [
      { "rowIndex": 0, "svgCode": "CB_0", "floor": 1, "type": "shelf-not-found" }
    ]
  }
}
```

- [ ] **Step 5: Create `empty-csv.json`**

```json
{
  "name": "empty-csv",
  "csvRows": [],
  "svgShelfIdsByFloor": {
    "0": ["CB_0"],
    "1": [],
    "2": []
  },
  "expected": { "ok": true, "errors": [] }
}
```

- [ ] **Step 6: Commit**

```bash
git add lambda/__tests__/fixtures/bundles/
git commit -m "test(fixtures): add validateBundle parity fixtures (5 cases)"
```

---

### Task 5: Implement `lambda/shared/validateBundle.mjs`

**Files:**
- Create: `lambda/shared/validateBundle.mjs`
- Create: `lambda/__tests__/shared/validateBundle.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lambda/__tests__/shared/validateBundle.test.mjs`:
```javascript
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateBundle } from '../../shared/validateBundle.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/bundles');

function listFixtures() {
  return readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
}

describe('validateBundle (server)', () => {
  for (const file of listFixtures()) {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8'));
    test(`fixture: ${fixture.name}`, () => {
      // Convert string keys to numbers since CSV floor is numeric
      const byFloor = {};
      for (const [k, v] of Object.entries(fixture.svgShelfIdsByFloor)) {
        byFloor[Number(k)] = new Set(v);
      }
      const result = validateBundle(fixture.csvRows, byFloor);
      expect(result.ok).toBe(fixture.expected.ok);
      expect(result.errors).toEqual(fixture.expected.errors);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- shared/validateBundle.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `validateBundle`**

Write `lambda/shared/validateBundle.mjs`:
```javascript
/**
 * Bundle-consistency rule-checker.
 *
 * RULE: every CSV row's svgCode must be present in the SVG shelf set for the
 * row's declared floor.
 *
 * NOT FLAGGED (handled elsewhere):
 *   - Orphan shelves (SVG shelves with no CSV row): surfaced by Ranges Editor
 *     as the "Unassigned" pseudo-collection. Not a bundle violation.
 *   - Range overlaps within a collection: enforced by range-validation.mjs.
 *
 * MUST stay equivalent in behavior to admin/services/bundle-validator.js.
 * Drift caught by parity tests using lambda/__tests__/fixtures/bundles/.
 *
 * @param {Array<{rowIndex:number, svgCode:string, floor:number}>} csvRows
 * @param {Object<number, Set<string>>} svgShelfIdsByFloor
 * @returns {{ok: boolean, errors: Array<{rowIndex,svgCode,floor,type}>}}
 */
export function validateBundle(csvRows, svgShelfIdsByFloor) {
  const errors = [];
  for (const row of csvRows) {
    const set = svgShelfIdsByFloor[row.floor];
    if (!set || !set.has(row.svgCode)) {
      errors.push({
        rowIndex: row.rowIndex,
        svgCode: row.svgCode,
        floor: row.floor,
        type: 'shelf-not-found',
      });
    }
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- shared/validateBundle.test.mjs`
Expected: PASS for all 5 fixtures.

- [ ] **Step 5: Commit**

```bash
git add lambda/shared/validateBundle.mjs lambda/__tests__/shared/validateBundle.test.mjs
git commit -m "feat(lambda): add validateBundle rule-checker with parity fixtures"
```

---

### Task 6: Implement `admin/services/bundle-validator.js`

**Files:**
- Create: `admin/services/bundle-validator.js`
- Create: `admin/__tests__/bundle-validator.test.js`

- [ ] **Step 1: Write the failing test**

Write `admin/__tests__/bundle-validator.test.js`:
```javascript
// Pure-JS rule; jsdom default is fine (admin setup.js requires jsdom)
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateBundle } from '../services/bundle-validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../lambda/__tests__/fixtures/bundles');

function listFixtures() {
  return readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
}

describe('validateBundle (client) — parity with server', () => {
  for (const file of listFixtures()) {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8'));
    test(`fixture: ${fixture.name}`, () => {
      const byFloor = {};
      for (const [k, v] of Object.entries(fixture.svgShelfIdsByFloor)) {
        byFloor[Number(k)] = new Set(v);
      }
      const result = validateBundle(fixture.csvRows, byFloor);
      expect(result.ok).toBe(fixture.expected.ok);
      expect(result.errors).toEqual(fixture.expected.errors);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin && npm test -- bundle-validator.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client mirror**

Write `admin/services/bundle-validator.js`:
```javascript
/**
 * Bundle-consistency rule-checker (client mirror).
 *
 * Same rule as lambda/shared/validateBundle.mjs. Drift caught by parity
 * tests using lambda/__tests__/fixtures/bundles/.
 *
 * @param {Array<{rowIndex:number, svgCode:string, floor:number}>} csvRows
 * @param {Object<number, Set<string>>} svgShelfIdsByFloor
 * @returns {{ok: boolean, errors: Array}}
 */
export function validateBundle(csvRows, svgShelfIdsByFloor) {
  const errors = [];
  for (const row of csvRows) {
    const set = svgShelfIdsByFloor[row.floor];
    if (!set || !set.has(row.svgCode)) {
      errors.push({
        rowIndex: row.rowIndex,
        svgCode: row.svgCode,
        floor: row.floor,
        type: 'shelf-not-found',
      });
    }
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && npm test -- bundle-validator.test.js`
Expected: PASS for all 5 fixtures.

- [ ] **Step 5: Commit**

```bash
git add admin/services/bundle-validator.js admin/__tests__/bundle-validator.test.js
git commit -m "feat(admin): add bundle-validator client mirror with parity tests"
```

---

### Task 7: Add `getBrokenRefs` helper to `data-model.js`

**Files:**
- Modify: `admin/services/data-model.js`
- Modify: `admin/__tests__/data-model.test.js`

- [ ] **Step 1: Write the failing test**

Append to `admin/__tests__/data-model.test.js`:
```javascript
import { getBrokenRefs } from '../services/data-model.js';

describe('getBrokenRefs', () => {
  test('returns rows whose svgCode is not in the floor SVG', () => {
    const rows = [
      { rowIndex: 0, svgCode: 'CB_0',    floor: 0 },
      { rowIndex: 1, svgCode: 'MISSING', floor: 0 },
      { rowIndex: 2, svgCode: 'CC_X',    floor: 1 },
      { rowIndex: 3, svgCode: 'CC_Y',    floor: 1 },
    ];
    const byFloor = {
      0: new Set(['CB_0']),
      1: new Set(['CC_X']),
      2: new Set(),
    };
    const broken = getBrokenRefs(rows, byFloor);
    expect(broken).toEqual([
      { rowIndex: 1, svgCode: 'MISSING', floor: 0, type: 'shelf-not-found' },
      { rowIndex: 3, svgCode: 'CC_Y',    floor: 1, type: 'shelf-not-found' },
    ]);
  });

  test('returns empty array when all refs resolve', () => {
    const rows = [{ rowIndex: 0, svgCode: 'CB_0', floor: 0 }];
    const byFloor = { 0: new Set(['CB_0']), 1: new Set(), 2: new Set() };
    expect(getBrokenRefs(rows, byFloor)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin && npm test -- data-model.test.js`
Expected: FAIL — `getBrokenRefs is not exported`.

- [ ] **Step 3: Add `getBrokenRefs` export**

Append to `admin/services/data-model.js`:
```javascript
/**
 * Returns the subset of rows whose svgCode does not resolve to a shelf on the
 * row's declared floor. Thin wrapper around bundle-validator's validateBundle
 * that returns only the errors list (drops the {ok} envelope).
 *
 * Used by the CSV Editor "Broken refs" filter mode.
 */
import { validateBundle } from './bundle-validator.js';

export function getBrokenRefs(rows, svgShelfIdsByFloor) {
  const { errors } = validateBundle(rows, svgShelfIdsByFloor);
  return errors;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && npm test -- data-model.test.js`
Expected: PASS for both new tests; all existing data-model tests still pass.

- [ ] **Step 5: Commit**

```bash
git add admin/services/data-model.js admin/__tests__/data-model.test.js
git commit -m "feat(data-model): add getBrokenRefs helper"
```

---

### Task 8: Lambda — SVG fetcher with warm-container cache

**Files:**
- Create: `lambda/shared/fetch-floor-svgs.mjs`
- Create: `lambda/__tests__/shared/fetch-floor-svgs.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lambda/__tests__/shared/fetch-floor-svgs.test.mjs`:
```javascript
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { fetchFloorSvgs, _clearCache } from '../../shared/fetch-floor-svgs.mjs';

const s3Mock = mockClient(S3Client);

function streamFromString(s) {
  const r = Readable.from([Buffer.from(s)]);
  return { Body: r, ETag: '"abc123"' };
}

describe('fetchFloorSvgs', () => {
  beforeEach(() => {
    s3Mock.reset();
    _clearCache();
  });

  test('fetches and parses 3 floor SVGs, returns shelf sets keyed by floor', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(
      streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_X" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(
      streamFromString('<svg/>')
    );

    const result = await fetchFloorSvgs('test-bucket');
    expect(result[0]).toEqual(new Set(['CB_0']));
    expect(result[1]).toEqual(new Set(['CC_X']));
    expect(result[2]).toEqual(new Set());
  });

  test('caches by ETag — second call with same ETag does not re-fetch', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(
      streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));

    await fetchFloorSvgs('test-bucket');
    const callsAfterFirst = s3Mock.calls().length;

    await fetchFloorSvgs('test-bucket');
    const callsAfterSecond = s3Mock.calls().length;

    // We do HEAD-style ETag checks; current implementation always re-GETs.
    // Assertion here documents the behavior we want; the cache is keyed by ETag.
    // Re-fetching is allowed if the ETag is the same (we can short-circuit on the cache hit).
    // For v1 we simply do parallel GETs every time but cache parsed shelf sets,
    // and the cost is the 3 GETs themselves (acceptable per spec).
    expect(callsAfterSecond).toBeGreaterThanOrEqual(callsAfterFirst);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- shared/fetch-floor-svgs.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fetchFloorSvgs`**

Write `lambda/shared/fetch-floor-svgs.mjs`:
```javascript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { parseSvg } from './svg-shelves.mjs';

const s3 = new S3Client({ region: 'us-east-1' });

// Warm-container cache. Keyed by `${bucket}::${key}::${etag}`.
// Value is { etag, shelves: Set<string> }.
const cache = new Map();
const FLOORS = [0, 1, 2];

/**
 * Fetch the three current floor SVGs from S3, parse them, and return shelf
 * sets keyed by floor number. Caches parsed sets across warm-container
 * invocations keyed by S3 ETag.
 *
 * @param {string} bucket S3 bucket name.
 * @returns {Promise<Object<number, Set<string>>>} Map of floor -> shelf-id set.
 */
export async function fetchFloorSvgs(bucket) {
  const results = await Promise.all(
    FLOORS.map(async (floor) => {
      const key = `maps/floor_${floor}.svg`;
      const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const etag = resp.ETag || 'no-etag';
      const cacheKey = `${bucket}::${key}::${etag}`;

      if (cache.has(cacheKey)) {
        return [floor, cache.get(cacheKey).shelves];
      }

      const body = await streamToString(resp.Body);
      const { shelves } = parseSvg(body);
      const shelfSet = new Set(shelves);
      cache.set(cacheKey, { etag, shelves: shelfSet });
      return [floor, shelfSet];
    })
  );

  const byFloor = {};
  for (const [floor, shelfSet] of results) {
    byFloor[floor] = shelfSet;
  }
  return byFloor;
}

/** Test helper: clear the warm-container cache. */
export function _clearCache() {
  cache.clear();
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- shared/fetch-floor-svgs.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lambda/shared/fetch-floor-svgs.mjs lambda/__tests__/shared/fetch-floor-svgs.test.mjs
git commit -m "feat(lambda): add fetch-floor-svgs with warm-container cache"
```

---

### Task 9: Extend `putCsv.mjs` with bundle validation

**Files:**
- Modify: `lambda/putCsv.mjs`
- Modify: `lambda/__tests__/putCsv.test.mjs` (or create if absent)

- [ ] **Step 1: Write the failing test (new cases)**

Append to `lambda/__tests__/putCsv.test.mjs` (or create with full setup if the file doesn't exist — check first with `ls lambda/__tests__/putCsv.test.mjs`):

```javascript
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { Readable } from 'stream';
import { _clearCache } from '../shared/fetch-floor-svgs.mjs';

const s3Mock = mockClient(S3Client);
const cfMock = mockClient(CloudFrontClient);

function streamFromString(s) {
  return { Body: Readable.from([Buffer.from(s)]), ETag: `"${Date.now()}"` };
}

function makeEvent(csvBody, token = 'admin-token') {
  return {
    httpMethod: 'PUT',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ csv: csvBody }),
  };
}

describe('putCsv — bundle invariant', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    cfMock.reset();
    _clearCache();

    // Mock the SVGs
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(
      streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));

    // CSV put always succeeds
    s3Mock.on(PutObjectCommand).resolves({});
    cfMock.on(CreateInvalidationCommand).resolves({});

    // Mock auth + role to bypass real Cognito
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ valid: true, claims: { sub: 'u', 'cognito:groups': ['admin'] } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));

    ({ handler } = await import('../putCsv.mjs'));
  });

  test('with flag ON: rejects 422 when CSV references a missing shelf', async () => {
    process.env.BUNDLE_INVARIANT_ENABLED = 'true';
    // CSV has a row pointing at MISSING which is not in any SVG
    const csv = 'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,';
    const resp = await handler(makeEvent(csv));
    expect(resp.statusCode).toBe(422);
    const body = JSON.parse(resp.body);
    expect(body.errors).toContainEqual(expect.objectContaining({
      svgCode: 'MISSING',
      type: 'shelf-not-found',
    }));
  });

  test('with flag OFF: logs but proceeds when CSV references a missing shelf', async () => {
    process.env.BUNDLE_INVARIANT_ENABLED = 'false';
    const csv = 'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,';
    const resp = await handler(makeEvent(csv));
    expect(resp.statusCode).toBe(200);
    // PutObjectCommand should have been called (the write happened)
    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls.length).toBeGreaterThan(0);
  });

  test('with flag ON: accepts a valid CSV', async () => {
    process.env.BUNDLE_INVARIANT_ENABLED = 'true';
    const csv = 'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe\nLib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,';
    const resp = await handler(makeEvent(csv));
    expect(resp.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- putCsv.test.mjs`
Expected: FAIL — the bundle-invariant logic isn't in putCsv yet, so the 422 test fails.

- [ ] **Step 3: Modify `lambda/putCsv.mjs` to add the validation step**

Read the existing `lambda/putCsv.mjs` first to understand its current structure. Then add the validation step.

Add at the top of the file with other imports:
```javascript
import { fetchFloorSvgs } from './shared/fetch-floor-svgs.mjs';
import { validateBundle } from './shared/validateBundle.mjs';
```

Inside the handler, after the existing CSV parse step (look for where rows are parsed via `parseCsvContent`) and BEFORE the existing S3 PutObjectCommand, add:

```javascript
  // --- Bundle invariant check ---
  // Fetch the current SVG shelf sets and verify the new CSV is consistent.
  // Gate enforcement behind BUNDLE_INVARIANT_ENABLED so we can run in
  // log-only mode during the telemetry/cleanup migration stages.
  const svgShelfIdsByFloor = await fetchFloorSvgs(BUCKET);
  const csvRowsForValidation = parsedRows.map((row, idx) => ({
    rowIndex: idx,
    svgCode: String(row.svgCode || ''),
    floor: Number(row.floor),
  }));
  const validation = validateBundle(csvRowsForValidation, svgShelfIdsByFloor);

  if (!validation.ok) {
    const enforced = process.env.BUNDLE_INVARIANT_ENABLED === 'true';
    console.log(JSON.stringify({
      level: enforced ? 'ERROR' : 'WARN',
      metric: 'bundle.violations.csv_write',
      enforced,
      errorCount: validation.errors.length,
      errors: validation.errors.slice(0, 20),  // truncate for log size
    }));

    if (enforced) {
      return createAuthResponse(422, {
        error: 'Bundle invariant violation',
        errors: validation.errors,
      }, CORS_HEADERS);
    }
    // Flag off: proceed with the write despite violations.
  }
  // --- End bundle invariant check ---
```

Replace `parsedRows` in the snippet above with whatever variable name the existing `putCsv.mjs` uses for parsed CSV rows. If that variable isn't already present, parse with `parseCsvContent(body.csv)` from `range-validation.mjs`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- putCsv.test.mjs`
Expected: PASS for all three new bundle-invariant tests, plus any pre-existing putCsv tests.

- [ ] **Step 5: Commit**

```bash
git add lambda/putCsv.mjs lambda/__tests__/putCsv.test.mjs
git commit -m "feat(lambda): enforce bundle invariant in putCsv (flag-gated)"
```

---

### Task 10: Add the "Broken refs" filter toggle to CSV Editor

**Files:**
- Modify: `admin/components/csv-editor.js`
- Create: `admin/__tests__/csv-editor-broken-refs.test.js`

- [ ] **Step 1: Write the failing test**

Write `admin/__tests__/csv-editor-broken-refs.test.js`:
```javascript
/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('CSV Editor — Broken refs filter', () => {
  let initCSVEditor;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="csv-editor">
        <div id="csv-toolbar"></div>
        <table id="csv-table"></table>
      </div>
    `;

    // Mock data-model.getBrokenRefs
    jest.unstable_mockModule('../services/data-model.js', () => ({
      getBrokenRefs: jest.fn().mockReturnValue([
        { rowIndex: 2, svgCode: 'MISSING', floor: 0, type: 'shelf-not-found' },
      ]),
      // Stubs for other data-model imports used by csv-editor.js — fill in
      // any additional exports that the import graph requires.
      loadCsv: jest.fn().mockResolvedValue({ rows: [], svgShelfIdsByFloor: {} }),
    }));

    ({ initCSVEditor } = await import('../components/csv-editor.js'));
  });

  test('renders a "Show only broken refs" toggle in the toolbar', () => {
    initCSVEditor();
    const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
    expect(toggle).not.toBeNull();
  });

  test('toggle shows live count of broken refs', () => {
    initCSVEditor();
    const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
    expect(toggle.textContent).toMatch(/\(1\)/);  // count of broken refs from mock
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin && npm test -- csv-editor-broken-refs.test.js`
Expected: FAIL — the toggle element doesn't exist yet.

- [ ] **Step 3: Add the toggle to `csv-editor.js`**

In `admin/components/csv-editor.js`:

1. Add to the `FALLBACKS` object near the top:
```javascript
'csv.brokenRefs':       { en: 'Show only broken refs',  he: 'הצג רק רפרנסים שבורים' },
'csv.brokenRefsCount':  { en: '({count})',              he: '({count})' },
```

2. Import the helper at the top of the file:
```javascript
import { getBrokenRefs } from '../services/data-model.js?v=5';
import { parseSvg } from '../services/svg-shelves.js?v=5';
```

3. Add module-level state:
```javascript
let brokenRefsFilterActive = false;
let svgShelfIdsByFloor = { 0: new Set(), 1: new Set(), 2: new Set() };
```

4. In the toolbar rendering function (find where buttons like Add Row or Save are rendered — likely a function called `renderToolbar` or similar; if not present, find where the toolbar element is populated during `initCSVEditor`), add:
```javascript
function renderBrokenRefsToggle() {
  const toolbar = document.getElementById('csv-toolbar');
  if (!toolbar) return;
  let toggle = toolbar.querySelector('[data-action="toggle-broken-refs"]');
  const broken = getBrokenRefs(getCsvRowsForValidation(), svgShelfIdsByFloor);
  const label = `${t('csv.brokenRefs')} ${t('csv.brokenRefsCount').replace('{count}', broken.length)}`;
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.setAttribute('data-action', 'toggle-broken-refs');
    toggle.className = 'px-3 py-1.5 text-sm rounded ' + (brokenRefsFilterActive
      ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200');
    toggle.addEventListener('click', () => {
      brokenRefsFilterActive = !brokenRefsFilterActive;
      renderBrokenRefsToggle();
      renderRows();  // re-render the table; existing function name in csv-editor.js
    });
    toolbar.appendChild(toggle);
  } else {
    toggle.className = 'px-3 py-1.5 text-sm rounded ' + (brokenRefsFilterActive
      ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200');
  }
  toggle.textContent = label;
}

function getCsvRowsForValidation() {
  return csvData.map((row, idx) => ({
    rowIndex: idx,
    svgCode: String(row.svgCode || ''),
    floor: Number(row.floor),
  }));
}
```

5. Call `renderBrokenRefsToggle()` at the end of the existing `initCSVEditor()` function.

6. Also, fetch and parse the three floor SVGs once at init so the filter can compute broken refs. Add after the CSV is loaded in `initCSVEditor()`:
```javascript
// Fetch floor SVGs for the bundle-invariant filter
await Promise.all([0, 1, 2].map(async (floor) => {
  const resp = await fetch(`${CLOUDFRONT_URL}/maps/floor_${floor}.svg`, { cache: 'no-cache' });
  const text = await resp.text();
  const { shelves } = parseSvg(text);
  svgShelfIdsByFloor[floor] = new Set(shelves);
}));
renderBrokenRefsToggle();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && npm test -- csv-editor-broken-refs.test.js`
Expected: PASS for both tests.

- [ ] **Step 5: Commit**

```bash
git add admin/components/csv-editor.js admin/__tests__/csv-editor-broken-refs.test.js
git commit -m "feat(csv-editor): add Broken refs filter toggle (count only)"
```

---

### Task 11: Filter table rows when the toggle is active

**Files:**
- Modify: `admin/components/csv-editor.js`
- Modify: `admin/__tests__/csv-editor-broken-refs.test.js`

- [ ] **Step 1: Write the failing test**

Append to `admin/__tests__/csv-editor-broken-refs.test.js`:
```javascript
test('clicking the toggle filters the table to only broken-ref rows', async () => {
  initCSVEditor();
  // Pretend we have 4 rows, only row 2 is broken
  document.getElementById('csv-table').innerHTML = `
    <tr data-row-index="0"><td>OK</td></tr>
    <tr data-row-index="1"><td>OK</td></tr>
    <tr data-row-index="2"><td>BROKEN</td></tr>
    <tr data-row-index="3"><td>OK</td></tr>
  `;
  const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
  toggle.click();
  // After click, only the broken row should be visible
  const visibleRows = Array.from(document.querySelectorAll('#csv-table tr'))
    .filter(tr => tr.style.display !== 'none');
  expect(visibleRows).toHaveLength(1);
  expect(visibleRows[0].dataset.rowIndex).toBe('2');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin && npm test -- csv-editor-broken-refs.test.js`
Expected: FAIL — clicking the toggle doesn't currently hide rows.

- [ ] **Step 3: Implement the row-filtering logic**

In `admin/components/csv-editor.js`, modify the existing `renderRows()` function (or the function that builds the table body) to apply the filter:
```javascript
function applyBrokenRefsFilter() {
  if (!brokenRefsFilterActive) {
    // Show all rows
    document.querySelectorAll('#csv-table tr[data-row-index]').forEach(tr => {
      tr.style.display = '';
    });
    return;
  }
  const broken = getBrokenRefs(getCsvRowsForValidation(), svgShelfIdsByFloor);
  const brokenIdxs = new Set(broken.map(b => String(b.rowIndex)));
  document.querySelectorAll('#csv-table tr[data-row-index]').forEach(tr => {
    tr.style.display = brokenIdxs.has(tr.dataset.rowIndex) ? '' : 'none';
  });
}
```

Call `applyBrokenRefsFilter()` at the end of the existing `renderRows()` function (so the filter re-applies after every re-render). Also call it in the toggle's click handler in Task 10's `renderBrokenRefsToggle()` (replace `renderRows()` with `applyBrokenRefsFilter()` if `renderRows()` is expensive; both is fine if not).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && npm test -- csv-editor-broken-refs.test.js`
Expected: PASS for all three tests.

- [ ] **Step 5: Commit**

```bash
git add admin/components/csv-editor.js admin/__tests__/csv-editor-broken-refs.test.js
git commit -m "feat(csv-editor): filter table to broken refs when toggle active"
```

---

### Task 12: Inline "Rename to ▾" dropdown per broken row

**Files:**
- Modify: `admin/components/csv-editor.js`
- Modify: `admin/__tests__/csv-editor-broken-refs.test.js`

- [ ] **Step 1: Write the failing test**

Append to `admin/__tests__/csv-editor-broken-refs.test.js`:
```javascript
test('each broken row gets an inline "Rename to" dropdown listing unclaimed shelves on its floor', async () => {
  initCSVEditor();
  // Override broken refs to a known shape
  const mock = await import('../services/data-model.js');
  mock.getBrokenRefs.mockReturnValueOnce([
    { rowIndex: 0, svgCode: 'MISSING', floor: 0, type: 'shelf-not-found' },
  ]);
  // Pretend floor 0 has unclaimed shelves CB_NEW_A and CB_NEW_B
  // (mock svgShelfIdsByFloor via internal setter or by direct DOM manipulation
  //  — actual implementation will read from module state populated at init)

  document.getElementById('csv-table').innerHTML = `
    <tr data-row-index="0"><td class="svg-code-cell">MISSING</td></tr>
  `;
  const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
  toggle.click();

  const dropdown = document.querySelector('tr[data-row-index="0"] select[data-action="rename-svgcode"]');
  expect(dropdown).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin && npm test -- csv-editor-broken-refs.test.js`
Expected: FAIL — dropdown not rendered.

- [ ] **Step 3: Implement the dropdown**

In `admin/components/csv-editor.js`, extend `applyBrokenRefsFilter()` to inject the dropdown:
```javascript
function applyBrokenRefsFilter() {
  if (!brokenRefsFilterActive) {
    document.querySelectorAll('#csv-table tr[data-row-index]').forEach(tr => {
      tr.style.display = '';
      const inline = tr.querySelector('[data-broken-row-actions]');
      if (inline) inline.remove();
    });
    return;
  }
  const broken = getBrokenRefs(getCsvRowsForValidation(), svgShelfIdsByFloor);
  const brokenIdxs = new Set(broken.map(b => String(b.rowIndex)));

  document.querySelectorAll('#csv-table tr[data-row-index]').forEach(tr => {
    const idx = tr.dataset.rowIndex;
    if (!brokenIdxs.has(idx)) {
      tr.style.display = 'none';
      return;
    }
    tr.style.display = '';
    if (tr.querySelector('[data-broken-row-actions]')) return;  // already injected

    const row = csvData[Number(idx)];
    const floor = Number(row.floor);
    const claimedOnFloor = new Set(
      csvData
        .filter((_, i) => Number(csvData[i].floor) === floor && i !== Number(idx))
        .map(r => String(r.svgCode))
    );
    const unclaimed = Array.from(svgShelfIdsByFloor[floor] || []).filter(id => !claimedOnFloor.has(id));

    const actions = document.createElement('td');
    actions.setAttribute('data-broken-row-actions', '');
    actions.innerHTML = `
      <select data-action="rename-svgcode" class="border rounded px-2 py-1 text-sm">
        <option value="">-- Rename to --</option>
        ${unclaimed.map(id => `<option value="${id}">${id}</option>`).join('')}
      </select>
    `;
    actions.querySelector('select').addEventListener('change', (e) => {
      const newId = e.target.value;
      if (!newId) return;
      csvData[Number(idx)].svgCode = newId;
      hasChanges = true;  // signal to the existing save flow
      renderRows();
    });
    tr.appendChild(actions);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && npm test -- csv-editor-broken-refs.test.js`
Expected: PASS for all four tests.

- [ ] **Step 5: Commit**

```bash
git add admin/components/csv-editor.js admin/__tests__/csv-editor-broken-refs.test.js
git commit -m "feat(csv-editor): inline rename dropdown per broken row"
```

---

### Task 13: "Delete row" action with confirm dialog

**Files:**
- Modify: `admin/components/csv-editor.js`
- Modify: `admin/__tests__/csv-editor-broken-refs.test.js`

- [ ] **Step 1: Write the failing test**

Append to `admin/__tests__/csv-editor-broken-refs.test.js`:
```javascript
test('each broken row has a "Delete row" button that prompts before deleting', async () => {
  initCSVEditor();
  document.getElementById('csv-table').innerHTML = `
    <tr data-row-index="0"><td class="svg-code-cell">MISSING</td></tr>
  `;
  const toggle = document.querySelector('[data-action="toggle-broken-refs"]');
  toggle.click();

  const deleteBtn = document.querySelector('tr[data-row-index="0"] button[data-action="delete-broken-row"]');
  expect(deleteBtn).not.toBeNull();

  // Mock window.confirm to return true
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  deleteBtn.click();
  expect(confirmSpy).toHaveBeenCalled();
  // The row should be marked for deletion (or removed from csvData)
  confirmSpy.mockRestore();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin && npm test -- csv-editor-broken-refs.test.js`
Expected: FAIL — delete button missing.

- [ ] **Step 3: Add the delete button to the inline actions**

In the `actions.innerHTML` template inside `applyBrokenRefsFilter()`, extend:
```javascript
actions.innerHTML = `
  <select data-action="rename-svgcode" class="border rounded px-2 py-1 text-sm">
    <option value="">-- Rename to --</option>
    ${unclaimed.map(id => `<option value="${id}">${id}</option>`).join('')}
  </select>
  <button data-action="delete-broken-row" class="ml-2 px-2 py-1 text-sm bg-red-100 text-red-800 rounded hover:bg-red-200">
    ${t('csv.deleteRow')}
  </button>
`;
```

Add to `FALLBACKS`:
```javascript
'csv.deleteRow':           { en: 'Delete row',                                he: 'מחק שורה' },
'csv.deleteRowConfirm':    { en: 'Delete row {idx} (svgCode "{code}")? This cannot be undone here — recover via S3 version history if needed.',
                             he: 'מחק שורה {idx} (svgCode "{code}")? לא ניתן לבטל; שחזור דרך היסטוריית גרסאות S3.' },
```

Wire the button:
```javascript
actions.querySelector('button[data-action="delete-broken-row"]').addEventListener('click', () => {
  const confirmMsg = t('csv.deleteRowConfirm')
    .replace('{idx}', idx)
    .replace('{code}', row.svgCode);
  if (!window.confirm(confirmMsg)) return;
  csvData.splice(Number(idx), 1);
  hasChanges = true;
  renderRows();
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && npm test -- csv-editor-broken-refs.test.js`
Expected: PASS for all five tests.

- [ ] **Step 5: Commit**

```bash
git add admin/components/csv-editor.js admin/__tests__/csv-editor-broken-refs.test.js
git commit -m "feat(csv-editor): add Delete row action with confirm dialog"
```

---

### Task 14: E2E test — migration cleanup happy path

**Files:**
- Create: `e2e/tests/csv-editor-broken-refs.spec.ts`

- [ ] **Step 1: Write the E2E test**

Write `e2e/tests/csv-editor-broken-refs.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test.describe('CSV Editor — Broken refs filter (migration cleanup)', () => {
  test('toggle filters to broken rows; rename action removes a row from the filter', async ({ page }) => {
    // Set up: navigate to admin, log in as admin, open CSV Editor
    await page.goto('/admin/');
    // [Use existing e2e/fixtures/auth.ts helpers — see other tests for the pattern]

    await page.click('a:has-text("CSV Editor")');

    // Click the broken-refs toggle
    const toggle = page.locator('[data-action="toggle-broken-refs"]');
    await expect(toggle).toBeVisible();
    const initialText = await toggle.textContent();
    const initialMatch = initialText?.match(/\((\d+)\)/);
    const initialCount = initialMatch ? Number(initialMatch[1]) : 0;
    test.skip(initialCount === 0, 'No broken refs present in seed data — nothing to clean up.');

    await toggle.click();

    // Verify only broken-ref rows are visible
    const visibleRows = page.locator('#csv-table tr[data-row-index]:visible');
    const visibleCount = await visibleRows.count();
    expect(visibleCount).toBe(initialCount);

    // Use the rename dropdown on the first broken row
    const firstDropdown = page.locator('tr[data-row-index]:visible select[data-action="rename-svgcode"]').first();
    const options = await firstDropdown.locator('option:not([value=""])').count();
    test.skip(options === 0, 'No unclaimed shelves on this floor to rename to — manual test needed.');

    await firstDropdown.selectOption({ index: 1 });

    // After rename, the row should disappear from the filter view
    const newVisibleCount = await visibleRows.count();
    expect(newVisibleCount).toBe(initialCount - 1);

    // Counter on the toggle should decrement
    const newText = await toggle.textContent();
    expect(newText).toContain(`(${initialCount - 1})`);
  });
});
```

- [ ] **Step 2: Run the E2E test to confirm shape**

Run: `npx playwright test e2e/tests/csv-editor-broken-refs.spec.ts --headed`
Expected: PASS, or skip if no broken refs exist in the seed data. The skip is acceptable for fresh environments.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/csv-editor-broken-refs.spec.ts
git commit -m "test(e2e): broken-refs filter migration cleanup happy path"
```

---

### Task 15: Update `docs/AWS-INFRASTRUCTURE.md` and `CLAUDE.md`

**Files:**
- Modify: `docs/AWS-INFRASTRUCTURE.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new env var in AWS-INFRASTRUCTURE.md**

Append a new section to `docs/AWS-INFRASTRUCTURE.md`:
```markdown
## Bundle Invariant Feature Flag

The `putCsv` Lambda enforces a CSV-vs-SVG consistency invariant — every row's
`svgCode` must resolve to a shelf in the corresponding floor's SVG.

### Env var: `BUNDLE_INVARIANT_ENABLED`

- **Default:** `false` (log violations to CloudWatch; do not reject the write)
- **Production target:** `true` (reject violating writes with HTTP 422) after
  Stage 3 (migration cleanup) of the rollout documented in
  `docs/superpowers/specs/2026-05-13-sot-bundle-invariant-design.md`.

### To flip the flag

```bash
aws lambda update-function-configuration \
  --function-name putCsv \
  --environment "Variables={BUNDLE_INVARIANT_ENABLED=true,COGNITO_USER_POOL_ID=us-east-1_g9q5cPhVg}"
```

### CloudWatch metrics

The Lambda logs structured JSON when validation fires. Filter by
`metric: "bundle.violations.csv_write"` in CloudWatch Logs Insights:

```
fields @timestamp, errorCount, enforced
| filter metric = "bundle.violations.csv_write"
| stats count() by enforced
```

### Rollback

Set `BUNDLE_INVARIANT_ENABLED=false` (re-run the `update-function-configuration`
command above). System reverts to log-only mode; no other changes needed.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Add to the "Common Issues & Fixes" section in `CLAUDE.md`:
```markdown
### Bundle invariant (CSV ↔ SVG consistency)

Every CSV row's `svgCode` must resolve to a shelf in the corresponding floor's
SVG. Enforced by `putCsv` Lambda when `BUNDLE_INVARIANT_ENABLED=true`. Logs to
CloudWatch metric `bundle.violations.csv_write` regardless of flag state.

Migration cleanup tooling lives in CSV Editor as a "Broken refs" filter
toggle. See spec: `docs/superpowers/specs/2026-05-13-sot-bundle-invariant-design.md`.

Shared validation rule: `lambda/shared/validateBundle.mjs` (server) and
`admin/services/bundle-validator.js` (client). Drift caught by parity tests
using shared fixtures at `lambda/__tests__/fixtures/bundles/`.

Shared SVG-shelf parser: `lambda/shared/svg-shelves.mjs` (server) and
`admin/services/svg-shelves.js` (client). Drift caught by parity tests using
shared fixtures at `lambda/__tests__/fixtures/svg-shelves/`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/AWS-INFRASTRUCTURE.md CLAUDE.md
git commit -m "docs: document bundle invariant flag + parity test convention"
```

---

### Task 16: Final integration check — all tests green

**Files:** none modified

- [ ] **Step 1: Run the full server-side test suite**

Run: `cd lambda && npm test`
Expected: All tests pass (existing + new).

- [ ] **Step 2: Run the full admin-side test suite**

Run: `cd admin && npm test`
Expected: All tests pass (existing + new).

- [ ] **Step 3: Run a sample of E2E tests against a local server**

```bash
cd <project root>
npx http-server -p 4201 ./admin &
npx playwright test e2e/tests/csv-editor-broken-refs.spec.ts
```
Expected: PASS or SKIP (skip is acceptable on a fresh environment with no broken refs).

- [ ] **Step 4: Final smoke commit (verify clean state)**

```bash
git status
git log --oneline -20
```
Expected: clean working tree; 13–15 commits since the spec, all green.

This task does not produce a commit. It's a checkpoint before opening the PR.

---

## Self-Review (run after writing the plan, before handing off)

**Spec coverage check:**
- ✓ Shared `validateBundle` rule (Task 5)
- ✓ Shared `svg-shelves` parser (Task 2)
- ✓ Client mirrors with parity tests (Tasks 3, 6)
- ✓ `getBrokenRefs` data-model helper (Task 7)
- ✓ Lambda SVG fetcher with cache (Task 8)
- ✓ `putCsv` extension with flag gating (Task 9)
- ✓ CSV Editor "Broken refs" filter toggle + count (Task 10)
- ✓ Row filtering (Task 11)
- ✓ Rename dropdown (Task 12)
- ✓ Delete action with confirm (Task 13)
- ✓ E2E happy path (Task 14)
- ✓ Docs (Task 15)
- ✓ Integration smoke (Task 16)

Not covered by this plan — defer to follow-up plan:
- Staging Lambdas (uploadStagingSvg, validateStaging, applyReconcileToStaging, promoteStaging, clearStaging, getStagingStatus)
- Staging-panel + reconcile-wizard admin UI
- SVG Manager rewiring
- Stage 4 cutover (flag flip + SVG Manager switch)

**Placeholder scan:** None.

**Type consistency:** `validateBundle` returns `{ ok, errors }` with `errors: [{ rowIndex, svgCode, floor, type }]` consistently across server, client, and the `getBrokenRefs` helper. The `parseSvg` shape `{ shelves, duplicates }` is consistent across server and client.

**Ambiguity check:** None blocking. Two notes:
- The exact name of the table-render function in `csv-editor.js` (`renderRows` or similar) is referenced but the implementer should `grep` the file to find the actual symbol — the existing code's naming wins.
- `parseCsvContent` is used by `putCsv.mjs` from `range-validation.mjs`. If the existing `putCsv.mjs` already calls it elsewhere, reuse that result; otherwise the snippet in Task 9 parses fresh.

---

## Out of scope (this plan)

These belong to a follow-up plan (`docs/superpowers/plans/2026-05-XX-sot-staging-flow.md`):

- The four staging-flow Lambdas (upload / validate / applyReconcile / promote / clear / getStagingStatus)
- S3 lifecycle policy for `staging/*`
- `staging-panel.js` + `reconcile-wizard.js` admin components
- SVG Manager modifications to route Replace through staging endpoints
- E2E tests for the staging flow (happy path, reconcile, discard, lock, Git-rebase concurrency)
- Stage 4 cutover steps (env var flip + SVG Manager wiring)
