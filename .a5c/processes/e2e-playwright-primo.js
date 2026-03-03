/**
 * @process primo-maps/e2e-playwright
 * @description E2E Testing Process for Primo Maps Admin SPA using Playwright MCP.
 * Covers: CSV Editor, SVG Manager, Version History, User Management,
 * Authentication, BiDi/RTL, and Language Toggle.
 * @inputs { applicationUrl: string, targetPassRate?: number, maxIterations?: number }
 * @outputs { success: boolean, passRate: number, fixesMade: array, testReport: object }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const {
    applicationUrl = 'http://localhost:8080',
    targetPassRate = 95,
    maxIterations = 3,
    outputDir = '.a5c/runs/' + ctx.runId + '/artifacts'
  } = inputs;

  const startTime = ctx.now();
  const artifacts = [];
  let iteration = 0;
  let currentPassRate = 0;
  let allFixesMade = [];

  ctx.log('info', `Starting E2E Testing for Primo Maps Admin at ${applicationUrl}`);

  // ============================================================================
  // PHASE 1: FEATURE INVENTORY & TEST DESIGN
  // ============================================================================

  ctx.log('info', 'Phase 1: Analyzing UI features and designing test suite');

  const featureInventory = await ctx.task(featureInventoryTask, {
    applicationUrl,
    outputDir
  });

  artifacts.push(...(featureInventory.artifacts || []));

  // ============================================================================
  // PHASE 2: PLAYWRIGHT SETUP & TEST IMPLEMENTATION
  // ============================================================================

  ctx.log('info', 'Phase 2: Setting up Playwright and implementing E2E tests');

  const playwrightSetup = await ctx.task(playwrightSetupTask, {
    projectRoot: '/home/hagaybar/projects/primo_maps',
    features: featureInventory.features,
    outputDir
  });

  artifacts.push(...(playwrightSetup.artifacts || []));

  // ============================================================================
  // PHASE 3: ITERATIVE TEST-FIX LOOP
  // ============================================================================

  ctx.log('info', 'Phase 3: Running tests and fixing issues iteratively');

  while (iteration < maxIterations && currentPassRate < targetPassRate) {
    iteration++;
    ctx.log('info', `Iteration ${iteration}/${maxIterations}`);

    // Run tests
    const testRun = await ctx.task(runTestsTask, {
      projectRoot: '/home/hagaybar/projects/primo_maps',
      applicationUrl,
      iteration,
      outputDir
    });

    currentPassRate = testRun.passRate || 0;
    artifacts.push(...(testRun.artifacts || []));

    ctx.log('info', `Pass rate: ${currentPassRate}% (target: ${targetPassRate}%)`);

    if (currentPassRate >= targetPassRate) {
      ctx.log('info', 'Target pass rate achieved!');
      break;
    }

    // Fix issues discovered
    const fixes = await ctx.task(fixIssuesTask, {
      projectRoot: '/home/hagaybar/projects/primo_maps',
      testResults: testRun,
      iteration,
      outputDir
    });

    allFixesMade.push(...(fixes.fixesMade || []));
    artifacts.push(...(fixes.artifacts || []));

    // Re-run tests after fixes to verify
    const verifyRun = await ctx.task(runTestsTask, {
      projectRoot: '/home/hagaybar/projects/primo_maps',
      applicationUrl,
      iteration: iteration + 0.5,
      outputDir
    });

    currentPassRate = verifyRun.passRate || 0;
    artifacts.push(...(verifyRun.artifacts || []));
  }

  // ============================================================================
  // PHASE 4: UI POLISH CHECK
  // ============================================================================

  ctx.log('info', 'Phase 4: Checking and fixing UI polish issues');

  const polishCheck = await ctx.task(uiPolishCheckTask, {
    projectRoot: '/home/hagaybar/projects/primo_maps',
    applicationUrl,
    outputDir
  });

  allFixesMade.push(...(polishCheck.fixesMade || []));
  artifacts.push(...(polishCheck.artifacts || []));

  // ============================================================================
  // PHASE 5: FINAL VERIFICATION & REPORT
  // ============================================================================

  ctx.log('info', 'Phase 5: Final verification run');

  const finalRun = await ctx.task(runTestsTask, {
    projectRoot: '/home/hagaybar/projects/primo_maps',
    applicationUrl,
    iteration: 'final',
    outputDir
  });

  currentPassRate = finalRun.passRate || 0;
  artifacts.push(...(finalRun.artifacts || []));

  // Generate summary report
  const summaryReport = await ctx.task(generateSummaryTask, {
    features: featureInventory.features,
    fixesMade: allFixesMade,
    finalTestResults: finalRun,
    iterations: iteration,
    outputDir
  });

  artifacts.push(...(summaryReport.artifacts || []));

  const endTime = ctx.now();

  return {
    success: currentPassRate >= targetPassRate,
    passRate: currentPassRate,
    targetPassRate,
    iterations: iteration,
    fixesMade: allFixesMade,
    testReport: finalRun,
    featuresCovered: featureInventory.features,
    summary: summaryReport.summary,
    howToRun: summaryReport.howToRun,
    knownLimitations: summaryReport.knownLimitations || [],
    artifacts,
    duration: endTime - startTime,
    metadata: {
      processId: 'primo-maps/e2e-playwright',
      timestamp: startTime
    }
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

export const featureInventoryTask = defineTask('feature-inventory', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Feature Inventory & Test Design',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior QA Engineer specializing in E2E test automation',
      task: 'Analyze the Primo Maps Admin SPA and create a comprehensive feature inventory for E2E testing',
      context: {
        applicationUrl: args.applicationUrl,
        knownFeatures: [
          'CSV Editor - edit location mapping data table',
          'SVG Manager - upload/preview/delete floor map SVG files',
          'Version History - view/preview/restore/diff versions',
          'User Management (admin only) - create/edit/delete users, reset passwords',
          'Authentication - login/logout with Cognito',
          'Language Toggle - Hebrew RTL / English LTR',
          'Navigation - 4 tabs with role-based visibility',
          'Toast Notifications - success/error messages',
          'User Menu - profile dropdown with logout'
        ],
        techStack: 'Vanilla JavaScript ES Modules, Tailwind CSS, AWS Cognito'
      },
      instructions: [
        '1. Review the admin/index.html and admin/app.js to understand app structure',
        '2. Examine each component in admin/components/*.js for functionality',
        '3. Create a prioritized list of E2E test scenarios covering:',
        '   - Critical paths (login, CSV editing, SVG upload)',
        '   - Navigation between all tabs',
        '   - Role-based access (admin vs editor)',
        '   - Language switching (Hebrew RTL / English LTR)',
        '   - Form validation and error states',
        '   - Dialog interactions (modals)',
        '4. Identify test data requirements',
        '5. Document expected selectors/locators for test stability',
        '6. Output the feature inventory with test scenarios'
      ],
      outputFormat: 'JSON with features array and testScenarios array'
    },
    outputSchema: {
      type: 'object',
      required: ['features', 'testScenarios'],
      properties: {
        features: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
              description: { type: 'string' },
              scenarios: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        testScenarios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              feature: { type: 'string' },
              title: { type: 'string' },
              type: { type: 'string', enum: ['positive', 'negative', 'edge-case'] },
              steps: { type: 'array', items: { type: 'string' } },
              assertions: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['e2e', 'feature-inventory', 'test-design']
}));

export const playwrightSetupTask = defineTask('playwright-setup', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Playwright Setup & Test Implementation',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior Test Automation Engineer specializing in Playwright',
      task: 'Set up Playwright E2E test suite for Primo Maps Admin SPA',
      context: {
        projectRoot: args.projectRoot,
        features: args.features,
        existingStructure: {
          adminFolder: 'admin/',
          componentsFolder: 'admin/components/',
          testFolder: 'admin/__tests__/ (Jest unit tests exist)',
          i18nFolder: 'admin/i18n/'
        }
      },
      instructions: [
        '1. Create e2e/ directory at project root for Playwright tests',
        '2. Create playwright.config.ts with:',
        '   - Base URL configuration',
        '   - Chromium browser',
        '   - HTML reporter',
        '   - Screenshot on failure',
        '   - Reasonable timeouts',
        '3. Create Page Object Model files in e2e/pages/ for:',
        '   - LoginPage (Cognito overlay)',
        '   - CsvEditorPage',
        '   - SvgManagerPage',
        '   - VersionHistoryPage',
        '   - UserManagementPage',
        '   - BasePage (common elements: nav tabs, language toggle, user menu)',
        '4. Create test spec files in e2e/tests/:',
        '   - navigation.spec.ts - tab switching',
        '   - language.spec.ts - Hebrew/English toggle',
        '   - csv-editor.spec.ts - table interactions',
        '   - svg-manager.spec.ts - file upload/delete',
        '   - version-history.spec.ts - preview/restore/diff',
        '   - user-management.spec.ts - CRUD operations (admin only)',
        '5. Use stable selectors: data-testid, data-i18n, semantic roles',
        '6. Add test fixtures for mock authentication (bypass Cognito for testing)',
        '7. Add npm scripts to package.json for running tests',
        '8. Create the actual test code files',
        '9. Ensure tests are deterministic with proper waits'
      ],
      outputFormat: 'JSON with files created and configuration'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'filesCreated'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              type: { type: 'string', enum: ['config', 'page-object', 'test-spec', 'fixture', 'script'] }
            }
          }
        },
        npmScripts: {
          type: 'object',
          properties: {
            runAll: { type: 'string' },
            runHeaded: { type: 'string' },
            report: { type: 'string' }
          }
        },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['e2e', 'playwright', 'setup']
}));

export const runTestsTask = defineTask('run-tests', (args, taskCtx) => ({
  kind: 'agent',
  title: `Run E2E Tests - Iteration ${args.iteration}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Automation Engineer',
      task: 'Run the Playwright E2E test suite and analyze results',
      context: {
        projectRoot: args.projectRoot,
        applicationUrl: args.applicationUrl,
        iteration: args.iteration
      },
      instructions: [
        '1. Start a local HTTP server if not already running (serve admin/ folder)',
        '2. Run Playwright tests using npx playwright test',
        '3. Capture test results: passed, failed, skipped',
        '4. For failed tests, capture:',
        '   - Test name and file',
        '   - Error message',
        '   - Screenshot path if available',
        '5. Calculate pass rate percentage',
        '6. Identify patterns in failures (timing issues, locator issues, app bugs)',
        '7. Return structured test results'
      ],
      outputFormat: 'JSON with test results and pass rate'
    },
    outputSchema: {
      type: 'object',
      required: ['passRate', 'totalTests', 'passed', 'failed'],
      properties: {
        passRate: { type: 'number' },
        totalTests: { type: 'number' },
        passed: { type: 'number' },
        failed: { type: 'number' },
        skipped: { type: 'number' },
        failedTests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              file: { type: 'string' },
              error: { type: 'string' },
              category: { type: 'string', enum: ['locator', 'timing', 'app-bug', 'test-data', 'other'] }
            }
          }
        },
        reportPath: { type: 'string' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['e2e', 'test-execution']
}));

export const fixIssuesTask = defineTask('fix-issues', (args, taskCtx) => ({
  kind: 'agent',
  title: `Fix Issues - Iteration ${args.iteration}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Full-Stack Developer and QA Engineer',
      task: 'Analyze test failures and fix issues in both tests and application code',
      context: {
        projectRoot: args.projectRoot,
        testResults: args.testResults,
        iteration: args.iteration
      },
      instructions: [
        '1. Analyze each failed test to determine root cause:',
        '   - Locator issues: Fix selectors in page objects, add data-testid to app',
        '   - Timing issues: Add proper waits, improve test stability',
        '   - App bugs: Fix the actual application code',
        '   - Test data issues: Update fixtures or test setup',
        '2. For each fix:',
        '   - Make the code change',
        '   - Document what was fixed and why',
        '3. Prioritize fixes that will unblock multiple tests',
        '4. Add data-testid attributes to HTML elements where missing',
        '5. Return list of all fixes made'
      ],
      outputFormat: 'JSON with fixes made'
    },
    outputSchema: {
      type: 'object',
      required: ['fixesMade'],
      properties: {
        fixesMade: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              type: { type: 'string', enum: ['locator', 'timing', 'app-bug', 'test-fix', 'accessibility'] },
              description: { type: 'string' },
              testUnblocked: { type: 'string' }
            }
          }
        },
        appBugsFound: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              severity: { type: 'string' },
              fixed: { type: 'boolean' }
            }
          }
        },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['e2e', 'debugging', 'fixes']
}));

export const uiPolishCheckTask = defineTask('ui-polish', (args, taskCtx) => ({
  kind: 'agent',
  title: 'UI Polish Check & Fixes',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'UI/UX Engineer with attention to detail',
      task: 'Review and fix UI polish issues in Primo Maps Admin',
      context: {
        projectRoot: args.projectRoot,
        applicationUrl: args.applicationUrl
      },
      instructions: [
        '1. Use Playwright browser tools to visually inspect the app',
        '2. Check for and fix:',
        '   - Layout glitches (overlapping elements, misalignment)',
        '   - Broken empty states (when no data)',
        '   - Loading state indicators',
        '   - Error state handling and display',
        '   - RTL/LTR text direction issues',
        '   - Responsive design issues',
        '   - Color contrast / accessibility',
        '   - Copy/text issues (typos, unclear messages)',
        '3. Test both Hebrew (RTL) and English (LTR) modes',
        '4. Fix any obvious UI polish issues',
        '5. Document all UI issues found and fixed'
      ],
      outputFormat: 'JSON with UI issues and fixes'
    },
    outputSchema: {
      type: 'object',
      required: ['issuesFound', 'fixesMade'],
      properties: {
        issuesFound: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              location: { type: 'string' },
              severity: { type: 'string', enum: ['critical', 'major', 'minor', 'cosmetic'] }
            }
          }
        },
        fixesMade: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              type: { type: 'string' },
              description: { type: 'string' }
            }
          }
        },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['e2e', 'ui-polish', 'quality']
}));

export const generateSummaryTask = defineTask('generate-summary', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Generate Final Summary Report',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Technical Writer and QA Lead',
      task: 'Generate comprehensive E2E testing summary report',
      context: {
        features: args.features,
        fixesMade: args.fixesMade,
        finalTestResults: args.finalTestResults,
        iterations: args.iterations
      },
      instructions: [
        '1. Create summary of what was tested (feature checklist)',
        '2. Create bullet list of all fixes made (PR-style format):',
        '   - File path and type of change',
        '   - Brief description',
        '3. Document exact commands to run E2E tests:',
        '   - npm install command',
        '   - npm test command for E2E',
        '   - How to view HTML report',
        '4. Create test report:',
        '   - Total tests, passed, failed',
        '   - Pass percentage',
        '   - Any remaining known limitations or flaky tests',
        '5. Format as final deliverables summary'
      ],
      outputFormat: 'JSON with summary, howToRun, and knownLimitations'
    },
    outputSchema: {
      type: 'object',
      required: ['summary', 'howToRun'],
      properties: {
        summary: {
          type: 'object',
          properties: {
            featuresTested: { type: 'array', items: { type: 'string' } },
            fixesList: { type: 'array', items: { type: 'string' } },
            testStats: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                passed: { type: 'number' },
                failed: { type: 'number' },
                passRate: { type: 'number' }
              }
            }
          }
        },
        howToRun: {
          type: 'object',
          properties: {
            install: { type: 'string' },
            runTests: { type: 'string' },
            viewReport: { type: 'string' },
            runHeaded: { type: 'string' }
          }
        },
        knownLimitations: {
          type: 'array',
          items: { type: 'string' }
        },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['e2e', 'documentation', 'summary']
}));
