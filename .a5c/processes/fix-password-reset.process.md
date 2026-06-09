# Process: primo-maps/fix-password-reset

**Goal:** Fix the admin password-reset feature end to end, with strict TDD and a 100%-green test gate after every change. Two milestones in one run.

**Branch:** `fix/users-password-reset` (off `main`, rollback tag `pre-reset-fix-2026-06-08`). Client SPA + `resetUserPassword` Lambda only. **No auto-deploy. No real Cognito calls / emails — tests mock AWS.**

## Milestone 1 — Stop the email flood (urgent, client-only)
**Root cause (already confirmed this session):** `showView('users')` calls `initUserManagement()` on *every* visit to the Users tab with no guard; each call stacks fresh delegated listeners (`user-reset-password`/`edit`/`delete` + a new `UserList` click listener) on the **persistent** `#user-list-container`. One reset click then fans out to N handlers → N Cognito emails. PR #151 only guarded re-renders within one instance, not re-inits.

1. **flood-tdd** (agent, TDD): RED test — call `initUserManagement()` 3×, fire one reset click, assert `resetPassword` called **exactly once** (+ edit/delete once); observe red → implement idempotent binding → observe green → full admin suite green → commit.
2. **gate-admin-suite** (shell): `cd admin && npm test` must be 100%. *(refine loop: up to 3 attempts)*
3. **flood-chromium-verify** (agent): prove it in **real Chromium** — 3 visits + one click → exactly one intercepted reset request (no real email).

## Milestone 2 — Make reset usable (Lambda + client)
**Root cause:** the reset emails a bare Cognito **verification code**; the Lambda/JSDoc falsely claim a "temporary password." App logs in via **Cognito Hosted UI** (which already has Forgot-Password + forced-change screens), so no new in-app screen is needed.

4. **reset-investigate** (agent): write `artifacts/reset-options.md` — confirmed behaviour + Option A vs B + recommendation.
5. **🔶 BREAKPOINT 1 (you decide):** choose **Option A** (self-service code: keep `AdminResetUserPassword`, fix the misleading messages, improve the Cognito forgot-password email so the code is usable via Hosted UI) **or Option B** (admin temp password via `AdminSetUserPassword`, returned to the admin to relay; no email).
6. **reset-implement** (agent, TDD): implement the chosen option; always fix the false "temporary password" message + JSDoc; record any Cognito-console step as a manual deploy item (not performed).
7. **gate-admin-suite + gate-lambda-suite** (shell): both 100%. *(refine loop: up to 3 attempts)*

## Final
8. **final-acceptance-review** (agent): re-run both suites, verify acceptance, produce a **deploy/merge checklist** (flagging the **#152 deploy-trap** coordination + any Cognito step). No deploy.
9. **🔶 BREAKPOINT 2 (deploy gate):** defer deploy, or proceed to a coordinated deploy walkthrough. **Nothing is auto-deployed.**

## Guarantees
- HR1/HR2/HR3/HR7: no test weakened; every change has a red→green test observed this run; no "green" claimed without running.
- Only 2 breakpoints (matches your *minimal* breakpoint preference): the product decision and the deploy gate.
- Commits land on the feature branch only; push/PR/deploy stay with you.
