# Editor Range Restrictions - Process Documentation

## Overview

This process implements row-based range restrictions for the editor role in the Primo Maps admin system. Editors will only see and be able to edit CSV rows that match their assigned ranges (collections, floors, and call number ranges).

## Feature Requirements

### User Stories

1. **As an admin**, I want to configure which rows an editor can access, so that I can delegate CSV maintenance to specific staff members for their areas of responsibility.

2. **As an editor**, I want to see only the rows I'm responsible for, so that I can focus on my work without being overwhelmed or accidentally modifying the wrong data.

3. **As an admin**, I want the system to prevent unauthorized edits, so that editors cannot accidentally or intentionally modify data outside their assigned ranges.

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR1 | Admins can configure editable ranges per editor user |
| FR2 | Ranges can filter by collection name (with wildcards) |
| FR3 | Ranges can filter by floor number (0, 1, 2) |
| FR4 | Ranges can filter by call number ranges |
| FR5 | Multiple filter criteria are combined with AND logic |
| FR6 | Frontend filters what editors see |
| FR7 | Backend validates edits against assigned ranges |
| FR8 | Admins bypass all range restrictions |
| FR9 | Empty ranges = no access (with helpful message) |
| FR10 | UI supports Hebrew and English |

## Data Model

### EditorRange Schema

```json
{
  "collections": ["string"],
  "floors": [0, 1, 2],
  "callNumberRanges": [
    { "start": "string", "end": "string" }
  ]
}
```

### Example Configurations

**Example 1: Science collection editor (Floor 2)**
```json
{
  "collections": ["CK Science*"],
  "floors": [2],
  "callNumberRanges": []
}
```

**Example 2: Reference desk staff (All floors, CB collections)**
```json
{
  "collections": ["CB*", "CBG*"],
  "floors": [0, 1, 2],
  "callNumberRanges": []
}
```

**Example 3: Specific call number range**
```json
{
  "collections": [],
  "floors": [],
  "callNumberRanges": [
    { "start": "000", "end": "299" },
    { "start": "500", "end": "599" }
  ]
}
```

## Implementation Phases

### Phase 1: Architecture Design
- Design data model and API contracts
- Plan implementation order
- Identify all files to modify/create

### Phase 2: Data Model
- Create range schema definition
- Implement validation utilities
- Create row-matching function

### Phase 3: Backend Implementation
- Update updateUser Lambda to save ranges
- Update putCsv Lambda to validate ranges
- Include ranges in auth response

### Phase 4: Admin UI
- Add range configuration to edit-user-dialog
- Collection multi-select
- Floor checkboxes
- Call number range inputs

### Phase 5: Editor UI
- Filter CSV rows based on ranges
- Show filter status banner
- Update save logic

### Phase 6: Integration Testing
- Verify API contracts
- Check schema consistency
- Fix inconsistencies

### Phase 7: E2E Testing
- Create comprehensive test suite
- Run all tests
- Fix any failures

## Files Modified/Created

| File | Action | Description |
|------|--------|-------------|
| `admin/utils/range-utils.js` | Create | Range validation utilities |
| `lambda/range-validation.mjs` | Create | Backend validation module |
| `lambda/updateUser.mjs` | Modify | Add editableRanges field |
| `lambda/putCsv.mjs` | Modify | Validate edits against ranges |
| `admin/components/edit-user-dialog.js` | Modify | Add range configuration UI |
| `admin/components/csv-editor.js` | Modify | Filter rows for editors |
| `admin/auth-service.js` | Modify | Parse ranges from user data |
| `admin/i18n/en.json` | Modify | Add English translations |
| `admin/i18n/he.json` | Modify | Add Hebrew translations |
| `e2e/tests/editor-ranges.spec.js` | Create | E2E test suite |

## Quality Gates

1. **Architecture Review**: Confirm design before implementation
2. **Code Review**: Manual review of all changes
3. **Integration Check**: Verify frontend/backend consistency
4. **E2E Tests**: All 8+ test scenarios must pass

## Rollback Plan

If issues are discovered after deployment:
1. Revert Lambda function changes (updateUser, putCsv)
2. Revert admin SPA changes
3. Clear Cognito custom attributes if needed

## Success Criteria

- [ ] Admin can configure ranges for editor users
- [ ] Editor sees only their assigned rows
- [ ] Editor cannot edit rows outside their ranges
- [ ] Backend rejects unauthorized edits with 403
- [ ] Admin can see/edit all rows
- [ ] UI works in Hebrew and English
- [ ] All E2E tests pass
