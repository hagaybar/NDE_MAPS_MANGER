# Resend password-reset email (per-user, persistent in the row)

**Date:** 2026-06-02
**Issue:** follow-up to #7 (admin password-reset email flood)
**Status:** approved by owner; deploy-from-branch for live review

## Problem

After #7 fixed the email flood (one click = one email), an admin still needs a
clear way to **deliberately re-send** a reset email when the first didn't
arrive. Today they can click "Reset password" again, but there's no signal that
a reset was already sent or that re-clicking resends.

## Behavior

- Each user row keeps its single reset action. Default label: **"Reset password"**.
- Click it → sends one email (existing flow, single-fire after #7). On success:
  - toast: *"Reset email sent to {email}."*
  - that row's reset control flips to a **"✓ Sent · Resend"** state and stays there.
- Click **Resend** → sends another email → same toast; row stays in the sent state.
- The sent state **persists across in-place re-renders** and **clears when the
  list reloads fresh data** (search, pagination, or the post-edit/delete refresh)
  — i.e. in `updateUsers()`.
- While a row's request is in flight, its control shows **"Sending…"** and is
  **disabled** (stops an accidental rapid double-click from sending two; stays
  true to #7). Re-enables on completion. On **failure**: error toast, and the row
  stays **"Reset password"** (not marked sent) so it's clearly retryable.

## Design (all client-side; no Lambda change — the backend already sends one email per call)

`admin/components/user-list.js`
- Constructor: add `this.resetSentUsernames = new Set()` and `this.resetInFlight = new Set()`.
- `updateUsers(users)`: clear both sets (fresh data ⇒ fresh state).
- `renderActionButtons(user)`: derive the reset control from the two sets and emit
  a **stable `data-reset-state` attribute** (`idle` | `sent` | `sending`) plus the
  `disabled` attribute when sending. Keep the **same `data-testid="reset-password-button"`
  and `data-username`** so the delegated click handler (#7) and the
  `user-reset-password` dispatch are unchanged — only the label/marker/state differ.
- Add `setResetInFlight(username, bool)` and `markResetSent(username)` — each
  mutates the sets then `render()` + `setupEventListeners()` (safe post-#7: the
  delegated listener is guarded to bind once).

`admin/components/user-management.js`
- `handleResetPassword(user)`: `setResetInFlight(username, true)` → `resetPassword`
  → on success `markResetSent(username)` + success toast (email interpolated
  caller-side); on error clear in-flight + error toast.

i18n (`en.json` + `he.json`)
- `users.resetResend` ("Resend"), `users.resetSentMarker` ("Sent"),
  `users.resetSending` ("Sending…"), and `users.resetSuccess` reworded to carry
  `{email}` (interpolated via `.replace('{email}', …)` in the caller).

## Testing (TDD, red→green) — at the UserList component boundary

Assertions key off the language-independent `data-reset-state` + `disabled`, not
translated text:
1. `markResetSent(username)` ⇒ that row's reset button has `data-reset-state="sent"`.
2. Clicking the sent-state button still dispatches `user-reset-password` (resend works).
3. `setResetInFlight(username, true)` ⇒ button `data-reset-state="sending"` and disabled.
4. `updateUsers(fresh)` ⇒ the sent marker clears (back to `data-reset-state="idle"`).
5. (regression) the #7 "exactly one dispatch per click" guard stays green.

## Out of scope (YAGNI)

No confirm dialog (owner chose immediate send), no cooldown/throttle, no backend
change, no toast-based resend (row affordance only).
