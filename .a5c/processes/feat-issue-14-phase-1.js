/**
 * @process feat-issue-14-phase-1
 * @description Implement phase 1 of issue #14 (svgCode resolution validation, error code E006)
 *              following the explicit task-by-task plan at
 *              docs/superpowers/plans/2026-05-10-issue-14-phase-1-svgcode-validation.md
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
  'Do NOT push to remote, do NOT open a PR, do NOT merge. The plan handles those in its own task (Task 5).',
];

function buildAgentTask(taskNumber, taskTitle) {
  return defineTask(`phase1-task-${taskNumber}`, (args, taskCtx) => ({
    kind: 'agent',
    title: `Phase 1 Task ${taskNumber}: ${taskTitle}`,
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

const taskZeroSetupBranch = buildAgentTask(0, 'Set up branch and rollback tag');
const taskOneFailingTests = buildAgentTask(1, 'Add E006 unit tests (failing)');
const taskTwoImplementation = buildAgentTask(2, 'Implement E006 in validateRow');
const taskThreeWireInit = buildAgentTask(3, 'Preload SVG cache at admin init');
const taskFourFixturesSmoke = buildAgentTask(4, 'Smoke test against fixture data');
const taskFivePushAndPR = buildAgentTask(5, 'Push branch and open PR (no merge)');

export async function process(inputs, ctx) {
  const { projectRoot, planPath, repoSlug } = inputs;

  ctx.log('info', 'Starting phase 1 implementation', { projectRoot, planPath, repoSlug });

  const args = { projectRoot, planPath, repoSlug };

  const t0 = await ctx.task(taskZeroSetupBranch, args);
  if (t0 && t0.ok === false) {
    throw new Error(`Task 0 failed: ${t0.discrepancy || 'unknown'}`);
  }

  const t1 = await ctx.task(taskOneFailingTests, args);
  if (t1 && t1.ok === false) {
    throw new Error(`Task 1 failed: ${t1.discrepancy || 'unknown'}`);
  }

  const t2 = await ctx.task(taskTwoImplementation, args);
  if (t2 && t2.ok === false) {
    throw new Error(`Task 2 failed: ${t2.discrepancy || 'unknown'}`);
  }

  const t3 = await ctx.task(taskThreeWireInit, args);
  if (t3 && t3.ok === false) {
    throw new Error(`Task 3 failed: ${t3.discrepancy || 'unknown'}`);
  }

  const t4 = await ctx.task(taskFourFixturesSmoke, args);
  if (t4 && t4.ok === false) {
    throw new Error(`Task 4 failed: ${t4.discrepancy || 'unknown'}`);
  }

  const t5 = await ctx.task(taskFivePushAndPR, args);
  if (t5 && t5.ok === false) {
    throw new Error(`Task 5 failed: ${t5.discrepancy || 'unknown'}`);
  }

  return {
    success: true,
    prUrl: t5 && t5.prUrl ? t5.prUrl : null,
    summaries: {
      t0: t0 && t0.summary,
      t1: t1 && t1.summary,
      t2: t2 && t2.summary,
      t3: t3 && t3.summary,
      t4: t4 && t4.summary,
      t5: t5 && t5.summary,
    },
  };
}
