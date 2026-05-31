# WORKFLOW.md — Issue-resolution loop

This file is the **constitution** for any agent (Claude Code / a5c) that resolves
issues in this repository. It is authored and owned by the repo owner. Agents may
not edit it; they obey it. If a rule here seems wrong, raise it with the owner in
plain language — do not change the file.

---

## Who this is for

The repo owner operates as **architect, not coder**: does not read or write
source code. All control is exerted at the **boundaries** of the agent's work —
the acceptance criteria (AC) that go in, and the verification that comes out.
Everything between those boundaries is the agent's responsibility.

---

## Core principle (read this before anything else)

A loop in which the agent that writes the implementation also writes or picks the
tests that "prove" it is **circular**: the author and the oracle are the same
entity, and "tests pass" then means nothing. This workflow is valid only because
at least one oracle is **never authored by the implementing agent**:

1. **Acceptance Criteria (AC)** — plain-language, authored/approved by the owner.
   This is the contract. It is the one artifact trust is allowed to rest on.
2. **The running application** — spot-checked by the owner for user-facing issues.
   This is the final oracle, and the one an agent fundamentally cannot author.
3. *(Later, optional — see Phase 2)* frozen tests + CI + mutation/property checks.

We are currently in **MANUAL mode**: the **owner is the oracle**. A green test
suite is a *welcome signal*, never the *reason to merge*. The reason to merge is:
the owner read the AC, and the owner exercised the behaviour.

---

## Hard Rules (non-negotiable)

- **HR1 — Never weaken a test to go green.** Do not modify, delete, skip,
  `.skip`, `.only`-narrow, or loosen an existing test to make a build pass. A test
  changes **only** when its AC changes, and an AC change is prose the owner approves.
- **HR2 — Dispute, don't edit.** If you believe a test is wrong, do **not** edit
  it. Stop and file a one-line **Spec Dispute** in the PR:
  `AC says X; test asserts Y; which is correct?` The owner adjudicates.
- **HR3 — Red→green proof.** Every behavioural change must add or extend a test
  that **fails before** your change and **passes after**. In the PR, name that
  test and state that you personally observed it go red→green in this run.
- **HR4 — Test behaviour, not internals.** Assert at stable boundaries (the Lambda
  API contract, user-visible UI behaviour). Never assert internal call structure
  ("function X calls helper Y"). Internal-coupling tests are rejected on review —
  they are the root cause of test-babysitting.
- **HR5 — Never ask the owner to read code.** Surface every decision in plain
  language: AC, tradeoffs, the running app, and the AC↔test map. Do not request
  code review.
- **HR6 — One revertable unit per issue.** Default to one PR per issue. You may
  close several issues in one PR only when **all** of these hold: same area; the
  fixes are independent (no fix changes behaviour another's test relies on); each
  issue is its own commit with its own AC↔test rows and a `Closes #N` line; and
  the PR is merged **preserving commits** (rebase or merge commit — **never
  squash**, which destroys per-issue revert). Never combine fixes that interact or
  span areas. Every change must trace to a listed issue — no "while I was here" edits.
- **HR7 — No unverified "passing".** Never report tests as passing without having
  executed them in this run. Execution output is the only acceptable evidence.

---

## The loop (serial, one batch at a time)

| Step | Who | Action | Gate? |
|------|-----|--------|-------|
| 1 | agent | **Propose batches.** Cluster open issues; produce 3 batching *options* on different axes. Output `docs/batches.md`. No code. | |
| 2 | agent | **Prioritize.** Propose an order across batches, with reasoning. | |
| 3 | owner | **Select batch.** | ← gate |
| 4 | agent | **Per issue:** bugs → root cause; enhancements → 2–3 *real* approaches + tradeoffs (do not manufacture strawman alternatives for a narrow bug). **Always** draft AC in plain language. No implementation yet. | |
| 5 | owner | **Approve AC + pick approach.** Edits AC freely. | ← gate (load-bearing) |
| 6 | agent | **Implement** against the approved AC; add the red→green test (HR3); run the full suite; open a PR using the template with the AC↔test map filled. | |
| 7 | owner | **Accept:** open the running app, confirm it matches the AC, then merge. | ← gate |

---

## Definition of Done (per issue)

- Every AC item has a corresponding test, named in the PR (HR3), each observed red→green.
- The **full** existing suite is green (regression guard — the part the owner will not re-click).
- For user-facing issues: the owner has **exercised the behaviour in the running app** and it matches the AC.
- The PR uses the template, the AC↔test map is complete, and no Hard Rule is violated.

---

## Acceptance Criteria format

Plain language, testable, Given/When/Then. Authored/owned by the owner.

> **Example (issue #93):** *Given* a CSV with two distinct rows that share an
> orphan deep-link, *When* the editor applies the URL filter, *Then* each row
> retains a distinct index and a save or delete affects only the targeted row.

---

## Batching conventions (for step 1)

`docs/batches.md` contains **3 options**. Each option groups the open issues on a
different **axis**:

- **Option A — by `area:`** (map-editor, validation, csv-editor, auth, integrations, testing). Maximises independent revertability.
- **Option B — by coupling** (issues that must move together, e.g. a fix and the issue it references).
- **Option C — by `priority:`** (fastest user impact first).

For every batch, list: name, member issues (number + title), axis, one-line
rationale, **blast radius** (low/med/high), and **owner-can-eyeball? (y/n)** —
whether the owner can verify it by clicking the running app.

**Pilot guidance:** the first batch should stress-test the *loop*, not clear the
most backlog — pick **small (2–3 issues), eyeball-able, low blast radius**. Avoid
the auth and integrations clusters for the pilot (high stakes, hard to see, easy
to break silently).

---

## Phase 2 — NOT NOW (documented so the design is complete)

When the owner decides to stop being present for every run, add: a **frozen
acceptance test** compiled from the approved AC that the implementer may not edit
(ideally authored by a *separate* invocation), **CI** as the independent executor
so "green" is never self-reported, and a **mutation/property** pass on the four
critical modules (CSV parser, shelf-state, validation, JWT/auth) before any test
is promoted to a required gate. Do **not** implement Phase 2 as part of current work.
