# Project Overview: Primo Maps Management System

## Executive Summary

A web application to manage SVG maps and location mappings for the Primo NDE shelf-map addon used at TAU Central Library. The system replaces the current Google Sheets-based workflow with a robust, self-hosted solution on AWS.

## Problem Statement

The existing Primo NDE shelf-map addon has limitations:
- **SVG maps** are bundled with the Angular component code, requiring code deployments for map updates
- **Mapping CSV** is maintained on Google Sheets, creating external dependency and limited control
- **No access control** for who can modify the mapping data
- **No management interface** for non-technical staff to update content

## Solution

Build a web application hosted on AWS that provides:
1. Centralized storage for SVG maps and mapping data
2. Real-time file serving to the Primo NDE Angular component
3. User-friendly editing interface for the mapping CSV
4. File management for SVG maps (upload/delete/replace)
5. Role-based authentication (admin/editor)

## Current Infrastructure

| Component | Status | Details |
|-----------|--------|---------|
| AWS Account | Ready | Free tier access |
| AWS CLI | Ready | Configured and working |
| S3 Bucket | Created | `tau-cenlib-primo-assets-hagay-3602` |
| CloudFront | Created | Distribution configured |
| Static Hosting | Verified | Successfully serving index.html |

## Key Stakeholders

- **Library Staff** - Edit mapping data, upload new maps
- **System Administrator** - Manage users, system configuration
- **Primo NDE Users** - End users who see the shelf maps (via Angular component)

## Success Criteria

1. Library staff can update mapping CSV without technical assistance
2. SVG maps can be updated without code deployment
3. Angular component loads data from AWS instead of Google Sheets
4. System handles expected traffic within AWS free tier limits
5. Only authorized users can modify content
