# #50 Redo — Map Editor auto-refresh after promote (versioned URLs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a staging promote, the Map Editor view re-renders the just-promoted floor map *automatically* — showing the new geometry AND keeping shelves interactive — without a manual page refresh.

**Architecture:** A successful promote dispatches a `svg-promoted` DOM event (carrying `promotedVersions`, whose keys name the changed files). The Map Editor listens, and **only for the currently-displayed floor**, stores a fresh per-floor cache-buster token and re-runs its full `loadFloor()` orchestration. `loadFloor()` fetches `…/maps/floor_N.svg?v=<token>`. A scoped CloudFront `/maps/*` cache behavior keys on the `v` query string, so a never-before-seen `?v=` is a guaranteed cache miss → fresh bytes from S3 origin, bypassing the stale-edge race. Primo NDE (which fetches the bare URL) is unaffected.

**Why this fixes both original defects:** (1) the refresh routes through `loadFloor()` — the full re-render that re-indexes shelves and re-attaches click/hover handlers — instead of the low-level `loadFloorSvg()` raw `innerHTML` swap; (2) the `?v=` token defeats CloudFront's edge cache, which `cache:'no-cache'` could not.

**Tech Stack:** Vanilla JS ES modules (admin SPA), Jest (`--experimental-vm-modules`, run via `npm --prefix admin test`), AWS CloudFront (CLI).

**Branch:** `fix/50-map-editor-refresh` (off `main`). Rollback tag: `pre-50-redo-2026-05-25`.

---

## File Structure

- **Create** `admin/components/map-editor/promote-refresh.js` — pure, testable seam: per-floor cache-buster store, the "did this promote touch floor N" predicate, and the `svg-promoted` listener installer (takes injected `getCurrentFloor`/`reloadFloor`). Isolating this is what makes the fix unit-testable and structurally forces routing through `loadFloor()`.
- **Modify** `admin/components/map-editor/svg-loader.js` — `loadFloorSvg()` gains an optional `cacheBust` arg and appends `?v=`.
- **Modify** `admin/components/map-editor.js` — install the listener at module init; `loadFloor()` passes the stored cache-buster to `loadFloorSvg()`.
- **Modify** `admin/components/svg-manager.js` — re-add the `svg-promoted` dispatch on successful promote (reverted in `ea824d7`).
- **Create** `admin/__tests__/svg-loader-cachebust.test.js`, `admin/__tests__/promote-refresh.test.js`, `admin/__tests__/svg-manager-promote-event.test.js`.
- **Infra (no repo file):** CloudFront distribution `E5SR0E5GM5GSB` — new `/maps/*` cache behavior + a custom cache policy whitelisting `v`.

Test command (all tasks): `npm --prefix admin test -- <pattern>`

---

## Task 1: `loadFloorSvg` supports a cache-buster query

**Files:**
- Modify: `admin/components/map-editor/svg-loader.js:3-27`
- Test: `admin/__tests__/svg-loader-cachebust.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { loadFloorSvg } from '../components/map-editor/svg-loader.js';

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="x"/></svg>';

describe('loadFloorSvg cache-buster', () => {
  let fetchSpy, canvas;
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    canvas = document.getElementById('c');
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: async () => FAKE_SVG });
  });
  afterEach(() => fetchSpy.mockRestore());

  test('appends ?v=<token> when a cacheBust is given', async () => {
    await loadFloorSvg(1, canvas, 'abc123');
    expect(fetchSpy.mock.calls[0][0]).toBe('https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_1.svg?v=abc123');
    expect(fetchSpy.mock.calls[0][1]).toEqual({ cache: 'no-cache' });
  });

  test('omits the query when no cacheBust is given (initial load unchanged)', async () => {
    await loadFloorSvg(2, canvas);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_2.svg');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix admin test -- svg-loader-cachebust`
Expected: FAIL — first test gets a URL without `?v=abc123`.

- [ ] **Step 3: Implement**

In `admin/components/map-editor/svg-loader.js`, change the signature and URL construction:

```js
export async function loadFloorSvg(floorNumber, container, cacheBust) {
  // cache: 'no-cache' revalidates the *browser* cache. It does NOT defeat the
  // CloudFront edge — so right after a promote (when CloudFront still holds the
  // pre-promote object) callers pass a unique `cacheBust` to append ?v=<token>.
  // The /maps/* cache behavior keys on `v`, so a new token is a cache miss and
  // CloudFront fetches fresh from S3. See issue #50 + the 2026-05-25 plan.
  const base = `${CLOUDFRONT_URL}/maps/floor_${floorNumber}.svg`;
  const url = cacheBust ? `${base}?v=${encodeURIComponent(cacheBust)}` : base;
  const resp = await fetch(url, { cache: 'no-cache' });
  if (!resp.ok) {
    container.innerHTML = `<p class="text-red-600 p-4">Could not load floor map.</p>`;
    throw new Error(`SVG load failed: floor ${floorNumber} (${resp.status})`);
  }
  const text = await resp.text();
  const preserved = Array.from(container.children).filter(
    el => el.tagName && el.tagName.toLowerCase() !== 'svg'
  );
  container.innerHTML = text;
  for (const el of preserved) {
    container.appendChild(el);
  }
  return container.querySelector('svg');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix admin test -- svg-loader-cachebust svg-loader`
Expected: PASS (both new tests AND the existing `svg-loader.test.js` no-cache test).

- [ ] **Step 5: Commit**

```bash
git add admin/components/map-editor/svg-loader.js admin/__tests__/svg-loader-cachebust.test.js
git commit -m "feat(#50): loadFloorSvg accepts optional ?v= cache-buster

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `promote-refresh` module (testable seam)

**Files:**
- Create: `admin/components/map-editor/promote-refresh.js`
- Test: `admin/__tests__/promote-refresh.test.js`

- [ ] **Step 1: Write the failing test**

```js
/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import {
  nextCacheBust, floorChangedInPromote, getFloorCacheBust, installPromoteRefreshListener,
} from '../components/map-editor/promote-refresh.js';

function promote(promotedVersions) {
  document.dispatchEvent(new CustomEvent('svg-promoted', { detail: { promotedVersions, ts: Date.now() } }));
}

describe('promote-refresh', () => {
  test('nextCacheBust returns a unique token each call', () => {
    expect(nextCacheBust()).not.toBe(nextCacheBust());
  });

  test('floorChangedInPromote matches floor_<n>.svg case-insensitively', () => {
    expect(floorChangedInPromote({ 'maps/floor_1.svg': 'updated' }, 1)).toBe(true);
    expect(floorChangedInPromote({ 'maps/Floor_1.SVG': 'updated' }, 1)).toBe(true);
    expect(floorChangedInPromote({ 'maps/floor_2.svg': 'updated' }, 1)).toBe(false);
    expect(floorChangedInPromote({ 'data/mapping.csv': 'updated' }, 1)).toBe(false);
    expect(floorChangedInPromote({}, null)).toBe(false);
  });

  test('listener reloads the current floor with a fresh buster when that floor changed', () => {
    const reloadFloor = jest.fn();
    const dispose = installPromoteRefreshListener({ getCurrentFloor: () => 1, reloadFloor });
    promote({ 'maps/floor_1.svg': 'updated' });
    expect(reloadFloor).toHaveBeenCalledWith(1);
    expect(getFloorCacheBust(1)).toBeTruthy();
    dispose();
  });

  test('listener does NOT reload when the promote did not touch the current floor', () => {
    const reloadFloor = jest.fn();
    const dispose = installPromoteRefreshListener({ getCurrentFloor: () => 1, reloadFloor });
    promote({ 'maps/floor_2.svg': 'updated' });
    expect(reloadFloor).not.toHaveBeenCalled();
    dispose();
  });

  test('listener no-ops when Map Editor was never opened (currentFloor null)', () => {
    const reloadFloor = jest.fn();
    const dispose = installPromoteRefreshListener({ getCurrentFloor: () => null, reloadFloor });
    promote({ 'maps/floor_1.svg': 'updated' });
    expect(reloadFloor).not.toHaveBeenCalled();
    dispose();
  });

  test('dispose removes the listener', () => {
    const reloadFloor = jest.fn();
    const dispose = installPromoteRefreshListener({ getCurrentFloor: () => 1, reloadFloor });
    dispose();
    promote({ 'maps/floor_1.svg': 'updated' });
    expect(reloadFloor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix admin test -- promote-refresh`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `admin/components/map-editor/promote-refresh.js`:

```js
// Issue #50 redo. Decides whether a staging promote should refresh the Map
// Editor's current floor, and supplies a unique per-promote cache-buster so the
// refetch bypasses the stale CloudFront edge. Kept as its own module so the
// logic is unit-testable and the refresh is STRUCTURALLY forced through the
// caller's full reload (loadFloor) — not the low-level loadFloorSvg that the
// first #50 attempt used (which dropped shelf interactivity).

let _seq = 0;
const _floorCacheBust = {};

/** Unique token per call (Date.now ms + a monotonic counter for same-ms calls). */
export function nextCacheBust() {
  return `${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

/** The cache-buster currently in effect for a floor, or undefined (initial load). */
export function getFloorCacheBust(floor) {
  return _floorCacheBust[floor];
}

/** Did this promote change the given floor's SVG? Keys look like `maps/floor_1.svg`. */
export function floorChangedInPromote(promotedVersions, floor) {
  if (!promotedVersions || floor == null) return false;
  const suffix = `floor_${floor}.svg`.toLowerCase();
  return Object.keys(promotedVersions).some(k => k.toLowerCase().endsWith(suffix));
}

/**
 * Install the 'svg-promoted' listener.
 * @param {{ getCurrentFloor: () => (number|string|null), reloadFloor: (floor) => any }} deps
 * @returns {() => void} dispose
 */
export function installPromoteRefreshListener({ getCurrentFloor, reloadFloor }) {
  const handler = (e) => {
    const floor = getCurrentFloor();
    if (floor == null) return; // Map Editor never opened — nothing to refresh.
    const promotedVersions = (e.detail && e.detail.promotedVersions) || {};
    if (!floorChangedInPromote(promotedVersions, floor)) return;
    _floorCacheBust[floor] = nextCacheBust();
    reloadFloor(floor);
  };
  document.addEventListener('svg-promoted', handler);
  return () => document.removeEventListener('svg-promoted', handler);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix admin test -- promote-refresh`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add admin/components/map-editor/promote-refresh.js admin/__tests__/promote-refresh.test.js
git commit -m "feat(#50): promote-refresh module — per-floor cache-buster + listener seam

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire `promote-refresh` into the Map Editor

**Files:**
- Modify: `admin/components/map-editor.js` (import; `loadFloor` at :245-248; module-init listener near :303)

This task is wiring between already-tested units; verify by the unit tests above plus the manual end-to-end in Task 6 (`loadFloor` is private and pulls in DOM + ranges state, so it is exercised manually, not unit-mounted).

- [ ] **Step 1: Add the import**

At the top of `admin/components/map-editor.js`, alongside the existing `svg-loader.js` import (line ~5), add:

```js
import { installPromoteRefreshListener, getFloorCacheBust } from './map-editor/promote-refresh.js?v=1';
```

(The `?v=N` suffix matches this codebase's existing module-import convention — see the `svg-loader.js?v=2` import.)

- [ ] **Step 2: Pass the cache-buster from `loadFloor`**

In `loadFloor()` (line ~248), change the `loadFloorSvg` call to pass the stored buster for this floor:

```js
  const svgRoot = await loadFloorSvg(floorNumber, canvas, getFloorCacheBust(floorNumber));
```

- [ ] **Step 3: Install the listener at module init**

Immediately after the existing `window.addEventListener('mapeditor:floor-changed', e => loadFloor(e.detail.floor));` line (~303), add:

```js
// Issue #50 redo: a successful staging promote (svg-manager dispatches
// 'svg-promoted') re-runs the FULL loadFloor for the current floor with a fresh
// cache-buster, so the map shows the new bytes and stays interactive without a
// page refresh. No-ops until a floor has been displayed (currentFloor null).
installPromoteRefreshListener({
  getCurrentFloor: () => currentFloor,
  reloadFloor: (floor) => loadFloor(floor),
});
```

- [ ] **Step 4: Verify the existing suites still pass**

Run: `npm --prefix admin test -- map-editor svg-loader promote-refresh`
Expected: PASS, no new failures. (If a `map-editor` suite exists it must still pass; the import addition must not break module load.)

- [ ] **Step 5: Commit**

```bash
git add admin/components/map-editor.js
git commit -m "feat(#50): route promote refresh through loadFloor with per-floor cache-buster

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Re-add the `svg-promoted` dispatch (producer)

**Files:**
- Modify: `admin/components/svg-manager.js` (promote handler, ~line 226-273)
- Test: `admin/__tests__/svg-manager-promote-event.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
/** @jest-environment jsdom */
import { jest } from '@jest/globals';

function seed() { document.body.innerHTML = '<div id="svg-manager"></div><div id="toast-container"></div>'; }
const flush = () => new Promise(r => setTimeout(r, 0));

describe('#50 producer — svg-manager dispatches svg-promoted', () => {
  let fetchSpy;
  beforeEach(() => { jest.resetModules(); window.__USE_STAGING_FLOW__ = true; });
  afterEach(() => { fetchSpy?.mockRestore(); delete window.__USE_STAGING_FLOW__; });

  async function run({ promoteOk, promoteJson }) {
    seed();
    const statusGreen = { locked: true, owner: 'unknown', files: ['maps/floor_1.svg'],
      lastValidated: { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } } };
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
      const u = typeof url === 'string' ? url : '';
      if (u.includes('/api/svg') && (!opts.method || opts.method === 'GET'))
        return { ok: true, json: async () => ({ success: true, files: [] }) };
      if (u.includes('/api/staging/status')) return { ok: true, json: async () => statusGreen };
      if (u.includes('/api/staging/promote')) return { ok: promoteOk, status: promoteOk ? 200 : 422, json: async () => promoteJson };
      return { ok: true, json: async () => ({}) };
    });
    const mod = await import('../components/svg-manager.js');
    mod.initSVGManager();
    for (let i = 0; i < 8; i++) await flush();
    document.querySelector('[data-action="promote-staging"]').click();
    for (let i = 0; i < 8; i++) await flush();
  }

  test('dispatches svg-promoted with promotedVersions on a 200 promote', async () => {
    const events = [];
    const listener = e => events.push(e);
    document.addEventListener('svg-promoted', listener);
    try {
      await run({ promoteOk: true, promoteJson: { ok: true, promotedVersions: { 'maps/floor_1.svg': 'updated' } } });
      expect(events).toHaveLength(1);
      expect(events[0].detail).toHaveProperty('promotedVersions');
      expect(events[0].detail.promotedVersions).toEqual({ 'maps/floor_1.svg': 'updated' });
      expect(typeof events[0].detail.ts).toBe('number');
    } finally { document.removeEventListener('svg-promoted', listener); }
  });

  test('does NOT dispatch on a non-2xx promote', async () => {
    const events = [];
    const listener = e => events.push(e);
    document.addEventListener('svg-promoted', listener);
    try {
      await run({ promoteOk: false, promoteJson: { error: 'boom' } });
      expect(events).toHaveLength(0);
    } finally { document.removeEventListener('svg-promoted', listener); }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix admin test -- svg-manager-promote-event`
Expected: FAIL — no `svg-promoted` event fires (dispatch was reverted in `ea824d7`).

- [ ] **Step 3: Implement**

In `admin/components/svg-manager.js`, inside the `promote-staging` click handler, replace the success block (currently `sequence.setStep('validating'); await refreshStagingPanel(); sequence.setStep('refreshing'); await loadFiles(); showToast(t('svg.staging.promoted'));`) with the version that captures `promotedVersions` and dispatches the event:

```js
      // Capture promotedVersions BEFORE the panel refresh — its KEYS name the
      // production files that changed, which map-editor uses to decide whether
      // to refresh the current floor (issue #50). Value is a placeholder; the
      // consumer generates its own cache-buster.
      let promotedVersions = {};
      try {
        const body = await resp.json();
        promotedVersions = body?.promotedVersions || {};
      } catch (_) {
        // Tolerate missing/non-JSON body — dispatch still goes out (empty map).
      }
      sequence.setStep('validating');
      await refreshStagingPanel();
      sequence.setStep('refreshing');
      await loadFiles();
      showToast(t('svg.staging.promoted'));
      // Issue #50: tell the Map Editor production SVG bytes changed so it can
      // re-render the affected floor. Dispatched only on a successful promote
      // (the !resp.ok branch returns early above).
      document.dispatchEvent(new CustomEvent('svg-promoted', {
        detail: { promotedVersions, ts: Date.now() },
      }));
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix admin test -- svg-manager-promote-event svg-manager staging-progress-modal`
Expected: PASS (new producer tests + existing svg-manager + modal suites unaffected).

- [ ] **Step 5: Commit**

```bash
git add admin/components/svg-manager.js admin/__tests__/svg-manager-promote-event.test.js
git commit -m "feat(#50): re-dispatch svg-promoted on successful promote (producer)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: CloudFront `/maps/*` behavior keyed on `v` (infra)

**Goal:** Make a `?v=<token>` produce a distinct cache key for `/maps/*` so a new token forces a fresh origin fetch — while the bare `…/floor_N.svg` URL (Primo NDE) keeps working and keeps its CORS headers.

> ⚠️ This edits the **public** distribution. Preserve the existing default behavior's origin, viewer-protocol, allowed methods, and **Response Headers Policy** (`Managed-CORS-With-Preflight`, `5cc3b908-e619-4b99-88e5-2cf7f45965bd`). The safe method below **clones the default behavior** and changes only `PathPattern` + `CachePolicyId`, so CORS/methods are inherited verbatim. Distribution ID: `E5SR0E5GM5GSB`.

- [ ] **Step 1: Create the custom cache policy (whitelist `v`)**

```bash
cat > /tmp/maps-cache-policy.json <<'EOF'
{
  "Name": "primo-maps-versioned-v",
  "Comment": "maps/* : key on the v query string so ?v=<promoteToken> busts the edge (issue #50)",
  "DefaultTTL": 86400,
  "MaxTTL": 31536000,
  "MinTTL": 1,
  "ParametersInCacheKeyAndForwardedToOrigin": {
    "EnableAcceptEncodingGzip": true,
    "EnableAcceptEncodingBrotli": true,
    "HeadersConfig": { "HeaderBehavior": "none" },
    "CookiesConfig": { "CookieBehavior": "none" },
    "QueryStringsConfig": {
      "QueryStringBehavior": "whitelist",
      "QueryStrings": { "Quantity": 1, "Items": ["v"] }
    }
  }
}
EOF
NEW_POLICY_ID=$(aws cloudfront create-cache-policy --cache-policy-config file:///tmp/maps-cache-policy.json --query 'CachePolicy.Id' --output text)
echo "NEW_POLICY_ID=$NEW_POLICY_ID"
```

Expected: prints a new policy id (UUID).

- [ ] **Step 2: Fetch the distribution config + ETag, build the updated config**

```bash
aws cloudfront get-distribution-config --id E5SR0E5GM5GSB > /tmp/dist.json
ETAG=$(python3 -c "import json;print(json.load(open('/tmp/dist.json'))['ETag'])")
echo "ETAG=$ETAG"

# Clone DefaultCacheBehavior -> a new /maps/* behavior, swap only PathPattern + CachePolicyId.
NEW_POLICY_ID="$NEW_POLICY_ID" python3 - <<'PY'
import json, os
d = json.load(open('/tmp/dist.json'))
cfg = d['DistributionConfig']
default = cfg['DerivedFromDefault'] if False else cfg['DefaultCacheBehavior']
import copy
beh = copy.deepcopy(default)
beh['PathPattern'] = '/maps/*'
beh['CachePolicyId'] = os.environ['NEW_POLICY_ID']
beh.pop('DefaultTTL', None); beh.pop('MinTTL', None); beh.pop('MaxTTL', None)  # managed via cache policy
cbs = cfg.setdefault('CacheBehaviors', {'Quantity': 0, 'Items': []})
cbs.setdefault('Items', [])
# Idempotent: replace if a /maps/* behavior already exists.
cbs['Items'] = [b for b in cbs['Items'] if b.get('PathPattern') != '/maps/*']
cbs['Items'].insert(0, beh)
cbs['Quantity'] = len(cbs['Items'])
json.dump(cfg, open('/tmp/dist-updated.json', 'w'), indent=2)
print('behaviors now:', [b.get('PathPattern') for b in cbs['Items']])
print('maps/* CachePolicyId:', beh['CachePolicyId'])
print('maps/* ResponseHeadersPolicyId:', beh.get('ResponseHeadersPolicyId'))
print('maps/* AllowedMethods:', beh.get('AllowedMethods', {}).get('Items'))
PY
```

Expected: prints `behaviors now: ['/maps/*']`, a non-null `ResponseHeadersPolicyId` (CORS preserved), and AllowedMethods including `OPTIONS`.

- [ ] **Step 3: Apply the update**

```bash
aws cloudfront update-distribution \
  --id E5SR0E5GM5GSB \
  --distribution-config file:///tmp/dist-updated.json \
  --if-match "$ETAG" \
  --query 'Distribution.Status' --output text
```

Expected: `InProgress`. Wait for `Deployed`:
```bash
aws cloudfront wait distribution-deployed --id E5SR0E5GM5GSB && echo DEPLOYED
```

- [ ] **Step 4: Verify versioned vs bare behavior**

```bash
B=https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_1.svg
# Bare URL (Primo path) still 200 + CORS header present:
curl -s -o /dev/null -w "bare: %{http_code}\n" "$B"
curl -s -I "$B" | grep -i "access-control-allow-origin" && echo "CORS ok on bare"
# Two distinct ?v= values must each return 200 (distinct cache keys):
curl -s -o /dev/null -w "v=aaa: %{http_code}\n" "$B?v=aaa"
curl -s -o /dev/null -w "v=bbb: %{http_code}\n" "$B?v=bbb"
```

Expected: all `200`; CORS header present on the bare URL. (Behavioral confirmation that `?v=` is accepted and the bare URL is unaffected.)

- [ ] **Step 5: Record the change**

Append the new cache policy id + the `/maps/*` behavior to `docs/AWS-INFRASTRUCTURE.md` (CloudFront section), and commit:

```bash
git add docs/AWS-INFRASTRUCTURE.md
git commit -m "docs(infra): record /maps/* versioned cache behavior for #50

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Rollback for this task:** re-run Steps 2–3 from the saved `/tmp/dist.json` (the pre-change config) with a fresh ETag to remove the `/maps/*` behavior; optionally `aws cloudfront delete-cache-policy --id "$NEW_POLICY_ID" --if-match <policy ETag>`.

---

## Task 6: Deploy + manual end-to-end verification

**Files:** none (deploy + verify).

- [ ] **Step 1: Deploy the SPA**

CloudFront `/maps/*` (Task 5) must already be `Deployed`. Then:
```bash
bash redeploy.sh   # admin SPA + CloudFront /admin/* invalidation
```

- [ ] **Step 2: Manual verification via the QA dashboard**

Reuse the bridge in `docs/manual-qa/` (`python3 docs/manual-qa/qa-server.py`, open http://localhost:8765/). With the Map Editor open on floor 1 and DevTools → Network filtered to `floor_1`:
  - Add a visible test shelf to a local `floor_1.svg`, Replace + Promote it.
  - **At promote success**, confirm an automatic `GET …/maps/floor_1.svg?v=<token>` returns **200** and the **new shelf appears in the Map Editor with no hard refresh**.
  - **Click the new shelf / an existing shelf** → confirm it is still **interactive** (drawer opens) — proves the refresh went through `loadFloor()`.
  - Revert (promote the original) → confirm the shelf disappears automatically.

- [ ] **Step 3: Confirm Primo path unaffected**

```bash
curl -s "https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_1.svg" | head -c 80; echo
```
Expected: serves the current map over the bare URL (Primo NDE fetch path), CORS intact.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin fix/50-map-editor-refresh
gh pr create --title "fix(#50): Map Editor auto-refresh after promote (versioned URLs)" \
  --body-file <(printf '%s\n' "## Summary" "- Routes the post-promote refresh through map-editor loadFloor() (re-renders + re-wires interactivity), not low-level loadFloorSvg." "- Adds a per-floor ?v=<token> cache-buster + a scoped CloudFront /maps/* cache behavior keyed on v, defeating the stale-edge race that broke the first #50 attempt." "- Primo NDE unaffected (it fetches the bare URL)." "" "Closes #50.")
```

> Note: GitHub auto-closes #50 from this PR's commit/PR keywords on merge — intended this time.

---

## Self-Review

- **Spec coverage:** routing through `loadFloor()` (Task 3) ✓; cache-buster URL (Task 1) ✓; decide-which-floor + token (Task 2) ✓; producer dispatch (Task 4) ✓; CloudFront keys on `v` (Task 5) ✓; Primo unaffected (Tasks 5–6 verification) ✓; manual e2e that caught the original bug (Task 6) ✓.
- **No Lambda change:** confirmed — `promoteStaging` already returns `promotedVersions` keys; the client generates the cache-buster, so no Lambda redeploy/deploy-gate.
- **Type/name consistency:** `nextCacheBust`, `getFloorCacheBust`, `floorChangedInPromote`, `installPromoteRefreshListener` used identically in Tasks 2 & 3; `loadFloorSvg(floorNumber, container, cacheBust)` signature consistent across Tasks 1 & 3.
- **Ordering:** Task 5 (CloudFront) deploys before/with the SPA (Task 6) so `?v=` is honored; client change is harmless if Task 5 lags (extra ignored query param).
