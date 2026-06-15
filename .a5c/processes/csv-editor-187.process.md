# Process: primo-maps/csv-editor-187

Executes the committed TDD plan for issue **#187** (CSV Editor: validate-before-save + usable wide grid) on branch `feat/csv-editor-validate-grid`.

## Shape

Three gated implementation phases, each: an agent implements the plan tasks red→green, then an **independent** shell Jest run (the orchestrator's oracle, HR7) gates it. A failed gate loops back to the same agent with the failure as feedback (up to 3 attempts). If a phase can't pass, it escalates to the owner.

| Phase | Plan tasks | Independent gate |
|-------|-----------|------------------|
| A — Validation + save gate | Tasks 1–6 | `jest csv-validation + csv-editor-save-gate` |
| B — Usable wide grid | Tasks 7–8 | full admin `jest` green + e2e spec present (e2e run best-effort) |
| C — i18n + cache-bust | Task 9 (no push/PR) | full admin `jest` green |

Then: final full-suite regression gate → **one owner review breakpoint** (push & open PR?) → push + `gh pr create`.

## Guardrails

- Hard rules HR1/HR3/HR4/HR7 from WORKFLOW.md are injected into every implement task.
- Minimal breakpoints (per owner profile): only the pre-PR review and any phase-stuck escalation.
- No deploy — that stays a separate owner step (profile `alwaysBreakOn: deploy`).

## Inputs

`csv-editor-187.inputs.json` — repoRoot, planPath, specPath, branch, issue.
