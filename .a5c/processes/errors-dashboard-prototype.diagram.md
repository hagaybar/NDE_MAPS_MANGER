# Errors Dashboard Prototype - Process Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ERRORS DASHBOARD PROTOTYPE                            │
│                    Build validation errors page                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: Design & Planning                                              │
│  ─────────────────────────────                                          │
│  • Analyze existing validation-panel.js patterns                        │
│  • Design dashboard component structure                                  │
│  • Define error categories & display format                             │
│  • Plan state management & event handling                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: Implement Dashboard Component                                  │
│  ─────────────────────────────────────────                              │
│  Create: admin/components/errors-dashboard.js                           │
│  Features:                                                               │
│  • Summary cards (errors, warnings, health score)                       │
│  • Grouped error list by category (E001-E006, W001-W003)               │
│  • Filter by severity (all/errors/warnings)                             │
│  • Sort options (row, type, field)                                      │
│  • Click to navigate to row                                             │
│  • Bilingual support (Hebrew/English)                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: Integrate with Admin App                                       │
│  ────────────────────────────────────                                   │
│  Edit: admin/index.html                                                  │
│  • Add "Errors" tab to navigation                                       │
│  • Add #errors-dashboard view container                                 │
│                                                                          │
│  Edit: admin/app.js                                                      │
│  • Import initErrorsDashboard                                           │
│  • Add nav click handler                                                │
│  • Add 'errors' case to showView()                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: Add i18n Translations                                          │
│  ──────────────────────────────                                         │
│  Edit: admin/i18n/en.json                                               │
│  Edit: admin/i18n/he.json                                               │
│  • Add "errors" translation keys                                        │
│  • Navigation label, summary labels, filter options, etc.               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: Add Styles                                                     │
│  ───────────────────                                                    │
│  Edit: admin/styles/app.css                                             │
│  • Dashboard container styles                                            │
│  • Summary cards grid                                                    │
│  • Error list styling with severity colors                              │
│  • RTL-compatible logical properties                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ★ BREAKPOINT: User Review                                               │
│  ─────────────────────────────                                          │
│  Test the dashboard in browser                                           │
│  Provide feedback for iteration                                          │
│  Options: [Approve] or [Need changes]                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  COMPLETE                                                                │
│  ────────                                                               │
│  Dashboard prototype ready for use                                       │
│  Files created in admin/components/ and admin/styles/                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Error Categories Covered

| Code | Type | Description |
|------|------|-------------|
| E001 | Error | Required field is missing |
| E002 | Error | Range start > range end |
| E003 | Error | Invalid floor value |
| E004 | Error | Range prefix mismatch |
| E005 | Error | Duplicate entry |
| E006 | Error | SVG code not found |
| W001 | Warning | Range overlap |
| W002 | Warning | Unusual SVG code format |
| W003 | Warning | Empty description |

## Dashboard Features

1. **Summary Section**
   - Total error count (red badge)
   - Total warning count (amber badge)
   - Data health score (percentage)

2. **Filter Bar**
   - All Issues / Errors Only / Warnings Only
   - Sort by: Row Number, Error Type, Field Name

3. **Error List**
   - Grouped by category (collapsible)
   - Each item shows: row label, error message, field name
   - Click to navigate to Location Editor

4. **Actions**
   - Refresh data
   - Export errors list (CSV)
