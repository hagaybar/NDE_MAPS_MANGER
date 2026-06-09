/**
 * @process primo-maps/finish-set-temp-password
 * @description Finish the admin "set a temporary password" feature (force-change at next login, no email): build the admin UI that shows the generated temp password to the admin (copyable, with instructions), reconcile the now-obsolete #152 email-resend states, i18n en+he, strict TDD, 100% green admin+lambda suites, then merge to main and deploy (surgical Lambda + SPA) and verify live. The Lambda half (AdminSetUserPassword + temp-password generation, returns { message, username, temporaryPassword }) is ALREADY committed on the branch. Owner delegated full autonomy ("do it via babysitter run, inform me when done") — no interactive breakpoints; deploy is pre-authorized but gated on 100%-green suites. Owner SSO is active.
 * @inputs { branch }
 * @outputs { results, summary, deployed }
 * @agent general-purpose
 */
import { defineTask } from '@a5c-ai/babysitter-sdk';

const REPO = '/home/hagaybar/projects/primo_maps';

const CONSTRAINTS = [
  'WORKFLOW HR1/HR2: never weaken/skip/delete a test to pass. Removing the obsolete #152 email-resend behaviour is a legitimate behaviour change — update those tests honestly to the new no-email design, do not gut unrelated coverage.',
  'HR3/HR7: observe red→green this run for each behavioural change; never claim green without running.',
  'TDD: failing test first, observe red, minimal code, observe green.',
  'Stay on branch fix/admin-set-temp-password. Commit with trailer: Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.',
  'SECURITY: the temporary password is sensitive. NEVER console.log it. Show it to the admin in the UI only. Tests must use mocked values — no real Cognito.',
  '100% gate: full admin suite (cd admin && npm test) AND full lambda suite (cd lambda && npm test) must be entirely green.',
];

// Already-true context the client agent must build against.
const LAMBDA_CONTRACT = [
  'lambda/resetUserPassword.mjs now calls AdminSetUserPassword(Permanent:false) — sets a temp password + FORCE_CHANGE_PASSWORD, sends NO email.',
  'POST /api/users/{username}/reset-password returns 200 { message, username, temporaryPassword }. temporaryPassword is the value the admin must give the user.',
  'admin/user-service.js resetPassword() already returns the parsed body (it will now include temporaryPassword) — update its JSDoc to document the new contract.',
];

const CLIENT_SPEC = [
  'On a successful "Reset password" action, DISPLAY the returned temporaryPassword to the admin in a small dialog: a readonly field with the password + a Copy button + clear instructions, e.g. "Give this temporary password to {username}. They will be asked to choose their own password the next time they sign in." Reuse the existing dialog style (see admin/components/delete-user-confirm-dialog.js / edit-user-dialog.js for the pattern).',
  'Reconcile the #152 email-resend affordance, which is now obsolete (no email is sent): remove the persistent "✓ Sent · Resend" marker + resetSentUsernames/markResetSent email semantics from user-list.js. Keep a transient in-flight disabled state during the request (e.g. "Working…"); the success feedback is the temp-password dialog. The admin can click "Reset password" again to generate a new temp password.',
  'Update the #152 tests in admin/__tests__/user-list.test.js (and any reset-flow tests) to the new no-email behaviour — honestly (HR2), not by weakening.',
  'i18n: add the new strings to admin/i18n/en.json + he.json (dialog title, instructions with {username}, Copy, Copied) and any FALLBACKS the component uses. Provide natural Hebrew.',
  'Keep the existing flood guard + the users-reset-flood / users-locale-rerender tests passing.',
  'SECURITY: do not console.log the password anywhere.',
];

export async function process(inputs, ctx) {
  const branch = (inputs && inputs.branch) || 'fix/admin-set-temp-password';
  const results = [];
  let deployed = false;

  // ---- Build the client UI (TDD) with a refine loop against the 100% gates ----
  let feedback = null, client = null, gatesOk = false;
  for (let attempt = 1; attempt <= 3 && !gatesOk; attempt++) {
    client = await ctx.task(clientUiTask, { branch, attempt, feedback });
    if (!client || !client.done) {
      results.push({ step: 'client-ui', ok: false, reason: (client && client.reason) || 'client task did not finish' });
      return finish(ctx, results, false, 'Stopped: client UI task did not finish.');
    }
    const admin = await ctx.task(gateAdminTask, { attempt });
    const lambda = await ctx.task(gateLambdaTask, { attempt });
    const ap = !!admin && (admin.exitCode === 0 || admin.passed === true);
    const lp = !!lambda && (lambda.exitCode === 0 || lambda.passed === true);
    gatesOk = ap && lp;
    results.push({ step: 'client-ui+gates', attempt, ok: gatesOk, sha: client.sha, admin: ap, lambda: lp });
    if (!gatesOk) feedback = `Attempt ${attempt}: admin=${ap ? 'green' : 'RED'}, lambda=${lp ? 'green' : 'RED'}. Fix YOUR code (never weaken a test) until both suites are fully green.`;
  }
  if (!gatesOk) return finish(ctx, results, false, 'Stopped: suites still red after 3 attempts — NOT deploying.');

  // ---- Merge to main (deploy from main, not branch) ----
  const merge = await ctx.task(mergeTask, { branch });
  results.push({ step: 'merge-to-main', ok: !!merge && (merge.exitCode === 0 || merge.passed === true), tail: merge && merge.stdoutTail });
  if (!(merge && (merge.exitCode === 0 || merge.passed === true))) {
    return finish(ctx, results, false, 'Stopped: merge to main failed — NOT deploying. Branch is built + green; needs attention.');
  }

  // ---- Deploy (pre-authorized): surgical Lambda + SPA, then verify live ----
  const dl = await ctx.task(deployLambdaTask, {});
  results.push({ step: 'deploy-lambda', ok: !!dl && (dl.exitCode === 0 || dl.passed === true), tail: dl && dl.stdoutTail });
  const ds = await ctx.task(deploySpaTask, {});
  results.push({ step: 'deploy-spa', ok: !!ds && (ds.exitCode === 0 || ds.passed === true), tail: ds && ds.stdoutTail });
  const vr = await ctx.task(verifyLiveTask, {});
  results.push({ step: 'verify-live', ok: !!vr && (vr.exitCode === 0 || vr.passed === true), tail: vr && vr.stdoutTail });
  deployed = results.filter(r => ['deploy-lambda', 'deploy-spa', 'verify-live'].includes(r.step)).every(r => r.ok);

  return finish(ctx, results, deployed, deployed ? 'Built, merged, deployed (Lambda + SPA) and verified live.' : 'Built + merged; a deploy/verify step needs attention.');
}

function finish(ctx, results, deployed, note) {
  const summary = `primo-maps/finish-set-temp-password: ` +
    results.map(r => `${r.step}=${r.ok ? 'ok' : 'FAIL'}${r.sha ? '(' + r.sha + ')' : ''}`).join('; ') +
    `. ${note}`;
  return { results, summary, deployed, metadata: { processId: 'primo-maps/finish-set-temp-password', timestamp: ctx.now() } };
}

export const clientUiTask = defineTask('client-ui-temp-password', (args, taskCtx) => ({
  kind: 'agent',
  title: `Admin temp-password UI (TDD)${args.attempt > 1 ? ' — refine #' + args.attempt : ''}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior front-end engineer building a security-sensitive admin UI with strict TDD',
      task: 'Build the admin UI that shows the generated temporary password to the admin (copyable + instructions) when resetting a user password, and reconcile the obsolete #152 email-resend states. Use TDD.',
      context: { repo: REPO, branch: args.branch, lambdaContract: LAMBDA_CONTRACT, clientSpec: CLIENT_SPEC, constraints: CONSTRAINTS, previousFeedback: args.feedback || null,
        keyFiles: ['admin/components/user-management.js (handleResetPassword)', 'admin/components/user-list.js (#152 reset states)', 'admin/user-service.js (resetPassword JSDoc)', 'admin/i18n/en.json + he.json', 'admin/components/*dialog*.js (dialog pattern)', 'admin/__tests__/ (jest; run from admin/)'] },
      instructions: [
        `cd ${REPO} && git checkout ${args.branch}.`,
        'Read the key files + an existing dialog component for the pattern. Confirm the Lambda contract (resetPassword returns { message, username, temporaryPassword }).',
        'TDD: write failing client test(s) first (e.g. handleResetPassword shows the returned temporaryPassword in a dialog; the obsolete email-resend marker is gone). Observe red, implement, observe green.',
        'Implement per clientSpec: temp-password dialog (readonly value + Copy + instructions interpolating {username}), remove the #152 email-resend persistent marker (keep transient in-flight), i18n en+he, update user-service JSDoc. Never console.log the password.',
        'Update the #152 user-list tests honestly to the new no-email behaviour (HR2 — do not weaken unrelated coverage).',
        'Run BOTH full suites (cd admin && npm test ; cd lambda && npm test) — both must be fully green.',
        'Commit on the branch (e.g. "feat(users): show admin-set temporary password in a copyable dialog; retire the email-resend affordance"). Capture short SHA. Return ONLY the JSON object.',
      ],
      outputFormat: 'JSON: { done(bool), suiteGreen(bool), lambdaGreen(bool), sha, dialogFile, summary, adjustments, reason }',
    },
    outputSchema: { type: 'object', required: ['done', 'summary'], properties: { done: { type: 'boolean' }, suiteGreen: { type: 'boolean' }, lambdaGreen: { type: 'boolean' }, sha: { type: 'string' }, dialogFile: { type: 'string' }, summary: { type: 'string' }, adjustments: { type: 'string' }, reason: { type: 'string' } } },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['impl', 'client'],
}));

export const gateAdminTask = defineTask('gate-admin', (args, taskCtx) => ({
  kind: 'shell', title: '100% gate: admin suite',
  shell: { command: `cd ${REPO}/admin && npm test` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` }, labels: ['gate', 'admin'],
}));

export const gateLambdaTask = defineTask('gate-lambda', (args, taskCtx) => ({
  kind: 'shell', title: '100% gate: lambda suite',
  shell: { command: `cd ${REPO}/lambda && npm test` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` }, labels: ['gate', 'lambda'],
}));

export const mergeTask = defineTask('merge-to-main', (args, taskCtx) => ({
  kind: 'shell', title: 'Push + PR + squash-merge to main',
  shell: { command: `cd ${REPO} && git push -u origin ${args.branch} && gh pr create --base main --head ${args.branch} --title "feat(users): admin sets a temporary password (force-change at next login)" --body "Admin-assisted reset: AdminSetUserPassword(Permanent:false) sets a temp password (no email); admin relays it; user sets their own at next login. Retires the email-resend affordance (#152). admin+lambda suites green." && gh pr merge ${args.branch} --squash --body "Admin sets a temporary password (force-change at next login)." && git checkout main && git pull origin main` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` }, labels: ['git', 'merge'],
}));

export const deployLambdaTask = defineTask('deploy-lambda', (args, taskCtx) => ({
  kind: 'shell', title: 'Surgical deploy primo-maps-resetUserPassword from main',
  shell: { command: `cd ${REPO} && rm -rf /tmp/setpw-deploy && mkdir -p /tmp/setpw-deploy/live && cd /tmp/setpw-deploy && URL=$(aws lambda get-function --function-name primo-maps-resetUserPassword --query 'Code.Location' --output text) && curl -s -o live.zip "$URL" && python3 -c "import zipfile;zipfile.ZipFile('live.zip').extractall('live')" && cp ${REPO}/lambda/resetUserPassword.mjs live/resetUserPassword.mjs && python3 -c "import os,zipfile;z=zipfile.ZipFile('new.zip','w',zipfile.ZIP_DEFLATED);[z.write(os.path.join(r,f),os.path.relpath(os.path.join(r,f),'live')) for r,_,fs in os.walk('live') for f in fs];z.close()" && aws lambda update-function-code --function-name primo-maps-resetUserPassword --zip-file fileb:///tmp/setpw-deploy/new.zip --query '{SHA:CodeSha256,State:State}' --output json` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` }, labels: ['deploy', 'lambda'],
}));

export const deploySpaTask = defineTask('deploy-spa', (args, taskCtx) => ({
  kind: 'shell', title: 'Redeploy admin SPA from main',
  shell: { command: `cd ${REPO} && ./redeploy.sh` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` }, labels: ['deploy', 'spa'],
}));

export const verifyLiveTask = defineTask('verify-live', (args, taskCtx) => ({
  kind: 'shell', title: 'Verify live Lambda + SPA artifacts',
  shell: { command: `cd ${REPO} && sleep 6 && echo "=== live Lambda message ===" && URL=$(aws lambda get-function --function-name primo-maps-resetUserPassword --query 'Code.Location' --output text) && curl -s -o /tmp/verify-setpw.zip "$URL" && python3 -c "import zipfile;print(zipfile.ZipFile('/tmp/verify-setpw.zip').read('resetUserPassword.mjs').decode())" | grep -E "AdminSetUserPassword|Temporary password" | head && echo "=== live SPA user-management.js ===" && curl -s "https://d3h8i7y9p8lyw7.cloudfront.net/admin/components/user-management.js" | grep -c "temporaryPassword" | sed "s/^/temporaryPassword refs: /"` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` }, labels: ['verify'],
}));
