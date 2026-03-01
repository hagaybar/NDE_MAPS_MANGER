/**
 * @process primo-maps/phase1-infrastructure
 * @description Phase 1: Foundation & File Serving - AWS infrastructure setup for Primo Maps
 * @inputs { bucket: string, cloudfrontDistId: string, corsDomain: string }
 * @outputs { success: boolean, completedTasks: array, cloudFrontDomain: string }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

/**
 * Phase 1: Infrastructure Setup Process
 *
 * Tasks:
 * 1. Organize Local Files
 * 2. Create S3 Folder Structure
 * 3. Upload Files to S3
 * 4. Configure S3 Bucket Policy
 * 5. Configure CORS
 * 6. Verify CloudFront Configuration
 * 7. Invalidate CloudFront Cache
 * 9. Test End-to-End (skip 8 - Angular component)
 */
export async function process(inputs, ctx) {
  const {
    bucket = 'tau-cenlib-primo-assets-hagay-3602',
    cloudfrontDistId = 'E5SR0E5GM5GSB',
    corsDomain = 'tau.primo.exlibrisgroup.com',
    projectRoot = '/home/hagaybar/projects/primo_maps'
  } = inputs;

  const completedTasks = [];
  let cloudFrontDomain = '';

  // ============================================================================
  // TASK 1: Organize Local Files
  // ============================================================================

  const task1Result = await ctx.task(organizeFilesTask, {
    projectRoot
  });

  completedTasks.push({
    task: 1,
    title: 'Organize Local Files',
    success: task1Result.success,
    details: task1Result
  });

  if (!task1Result.success) {
    await ctx.breakpoint({
      question: `Task 1 (Organize Local Files) failed. Error: ${task1Result.error}. How should we proceed?`,
      title: 'Task 1 Failed'
    });
    return { success: false, completedTasks, error: 'Task 1 failed' };
  }

  // ============================================================================
  // TASK 2: Create S3 Folder Structure
  // ============================================================================

  const task2Result = await ctx.task(createS3FoldersTask, {
    bucket
  });

  completedTasks.push({
    task: 2,
    title: 'Create S3 Folder Structure',
    success: task2Result.success,
    details: task2Result
  });

  if (!task2Result.success) {
    await ctx.breakpoint({
      question: `Task 2 (Create S3 Folder Structure) failed. Error: ${task2Result.error}. How should we proceed?`,
      title: 'Task 2 Failed'
    });
    return { success: false, completedTasks, error: 'Task 2 failed' };
  }

  // ============================================================================
  // TASK 3: Upload Files to S3
  // ============================================================================

  const task3Result = await ctx.task(uploadFilesTask, {
    bucket,
    projectRoot
  });

  completedTasks.push({
    task: 3,
    title: 'Upload Files to S3',
    success: task3Result.success,
    details: task3Result
  });

  if (!task3Result.success) {
    await ctx.breakpoint({
      question: `Task 3 (Upload Files to S3) failed. Error: ${task3Result.error}. How should we proceed?`,
      title: 'Task 3 Failed'
    });
    return { success: false, completedTasks, error: 'Task 3 failed' };
  }

  // ============================================================================
  // TASK 4: Configure S3 Bucket Policy
  // ============================================================================

  const task4Result = await ctx.task(configureBucketPolicyTask, {
    bucket,
    projectRoot
  });

  completedTasks.push({
    task: 4,
    title: 'Configure S3 Bucket Policy',
    success: task4Result.success,
    details: task4Result
  });

  if (!task4Result.success) {
    await ctx.breakpoint({
      question: `Task 4 (Configure S3 Bucket Policy) failed. Error: ${task4Result.error}. How should we proceed?`,
      title: 'Task 4 Failed'
    });
    return { success: false, completedTasks, error: 'Task 4 failed' };
  }

  // ============================================================================
  // TASK 5: Configure CORS
  // ============================================================================

  const task5Result = await ctx.task(configureCorsTask, {
    bucket,
    corsDomain,
    projectRoot
  });

  completedTasks.push({
    task: 5,
    title: 'Configure CORS',
    success: task5Result.success,
    details: task5Result
  });

  if (!task5Result.success) {
    await ctx.breakpoint({
      question: `Task 5 (Configure CORS) failed. Error: ${task5Result.error}. How should we proceed?`,
      title: 'Task 5 Failed'
    });
    return { success: false, completedTasks, error: 'Task 5 failed' };
  }

  // ============================================================================
  // TASK 6: Verify CloudFront Configuration
  // ============================================================================

  const task6Result = await ctx.task(verifyCloudFrontTask, {
    cloudfrontDistId
  });

  completedTasks.push({
    task: 6,
    title: 'Verify CloudFront Configuration',
    success: task6Result.success,
    details: task6Result
  });

  cloudFrontDomain = task6Result.domain || '';

  if (!task6Result.success) {
    await ctx.breakpoint({
      question: `Task 6 (Verify CloudFront) failed. Error: ${task6Result.error}. How should we proceed?`,
      title: 'Task 6 Failed'
    });
    return { success: false, completedTasks, cloudFrontDomain, error: 'Task 6 failed' };
  }

  // ============================================================================
  // TASK 7: Invalidate CloudFront Cache
  // ============================================================================

  const task7Result = await ctx.task(invalidateCacheTask, {
    cloudfrontDistId
  });

  completedTasks.push({
    task: 7,
    title: 'Invalidate CloudFront Cache',
    success: task7Result.success,
    details: task7Result
  });

  if (!task7Result.success) {
    await ctx.breakpoint({
      question: `Task 7 (Invalidate CloudFront Cache) failed. Error: ${task7Result.error}. How should we proceed?`,
      title: 'Task 7 Failed'
    });
    return { success: false, completedTasks, cloudFrontDomain, error: 'Task 7 failed' };
  }

  // ============================================================================
  // TASK 9: End-to-End Testing
  // ============================================================================

  const task9Result = await ctx.task(endToEndTestTask, {
    cloudFrontDomain,
    corsDomain
  });

  completedTasks.push({
    task: 9,
    title: 'End-to-End Testing',
    success: task9Result.success,
    details: task9Result
  });

  // Final breakpoint for review
  await ctx.breakpoint({
    question: `Phase 1 completed. ${completedTasks.filter(t => t.success).length}/${completedTasks.length} tasks succeeded. CloudFront domain: ${cloudFrontDomain}. Approve to finalize?`,
    title: 'Phase 1 Complete - Review'
  });

  return {
    success: completedTasks.every(t => t.success),
    completedTasks,
    cloudFrontDomain,
    summary: {
      total: completedTasks.length,
      succeeded: completedTasks.filter(t => t.success).length,
      failed: completedTasks.filter(t => !t.success).length
    },
    metadata: {
      processId: 'primo-maps/phase1-infrastructure',
      timestamp: ctx.now()
    }
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

/**
 * Task 1: Organize Local Files
 */
export const organizeFilesTask = defineTask('organize-files', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Organize local files',
  description: 'Create folder structure and rename/move files',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer',
      task: 'Organize local files for S3 upload',
      context: {
        projectRoot: args.projectRoot,
        instructions: [
          'Create directories: maps/ and data/',
          'Move and rename SVG files to maps/ folder with lowercase names (floor_0.svg, floor_1.svg, floor_2.svg)',
          'Move and rename CSV file to data/mapping.csv',
          'Verify all files are in place'
        ]
      },
      instructions: [
        'Execute the file organization commands',
        'Handle any file not found errors gracefully',
        'Report which files were moved/renamed',
        'Verify the final structure'
      ],
      outputFormat: 'JSON with success (boolean), filesOrganized (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesOrganized: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['infrastructure', 'local-files']
}));

/**
 * Task 2: Create S3 Folder Structure
 */
export const createS3FoldersTask = defineTask('create-s3-folders', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create S3 folder structure',
  description: 'Create folder placeholders in S3 bucket',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer',
      task: 'Create S3 folder structure',
      context: {
        bucket: args.bucket,
        folders: ['data/', 'maps/', 'versions/', 'versions/data/', 'versions/maps/', 'admin/']
      },
      instructions: [
        'Use AWS CLI to create folder placeholders in S3',
        'Command: aws s3api put-object --bucket BUCKET --key FOLDER/',
        'Create all required folders',
        'Verify folders were created'
      ],
      outputFormat: 'JSON with success (boolean), foldersCreated (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        foldersCreated: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['infrastructure', 's3']
}));

/**
 * Task 3: Upload Files to S3
 */
export const uploadFilesTask = defineTask('upload-files', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Upload files to S3',
  description: 'Upload CSV and SVG files to S3 bucket',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer',
      task: 'Upload files to S3',
      context: {
        bucket: args.bucket,
        projectRoot: args.projectRoot,
        files: {
          csv: { source: 'data/mapping.csv', dest: 'data/mapping.csv', contentType: 'text/csv; charset=utf-8' },
          svgs: { source: 'maps/', dest: 'maps/', contentType: 'image/svg+xml' }
        }
      },
      instructions: [
        'Upload CSV with correct content-type',
        'Upload SVG files with correct content-type',
        'Use aws s3 cp for single files and aws s3 sync for directories',
        'Verify uploads by listing the bucket contents'
      ],
      outputFormat: 'JSON with success (boolean), filesUploaded (array), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesUploaded: { type: 'array', items: { type: 'string' } },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['infrastructure', 's3', 'upload']
}));

/**
 * Task 4: Configure S3 Bucket Policy
 */
export const configureBucketPolicyTask = defineTask('configure-bucket-policy', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Configure S3 bucket policy',
  description: 'Set up public read access for data/ and maps/ folders',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer',
      task: 'Configure S3 bucket policy for public read access',
      context: {
        bucket: args.bucket,
        projectRoot: args.projectRoot,
        policy: {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'PublicReadData',
              Effect: 'Allow',
              Principal: '*',
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${args.bucket}/data/*`
            },
            {
              Sid: 'PublicReadMaps',
              Effect: 'Allow',
              Principal: '*',
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${args.bucket}/maps/*`
            }
          ]
        }
      },
      instructions: [
        'Create bucket-policy.json file with the policy',
        'Apply the policy using: aws s3api put-bucket-policy --bucket BUCKET --policy file://bucket-policy.json',
        'Verify policy was applied successfully'
      ],
      outputFormat: 'JSON with success (boolean), policyApplied (boolean), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        policyApplied: { type: 'boolean' },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['infrastructure', 's3', 'security']
}));

/**
 * Task 5: Configure CORS
 */
export const configureCorsTask = defineTask('configure-cors', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Configure CORS',
  description: 'Set up CORS for Primo NDE Angular component access',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer',
      task: 'Configure CORS on S3 bucket',
      context: {
        bucket: args.bucket,
        projectRoot: args.projectRoot,
        corsConfig: {
          CORSRules: [
            {
              AllowedOrigins: [
                `https://${args.corsDomain}`,
                'http://localhost:4200'
              ],
              AllowedMethods: ['GET', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag', 'Content-Length'],
              MaxAgeSeconds: 3600
            }
          ]
        }
      },
      instructions: [
        'Create cors-config.json file with the CORS configuration',
        'Apply CORS using: aws s3api put-bucket-cors --bucket BUCKET --cors-configuration file://cors-config.json',
        'Verify CORS was applied successfully'
      ],
      outputFormat: 'JSON with success (boolean), corsApplied (boolean), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        corsApplied: { type: 'boolean' },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['infrastructure', 's3', 'cors']
}));

/**
 * Task 6: Verify CloudFront Configuration
 */
export const verifyCloudFrontTask = defineTask('verify-cloudfront', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Verify CloudFront configuration',
  description: 'Get CloudFront domain and test file access',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer',
      task: 'Verify CloudFront is correctly configured',
      context: {
        cloudfrontDistId: args.cloudfrontDistId
      },
      instructions: [
        'Get CloudFront domain using: aws cloudfront get-distribution --id DIST_ID --query "Distribution.DomainName" --output text',
        'Test file access via CloudFront using curl',
        'Verify CSV and SVG files are accessible',
        'Return the CloudFront domain'
      ],
      outputFormat: 'JSON with success (boolean), domain (string), testResults (object), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        domain: { type: 'string' },
        testResults: { type: 'object' },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['infrastructure', 'cloudfront', 'verification']
}));

/**
 * Task 7: Invalidate CloudFront Cache
 */
export const invalidateCacheTask = defineTask('invalidate-cache', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Invalidate CloudFront cache',
  description: 'Create cache invalidation for fresh content',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer',
      task: 'Invalidate CloudFront cache',
      context: {
        cloudfrontDistId: args.cloudfrontDistId,
        paths: ['/data/*', '/maps/*']
      },
      instructions: [
        'Create cache invalidation using: aws cloudfront create-invalidation --distribution-id DIST_ID --paths "/data/*" "/maps/*"',
        'Capture the invalidation ID from the response',
        'Report the invalidation status'
      ],
      outputFormat: 'JSON with success (boolean), invalidationId (string), status (string), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        invalidationId: { type: 'string' },
        status: { type: 'string' },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  },

  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },

  labels: ['infrastructure', 'cloudfront', 'cache']
}));

/**
 * Task 9: End-to-End Testing
 */
export const endToEndTestTask = defineTask('e2e-test', (args, taskCtx) => ({
  kind: 'agent',
  title: 'End-to-End Testing',
  description: 'Verify files are accessible and CORS works',

  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer',
      task: 'Perform end-to-end testing of the infrastructure',
      context: {
        cloudFrontDomain: args.cloudFrontDomain,
        corsDomain: args.corsDomain
      },
      instructions: [
        'Test CSV file access via CloudFront URL',
        'Test SVG file access via CloudFront URL',
        'Test CORS headers by including Origin header in requests',
        'Verify all files return HTTP 200',
        'Verify CORS headers are present in responses'
      ],
      outputFormat: 'JSON with success (boolean), tests (array of test results), errors (array if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        tests: {
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

  labels: ['testing', 'e2e', 'verification']
}));
