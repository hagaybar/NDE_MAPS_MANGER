# Editor UI Redesign - Process Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EDITOR UI REDESIGN PROCESS                           │
│                           7 Incremental Phases                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: FOUNDATION                                                          │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│ │  Data Model     │  │  Validation     │  │  SVG Parser     │               │
│ │  Service        │  │  Enhancement    │  │  Service        │               │
│ │  - Schema       │  │  - Warnings     │  │  - Extract IDs  │               │
│ │  - Uniqueness   │  │  - SVG check    │  │  - Cache        │               │
│ │  - Overlaps     │  │  - Dewey fmt    │  │  - Validate     │               │
│ └────────┬────────┘  └────────┬────────┘  └────────┬────────┘               │
│          └────────────────────┼────────────────────┘                        │
│                               │                                              │
│                    ┌──────────▼──────────┐                                  │
│                    │    i18n Keys        │                                  │
│                    │  (EN + HE)          │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                              │
│                    [BREAKPOINT: Review Foundation]                          │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: SEARCH & DISPLAY                                                    │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│ │  Location       │  │  Search Box     │  │  Results        │               │
│ │  Editor         │  │  - Criteria     │  │  Container      │               │
│ │  (Main)         │  │  - Debounce     │  │  - Group Floor  │               │
│ │  - Empty state  │  │  - Clear        │  │  - Group Coll   │               │
│ └────────┬────────┘  └────────┬────────┘  └────────┬────────┘               │
│          │                    │                    │                        │
│          └────────────────────┼────────────────────┘                        │
│                               │                                              │
│                    ┌──────────▼──────────┐                                  │
│                    │   Location Row      │                                  │
│                    │  - Preview mode     │                                  │
│                    │  - Checkbox         │                                  │
│                    │  - Actions          │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                              │
│                    [BREAKPOINT: Review Search & Display]                    │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: EDIT FLOW                                                           │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│ │  Edit Dialog    │  │  Bilingual      │  │  SVG Code       │               │
│ │  - Modal        │  │  Field          │  │  Autocomplete   │               │
│ │  - All fields   │  │  - EN | HE      │  │  - Floor filter │               │
│ │  - Save/Cancel  │  │  - Validation   │  │  - Search       │               │
│ └────────┬────────┘  └────────┬────────┘  └────────┬────────┘               │
│          │                    │                    │                        │
│          └────────────────────┼────────────────────┘                        │
│                               │                                              │
│        ┌──────────────────────┼──────────────────────┐                      │
│        │                      │                      │                      │
│ ┌──────▼──────┐    ┌──────────▼──────────┐   ┌──────▼──────┐               │
│ │ Floor Select│    │ Hybrid Validation   │   │ Warning     │               │
│ │ Component   │    │ - Blur: format      │   │ Confirm     │               │
│ └─────────────┘    │ - Save: full        │   │ Dialog      │               │
│                    └──────────┬──────────┘   └─────────────┘               │
│                               │                                              │
│                    [BREAKPOINT: Review Edit Flow]                           │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: ADD & DELETE                                                        │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│ │  Add Dialog     │  │  Delete         │  │  Trash          │               │
│ │  (extends Edit) │  │  Confirm        │  │  Service        │               │
│ │  - Pre-fill lib │  │  - Show details │  │  - Store        │               │
│ │  - Pre-fill flr │  │  - Soft delete  │  │  - Restore      │               │
│ └────────┬────────┘  └────────┬────────┘  └────────┬────────┘               │
│          │                    │                    │                        │
│          └────────────────────┼────────────────────┘                        │
│                               │                                              │
│                    ┌──────────▼──────────┐                                  │
│                    │   Trash View        │                                  │
│                    │  - List deleted     │                                  │
│                    │  - Restore/Empty    │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                              │
│                    [BREAKPOINT: Review Add & Delete]                        │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: BATCH OPERATIONS                                                    │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│ │  Multi-select   │  │  Batch Edit     │  │  Batch Edit     │               │
│ │  - Checkboxes   │  │  Bar            │  │  Dialog         │               │
│ │  - Select All   │  │  - Count        │  │  - Field select │               │
│ │  - Range select │  │  - Actions      │  │  - Preview      │               │
│ └────────┬────────┘  └────────┬────────┘  └────────┬────────┘               │
│          │                    │                    │                        │
│          └────────────────────┼────────────────────┘                        │
│                               │                                              │
│                    [BREAKPOINT: Review Batch Operations]                    │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 6: FULL TABLE VIEW                                                     │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│ │  Full Table     │  │  Column         │  │  Export         │               │
│ │  Component      │  │  Controls       │  │  - CSV          │               │
│ │  - All columns  │  │  - Sort         │  │                 │               │
│ │  - Read-only    │  │  - Filter       │  │                 │               │
│ └────────┬────────┘  └────────┬────────┘  └────────┬────────┘               │
│          │                    │                    │                        │
│          └────────────────────┼────────────────────┘                        │
│                               │                                              │
│                    [BREAKPOINT: Review Full Table View]                     │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 7: POLISH                                                              │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│ │  Validation     │  │  Keyboard       │  │  Accessibility  │               │
│ │  Panel          │  │  Shortcuts      │  │  - ARIA         │               │
│ │  - Summary      │  │  - Ctrl+S       │  │  - Focus mgmt   │               │
│ │  - Navigation   │  │  - Ctrl+F       │  │  - RTL polish   │               │
│ └────────┬────────┘  └────────┬────────┘  └────────┬────────┘               │
│          │                    │                    │                        │
│          └────────────────────┼────────────────────┘                        │
│                               │                                              │
│                    ┌──────────▼──────────┐                                  │
│                    │   Loading States    │                                  │
│                    │  - Skeletons        │                                  │
│                    │  - Progress         │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                              │
│                    [BREAKPOINT: Final Review]                               │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FINAL E2E TESTING                                                            │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  Run Playwright Tests                                                    │ │
│ │  - New location-editor.spec.ts                                          │ │
│ │  - Existing regression tests                                            │ │
│ │  - Fix any failures                                                     │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                              ┌──────────┐                                   │
│                              │ COMPLETE │                                   │
│                              └──────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Phase Dependencies

```
Phase 1 ─────────────────┐
(Foundation)             │
                         ▼
Phase 2 ◄────────────────┤
(Search & Display)       │
                         ▼
Phase 3 ◄────────────────┤
(Edit Flow)              │
                         ▼
Phase 4 ◄────────────────┤
(Add & Delete)           │
                         ▼
Phase 5 ◄────────────────┤
(Batch Operations)       │
                         ▼
Phase 6 ◄────────────────┤
(Full Table View)        │
                         ▼
Phase 7 ◄────────────────┤
(Polish)                 │
                         ▼
E2E Testing ◄────────────┘
```

## Key Files Created Per Phase

| Phase | New Files |
|-------|-----------|
| 1 | `services/data-model.js`, `services/svg-parser.js`, i18n updates |
| 2 | `location-editor.js`, `search-box.js`, `results-container.js`, `location-row.js` |
| 3 | `edit-dialog.js`, `form-fields/*.js`, `warning-confirm-dialog.js` |
| 4 | `trash-service.js`, `trash-view.js`, `delete-confirm-dialog.js` |
| 5 | `batch-edit-bar.js`, `batch-edit-dialog.js` |
| 6 | `full-table-view.js` |
| 7 | `validation-panel.js`, keyboard handling, ARIA updates |
