/**
 * @process phase4-auth-tdd
 * @description Phase 4: Authentication & Authorization - TDD Implementation
 *
 * Implements Cognito authentication with Hosted UI, role-based access control
 * (admin/editor), JWT validation in Lambdas, and bilingual login/logout UI.
 *
 * Target: 90% test pass rate
 * Test Framework: Jest (Lambda) + Playwright (E2E with mocked Cognito)
 *
 * @inputs { targetCoverage: number }
 * @outputs { success: boolean, testsPass: number, coverage: object }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

/**
 * Phase 4 TDD Process - Authentication & Authorization
 *
 * Milestones:
 * 1. Cognito Setup & Configuration
 * 2. Backend JWT Validation & Role Checking (TDD)
 * 3. Frontend Auth Integration (TDD)
 * 4. Integration & E2E Testing
 */
export async function process(inputs, ctx) {
  const {
    targetCoverage = 90
  } = inputs;

  // ============================================================================
  // MILESTONE 1: COGNITO SETUP & CONFIGURATION
  // ============================================================================

  // Task 1.1: Create Cognito User Pool and App Client
  const cognitoSetupResult = await ctx.task(cognitoSetupTask, {
    projectName: 'primo-maps',
    region: 'us-east-1',
    roles: ['admin', 'editor'],
    hostedUiDomain: 'primo-maps-auth',
    callbackUrls: [
      'https://d3h8i7y9p8lyw7.cloudfront.net/admin/',
      'http://localhost:8080/'
    ]
  });

  await ctx.breakpoint({
    question: 'Cognito User Pool and App Client created. Review the configuration and verify the hosted UI domain is accessible. Proceed with JWT validation Lambda middleware?',
    title: 'Cognito Setup Review',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'artifacts/cognito-config.json', format: 'json', label: 'Cognito Config' }
      ]
    }
  });

  // ============================================================================
  // MILESTONE 2: BACKEND JWT VALIDATION (TDD)
  // ============================================================================

  // Task 2.1: Setup test infrastructure for auth testing
  const authTestSetupResult = await ctx.task(authTestSetupTask, {
    projectPath: '/home/hagaybar/projects/primo_maps',
    mockStrategy: 'jwt-mock'
  });

  // Task 2.2: TDD - JWT Validation Middleware
  const jwtValidationResult = await ctx.task(tddAuthMiddlewareTask, {
    moduleName: 'auth-middleware',
    description: 'Validate JWT tokens from Cognito and extract user info',
    acceptanceCriteria: [
      'Validates JWT signature using Cognito JWKS',
      'Extracts username from token claims',
      'Extracts role from custom:role claim',
      'Returns 401 for invalid/expired tokens',
      'Returns 401 for missing Authorization header',
      'Caches JWKS for performance',
      'Works with both Bearer and raw token formats'
    ],
    testCases: [
      'Valid admin token - returns user with admin role',
      'Valid editor token - returns user with editor role',
      'Expired token - returns 401',
      'Invalid signature - returns 401',
      'Missing token - returns 401',
      'Malformed token - returns 401'
    ]
  });

  // Task 2.3: TDD - Role Authorization Helper
  const roleAuthResult = await ctx.task(tddRoleAuthTask, {
    moduleName: 'role-auth',
    description: 'Check if user has required role for operation',
    acceptanceCriteria: [
      'Admin role can perform all operations',
      'Editor role can edit but not delete',
      'Editor role cannot manage users',
      'Returns 403 for insufficient permissions',
      'Logs authorization decisions for audit'
    ],
    permissions: {
      admin: ['read', 'write', 'delete', 'manage-users', 'restore-versions'],
      editor: ['read', 'write', 'restore-versions']
    }
  });

  // Task 2.4: Update existing Lambdas with auth
  const updateLambdasResult = await ctx.task(updateLambdasWithAuthTask, {
    lambdas: [
      { name: 'getCsv', requiredRole: 'editor' },
      { name: 'putCsv', requiredRole: 'editor' },
      { name: 'listSvg', requiredRole: 'editor' },
      { name: 'uploadSvg', requiredRole: 'editor' },
      { name: 'deleteSvg', requiredRole: 'admin' },
      { name: 'listVersionsCsv', requiredRole: 'editor' },
      { name: 'listVersionsSvg', requiredRole: 'editor' },
      { name: 'getVersion', requiredRole: 'editor' },
      { name: 'restoreVersion', requiredRole: 'editor' }
    ],
    extractUsername: true,
    passUsernameToVersioning: true
  });

  await ctx.breakpoint({
    question: 'Backend JWT validation and role authorization complete. All Lambdas updated with auth middleware. Proceed with frontend authentication integration?',
    title: 'Backend Auth Review',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'lambda/auth-middleware.mjs', format: 'code', label: 'Auth Middleware' },
        { path: 'lambda/role-auth.mjs', format: 'code', label: 'Role Auth' },
        { path: 'artifacts/auth-test-results.json', format: 'json', label: 'Test Results' }
      ]
    }
  });

  // ============================================================================
  // MILESTONE 3: FRONTEND AUTH INTEGRATION (TDD)
  // ============================================================================

  // Task 3.1: TDD - Auth Service Module
  const authServiceResult = await ctx.task(tddAuthServiceTask, {
    moduleName: 'auth-service',
    description: 'Client-side authentication service using Cognito Hosted UI',
    acceptanceCriteria: [
      'Redirects to Cognito Hosted UI for login',
      'Handles OAuth callback and stores tokens',
      'Provides isAuthenticated() check',
      'Provides getUser() with username and role',
      'Provides getAccessToken() for API calls',
      'Handles token refresh automatically',
      'Provides logout() that clears session and redirects',
      'Persists auth state in sessionStorage',
      'Emits authStateChanged events'
    ],
    bilingualSupport: true
  });

  // Task 3.2: TDD - Login/Logout UI Components
  const loginUiResult = await ctx.task(tddLoginUiTask, {
    components: ['login-button', 'user-menu', 'auth-guard'],
    description: 'Bilingual login button, user menu with role display, and auth guard',
    acceptanceCriteria: [
      'Login button shows "Login" / "התחברות" based on locale',
      'User menu shows username and role',
      'User menu provides logout option',
      'Auth guard redirects unauthenticated users to login',
      'Auth guard shows loading state during auth check',
      'Role badge shows "Admin" / "מנהל" or "Editor" / "עורך"'
    ],
    i18nKeys: {
      login: { en: 'Login', he: 'התחברות' },
      logout: { en: 'Logout', he: 'התנתקות' },
      admin: { en: 'Admin', he: 'מנהל' },
      editor: { en: 'Editor', he: 'עורך' },
      welcome: { en: 'Welcome, {name}', he: 'שלום, {name}' }
    }
  });

  // Task 3.3: TDD - Protected Routes & Role-Based UI
  const protectedRoutesResult = await ctx.task(tddProtectedRoutesTask, {
    description: 'Protect admin views and show/hide features based on role',
    acceptanceCriteria: [
      'CSV Editor visible to both admin and editor',
      'SVG Manager visible to both admin and editor',
      'Version History visible to both admin and editor',
      'Delete buttons only visible to admin role',
      'Settings/User management only visible to admin',
      'Graceful handling when user lacks permission',
      'Error messages are bilingual'
    ]
  });

  // Task 3.4: Integration - Wire auth into app.js
  const integrationResult = await ctx.task(integrationTask, {
    description: 'Integrate auth service into main app, update API calls to include tokens',
    updates: [
      'Add auth check on app load',
      'Add Authorization header to all API calls',
      'Update version creation to include username',
      'Add user menu to header',
      'Hide admin-only features for editors'
    ]
  });

  await ctx.breakpoint({
    question: 'Frontend authentication integration complete. Login flow and role-based UI implemented. Proceed with E2E testing?',
    title: 'Frontend Auth Review',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'admin/auth-service.js', format: 'code', label: 'Auth Service' },
        { path: 'admin/components/user-menu.js', format: 'code', label: 'User Menu' },
        { path: 'admin/i18n/en.json', format: 'json', label: 'English i18n' },
        { path: 'admin/i18n/he.json', format: 'json', label: 'Hebrew i18n' }
      ]
    }
  });

  // ============================================================================
  // MILESTONE 4: E2E TESTING & DEPLOYMENT
  // ============================================================================

  // Task 4.1: Deploy updated Lambdas with auth
  const deployLambdasResult = await ctx.task(deployLambdasTask, {
    lambdas: [
      'auth-middleware',
      'getCsv',
      'putCsv',
      'listSvg',
      'uploadSvg',
      'deleteSvg',
      'listVersionsCsv',
      'listVersionsSvg',
      'getVersion',
      'restoreVersion'
    ],
    addCognitoAuthorizer: true
  });

  // Task 4.2: Deploy updated frontend
  const deployFrontendResult = await ctx.task(deployFrontendTask, {
    files: [
      'admin/index.html',
      'admin/app.js',
      'admin/auth-service.js',
      'admin/components/user-menu.js',
      'admin/i18n/en.json',
      'admin/i18n/he.json'
    ],
    invalidateCache: true
  });

  // Task 4.3: Create admin user in Cognito
  const createAdminResult = await ctx.task(createAdminUserTask, {
    username: 'admin',
    role: 'admin',
    tempPassword: true
  });

  // Task 4.4: E2E Testing with mocked Cognito
  const e2eResult = await ctx.task(e2eAuthTestingTask, {
    scenarios: [
      'Unauthenticated user redirected to login',
      'Admin user can access all features',
      'Editor user cannot see delete buttons',
      'Token refresh works on long sessions',
      'Logout clears session and redirects',
      'Login UI respects language setting (Hebrew/English)',
      'Username shown in version history after save'
    ],
    mockStrategy: 'intercept-cognito-responses',
    targetPassRate: targetCoverage
  });

  // Task 4.5: Run all tests and generate report
  const finalTestResult = await ctx.task(runAllTestsTask, {
    includeBackend: true,
    includeFrontend: true,
    includeE2e: true,
    targetPassRate: targetCoverage,
    generateCoverageReport: true
  });

  // Final breakpoint for approval
  await ctx.breakpoint({
    question: `Phase 4 TDD Complete!\n\nTest Results:\n- Backend: ${finalTestResult.backend.passRate}% pass\n- Frontend: ${finalTestResult.frontend.passRate}% pass\n- E2E: ${finalTestResult.e2e.passRate}% pass\n- Overall: ${finalTestResult.overall.passRate}% pass\n\nTarget was ${targetCoverage}%. Approve to finalize?`,
    title: 'Phase 4 Complete - Final Review',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'artifacts/final-test-report.json', format: 'json', label: 'Final Report' },
        { path: 'artifacts/coverage-summary.json', format: 'json', label: 'Coverage Summary' }
      ]
    }
  });

  return {
    success: true,
    testsPass: finalTestResult.overall.passRate,
    coverage: {
      backend: finalTestResult.backend,
      frontend: finalTestResult.frontend,
      e2e: finalTestResult.e2e
    },
    artifacts: {
      cognitoConfig: cognitoSetupResult.configPath,
      testReport: finalTestResult.reportPath
    }
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

/**
 * Task: Setup Cognito User Pool and App Client
 */
const cognitoSetupTask = defineTask('cognito-setup', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Setup Cognito User Pool',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'AWS Infrastructure Engineer',
      task: `Create Cognito User Pool and App Client for ${args.projectName}`,
      context: {
        region: args.region,
        roles: args.roles,
        hostedUiDomain: args.hostedUiDomain,
        callbackUrls: args.callbackUrls
      },
      instructions: [
        'Create Cognito User Pool with email as username',
        'Add custom attribute "custom:role" for RBAC',
        'Configure password policy (min 8 chars, require numbers)',
        'Create App Client with OAuth 2.0 settings',
        `Configure Hosted UI domain: ${args.hostedUiDomain}`,
        'Set callback URLs for OAuth redirect',
        'Enable authorization code grant flow',
        'Save configuration to artifacts/cognito-config.json',
        'Output User Pool ID, App Client ID, and Hosted UI URL'
      ],
      outputFormat: 'JSON with cognitoConfig object and aws CLI commands used'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'userPoolId', 'appClientId', 'hostedUiUrl'],
      properties: {
        success: { type: 'boolean' },
        userPoolId: { type: 'string' },
        appClientId: { type: 'string' },
        hostedUiUrl: { type: 'string' },
        configPath: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: Setup auth test infrastructure
 */
const authTestSetupTask = defineTask('auth-test-setup', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Setup Auth Test Infrastructure',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Test Engineer',
      task: 'Setup testing infrastructure for JWT auth validation',
      context: {
        projectPath: args.projectPath,
        mockStrategy: args.mockStrategy
      },
      instructions: [
        'Install jose library for JWT handling in Lambda',
        'Create JWT mock utilities for testing',
        'Setup test fixtures for valid/invalid tokens',
        'Create mock JWKS endpoint responses',
        'Update jest.config.js if needed',
        'Ensure aws-sdk-client-mock is available'
      ],
      outputFormat: 'JSON with setup status and file paths'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: TDD Auth Middleware
 */
const tddAuthMiddlewareTask = defineTask('tdd-auth-middleware', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.moduleName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Developer',
      task: `Implement ${args.moduleName} using strict TDD methodology`,
      context: {
        moduleName: args.moduleName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria,
        testCases: args.testCases
      },
      instructions: [
        '1. RED: Write failing tests first for all test cases',
        '2. GREEN: Implement minimum code to pass each test',
        '3. REFACTOR: Clean up code while keeping tests green',
        'Create lambda/auth-middleware.mjs with validateToken function',
        'Create lambda/__tests__/auth-middleware.test.mjs',
        'Mock jose library and JWKS fetching',
        'Handle edge cases: expired, invalid signature, malformed',
        'Export { validateToken, extractUser }',
        'Run tests and ensure all pass before completing',
        'Target: 90%+ coverage for this module'
      ],
      outputFormat: 'JSON with test results and coverage'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'testsPassed', 'totalTests'],
      properties: {
        success: { type: 'boolean' },
        testsPassed: { type: 'number' },
        totalTests: { type: 'number' },
        coverage: { type: 'number' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: TDD Role Authorization
 */
const tddRoleAuthTask = defineTask('tdd-role-auth', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.moduleName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Developer',
      task: `Implement ${args.moduleName} using strict TDD methodology`,
      context: {
        moduleName: args.moduleName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria,
        permissions: args.permissions
      },
      instructions: [
        '1. RED: Write failing tests first',
        '2. GREEN: Implement minimum code to pass',
        '3. REFACTOR: Clean up while tests pass',
        'Create lambda/role-auth.mjs with checkPermission function',
        'Create lambda/__tests__/role-auth.test.mjs',
        'Define permission matrix for admin vs editor',
        'Return { allowed: boolean, reason: string }',
        'Log authorization decisions for audit',
        'Run tests and ensure all pass'
      ],
      outputFormat: 'JSON with test results'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'testsPassed', 'totalTests'],
      properties: {
        success: { type: 'boolean' },
        testsPassed: { type: 'number' },
        totalTests: { type: 'number' },
        coverage: { type: 'number' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: Update Lambdas with Auth
 */
const updateLambdasWithAuthTask = defineTask('update-lambdas-auth', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Update Lambdas with Auth Middleware',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Backend Developer',
      task: 'Add authentication and authorization to existing Lambda functions',
      context: {
        lambdas: args.lambdas,
        extractUsername: args.extractUsername,
        passUsernameToVersioning: args.passUsernameToVersioning
      },
      instructions: [
        'Import auth-middleware.mjs in each Lambda',
        'Add validateToken() check at start of each handler',
        'Add checkPermission() for role-based operations',
        'Extract username from token for versioning',
        'Update putCsv to use extracted username instead of body.username',
        'Return 401 for auth failures, 403 for permission failures',
        'Update tests to include auth scenarios',
        'Ensure CORS headers still work with auth'
      ],
      outputFormat: 'JSON with updated lambdas list and test results'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'updatedLambdas'],
      properties: {
        success: { type: 'boolean' },
        updatedLambdas: { type: 'array', items: { type: 'string' } },
        testsPassed: { type: 'number' },
        totalTests: { type: 'number' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: TDD Auth Service (Frontend)
 */
const tddAuthServiceTask = defineTask('tdd-auth-service', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.moduleName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Frontend Developer',
      task: `Implement ${args.moduleName} using strict TDD methodology`,
      context: {
        moduleName: args.moduleName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria,
        bilingualSupport: args.bilingualSupport
      },
      instructions: [
        '1. RED: Write failing tests in admin/__tests__/auth-service.test.js',
        '2. GREEN: Implement in admin/auth-service.js',
        '3. REFACTOR: Clean up while tests pass',
        'Use Cognito Hosted UI OAuth flow',
        'Handle authorization_code exchange for tokens',
        'Store tokens in sessionStorage (not localStorage for security)',
        'Implement automatic token refresh before expiry',
        'Emit authStateChanged custom events',
        'Export: login(), logout(), isAuthenticated(), getUser(), getAccessToken()',
        'Include Cognito config from separate config file'
      ],
      outputFormat: 'JSON with test results'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'testsPassed', 'totalTests'],
      properties: {
        success: { type: 'boolean' },
        testsPassed: { type: 'number' },
        totalTests: { type: 'number' },
        coverage: { type: 'number' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: TDD Login UI Components
 */
const tddLoginUiTask = defineTask('tdd-login-ui', (args, taskCtx) => ({
  kind: 'agent',
  title: 'TDD: Login UI Components',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Frontend Developer',
      task: 'Implement bilingual login UI components using TDD',
      context: {
        components: args.components,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria,
        i18nKeys: args.i18nKeys
      },
      instructions: [
        'Write tests first for each component',
        'Create admin/components/user-menu.js',
        'Create admin/__tests__/user-menu.test.js',
        'Update i18n files with auth-related translations',
        'Login button triggers authService.login()',
        'User menu shows username, role badge, and logout',
        'Role badge uses localized text (Admin/מנהל, Editor/עורך)',
        'Respect RTL layout in Hebrew mode',
        'Use Tailwind for styling consistency'
      ],
      outputFormat: 'JSON with test results and component list'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'testsPassed', 'totalTests'],
      properties: {
        success: { type: 'boolean' },
        testsPassed: { type: 'number' },
        totalTests: { type: 'number' },
        componentsCreated: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: TDD Protected Routes
 */
const tddProtectedRoutesTask = defineTask('tdd-protected-routes', (args, taskCtx) => ({
  kind: 'agent',
  title: 'TDD: Protected Routes & Role-Based UI',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Frontend Developer',
      task: 'Implement route protection and role-based UI visibility',
      context: {
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        'Write tests for auth guard behavior',
        'Create auth guard that checks isAuthenticated()',
        'Redirect to login if not authenticated',
        'Show/hide delete buttons based on role',
        'Create hasPermission(action) helper',
        'Add role check before destructive operations',
        'Show bilingual error for insufficient permissions',
        'Update app.js to use auth guard on init'
      ],
      outputFormat: 'JSON with test results'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'testsPassed', 'totalTests'],
      properties: {
        success: { type: 'boolean' },
        testsPassed: { type: 'number' },
        totalTests: { type: 'number' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: Integration
 */
const integrationTask = defineTask('integration', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Integration: Wire Auth into App',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Full Stack Developer',
      task: 'Integrate auth service into main application',
      context: {
        description: args.description,
        updates: args.updates
      },
      instructions: [
        'Update app.js to import auth-service',
        'Add auth check before showing main UI',
        'Add Authorization header to all fetch() calls',
        'Update CSV save to use token username, not manual input',
        'Add user menu to header (after language toggle)',
        'Conditionally render admin-only features',
        'Update index.html if needed for auth callback handling',
        'Test the integration manually',
        'Update version history to show authenticated username'
      ],
      outputFormat: 'JSON with integration status'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
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
  }
}));

/**
 * Task: Deploy Lambdas
 */
const deployLambdasTask = defineTask('deploy-lambdas', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Deploy Lambdas with Auth',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps Engineer',
      task: 'Deploy updated Lambda functions with Cognito authorizer',
      context: {
        lambdas: args.lambdas,
        addCognitoAuthorizer: args.addCognitoAuthorizer
      },
      instructions: [
        'Package each Lambda with dependencies (jose)',
        'Deploy using AWS CLI: aws lambda update-function-code',
        'Add Cognito authorizer to API Gateway if not exists',
        'Associate authorizer with all admin API routes',
        'Test each endpoint with valid/invalid tokens',
        'Verify CORS still works with Authorization header',
        'Output deployment status for each Lambda'
      ],
      outputFormat: 'JSON with deployment results'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'deployedLambdas'],
      properties: {
        success: { type: 'boolean' },
        deployedLambdas: { type: 'array', items: { type: 'string' } },
        authorizerConfigured: { type: 'boolean' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: Deploy Frontend
 */
const deployFrontendTask = defineTask('deploy-frontend', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Deploy Frontend with Auth UI',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps Engineer',
      task: 'Deploy updated frontend files to S3',
      context: {
        files: args.files,
        invalidateCache: args.invalidateCache
      },
      instructions: [
        'Upload all auth-related files to S3 admin folder',
        'Ensure proper content-type headers',
        'Invalidate CloudFront cache for admin files',
        'Verify files are accessible via CloudFront URL',
        'Test login flow works end-to-end'
      ],
      outputFormat: 'JSON with deployment status'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        uploadedFiles: { type: 'array', items: { type: 'string' } },
        cacheInvalidated: { type: 'boolean' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: Create Admin User
 */
const createAdminUserTask = defineTask('create-admin-user', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create Admin User in Cognito',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'AWS Administrator',
      task: 'Create initial admin user in Cognito User Pool',
      context: {
        username: args.username,
        role: args.role,
        tempPassword: args.tempPassword
      },
      instructions: [
        'Use AWS CLI to create user: aws cognito-idp admin-create-user',
        'Set custom:role attribute to "admin"',
        'Generate temporary password',
        'Output credentials securely (one-time display)',
        'Provide instructions for first login password change'
      ],
      outputFormat: 'JSON with user creation status (no password in output file)'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'username'],
      properties: {
        success: { type: 'boolean' },
        username: { type: 'string' },
        instructions: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: E2E Auth Testing
 */
const e2eAuthTestingTask = defineTask('e2e-auth-testing', (args, taskCtx) => ({
  kind: 'agent',
  title: 'E2E Testing with Mocked Cognito',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Engineer',
      task: 'Run E2E tests for authentication flows using Playwright',
      context: {
        scenarios: args.scenarios,
        mockStrategy: args.mockStrategy,
        targetPassRate: args.targetPassRate
      },
      instructions: [
        'Use Playwright MCP to test auth flows',
        'Mock Cognito responses to avoid real auth during tests',
        'Test each scenario in both Hebrew and English',
        'Verify role-based UI visibility',
        'Test token storage and retrieval',
        'Test logout clears session',
        'Test username appears in version history',
        'Take screenshots for documentation',
        'Output test results with pass/fail for each scenario'
      ],
      outputFormat: 'JSON with E2E test results'
    },
    outputSchema: {
      type: 'object',
      required: ['passRate', 'testCount'],
      properties: {
        passRate: { type: 'number' },
        testCount: { type: 'number' },
        scenarios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              passed: { type: 'boolean' },
              notes: { type: 'string' }
            }
          }
        }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: Run All Tests
 */
const runAllTestsTask = defineTask('run-all-tests', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Run All Tests - Final Report',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Lead',
      task: 'Run all tests and generate final coverage report',
      context: {
        includeBackend: args.includeBackend,
        includeFrontend: args.includeFrontend,
        includeE2e: args.includeE2e,
        targetPassRate: args.targetPassRate
      },
      instructions: [
        'Run backend tests: npm test in lambda directory',
        'Run frontend tests: npm test in admin directory',
        'Run E2E tests with Playwright',
        'Calculate overall pass rate',
        'Generate coverage summary',
        'Compare against target pass rate',
        'Output comprehensive test report',
        'Save report to artifacts/final-test-report.json'
      ],
      outputFormat: 'JSON with comprehensive test results'
    },
    outputSchema: {
      type: 'object',
      required: ['overall', 'backend', 'frontend', 'e2e'],
      properties: {
        overall: {
          type: 'object',
          properties: {
            passRate: { type: 'number' },
            testCount: { type: 'number' },
            passCount: { type: 'number' },
            failCount: { type: 'number' }
          }
        },
        backend: {
          type: 'object',
          properties: {
            passRate: { type: 'number' },
            testCount: { type: 'number' },
            coverage: { type: 'number' }
          }
        },
        frontend: {
          type: 'object',
          properties: {
            passRate: { type: 'number' },
            testCount: { type: 'number' },
            coverage: { type: 'number' }
          }
        },
        e2e: {
          type: 'object',
          properties: {
            passRate: { type: 'number' },
            testCount: { type: 'number' }
          }
        },
        reportPath: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));
