/**
 * @process phase3-versioning-tdd
 * @description Phase 3: Version History & Data Protection - TDD Implementation
 *
 * Implements versioning system with automatic backups, restore functionality,
 * version history UI, diff view, and retention policy using TDD methodology.
 *
 * Target: 95% test pass rate
 * Test Framework: Jest (Lambda) + Playwright (E2E)
 *
 * @inputs { targetCoverage: number }
 * @outputs { success: boolean, testsPass: number, coverage: object }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

/**
 * Phase 3 TDD Process
 *
 * Tasks breakdown:
 * 1. Backend - Version Management API
 *    - listVersions (GET /api/versions/csv, GET /api/versions/svg)
 *    - getVersion (GET /api/versions/csv/{versionId})
 *    - restoreVersion (POST /api/versions/csv/{versionId}/restore)
 *
 * 2. Backend - Auto-versioning (already partially in putCsv.mjs)
 *    - Enhance SVG versioning on upload/delete
 *    - Retention policy enforcement
 *
 * 3. Frontend - Version History UI
 *    - Version list panel component
 *    - Version preview panel
 *    - Restore confirmation dialog
 *    - Diff view (optional)
 *
 * 4. Integration - Full stack testing
 *    - Playwright E2E tests
 */
export async function process(inputs, ctx) {
  const {
    targetCoverage = 95
  } = inputs;

  // ============================================================================
  // MILESTONE 1: BACKEND VERSIONING LAMBDAS (TDD)
  // ============================================================================

  // Task 1.1: Setup test infrastructure
  const testSetupResult = await ctx.task(setupTestInfrastructureTask, {
    projectPath: '/home/hagaybar/projects/primo_maps',
    testFramework: 'jest',
    mockFramework: 'aws-sdk-client-mock'
  });

  await ctx.breakpoint({
    question: 'Test infrastructure setup complete. Review the Jest configuration and mock setup. Proceed with TDD for listVersions Lambda?',
    title: 'Test Setup Review',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'lambda/jest.config.js', format: 'code', label: 'Jest Config' },
        { path: 'lambda/package.json', format: 'code', label: 'Package JSON' }
      ]
    }
  });

  // Task 1.2: TDD - listVersions Lambda (CSV)
  const listVersionsCsvResult = await ctx.task(tddLambdaTask, {
    lambdaName: 'listVersionsCsv',
    endpoint: 'GET /api/versions/csv',
    description: 'List all CSV versions with metadata (timestamp, username, size)',
    acceptanceCriteria: [
      'Returns array of version objects sorted by date (newest first)',
      'Each version includes: key, timestamp, username, size, etag',
      'Handles empty versions folder gracefully',
      'Returns proper error response on S3 failure',
      'CORS headers included in response'
    ],
    s3Operations: ['ListObjectsV2'],
    existingLambdas: ['getCsv', 'putCsv', 'listSvg']
  });

  // Task 1.3: TDD - listVersions Lambda (SVG)
  const listVersionsSvgResult = await ctx.task(tddLambdaTask, {
    lambdaName: 'listVersionsSvg',
    endpoint: 'GET /api/versions/svg',
    description: 'List all SVG versions grouped by filename',
    acceptanceCriteria: [
      'Returns versions grouped by SVG filename',
      'Each group sorted by date (newest first)',
      'Each version includes: key, timestamp, username, size',
      'Handles empty versions folder gracefully',
      'CORS headers included in response'
    ],
    s3Operations: ['ListObjectsV2'],
    existingLambdas: ['getCsv', 'putCsv', 'listSvg']
  });

  // Task 1.4: TDD - getVersion Lambda
  const getVersionResult = await ctx.task(tddLambdaTask, {
    lambdaName: 'getVersion',
    endpoint: 'GET /api/versions/csv/{versionId}',
    description: 'Get content of a specific CSV version',
    acceptanceCriteria: [
      'Returns version content as text/csv',
      'Validates versionId format (mapping_{timestamp}_{user}.csv)',
      'Returns 404 if version not found',
      'Returns proper error on S3 failure',
      'CORS headers included in response'
    ],
    s3Operations: ['GetObject'],
    existingLambdas: ['getCsv', 'putCsv']
  });

  // Task 1.5: TDD - restoreVersion Lambda
  const restoreVersionResult = await ctx.task(tddLambdaTask, {
    lambdaName: 'restoreVersion',
    endpoint: 'POST /api/versions/csv/{versionId}/restore',
    description: 'Restore a CSV version (copies version to current, creates backup first)',
    acceptanceCriteria: [
      'Creates backup of current file before restore',
      'Copies version content to data/mapping.csv',
      'Includes username from request body in backup filename',
      'Invalidates CloudFront cache after restore',
      'Enforces retention policy after restore',
      'Returns success with details of backup created',
      'Returns 404 if version not found',
      'CORS headers included in response'
    ],
    s3Operations: ['GetObject', 'PutObject', 'ListObjectsV2', 'DeleteObjects'],
    cloudFrontOperations: ['CreateInvalidation'],
    existingLambdas: ['putCsv']
  });

  // Milestone 1 checkpoint
  const backendTestsResult = await ctx.task(runTestsTask, {
    testPath: 'lambda/__tests__',
    coverage: true,
    targetCoverage: 90
  });

  await ctx.breakpoint({
    question: `Backend Lambda tests complete. Pass rate: ${backendTestsResult.passRate}%. Coverage: ${backendTestsResult.coverage}%. Proceed to Milestone 2 (Frontend UI)?`,
    title: 'Milestone 1 Complete - Backend Versioning',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'lambda/__tests__/test-report.json', format: 'json', label: 'Test Report' },
        { path: 'lambda/coverage/lcov-report/index.html', format: 'html', label: 'Coverage' }
      ]
    }
  });

  // ============================================================================
  // MILESTONE 2: FRONTEND VERSION HISTORY UI (TDD)
  // ============================================================================

  // Task 2.1: TDD - Version History Panel Component
  const versionPanelResult = await ctx.task(tddFrontendTask, {
    componentName: 'version-history',
    description: 'Version history panel showing list of versions for CSV/SVG',
    acceptanceCriteria: [
      'Displays list of versions sorted by date (newest first)',
      'Shows timestamp in localized format (Hebrew/English)',
      'Shows username who made the change',
      'Shows file size in human-readable format',
      'Clickable rows to preview version',
      'Restore button on each version row',
      'Loading state while fetching versions',
      'Empty state when no versions exist',
      'Error state on fetch failure',
      'RTL layout support for Hebrew mode'
    ],
    i18nKeys: [
      'versions.title',
      'versions.timestamp',
      'versions.user',
      'versions.size',
      'versions.restore',
      'versions.preview',
      'versions.noVersions',
      'versions.loadError'
    ]
  });

  // Task 2.2: TDD - Restore Confirmation Dialog
  const confirmDialogResult = await ctx.task(tddFrontendTask, {
    componentName: 'restore-confirm-dialog',
    description: 'Confirmation dialog for restore operations',
    acceptanceCriteria: [
      'Shows warning message about restore action',
      'Displays version details (timestamp, username)',
      'Confirm and Cancel buttons',
      'Localized text (Hebrew/English)',
      'RTL layout support',
      'Accessible (keyboard navigation, ARIA)',
      'Loading state during restore',
      'Success/Error feedback after restore'
    ],
    i18nKeys: [
      'dialog.restoreConfirm',
      'dialog.restoreWarning',
      'dialog.confirm',
      'dialog.cancel',
      'dialog.restoring',
      'dialog.restoreSuccess',
      'dialog.restoreError'
    ]
  });

  // Task 2.3: TDD - Version Preview Panel
  const versionPreviewResult = await ctx.task(tddFrontendTask, {
    componentName: 'version-preview',
    description: 'Preview panel showing version content',
    acceptanceCriteria: [
      'Displays CSV content in read-only table format',
      'Shows version metadata (timestamp, user)',
      'Restore from preview button',
      'Close preview button',
      'Loading state while fetching content',
      'BiDi text support for mixed Hebrew/English',
      'Scrollable for large content'
    ],
    i18nKeys: [
      'preview.title',
      'preview.close',
      'preview.restoreThis'
    ]
  });

  // Task 2.4: TDD - Version Diff View (Optional Enhancement)
  const diffViewResult = await ctx.task(tddFrontendTask, {
    componentName: 'version-diff',
    description: 'Side-by-side diff view comparing versions',
    acceptanceCriteria: [
      'Shows current vs selected version side-by-side',
      'Highlights added/removed/changed rows',
      'Color coding: green=added, red=removed, yellow=changed',
      'Synchronized scrolling between panels',
      'Summary of changes count',
      'BiDi support for Hebrew content',
      'Responsive layout'
    ],
    optional: true,
    i18nKeys: [
      'diff.title',
      'diff.current',
      'diff.version',
      'diff.added',
      'diff.removed',
      'diff.changed'
    ]
  });

  // Frontend tests checkpoint
  const frontendTestsResult = await ctx.task(runTestsTask, {
    testPath: 'admin/__tests__',
    coverage: true,
    targetCoverage: 85
  });

  await ctx.breakpoint({
    question: `Frontend component tests complete. Pass rate: ${frontendTestsResult.passRate}%. Coverage: ${frontendTestsResult.coverage}%. Proceed to Milestone 3 (Integration)?`,
    title: 'Milestone 2 Complete - Frontend UI',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'admin/__tests__/test-report.json', format: 'json', label: 'Test Report' }
      ]
    }
  });

  // ============================================================================
  // MILESTONE 3: INTEGRATION (Admin UI + Lambda)
  // ============================================================================

  // Task 3.1: Integrate version-history component into admin
  const integrationResult = await ctx.task(integrateVersionHistoryTask, {
    components: ['version-history', 'restore-confirm-dialog', 'version-preview'],
    adminFiles: ['admin/app.js', 'admin/index.html'],
    navigation: 'Add "Version History" tab to navigation',
    i18nFiles: ['admin/i18n/en.json', 'admin/i18n/he.json']
  });

  // Task 3.2: Deploy Lambdas to AWS
  const deployResult = await ctx.task(deployLambdasTask, {
    lambdas: ['listVersionsCsv', 'listVersionsSvg', 'getVersion', 'restoreVersion'],
    apiGateway: 'Add routes to existing API Gateway',
    region: 'us-east-1'
  });

  await ctx.breakpoint({
    question: 'Lambdas deployed and integrated. Ready to run E2E tests with Playwright?',
    title: 'Integration Ready',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'artifacts/deploy-log.json', format: 'json', label: 'Deploy Log' }
      ]
    }
  });

  // ============================================================================
  // MILESTONE 4: E2E TESTING WITH PLAYWRIGHT
  // ============================================================================

  // Task 4.1: TDD - E2E Test Suite
  const e2eTestsResult = await ctx.task(tddPlaywrightTask, {
    testSuite: 'version-history-e2e',
    scenarios: [
      {
        name: 'View version history',
        steps: [
          'Navigate to admin panel',
          'Click on Version History tab',
          'Verify version list loads',
          'Verify versions sorted by date'
        ]
      },
      {
        name: 'Preview a version',
        steps: [
          'Navigate to version history',
          'Click on a version row',
          'Verify preview panel opens',
          'Verify content displays correctly'
        ]
      },
      {
        name: 'Restore a version',
        steps: [
          'Navigate to version history',
          'Click restore on a version',
          'Verify confirmation dialog appears',
          'Confirm restore',
          'Verify success notification',
          'Verify current data updated'
        ]
      },
      {
        name: 'Version created on save',
        steps: [
          'Navigate to CSV editor',
          'Make a change to data',
          'Save changes',
          'Navigate to version history',
          'Verify new version appears'
        ]
      },
      {
        name: 'BiDi support - Hebrew mode',
        steps: [
          'Switch to Hebrew language',
          'Navigate to version history',
          'Verify RTL layout',
          'Verify Hebrew labels'
        ]
      }
    ],
    targetPassRate: 95
  });

  // Final test run
  const finalTestsResult = await ctx.task(runAllTestsTask, {
    testPaths: ['lambda/__tests__', 'admin/__tests__', 'e2e'],
    coverage: true,
    targetCoverage: targetCoverage
  });

  // Final review
  await ctx.breakpoint({
    question: `Phase 3 TDD Complete!\n\nTest Results:\n- Backend: ${finalTestsResult.backend.passRate}% pass\n- Frontend: ${finalTestsResult.frontend.passRate}% pass\n- E2E: ${finalTestsResult.e2e.passRate}% pass\n- Overall: ${finalTestsResult.overall.passRate}% pass\n\nTarget was ${targetCoverage}%. Approve to finalize?`,
    title: 'Phase 3 Complete - Final Review',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'artifacts/final-test-report.json', format: 'json', label: 'Final Report' },
        { path: 'artifacts/coverage-summary.json', format: 'json', label: 'Coverage Summary' }
      ]
    }
  });

  return {
    success: finalTestsResult.overall.passRate >= targetCoverage,
    targetCoverage,
    testsPass: finalTestsResult.overall.passRate,
    coverage: finalTestsResult.coverage,
    milestones: {
      backend: backendTestsResult,
      frontend: frontendTestsResult,
      e2e: e2eTestsResult
    },
    deliverables: {
      lambdas: ['listVersionsCsv', 'listVersionsSvg', 'getVersion', 'restoreVersion'],
      components: ['version-history', 'restore-confirm-dialog', 'version-preview', 'version-diff'],
      tests: {
        unit: finalTestsResult.backend.testCount + finalTestsResult.frontend.testCount,
        e2e: finalTestsResult.e2e.testCount
      }
    }
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

/**
 * Task: Setup Test Infrastructure
 */
export const setupTestInfrastructureTask = defineTask('setup-test-infrastructure', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Setup Jest and test infrastructure',
  description: 'Configure Jest, AWS SDK mocks, and test utilities',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer and test infrastructure specialist',
      task: 'Set up Jest testing infrastructure for Lambda functions with AWS SDK mocking',
      context: {
        projectPath: args.projectPath,
        testFramework: args.testFramework,
        mockFramework: args.mockFramework,
        existingFiles: {
          lambdaDir: 'lambda/',
          existingLambdas: ['getCsv.mjs', 'putCsv.mjs', 'listSvg.mjs', 'uploadSvg.mjs', 'deleteSvg.mjs']
        }
      },
      instructions: [
        'Create jest.config.js in lambda/ directory configured for ESM modules',
        'Update lambda/package.json with test scripts and dependencies: jest, @aws-sdk/client-s3-mock, aws-sdk-client-mock',
        'Create lambda/__tests__/setup.js for common test setup',
        'Create lambda/__tests__/mocks/ directory with AWS SDK mock helpers',
        'Ensure config supports async/await and ESM imports',
        'Add coverage configuration to track test coverage',
        'Run npm install to install dependencies',
        'Verify setup with a simple passing test'
      ],
      outputFormat: 'JSON with files created, dependencies installed, verification result'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'filesCreated', 'dependenciesInstalled'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        dependenciesInstalled: { type: 'array', items: { type: 'string' } },
        verificationResult: { type: 'string' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['setup', 'jest', 'infrastructure']
}));

/**
 * Task: TDD Lambda Implementation
 */
export const tddLambdaTask = defineTask('tdd-lambda', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.lambdaName}`,
  description: `Implement ${args.lambdaName} Lambda using TDD`,

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior backend engineer practicing Test-Driven Development',
      task: `Implement ${args.lambdaName} Lambda function using TDD methodology`,
      context: {
        lambdaName: args.lambdaName,
        endpoint: args.endpoint,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria,
        s3Operations: args.s3Operations,
        cloudFrontOperations: args.cloudFrontOperations || [],
        existingLambdas: args.existingLambdas,
        bucket: 'tau-cenlib-primo-assets-hagay-3602',
        distributionId: 'E5SR0E5GM5GSB',
        versionsPrefix: 'versions/'
      },
      instructions: [
        '1. RED: Write failing tests first in lambda/__tests__/${lambdaName}.test.mjs',
        '   - Test each acceptance criterion',
        '   - Use aws-sdk-client-mock to mock S3/CloudFront operations',
        '   - Include tests for success cases, error cases, and edge cases',
        '2. Run tests to verify they fail (npm test)',
        '3. GREEN: Implement lambda/${lambdaName}.mjs to make tests pass',
        '   - Use existing Lambda patterns from getCsv.mjs and putCsv.mjs',
        '   - Include proper CORS headers',
        '   - Include proper error handling',
        '4. Run tests to verify they pass',
        '5. REFACTOR: Clean up code while keeping tests green',
        '6. Create lambda/${lambdaName}.zip for deployment',
        'Follow existing code patterns from the codebase'
      ],
      outputFormat: 'JSON with test file, implementation file, test results, and any issues'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'testFile', 'implementationFile', 'testsPass', 'coverage'],
      properties: {
        success: { type: 'boolean' },
        testFile: { type: 'string' },
        implementationFile: { type: 'string' },
        testsPass: { type: 'number' },
        testsFail: { type: 'number' },
        coverage: { type: 'number' },
        issues: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['tdd', 'lambda', args.lambdaName]
}));

/**
 * Task: TDD Frontend Component
 */
export const tddFrontendTask = defineTask('tdd-frontend', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.componentName} component`,
  description: `Implement ${args.componentName} using TDD`,

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior frontend engineer practicing Test-Driven Development with focus on accessibility and i18n',
      task: `Implement ${args.componentName} component using TDD methodology`,
      context: {
        componentName: args.componentName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria,
        i18nKeys: args.i18nKeys,
        optional: args.optional || false,
        existingComponents: ['csv-editor.js', 'svg-manager.js', 'toast.js', 'validation.js'],
        i18nModule: 'admin/i18n.js',
        stylesDir: 'admin/styles/'
      },
      instructions: [
        '1. RED: Write failing tests first in admin/__tests__/${componentName}.test.js',
        '   - Use Jest with jsdom for DOM testing',
        '   - Test each acceptance criterion',
        '   - Include accessibility tests (ARIA, keyboard nav)',
        '   - Test both LTR (English) and RTL (Hebrew) modes',
        '2. Run tests to verify they fail',
        '3. GREEN: Implement admin/components/${componentName}.js',
        '   - Follow patterns from existing csv-editor.js',
        '   - Use i18n module for all user-facing text',
        '   - Support RTL/LTR layout switching',
        '   - Use logical CSS properties (start/end vs left/right)',
        '4. Add i18n keys to admin/i18n/en.json and admin/i18n/he.json',
        '5. Add any needed styles to admin/styles/',
        '6. Run tests to verify they pass',
        '7. REFACTOR: Clean up code while keeping tests green'
      ],
      outputFormat: 'JSON with test file, implementation file, i18n updates, test results'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'testFile', 'implementationFile', 'testsPass'],
      properties: {
        success: { type: 'boolean' },
        testFile: { type: 'string' },
        implementationFile: { type: 'string' },
        i18nUpdates: {
          type: 'object',
          properties: {
            en: { type: 'object' },
            he: { type: 'object' }
          }
        },
        testsPass: { type: 'number' },
        testsFail: { type: 'number' },
        coverage: { type: 'number' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['tdd', 'frontend', args.componentName]
}));

/**
 * Task: Run Tests
 */
export const runTestsTask = defineTask('run-tests', (args, taskCtx) => ({
  kind: 'agent',
  title: `Run tests: ${args.testPath}`,
  description: 'Execute test suite and report results',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Test engineer',
      task: 'Run tests and report results with coverage',
      context: {
        testPath: args.testPath,
        coverage: args.coverage,
        targetCoverage: args.targetCoverage
      },
      instructions: [
        `Run: npm test -- ${args.testPath} ${args.coverage ? '--coverage' : ''}`,
        'Capture all test output',
        'Parse results for pass/fail counts',
        'If coverage enabled, extract coverage percentages',
        'Report any test failures with details',
        'Compare against target coverage if specified'
      ],
      outputFormat: 'JSON with pass rate, coverage, failures'
    },
    outputSchema: {
      type: 'object',
      required: ['passRate', 'testCount', 'passCount', 'failCount'],
      properties: {
        passRate: { type: 'number' },
        testCount: { type: 'number' },
        passCount: { type: 'number' },
        failCount: { type: 'number' },
        coverage: { type: 'number' },
        failures: { type: 'array', items: { type: 'object' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['testing']
}));

/**
 * Task: Integrate Version History
 */
export const integrateVersionHistoryTask = defineTask('integrate-version-history', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Integrate version history into admin UI',
  description: 'Add version history components to admin application',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Full-stack developer',
      task: 'Integrate version history components into the admin UI',
      context: {
        components: args.components,
        adminFiles: args.adminFiles,
        navigation: args.navigation,
        i18nFiles: args.i18nFiles
      },
      instructions: [
        'Add "Version History" tab to navigation in admin/index.html',
        'Update admin/app.js to handle version history view',
        'Import version-history, restore-confirm-dialog, version-preview components',
        'Add navigation event handler for version history tab',
        'Update i18n files with navigation label (en: "Version History", he: "היסטוריית גרסאות")',
        'Ensure proper lazy loading of version data',
        'Test navigation between views'
      ],
      outputFormat: 'JSON with files modified and integration status'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'filesModified'],
      properties: {
        success: { type: 'boolean' },
        filesModified: { type: 'array', items: { type: 'string' } },
        integrationNotes: { type: 'string' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['integration', 'frontend']
}));

/**
 * Task: Deploy Lambdas
 */
export const deployLambdasTask = defineTask('deploy-lambdas', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Deploy Lambda functions to AWS',
  description: 'Deploy new Lambda functions and configure API Gateway',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'AWS DevOps engineer',
      task: 'Deploy Lambda functions and configure API Gateway routes',
      context: {
        lambdas: args.lambdas,
        apiGateway: args.apiGateway,
        region: args.region,
        existingConfig: {
          apiEndpoint: 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod',
          bucket: 'tau-cenlib-primo-assets-hagay-3602',
          distributionId: 'E5SR0E5GM5GSB'
        }
      },
      instructions: [
        'For each Lambda in the list:',
        '  1. Create ZIP file if not exists',
        '  2. Create/update Lambda function using AWS CLI',
        '  3. Set proper IAM role with S3 and CloudFront permissions',
        '  4. Configure Lambda environment variables',
        'For API Gateway:',
        '  1. Add routes for each Lambda',
        '  2. Configure CORS for each route',
        '  3. Deploy to prod stage',
        'Verify deployment with test requests'
      ],
      outputFormat: 'JSON with deployment status for each Lambda'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'deployedLambdas', 'apiRoutes'],
      properties: {
        success: { type: 'boolean' },
        deployedLambdas: { type: 'array', items: { type: 'string' } },
        apiRoutes: { type: 'array', items: { type: 'object' } },
        verificationResults: { type: 'array', items: { type: 'object' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['deployment', 'aws']
}));

/**
 * Task: TDD Playwright E2E Tests
 */
export const tddPlaywrightTask = defineTask('tdd-playwright', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD E2E: ${args.testSuite}`,
  description: 'Create and run Playwright E2E tests',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'E2E test engineer specializing in Playwright',
      task: 'Create and run Playwright E2E tests for version history feature',
      context: {
        testSuite: args.testSuite,
        scenarios: args.scenarios,
        targetPassRate: args.targetPassRate,
        adminUrl: 'file:///home/hagaybar/projects/primo_maps/admin/index.html',
        playwrightMcp: 'playwright MCP server is available'
      },
      instructions: [
        'Use the playwright MCP tools to run E2E tests',
        'For each scenario:',
        '  1. Navigate to the admin panel using browser_navigate',
        '  2. Execute test steps using browser_click, browser_type, browser_snapshot',
        '  3. Verify expected outcomes using browser_snapshot and assertions',
        '  4. Capture screenshots on failure',
        'Test both English (LTR) and Hebrew (RTL) modes',
        'Report pass/fail for each scenario',
        'Calculate overall pass rate'
      ],
      outputFormat: 'JSON with scenario results and overall pass rate'
    },
    outputSchema: {
      type: 'object',
      required: ['passRate', 'scenarios'],
      properties: {
        passRate: { type: 'number' },
        scenarios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              passed: { type: 'boolean' },
              error: { type: 'string' },
              screenshot: { type: 'string' }
            }
          }
        },
        testCount: { type: 'number' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['e2e', 'playwright']
}));

/**
 * Task: Run All Tests
 */
export const runAllTestsTask = defineTask('run-all-tests', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Run all test suites',
  description: 'Execute all tests and compile final report',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA lead',
      task: 'Run all tests and compile comprehensive report',
      context: {
        testPaths: args.testPaths,
        coverage: args.coverage,
        targetCoverage: args.targetCoverage
      },
      instructions: [
        'Run backend tests: npm test -- lambda/__tests__',
        'Run frontend tests: npm test -- admin/__tests__',
        'Run E2E tests with Playwright MCP',
        'Compile all results into comprehensive report',
        'Calculate overall pass rate',
        'Compare against target coverage',
        'Identify any failing tests'
      ],
      outputFormat: 'JSON with breakdown by test type and overall metrics'
    },
    outputSchema: {
      type: 'object',
      required: ['overall', 'backend', 'frontend', 'e2e'],
      properties: {
        overall: {
          type: 'object',
          properties: {
            passRate: { type: 'number' },
            testCount: { type: 'number' }
          }
        },
        backend: {
          type: 'object',
          properties: {
            passRate: { type: 'number' },
            testCount: { type: 'number' }
          }
        },
        frontend: {
          type: 'object',
          properties: {
            passRate: { type: 'number' },
            testCount: { type: 'number' }
          }
        },
        e2e: {
          type: 'object',
          properties: {
            passRate: { type: 'number' },
            testCount: { type: 'number' }
          }
        },
        coverage: { type: 'number' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['testing', 'final-report']
}));
