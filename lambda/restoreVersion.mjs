/**
 * restoreVersion Lambda function
 * Restores a CSV version from versions/data/ to data/mapping.csv
 *
 * Endpoint: POST /api/versions/csv/{versionId}/restore
 * Request body: {} (username extracted from auth token)
 *
 * Flow:
 * 1. Validate versionId and authenticate user
 * 2. Get current file (data/mapping.csv) and save as backup
 * 3. Get version file and copy to data/mapping.csv
 * 4. Invalidate CloudFront cache
 * 5. Enforce retention policy (MAX_VERSIONS = 20)
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { parseCsvContent } from './range-validation.mjs';
import { fetchFloorSvgs } from './shared/fetch-floor-svgs.mjs';
import { validateBundle } from './shared/validateBundle.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const cloudfront = new CloudFrontClient({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const DISTRIBUTION_ID = 'E5SR0E5GM5GSB';
const MAX_VERSIONS = 20;

// CORS headers
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Version filename pattern: mapping_{timestamp}_{username}.csv
// Username portion allows letters/digits plus the chars Cognito usernames
// commonly contain: dot, at-sign, plus, underscore, dash. Path-traversal
// chars ('/', '..') are blocked by a separate guard in isValidVersionId.
const VERSION_PATTERN = /^mapping_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[a-zA-Z0-9._@+-]+\.csv$/;

/**
 * Validate versionId format
 * @param {string} versionId - Version filename
 * @returns {boolean} - True if valid
 */
const isValidVersionId = (versionId) => {
  if (!versionId) return false;
  // Check for path traversal attempts
  if (versionId.includes('..') || versionId.includes('/')) return false;
  return VERSION_PATTERN.test(versionId);
};

/**
 * Check if request is OPTIONS preflight
 * @param {Object} event - Lambda event
 * @returns {boolean}
 */
const isOptionsRequest = (event) => {
  return event.httpMethod === 'OPTIONS' ||
    event.requestContext?.http?.method === 'OPTIONS';
};

/**
 * Parse the override flag from the POST body.
 * Override transport = POST body { override: true }. Defaults to false and
 * never throws — the existing empty-body ({} / missing) requests stay valid.
 * @param {Object} event - Lambda event
 * @returns {boolean}
 */
function parseOverrideFlag(event) {
  try {
    return JSON.parse(event.body || '{}').override === true;
  } catch (_e) {
    return false;
  }
}

/**
 * Aggregate validateBundle errors into one entry per missing shelf, counting
 * the catalog ENTRIES (rows) that point at it (#73/#129 phrasing: count entries,
 * not distinct shelf codes). Covers both 'shelf-not-found' and 'invalid-floor'.
 * @param {Array<{svgCode:string, floor:(number|string)}>} errors
 * @returns {Array<{svgCode:string, floor:(number|string), affectedRowCount:number}>}
 */
function summarizeOrphans(errors) {
  const byKey = new Map();
  for (const e of errors) {
    const floorKey = e.floor === undefined || e.floor === null ? '' : String(e.floor);
    const key = `${e.svgCode}::${floorKey}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.affectedRowCount += 1;
    } else {
      byKey.set(key, { svgCode: e.svgCode, floor: e.floor, affectedRowCount: 1 });
    }
  }
  return Array.from(byKey.values());
}

export const handler = async (event) => {
  try {
    // Handle OPTIONS preflight
    if (isOptionsRequest(event)) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: ''
      };
    }

    // Validate token
    const authResult = await validateToken(event);
    if (!authResult.isValid) {
      return createAuthResponse(authResult.statusCode, { error: authResult.error });
    }

    // Check permission - editor role required for restore-versions
    const permResult = checkPermission(authResult.user, 'restore-versions');
    if (!permResult.allowed) {
      return createAuthResponse(403, { error: permResult.reason });
    }

    // Get versionId from path parameters
    const versionId = event.pathParameters?.versionId;

    // Validate versionId
    if (!versionId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'versionId is required' })
      };
    }

    if (!isValidVersionId(versionId)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid versionId format' })
      };
    }

    // Extract username from authenticated user token instead of body
    const username = authResult.user.username || 'unknown';
    const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `versions/data/mapping_${timestamp}_${sanitizedUsername}.csv`;
    const versionKey = `versions/data/${versionId}`;

    // Step 1: Get version file first to verify it exists
    let versionContent;
    try {
      const getVersionCommand = new GetObjectCommand({
        Bucket: BUCKET,
        Key: versionKey
      });
      const versionResponse = await s3.send(getVersionCommand);
      versionContent = await versionResponse.Body.transformToString();
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: `Version not found: ${versionId}` })
        };
      }
      throw error;
    }

    // --- Bundle invariant check (warn-and-allow-override, #55) ---
    // Parse the version being restored and validate its svgCodes against the
    // CURRENT production floor SVGs. Using CURRENT maps is the whole point of
    // #55: an old version may reference shelves since deleted from today's
    // floor_N.svg. Unlike putCsv this is a WARN gate: without an explicit
    // override we refuse to write and return a structured 409. Running here
    // (after Step 1, before Step 2) guarantees AC2/AC4 — when the warn path
    // fires, NO backup is created and data/mapping.csv is NOT written.
    const overrideRequested = parseOverrideFlag(event);
    const parsedRows = parseCsvContent(versionContent).rows;
    const csvRowsForValidation = parsedRows.map((row, idx) => ({
      rowIndex: idx,
      svgCode: String(row.svgCode || ''),
      // Pass the raw floor — validateBundle validates {0,1,2} and must see a
      // blank as blank (not Number('')===0). See #88.
      floor: row.floor,
    }));
    // Only fetch the current floor maps and validate when the version actually
    // carries shelf references (a non-empty svgCode). A version with no svgCode
    // column has nothing to resolve against a shelf set, so the bundle check is
    // moot and we skip the (I/O-heavy) floor-SVG fetch entirely. Real catalog
    // CSV always has the 14-column header incl. svgCode, so the gate stays fully
    // effective in production.
    const hasShelfRefs = csvRowsForValidation.some((r) => r.svgCode !== '');
    const validation = hasShelfRefs
      ? validateBundle(csvRowsForValidation, await fetchFloorSvgs(BUCKET))
      : { ok: true, errors: [] };

    if (!validation.ok && !overrideRequested) {
      const orphans = summarizeOrphans(validation.errors);
      const affectedEntryCount = validation.errors.length;
      console.log(JSON.stringify({
        level: 'WARN',
        metric: 'bundle.violations.restore_blocked',
        errorCount: validation.errors.length,
        orphans,
      }));
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({
          requiresOverride: true,
          applied: false,
          orphans,
          affectedEntryCount,
          error: 'Restore would republish references to shelves that no longer exist on the current floor maps.',
        }),
      };
    }
    // --- End bundle invariant check ---

    // When the caller deliberately overrode a failing validation, emit an
    // audited, attributable record to CloudWatch that a known-broken version
    // was restored on purpose. (#63: log sub, not email; svgCodes/floors aren't PII.)
    const overrodeBrokenBundle = !validation.ok && overrideRequested;
    let orphanSummary = null;
    if (overrodeBrokenBundle) {
      const orphans = summarizeOrphans(validation.errors);
      const affectedEntryCount = validation.errors.length;
      orphanSummary = { overridden: true, affectedEntryCount, orphans };
      console.log(JSON.stringify({
        level: 'WARN',
        metric: 'bundle.violations.restore_overridden',
        user: authResult.user.sub,
        errorCount: validation.errors.length,
        affectedEntryCount,
        orphans,
      }));
    }

    // Step 2: Get current file and save as backup (if it exists)
    let backupCreated = null;
    try {
      const getCurrentCommand = new GetObjectCommand({
        Bucket: BUCKET,
        Key: 'data/mapping.csv'
      });
      const currentResponse = await s3.send(getCurrentCommand);
      const currentContent = await currentResponse.Body.transformToString();

      // Save backup
      const saveBackupCommand = new PutObjectCommand({
        Bucket: BUCKET,
        Key: backupKey,
        Body: currentContent,
        ContentType: 'text/csv; charset=utf-8'
      });
      await s3.send(saveBackupCommand);
      backupCreated = backupKey;
      console.log(`Created backup: ${backupKey}`);
    } catch (error) {
      // If current file doesn't exist, that's okay - skip backup
      if (error.name !== 'NoSuchKey') {
        console.error('Error creating backup:', error);
        throw error;
      }
      console.log('No current file exists, skipping backup');
    }

    // Step 3: Write version content to data/mapping.csv
    const putCommand = new PutObjectCommand({
      Bucket: BUCKET,
      Key: 'data/mapping.csv',
      Body: versionContent,
      ContentType: 'text/csv; charset=utf-8'
    });
    await s3.send(putCommand);
    console.log(`Restored version: ${versionKey} to data/mapping.csv`);

    // Step 4: Enforce retention policy - prune old versions (keep last MAX_VERSIONS)
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'versions/data/mapping_'
    });
    const listResponse = await s3.send(listCommand);

    if (listResponse.Contents && listResponse.Contents.length > MAX_VERSIONS) {
      // Sort by LastModified descending (newest first)
      const sortedVersions = listResponse.Contents.sort(
        (a, b) => new Date(b.LastModified) - new Date(a.LastModified)
      );

      // Get versions to delete (all except the newest MAX_VERSIONS)
      const versionsToDelete = sortedVersions.slice(MAX_VERSIONS);

      if (versionsToDelete.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: {
            Objects: versionsToDelete.map(obj => ({ Key: obj.Key })),
            Quiet: true
          }
        });
        await s3.send(deleteCommand);
        console.log(`Pruned ${versionsToDelete.length} old versions`);
      }
    }

    // Step 5: Invalidate CloudFront cache
    const invalidationCommand = new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `restore-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ['/data/mapping.csv']
        }
      }
    });
    await cloudfront.send(invalidationCommand);
    console.log('CloudFront cache invalidated for /data/mapping.csv');

    // Build response
    const response = {
      success: true,
      message: 'Version restored successfully',
      restoredFrom: versionKey
    };

    if (backupCreated) {
      response.backupCreated = backupCreated;
    }

    if (orphanSummary) {
      response.orphanSummary = orphanSummary;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
