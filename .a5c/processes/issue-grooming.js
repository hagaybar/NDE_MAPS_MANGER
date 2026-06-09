/**
 * @process primo-maps/issue-grooming
 * @description Triage open GitHub issues; auto-resolve only the genuinely SIMPLE, decision-free, client-side ones with strict TDD + a 100% full-suite gate (branch->PR->merge->close, deploy deferred); defer everything else. Owner is out of office; AWS-free; non-interactive.
 * @inputs {}
 * @outputs { triage, results, deferred, summary }
 * @agent general-purpose
 */
import { defineTask } from '@a5c-ai/babysitter-sdk';

const REPO = '/home/hagaybar/projects/primo_maps';

const CONSTRAINTS = [
  'WORKFLOW.md HR1-HR7 are binding: never weaken/skip/narrow a test to pass; add a test for every behavioural change you observe go red->green THIS run; test at stable boundaries; never claim tests pass without running them.',
  'AWS-FREE: the owner cannot refresh AWS SSO. Do NOT deploy, do NOT run redeploy.sh, do NOT touch Lambda deploy/S3/CloudFront, do NOT rely on the live authenticated app. Only client-side admin SPA code verifiable by jest (cd admin && npm test).',
  'Conservative SIMPLE bar: a fix qualifies only if it is a small, well-understood, decision-free code change in admin/ that is fully verifiable by a jest unit test. If it needs a product/UX/design/policy decision, a schema/data change, server/Lambda work, deploy-only verification, or broad refactoring -> it is NOT simple.',
  'End commit messages with the trailer: Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>',
];

export async function process(inputs, ctx) {
  const triage = await ctx.task(triageTask, {});
  const simple = (triage && triage.simple) || [];
  const results = [];

  for (const it of simple) {
    const fix = await ctx.task(fixTask, { number: it.number, title: it.title, plan: it.plan || '' });
    if (!fix || !fix.ready) {
      results.push({ number: it.number, status: 'deferred-on-closer-look', reason: (fix && fix.reason) || 'fixer judged it not simple' });
      continue;
    }
    const gate = await ctx.task(gateTask, { number: it.number, branch: fix.branch });
    if (!gate || !gate.passed) {
      results.push({ number: it.number, status: 'gate-failed', branch: fix.branch, detail: (gate && gate.summary) || 'suite not green' });
      continue;
    }
    const integ = await ctx.task(integrateTask, { number: it.number, title: it.title, branch: fix.branch, summary: fix.summary });
    results.push({ number: it.number, status: integ && integ.closed ? 'closed' : 'integrate-incomplete', branch: fix.branch, ...integ });
  }

  let deferred = { commented: 0 };
  const toDefer = (triage && triage.defer) || [];
  if (toDefer.length) deferred = await ctx.task(deferTask, { items: toDefer });

  const summary = await ctx.task(summaryTask, { triage, results, deferred });
  return { triage, results, deferred, summary, metadata: { processId: 'primo-maps/issue-grooming', timestamp: ctx.now() } };
}

export const triageTask = defineTask('triage-open-issues', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Triage open issues into simple-closeable vs defer',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'pragmatic senior engineer triaging a backlog for safe autonomous fixing',
      task: 'List the OPEN GitHub issues (gh issue list --state open --limit 100 --json number,title,labels,body) in this repo and classify each as SIMPLE (auto-resolvable now) or DEFER, per the conservative bar.',
      context: { repo: REPO, constraints: CONSTRAINTS },
      instructions: [
        `cd ${REPO}. Read CLAUDE.md + WORKFLOW.md first.`,
        'Fetch open issues with gh (include the body). For each, read the cited code if needed to judge difficulty.',
        'Classify SIMPLE only if: small decision-free client-side admin/ code change, fully verifiable by a jest unit test, no AWS/deploy/live-app/Lambda needed, no product/UX/design/policy/data decision. When in doubt -> DEFER.',
        'Explicitly DEFER: #119 (catastrophic data-loss, needs care), anything labeled design-decision, large refactors (#71/#78/#83), server/Lambda-only (#7/#8/#43/#52/#55/#89/#90/#94), deploy/data-only (#114/#65/#84), and anything ambiguous.',
        'For each SIMPLE issue give a one-paragraph fix plan + the test you would write. Order SIMPLE by lowest risk first. Do NOT change any code in this task — triage only.',
        'Return ONLY the JSON object.',
      ],
      outputFormat: 'JSON: { simple: [{number, title, plan}], defer: [{number, reason}] }',
    },
    outputSchema: {
      type: 'object', required: ['simple', 'defer'],
      properties: {
        simple: { type: 'array', items: { type: 'object', required: ['number', 'title', 'plan'], properties: { number: { type: 'number' }, title: { type: 'string' }, plan: { type: 'string' } } } },
        defer: { type: 'array', items: { type: 'object', required: ['number', 'reason'], properties: { number: { type: 'number' }, reason: { type: 'string' } } } },
      },
    },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['triage'],
}));

export const fixTask = defineTask('tdd-fix-issue', (args, taskCtx) => ({
  kind: 'agent',
  title: `TDD fix issue #${args.number}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior engineer doing strict TDD on a single small bug',
      task: `Resolve GitHub issue #${args.number} ("${args.title}") with strict TDD on a fresh branch. Do NOT merge or close — just produce a green, committed, pushed branch.`,
      context: { repo: REPO, number: args.number, plan: args.plan, constraints: CONSTRAINTS },
      instructions: [
        `cd ${REPO}. Read the issue: gh issue view ${args.number}. Re-confirm it is genuinely SIMPLE + decision-free + client-side + unit-testable. If on closer inspection it is NOT, set ready=false with a reason and STOP (do not touch code).`,
        `git checkout main && git pull --ff-only && git checkout -b fix/${args.number}-grooming`,
        'TDD: write a FAILING jest test that captures the bug at a stable boundary; run it (cd admin && node --experimental-vm-modules node_modules/.bin/jest <file>) and OBSERVE it red. Then implement the minimal client-side fix. Run the test again and observe it GREEN.',
        'Run the FULL admin suite: cd admin && npm test. It MUST be fully green (no new failures). If you cannot get it fully green, set ready=false with the reason and STOP (leave the branch).',
        'Commit (reference the issue number; end with the Co-Authored-By trailer) and push the branch (git push -u origin fix/' + args.number + '-grooming). Leave the branch checked out.',
        'Never weaken/skip a test to pass. Return ONLY the JSON.',
      ],
      outputFormat: 'JSON: { number, ready (bool), branch, testFile, summary, reason }',
    },
    outputSchema: {
      type: 'object', required: ['number', 'ready', 'summary'],
      properties: { number: { type: 'number' }, ready: { type: 'boolean' }, branch: { type: 'string' }, testFile: { type: 'string' }, summary: { type: 'string' }, reason: { type: 'string' } },
    },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['tdd', 'fix', `issue-${args.number}`],
}));

export const gateTask = defineTask('full-suite-gate', (args, taskCtx) => ({
  kind: 'shell',
  title: `100% gate: full admin suite for #${args.number} (${args.branch})`,
  shell: { command: `cd ${REPO}/admin && npm test` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['gate', 'tests', `issue-${args.number}`],
}));

export const integrateTask = defineTask('integrate-issue', (args, taskCtx) => ({
  kind: 'agent',
  title: `Integrate + close issue #${args.number}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'engineer landing a verified single-issue fix',
      task: `The branch ${args.branch} has a green, TDD-verified fix for issue #${args.number}. Open a PR, merge it to main, and close the issue. DO NOT deploy.`,
      context: { repo: REPO, number: args.number, branch: args.branch, fixSummary: args.summary, constraints: CONSTRAINTS },
      instructions: [
        `cd ${REPO}. Ensure you are on ${args.branch} and it is pushed.`,
        `gh pr create --base main --head ${args.branch} --title "fix: <concise> (#${args.number})" --body "Closes #${args.number}. TDD fix (red->green) + full admin suite green. Client-only; DEPLOY DEFERRED (owner OOO — awaits next redeploy from main). 🤖 audit/grooming run."`,
        'Merge with --squash --delete-branch. Then git checkout main && git pull --ff-only.',
        `Confirm the issue closed: gh issue view ${args.number} --json state. If gh auto-closed it via "Closes #", good; otherwise gh issue close ${args.number} --reason completed --comment "Fixed + merged to main (client-only); deploy deferred (owner OOO)."`,
        'Return ONLY the JSON.',
      ],
      outputFormat: 'JSON: { number, closed (bool), prUrl, summary }',
    },
    outputSchema: { type: 'object', required: ['number', 'closed'], properties: { number: { type: 'number' }, closed: { type: 'boolean' }, prUrl: { type: 'string' }, summary: { type: 'string' } } },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['integrate', `issue-${args.number}`],
}));

export const deferTask = defineTask('defer-issues', (args, taskCtx) => ({
  kind: 'agent',
  title: `Comment-defer ${args.items.length} issues`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'backlog groomer leaving concise defer notes',
      task: 'For each deferred issue, post a one-line comment that it was reviewed by the autonomous grooming run and deferred (not auto-fixed), with the short reason. Do NOT change code or labels.',
      context: { repo: REPO, items: args.items },
      instructions: [
        `cd ${REPO}. For each {number, reason}: gh issue comment <number> --body "Reviewed by the 2026-06 autonomous issue-grooming run (owner OOO) — deferred, not auto-fixed: <reason>. Needs owner decision / non-trivial / out of the AWS-free scope."`,
        'Keep comments to one line. Return the count.',
      ],
      outputFormat: 'JSON: { commented (number) }',
    },
    outputSchema: { type: 'object', required: ['commented'], properties: { commented: { type: 'number' } } },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['defer'],
}));

export const summaryTask = defineTask('grooming-summary', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Summarize the grooming run',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'engineer reporting a grooming run',
      task: 'Write a concise summary of the issue-grooming run for the owner.',
      context: { triage: args.triage, results: args.results, deferred: args.deferred },
      instructions: ['Summarize: which issues were closed (PRs/merged), which gate-failed or were deferred-on-closer-look, and how many were comment-deferred. Note that all merged fixes are client-only with deploy deferred (owner OOO).', 'Return ONLY the JSON.'],
      outputFormat: 'JSON: { summary (string), closedCount (number), deferredCount (number) }',
    },
    outputSchema: { type: 'object', required: ['summary'], properties: { summary: { type: 'string' }, closedCount: { type: 'number' }, deferredCount: { type: 'number' } } },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['summary'],
}));
