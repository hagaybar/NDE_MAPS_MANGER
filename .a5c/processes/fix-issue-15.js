/**
 * @process fix-issue-15
 * @description Implement issue #15 (downloadable errors report)
 *              per docs/superpowers/plans/2026-05-12-issue-15-errors-report-export.md
 *              Strict plan adherence: each task delegates to a fresh agent that follows ONLY
 *              its assigned plan task. Discrepancies halt the run.
 * @inputs { projectRoot: string, planPath: string, repoSlug: string }
 * @outputs { prUrl: string }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const STRICT_INSTRUCTIONS = [
  'Read the plan file fully, then locate ONLY the section for your assigned plan task number.',
  'Execute every sub-step (e.g. Step N.1, N.2, ...) in the order written.',
  'For every "Run: <command>" sub-step, execute that command via Bash.',
  'For every "Expected: <output>" assertion, verify the actual output matches in spirit (file paths, exit status, key phrases). Exact byte-for-byte match is not required, but the assertion must hold.',
  'For every code block to be added or modified, use Edit/Write to make the EXACT change shown in the plan. Do not paraphrase. Do not add or remove anything not in the plan.',
  'If any expected output does not match reality, STOP and return { "ok": false, "discrepancy": "<short>", "step": "<which step>" }.',
  'On full success, return { "ok": true, "summary": "<one-line>", "commitSha": "<sha if a commit was made, else null>" }.',
  'Use Bash, Read, Edit, Write tools as needed. Always cd to the project root or use absolute paths.',
  'Do NOT push to remote, do NOT open a PR, do NOT merge unless the plan task explicitly calls for it.',
];

function buildAgentTask(taskNumber, taskTitle) {
  return defineTask(`issue-15-task-${taskNumber}`, (args, taskCtx) => ({
    kind: 'agent',
    title: `Issue #15 Task ${taskNumber}: ${taskTitle}`,
    agent: {
      name: 'general-purpose',
      prompt: {
        role: 'Implementation worker — strict plan execution',
        task: `Execute Task ${taskNumber} of the plan at ${args.planPath}, in the project at ${args.projectRoot}. Follow the plan verbatim. Halt-on-discrepancy.`,
        context: {
          projectRoot: args.projectRoot,
          planPath: args.planPath,
          taskNumber,
          repoSlug: args.repoSlug,
        },
        instructions: STRICT_INSTRUCTIONS,
        outputFormat: 'JSON',
      },
      outputSchema: {
        type: 'object',
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
          discrepancy: { type: 'string' },
          step: { type: 'string' },
          commitSha: { type: ['string', 'null'] },
          prUrl: { type: 'string' },
        },
      },
    },
    io: {
      inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
      outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
    },
  }));
}

const taskZero = buildAgentTask(0, 'Setup branch and rollback tag');
const taskOne = buildAgentTask(1, 'Write failing Jest unit tests for report-export.js');
const taskTwo = buildAgentTask(2, 'Create report-export.js (make Task 1 tests pass)');
const taskThree = buildAgentTask(3, 'Add i18n fallbacks and click handler in errors-dashboard.js');
const taskFour = buildAgentTask(4, 'Add download button to renderSummaryView');
const taskFive = buildAgentTask(5, 'Add download button to renderCategoryView');
const taskSix = buildAgentTask(6, 'Write Playwright e2e for the export flow');
const taskSeven = buildAgentTask(7, 'Run the full test suites — verify no regression');
const taskEight = buildAgentTask(8, 'Push the branch and open the PR');

export async function process(inputs, ctx) {
  const { projectRoot, planPath, repoSlug } = inputs;
  ctx.log('info', 'Starting issue #15', { projectRoot, planPath, repoSlug });
  const args = { projectRoot, planPath, repoSlug };

  const tasks = [
    [0, taskZero], [1, taskOne], [2, taskTwo], [3, taskThree],
    [4, taskFour], [5, taskFive], [6, taskSix], [7, taskSeven],
    [8, taskEight],
  ];
  const summaries = {};
  let prUrl = null;

  for (const [n, taskDef] of tasks) {
    const result = await ctx.task(taskDef, args);
    if (result && result.ok === false) {
      throw new Error(`Task ${n} failed: ${result.discrepancy || 'unknown'}`);
    }
    summaries[`t${n}`] = result && result.summary;
    if (result && result.prUrl) prUrl = result.prUrl;
  }

  return { success: true, prUrl, summaries };
}
