/**
 * @process primo-maps/phase2-testing
 * @description Test Phase 2 Admin UI implementation with Playwright, fix bugs, verify features
 * @inputs { adminUrl: string, apiEndpoint: string, cloudFrontDomain: string }
 * @outputs { success: boolean, testsRun: number, testsPassed: number, bugsFixes: array }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

/**
 * Phase 2 Testing Process
 *
 * Tasks:
 * 1. Initial Load Test - Verify admin UI loads correctly
 * 2. i18n Test - Test language switching (Hebrew/English)
 * 3. CSV Editor Test - Test CSV loading, editing, search
 * 4. SVG Manager Test - Test SVG listing, preview
 * 5. Fix Bugs - Fix any issues found in testing
 * 6. Final Verification - Comprehensive test of all features
 */
export async function process(inputs, ctx) {
  const {
    adminUrl = 'https://d3h8i7y9p8lyw7.cloudfront.net/admin/index.html',
    apiEndpoint = 'https://tt3xt4tr09.execute-api.us-east-1.amazonaws.com/prod',
    cloudFrontDomain = 'd3h8i7y9p8lyw7.cloudfront.net',
    projectRoot = '/home/hagaybar/projects/primo_maps'
  } = inputs;

  const results = {
    testsRun: 0,
    testsPassed: 0,
    testsFailed: 0,
    bugsFixes: [],
    errors: []
  };

  // ============================================================================
  // TASK 1: Initial Load Test
  // ============================================================================

  const task1Result = await ctx.task(initialLoadTestTask, {
    adminUrl,
    projectRoot
  });

  results.testsRun += task1Result.testsRun || 0;
  results.testsPassed += task1Result.testsPassed || 0;
  results.testsFailed += task1Result.testsFailed || 0;

  if (task1Result.bugs && task1Result.bugs.length > 0) {
    results.bugsFixes.push(...task1Result.bugs);
  }

  if (!task1Result.success) {
    // Fix bugs found in initial load
    const fixResult = await ctx.task(fixBugsTask, {
      bugs: task1Result.bugs,
      projectRoot
    });
    results.bugsFixes.push(...(fixResult.fixes || []));
  }

  // ============================================================================
  // TASK 2: i18n Test
  // ============================================================================

  const task2Result = await ctx.task(i18nTestTask, {
    adminUrl,
    projectRoot
  });

  results.testsRun += task2Result.testsRun || 0;
  results.testsPassed += task2Result.testsPassed || 0;
  results.testsFailed += task2Result.testsFailed || 0;

  if (!task2Result.success && task2Result.bugs) {
    const fixResult = await ctx.task(fixBugsTask, {
      bugs: task2Result.bugs,
      projectRoot
    });
    results.bugsFixes.push(...(fixResult.fixes || []));
  }

  // ============================================================================
  // TASK 3: CSV Editor Test
  // ============================================================================

  const task3Result = await ctx.task(csvEditorTestTask, {
    adminUrl,
    apiEndpoint,
    cloudFrontDomain,
    projectRoot
  });

  results.testsRun += task3Result.testsRun || 0;
  results.testsPassed += task3Result.testsPassed || 0;
  results.testsFailed += task3Result.testsFailed || 0;

  if (!task3Result.success && task3Result.bugs) {
    const fixResult = await ctx.task(fixBugsTask, {
      bugs: task3Result.bugs,
      projectRoot
    });
    results.bugsFixes.push(...(fixResult.fixes || []));
  }

  // ============================================================================
  // TASK 4: SVG Manager Test
  // ============================================================================

  const task4Result = await ctx.task(svgManagerTestTask, {
    adminUrl,
    apiEndpoint,
    cloudFrontDomain,
    projectRoot
  });

  results.testsRun += task4Result.testsRun || 0;
  results.testsPassed += task4Result.testsPassed || 0;
  results.testsFailed += task4Result.testsFailed || 0;

  if (!task4Result.success && task4Result.bugs) {
    const fixResult = await ctx.task(fixBugsTask, {
      bugs: task4Result.bugs,
      projectRoot
    });
    results.bugsFixes.push(...(fixResult.fixes || []));
  }

  // ============================================================================
  // TASK 5: Redeploy if fixes were made
  // ============================================================================

  if (results.bugsFixes.length > 0) {
    const redeployResult = await ctx.task(redeployTask, {
      projectRoot
    });
    results.redeployed = redeployResult.success;
  }

  // ============================================================================
  // TASK 6: Final Verification
  // ============================================================================

  const task6Result = await ctx.task(finalVerificationTask, {
    adminUrl,
    apiEndpoint,
    projectRoot
  });

  results.finalVerification = task6Result;

  return {
    success: task6Result.success,
    testsRun: results.testsRun + (task6Result.testsRun || 0),
    testsPassed: results.testsPassed + (task6Result.testsPassed || 0),
    bugsFixes: results.bugsFixes,
    summary: {
      initialLoad: task1Result.success,
      i18n: task2Result.success,
      csvEditor: task3Result.success,
      svgManager: task4Result.success,
      finalVerification: task6Result.success
    },
    metadata: {
      processId: 'primo-maps/phase2-testing',
      timestamp: ctx.now()
    }
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

export const initialLoadTestTask = defineTask('initial-load-test', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Initial Load Test',
  description: 'Test that admin UI loads correctly with Playwright',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Engineer with Playwright expertise',
      task: 'Test that the admin UI loads correctly using Playwright MCP tools',
      context: {
        adminUrl: args.adminUrl,
        projectRoot: args.projectRoot
      },
      instructions: [
        'Use mcp__playwright__browser_navigate to open the admin URL',
        'Use mcp__playwright__browser_snapshot to capture the page state',
        'Verify the page title contains "Shelf Maps Admin" or Hebrew equivalent',
        'Check for any JavaScript console errors using mcp__playwright__browser_console_messages',
        'Verify these elements exist: app-title, lang-en, lang-he, nav-csv, nav-svg',
        'If there are errors, identify the bugs and return them in the bugs array',
        'Return JSON with success, testsRun, testsPassed, testsFailed, bugs array'
      ],
      outputFormat: 'JSON with success (boolean), testsRun (number), testsPassed (number), testsFailed (number), bugs (array of {file, issue, fix})'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        testsRun: { type: 'number' },
        testsPassed: { type: 'number' },
        testsFailed: { type: 'number' },
        bugs: { type: 'array' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['testing', 'playwright', 'initial-load']
}));

export const i18nTestTask = defineTask('i18n-test', (args, taskCtx) => ({
  kind: 'agent',
  title: 'i18n Language Switching Test',
  description: 'Test language toggle between Hebrew and English',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Engineer with Playwright expertise',
      task: 'Test language switching functionality',
      context: {
        adminUrl: args.adminUrl,
        projectRoot: args.projectRoot
      },
      instructions: [
        'Use mcp__playwright__browser_snapshot to see current state',
        'Click on the English language button (EN)',
        'Verify page direction changes to LTR (dir="ltr")',
        'Verify text changes to English',
        'Click on the Hebrew language button (עב)',
        'Verify page direction changes to RTL (dir="rtl")',
        'Verify text changes to Hebrew',
        'Check for any console errors',
        'If there are bugs, identify them and return in bugs array',
        'Return JSON with test results'
      ],
      outputFormat: 'JSON with success (boolean), testsRun (number), testsPassed (number), testsFailed (number), bugs (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        testsRun: { type: 'number' },
        testsPassed: { type: 'number' },
        testsFailed: { type: 'number' },
        bugs: { type: 'array' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['testing', 'playwright', 'i18n']
}));

export const csvEditorTestTask = defineTask('csv-editor-test', (args, taskCtx) => ({
  kind: 'agent',
  title: 'CSV Editor Test',
  description: 'Test CSV loading, display, editing, and search',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Engineer with Playwright expertise',
      task: 'Test the CSV Editor component functionality',
      context: {
        adminUrl: args.adminUrl,
        apiEndpoint: args.apiEndpoint,
        cloudFrontDomain: args.cloudFrontDomain,
        projectRoot: args.projectRoot
      },
      instructions: [
        'Navigate to the admin URL if not already there',
        'Click on CSV Editor tab if not already selected',
        'Use mcp__playwright__browser_snapshot to see the CSV editor state',
        'Check for network requests using mcp__playwright__browser_network_requests',
        'Verify CSV data loads and displays in a table',
        'Test the search functionality by typing in the search box',
        'Check for any console errors',
        'If there are bugs (data not loading, errors, etc), identify them',
        'Return JSON with test results and bugs array'
      ],
      outputFormat: 'JSON with success (boolean), testsRun (number), testsPassed (number), testsFailed (number), bugs (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        testsRun: { type: 'number' },
        testsPassed: { type: 'number' },
        testsFailed: { type: 'number' },
        bugs: { type: 'array' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['testing', 'playwright', 'csv-editor']
}));

export const svgManagerTestTask = defineTask('svg-manager-test', (args, taskCtx) => ({
  kind: 'agent',
  title: 'SVG Manager Test',
  description: 'Test SVG file listing and preview',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Engineer with Playwright expertise',
      task: 'Test the SVG Manager component functionality',
      context: {
        adminUrl: args.adminUrl,
        apiEndpoint: args.apiEndpoint,
        cloudFrontDomain: args.cloudFrontDomain,
        projectRoot: args.projectRoot
      },
      instructions: [
        'Navigate to the admin URL if not already there',
        'Click on the SVG/Map Files tab',
        'Use mcp__playwright__browser_snapshot to see the SVG manager state',
        'Check for network requests to the API',
        'Verify SVG files are listed with thumbnails',
        'Test clicking the preview button on a file',
        'Verify the preview modal opens with the image',
        'Check for any console errors',
        'If there are bugs, identify them',
        'Return JSON with test results and bugs array'
      ],
      outputFormat: 'JSON with success (boolean), testsRun (number), testsPassed (number), testsFailed (number), bugs (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        testsRun: { type: 'number' },
        testsPassed: { type: 'number' },
        testsFailed: { type: 'number' },
        bugs: { type: 'array' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['testing', 'playwright', 'svg-manager']
}));

export const fixBugsTask = defineTask('fix-bugs', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Fix Bugs',
  description: 'Fix bugs found during testing',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior frontend developer',
      task: 'Fix the bugs identified during testing',
      context: {
        bugs: args.bugs,
        projectRoot: args.projectRoot
      },
      instructions: [
        'For each bug in the bugs array:',
        '  1. Read the relevant file',
        '  2. Identify and fix the issue',
        '  3. Edit the file with the fix',
        'Return JSON with fixes array describing what was fixed'
      ],
      outputFormat: 'JSON with success (boolean), fixes (array of {file, issue, resolution})'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        fixes: { type: 'array' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['bugfix', 'frontend']
}));

export const redeployTask = defineTask('redeploy', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Redeploy Fixed Files',
  description: 'Upload fixed files to S3 and invalidate cache',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer',
      task: 'Redeploy admin files after bug fixes',
      context: {
        projectRoot: args.projectRoot,
        bucket: 'tau-cenlib-primo-assets-hagay-3602',
        cloudfrontDistId: 'E5SR0E5GM5GSB'
      },
      instructions: [
        'Upload all admin files to S3 with correct content types',
        'Invalidate CloudFront cache for /admin/*',
        'Wait for invalidation to complete or progress',
        'Return success status'
      ],
      outputFormat: 'JSON with success (boolean)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['deployment', 's3', 'cloudfront']
}));

export const finalVerificationTask = defineTask('final-verification', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Final Verification',
  description: 'Comprehensive final test of all features',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Engineer with Playwright expertise',
      task: 'Perform final comprehensive verification of all admin UI features',
      context: {
        adminUrl: args.adminUrl,
        apiEndpoint: args.apiEndpoint,
        projectRoot: args.projectRoot
      },
      instructions: [
        'Navigate to admin URL',
        'Test 1: Verify page loads without console errors',
        'Test 2: Verify language toggle works (EN -> Hebrew RTL, Hebrew -> EN LTR)',
        'Test 3: Verify CSV Editor shows data table',
        'Test 4: Verify CSV search works',
        'Test 5: Verify SVG Manager shows file grid with thumbnails',
        'Test 6: Verify SVG preview modal works',
        'Test 7: Verify navigation between CSV Editor and SVG Manager',
        'Use mcp__playwright__browser_snapshot and mcp__playwright__browser_console_messages',
        'Return comprehensive test results'
      ],
      outputFormat: 'JSON with success (boolean), testsRun (number), testsPassed (number), testsFailed (number), details (array of test results)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        testsRun: { type: 'number' },
        testsPassed: { type: 'number' },
        testsFailed: { type: 'number' },
        details: { type: 'array' }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['testing', 'playwright', 'verification']
}));
