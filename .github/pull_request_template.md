<!-- This template enforces WORKFLOW.md. Do not delete sections. -->

## Issue(s) closed
Closes #

## Approach chosen (approved by owner at step 5)
<!-- One or two sentences, plain language. -->

## AC ↔ Test map (HR3)
<!-- One row per acceptance criterion. Every AC must map to a test observed red→green in this run. -->

| AC | Test name | File | Observed red→green? |
|----|-----------|------|---------------------|
| AC-…-1 | | | yes / no |

## Verification
- [ ] Full existing suite is green (regression guard), not just the new test
- [ ] I executed the suite in this run (HR7) — output below or linked
- [ ] No existing test was weakened, skipped, narrowed, or deleted (HR1)
- [ ] Assertions are at stable boundaries, not internal call structure (HR4)

```
<!-- paste test run summary here -->
```

## Owner app-check (user-facing issues only)
- Running app exercised by owner: pending / done
- Matches AC: pending / yes / no

## Spec disputes (HR2)
<!-- "AC says X; test asserts Y; which is correct?" — do NOT resolve by editing the test. "none" if none. -->
none
