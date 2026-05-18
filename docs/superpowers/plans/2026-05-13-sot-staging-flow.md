# SoT Bundle Invariant — Staging Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the staged SVG-replace flow (upload → validate → optional reconcile wizard → promote) plus the Stage 4 cutover. Depends on the foundation plan (`2026-05-13-sot-bundle-invariant-foundation.md`) being merged first — uses the shared `validateBundle` and `svg-shelves` modules it produces.

**Architecture:** Six new Lambda endpoints under `lambda/` for the staging lifecycle. One S3 lifecycle policy for 7-day cleanup. Two new admin components (`staging-panel.js`, `reconcile-wizard.js`) under `svg-manager/`. SVG Manager modified to surface staging UI and route Replace through the new endpoints. Cutover task flips `BUNDLE_INVARIANT_ENABLED` and switches SVG Manager to use staging endpoints by default.

**Tech Stack:** Same as the foundation plan — Node.js ES modules (Lambda `.mjs`), vanilla JS ES modules (admin), Jest with `--experimental-vm-modules`, jsdom for admin tests, `aws-sdk-client-mock` for Lambda S3 mocks, Playwright for E2E.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `lambda/uploadStagingSvg.mjs` | Accept a new SVG, write to `staging/maps/floor_N.svg`, acquire lock |
| `lambda/validateStaging.mjs` | Fetch staging + unchanged prod files; run `validateBundle`; return report |
| `lambda/applyReconcileToStaging.mjs` | Apply a `reconcileMap` to staging CSV (copy from prod if absent) |
| `lambda/promoteStaging.mjs` | Re-validate; copy `staging/*` → prod paths; invalidate CDN; clear staging |
| `lambda/clearStaging.mjs` | Delete `staging/*` and release lock |
| `lambda/getStagingStatus.mjs` | Return `{ locked, owner, files, lastValidated, summary }` |
| `lambda/shared/staging-meta.mjs` | Shared helpers for `staging/.meta.json` (lock acquire/release/read) |
| `lambda/__tests__/uploadStagingSvg.test.mjs` | Unit tests |
| `lambda/__tests__/validateStaging.test.mjs` | Unit tests |
| `lambda/__tests__/applyReconcileToStaging.test.mjs` | Unit tests |
| `lambda/__tests__/promoteStaging.test.mjs` | Unit tests |
| `lambda/__tests__/clearStaging.test.mjs` | Unit tests |
| `lambda/__tests__/getStagingStatus.test.mjs` | Unit tests |
| `lambda/__tests__/shared/staging-meta.test.mjs` | Unit tests |
| `admin/components/svg-manager/staging-panel.js` | Staging panel UI inside SVG Manager |
| `admin/components/svg-manager/reconcile-wizard.js` | Interactive reconcile dialog |
| `admin/__tests__/staging-panel.test.js` | Unit tests |
| `admin/__tests__/reconcile-wizard.test.js` | Unit tests |
| `e2e/tests/sot-staging.spec.ts` | E2E flows: happy path, reconcile, discard, lock, Git-rebase race |

### Modified files

| Path | Change |
|---|---|
| `admin/components/svg-manager.js` | Surface staging panel; route Replace button through `uploadStagingSvg` instead of the legacy direct PUT |
| `admin/services/data-model.js` | Add `applyReconcileMap(rows, map, floor)` pure helper |
| `docs/AWS-INFRASTRUCTURE.md` | Document staging prefix + lifecycle policy + new endpoints |

### Infrastructure changes

- New S3 lifecycle rule: delete objects under `staging/*` older than 7 days.
- API Gateway: 6 new routes (one per Lambda) under `/api/staging/...`.
- Lambda env var `BUNDLE_INVARIANT_ENABLED` flipped to `true` (Task 16).

---

## Task Decomposition

Phase D — Staging Lambdas (Tasks 1–8)
Phase E — Admin staging UI (Tasks 9–13)
Phase F — Cutover (Tasks 14–16)

---

### Task 1: Shared staging-meta helpers (lock + status file)

**Files:**
- Create: `lambda/shared/staging-meta.mjs`
- Create: `lambda/__tests__/shared/staging-meta.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lambda/__tests__/shared/staging-meta.test.mjs`:
```javascript
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import {
  readMeta,
  acquireLock,
  releaseLock,
  recordValidation,
  recordFile,
} from '../../shared/staging-meta.mjs';

const s3Mock = mockClient(S3Client);
const BUCKET = 'test-bucket';

function streamFromString(s) {
  return { Body: Readable.from([Buffer.from(s)]) };
}

describe('staging-meta', () => {
  beforeEach(() => s3Mock.reset());

  test('readMeta returns empty state when .meta.json does not exist', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    const meta = await readMeta(BUCKET);
    expect(meta).toEqual({ locked: false, owner: null, files: [], lastValidated: null });
  });

  test('acquireLock succeeds when no lock exists', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(PutObjectCommand).resolves({});
    const result = await acquireLock(BUCKET, 'alice');
    expect(result.acquired).toBe(true);
    expect(result.meta.owner).toBe('alice');
    expect(result.meta.locked).toBe(true);
  });

  test('acquireLock fails when lock is held by someone else', async () => {
    const existing = JSON.stringify({ locked: true, owner: 'bob', acquiredAt: '2026-05-13T10:00:00Z', files: [] });
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(streamFromString(existing));
    const result = await acquireLock(BUCKET, 'alice');
    expect(result.acquired).toBe(false);
    expect(result.heldBy).toBe('bob');
  });

  test('acquireLock succeeds when same user re-acquires (idempotent)', async () => {
    const existing = JSON.stringify({ locked: true, owner: 'alice', acquiredAt: '2026-05-13T10:00:00Z', files: [] });
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(streamFromString(existing));
    s3Mock.on(PutObjectCommand).resolves({});
    const result = await acquireLock(BUCKET, 'alice');
    expect(result.acquired).toBe(true);
  });

  test('releaseLock writes an empty meta', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await releaseLock(BUCKET);
    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls.length).toBe(1);
    const body = JSON.parse(putCalls[0].args[0].input.Body);
    expect(body.locked).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- shared/staging-meta.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `staging-meta.mjs`**

Write `lambda/shared/staging-meta.mjs`:
```javascript
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });
const META_KEY = 'staging/.meta.json';

/**
 * Read the staging meta file. Returns an empty-state object if it does not exist.
 *
 * @param {string} bucket
 * @returns {Promise<{locked: boolean, owner: string|null, files: string[], lastValidated: object|null}>}
 */
export async function readMeta(bucket) {
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: META_KEY }));
    const body = await streamToString(resp.Body);
    return JSON.parse(body);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      return { locked: false, owner: null, files: [], lastValidated: null };
    }
    throw err;
  }
}

/**
 * Attempt to acquire the staging lock for the given user. Idempotent when the
 * caller already owns the lock. Fails when someone else owns it.
 *
 * @param {string} bucket
 * @param {string} user
 * @returns {Promise<{acquired: boolean, meta?: object, heldBy?: string}>}
 */
export async function acquireLock(bucket, user) {
  const meta = await readMeta(bucket);
  if (meta.locked && meta.owner !== user) {
    return { acquired: false, heldBy: meta.owner };
  }
  const next = {
    ...meta,
    locked: true,
    owner: user,
    acquiredAt: meta.acquiredAt || new Date().toISOString(),
  };
  await writeMeta(bucket, next);
  return { acquired: true, meta: next };
}

/**
 * Release the staging lock unconditionally. (No ownership check at this layer;
 * the caller — promoteStaging / clearStaging — is responsible for owning the
 * lock before calling.)
 *
 * @param {string} bucket
 */
export async function releaseLock(bucket) {
  await writeMeta(bucket, { locked: false, owner: null, files: [], lastValidated: null });
}

/**
 * Record the result of a validation pass in the meta file (so getStagingStatus
 * can return it without re-running validation).
 *
 * @param {string} bucket
 * @param {object} validation  Shape: { ok: boolean, errors: [], summary: {} }
 */
export async function recordValidation(bucket, validation) {
  const meta = await readMeta(bucket);
  meta.lastValidated = { ...validation, at: new Date().toISOString() };
  await writeMeta(bucket, meta);
}

/**
 * Record that a file is now part of the staging area.
 *
 * @param {string} bucket
 * @param {string} file  e.g. "maps/floor_1.svg" or "data/mapping.csv"
 */
export async function recordFile(bucket, file) {
  const meta = await readMeta(bucket);
  meta.files = Array.from(new Set([...(meta.files || []), file]));
  await writeMeta(bucket, meta);
}

async function writeMeta(bucket, meta) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: META_KEY,
    Body: JSON.stringify(meta, null, 2),
    ContentType: 'application/json',
  }));
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- shared/staging-meta.test.mjs`
Expected: PASS for all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lambda/shared/staging-meta.mjs lambda/__tests__/shared/staging-meta.test.mjs
git commit -m "feat(lambda): add staging-meta helpers (lock + status)"
```

---

### Task 2: `uploadStagingSvg` Lambda

**Files:**
- Create: `lambda/uploadStagingSvg.mjs`
- Create: `lambda/__tests__/uploadStagingSvg.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lambda/__tests__/uploadStagingSvg.test.mjs`:
```javascript
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event({ floor = 1, svgBase64, user = 'alice' } = {}) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    body: JSON.stringify({ floor, svgBase64 }),
    requestContext: { authorizer: { claims: { sub: user, 'cognito:groups': 'admin' } } },
  };
}

describe('uploadStagingSvg', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ valid: true, claims: { sub: 'alice', 'cognito:groups': ['admin'] } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(PutObjectCommand).resolves({});

    ({ handler } = await import('../uploadStagingSvg.mjs'));
  });

  test('writes SVG to staging/maps/floor_N.svg, acquires lock', async () => {
    const svg = '<svg><rect id="CB_0" data-map-object="shelf"/></svg>';
    const resp = await handler(event({ floor: 1, svgBase64: Buffer.from(svg).toString('base64') }));
    expect(resp.statusCode).toBe(200);

    const puts = s3Mock.commandCalls(PutObjectCommand);
    const svgPut = puts.find(c => c.args[0].input.Key === 'staging/maps/floor_1.svg');
    expect(svgPut).toBeDefined();

    const metaPut = puts.find(c => c.args[0].input.Key === 'staging/.meta.json');
    expect(metaPut).toBeDefined();
    const meta = JSON.parse(metaPut.args[0].input.Body);
    expect(meta.locked).toBe(true);
    expect(meta.owner).toBe('alice');
  });

  test('rejects 423 if lock is held by another user', async () => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'bob' }))
    );
    s3Mock.on(PutObjectCommand).resolves({});

    const svg = '<svg/>';
    const resp = await handler(event({ floor: 1, svgBase64: Buffer.from(svg).toString('base64') }));
    expect(resp.statusCode).toBe(423);
    const body = JSON.parse(resp.body);
    expect(body.heldBy).toBe('bob');
  });

  test('rejects 400 for malformed SVG', async () => {
    const malformed = '<svg><rect unclosed';  // missing close tag
    const resp = await handler(event({ floor: 1, svgBase64: Buffer.from(malformed).toString('base64') }));
    expect(resp.statusCode).toBe(400);
    expect(JSON.parse(resp.body).error).toMatch(/parse/i);
  });

  test('rejects 400 for SVG with zero shelves found', async () => {
    const noShelves = '<svg><rect id="not-a-shelf"/></svg>';
    const resp = await handler(event({ floor: 1, svgBase64: Buffer.from(noShelves).toString('base64') }));
    expect(resp.statusCode).toBe(400);
    expect(JSON.parse(resp.body).error).toMatch(/no shelves/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- uploadStagingSvg.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `uploadStagingSvg.mjs`**

Write `lambda/uploadStagingSvg.mjs`:
```javascript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { parseSvg } from './shared/svg-shelves.mjs';
import { acquireLock, recordFile } from './shared/staging-meta.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const authResult = await validateToken(event);
  if (!authResult.valid) {
    return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  }
  const permission = checkPermission(authResult.claims, 'admin');
  if (!permission.allowed) {
    return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);
  }

  const user = authResult.claims.sub;
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return createAuthResponse(400, { error: 'Invalid JSON body' }, CORS_HEADERS);
  }

  const { floor, svgBase64 } = body;
  if (![0, 1, 2].includes(Number(floor))) {
    return createAuthResponse(400, { error: 'floor must be 0, 1, or 2' }, CORS_HEADERS);
  }
  if (!svgBase64 || typeof svgBase64 !== 'string') {
    return createAuthResponse(400, { error: 'svgBase64 is required' }, CORS_HEADERS);
  }

  let svgString;
  try {
    svgString = Buffer.from(svgBase64, 'base64').toString('utf-8');
  } catch {
    return createAuthResponse(400, { error: 'svgBase64 is not valid base64' }, CORS_HEADERS);
  }

  // Parse and validate the SVG
  let parsed;
  try {
    parsed = parseSvg(svgString);
  } catch (err) {
    return createAuthResponse(400, { error: 'Could not parse SVG', detail: err.message }, CORS_HEADERS);
  }
  if (parsed.shelves.length === 0) {
    return createAuthResponse(400, { error: 'No shelves found in uploaded SVG' }, CORS_HEADERS);
  }
  if (parsed.duplicates.length > 0) {
    return createAuthResponse(400, { error: 'Duplicate shelf IDs', ids: parsed.duplicates }, CORS_HEADERS);
  }

  // Acquire the lock
  const lock = await acquireLock(BUCKET, user);
  if (!lock.acquired) {
    return createAuthResponse(423, {
      error: `Staging in use by ${lock.heldBy}`,
      heldBy: lock.heldBy,
    }, CORS_HEADERS);
  }

  // Write the SVG to staging
  const key = `staging/maps/floor_${floor}.svg`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: svgString,
    ContentType: 'image/svg+xml',
  }));
  await recordFile(BUCKET, `maps/floor_${floor}.svg`);

  return createAuthResponse(200, {
    ok: true,
    staged: key,
    shelves: parsed.shelves,
    meta: lock.meta,
  }, CORS_HEADERS);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- uploadStagingSvg.test.mjs`
Expected: PASS for all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lambda/uploadStagingSvg.mjs lambda/__tests__/uploadStagingSvg.test.mjs
git commit -m "feat(lambda): add uploadStagingSvg endpoint"
```

---

### Task 3: `validateStaging` Lambda

**Files:**
- Create: `lambda/validateStaging.mjs`
- Create: `lambda/__tests__/validateStaging.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lambda/__tests__/validateStaging.test.mjs`:
```javascript
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event() {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    body: '{}',
  };
}

describe('validateStaging', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ valid: true, claims: { sub: 'alice', 'cognito:groups': ['admin'] } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));
    s3Mock.on(PutObjectCommand).resolves({});

    ({ handler } = await import('../validateStaging.mjs'));
  });

  test('returns ok:true when staged SVG is consistent with prod CSV', async () => {
    // staged: floor 1 SVG with CC_X
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_X" data-map-object="shelf"/></svg>')
    );
    // floors 0 and 2 have no staged SVG — fall back to prod (aws-sdk-client-mock v4 returns undefined for unmocked calls, not NoSuchKey, so we must reject explicitly to exercise fetchObjectOrFallback)
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    // unchanged prod files
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'alice', files: ['maps/floor_1.svg'] }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(true);
    expect(body.errors).toEqual([]);
  });

  test('returns ok:false when staged SVG breaks an existing CSV ref', async () => {
    // staged floor 1 SVG no longer has CC_X
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_NEW" data-map-object="shelf"/></svg>')
    );
    // floors 0 and 2 have no staged SVG — fall back to prod (aws-sdk-client-mock v4 returns undefined for unmocked calls, not NoSuchKey, so we must reject explicitly to exercise fetchObjectOrFallback)
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'alice', files: ['maps/floor_1.svg'] }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(false);
    expect(body.errors[0]).toMatchObject({ svgCode: 'CC_X', floor: 1, type: 'shelf-not-found' });
    expect(body.summary.removedRefs).toEqual([{ svgCode: 'CC_X', floor: 1, affectedRowCount: 1 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- validateStaging.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `validateStaging.mjs`**

Write `lambda/validateStaging.mjs`:
```javascript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { parseSvg } from './shared/svg-shelves.mjs';
import { validateBundle } from './shared/validateBundle.mjs';
import { readMeta, recordValidation } from './shared/staging-meta.mjs';
import { parseCsvContent } from './range-validation.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const authResult = await validateToken(event);
  if (!authResult.valid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.claims, 'admin');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const meta = await readMeta(BUCKET);
  if (!meta.locked) {
    return createAuthResponse(409, { error: 'No staging area is currently active' }, CORS_HEADERS);
  }

  // Fetch each floor SVG: staged if present, otherwise production
  const svgShelfIdsByFloor = {};
  for (const floor of [0, 1, 2]) {
    const stagedKey = `staging/maps/floor_${floor}.svg`;
    const prodKey = `maps/floor_${floor}.svg`;
    const svg = await fetchObjectOrFallback(stagedKey, prodKey);
    const { shelves } = parseSvg(svg);
    svgShelfIdsByFloor[floor] = new Set(shelves);
  }

  // Fetch CSV: staged if present, otherwise production
  const csvString = await fetchObjectOrFallback('staging/data/mapping.csv', 'data/mapping.csv');
  const { rows } = parseCsvContent(csvString);

  const csvRowsForValidation = rows.map((row, idx) => ({
    rowIndex: idx,
    svgCode: String(row.svgCode || ''),
    floor: Number(row.floor),
  }));
  const result = validateBundle(csvRowsForValidation, svgShelfIdsByFloor);

  // Compute summary diff vs production (informational)
  const { rows: prodCsvRows } = parseCsvContent(await fetchObject('data/mapping.csv'));
  const prodRefsByFloor = {};
  for (const r of prodCsvRows) {
    const f = Number(r.floor);
    prodRefsByFloor[f] = prodRefsByFloor[f] || new Set();
    prodRefsByFloor[f].add(String(r.svgCode));
  }

  const removedRefs = [];
  const addedShelves = [];
  for (const floor of [0, 1, 2]) {
    const prodRefs = prodRefsByFloor[floor] || new Set();
    const stagedShelves = svgShelfIdsByFloor[floor];
    for (const ref of prodRefs) {
      if (!stagedShelves.has(ref)) {
        const affectedRowCount = prodCsvRows.filter(r => Number(r.floor) === floor && String(r.svgCode) === ref).length;
        removedRefs.push({ svgCode: ref, floor, affectedRowCount });
      }
    }
    for (const id of stagedShelves) {
      if (!prodRefs.has(id)) addedShelves.push({ svgCode: id, floor });
    }
  }

  const summary = { addedShelves, removedRefs };
  await recordValidation(BUCKET, { ok: result.ok, errors: result.errors, summary });

  return createAuthResponse(200, {
    ok: result.ok,
    errors: result.errors,
    summary,
  }, CORS_HEADERS);
};

async function fetchObject(key) {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return streamToString(resp.Body);
}

async function fetchObjectOrFallback(primaryKey, fallbackKey) {
  try {
    return await fetchObject(primaryKey);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      return await fetchObject(fallbackKey);
    }
    throw err;
  }
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- validateStaging.test.mjs`
Expected: PASS for both tests.

- [ ] **Step 5: Commit**

```bash
git add lambda/validateStaging.mjs lambda/__tests__/validateStaging.test.mjs
git commit -m "feat(lambda): add validateStaging endpoint"
```

---

### Task 4: `applyReconcileToStaging` Lambda

**Files:**
- Create: `lambda/applyReconcileToStaging.mjs`
- Create: `lambda/__tests__/applyReconcileToStaging.test.mjs`
- Modify: `admin/services/data-model.js` (add `applyReconcileMap` helper)

- [ ] **Step 1: Write the failing test for the Lambda**

Write `lambda/__tests__/applyReconcileToStaging.test.mjs`:
```javascript
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event(body) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    body: JSON.stringify(body),
  };
}

describe('applyReconcileToStaging', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ valid: true, claims: { sub: 'alice', 'cognito:groups': ['admin'] } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'alice', files: ['maps/floor_1.svg'] }))
    );
    s3Mock.on(PutObjectCommand).resolves({});

    ({ handler } = await import('../applyReconcileToStaging.mjs'));
  });

  test('rename action rewrites svgCode on affected rows', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
`)
    );

    const resp = await handler(event({
      floor: 1,
      reconcileMap: {
        'CC_X': { action: 'rename', to: 'CC_NEW' },
      },
    }));
    expect(resp.statusCode).toBe(200);
    expect(JSON.parse(resp.body).affectedRows).toBe(1);

    const csvPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/data/mapping.csv');
    expect(csvPut).toBeDefined();
    const csvBody = csvPut.args[0].input.Body;
    expect(csvBody).toContain('CC_NEW');
    expect(csvBody).not.toContain('CC_X,');  // CC_X line gone
    expect(csvBody).toContain('CB_0');       // floor 0 row untouched
  });

  test('delete action removes affected rows (floor-scoped)', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,0,,,,
`)
    );

    const resp = await handler(event({
      floor: 1,
      reconcileMap: { 'CC_X': { action: 'delete' } },
    }));
    expect(resp.statusCode).toBe(200);
    expect(JSON.parse(resp.body).affectedRows).toBe(1);

    const csvPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/data/mapping.csv');
    const csvBody = csvPut.args[0].input.Body;
    // floor 1 CC_X row should be gone
    expect(csvBody.match(/CC_X,,,1/g) || []).toHaveLength(0);
    // floor 0 CC_X row should remain (delete is floor-scoped)
    expect(csvBody.match(/CC_X,,,0/g) || []).toHaveLength(1);
  });

  test('rejects 423 if caller does not own the lock', async () => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'bob' }))
    );

    const resp = await handler(event({ floor: 1, reconcileMap: {} }));
    expect(resp.statusCode).toBe(423);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- applyReconcileToStaging.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the Lambda**

Write `lambda/applyReconcileToStaging.mjs`:
```javascript
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { readMeta, recordFile } from './shared/staging-meta.mjs';
import { parseCsvContent } from './range-validation.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const authResult = await validateToken(event);
  if (!authResult.valid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.claims, 'admin');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const user = authResult.claims.sub;
  const meta = await readMeta(BUCKET);
  if (!meta.locked) {
    return createAuthResponse(409, { error: 'No staging area is currently active' }, CORS_HEADERS);
  }
  if (meta.owner !== user) {
    return createAuthResponse(423, { error: `Staging is owned by ${meta.owner}`, heldBy: meta.owner }, CORS_HEADERS);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return createAuthResponse(400, { error: 'Invalid JSON body' }, CORS_HEADERS);
  }
  const { floor, reconcileMap } = body;
  if (![0, 1, 2].includes(Number(floor))) {
    return createAuthResponse(400, { error: 'floor must be 0, 1, or 2' }, CORS_HEADERS);
  }
  if (!reconcileMap || typeof reconcileMap !== 'object') {
    return createAuthResponse(400, { error: 'reconcileMap is required' }, CORS_HEADERS);
  }

  // Fetch the staged CSV (or production if staging CSV not present yet)
  let csvString;
  try {
    csvString = await fetchObject('staging/data/mapping.csv');
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      csvString = await fetchObject('data/mapping.csv');
    } else {
      throw err;
    }
  }

  // Apply the reconcileMap (parseCsvContent returns { headers, rows } — destructure)
  const { rows } = parseCsvContent(csvString);
  let affected = 0;
  const newRows = [];
  for (const row of rows) {
    if (Number(row.floor) !== Number(floor)) {
      newRows.push(row);
      continue;
    }
    const entry = reconcileMap[String(row.svgCode)];
    if (!entry) {
      newRows.push(row);
      continue;
    }
    if (entry.action === 'rename') {
      if (!entry.to) {
        return createAuthResponse(422, {
          error: 'rename action missing "to" target',
          svgCode: row.svgCode,
        }, CORS_HEADERS);
      }
      newRows.push({ ...row, svgCode: entry.to });
      affected += 1;
    } else if (entry.action === 'delete') {
      // Skip — row dropped
      affected += 1;
    } else {
      return createAuthResponse(422, {
        error: `Unknown action "${entry.action}"`,
        svgCode: row.svgCode,
      }, CORS_HEADERS);
    }
  }

  // Serialize back to CSV
  const newCsv = serializeRowsToCsv(newRows);

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: 'staging/data/mapping.csv',
    Body: newCsv,
    ContentType: 'text/csv',
  }));
  await recordFile(BUCKET, 'data/mapping.csv');

  return createAuthResponse(200, { ok: true, affectedRows: affected }, CORS_HEADERS);
};

async function fetchObject(key) {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

const COLUMNS = [
  'libraryName', 'libraryNameHe', 'collectionName', 'collectionNameHe',
  'rangeStart', 'rangeEnd', 'svgCode', 'description', 'descriptionHe',
  'floor', 'shelfLabel', 'shelfLabelHe', 'notes', 'notesHe',
];

function serializeRowsToCsv(rows) {
  const header = COLUMNS.join(',');
  const body = rows.map(row => COLUMNS.map(col => csvEscape(row[col] ?? '')).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

function csvEscape(v) {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- applyReconcileToStaging.test.mjs`
Expected: PASS for all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lambda/applyReconcileToStaging.mjs lambda/__tests__/applyReconcileToStaging.test.mjs
git commit -m "feat(lambda): add applyReconcileToStaging endpoint"
```

---

### Task 5: `promoteStaging` Lambda

**Files:**
- Create: `lambda/promoteStaging.mjs`
- Create: `lambda/__tests__/promoteStaging.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lambda/__tests__/promoteStaging.test.mjs`:
```javascript
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);
const cfMock = mockClient(CloudFrontClient);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event() {
  return { httpMethod: 'POST', headers: { authorization: 'Bearer admin-token' }, body: '{}' };
}

describe('promoteStaging', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    cfMock.reset();
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ valid: true, claims: { sub: 'alice', 'cognito:groups': ['admin'] } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});
    cfMock.on(CreateInvalidationCommand).resolves({});

    ({ handler } = await import('../promoteStaging.mjs'));
  });

  test('promotes staged files to production and clears staging', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_1.svg', 'data/mapping.csv'],
      }))
    );
    // Fixtures for the final re-validation
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_NEW" data-map-object="shelf"/></svg>')
    );
    // Floors 0 and 2 have no staged SVG — fall back to prod (must explicitly reject so fetchObjectOrFallback catches NoSuchKey)
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
Lib,LibHe,Coll,CollHe,000,999,CC_NEW,,,1,,,,
`)
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);

    // Files should be copied to production paths
    const copies = s3Mock.commandCalls(CopyObjectCommand);
    expect(copies.find(c => c.args[0].input.Key === 'maps/floor_1.svg')).toBeDefined();
    expect(copies.find(c => c.args[0].input.Key === 'data/mapping.csv')).toBeDefined();

    // CloudFront invalidation
    const invalidations = cfMock.commandCalls(CreateInvalidationCommand);
    expect(invalidations.length).toBe(1);

    // Staging cleared (meta reset)
    const metaWrite = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/.meta.json');
    expect(metaWrite).toBeDefined();
    expect(JSON.parse(metaWrite.args[0].input.Body).locked).toBe(false);
  });

  test('returns 422 if final re-validation fails (Git-rebase race)', async () => {
    // Same staged files, but production CSV changed in the meantime to reference a removed shelf
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_1.svg'],
      }))
    );
    // Staged: floor_1 SVG no longer has CC_X
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_NEW" data-map-object="shelf"/></svg>')
    );
    // Floors 0 and 2 have no staged SVG — fall back to prod (must explicitly reject so fetchObjectOrFallback catches NoSuchKey)
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    // No staged CSV — fall back to prod
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    // Prod CSV references CC_X (which no longer exists in the staged SVG)
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(422);
    expect(JSON.parse(resp.body).errors).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- promoteStaging.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `promoteStaging.mjs`**

Write `lambda/promoteStaging.mjs`:
```javascript
import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { parseSvg } from './shared/svg-shelves.mjs';
import { validateBundle } from './shared/validateBundle.mjs';
import { readMeta, releaseLock } from './shared/staging-meta.mjs';
import { parseCsvContent } from './range-validation.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const cloudfront = new CloudFrontClient({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const DISTRIBUTION_ID = 'E5SR0E5GM5GSB';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const authResult = await validateToken(event);
  if (!authResult.valid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.claims, 'admin');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const user = authResult.claims.sub;
  const meta = await readMeta(BUCKET);
  if (!meta.locked) {
    return createAuthResponse(409, { error: 'No staging area is currently active' }, CORS_HEADERS);
  }
  if (meta.owner !== user) {
    return createAuthResponse(423, { error: `Staging is owned by ${meta.owner}`, heldBy: meta.owner }, CORS_HEADERS);
  }

  // Re-validate as final gate
  const svgShelfIdsByFloor = {};
  for (const floor of [0, 1, 2]) {
    const svg = await fetchObjectOrFallback(`staging/maps/floor_${floor}.svg`, `maps/floor_${floor}.svg`);
    const { shelves } = parseSvg(svg);
    svgShelfIdsByFloor[floor] = new Set(shelves);
  }
  const csvString = await fetchObjectOrFallback('staging/data/mapping.csv', 'data/mapping.csv');
  const { rows } = parseCsvContent(csvString);
  const csvRowsForValidation = rows.map((row, idx) => ({
    rowIndex: idx,
    svgCode: String(row.svgCode || ''),
    floor: Number(row.floor),
  }));
  const result = validateBundle(csvRowsForValidation, svgShelfIdsByFloor);
  if (!result.ok) {
    return createAuthResponse(422, {
      error: 'Bundle invariant violation at promote time (production changed during staging)',
      errors: result.errors,
    }, CORS_HEADERS);
  }

  // Copy staged files to production
  const promotedVersions = {};
  const cdnPaths = [];
  for (const file of meta.files || []) {
    const stagedKey = `staging/${file}`;
    const prodKey = file;
    try {
      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET,
        Key: prodKey,
        CopySource: `${BUCKET}/${stagedKey}`,
      }));
      promotedVersions[file] = 'updated';
      cdnPaths.push(`/${prodKey}`);
    } catch (err) {
      // Attempt rollback: nothing to roll back at this point because we've only
      // touched this single file. Return 500 with explicit instructions.
      console.error(`Promote failed at ${prodKey}:`, err);
      return createAuthResponse(500, {
        error: 'Promote failed mid-copy',
        recovery: 'failed',
        partialState: promotedVersions,
        manualRecovery: 'Check S3 version history for affected files',
      }, CORS_HEADERS);
    }
  }

  // Invalidate CloudFront
  if (cdnPaths.length > 0) {
    await cloudfront.send(new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `promote-${Date.now()}`,
        Paths: { Quantity: cdnPaths.length, Items: cdnPaths },
      },
    }));
  }

  // Clear staging objects + release lock
  for (const file of meta.files || []) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `staging/${file}` })).catch(() => {});
  }
  await releaseLock(BUCKET);

  return createAuthResponse(200, {
    ok: true,
    promotedVersions,
  }, CORS_HEADERS);
};

async function fetchObjectOrFallback(primaryKey, fallbackKey) {
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: primaryKey }));
    return await streamToString(resp.Body);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: fallbackKey }));
      return await streamToString(resp.Body);
    }
    throw err;
  }
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- promoteStaging.test.mjs`
Expected: PASS for both tests.

- [ ] **Step 5: Commit**

```bash
git add lambda/promoteStaging.mjs lambda/__tests__/promoteStaging.test.mjs
git commit -m "feat(lambda): add promoteStaging endpoint with rollback handling"
```

---

### Task 6: `clearStaging` Lambda

**Files:**
- Create: `lambda/clearStaging.mjs`
- Create: `lambda/__tests__/clearStaging.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lambda/__tests__/clearStaging.test.mjs`:
```javascript
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event() { return { httpMethod: 'POST', headers: { authorization: 'Bearer admin-token' }, body: '{}' }; }

describe('clearStaging', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ valid: true, claims: { sub: 'alice', 'cognito:groups': ['admin'] } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    ({ handler } = await import('../clearStaging.mjs'));
  });

  test('deletes staged files and releases lock', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_1.svg', 'data/mapping.csv'],
      }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);

    const deletes = s3Mock.commandCalls(DeleteObjectCommand);
    expect(deletes.find(c => c.args[0].input.Key === 'staging/maps/floor_1.svg')).toBeDefined();
    expect(deletes.find(c => c.args[0].input.Key === 'staging/data/mapping.csv')).toBeDefined();

    const metaPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/.meta.json');
    expect(JSON.parse(metaPut.args[0].input.Body).locked).toBe(false);
  });

  test('rejects 423 if caller does not own the lock', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'bob' }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(423);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- clearStaging.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `clearStaging.mjs`**

Write `lambda/clearStaging.mjs`:
```javascript
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { readMeta, releaseLock } from './shared/staging-meta.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const authResult = await validateToken(event);
  if (!authResult.valid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.claims, 'admin');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const user = authResult.claims.sub;
  const meta = await readMeta(BUCKET);
  if (!meta.locked) {
    return createAuthResponse(200, { ok: true, message: 'No active staging' }, CORS_HEADERS);
  }
  if (meta.owner !== user) {
    return createAuthResponse(423, { error: `Staging is owned by ${meta.owner}`, heldBy: meta.owner }, CORS_HEADERS);
  }

  for (const file of meta.files || []) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `staging/${file}` })).catch(() => {});
  }
  await releaseLock(BUCKET);

  return createAuthResponse(200, { ok: true }, CORS_HEADERS);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- clearStaging.test.mjs`
Expected: PASS for both tests.

- [ ] **Step 5: Commit**

```bash
git add lambda/clearStaging.mjs lambda/__tests__/clearStaging.test.mjs
git commit -m "feat(lambda): add clearStaging endpoint"
```

---

### Task 7: `getStagingStatus` Lambda

**Files:**
- Create: `lambda/getStagingStatus.mjs`
- Create: `lambda/__tests__/getStagingStatus.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lambda/__tests__/getStagingStatus.test.mjs`:
```javascript
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event() { return { httpMethod: 'GET', headers: { authorization: 'Bearer admin-token' } }; }

describe('getStagingStatus', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ valid: true, claims: { sub: 'alice', 'cognito:groups': ['admin'] } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));

    ({ handler } = await import('../getStagingStatus.mjs'));
  });

  test('returns empty state when no staging active', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.locked).toBe(false);
  });

  test('returns active staging state with files and last validation', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_1.svg'],
        lastValidated: { ok: false, errors: [{ rowIndex: 5 }] },
      }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.locked).toBe(true);
    expect(body.owner).toBe('alice');
    expect(body.files).toContain('maps/floor_1.svg');
    expect(body.lastValidated.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lambda && npm test -- getStagingStatus.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `getStagingStatus.mjs`**

Write `lambda/getStagingStatus.mjs`:
```javascript
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { readMeta } from './shared/staging-meta.mjs';

const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const authResult = await validateToken(event);
  if (!authResult.valid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.claims, 'admin');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const meta = await readMeta(BUCKET);
  return createAuthResponse(200, meta, CORS_HEADERS);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda && npm test -- getStagingStatus.test.mjs`
Expected: PASS for both tests.

- [ ] **Step 5: Commit**

```bash
git add lambda/getStagingStatus.mjs lambda/__tests__/getStagingStatus.test.mjs
git commit -m "feat(lambda): add getStagingStatus endpoint"
```

---

### Task 8: S3 lifecycle policy for staging cleanup

**Files:**
- Modify: `docs/AWS-INFRASTRUCTURE.md`

- [ ] **Step 1: Apply the lifecycle rule via AWS CLI**

Run (does not produce a code change, but the spec lives in docs):

```bash
aws s3api put-bucket-lifecycle-configuration --bucket tau-cenlib-primo-assets-hagay-3602 \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-staging-after-7-days",
        "Status": "Enabled",
        "Filter": { "Prefix": "staging/" },
        "Expiration": { "Days": 7 }
      }
    ]
  }'
```

- [ ] **Step 2: Document the rule**

Append to `docs/AWS-INFRASTRUCTURE.md`:
```markdown
## Staging Lifecycle Policy

Objects under the `staging/` prefix are auto-deleted 7 days after creation.
Implemented as an S3 lifecycle rule:

```json
{
  "ID": "expire-staging-after-7-days",
  "Status": "Enabled",
  "Filter": { "Prefix": "staging/" },
  "Expiration": { "Days": 7 }
}
```

Rationale: an operator who abandons an SVG-replace flow shouldn't leave
artifacts in S3 forever. 7 days gives a full week to resume an in-progress
session before cleanup takes over.
```

- [ ] **Step 3: Commit**

```bash
git add docs/AWS-INFRASTRUCTURE.md
git commit -m "docs(infra): document 7-day staging lifecycle policy"
```

---

### Task 9: `staging-panel.js` admin component

**Files:**
- Create: `admin/components/svg-manager/staging-panel.js`
- Create: `admin/__tests__/staging-panel.test.js`

- [ ] **Step 1: Write the failing test**

Write `admin/__tests__/staging-panel.test.js`:
```javascript
/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('staging-panel', () => {
  let renderStagingPanel;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="staging-panel-host"></div>';
    ({ renderStagingPanel } = await import('../components/svg-manager/staging-panel.js'));
  });

  test('renders empty state when no staging active', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: false, owner: null, files: [], lastValidated: null,
    });
    const host = document.getElementById('staging-panel-host');
    expect(host.textContent).toMatch(/no staging/i);
  });

  test('renders active staging with GREEN state and Promote button', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: true,
      owner: 'alice',
      files: ['maps/floor_1.svg'],
      lastValidated: { ok: true, errors: [], summary: { addedShelves: [], removedRefs: [] } },
    });
    const host = document.getElementById('staging-panel-host');
    expect(host.querySelector('[data-action="promote-staging"]')).not.toBeNull();
    expect(host.querySelector('[data-action="discard-staging"]')).not.toBeNull();
  });

  test('renders RED state with reconcile wizard CTA', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: true,
      owner: 'alice',
      files: ['maps/floor_1.svg'],
      lastValidated: {
        ok: false,
        errors: [{ rowIndex: 5, svgCode: 'CC_X', floor: 1, type: 'shelf-not-found' }],
        summary: {
          addedShelves: [{ svgCode: 'CC_NEW', floor: 1 }],
          removedRefs: [{ svgCode: 'CC_X', floor: 1, affectedRowCount: 1 }],
        },
      },
    });
    const host = document.getElementById('staging-panel-host');
    expect(host.querySelector('[data-action="open-reconcile-wizard"]')).not.toBeNull();
    expect(host.querySelector('[data-action="discard-staging"]')).not.toBeNull();
  });

  test('renders lock-held-by-other warning when owner is different', () => {
    renderStagingPanel(document.getElementById('staging-panel-host'), {
      locked: true,
      owner: 'bob',
      files: ['maps/floor_1.svg'],
      lastValidated: null,
    }, { currentUser: 'alice' });
    const host = document.getElementById('staging-panel-host');
    expect(host.textContent).toMatch(/in use by bob/i);
    expect(host.querySelector('[data-action="promote-staging"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin && npm test -- staging-panel.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `staging-panel.js`**

Write `admin/components/svg-manager/staging-panel.js`:
```javascript
/**
 * Staging panel UI for the SVG Manager.
 *
 * Pure renderer: given a staging status object, paints a panel into the host
 * element. Emits user actions as DOM events with type "staging:*" so the
 * parent SVG Manager wires them to the appropriate Lambda call.
 *
 * @param {HTMLElement} host
 * @param {Object} status  Result of getStagingStatus Lambda.
 * @param {Object} [opts]  Optional. { currentUser } — used to detect "lock held by someone else."
 */
export function renderStagingPanel(host, status, opts = {}) {
  host.innerHTML = '';

  if (!status.locked) {
    host.innerHTML = `
      <div class="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No staging area is currently active. Upload a new SVG to start a staged replace.
      </div>
    `;
    return;
  }

  const currentUser = opts.currentUser;
  const isOwner = !currentUser || status.owner === currentUser;
  if (!isOwner) {
    host.innerHTML = `
      <div class="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Staging is in use by <strong>${escapeHtml(status.owner)}</strong>.
        Wait for them to finish or contact them to discard.
      </div>
    `;
    return;
  }

  const validated = status.lastValidated;
  const files = (status.files || []).map(f => `<li class="font-mono text-xs">${escapeHtml(f)}</li>`).join('');

  let stateBlock = '';
  let actions = '';
  if (!validated) {
    stateBlock = `<div class="text-sm text-blue-700">⏳ Awaiting validation. Click <em>Validate</em> to check consistency.</div>`;
    actions = `
      <button data-action="validate-staging" class="px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200">Validate</button>
      <button data-action="discard-staging" class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Discard</button>
    `;
  } else if (validated.ok) {
    const added = (validated.summary?.addedShelves || []).length;
    stateBlock = `
      <div class="text-sm text-green-700">✓ Validation passed — ready to promote.</div>
      <div class="text-xs text-gray-600 mt-1">${added} new shelf${added === 1 ? '' : 'es'} added; no CSV changes needed.</div>
    `;
    actions = `
      <button data-action="promote-staging" class="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">Promote to production</button>
      <button data-action="discard-staging" class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Discard</button>
    `;
  } else {
    const removedRefs = validated.summary?.removedRefs || [];
    const removedSummary = removedRefs.map(r => `<li>${escapeHtml(r.svgCode)} (${r.affectedRowCount} row${r.affectedRowCount === 1 ? '' : 's'})</li>`).join('');
    stateBlock = `
      <div class="text-sm text-red-700">✗ Validation failed — ${validated.errors.length} issue${validated.errors.length === 1 ? '' : 's'}.</div>
      <ul class="list-disc pl-6 text-xs text-gray-700 mt-1">${removedSummary}</ul>
    `;
    actions = `
      <button data-action="open-reconcile-wizard" class="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600">Start reconcile wizard</button>
      <button data-action="discard-staging" class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Discard</button>
    `;
  }

  host.innerHTML = `
    <div class="rounded border border-blue-200 bg-blue-50 p-4">
      <div class="text-sm font-semibold mb-2">Staging area (owner: ${escapeHtml(status.owner)})</div>
      <ul class="list-disc pl-6 mb-2">${files}</ul>
      ${stateBlock}
      <div class="mt-3 flex gap-2">${actions}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && npm test -- staging-panel.test.js`
Expected: PASS for all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add admin/components/svg-manager/staging-panel.js admin/__tests__/staging-panel.test.js
git commit -m "feat(svg-manager): add staging-panel component"
```

---

### Task 10: `reconcile-wizard.js` admin component

**Files:**
- Create: `admin/components/svg-manager/reconcile-wizard.js`
- Create: `admin/__tests__/reconcile-wizard.test.js`

- [ ] **Step 1: Write the failing test**

Write `admin/__tests__/reconcile-wizard.test.js`:
```javascript
/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('reconcile-wizard', () => {
  let renderReconcileWizard;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="wizard-host"></div>';
    ({ renderReconcileWizard } = await import('../components/svg-manager/reconcile-wizard.js'));
  });

  test('renders one row per removed ref with rename/delete dropdown', () => {
    renderReconcileWizard(document.getElementById('wizard-host'), {
      floor: 1,
      removedRefs: [
        { svgCode: 'CC_X', affectedRowCount: 1 },
        { svgCode: 'CC_Y', affectedRowCount: 2 },
      ],
      addedShelves: [{ svgCode: 'CC_NEW' }, { svgCode: 'CC_OTHER' }],
    });
    const rows = document.querySelectorAll('[data-reconcile-row]');
    expect(rows).toHaveLength(2);
    rows.forEach(r => {
      expect(r.querySelector('select')).not.toBeNull();
    });
  });

  test('submit button is disabled until every row has an action selected', () => {
    renderReconcileWizard(document.getElementById('wizard-host'), {
      floor: 1,
      removedRefs: [
        { svgCode: 'CC_X', affectedRowCount: 1 },
      ],
      addedShelves: [{ svgCode: 'CC_NEW' }],
    });
    const submit = document.querySelector('[data-action="submit-reconcile"]');
    expect(submit.disabled).toBe(true);

    const select = document.querySelector('[data-reconcile-row] select');
    select.value = 'rename:CC_NEW';
    select.dispatchEvent(new Event('change'));

    expect(submit.disabled).toBe(false);
  });

  test('builds correct reconcileMap on submit', () => {
    const onSubmit = jest.fn();
    renderReconcileWizard(document.getElementById('wizard-host'), {
      floor: 1,
      removedRefs: [
        { svgCode: 'CC_X', affectedRowCount: 1 },
        { svgCode: 'CC_Y', affectedRowCount: 2 },
      ],
      addedShelves: [{ svgCode: 'CC_NEW' }],
    }, onSubmit);

    const selects = document.querySelectorAll('[data-reconcile-row] select');
    selects[0].value = 'rename:CC_NEW';
    selects[0].dispatchEvent(new Event('change'));
    selects[1].value = 'delete';
    selects[1].dispatchEvent(new Event('change'));

    // Mock confirm so the delete passes the affirmation
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    document.querySelector('[data-action="submit-reconcile"]').click();

    expect(confirmSpy).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(1, {
      'CC_X': { action: 'rename', to: 'CC_NEW' },
      'CC_Y': { action: 'delete' },
    });

    confirmSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin && npm test -- reconcile-wizard.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reconcile-wizard.js`**

Write `admin/components/svg-manager/reconcile-wizard.js`:
```javascript
/**
 * Interactive reconcile wizard for the staged-SVG-replace flow.
 *
 * Renders one row per removed shelf; operator picks "rename" or "delete" for
 * each. Submit is gated on all rows having an action. Delete triggers a
 * confirm dialog before the map is built.
 *
 * @param {HTMLElement} host
 * @param {{
 *   floor: number,
 *   removedRefs: Array<{svgCode: string, affectedRowCount: number}>,
 *   addedShelves: Array<{svgCode: string}>
 * }} diff
 * @param {(floor: number, reconcileMap: object) => void} [onSubmit]
 */
export function renderReconcileWizard(host, diff, onSubmit) {
  const rowsHtml = diff.removedRefs.map(removed => {
    const options = [
      `<option value="">-- choose --</option>`,
      ...diff.addedShelves.map(added =>
        `<option value="rename:${escapeAttr(added.svgCode)}">Rename to ${escapeHtml(added.svgCode)}</option>`
      ),
      `<option value="delete">Delete ${removed.affectedRowCount} CSV row${removed.affectedRowCount === 1 ? '' : 's'}</option>`,
    ].join('');
    return `
      <tr data-reconcile-row data-svg-code="${escapeAttr(removed.svgCode)}">
        <td class="px-3 py-2 font-mono text-xs">${escapeHtml(removed.svgCode)}</td>
        <td class="px-3 py-2 text-xs">${removed.affectedRowCount}</td>
        <td class="px-3 py-2">
          <select class="border rounded px-2 py-1 text-sm">${options}</select>
        </td>
      </tr>
    `;
  }).join('');

  host.innerHTML = `
    <div class="rounded border border-amber-300 bg-amber-50 p-4">
      <div class="text-sm font-semibold mb-2">Reconcile removed shelves — floor ${diff.floor}</div>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs text-gray-600"><th>Removed shelf</th><th>Rows</th><th>Action</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="mt-3 flex gap-2 items-center">
        <button data-action="submit-reconcile" disabled
                class="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed">
          Apply and re-validate
        </button>
        <button data-action="cancel-reconcile"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </div>
  `;

  function updateSubmitState() {
    const allChosen = Array.from(host.querySelectorAll('[data-reconcile-row] select'))
      .every(sel => sel.value !== '');
    host.querySelector('[data-action="submit-reconcile"]').disabled = !allChosen;
  }

  host.querySelectorAll('[data-reconcile-row] select').forEach(sel => {
    sel.addEventListener('change', updateSubmitState);
  });

  host.querySelector('[data-action="submit-reconcile"]').addEventListener('click', () => {
    const map = {};
    let deleteCount = 0;
    host.querySelectorAll('[data-reconcile-row]').forEach(tr => {
      const svgCode = tr.dataset.svgCode;
      const value = tr.querySelector('select').value;
      if (value === 'delete') {
        map[svgCode] = { action: 'delete' };
        deleteCount += 1;
      } else if (value.startsWith('rename:')) {
        map[svgCode] = { action: 'rename', to: value.slice('rename:'.length) };
      }
    });

    if (deleteCount > 0) {
      const ok = window.confirm(
        `You are about to delete ${deleteCount} CSV reference${deleteCount === 1 ? '' : 's'}. ` +
        `This will remove the corresponding CSV row${deleteCount === 1 ? '' : 's'}. Continue?`
      );
      if (!ok) return;
    }
    if (typeof onSubmit === 'function') {
      onSubmit(diff.floor, map);
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && npm test -- reconcile-wizard.test.js`
Expected: PASS for all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add admin/components/svg-manager/reconcile-wizard.js admin/__tests__/reconcile-wizard.test.js
git commit -m "feat(svg-manager): add reconcile-wizard component"
```

---

### Task 11: Wire SVG Manager to the staging flow (behind a feature toggle)

**Files:**
- Modify: `admin/components/svg-manager.js`

- [ ] **Step 1: Add staging panel mount + API endpoint constants**

In `admin/components/svg-manager.js`, near the top, add imports:
```javascript
import { renderStagingPanel } from './svg-manager/staging-panel.js?v=5';
import { renderReconcileWizard } from './svg-manager/reconcile-wizard.js?v=5';
```

Add a module-level constant:
```javascript
const STAGING_API_BASE = `${API_ENDPOINT}/staging`;
// Feature flag: read from window for ease of A/B testing. Defaults to false.
// Once Task 16 cutover runs, this constant flips to true.
const USE_STAGING_FLOW = window.__USE_STAGING_FLOW__ === true;
```

- [ ] **Step 2: Add a staging panel mount point**

In the SVG Manager's main render function (likely `renderFiles()` or similar — search for where the file grid is rendered), add a panel mount:
```html
<div id="staging-panel-host" class="mb-4"></div>
```

After rendering, call:
```javascript
async function refreshStagingPanel() {
  const resp = await fetch(`${STAGING_API_BASE}/status`, {
    headers: getAuthHeaders(),
  });
  if (!resp.ok) return;
  const status = await resp.json();
  renderStagingPanel(document.getElementById('staging-panel-host'), status, {
    currentUser: getCurrentUsername(),
  });
  wireStagingActions();
}
```

Call `refreshStagingPanel()` after the file grid renders and on a `staging:refresh` custom event.

- [ ] **Step 3: Wire the staging action buttons**

Add to `svg-manager.js`:
```javascript
function wireStagingActions() {
  const host = document.getElementById('staging-panel-host');
  if (!host) return;
  host.querySelector('[data-action="validate-staging"]')?.addEventListener('click', async () => {
    const resp = await fetch(`${STAGING_API_BASE}/validate`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!resp.ok) {
      showToast(t('svg.staging.validateFailed'));
      return;
    }
    await refreshStagingPanel();
  });

  host.querySelector('[data-action="promote-staging"]')?.addEventListener('click', async () => {
    const resp = await fetch(`${STAGING_API_BASE}/promote`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(`${t('svg.staging.promoteFailed')}: ${err.error}`);
      return;
    }
    showToast(t('svg.staging.promoted'));
    await refreshStagingPanel();
    await loadFiles();  // existing function that re-fetches the production file grid
  });

  host.querySelector('[data-action="discard-staging"]')?.addEventListener('click', async () => {
    if (!window.confirm(t('svg.staging.confirmDiscard'))) return;
    await fetch(`${STAGING_API_BASE}/clear`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    await refreshStagingPanel();
  });

  host.querySelector('[data-action="open-reconcile-wizard"]')?.addEventListener('click', async () => {
    const statusResp = await fetch(`${STAGING_API_BASE}/status`, { headers: getAuthHeaders() });
    const status = await statusResp.json();
    const validated = status.lastValidated;
    if (!validated || validated.ok) return;
    // For v1, assume reconcile is for a single floor; pick the floor with the most removedRefs
    const byFloor = {};
    for (const r of validated.summary.removedRefs) {
      byFloor[r.floor] = byFloor[r.floor] || { floor: r.floor, removedRefs: [], addedShelves: [] };
      byFloor[r.floor].removedRefs.push(r);
    }
    for (const a of validated.summary.addedShelves) {
      byFloor[a.floor] = byFloor[a.floor] || { floor: a.floor, removedRefs: [], addedShelves: [] };
      byFloor[a.floor].addedShelves.push(a);
    }
    const firstFloor = Object.values(byFloor)[0];
    renderReconcileWizard(
      document.getElementById('staging-panel-host'),
      firstFloor,
      async (floor, reconcileMap) => {
        const resp = await fetch(`${STAGING_API_BASE}/reconcile`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ floor, reconcileMap }),
        });
        if (!resp.ok) {
          showToast(t('svg.staging.reconcileFailed'));
          return;
        }
        // Re-validate immediately after applying
        await fetch(`${STAGING_API_BASE}/validate`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: '{}',
        });
        await refreshStagingPanel();
      }
    );
  });
}
```

- [ ] **Step 4: Switch the Replace button to use the staging upload endpoint when `USE_STAGING_FLOW` is true**

Find the existing Replace handler in `svg-manager.js` (likely `handleReplace(file)`). Modify:
```javascript
async function handleReplace(filename) {
  // ... existing file picker + confirm logic ...

  const file = await pickFile();  // existing
  const confirmed = window.confirm(t('svg.confirmReplace').replace('{filename}', filename));
  if (!confirmed) return;

  if (USE_STAGING_FLOW) {
    const base64 = await fileToBase64(file);
    const floor = Number(filename.match(/floor_(\d+)\.svg/)?.[1]);
    const resp = await fetch(`${STAGING_API_BASE}/upload`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor, svgBase64: base64 }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(`${t('svg.staging.uploadFailed')}: ${err.error}`);
      return;
    }
    // Trigger validation immediately
    await fetch(`${STAGING_API_BASE}/validate`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    await refreshStagingPanel();
    return;
  }

  // ... existing direct-PUT replace logic continues unchanged ...
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
```

Add to `FALLBACKS`:
```javascript
'svg.staging.validateFailed':  { en: 'Validation request failed',                he: 'בקשת ולידציה נכשלה' },
'svg.staging.promoteFailed':   { en: 'Promote failed',                           he: 'קידום נכשל' },
'svg.staging.promoted':        { en: 'Staging promoted to production',           he: 'הסביבה קודמה לייצור' },
'svg.staging.uploadFailed':    { en: 'Upload to staging failed',                 he: 'העלאה לסביבת בדיקה נכשלה' },
'svg.staging.reconcileFailed': { en: 'Reconcile failed',                         he: 'יישוב נכשל' },
'svg.staging.confirmDiscard':  { en: 'Discard the staged changes?',              he: 'להשליך את השינויים בסביבת הבדיקה?' },
```

- [ ] **Step 5: Commit**

```bash
git add admin/components/svg-manager.js
git commit -m "feat(svg-manager): wire staging panel + reconcile wizard (gated by USE_STAGING_FLOW)"
```

---

### Task 12: E2E test — staging happy path

**Files:**
- Create: `e2e/tests/sot-staging.spec.ts`

- [ ] **Step 1: Write the E2E test**

Write `e2e/tests/sot-staging.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test.describe('SoT — staged SVG replace', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.__USE_STAGING_FLOW__ = true; });
    await page.goto('/admin/');
    // [Use existing e2e/fixtures/auth.ts admin-login helper]
  });

  test('strict-superset upload promotes successfully', async ({ page }) => {
    await page.click('a:has-text("Map Files")');

    // Listen for file picker
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Replace"):below(:text("floor_1.svg"))').first();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'floor_1.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        // Add an extra shelf to whatever floor_1 currently has — adjust per real data
        '<svg xmlns="http://www.w3.org/2000/svg"><rect id="EXISTING" data-map-object="shelf"/><rect id="NEW_SHELF" data-map-object="shelf"/></svg>'
      ),
    });

    page.on('dialog', d => d.accept());  // confirm replace
    await page.waitForSelector('#staging-panel-host:has-text("Validation passed")');

    await page.click('[data-action="promote-staging"]');
    await expect(page.locator('#staging-panel-host')).toContainText(/No staging/i, { timeout: 5000 });
  });

  test('removed-ref upload triggers reconcile wizard and resolves green', async ({ page }) => {
    await page.click('a:has-text("Map Files")');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Replace"):below(:text("floor_1.svg"))').first();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'floor_1.svg',
      mimeType: 'image/svg+xml',
      // SVG that REMOVES a shelf currently referenced by CSV; adjust per real data
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect id="REPLACEMENT_SHELF" data-map-object="shelf"/></svg>'),
    });

    page.on('dialog', d => d.accept());  // confirm replace + delete confirmation later

    await page.waitForSelector('[data-action="open-reconcile-wizard"]');
    await page.click('[data-action="open-reconcile-wizard"]');

    // Pick rename for every removed ref
    const selects = page.locator('[data-reconcile-row] select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      await selects.nth(i).selectOption({ index: 1 });
    }

    await page.click('[data-action="submit-reconcile"]');
    await page.waitForSelector('#staging-panel-host:has-text("Validation passed")');

    await page.click('[data-action="promote-staging"]');
    await expect(page.locator('#staging-panel-host')).toContainText(/No staging/i, { timeout: 5000 });
  });

  test('discard staging clears the staging area', async ({ page }) => {
    await page.click('a:has-text("Map Files")');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Replace"):below(:text("floor_1.svg"))').first();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'floor_1.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect id="EXISTING" data-map-object="shelf"/></svg>'),
    });

    page.on('dialog', d => d.accept());
    await page.waitForSelector('[data-action="discard-staging"]');
    await page.click('[data-action="discard-staging"]');
    await expect(page.locator('#staging-panel-host')).toContainText(/No staging/i, { timeout: 5000 });
  });
});
```

- [ ] **Step 2: Run the E2E test**

Run: `npx playwright test e2e/tests/sot-staging.spec.ts --headed`
Expected: PASS for happy path, reconcile, and discard scenarios. Some assertions may need tuning against real seed data — adjust the SVG fixtures inline.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/sot-staging.spec.ts
git commit -m "test(e2e): staging happy path + reconcile + discard"
```

---

### Task 13: E2E test — staging lock conflict

**Files:**
- Modify: `e2e/tests/sot-staging.spec.ts`

- [ ] **Step 1: Add the lock-conflict test case**

Append to `e2e/tests/sot-staging.spec.ts`:
```typescript
test('second operator sees "in use" banner when lock is held', async ({ browser }) => {
  // Operator A's session
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.addInitScript(() => { window.__USE_STAGING_FLOW__ = true; });
  await pageA.goto('/admin/');
  // [Login as admin A]
  await pageA.click('a:has-text("Map Files")');

  // Operator A starts staging
  const fc = pageA.waitForEvent('filechooser');
  await pageA.click('button:has-text("Replace"):below(:text("floor_1.svg"))').first();
  const chooser = await fc;
  await chooser.setFiles({
    name: 'floor_1.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect id="EXISTING" data-map-object="shelf"/></svg>'),
  });
  pageA.on('dialog', d => d.accept());
  await pageA.waitForSelector('[data-action="discard-staging"]');

  // Operator B's session
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.addInitScript(() => { window.__USE_STAGING_FLOW__ = true; });
  await pageB.goto('/admin/');
  // [Login as admin B]
  await pageB.click('a:has-text("Map Files")');

  await expect(pageB.locator('#staging-panel-host')).toContainText(/in use by/i);

  // Cleanup
  await pageA.click('[data-action="discard-staging"]');
  await contextA.close();
  await contextB.close();
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test e2e/tests/sot-staging.spec.ts --headed`
Expected: PASS for all 4 scenarios.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/sot-staging.spec.ts
git commit -m "test(e2e): staging lock conflict between operators"
```

---

### Task 14: API Gateway routes for the staging endpoints

**Files:** (no code changes; AWS console / CLI work + docs update)

- [ ] **Step 1: Add API Gateway routes**

For each of the 6 new Lambdas, add a route to API Gateway `tt3xt4tr09`:

| Path | Method | Lambda |
|---|---|---|
| `/staging/upload` | POST | uploadStagingSvg |
| `/staging/validate` | POST | validateStaging |
| `/staging/reconcile` | POST | applyReconcileToStaging |
| `/staging/promote` | POST | promoteStaging |
| `/staging/clear` | POST | clearStaging |
| `/staging/status` | GET | getStagingStatus |

Run via CLI:
```bash
# Repeat for each route — adjust IDs per actual API Gateway resources
aws apigateway create-resource \
  --rest-api-id tt3xt4tr09 \
  --parent-id <root-resource-id> \
  --path-part staging
# Then create child resources (upload, validate, ...) and method integrations.
```

(Specific commands depend on whether the team uses SAM/CDK; in that case, update the IaC config instead.)

- [ ] **Step 2: Document the routes**

Append to `docs/AWS-INFRASTRUCTURE.md`:
```markdown
## Staging API routes

Six new POST/GET endpoints under `/staging` on API Gateway `tt3xt4tr09`:

| Path | Method | Lambda | Purpose |
|---|---|---|---|
| `/staging/upload` | POST | uploadStagingSvg | Upload a new SVG to staging |
| `/staging/validate` | POST | validateStaging | Run bundle-consistency check |
| `/staging/reconcile` | POST | applyReconcileToStaging | Apply a rename/delete map to staging CSV |
| `/staging/promote` | POST | promoteStaging | Copy staging → production |
| `/staging/clear` | POST | clearStaging | Discard staging area |
| `/staging/status` | GET | getStagingStatus | Read current staging state |

All require admin role (enforced by `role-auth.mjs` inside each Lambda).
```

- [ ] **Step 3: Commit**

```bash
git add docs/AWS-INFRASTRUCTURE.md
git commit -m "docs(infra): document staging API routes"
```

---

### Task 15: Flip `BUNDLE_INVARIANT_ENABLED` to `true` (cutover)

**Files:** (config change only)

- [ ] **Step 1: Verify cleanup is done**

Run the broken-refs check against production:
- Open CSV Editor
- Toggle "Show only broken refs"
- Confirm counter shows 0

Or via the migration tooling: filter the production CSV through `validateBundle` on a one-shot Lambda invocation. The count must be zero.

- [ ] **Step 2: Flip the flag on all Lambdas**

```bash
aws lambda update-function-configuration \
  --function-name putCsv \
  --environment "Variables={BUNDLE_INVARIANT_ENABLED=true,COGNITO_USER_POOL_ID=us-east-1_g9q5cPhVg}"
```

Repeat for any other Lambda that reads the flag (currently only `putCsv`).

- [ ] **Step 3: Verify by attempting a known-bad save**

Open CSV Editor. Edit any row's `svgCode` to `INTENTIONALLY_BROKEN_VALUE_xyz`. Save. Expected: error toast with the rejection message; no save persisted.

- [ ] **Step 4: This task does not produce a commit. It's a deploy step.**

Document the flip in the rollout notes (e.g., the PR description or an issue comment).

---

### Task 16: Flip `USE_STAGING_FLOW` to `true` in the admin frontend (cutover)

**Files:**
- Modify: `admin/components/svg-manager.js`
- Modify: `admin/index.html` (or wherever the script loads — to set `window.__USE_STAGING_FLOW__`)

- [ ] **Step 1: Set the runtime flag globally**

In `admin/index.html`, add **before** the SVG Manager script loads:
```html
<script>window.__USE_STAGING_FLOW__ = true;</script>
```

Alternatively, remove the `USE_STAGING_FLOW` gate from `svg-manager.js` entirely:
```javascript
// Remove this guard:
// const USE_STAGING_FLOW = window.__USE_STAGING_FLOW__ === true;
// if (USE_STAGING_FLOW) { ... } else { ... legacy direct-PUT ... }

// Replace with the staging-path code unconditionally.
```

- [ ] **Step 2: Run the full admin test suite to verify nothing regressed**

Run: `cd admin && npm test`
Expected: PASS.

- [ ] **Step 3: Run the staging E2E**

Run: `npx playwright test e2e/tests/sot-staging.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add admin/index.html admin/components/svg-manager.js
git commit -m "feat(svg-manager): cutover — staging flow is now the default replace path"
```

- [ ] **Step 5: Manual QA — full bundle-invariant pass**

Run the post-flip checklist from the spec:

- Set `BUNDLE_INVARIANT_ENABLED=true` (done in Task 15)
- Verify deliberately-bad CSV save returns 422
- Run a happy-path staging flow end-to-end manually
- Run a reconcile flow end-to-end manually
- Monitor `bundle.violations.csv_write` for 24h — expect zero

---

## Self-Review

**Spec coverage check:**
- ✓ uploadStagingSvg (Task 2)
- ✓ validateStaging (Task 3)
- ✓ applyReconcileToStaging (Task 4)
- ✓ promoteStaging with atomicity caveat (Task 5)
- ✓ clearStaging (Task 6)
- ✓ getStagingStatus (Task 7)
- ✓ S3 lifecycle policy (Task 8)
- ✓ staging-panel.js (Task 9)
- ✓ reconcile-wizard.js (Task 10)
- ✓ SVG Manager integration (Task 11)
- ✓ E2E happy path / reconcile / discard / lock (Tasks 12, 13)
- ✓ API Gateway routes + docs (Task 14)
- ✓ BUNDLE_INVARIANT_ENABLED cutover (Task 15)
- ✓ USE_STAGING_FLOW cutover (Task 16)

**Placeholder scan:** None blocking.
- One soft spot: Task 14 (API Gateway) is hand-wavy because it depends on whether the team uses SAM/CDK. The implementer fills in the exact CLI or IaC config.

**Type consistency:**
- `reconcileMap` shape `{ svgCode: { action: 'rename', to: string } | { action: 'delete' } }` consistent across Lambda + wizard.
- Staging status shape `{ locked, owner, files, lastValidated: { ok, errors, summary } }` consistent across `staging-meta.mjs`, `validateStaging.mjs`, `getStagingStatus.mjs`, and `staging-panel.js`.
- Validation error shape `{ rowIndex, svgCode, floor, type }` matches the foundation plan.

**Ambiguity check:**
- The reconcile wizard is single-floor in v1 (Task 11 picks "the first floor with diffs"). Multi-floor reconcile is a future enhancement; not blocking. Documented in the spec's "Open questions."

---

## Dependencies on the Foundation Plan

This plan **requires** `2026-05-13-sot-bundle-invariant-foundation.md` to be merged first:
- `lambda/shared/validateBundle.mjs` (used by validateStaging, promoteStaging)
- `lambda/shared/svg-shelves.mjs` (used by uploadStagingSvg, validateStaging, promoteStaging)
- `admin/services/bundle-validator.js` (used by future enhancements; not strictly required for v1 of this plan but reused for client-side pre-validation in any "preview" UX)
- `BUNDLE_INVARIANT_ENABLED` env var existing (Task 15 flips it)

If the foundation plan isn't merged, this plan's Tasks 2, 3, 5 cannot be implemented as written.
