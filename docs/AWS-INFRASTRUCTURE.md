> **Status:** Current · Updated 2026-11-24 · CloudFront / S3 / CORS configuration reference.
> **2026-07-08:** S3 bucket CORS **removed**; CloudFront now owns CORS and serves `Access-Control-Allow-Origin: *`. See the CORS and S3 CORS sections below.

# AWS Infrastructure Configuration

This document describes the AWS infrastructure configuration for the Primo Maps Management System.

## Overview

| Service | Resource | ID/Name |
|---------|----------|---------|
| S3 | Bucket | `tau-cenlib-primo-assets-hagay-3602` |
| CloudFront | Distribution | `E5SR0E5GM5GSB` |
| CloudFront | Domain | `d3h8i7y9p8lyw7.cloudfront.net` |
| API Gateway | REST API | `tt3xt4tr09` |
| Cognito | User Pool | `us-east-1_g9q5cPhVg` |

---

## CloudFront Configuration

### Distribution Settings

- **Distribution ID:** `E5SR0E5GM5GSB`
- **Domain:** `d3h8i7y9p8lyw7.cloudfront.net`
- **Origin:** S3 bucket `tau-cenlib-primo-assets-hagay-3602`
- **Origin Access:** Origin Access Control (OAC)

### CORS Configuration

> **⚠️ 2026-07-08 — CORS is handled entirely by CloudFront. The S3 bucket has NO
> CORS configuration (removed on purpose — see "S3 CORS Configuration" below).**

Public assets (`/data/*`, `/maps/*`) are served cross-origin to the Primo NDE
addon. CORS headers come **only** from the CloudFront Response Headers Policy;
S3 no longer sets any CORS headers of its own.

#### Response Headers Policy

- **Policy:** `Managed-CORS-With-Preflight` (AWS Managed)
- **Policy ID:** `5cc3b908-e619-4b99-88e5-2cf7f45965bd`
- **Origin override:** `false` — the policy only *adds* CORS headers when the
  origin (S3) doesn't already send them. That is exactly why **removing S3's CORS
  is what lets the policy's `*` take effect** (see the warning below).

With no S3 CORS, every response now carries a single, origin-independent set:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, HEAD, PUT, POST, PATCH, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: *`
- `Access-Control-Expose-Headers: *`
- *(no `Access-Control-Allow-Credentials` — assets are public, requests are non-credentialed)*

#### Allowed HTTP Methods

- GET
- HEAD
- OPTIONS (for CORS preflight)

> **Known/non-blocking:** the OPTIONS preflight currently returns `403` from the
> origin. It does **not** affect the addon, whose CSV/SVG loads are *simple* GETs
> (no custom headers → no preflight). It would only matter if a client sent a
> non-simple request header.

#### Cache Behavior

- **Cache Policy:** `Managed-CachingOptimized` — **keys the cache on the URL path
  only** (no `Origin` header, no query string). This is the crux of the 2026-07-08
  outage: while S3 was sending a *per-origin* `Access-Control-Allow-Origin`,
  CloudFront cached one origin's value and replayed it to every requester (there is
  no `Vary: Origin`), so CORS failed for every other origin. A single `*`
  (achieved by removing S3 CORS) is safe to cache under this policy.
- **Response Headers Policy:** `Managed-CORS-With-Preflight`

### Updating CloudFront CORS Configuration

To modify CORS settings via AWS CLI:

```bash
# Get current distribution config
aws cloudfront get-distribution-config --id E5SR0E5GM5GSB --output json > cf-config.json

# Extract ETag for update
ETAG=$(aws cloudfront get-distribution-config --id E5SR0E5GM5GSB --query 'ETag' --output text)

# Modify the config (update AllowedMethods, ResponseHeadersPolicyId, etc.)
# Then apply:
aws cloudfront update-distribution \
  --id E5SR0E5GM5GSB \
  --distribution-config file://cf-dist-config.json \
  --if-match $ETAG

# Invalidate cache after changes
aws cloudfront create-invalidation --distribution-id E5SR0E5GM5GSB --paths "/*"
```

---

## S3 Configuration

### Bucket Structure

```
tau-cenlib-primo-assets-hagay-3602/
├── data/
│   └── mapping.csv              # Location mapping (public)
├── maps/
│   ├── floor_0.svg              # Floor maps (public)
│   ├── floor_1.svg
│   └── floor_2.svg
├── versions/                    # Version history (protected)
│   ├── data/
│   └── maps/
└── admin/                       # Admin SPA (protected)
    └── index.html
```

### S3 CORS Configuration — REMOVED 2026-07-08

> **⚠️ The S3 bucket intentionally has NO CORS configuration. Do NOT re-add it.**
> CORS is handled entirely by CloudFront (see "CORS Configuration" above).
> Re-applying an S3 CORS rule re-introduces the 2026-07-08 cache-poisoning outage:
> the rule reflected the *requesting* origin, and the `CachingOptimized` cache
> policy (which ignores the `Origin` header) then froze one origin's
> `Access-Control-Allow-Origin` and served it to every requester, breaking the
> Shelf Map addon in production.

The former rule (historical reference only — **do not apply**) was:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://tau.primo.exlibrisgroup.com",
        "http://localhost:4200",
        "http://localhost:4201"
      ],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

It is preserved for the record only in `cors-config.removed-2026-07-08.json`.

**What was done (2026-07-08):**

```bash
aws s3api delete-bucket-cors --bucket tau-cenlib-primo-assets-hagay-3602
aws cloudfront create-invalidation --distribution-id E5SR0E5GM5GSB --paths "/*"
```

**Verify it stays removed** (expect `NoSuchCORSConfiguration`):

```bash
aws s3api get-bucket-cors --bucket tau-cenlib-primo-assets-hagay-3602
```

### Bucket Policy

File: `bucket-policy.json`

The bucket policy allows:
- Public read access to `/data/*` and `/maps/*` via CloudFront OAC
- CloudFront distribution access for all paths

---

## Public Asset URLs

These URLs are publicly accessible without authentication:

| Asset | URL |
|-------|-----|
| CSV Mapping | `https://d3h8i7y9p8lyw7.cloudfront.net/data/mapping.csv` |
| Floor 0 Map | `https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_0.svg` |
| Floor 1 Map | `https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_1.svg` |
| Floor 2 Map | `https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_2.svg` |
| Admin SPA (login required to use) | `https://d3h8i7y9p8lyw7.cloudfront.net/admin/` |

---

## API Gateway Configuration

### Endpoints

Base URL: `https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod`

| Endpoint | Methods | Auth | Description |
|----------|---------|------|-------------|
| `/api/csv` | GET, PUT | JWT | CSV operations |
| `/api/svg` | GET, POST, DELETE | JWT | SVG file operations |
| `/api/versions/csv` | GET | JWT | CSV version history |
| `/api/versions/svg` | GET | JWT | SVG version history |
| `/api/users` | GET, POST | JWT (admin) | User management |

### API Gateway CORS

Each endpoint has an OPTIONS method configured with MOCK integration returning:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token`

---

## Testing CORS

### Test CloudFront CORS (Public Assets)

```bash
# Test SVG with Origin header
curl -I -H "Origin: http://localhost:4201" \
  "https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_1.svg"

# Expected headers in response (the same for every Origin since 2026-07-08):
# access-control-allow-origin: *
```

### Test API Gateway CORS

```bash
# Test OPTIONS preflight
curl -I -X OPTIONS \
  -H "Origin: https://d3h8i7y9p8lyw7.cloudfront.net" \
  -H "Access-Control-Request-Method: GET" \
  "https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod/api/svg"

# Expected: 200 with CORS headers
```

---

## Cache Management

### Invalidate CloudFront Cache

```bash
# Invalidate all paths
aws cloudfront create-invalidation \
  --distribution-id E5SR0E5GM5GSB \
  --paths "/*"

# Invalidate specific paths
aws cloudfront create-invalidation \
  --distribution-id E5SR0E5GM5GSB \
  --paths "/data/mapping.csv" "/maps/*"
```

### Check Invalidation Status

```bash
aws cloudfront get-invalidation \
  --distribution-id E5SR0E5GM5GSB \
  --id <invalidation-id>
```

---

## Troubleshooting

### CORS Errors

If the Primo addon reports CORS errors:

1. Verify the `Managed-CORS-With-Preflight` Response Headers Policy is attached
   to the CloudFront behavior.
2. Ensure OPTIONS is in the behavior's AllowedMethods.
3. Confirm S3 CORS is **absent**: `aws s3api get-bucket-cors --bucket
   tau-cenlib-primo-assets-hagay-3602` must answer `NoSuchCORSConfiguration`.
   **Never** add origins to an S3 CORS rule: that re-creates the 2026-07-08
   outage (see "S3 CORS Configuration" above).
4. Invalidate the CloudFront cache after any change.

"CORS works for some origins but not others" is the symptom of S3 CORS being
back: remove it, then invalidate.

### Useful Commands

```bash
# Check CloudFront distribution status
aws cloudfront get-distribution --id E5SR0E5GM5GSB --query 'Distribution.Status'

# List CloudFront response headers policies
aws cloudfront list-response-headers-policies --type managed

# View S3 bucket policy
aws s3api get-bucket-policy --bucket tau-cenlib-primo-assets-hagay-3602
```

## Bundle Invariant Feature Flag

The `putCsv` Lambda enforces a CSV-vs-SVG consistency invariant — every row's
`svgCode` must resolve to a shelf in the corresponding floor's SVG.

### Env var: `BUNDLE_INVARIANT_ENABLED`

- **Production:** `true` since 2026-05-17 — violating writes are rejected with
  HTTP 422. Confirm with `aws lambda get-function-configuration --function-name
  primo-maps-putCsv | jq '.Environment.Variables'`.
- **When unset or `false`:** log violations to CloudWatch; do not reject the write.
- Rollout history: `docs/superpowers/specs/2026-05-13-sot-bundle-invariant-design.md`.

### To flip the flag

`--environment` **replaces all** of the function's variables, so read them first
and pass every one back with only the flag changed. In particular, dropping
`COGNITO_CLIENT_ID` silently turns off the token audience check
(`auth-middleware.mjs` is fail-open on it).

```bash
aws lambda get-function-configuration --function-name primo-maps-putCsv \
  --query 'Environment.Variables'
aws lambda update-function-configuration \
  --function-name primo-maps-putCsv \
  --environment "Variables={BUNDLE_INVARIANT_ENABLED=true,COGNITO_USER_POOL_ID=us-east-1_g9q5cPhVg,COGNITO_CLIENT_ID=<client-id>,<any other existing vars>}"
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


## Staging API routes

Six new POST/GET endpoints under `/api/staging` on API Gateway `tt3xt4tr09`:

| Path | Method | Lambda | Purpose |
|---|---|---|---|
| `/api/staging/upload` | POST | primo-maps-uploadStagingSvg | Upload a new SVG to staging |
| `/api/staging/validate` | POST | primo-maps-validateStaging | Run bundle-consistency check |
| `/api/staging/reconcile` | POST | primo-maps-applyReconcileToStaging | Apply a rename/delete map to staging CSV |
| `/api/staging/promote` | POST | primo-maps-promoteStaging | Copy staging → production |
| `/api/staging/clear` | POST | primo-maps-clearStaging | Discard staging area |
| `/api/staging/status` | GET | primo-maps-getStagingStatus | Read current staging state |

All require admin role (enforced by `role-auth.mjs` inside each Lambda). All
share the existing `primo-maps-lambda-role` IAM role (AmazonS3FullAccess +
CloudFrontFullAccess + AWSLambdaBasicExecutionRole + Cognito inline).

Frontend gating: routes are used when `window.__USE_STAGING_FLOW__ === true`
(see `admin/components/svg-manager.js`, `USE_STAGING_FLOW` constant).
`admin/index.html` sets it to `true`, so the staging flow is on.

Reproducible redeploy: `deploy-staging-lambdas.sh` at the repo root is
idempotent — it skip-with-logs any resource that already exists and creates
only what's missing.
