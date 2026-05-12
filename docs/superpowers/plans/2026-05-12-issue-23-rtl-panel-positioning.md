# Issue #23 — RTL panel positioning fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the orphan panel slide fully off-screen when closed, in both English (LTR) and Hebrew (RTL) — currently in RTL it sits as a visible strip in the middle of the canvas.

**Architecture:** CSS-only fix in `admin/styles/app.css`. Replace logical-property positioning (`inset-inline-end`) — which inherits the canvas's forced `direction: ltr` regardless of `<html dir>` — with physical properties (`right` / `left`) gated explicitly on `[dir="rtl"]` (an attribute selector that correctly matches the root `<html dir="rtl">` regardless of any direction overrides further down the cascade). Add a Playwright spec that asserts the off-screen invariant in both `en-admin` and `he-admin` projects.

**Tech Stack:** Vanilla CSS, Playwright tests.

**Spec sources:**
- `docs/audits/2026-05-12-orphan-panel-audit.md` (bug 1 section — root cause + proposed fix)
- GitHub issue #23 (proposed fix repeated)

---

## File map

**Modified:**
- `admin/styles/app.css` — replace the `.map-orphan-panel` rules and the `[dir="rtl"] .map-orphan-panel` rule.

**New:**
- `e2e/tests/map-editor-orphan-panel-positioning.spec.ts` — closed-state off-screen assertion in both LTR and RTL.

No JS source changes. No fixture changes. No i18n changes.

---

## Task 0: Setup branch and rollback tag

**Files:** none yet.

- [ ] **Step 0.1: Verify clean working tree on `main`**

Run: `git status --short && git rev-parse --abbrev-ref HEAD`
Expected: untracked-only entries (none staged or modified) and `main`.

- [ ] **Step 0.2: Create feature branch and pre-feature tag**

Run:
```bash
git checkout -b fix/issue-23-rtl-panel-positioning main
git tag pre/issue-23 main
```
Expected: switched to the new branch. Tag is local-only (rollback safety net).

---

## Task 1: Write the failing Playwright spec

**Files:**
- Create: `e2e/tests/map-editor-orphan-panel-positioning.spec.ts`

Asserts the closed-state invariant: when the panel does NOT have the `--open` class, its bounding box should be fully off-canvas (right edge ≤ canvas left edge in RTL, or left edge ≥ canvas right edge in LTR).

- [ ] **Step 1.1: Create the spec file**

Create `e2e/tests/map-editor-orphan-panel-positioning.spec.ts`:

```ts
/**
 * Closed-state positioning invariant for the orphan panel.
 *
 * Issue #23: in Hebrew mode, the panel inherits `direction: ltr` from the
 * canvas's forced-LTR override (kept for SVG coordinate stability — closes
 * issue #2). `inset-inline-end: 0` then anchors the panel to the physical
 * right, while `[dir="rtl"] .map-orphan-panel { transform: translateX(-100%) }`
 * pulls it left — landing it visible inside the canvas instead of off-screen.
 *
 * This test asserts that the panel, when closed, sits fully outside the
 * canvas's visible area, in both en-admin and he-admin projects.
 */

import { test, expect, Page } from '@playwright/test';
import { mockUsers } from '../fixtures/auth.fixture';
import { mockFixtures } from '../fixtures/map-editor-fixtures';

function createMockJwt(user: any): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    sub: `test-sub-${user.username}`,
    email: user.email,
    email_verified: true,
    'custom:role': user.role,
    'cognito:username': user.username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
  };
  const base64url = (obj: object) => {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };
  return `${base64url(header)}.${base64url(payload)}.fake-signature-for-testing`;
}

async function injectAuth(page: Page, user: any, locale: 'en' | 'he'): Promise<void> {
  const idToken = createMockJwt(user);
  await page.addInitScript((data) => {
    Object.entries(data.storage).forEach(([k, v]) => window.sessionStorage.setItem(k, v as string));
    window.localStorage.setItem('locale', data.locale);
    (window as any).__E2E_TEST_MODE__ = true;
  }, {
    storage: {
      primo_maps_access_token: idToken,
      primo_maps_id_token: idToken,
      primo_maps_refresh_token: 'mock',
      primo_maps_token_expiry: String(Date.now() + 3600000),
      primo_maps_user: JSON.stringify({ username: user.username, email: user.email, role: user.role }),
    },
    locale,
  });
}

async function openMapEditor(page: Page, locale: 'en' | 'he') {
  await injectAuth(page, mockUsers.admin, locale);
  await mockFixtures(page);
  await page.goto('/admin/');
  await page.waitForSelector('#nav-map-editor', { state: 'visible' });
  await page.click('#nav-map-editor');
  await page.waitForSelector('#map-canvas svg #A1', { state: 'visible', timeout: 10_000 });
}

test.describe('orphan panel — closed-state off-screen invariant', () => {
  test('en: closed panel is to the right of the canvas', async ({ page }) => {
    await openMapEditor(page, 'en');
    const panel = page.locator('.map-orphan-panel');
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveClass(/map-orphan-panel--open/);
    const panelBox = await panel.boundingBox();
    const canvasBox = await page.locator('#map-canvas').boundingBox();
    if (!panelBox || !canvasBox) throw new Error('bounding boxes not measurable');
    // In LTR, closed panel should be entirely to the RIGHT of canvas (or just touching).
    expect(panelBox.x).toBeGreaterThanOrEqual(canvasBox.x + canvasBox.width - 1);
  });

  test('he: closed panel is to the left of the canvas', async ({ page }) => {
    await openMapEditor(page, 'he');
    const panel = page.locator('.map-orphan-panel');
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveClass(/map-orphan-panel--open/);
    const panelBox = await panel.boundingBox();
    const canvasBox = await page.locator('#map-canvas').boundingBox();
    if (!panelBox || !canvasBox) throw new Error('bounding boxes not measurable');
    // In RTL, closed panel should be entirely to the LEFT of canvas (or just touching).
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(canvasBox.x + 1);
  });
});
```

- [ ] **Step 1.2: Start a local server (needed for e2e) and run the new spec — confirm it fails**

In one terminal (background OK):
```bash
cd /home/hagaybar/projects/primo_maps && python3 -m http.server 8080 > /tmp/admin-server.log 2>&1 &
```

Then:
```bash
cd /home/hagaybar/projects/primo_maps && timeout 60 npx playwright test e2e/tests/map-editor-orphan-panel-positioning.spec.ts 2>&1 | tail -25
```

Expected: BOTH tests fail (LTR maybe passes, but the Hebrew test definitely fails — the panel is inside the canvas, so `panelBox.x + panelBox.width` is NOT ≤ `canvasBox.x`). If the LTR test also fails, document the actual numbers and adjust expectations — but it should pass given today's behaviour matches LTR design intent.

If both pass already, STOP: that means the bug is not reproducible in this environment and the fix is misdirected. Surface the discrepancy.

- [ ] **Step 1.3: Commit the failing spec**

Run:
```bash
git add e2e/tests/map-editor-orphan-panel-positioning.spec.ts
git commit -m "test(e2e): add failing positioning test for orphan panel closed state"
```

---

## Task 2: Apply the CSS fix

**Files:**
- Modify: `admin/styles/app.css`

Replace the logical-property positioning with physical-property positioning, gated on `[dir="rtl"]`. The existing CSS includes the offending logical properties + a `translateX(-100%)` override for RTL that doesn't compose correctly with the canvas's forced LTR direction.

- [ ] **Step 2.1: Locate the current `.map-orphan-panel` block**

Run: `grep -n "map-orphan-panel" admin/styles/app.css | head -15`
Expected: lines listing the existing `.map-orphan-panel` rules. The base block is around line 2891 (may differ slightly); the `[dir="rtl"]` override is a few lines below.

Read the surrounding ~30 lines to see the exact current state before editing.

- [ ] **Step 2.2: Replace the positioning rules**

Find this block (the leading lines may differ in whitespace):

```css
.map-orphan-panel {
  position: absolute;
  inset-block-start: 0;
  inset-block-end: 0;
  inset-inline-end: 0;
  width: 340px;
  background: #fff;
  border-inline-start: 1px solid #e2e8f0;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 200ms ease;
  z-index: 20;
  overflow-y: auto;
}

.map-orphan-panel--open {
  transform: translateX(0);
}

[dir="rtl"] .map-orphan-panel {
  transform: translateX(-100%);
}

[dir="rtl"] .map-orphan-panel--open {
  transform: translateX(0);
}
```

Replace with this:

```css
.map-orphan-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 340px;
  background: #fff;
  border-left: 1px solid #e2e8f0;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 200ms ease;
  z-index: 20;
  overflow-y: auto;
}

[dir="rtl"] .map-orphan-panel {
  right: auto;
  left: 0;
  border-left: 0;
  border-right: 1px solid #e2e8f0;
  box-shadow: 4px 0 12px rgba(0, 0, 0, 0.05);
  transform: translateX(-100%);
}

.map-orphan-panel--open,
[dir="rtl"] .map-orphan-panel--open {
  transform: translateX(0);
}
```

Key changes:
- `inset-block-start: 0` → `top: 0`, `inset-block-end: 0` → `bottom: 0`, `inset-inline-end: 0` → `right: 0` (physical properties — unaffected by the canvas's forced LTR direction).
- `border-inline-start` split into LTR (`border-left`) and RTL (`border-right`) versions so the visible border is on the canvas-facing side regardless of which edge the panel anchors to.
- `box-shadow` direction flips for RTL so the shadow points into the canvas, not away from it.
- The `[dir="rtl"]` override now does the full physical-side flip: `right: auto; left: 0;` plus its own border/shadow + `translateX(-100%)` for off-screen.
- Both `.map-orphan-panel--open` rules collapsed into one combined selector since the open-state transform is identical for LTR and RTL.

- [ ] **Step 2.3: Validate CSS brace balance**

Run:
```bash
node -e "const fs=require('fs'); const css=fs.readFileSync('admin/styles/app.css','utf8'); const open=(css.match(/{/g)||[]).length; const close=(css.match(/}/g)||[]).length; if (open !== close) { console.error('Brace mismatch:', open, '!=', close); process.exit(1); } else { console.log('OK', open, 'rules'); }"
```
Expected: `OK <count> rules` — paired braces.

- [ ] **Step 2.4: Re-run the positioning spec — expect BOTH tests PASS**

Make sure the local server from Task 1 is still running. Then:
```bash
cd /home/hagaybar/projects/primo_maps && timeout 60 npx playwright test e2e/tests/map-editor-orphan-panel-positioning.spec.ts 2>&1 | tail -25
```
Expected: 2 tests pass (one en, one he). If any test still fails, STOP and surface the discrepancy with the actual numbers from the test output.

- [ ] **Step 2.5: Run the orphan-panel happy-path e2e — confirm no regression**

```bash
cd /home/hagaybar/projects/primo_maps && timeout 60 npx playwright test e2e/tests/map-editor-orphan-panel.spec.ts --project=en-admin 2>&1 | tail -10
```
Expected: 1 test passes (the existing happy-path).

- [ ] **Step 2.6: Run the map-editor en-admin suite — confirm no other regression**

```bash
cd /home/hagaybar/projects/primo_maps && timeout 240 npx playwright test e2e/tests/map-editor --project=en-admin 2>&1 | tail -10
```
Expected: same pass/fail signature as `main` (~16 pass + 1 skip).

- [ ] **Step 2.7: Commit the CSS fix**

```bash
git add admin/styles/app.css
git commit -m "fix(map-editor): use physical positioning for orphan panel (closes #23)

The panel inherited \`direction: ltr\` from the canvas's forced-LTR
override (kept for SVG coordinate stability — closes #2), so its
logical \`inset-inline-end: 0\` anchored it to the physical right
edge in both LTR and RTL.  Combined with the
\`[dir=\"rtl\"] .map-orphan-panel { transform: translateX(-100%); }\`
override (which still fired via the html-attribute selector), the
panel ended up anchored-right and translated-left — visible inside
the canvas instead of off-screen.

Switch to physical properties (\`right\` / \`left\`) gated explicitly
on \`[dir=\"rtl\"]\`.  Border and box-shadow also flip so the visible
edge faces into the canvas in both directions."
```

---

## Task 3: Push branch and open PR

**Files:** none modified.

- [ ] **Step 3.1: Verify commit history**

Run: `git log --oneline main..HEAD`
Expected: exactly 2 commits — failing test, then CSS fix.

- [ ] **Step 3.2: Push the branch**

```bash
git push -u origin fix/issue-23-rtl-panel-positioning
```

- [ ] **Step 3.3: Stop the local server**

```bash
pkill -f "python3 -m http.server 8080" || true
```

- [ ] **Step 3.4: Open the PR**

```bash
gh pr create --title "fix(map-editor): use physical positioning for orphan panel (closes #23)" --body "$(cat <<'EOF'
## Summary

Closes #23. The orphan panel now sits fully off-screen in both LTR and RTL when closed; previously in RTL it appeared as a vertical white strip inside the canvas.

## Root cause

`#map-canvas` forces `direction: ltr` (intentional, for SVG coordinate stability — closes #2). The orphan panel inherited that LTR direction, so its logical-property `inset-inline-end: 0` resolved to the *physical right edge* even when `<html dir="rtl">`. The `[dir="rtl"] .map-orphan-panel { transform: translateX(-100%); }` rule still fired (the attribute selector matches against the root `<html dir>` regardless of further-down direction overrides), so the panel ended up anchored-right and pulled-left — landing visible inside the canvas.

## Fix

CSS-only. Switch from logical properties (`inset-inline-end`) to physical properties (`right` / `left`) gated explicitly on `[dir="rtl"]`. Also flip the border and box-shadow so the visible edge faces into the canvas in both directions.

## Test plan

- [x] New `map-editor-orphan-panel-positioning.spec.ts` asserts the closed-state off-screen invariant in both `en-admin` and `he-admin` projects.
- [x] Existing orphan-panel happy-path spec still passes.
- [x] Full map-editor en-admin suite shows the same pass/fail signature as `main`.
- [ ] After merge + deploy, hard-refresh the admin in Hebrew → Map Editor → confirm no panel slice visible in the canvas. English unchanged.

## Files touched

- `admin/styles/app.css` — replace the panel positioning block.
- `e2e/tests/map-editor-orphan-panel-positioning.spec.ts` — new regression guard.

## Rollback

Tag `pre/issue-23` (local) marks pre-PR `main`. Revert the merge commit if anything regresses.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 3.5: Stop here — do NOT merge**

User will review, merge, and deploy manually.
