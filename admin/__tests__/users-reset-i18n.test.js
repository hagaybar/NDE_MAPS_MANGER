/**
 * Honest reset-password messaging (#152 redesign: admin SETS a temp password).
 *
 * resetUserPassword.mjs now calls AdminSetUserPasswordCommand(Permanent:false):
 * it sets a temporary password + FORCE_CHANGE_PASSWORD and sends NO email. The
 * admin receives the temporary password in the response and relays it to the
 * user out-of-band. The user-facing strings MUST reflect this: the new strings
 * live under users.tempPassword* and must NOT claim an email / reset code was
 * sent. These tests pin both locales so the copy never regresses to the old
 * (now-false) "a code was emailed" / "temporary password emailed" wording.
 */

import { readFileSync } from 'fs';

const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8'));
const he = JSON.parse(readFileSync(new URL('../i18n/he.json', import.meta.url), 'utf8'));

describe('temp-password dialog strings exist (Option B, no email)', () => {
  const requiredKeys = [
    'tempPasswordTitle',
    'tempPasswordInstructions',
    'tempPasswordCopy',
    'tempPasswordCopied'
  ];

  test.each(requiredKeys)('EN users.%s is a non-empty string', (key) => {
    expect(typeof en.users[key]).toBe('string');
    expect(en.users[key].length).toBeGreaterThan(0);
  });

  test.each(requiredKeys)('HE users.%s is a non-empty string', (key) => {
    expect(typeof he.users[key]).toBe('string');
    expect(he.users[key].length).toBeGreaterThan(0);
  });

  test('EN instructions interpolate {username}', () => {
    expect(en.users.tempPasswordInstructions).toContain('{username}');
  });

  test('HE instructions interpolate {username}', () => {
    expect(he.users.tempPasswordInstructions).toContain('{username}');
  });

  test('EN instructions do NOT claim an email / reset code was sent', () => {
    const msg = en.users.tempPasswordInstructions.toLowerCase();
    expect(msg).not.toContain('email');
    expect(msg).not.toContain('reset code');
    expect(msg).not.toContain('forgot your password');
  });

  test('HE instructions do NOT claim a code (קוד) was emailed or use the forgot-password (שכחתי) flow', () => {
    expect(he.users.tempPasswordInstructions).not.toContain('שכחתי');
    expect(he.users.tempPasswordInstructions).not.toContain('דוא');
  });
});

describe('obsolete #152 email-resend strings are retired', () => {
  test('EN no longer carries resetResend / resetSentMarker email-resend strings', () => {
    expect(en.users.resetResend).toBeUndefined();
    expect(en.users.resetSentMarker).toBeUndefined();
  });

  test('HE no longer carries resetResend / resetSentMarker email-resend strings', () => {
    expect(he.users.resetResend).toBeUndefined();
    expect(he.users.resetSentMarker).toBeUndefined();
  });
});
