/**
 * @process fix-issue-24
 * @description Implement the fix for issue #24 (svg-parser module duplication)
 *              following the explicit task-by-task plan at
 *              docs/superpowers/plans/2026-05-12-issue-24-svg-parser-module-duplication-fix.md
 *              Strict plan adherence: each task delegates to a fresh agent that
 *              follows ONLY its assigned plan task. Discrepancies halt the run.
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
  'Do NOT push to remote, do NOT open a PR, do NOT merge. The plan handles those in its own task (Task 4).',
];

function buildAgentTask(taskNumber, taskTitle) {
  return defineTask(`issue-24-task-${taskNumber}`, (args, taskCtx) => ({
    kind: 'agent',
    title: `Issue #24 Task ${taskNumber}: ${taskTitle}`,
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
const taskOne = buildAgentTask(1, 'Add regression-guard test (failing)');
const taskTwo = buildAgentTask(2, 'Rewrite 7 import paths');
const taskThree = buildAgentTask(3, 'Verify end-to-end behaviour unchanged');
const taskFour = buildAgentTask(4, 'Push branch and open PR (no merge)');

export async function process(inputs, ctx) {
  const { projectRoot, planPath, repoSlug } = inputs;
  ctx.log('info', 'Starting issue #24 fix', { projectRoot, planPath, repoSlug });
  const args = { projectRoot, planPath, repoSlug };

  const tasks = [[0, taskZero], [1, taskOne], [2, taskTwo], [3, taskThree], [4, taskFour]];
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
