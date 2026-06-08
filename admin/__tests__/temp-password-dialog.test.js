/**
 * @jest-environment jsdom
 *
 * Tests for the temporary-password dialog (#152 redesign: admin SETS a temp
 * password, no email is sent). On a successful "Reset password" the admin must
 * see the server-returned temporary password in a copyable, readonly field with
 * clear instructions naming the user, and a Copy button.
 *
 * SECURITY: this dialog is the ONLY place the temp password is shown. It must
 * never be logged.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

describe('showTempPasswordDialog', () => {
  let showTempPasswordDialog, hideTempPasswordDialog;

  beforeEach(async () => {
    document.body.innerHTML = '';
    jest.resetModules();

    // moduleNameMapper maps '../i18n.js?v=N' to the shared test mock; extend it
    // with the strings this dialog needs (the real i18n has them in en.json/he.json).
    const i18n = (await import('../i18n.js?v=5')).default;
    Object.assign(i18n.translations.en || (i18n.translations.en = {}), {
      'users.tempPasswordTitle': 'Temporary password set',
      'users.tempPasswordInstructions':
        "Give this temporary password to {username}. They'll be asked to choose their own password the next time they sign in.",
      'users.tempPasswordCopy': 'Copy',
      'users.tempPasswordCopied': 'Copied',
      'dialog.close': 'Close'
    });
    // The shared mock's t() reads a flat map; patch t to serve these keys.
    const flat = {
      'users.tempPasswordTitle': 'Temporary password set',
      'users.tempPasswordInstructions':
        "Give this temporary password to {username}. They'll be asked to choose their own password the next time they sign in.",
      'users.tempPasswordCopy': 'Copy',
      'users.tempPasswordCopied': 'Copied',
      'dialog.close': 'Close'
    };
    i18n.t = (key) => flat[key] || key;

    const mod = await import('../components/temp-password-dialog.js');
    showTempPasswordDialog = mod.showTempPasswordDialog;
    hideTempPasswordDialog = mod.hideTempPasswordDialog;
  });

  afterEach(() => {
    if (hideTempPasswordDialog) hideTempPasswordDialog();
    jest.clearAllMocks();
  });

  test('renders a readonly field containing the temporary password', () => {
    showTempPasswordDialog({ username: 'editor1@example.com', temporaryPassword: 'TMPabc123!' });

    const field = document.querySelector('[data-testid="temp-password-value"]');
    expect(field).not.toBeNull();
    expect(field.value).toBe('TMPabc123!');
    expect(field.readOnly).toBe(true);
  });

  test('shows instructions naming the user', () => {
    showTempPasswordDialog({ username: 'editor1@example.com', temporaryPassword: 'TMPabc123!' });

    const instructions = document.querySelector('[data-testid="temp-password-instructions"]');
    expect(instructions).not.toBeNull();
    expect(instructions.textContent).toContain('editor1@example.com');
    // The {username} placeholder must be interpolated, not shown literally.
    expect(instructions.textContent).not.toContain('{username}');
  });

  test('renders a Copy button', () => {
    showTempPasswordDialog({ username: 'editor1@example.com', temporaryPassword: 'TMPabc123!' });

    const copyBtn = document.querySelector('[data-testid="temp-password-copy"]');
    expect(copyBtn).not.toBeNull();
  });

  test('Copy button writes the password to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });

    showTempPasswordDialog({ username: 'editor1@example.com', temporaryPassword: 'TMPabc123!' });

    document.querySelector('[data-testid="temp-password-copy"]').click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('TMPabc123!');
  });

  test('Close button dismisses the dialog', () => {
    showTempPasswordDialog({ username: 'editor1@example.com', temporaryPassword: 'TMPabc123!' });
    expect(document.querySelector('[data-testid="temp-password-dialog"]')).not.toBeNull();

    document.querySelector('[data-testid="temp-password-close"]').click();

    expect(document.querySelector('[data-testid="temp-password-dialog"]')).toBeNull();
  });

  test('escapes the password value (no HTML injection)', () => {
    showTempPasswordDialog({ username: 'u@example.com', temporaryPassword: '<img src=x>' });

    const field = document.querySelector('[data-testid="temp-password-value"]');
    // value attribute is set safely; the raw markup is not injected as an element.
    expect(field.value).toBe('<img src=x>');
    expect(document.querySelector('[data-testid="temp-password-dialog"] img')).toBeNull();
  });
});
