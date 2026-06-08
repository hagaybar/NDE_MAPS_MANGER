/**
 * Honest reset-password messaging (Option A, #7 follow-up).
 *
 * AdminResetUserPasswordCommand emails the user a bare verification CODE and
 * sets RESET_REQUIRED — it does NOT send a temporary password and does NOT set
 * FORCE_CHANGE_PASSWORD. The admin-facing toast MUST say so honestly: a reset
 * CODE was emailed, and the user finishes on the login page via "Forgot your
 * password?". These tests pin both locales so the toast never lies again.
 */

import { readFileSync } from 'fs';

const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8'));
const he = JSON.parse(readFileSync(new URL('../i18n/he.json', import.meta.url), 'utf8'));

describe('users.resetSuccess honest messaging (Option A)', () => {
  test('EN resetSuccess is a non-empty string', () => {
    expect(typeof en.users.resetSuccess).toBe('string');
    expect(en.users.resetSuccess.length).toBeGreaterThan(0);
  });

  test('HE resetSuccess is a non-empty string', () => {
    expect(typeof he.users.resetSuccess).toBe('string');
    expect(he.users.resetSuccess.length).toBeGreaterThan(0);
  });

  test('EN resetSuccess does NOT claim a temporary password was sent', () => {
    expect(en.users.resetSuccess.toLowerCase()).not.toContain('temporary password');
  });

  test('EN resetSuccess mentions the emailed code and "Forgot your password?"', () => {
    const msg = en.users.resetSuccess.toLowerCase();
    expect(msg).toContain('code');
    expect(msg).toContain('email');
    expect(msg).toContain('forgot your password');
  });

  test('HE resetSuccess does NOT claim a temporary password (סיסמה זמנית) was sent', () => {
    // The old (false) Hebrew string said "סיסמה זמנית נשלחה" (temporary password sent).
    expect(he.users.resetSuccess).not.toContain('סיסמה זמנית');
  });

  test('HE resetSuccess mentions a code (קוד) and the "Forgot your password?" flow (שכחתי)', () => {
    expect(he.users.resetSuccess).toContain('קוד');
    expect(he.users.resetSuccess).toContain('שכחתי');
  });
});
