/**
 * @process feat-issue-14-phase-2a
 * @description Implement sub-phase 2a of issue #14 (Map Editor orphan repair)
 *              following the explicit task-by-task plan at
 *              docs/superpowers/plans/2026-05-10-issue-14-phase-2a-orphan-repair.md
 *              Strict plan adherence: each task delegates to a fresh agent that follows ONLY
 *              its assigned plan task. Discrepancies halt the run; they do not improvise.
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
  'If any expected output does not match reality, or any sub-step cannot be completed as written, STOP and return { "ok": false, "discrepancy": "<short description>", "step": "<which step>" }.',
  'On full success, return { "ok": true, "summary": "<one-line summary of what was done>", "commitSha": "<sha if a commit was made, else null>" }.',
  'Use Bash, Read, Edit, Write tools as needed. Always cd to the project root or use absolute paths.',
  'Do NOT push to remote, do NOT open a PR, do NOT merge. The plan handles those in its own task (Task 11).',
];

function buildAgentTask(taskNumber, taskTitle) {
  return defineTask(`phase2a-task-${taskNumber}`, (args, taskCtx) => ({
    kind: 'agent',
    title: `Phase 2a Task ${taskNumber}: ${taskTitle}`,
    agent: {
      name: 'general-purpose',
      prompt: {
        role: 'Implementation worker — strict plan execution, TDD discipline',
        task: `Execute Task ${taskNumber} of the implementation plan at ${args.planPath}, in the project at ${args.projectRoot}. Follow the plan's sub-steps verbatim. Halt-on-discrepancy.`,
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

const taskZero = buildAgentTask(0, 'Set up branch and rollback tag');
const taskOne = buildAgentTask(1, 'Add new i18n keys (en + he)');
const taskTwo = buildAgentTask(2, 'Create orphan-fixtures test fixture');
const taskThree = buildAgentTask(3, 'Implement orphan-deriver.js (TDD)');
const taskFour = buildAgentTask(4, 'Add intent parameter to reassign-mode.js');
const taskFive = buildAgentTask(5, 'Update map-editor.js move callsite');
const taskSix = buildAgentTask(6, 'Implement orphan-card.js (TDD)');
const taskSeven = buildAgentTask(7, 'Implement orphan-panel.js (TDD)');
const taskEight = buildAgentTask(8, 'Wire orphan panel into map-editor.js');
const taskNine = buildAgentTask(9, 'Add CSS for orphan panel and cards');
const taskTen = buildAgentTask(10, 'Add Playwright E2E test');
const taskEleven = buildAgentTask(11, 'Push branch and open PR (no merge)');

export async function process(inputs, ctx) {
  const { projectRoot, planPath, repoSlug } = inputs;

  ctx.log('info', 'Starting phase 2a implementation', { projectRoot, planPath, repoSlug });

  const args = { projectRoot, planPath, repoSlug };

  const tasks = [
    [0, taskZero], [1, taskOne], [2, taskTwo], [3, taskThree], [4, taskFour], [5, taskFive],
    [6, taskSix], [7, taskSeven], [8, taskEight], [9, taskNine], [10, taskTen], [11, taskEleven],
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

  return {
    success: true,
    prUrl,
    summaries,
  };
}
