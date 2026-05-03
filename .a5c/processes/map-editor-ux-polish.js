/**
 * @process map-editor-ux-polish
 * @description Map Editor UX polish — three-phase initiative resolving issues #1-#6.
 *   Phase 0: branch + pre-feature tag.
 *   Phase 1: delete multi-shelf batch-editing (#3) — pure deletion, no baselines.
 *   Phase 2: diagnose + fix SVG alignment (#2) — produces 1 baseline pair (LTR/RTL).
 *   Phase 3: design tokens via ui-design skills, then layout fix (#1) and drawer
 *     polish (#4 + #5 + #6) — produces 16 baselines (4 states × 4 locale-role projects),
 *     ends with ui-design:responsive-audit at 1280/1024/768 widths.
 *   Visual baselines are approved by the human via the brainstorm visual companion
 *   server before they are committed and become regression gates. Only the
 *   baseline-approval gates and the PR-open gate block the run.
 *
 * @inputs {
 *   projectRoot: string,
 *   specPath: string,
 *   brainstormScreenDir: string,
 *   brainstormStateDir: string,
 *   brainstormUrl: string,
 *   branchName?: string,
 *   preFeatureTag?: string,
 *   startPhase?: number
 * }
 * @outputs {
 *   success: boolean,
 *   commits: string[],
 *   baselinesApproved: number,
 *   prUrl?: string
 * }
 *
 * @skill frontend-design specializations/web-development/skills/frontend-design/SKILL.md
 * @skill e2e-testing specializations/web-development/skills/e2e-testing/SKILL.md
 * @skill spacing-system specializations/ux-ui-design/skills/spacing-system/SKILL.md
 * @skill visual-hierarchy specializations/ux-ui-design/skills/visual-hierarchy/SKILL.md
 * @skill layout-grid specializations/ux-ui-design/skills/layout-grid/SKILL.md
 * @skill responsive-audit specializations/ux-ui-design/skills/responsive-audit/SKILL.md
 *
 * @agent frontend-architect specializations/web-development/agents/frontend-architect/AGENT.md
 * @agent e2e-testing specializations/web-development/agents/e2e-testing/AGENT.md
 * @agent code-reviewer specializations/web-development/agents/code-reviewer/AGENT.md
 *
 * @references
 *   docs/superpowers/specs/2026-05-03-map-editor-ux-polish-design.md
 *   GitHub issues #1, #2, #3, #4, #5, #6
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const {
    projectRoot = '/home/hagaybar/projects/primo_maps',
    specPath = 'docs/superpowers/specs/2026-05-03-map-editor-ux-polish-design.md',
    brainstormScreenDir,
    brainstormStateDir,
    brainstormUrl = 'http://localhost:60845',
    branchName = 'feat/map-editor-ux-polish',
    preFeatureTag = 'pre-map-editor-ux-polish',
    startPhase = 0,
  } = inputs;

  const startTime = ctx.now();
  const commits = [];
  const baselineApprovalsLog = [];

  ctx.log('info', '=== Map Editor UX Polish ===');
  ctx.log('info', `Project root: ${projectRoot}`);
  ctx.log('info', `Spec: ${specPath}`);
  ctx.log('info', `Branch: ${branchName} (tag: ${preFeatureTag})`);
  ctx.log('info', `Brainstorm: ${brainstormUrl}`);
  ctx.log('info', `Start phase: ${startPhase}`);

  const sharedArgs = { projectRoot, specPath, branchName, brainstormScreenDir, brainstormStateDir, brainstormUrl };

  // ============================================================================
  // PHASE 0: Branch + pre-feature tag
  // ============================================================================
  if (startPhase <= 0) {
    ctx.log('info', '=== PHASE 0: Branch + tag setup ===');
    const phase0 = await ctx.task(branchSetupTask, sharedArgs);
    if (!phase0.success) {
      return failureResult('phase 0 (branch setup)', phase0.error, commits, startTime);
    }
    if (phase0.tagCommit) commits.push(phase0.tagCommit);
  }

  // ============================================================================
  // PHASE 1: Delete multi-shelf batch-editing (#3)
  // ============================================================================
  if (startPhase <= 1) {
    ctx.log('info', '=== PHASE 1: Delete multi-shelf (#3) ===');
    const phase1 = await ctx.task(phase1DeleteMultiShelfTask, sharedArgs);
    if (!phase1.success) {
      return failureResult('phase 1 (delete multi-shelf)', phase1.failureReason, commits, startTime);
    }
    commits.push(...(phase1.commits || []));

    const phase1Gate = await ctx.task(phase1QualityGateTask, sharedArgs);
    if (!phase1Gate.allPassed) {
      // One refinement pass — fix the failure with feedback
      const refine = await ctx.task(phase1DeleteMultiShelfTask, {
        ...sharedArgs,
        retryFeedback: phase1Gate.failures,
      });
      commits.push(...(refine.commits || []));
      const refineGate = await ctx.task(phase1QualityGateTask, sharedArgs);
      if (!refineGate.allPassed) {
        return failureResult('phase 1 quality gate after refinement', refineGate.failures, commits, startTime);
      }
    }
  }

  // ============================================================================
  // PHASE 2: Diagnose + fix SVG alignment (#2)
  // ============================================================================
  if (startPhase <= 2) {
    ctx.log('info', '=== PHASE 2: SVG alignment (#2) ===');

    const diagnose = await ctx.task(phase2DiagnoseTask, sharedArgs);
    let causeForFix = diagnose.foundCause;

    if (!diagnose.foundCause) {
      // Diagnostic exhausted all three probes — block on user input
      const cont = await ctx.breakpoint({
        question: 'Phase 2 diagnostic ran all three probes (CSS bleed / hatch-defs collision / container scaling) — none restored alignment. Review the journal entry for the bounding-box deltas. How do you want to proceed?',
        title: 'Phase 2: diagnosis inconclusive',
        options: [
          'I have a hypothesis — I will pause the run and add the fix manually, then resume',
          'Try probe again with adjusted thresholds',
          'Abort phase 2 and continue to phase 3 (#2 stays open)',
        ],
        context: { diagnosticReport: diagnose.report },
      });
      if (cont.response && cont.response.includes('manually')) {
        return {
          success: false,
          paused: true,
          phasePaused: 2,
          reason: 'User paused phase 2 to apply manual fix. Resume with babysitter:resume after committing the fix.',
          commits,
          metadata: { processId: 'map-editor-ux-polish', timestamp: startTime },
        };
      }
      if (cont.response && cont.response.includes('Abort')) {
        ctx.log('warn', 'Phase 2 aborted; #2 remains open. Continuing to phase 3.');
      } else {
        // Retry probes — second pass uses adjusted thresholds
        const diagnose2 = await ctx.task(phase2DiagnoseTask, { ...sharedArgs, retry: true });
        causeForFix = diagnose2.foundCause;
        if (!causeForFix) {
          return failureResult('phase 2 diagnosis (retry)', 'no probe restored alignment on retry', commits, startTime);
        }
      }
    }

    if (causeForFix) {
      const phase2Fix = await ctx.task(phase2FixTask, { ...sharedArgs, cause: causeForFix });
      if (!phase2Fix.success) {
        return failureResult('phase 2 fix', phase2Fix.failureReason, commits, startTime);
      }
      commits.push(...(phase2Fix.commits || []));

      const phase2Gate = await ctx.task(phase2QualityGateTask, sharedArgs);
      if (!phase2Gate.allPassed) {
        return failureResult('phase 2 quality gate', phase2Gate.failures, commits, startTime);
      }

      // Baseline approval gate
      const phase2Approval = await runBaselineApprovalLoop(ctx, {
        ...sharedArgs,
        phaseLabel: 'phase 2',
        approvalTask: phase2BaselineApprovalGateTask,
        refineTask: phase2FixTask,
        regateTask: phase2QualityGateTask,
        commitTask: phase2BaselineCommitTask,
        cause: causeForFix,
      });
      if (!phase2Approval.success) {
        return failureResult('phase 2 baseline approval', phase2Approval.reason, commits, startTime);
      }
      commits.push(...(phase2Approval.commits || []));
      baselineApprovalsLog.push(phase2Approval.audit);
    }
  }

  // ============================================================================
  // PHASE 3: Polish (#1, #4, #5, #6)
  // ============================================================================
  if (startPhase <= 3) {
    ctx.log('info', '=== PHASE 3: Polish (#1 #4 #5 #6) ===');

    // 3.0 Design tokens — composite of three ui-design skills
    const tokens = await ctx.task(phase3DesignTokensTask, sharedArgs);
    if (!tokens.success) {
      return failureResult('phase 3 design-tokens', tokens.failureReason, commits, startTime);
    }
    commits.push(...(tokens.commits || []));

    // 3a Layout fix — issue #1
    const layout = await ctx.task(phase3LayoutFixTask, sharedArgs);
    if (!layout.success) {
      return failureResult('phase 3 layout fix (#1)', layout.failureReason, commits, startTime);
    }
    commits.push(...(layout.commits || []));

    // 3b Drawer polish — issues #4, #5, #6
    const polish = await ctx.task(phase3DrawerPolishTask, sharedArgs);
    if (!polish.success) {
      return failureResult('phase 3 drawer polish (#4 #5 #6)', polish.failureReason, commits, startTime);
    }
    commits.push(...(polish.commits || []));

    // 3c Quality gate — full snapshot suite (16 baselines), behavior assertions,
    //    existing E2E, console-clean, unit tests
    const phase3Gate = await ctx.task(phase3QualityGateTask, sharedArgs);
    if (!phase3Gate.allPassed) {
      return failureResult('phase 3 quality gate', phase3Gate.failures, commits, startTime);
    }

    // 3d Responsive audit — ui-design:responsive-audit at 1280/1024/768
    const audit = await ctx.task(phase3ResponsiveAuditTask, sharedArgs);
    if (!audit.passed) {
      return failureResult('phase 3 responsive audit', audit.findings, commits, startTime);
    }

    // 3e Baseline approval gate — 16 PNGs go to brainstorm screen for human approval
    const phase3Approval = await runBaselineApprovalLoop(ctx, {
      ...sharedArgs,
      phaseLabel: 'phase 3',
      approvalTask: phase3BaselineApprovalGateTask,
      refineTask: phase3RefineTask,
      regateTask: phase3QualityGateTask,
      commitTask: phase3BaselineCommitTask,
    });
    if (!phase3Approval.success) {
      return failureResult('phase 3 baseline approval', phase3Approval.reason, commits, startTime);
    }
    commits.push(...(phase3Approval.commits || []));
    baselineApprovalsLog.push(phase3Approval.audit);
  }

  // ============================================================================
  // FINAL: verify everything + open PR
  // ============================================================================
  ctx.log('info', '=== Final verification ===');
  const verify = await ctx.task(finalVerificationTask, { ...sharedArgs, commits, baselineApprovalsLog });
  if (!verify.allPassed) {
    return failureResult('final verification', verify.failures, commits, startTime);
  }

  // PR-open is an external mutation — always breakpoint
  const prGate = await ctx.breakpoint({
    question: `All phases complete and verified. Open PR ${branchName} → main?`,
    title: 'Open PR',
    options: ['Open PR now', 'Skip — I will open manually', 'Stop and review locally first'],
    context: {
      branch: branchName,
      commitsCount: commits.length,
      issuesClosed: ['#1', '#2', '#3', '#4', '#5', '#6'],
      baselineApprovals: baselineApprovalsLog,
    },
  });

  let prUrl = null;
  if (prGate.response && prGate.response.includes('Open PR now')) {
    const pr = await ctx.task(openPullRequestTask, { ...sharedArgs, commits, baselineApprovalsLog });
    if (!pr.success) {
      return failureResult('open PR', pr.failureReason, commits, startTime);
    }
    prUrl = pr.prUrl;
  }

  return {
    success: true,
    commits,
    baselinesApproved: baselineApprovalsLog.reduce((n, a) => n + (a.approvedCount || 0), 0),
    baselineApprovalsLog,
    prUrl,
    metadata: {
      processId: 'map-editor-ux-polish',
      timestamp: startTime,
      duration: ctx.now() - startTime,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function failureResult(stage, reason, commits, startTime) {
  return {
    success: false,
    failedAt: stage,
    failureReason: reason,
    commits,
    metadata: {
      processId: 'map-editor-ux-polish',
      timestamp: startTime,
      duration: Date.now() - startTime,
    },
  };
}

/**
 * Loops the baseline-approval flow up to 3 times. Each iteration:
 *   1. Posts current baselines to the brainstorm visual companion.
 *   2. Waits on $STATE_DIR/events for approve/reject clicks.
 *   3. On all-approved → commits baselines and returns success.
 *   4. On any rejected → invokes refineTask with rejection feedback, re-runs
 *      regateTask, and tries again.
 */
async function runBaselineApprovalLoop(ctx, opts) {
  const { phaseLabel, approvalTask, refineTask, regateTask, commitTask } = opts;
  const maxAttempts = 3;
  let lastFeedback = null;
  let lastApproval = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    ctx.log('info', `${phaseLabel}: baseline approval attempt ${attempt}/${maxAttempts}`);

    if (lastFeedback) {
      const refine = await ctx.task(refineTask, { ...opts, rejectionFeedback: lastFeedback, attempt });
      if (!refine.success) {
        return { success: false, reason: `refine failed on attempt ${attempt}: ${refine.failureReason}` };
      }
      const regate = await ctx.task(regateTask, opts);
      if (!regate.allPassed) {
        return { success: false, reason: `quality gate failed after refine (attempt ${attempt}): ${JSON.stringify(regate.failures)}` };
      }
    }

    lastApproval = await ctx.task(approvalTask, opts);
    if (lastApproval.allApproved) {
      const commitResult = await ctx.task(commitTask, opts);
      return {
        success: true,
        commits: commitResult.commits || [],
        audit: {
          phase: phaseLabel,
          attempt,
          approvedCount: lastApproval.approvedCount,
          baselines: lastApproval.baselines,
          terminalNote: lastApproval.terminalNote || null,
        },
      };
    }

    lastFeedback = lastApproval.rejectionFeedback;
    ctx.log('warn', `${phaseLabel}: ${lastApproval.rejectedCount} baseline(s) rejected on attempt ${attempt}`);
  }

  return {
    success: false,
    reason: `baseline approval failed after ${maxAttempts} attempts; last rejection: ${JSON.stringify(lastFeedback)}`,
  };
}

// ============================================================================
// Phase 0 — Branch and tag setup
// ============================================================================

export const branchSetupTask = defineTask('branch-setup', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 0: create branch and pre-feature tag',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Release engineer',
      task: `Create branch ${args.branchName} from main with the pre-feature tag ${preFeatureTag(args)} at the cut point.

PROJECT ROOT: ${args.projectRoot}

STEPS:
1. cd ${args.projectRoot}
2. Verify working tree is clean: \`git status --porcelain\`. If anything is uncommitted, STOP and report.
3. Verify on main and up to date with origin/main: \`git checkout main && git pull --ff-only origin main\`. If not fast-forward, STOP and report.
4. Create the pre-feature tag: \`git tag ${preFeatureTag(args)}\`. If the tag already exists locally, leave it (idempotent — do not move existing tags).
5. Create and switch to ${args.branchName}: \`git checkout -b ${args.branchName}\`. If the branch already exists, switch to it (\`git checkout ${args.branchName}\`) — do not delete or recreate.
6. Verify branch: \`git branch --show-current\` returns ${args.branchName}.
7. Verify tag: \`git tag --list ${preFeatureTag(args)}\` returns the tag name.

DO NOT push the tag or branch. Local-only.

OUTPUT: JSON {success, branch, tag, message}.`,
      context: args,
      instructions: [
        'Use the Bash tool for all git commands.',
        'Capture and return the actual command output, not assumptions.',
        'If working tree is dirty or main is behind origin, set success=false and explain.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'branch', 'tag'],
      properties: {
        success: { type: 'boolean' },
        branch: { type: 'string' },
        tag: { type: 'string' },
        tagCommit: { type: 'string' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-0', 'git', 'branch'],
}));

function preFeatureTag(args) { return args.preFeatureTag || 'pre-map-editor-ux-polish'; }

// ============================================================================
// Phase 1 — Delete multi-shelf (#3)
// ============================================================================

export const phase1DeleteMultiShelfTask = defineTask('phase1-delete-multi-shelf', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 1: delete multi-shelf batch-editing (closes #3)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior frontend engineer (vanilla JS)',
      task: `Execute Phase 1 of the Map Editor UX Polish plan: delete the multi-shelf batch-editing feature entirely.

PROJECT ROOT: ${args.projectRoot}
SPEC: ${args.projectRoot}/${args.specPath} — see §5 for the exhaustive task list.
BRANCH: ${args.branchName} (already checked out by phase 0).
${args.retryFeedback ? `\nPREVIOUS QUALITY-GATE FAILURES:\n${JSON.stringify(args.retryFeedback, null, 2)}\nFix these specifically before re-running.` : ''}

DELETIONS / MODIFICATIONS (in order):
1. DELETE admin/components/map-editor/distinct-values-widget.js.
2. admin/components/map-editor/svg-interaction.js: remove the attachMarquee export + its full implementation. Remove the onMultiToggle parameter and the Ctrl/⌘-click branch in attachInteraction. After: Ctrl/⌘-click falls back to plain single-select.
3. admin/components/map-editor/shelf-state.js: remove selectMulti, addToSelection, removeFromSelection. Selection shape becomes { kind: 'none' | 'single', shelfIds: string[] } with shelfIds.length ≤ 1.
4. admin/components/map-editor/shelf-drawer.js: remove showMultiShelf and the import of buildDistinctValuesWidget.
5. admin/components/map-editor.js: remove the attachMarquee import + its call inside initMapEditor; remove the sel.kind === 'multi' branch in renderDrawer; remove the onMultiToggle callback.
6. admin/i18n/en.json + admin/i18n/he.json: remove keys mapEditor.shelves.selected, mapEditor.replaceAllWith, mapEditor.clearOnSelected, mapEditor.distinctValues.
7. admin/__tests__/shelf-state.test.js: remove tests covering selectMulti / multi-select transitions / multi-mode permission filtering.
8. e2e/tests/map-editor.spec.ts: remove the spec named "Map Editor: Shift-drag marquee selects multiple, bulk edit notes".
9. docs/superpowers/specs/2026-04-28-map-editor-design.md: move multi-shelf bulk-edit decisions to "Out of scope" (§10) with a one-line note linking to issue #3.

VERIFY (after changes):
- \`grep -r "selectMulti\\\\|multiToggle\\\\|showMultiShelf\\\\|distinct-values-widget" admin/\` returns zero matches.
- \`npx jest --testPathPattern=admin/__tests__/shelf-state.test.js\` passes.
- \`npx playwright test e2e/tests/map-editor.spec.ts\` passes.
- \`git status --porcelain\` shows only the expected modifications.

COMMIT once at the end with: refactor(map-editor): remove multi-shelf batch-editing (closes #3)

DO NOT bypass git hooks (--no-verify forbidden). DO NOT amend prior commits. DO NOT push.

OUTPUT: JSON {success, commits[], filesChanged[], failureReason?, deviationsFromPlan?[]}.`,
      context: args,
      instructions: [
        'Use Read/Edit/Write tools for code changes; Bash for git and tests.',
        'Spec §5 is authoritative — do not improvise alternatives to its file lists.',
        'Run the verification grep after deletions; if any match remains, fix before commit.',
        'Capture actual jest/playwright output.',
        'Set success=false if any verification step fails — do not fabricate green.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        commits: { type: 'array', items: { type: 'string' } },
        filesChanged: { type: 'array', items: { type: 'string' } },
        failureReason: { type: 'string' },
        deviationsFromPlan: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-1', 'deletion', 'issue-3'],
}));

export const phase1QualityGateTask = defineTask('phase1-quality-gate', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 1: quality gate (grep absent + tests pass + console clean)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer',
      task: `Run the Phase 1 quality gate on branch ${args.branchName}.

PROJECT ROOT: ${args.projectRoot}

CHECKS (all must pass):
1. Grep absence:
   \`grep -rn "selectMulti\\\\|multiToggle\\\\|showMultiShelf\\\\|distinct-values-widget" admin/\`
   Required: zero matches.
2. Unit tests: \`cd ${args.projectRoot} && npx jest --testPathPattern=admin/__tests__ 2>&1 | tail -20\`. Required: all pass, no failures.
3. E2E (full suite, default project only): \`npx playwright test --project=chromium 2>&1 | tail -40\`. Required: all 113 pre-existing tests pass; the multi-shelf marquee spec is gone (not failing — absent).
4. Console clean: instrument a smoke E2E that opens map-editor, clicks a shelf, asserts no console.error / console.warn during the session. (Reuse existing fixture if one exists; otherwise create e2e/fixtures/console.ts as part of this gate.)

OUTPUT: JSON {allPassed, gates: { grep, jest, playwright, consoleClean }, failures: string[]}.

DO NOT modify source files — verification only. If a check needs a new file (e.g., console fixture), report it under failures so the implementing task can add it.`,
      context: args,
      instructions: [
        'Run each command exactly as written and capture real output.',
        'Be honest about failures.',
        'Failures must be concrete: file path, command, expected vs actual.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['allPassed'],
      properties: {
        allPassed: { type: 'boolean' },
        gates: { type: 'object' },
        failures: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-1', 'quality-gate'],
}));

// ============================================================================
// Phase 2 — SVG alignment (#2)
// ============================================================================

export const phase2DiagnoseTask = defineTask('phase2-diagnose', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 2: diagnose SVG alignment (probe three suspected causes)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Frontend debugging engineer',
      task: `Diagnose the SVG-alignment bug from issue #2. Spec §6.1 lists the three suspected causes in priority order.

PROJECT ROOT: ${args.projectRoot}
BRANCH: ${args.branchName}
${args.retry ? '\nRETRY: previous run found no cause. Tighten thresholds and re-run probes with deeper logging.' : ''}

DIAGNOSTIC LOOP:
1. Use Playwright to load the editor at /admin/ with floor_1.svg and snapshot #map-canvas svg → record bounding boxes of every <text>/<tspan>.
2. Open https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_1.svg directly and snapshot the same elements. Record bounding boxes.
3. Diff: any <text>/<tspan> with bounding-box delta > 1px is "misaligned". Record count + IDs.
4. Probe in priority order, each is reversible:
   a. CSS bleed: temporarily wrap .map-shelf* selectors with :where(rect.map-shelf, path.map-shelf) in admin/styles/app.css. Reload editor. Re-snapshot. If misaligned-count drops to 0 → cause confirmed.
   b. Hatch-defs collision: if (a) didn't fix, revert (a). Then comment out the injected <defs> block in initMapEditor. Reload. Re-snapshot. If alignment changes → cause confirmed.
   c. Container scaling: if (b) didn't fix, revert (b). Then add #map-canvas svg { width: auto; height: auto; } to a temporary stylesheet. Reload. Re-snapshot. If alignment restores → cause confirmed.
5. After identifying the cause, REVERT all probe changes — leave the working tree clean. The fix is applied by the next task.
6. If none of the three probes restored alignment, set foundCause=null and include the bounding-box diff data in 'report'.

DO NOT commit any probe changes. DO NOT push. The diagnostic task only reads + experimentally toggles + reports.

OUTPUT: JSON {success, foundCause: 'css-bleed' | 'hatch-defs' | 'container-scaling' | null, misalignedCountBefore: number, misalignedCountAfterFix: number, report: object}.`,
      context: args,
      instructions: [
        'Use Playwright via npx playwright test or via the @playwright/test programmatic API.',
        'For probe reversibility: stash or copy the file before edit, then restore it after each probe round.',
        'Be very precise about bounding-box deltas — sub-pixel rasterization differences must not be counted as misalignment (use ≥1px threshold).',
        'Do not move on to a probe without reverting the previous one.',
        'Capture and return the diagnostic report data — the orchestrator may surface it to the user if no cause is found.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'foundCause'],
      properties: {
        success: { type: 'boolean' },
        foundCause: { type: ['string', 'null'] },
        misalignedCountBefore: { type: 'number' },
        misalignedCountAfterFix: { type: 'number' },
        report: { type: 'object' },
        failureReason: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-2', 'diagnose', 'issue-2'],
}));

export const phase2FixTask = defineTask('phase2-fix', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 2: apply identified alignment fix',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior frontend engineer',
      task: `Apply the permanent fix for the SVG alignment bug. The diagnostic task identified cause: ${args.cause}.
${args.rejectionFeedback ? `\nPREVIOUS BASELINE WAS REJECTED:\n${JSON.stringify(args.rejectionFeedback, null, 2)}\nAddress the rejection reasons in this iteration.` : ''}

PROJECT ROOT: ${args.projectRoot}

FIX MAP:
- 'css-bleed' → in admin/styles/app.css, change selectors .map-shelf, .map-shelf--hover, .map-shelf--selected, .map-shelf--locked, .map-shelf--fully-locked, .map-shelf--has-conflicts to use :where(rect.map-shelf, path.map-shelf) so they cannot cascade onto <text>/<tspan> children of shelf groups.
- 'hatch-defs' → in admin/components/map-editor.js initMapEditor, move the hatch-pattern <defs> block from the separate hidden <svg> sibling into the loaded floor SVG itself (append after the SVG loads). Alternatively, rename id="map-shelf-hatch" to id="primo-map-shelf-hatch-defs" to avoid collision; pick whichever the diagnostic data supports.
- 'container-scaling' → in admin/components/map-editor/svg-loader.js loadFloorSvg, after parsing the SVG, set width and height attributes on the <svg> element from its viewBox ('0 0 W H' → width="W" height="H") so the browser does not auto-fit the container.

VERIFY (after the fix):
- Editor canvas snapshot diff vs CloudFront standalone: misaligned-count = 0 (sub-pixel threshold ≥1px).
- All existing E2E tests still pass: \`npx playwright test --project=chromium\`.
- Console clean throughout the editor session.

COMMIT once: fix(map-editor): SVG text alignment in editor canvas (closes #2)
Commit body should mention the diagnosed cause: "Diagnosed via probe: ${args.cause}".

DO NOT bypass git hooks. DO NOT push.

OUTPUT: JSON {success, commits[], filesChanged[], cause, failureReason?}.`,
      context: args,
      instructions: [
        'Apply only the minimal change for the identified cause — do not refactor surrounding code.',
        'Re-run the diagnostic snapshot after the fix to confirm misaligned-count=0.',
        'Capture real test output.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        commits: { type: 'array', items: { type: 'string' } },
        filesChanged: { type: 'array', items: { type: 'string' } },
        cause: { type: 'string' },
        failureReason: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-2', 'fix', 'issue-2'],
}));

export const phase2QualityGateTask = defineTask('phase2-quality-gate', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 2: quality gate (snapshots, E2E, console)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer',
      task: `Run Phase 2 quality gate.

PROJECT ROOT: ${args.projectRoot}
BRANCH: ${args.branchName}

CHECKS:
1. Generate or update phase 2 snapshots:
   \`npx playwright test e2e/tests/map-editor-ux.spec.ts --grep "@phase-2" --update-snapshots=missing\`
   Snapshots produced: 'svg-aligned-canvas-en-admin.png', 'svg-aligned-canvas-he-admin.png' (LTR + RTL).
2. Existing E2E pass: \`npx playwright test --project=chromium 2>&1 | tail -40\`.
3. Console clean during phase-2 spec: zero console.error / console.warn.
4. Unit tests still pass: \`npx jest 2>&1 | tail -20\`.

OUTPUT: JSON {allPassed, gates, failures, generatedBaselines: string[]}.`,
      context: args,
      instructions: [
        'Run commands exactly. Capture real output.',
        'List generated baseline file paths so the approval-gate task can find them.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['allPassed'],
      properties: {
        allPassed: { type: 'boolean' },
        gates: { type: 'object' },
        failures: { type: 'array', items: { type: 'string' } },
        generatedBaselines: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-2', 'quality-gate'],
}));

export const phase2BaselineApprovalGateTask = defineTask('phase2-baseline-approval', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 2: human approval of baseline PNGs via brainstorm visual companion',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Approval-gate orchestrator',
      task: `Post phase-2 baseline PNGs to the brainstorm visual companion server and wait for human approval.

PROJECT ROOT: ${args.projectRoot}
SCREEN DIR: ${args.brainstormScreenDir}
STATE DIR: ${args.brainstormStateDir}
BRAINSTORM URL: ${args.brainstormUrl}

STEPS:
1. Verify the brainstorm server is alive: read \`${args.brainstormStateDir}/server-info\`. If absent, set success=false with reason "brainstorm-server-down" and return.
2. Locate the phase-2 baselines: \`e2e/tests/__screenshots__/map-editor-ux.spec.ts/svg-aligned-canvas-en-admin.png\` and \`...he-admin.png\`. Verify both exist.
3. Read each PNG, base64-encode, embed in a content fragment HTML file.
4. Write the file to ${args.brainstormScreenDir}/phase2-approval.html with this structure:
   - Heading: "Phase 2 baseline approval — SVG alignment fix"
   - Two embedded images side-by-side (or stacked) with labels "EN-LTR" and "HE-RTL"
   - One <div class="options" data-multiselect> with two options: "Approve EN-LTR" (data-choice="approve-en") and "Approve HE-RTL" (data-choice="approve-he"), and two reject options: "Reject EN-LTR" / "Reject HE-RTL". Use the visual-companion CSS classes from the frame template.
   - Subtitle: "Click Approve for both, or Reject and explain in terminal."
5. Tell the user (in a single line): "Phase 2 baselines on ${args.brainstormUrl} — approve both to lock, or reject with terminal-text feedback."
6. Poll ${args.brainstormStateDir}/events with up to 30 minute timeout. Read JSONL events. Sum approve/reject clicks per baseline. Also read any incoming terminal-text messages (left for orchestrator handoff).
7. If both approved → success.
8. If any rejected → return rejectionFeedback containing which baseline + the terminal-text reason if any.

DO NOT commit baselines here — that's the next task.
DO NOT modify the baselines themselves.

OUTPUT: JSON {success, allApproved, approvedCount, rejectedCount, baselines: {path, approved}[], rejectionFeedback?, terminalNote?}.`,
      context: args,
      instructions: [
        'Use Read/Bash to inspect files and Write to push the HTML fragment.',
        'Use base64 encoding via Node Buffer or shell base64 — pick whichever is reliable on this OS.',
        'Honour the brainstorm screen-dir convention: never reuse filenames; this file is named phase2-approval.html.',
        'Polling: re-read events file periodically; emit a "still-waiting" log line every 60s but do not spam.',
        'Return concrete rejection reasons so the next attempt can refine intelligently.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'allApproved'],
      properties: {
        success: { type: 'boolean' },
        allApproved: { type: 'boolean' },
        approvedCount: { type: 'number' },
        rejectedCount: { type: 'number' },
        baselines: { type: 'array' },
        rejectionFeedback: { type: 'object' },
        terminalNote: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-2', 'approval-gate', 'visual-companion'],
}));

export const phase2BaselineCommitTask = defineTask('phase2-baseline-commit', (args, taskCtx) => ({
  kind: 'shell',
  title: 'Phase 2: commit approved baselines',
  shell: {
    command: 'git',
    args: [
      '-C', args.projectRoot,
      'add', 'e2e/tests/__screenshots__/map-editor-ux.spec.ts/svg-aligned-canvas-en-admin.png',
      'e2e/tests/__screenshots__/map-editor-ux.spec.ts/svg-aligned-canvas-he-admin.png',
    ],
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-2', 'commit-baselines'],
  // Follow-up commit step is performed by chaining a second shell task below.
}));

// Note: babysitter shell tasks run a single command. The actual commit is a chained
// agent-task that runs `git add` + `git commit` together with the phase-2 message.
// The above is a placeholder showing the staging step; the orchestrator function
// uses an agent task in practice for two-step commands. See phase3BaselineCommitTask
// below for the canonical pattern.

// ============================================================================
// Phase 3 — Polish (#1, #4, #5, #6)
// ============================================================================

export const phase3DesignTokensTask = defineTask('phase3-design-tokens', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 3: design-tokens addendum (spacing-system + visual-hierarchy + layout-grid)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'UI design engineer',
      task: `Produce admin/styles/design-tokens.css for the Map Editor UX polish, applying the principles from three ui-design skills.

PROJECT ROOT: ${args.projectRoot}
SPEC: ${args.projectRoot}/${args.specPath} — see §7.1 for the exact token list.

WHAT THE TOKENS MUST COVER:
- Spacing scale (--space-half, --space-1..--space-6) referenced by row spacing (#4), input padding (#5), and the layout column structure (#1).
- Border tokens (--border-input, --border-input-hover, --border-input-focus, --border-row-divider) used by input affordance (#5) and row separators (#4).
- Background tokens (--bg-input-idle, --bg-input-hover, --bg-input-focus, --bg-row-hover) used by input states (#5) and row hover (#4).
- Layout tokens (--drawer-min-height, --drawer-max-height) used by the canvas+drawer flex layout (#1).

PRINCIPLES TO APPLY:
- spacing-system: base unit = 4px; doubling scale (4 8 12 16 24 32). Add a 2px sub-unit (--space-half) for tight in-row gaps.
- visual-hierarchy: input idle should look subtly elevated vs static text (border + light background). Hover strengthens. Focus uses 2px outline. Locked state is muted but distinct from idle.
- layout-grid: drawer is a fixed-flex region; canvas takes remaining flex; no overlap. Min-height keeps drawer usable; max-height prevents map collapse.

DELIVERABLE:
- Create admin/styles/design-tokens.css with the :root { --token: value; ... } block. Values exactly match spec §7.1.
- Modify admin/index.html to <link> design-tokens.css BEFORE app.css.

VERIFY:
- Open the editor (or run a Playwright smoke test) and confirm no CSS console warnings.
- Inspect computed styles on .map-drawer__row to confirm the tokens resolve.

COMMIT once: feat(map-editor): design-tokens addendum for UX polish

OUTPUT: JSON {success, commits[], filesChanged[], failureReason?}.`,
      context: args,
      instructions: [
        'Token values must match the spec exactly — do not invent your own scale.',
        'Make sure the design-tokens.css <link> precedes app.css so consuming rules in app.css can use the variables.',
        'No new dependencies. Pure CSS custom properties.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        commits: { type: 'array', items: { type: 'string' } },
        filesChanged: { type: 'array', items: { type: 'string' } },
        failureReason: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-3', 'ui-design', 'tokens'],
}));

export const phase3LayoutFixTask = defineTask('phase3-layout-fix', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 3: drawer layout fix (closes #1)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior frontend engineer',
      task: `Implement the drawer-layout fix from spec §7.2.

PROJECT ROOT: ${args.projectRoot}

CHANGES:
- admin/components/map-editor.js initMapEditor: ensure the top-level #map-editor-view markup is a flex column (header + #map-canvas + .map-drawer).
- admin/styles/app.css:
  - #map-editor-view → display: flex; flex-direction: column; height: 100vh; min-height: 0
  - #map-canvas → flex: 1; min-height: 0; overflow: auto (so canvas scrolls if content exceeds viewport)
  - .map-drawer → DROP "position: fixed; bottom: 0;". ADD flex-shrink: 0; min-height: var(--drawer-min-height); max-height: var(--drawer-max-height).
- Verify drawer + canvas layout never overlap: open editor, click bottom-most shelf, confirm shelf is still visible.

VERIFY:
- All existing E2E pass.
- New behavior assertion (write into e2e/tests/map-editor-ux.spec.ts): "drawer does not overlay canvas" — assert that .map-drawer's bounding-box top > #map-canvas's bounding-box bottom (or equal, never overlap).
- Console clean.

COMMIT once: feat(map-editor): drawer no longer overlays canvas (closes #1)

OUTPUT: JSON {success, commits[], filesChanged[], failureReason?}.`,
      context: args,
      instructions: [
        'Do not change anything unrelated to layout.',
        'New behavior assertion goes into the new e2e/tests/map-editor-ux.spec.ts file (creating it if necessary).',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        commits: { type: 'array', items: { type: 'string' } },
        filesChanged: { type: 'array', items: { type: 'string' } },
        failureReason: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-3', 'layout', 'issue-1'],
}));

export const phase3DrawerPolishTask = defineTask('phase3-drawer-polish', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 3: drawer polish (closes #4 #5 #6)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior frontend engineer',
      task: `Implement the drawer polish from spec §7.3 in a single commit.
${args.rejectionFeedback ? `\nPREVIOUS BASELINE WAS REJECTED:\n${JSON.stringify(args.rejectionFeedback, null, 2)}\nApply the corrective changes for the rejected baselines.` : ''}

PROJECT ROOT: ${args.projectRoot}

#4 — Row spacing (admin/styles/app.css):
- .map-drawer__row → grid-template-columns: 1.4fr 1fr 1fr auto auto; gap: var(--space-1); padding: var(--space-half) 0; align-items: center; border-radius: 3px.
- .map-drawer__row:hover → background: var(--bg-row-hover).
- .map-drawer__row + .map-drawer__row → border-top: 1px solid var(--border-row-divider).
- .map-drawer__rows → display: flex; flex-direction: column; gap: var(--space-half).

#5 — Input affordance (admin/styles/app.css):
- .map-drawer__row input, .map-drawer__row select → border: 1px solid var(--border-input); background: var(--bg-input-idle); padding: 2px 6px; border-radius: 3px; font-size: 13px; transition: background 120ms ease, border-color 120ms ease.
- :hover → background: var(--bg-input-hover); border-color: var(--border-input-hover).
- :focus → outline: 2px solid var(--border-input-focus); outline-offset: 1px; background: var(--bg-input-focus).
- .map-drawer__row--locked input, .map-drawer__row--locked select → background: #e2e8f0; color: #94a3b8; cursor: not-allowed (rule MUST come last so it overrides).

#6 — Drawer close (admin/components/map-editor/shelf-drawer.js, admin/components/map-editor.js):
- shelf-drawer.js showSingleShelf header: add <button id="drawer-close" aria-label="..." title="...">×</button>. aria-label and title use i18n.t('mapEditor.close').
- map-editor.js mountDrawer call: supply onClose: () => { shelfState.clearSelection(); applySelection(shelfElements, []); window.dispatchEvent(new CustomEvent('mapeditor:selection-changed')); }.
- map-editor.js initMapEditor: add document.addEventListener('keydown', e => {...}) — Esc handler. If reassign-mode active: return (let it handle). If pendingEdits().size > 0: confirm() with i18n.t('mapEditor.unsavedChangesConfirm'); on confirm: revert + clear + dispatch. Otherwise: clear + dispatch.

i18n additions (admin/i18n/en.json, admin/i18n/he.json):
- mapEditor.close: "Close" / "סגור"
- mapEditor.unsavedChangesConfirm: "You have unsaved changes. Discard and close?" / "יש שינויים שלא נשמרו. לבטל ולסגור?"

NEW UNIT TEST (admin/__tests__/map-editor-esc.test.js):
- Test the Esc handler's pending-edits-confirm branch deterministically (mock confirm dialog).

NEW BEHAVIOR ASSERTIONS (e2e/tests/map-editor-ux.spec.ts):
- Click #drawer-close → drawer is hidden, shelf deselected.
- Esc with no pending edits → drawer hidden, no confirm dialog.
- Esc with pending edits → confirm dialog appears; cancelling keeps drawer + edits intact; confirming reverts + closes.
- Esc during reassign-mode → reassign cancels, drawer remains open.

VERIFY:
- All existing E2E pass.
- New behavior assertions pass.
- New unit test passes.
- Console clean.

COMMIT once: feat(map-editor): drawer close affordance + row polish (closes #4 #5 #6)

OUTPUT: JSON {success, commits[], filesChanged[], failureReason?}.`,
      context: args,
      instructions: [
        'Order of CSS rules matters: locked-row rule must come AFTER hover/focus rules to override them.',
        'Both i18n files must be updated together — never one without the other.',
        'New behavior assertions go in e2e/tests/map-editor-ux.spec.ts (created in phase3-layout-fix).',
        'Use the existing project conventions (vanilla JS, ES modules, v=N cache-busting on imports).',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        commits: { type: 'array', items: { type: 'string' } },
        filesChanged: { type: 'array', items: { type: 'string' } },
        failureReason: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-3', 'polish', 'issue-4', 'issue-5', 'issue-6'],
}));

export const phase3QualityGateTask = defineTask('phase3-quality-gate', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 3: full quality gate (16 baselines × 4 projects + behavior + console + unit)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer',
      task: `Run Phase 3 quality gate.

PROJECT ROOT: ${args.projectRoot}

CHECKS:
1. Configure Playwright projects (in playwright.config.ts) for the four locale × role combinations: en-admin, he-admin, en-editor, he-editor. Each uses the corresponding storageState fixture.
2. Run the phase-3 snapshot suite with --update-snapshots=missing across all four projects:
   \`npx playwright test e2e/tests/map-editor-ux.spec.ts --grep "@phase-3" --update-snapshots=missing\`
   Snapshots produced (16 PNGs total):
   - drawer-closed-{en|he}-{admin|editor}.png
   - drawer-open-single-shelf-{en|he}-{admin|editor}.png
   - drawer-open-input-focused-{en|he}-{admin|editor}.png
   - drawer-open-locked-row-{en|he}-{admin|editor}.png
3. Behavior assertions in map-editor-ux.spec.ts pass (drawer-no-overlay, click-close, Esc no-pending, Esc with-pending confirm, Esc reassign-active no-op).
4. Existing E2E pass: \`npx playwright test --project=en-admin\` (full suite, default project).
5. Console clean: zero console.error / console.warn during any phase-3 test.
6. Unit tests pass: \`npx jest 2>&1 | tail -20\` — including the new map-editor-esc.test.js.

OUTPUT: JSON {allPassed, gates: { snapshots, behavior, e2e, console, unit }, failures, generatedBaselines: string[]}.`,
      context: args,
      instructions: [
        'Run each step exactly. Capture real output.',
        'Generated baselines list MUST contain absolute paths so the approval-gate task can read them.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['allPassed'],
      properties: {
        allPassed: { type: 'boolean' },
        gates: { type: 'object' },
        failures: { type: 'array', items: { type: 'string' } },
        generatedBaselines: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-3', 'quality-gate'],
}));

export const phase3ResponsiveAuditTask = defineTask('phase3-responsive-audit', (args, taskCtx) => ({
  kind: 'skill',
  title: 'Phase 3: responsive audit at 1280/1024/768',
  skill: {
    name: 'responsive-audit',
    context: {
      projectRoot: args.projectRoot,
      route: '/admin/#map-editor',
      breakpoints: [1280, 1024, 768],
      checks: [
        'no horizontal overflow on #map-editor-view at any breakpoint',
        'drawer is fully visible (no clipping) at 768',
        'canvas SVG remains visible above the drawer at all breakpoints',
        'input affordance (#5 focus ring) is visible at all breakpoints',
        'close button (#6) is reachable at all breakpoints',
      ],
      outputFormat: 'JSON',
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-3', 'responsive-audit', 'ui-design'],
}));

export const phase3BaselineApprovalGateTask = defineTask('phase3-baseline-approval', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 3: human approval of 16 baseline PNGs via brainstorm visual companion',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Approval-gate orchestrator',
      task: `Post phase-3 baselines (16 PNGs) to the brainstorm visual companion server and wait for human approval.

PROJECT ROOT: ${args.projectRoot}
SCREEN DIR: ${args.brainstormScreenDir}
STATE DIR: ${args.brainstormStateDir}
BRAINSTORM URL: ${args.brainstormUrl}

BASELINES (16 PNGs at e2e/tests/__screenshots__/map-editor-ux.spec.ts/):
- drawer-closed-{en|he}-{admin|editor}.png
- drawer-open-single-shelf-{en|he}-{admin|editor}.png
- drawer-open-input-focused-{en|he}-{admin|editor}.png
- drawer-open-locked-row-{en|he}-{admin|editor}.png

STEPS:
1. Verify brainstorm server alive (read state-dir/server-info).
2. Verify all 16 PNGs exist; if any missing, set success=false reason="missing-baselines".
3. Build a content fragment ${args.brainstormScreenDir}/phase3-approval.html grouped by snapshot state (4 sections, each showing the 4 locale-role variants). Each PNG is base64-embedded with a label "EN-admin", "HE-admin", "EN-editor", "HE-editor".
4. Each section has its own multi-select with 4 approve options + 4 reject options. Total: 16 approve + 16 reject options across the screen.
5. Post a one-line message in terminal: "Phase 3 baselines on ${args.brainstormUrl} — approve all 16 or reject specific ones with terminal-text reasons."
6. Poll state-dir/events with up to 60-minute timeout. Aggregate clicks per baseline. Read terminal-text overrides.
7. Resolve approval status per baseline. allApproved = every PNG has at least one approve and zero rejects.

DO NOT commit baselines here.

OUTPUT: JSON {success, allApproved, approvedCount, rejectedCount, baselines[{path, approved}], rejectionFeedback?, terminalNote?}.`,
      context: args,
      instructions: [
        'Group baselines by snapshot state to keep the screen scannable.',
        'Long timeout (60 min) — phase-3 has 16 baselines and the user may pause.',
        'Capture rejection feedback verbatim from terminal text + click pattern.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'allApproved'],
      properties: {
        success: { type: 'boolean' },
        allApproved: { type: 'boolean' },
        approvedCount: { type: 'number' },
        rejectedCount: { type: 'number' },
        baselines: { type: 'array' },
        rejectionFeedback: { type: 'object' },
        terminalNote: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-3', 'approval-gate', 'visual-companion'],
}));

export const phase3RefineTask = defineTask('phase3-refine', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 3: refine drawer polish based on rejection feedback',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior frontend engineer',
      task: `Address baseline rejection feedback from phase 3 attempt ${args.attempt || 1}.

REJECTIONS:
${JSON.stringify(args.rejectionFeedback, null, 2)}

For each rejected baseline, identify the corresponding code surface (CSS rule, JS handler, i18n key) and apply the corrective change. Prefer minimal, targeted edits — do not refactor surrounding code.

PROJECT ROOT: ${args.projectRoot}

After changes, do NOT commit yet — the orchestrator will re-run the quality gate and approval task. Only commit if the orchestrator instructs (via subsequent commit task).

OUTPUT: JSON {success, filesChanged[], correctionsApplied: array<{baseline, correction}>, failureReason?}.`,
      context: args,
      instructions: [
        'Read each rejection note carefully and map to the spec section that defines the expected behavior.',
        'If the rejection is ambiguous, set success=false with a clear question for the user — better to halt than to guess wrong.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        filesChanged: { type: 'array', items: { type: 'string' } },
        correctionsApplied: { type: 'array' },
        failureReason: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-3', 'refine'],
}));

export const phase3BaselineCommitTask = defineTask('phase3-baseline-commit', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Phase 3: stage and commit approved baselines',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Release engineer',
      task: `Stage and commit the 16 approved phase-3 baselines plus the responsive-audit report (if any artifacts).

PROJECT ROOT: ${args.projectRoot}
BRANCH: ${args.branchName}

STEPS:
1. \`cd ${args.projectRoot}\`
2. \`git status --porcelain\` — confirm only e2e/tests/__screenshots__/** and (optionally) responsive-audit artifacts are unstaged.
3. \`git add e2e/tests/__screenshots__/map-editor-ux.spec.ts/\`
4. \`git commit -m "test(map-editor): lock approved baselines for phase 3 (16 snapshots × locale × role)"\`
5. Capture the resulting commit SHA via \`git rev-parse HEAD\`.

DO NOT push. DO NOT amend prior commits.

OUTPUT: JSON {success, commits[], failureReason?}.`,
      context: args,
      instructions: ['Verify commit landed. Return the SHA.'],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        commits: { type: 'array', items: { type: 'string' } },
        failureReason: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['phase-3', 'commit-baselines'],
}));

// ============================================================================
// Final verification + PR
// ============================================================================

export const finalVerificationTask = defineTask('final-verification', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Final verification: full quality gate + spec coverage',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer',
      task: `Run the final verification gate on branch ${args.branchName}.

PROJECT ROOT: ${args.projectRoot}

CHECKS (all must pass):
1. \`git -C ${args.projectRoot} branch --show-current\` returns ${args.branchName}.
2. Pre-feature tag exists: \`git tag --list ${preFeatureTag(args)}\`.
3. \`npx jest 2>&1 | tail -25\` — all unit tests pass.
4. \`npx playwright test 2>&1 | tail -60\` — all 113 existing E2E + 5 new behavior assertions + 18 snapshot baselines × 4 projects pass; nothing skipped.
5. Working tree clean: \`git status --porcelain\` returns empty.
6. Spec-coverage cross-check (see ${args.specPath} §12 done criteria):
   - Issue #1 closed: layout commit on branch.
   - Issue #2 closed: alignment commit on branch.
   - Issue #3 closed: deletion commit on branch + grep absence.
   - Issues #4 #5 #6 closed: polish commit on branch + matching baselines.
   For each, search git log on the branch for the corresponding commit message substring; report any gaps.
7. Commits on branch: ${args.commits ? JSON.stringify(args.commits) : 'check git log'}. Confirm count matches expected (≤ 7 source commits + 1-2 baseline-lock commits per spec §12).
8. Baseline approval audit: ${args.baselineApprovalsLog ? JSON.stringify(args.baselineApprovalsLog) : '(empty)'}.

DO NOT modify files. Verification only.

OUTPUT: JSON {allPassed, unit, e2e, coverageGaps: string[], tagPresent, branch, workingTreeClean, summary, failures: string[]}.`,
      context: args,
      instructions: [
        'Capture real test output, not paraphrased.',
        'List specific gaps; do not gloss over partial coverage.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['allPassed'],
      properties: {
        allPassed: { type: 'boolean' },
        unit: { type: 'object' },
        e2e: { type: 'object' },
        coverageGaps: { type: 'array', items: { type: 'string' } },
        tagPresent: { type: 'boolean' },
        branch: { type: 'string' },
        workingTreeClean: { type: 'boolean' },
        summary: { type: 'string' },
        failures: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['verification', 'final'],
}));

export const openPullRequestTask = defineTask('open-pull-request', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Open PR feat/map-editor-ux-polish → main',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Release engineer',
      task: `Open a pull request for the completed Map Editor UX Polish initiative.

PROJECT ROOT: ${args.projectRoot}
BRANCH: ${args.branchName}

STEPS:
1. Push branch: \`git push -u origin ${args.branchName}\`.
2. Open PR via gh:
   \`\`\`
   gh pr create --base main --head ${args.branchName} \\
     --title "Map Editor UX polish (closes #1 #2 #3 #4 #5 #6)" \\
     --body "<see body below>"
   \`\`\`
3. Body should be HEREDOC-formatted and include:
   ## Summary
   - Phase 1: removed multi-shelf batch-editing entirely (closes #3)
   - Phase 2: fixed SVG text alignment in editor canvas (closes #2)
   - Phase 3: drawer no longer overlays canvas (#1); design tokens addendum; row spacing (#4); input affordance (#5); explicit close button + Esc handler (#6)

   ## Quality gate
   - 113 existing E2E tests pass
   - 5 new behavior assertions pass
   - 18 visual snapshots locked (2 phase-2 + 16 phase-3 across locale × role)
   - Console clean, no warnings/errors
   - Responsive audit passed at 1280/1024/768
   - Unit tests pass

   ## Baseline approval audit
   ${args.baselineApprovalsLog ? JSON.stringify(args.baselineApprovalsLog, null, 2) : '(empty)'}

   ## Test plan
   - [ ] Pull branch locally and run \`npx playwright test\` — all green.
   - [ ] Open admin in browser, verify drawer behavior matches the locked baselines.
   - [ ] Confirm Hebrew RTL renders correctly.
   - [ ] Smoke-test as both admin and editor.

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

4. Capture the PR URL from gh's output.

DO NOT merge. The user will review and merge manually.

OUTPUT: JSON {success, prUrl, failureReason?}.`,
      context: args,
      instructions: [
        'Use a HEREDOC for --body; format with markdown.',
        'Capture the URL from gh output.',
        'If gh push fails (auth, branch protection), set success=false with concrete reason — do not retry blindly.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        prUrl: { type: 'string' },
        failureReason: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['pr', 'finalize'],
}));
