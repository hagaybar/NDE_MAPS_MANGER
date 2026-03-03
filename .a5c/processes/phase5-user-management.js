/**
 * @process phase5-user-management
 * @description Phase 5: User Management & Password Reset
 *
 * Implements admin user management UI and enables Cognito email-based password reset.
 * Features:
 * - Enable email-based "Forgot Password" via Cognito
 * - Admin UI for user CRUD (create, view, edit roles, reset passwords, enable/disable, delete)
 * - Lambda functions for user management operations
 * - Role-based access (admin only)
 *
 * Target: Fully functional user management with TDD
 * Test Framework: Jest (Lambda) + Playwright (E2E)
 *
 * @inputs { targetCoverage: number }
 * @outputs { success: boolean, testsPass: number }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

/**
 * Phase 5 User Management Process
 *
 * Milestones:
 * 1. Configure Cognito for Email-Based Password Reset
 * 2. Backend Lambda Functions for User Management (TDD)
 * 3. Frontend Admin User Management UI (TDD)
 * 4. Integration & E2E Testing
 */
export async function process(inputs, ctx) {
  const {
    targetCoverage = 90
  } = inputs;

  // ============================================================================
  // MILESTONE 1: CONFIGURE COGNITO FOR EMAIL-BASED PASSWORD RESET
  // ============================================================================

  // Task 1.1: Update Cognito User Pool configuration
  const cognitoConfigResult = await ctx.task(configureCognitoEmailTask, {
    userPoolId: 'us-east-1_g9q5cPhVg',
    features: [
      'email-as-alias',
      'email-verification-required',
      'forgot-password-via-email',
      'disable-self-signup'
    ],
    emailSettings: {
      verificationSubject: 'Primo Maps - Verify your email',
      verificationMessage: 'Your verification code is {####}',
      inviteSubject: 'Primo Maps Admin - Your account has been created',
      inviteMessage: 'Welcome to Primo Maps Admin! Your username is {username} and temporary password is {####}. Please log in and change your password.'
    }
  });

  await ctx.breakpoint({
    question: 'Cognito User Pool configured for email-based password reset and admin-only user creation. Verify the settings in AWS Console. Proceed with Lambda functions for user management?',
    title: 'Cognito Email Reset Config',
    context: {
      runId: ctx.runId
    }
  });

  // ============================================================================
  // MILESTONE 2: BACKEND LAMBDA FUNCTIONS FOR USER MANAGEMENT (TDD)
  // ============================================================================

  // Task 2.1: TDD - List Users Lambda
  const listUsersResult = await ctx.task(tddListUsersTask, {
    moduleName: 'listUsers',
    description: 'List all users in Cognito User Pool with pagination',
    acceptanceCriteria: [
      'Returns paginated list of users',
      'Includes username, email, status, role, createdAt, lastModified',
      'Supports search/filter by username or email',
      'Requires admin role',
      'Returns 403 for non-admin users'
    ]
  });

  // Task 2.2: TDD - Create User Lambda
  const createUserResult = await ctx.task(tddCreateUserTask, {
    moduleName: 'createUser',
    description: 'Create new user with email and role assignment',
    acceptanceCriteria: [
      'Creates user in Cognito with email as username',
      'Sets custom:role attribute (admin or editor)',
      'Sends temporary password via email',
      'Email must be valid format',
      'Requires admin role',
      'Returns 409 if user already exists',
      'Returns created user info (without password)'
    ]
  });

  // Task 2.3: TDD - Update User Lambda
  const updateUserResult = await ctx.task(tddUpdateUserTask, {
    moduleName: 'updateUser',
    description: 'Update user attributes (role, enable/disable)',
    acceptanceCriteria: [
      'Can update custom:role attribute',
      'Can enable/disable user account',
      'Cannot modify own admin status (prevent lockout)',
      'Requires admin role',
      'Returns 404 if user not found'
    ]
  });

  // Task 2.4: TDD - Delete User Lambda
  const deleteUserResult = await ctx.task(tddDeleteUserTask, {
    moduleName: 'deleteUser',
    description: 'Delete user from Cognito User Pool',
    acceptanceCriteria: [
      'Deletes user from Cognito',
      'Cannot delete own account',
      'Requires admin role',
      'Returns 404 if user not found',
      'Returns success confirmation'
    ]
  });

  // Task 2.5: TDD - Reset User Password Lambda
  const resetPasswordResult = await ctx.task(tddResetPasswordTask, {
    moduleName: 'resetUserPassword',
    description: 'Admin-triggered password reset for user',
    acceptanceCriteria: [
      'Triggers new temporary password via email',
      'Sets user status to FORCE_CHANGE_PASSWORD',
      'Requires admin role',
      'Returns 404 if user not found',
      'Returns success confirmation'
    ]
  });

  // Task 2.6: Deploy User Management Lambdas
  const deployLambdasResult = await ctx.task(deployUserMgmtLambdasTask, {
    lambdas: ['listUsers', 'createUser', 'updateUser', 'deleteUser', 'resetUserPassword'],
    apiGatewayPath: '/api/users'
  });

  await ctx.breakpoint({
    question: 'User management Lambda functions implemented and deployed. All require admin role. Proceed with frontend Admin UI?',
    title: 'User Management Backend Complete',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'lambda/listUsers.mjs', format: 'code', label: 'List Users' },
        { path: 'lambda/createUser.mjs', format: 'code', label: 'Create User' },
        { path: 'lambda/updateUser.mjs', format: 'code', label: 'Update User' },
        { path: 'lambda/deleteUser.mjs', format: 'code', label: 'Delete User' },
        { path: 'lambda/resetUserPassword.mjs', format: 'code', label: 'Reset Password' }
      ]
    }
  });

  // ============================================================================
  // MILESTONE 3: FRONTEND ADMIN USER MANAGEMENT UI (TDD)
  // ============================================================================

  // Task 3.1: Add User Management navigation tab
  const navTabResult = await ctx.task(addUserMgmtNavTask, {
    description: 'Add Users tab to navigation, visible only to admin role',
    placement: 'after Version History tab',
    i18n: {
      en: 'Users',
      he: 'משתמשים'
    }
  });

  // Task 3.2: TDD - User List Component
  const userListResult = await ctx.task(tddUserListComponentTask, {
    componentName: 'user-list',
    description: 'Display paginated table of users with actions',
    acceptanceCriteria: [
      'Shows table with columns: Username/Email, Role, Status, Created, Actions',
      'Role shown as badge (Admin/Editor)',
      'Status shows Enabled/Disabled/Force Change Password',
      'Search/filter by username or email',
      'Pagination controls',
      'Action buttons: Edit, Reset Password, Delete',
      'Bilingual support (Hebrew/English)',
      'RTL layout in Hebrew mode'
    ]
  });

  // Task 3.3: TDD - Create User Dialog
  const createUserDialogResult = await ctx.task(tddCreateUserDialogTask, {
    componentName: 'create-user-dialog',
    description: 'Modal dialog for creating new user',
    acceptanceCriteria: [
      'Email input with validation',
      'Role selector (Admin/Editor dropdown)',
      'Create button triggers API call',
      'Shows loading state during creation',
      'Shows success message with temp password note',
      'Shows error for invalid email or existing user',
      'Close/Cancel button',
      'Bilingual support'
    ]
  });

  // Task 3.4: TDD - Edit User Dialog
  const editUserDialogResult = await ctx.task(tddEditUserDialogTask, {
    componentName: 'edit-user-dialog',
    description: 'Modal dialog for editing user',
    acceptanceCriteria: [
      'Shows current username (readonly)',
      'Role selector (Admin/Editor)',
      'Enable/Disable toggle',
      'Save button triggers update',
      'Shows loading state',
      'Shows success/error messages',
      'Bilingual support'
    ]
  });

  // Task 3.5: TDD - Delete Confirmation Dialog
  const deleteDialogResult = await ctx.task(tddDeleteConfirmDialogTask, {
    componentName: 'delete-user-confirm-dialog',
    description: 'Confirmation dialog for user deletion',
    acceptanceCriteria: [
      'Shows warning message with username',
      'Requires typing username to confirm',
      'Delete button disabled until confirmation',
      'Bilingual support'
    ]
  });

  // Task 3.6: TDD - User Management Service
  const userServiceResult = await ctx.task(tddUserServiceTask, {
    serviceName: 'user-service',
    description: 'API client for user management operations',
    acceptanceCriteria: [
      'listUsers(page, search) - returns paginated users',
      'createUser(email, role) - creates new user',
      'updateUser(username, { role, enabled }) - updates user',
      'deleteUser(username) - deletes user',
      'resetPassword(username) - triggers password reset',
      'Includes Authorization header from auth-service',
      'Handles API errors gracefully'
    ]
  });

  // Task 3.7: Integration - Wire components into app
  const uiIntegrationResult = await ctx.task(integrateUserMgmtUITask, {
    description: 'Integrate user management components into main app',
    updates: [
      'Add Users view to index.html',
      'Add nav tab handler in app.js',
      'Wire up dialogs and event handlers',
      'Apply admin-only visibility rules'
    ]
  });

  await ctx.breakpoint({
    question: 'User Management UI components implemented. Ready for E2E testing?',
    title: 'User Management UI Complete',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'admin/components/user-list.js', format: 'code', label: 'User List' },
        { path: 'admin/components/create-user-dialog.js', format: 'code', label: 'Create User' },
        { path: 'admin/user-service.js', format: 'code', label: 'User Service' }
      ]
    }
  });

  // ============================================================================
  // MILESTONE 4: DEPLOYMENT & E2E TESTING
  // ============================================================================

  // Task 4.1: Deploy frontend updates
  const deployFrontendResult = await ctx.task(deployFrontendTask, {
    files: [
      'admin/index.html',
      'admin/app.js',
      'admin/user-service.js',
      'admin/components/user-list.js',
      'admin/components/create-user-dialog.js',
      'admin/components/edit-user-dialog.js',
      'admin/components/delete-user-confirm-dialog.js',
      'admin/i18n/en.json',
      'admin/i18n/he.json'
    ],
    invalidateCache: true
  });

  // Task 4.2: E2E Testing
  const e2eResult = await ctx.task(e2eUserMgmtTestTask, {
    scenarios: [
      'Admin can see Users tab, editor cannot',
      'Admin can view user list with pagination',
      'Admin can search/filter users',
      'Admin can create new user with email and role',
      'New user receives email with temp password',
      'Admin can change user role',
      'Admin can enable/disable user',
      'Admin can trigger password reset',
      'Admin can delete user (with confirmation)',
      'Admin cannot delete own account',
      'Password reset email flow works',
      'UI displays correctly in Hebrew',
      'UI displays correctly in English'
    ],
    targetPassRate: targetCoverage
  });

  // Task 4.3: Final test run
  const finalTestResult = await ctx.task(runAllTestsTask, {
    includeBackend: true,
    includeFrontend: true,
    includeE2e: true,
    targetPassRate: targetCoverage
  });

  // Final breakpoint
  await ctx.breakpoint({
    question: `Phase 5 Complete!\n\nUser Management Features:\n✓ Cognito email-based password reset enabled\n✓ Admin user management UI (CRUD)\n✓ Lambda functions deployed\n\nTest Results:\n- Backend: ${finalTestResult.backend?.passRate || 'N/A'}% pass\n- Frontend: ${finalTestResult.frontend?.passRate || 'N/A'}% pass\n- E2E: ${finalTestResult.e2e?.passRate || 'N/A'}% pass\n\nApprove to finalize?`,
    title: 'Phase 5 Complete - Final Review',
    context: {
      runId: ctx.runId
    }
  });

  return {
    success: true,
    testsPass: finalTestResult.overall?.passRate || 100,
    features: [
      'cognito-email-password-reset',
      'admin-user-list',
      'admin-user-create',
      'admin-user-edit',
      'admin-user-delete',
      'admin-password-reset'
    ]
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

/**
 * Task: Configure Cognito for Email-Based Password Reset
 */
const configureCognitoEmailTask = defineTask('configure-cognito-email', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Configure Cognito Email Settings',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'AWS Cloud Engineer',
      task: 'Configure Cognito User Pool for email-based password reset and admin-only user creation',
      context: {
        userPoolId: args.userPoolId,
        features: args.features,
        emailSettings: args.emailSettings
      },
      instructions: [
        `Update User Pool ${args.userPoolId} with AWS CLI`,
        'Ensure email is set as an alias for sign-in',
        'Enable email verification',
        'Configure "Forgot Password" to use email (not phone)',
        'Disable self-signup (admin creates users only)',
        'Update email templates for invitation and verification',
        'Verify SES is configured for sending emails (or use Cognito default)',
        'Test forgot password flow triggers email',
        'Document the AWS CLI commands used'
      ],
      outputFormat: 'JSON with configuration status and CLI commands'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        cliCommands: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: TDD - List Users Lambda
 */
const tddListUsersTask = defineTask('tdd-list-users', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.moduleName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Backend Developer',
      task: `Implement ${args.moduleName} Lambda using strict TDD methodology`,
      context: {
        moduleName: args.moduleName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests in lambda/__tests__/listUsers.test.mjs',
        '2. GREEN: Implement in lambda/listUsers.mjs',
        '3. REFACTOR: Clean up while tests pass',
        'Use @aws-sdk/client-cognito-identity-provider',
        'Import and use auth-middleware for JWT validation',
        'Import and use role-auth to check admin permission',
        'Use ListUsersCommand with pagination',
        'Map user attributes to clean response format',
        'Support ?search= query parameter for filtering',
        'Return 403 if not admin role',
        'Run tests and verify all pass'
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
 * Task: TDD - Create User Lambda
 */
const tddCreateUserTask = defineTask('tdd-create-user', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.moduleName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Backend Developer',
      task: `Implement ${args.moduleName} Lambda using strict TDD methodology`,
      context: {
        moduleName: args.moduleName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests in lambda/__tests__/createUser.test.mjs',
        '2. GREEN: Implement in lambda/createUser.mjs',
        '3. REFACTOR: Clean up while tests pass',
        'Use AdminCreateUserCommand from @aws-sdk/client-cognito-identity-provider',
        'Set UserAttributes: email, custom:role',
        'Set DesiredDeliveryMediums: EMAIL',
        'Validate email format before creation',
        'Handle UsernameExistsException with 409 response',
        'Return user info without sensitive data',
        'Require admin role via role-auth',
        'Run tests and verify all pass'
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
 * Task: TDD - Update User Lambda
 */
const tddUpdateUserTask = defineTask('tdd-update-user', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.moduleName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Backend Developer',
      task: `Implement ${args.moduleName} Lambda using strict TDD methodology`,
      context: {
        moduleName: args.moduleName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests',
        '2. GREEN: Implement minimum code',
        '3. REFACTOR: Clean up',
        'Use AdminUpdateUserAttributesCommand for role changes',
        'Use AdminDisableUserCommand / AdminEnableUserCommand for status',
        'Check if target user is current user to prevent self-demotion',
        'Return 404 with UserNotFoundException',
        'Require admin role',
        'Run tests and verify all pass'
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
 * Task: TDD - Delete User Lambda
 */
const tddDeleteUserTask = defineTask('tdd-delete-user', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.moduleName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Backend Developer',
      task: `Implement ${args.moduleName} Lambda using strict TDD methodology`,
      context: {
        moduleName: args.moduleName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests',
        '2. GREEN: Implement minimum code',
        '3. REFACTOR: Clean up',
        'Use AdminDeleteUserCommand',
        'Check if target user is current user to prevent self-deletion',
        'Return 404 with UserNotFoundException',
        'Require admin role',
        'Run tests and verify all pass'
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
 * Task: TDD - Reset User Password Lambda
 */
const tddResetPasswordTask = defineTask('tdd-reset-password', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.moduleName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Backend Developer',
      task: `Implement ${args.moduleName} Lambda using strict TDD methodology`,
      context: {
        moduleName: args.moduleName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests',
        '2. GREEN: Implement minimum code',
        '3. REFACTOR: Clean up',
        'Use AdminResetUserPasswordCommand',
        'This sends a new temporary password via email',
        'User will be forced to change password on next login',
        'Return 404 with UserNotFoundException',
        'Require admin role',
        'Run tests and verify all pass'
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
 * Task: Deploy User Management Lambdas
 */
const deployUserMgmtLambdasTask = defineTask('deploy-user-mgmt-lambdas', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Deploy User Management Lambdas',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps Engineer',
      task: 'Deploy user management Lambda functions and configure API Gateway',
      context: {
        lambdas: args.lambdas,
        apiGatewayPath: args.apiGatewayPath
      },
      instructions: [
        'Package each Lambda with dependencies',
        'Add IAM permissions for cognito-idp:Admin* operations',
        'Deploy using AWS CLI: aws lambda update-function-code',
        'Add API Gateway routes:',
        '  GET /api/users -> listUsers',
        '  POST /api/users -> createUser',
        '  PUT /api/users/{username} -> updateUser',
        '  DELETE /api/users/{username} -> deleteUser',
        '  POST /api/users/{username}/reset-password -> resetUserPassword',
        'Ensure Cognito authorizer is attached',
        'Test each endpoint',
        'Verify CORS headers'
      ],
      outputFormat: 'JSON with deployment status'
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'deployedLambdas'],
      properties: {
        success: { type: 'boolean' },
        deployedLambdas: { type: 'array', items: { type: 'string' } },
        apiEndpoints: { type: 'object' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: Add User Management Nav Tab
 */
const addUserMgmtNavTask = defineTask('add-user-mgmt-nav', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Add Users Navigation Tab',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend Developer',
      task: 'Add Users navigation tab visible only to admin role',
      context: {
        description: args.description,
        placement: args.placement,
        i18n: args.i18n
      },
      instructions: [
        'Add nav-users button to index.html navigation tabs',
        'Add data-role-required="admin" attribute',
        'Add data-i18n="nav.users" for translation',
        'Update i18n files with nav.users translations',
        'Add user-management view div to main content',
        'Update app.js to handle nav-users tab click',
        'Apply auth-guard visibility rules on load'
      ],
      outputFormat: 'JSON with files modified'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesModified: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

/**
 * Task: TDD - User List Component
 */
const tddUserListComponentTask = defineTask('tdd-user-list-component', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.componentName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Frontend Developer',
      task: `Implement ${args.componentName} component using TDD`,
      context: {
        componentName: args.componentName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests in admin/__tests__/user-list.test.js',
        '2. GREEN: Implement in admin/components/user-list.js',
        '3. REFACTOR: Clean up',
        'Create ES6 class UserList with init() and render() methods',
        'Use Tailwind CSS for styling',
        'Support Hebrew RTL and English LTR',
        'Include search input with debounce',
        'Display table with user data',
        'Add pagination controls',
        'Add action buttons (Edit, Reset Password, Delete) per row',
        'Emit events for actions to be handled by parent',
        'Use i18n service for translations'
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
 * Task: TDD - Create User Dialog
 */
const tddCreateUserDialogTask = defineTask('tdd-create-user-dialog', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.componentName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Frontend Developer',
      task: `Implement ${args.componentName} component using TDD`,
      context: {
        componentName: args.componentName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests',
        '2. GREEN: Implement',
        '3. REFACTOR: Clean up',
        'Create modal dialog component',
        'Email input with validation (required, valid format)',
        'Role dropdown (Admin, Editor)',
        'Create button calls user-service.createUser()',
        'Show loading spinner during API call',
        'Show success toast and close on success',
        'Show error message on failure',
        'Cancel button closes dialog',
        'Use Tailwind for styling',
        'Bilingual support with i18n'
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
 * Task: TDD - Edit User Dialog
 */
const tddEditUserDialogTask = defineTask('tdd-edit-user-dialog', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.componentName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Frontend Developer',
      task: `Implement ${args.componentName} component using TDD`,
      context: {
        componentName: args.componentName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests',
        '2. GREEN: Implement',
        '3. REFACTOR: Clean up',
        'Create modal dialog for editing user',
        'Show username as readonly field',
        'Role dropdown to change role',
        'Enable/Disable toggle switch',
        'Save button calls user-service.updateUser()',
        'Handle loading and error states',
        'Bilingual support'
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
 * Task: TDD - Delete Confirmation Dialog
 */
const tddDeleteConfirmDialogTask = defineTask('tdd-delete-confirm-dialog', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.componentName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Frontend Developer',
      task: `Implement ${args.componentName} component using TDD`,
      context: {
        componentName: args.componentName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests',
        '2. GREEN: Implement',
        '3. REFACTOR: Clean up',
        'Create confirmation modal with warning styling',
        'Show clear warning message about deletion',
        'Require user to type username to confirm',
        'Delete button disabled until username matches',
        'Delete button calls user-service.deleteUser()',
        'Handle loading and error states',
        'Bilingual support'
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
 * Task: TDD - User Service
 */
const tddUserServiceTask = defineTask('tdd-user-service', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD: ${args.serviceName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TDD Frontend Developer',
      task: `Implement ${args.serviceName} API client using TDD`,
      context: {
        serviceName: args.serviceName,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        '1. RED: Write failing tests in admin/__tests__/user-service.test.js',
        '2. GREEN: Implement in admin/user-service.js',
        '3. REFACTOR: Clean up',
        'Create ES6 module with async functions',
        'Use fetch() with proper headers',
        'Get auth token from auth-service.getAccessToken()',
        'Handle HTTP errors and throw meaningful exceptions',
        'Parse JSON responses',
        'Export: listUsers, createUser, updateUser, deleteUser, resetPassword',
        'Use API_BASE_URL from config'
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
 * Task: Integrate User Management UI
 */
const integrateUserMgmtUITask = defineTask('integrate-user-mgmt-ui', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Integrate User Management UI',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Full Stack Developer',
      task: 'Wire up user management components into the main application',
      context: {
        description: args.description,
        updates: args.updates
      },
      instructions: [
        'Import user management components in app.js',
        'Initialize UserList component when Users tab is active',
        'Handle action events from UserList',
        'Wire CreateUserDialog to "Add User" button',
        'Wire EditUserDialog to edit action',
        'Wire DeleteConfirmDialog to delete action',
        'Add "Add User" button to Users view header',
        'Ensure admin-only visibility rules are applied',
        'Test manual flow: list users, create user, edit user, delete user'
      ],
      outputFormat: 'JSON with integration status'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesModified: { type: 'array', items: { type: 'string' } }
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
  title: 'Deploy Frontend Updates',
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
        'Upload all user management files to S3 admin folder',
        'Ensure proper content-type headers (text/html, application/javascript)',
        'Invalidate CloudFront cache for admin files',
        'Verify files are accessible via CloudFront URL',
        'Test that Users tab appears for admin users'
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
 * Task: E2E User Management Testing
 */
const e2eUserMgmtTestTask = defineTask('e2e-user-mgmt-test', (args, taskCtx) => ({
  kind: 'agent',
  title: 'E2E Testing: User Management',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA Engineer',
      task: 'Run E2E tests for user management features using Playwright',
      context: {
        scenarios: args.scenarios,
        targetPassRate: args.targetPassRate
      },
      instructions: [
        'Use Playwright MCP to test user management flows',
        'Login as admin user for testing',
        'Test each scenario systematically',
        'Verify UI in both Hebrew and English',
        'Test error handling (invalid email, duplicate user)',
        'Test confirmation dialogs',
        'Take screenshots for documentation',
        'Output pass/fail for each scenario'
      ],
      outputFormat: 'JSON with E2E test results'
    },
    outputSchema: {
      type: 'object',
      required: ['passRate', 'testCount'],
      properties: {
        passRate: { type: 'number' },
        testCount: { type: 'number' },
        scenarios: { type: 'array' }
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
        'Output comprehensive test report'
      ],
      outputFormat: 'JSON with comprehensive test results'
    },
    outputSchema: {
      type: 'object',
      required: ['overall'],
      properties: {
        overall: {
          type: 'object',
          properties: {
            passRate: { type: 'number' },
            testCount: { type: 'number' }
          }
        },
        backend: { type: 'object' },
        frontend: { type: 'object' },
        e2e: { type: 'object' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));
