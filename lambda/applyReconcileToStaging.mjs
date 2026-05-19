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
  if (!authResult.isValid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.user, 'delete');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const user = authResult.user.sub;
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
