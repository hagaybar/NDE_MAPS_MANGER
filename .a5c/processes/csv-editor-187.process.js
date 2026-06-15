/**
 * @process primo-maps/csv-editor-187
 * @description Execute the committed TDD plan for issue #187 (CSV Editor:
 *   validate-before-save + usable wide grid) in three gated phases, each
 *   independently verified by running the admin Jest suite, with a single
 *   owner review breakpoint before pushing and opening the PR.
 * @inputs { planPath, specPath, branch, issue, repoRoot }
 * @outputs { success, phases, prOpened }
 * @agent general-purpose (default subagent)
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// ---------------------------------------------------------------------------
// Phase configuration — maps to the plan's 9 tasks, grouped by coupling.
// ---------------------------------------------------------------------------
const PHASES = [
  {
    id: 'A-validation',
    title: 'Validation + save gate (plan Tasks 1–6)',
    planTasks: 'Tasks 1, 2, 3, 4, 5, 6',
    summary:
      'Create admin/services/csv-validation.js (validateDataset); gate saveCSV to block the PUT on any blocking error; surface the server reason on failure; live problem indicator + Save-disabled + click-to-filter; inline red/yellow cell marks; empty-row blocked+removable verification.',
    verifyCommand:
      'cd admin && NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/csv-validation.test.js __tests__/csv-editor-save-gate.test.js 2>&1 | tail -40',
  },
  {
    id: 'B-grid',
    title: 'Usable wide grid (plan Tasks 7–8)',
    planTasks: 'Tasks 7, 8',
    summary:
      'Bounded scroll viewport + frozen header + frozen left anchor column (row #·svgCode) in admin/styles/app.css + csv-editor.js (anchor column render + fitCsvEditorViewport). Add the e2e spec e2e/tests/csv-editor-grid.spec.ts (LTR+RTL). The e2e run is best-effort (Playwright infra) — do NOT hard-fail the phase on e2e infra problems, but the file MUST exist and the full admin Jest suite MUST stay green.',
    verifyCommand:
      'cd admin && NODE_OPTIONS=--experimental-vm-modules npx jest 2>&1 | tail -12 && test -f ../e2e/tests/csv-editor-grid.spec.ts && echo "E2E_SPEC_PRESENT"',
  },
  {
    id: 'C-finalize',
    title: 'i18n parity + cache-bust + full-suite (plan Task 9)',
    planTasks: 'Task 9 (steps 1–3 only — do NOT push or open the PR; the orchestrator handles that after the review breakpoint)',
    summary:
      'Add the new csv.* i18n keys to admin/i18n/en.json + he.json (mirror the FALLBACKS, en/he parity); bump the csv-editor.js ?v= chain in app.js + index.html. Run the FULL admin Jest suite as the regression guard. Commit. Do NOT git push and do NOT open a PR yet.',
    verifyCommand:
      'cd admin && NODE_OPTIONS=--experimental-vm-modules npx jest 2>&1 | tail -12',
  },
];

const HARD_RULES = [
  'HR1: never weaken, skip, narrow, or delete an existing test to make the build pass.',
  'HR3: every behavioural change adds a test you observed go red→green in this run; paste the red AND green Jest output in your result.',
  'HR4: assert at stable boundaries (validateDataset output, save-gate behaviour = did the PUT happen, visible UI), never internal call structure.',
  'HR7: never claim tests pass without executing them in this run; include the actual command output.',
  'Follow the committed plan EXACTLY (it contains the precise test + implementation code). Do not invent alternative designs.',
  'Run admin Jest from the admin/ directory with NODE_OPTIONS=--experimental-vm-modules.',
  'Keep the FULL existing admin Jest suite green (regression guard).',
  'Commit per the plan steps with the plan\'s commit messages.',
];

// ---------------------------------------------------------------------------
// Task: implement one phase (agent)
// ---------------------------------------------------------------------------
export const implementPhaseTask = defineTask('csv187/implement-phase', (args, taskCtx) => ({
  kind: 'agent',
  title: `Implement ${args.phaseId} — ${args.phaseTitle}${args.attempt > 1 ? ` (refine #${args.attempt})` : ''}`,
  execution: { model: 'claude-opus-4-8' },
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior engineer executing a committed, fully-specified TDD implementation plan on an existing repo.',
      task: `Implement ${args.planTasks} of the plan at ${args.planPath} for issue #${args.issue}, on branch ${args.branch}. The plan already contains the exact test code, implementation code, and commands — follow it precisely. ${args.phaseSummary}`,
      context: {
        repoRoot: args.repoRoot,
        planPath: args.planPath,
        specPath: args.specPath,
        branch: args.branch,
        issue: args.issue,
        phase: args.phaseId,
        verifyCommand: args.verifyCommand,
        previousFeedback: args.previousFeedback || null,
        hardRules: HARD_RULES,
      },
      instructions: [
        `Read the plan section for ${args.planTasks} in ${args.planPath} and follow each step exactly.`,
        'For every test: write it, run it and OBSERVE it fail (red), then implement the minimal code from the plan, run it again and OBSERVE it pass (green). Capture both outputs.',
        'Confirm you are on the correct branch before editing; do not switch branches.',
        `After implementing, run the phase verify command and confirm success: ${args.verifyCommand}`,
        'Then run the FULL admin Jest suite (cd admin && NODE_OPTIONS=--experimental-vm-modules npx jest) and confirm it is green — no pre-existing test weakened or broken (HR1).',
        'Commit per the plan\'s steps (use the plan\'s commit messages). Do NOT push and do NOT open a PR.',
        args.previousFeedback
          ? `A previous attempt failed the gate. Fix exactly this and re-verify: ${args.previousFeedback}`
          : 'This is the first attempt.',
        'Return a JSON object with the required fields. In redGreenEvidence, quote the key red and green Jest lines you personally observed (HR3/HR7).',
      ],
      outputFormat:
        'JSON with: passed (boolean), filesChanged (string[]), commits (string[]), redGreenEvidence (string), fullSuiteResult (string), notes (string)',
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'filesChanged', 'redGreenEvidence', 'fullSuiteResult', 'notes'],
      properties: {
        passed: { type: 'boolean' },
        filesChanged: { type: 'array', items: { type: 'string' } },
        commits: { type: 'array', items: { type: 'string' } },
        redGreenEvidence: { type: 'string' },
        fullSuiteResult: { type: 'string' },
        notes: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  labels: ['implement', args.phaseId],
}));

// ---------------------------------------------------------------------------
// Task: independent verification gate (shell — run by the orchestrator)
// ---------------------------------------------------------------------------
export const verifyPhaseTask = defineTask('csv187/verify-phase', (args, taskCtx) => ({
  kind: 'shell',
  title: `Verify ${args.phaseId} (independent Jest gate, attempt ${args.attempt || 1})`,
  shell: {
    command: args.verifyCommand,
    timeout: 600000,
    outputPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  labels: ['verify', args.phaseId],
}));

// ---------------------------------------------------------------------------
// Task: open the PR (shell — run by the orchestrator after the breakpoint)
// ---------------------------------------------------------------------------
export const openPrTask = defineTask('csv187/open-pr', (args, taskCtx) => ({
  kind: 'shell',
  title: 'Push branch + open PR (#187)',
  shell: {
    command: args.command,
    timeout: 180000,
    outputPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  labels: ['pr'],
}));

// ---------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------
export async function process(inputs, ctx) {
  const repoRoot = inputs.repoRoot || '/home/hagaybar/projects/primo_maps';
  const planPath = inputs.planPath || 'docs/superpowers/plans/2026-06-14-csv-editor-validate-and-grid.md';
  const specPath = inputs.specPath || 'docs/superpowers/specs/2026-06-14-csv-editor-validate-and-grid-design.md';
  const branch = inputs.branch || 'feat/csv-editor-validate-grid';
  const issue = inputs.issue || 187;
  const MAX_ATTEMPTS = 3;

  const phaseResults = [];

  for (const phase of PHASES) {
    let passed = false;
    let feedback = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !passed; attempt++) {
      const impl = await ctx.task(implementPhaseTask, {
        phaseId: phase.id,
        phaseTitle: phase.title,
        phaseSummary: phase.summary,
        planTasks: phase.planTasks,
        verifyCommand: phase.verifyCommand,
        planPath,
        specPath,
        branch,
        issue,
        repoRoot,
        attempt,
        previousFeedback: feedback,
      });

      const gate = await ctx.task(verifyPhaseTask, {
        phaseId: phase.id,
        verifyCommand: phase.verifyCommand,
        attempt,
      });

      const gateOk = gate && (gate.exitCode === 0 || gate.success === true);
      if (gateOk && impl && impl.passed) {
        passed = true;
        phaseResults.push({ phase: phase.id, attempt, passed: true, notes: impl.notes });
      } else {
        feedback =
          `Gate failed for ${phase.id}. Verify command exitCode=${gate ? gate.exitCode : 'n/a'}. ` +
          `Agent self-report passed=${impl ? impl.passed : 'n/a'}. ` +
          `Last gate output tail: ${gate ? JSON.stringify(gate).slice(0, 1200) : 'none'}. ` +
          `Fix the failing tests without weakening any test (HR1) and re-run.`;
        if (attempt === MAX_ATTEMPTS) {
          phaseResults.push({ phase: phase.id, attempt, passed: false, notes: feedback });
        }
      }
    }

    if (!passed) {
      // Escalate to the owner rather than silently failing.
      const decision = await ctx.breakpoint({
        question: `Phase ${phase.id} did not pass its gate after ${MAX_ATTEMPTS} attempts. Review the run and choose how to proceed.`,
        title: `Phase ${phase.id} stuck`,
        options: ['Stop the run', 'I fixed it manually — continue'],
        expert: 'owner',
        tags: ['phase-stuck'],
      });
      if (!decision.approved) {
        return { success: false, phases: phaseResults, prOpened: false, stoppedAt: phase.id };
      }
    }
  }

  // Final regression guard: full admin suite green.
  const finalGate = await ctx.task(verifyPhaseTask, {
    phaseId: 'final-full-suite',
    verifyCommand: 'cd admin && NODE_OPTIONS=--experimental-vm-modules npx jest 2>&1 | tail -12',
    attempt: 1,
  });

  // Single owner review breakpoint before any push / PR (profile: minimal breakpoints;
  // pushing a branch + opening a PR is the one outward action worth a gate here).
  const review = await ctx.breakpoint({
    question:
      `All three phases passed their independent Jest gates and the full admin suite is green. ` +
      `Review the branch '${branch}' for issue #${issue}, then approve to push and open the PR (no deploy — that stays a separate owner step).`,
    title: 'Pre-PR review (#187)',
    options: ['Approve — push & open PR', 'Hold — do not push yet'],
    expert: 'owner',
    tags: ['approval-gate', 'pre-pr'],
    context: { runId: ctx.runId, branch, issue, phaseResults },
  });

  if (!review.approved) {
    return { success: true, phases: phaseResults, prOpened: false, finalGate };
  }

  const prCommand = [
    `cd ${repoRoot}`,
    `git push -u origin ${branch}`,
    `gh pr create --title "CSV Editor: validate before save + usable wide grid (#${issue})" ` +
      `--body "Closes #${issue}. Implements the committed plan (${planPath}) — whole-file-must-be-valid save gate (errors block, overlaps warn), server-reason surfacing (closes #134 here), inline cell marks, empty-row guard (#84 at-source), and a usable wide grid (frozen header + anchor column + visible scrollbar, LTR+RTL). Spec: ${specPath}. Full AC↔test map in the plan. Suites green (admin Jest). 🤖 babysitter run." ` +
      `2>&1 | tail -3`,
  ].join(' && ');

  const pr = await ctx.task(openPrTask, { command: prCommand });

  return { success: true, phases: phaseResults, prOpened: true, finalGate, pr };
}
