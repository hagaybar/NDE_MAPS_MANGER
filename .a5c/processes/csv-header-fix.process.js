/**
 * @process primo-maps/csv-header-fix
 * @description Fix the persisting CSV Editor frozen "Row" header (sticky top-left
 *   corner covered by the scrolling anchor column on vertical scroll). Diagnose
 *   and verify in REAL Chromium; augment the e2e to catch the covering (not just
 *   position). Gated by an independent real-Chromium e2e + admin jest.
 * @inputs { branch, repoRoot }
 * @agent general-purpose
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

const REPO = '/home/hagaybar/projects/primo_maps';

// Independent real-Chromium e2e gate (serve the admin/ folder at root) + jest.
const GATE_CMD =
  `cd ${REPO} && ` +
  `(npx http-server admin -p 8137 -s -c-1 >/tmp/csvhdr-srv.log 2>&1 & SRV=$!; ` +
  `for i in $(seq 1 20); do curl -sf http://localhost:8137/index.html >/dev/null && break; sleep 0.5; done; ` +
  `E2E_BASE_URL=http://localhost:8137 npx playwright test e2e/tests/csv-editor-grid.spec.ts --project=en-admin --project=he-admin --reporter=line; ` +
  `E2E=$?; kill $SRV 2>/dev/null; ` +
  `cd ${REPO}/admin && NODE_OPTIONS=--experimental-vm-modules npx jest --silent 2>&1 | tail -4; JEST=$?; ` +
  `echo "E2E_EXIT=$E2E JEST_EXIT=$JEST"; [ $E2E -eq 0 ] && [ $JEST -eq 0 ])`;

export const fixTask = defineTask('csvhdr/fix', (args, taskCtx) => ({
  kind: 'agent',
  title: `Diagnose + fix frozen "Row" header in real Chromium${args.attempt > 1 ? ` (refine #${args.attempt})` : ''}`,
  execution: { model: 'claude-opus-4-8' },
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Front-end engineer fixing a CSS sticky-table stacking bug, verifying in a REAL browser (Playwright/Chromium), not jsdom.',
      task:
        'Fix the CSV Editor frozen "Row" header: the sticky top-left corner cell (the anchor-column header `#csv-table thead .csv-anchor-cell`, label "Row"/"שורה") is visually COVERED by the scrolling sticky anchor-column DATA cells on vertical scroll, so "Row" disappears while the other column headers stay. A prior fix set position/top/inset-inline-start/z-index:4 explicitly and did NOT work — so the root cause is something else (strongly suspect `border-collapse: collapse` on `#csv-table` breaking sticky cell paint/stacking, or a thead/tbody row-group stacking-context/paint-order issue). Diagnose it in a REAL browser, fix it, and PROVE it with a real-Chromium e2e that checks the corner is actually on top.',
      context: {
        repoRoot: REPO,
        branch: args.branch,
        files: {
          markup: 'admin/components/csv-editor.js (renderTable: <table id="csv-table" class="min-w-full border-collapse">, thead/tbody .csv-anchor-cell)',
          css: 'admin/styles/app.css (#187 grid block near the end: #table-container, #csv-table thead th, #csv-table .csv-anchor-cell, #csv-table thead .csv-anchor-cell)',
          e2e: 'e2e/tests/csv-editor-grid.spec.ts (serve admin/ at root; en-admin + he-admin projects; self-seeds a wide CSV via page.route)',
        },
        previousFeedback: args.previousFeedback || null,
      },
      instructions: [
        'Confirm you are on branch ' + args.branch + ' (git branch --show-current); do not switch branches.',
        'REPRODUCE FIRST in real Chromium: serve the admin folder and open the CSV editor — `npx http-server admin -p 8140 -s -c-1 &` then drive Playwright (the project has @playwright/test; chromium is installed) against http://localhost:8140. Scroll the #table-container down and inspect: getComputedStyle of the corner cell, and document.elementFromPoint at the corner header coordinates — confirm it returns a tbody data cell (the bug) rather than the thead "Row" th.',
        'DIAGNOSE the true cause (likely border-collapse). With border-collapse:collapse, sticky cell backgrounds/stacking misbehave — the standard fix is `border-collapse: separate; border-spacing: 0` on the table, re-adding the cell separator lines via each cell\'s border/box-shadow so the grid still looks the same. Apply whatever fix actually works in Chromium; keep the visual design (gray header, row separators) intact.',
        'Make the corner cell reliably paint above BOTH the sticky header row and the sticky anchor column after scroll. Verify with document.elementFromPoint at the corner = the "Row" header th (or its text), in BOTH LTR (corner top-left) and RTL/Hebrew (corner top-right, since the anchor pins to inline-start).',
        'AUGMENT e2e/tests/csv-editor-grid.spec.ts: add an assertion (both en-admin and he-admin) that AFTER scrolling #table-container down, document.elementFromPoint at the frozen header-corner returns the anchor HEADER cell (a <th> inside thead, text "Row"/"שורה"), NOT a tbody data cell. This must FAIL on the current covered state and PASS after your fix. Do not weaken the existing assertions (HR1).',
        'Run the e2e in real Chromium and confirm green: serve admin/ at root, `E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/tests/csv-editor-grid.spec.ts --project=en-admin --project=he-admin`.',
        'Run the FULL admin jest suite and confirm green: `cd admin && NODE_OPTIONS=--experimental-vm-modules npx jest`.',
        'Commit (do NOT push, do NOT deploy). Use a clear fix(#187) message naming the real root cause.',
        args.previousFeedback ? `Previous attempt failed the gate — fix exactly this: ${args.previousFeedback}` : 'First attempt.',
        'Return ONLY the JSON result. In rootCause, name the ACTUAL cause you proved in Chromium. In chromeEvidence, quote the elementFromPoint before/after results.',
      ],
      outputFormat: 'JSON with: passed (boolean), rootCause (string), filesChanged (string[]), chromeEvidence (string), e2eResult (string), jestResult (string), notes (string)',
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'rootCause', 'filesChanged', 'chromeEvidence', 'e2eResult', 'jestResult'],
      properties: {
        passed: { type: 'boolean' },
        rootCause: { type: 'string' },
        filesChanged: { type: 'array', items: { type: 'string' } },
        chromeEvidence: { type: 'string' },
        e2eResult: { type: 'string' },
        jestResult: { type: 'string' },
        notes: { type: 'string' },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
  labels: ['fix', 'chrome'],
}));

export const gateTask = defineTask('csvhdr/gate', (args, taskCtx) => ({
  kind: 'shell',
  title: `Independent real-Chromium e2e + jest gate (attempt ${args.attempt || 1})`,
  shell: { command: GATE_CMD, timeout: 600000, outputPath: `tasks/${taskCtx.effectId}/output.json` },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
  labels: ['gate', 'chrome'],
}));

export async function process(inputs, ctx) {
  const branch = inputs.branch || 'feat/csv-editor-validate-grid';
  const MAX = 3;
  let passed = false;
  let feedback = null;
  const attempts = [];

  for (let attempt = 1; attempt <= MAX && !passed; attempt++) {
    const fix = await ctx.task(fixTask, { branch, attempt, previousFeedback: feedback });
    const gate = await ctx.task(gateTask, { attempt });
    const gateOk = gate && (gate.exitCode === 0 || gate.success === true);
    attempts.push({ attempt, agentPassed: fix && fix.passed, gateExit: gate ? gate.exitCode : null, rootCause: fix && fix.rootCause });
    if (gateOk && fix && fix.passed) {
      passed = true;
    } else {
      feedback =
        `Gate failed (exitCode=${gate ? gate.exitCode : 'n/a'}, agent passed=${fix ? fix.passed : 'n/a'}). ` +
        `The augmented e2e corner-not-covered assertion and/or jest did not pass in real Chromium. ` +
        `Gate tail: ${gate ? JSON.stringify(gate).slice(0, 1500) : 'none'}. Fix without weakening any assertion (HR1).`;
    }
  }

  if (!passed) {
    const d = await ctx.breakpoint({
      question: `Frozen "Row" header fix did not pass the real-Chromium gate after ${MAX} attempts. Review and decide.`,
      title: 'Header fix stuck',
      options: ['Stop the run', 'I will look — continue'],
      expert: 'owner',
      tags: ['stuck'],
    });
    if (!d.approved) return { success: false, attempts };
  }

  return { success: passed, attempts };
}
