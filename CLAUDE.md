# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Primo Maps Management System - A web application to manage SVG maps and location mappings for the Primo NDE shelf-map addon at TAU Central Library. Replaces Google Sheets-based workflow with a self-hosted AWS solution.

## AWS Infrastructure

- **S3 Bucket**: `tau-cenlib-primo-assets-hagay-3602`
- **CloudFront Distribution ID**: `E5SR0E5GM5GSB`
- **CloudFront URL**: `https://d3h8i7y9p8lyw7.cloudfront.net`
- **API Gateway**: `tt3xt4tr09` - `https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod`
- **Cognito User Pool**: `us-east-1_g9q5cPhVg`

### Live URLs (Public - No Auth Required)
- CSV: `https://d3h8i7y9p8lyw7.cloudfront.net/data/mapping.csv`
- Maps: `https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_{0,1,2}.svg`
- Admin: `https://d3h8i7y9p8lyw7.cloudfront.net/admin/`

## Architecture

Serverless architecture using:
- S3 for storage (CSV mapping file, SVG maps, admin SPA)
- CloudFront CDN for public file serving with CORS support
- Lambda + API Gateway for admin operations (JWT protected)
- Cognito for authentication (admin/editor roles)

## Project Structure

```
admin/                   # Admin SPA (vanilla JS)
  components/            # UI components (csv-editor, svg-manager, etc.)
  app.js                 # Main application
  auth-guard.js          # Role-based access control
  i18n.js                # Internationalization (Hebrew/English)
lambda/                  # Lambda functions
  listSvg.mjs            # List SVG files
  deleteSvg.mjs          # Delete SVG with versioning
  putCsv.mjs             # Update CSV with versioning
  getCsv.mjs             # Get CSV content
  auth-middleware.mjs    # JWT validation
e2e/                     # Playwright E2E tests
  fixtures/              # Auth fixtures and mocks
  pages/                 # Page Object Models
  tests/                 # Test specs
docs/                    # Documentation
  AWS-INFRASTRUCTURE.md  # CloudFront/S3/CORS configuration
data/
  mapping.csv            # Location mapping data (419 rows, 14 columns)
maps/
  floor_{0,1,2}.svg      # Floor maps with element IDs for highlighting
```

## Key Integrations

- **Primo NDE**: Angular component consumes CSV and SVG files from CloudFront
- **CORS Allowed Origins**: `tau.primo.exlibrisgroup.com`, `localhost:4200`, `localhost:4201`

### CloudFront CORS Configuration

CloudFront uses `Managed-CORS-With-Preflight` Response Headers Policy for cross-origin requests:
- Policy ID: `5cc3b908-e619-4b99-88e5-2cf7f45965bd`
- AllowedMethods: GET, HEAD, OPTIONS

**If CORS issues occur:**
1. Verify Response Headers Policy is attached to CloudFront behavior
2. Ensure OPTIONS is in AllowedMethods
3. Invalidate CloudFront cache after changes

## Running Tests

```bash
# Install dependencies
npm install && npx playwright install chromium

# Run E2E tests (starts local server automatically)
npx playwright test

# Run with visible browser
npx playwright test --headed

# View test report
npx playwright show-report
```

**Test Coverage:** 113 tests covering authentication, CSV editor, SVG manager, version history, user management, language toggle, and role-based access.

## AWS CLI Commands

```bash
# Upload files to S3
aws s3 cp file.csv s3://tau-cenlib-primo-assets-hagay-3602/data/
aws s3 sync ./maps s3://tau-cenlib-primo-assets-hagay-3602/maps/

# List bucket contents
aws s3 ls s3://tau-cenlib-primo-assets-hagay-3602/

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id E5SR0E5GM5GSB --paths "/*"

# Check/update S3 CORS
aws s3api get-bucket-cors --bucket tau-cenlib-primo-assets-hagay-3602
aws s3api put-bucket-cors --bucket tau-cenlib-primo-assets-hagay-3602 --cors-configuration file://cors-config.json

# Update CloudFront (get config, modify, apply)
aws cloudfront get-distribution-config --id E5SR0E5GM5GSB > cf-config.json
# Edit cf-config.json, then:
aws cloudfront update-distribution --id E5SR0E5GM5GSB --distribution-config file://cf-dist-config.json --if-match <ETag>
```

## Common Issues & Fixes

### Role-based UI not updating for dynamic content
When rendering dynamic content (tables, grids), call `applyRoleBasedUI()` after rendering to ensure admin-only elements are properly hidden for editors.

### CORS errors from Primo NDE addon
1. CloudFront must have `Managed-CORS-With-Preflight` Response Headers Policy
2. CloudFront AllowedMethods must include OPTIONS
3. S3 CORS config must include the requesting origin
4. Invalidate CloudFront cache after any CORS changes

### Lambda CORS headers
All Lambda functions must return CORS headers in responses, including error responses. Use `createAuthResponse()` from `auth-middleware.mjs` for consistent headers.
