# Editor Range Restrictions - Process Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EDITOR RANGE RESTRICTIONS FEATURE                        │
│                                                                             │
│  Goal: Implement row-based range restrictions for editor role               │
│  Editors see/edit only rows matching their assigned ranges                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: ARCHITECTURE DESIGN                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Design data model for editor ranges (JSON schema)                        │
│  • Define API contracts for range CRUD                                      │
│  • Plan frontend/backend enforcement strategy                               │
│  • Identify all files to modify                                             │
│  • Create implementation order                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: DATA MODEL                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Define EditorRange schema:                                               │
│    {                                                                        │
│      collections: ["CK Science*", "CC Classical*"],                         │
│      floors: [1, 2],                                                        │
│      callNumberRanges: [{start: "000", end: "599"}]                        │
│    }                                                                        │
│  • Create validation utilities                                              │
│  • Create row-matching function                                             │
│                                                                             │
│  Files: admin/utils/range-utils.js (new)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: BACKEND IMPLEMENTATION                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Update lambda/updateUser.mjs - save editableRanges to Cognito            │
│  • Update lambda/putCsv.mjs - validate edits against user ranges            │
│  • Update auth-middleware.mjs - include ranges in response                  │
│  • Create shared range validation module                                    │
│                                                                             │
│  Files: lambda/updateUser.mjs, lambda/putCsv.mjs,                          │
│         lambda/range-validation.mjs (new)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: ADMIN UI - RANGE CONFIGURATION                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Add "Editable Ranges" section to edit-user-dialog.js                     │
│  • Collection multi-select (populated from CSV data)                        │
│  • Floor checkboxes (Floor 0, Floor 1, Floor 2)                             │
│  • Call number range inputs (add/remove)                                    │
│  • Only shown when editing editor role users                                │
│  • Add Hebrew/English translations                                          │
│                                                                             │
│  Files: admin/components/edit-user-dialog.js,                               │
│         admin/i18n/en.json, admin/i18n/he.json                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: EDITOR UI - FILTERED VIEW                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Filter CSV rows based on user's assigned ranges                          │
│  • Show info banner: "Showing X of Y rows (filtered by permissions)"        │
│  • Disable add/delete for editors (they can only edit visible rows)         │
│  • Update save to only send allowed rows                                    │
│  • Handle empty ranges gracefully                                           │
│                                                                             │
│  Files: admin/components/csv-editor.js,                                     │
│         admin/auth-service.js                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 6: INTEGRATION TESTING                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Verify API contracts match                                               │
│  • Check range schema consistency                                           │
│  • Verify error handling                                                    │
│  • Check i18n completeness                                                  │
│  • Fix inconsistencies                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◆ BREAKPOINT: PRE-E2E REVIEW                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Review all changes before running E2E tests                                │
│  Human approval required to continue                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 7: E2E TESTS                                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Test scenarios:                                                            │
│  ✓ Admin can configure ranges for editor                                   │
│  ✓ Editor sees only rows within assigned ranges                            │
│  ✓ Editor cannot see rows outside ranges                                   │
│  ✓ Editor can edit rows within ranges                                      │
│  ✓ Backend rejects out-of-range edits (403)                                │
│  ✓ Admin sees all rows regardless                                          │
│  ✓ Empty ranges shows message                                              │
│  ✓ Range configuration persists                                            │
│                                                                             │
│  Files: e2e/tests/editor-ranges.spec.js (new)                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      Tests Pass?              │
                    └───────────────────────────────┘
                           │              │
                          YES             NO
                           │              │
                           ▼              ▼
              ┌─────────────────┐  ┌─────────────────────────┐
              │    SUCCESS      │  │  REFINEMENT LOOP        │
              │  Feature Done   │  │  Fix failures & retest  │
              └─────────────────┘  └─────────────────────────┘
                                              │
                                              └──────────────────┐
                                                                 │
                                              ┌──────────────────┘
                                              ▼
                                   Back to E2E Tests
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA FLOW DIAGRAM                                │
└─────────────────────────────────────────────────────────────────────────────┘

ADMIN CONFIGURING RANGES:
┌──────────┐    ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐
│  Admin   │───▶│ Edit User       │───▶│ updateUser.mjs   │───▶│  Cognito    │
│  Browser │    │ Dialog          │    │ Lambda           │    │  User Pool  │
└──────────┘    │ (ranges form)   │    │ (save ranges)    │    │  (store)    │
                └─────────────────┘    └──────────────────┘    └─────────────┘

EDITOR LOADING CSV:
┌──────────┐    ┌─────────────────┐    ┌──────────────────┐
│  Editor  │───▶│ Auth Service    │───▶│ Load CSV &       │
│  Login   │    │ (get ranges)    │    │ Filter Rows      │
└──────────┘    └─────────────────┘    └──────────────────┘
                                              │
                                              ▼
                                       ┌──────────────────┐
                                       │ Display Filtered │
                                       │ Table + Banner   │
                                       └──────────────────┘

EDITOR SAVING CHANGES:
┌──────────┐    ┌─────────────────┐    ┌──────────────────┐
│  Editor  │───▶│ csv-editor.js   │───▶│ putCsv.mjs       │
│  Save    │    │ (filtered data) │    │ Lambda           │
└──────────┘    └─────────────────┘    └──────────────────┘
                                              │
                                              ▼
                                       ┌──────────────────┐
                                       │ Validate ranges  │
                                       │ before saving    │
                                       └──────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                         Valid ranges                    Out of range
                              │                               │
                              ▼                               ▼
                       ┌───────────┐                   ┌───────────┐
                       │ Save CSV  │                   │ 403 Error │
                       │ Success   │                   │ Forbidden │
                       └───────────┘                   └───────────┘
```
