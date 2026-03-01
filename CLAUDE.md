# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Primo Maps Management System - A web application to manage SVG maps and location mappings for the Primo NDE shelf-map addon at TAU Central Library. Replaces Google Sheets-based workflow with a self-hosted AWS solution.

## AWS Infrastructure

- **S3 Bucket**: `tau-cenlib-primo-assets-hagay-3602`
- **CloudFront Distribution ID**: `E5SR0E5GM5GSB`
- **CloudFront URL**: `https://d3h8i7y9p8lyw7.cloudfront.net`
- **Account**: AWS Free Tier

### Live URLs
- CSV: `https://d3h8i7y9p8lyw7.cloudfront.net/data/mapping.csv`
- Maps: `https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_{0,1,2}.svg`

## Architecture

Serverless architecture using:
- S3 for storage (CSV mapping file, SVG maps, admin SPA)
- CloudFront CDN for public file serving
- Lambda + API Gateway for admin operations
- Cognito for authentication (admin/editor roles)

## Project Structure

```
docs/                    # Design phase documentation
  01-PROJECT-OVERVIEW.md # Problem statement and solution summary
  02-REQUIREMENTS.md     # Functional and non-functional requirements
  03-ARCHITECTURE.md     # System design and tech stack
  04-PROJECT-PHASES.md   # Implementation phases and tasks
  PHASE-1-TASKS.md       # Phase 1 detailed task breakdown
data/
  mapping.csv            # Location mapping data (synced to S3)
maps/
  floor_0.svg            # Floor maps (synced to S3)
  floor_1.svg
  floor_2.svg
bucket-policy.json       # S3 public read policy
cors-config.json         # S3 CORS configuration
```

## Key Integrations

- **Primo NDE**: Angular component consumes CSV and SVG files from CloudFront
- **CORS Allowed Origins**: `tau.primo.exlibrisgroup.com`, `localhost:4200`, `localhost:4201`

## AWS CLI Commands

```bash
# Upload files to S3
aws s3 cp file.csv s3://tau-cenlib-primo-assets-hagay-3602/data/
aws s3 sync ./maps s3://tau-cenlib-primo-assets-hagay-3602/maps/

# List bucket contents
aws s3 ls s3://tau-cenlib-primo-assets-hagay-3602/

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id E5SR0E5GM5GSB --paths "/*"
```
