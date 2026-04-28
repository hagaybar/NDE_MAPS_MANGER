/**
 * @process map-editor
 * @description Execute the map-based range editor plan task-by-task.
 *   Each plan-task (0..19) is delegated to a coding agent that reads the
 *   plan, executes all of that task's steps (TDD where applicable), commits,
 *   and returns a short summary. After Task 19, run a final verification gate.
 *
 * @inputs {
 *   projectDir: string,
 *   planPath: string,
 *   specPath: string,
 *   firstTask?: number,
 *   lastTask?: number
 * }
 * @outputs {
 *   success: boolean,
 *   tasksCompleted: number,
 *   commits: array,
 *   testsPass: boolean
 * }
 *
 * @skill frontend-design specializations/web-development/skills/frontend-design/SKILL.md
 * @skill e2e-testing specializations/web-development/skills/e2e-testing/SKILL.md
 * @agent frontend-architect specializations/web-development/agents/frontend-architect/AGENT.md
 * @agent e2e-testing specializations/web-development/agents/e2e-testing/AGENT.md
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const {
    projectDir = '/home/hagaybar/projects/primo_maps',
    planPath = 'docs/superpowers/plans/2026-04-28-map-editor.md',
    specPath = 'docs/superpowers/specs/2026-04-28-map-editor-design.md',
    firstTask = 0,
    lastTask = 19,
  } = inputs;

  const startTime = ctx.now();
  const allCommits = [];
  const summaries = [];

  ctx.log('info', `Starting map-editor execution: tasks ${firstTask} through ${lastTask}`);

  for (let n = firstTask; n <= lastTask; n++) {
    ctx.log('info', `--- Task ${n} ---`);
    const result = await ctx.task(executePlanTaskTask, {
      projectDir,
      planPath,
      specPath,
      taskNumber: n,
      previousSummaries: summaries.slice(-3), // last 3 only, for context budget
    });
    summaries.push({
      taskNumber: n,
      title: result.title || `Task ${n}`,
      summary: result.summary || '',
      commits: result.commits || [],
      filesChanged: result.filesChanged || [],
      testsRun: result.testsRun || null,
    });
    if (Array.isArray(result.commits)) allCommits.push(...result.commits);
    if (result.success === false) {
      ctx.log('warn', `Task ${n} reported failure: ${result.failureReason || 'unspecified'}`);
      // Refinement loop: one retry pass.
      const retry = await ctx.task(executePlanTaskTask, {
        projectDir,
        planPath,
        specPath,
        taskNumber: n,
        previousSummaries: summaries.slice(-3),
        retry: true,
        previousFailure: result.failureReason || 'unspecified',
      });
      if (retry.success === false) {
        return {
          success: false,
          tasksCompleted: n,
          commits: allCommits,
          testsPass: false,
          failedTask: n,
          failureReason: retry.failureReason || result.failureReason,
          metadata: { processId: 'map-editor', timestamp: startTime, duration: ctx.now() - startTime },
        };
      }
      summaries[summaries.length - 1] = {
        ...summaries[summaries.length - 1],
        retried: true,
        summary: retry.summary || summaries[summaries.length - 1].summary,
      };
      if (Array.isArray(retry.commits)) allCommits.push(...retry.commits);
    }
  }

  // Final verification gate.
  ctx.log('info', '--- Final verification ---');
  const verify = await ctx.task(finalVerificationTask, { projectDir, planPath });

  return {
    success: verify.allPassed === true,
    tasksCompleted: lastTask - firstTask + 1,
    commits: allCommits,
    testsPass: verify.allPassed === true,
    verification: verify,
    summaries,
    metadata: { processId: 'map-editor', timestamp: startTime, duration: ctx.now() - startTime },
  };
}

export const executePlanTaskTask = defineTask('execute-plan-task', (args, taskCtx) => ({
  kind: 'agent',
  title: `Execute plan task #${args.taskNumber}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior Full-Stack Engineer (vanilla JS / AWS / Playwright)',
      task: `Execute Task ${args.taskNumber} from the map-editor implementation plan.

PROJECT ROOT: ${args.projectDir}
PLAN: ${args.projectDir}/${args.planPath}
SPEC: ${args.projectDir}/${args.specPath}
TASK NUMBER: ${args.taskNumber}
${args.retry ? `\nRETRY ATTEMPT after failure: ${args.previousFailure}\nFix the issue from the previous attempt before re-running.` : ''}

WHAT TO DO:
1. Read the plan file. Locate the section "## Task ${args.taskNumber} — ...".
2. Execute every checkbox step under that task in order. The plan provides exact file paths, code, commands, and expected outputs — follow them as authoritative; do not improvise alternatives.
3. For TDD steps ("Write the failing test" / "Run test to verify it fails" / "Implement minimal code" / "Run tests to verify they pass"), do them in that order — write the test first, see it fail, then implement.
4. Commit at every "Step N: Commit" step using the exact commit message in the plan. The repository may already have commits; do not amend, only add new ones.
5. If a step's expected output does not match what you observe, STOP and explain in failureReason — do not fabricate success.

CONSTRAINTS:
- Stay on branch feat/map-editor (Task 0 creates it; subsequent tasks must already be on it).
- Never run "git push", "git reset --hard", or destructive operations.
- Don't bypass git hooks (--no-verify forbidden).
- Don't add features beyond the task. The plan is the spec.

OUTPUT: return JSON with a structured summary so the orchestrator can journal it.`,
      context: {
        taskNumber: args.taskNumber,
        planPath: args.planPath,
        specPath: args.specPath,
        projectDir: args.projectDir,
        previousSummaries: args.previousSummaries || [],
        retry: args.retry === true,
      },
      instructions: [
        `cd ${args.projectDir}`,
        `Read ${args.planPath} and find "## Task ${args.taskNumber}".`,
        'Execute every checkbox step under that task in the order written.',
        'Use the Read/Edit/Write tools for files and Bash for shell commands. Use the exact paths and code blocks from the plan — do not paraphrase.',
        'For test steps, run the exact command and report the actual output. If the result does not match expected, set success=false and explain.',
        'Commit at every commit step with the exact message in the plan. Do not amend.',
        'Verify the working tree is clean before declaring success.',
        'If the plan references functions/files that do not match actual project structure, adapt minimally (e.g., correct import path) and note the deviation in `summary`.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'taskNumber'],
      properties: {
        success: { type: 'boolean' },
        taskNumber: { type: 'number' },
        title: { type: 'string' },
        summary: { type: 'string' },
        commits: { type: 'array', items: { type: 'string' } },
        filesChanged: { type: 'array', items: { type: 'string' } },
        testsRun: {
          type: 'object',
          properties: {
            jest: { type: 'string' },
            playwright: { type: 'string' },
          },
        },
        deviationsFromPlan: { type: 'array', items: { type: 'string' } },
        failureReason: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['plan-task', `task-${args.taskNumber}`],
}));

export const finalVerificationTask = defineTask('final-verification', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Final verification — run unit + E2E tests, verify plan coverage',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA / verification engineer',
      task: `Run the final verification gate for the map-editor implementation.

PROJECT ROOT: ${args.projectDir}
PLAN: ${args.projectDir}/${args.planPath}

WHAT TO DO:
1. Verify the current branch is feat/map-editor: \`git -C ${args.projectDir} branch --show-current\`.
2. Run unit tests: \`cd ${args.projectDir}/admin && npx jest 2>&1 | tail -25\`. Capture pass/fail counts.
3. Run E2E tests: \`cd ${args.projectDir} && npx playwright test 2>&1 | tail -40\`. Capture pass/fail counts.
4. Walk the plan's "Spec coverage cross-check" table at the bottom. For each row, confirm the cited task's commit(s) actually exist in git log (search for substrings of the commit message). Any rows lacking commits are gaps.
5. Verify Task 0's pre-feature tag exists: \`git -C ${args.projectDir} tag --list pre-map-editor-2026-04-28\`.
6. Summarize all of the above in JSON.

DO NOT modify any files. This is verification only.`,
      context: { projectDir: args.projectDir, planPath: args.planPath },
      instructions: [
        'Run the listed shell commands, capture the actual output.',
        'Be honest about failures — do not fabricate green results.',
        'List any spec-coverage gaps explicitly.',
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
        summary: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
  labels: ['verification', 'final'],
}));
