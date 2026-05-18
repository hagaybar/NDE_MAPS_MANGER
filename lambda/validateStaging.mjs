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
