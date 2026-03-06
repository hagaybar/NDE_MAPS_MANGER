/**
 * @process editor-range-restrictions
 * @description Implement row-based range restrictions for editor role in Primo Maps.
 * Editors will only see and edit rows matching their assigned ranges (collections, floors, call numbers).
 * Admin users can configure these ranges per editor in the user management UI.
 * Enforcement happens both on frontend (filtering) and backend (validation).
 *
 * @inputs {
 *   projectDir: string,
 *   testMode?: boolean
 * }
 * @outputs {
 *   success: boolean,
 *   artifacts: array,
 *   testsPass: boolean
 * }
 *
 * @skill frontend-design specializations/web-development/skills/frontend-design/SKILL.md
 * @skill e2e-testing specializations/web-development/skills/e2e-testing/SKILL.md
 * @agent auth-specialist specializations/web-development/agents/auth-specialist/AGENT.md
 * @agent backend-developer specializations/web-development/agents/backend-developer/AGENT.md
 * @agent frontend-architect specializations/web-development/agents/frontend-architect/AGENT.md
 * @agent e2e-testing specializations/web-development/agents/e2e-testing/AGENT.md
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const { projectDir = '/home/hagaybar/projects/primo_maps', testMode = false } = inputs;
  const startTime = ctx.now();
  const artifacts = [];

  ctx.log('info', 'Starting Editor Range Restrictions Implementation');

  // Phase 1: Design and Architecture
  ctx.log('info', 'Phase 1: Architecture Design');
  const architecture = await ctx.task(architectureTask, { projectDir });
  artifacts.push(...(architecture.artifacts || []));

  // Phase 2: Data Model Updates
  ctx.log('info', 'Phase 2: Data Model for Editor Ranges');
  const dataModel = await ctx.task(dataModelTask, { projectDir, architecture });
  artifacts.push(...(dataModel.artifacts || []));

  // Phase 3: Backend Implementation
  ctx.log('info', 'Phase 3: Backend API Updates');
  const backend = await ctx.task(backendTask, { projectDir, dataModel });
  artifacts.push(...(backend.artifacts || []));

  // Phase 4: Admin UI - Range Configuration
  ctx.log('info', 'Phase 4: Admin UI for Range Configuration');
  const adminUI = await ctx.task(adminUITask, { projectDir, backend });
  artifacts.push(...(adminUI.artifacts || []));

  // Phase 5: Editor UI - Filtered View
  ctx.log('info', 'Phase 5: Editor Filtered View');
  const editorUI = await ctx.task(editorUITask, { projectDir, adminUI });
  artifacts.push(...(editorUI.artifacts || []));

  // Phase 6: Integration Testing
  ctx.log('info', 'Phase 6: Integration Testing');
  const integration = await ctx.task(integrationTask, { projectDir });
  artifacts.push(...(integration.artifacts || []));

  // Breakpoint for review before E2E tests
  await ctx.breakpoint({
    question: `Implementation complete. Review changes before running E2E tests?\n\nArtifacts created:\n${artifacts.map(a => `- ${a}`).join('\n')}`,
    title: 'Pre-E2E Review',
    context: { runId: ctx.runId, artifacts }
  });

  // Phase 7: E2E Tests
  ctx.log('info', 'Phase 7: E2E Tests');
  const e2eTests = await ctx.task(e2eTestsTask, { projectDir, testMode });
  artifacts.push(...(e2eTests.artifacts || []));

  // Quality gate - verify tests pass
  if (!e2eTests.allPassed && !testMode) {
    ctx.log('warn', 'E2E tests failed - entering refinement loop');
    const refinement = await ctx.task(refinementTask, { projectDir, failures: e2eTests.failures });
    artifacts.push(...(refinement.artifacts || []));
  }

  return {
    success: true,
    artifacts,
    testsPass: e2eTests.allPassed,
    duration: ctx.now() - startTime,
    metadata: { processId: 'editor-range-restrictions', timestamp: startTime }
  };
}

export const architectureTask = defineTask('architecture-design', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Design Editor Range Restrictions Architecture',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Fullstack Architect',
      task: `Design the architecture for editor range restrictions feature in the Primo Maps admin system.

CURRENT STATE:
- Two roles: admin (full access) and editor (read/write, no delete/user management)
- CSV data has columns: collectionName, collectionNameHe, floor, rangeStart, rangeEnd, svgCode, etc.
- Frontend: Vanilla JS SPA with components in admin/components/
- Backend: AWS Lambda functions with Cognito authentication
- User data stored in Cognito user pool

REQUIREMENTS:
1. Editors should have assigned "ranges" that define which rows they can see/edit
2. Ranges can filter by: collection name, floor number, call number range
3. Multiple filter criteria combined with AND logic
4. Admins configure ranges per editor in the user edit dialog
5. Frontend filters what editors see
6. Backend validates edits to prevent unauthorized changes

PROJECT STRUCTURE:
- admin/components/csv-editor.js - Main CSV editor
- admin/components/edit-user-dialog.js - User editing dialog
- admin/auth-guard.js - Role-based UI
- admin/user-service.js - User API client
- lambda/role-auth.mjs - Backend role checking
- lambda/putCsv.mjs - CSV update handler
- lambda/updateUser.mjs - User update handler`,
      context: args,
      instructions: [
        '1. Design data model for storing editor ranges (in Cognito custom attributes)',
        '2. Design API changes for getting/setting user ranges',
        '3. Design frontend filtering logic for CSV editor',
        '4. Design backend validation logic for CSV updates',
        '5. Design admin UI flow for range configuration',
        '6. Create implementation order with dependencies',
        '7. Identify files to modify and new files to create',
        '8. Consider i18n for Hebrew/English support',
        '9. Consider existing E2E test patterns'
      ],
      outputFormat: 'JSON with architecture design'
    },
    outputSchema: {
      type: 'object',
      required: ['dataModel', 'apiChanges', 'frontendChanges', 'backendChanges', 'implementationOrder', 'artifacts'],
      properties: {
        dataModel: { type: 'object' },
        apiChanges: { type: 'array' },
        frontendChanges: { type: 'array' },
        backendChanges: { type: 'array' },
        implementationOrder: { type: 'array' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['architecture', 'design', 'rbac']
}));

export const dataModelTask = defineTask('data-model', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Implement Data Model for Editor Ranges',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Backend Developer',
      task: `Implement the data model for storing editor range restrictions.

Based on architecture design, implement:
1. Define the JSON structure for editor ranges
2. Update Cognito user attributes (if using custom attributes) or design alternative storage
3. Create utility functions for parsing/validating ranges

RANGE STRUCTURE should support:
- collections: array of collection name patterns (can use wildcards)
- floors: array of floor numbers (0, 1, 2)
- callNumberRanges: array of {start, end} objects

Example range:
{
  "collections": ["CK Science*", "CC Classical*"],
  "floors": [1, 2],
  "callNumberRanges": [{"start": "000", "end": "599"}]
}

PROJECT DIR: ${args.projectDir}`,
      context: args,
      instructions: [
        '1. Create range schema definition',
        '2. Create validation utilities in a shared module',
        '3. Create row-matching function that checks if a CSV row matches a range',
        '4. Handle edge cases (empty ranges = no access, missing fields)',
        '5. Write the code files to the project directory'
      ],
      outputFormat: 'JSON with implementation details and artifacts'
    },
    outputSchema: {
      type: 'object',
      required: ['schema', 'utilities', 'artifacts'],
      properties: {
        schema: { type: 'object' },
        utilities: { type: 'array' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['data-model', 'backend']
}));

export const backendTask = defineTask('backend-implementation', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Implement Backend API for Range Restrictions',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Backend Developer',
      task: `Implement backend changes for editor range restrictions.

CHANGES NEEDED:
1. Update lambda/updateUser.mjs to accept and store editableRanges
2. Update lambda/putCsv.mjs to validate edits against user's ranges
3. Create new lambda function or add endpoint to get user's ranges
4. Update auth-middleware.mjs if needed to include ranges in token/response

KEY REQUIREMENTS:
- Store ranges as JSON string in Cognito custom:editableRanges attribute
- Validate that editor can only modify rows within their assigned ranges
- Return 403 with clear error message if edit is out of range
- Admins bypass range checks entirely

PROJECT DIR: ${args.projectDir}
Existing files: lambda/role-auth.mjs, lambda/putCsv.mjs, lambda/updateUser.mjs`,
      context: args,
      instructions: [
        '1. Read and understand existing Lambda code patterns',
        '2. Add editableRanges field to updateUser handler',
        '3. Implement range validation in putCsv before saving',
        '4. Create shared range-validation utility that both Lambda and frontend can use',
        '5. Update API responses to include editableRanges for editors',
        '6. Write all code changes to the project files'
      ],
      outputFormat: 'JSON with implementation details and artifacts'
    },
    outputSchema: {
      type: 'object',
      required: ['lambdaChanges', 'validation', 'artifacts'],
      properties: {
        lambdaChanges: { type: 'array' },
        validation: { type: 'object' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['backend', 'lambda', 'validation']
}));

export const adminUITask = defineTask('admin-ui', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Implement Admin UI for Range Configuration',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend Developer',
      task: `Implement admin UI for configuring editor range restrictions.

UI REQUIREMENTS:
1. Add "Editable Ranges" section to edit-user-dialog.js (only shown for editor role)
2. Allow selecting multiple collections from a dropdown/multi-select
3. Allow selecting floors (checkboxes: Floor 0, Floor 1, Floor 2)
4. Allow specifying call number ranges (add/remove range inputs)
5. Validate ranges before saving
6. Show current ranges when editing existing user
7. Support Hebrew/English (use i18n system)

EXISTING PATTERNS:
- Look at create-user-dialog.js and edit-user-dialog.js for modal patterns
- Use existing Tailwind CSS classes
- Follow existing form validation patterns

PROJECT DIR: ${args.projectDir}
Files to modify: admin/components/edit-user-dialog.js, admin/i18n/en.json, admin/i18n/he.json`,
      context: args,
      instructions: [
        '1. Read existing edit-user-dialog.js to understand patterns',
        '2. Add editable ranges UI section (hidden for admin role)',
        '3. Create collection multi-select with available collections from CSV',
        '4. Create floor checkbox group',
        '5. Create call number range input with add/remove',
        '6. Add i18n translations for new UI elements',
        '7. Connect to user-service for saving',
        '8. Write all changes to project files'
      ],
      outputFormat: 'JSON with implementation details and artifacts'
    },
    outputSchema: {
      type: 'object',
      required: ['uiComponents', 'translations', 'artifacts'],
      properties: {
        uiComponents: { type: 'array' },
        translations: { type: 'object' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['frontend', 'admin-ui', 'forms']
}));

export const editorUITask = defineTask('editor-ui', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Implement Editor Filtered View',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend Developer',
      task: `Implement filtered CSV view for editors based on their assigned ranges.

REQUIREMENTS:
1. When editor loads CSV editor, filter rows to only show allowed ranges
2. Show a message indicating filtered view: "Showing X of Y rows (filtered by your permissions)"
3. Disable editing for any row outside range (shouldn't be visible anyway)
4. Update save logic to only send allowed rows
5. Handle edge cases: empty ranges = show nothing with helpful message

EXISTING FILES:
- admin/components/csv-editor.js - main editor, loads all CSV data
- admin/auth-guard.js - has role info
- admin/auth-service.js - has user info including ranges

PROJECT DIR: ${args.projectDir}`,
      context: args,
      instructions: [
        '1. Read csv-editor.js to understand data loading',
        '2. Get user ranges from auth service after login',
        '3. Implement filterRowsByRange function using shared utilities',
        '4. Update renderTable to show filtered data',
        '5. Add info banner showing filter status',
        '6. Update save to validate against ranges',
        '7. Add i18n translations',
        '8. Write all changes to project files'
      ],
      outputFormat: 'JSON with implementation details and artifacts'
    },
    outputSchema: {
      type: 'object',
      required: ['editorChanges', 'filtering', 'artifacts'],
      properties: {
        editorChanges: { type: 'array' },
        filtering: { type: 'object' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['frontend', 'editor', 'filtering']
}));

export const integrationTask = defineTask('integration', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Integration Testing',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Engineer',
      task: `Verify integration of all components for editor range restrictions.

INTEGRATION POINTS:
1. User service correctly saves/loads ranges to/from backend
2. Auth service correctly parses ranges from user data
3. CSV editor correctly filters based on ranges
4. Backend correctly validates edits against ranges
5. Admin UI correctly displays and saves ranges

PROJECT DIR: ${args.projectDir}`,
      context: args,
      instructions: [
        '1. Review all modified files for consistency',
        '2. Check API contracts match between frontend/backend',
        '3. Verify range schema is consistent everywhere',
        '4. Check error handling for all edge cases',
        '5. Verify i18n keys are all defined',
        '6. Create integration test plan',
        '7. Fix any inconsistencies found'
      ],
      outputFormat: 'JSON with integration status and artifacts'
    },
    outputSchema: {
      type: 'object',
      required: ['status', 'issues', 'artifacts'],
      properties: {
        status: { type: 'string' },
        issues: { type: 'array' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['integration', 'qa']
}));

export const e2eTestsTask = defineTask('e2e-tests', (args, taskCtx) => ({
  kind: 'agent',
  title: 'E2E Tests for Range Restrictions',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'E2E Test Developer',
      task: `Create and run E2E tests for editor range restrictions feature.

TEST SCENARIOS:
1. Admin can configure ranges for editor user
2. Editor sees only rows within assigned ranges
3. Editor cannot see rows outside assigned ranges
4. Editor can edit rows within ranges
5. Backend rejects edits outside ranges (403)
6. Admin can see all rows regardless
7. Empty ranges shows no rows with message
8. Range configuration persists after reload

EXISTING TEST PATTERNS:
- e2e/tests/ directory with Playwright tests
- e2e/fixtures/ for auth fixtures
- e2e/pages/ for page objects

PROJECT DIR: ${args.projectDir}`,
      context: args,
      instructions: [
        '1. Read existing E2E test patterns in e2e/',
        '2. Create new test file: e2e/tests/editor-ranges.spec.js',
        '3. Add fixtures for editor user with specific ranges',
        '4. Write tests for all scenarios above',
        '5. Run tests with npx playwright test',
        '6. Report pass/fail status'
      ],
      outputFormat: 'JSON with test results and artifacts'
    },
    outputSchema: {
      type: 'object',
      required: ['allPassed', 'results', 'failures', 'artifacts'],
      properties: {
        allPassed: { type: 'boolean' },
        results: { type: 'array' },
        failures: { type: 'array' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['e2e', 'testing', 'playwright']
}));

export const refinementTask = defineTask('refinement', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Fix E2E Test Failures',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Debug Engineer',
      task: `Fix E2E test failures for editor range restrictions.

FAILURES: ${JSON.stringify(args.failures)}

PROJECT DIR: ${args.projectDir}`,
      context: args,
      instructions: [
        '1. Analyze each failure',
        '2. Read relevant code files',
        '3. Identify root cause',
        '4. Implement fix',
        '5. Re-run affected tests',
        '6. Repeat until all pass'
      ],
      outputFormat: 'JSON with fixes and artifacts'
    },
    outputSchema: {
      type: 'object',
      required: ['fixed', 'artifacts'],
      properties: {
        fixed: { type: 'boolean' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['debugging', 'fix']
}));
