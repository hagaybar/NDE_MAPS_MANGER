# Phase 4b — Reconcile wizard: the "Added" group — Design

**Date:** 2026-05-27
**Closes:** [#57](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/57). Sub-spec of Phase 4 (meta [#71](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/71)); builds on 4a (renames, merged). Parent design: `docs/superpowers/specs/2026-05-25-phase-4-reconcile-wizard-design.md`.
**Branch:** `feat/phase-4b-adds` · **tag:** `pre-4b-2026-05-27`.

## Problem (#57)

When a staged SVG contains a **new shelf** (a `data-map-object="shelf"` id not in the production SVG and not referenced by any CSV row), it does **not** fail validation (the bundle invariant is CSV→SVG only). So today the panel shows a green "ready to promote" and a one-click Promote — and the unmapped shelf goes live silently. A patron clicking it in Primo resolves to nothing. The system also can't tell an **intentional** new shelf from a **decorative element** that accidentally got tagged as a shelf.

## Goal

Before promote, make the librarian **make a deliberate choice for each new unmapped shelf** — without losing the frictionless path for genuinely-decorative cases. Reuse the existing reconcile wizard, adding an **"Added" group**.

## Flow & entry point (the heart of #57)

`validateStaging.summary.newlyAddedShelves = [{svgCode, floor}]` already exists (Phase 2/3). New shelves pass validation, so the gate is **client-side UX** in the passed-state panel:

- When `newlyAddedShelves.length > 0`, the passed panel **replaces the one-click "Start using this map"** with **"Review N new shelves"** (opens the wizard's Added group). Promote stays unavailable until the review is completed.
- After review, Promote unlocks. "Review completed" = every new shelf is either (a) given a library entry (so it drops out of `newlyAddedShelves` on re-validate) or (b) explicitly **left unmapped** (remembered for this session).
- If the staging is re-uploaded/re-validated, the session's "left unmapped" acknowledgements reset (a fresh upload is a fresh review).

(If `newlyAddedShelves.length === 0`, the panel is unchanged from #73/#78 — straight Promote.)

## The "Added" group (in `reconcile-wizard.js`)

One card per new shelf (`Floor N: <svgCode>`), each offering a per-shelf choice:

1. **Add library info now** — reveals an inline form (below). On the group's **Apply**, all "add" cards are submitted as appended rows → re-validate → those shelves become mapped.
2. **Leave unmapped** — explicit "on purpose" (decorative / map later). No CSV change; recorded client-side so Promote can unlock.

Plus a single, separate escape (not per-shelf, since we deliberately do **no in-app SVG editing** — see decision below):

> **"Is one of these not a real shelf?"** → guidance: *"That's a map-editing mistake. Discard this upload, remove the element from your map file, and upload it again."* + a **Discard** button that triggers the existing discard flow.

The group's **Apply** is enabled once every card has a choice (Add-with-valid-form, or Leave-unmapped).

### "Remove from SVG" decision (resolves a parent open item)

**No in-app SVG mutation.** Removal = the operator re-edits their source map and re-uploads (the Discard escape above). Rationale: the maps are Inkscape exports; re-serializing them in the browser or a Lambda risks silently reordering/altering bytes the operator never touched. Keeping the uploaded file authoritative is safer and far less code. (Parent spec open item "regex vs DOM" → **neither**; manual re-upload.)

## The inline "Add library entry" form

Prefilled + read-only: **`svgCode`**, **`floor`** (from the card).
**Required:** `libraryName`, `collectionName`, `rangeStart`, `rangeEnd`.
**Optional (all remaining CSV columns, operator may fill as many as they want):** `libraryNameHe`, `collectionNameHe`, `description`, `descriptionHe`, `shelfLabel`, `shelfLabelHe`, `notes`, `notesHe`.

Reuse the **existing CSV-editor column i18n labels** for field labels (no new label strings). Canonical column order is `lambda/applyReconcileToStaging.mjs` `COLUMNS`.

**Client validation before Apply:** required fields non-empty; range rules (`rangeStart`/`rangeEnd` same prefix, start ≤ end — reuse `admin/components/csv-editor.js` range validation / `lambda/range-validation.mjs` rules). The svgCode→floor bundle invariant holds by construction (it's a staged-SVG shelf), but the backend re-checks.

## Backend — new `add` action in `applyReconcileToStaging.mjs`

Extend the existing `reconcileMap` (keyed by svgCode → action). Add:

```
reconcileMap["<newSvgCode>"] = { action: "add", fields: { libraryName, collectionName, rangeStart, rangeEnd, /* + any optional columns */ } }
```

Handler changes:
- The existing loop maps over **existing staged rows** (rename/delete). `add` entries have **no existing row**, so after that loop, iterate `reconcileMap` entries with `action === 'add'` and **append a new row** built from `COLUMNS` (prefill `svgCode` = the map key, `floor` = body `floor`, copy provided `fields`, default missing columns to `''`).
- **Validate each appended row server-side** before write: required fields present; range rules (reuse `range-validation.mjs`); and the **bundle invariant** (svgCode resolves to a shelf on `floor` in the staged SVG — reuse `parseSvg` on `staging/maps/floor_N.svg` w/ prod fallback). Reject the whole request `422` with `{ error, svgCode }` on any invalid add (atomic — no partial write), matching the existing rename-error shape.
- Keep the lock/owner model + #60 backups untouched. Serialize via the existing `serializeRowsToCsv`.

`leave unmapped` sends **no** reconcileMap entry (no server change). The wizard simply re-validates/promotes; the client remembers the acknowledgement.

## Data flow

- **Add entry** → wizard POSTs `/staging/reconcile` `{ floor, reconcileMap: { code: {action:'add', fields} } }` → Lambda appends validated rows → client re-validates (`/staging/validate`) → shelf no longer in `newlyAddedShelves` → Promote unlocks.
- **Leave unmapped** → no server call; client marks the shelf acknowledged → Promote unlocks once all are added/acknowledged.
- **Not a real shelf** → Discard (existing flow) → operator re-edits + re-uploads.

## i18n (en + he; first-person voice per #73/#78)

New `svg.staging.reconcile.added.*` keys (drafts; Hebrew reviewable):

| Key | English | Hebrew (draft) |
|---|---|---|
| `…added.reviewButton` | Review {count} new shelves | בדקו {count} מדפים חדשים |
| `…added.title` | These shelves are on the new map but have no library info yet — tell me what each one is | המדפים האלה נמצאים במפה החדשה אך עדיין ללא נתוני ספרייה — ספרו לי מה כל אחד מהם |
| `…added.addNow` | Add its library info now | הוסיפו עכשיו את נתוני הספרייה שלו |
| `…added.leaveUnmapped` | Leave it unmapped (decorative / I'll map it later) | להשאיר ללא מיפוי (דקורטיבי / אמפה מאוחר יותר) |
| `…added.notReal` | Is one of these not a real shelf? | אחד מהם אינו מדף אמיתי? |
| `…added.notRealHelp` | That's a map-editing mistake. Discard this upload, remove the element from your map file, and upload it again. | זו טעות בעריכת המפה. השליכו את ההעלאה הזו, הסירו את הרכיב מקובץ המפה, והעלו שוב. |
| `…added.formTitle` | New shelf {svgCode} · Floor {floor} | מדף חדש {svgCode} · קומה {floor} |
| `…added.apply` | Save these entries | שמרו את הרשומות |
| `…added.requiredHint` | Library, collection, and range are required; the rest are optional. | ספרייה, אוסף וטווח הם שדות חובה; השאר אופציונליים. |

Field labels reuse existing CSV-editor column i18n.

## Testing

- **Lambda jest** (`applyReconcileToStaging.test.mjs`): `add` action appends a valid row; rejects 422 on missing required field / bad range / svgCode not resolving on floor; mixed rename+add in one reconcileMap; atomicity (one bad add → no write).
- **Admin jest** (`reconcile-wizard.test.js`): Added group renders one card per `newlyAddedShelves`; Apply disabled until every card chosen; add-form required-field + range validation; payload shape (`{action:'add', fields}`); leave-unmapped sends no entry. Panel (`staging-panel.test.js`): `newlyAddedShelves>0` shows "Review N new shelves" and gates Promote; unlock after review.
- **E2E** (`sot-staging.spec.ts`): upload a strict-superset SVG with a new shelf → panel shows "Review N new shelves" (not one-click promote) → wizard add-entry → re-validate green → promote. (Keep clear of the pre-existing reconcile-wizard removed-ref selector failure.)
- Full admin jest green except the 14 known pre-existing failures.

## Acceptance (maps to #57)

1. A staged SVG with a new unmapped shelf no longer offers one-click promote; the panel routes to a per-shelf review.
2. "Add library info now" appends a valid CSV row (required: library/collection/range; optional: the rest) and the shelf becomes mapped on re-validate.
3. "Leave unmapped" is an explicit, one-click choice that then allows promote.
4. "Not a real shelf" gives clear guidance + Discard (no in-app SVG editing).
5. en/he parity; bundle invariant + range rules enforced on add; tests green.

## Out of scope

- 4c (#59 soft-unlink pool + reassign) — next sub-spec.
- In-app SVG editing / typed map objects.
- Bulk add.

## Open items (resolve in the plan)

- Exact panel control for the gate (replace Promote vs disable + helper line) — pick the simplest that reads clearly.
- Whether the wizard "Added" group and the existing "Removed" group can both be open in one session, or are separate entry points — default: **separate** (Added opens from the passed panel; Removed from the failed panel), since they're driven by different validation states.
