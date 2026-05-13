# Single Source of Truth — CSV/SVG bundle invariant + staged SVG replace

**Status:** Spec draft 2026-05-13. Awaiting user review before handoff to implementation plan.
**Issue:** [#38](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/38)
**Related:** Triggered by Ranges Editor brainstorm ([#37](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/37)). Builds on SVG Download/Replace ([#35](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/35) / PR #36). Overlaps with `svgCode` validation ([#14](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/14)) and the `data-map-object` marker ([#16](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/16)).

---

## Summary

Today the system has two artifacts that must stay in sync: `data/mapping.csv` (420 rows, the editable data) and three floor SVGs (`maps/floor_{0,1,2}.svg`, the spatial layout). They reference each other by string match (CSV's `svgCode` ↔ SVG element `id`), and nothing enforces consistency. When divergence happens, Primo NDE silently degrades — search still works but the map highlight doesn't appear, and operators rarely notice.

This spec adds a **bundle-consistency invariant**: every successful write to either artifact produces a state where every `svgCode` in the CSV resolves to an actual shelf in the SVG of the row's declared floor. The invariant is enforced server-side as a hard rule. Two flows protect it:

1. **CSV edits** (frequent — drawer Apply-to-N, CSV Editor saves) go through `putCsv`, which now validates against the current SVGs before writing.
2. **SVG replacements** (rare — once-a-year reorganizations) go through a new **staging area**: upload → validate → optional reconcile wizard → explicit promote. Production is not touched until the operator confirms the staged bundle is consistent.

A one-shot migration cleans up any existing broken refs before the rule is turned on, so the gate flip doesn't break legitimate edits.

---

## Background

### How the two artifacts relate today

- **CSV** (`data/mapping.csv`, 420 rows × 14 columns). Lives in S3 at `s3://tau-cenlib-primo-assets-hagay-3602/data/mapping.csv`. Served via CloudFront. Written by the existing `putCsv` Lambda with S3 versioning. Edited from the admin SPA (CSV Editor today; Ranges Editor in the future per #37).

- **SVGs** (`maps/floor_{0,1,2}.svg`). Live in S3 at `s3://.../maps/`. Served via CloudFront. Edited rarely: an operator downloads the file, edits it in Illustrator or Inkscape, re-uploads. PR #36 made this round-trip explicit via per-card Download / Replace buttons in the SVG Manager.

- **The link.** Each CSV row has an `svgCode` column. The Primo NDE addon (running inside `tau.primo.exlibrisgroup.com`) fetches both the CSV and the floor SVGs from CloudFront, looks up the user-clicked entry in the CSV, then finds the SVG element with `id="<svgCode>"` to highlight. There is no schema between the two artifacts — only the string match.

- **The shelf marker.** Issue #16 introduced `data-map-object="shelf"` to disambiguate shelves from decorative SVG elements. Floor 1 has 201 marked shelves; floor 2 has 190; **floor 0 has 1.** Deployment is partial, which is itself a small divergence vector.

### Why this needs a design

Three trends push the surface area where divergence can occur:

1. Editing via the map. Map Editor (today) and Ranges Editor (per #37) let operators edit CSV semantics through a map-shaped UI. The CSV stays the source of truth, but operators reason about shelves and collections rather than rows.
2. MAP-side semantics. The `data-map-object` marker is information that *only* exists in the SVG. Future work may add more (issue #16 PR 2 already added empty-shelf clickability).
3. SVG download/replace. PR #36 enabled the loop where an operator can edit an SVG offline and replace it. This is the highest-risk path for divergence: a renamed or removed shelf silently breaks every CSV row that referenced it.

The acute failure mode is **silent degradation**: Primo NDE doesn't crash when a `svgCode` doesn't resolve — it just doesn't highlight. Users may never notice; operators may never look. The longer the broken state sits, the more it erodes trust.

---

## Decisions

Captured during the brainstorm in #38. Each decision is load-bearing for the design; revisit before changing.

| # | Decision | Why |
|---|---|---|
| Q1 | SVG edits are **rare** (~once a year), driven by major physical reorganization. | Sets the cost ceiling. Heavy infrastructure (a real data store; SVG as authoritative format) is not justified for an annual event. |
| Q2 | Divergence today causes **silent degradation** in Primo NDE. | Detection must be loud at write time. Retrospective validation isn't enough. |
| Q3 | When divergence is detected at SVG-replace time, the system either **blocks** or offers **interactive reconcile**. Never proceeds silently. | The "hard rule" the user articulated: consistency between the two artifacts is not breakable. |
| Q4 | Consumer-side (Primo NDE) atomicity = **CloudFront cache-bust**. Accept the few-seconds window where one artifact updated before the other. No manifest file. | Once-a-year operation; the brief inconsistency window is acceptable. Keeping Primo NDE unchanged is a feature. |
| Q5 | Consistency rule = **whole-bundle invariant** enforced at every write. **One-shot migration cleanup** of existing broken refs happens before the gate is turned on. | Cleanest hard rule. Migration cleanup avoids the foot-gun where the rule flip would reject legitimate edits on day one. |
| — | **Bundle = `mapping.csv` + `floor_0.svg` + `floor_1.svg` + `floor_2.svg`** as the unit of consistency. | Conceptual primitive used throughout this spec. |
| — | **No shelf-identity registry.** Operators reconcile renames at SVG-replace time via a wizard. | The registry adds permanent infrastructure to solve a once-a-year problem. Interactive reconcile resolves the same problem with no persistent layer. |
| — | **Implementation approach = γ (hybrid).** Extend `putCsv` for the common case; introduce staged-replace endpoints for the rare case; share validation logic. | Optimizes for the frequent CSV-write path while giving the rare SVG-replace path a clean, purpose-built surface. |
| — | **SVG-replace flow uses a staging area** (separate S3 prefix). Production is only touched at an explicit promote step. | Cleaner mental model than inline transactional writes. Makes the reconcile loop resumable and removes most atomicity edge cases. |
| — | Conflicting writes during staging: **allow CSV writes; re-validate staging on next validate** (Git-rebase semantics). | Doesn't add a lock surface for a rare conflict. No data loss possible. |
| — | Staging cardinality: **one global staging area + first-operator-wins lock**. | Two-to-three-admin team; concurrent SVG replace is essentially zero. Simplest infrastructure. |
| — | Staging TTL: **7 days, S3 lifecycle policy**. | Operator can leave work in progress for a week and resume. No Lambda involvement. |

---

## Architecture

### File layout

```
lambda/
├── auth-middleware.mjs                  ← unchanged
├── getCsv.mjs                           ← unchanged
├── listSvg.mjs                          ← unchanged
├── deleteSvg.mjs                        ← MODIFIED · refuses delete if any CSV row
│                                          references the to-be-deleted floor
├── putCsv.mjs                           ← MODIFIED · calls validateBundle() against
│                                          current SVGs before persisting; rejects 422
│                                          on violation when flag enabled
│
├── uploadStagingSvg.mjs                 ← NEW · accepts an SVG file; writes to
│                                          s3://.../staging/maps/floor_N.svg; acquires
│                                          the staging lock if not held
├── validateStaging.mjs                  ← NEW · fetches staging files + unchanged
│                                          production files; runs validateBundle;
│                                          returns the consistency report
├── applyReconcileToStaging.mjs          ← NEW · applies a reconcileMap to the staged
│                                          CSV (copies prod CSV to staging first if
│                                          not present); does not re-validate
├── promoteStaging.mjs                   ← NEW · re-runs validateBundle as final gate;
│                                          copies staging/* → production paths;
│                                          invalidates CloudFront; clears staging
├── clearStaging.mjs                     ← NEW · discards staged changes and releases
│                                          the lock
├── getStagingStatus.mjs                 ← NEW · returns {locked, owner, files, lastValidated}
│                                          for the SVG Manager's staging panel
│
└── shared/
    ├── validateBundle.mjs               ← NEW · pure function
    │                                          (csvRows, svgShelfIdsByFloor) → {ok, errors}
    │                                          No I/O. Used by every write path
    │                                          and the migration tool.
    └── svg-shelves.mjs                  ← NEW · pure function
                                              parseSvg(svgString) → string[]
                                              Single source for "what is a shelf"

admin/
├── services/
│   ├── bundle-validator.js              ← NEW · client mirror of validateBundle
│   ├── svg-shelves.js                   ← NEW · client mirror of svg-shelves.mjs
│   ├── svg-parser.js                    ← unchanged
│   └── data-model.js                    ← MODIFIED · exposes validateAgainstSvg()
│                                          for pre-submit checks
│
└── components/
    ├── csv-editor.js                    ← MODIFIED ·
    │                                       (a) on submit: run bundle-validator;
    │                                           surface inline errors if invalid
    │                                       (b) new "Broken refs" filter mode for
    │                                           migration cleanup (Stage 3)
    │
    ├── svg-manager.js                   ← MODIFIED · replace flow goes through
    │                                          uploadStagingSvg; surfaces staging
    │                                          panel; "Promote / Discard" controls
    │
    └── svg-manager/
        ├── staging-panel.js             ← NEW · shows current staging state, file
        │                                       diff, validation status, action buttons
        └── reconcile-wizard.js          ← NEW · interactive wizard for resolving
                                                broken refs when validation fails

infrastructure
├── S3 layout                            ← unchanged for prod paths; adds
│                                          s3://.../staging/{data,maps}/...
├── S3 lifecycle policy                  ← NEW rule: delete objects under
│                                          /staging/* older than 7 days
├── Lambda env var BUNDLE_INVARIANT_ENABLED
│                                          ← controls whether putCsv rejects (true)
│                                          or only logs (false). Flipped to true at
│                                          the end of migration (Stage 4).
└── docs/AWS-INFRASTRUCTURE.md           ← MODIFIED · document new endpoints +
                                                staging prefix + lifecycle rule
```

### What the parts do

- **`validateBundle.mjs`** (server) and **`bundle-validator.js`** (client): the rule-checker. Pure functions. Identical inputs produce identical outputs. The single source for "is this bundle consistent?" — used at every write path and the migration tool.

- **`svg-shelves.mjs`** (server) and **`svg-shelves.js`** (client): parse an SVG and return its shelf IDs. Single canonical rule: any element with `data-map-object="shelf"` AND a non-empty `id` attribute. Mirror implementations kept in sync by a parity test.

- **`putCsv.mjs`**: the existing CSV-write Lambda. Adds a step that fetches current SVGs (cached for warm-container lifetime), runs `validateBundle`, and either proceeds (flag off) or rejects with 422 (flag on, invariant violated). The S3 versioning and CloudFront invalidation behavior is unchanged.

- **The five staging Lambdas** (`uploadStagingSvg`, `validateStaging`, `applyReconcileToStaging`, `promoteStaging`, `clearStaging`, `getStagingStatus`): purpose-built endpoints for the SVG-replace flow. Each does one thing. No internal multi-state behavior; the operator's UI orchestrates the sequence.

- **`staging-panel.js`** and **`reconcile-wizard.js`**: new SVG Manager UI. The panel shows whether staging is active, who owns the lock, what files are staged, validation status, and the action buttons (Validate / Apply Reconcile / Promote / Discard). The wizard is the dialog that opens when validation returns RED — operator maps each removed shelf to a "rename" or "delete row" action.

### Key invariants this architecture protects

1. **One source for "what is a shelf"** — `svg-shelves.mjs` and `svg-shelves.js` must produce identical output for the same input. Enforced by a parity test in CI.
2. **One source for the bundle rule** — `validateBundle.mjs` and `bundle-validator.js` must return identical verdicts. Same parity test.
3. **Read paths untouched** — `getCsv`, `listSvg`, and all Primo NDE consumption paths are unchanged. The CloudFront cache-bust window is the only observable difference for downstream consumers.

---

## The rule: `validateBundle()`

Pure function. Inputs: the parsed CSV rows + a map of `floor → Set<shelfId>` extracted from the SVGs. Returns `{ ok, errors }`. No I/O, no mutation.

```
validateBundle(csvRows, svgShelfIdsByFloor) → { ok, errors }

For each row:
  - Look up svgShelfIdsByFloor[row.floor]
  - If row.svgCode is NOT in that set:
      errors.push({ rowIndex, svgCode, floor, type: 'shelf-not-found' })

Returns:
  { ok: true }                       when errors.length === 0
  { ok: false, errors }              otherwise
```

The function operates only on the proposed state. It does not consider history. Same inputs always yield the same answer; the function is trivial to test with synthetic fixtures.

### What it does NOT flag (handled elsewhere)

- **Orphan shelves** — an SVG element with `data-map-object="shelf"` whose `id` is not referenced by any CSV row. This is not a bundle-consistency violation; the Ranges Editor surfaces it as the "Unassigned shelves" pseudo-collection (per #37).
- **Duplicate svgCodes across CSV rows** — handled by `range-validation.js`, which ensures the rows' call-number ranges don't overlap.

### Shelf-detection rule (the `svg-shelves` companion)

```
parseSvg(svgString) → string[]

For each element in the SVG with attribute data-map-object="shelf":
  - If element has a non-empty id attribute, include id
  - If element has no id (or id is empty), skip and log a warning
Deduplicate (the parsing rule treats duplicate IDs as a separate error returned via {duplicates}).
```

This rule is documented as a comment block at the top of both `svg-shelves.mjs` and `svg-shelves.js` so future developers see it before either implementation.

---

## CSV-edit flow (the common path)

Every save of `mapping.csv` — whether from CSV Editor, the future Ranges Editor's drawer, or any other admin surface — goes through the existing `putCsv` Lambda. Under this design, that Lambda now validates.

```
1. JWT auth (existing middleware; admin or editor role).
2. Parse body { csv } into rows[].
3. Fetch the 3 current floor SVGs from S3.
   → Cache parsed shelf sets in warm-container memory (~5 min); key by S3 ETag.
4. svgShelfIdsByFloor = { 0: parseSvg(floor0), 1: …, 2: … }.
5. result = validateBundle(rows, svgShelfIdsByFloor).
6. If !result.ok:
     if BUNDLE_INVARIANT_ENABLED === 'true':
         return 422 { errors: result.errors }
     else:
         CloudWatch metric bundle.violations.csv_write++
         log row indexes + svgCodes
         continue (write anyway — migration phase)
7. Write CSV to s3://.../data/mapping.csv with S3 versioning (existing behavior).
8. CloudFront invalidate /data/mapping.csv (existing).
9. Return 200 { version }.
```

**Performance:** the 3-SVG fetch in step 3 adds ~50–150ms cold-start cost; warm containers reuse the cache. Acceptable for an edit operation an operator is actively waiting on.

**Client-side pre-validation:** CSV Editor calls `data-model.validateAgainstSvg(rows, floor)` before submit. If pre-validation fails, the editor surfaces inline errors and does not send. This prevents the operator from learning about a violation only after a network round-trip.

---

## SVG-replace flow (the staged path)

The SVG-replace flow is the rare-but-complex case: operator downloaded a floor SVG, edited it in Inkscape, wants to upload the new file. Some shelves may have been renamed or removed; CSV refs to those shelves need to be rewritten or the referenced rows need to be deleted.

The flow uses a **staging area** — a separate S3 prefix (`staging/`) that mirrors the production layout. Production is not touched until an explicit final step.

### Stage 1 — Upload

Operator picks a new SVG file in SVG Manager. The file is sent to `uploadStagingSvg`, which:

1. Acquires the staging lock if not held (or rejects with 423 if held by someone else).
2. Writes the file to `s3://.../staging/maps/floor_N.svg` with S3 versioning enabled.
3. Records the upload metadata (`{ uploader, uploadedAt, originalFilename }`) under `staging/.meta.json`.
4. Returns `200 { stagingStatus: { …current state… } }`.

Production SVG is untouched. CSV is untouched. The SVG Manager updates its staging panel to show the new file as staged.

### Stage 2 — Validate

Operator (or the SVG Manager automatically on upload completion) calls `validateStaging`:

1. Fetches all staged files (whatever is under `staging/`).
2. For files not staged, fetches the current production version (so we validate against the bundle the operator is proposing, not partial staging).
3. Runs `validateBundle(rows, svgShelfIdsByFloor)`.
4. Returns one of two reports:

```json
GREEN — { "ok": true, "summary": { "addedShelves": ["CB_0_new"], "removedRefs": [] } }
RED   — { "ok": false, "errors": [
            { "rowIndex": 47, "svgCode": "CB_0", "floor": 1, "type": "shelf-not-found" },
            …
          ],
          "summary": { "removedShelves": ["CB_0", "CB_1"], "addedShelves": ["CB_0_new"] }
        }
```

The SVG Manager staging panel renders the report. On GREEN: a "Promote to production" button is enabled. On RED: three buttons — "Start reconcile wizard," "Open CSV Editor to fix manually," "Discard staging."

### Stage 2.5 — Reconcile wizard (optional)

If validation was RED and the operator chooses the wizard:

1. Wizard opens with the list of removed shelves and the list of newly-added shelves.
2. For each removed shelf, operator picks an action:
   - **Rename to ▾ [added shelf]** — the dropdown lists added shelves from the same floor.
   - **Delete N rows** — explicit; triggers a confirm dialog ("You are about to delete N CSV rows. Continue?") before the action is recorded.
3. Submit is disabled until every removed shelf has an action assigned.
4. On submit, the client calls `applyReconcileToStaging` with the assembled map. Every entry uses a uniform shape:
   ```json
   {
     "CB_0": { "action": "rename", "to": "CB_0_new" },
     "CB_1": { "action": "delete" }
   }
   ```
5. `applyReconcileToStaging`:
   - If staging CSV does not yet exist, copies production CSV to `staging/data/mapping.csv`.
   - For each map entry: rewrites or deletes affected rows on the matching floor.
   - Writes the modified CSV back to `staging/data/mapping.csv`.
   - Returns `200 { affectedRows: N }`.
6. SVG Manager automatically re-runs `validateStaging`. Loop until GREEN or operator gives up.

### Stage 3 — Promote

Operator clicks "Promote to production." The client calls `promoteStaging`:

1. Re-runs `validateBundle` as a final gate (catches any concurrent CSV writes that happened during staging; see Conflicting writes below).
2. If validation fails: return 422 with the fresh report; operator re-enters wizard.
3. Copies each staged file to its production path:
   - `staging/maps/floor_N.svg` → `maps/floor_N.svg` (S3-versioned)
   - `staging/data/mapping.csv` → `data/mapping.csv` (S3-versioned, only if present)
4. Invalidates CloudFront for the affected paths.
5. Clears the staging area (deletes `staging/*`).
6. Releases the lock.
7. Returns `200 { promotedVersions: { csv: …, svgFloor1: … } }`.

### Discard

Operator can abandon staging at any time via `clearStaging`. It deletes `staging/*` and releases the lock. Production is untouched.

### Conflicting writes during active staging (Git-rebase semantics)

While staging is active, normal CSV writes through `putCsv` still go through — they're not blocked. If a CSV save lands while staging holds a snapshot of an older CSV, the next `validateStaging` call picks up the **current** production CSV when fetching unchanged files. If the staged SVG is still consistent with the new CSV, fine; the staged state stays GREEN. If not, validation flips to RED and the operator re-runs the wizard.

This is the "Git rebase" model: staging holds a delta against whatever production looks like at the moment of validation/promote.

### Staging atomicity (the simplest case)

The promote step copies two files (CSV and SVG). If the second copy fails after the first succeeded:

- Catch the failure; attempt to roll back the first copy via S3 version history (revert to the previous production version).
- Three outcomes:
  - Both copies succeed → success.
  - Second copy fails, rollback succeeds → 500 with `{ recovery: 'attempted' }`. Production is in its pre-promote state. Staging is still intact for retry.
  - Second copy fails, rollback also fails → 500 with `{ recovery: 'failed' }` and explicit manual-recovery instructions referencing S3 version history.

Frequency: once-a-year × tiny S3 failure rate × tiny rollback failure rate = negligible.

---

## Migration & rollout

The CSV may already contain rows that reference non-existent shelves (especially on floor 0, where the `data-map-object` marker is barely deployed). Turning the invariant on day one would reject legitimate saves because of pre-existing bad data. Migration is the bridge.

### Four stages

```
Stage 0 (now)        Production runs the existing Lambdas. No new code.

Stage 1 (deploy)     Ship all new code with BUNDLE_INVARIANT_ENABLED=false.
                     - putCsv runs validateBundle but only LOGS violations.
                     - Staging Lambdas exist but SVG Manager is NOT wired to them
                       yet; SVG Manager keeps using the existing direct-PUT
                       endpoint (PR #36).
                     - CSV Editor gets the "Broken refs" filter mode, off by
                       default.
                     - CloudWatch starts collecting violation metrics.

Stage 2 (telemetry)  ~1 week of normal admin activity.
                     - Watch bundle.violations.csv_write.
                     - Spot-check 3-5 logged violations on the real production
                       CSV. Confirm each is a real broken ref, not a false
                       positive in validateBundle.
                     - If false positives appear, fix the rule (not the data)
                       before continuing.

Stage 3 (cleanup)    Operator works through the broken refs in CSV Editor.
                     - Flip the "Show only broken refs" filter.
                     - For each row: rename svgCode (dropdown shows unclaimed
                       shelves on that floor), delete the row, or update the
                       SVG to add the missing shelf.
                     - Save normally. Saves go through (flag still off).
                     - Counter updates live; cleanup is done when it hits 0.

Stage 4 (flag flip)  Once telemetry shows zero new violations for ~3 days:
                     - Set BUNDLE_INVARIANT_ENABLED=true on all Lambdas.
                     - Switch SVG Manager to use the new staging endpoints
                       (uploadStagingSvg / validateStaging / etc.).
                     - Retire the direct-PUT SVG upload path.
                     - Verify with a known-bad save that putCsv now rejects 422.
```

### CSV Editor "Broken refs" filter mode

The Stage 3 cleanup UI is a filter mode added to the existing CSV Editor. Not a separate page, not a wizard.

- Toolbar toggle: **"Show only broken refs (N)"** — counter updates live.
- When active: table filters to rows whose `svgCode` does not resolve to a shelf on the row's floor.
- Each filtered row has an inline action area:
  - **"Rename to ▾"** — dropdown lists every unclaimed shelf on the row's floor (computed by comparing SVG shelf IDs to CSV `svgCode` values on that floor). Selecting a value populates the `svgCode` cell.
  - **"Delete row"** — standard confirm dialog → row removed from local state.
- Operator saves normally via `putCsv`. Saves succeed during Stage 3 because the flag is off.
- When the counter hits 0, the operator flips the filter back off and the editor returns to normal mode.

The filter mode survives past Stage 4. It's still useful for diagnosing any future broken refs (e.g., introduced by a bug).

### Observability

CloudWatch metrics emitted by the Lambdas:

| Metric | When emitted | What it tells us |
|---|---|---|
| `bundle.violations.csv_write` | Every `putCsv` call where `validateBundle` returns `!ok` | Are violations happening? Drives Stage 2 measurement and Stage 3 progress. |
| `bundle.violations.staging_red` | Every `validateStaging` call that returns RED | Long-term frequency of "SVG replace needs reconcile." Should be very low. |
| `bundle.violations.staging_promote_blocked` | Every `promoteStaging` that returns 422 (last-mile re-validate failed) | How often the Git-rebase race actually fires. |
| `bundle.atomicity.rollback_attempted` | Every `promoteStaging` failure where rollback was attempted | Rare-failure-path counter. |
| `bundle.atomicity.rollback_failed` | Subset of the above where rollback also failed | Should always be zero. If non-zero, page someone. |

Log lines on violations include `rowIndex/svgCode/floor` so Stage 2 spot-checks can be done against the actual production CSV.

### Rollback strategy

If the Stage 4 flip turns out to be wrong (legitimate edits being rejected for reasons we didn't anticipate):

1. Set `BUNDLE_INVARIANT_ENABLED=false` on all Lambdas; redeploy.
2. System reverts to Stage 2 behavior (logging only, no rejection).
3. Diagnose the issue. Fix the rule or the data.
4. Flip the flag back on when ready.

The staging endpoints and reconcile wizard are independent from the flag. If they have bugs, SVG Manager can be reverted to the direct-PUT endpoint (one config change in the admin frontend) while the CSV validation stays enabled. Independent failure domains.

### Estimated timeline

| Stage | What happens | Time |
|---|---|---|
| 1 — Deploy | Ship new code + tests. PR review, merge, AWS deploy. | ~1 week (eng) |
| 2 — Telemetry | Watch CloudWatch. Adjust rule if needed. | ~1 week (mostly waiting) |
| 3 — Cleanup | Operator works through filtered rows. Highly variable based on actual broken-ref count. | unknown; rough guess 1-4 hours of operator work |
| 4 — Flag flip + cutover | Env var change, SVG Manager wiring change, deploy. | ~1 day (eng) |

Total elapsed: ~2.5 weeks, most of which is observation/cleanup rather than active eng work.

---

## Error handling & edge cases

The staging model simplifies many cases that were complex in an inline-transactional design. The cases that remain:

### Bad SVG files

| Case | Where caught | Response |
|---|---|---|
| Uploaded file is not valid XML | `uploadStagingSvg` parses on upload; `parseSvg` throws | 400 with `{ error: "Could not parse SVG", detail: <parser message> }`. SVG Manager surfaces inline. Lock not acquired. |
| Valid XML but no shelves found | `parseSvg` returns empty array | `uploadStagingSvg` returns 400 with `{ error: "No shelves found", currentRefCount: 42 }`. Operator sees the count of what they were about to break. |
| Duplicate shelf IDs in one file | `parseSvg` detects | 400 with `{ error: "Duplicate shelf IDs", ids: [...] }`. Operator must fix the SVG before staging. |
| Replacement is byte-identical / metadata-only change | Detected at `validateStaging` (shelf sets are identical to current production) | Path GREEN with empty `addedShelves`/`removedShelves`. Operator can promote (the file content has changed even if shelf semantics haven't). |

### Bad reconcile maps

| Case | Response |
|---|---|
| Map is incomplete — some removed shelves have no action | `applyReconcileToStaging` returns 422 with `{ missing: [...] }`. Wizard re-renders with the missing entries highlighted. |
| Map points at a shelf that doesn't exist in the new SVG | `applyReconcileToStaging` returns 422 with `{ unknownTarget: "CB_X_new" }`. (Hard to reach from the UI since the dropdown is populated from the new SVG's shelves, but a direct API caller could.) |
| Map's `delete` action accidentally affects rows on multiple floors | Prevented by API contract: `delete` is scoped to `floor === <the floor being replaced>`. Other floors are untouched. |
| Map deletes rows that should have been renamed instead | Not blockable — the system can't read intent. Mitigation: the reconcile wizard's confirm dialog ("about to delete N CSV rows") is the affirmation step. |
| Map collapses multiple shelves to one (renames `CB_0`, `CB_1`, `CB_2` all to `X`) | Technically consistent; not blocked. Mitigation: the post-promote success summary explicitly says "3 rows now point at shelf X" so the operator notices. |

### Timing & concurrency

| Case | Response |
|---|---|
| Two operators saving CSV simultaneously | Same as today: last-writer-wins via `putCsv` semantics. Not made worse by the bundle invariant. Strict concurrency control (412 conflict / ETag) is the stretch goal from #37, not in scope here. |
| Operator opens reconcile wizard, walks away, comes back to submit | Wizard's local data may be stale. On submit, server re-runs validate (`promoteStaging` does this as a final gate); if a fresh diff appears, operator re-runs the wizard. |
| Two operators try to use staging at the same time | First one acquires the lock; second sees 423 "Staging in use by `<owner>` since `<timestamp>`. Wait or contact them." Lock is implemented as a `staging/.meta.json` field with conditional write. |
| Lambda cold start + 3-SVG fetch exceeds API Gateway 29s timeout | Mitigations: parallel-fetch the SVGs (Promise.all); cache parsed shelf sets in warm memory; if cold-start becomes a recurring issue, move SVG parsing out of the request path entirely (async re-parse on `uploadStagingSvg`; store parsed sets in a small DynamoDB table). The cache approach is sufficient for v1. |

### Client/server parity (the design's main quality risk)

Three layers of defense:

1. **Single canonical rule**, stated identically in both `svg-shelves.mjs` and `svg-shelves.js` as a comment block at the top of each file.
2. **Parity tests in CI** — a shared fixture directory of representative SVG snippets, run through both implementations; CI fails on any divergence.
3. **Server-side authoritative**. The client's `bundle-validator.js` provides preview / pre-submit UX, but the server's verdict via `validateStaging` or `putCsv`'s rejection is the truth. If they ever disagree, the operator hits the server's verdict — never a silent inconsistency in production data.

### Things explicitly out of scope

- **Per-row audit log.** "Who changed which row when." S3 versioning gives file-level history; per-row attribution would need a real database.
- **Soft-delete / trash for reconcile deletes.** A `delete` action removes the row outright. Recovery is via S3 version history. Adding a trash bin is a product feature, not a bundle-invariant concern.
- **Validation of business rules.** "Every collection has at least one row," "shelf labels follow naming convention," etc. Those are CSV-content concerns, not bundle-consistency concerns. Handled by `range-validation.js` and the existing validation panel.
- **Manifest-based atomic publish to Primo NDE.** Per Q4, we accept the CloudFront cache-bust window. If Primo NDE ever needs strict bundle atomicity, a `data/manifest.json` could be added later.
- **Shelf-identity registry.** Per Q1 + decisions section: not justified for once-a-year SVG changes.

---

## Testing strategy

### Unit tests (Jest)

**Server-side (`lambda/__tests__/`):**

| File | What it covers |
|---|---|
| `shared/validateBundle.test.mjs` | Empty CSV is valid; one broken row is rejected; multiple broken rows all reported; row referencing existing shelf on the wrong floor is rejected |
| `shared/svg-shelves.test.mjs` | SVG with `data-map-object="shelf"` markers returns those IDs; SVG without markers returns empty array; SVG with duplicate IDs flags the duplicate; malformed XML throws |
| `putCsv.test.mjs` | Valid save proceeds; invalid save returns 422 when flag is on and proceeds-with-log when flag is off; warm-container cache reuses fetched SVGs |
| `validateStaging.test.mjs` | Fetches staging + prod files correctly; returns structured report; handles "no staging present yet" |
| `applyReconcileToStaging.test.mjs` | Rename action updates affected rows; delete action removes them and is floor-scoped; missing entries return 422; reconcile against empty staging copies prod CSV first |
| `promoteStaging.test.mjs` | Happy path copies all files and clears staging; if promote fails mid-copy, staging is left intact for retry; lock released only on success or explicit discard |

**Client-side (`admin/__tests__/`):**

| File | What it covers |
|---|---|
| `svg-shelves.test.js` | Same fixtures as the server-side test (parity) |
| `bundle-validator.test.js` | Same scenarios as `validateBundle.test.mjs` against the same fixtures |
| `reconcile-wizard.test.js` | State machine: partial fill keeps submit disabled; valid map gets sent to `applyReconcileToStaging`; on subsequent `validateStaging` returning RED with a fresh diff, wizard re-renders against the new diff |
| `staging-status.test.js` | UI state machine: EMPTY → PENDING_VALIDATION → GREEN/RED → wizard-loop → GREEN → PROMOTED |

### Parity tests (the load-bearing safety net)

Single fixture directory at `__tests__/fixtures/svg-shelves/` containing ~10 hand-picked SVG snippets:

- Clean SVG with 5 marked shelves (common case)
- Clean SVG with 0 shelves (empty case)
- SVG with shelves but no `data-map-object` markers (issue #16 not yet applied)
- SVG with mixed marked / unmarked shapes (transition state — floor 0 today)
- SVG with nested `<g>` groups around shelves
- SVG with whitespace and namespace variations (Inkscape resave artifacts)
- SVG with a duplicate `id`
- Malformed SVG
- Large SVG (200+ shelves, performance smoke)
- SVG with `xlink:href` references

Each fixture has an adjacent `<name>.expected.json` with the canonical answer. Two test files (`lambda/__tests__/svg-shelves-fixtures.test.mjs` and `admin/__tests__/svg-shelves-fixtures.test.js`) load each fixture, run their respective parser, and assert equality with `.expected.json`. Any drift fails CI.

A second fixture directory at `__tests__/fixtures/bundles/` with `{ csvRows, svgs, expected }` exercises `validateBundle` parity the same way.

### Regression guards

Existing tests that must stay green throughout the rollout:

- `admin/__tests__/svg-loader.test.js` — the `cache: 'no-cache'` fix from PR #34 (sticky fix per CLAUDE.md).
- `admin/__tests__/svg-parser.test.js` — existing SVG parsing.
- All 113 existing Playwright tests for authentication, CSV editor, SVG manager, version history, user management, language toggle, role-based access. The bundle invariant doesn't change any of these scenarios; if any regress, we've quietly broken something.

### End-to-end tests (Playwright, `e2e/tests/staging/`)

| Scenario | Asserts |
|---|---|
| Strict-superset SVG replace (happy path) | Production SVG updated; CSV unchanged; staging cleared |
| Reconcile wizard: red → green → promote | Both prod files updated; affected CSV rows show new svgCodes |
| Reconcile wizard with deletes | Deleted CSV row gone in prod; confirm dialog appeared |
| Discard staging | Staging cleared; production untouched |
| CSV save during active staging (Git-rebase) | Re-validate produces fresh diff; if reconcile is now needed, wizard re-opens; staging promotes successfully |
| CSV invariant rejection with flag on | Save returns 422; inline error shows offending row; CSV not modified on server |
| Staging lock | Second operator sees "Staging in use by `<owner>`" message |
| Migration: Broken refs filter (Stage 3) | Counter accurate; filter view live-updates after save |

### Manual QA checklist per stage

**Stage 1 (deploy with flag off):**
- [ ] `putCsv` saves still work as before (no rejection)
- [ ] CloudWatch shows `bundle.violations.csv_write` incrementing on known-bad data
- [ ] Logs include row indexes for violations
- [ ] SVG Manager's existing replace flow still works (not yet wired to staging)

**Stage 2 (telemetry observation, ~1 week):**
- [ ] Violation count is non-zero (otherwise the rule isn't catching anything)
- [ ] Spot-check 3–5 logged violations; confirm each is a real broken ref
- [ ] If false positives appear, fix the rule before continuing

**Stage 3 (cleanup):**
- [ ] "Broken refs" filter shows the same rows the CloudWatch logs flagged
- [ ] Rename dropdown lists only unclaimed shelves on the row's floor
- [ ] Saving a row out of the broken state removes it from the filter view
- [ ] When counter hits 0, the next save with deliberately bad data is still logged-only (flag still off)

**Stage 4 (flag flip + SVG Manager cutover):**
- [ ] Set `BUNDLE_INVARIANT_ENABLED=true`; redeploy
- [ ] Verify deliberately-bad CSV save now returns 422
- [ ] Switch SVG Manager to staging endpoints
- [ ] Run a happy-path staging flow end-to-end manually
- [ ] Run a reconcile flow end-to-end manually
- [ ] Monitor `bundle.violations.csv_write` for 24h — expect zero

---

## Open questions / known limitations

- **Concurrent staging:** v1 ships with a single global staging area + first-operator-wins lock. If the team grows or operators frequently work on different floors in parallel, promote to per-user staging (under `staging/<userId>/` prefixes). Schema is forward-compatible.
- **Multiple files in one staging session:** v1 supports staging one floor's SVG plus the CSV-side reconcile artifacts. If an operator wants to replace two floors simultaneously, they can — the staging area accepts multiple SVG files — but the UX is uncommon. The wizard handles each floor's reconcile independently.
- **Primo NDE-side caching:** PR #34 added `cache: 'no-cache'` to the admin's floor-SVG fetches. The Primo NDE addon's fetch policy is outside our repo; if Primo NDE aggressively caches, the post-promote window where users see stale state could be longer than the CloudFront invalidation interval. Worth a follow-up issue if observed in practice.
- **Validation-rule evolution:** the bundle invariant could grow over time (e.g., "every collection has at least one row with a non-empty svgCode"). When that happens, the validation logic gains additional checks but the architecture stays the same — `validateBundle` returns more error types.

---

## Related issues

- [#37](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/37) — Ranges Editor (paused at Section 4 pending this design)
- [#35](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/35) / PR #36 — SVG Download / Replace (the acute pain point that triggered this design)
- [#14](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/14) — `svgCode` resolves-on-floor validation (subsumed by this design's CSV-write invariant)
- [#16](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/16) — `data-map-object` marker (the shelf-detection rule depends on it; floor 0 still mostly unmarked)
- [#27](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/27) — `?v=N` query-string cache-busting (orthogonal but relevant for the cache-invalidation behavior)
