/**
 * @process feat-sot-foundation
 * @description Implement SoT bundle-invariant foundation (Plan A) per
 *              docs/superpowers/plans/2026-05-13-sot-bundle-invariant-foundation.md
 *              Strict plan adherence: each task delegates to a fresh agent that follows ONLY
 *              its assigned plan task. Discrepancies halt the run. No push at the end.
 * @inputs { projectRoot: string, planPath: string }
 * @outputs { success: boolean, summaries: object }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const STRICT_INSTRUCTIONS = [
  'Read the plan file fully, then locate ONLY the section for your assigned plan task number.',
  'Execute every sub-step (e.g. Step N.1, N.2, ...) in the order written.',
  'For every "Run: <command>" sub-step, execute that command via Bash.',
  'For every "Expected: <output>" assertion, verify the actual output matches in spirit (file paths, exit status, key phrases). Exact byte-for-byte match is not required, but the assertion must hold.',
  'For every code block to be added or modified, use Edit/Write to make the EXACT change shown in the plan. Do not paraphrase. Do not add or remove anything not in the plan.',
  'When the plan asks you to find a function/variable name in existing code that may differ from what is shown (e.g., "the table-render function — likely called renderRows or similar"), grep the file to find the actual name and use it. Do not invent names.',
  'If any expected output does not match reality, STOP and return { "ok": false, "discrepancy": "<short>", "step": "<which step>" }.',
  'On full success, return { "ok": true, "summary": "<one-line>", "commitSha": "<sha if a commit was made, else null>" }.',
  'Use Bash, Read, Edit, Write tools as needed. Always cd to the project root or use absolute paths.',
  'IMPORTANT: Do NOT push to remote. Do NOT open a PR. The branch is already feature/sot-bundle-invariant-foundation and must stay local until the user approves push.',
  'IMPORTANT: Do NOT set BUNDLE_INVARIANT_ENABLED=true anywhere. The plan keeps it at default (false). Stage 4 cutover is in Plan B.',
  'IMPORTANT: The existing test admin/__tests__/svg-loader.test.js (cache:\'no-cache\' regression guard) must keep passing throughout. If your changes break it, STOP.',
];

function buildAgentTask(taskNumber, taskTitle) {
  return defineTask(`sot-foundation-task-${taskNumber}`, (args, taskCtx) => ({
    kind: 'agent',
    title: `SoT Foundation Task ${taskNumber}: ${taskTitle}`,
    agent: {
      name: 'general-purpose',
      prompt: {
        role: 'Implementation worker — strict plan execution',
        task: `Execute Task ${taskNumber} of the plan at ${args.planPath}, in the project at ${args.projectRoot}. Follow the plan verbatim. Halt-on-discrepancy.`,
        context: {
          projectRoot: args.projectRoot,
          planPath: args.planPath,
          taskNumber,
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
        },
      },
    },
    io: {
      inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
      outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
    },
  }));
}

const taskOne      = buildAgentTask(1,  'Create the SVG-shelves fixture set');
const taskTwo      = buildAgentTask(2,  'Implement lambda/shared/svg-shelves.mjs');
const taskThree    = buildAgentTask(3,  'Implement admin/services/svg-shelves.js (client mirror)');
const taskFour     = buildAgentTask(4,  'Create the bundle fixtures');
const taskFive     = buildAgentTask(5,  'Implement lambda/shared/validateBundle.mjs');
const taskSix      = buildAgentTask(6,  'Implement admin/services/bundle-validator.js');
const taskSeven    = buildAgentTask(7,  'Add getBrokenRefs helper to data-model.js');
const taskEight    = buildAgentTask(8,  'Lambda SVG fetcher with warm-container cache');
const taskNine     = buildAgentTask(9,  'Extend putCsv.mjs with bundle validation');
const taskTen      = buildAgentTask(10, 'Add Broken refs filter toggle to CSV Editor');
const taskEleven   = buildAgentTask(11, 'Filter table rows when the toggle is active');
const taskTwelve   = buildAgentTask(12, 'Inline Rename dropdown per broken row');
const taskThirteen = buildAgentTask(13, 'Delete row action with confirm dialog');
const taskFourteen = buildAgentTask(14, 'E2E test — migration cleanup happy path');
const taskFifteen  = buildAgentTask(15, 'Update AWS-INFRASTRUCTURE.md and CLAUDE.md');
const taskSixteen  = buildAgentTask(16, 'Final integration check — all tests green');

export async function process(inputs, ctx) {
  const { projectRoot, planPath } = inputs;
  ctx.log('info', 'Starting SoT bundle-invariant foundation', { projectRoot, planPath });
  const args = { projectRoot, planPath };

  const tasks = [
    [1,  taskOne],
    [2,  taskTwo],
    [3,  taskThree],
    [4,  taskFour],
    [5,  taskFive],
    [6,  taskSix],
    [7,  taskSeven],
    [8,  taskEight],
    [9,  taskNine],
    [10, taskTen],
    [11, taskEleven],
    [12, taskTwelve],
    [13, taskThirteen],
    [14, taskFourteen],
    [15, taskFifteen],
    [16, taskSixteen],
  ];
  const summaries = {};

  for (const [n, taskDef] of tasks) {
    const result = await ctx.task(taskDef, args);
    if (result && result.ok === false) {
      throw new Error(`Task ${n} failed at step "${result.step || '?'}": ${result.discrepancy || 'unknown'}`);
    }
    summaries[`t${n}`] = (result && result.summary) || null;
  }

  return { success: true, summaries };
}
