# Archived dashboards + the custom QA bridge

> **Status:** Historical · Archived 2026-06-11 · The dated manual-QA dashboards
> and the hand-rolled localhost bridge that served them. **Superseded by the
> global `html-dashboard` skill's engine** — kept for the record / as examples.

## What's here

- **`*.html` (6 dated dashboards)** — point-in-time QA / planning surfaces from
  the May 2026 work. Their *results* live in the PRs and in
  [`../qa/`](../qa/) logs; these are just the screens they were shown on.
- **`qa-server.py`, `qa-watch.sh`, `qa-reply.sh`** — a custom localhost
  browser↔Claude bridge (ping/reply/state over `/ping`, `/reply`, `/state`).
  This predated and is now replaced by the `html-dashboard` skill's own
  `engine/server.py` + `/assets/comms.js`.

## Note

Most of the `*.html` files `fetch()` the bridge's endpoints, so they only render
fully when `qa-server.py` is running from this folder (it globs `*-qa.html`
here). The newest `2026-05-27-qa-dashboard.html` is self-contained (no server).

**Build new dashboards with the `html-dashboard` skill instead** — outputs go in
[`../../dashboards/`](../../dashboards/).
