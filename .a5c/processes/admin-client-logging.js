/**
 * @process admin-client-logging
 * @description Implements comprehensive client-side logging and diagnostics for the Primo Maps Admin SPA.
 *              Creates a logging service that captures API calls, errors, user actions, and provides
 *              a debug console for troubleshooting issues.
 * @inputs {
 *   projectRoot: string,
 *   adminDir: string
 * }
 * @outputs {
 *   loggingService: object,
 *   debugConsole: object,
 *   integrationStatus: object
 * }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const { projectRoot, adminDir = 'admin' } = inputs;

  ctx.log('info', 'Starting client-side logging implementation');
  ctx.log('info', `Project root: ${projectRoot}, Admin dir: ${adminDir}`);

  // Phase 1: Create Logging Service
  ctx.log('info', 'Phase 1: Creating logging service module');
  const loggingService = await ctx.task(createLoggingServiceTask, {
    projectRoot,
    adminDir
  });

  // Phase 2: Integrate with API Calls
  ctx.log('info', 'Phase 2: Integrating logging with API calls');
  const apiIntegration = await ctx.task(integrateApiLoggingTask, {
    projectRoot,
    adminDir,
    loggingService: loggingService.result
  });

  // Phase 3: Add Debug Console UI
  ctx.log('info', 'Phase 3: Adding debug console UI component');
  const debugConsole = await ctx.task(createDebugConsoleTask, {
    projectRoot,
    adminDir
  });

  // Phase 4: Integrate into App
  ctx.log('info', 'Phase 4: Integrating into main app');
  const appIntegration = await ctx.task(integrateIntoAppTask, {
    projectRoot,
    adminDir
  });

  // Quality Gate
  await ctx.breakpoint({
    question: 'Review the logging implementation. Does it capture all necessary information for debugging? Would you like any changes?',
    title: 'Logging Implementation Review',
    options: ['Approve - looks good', 'Need changes'],
    context: {
      filesCreated: [
        `${adminDir}/services/logger.js`,
        `${adminDir}/components/debug-console.js`
      ],
      filesModified: [
        `${adminDir}/components/errors-dashboard.js`,
        `${adminDir}/app.js`
      ]
    }
  });

  ctx.log('info', 'Client-side logging implementation completed');

  return {
    loggingService: loggingService.result,
    debugConsole: debugConsole.result,
    integrationStatus: {
      apiLogging: apiIntegration.result,
      appIntegration: appIntegration.result
    }
  };
}

export const createLoggingServiceTask = defineTask('create-logging-service', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create Logging Service Module',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend JavaScript Developer',
      task: `Create a comprehensive client-side logging service for the Primo Maps Admin application.

The app is at: ${args.projectRoot}/${args.adminDir}

The logging service should:

1. Create a new file: ${args.adminDir}/services/logger.js with:
   - Log levels: debug, info, warn, error
   - Structured log entries with timestamp, level, category, message, and data
   - In-memory log buffer (max 500 entries, circular buffer)
   - Console output with color coding
   - Export logs as JSON for debugging
   - API call tracking (request/response/error with timing)
   - User action tracking (clicks, navigation, form submissions)
   - Error boundary integration (window.onerror, unhandledrejection)

2. Each log entry should include:
   - timestamp (ISO string)
   - level (debug/info/warn/error)
   - category (api/user/error/system)
   - message (string)
   - data (optional object with details)
   - correlationId (for tracking related events)

3. Include these exports:
   - logger.debug(category, message, data?)
   - logger.info(category, message, data?)
   - logger.warn(category, message, data?)
   - logger.error(category, message, data?)
   - logger.apiCall(method, url, options) - returns a wrapped fetch
   - logger.getLogs(filter?) - get logs with optional filtering
   - logger.clearLogs() - clear log buffer
   - logger.exportLogs() - download logs as JSON file
   - logger.setLevel(level) - set minimum log level

Write the actual code file. Use ES6 module syntax compatible with the existing vanilla JS SPA.`,
      instructions: [
        'Create the logger.js file in the services directory',
        'Use ES6 module syntax (import/export)',
        'Make it compatible with browser environment (no Node.js APIs)',
        'Add proper JSDoc comments',
        'Include error handling',
        'Make the circular buffer efficient'
      ],
      outputFormat: 'JSON with summary of what was created'
    },
    outputSchema: {
      type: 'object',
      properties: {
        filesCreated: { type: 'array', items: { type: 'string' } },
        exports: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      },
      required: ['filesCreated', 'summary']
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const integrateApiLoggingTask = defineTask('integrate-api-logging', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Integrate Logging with API Calls',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend JavaScript Developer',
      task: `Integrate the logging service into the errors-dashboard.js to track all API calls and errors.

The app is at: ${args.projectRoot}/${args.adminDir}

Read the current errors-dashboard.js file and modify it to:

1. Import the logger service at the top:
   import logger from '../services/logger.js?v=1';

2. Replace all direct fetch() calls with logger.apiCall() wrapper OR add logging around existing fetch calls

3. Add logging for:
   - CSV data loading (info level with row count)
   - Save operations (info on start, success, error with details)
   - Validation results (debug level)
   - User interactions (fix button clicks, category navigation)

4. In the saveRow function specifically:
   - Log the request details before fetch
   - Log response status and body
   - Log detailed error information including:
     - Network errors (Failed to fetch)
     - HTTP errors (status code, response body)
     - Authentication errors

5. Add error logging to catch blocks with full error details

Make the actual edits to the file. Be careful to preserve the existing functionality while adding logging.`,
      instructions: [
        'Read errors-dashboard.js first to understand the structure',
        'Add logging import at the top',
        'Add logging calls to key functions',
        'Be especially thorough in saveRow() error handling',
        'Do not break existing functionality',
        'Use appropriate log levels'
      ],
      outputFormat: 'JSON with summary of changes made'
    },
    outputSchema: {
      type: 'object',
      properties: {
        filesModified: { type: 'array', items: { type: 'string' } },
        loggingPointsAdded: { type: 'number' },
        summary: { type: 'string' }
      },
      required: ['filesModified', 'summary']
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const createDebugConsoleTask = defineTask('create-debug-console', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create Debug Console UI Component',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend JavaScript Developer',
      task: `Create a debug console UI component for the Primo Maps Admin application.

The app is at: ${args.projectRoot}/${args.adminDir}

Create a new file: ${args.adminDir}/components/debug-console.js that:

1. Creates a floating debug panel that can be toggled with Ctrl+Shift+D

2. The panel should show:
   - Real-time log entries with color coding by level
   - Filter by log level (checkboxes)
   - Filter by category (api/user/error/system)
   - Search box to filter by message content
   - Clear logs button
   - Export logs as JSON button
   - Collapsible log details (click to expand data object)

3. Styling:
   - Fixed position at bottom-right corner
   - Resizable/draggable (optional)
   - Max height with scroll
   - Dark theme for readability
   - Color coding: debug=gray, info=blue, warn=yellow, error=red
   - Monospace font for log entries

4. Export function initDebugConsole() that:
   - Creates the DOM elements
   - Sets up keyboard shortcut
   - Subscribes to log updates

5. The panel should be hidden by default in production
   - Only show when localStorage.debugMode === 'true' or Ctrl+Shift+D pressed

Write the actual code. Use vanilla JS compatible with the existing SPA structure. Include the CSS inline or as a style element.`,
      instructions: [
        'Create the debug-console.js component file',
        'Use vanilla JS (no frameworks)',
        'Include inline CSS or create style element',
        'Make it toggleable with keyboard shortcut',
        'Support RTL layout (the app uses Hebrew)',
        'Keep it lightweight'
      ],
      outputFormat: 'JSON with summary of what was created'
    },
    outputSchema: {
      type: 'object',
      properties: {
        filesCreated: { type: 'array', items: { type: 'string' } },
        features: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      },
      required: ['filesCreated', 'summary']
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const integrateIntoAppTask = defineTask('integrate-into-app', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Integrate into Main App',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend JavaScript Developer',
      task: `Integrate the logging system into the main app.js of the Primo Maps Admin application.

The app is at: ${args.projectRoot}/${args.adminDir}

Modify app.js to:

1. Import the logger and debug console at the top:
   import logger from './services/logger.js?v=1';
   import { initDebugConsole } from './components/debug-console.js?v=1';

2. In the init() function:
   - Initialize the debug console
   - Log application startup (info level)
   - Set up global error handlers via logger

3. Add logging to key app events:
   - View changes (showView function)
   - Authentication events
   - Language toggle

4. Add a keyboard shortcut handler for Ctrl+Shift+D to toggle debug console

5. Make the logger available globally for debugging:
   window.__logger = logger;

Make the actual edits to app.js. Preserve all existing functionality.`,
      instructions: [
        'Read app.js first to understand the structure',
        'Add imports at the top with other imports',
        'Initialize debug console in init()',
        'Add logging to key points without disrupting functionality',
        'Make logger available on window for console debugging'
      ],
      outputFormat: 'JSON with summary of changes made'
    },
    outputSchema: {
      type: 'object',
      properties: {
        filesModified: { type: 'array', items: { type: 'string' } },
        loggingPointsAdded: { type: 'number' },
        summary: { type: 'string' }
      },
      required: ['filesModified', 'summary']
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));
