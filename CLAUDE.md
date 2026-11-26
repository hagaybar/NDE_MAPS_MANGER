# CLAUDE.md — Primo Maps (NDE shelf-map data)

## Hard Rules: read WORKFLOW.md before resolving any issue
The owner is an architect who does not read source code. `WORKFLOW.md` governs all work (full
text and reasons there; agents never edit it, `workflow.schema.json` or the PR template).
- **HR1** Never weaken, skip, narrow or delete a test to make a build pass.
- **HR2** If a test seems wrong, file a one-line Spec Dispute in the PR; do not edit the test.
- **HR3** Every behavioural change adds a test you observed go red→green this run; name it in the PR.
- **HR4** Test behaviour at stable boundaries (Lambda API contract, UI behaviour), never call structure.
- **HR5** Never ask the owner to read code: AC, tradeoffs, the running app, the AC↔test map.
- **HR6** One revertable unit per issue: one PR per issue by default; never squash; no "while I was here" edits.
- **HR7** Never claim tests pass without executing them in this run.

The owner is the oracle: a green suite is a signal, never the reason to merge.

## What it is
The data behind the "where is this book?" shelf map in Primo NDE (TAU Sourasky Central Library):
`data/mapping.csv` (call-number range → shelf `svgCode` + floor) and `maps/floor_{0,1,2}.svg`,
published on CloudFront and read anonymously by the Primo addon. Staff edit them in a bilingual
(Hebrew-first, RTL) admin SPA; writes go through 20 Lambdas behind API Gateway with Cognito
roles `admin`/`editor`. The live app: `https://d3h8i7y9p8lyw7.cloudfront.net/admin/`.
All of it runs in AWS and is production. No masedet, no `prod` branch, no CI.

## Layout
- `admin/`: the SPA (vanilla JS ES modules, no build); `components/`, `services/`, `i18n/`,
  `__tests__/` (Jest + jsdom). Endpoints are hardcoded consts (`auth-config.js` and module heads).
- `lambda/`: one `.mjs` per function, shared libs (`auth-middleware`, `role-auth`,
  `range-validation`, `shared/`), `__tests__/` (Jest + aws-sdk-client-mock, parity fixtures).
  `*.zip` files are build output and are not tracked (#209, they had gone stale): never
  upload a zip you did not just build from source. The broker packages from source.
- `e2e/`: Playwright (mocked auth, locale × role projects, screenshot baselines).
- `data/`, `maps/`: copies of the production files. `scripts/`: one-shot migrations.
- `deploy-staging-lambdas.sh`: creates the staging Lambdas and routes (infrastructure, owner only).

## Commands
- Unit tests: `cd admin && npm ci && npm test`; `cd lambda && npm ci && npm test`.
- E2E: `npm ci && npx playwright install chromium`; most specs open `/` and need
  `npx http-server admin -p 8080`, then `npx playwright test e2e/tests/<spec>`. 652 tests in
  4 projects: run the specs you touch, not the whole suite (it ran past 20 min on 2026-11-24).
- Run the app locally: `npx http-server . -p 8123`, open `/admin/`. It talks to the PRODUCTION
  API and Cognito: a real login edits real data.
- Deploy (broker; no AWS keys in the sandbox): `tau-deploy admin`, `tau-deploy lambda <name>`
  (no `primo-maps-` prefix), `tau-deploy rollback <deploy-id>`; add `--dry-run` first. Only
  committed code on `origin/main` deploys, after that side's unit suite passes in the sandbox. Every
  deploy is production. Infrastructure, Lambda env vars and direct S3 writes are owner-only
  (raw `aws` commands: README "Deploying", `docs/AWS-INFRASTRUCTURE.md`).

## Rules
Enforced by code:
- Bundle invariant: a CSV save whose `svgCode` is not a shelf on its floor, or whose floor is not
  0/1/2, gets HTTP 422 (`lambda/shared/validateBundle.mjs`, `putCsv`; `BUNDLE_INVARIANT_ENABLED=true`
  live in production). The client copy (`admin/services/bundle-validator.js`) only warns early.
- Twin implementations stay in lockstep, guarded by parity tests on shared fixtures: bundle
  validator, SVG shelf parser (`svg-shelves`), CSV parser (`csv-editor.js` ↔ `range-validation.mjs`).
- `svg-parser.js` and `data-model.js` are never imported with `?v=` (`no-duplicate-module-imports.test.js`).
- The four floor-SVG / `mapping.csv` fetches use `cache: 'no-cache'` (cache regression tests).
- Roles are enforced in every Lambda (`role-auth.mjs`), editor scopes on CSV writes
  (`range-validation.mjs`); the UI only mirrors them.

Written only:
- Never re-add S3 bucket CORS: CloudFront serves `Access-Control-Allow-Origin: *` (2026-07-08 outage).
- Lambdas return CORS headers on errors too: use `createAuthResponse()` (`auth-middleware.mjs`).
- Call `applyRoleBasedUI()` after rendering dynamic content, or admin-only controls show to editors.
- Never re-add `width`/`height` to the floor SVG root; the loader derives a `viewBox` (#70).
- Changing an admin module means bumping its `?v=N` everywhere in its import chain.
- New UI text goes in both `admin/i18n/he.json` and `en.json`; check RTL as well as LTR.
- `compareCallNumbers` exists in three places; change all three together.

## Where to look
- Load the `primo-maps-dev` skill (`.claude/skills/primo-maps-dev/`) before touching caching,
  the floor SVGs, the bundle/parsers, CORS, roles or deploys: the reasons behind each rule.
- `README.md`: architecture, CSV/SVG contract, staging flow, roles, raw deploy commands.
- `docs/AWS-INFRASTRUCTURE.md`: AWS IDs, CORS and cache diagnosis, the bundle flag.
- `docs/INDEX.md`: every doc with its status; `docs/superpowers/specs/`: feature designs.
- `WORKFLOW.md` and `.github/pull_request_template.md`: the issue loop and the PR shape.
- `AGENTS.md`: the reviewer's brief (Codex reviews, Claude builds).
