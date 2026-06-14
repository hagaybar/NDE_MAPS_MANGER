/**
 * @process .a5c/processes/docs-organization
 * @description Execute the documentation-reorganization implementation plan (docs-only, fully
 *   reversible): git-mv finished history into docs/archive/, add status headers, write
 *   docs/INDEX.md, relocate EDITOR-UI-REQUIREMENTS.md + the legacy welcome page, delete scratch
 *   PNGs. Verifies no references break and Jest is unaffected, then a single owner review gate.
 * @inputs { planPath: string, specPath: string, rollbackTag: string }
 * @outputs { success: boolean, batches: array, verification: object }
 * @agent general-purpose
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const { planPath, specPath, rollbackTag } = inputs;

  // ==========================================================================
  // PHASE 1 — EXECUTION (two batches, each commits per plan-task)
  // ==========================================================================

  const batch1 = await ctx.task(execPlanRangeTask, {
    planPath,
    specPath,
    rollbackTag,
    label: 'batch1: plan Tasks 1-4',
    taskRange: 'Tasks 1 through 4',
    detail:
      'Task 1: create docs/archive/{phases,handoffs,sessions,qa}/ scaffold and commit. ' +
      'Task 2: git mv the four PHASE docs (PHASE-1-TASKS, PHASE-2-TASKS, PHASE-4-PLAN, 04-PROJECT-PHASES) into docs/archive/phases/, prepend the exact status headers from the plan, commit. ' +
      'Task 3: git mv the two HANDOFF docs into docs/archive/handoffs/ and docs/sessions/2026-06-08-summary.md into docs/archive/sessions/ (then rmdir docs/sessions), prepend headers, fix the one inbound link in docs/issues-plain-language-overview-2026-06-09.md (docs/sessions/ -> docs/archive/sessions/), commit. ' +
      'Task 4: git mv ONLY the three dated manual-qa *.md QA logs into docs/archive/qa/ (keep the harness and all *.html dashboards in place), prepend headers, commit.',
  });

  const batch2 = await ctx.task(execPlanRangeTask, {
    planPath,
    specPath,
    rollbackTag,
    label: 'batch2: plan Tasks 5-7',
    taskRange: 'Tasks 5 through 7',
    detail:
      'Task 5: git mv EDITOR-UI-REQUIREMENTS.md from repo root into docs/, then prepend the exact status headers from the plan to the Current docs (01/02/03, AWS-INFRASTRUCTURE, issues-plain-language-overview, EDITOR-UI-REQUIREMENTS) and the Pinned docs (batches.md, run-history-insights.md, both docs/audits/*.md), commit. ' +
      'Task 6: write docs/INDEX.md with the exact content from the plan, verify its links resolve, commit. ' +
      'Task 7: confirm the 3 root editor-*.png are untracked then rm them; move root archive/index.html into docs/archive/legacy/index.html, rmdir the empty root archive/, git add and commit the legacy page.',
  });

  // ==========================================================================
  // PHASE 2 — VERIFICATION (Task 8) with a bounded refine loop
  // ==========================================================================

  let verification = await ctx.task(verifyTask, { planPath, specPath, label: 'verify' });

  for (let attempt = 1; !verification.passed && attempt <= 2; attempt++) {
    await ctx.task(fixTask, {
      planPath,
      specPath,
      attempt,
      issues: verification.issues || [],
      label: `fix-attempt-${attempt}`,
    });
    verification = await ctx.task(verifyTask, {
      planPath,
      specPath,
      label: `verify-retry-${attempt}`,
    });
  }

  // ==========================================================================
  // PHASE 3 — OWNER REVIEW (single gate; profile breakpointTolerance = minimal)
  // ==========================================================================

  let approved = false;
  let lastFeedback = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (lastFeedback) {
      await ctx.task(fixTask, {
        planPath,
        specPath,
        attempt: attempt + 1,
        issues: [lastFeedback],
        feedback: lastFeedback,
        label: `owner-fix-${attempt + 1}`,
      });
      verification = await ctx.task(verifyTask, {
        planPath,
        specPath,
        label: `verify-postfix-${attempt + 1}`,
      });
    }

    const review = await ctx.breakpoint({
      question:
        `Documentation reorganization executed and verified ` +
        `(${verification.passed ? 'all checks passed' : 'WITH REMAINING ISSUES — see verification'}). ` +
        `Review the result in the repo (start at docs/INDEX.md). Approve to finish, or request changes? ` +
        `Rollback point: ${rollbackTag}.`,
      title: 'Docs reorganization — owner review',
      options: ['Approve', 'Request changes'],
      expert: 'owner',
      tags: ['approval-gate', 'docs'],
      previousFeedback: lastFeedback || undefined,
      attempt: attempt > 0 ? attempt + 1 : undefined,
      context: {
        runId: ctx.runId,
        files: [{ path: 'docs/INDEX.md', format: 'markdown' }],
      },
    });

    if (review.approved) {
      approved = true;
      break;
    }
    lastFeedback = review.response || review.feedback || 'Changes requested';
  }

  return {
    success: approved && verification.passed,
    approved,
    batches: [batch1, batch2],
    verification,
    metadata: {
      processId: '.a5c/processes/docs-organization',
      rollbackTag,
      timestamp: ctx.now(),
    },
  };
}

/**
 * Execute a contiguous range of plan tasks exactly as written.
 */
export const execPlanRangeTask = defineTask('exec-plan-range', (args, taskCtx) => ({
  kind: 'agent',
  title: `Execute ${args.taskRange}`,
  description: args.label,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'careful release engineer executing a precise, pre-approved docs reorganization plan',
      task: `Execute ${args.taskRange} of the implementation plan EXACTLY as written, committing per task.`,
      context: {
        planPath: args.planPath,
        specPath: args.specPath,
        rollbackTag: args.rollbackTag,
        taskRange: args.taskRange,
        detail: args.detail,
      },
      instructions: [
        `Read the plan at ${args.planPath} and the spec at ${args.specPath} first.`,
        `Execute ONLY ${args.taskRange}. Run the plan's exact shell commands (git mv, mkdir, rm) and apply the exact status-header text and INDEX.md content the plan specifies. Do not improvise wording.`,
        'Use the Edit/Write tools to prepend each status header as the FIRST line of the target file, followed by a blank line, preserving all existing content.',
        'Commit after each plan task using the commit message the plan gives (or a close equivalent). Work on the current branch; do NOT create branches, tags, or push.',
        'HARD CONSTRAINTS: do not modify anything under docs/superpowers/; do not modify docs/audits/ file BODIES except prepending the two specified status headers; do not touch any application or test code; do not edit CLAUDE.md or WORKFLOW.md.',
        'After finishing the range, run the plan verification steps for those tasks and confirm they pass (e.g. git grep shows no stale references to moved files).',
        'Return ONLY a JSON summary: which tasks ran, the commit hashes, the verification command outputs you observed, and any deviation from the plan.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'tasksCompleted', 'commits'],
      properties: {
        success: { type: 'boolean' },
        tasksCompleted: { type: 'array', items: { type: 'string' } },
        commits: { type: 'array', items: { type: 'string' } },
        verification: { type: 'string' },
        deviations: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  labels: ['execution', args.label],
}));

/**
 * Verify the reorganization (plan Task 8): no broken references, audits intact, Jest unaffected.
 */
export const verifyTask = defineTask('verify-docs-org', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Verify docs reorganization',
  description: args.label,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'meticulous verification engineer',
      task: 'Verify the documentation reorganization is correct and broke nothing.',
      context: { planPath: args.planPath, specPath: args.specPath },
      instructions: [
        `Read the plan at ${args.planPath} (especially Task 8) and run its verification commands.`,
        'Confirm: (1) git grep finds NO stale references to any moved file outside docs/archive and the 2026-06-10 spec/plan/dashboard; (2) docs/audits/ files still exist and the test comment in admin/__tests__/no-duplicate-module-imports.test.js still resolves to docs/audits/2026-05-12-orphan-panel-audit.md; (3) the targeted Jest suite still passes — run: cd admin && NODE_OPTIONS=--experimental-vm-modules npx jest no-duplicate-module-imports ; (4) the final tree sanity check matches (docs root has only the expected Current/Pinned docs + INDEX; docs/archive has the 10 relocated docs + legacy/index.html; no root archive/; EDITOR relocated); (5) every in-scope doc carries a status header; (6) docs/INDEX.md internal links resolve.',
        'Do NOT modify any files. Only inspect and run read-only/test commands.',
        'Return ONLY a JSON object: passed (boolean), and if not passed, a concrete issues array naming each failing check and its evidence.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['passed'],
      properties: {
        passed: { type: 'boolean' },
        issues: { type: 'array', items: { type: 'string' } },
        evidence: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  labels: ['verification', args.label],
}));

/**
 * Fix issues surfaced by verification or owner feedback, then commit.
 */
export const fixTask = defineTask('fix-docs-org', (args, taskCtx) => ({
  kind: 'agent',
  title: `Fix docs reorganization issues (attempt ${args.attempt})`,
  description: args.label,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'careful engineer applying targeted fixes to a docs reorganization',
      task: 'Resolve the listed issues without violating the plan constraints, then commit.',
      context: {
        planPath: args.planPath,
        specPath: args.specPath,
        issues: args.issues,
        feedback: args.feedback || null,
        attempt: args.attempt,
      },
      instructions: [
        `Read the plan at ${args.planPath} and spec at ${args.specPath} for the intended end-state.`,
        'Fix ONLY the listed issues / address the owner feedback. Stay within the plan constraints: docs-only, no superpowers/ changes, no app/test code, no branches/tags/push.',
        'Commit the fix with a clear message. Then re-run the relevant verification command and confirm it now passes.',
        'Return ONLY a JSON object: fixed (boolean), what you changed, and the commit hash.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['fixed'],
      properties: {
        fixed: { type: 'boolean' },
        changes: { type: 'string' },
        commit: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  labels: ['fix', args.label],
}));
