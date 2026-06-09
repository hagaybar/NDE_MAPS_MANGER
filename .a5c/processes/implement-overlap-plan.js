/**
 * @process primo-maps/implement-overlap-plan
 * @description Execute the root-cause-overlap implementation plan task-by-task with strict TDD and a full-admin-suite gate after each task. Sequential (each task depends on the previous). Client-side admin SPA only; never weaken a test; no deploy (owner QA the .xlsx in a real browser first).
 * @inputs { planPath, branch }
 * @outputs { results, summary }
 * @agent general-purpose
 */
import { defineTask } from '@a5c-ai/babysitter-sdk';

const REPO = '/home/hagaybar/projects/primo_maps';

const TASKS = [
  { num: 1, title: 'Cluster engine (pure)' },
  { num: 2, title: 'Excel workbook model (pure)' },
  { num: 3, title: 'Vendor ExcelJS + writeWorkbook adapter' },
  { num: 4, title: 'Render clusters on screen (collapsible groups + summary + Fix)' },
  { num: 5, title: 'Print report button + print stylesheet, and switch export to .xlsx' },
  { num: 6, title: 'i18n JSON + full suite + verification' },
];

const CONSTRAINTS = [
  'Follow the named plan task EXACTLY — it contains complete code, tests, and exact commands. Do not invent a different structure.',
  'Strict TDD where the task has a test: write the failing test, run it and OBSERVE red, implement minimal code, run and OBSERVE green. WORKFLOW HR1/HR2: never weaken/skip/delete a test to make it pass.',
  '100% gate: after the task, the FULL admin suite (cd admin && npm test) MUST be fully green.',
  'Client-side admin/ only. Do NOT deploy, run redeploy.sh, or touch Lambda/S3/CloudFront. The owner will QA the .xlsx output in a real browser before any deploy.',
  'Stay on the given branch. Commit exactly as the plan task commit step specifies; end commit messages with the trailer: Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>',
  'If the plan code needs a small real-world adjustment to actually pass (an import path, a DOM selector, an ExcelJS API detail), make the minimal correct fix and report it in "adjustments". NEVER fake a green or claim tests pass without running them.',
];

export async function process(inputs, ctx) {
  const planPath = (inputs && inputs.planPath) || 'docs/superpowers/plans/2026-06-02-errors-dashboard-root-cause-overlaps.md';
  const branch = (inputs && inputs.branch) || 'feat/dashboard-root-cause-overlaps';
  const results = [];

  for (const tk of TASKS) {
    const impl = await ctx.task(implTask, { num: tk.num, title: tk.title, planPath, branch });
    if (!impl || !impl.done) {
      results.push({ num: tk.num, status: 'impl-incomplete', reason: (impl && impl.reason) || 'agent did not finish the task', detail: impl && impl.summary });
      break; // sequential: later tasks build on this one — stop and surface
    }
    const gate = await ctx.task(gateTask, { num: tk.num });
    const passed = !!gate && (gate.exitCode === 0 || gate.passed === true);
    results.push({
      num: tk.num,
      status: passed ? 'done' : 'gate-failed',
      sha: impl.sha,
      suiteGreen: !!impl.suiteGreen,
      adjustments: impl.adjustments || '',
      gate: gate && (gate.summary || gate.stdoutTail || ''),
    });
    if (!passed) break; // red gate → stop; do not stack dependent tasks on a broken base
  }

  const completed = results.filter(r => r.status === 'done').length;
  const blocked = results.find(r => r.status !== 'done');
  const summary =
    `Implemented ${completed}/${TASKS.length} plan tasks on branch ${branch}. ` +
    results.map(r => `Task ${r.num}: ${r.status}${r.sha ? ' (' + r.sha + ')' : ''}`).join('; ') +
    (blocked ? `. STOPPED at Task ${blocked.num} (${blocked.status}) — needs attention.` : '. All tasks green.') +
    ' No deploy performed (owner QA of the .xlsx in a real browser pending).';

  return { results, summary, metadata: { processId: 'primo-maps/implement-overlap-plan', timestamp: ctx.now() } };
}

export const implTask = defineTask('execute-plan-task', (args, taskCtx) => ({
  kind: 'agent',
  title: `Execute plan Task ${args.num}: ${args.title}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior engineer executing ONE task of a pre-written, complete TDD implementation plan, exactly as written',
      task: `In ${REPO}, execute Task ${args.num} ("${args.title}") of the plan at ${args.planPath}. The plan task already contains complete code, test code, and exact commands — follow it step by step; do not redesign it.`,
      context: { repo: REPO, planPath: args.planPath, taskNumber: args.num, branch: args.branch, constraints: CONSTRAINTS },
      instructions: [
        `cd ${REPO}. Ensure you are on branch ${args.branch} (git checkout ${args.branch}); do not create a new branch.`,
        `Open ${args.planPath} and read the "### Task ${args.num}" section in full.`,
        'Execute its steps in order. Where the task has a failing test: create/edit the test exactly as written, run it with the exact command shown and OBSERVE it RED, then add the implementation code and OBSERVE it GREEN.',
        'Then run the FULL admin suite: cd admin && npm test — it MUST be fully green. If something is red, fix YOUR code (never weaken a test) until green.',
        `Commit exactly as the task's commit step says (end the message with the Co-Authored-By trailer). Stay on ${args.branch}. Do NOT deploy or run redeploy.sh.`,
        'TASK 6 ONLY: perform steps 1 (i18n JSON), 2 (full suite), and 4 (commit). SKIP step 3 (manual real-browser verification) — that is the owner’s QA, you cannot do it.',
        'TASK 3 ONLY: the vendored ExcelJS file is large; follow the curl + Node sanity check; resolve the ESM-vs-UMD load note exactly as the plan instructs based on the Node check result.',
        'Capture the commit short SHA (git rev-parse --short HEAD) for "sha". Return ONLY the JSON object.',
      ],
      outputFormat: 'JSON: { num, done (bool), suiteGreen (bool), sha, summary, adjustments, reason }',
    },
    outputSchema: {
      type: 'object',
      required: ['num', 'done', 'summary'],
      properties: {
        num: { type: 'number' }, done: { type: 'boolean' }, suiteGreen: { type: 'boolean' },
        sha: { type: 'string' }, summary: { type: 'string' }, adjustments: { type: 'string' }, reason: { type: 'string' },
      },
    },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['impl', `task-${args.num}`],
}));

export const gateTask = defineTask('full-suite-gate', (args, taskCtx) => ({
  kind: 'shell',
  title: `100% gate: full admin suite after Task ${args.num}`,
  shell: { command: `cd ${REPO}/admin && npm test` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['gate', `task-${args.num}`],
}));
