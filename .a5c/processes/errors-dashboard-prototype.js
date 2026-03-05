/**
 * @process errors-dashboard-prototype
 * @description Build a validation errors dashboard as a dedicated page/tab in the Primo Maps admin UI.
 * Displays validation errors from CSV data, allows navigation to problematic rows, and provides filtering/sorting.
 * @inputs { projectRoot: string, adminDir: string }
 * @outputs { success: boolean, files: array, summary: string }
 *
 * @skill frontend-design
 * @skill bidi-engineering
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const {
    projectRoot = '/home/hagaybar/projects/primo_maps',
    adminDir = 'admin'
  } = inputs;

  const startTime = ctx.now();
  const artifacts = [];

  ctx.log('info', 'Starting Errors Dashboard Prototype Development');
  ctx.log('info', `Project root: ${projectRoot}`);

  // ============================================================================
  // PHASE 1: DESIGN & PLANNING
  // ============================================================================

  ctx.log('info', 'Phase 1: Dashboard Component Design');

  const designTask = await ctx.task(dashboardDesignTask, {
    projectRoot,
    adminDir,
    requirements: {
      bilingual: true, // Hebrew/English support
      rtlSupport: true,
      features: [
        'Display all validation errors and warnings from CSV data',
        'Group errors by type (missing field, invalid range, duplicates, etc.)',
        'Filter by error type and severity',
        'Sort by row number, error type, or field',
        'Click to navigate to problematic row in Location Editor',
        'Summary statistics (total errors, warnings, error rate)',
        'Collapsible sections for each error category',
        'Export errors list functionality'
      ]
    }
  });

  artifacts.push(...(designTask.artifacts || []));

  // ============================================================================
  // PHASE 2: IMPLEMENT ERRORS DASHBOARD COMPONENT
  // ============================================================================

  ctx.log('info', 'Phase 2: Implement Errors Dashboard Component');

  const componentTask = await ctx.task(implementDashboardTask, {
    projectRoot,
    adminDir,
    design: designTask.design
  });

  artifacts.push(...(componentTask.artifacts || []));

  // ============================================================================
  // PHASE 3: INTEGRATE WITH ADMIN APP
  // ============================================================================

  ctx.log('info', 'Phase 3: Integrate Dashboard with Admin Navigation');

  const integrationTask = await ctx.task(integrateDashboardTask, {
    projectRoot,
    adminDir,
    componentPath: componentTask.componentPath
  });

  artifacts.push(...(integrationTask.artifacts || []));

  // ============================================================================
  // PHASE 4: ADD I18N TRANSLATIONS
  // ============================================================================

  ctx.log('info', 'Phase 4: Add i18n Translations');

  const i18nTask = await ctx.task(addTranslationsTask, {
    projectRoot,
    adminDir
  });

  artifacts.push(...(i18nTask.artifacts || []));

  // ============================================================================
  // PHASE 5: ADD STYLES
  // ============================================================================

  ctx.log('info', 'Phase 5: Add Dashboard Styles');

  const stylesTask = await ctx.task(addStylesTask, {
    projectRoot,
    adminDir
  });

  artifacts.push(...(stylesTask.artifacts || []));

  // ============================================================================
  // QUALITY GATE: User Review
  // ============================================================================

  await ctx.breakpoint({
    question: 'Errors Dashboard prototype is ready for review. Please test it in the browser and provide feedback. Approve to complete or reject to iterate.',
    title: 'Dashboard Prototype Review',
    options: ['Approve - looks good', 'Need changes'],
    context: {
      runId: ctx.runId,
      filesCreated: artifacts.map(a => a.path),
      testUrl: 'Open admin/index.html in browser and click "Errors" tab'
    }
  });

  // ============================================================================
  // COMPLETION
  // ============================================================================

  const duration = ctx.now() - startTime;
  ctx.log('info', `Errors Dashboard prototype completed in ${duration}ms`);

  return {
    success: true,
    files: artifacts,
    summary: `Created errors dashboard with ${artifacts.length} files`,
    duration
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

const dashboardDesignTask = defineTask('dashboard-design', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Design Errors Dashboard Component',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'UI/UX Designer and Frontend Architect',
      task: `Design the structure for an errors dashboard component for the Primo Maps admin panel.

The dashboard should:
1. Display validation errors from CSV data (missing fields, invalid ranges, duplicates, SVG code issues)
2. Support Hebrew/English bilingual UI with RTL
3. Follow existing admin UI patterns (Tailwind CSS, vanilla JS modules)
4. Include:
   - Summary section with error/warning counts
   - Filterable error list grouped by category
   - Each error item shows: row identifier, error type, affected field, message
   - Click to navigate to row in Location Editor

Output a design spec including:
- Component structure (HTML outline)
- State management approach
- Event handling patterns
- Integration points with existing code

Reference existing components: validation-panel.js, location-editor.js, results-container.js`,
      context: {
        projectRoot: args.projectRoot,
        adminDir: args.adminDir,
        requirements: args.requirements
      },
      outputFormat: 'JSON with design spec'
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

const implementDashboardTask = defineTask('implement-dashboard', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Implement Errors Dashboard Component',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend Developer',
      task: `Create the errors-dashboard.js component file at admin/components/errors-dashboard.js

Requirements:
1. Follow the existing component patterns in the codebase (ES modules, init functions)
2. Support Hebrew/English with i18n.js
3. Use logical CSS properties for RTL support
4. Implement:
   - initErrorsDashboard(containerId) function
   - Summary stats section (error count, warning count, data health score)
   - Error list grouped by category (E001-E006, W001-W003)
   - Filter by severity (errors only, warnings only, all)
   - Sort options (by row, by type, by field)
   - Click handler to emit navigation event
   - Refresh functionality

Use data-model.js for validation logic (validateRow, VALIDATION_ERRORS, VALIDATION_WARNINGS)
Fetch CSV data using the existing API pattern from location-editor.js

Create the actual file with working code. Do NOT just describe it.`,
      context: {
        projectRoot: args.projectRoot,
        adminDir: args.adminDir,
        design: args.design
      },
      outputFormat: 'JSON with { componentPath: string, artifacts: array }'
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

const integrateDashboardTask = defineTask('integrate-dashboard', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Integrate Dashboard into Admin Navigation',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend Developer',
      task: `Integrate the errors dashboard into the admin UI:

1. Add navigation tab in index.html:
   - Add "Errors" tab button after "Location Editor" tab
   - Add view container div with id="errors-dashboard"
   - Use data-i18n="nav.errors" for translation

2. Update app.js:
   - Import initErrorsDashboard
   - Add nav-errors click handler
   - Add 'errors' case to showView function
   - Wire up navigation from errors to location-editor (when clicking an error)

Make the actual edits to the files. Use the Edit tool.`,
      context: {
        projectRoot: args.projectRoot,
        adminDir: args.adminDir,
        componentPath: args.componentPath
      },
      outputFormat: 'JSON with { artifacts: array }'
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

const addTranslationsTask = defineTask('add-translations', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Add i18n Translations',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend Developer',
      task: `Add translations for the errors dashboard to both i18n/en.json and i18n/he.json:

Add these keys under "errors" section:
- nav.errors: "Errors" / "שגיאות"
- errors.title: "Validation Errors Dashboard" / "לוח שגיאות תקינות"
- errors.summary: "Summary" / "סיכום"
- errors.errorCount: "{count} Errors" / "{count} שגיאות"
- errors.warningCount: "{count} Warnings" / "{count} אזהרות"
- errors.healthScore: "Data Health" / "בריאות נתונים"
- errors.filterAll: "All Issues" / "כל הבעיות"
- errors.filterErrors: "Errors Only" / "שגיאות בלבד"
- errors.filterWarnings: "Warnings Only" / "אזהרות בלבד"
- errors.sortByRow: "Sort by Row" / "מיין לפי שורה"
- errors.sortByType: "Sort by Type" / "מיין לפי סוג"
- errors.goToRow: "Go to row" / "עבור לשורה"
- errors.noIssues: "No validation issues found" / "לא נמצאו בעיות תקינות"
- errors.refresh: "Refresh" / "רענן"
- errors.export: "Export" / "ייצא"

Use the Edit tool to add these to the JSON files.`,
      context: {
        projectRoot: args.projectRoot,
        adminDir: args.adminDir
      },
      outputFormat: 'JSON with { artifacts: array }'
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

const addStylesTask = defineTask('add-styles', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Add Dashboard CSS Styles',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend Developer',
      task: `Add CSS styles for the errors dashboard to admin/styles/app.css

Add a new section "Errors Dashboard Styles" with:
- .errors-dashboard container styles
- .errors-summary-cards grid layout (3 cards)
- .errors-summary-card with icon, count, label
- .errors-filter-bar flex layout
- .errors-list scrollable container
- .errors-category collapsible section
- .errors-item row with hover state
- .errors-item-error red accent
- .errors-item-warning amber accent
- Health score badge with color coding (green/yellow/red)
- RTL-compatible with logical properties
- Consistent with existing validation-panel styles

Use the Edit tool to append these styles.`,
      context: {
        projectRoot: args.projectRoot,
        adminDir: args.adminDir
      },
      outputFormat: 'JSON with { artifacts: array }'
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export default process;
