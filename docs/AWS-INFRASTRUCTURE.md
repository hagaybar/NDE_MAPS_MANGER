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

CloudFront is configured to handle CORS for cross-origin requests from the Primo NDE addon.

#### Response Headers Policy

- **Policy:** `Managed-CORS-With-Preflight` (AWS Managed)
- **Policy ID:** `5cc3b908-e619-4b99-88e5-2cf7f45965bd`

This policy adds the following headers to responses:
- `Access-Control-Allow-Origin: *` (or reflects the Origin header)
- `Access-Control-Allow-Methods: GET, HEAD, PUT, POST, PATCH, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: *`
- `Access-Control-Expose-Headers: *`
- `Access-Control-Max-Age: 86400`

#### Allowed HTTP Methods

- GET
- HEAD
- OPTIONS (for CORS preflight)

#### Cache Behavior

- **Cache Policy:** CachingOptimized
- **Response Headers Policy:** Managed-CORS-With-Preflight

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

### S3 CORS Configuration

File: `cors-config.json`

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

Apply S3 CORS configuration:

```bash
aws s3api put-bucket-cors \
  --bucket tau-cenlib-primo-assets-hagay-3602 \
  --cors-configuration file://cors-config.json
```

Verify S3 CORS configuration:

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

# Expected headers in response:
# access-control-allow-origin: http://localhost:4201
# access-control-allow-methods: GET, HEAD
# access-control-max-age: 3600
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

1. **"No 'Access-Control-Allow-Origin' header"**
   - Verify CloudFront Response Headers Policy is attached
   - Check S3 CORS configuration includes the requesting origin
   - Invalidate CloudFront cache

2. **403 on OPTIONS preflight**
   - Ensure CloudFront AllowedMethods includes OPTIONS
   - Check Response Headers Policy is `Managed-CORS-With-Preflight`

3. **CORS works for some origins but not others**
   - Add missing origins to S3 CORS `AllowedOrigins`
   - Invalidate CloudFront cache after changes

### Useful Commands

```bash
# Check CloudFront distribution status
aws cloudfront get-distribution --id E5SR0E5GM5GSB --query 'Distribution.Status'

# List CloudFront response headers policies
aws cloudfront list-response-headers-policies --type managed

# View S3 bucket policy
aws s3api get-bucket-policy --bucket tau-cenlib-primo-assets-hagay-3602
```
