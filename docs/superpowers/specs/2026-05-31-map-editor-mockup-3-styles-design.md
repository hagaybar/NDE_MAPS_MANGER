# Map Editor redesign — 3-style interactive mockup (design spec)

**Date:** 2026-05-31
**Status:** Approved (direction confirmed by owner 2026-05-31)
**Relates to:** [#97](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/97) (the side-panel
layout this mocks) · batch **B1** (#97 #86 #92 #91 #87) · the converged layout spec
`docs/superpowers/specs/2026-05-31-map-editor-side-panel-layout-design.md`

---

## 1. Goal

A **shareable, no-login, no-backend** page on CloudFront that lets a **single tester**
(the owner's admin partner) (a) **play with** the already-approved #97 Map Editor
side-panel layout, (b) compare **three visual treatments** of that one layout and tell us
which they prefer, and (c) **send structured feedback** (comments + screenshots) back to
the owner for tailoring.

The layout is **not** up for redesign here — #97 already finalized it. This mockup varies
**visual style only** (palette / typography / shape / density), so the tester is choosing a
*look*, not a *structure*.

## 2. Non-goals

- **Not** the implementation of #97 (no production code, no admin-app changes, no tests).
- **No real data or network:** zero calls to the live `mapping.csv`, floor SVGs, Lambda, or
  Cognito. All sample data is baked in. Nothing the tester does can affect production.
- **No backend:** feedback never auto-transmits; it is exported as a file the tester emails.
- **Not** wired into the authenticated admin SPA nav (that would need login + touch app source).

## 3. The screen (identical across all three styles)

One layout, faithful to the #97 spec:

- **Large floor map** on the leading side; a **persistent editing panel** on the trailing
  edge (**right in Hebrew/RTL, left in English/LTR**, via document `dir`).
- **Floor tabs** (קומה 0 / 1 / 2), each with its own sample shelves.
- **Four panel modes** driven by selection state:
  - **idle** — calm first-person hint + a collapsed *"⚠ {n} shelves need attention →"* nudge
    shown **only when n>0**, expanding the triage list on click.
  - **shelf** — that shelf's entries as **vertical stacked cards**: full-width collection,
    labelled **מ-/From** + **עד-/To**, *Move to another shelf*, *Remove*, *+ Add another
    entry*, Save/Discard, **always-visible inline** error lines.
  - **reassign** — an **amber instruction strip over the map** + passive "moving…" + Cancel
    in the panel; confirming pulses legal targets and **toasts** the result (incl. cross-floor).
  - **triage** — the "needs a shelf" worklist, entered deliberately from the idle nudge.

## 4. The three visual styles (the choice the tester makes)

A floating **A / B / C switcher** re-skins the same DOM instantly (toggles `data-theme` →
CSS custom-property overrides + font/shape changes). No layout differences between them.

| | **A — Library Classic** | **B — Warm Reading Room** | **C — Focused Modern** |
|---|---|---|---|
| Vibe | Today's app, refined | Calm, humane, "paper" | Crisp, contemporary |
| Accent | Blue `#2563eb` | Teal / library-green `#0f766e` | Indigo `#4f46e5` |
| Surface | White + slate grays | Cream / paper `#faf7f2` | Cool near-white + subtle elevation |
| Headings | system-ui | **Frank Ruhl Libre** (Hebrew serif) | **Rubik / Heebo** (geometric sans) |
| Body | system-ui | **Assistant** | **Heebo** |
| Shape / density | 6–8px radii, thin borders | 14px rounded cards, roomy, soft shadows | pill buttons, tighter, strong hierarchy |

Web fonts load from Google Fonts **with system fallbacks** (so the page still works offline
/ if the CDN is blocked). Style A is intentionally the current app's look so the partner has a
familiar baseline.

## 5. Interactive "play" scope

All on baked-in fake data, with a **Reset** button (clears session edits + feedback).

- Switch floors (3 tabs, each its own shelves/entries).
- Click a shelf → **shelf** mode; click empty background → **idle**.
- Edit **collection / From / To**: typing **keeps focus and caret** — the in-place update that
  is the **#86** fix (no full re-render on keystroke); the demo deliberately contrasts this so
  the tester feels it works.
- **+ Add another entry**, then **Save** → the saved/added entry **stays visible** in the panel
  (the second half of **#86**) / **Discard**.
- **add → Move** keeps the row; **add → Remove** cleanly drops it (**#92**).
- **Move to another shelf** → reassign strip over map → click a target → **toast** (cross-floor
  switches the tab + toasts).
- **Inline warnings**: overlap with another shelf, and "From is higher than To" — always-visible
  amber lines (not tooltip-only).
- **עברית / English** toggle (RTL ↔ LTR); the panel mirrors sides automatically.

> **Honestly not shown** (backend / no UI): **#91** (a one-line `cache:'no-cache'` flag) and
> **#87** (verified already-correct → verify-and-close). A short "what's also in this batch"
> note in the page names them so the tester knows the scope.

## 6. Feedback system (the "bundle" approach — no backend)

- **Help card** ("How to give feedback", Hebrew-first, EN on toggle): shown on first open,
  reopenable from a **?** button. Explains: you're viewing Style A/B/C; how to comment; how to
  attach a screenshot; how it gets to us.
- **💬 feedback panel:** auto-captures the **current style + language**; a **topic dropdown**
  (the map / the editing panel / From-To fields / colors & fonts / wording / general); a
  **comment** box; **screenshot upload** (drag-drop or picker, multiple, thumbnail previews,
  remove). Submitted notes append to a visible **list**.
- **Persistence:** notes + screenshots are kept in **localStorage** (browser only — never the
  real CSV/maps), so a reload doesn't lose them.
- **Export / Send:** builds **one self-contained `.html` file** (all comments + metadata +
  **screenshots embedded as data-URIs**) and triggers a download; **also** opens a pre-filled
  **`mailto:hagaybar@tauex.tau.ac.il`** draft instructing the tester to attach the just-
  downloaded file. (Email standards can't auto-attach; the draft tells them to attach it.)
  A "Copy as text" fallback copies the comments to the clipboard.

## 7. Architecture & files

Self-contained static page under `mockups/map-editor/` (NOT under `admin/`, so `redeploy.sh`'s
`aws s3 sync admin/ --delete` never touches it):

```
mockups/map-editor/
  index.html        # shell: header (floor tabs, lang+theme switchers), split, panel, modals
  styles.css        # theme-agnostic layout + components, all colors via var(--token)
  themes.css        # [data-theme="a|b|c"] custom-property + font/shape overrides
  data.js           # sample floors, shelves, entries; i18n string table (he/en)
  app.js            # modes, selection, in-place editing (#86), add-safe move/delete (#92),
                    #   reassign+toast, floor/lang/theme switching, reset
  feedback.js       # feedback panel, localStorage, export-bundle builder, mailto
  floor-svg.js      # hand-crafted clean sample floor SVGs (3 floors), shelves as <g id=…>
```

- The sample floor SVGs are **hand-crafted** (clean, legible, obviously a demo) — not copies of
  the production Inkscape exports — so the visual review is about the *chrome/skin*, and the file
  stays light. Shelves are clickable `<g>`/`<rect>` with `data-svgcode`; CSS classes drive
  hover / selected / pulse-target / needs-attention states.
- Pure vanilla JS + CSS, no build step, no framework — drop-in deployable.

## 8. Privacy / safety

- No fetch to any production endpoint; no auth; nothing writes to S3/Lambda/CSV.
- Feedback lives only in the tester's browser until **they** export + email it.
- Screenshots are whatever the tester chooses to upload; embedded only into the file they send.

## 9. Deploy / rollback

- Build on branch `feat/map-editor-mockup`; **show the owner locally first** (e.g.
  `npx http-server mockups/map-editor -p 8123`), deploy **only on the owner's OK**.
- Deploy: `aws s3 sync mockups/map-editor/ s3://tau-cenlib-primo-assets-hagay-3602/mockups/map-editor/`
  then CloudFront-invalidate `/mockups/*`. Live URL:
  `https://d3h8i7y9p8lyw7.cloudfront.net/mockups/map-editor/`.
- Rollback = delete the `mockups/` prefix; nothing else depends on it.

## 10. Acceptance criteria (for the mockup itself)

- [ ] One page renders the #97 layout (large map + persistent trailing panel + floor tabs);
      panel sits right in Hebrew, left in English.
- [ ] A/B/C switcher restyles the whole screen with no layout shift; all three look clearly
      distinct and polished.
- [ ] Clicking shelves drives the four modes; idle nudge appears only when n>0 and opens triage.
- [ ] Typing in From/To/collection keeps focus; after Save the saved/added entry stays in the
      panel (the #86 demonstration); add→move keeps, add→remove drops (the #92 demonstration).
- [ ] Move shows the amber strip over the map and toasts on confirm (incl. cross-floor tab switch).
- [ ] עברית/English toggle flips direction and mirrors the panel; strings are plain-language.
- [ ] Feedback: comment + screenshot capture works; notes persist across reload; Export produces
      one self-contained file with embedded screenshots and opens a mailto draft to
      `hagaybar@tauex.tau.ac.il`.
- [ ] Zero network calls to production data; works opened directly from CloudFront with no login.
