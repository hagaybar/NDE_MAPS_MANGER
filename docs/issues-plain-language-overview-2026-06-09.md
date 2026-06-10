# The Library Map System: What's Still Unfinished

> A plain-language, non-technical tour of the open issues, grouped by what they
> actually mean for the people using the app. Issue numbers are in parentheses.
>
> **Snapshot: 2026-06-09** (after the data-quality dashboard chapter shipped —
> #157/#156/#158/#105 closed — and the staff-email PII logging fix, #63). Issues
> change over time — re-generate from `gh issue list` when revisiting. For the
> technical record of what shipped, see `docs/archive/sessions/2026-06-08-summary.md`.

The app is in good shape — the dangerous, day-one problems are gone, and the
**data-quality report is now trustworthy** (its on-screen / Excel / print numbers
agree, and the overlaps it used to hide are surfaced). What remains are mostly
**rough edges, a few quiet fibs, and some plumbing that hasn't been fully
tightened.** Here are the chapters.

## 1. The map editor has a few sticky spots
This is the visual tool where staff click shelves and assign them. It works, but
has annoyances that bite during real editing: adding a brand-new shelf entry and
saving it leaves it **stuck — you can't edit it again** (#126). Cancelling a
"reassign" half-way can **glitch the screen** (#125). Moving a shelf to a
**different floor can leave ghosts behind** — the old floor shows phantom problems
until you refresh (#124). When a save is refused, the message is **vague and
doesn't say why** (#134). None of these lose data; they're "why did it do that?"
moments. *(Wish-list: bulk-assign a whole collection at once (#37); decide how the
special "covers-everything" collection should behave (#12).)*

## 2. The "replace a map and tidy up" flow is half-finished
When you upload a new floor map, the app helps reconcile shelves that no longer
match. This is the **riskiest unfinished area** because it touches real data.
Today it only cleans up the **first floor's** broken links and **quietly skips the
others** (#130); one counter is **misleading** (#129); and its delete step can
**lose information with no undo** (#59). Several buttons here **don't show a
"working…" signal** (#72). There's an open plan to redesign this whole flow to be
safer and shelf-centric (#71), plus a nice safety idea: **warn you if a
newly-uploaded map looks wildly different** from the current one, in case you
grabbed the wrong file (#85).

## 3. A handful of quiet data-integrity gaps
The mapping file occasionally accumulates **blank or half-filled rows** nobody
asked for (#84). Restoring an older version can **skip the safety checks** that
normally protect the file (#55), and the restore screen sometimes **refuses
perfectly valid old versions** (#94). Low-frequency, but worth closing so
"restore" is always trustworthy.

## 4. Accounts, permissions, and one real security item
Mostly small: the user list **never shows a "Disabled" badge** (#149); an editor's
range limits can **wrongly block edits they should be allowed to make** (#121);
and changing someone between editor and admin can **leave old restrictions
lurking** that silently come back later (#128). The one that genuinely matters:
the login-token checks are **not as strict as they should be** — a
security-hardening item worth doing deliberately (#90). There's also a request to
**reorder the navigation tabs and tailor them per role** (#83).

## 5. Production plumbing — the "rare but bad" risks
Two of these are the **highest-stakes items left**, even though they almost never
fire. Publishing a new map+data is **not done as one all-or-nothing step** — a
failure mid-publish could leave the live site briefly inconsistent (#89). And
there's a **mismatch between this app and the live Primo catalog** about what a
blank "floor" means — which can make a shelf **silently fail to highlight** for a
patron (#88). Smaller: the first request after a quiet period can **occasionally
fail** before warming up (#43); and a planned feature to **cross-check collection
names against Alma weekly** (#8).

## 6. Polish, consistency, and housekeeping
The broad, low-risk pile: rewriting **all remaining wording into plain,
librarian-friendly language** (#78, ongoing), a proper **accessibility pass** for
keyboard and screen-reader users (#141), and assorted internal tidying and
test-coverage gaps users never see (#54, #52, #27, #65, #114, #148, #139, #140).

---

## The moral of the story
Nothing here is on fire. If you only ever touched three things, pick the **two
"rare but bad" plumbing items (#88, #89)** and the **security hardening (#90)** —
the ones that could quietly hurt a real patron or the live catalog. After that,
the **map-replacement/reconcile flow (Chapter 2)** is where the most user-facing
risk and frustration still live, and would be the highest-value *project* to take
on next.
