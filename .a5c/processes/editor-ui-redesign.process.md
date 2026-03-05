# Editor UI Redesign Process

## Overview

This process implements a complete redesign of the Editor UI for the Primo Maps Management System. The implementation is broken into 7 incremental phases, each delivering working functionality that can be tested and reviewed before proceeding.

## Design Principles (Rules)

| # | Rule | Description |
|---|------|-------------|
| 1 | Focused Visibility | Show relevant data, persistent filters, overridable when needed |
| 2 | Explicit Data Model | Define model, allowed values, SVG relations before UI |
| 3 | Helpers & Guardrails | Warnings guide, blocks protect. Never block critical workflows |
| 4 | Validation at Critical Moments | Major changes (SVG replacement, bulk edits, deletes) trigger validation |
| 5 | Responsive & Accessible Interface | Visible feedback + easy access to actions (search, filters, direct edit) |
| 6 | Reversibility | Undo mistakes, confirm destructive actions, soft-delete where possible |
| 7 | Bilingual First-Class | Hebrew/English equal, RTL/LTR works everywhere |
| 8 | Incremental Saves | Auto-save drafts or clear unsaved indicators. Don't lose work |

## Data Model

### CSV Schema (14 columns)

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| libraryName | String | Yes | From predefined list |
| libraryNameHe | String | Yes | Hebrew translation |
| collectionName | String | Yes | **Must match Primo labels** |
| collectionNameHe | String | Yes | **Must match Primo labels** |
| rangeStart | String | Yes | Dewey format with parentheses |
| rangeEnd | String | Yes | Dewey format with parentheses |
| svgCode | String | Yes | Must exist in floor's SVG |
| floor | String | Yes | "0", "1", or "2" |
| description | String | No | Display only |
| descriptionHe | String | No | Display only |
| shelfLabel | String | No | Human-readable shelf reference |
| shelfLabelHe | String | No | Hebrew shelf label |
| notes | String | No | Internal notes |
| notesHe | String | No | Hebrew notes |

### Unique Key

`rangeStart + rangeEnd + svgCode`

### Validation Rules

| Type | Rule | Severity |
|------|------|----------|
| Required field empty | Block save | Error |
| svgCode not in SVG file | Block save | Error |
| Duplicate unique key | Block save | Error |
| Range overlap in collection | Allow with confirmation | Warning |
| Floor/SVG mismatch | Allow with confirmation | Warning |

## UI Design Decisions

| Decision | Choice |
|----------|--------|
| Initial State | Empty until search |
| Results Layout | Grouped by Floor → Collection |
| Row Preview | floor, range, collection, shelfLabel |
| Edit Form | Side-by-side bilingual fields |
| Delete | Soft delete to Trash folder |
| Validation Timing | Hybrid (blur + save) |
| Search | Instant filter with 300ms debounce |

## Phases

### Phase 1: Foundation
**Deliverables:**
- Data model service with schema, uniqueness, overlap detection
- Enhanced validation with warnings and SVG code checking
- SVG parser service for element ID extraction
- i18n keys for all new UI elements

**Acceptance Criteria:**
- Validation returns both errors and warnings
- SVG parser correctly extracts IDs
- All i18n keys in EN and HE

---

### Phase 2: Search & Display
**Deliverables:**
- Location editor main component
- Search box with criteria dropdown
- Results container with grouping
- Location row component

**Acceptance Criteria:**
- Empty state shows on load
- Search filters in real-time
- Results grouped by floor, then collection
- Rows show correct preview info

---

### Phase 3: Edit Flow
**Deliverables:**
- Edit dialog with all fields
- Bilingual field component
- Floor select component
- SVG code autocomplete
- Warning confirmation dialog

**Acceptance Criteria:**
- All fields render correctly
- Inline validation on blur
- Save blocked by errors
- Warnings show confirmation

---

### Phase 4: Add & Delete
**Deliverables:**
- Add dialog (extends edit)
- Delete confirmation dialog
- Trash service
- Trash view component

**Acceptance Criteria:**
- Add pre-fills known values
- Delete shows confirmation
- Items go to trash (soft delete)
- Restore works correctly

---

### Phase 5: Batch Operations
**Deliverables:**
- Multi-select with checkboxes
- Batch edit bar
- Batch edit dialog

**Acceptance Criteria:**
- Select all works for visible rows
- Batch edit applies to selected
- Batch delete moves to trash

---

### Phase 6: Full Table View
**Deliverables:**
- Full table component
- Column sorting and filtering
- Export to CSV

**Acceptance Criteria:**
- All columns visible
- Sorting works
- Export generates valid CSV

---

### Phase 7: Polish
**Deliverables:**
- Validation panel with navigation
- Keyboard shortcuts
- Accessibility improvements
- Loading states

**Acceptance Criteria:**
- Error navigation scrolls to row
- Keyboard shortcuts work
- Screen reader compatible
- RTL layout correct

---

## Testing

After all phases complete:
1. Create comprehensive E2E test suite
2. Run existing tests for regressions
3. Fix any failures

## Files Structure

```
admin/
├── components/
│   ├── location-editor.js       # Phase 2: Main container
│   ├── search-box.js            # Phase 2: Search component
│   ├── results-container.js     # Phase 2: Grouped results
│   ├── location-row.js          # Phase 2: Row preview
│   ├── edit-dialog.js           # Phase 3: Edit modal
│   ├── warning-confirm-dialog.js # Phase 3: Warning confirmation
│   ├── delete-confirm-dialog.js # Phase 4: Delete confirmation
│   ├── trash-view.js            # Phase 4: Trash folder view
│   ├── batch-edit-bar.js        # Phase 5: Selection actions
│   ├── batch-edit-dialog.js     # Phase 5: Batch edit modal
│   ├── full-table-view.js       # Phase 6: Read-only table
│   ├── validation-panel.js      # Phase 7: Error summary
│   ├── validation.js            # Phase 1: Enhanced validation
│   └── form-fields/
│       ├── bilingual-field.js   # Phase 3
│       ├── floor-select.js      # Phase 3
│       └── svg-code-autocomplete.js # Phase 3
├── services/
│   ├── data-model.js            # Phase 1: Schema & validation
│   ├── svg-parser.js            # Phase 1: SVG ID extraction
│   └── trash-service.js         # Phase 4: Soft delete
└── i18n/
    ├── en.json                  # Phase 1: English translations
    └── he.json                  # Phase 1: Hebrew translations
```
