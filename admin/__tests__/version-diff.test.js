/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Test suite for version-diff component
// Following TDD methodology - RED phase

// Mock i18n module
const mockI18n = {
  locale: 'en',
  t: jest.fn((key) => {
    const translations = {
      'diff.title': 'Compare Versions',
      'diff.current': 'Current Data',
      'diff.version': 'Selected Version',
      'diff.added': 'Added',
      'diff.removed': 'Removed',
      'diff.changed': 'Changed',
      'diff.close': 'Close',
      'diff.noChanges': 'No changes detected',
      'versions.timestamp': 'Date',
      'versions.user': 'User'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => false),
  getLocale: jest.fn(() => 'en')
};

// Mock Hebrew translations
const mockI18nHebrew = {
  locale: 'he',
  t: jest.fn((key) => {
    const translations = {
      'diff.title': 'השוואת גרסאות',
      'diff.current': 'נתונים נוכחיים',
      'diff.version': 'גרסה נבחרת',
      'diff.added': 'נוספו',
      'diff.removed': 'הוסרו',
      'diff.changed': 'שונו',
      'diff.close': 'סגור',
      'diff.noChanges': 'לא נמצאו שינויים',
      'versions.timestamp': 'תאריך',
      'versions.user': 'משתמש'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => true),
  getLocale: jest.fn(() => 'he')
};

// Sample CSV content for current data
const mockCurrentCSV = `call_number,location,floor,x,y
QA76.73,Science Library,1,120,340
BF121,Psychology Section,2,80,200
HD58.7,Business Wing,0,200,150
QA76.75,Tech Corner,1,150,400`;

// Sample CSV content for selected version (with differences)
const mockVersionCSV = `call_number,location,floor,x,y
QA76.73,Science Library,1,120,340
BF121,Psychology Wing,2,80,250
HD58.7,Business Wing,0,200,150
PS3557,Literature Section,3,100,300`;

// Same data for no changes test
const mockIdenticalCSV = `call_number,location,floor,x,y
QA76.73,Science Library,1,120,340
BF121,Psychology Section,2,80,200`;

// Sample version metadata
const mockVersionMetadata = {
  versionId: 'v123',
  timestamp: '2024-02-15T14:30:00Z',
  username: 'admin'
};

describe('VersionDiff Component', () => {
  let showVersionDiff, hideVersionDiff;

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset modules to clear cached imports
    jest.resetModules();

    // Mock the i18n module before importing version-diff
    jest.unstable_mockModule('../i18n.js', () => ({
      default: mockI18n
    }));

    const module = await import('../components/version-diff.js');
    showVersionDiff = module.showVersionDiff;
    hideVersionDiff = module.hideVersionDiff;
  });

  afterEach(() => {
    // Clean up any leftover modals
    const modal = document.querySelector('[data-testid="version-diff-modal"]');
    if (modal) {
      modal.remove();
    }
  });

  describe('Side-by-Side Rendering', () => {
    test('should render the diff modal with title', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      expect(modal).not.toBeNull();
      expect(modal.textContent).toContain('Compare Versions');
    });

    test('should render two side-by-side panels', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const currentPanel = document.querySelector('[data-testid="diff-current-panel"]');
      const versionPanel = document.querySelector('[data-testid="diff-version-panel"]');

      expect(currentPanel).not.toBeNull();
      expect(versionPanel).not.toBeNull();
    });

    test('should display "Current Data" label on left panel', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const currentPanel = document.querySelector('[data-testid="diff-current-panel"]');
      expect(currentPanel.textContent).toContain('Current Data');
    });

    test('should display "Selected Version" label on right panel', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const versionPanel = document.querySelector('[data-testid="diff-version-panel"]');
      expect(versionPanel.textContent).toContain('Selected Version');
    });

    test('should render tables in both panels', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const currentTable = document.querySelector('[data-testid="diff-current-table"]');
      const versionTable = document.querySelector('[data-testid="diff-version-table"]');

      expect(currentTable).not.toBeNull();
      expect(versionTable).not.toBeNull();
    });

    test('should render correct number of rows in each panel', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const currentRows = document.querySelectorAll('[data-testid="diff-current-table"] tbody tr');
      const versionRows = document.querySelectorAll('[data-testid="diff-version-table"] tbody tr');

      expect(currentRows.length).toBe(4); // 4 data rows
      expect(versionRows.length).toBe(4); // 4 data rows
    });
  });

  describe('Diff Highlighting', () => {
    test('should highlight added rows in green', async () => {
      // PS3557 is in version but not in current - should be added (green)
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const addedRows = document.querySelectorAll('[data-testid="diff-version-table"] .diff-added');
      expect(addedRows.length).toBeGreaterThan(0);
    });

    test('should highlight removed rows in red', async () => {
      // QA76.75 is in current but not in version - should be removed (red)
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const removedRows = document.querySelectorAll('[data-testid="diff-current-table"] .diff-removed');
      expect(removedRows.length).toBeGreaterThan(0);
    });

    test('should highlight changed rows in yellow', async () => {
      // BF121 has different values - should be changed (yellow)
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const changedRows = document.querySelectorAll('.diff-changed');
      expect(changedRows.length).toBeGreaterThan(0);
    });

    test('should not highlight unchanged rows', async () => {
      // QA76.73 is identical in both - should not be highlighted
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      const tables = modal.querySelectorAll('table');

      // Check that there are rows without diff classes
      let hasUnchangedRow = false;
      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          if (!row.classList.contains('diff-added') &&
              !row.classList.contains('diff-removed') &&
              !row.classList.contains('diff-changed')) {
            hasUnchangedRow = true;
          }
        });
      });

      expect(hasUnchangedRow).toBe(true);
    });

    test('should use color-coded backgrounds for accessibility', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      // Check that CSS classes are applied for styling
      const addedRow = document.querySelector('.diff-added');
      const removedRow = document.querySelector('.diff-removed');
      const changedRow = document.querySelector('.diff-changed');

      // These rows should exist with their respective classes
      expect(addedRow || removedRow || changedRow).not.toBeNull();
    });
  });

  describe('Changes Summary Count', () => {
    test('should display summary section', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const summary = document.querySelector('[data-testid="diff-summary"]');
      expect(summary).not.toBeNull();
    });

    test('should show count of added rows', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const summary = document.querySelector('[data-testid="diff-summary"]');
      expect(summary.textContent).toContain('Added');
    });

    test('should show count of removed rows', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const summary = document.querySelector('[data-testid="diff-summary"]');
      expect(summary.textContent).toContain('Removed');
    });

    test('should show count of changed rows', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const summary = document.querySelector('[data-testid="diff-summary"]');
      expect(summary.textContent).toContain('Changed');
    });

    test('should show "No changes" message when data is identical', async () => {
      await showVersionDiff({
        currentData: mockIdenticalCSV,
        versionData: mockIdenticalCSV,
        versionMetadata: mockVersionMetadata
      });

      const summary = document.querySelector('[data-testid="diff-summary"]');
      expect(summary.textContent).toContain('No changes detected');
    });

    test('should display correct counts for each change type', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const addedCount = document.querySelector('[data-testid="diff-added-count"]');
      const removedCount = document.querySelector('[data-testid="diff-removed-count"]');
      const changedCount = document.querySelector('[data-testid="diff-changed-count"]');

      // Expected: 1 added (PS3557), 1 removed (QA76.75), 1 changed (BF121)
      expect(addedCount.textContent).toContain('1');
      expect(removedCount.textContent).toContain('1');
      expect(changedCount.textContent).toContain('1');
    });
  });

  describe('Synchronized Scrolling', () => {
    test('should have scrollable containers for both panels', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const currentScroll = document.querySelector('[data-testid="diff-current-scroll"]');
      const versionScroll = document.querySelector('[data-testid="diff-version-scroll"]');

      expect(currentScroll).not.toBeNull();
      expect(versionScroll).not.toBeNull();
    });

    test('should sync scroll from current panel to version panel', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const currentScroll = document.querySelector('[data-testid="diff-current-scroll"]');
      const versionScroll = document.querySelector('[data-testid="diff-version-scroll"]');

      // Simulate scroll on current panel
      currentScroll.scrollTop = 100;
      currentScroll.dispatchEvent(new Event('scroll'));

      // Version panel should sync
      expect(versionScroll.scrollTop).toBe(100);
    });

    test('should sync scroll from version panel to current panel', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const currentScroll = document.querySelector('[data-testid="diff-current-scroll"]');
      const versionScroll = document.querySelector('[data-testid="diff-version-scroll"]');

      // Simulate scroll on version panel
      versionScroll.scrollTop = 150;
      versionScroll.dispatchEvent(new Event('scroll'));

      // Current panel should sync
      expect(currentScroll.scrollTop).toBe(150);
    });
  });

  describe('BiDi Support', () => {
    test('should have dir="auto" on table cells for BiDi support', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const cells = document.querySelectorAll('[data-testid="version-diff-modal"] td');
      cells.forEach(cell => {
        expect(cell.getAttribute('dir')).toBe('auto');
      });
    });

    test('should handle Hebrew content correctly', async () => {
      const hebrewCurrentCSV = `call_number,location,floor
QA76,ספרייה מרכזית,1
BF121,אגף פסיכולוגיה,2`;

      const hebrewVersionCSV = `call_number,location,floor
QA76,ספרייה מרכזית,1
BF121,אגף הפסיכולוגיה,2`;

      await showVersionDiff({
        currentData: hebrewCurrentCSV,
        versionData: hebrewVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      const cells = modal.querySelectorAll('td');

      const cellTexts = Array.from(cells).map(c => c.textContent);
      expect(cellTexts.some(t => t.includes('ספרייה'))).toBe(true);
    });
  });

  describe('RTL Layout Support', () => {
    beforeEach(async () => {
      jest.resetModules();

      // Mock the i18n module with Hebrew settings
      jest.unstable_mockModule('../i18n.js', () => ({
        default: mockI18nHebrew
      }));

      const module = await import('../components/version-diff.js');
      showVersionDiff = module.showVersionDiff;
      hideVersionDiff = module.hideVersionDiff;

      // Set RTL direction on document
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    });

    test('should display Hebrew translations', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      expect(modal.textContent).toContain('השוואת גרסאות');
    });

    test('should use RTL-aware layout classes', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      // Check that flex-row-reverse is applied for RTL or panels adapt
      const container = document.querySelector('[data-testid="diff-panels-container"]');
      expect(container).not.toBeNull();
    });
  });

  describe('Responsive Layout', () => {
    test('should have responsive container classes', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const panelsContainer = document.querySelector('[data-testid="diff-panels-container"]');

      // Should have classes that allow stacking on small screens
      const hasResponsiveClass =
        panelsContainer.classList.contains('flex-col') ||
        panelsContainer.classList.contains('md:flex-row') ||
        panelsContainer.classList.contains('lg:flex-row');

      expect(hasResponsiveClass).toBe(true);
    });

    test('should stack panels vertically on small screens via CSS classes', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const panelsContainer = document.querySelector('[data-testid="diff-panels-container"]');

      // Check for responsive flex classes
      expect(
        panelsContainer.classList.contains('flex-col') ||
        panelsContainer.className.includes('flex-col')
      ).toBe(true);
    });
  });

  describe('Close Button', () => {
    test('should have a close button', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const closeButton = document.querySelector('[data-testid="diff-close-button"]');
      expect(closeButton).not.toBeNull();
    });

    test('should close modal when close button is clicked', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const closeButton = document.querySelector('[data-testid="diff-close-button"]');
      closeButton.click();

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      expect(modal).toBeNull();
    });

    test('should call onClose callback when closed', async () => {
      const onCloseMock = jest.fn();

      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata,
        onClose: onCloseMock
      });

      const closeButton = document.querySelector('[data-testid="diff-close-button"]');
      closeButton.click();

      expect(onCloseMock).toHaveBeenCalled();
    });

    test('should have aria-label for accessibility', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const closeButton = document.querySelector('[data-testid="diff-close-button"]');
      expect(closeButton.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    test('should have appropriate ARIA attributes on modal', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
      expect(modal.getAttribute('aria-labelledby')).toBeTruthy();
    });

    test('should close modal on Escape key press', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(escapeEvent);

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      expect(modal).toBeNull();
    });

    test('should close modal when clicking backdrop', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const backdrop = document.querySelector('[data-testid="diff-backdrop"]');
      backdrop.click();

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      expect(modal).toBeNull();
    });

    test('should have labeled regions for screen readers', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const currentPanel = document.querySelector('[data-testid="diff-current-panel"]');
      const versionPanel = document.querySelector('[data-testid="diff-version-panel"]');

      // Panels should have accessible labels
      expect(
        currentPanel.getAttribute('aria-label') ||
        currentPanel.querySelector('h3')
      ).toBeTruthy();

      expect(
        versionPanel.getAttribute('aria-label') ||
        versionPanel.querySelector('h3')
      ).toBeTruthy();
    });
  });

  describe('Version Metadata Display', () => {
    test('should display version timestamp', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const versionPanel = document.querySelector('[data-testid="diff-version-panel"]');
      // Should contain some date representation
      expect(versionPanel.textContent).toMatch(/Feb|2024|15/);
    });

    test('should display version username', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const versionPanel = document.querySelector('[data-testid="diff-version-panel"]');
      expect(versionPanel.textContent).toContain('admin');
    });
  });

  describe('hideVersionDiff function', () => {
    test('should export hideVersionDiff function', async () => {
      expect(typeof hideVersionDiff).toBe('function');
    });

    test('should close modal when hideVersionDiff is called', async () => {
      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      // Modal should be visible
      expect(document.querySelector('[data-testid="version-diff-modal"]')).not.toBeNull();

      hideVersionDiff();

      // Modal should be removed
      expect(document.querySelector('[data-testid="version-diff-modal"]')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty current data', async () => {
      const emptyCSV = 'call_number,location,floor,x,y';

      await showVersionDiff({
        currentData: emptyCSV,
        versionData: mockVersionCSV,
        versionMetadata: mockVersionMetadata
      });

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      expect(modal).not.toBeNull();

      // All version rows should be marked as added
      const addedRows = document.querySelectorAll('[data-testid="diff-version-table"] .diff-added');
      expect(addedRows.length).toBe(4);
    });

    test('should handle empty version data', async () => {
      const emptyCSV = 'call_number,location,floor,x,y';

      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: emptyCSV,
        versionMetadata: mockVersionMetadata
      });

      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      expect(modal).not.toBeNull();

      // All current rows should be marked as removed
      const removedRows = document.querySelectorAll('[data-testid="diff-current-table"] .diff-removed');
      expect(removedRows.length).toBe(4);
    });

    test('should handle different column orders gracefully', async () => {
      const reorderedCSV = `location,call_number,floor,x,y
Science Library,QA76.73,1,120,340`;

      await showVersionDiff({
        currentData: mockCurrentCSV,
        versionData: reorderedCSV,
        versionMetadata: mockVersionMetadata
      });

      // Should still render without errors
      const modal = document.querySelector('[data-testid="version-diff-modal"]');
      expect(modal).not.toBeNull();
    });
  });
});
