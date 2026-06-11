# Dashboards

> **Status:** Current · Created 2026-06-11 · Home for HTML dashboard *outputs*
> (status reports, plan presentations, decision views, live QA surfaces).

**This folder holds dashboard outputs only — not the engine.** New dashboards are
built with the global **`html-dashboard` skill** (Claude Code), which has two modes:

- **Static** — a self-contained HTML file (inline CSS, no server). For reports,
  comparisons, one-shot presentations. Open it directly.
- **Interactive** — the skill serves the page via its own `engine/server.py`
  (`/assets/comms.js`), giving a live two-way browser↔Claude link. For
  collaborative review and manual QA.

So the repo no longer carries its own dashboard server. The earlier custom QA
bridge (`qa-server.py` + `qa-watch.sh` + `qa-reply.sh`) and its dated dashboards
are archived under [`../archive/dashboards/`](../archive/dashboards/) — superseded
by the skill's engine.

Name outputs `<date>-<topic>.html`. Cataloged in [`../INDEX.md`](../INDEX.md).
