# Admin Client-Side Logging Process

## Purpose
Add comprehensive client-side logging to the Primo Maps Admin SPA to debug the "Failed to fetch" error when saving from the errors dashboard.

## Problem Being Solved
The user encountered an error when trying to save changes via the errors dashboard:
- Hebrew message: "נא לתקן שגיאות לפני שמירה" (Please fix errors before saving)
- Error: "Failed to fetch"

This error occurs after a few seconds delay, indicating the validation passes but the API call fails. Without logging, it's difficult to diagnose whether it's a CORS issue, authentication problem, network failure, or server error.

## Process Steps

### Phase 1: Create Logging Service
Creates `admin/services/logger.js` with:
- Structured logging with levels (debug, info, warn, error)
- Circular buffer for log storage (500 entries)
- API call wrapper with timing
- Global error handlers (window.onerror, unhandledrejection)
- Export functionality

### Phase 2: Integrate API Logging
Modifies `admin/components/errors-dashboard.js` to:
- Log all fetch requests with full details
- Log responses including status and body
- Capture network errors with context
- Log user interactions (fix button clicks)

### Phase 3: Create Debug Console UI
Creates `admin/components/debug-console.js` with:
- Floating panel UI
- Keyboard shortcut toggle (Ctrl+Shift+D)
- Real-time log display
- Filtering and search
- Export button

### Phase 4: Integrate into App
Modifies `admin/app.js` to:
- Initialize the logging system
- Set up global error handlers
- Make logger available on window object

## Files Created/Modified
- **Created**: `admin/services/logger.js`
- **Created**: `admin/components/debug-console.js`
- **Modified**: `admin/components/errors-dashboard.js`
- **Modified**: `admin/app.js`

## Usage After Implementation
1. Open the admin app
2. Press `Ctrl+Shift+D` to open debug console
3. Reproduce the error
4. View logs in debug console or export as JSON
5. For console debugging: `window.__logger.getLogs()`

## Inputs
```json
{
  "projectRoot": "/home/hagaybar/projects/primo_maps",
  "adminDir": "admin"
}
```
