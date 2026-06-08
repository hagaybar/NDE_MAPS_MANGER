/**
 * @jest-environment jsdom
 *
 * #136: handleCancel computed hasChanges() but the guard branch was a comment,
 * so Cancel / X / backdrop / Escape silently discarded edits. Now it confirms
 * (dialog.discardChanges) before closing when there are unsaved changes.
 */

import { jest, describe, test, expect, afterEach } from '@jest/globals';
import { showEditLocationDialog, hideEditLocationDialog } from '../components/edit-location-dialog.js';

// Include the editable fields (rangeStart etc.) so updateCurrentRow — which only
// writes keys already present in currentRow — registers the change.
const ROW = { libraryName: 'A', collectionName: 'GEN', floor: '1', rangeStart: '100', rangeEnd: '200', svgCode: '', shelfLabel: '', shelfLabelHe: '' };

function dirtyAField() {
  const input = document.querySelector('[data-testid="edit-form"] input[name="rangeStart"]');
  input.value = '999';
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Edit Location dialog: unsaved-changes confirmation (#136)', () => {
  afterEach(() => {
    hideEditLocationDialog();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('cancel with unsaved changes prompts; declining keeps the dialog open', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    showEditLocationDialog({ row: { ...ROW }, allRows: [] });
    dirtyAField();

    document.querySelector('[data-testid="cancel-button"]').click();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="edit-location-dialog-overlay"]')).not.toBeNull();
  });

  test('confirming the discard closes the dialog and resolves cancelled', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const promise = showEditLocationDialog({ row: { ...ROW }, allRows: [] });
    dirtyAField();

    document.querySelector('[data-testid="cancel-button"]').click();

    const result = await promise;
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ cancelled: true });
    expect(document.querySelector('[data-testid="edit-location-dialog-overlay"]')).toBeNull();
  });

  test('cancel with NO changes closes without prompting', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    showEditLocationDialog({ row: { ...ROW }, allRows: [] });

    document.querySelector('[data-testid="cancel-button"]').click();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="edit-location-dialog-overlay"]')).toBeNull();
  });
});
