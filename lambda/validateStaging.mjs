import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { parseSvg, parseSvgShelfDetails } from './shared/svg-shelves.mjs';
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
  if (!authResult.isValid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.user, 'delete');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const meta = await readMeta(BUCKET);
  if (!meta.locked) {
    return createAuthResponse(409, { error: 'No staging area is currently active' }, CORS_HEADERS);
  }

  // Fetch each floor SVG: staged if present, otherwise production
  const svgShelfIdsByFloor = {};
  const stagedSvgByFloor = {};
  for (const floor of [0, 1, 2]) {
    const stagedKey = `staging/maps/floor_${floor}.svg`;
    const prodKey = `maps/floor_${floor}.svg`;
    const svg = await fetchObjectOrFallback(stagedKey, prodKey);
    stagedSvgByFloor[floor] = svg;
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

  // Production SVG shelves (always prod, never staged) — lets us tell shelves
  // that are NEW in this upload from ones that already existed in production.
  const prodSvgShelfIdsByFloor = {};
  const prodSvgByFloor = {};
  for (const floor of [0, 1, 2]) {
    let prodSvg = null;
    try { prodSvg = await fetchObject(`maps/floor_${floor}.svg`); } catch { prodSvg = null; }
    prodSvgByFloor[floor] = prodSvg;
    prodSvgShelfIdsByFloor[floor] = new Set(prodSvg ? parseSvg(prodSvg).shelves : []);
  }

  const removedRefs = [];
  const addedShelves = [];
  const newlyAddedShelves = [];
  const removedShelves = [];
  const unmappedShelves = [];
  const renames = [];
  for (const floor of [0, 1, 2]) {
    const csvRefs = csvRefsByFloor[floor] || new Set();
    const stagedShelves = svgShelfIdsByFloor[floor];
    const prodShelves = prodSvgShelfIdsByFloor[floor] || new Set();

    // Rename detection (uid-primary, geometry fallback) for this floor.
    const { renames: floorRenames, renamedFromCodes, renamedToCodes } =
      detectRenames(prodSvgByFloor[floor], stagedSvgByFloor[floor], floor);
    renames.push(...floorRenames);

    for (const ref of csvRefs) {
      if (!stagedShelves.has(ref)) {
        const affectedRowCount = rows.filter(r => Number(r.floor) === floor && String(r.svgCode) === ref).length;
        removedRefs.push({ svgCode: ref, floor, affectedRowCount });
      }
    }
    for (const id of stagedShelves) {
      if (!csvRefs.has(id)) addedShelves.push({ svgCode: id, floor });
      if (!csvRefs.has(id)) unmappedShelves.push({ svgCode: id, floor });   // orphan OR new (== addedShelves)
      // new in THIS upload, unless it's the target of a detected rename
      if (!prodShelves.has(id) && !renamedToCodes.has(id)) newlyAddedShelves.push({ svgCode: id, floor });
    }
    for (const id of prodShelves) {
      // dropped from the SVG (#56), unless it's the source of a detected rename
      if (!stagedShelves.has(id) && !renamedFromCodes.has(id)) removedShelves.push({ svgCode: id, floor });
    }
  }

  const summary = { addedShelves, removedRefs, newlyAddedShelves, removedShelves, unmappedShelves, renames };
  await recordValidation(BUCKET, { ok: result.ok, errors: result.errors, summary });

  return createAuthResponse(200, {
    ok: result.ok,
    errors: result.errors,
    summary,
  }, CORS_HEADERS);
};

/**
 * Detect shelf renames between a production and a staged SVG for one floor.
 *
 * A rename is the same physical shelf relabeled (its id/code changed). Two
 * signals identify "same shelf":
 *
 *   1. uid-primary: a `data-shelf-uid` present in BOTH prod and staged. Same
 *      uid + different code => rename via:'uid'. (Same uid + same code is
 *      unchanged; a prod uid absent from staged is a removal; a staged shelf
 *      with no uid is genuinely new.)
 *   2. geometry fallback: only for shelves that carry NO uid on either side
 *      (a floor not yet stamped). Pair a removed-by-id shelf with an added-by-id
 *      shelf when their geometry matches exactly, then within ≤3px on all of
 *      x/y/width/height. Ambiguous matches (multiple candidates) are left as
 *      true add/remove.
 *
 * @returns {{ renames: Array<{fromCode,toCode,floor,via}>, renamedFromCodes: Set<string>, renamedToCodes: Set<string> }}
 */
function detectRenames(prodSvg, stagedSvg, floor) {
  const renames = [];
  const renamedFromCodes = new Set();
  const renamedToCodes = new Set();

  const prodDetails = prodSvg ? parseSvgShelfDetails(prodSvg) : [];
  const stagedDetails = stagedSvg ? parseSvgShelfDetails(stagedSvg) : [];

  // --- 1. uid-primary join ---
  const stagedByUid = new Map();
  for (const s of stagedDetails) {
    if (s.uid) stagedByUid.set(s.uid, s);
  }
  for (const p of prodDetails) {
    if (!p.uid) continue;
    const staged = stagedByUid.get(p.uid);
    if (!staged) continue; // prod uid absent from staged → handled as removal elsewhere
    if (staged.id !== p.id) {
      renames.push({ fromCode: p.id, toCode: staged.id, floor, via: 'uid' });
      renamedFromCodes.add(p.id);
      renamedToCodes.add(staged.id);
    }
  }

  // --- 2. geometry fallback (only for shelves with NO uid on either side) ---
  const prodById = new Set(prodDetails.map(d => d.id));
  const stagedById = new Set(stagedDetails.map(d => d.id));

  // Removed-by-id, uid-less, with geometry: candidates for the rename source.
  const removedCandidates = prodDetails.filter(
    d => !d.uid && !stagedById.has(d.id) && hasGeometry(d)
  );
  // Added-by-id, uid-less, with geometry: candidates for the rename target.
  const addedCandidates = stagedDetails.filter(
    d => !d.uid && !prodById.has(d.id) && hasGeometry(d)
  );

  const usedAdded = new Set();
  for (const removed of removedCandidates) {
    // Exact match first, then within ≤3px tolerance.
    let matches = addedCandidates.filter(a => !usedAdded.has(a.id) && geomEqual(removed, a));
    if (matches.length === 0) {
      matches = addedCandidates.filter(a => !usedAdded.has(a.id) && geomClose(removed, a, 3));
    }
    if (matches.length === 1) {
      const target = matches[0];
      usedAdded.add(target.id);
      renames.push({ fromCode: removed.id, toCode: target.id, floor, via: 'geometry' });
      renamedFromCodes.add(removed.id);
      renamedToCodes.add(target.id);
    }
    // 0 or >1 candidates → ambiguous; leave as true add/remove.
  }

  return { renames, renamedFromCodes, renamedToCodes };
}

function hasGeometry(d) {
  return d.x !== null && d.y !== null && d.width !== null && d.height !== null;
}

function geomEqual(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function geomClose(a, b, tol) {
  return Math.abs(a.x - b.x) <= tol &&
    Math.abs(a.y - b.y) <= tol &&
    Math.abs(a.width - b.width) <= tol &&
    Math.abs(a.height - b.height) <= tol;
}

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
