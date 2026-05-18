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
