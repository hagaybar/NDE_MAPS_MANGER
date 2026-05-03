# Map Editor UX Polish — Design Spec

**Date:** 2026-05-03
**Sub-project:** D (after A: map-based range editor)
**Closes:** #1, #2, #3, #4, #5, #6
**Branch:** `feat/map-editor-ux-polish` (cut from `main`, with pre-feature tag `pre-map-editor-ux-polish`)

## 1. Goal

Resolve the six open Map Editor UX issues with a single coherent initiative. Land a polished editor where the drawer never overlays the map, SVG content renders aligned, drawer rows read as units, input cells look editable, the close affordance is obvious, and the multi-shelf batch-edit feature is removed per post-deploy product decision.

The initiative serves as the project's first end-to-end visual-regression workflow: every visual change is gated by a snapshot baseline that the user approves once and is then enforced automatically on every subsequent commit.

## 2. Scope

### In scope (closes)

- **#1** — Bottom drawer covers part of the floor map.
- **#2** — SVG content (shelf numbers and labels) misaligned in the editor.
- **#3** — Remove multi-shelf batch-editing entirely.
- **#4** — Drawer field rows too widely spaced.
- **#5** — `rangeStart` / `rangeEnd` cells look non-editable.
- **#6** — Discard / Cancel does not effectively close the drawer.

### Out of scope

- Side-panel layout at wide viewports (issue #1 alternative C). Drop unless `responsive-audit` reveals it's needed.
- Pencil/edit-glyph affordance for input cells (issue #5 optional enhancement). The CSS treatment alone is sufficient.
- Keyboard shortcuts beyond Esc.
- Phase 5 closeout deliverables (Hebrew user guide, CloudWatch monitoring) — tracked separately.

## 3. Sequencing

Three phases, one approval gate at the end of each phase that has visual changes.

| Phase | Issues | Visual gate? |
|---|---|---|
| Phase 1 — cleanup | #3 | No (no visible UI changes for single-shelf flows) |
| Phase 2 — alignment diagnosis + fix | #2 | Yes (1 baseline pair) |
| Phase 3 — polish | #1, #4, #5, #6 | Yes (4 baseline groups × locale × role) |

Rationale: Phase 1 deletes ~150 lines of code and a whole drawer mode. Polish in Phase 3 then operates on a smaller, single-shelf-only surface. Phase 2 is independent and runs between to give the alignment fix its own clean slate before polish piles on.

## 4. Architecture

### 4.1 Babysitter orchestration shape

A single `babysitter:yolo` run driven by a new process definition `.a5c/processes/map-editor-ux-polish.js`. The run is structured as three phase blocks separated by approval-gate tasks.

Each phase block contains:

1. Implementation tasks (delete files / modify CSS / add behaviors).
2. Quality-gate sub-run (run unit tests, behavior assertions, snapshot tests).
3. Approval-gate task (only if the phase produces baselines): post baselines to the visual companion, wait for human approval, commit baselines.

The run is fully resumable via `babysitter:resume` if it stalls at an approval gate.

### 4.2 Branch lifecycle

- Cut `feat/map-editor-ux-polish` from `main`.
- Tag the cut point as `pre-map-editor-ux-polish` for rollback safety.
- All commits land on the branch.
- After phase 3 completes, open one PR to `main` with body listing all closed issues and the baseline-approval audit trail.

### 4.3 Approval-gate protocol

For each baseline-producing phase, the gate task does the following:

1. Run Playwright with `--update-snapshots=missing` to generate any newly-required baselines from the current implementation state.
2. For each new PNG, write a content fragment to the brainstorm visual companion screen with the image embedded (`<img src="data:image/png;base64,...">`) and an Approve/Reject choice. Multiple baselines are presented as a multi-select grid.
3. Poll `$STATE_DIR/events` until clicks for every baseline are recorded. Terminal-text fallback ("approve all" / "reject snapshot X") is also accepted.
4. On all-approved: stage `e2e/tests/__screenshots__/**/*.png`, commit `test(map-editor): lock approved baselines for phase N`.
5. On any rejected: serialize the rejection list (with terminal-text reason) into the journal and loop the implementing task with the corrective context. Iterate until next gate run.

After approval, every subsequent test run uses the locked baselines as a strict regression gate.

## 5. Phase 1 — Delete multi-shelf batch-editing (#3)

### 5.1 Implementation tasks

In order:

1. Delete `admin/components/map-editor/distinct-values-widget.js`.
2. `admin/components/map-editor/svg-interaction.js`: remove `attachMarquee` export and the entire Shift-drag marquee implementation. Remove `onMultiToggle` parameter and the `Ctrl/⌘-click` branch in `attachInteraction`.
3. `admin/components/map-editor/shelf-state.js`: remove `selectMulti`, `addToSelection`, `removeFromSelection`. Selection shape becomes `{ kind: 'none' | 'single', shelfIds: string[] }` with `shelfIds.length ≤ 1`.
4. `admin/components/map-editor/shelf-drawer.js`: remove `showMultiShelf` and the `import { buildDistinctValuesWidget }` line.
5. `admin/components/map-editor.js`: remove `attachMarquee` import + call inside `initMapEditor`, remove the `sel.kind === 'multi'` branch in `renderDrawer`, remove `onMultiToggle` callback passed to `attachInteraction`. Ctrl/⌘-click falls back to plain single-select.
6. `admin/i18n/en.json` + `he.json`: remove keys `mapEditor.shelves.selected`, `mapEditor.replaceAllWith`, `mapEditor.clearOnSelected`, `mapEditor.distinctValues`.
7. `admin/__tests__/shelf-state.test.js`: remove tests covering `selectMulti` / multi-select transitions / multi-mode permission filtering.
8. `e2e/tests/map-editor.spec.ts`: remove the `Map Editor: Shift-drag marquee selects multiple, bulk edit notes` spec.
9. `docs/superpowers/specs/2026-04-28-map-editor-design.md`: move multi-shelf bulk-edit decisions to "Out of scope" (§10) with a one-line note linking to issue #3.

### 5.2 Quality gate

- New behavior assertion: a Playwright spec that runs `grep -r "selectMulti\|multiToggle\|showMultiShelf\|distinct-values-widget" admin/` and asserts zero matches.
- All existing single-shelf E2E tests still pass.
- Console clean (no `console.error` / `console.warn` during any test).
- Existing Jest-style unit tests pass.

### 5.3 Commit

`refactor(map-editor): remove multi-shelf batch-editing (closes #3)`

No baselines required — single-shelf flows are visually unchanged.

## 6. Phase 2 — SVG alignment diagnosis + fix (#2)

### 6.1 Diagnostic step

A Playwright fixture loads the editor with `floor_1.svg` and:

1. Snapshots the live editor canvas (`#map-canvas svg`).
2. Snapshots `https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_1.svg` opened directly.
3. Diffs the two and locates misaligned `<text>` / `<tspan>` elements by their bounding-box delta.

Then it probes the three suspected causes from issue #2, in order:

- **CSS bleed**: temporarily wrap `.map-shelf*` selectors with `:where(rect.map-shelf, path.map-shelf)` so they cannot cascade onto text elements. Re-snapshot. If alignment restores → permanent fix is the scoped selectors in `admin/styles/app.css`.
- **Hatch-defs collision**: temporarily remove the injected `<defs>` block from `initMapEditor`. Re-snapshot. If alignment changes → permanent fix is to inject the hatch pattern inside the loaded SVG itself, or rename `id="map-shelf-hatch"` to a guaranteed-unique namespace.
- **Container scaling**: temporarily set `#map-canvas svg { width: auto; height: auto; }`. Re-snapshot. If alignment changes → permanent fix locks the loaded SVG's `width`/`height` from its own `viewBox` at load time inside `svg-loader.js`.

Whichever probe restores alignment becomes the permanent fix. The journal logs which cause was identified.

If all three probes fail, the run pauses at this point and asks the user for input rather than guessing.

### 6.2 Quality gate

- Visual snapshot: editor canvas matches the standalone CloudFront render with `toHaveScreenshot({ maxDiffPixels: 50, threshold: 0.2 })`. Approved by user in the visual companion before locking.
- Both EN-LTR and HE-RTL snapshots pass (alignment is direction-independent but verified).
- All existing E2E + behavior tests still pass.
- Console clean.

### 6.3 Commit

`fix(map-editor): SVG text alignment in editor canvas (closes #2)`

Commit message body identifies which probe identified the cause.

### 6.4 Approval gate

One approval gate produces 2 baselines (LTR + RTL editor canvas).

## 7. Phase 3 — Polish (#1, #4, #5, #6)

### 7.1 Design tokens addendum

Phase 3 begins by invoking `ui-design:spacing-system`, `ui-design:visual-hierarchy`, and `ui-design:layout-grid` to produce `admin/styles/design-tokens.css`. The four polish fixes reference these tokens, not magic numbers.

```css
:root {
  /* Spacing scale */
  --space-half: 2px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 32px;

  /* Border tokens */
  --border-input: #d1d5db;
  --border-input-hover: #94a3b8;
  --border-input-focus: #3b82f6;
  --border-row-divider: #f1f5f9;

  /* Background tokens */
  --bg-input-idle: #f9fafb;
  --bg-input-hover: #ffffff;
  --bg-input-focus: #ffffff;
  --bg-row-hover: #f8fafc;

  /* Layout tokens */
  --drawer-min-height: 12rem;
  --drawer-max-height: 50vh;
}
```

`admin/index.html` includes `design-tokens.css` before `app.css`.

### 7.2 Commit 3a — layout (#1)

Restructure `#map-editor-view` markup in `initMapEditor` to a flex column:

```css
#map-editor-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
}
#map-canvas {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.map-drawer {
  flex-shrink: 0;
  min-height: var(--drawer-min-height);
  max-height: var(--drawer-max-height);
  /* DROP: position: fixed; bottom: 0; */
}
```

Result: the canvas always takes available space; the drawer pushes content up rather than overlaying. Bottom shelves remain visible while editing.

Commit: `feat(map-editor): drawer no longer overlays canvas (closes #1)`.

### 7.3 Commit 3b — drawer polish (#4 + #5 + #6)

Single commit because all three touch `shelf-drawer.js` + `app.css`.

**#4 — row spacing:**

```css
.map-drawer__row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr auto auto;
  gap: var(--space-1);
  padding: var(--space-half) 0;
  align-items: center;
  border-radius: 3px;
}
.map-drawer__row:hover {
  background: var(--bg-row-hover);
}
.map-drawer__row + .map-drawer__row {
  border-top: 1px solid var(--border-row-divider);
}
.map-drawer__rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-half);
}
```

**#5 — input affordance:**

```css
.map-drawer__row input,
.map-drawer__row select {
  border: 1px solid var(--border-input);
  background: var(--bg-input-idle);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
  transition: background 120ms ease, border-color 120ms ease;
}
.map-drawer__row input:hover,
.map-drawer__row select:hover {
  background: var(--bg-input-hover);
  border-color: var(--border-input-hover);
}
.map-drawer__row input:focus,
.map-drawer__row select:focus {
  outline: 2px solid var(--border-input-focus);
  outline-offset: 1px;
  background: var(--bg-input-focus);
}
.map-drawer__row--locked input,
.map-drawer__row--locked select {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}
```

The locked-row rule comes after the idle/hover/focus rules so it overrides them.

**#6 — drawer close:**

In `shelf-drawer.js` `showSingleShelf`, add `<button id="drawer-close" aria-label="..." title="...">×</button>` to the drawer header next to Save/Discard. The button's `aria-label` and `title` use `i18n.t('mapEditor.close')`.

In `map-editor.js`, supply an `onClose` callback to `mountDrawer`:

```js
onClose: () => {
  shelfState.clearSelection();
  applySelection(shelfElements, []);
  window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
}
```

Add a global Escape handler in `initMapEditor`:

```js
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (isReassignActive()) return; // reassign-mode handles its own Esc
  const pending = shelfState.pendingEdits().size;
  if (pending > 0) {
    if (!confirm(i18n.t('mapEditor.unsavedChangesConfirm'))) return;
    shelfState.revert();
    refreshConflicts();
  }
  shelfState.clearSelection();
  applySelection(shelfElements, []);
  window.dispatchEvent(new CustomEvent('mapeditor:selection-changed'));
});
```

i18n additions in `en.json` and `he.json`:

- `mapEditor.close` — "Close" / "סגור"
- `mapEditor.unsavedChangesConfirm` — "You have unsaved changes. Discard and close?" / "יש שינויים שלא נשמרו. לבטל ולסגור?"

Commit: `feat(map-editor): drawer close affordance + row polish (closes #4 #5 #6)`.

### 7.4 Quality gate

**Behavior assertions** (in `e2e/tests/map-editor-ux.spec.ts`):

- Click `#drawer-close` → drawer closes, no selection.
- Esc with no pending edits → drawer closes silently.
- Esc with pending edits → confirm dialog appears; cancel keeps drawer open with edits intact; OK reverts edits and closes.
- Esc during active reassign-mode → reassign cancels, drawer remains open.

**Snapshot suite** (4 baselines × 4 project combinations = 16 PNGs):

| Snapshot | What it captures |
|---|---|
| `drawer-closed.png` | Canvas at full height, no drawer (#1) |
| `drawer-open-single-shelf.png` | Drawer open, idle state (#4 row spacing, #5 idle input, #6 close button) |
| `drawer-open-input-focused.png` | Drawer open with input field focused (#5 focus ring) |
| `drawer-open-locked-row.png` | Drawer open with a locked row visible (verifies #5 hierarchy preserved against locked-row CSS) |

Each snapshot runs in 4 Playwright projects: `en-admin`, `he-admin`, `en-editor`, `he-editor`. Total 16 baselines.

**Responsive audit** runs `ui-design:responsive-audit` at viewport widths 1280, 1024, 768. Any new overflow / clipping fails the gate.

**Existing**: all 113 E2E tests pass; console clean; existing unit tests pass.

**New unit test**: `admin/__tests__/map-editor-esc.test.js` covers the Esc handler's pending-edits-confirm branch (deterministic without DOM).

### 7.5 Approval gate

One approval gate at the end of phase 3 produces all 16 baselines plus the responsive-audit report. User approves all in the visual companion. Commit on approval: `test(map-editor): lock approved baselines for phase 3`.

## 8. Quality-gate plumbing

### 8.1 Playwright projects

`playwright.config.ts` adds locale × role projects:

```ts
projects: [
  { name: 'en-admin', use: { locale: 'en', storageState: '.auth/admin.json' } },
  { name: 'he-admin', use: { locale: 'he', storageState: '.auth/admin.json' } },
  { name: 'en-editor', use: { locale: 'en', storageState: '.auth/editor.json' } },
  { name: 'he-editor', use: { locale: 'he', storageState: '.auth/editor.json' } },
],
```

Snapshot tests use `await expect(page).toHaveScreenshot('name.png', { maxDiffPixels: 50, threshold: 0.2 })`. Playwright auto-suffixes baselines per project (`name-en-admin-linux.png`).

Existing E2E tests that aren't locale/role-sensitive run only in the default `en-admin` project (avoid 4× test runtime).

### 8.2 New fixtures

- `e2e/fixtures/locale.ts` — `setLocale('en' | 'he')` helper that injects the locale into the SPA's i18n state.
- `e2e/fixtures/role.ts` — `loginAs('admin' | 'editor')` wrapping the existing auth fixtures.
- `e2e/fixtures/console.ts` — `assertConsoleClean()` that fails on any `console.error` or `console.warn` collected during the test. Wired in via Playwright `test.afterEach` hook.

### 8.3 Chromium pinning

Snapshot reproducibility requires a pinned Chromium build. The babysitter run installs `chromium@<version>` via `npx playwright install --with-deps chromium` and the approval-gate task asserts the installed version matches the pinned version recorded in `package.json`.

### 8.4 Snapshot storage

Baselines live under `e2e/tests/__screenshots__/` (Playwright's default), versioned in git alongside the code that produced them.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Phase 2 diagnosis finds none of the three suspected causes | Run pauses, exposes diff data in the journal, asks user for input. Doesn't guess. |
| Snapshot rasterization drifts between local and any CI | Pin Chromium version; assert the pinned version in the approval-gate task. |
| HE-RTL snapshot reveals a layout asymmetry the EN baseline didn't catch | Treat as new acceptance criteria for the same issue; iterate. `bidi-engineering` skill is available if needed. |
| Design tokens conflict with Tailwind utilities elsewhere in the SPA | Tokens scoped to `:root` and consumed via `var(--token)`; no conflict surface with Tailwind utility classes. Verified by `responsive-audit`. |
| Approval gate stalls because user is unavailable | Run is resumable via `babysitter:resume`; state persists in `.a5c/runs/`. |
| Issue #2 fix breaks Primo NDE production rendering | All probes confined to `#map-canvas` styles within the editor; no changes ship to `/maps/*.svg` files served to Primo. |
| Locked-row CSS regresses with new input affordance | Snapshot suite includes a locked-row state per phase 3; gate fails if hierarchy regresses. |

## 10. Rollback

- Pre-feature tag `pre-map-editor-ux-polish` placed at branch cut.
- Each phase ends with at most 2 source commits + 1 baseline-lock commit. Bisect-friendly.
- Branch revert: `git reset --hard pre-map-editor-ux-polish` on the branch.
- PR revert: close un-merged. No production impact since merge to `main` is the deploy boundary; deploy is a separate manual step.
- Baselines are versioned alongside code, so reverting code automatically reverts gates.

## 11. ui-design skill usage

| Skill | Phase | Purpose |
|---|---|---|
| `ui-design:spacing-system` | Spec phase (this doc), then Phase 3 prelude | Defines the `--space-*` token scale referenced by #4 and #5. |
| `ui-design:visual-hierarchy` | Spec phase, Phase 3 prelude | Establishes the affordance principles that #5 (input border/background/focus) and #4 (row grouping) implement. Also verifies the locked-row treatment remains visually distinct. |
| `ui-design:layout-grid` | Spec phase, Phase 3 prelude | Defines the canvas-flex / drawer-flex column structure for #1. Also defines breakpoint behaviour for the responsive audit. |
| `ui-design:responsive-audit` | End of Phase 3 | Cross-breakpoint check at 1280, 1024, 768. Catches overflow / clipping introduced by the layout rework. |

Skills explicitly NOT used: `color-palette`, `color-system`, `dark-mode-design`, `typography-scale`, `type-system`, `data-visualization`, `illustration-style`, `design-screen`, `responsive-design`. None align with the open issues.

## 12. Done criteria

- Branch `feat/map-editor-ux-polish` has ≤7 commits: 1 deletion (Phase 1) + 1 alignment fix (Phase 2) + 1 design-tokens addendum (Phase 3) + 2 polish commits (Phase 3) + 1–2 baseline-lock commits.
- All quality-gate items pass: 113 existing E2E tests + new behavior tests + 16 phase-3 snapshot baselines (× locale × role) + 2 phase-2 snapshot baselines + console-clean + responsive-audit at 3 viewport widths + new + existing unit tests.
- One PR open `feat/map-editor-ux-polish → main`. Body lists "Closes #1, #2, #3, #4, #5, #6" and includes the baseline-approval audit trail (which baseline was approved, when, by which terminal-text comment if any).
- User reviews PR and merges.

Deploy (manual, post-merge): `aws s3 sync ./admin s3://tau-cenlib-primo-assets-hagay-3602/admin/` + CloudFront invalidation. Outside the babysitter run.

## 13. References

- Sub-project A spec: `docs/superpowers/specs/2026-04-28-map-editor-design.md`
- Issues: #1, #2, #3, #4, #5, #6 on the project repo
- Existing E2E patterns: `e2e/tests/map-editor.spec.ts`, `e2e/tests/csv-editor.spec.ts`
- AWS infrastructure: `docs/AWS-INFRASTRUCTURE.md`
