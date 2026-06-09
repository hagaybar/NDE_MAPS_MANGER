/**
 * @process primo-maps/fix-password-reset
 * @description Fix the admin password-reset feature end to end with strict TDD and a 100%-green gate after every change. Milestone 1: stop the email FLOOD (one "Reset password" click currently sends N Cognito emails because initUserManagement() re-binds delegated listeners on the persistent #user-list-container on every visit to the Users tab — #151 only guarded per-instance re-renders, not re-inits). Milestone 2: make reset USABLE (the reset email is a bare Cognito verification code with a misleading Lambda "temporary password" message and no completion guidance; app logs in via Cognito Hosted UI). Owner picks the reset approach at one breakpoint; deploy is owner-gated. Client SPA + reset Lambda only; no auto-deploy; tests mock AWS so NO real reset/email is ever triggered.
 * @inputs { branch, baselineAdmin, baselineLambda }
 * @outputs { results, summary, deployChecklist }
 * @agent general-purpose
 */
import { defineTask } from '@a5c-ai/babysitter-sdk';

const REPO = '/home/hagaybar/projects/primo_maps';

// Shared, non-negotiable constraints (WORKFLOW.md HR1-HR7 + this repo's safety rules)
const CONSTRAINTS = [
  'WORKFLOW HR1/HR2: never weaken, skip, narrow, or delete a test to make a build pass. If a test seems wrong, surface a one-line spec dispute in the summary — do not edit it.',
  'WORKFLOW HR3/HR7: every behavioural change adds a test you OBSERVE go red then green in THIS run; never claim tests pass without executing them.',
  'TDD: write the failing test first, run it and OBSERVE red, then write the minimal implementation, run it and OBSERVE green. Name the test file in your summary.',
  `Stay on branch fix/users-password-reset (git checkout it; do NOT create another branch). Commit with the trailer: Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`,
  'NEVER deploy, push, run redeploy.sh, or touch AWS/S3/CloudFront/Cognito. No real AWS calls.',
  'CRITICAL SAFETY: this feature emails real users. Tests MUST mock userService / the AWS SDK so that NO real Cognito reset and NO real email is ever triggered. Never call the live reset endpoint.',
  '100% gate: after your change the FULL admin suite (cd admin && npm test) — and the FULL lambda suite (cd lambda && npm test) when you touched lambda/ — MUST be entirely green. Fix YOUR code until green; never weaken a test.',
  'If plan code needs a small real-world adjustment to actually pass (an import path, a DOM selector, a mock detail), make the minimal correct fix and report it in "adjustments". Never fake a green.',
];

// Precise, pre-confirmed root cause for the flood (already investigated this session) so the agent does not re-derive it wrong.
const FLOOD_ROOT_CAUSE = [
  "app.js showView('users') calls initUserManagement() unconditionally on EVERY visit to the Users tab (admin/app.js ~line 455) — no idempotency guard, and showView only toggles .hidden (it never removes listeners or destroys the old view).",
  "initUserManagement() (admin/components/user-management.js) does `userListInstance = new UserList(container)` each call. UserList guards its delegated click->dispatch listener with the per-INSTANCE flag this._actionClickBound (user-list.js ~553), so a brand-new instance re-binds another click listener on the SAME persistent #user-list-container element.",
  "initUserManagement() also calls setupEventListeners() (user-management.js ~39) which binds user-edit / user-delete / user-reset-password listeners directly on the persistent #user-list-container with NO guard at all.",
  "Net effect: every visit to the Users tab stacks another full set of listeners on the surviving container element. One physical 'Reset password' click then fans out to N handlers -> N user-reset-password dispatches -> N userService.resetPassword() calls -> N AdminResetUserPassword commands -> N Cognito emails. Edit and Delete are multi-dispatched the same way (data-integrity risk).",
  "PR #151 (432157d) only fixed accumulation across re-renders WITHIN a single UserList instance; it did not cover re-initialization across view navigations, nor the user-management-side delegated listeners. So #7 is effectively not fully fixed.",
  "Fix direction (choose the minimal correct implementation; prove it with the test): make Users-view wiring idempotent — bind the user-management delegated listeners exactly once for the lifetime of the persistent container (e.g. a module-level bound guard or a container dataset flag) AND stop stacking UserList click listeners (reuse the existing instance, or make the binding idempotent at the element level). loadUsers()/updateUsers() must still refresh the list. The regression test must drive initUserManagement() multiple times, fire ONE reset click, and assert userService.resetPassword is called EXACTLY once (and edit/delete once).",
];

// Confirmed context for the 'make reset usable' milestone.
const RESET_CONTEXT = [
  'admin/components/user-management.js handleResetPassword() -> admin/user-service.js resetPassword() -> POST /api/users/{username}/reset-password -> lambda/resetUserPassword.mjs.',
  'lambda/resetUserPassword.mjs uses AdminResetUserPasswordCommand. That command sets the account to RESET_REQUIRED and emails a BARE verification CODE via the Cognito forgot-password message template. It does NOT email a temporary password and does NOT set FORCE_CHANGE_PASSWORD — but the Lambda success message and code comments FALSELY claim "a temporary password has been sent" / "FORCE_CHANGE_PASSWORD". user-service.js resetPassword JSDoc also wrongly claims it returns a temporaryPassword.',
  'The admin app authenticates via Cognito HOSTED UI (OAuth code flow; admin/auth-service.js exchanges the code at hostedUiDomain/oauth2/token). The Hosted UI already provides the "Forgot your password?" completion screen (ConfirmForgotPassword = enter emailed code + new password) AND the forced-new-password challenge after an admin temp-password set. So NO new in-app password screen is strictly required for either option.',
  'Two viable approaches for the owner: (A) SELF-SERVICE CODE — keep AdminResetUserPassword, fix the misleading Lambda success message + JSDoc, and make the reset USABLE by improving the Cognito forgot-password email message (instructions: go to the login page, click "Forgot your password?", enter this code, set a new password) [the message template is a Cognito-console/CLI change = a manual deploy step, NOT code]. (B) ADMIN TEMP PASSWORD — switch the Lambda to AdminSetUserPassword (Permanent:false) to set a temporary password + force change at next login via Hosted UI, return that temp password to the admin in the response so the admin relays it to the user (the client already expects temporaryPassword); Cognito sends no email in this flow.',
];

export async function process(inputs, ctx) {
  const branch = (inputs && inputs.branch) || 'fix/users-password-reset';
  const results = [];
  let deployChecklist = null;

  // Small bounded refine loop: run a TDD impl task, then a 100% shell gate; if the
  // gate is red, feed the failure back and retry (max 3 attempts) before stopping.
  async function tddWithGate(label, implTaskDef, gateDefs, baseArgs) {
    let feedback = null;
    let last = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const impl = await ctx.task(implTaskDef, { ...baseArgs, attempt, feedback });
      last = impl;
      if (!impl || !impl.done) {
        return { ok: false, label, reason: (impl && impl.reason) || 'impl task did not finish', impl };
      }
      // Run every gate (admin and, when relevant, lambda). All must pass.
      const gateOutputs = [];
      let allGreen = true;
      for (const g of gateDefs) {
        const gate = await ctx.task(g.def, { label, attempt });
        const passed = !!gate && (gate.exitCode === 0 || gate.passed === true);
        gateOutputs.push({ name: g.name, passed, tail: gate && (gate.stdoutTail || gate.summary || '') });
        if (!passed) allGreen = false;
      }
      if (allGreen) {
        return { ok: true, label, impl, gates: gateOutputs, attempts: attempt };
      }
      feedback = `Attempt ${attempt} left a RED suite. Gate results: ` +
        gateOutputs.map(g => `${g.name}=${g.passed ? 'green' : 'RED'}`).join(', ') +
        '. Fix YOUR code (never weaken a test) until every suite is fully green, then return done:true.';
    }
    return { ok: false, label, reason: 'gate still red after 3 attempts', impl: last };
  }

  // ===========================================================================
  // MILESTONE 1 — STOP THE EMAIL FLOOD (client-only, urgent)
  // ===========================================================================
  const m1 = await tddWithGate(
    'flood',
    floodTddTask,
    [{ name: 'admin', def: gateAdminTask }],
    { branch }
  );
  results.push({ milestone: 1, name: 'stop-email-flood', ...m1, sha: m1.impl && m1.impl.sha });
  if (!m1.ok) {
    return finish(ctx, results, deployChecklist, 'Stopped in Milestone 1 (flood fix) — needs attention.');
  }

  // Widest-loop verification for the flood: prove it in a REAL Chromium harness (no real emails).
  const chromium = await ctx.task(floodChromiumTask, { branch });
  results.push({ milestone: 1, name: 'flood-chromium-verify', ...chromium });

  // ===========================================================================
  // MILESTONE 2 — MAKE RESET USABLE (Lambda + client; owner picks the approach)
  // ===========================================================================
  const investigation = await ctx.task(resetInvestigateTask, { branch });
  results.push({ milestone: 2, name: 'reset-investigation', ...investigation });

  // BREAKPOINT 1 (critical decision — owner): choose the reset approach.
  const approachBp = await ctx.breakpoint({
    question: 'Reset-password flow: which approach should we implement so users can actually complete a reset? (See artifacts/reset-options.md for the full tradeoffs.)',
    title: 'Choose reset-password approach',
    options: [
      'Option A - self-service code (keep AdminResetUserPassword; fix misleading messages; improve the Cognito forgot-password email so the code is usable via the Hosted UI "Forgot password" screen)',
      'Option B - admin temp password (AdminSetUserPassword + force change at login; return the temp password to the admin to relay; no email)',
    ],
    expert: 'owner',
    tags: ['approval-gate', 'product-decision'],
    context: {
      runId: ctx.runId,
      files: [{ path: 'artifacts/reset-options.md', format: 'markdown' }],
      recommendation: investigation && investigation.recommendation,
    },
  });
  results.push({ milestone: 2, name: 'approach-decision', approved: approachBp.approved, response: approachBp.response });

  const chosen = (approachBp.response || investigation.recommendation || 'Option A');

  const m2 = await tddWithGate(
    'reset-usable',
    resetImplementTask,
    [{ name: 'admin', def: gateAdminTask }, { name: 'lambda', def: gateLambdaTask }],
    { branch, chosenApproach: chosen }
  );
  results.push({ milestone: 2, name: 'implement-reset-usable', ...m2, sha: m2.impl && m2.impl.sha });
  if (!m2.ok) {
    return finish(ctx, results, deployChecklist, 'Stopped in Milestone 2 (reset usability) — needs attention.');
  }

  // ===========================================================================
  // FINAL — acceptance review + deploy/merge checklist (NO deploy here)
  // ===========================================================================
  const review = await ctx.task(finalReviewTask, {
    branch,
    chosenApproach: chosen,
    floodResult: m1.impl,
    chromium,
    resetResult: m2.impl,
  });
  results.push({ milestone: 3, name: 'final-acceptance-review', ...review });
  deployChecklist = review && review.deployChecklist;

  // BREAKPOINT 2 (deploy gate — alwaysBreakOn:deploy): owner decides deploy timing. No auto-deploy.
  const deployBp = await ctx.breakpoint({
    question: 'All changes are committed on the branch and every suite is 100% green. Deploy is owner-gated and must be coordinated with the deploy trap (#152 is currently deployed-from-its-branch). How do you want to proceed with deploy/merge?',
    title: 'Deploy / merge decision (owner-gated)',
    options: [
      'Defer deploy - leave it on the branch; I (owner) will coordinate deploy/merge later',
      'Proceed - walk me through the coordinated deploy now (Lambda + SPA + any Cognito message change)',
    ],
    expert: 'owner',
    tags: ['deploy', 'approval-gate'],
    context: { runId: ctx.runId, deployChecklist },
  });
  results.push({ milestone: 3, name: 'deploy-decision', approved: deployBp.approved, response: deployBp.response });

  return finish(ctx, results, deployChecklist, 'All milestones complete; suites 100% green; deploy owner-gated.');
}

function finish(ctx, results, deployChecklist, note) {
  const done = results.filter(r => r.ok || r.verified || r.acceptancePass || r.approved !== false).length;
  const summary =
    `primo-maps/fix-password-reset on fix/users-password-reset. ` +
    results.map(r => `[${r.milestone}] ${r.name}: ${r.ok === false ? 'FAILED(' + (r.reason || '') + ')' : (r.ok || r.verified || r.acceptancePass || r.approved ? 'ok' : 'done')}${r.sha ? ' ' + r.sha : ''}`).join('; ') +
    `. ${note} No deploy performed (owner-gated).`;
  return { results, summary, deployChecklist, metadata: { processId: 'primo-maps/fix-password-reset', timestamp: ctx.now() } };
}

// ===========================================================================
// TASK DEFINITIONS
// ===========================================================================

export const floodTddTask = defineTask('flood-tdd', (args, taskCtx) => ({
  kind: 'agent',
  title: `Stop email flood (TDD)${args.attempt > 1 ? ' — refine #' + args.attempt : ''}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior front-end engineer fixing a production bug with strict TDD',
      task: 'Stop the admin "Reset password" email flood: one click must trigger EXACTLY ONE userService.resetPassword call, no matter how many times the Users view was visited. Use TDD; no real emails.',
      context: {
        repo: REPO,
        branch: args.branch,
        rootCause: FLOOD_ROOT_CAUSE,
        constraints: CONSTRAINTS,
        previousFeedback: args.feedback || null,
        keyFiles: [
          'admin/app.js (showView -> initUserManagement, ~line 452-460)',
          'admin/components/user-management.js (initUserManagement, setupEventListeners ~39, handleResetPassword ~168)',
          'admin/components/user-list.js (delegated click->dispatch + _actionClickBound ~547-588)',
          'admin/__tests__/ (jest; run from admin/ with `npm test`)',
        ],
      },
      instructions: [
        `cd ${REPO} && git checkout ${args.branch}.`,
        'Read admin/app.js showView, admin/components/user-management.js, admin/components/user-list.js to confirm the wiring described in rootCause.',
        'TDD STEP 1 (RED): add a regression test (e.g. admin/__tests__/users-reset-flood.test.js). Build the user-management DOM (a #user-list-container and #add-user-btn), mock ../user-service.js so listUsers returns a couple of users and resetPassword is a jest.fn() that NEVER hits the network. Call initUserManagement() THREE times (simulating three visits to the Users tab), then dispatch ONE real "Reset password" click for a single user. Assert userService.resetPassword was called EXACTLY once. Add parallel assertions that one delete click -> one delete attempt and one edit click -> one edit attempt. Run `cd admin && npm test -- users-reset-flood` and OBSERVE it RED (multiple calls).',
        'TDD STEP 2 (GREEN): implement the minimal correct fix to make Users-view wiring idempotent (bind the user-management delegated listeners exactly once for the persistent container, and stop stacking UserList click listeners across inits — reuse the existing instance or guard at the element level). Keep loadUsers/updateUsers refreshing the list. Re-run the new test and OBSERVE it GREEN.',
        'Run the FULL admin suite: `cd admin && npm test`. It MUST be entirely green. Fix YOUR code (never weaken any test) until green.',
        'Commit on the branch (message: "fix(users): bind Users-view action listeners once across view re-inits so one reset click sends one email (#7)"), with the Co-Authored-By trailer. Do NOT push or deploy.',
        'Capture `git rev-parse --short HEAD` as sha. Return ONLY the JSON object.',
      ],
      outputFormat: 'JSON: { done(bool), suiteGreen(bool), sha, testFile, summary, adjustments, reason }',
    },
    outputSchema: {
      type: 'object',
      required: ['done', 'summary'],
      properties: {
        done: { type: 'boolean' }, suiteGreen: { type: 'boolean' }, sha: { type: 'string' },
        testFile: { type: 'string' }, summary: { type: 'string' }, adjustments: { type: 'string' }, reason: { type: 'string' },
      },
    },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['impl', 'flood'],
}));

export const floodChromiumTask = defineTask('flood-chromium-verify', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Verify flood fix in real Chromium (no real emails)',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer verifying a fix in a real browser (jsdom is not enough — see this repo\'s "verify UI in real Chromium" rule)',
      task: 'Prove in REAL Chromium that visiting the Users tab multiple times then clicking "Reset password" once results in EXACTLY ONE reset network call. Never hit the real API/Cognito; intercept/stub the network so no email is sent.',
      context: {
        repo: REPO, branch: args.branch, constraints: CONSTRAINTS,
        approach: 'Use the Playwright MCP browser tools. Serve the repo root statically (e.g. `npx http-server . -p 8123`), or build a tiny self-contained harness HTML under a temp/ or docs/manual-qa path that imports admin/components/user-management.js with auth + user-service mocked in-page, exposing a way to call initUserManagement() and to count POالسTs to **/reset-password. Stub fetch / route the reset endpoint so it returns 200 without sending anything.',
        note: 'The app normally requires Cognito Hosted UI login; do NOT attempt a real login. Drive the user-management module directly in a harness with mocked auth/services, OR intercept network at the Playwright layer. The goal is to count reset calls per single click after 3 view inits.',
      },
      instructions: [
        `cd ${REPO} && git checkout ${args.branch}.`,
        'Stand up a real Chromium page (Playwright MCP) against a local static server or a small harness you create.',
        'Simulate visiting the Users view 3 times (call initUserManagement 3x or navigate to it 3x), with network to **/reset-password intercepted and counted (return a fake 200; assert no real request leaves).',
        'Click "Reset password" for one user exactly once. Assert exactly ONE reset request was observed. Take a screenshot / capture the request count as evidence.',
        'If a full harness is impractical, clearly document exactly what you DID verify in real Chromium and what remains for owner manual QA — do not claim more than you proved.',
        'Clean up any temp harness files you created (or place them under docs/manual-qa/ and mention them). Return ONLY the JSON object.',
      ],
      outputFormat: 'JSON: { verified(bool), resetCallCount(number), evidence, caveats, summary }',
    },
    outputSchema: {
      type: 'object',
      required: ['verified', 'summary'],
      properties: {
        verified: { type: 'boolean' }, resetCallCount: { type: 'number' },
        evidence: { type: 'string' }, caveats: { type: 'string' }, summary: { type: 'string' },
      },
    },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['verify', 'flood'],
}));

export const resetInvestigateTask = defineTask('reset-investigate', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Investigate reset flow + write artifacts/reset-options.md',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'engineer + product analyst scoping a Cognito password-reset flow',
      task: 'Confirm exactly how the current reset flow behaves and write a crisp decision doc (artifacts/reset-options.md) with two concrete options and a recommendation, so the owner can choose.',
      context: { repo: REPO, branch: args.branch, resetContext: RESET_CONTEXT, constraints: CONSTRAINTS },
      instructions: [
        `cd ${REPO} && git checkout ${args.branch}.`,
        'Read lambda/resetUserPassword.mjs, admin/user-service.js (resetPassword), admin/components/user-management.js (handleResetPassword), admin/auth-service.js + admin/auth-config.js (confirm Hosted UI). Verify the resetContext facts against the code.',
        'Write artifacts/reset-options.md describing: the confirmed current behaviour (bare verification code + misleading "temporary password" message + no in-app completion), and TWO options — (A) self-service code via Hosted UI Forgot-Password + message-template fix, (B) admin temp password via AdminSetUserPassword. For EACH option list: exact code changes (files), the Cognito-console/CLI manual step (if any), test impact, user experience, and pros/cons. End with a clear one-line recommendation.',
        'Do NOT change product code in this task (you may create the artifacts/ doc). Do NOT call AWS. Return ONLY the JSON object.',
      ],
      outputFormat: 'JSON: { recommendation, optionA, optionB, artifactPath, summary }',
    },
    outputSchema: {
      type: 'object',
      required: ['recommendation', 'summary'],
      properties: {
        recommendation: { type: 'string' }, optionA: { type: 'string' }, optionB: { type: 'string' },
        artifactPath: { type: 'string' }, summary: { type: 'string' },
      },
    },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['investigate', 'reset'],
}));

export const resetImplementTask = defineTask('reset-implement', (args, taskCtx) => ({
  kind: 'agent',
  title: `Implement chosen reset approach (TDD)${args.attempt > 1 ? ' — refine #' + args.attempt : ''}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior engineer implementing the owner-approved reset approach with strict TDD',
      task: `Implement the owner-chosen reset approach so users can actually complete a password reset. Chosen approach: ${args.chosenApproach}. Use TDD; mock the AWS SDK so NO real Cognito call/email happens.`,
      context: {
        repo: REPO, branch: args.branch, chosenApproach: args.chosenApproach,
        resetContext: RESET_CONTEXT, constraints: CONSTRAINTS, previousFeedback: args.feedback || null,
        alwaysFix: 'Regardless of option: fix the FALSE "temporary password"/"FORCE_CHANGE_PASSWORD" wording in lambda/resetUserPassword.mjs (message + comments) and the wrong temporaryPassword JSDoc in admin/user-service.js resetPassword, so the code is honest about what actually happens.',
      },
      instructions: [
        `cd ${REPO} && git checkout ${args.branch}. Read artifacts/reset-options.md for the chosen approach details.`,
        'TDD: for each behavioural change write the failing test first (lambda/__tests__ for Lambda changes — mock @aws-sdk/client-cognito-identity-provider so no real command is sent; admin/__tests__ for client changes), OBSERVE red, implement minimal code, OBSERVE green.',
        'Implement ONLY the chosen approach. Fix the misleading Lambda success message/comments and the user-service JSDoc as described in alwaysFix (add/adjust tests that pin the corrected contract).',
        'If the chosen approach needs a Cognito-console/CLI message-template change or other AWS step, DO NOT perform it — record it precisely in manualSteps for the deploy checklist.',
        'Run the FULL admin suite AND the FULL lambda suite (cd admin && npm test ; cd lambda && npm test). BOTH must be entirely green. Fix YOUR code (never weaken a test) until green.',
        'Commit on the branch (clear conventional message referencing the reset flow), with the Co-Authored-By trailer. Do NOT push/deploy/touch AWS. Capture short SHA. Return ONLY the JSON object.',
      ],
      outputFormat: 'JSON: { done(bool), suiteGreen(bool), lambdaGreen(bool), sha, manualSteps, summary, adjustments, reason }',
    },
    outputSchema: {
      type: 'object',
      required: ['done', 'summary'],
      properties: {
        done: { type: 'boolean' }, suiteGreen: { type: 'boolean' }, lambdaGreen: { type: 'boolean' },
        sha: { type: 'string' }, manualSteps: { type: 'string' }, summary: { type: 'string' },
        adjustments: { type: 'string' }, reason: { type: 'string' },
      },
    },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['impl', 'reset'],
}));

export const finalReviewTask = defineTask('final-acceptance-review', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Final acceptance review + deploy/merge checklist',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'tech lead doing final acceptance against the user request',
      task: 'Confirm both milestones meet the acceptance criteria and produce a precise deploy/merge checklist. Do NOT deploy.',
      context: {
        repo: REPO, branch: args.branch, chosenApproach: args.chosenApproach,
        floodResult: args.floodResult, chromium: args.chromium, resetResult: args.resetResult,
        acceptance: [
          'FLOOD: one Reset-password click triggers exactly one resetPassword call across repeated Users-tab visits — proven by a red->green jest test AND real-Chromium verification.',
          'USABLE: the chosen reset approach lets a user actually complete a reset; the Lambda/JSDoc no longer claim a false "temporary password" behaviour.',
          'Both the admin suite and lambda suite are 100% green; no test was weakened (HR1).',
        ],
        deployNote: 'Deploy trap: #152 is currently deployed FROM ITS BRANCH. A redeploy.sh from main reverts it; deploying this branch reverts #152. The checklist MUST flag coordinating these (merge #152 first, or deploy carefully) and list: Lambda deploy (resetUserPassword) if changed, SPA redeploy, any Cognito message-template/CLI step from manualSteps, and a CloudFront invalidation.',
      },
      instructions: [
        `cd ${REPO} && git checkout ${args.branch}. Re-run both suites (cd admin && npm test ; cd lambda && npm test) and confirm green yourself.`,
        'Verify each acceptance bullet against the actual committed code + the prior task outputs. List any gaps honestly.',
        'Produce deployChecklist: an ordered list of exactly what must happen to ship safely (incl. the #152 coordination and any Cognito manual step). Do NOT perform any of it.',
        'Return ONLY the JSON object.',
      ],
      outputFormat: 'JSON: { acceptancePass(bool), gaps, deployChecklist (array of strings), summary }',
    },
    outputSchema: {
      type: 'object',
      required: ['acceptancePass', 'summary'],
      properties: {
        acceptancePass: { type: 'boolean' }, gaps: { type: 'string' },
        deployChecklist: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
      },
    },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['review'],
}));

export const gateAdminTask = defineTask('gate-admin-suite', (args, taskCtx) => ({
  kind: 'shell',
  title: `100% gate: full admin suite (${args.label})`,
  shell: { command: `cd ${REPO}/admin && npm test` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['gate', 'admin', args.label || ''],
}));

export const gateLambdaTask = defineTask('gate-lambda-suite', (args, taskCtx) => ({
  kind: 'shell',
  title: `100% gate: full lambda suite (${args.label})`,
  shell: { command: `cd ${REPO}/lambda && npm test` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['gate', 'lambda', args.label || ''],
}));
