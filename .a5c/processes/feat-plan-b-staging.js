/**
 * @process feat-plan-b-staging
 * @description Implement SoT staging flow (Plan B) per
 *              docs/superpowers/plans/2026-05-13-sot-staging-flow.md
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
  'IMPORTANT: Do NOT push to remote. Do NOT open a PR. The branch is already feat/plan-b-staging and must stay local until the user approves push.',
  'IMPORTANT: Task 15 (BUNDLE_INVARIANT_ENABLED flag flip) is ALREADY DONE in production (Plan A flipped it on 2026-05-17). Before running any AWS command for Task 15, run `aws lambda get-function-configuration --function-name primo-maps-putCsv | jq -r ".Environment.Variables.BUNDLE_INVARIANT_ENABLED"`. If the result is "true", record the no-op and skip the destructive AWS update step — return { "ok": true, "summary": "Task 15 already done in production; verified true via get-function-configuration; no AWS write performed." }. If it is anything else, STOP and return ok:false so the user can decide.',
  'IMPORTANT: Any destructive AWS operation (lambda update, S3 lifecycle write, API Gateway changes, CloudFront invalidation) is on a production system at TAU Central Library. Run the read/verify command first. If the plan calls for a write, attempt it; if it fails with a permissions or token error, STOP with ok:false and surface the error verbatim — do NOT auto-retry or invent workarounds.',
  'IMPORTANT: CSV parser parity rule (from CLAUDE.md). If your task adds or modifies any CSV-parsing code, it MUST stay behaviorally equivalent to parseCSVLine in admin/components/csv-editor.js and parseCsvLine in lambda/range-validation.mjs (double-quoted fields with internal commas and "" escapes). Drift between them = silent validation skew.',
  'IMPORTANT: Floor SVG + mapping.csv fetches must use `{ cache: "no-cache" }` (CLAUDE.md sticky rule). If your task adds a new fetch of either resource, apply the same option. If existing fetches in files you edit already have it, do not remove it.',
  'IMPORTANT: The shared validateBundle + svg-shelves parity tests from Plan A must keep passing throughout. If your changes break lambda/__tests__/shared/*.test.mjs or admin/__tests__/*.test.js, STOP.',
];

function buildAgentTask(taskNumber, taskTitle) {
  return defineTask(`plan-b-staging-task-${taskNumber}`, (args, taskCtx) => ({
    kind: 'agent',
    title: `Plan B Staging Task ${taskNumber}: ${taskTitle}`,
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

const taskOne      = buildAgentTask(1,  'Shared staging-meta helpers (lock + status file)');
const taskTwo      = buildAgentTask(2,  'uploadStagingSvg Lambda');
const taskThree    = buildAgentTask(3,  'validateStaging Lambda');
const taskFour     = buildAgentTask(4,  'applyReconcileToStaging Lambda');
const taskFive     = buildAgentTask(5,  'promoteStaging Lambda');
const taskSix      = buildAgentTask(6,  'clearStaging Lambda');
const taskSeven    = buildAgentTask(7,  'getStagingStatus Lambda');
const taskEight    = buildAgentTask(8,  'S3 lifecycle policy for staging cleanup');
const taskNine     = buildAgentTask(9,  'staging-panel.js admin component');
const taskTen      = buildAgentTask(10, 'reconcile-wizard.js admin component');
const taskEleven   = buildAgentTask(11, 'Wire SVG Manager to the staging flow (behind feature toggle)');
const taskTwelve   = buildAgentTask(12, 'E2E test — staging happy path');
const taskThirteen = buildAgentTask(13, 'E2E test — staging lock conflict');
const taskFourteen = buildAgentTask(14, 'API Gateway routes for the staging endpoints');
const taskFifteen  = buildAgentTask(15, 'Flip BUNDLE_INVARIANT_ENABLED to true (cutover) — ALREADY DONE; verify-and-skip');
const taskSixteen  = buildAgentTask(16, 'Flip USE_STAGING_FLOW to true in admin frontend (cutover)');

export async function process(inputs, ctx) {
  const { projectRoot, planPath } = inputs;
  ctx.log('info', 'Starting SoT staging flow (Plan B)', { projectRoot, planPath });
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
