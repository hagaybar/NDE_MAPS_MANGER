# Phase 1: Foundation & File Serving - Detailed Tasks

## Summary

| Item | Value |
|------|-------|
| S3 Bucket | `tau-cenlib-primo-assets-hagay-3602` |
| CloudFront Distribution | `E5SR0E5GM5GSB` |
| CORS Domain | `tau.primo.exlibrisgroup.com` |
| CSV File | `call_no_to_svg_mapping_v_3 - sheet1.csv` (419 rows, 14 columns) |
| SVG Files | `Floor_0.svg`, `Floor_1.SVG`, `Floor_2.SVG` (3 floor maps) |
| svgCode | References element IDs **inside** SVG files (shelves, desks) |

---

## Task 1: Organize Local Files

**Goal**: Prepare files for upload with consistent naming

### 1.1 Create local folder structure
```bash
mkdir -p maps data
```

### 1.2 Rename and move files
```bash
# Standardize SVG filenames (lowercase .svg extension)
mv Floor_0.svg maps/floor_0.svg
mv Floor_1.SVG maps/floor_1.svg
mv Floor_2.SVG maps/floor_2.svg

# Rename CSV to simpler name
mv "call_no_to_svg_mapping_v_3 - sheet1.csv" data/mapping.csv
```

**Decision**: SVG naming convention
- Option A: Keep original names (`Floor_0.svg`)
- Option B: Lowercase with underscores (`floor_0.svg`) ← Recommended
- Option C: Different naming scheme

---

## Task 2: Create S3 Folder Structure

**Goal**: Set up bucket folders matching the architecture

### 2.1 Create folders in S3
```bash
# Create folder placeholders (S3 doesn't have real folders, but this creates the structure)
aws s3api put-object --bucket tau-cenlib-primo-assets-hagay-3602 --key data/
aws s3api put-object --bucket tau-cenlib-primo-assets-hagay-3602 --key maps/
aws s3api put-object --bucket tau-cenlib-primo-assets-hagay-3602 --key versions/
aws s3api put-object --bucket tau-cenlib-primo-assets-hagay-3602 --key versions/data/
aws s3api put-object --bucket tau-cenlib-primo-assets-hagay-3602 --key versions/maps/
aws s3api put-object --bucket tau-cenlib-primo-assets-hagay-3602 --key admin/
```

---

## Task 3: Upload Files to S3

**Goal**: Upload CSV and SVG files to their respective folders

### 3.1 Upload CSV mapping file
```bash
aws s3 cp data/mapping.csv s3://tau-cenlib-primo-assets-hagay-3602/data/mapping.csv \
  --content-type "text/csv; charset=utf-8"
```

### 3.2 Upload SVG files
```bash
aws s3 sync maps/ s3://tau-cenlib-primo-assets-hagay-3602/maps/ \
  --content-type "image/svg+xml"
```

### 3.3 Verify uploads
```bash
aws s3 ls s3://tau-cenlib-primo-assets-hagay-3602/data/
aws s3 ls s3://tau-cenlib-primo-assets-hagay-3602/maps/
```

---

## Task 4: Configure S3 Bucket Policy

**Goal**: Allow public read access to `/data/` and `/maps/`

### 4.1 Create bucket policy JSON
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadData",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::tau-cenlib-primo-assets-hagay-3602/data/*"
    },
    {
      "Sid": "PublicReadMaps",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::tau-cenlib-primo-assets-hagay-3602/maps/*"
    }
  ]
}
```

### 4.2 Apply bucket policy
```bash
aws s3api put-bucket-policy \
  --bucket tau-cenlib-primo-assets-hagay-3602 \
  --policy file://bucket-policy.json
```

**Note**: The `/versions/` and `/admin/` folders are NOT included - they remain private.

---

## Task 5: Configure CORS

**Goal**: Allow the Primo NDE Angular component to fetch files

### 5.1 Create CORS configuration JSON
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://tau.primo.exlibrisgroup.com",
        "http://localhost:4200"
      ],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

### 5.2 Apply CORS configuration
```bash
aws s3api put-bucket-cors \
  --bucket tau-cenlib-primo-assets-hagay-3602 \
  --cors-configuration file://cors-config.json
```

**Decision**: Include `localhost:4200` for local Angular development?
- Yes ← Recommended for testing
- No (production only)

---

## Task 6: Verify CloudFront Configuration

**Goal**: Ensure CloudFront correctly serves files from S3

### 6.1 Get CloudFront domain
```bash
aws cloudfront get-distribution --id E5SR0E5GM5GSB \
  --query "Distribution.DomainName" --output text
```

### 6.2 Test file access via CloudFront
```bash
# Get the CloudFront URL (replace with actual domain)
CLOUDFRONT_URL="https://<distribution-domain>.cloudfront.net"

# Test CSV access
curl -I "$CLOUDFRONT_URL/data/mapping.csv"

# Test SVG access
curl -I "$CLOUDFRONT_URL/maps/floor_0.svg"
```

### 6.3 Test CORS headers
```bash
curl -I -H "Origin: https://tau.primo.exlibrisgroup.com" \
  "$CLOUDFRONT_URL/data/mapping.csv"
```

Expected: `Access-Control-Allow-Origin: https://tau.primo.exlibrisgroup.com`

---

## Task 7: Invalidate CloudFront Cache

**Goal**: Ensure CloudFront serves fresh content

### 7.1 Create cache invalidation
```bash
aws cloudfront create-invalidation \
  --distribution-id E5SR0E5GM5GSB \
  --paths "/data/*" "/maps/*"
```

### 7.2 Wait for invalidation to complete
```bash
aws cloudfront wait invalidation-completed \
  --distribution-id E5SR0E5GM5GSB \
  --id <invalidation-id>
```

---

## Task 8: Update Angular Component

**Goal**: Point the Primo NDE component to new AWS URLs

### 8.1 Identify current data source
- Current: Google Sheets URL
- New: `https://<cloudfront-domain>/data/mapping.csv`

### 8.2 Update component configuration
```typescript
// Before
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/.../pub?output=csv';

// After
const CSV_URL = 'https://<cloudfront-domain>/data/mapping.csv';
const MAPS_BASE_URL = 'https://<cloudfront-domain>/maps/';
```

### 8.3 Update SVG loading logic
```typescript
// Before (bundled)
const svgPath = `assets/maps/Floor_${floor}.svg`;

// After (from S3)
const svgPath = `${MAPS_BASE_URL}floor_${floor}.svg`;

// The svgCode is used to highlight elements INSIDE the SVG:
// e.g., document.getElementById(svgCode).classList.add('highlight');
```

**Decision**: How is the Angular component deployed?
- Primo NDE customization package
- Separate deployment process
- Need guidance

---

## Task 9: Test End-to-End

**Goal**: Verify everything works in production

### 9.1 Test in browser
1. Open Primo NDE search interface
2. Find an item with shelf location
3. Click "Shelf Map" button
4. Verify map displays correctly

### 9.2 Check browser console
- No CORS errors
- CSV loads successfully
- SVG loads and highlights correctly

### 9.3 Verify caching
```bash
# Check CloudFront cache status
curl -I "$CLOUDFRONT_URL/data/mapping.csv" | grep -i "x-cache"
```

---

## Checklist Summary

- [ ] **Task 1**: Organize local files (rename, move to folders)
- [ ] **Task 2**: Create S3 folder structure
- [ ] **Task 3**: Upload CSV and SVG files
- [ ] **Task 4**: Configure S3 bucket policy (public read for data/maps)
- [ ] **Task 5**: Configure CORS for Primo domain
- [ ] **Task 6**: Verify CloudFront serves files
- [ ] **Task 7**: Invalidate CloudFront cache
- [ ] **Task 8**: Update Angular component URLs
- [ ] **Task 9**: Test end-to-end

---

## Open Decisions

| # | Decision | Status |
|---|----------|--------|
| 1 | SVG file naming | **Lowercase** (`floor_0.svg`) - can rename freely |
| 2 | Include localhost in CORS | **Yes** - for dev testing |
| 3 | Angular component update | To be done when Phase 1 is complete |

## How the Map System Works

```
User clicks "Shelf Map" in Primo
         │
         ▼
Angular reads CSV row for the item
         │
         ├── floor = 1
         └── svgCode = "CC_1-4"
         │
         ▼
Angular loads: floor_1.svg
         │
         ▼
Angular highlights element with id="CC_1-4" inside the SVG
         │
         ▼
User sees floor map with highlighted shelf location
```

---

## Files to Create

```
primo_maps/
├── data/
│   └── mapping.csv          # Renamed from original
├── maps/
│   ├── floor_0.svg          # Renamed from Floor_0.svg
│   ├── floor_1.svg          # Renamed from Floor_1.SVG
│   └── floor_2.svg          # Renamed from Floor_2.SVG
├── bucket-policy.json       # S3 bucket policy
└── cors-config.json         # S3 CORS configuration
```
