# Editor UI Requirements Document

## Document Information

| Property | Value |
|----------|-------|
| Version | 2.0 |
| Created | 2026-03-03 |
| Updated | 2026-03-04 |
| Status | Approved |

---

## 1. Overview

### 1.1 Purpose

This document defines the requirements for the redesigned Editor UI of the Primo Maps Management System. The new UI replaces the existing table-based CSV editor with a search-first, grouped layout featuring enhanced validation, soft delete, and batch operations.

### 1.2 Scope

- User roles and permission model
- Data validation rules (errors and warnings)
- UI component specifications
- Search-first, grouped layout design
- Accessibility requirements (RTL support, keyboard navigation, ARIA)
- Data model (14 CSV columns)

### 1.3 Target Users

| User Type | Description |
|-----------|-------------|
| **Admin** | Library IT staff with full system access |
| **Editor** | Library staff who manage location mappings |

---

## 2. Design Rules

The following rules guide all development decisions:

| # | Rule | Description |
|---|------|-------------|
| 1 | **Focused Visibility** | Show relevant data, persistent filters, overridable when needed |
| 2 | **Explicit Data Model** | Define model, allowed values, SVG relations before UI |
| 3 | **Helpers & Guardrails** | Warnings guide, blocks protect. Never block critical workflows |
| 4 | **Validation at Critical Moments** | Major changes (SVG replacement, bulk edits, deletes) trigger validation |
| 5 | **Responsive & Accessible Interface** | Visible feedback + easy access to actions (search, filters, direct edit) |
| 6 | **Reversibility** | Undo mistakes, confirm destructive actions, soft-delete where possible |
| 7 | **Bilingual First-Class** | Hebrew/English equal, RTL/LTR works everywhere |
| 8 | **Incremental Saves** | Auto-save drafts or clear unsaved indicators. Don't lose work |

---

## 3. Data Model

### 3.1 CSV Schema

The location mapping data consists of 14 columns with bilingual support.

| Column | Type | Required | Description |
|--------|------|:--------:|-------------|
| `libraryName` | String | Yes | Library name (English) - from predefined list |
| `libraryNameHe` | String | Yes | Library name (Hebrew) |
| `collectionName` | String | Yes | Collection name (English) - **must match Primo labels** |
| `collectionNameHe` | String | Yes | Collection name (Hebrew) - **must match Primo labels** |
| `rangeStart` | String | Yes | Call number range start (Dewey format) |
| `rangeEnd` | String | Yes | Call number range end (Dewey format) |
| `svgCode` | String | Yes | SVG element ID for highlighting |
| `description` | String | No | Location description (English) - display only |
| `descriptionHe` | String | No | Location description (Hebrew) - display only |
| `floor` | String | Yes | Floor number (0, 1, or 2) |
| `shelfLabel` | String | No | Shelf label (English) |
| `shelfLabelHe` | String | No | Shelf label (Hebrew) |
| `notes` | String | No | Additional notes (English) |
| `notesHe` | String | No | Additional notes (Hebrew) |

### 3.2 Row Uniqueness

**Unique Key:** `rangeStart + rangeEnd + svgCode`

The same svgCode can appear multiple times with different ranges.

### 3.3 SVG Files

| Floor | File | Description |
|-------|------|-------------|
| 0 | `floor_0.svg` | Entrance floor map |
| 1 | `floor_1.svg` | First floor map |
| 2 | `floor_2.svg` | Second floor map |

- Each SVG file contains unique element IDs
- svgCode in CSV **must exist** in the corresponding floor's SVG file
- SVG codes in SVG but not in CSV are acceptable (unused elements)

### 3.4 Range Values

Range values follow Dewey Decimal notation including:
- Numeric: `570`, `572.5`, `000`, `999`
- Alphanumeric: `ML001`, `E114`, `M1812`
- With parentheses: `396(44)`, `355.1(6)`, `933.5(42)`

### 3.5 Data Hierarchy

```
Library (e.g., "Sourasky Central Library")
  └── Collection (e.g., "CC Classical studies. 1st floor")
        └── Mapping Row (location entry)
```

- Editor is assigned to **one library**
- Collections are fixed list, children of library
- Same collection name can exist in different libraries

---

## 4. Validation Rules

### 4.1 Two-Tier Validation System

| Severity | Color | Icon | Save Behavior |
|----------|-------|------|---------------|
| **ERROR** | Red (#EF4444) | Circle with X | Blocks save - must fix |
| **WARNING** | Yellow (#F59E0B) | Triangle with ! | Can override with confirmation |

### 4.2 Error Rules (Blocking)

| Rule ID | Condition | Message |
|---------|-----------|---------|
| E001 | Required field empty | "This field is required" |
| E002 | svgCode not in floor's SVG file | "SVG code not found in map" |
| E003 | Floor not 0, 1, or 2 | "Floor must be 0, 1, or 2" |
| E004 | Numeric rangeStart > rangeEnd | "Range end must be >= start" |
| E005 | Duplicate unique key exists | "Duplicate entry exists" |

### 4.3 Warning Rules (Overridable)

| Rule ID | Condition | Message |
|---------|-----------|---------|
| W001 | Range overlaps with same collection | "Potential range overlap" |
| W002 | Floor/SVG code pattern mismatch | "Floor may not match SVG code" |

### 4.4 Validation Timing

| Event | Validation Scope |
|-------|------------------|
| Field blur | Single field format validation |
| Row save | All fields + cross-field rules |
| Global save | All rows, show summary, require confirmation for warnings |

---

## 5. UI Design Decisions

### 5.1 Core Decisions

| Aspect | Decision |
|--------|----------|
| Initial State | Empty until search performed |
| Results Layout | Grouped by Floor → Collection |
| Full Table | Read-only view via "View Full Table" button |
| Row Preview | floor, range, collection, shelfLabel |
| Edit Form | Side-by-side bilingual fields (English \| Hebrew) |
| Delete | Soft delete to Trash folder (recoverable) |
| Validation | Hybrid (blur for format, full on save) |
| Search | Instant filter with 300ms debounce, criteria dropdown |

### 5.2 Main View Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Logo | Tabs | User Menu | Language Toggle               │
├─────────────────────────────────────────────────────────────────┤
│ Toolbar                                                          │
│ ┌────────────────────────────┬─────────────┬───────────────────┐│
│ │ 🔍 [Search____________]    │ Criteria:   │ [+ Add] [📋 Full] ││
│ │                            │ [Call #  ▼] │          Table    ││
│ └────────────────────────────┴─────────────┴───────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │      🔍 Search to find location mappings                  │  │
│  │      Try: shelf number, call number, or collection name   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 After Search - Grouped Results

```
├─────────────────────────────────────────────────────────────────┤
│ Results: 12 mappings found                      [Batch Edit]     │
│                                                                  │
│ ▼ Floor 1                                                        │
│   ├─▼ CC Classical studies (3)                                   │
│   │   ┌─────────────────────────────────────────────────────────┐│
│   │   │ ☐ │ 1 │ 292-471.7 │ CC Classical studies │ 1-4 │[✏][🗑]││
│   │   └─────────────────────────────────────────────────────────┘│
│   └─▼ Reading Room 1A (2)                                        │
│       └─ ...                                                     │
│                                                                  │
│ ▼ Floor 2                                                        │
│   └─ ...                                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. User Roles and Permissions

### 6.1 Permission Matrix

| Permission | Admin | Editor |
|------------|:-----:|:------:|
| View CSV data and maps | Yes | Yes |
| Edit CSV data | Yes | Yes |
| Delete CSV rows (soft delete) | Yes | Yes |
| Empty Trash (permanent delete) | Yes | No |
| User administration | Yes | No |
| Restore from version history | Yes | Yes |

### 6.2 Editor Scope

- Editor is assigned to **one library**
- Editor sees only their library's data
- Optional: further filter by floor

---

## 7. Workflows

### 7.1 Find a Mapping

1. Editor opens CSV editor (shows empty state)
2. Uses search box with criteria dropdown
3. Results appear grouped by floor → collection
4. Click row to view/edit

### 7.2 Edit a Single Row

1. Locate row via search
2. Click Edit button
3. Dialog opens with all fields
4. Validation on blur (format)
5. Save validates all fields
6. Errors block save; warnings show confirmation

### 7.3 Add a New Row

1. Click "+ Add" button
2. Dialog opens with pre-filled library/floor
3. Fill fields, same validation as edit
4. Save creates new row

### 7.4 Delete a Row

1. Click Delete button on row
2. Confirmation dialog shows row details
3. Item moves to Trash (soft delete)
4. Can restore from Trash view

### 7.5 Batch Operations

1. Select multiple rows via checkboxes
2. Batch Edit bar appears
3. Choose field to edit
4. Apply to all selected rows

### 7.6 View Full Table

1. Click "Full Table" button
2. Read-only table opens (modal/fullscreen)
3. All columns visible, sortable, filterable
4. Export to CSV available

---

## 8. Component Structure

```
LocationEditor (main container)
├── Toolbar
│   ├── SearchBox (with criteria dropdown)
│   ├── AddButton
│   └── FullTableButton
├── EmptyState (shown before search)
├── ResultsView (shown after search)
│   ├── ValidationPanel
│   ├── ResultsHeader (count, batch edit)
│   └── GroupedResults
│       └── FloorGroup (collapsible)
│           └── CollectionGroup (collapsible)
│               └── LocationRow (multiple)
├── BatchEditBar
├── TrashView
└── Dialogs
    ├── EditDialog
    ├── DeleteConfirmDialog
    ├── BatchEditDialog
    ├── WarningConfirmDialog
    └── FullTableDialog
```

---

## 9. File Structure

```
admin/
├── components/
│   ├── location-editor.js       # Main container
│   ├── search-box.js            # Search with criteria
│   ├── results-container.js     # Grouped results
│   ├── location-row.js          # Row preview
│   ├── edit-dialog.js           # Add/Edit modal
│   ├── delete-confirm-dialog.js # Delete confirmation
│   ├── warning-confirm-dialog.js # Warning override
│   ├── trash-view.js            # Trash folder
│   ├── batch-edit-bar.js        # Selection actions
│   ├── batch-edit-dialog.js     # Batch edit modal
│   ├── full-table-view.js       # Read-only table
│   ├── validation-panel.js      # Error summary
│   ├── validation.js            # Validation rules
│   └── form-fields/
│       ├── bilingual-field.js   # EN/HE input pair
│       ├── floor-select.js      # Floor dropdown
│       └── svg-code-autocomplete.js
├── services/
│   ├── data-model.js            # Schema & validation
│   ├── svg-parser.js            # SVG ID extraction
│   └── trash-service.js         # Soft delete
└── i18n/
    ├── en.json                  # English translations
    └── he.json                  # Hebrew translations
```

---

## 10. Implementation Phases

### Phase 1: Foundation
- Data model service
- Enhanced validation (errors + warnings)
- SVG parser service
- i18n keys

### Phase 2: Search & Display
- Location editor main component
- Search box with criteria
- Grouped results
- Location row preview

### Phase 3: Edit Flow
- Edit dialog
- Bilingual field components
- SVG code autocomplete
- Hybrid validation

### Phase 4: Add & Delete
- Add dialog (extends edit)
- Soft delete to trash
- Trash view with restore

### Phase 5: Batch Operations
- Multi-select
- Batch edit bar
- Batch edit dialog

### Phase 6: Full Table View
- Read-only table
- Column sorting/filtering
- Export to CSV

### Phase 7: Polish
- Validation panel with navigation
- Keyboard shortcuts
- Accessibility (ARIA, focus)
- Loading states

---

## 11. Accessibility Requirements

### 11.1 RTL Support

- `dir="rtl"` for Hebrew interface
- `dir="ltr"` always on English input fields
- `dir="rtl"` always on Hebrew input fields
- Logical properties for layout (margin-inline-start, etc.)

### 11.2 Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Navigate focusable elements |
| Enter | Confirm dialog / expand card |
| Escape | Close dialog / cancel |
| Ctrl+S | Save changes |
| Ctrl+F | Focus search |
| Arrow keys | Navigate between rows |

### 11.3 ARIA Requirements

- `role="list"` on card container
- `aria-expanded` on collapsible sections
- `aria-invalid` on fields with errors
- `role="alert"` on validation messages
- `aria-live="polite"` on dynamic updates

---

## 12. i18n Keys

```json
{
  "search": {
    "placeholder": "Search locations...",
    "criteria": {
      "callNumber": "Call Number",
      "collection": "Collection",
      "shelfNumber": "Shelf Number"
    }
  },
  "empty": {
    "searchFirst": "Search to find location mappings",
    "noResults": "No results for \"{term}\""
  },
  "validation": {
    "required": "This field is required",
    "invalidRange": "Range end must be >= range start",
    "svgCodeNotFound": "SVG code not found in map",
    "duplicateEntry": "Duplicate entry exists",
    "rangeOverlap": "Potential range overlap",
    "errorCount": "{count} error(s)",
    "warningCount": "{count} warning(s)"
  },
  "card": {
    "edit": "Edit",
    "delete": "Delete",
    "duplicate": "Duplicate"
  },
  "floor": {
    "0": "Floor 0 - Entrance",
    "1": "Floor 1",
    "2": "Floor 2"
  },
  "trash": {
    "title": "Trash",
    "restore": "Restore",
    "empty": "Empty Trash",
    "emptyConfirm": "Permanently delete all items?"
  },
  "batch": {
    "selected": "{count} items selected",
    "edit": "Batch Edit",
    "delete": "Delete Selected"
  }
}
```

---

*End of Requirements Document*
