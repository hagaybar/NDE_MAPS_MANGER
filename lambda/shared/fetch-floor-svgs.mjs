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
