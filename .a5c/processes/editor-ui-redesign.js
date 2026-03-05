/**
 * @process editor-ui-redesign
 * @description Editor UI Redesign for Primo Maps - Incremental implementation of card-based location editor
 * with search-first UX, grouped results, validation, and trash folder for soft delete.
 *
 * @inputs {
 *   projectRoot: string,
 *   phase?: number,  // Optional: start from specific phase (1-7)
 * }
 * @outputs { success: boolean, artifacts: array, completedPhases: array }
 *
 * @skill frontend-design specializations/web-development/skills/frontend-design/SKILL.md
 * @skill playwright specializations/web-development/skills/playwright/SKILL.md
 * @skill tailwind-css specializations/web-development/skills/tailwind-css/SKILL.md
 * @skill aria specializations/web-development/skills/aria/SKILL.md
 * @skill keyboard-navigation specializations/web-development/skills/keyboard-navigation/SKILL.md
 *
 * @references
 * - Planning Session: Rules, Data Model, Workflows, Design Decisions documented in conversation
 * - Existing codebase: admin/components/, admin/i18n.js, admin/app.js
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const {
    projectRoot = '/home/hagaybar/projects/primo_maps',
    startPhase = 1
  } = inputs;

  const startTime = ctx.now();
  const artifacts = [];
  const completedPhases = [];

  ctx.log('info', '=== Editor UI Redesign - Incremental Implementation ===');
  ctx.log('info', `Project Root: ${projectRoot}`);
  ctx.log('info', `Starting from Phase: ${startPhase}`);

  // ============================================================================
  // CONTEXT: Design Decisions from Planning Session
  // ============================================================================
  const designContext = {
    rules: [
      'Rule 1: Focused Visibility - Show relevant data, persistent filters',
      'Rule 2: Explicit Data Model - Define model, allowed values, SVG relations before UI',
      'Rule 3: Helpers & Guardrails - Warnings guide, blocks protect (never block critical workflows)',
      'Rule 4: Validation at Critical Moments - Major changes trigger validation',
      'Rule 5: Responsive & Accessible Interface - Visible feedback + easy access to actions',
      'Rule 6: Reversibility - Undo mistakes, confirm destructive actions, soft-delete',
      'Rule 7: Bilingual First-Class - Hebrew/English equal, RTL/LTR works everywhere',
      'Rule 8: Incremental Saves - Auto-save drafts or clear unsaved indicators'
    ],
    dataModel: {
      uniqueKey: 'rangeStart + rangeEnd + svgCode',
      requiredFields: ['libraryName', 'libraryNameHe', 'collectionName', 'collectionNameHe', 'rangeStart', 'rangeEnd', 'svgCode', 'floor'],
      floors: ['0', '1', '2'],
      svgValidation: 'svgCode must exist in floor SVG file'
    },
    uiDecisions: {
      layout: 'Empty until search, then grouped by Floor → Collection',
      rowPreview: ['floor', 'range', 'collection', 'shelfLabel'],
      editForm: 'Side-by-side bilingual fields',
      softDelete: 'Trash folder implementation',
      validation: 'Hybrid - blur for format, full on save',
      search: 'Instant filter with 300ms debounce, criteria dropdown'
    }
  };

  // ============================================================================
  // PHASE 1: Foundation - Data Model & Services
  // ============================================================================
  if (startPhase <= 1) {
    ctx.log('info', '');
    ctx.log('info', '=== PHASE 1: Foundation - Data Model & Services ===');

    const phase1 = await ctx.task(phase1FoundationTask, {
      projectRoot,
      designContext
    });

    artifacts.push(...(phase1.artifacts || []));
    completedPhases.push('Phase 1: Foundation');

    await ctx.breakpoint({
      question: 'Phase 1 (Foundation) complete. Review the data model, validation service, and i18n keys. Ready to proceed to Phase 2 (Search & Display)?',
      title: 'Phase 1 Review',
      options: ['Proceed to Phase 2', 'Needs adjustments'],
      context: { phase: 1, artifacts: phase1.artifacts }
    });
  }

  // ============================================================================
  // PHASE 2: Search & Display - Empty State, Search, Grouped Results
  // ============================================================================
  if (startPhase <= 2) {
    ctx.log('info', '');
    ctx.log('info', '=== PHASE 2: Search & Display ===');

    const phase2 = await ctx.task(phase2SearchDisplayTask, {
      projectRoot,
      designContext
    });

    artifacts.push(...(phase2.artifacts || []));
    completedPhases.push('Phase 2: Search & Display');

    await ctx.breakpoint({
      question: 'Phase 2 (Search & Display) complete. Review the empty state, search functionality, and grouped results. Ready to proceed to Phase 3 (Edit Flow)?',
      title: 'Phase 2 Review',
      options: ['Proceed to Phase 3', 'Needs adjustments'],
      context: { phase: 2, artifacts: phase2.artifacts }
    });
  }

  // ============================================================================
  // PHASE 3: Edit Flow - Edit Dialog, Inline Validation, Save
  // ============================================================================
  if (startPhase <= 3) {
    ctx.log('info', '');
    ctx.log('info', '=== PHASE 3: Edit Flow ===');

    const phase3 = await ctx.task(phase3EditFlowTask, {
      projectRoot,
      designContext
    });

    artifacts.push(...(phase3.artifacts || []));
    completedPhases.push('Phase 3: Edit Flow');

    await ctx.breakpoint({
      question: 'Phase 3 (Edit Flow) complete. Review the edit dialog, inline validation, and save functionality. Ready to proceed to Phase 4 (Add & Delete)?',
      title: 'Phase 3 Review',
      options: ['Proceed to Phase 4', 'Needs adjustments'],
      context: { phase: 3, artifacts: phase3.artifacts }
    });
  }

  // ============================================================================
  // PHASE 4: Add & Delete - Add Dialog, Soft Delete, Trash Folder
  // ============================================================================
  if (startPhase <= 4) {
    ctx.log('info', '');
    ctx.log('info', '=== PHASE 4: Add & Delete ===');

    const phase4 = await ctx.task(phase4AddDeleteTask, {
      projectRoot,
      designContext
    });

    artifacts.push(...(phase4.artifacts || []));
    completedPhases.push('Phase 4: Add & Delete');

    await ctx.breakpoint({
      question: 'Phase 4 (Add & Delete) complete. Review the add dialog, soft delete, and trash folder. Ready to proceed to Phase 5 (Batch Operations)?',
      title: 'Phase 4 Review',
      options: ['Proceed to Phase 5', 'Needs adjustments'],
      context: { phase: 4, artifacts: phase4.artifacts }
    });
  }

  // ============================================================================
  // PHASE 5: Batch Operations - Multi-select, Batch Edit Dialog
  // ============================================================================
  if (startPhase <= 5) {
    ctx.log('info', '');
    ctx.log('info', '=== PHASE 5: Batch Operations ===');

    const phase5 = await ctx.task(phase5BatchOperationsTask, {
      projectRoot,
      designContext
    });

    artifacts.push(...(phase5.artifacts || []));
    completedPhases.push('Phase 5: Batch Operations');

    await ctx.breakpoint({
      question: 'Phase 5 (Batch Operations) complete. Review multi-select and batch edit functionality. Ready to proceed to Phase 6 (Full Table View)?',
      title: 'Phase 5 Review',
      options: ['Proceed to Phase 6', 'Needs adjustments'],
      context: { phase: 5, artifacts: phase5.artifacts }
    });
  }

  // ============================================================================
  // PHASE 6: Full Table View - Read-only Table View
  // ============================================================================
  if (startPhase <= 6) {
    ctx.log('info', '');
    ctx.log('info', '=== PHASE 6: Full Table View ===');

    const phase6 = await ctx.task(phase6FullTableTask, {
      projectRoot,
      designContext
    });

    artifacts.push(...(phase6.artifacts || []));
    completedPhases.push('Phase 6: Full Table View');

    await ctx.breakpoint({
      question: 'Phase 6 (Full Table View) complete. Review the read-only table view. Ready to proceed to Phase 7 (Polish)?',
      title: 'Phase 6 Review',
      options: ['Proceed to Phase 7', 'Needs adjustments'],
      context: { phase: 6, artifacts: phase6.artifacts }
    });
  }

  // ============================================================================
  // PHASE 7: Polish - Error Navigation, Keyboard Shortcuts, Accessibility
  // ============================================================================
  if (startPhase <= 7) {
    ctx.log('info', '');
    ctx.log('info', '=== PHASE 7: Polish ===');

    const phase7 = await ctx.task(phase7PolishTask, {
      projectRoot,
      designContext
    });

    artifacts.push(...(phase7.artifacts || []));
    completedPhases.push('Phase 7: Polish');

    await ctx.breakpoint({
      question: 'Phase 7 (Polish) complete. Review error navigation, keyboard shortcuts, and accessibility. All phases complete!',
      title: 'Final Review',
      options: ['Approve and Complete', 'Needs adjustments'],
      context: { phase: 7, artifacts: phase7.artifacts }
    });
  }

  // ============================================================================
  // FINAL E2E TESTING
  // ============================================================================
  ctx.log('info', '');
  ctx.log('info', '=== Final E2E Testing ===');

  const e2eResults = await ctx.task(finalE2ETestingTask, {
    projectRoot
  });

  artifacts.push(...(e2eResults.artifacts || []));

  return {
    success: true,
    artifacts,
    completedPhases,
    duration: ctx.now() - startTime,
    metadata: {
      processId: 'editor-ui-redesign',
      timestamp: startTime
    }
  };
}

// ============================================================================
// PHASE 1 TASK: Foundation
// ============================================================================
export const phase1FoundationTask = defineTask('phase1-foundation', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 1: Foundation - Data Model & Services',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior Frontend Developer',
      task: `Implement Phase 1 (Foundation) of the Editor UI Redesign for Primo Maps.

PROJECT ROOT: ${args.projectRoot}

DESIGN CONTEXT:
${JSON.stringify(args.designContext, null, 2)}

TASKS TO COMPLETE:

1. **Create Data Model Service** (admin/services/data-model.js):
   - Define CSV schema constants (14 columns)
   - Define required fields array
   - Define floor values (0, 1, 2)
   - Create row uniqueness checker (rangeStart + rangeEnd + svgCode)
   - Create range overlap detector for same collection

2. **Enhance Validation Service** (admin/components/validation.js):
   - Add warning severity level (existing only has errors)
   - Add SVG code validation (check against floor's SVG file)
   - Add range overlap warning
   - Add duplicate key detection
   - Update range pattern to allow Dewey parentheses: 396(44), 355.1(6)
   - Export validateRow returning { errors: [], warnings: [] }

3. **Create SVG Parser Service** (admin/services/svg-parser.js):
   - Parse SVG file to extract element IDs
   - Cache parsed IDs per floor
   - Provide isValidSvgCode(code, floor) function
   - Provide getAvailableCodes(floor) function

4. **Add i18n Keys** (admin/i18n/en.json, admin/i18n/he.json):
   Add translations for:
   - validation.svgCodeNotFound
   - validation.duplicateEntry
   - validation.rangeOverlap
   - validation.warningCount
   - search.placeholder
   - search.criteria.callNumber
   - search.criteria.collection
   - search.criteria.shelfNumber
   - empty.searchFirst
   - empty.noResults
   - card.edit, card.delete, card.duplicate
   - floor.0, floor.1, floor.2
   - trash.title, trash.restore, trash.empty

5. **Create Unit Tests** (admin/tests/data-model.test.js):
   - Test row uniqueness checker
   - Test range overlap detection
   - Test validation rules

ACCEPTANCE CRITERIA:
- All files created/updated with proper exports
- Validation returns both errors and warnings
- SVG parser correctly extracts IDs from floor SVG files
- i18n keys added in both English and Hebrew
- Code follows existing project patterns (vanilla JS, ES modules)

Return a summary of all files created/modified with key implementation details.`,
      context: args,
      instructions: [
        'Read existing validation.js to understand current patterns',
        'Read existing i18n files to understand translation structure',
        'Create new files with proper ES module exports',
        'Ensure backward compatibility with existing code',
        'Add JSDoc comments for all functions',
        'Test that SVG parsing works with actual floor SVG files'
      ],
      outputFormat: 'JSON with artifacts array listing all files created/modified'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts', 'summary'],
      properties: {
        artifacts: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['foundation', 'data-model', 'validation', 'i18n']
}));

// ============================================================================
// PHASE 2 TASK: Search & Display
// ============================================================================
export const phase2SearchDisplayTask = defineTask('phase2-search-display', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 2: Search & Display - Empty State, Search, Grouped Results',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior Frontend Developer',
      task: `Implement Phase 2 (Search & Display) of the Editor UI Redesign.

PROJECT ROOT: ${args.projectRoot}

DESIGN CONTEXT:
${JSON.stringify(args.designContext, null, 2)}

TASKS TO COMPLETE:

1. **Create Location Editor Component** (admin/components/location-editor.js):
   - Main container replacing csv-editor for the new UI
   - Empty state: "Search to find location mappings"
   - Integration point for all sub-components

2. **Create Search Box Component** (admin/components/search-box.js):
   - Input field with criteria dropdown (call number, collection, shelf number)
   - 300ms debounce on input
   - Emit search events with { query, criteria }
   - Clear button when query exists

3. **Create Results Container** (admin/components/results-container.js):
   - Display results grouped by Floor → Collection
   - Collapsible floor sections (expanded by default)
   - Collapsible collection groups (expanded by default)
   - Show count per group: "Floor 1 (45 locations)"

4. **Create Location Row Component** (admin/components/location-row.js):
   - Preview mode: floor, range, collection, shelfLabel
   - Checkbox for multi-select
   - Action buttons: Edit, Delete (Edit only shows in preview)
   - Visual indicators for errors/warnings (left border)

5. **Update CSS** (admin/styles.css or inline):
   - Empty state styling
   - Search box styling with RTL support
   - Grouped results styling
   - Collapsible sections with icons
   - Row preview styling

6. **Wire to App.js**:
   - Add new tab or replace CSV Editor tab
   - Initialize location editor component
   - Connect to existing CSV data loading

ACCEPTANCE CRITERIA:
- Empty state shows on load
- Search filters data in real-time (debounced)
- Results grouped by floor, then collection
- Sections are collapsible
- Rows show preview info correctly
- RTL support for Hebrew interface
- Works with existing CSV data

Return a summary of all files created/modified.`,
      context: args,
      instructions: [
        'Read existing csv-editor.js to understand data flow',
        'Read existing app.js to understand initialization',
        'Create modular, reusable components',
        'Use event-driven architecture (CustomEvent)',
        'Ensure bilingual support (dir="rtl" for Hebrew)',
        'Test with actual CSV data'
      ],
      outputFormat: 'JSON with artifacts array listing all files created/modified'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts', 'summary'],
      properties: {
        artifacts: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['search', 'display', 'components', 'ui']
}));

// ============================================================================
// PHASE 3 TASK: Edit Flow
// ============================================================================
export const phase3EditFlowTask = defineTask('phase3-edit-flow', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 3: Edit Flow - Edit Dialog, Inline Validation, Save',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior Frontend Developer',
      task: `Implement Phase 3 (Edit Flow) of the Editor UI Redesign.

PROJECT ROOT: ${args.projectRoot}

DESIGN CONTEXT:
${JSON.stringify(args.designContext, null, 2)}

TASKS TO COMPLETE:

1. **Create Edit Dialog Component** (admin/components/edit-dialog.js):
   - Modal dialog for editing a row
   - Side-by-side bilingual fields (English | Hebrew)
   - Field groups: Library, Collection, Range, Floor, SVG Code, Description, Shelf Label, Notes
   - Floor dropdown (0, 1, 2)
   - SVG Code with autocomplete from available codes
   - Save Row / Cancel buttons

2. **Create Bilingual Field Component** (admin/components/form-fields/bilingual-field.js):
   - Label spanning both columns
   - English input (dir="ltr")
   - Hebrew input (dir="rtl")
   - Error/warning indicator per field

3. **Create Floor Select Component** (admin/components/form-fields/floor-select.js):
   - Dropdown with floor options
   - Updates available SVG codes when changed

4. **Create SVG Code Autocomplete** (admin/components/form-fields/svg-code-autocomplete.js):
   - Searchable dropdown
   - Filters based on selected floor
   - Shows warning if code not found
   - Allows custom values

5. **Implement Hybrid Validation**:
   - On blur: validate single field format
   - On save: validate all fields + cross-field rules
   - Show inline errors immediately
   - Block save if errors exist
   - Allow save with warnings (with confirmation)

6. **Create Warning Confirmation Dialog** (admin/components/warning-confirm-dialog.js):
   - Shows list of warnings
   - "Save Anyway" / "Review" / "Cancel" buttons

ACCEPTANCE CRITERIA:
- Edit dialog opens when Edit button clicked
- All fields render with correct direction
- Validation shows inline errors on blur
- SVG code autocomplete works
- Save blocked if errors exist
- Warnings show confirmation dialog
- Data saved to CSV correctly

Return a summary of all files created/modified.`,
      context: args,
      instructions: [
        'Use existing validation.js enhanced in Phase 1',
        'Use SVG parser service from Phase 1',
        'Follow existing dialog patterns (edit-user-dialog.js)',
        'Ensure keyboard accessibility (Tab, Enter, Escape)',
        'Test save flow with validation'
      ],
      outputFormat: 'JSON with artifacts array listing all files created/modified'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts', 'summary'],
      properties: {
        artifacts: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['edit', 'dialog', 'validation', 'form']
}));

// ============================================================================
// PHASE 4 TASK: Add & Delete
// ============================================================================
export const phase4AddDeleteTask = defineTask('phase4-add-delete', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 4: Add & Delete - Add Dialog, Soft Delete, Trash Folder',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior Frontend Developer',
      task: `Implement Phase 4 (Add & Delete) of the Editor UI Redesign.

PROJECT ROOT: ${args.projectRoot}

DESIGN CONTEXT:
${JSON.stringify(args.designContext, null, 2)}

TASKS TO COMPLETE:

1. **Create Add Dialog** (reuse/extend edit-dialog.js):
   - Pre-fill library (editor's assigned library)
   - Pre-fill floor if filtered
   - Collection dropdown
   - Same validation as edit

2. **Implement Soft Delete**:
   - Delete button on row (editors can delete)
   - Confirmation dialog with row details
   - Move to trash instead of permanent delete
   - Show "This action can be undone" message

3. **Create Trash Service** (admin/services/trash-service.js):
   - Store deleted items with timestamp
   - Persist to localStorage or separate API
   - Provide restore functionality
   - Provide empty trash functionality

4. **Create Trash View Component** (admin/components/trash-view.js):
   - List of deleted items
   - Restore button per item
   - Empty Trash button (admin only)
   - Show deletion timestamp

5. **Create Delete Confirmation Dialog** (admin/components/delete-confirm-dialog.js):
   - Show row details (svgCode, collection, range)
   - "Delete" / "Cancel" buttons
   - Message: "This item will be moved to trash"

6. **Add Trash Tab/Button**:
   - Access point to trash view
   - Badge showing trash count

ACCEPTANCE CRITERIA:
- Add button opens dialog with pre-filled values
- Delete shows confirmation
- Deleted items go to trash
- Trash view shows all deleted items
- Restore moves item back to data
- Empty trash removes permanently (admin only)

Return a summary of all files created/modified.`,
      context: args,
      instructions: [
        'Reuse edit dialog component for add',
        'Follow existing dialog patterns',
        'Ensure trash persists across sessions',
        'Add proper ARIA labels for accessibility',
        'Test add/delete/restore cycle'
      ],
      outputFormat: 'JSON with artifacts array listing all files created/modified'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts', 'summary'],
      properties: {
        artifacts: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['add', 'delete', 'trash', 'crud']
}));

// ============================================================================
// PHASE 5 TASK: Batch Operations
// ============================================================================
export const phase5BatchOperationsTask = defineTask('phase5-batch-operations', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 5: Batch Operations - Multi-select, Batch Edit Dialog',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior Frontend Developer',
      task: `Implement Phase 5 (Batch Operations) of the Editor UI Redesign.

PROJECT ROOT: ${args.projectRoot}

DESIGN CONTEXT:
${JSON.stringify(args.designContext, null, 2)}

TASKS TO COMPLETE:

1. **Implement Multi-select**:
   - Checkbox on each row
   - "Select All" in header (for visible/filtered rows)
   - Selection count display
   - Selection persists across collapse/expand

2. **Create Batch Edit Bar** (admin/components/batch-edit-bar.js):
   - Appears when rows selected
   - Shows count: "3 items selected"
   - "Batch Edit" button
   - "Delete Selected" button
   - "Clear Selection" button

3. **Create Batch Edit Dialog** (admin/components/batch-edit-dialog.js):
   - Field selector dropdown
   - Value input (with bilingual support where applicable)
   - Preview of affected rows
   - "Apply to X rows" / "Cancel" buttons

4. **Implement Batch Delete**:
   - Confirmation showing count
   - Move all selected to trash

5. **Add Keyboard Shortcuts**:
   - Shift+Click for range select
   - Ctrl/Cmd+A for select all visible

ACCEPTANCE CRITERIA:
- Checkboxes work correctly
- Select all selects visible rows only
- Batch edit bar appears when items selected
- Batch edit applies to all selected rows
- Batch delete moves all to trash
- Keyboard shortcuts work

Return a summary of all files created/modified.`,
      context: args,
      instructions: [
        'Use existing selection patterns',
        'Ensure batch operations are atomic',
        'Show progress for large batch operations',
        'Test with multiple selections'
      ],
      outputFormat: 'JSON with artifacts array listing all files created/modified'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts', 'summary'],
      properties: {
        artifacts: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['batch', 'multi-select', 'bulk-edit']
}));

// ============================================================================
// PHASE 6 TASK: Full Table View
// ============================================================================
export const phase6FullTableTask = defineTask('phase6-full-table', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 6: Full Table View - Read-only Table View',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior Frontend Developer',
      task: `Implement Phase 6 (Full Table View) of the Editor UI Redesign.

PROJECT ROOT: ${args.projectRoot}

DESIGN CONTEXT:
${JSON.stringify(args.designContext, null, 2)}

TASKS TO COMPLETE:

1. **Create Full Table View Component** (admin/components/full-table-view.js):
   - Read-only table showing all data
   - All 14 columns visible (scrollable)
   - Column sorting
   - Column filtering
   - Export to CSV button

2. **Create Full Table Dialog/Modal**:
   - Opens from "View Full Table" button
   - Large modal or full-screen view
   - Close button

3. **Add Column Controls**:
   - Show/hide columns
   - Reorder columns (optional)
   - Remember preferences

4. **Add Table Features**:
   - Sticky header
   - Row striping
   - Hover highlighting
   - Pagination or virtual scroll for performance

ACCEPTANCE CRITERIA:
- Full table button visible in toolbar
- Table shows all data read-only
- Columns can be sorted
- Columns can be filtered
- Export generates valid CSV
- Performance acceptable with 419 rows

Return a summary of all files created/modified.`,
      context: args,
      instructions: [
        'Use existing table patterns if any',
        'Ensure horizontal scroll works well',
        'Test with full dataset',
        'Optimize for performance'
      ],
      outputFormat: 'JSON with artifacts array listing all files created/modified'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts', 'summary'],
      properties: {
        artifacts: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['table', 'read-only', 'export']
}));

// ============================================================================
// PHASE 7 TASK: Polish
// ============================================================================
export const phase7PolishTask = defineTask('phase7-polish', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 7: Polish - Error Navigation, Keyboard Shortcuts, Accessibility',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior Frontend Developer specializing in Accessibility',
      task: `Implement Phase 7 (Polish) of the Editor UI Redesign.

PROJECT ROOT: ${args.projectRoot}

DESIGN CONTEXT:
${JSON.stringify(args.designContext, null, 2)}

TASKS TO COMPLETE:

1. **Create Validation Panel** (admin/components/validation-panel.js):
   - Summary of all errors/warnings across data
   - Clickable items to navigate to problematic row
   - Collapsible panel
   - Filter: "Show only rows with errors"

2. **Implement Error Navigation**:
   - "Go to error" scrolls to and highlights row
   - Previous/Next error buttons
   - Auto-expand collapsed sections when navigating

3. **Add Keyboard Shortcuts**:
   - Ctrl/Cmd+S: Save changes
   - Ctrl/Cmd+F: Focus search
   - Escape: Close dialog/cancel edit
   - Enter: Confirm dialog
   - Arrow keys: Navigate between rows

4. **Improve Accessibility**:
   - ARIA labels on all interactive elements
   - Role attributes for regions
   - Focus management in dialogs
   - Screen reader announcements for actions
   - Focus visible indicators

5. **Add RTL Polish**:
   - Verify all layouts work in RTL
   - Mirror directional icons
   - Test with Hebrew language

6. **Add Loading States**:
   - Skeleton loaders for initial load
   - Button loading states for save operations
   - Progress indicators for batch operations

ACCEPTANCE CRITERIA:
- Validation panel shows all issues
- Click navigates to specific row
- Keyboard shortcuts work
- Screen reader compatible
- RTL layout correct
- Loading states visible during operations

Return a summary of all files created/modified.`,
      context: args,
      instructions: [
        'Follow WCAG 2.1 AA guidelines',
        'Test with keyboard-only navigation',
        'Test with screen reader (if available)',
        'Verify RTL layout manually',
        'Document keyboard shortcuts'
      ],
      outputFormat: 'JSON with artifacts array listing all files created/modified'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts', 'summary'],
      properties: {
        artifacts: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['accessibility', 'keyboard', 'polish', 'a11y']
}));

// ============================================================================
// FINAL E2E TESTING TASK
// ============================================================================
export const finalE2ETestingTask = defineTask('final-e2e-testing', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Final E2E Testing',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Engineer',
      task: `Run comprehensive E2E tests for the Editor UI Redesign.

PROJECT ROOT: ${args.projectRoot}

TASKS TO COMPLETE:

1. **Create E2E Test Suite** (e2e/tests/location-editor.spec.ts):
   - Test empty state display
   - Test search functionality
   - Test grouped results display
   - Test edit flow
   - Test add flow
   - Test delete flow (soft delete)
   - Test trash restore
   - Test batch operations
   - Test full table view
   - Test validation (errors and warnings)
   - Test keyboard navigation

2. **Run Existing Tests**:
   - Ensure no regressions in existing tests
   - Run: npx playwright test

3. **Fix Any Failing Tests**:
   - Identify failures
   - Fix implementation or test as needed

ACCEPTANCE CRITERIA:
- All new tests pass
- No regressions in existing tests
- Test coverage for all 7 phases

Run: npx playwright test --reporter=html

Return test results summary.`,
      context: args,
      instructions: [
        'Follow existing test patterns in e2e/tests/',
        'Use Page Object Model from e2e/pages/',
        'Test both English and Hebrew interfaces',
        'Test both admin and editor roles'
      ],
      outputFormat: 'JSON with test results'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'failed', 'artifacts'],
      properties: {
        passed: { type: 'number' },
        failed: { type: 'number' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['e2e', 'testing', 'qa']
}));
