/**
 * @process primo-maps/phase2-admin-ui
 * @description Phase 2: Admin UI - File Management (Bilingual) - Build web interface for managing CSV and SVG files
 * @inputs { bucket: string, cloudfrontDistId: string, cloudFrontDomain: string, projectRoot: string }
 * @outputs { success: boolean, completedTasks: array, apiEndpoint: string }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

/**
 * Phase 2: Admin UI Implementation Process
 *
 * Tasks:
 * 1. Project Setup & i18n Framework
 * 2. Admin SPA Shell (Bilingual)
 * 3. Lambda Functions - CSV API
 * 4. Lambda Functions - SVG API
 * 5. API Gateway Setup
 * 6. CSV Editor Component
 * 7. SVG File Manager Component
 * 8. Input Validation (Localized)
 * 9. Deploy & Test Admin UI
 */
export async function process(inputs, ctx) {
  const {
    bucket = 'tau-cenlib-primo-assets-hagay-3602',
    cloudfrontDistId = 'E5SR0E5GM5GSB',
    cloudFrontDomain = 'd3h8i7y9p8lyw7.cloudfront.net',
    projectRoot = '/home/hagaybar/projects/primo_maps'
  } = inputs;

  const completedTasks = [];
  let apiEndpoint = '';

  // ============================================================================
  // TASK 1: Project Setup & i18n Framework
  // ============================================================================

  const task1Result = await ctx.task(setupI18nTask, {
    projectRoot
  });

  completedTasks.push({
    task: 1,
    title: 'Project Setup & i18n Framework',
    success: task1Result.success,
    details: task1Result
  });

  if (!task1Result.success) {
    return { success: false, completedTasks, error: 'Task 1 failed: ' + task1Result.error };
  }

  // ============================================================================
  // TASK 2: Admin SPA Shell (Bilingual)
  // ============================================================================

  const task2Result = await ctx.task(createAdminShellTask, {
    projectRoot
  });

  completedTasks.push({
    task: 2,
    title: 'Admin SPA Shell (Bilingual)',
    success: task2Result.success,
    details: task2Result
  });

  if (!task2Result.success) {
    return { success: false, completedTasks, error: 'Task 2 failed: ' + task2Result.error };
  }

  // ============================================================================
  // TASK 3: Lambda Functions - CSV API
  // ============================================================================

  const task3Result = await ctx.task(createCsvLambdasTask, {
    bucket,
    cloudfrontDistId,
    projectRoot
  });

  completedTasks.push({
    task: 3,
    title: 'Lambda Functions - CSV API',
    success: task3Result.success,
    details: task3Result
  });

  if (!task3Result.success) {
    return { success: false, completedTasks, error: 'Task 3 failed: ' + task3Result.error };
  }

  // ============================================================================
  // TASK 4: Lambda Functions - SVG API
  // ============================================================================

  const task4Result = await ctx.task(createSvgLambdasTask, {
    bucket,
    cloudfrontDistId,
    projectRoot
  });

  completedTasks.push({
    task: 4,
    title: 'Lambda Functions - SVG API',
    success: task4Result.success,
    details: task4Result
  });

  if (!task4Result.success) {
    return { success: false, completedTasks, error: 'Task 4 failed: ' + task4Result.error };
  }

  // ============================================================================
  // TASK 5: API Gateway Setup
  // ============================================================================

  const task5Result = await ctx.task(setupApiGatewayTask, {
    projectRoot
  });

  completedTasks.push({
    task: 5,
    title: 'API Gateway Setup',
    success: task5Result.success,
    details: task5Result
  });

  apiEndpoint = task5Result.apiEndpoint || '';

  if (!task5Result.success) {
    return { success: false, completedTasks, apiEndpoint, error: 'Task 5 failed: ' + task5Result.error };
  }

  // ============================================================================
  // TASK 6: CSV Editor Component
  // ============================================================================

  const task6Result = await ctx.task(createCsvEditorTask, {
    projectRoot,
    cloudFrontDomain,
    apiEndpoint
  });

  completedTasks.push({
    task: 6,
    title: 'CSV Editor Component',
    success: task6Result.success,
    details: task6Result
  });

  if (!task6Result.success) {
    return { success: false, completedTasks, apiEndpoint, error: 'Task 6 failed: ' + task6Result.error };
  }

  // ============================================================================
  // TASK 7: SVG File Manager Component
  // ============================================================================

  const task7Result = await ctx.task(createSvgManagerTask, {
    projectRoot,
    cloudFrontDomain,
    apiEndpoint
  });

  completedTasks.push({
    task: 7,
    title: 'SVG File Manager Component',
    success: task7Result.success,
    details: task7Result
  });

  if (!task7Result.success) {
    return { success: false, completedTasks, apiEndpoint, error: 'Task 7 failed: ' + task7Result.error };
  }

  // ============================================================================
  // TASK 8: Input Validation (Localized)
  // ============================================================================

  const task8Result = await ctx.task(createValidationTask, {
    projectRoot
  });

  completedTasks.push({
    task: 8,
    title: 'Input Validation (Localized)',
    success: task8Result.success,
    details: task8Result
  });

  if (!task8Result.success) {
    return { success: false, completedTasks, apiEndpoint, error: 'Task 8 failed: ' + task8Result.error };
  }

  // ============================================================================
  // TASK 9: Deploy & Test Admin UI
  // ============================================================================

  const task9Result = await ctx.task(deployAndTestTask, {
    bucket,
    cloudfrontDistId,
    cloudFrontDomain,
    projectRoot,
    apiEndpoint
  });

  completedTasks.push({
    task: 9,
    title: 'Deploy & Test Admin UI',
    success: task9Result.success,
    details: task9Result
  });

  return {
    success: completedTasks.every(t => t.success),
    completedTasks,
    apiEndpoint,
    summary: {
      total: completedTasks.length,
      succeeded: completedTasks.filter(t => t.success).length,
      failed: completedTasks.filter(t => !t.success).length
    },
    metadata: {
      processId: 'primo-maps/phase2-admin-ui',
      timestamp: ctx.now()
    }
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

/**
 * Task 1: Project Setup & i18n Framework
 */
export const setupI18nTask = defineTask('setup-i18n', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Setup i18n Framework',
  description: 'Create admin folder structure and internationalization system',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend developer',
      task: 'Set up project structure and i18n framework for bilingual admin UI (Hebrew/English)',
      context: {
        projectRoot: args.projectRoot,
        structure: {
          folders: ['admin', 'admin/i18n', 'admin/components', 'admin/styles'],
          translationFiles: ['admin/i18n/en.json', 'admin/i18n/he.json'],
          i18nModule: 'admin/i18n.js'
        }
      },
      instructions: [
        'Create the admin folder structure: admin/, admin/i18n/, admin/components/, admin/styles/',
        'Create admin/i18n/en.json with English translations for: app (title, logout, language), nav (csvEditor, svgManager, settings), csv (title, save, cancel, addRow, deleteRow, search, unsavedChanges, saveSuccess, saveError), svg (title, upload, delete, replace, preview, confirmDelete), validation (required, invalidFormat, invalidRange), common (loading, error, confirm, cancel, yes, no)',
        'Create admin/i18n/he.json with Hebrew translations for the same keys',
        'Create admin/i18n.js module with: init(), loadTranslations(), t(key), setLocale(locale), applyDirection(), isRTL() - stores locale in localStorage, applies dir attribute to html',
        'Verify all files are created correctly'
      ],
      outputFormat: 'JSON with success (boolean), filesCreated (array of file paths), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['frontend', 'i18n', 'setup']
}));

/**
 * Task 2: Admin SPA Shell (Bilingual)
 */
export const createAdminShellTask = defineTask('admin-shell', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create Admin SPA Shell',
  description: 'Create the main admin interface layout with bilingual support',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend developer',
      task: 'Create the main admin SPA shell with bilingual support',
      context: {
        projectRoot: args.projectRoot,
        files: {
          html: 'admin/index.html',
          js: 'admin/app.js',
          css: 'admin/styles/app.css'
        },
        requirements: [
          'Use Tailwind CSS via CDN',
          'Support RTL (Hebrew) and LTR (English) layouts',
          'Header with app title and language toggle (EN/עב buttons)',
          'Navigation tabs for CSV Editor and Map Files',
          'Main content area with view switching',
          'Toast notification container'
        ]
      },
      instructions: [
        'Create admin/index.html with: DOCTYPE, lang="he" dir="rtl" default, Tailwind CDN, header with title and language toggle, navigation tabs, main content area with csv-editor and svg-manager views, toast container, app.js module import',
        'Create admin/styles/app.css with: RTL-compatible styles using CSS logical properties (padding-inline, margin-block, text-align: start), nav-tab active state, language button active state, BiDi text handling with dir="auto", csv-table styles, card styles, RTL-aware icon transforms',
        'Create admin/app.js with: import i18n, init() function, updateUI() to set all translatable text, setupEventListeners() for language toggle and navigation, showView() for view switching',
        'Verify all files are created and linked correctly'
      ],
      outputFormat: 'JSON with success (boolean), filesCreated (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['frontend', 'shell', 'bilingual']
}));

/**
 * Task 3: Lambda Functions - CSV API
 */
export const createCsvLambdasTask = defineTask('csv-lambdas', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create CSV Lambda Functions',
  description: 'Create Lambda functions for CSV read/write operations with versioning',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'AWS Lambda developer',
      task: 'Create Lambda functions for CSV API with versioning support',
      context: {
        projectRoot: args.projectRoot,
        bucket: args.bucket,
        cloudfrontDistId: args.cloudfrontDistId,
        lambdaDir: 'lambda',
        functions: {
          getCsv: 'Read CSV from S3, return content',
          putCsv: 'Save CSV to S3, create version backup, invalidate CloudFront cache, prune old versions (keep last 20)'
        }
      },
      instructions: [
        'Create lambda/ directory if not exists',
        'Create lambda/getCsv.mjs - ES module using @aws-sdk/client-s3, GetObjectCommand, return CSV content with proper headers',
        'Create lambda/putCsv.mjs - ES module that: 1) Gets current file and saves to versions/data/mapping_TIMESTAMP_USERNAME.csv, 2) Writes new content to data/mapping.csv, 3) Prunes versions keeping last 20, 4) Invalidates CloudFront cache for /data/mapping.csv',
        'Create lambda/package.json with type: module and dependencies',
        'Include proper CORS headers in responses (Access-Control-Allow-Origin: *)',
        'Handle errors gracefully with proper status codes'
      ],
      outputFormat: 'JSON with success (boolean), filesCreated (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['backend', 'lambda', 'csv']
}));

/**
 * Task 4: Lambda Functions - SVG API
 */
export const createSvgLambdasTask = defineTask('svg-lambdas', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create SVG Lambda Functions',
  description: 'Create Lambda functions for SVG file management with versioning',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'AWS Lambda developer',
      task: 'Create Lambda functions for SVG file management API',
      context: {
        projectRoot: args.projectRoot,
        bucket: args.bucket,
        cloudfrontDistId: args.cloudfrontDistId,
        lambdaDir: 'lambda',
        functions: {
          listSvg: 'List all SVG files in maps/ with metadata',
          uploadSvg: 'Upload/replace SVG, create version backup, invalidate cache',
          deleteSvg: 'Delete SVG, create version backup marked as deleted, invalidate cache'
        }
      },
      instructions: [
        'Create lambda/listSvg.mjs - ES module that lists maps/*.svg with name, size, lastModified',
        'Create lambda/uploadSvg.mjs - ES module that: validates SVG content, backs up existing file to versions/, uploads new file, invalidates CloudFront',
        'Create lambda/deleteSvg.mjs - ES module that: backs up to versions/ with _deleted suffix, deletes file, invalidates CloudFront',
        'Include proper CORS headers in all responses',
        'Validate SVG content contains <svg tag before upload',
        'Handle errors gracefully with proper status codes'
      ],
      outputFormat: 'JSON with success (boolean), filesCreated (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['backend', 'lambda', 'svg']
}));

/**
 * Task 5: API Gateway Setup
 */
export const setupApiGatewayTask = defineTask('api-gateway', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Setup API Gateway',
  description: 'Create and configure API Gateway with Lambda integrations',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'AWS DevOps engineer',
      task: 'Create API Gateway REST API and connect Lambda functions',
      context: {
        projectRoot: args.projectRoot,
        apiName: 'PrimoMapsAdmin',
        endpoints: {
          'GET /api/csv': 'getCsv Lambda',
          'PUT /api/csv': 'putCsv Lambda',
          'GET /api/svg': 'listSvg Lambda',
          'POST /api/svg': 'uploadSvg Lambda',
          'DELETE /api/svg': 'deleteSvg Lambda'
        }
      },
      instructions: [
        'First, check if Lambda functions exist and need to be deployed',
        'Create IAM role for Lambda with S3 and CloudFront permissions if not exists',
        'Deploy Lambda functions using AWS CLI (zip and create-function or update-function-code)',
        'Create API Gateway REST API named PrimoMapsAdmin',
        'Create /api resource, then /api/csv and /api/svg resources',
        'Configure methods with Lambda proxy integration',
        'Configure CORS for each resource (OPTIONS method + headers)',
        'Deploy API to prod stage',
        'Return the API endpoint URL'
      ],
      outputFormat: 'JSON with success (boolean), apiEndpoint (string), lambdasDeployed (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        apiEndpoint: { type: 'string' },
        lambdasDeployed: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['backend', 'api-gateway', 'deployment']
}));

/**
 * Task 6: CSV Editor Component
 */
export const createCsvEditorTask = defineTask('csv-editor', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create CSV Editor Component',
  description: 'Build bilingual CSV table editor with BiDi support',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend developer',
      task: 'Create a bilingual CSV table editor component',
      context: {
        projectRoot: args.projectRoot,
        cloudFrontDomain: args.cloudFrontDomain,
        apiEndpoint: args.apiEndpoint,
        file: 'admin/components/csv-editor.js',
        csvColumns: ['libraryName', 'libraryNameHe', 'collectionName', 'collectionNameHe', 'rangeStart', 'rangeEnd', 'svgCode', 'description', 'descriptionHe', 'floor', 'shelfLabel', 'shelfLabelHe', 'notes', 'notesHe']
      },
      instructions: [
        'Create admin/components/csv-editor.js as ES module',
        'Export initCSVEditor() function that renders and initializes the editor',
        'Load CSV from CloudFront URL (https://DOMAIN/data/mapping.csv) using fetch',
        'Parse CSV with proper handling of quoted fields and commas',
        'Render table with editable input fields, use dir="auto" for BiDi text support',
        'Implement search/filter functionality',
        'Implement add row and delete row with confirmation',
        'Track changes and enable/disable save button',
        'Save via API endpoint using PUT with JSON body {csvContent, username}',
        'Show toast notifications for success/error (import from toast.js)',
        'Use i18n.t() for all translatable text',
        'Also create admin/components/toast.js for toast notifications'
      ],
      outputFormat: 'JSON with success (boolean), filesCreated (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['frontend', 'component', 'csv']
}));

/**
 * Task 7: SVG File Manager Component
 */
export const createSvgManagerTask = defineTask('svg-manager', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create SVG File Manager Component',
  description: 'Build SVG file management UI with upload/delete functionality',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend developer',
      task: 'Create SVG file manager component with upload and delete',
      context: {
        projectRoot: args.projectRoot,
        cloudFrontDomain: args.cloudFrontDomain,
        apiEndpoint: args.apiEndpoint,
        file: 'admin/components/svg-manager.js'
      },
      instructions: [
        'Create admin/components/svg-manager.js as ES module',
        'Export initSVGManager() function that renders and initializes the manager',
        'Load file list from API endpoint (GET /api/svg)',
        'Render files in a responsive grid with thumbnails from CloudFront',
        'Show file name, size (formatted), last modified',
        'Implement drag-and-drop upload zone with visual feedback',
        'Implement file picker upload (click to browse)',
        'Upload via API endpoint (POST /api/svg with {filename, content, username})',
        'Implement delete with confirmation dialog',
        'Delete via API endpoint (DELETE /api/svg with {filename, username})',
        'Implement full-size preview modal',
        'Show toast notifications for upload/delete success/error',
        'Use i18n.t() for all translatable text'
      ],
      outputFormat: 'JSON with success (boolean), filesCreated (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['frontend', 'component', 'svg']
}));

/**
 * Task 8: Input Validation (Localized)
 */
export const createValidationTask = defineTask('validation', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create Input Validation Module',
  description: 'Implement validation rules with localized error messages',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend developer',
      task: 'Create validation module with localized error messages',
      context: {
        projectRoot: args.projectRoot,
        file: 'admin/components/validation.js',
        rules: {
          libraryName: { required: true },
          libraryNameHe: { required: true },
          collectionName: { required: true },
          collectionNameHe: { required: true },
          rangeStart: { required: true, pattern: '/^[\\d.]+$|^[A-Z]+\\d*$/' },
          rangeEnd: { required: true, pattern: '/^[\\d.]+$|^[A-Z]+\\d*$/' },
          svgCode: { required: true },
          floor: { required: true, pattern: '/^[0-9]$/' }
        }
      },
      instructions: [
        'Create admin/components/validation.js as ES module',
        'Define VALIDATION_RULES object with field rules',
        'Export validateRow(row) function that returns array of {field, message} errors',
        'Check required fields',
        'Check pattern validation for rangeStart, rangeEnd, floor',
        'Custom validation: rangeStart <= rangeEnd for numeric ranges',
        'Export showFieldError(input, message) to add visual error indication (red border, error text)',
        'Export clearFieldErrors(container) to remove all error indications',
        'Use i18n.t() for error messages (validation.required, validation.invalidFormat, validation.invalidRange)'
      ],
      outputFormat: 'JSON with success (boolean), filesCreated (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['frontend', 'validation']
}));

/**
 * Task 9: Deploy & Test Admin UI
 */
export const deployAndTestTask = defineTask('deploy-test', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Deploy and Test Admin UI',
  description: 'Deploy admin files to S3 and verify functionality',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA and DevOps engineer',
      task: 'Deploy admin UI to S3 and run end-to-end tests',
      context: {
        projectRoot: args.projectRoot,
        bucket: args.bucket,
        cloudfrontDistId: args.cloudfrontDistId,
        cloudFrontDomain: args.cloudFrontDomain,
        apiEndpoint: args.apiEndpoint
      },
      instructions: [
        'Upload admin files to S3 with correct content types:',
        '  - *.html -> text/html; charset=utf-8',
        '  - *.js -> application/javascript; charset=utf-8',
        '  - *.css -> text/css; charset=utf-8',
        '  - *.json -> application/json; charset=utf-8',
        'Use aws s3 cp with --content-type flag for each file type',
        'Invalidate CloudFront cache for /admin/*',
        'Verify admin UI is accessible at https://CLOUDFRONT_DOMAIN/admin/',
        'Test that index.html loads correctly',
        'Test that JavaScript modules load without errors',
        'Test that translation files load',
        'Report test results'
      ],
      outputFormat: 'JSON with success (boolean), filesUploaded (array), testResults (array of {name, passed, details}), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesUploaded: { type: 'array', items: { type: 'string' } },
        testResults: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              passed: { type: 'boolean' },
              details: { type: 'string' }
            }
          }
        },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['deployment', 'testing', 'e2e']
}));
