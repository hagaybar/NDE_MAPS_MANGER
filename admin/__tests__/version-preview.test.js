/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Test suite for version-preview component
// Following TDD methodology - RED phase

// Mock i18n module
const mockI18n = {
  locale: 'en',
  t: jest.fn((key) => {
    const translations = {
      'preview.title': 'Version Preview',
      'preview.close': 'Close',
      'preview.restoreThis': 'Restore this version',
      'preview.loading': 'Loading preview...',
      'preview.error': 'Failed to load version content',
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
      'preview.title': 'תצוגה מקדימה של גרסה',
      'preview.close': 'סגור',
      'preview.restoreThis': 'שחזר גרסה זו',
      'preview.loading': 'טוען תצוגה מקדימה...',
      'preview.error': 'שגיאה בטעינת תוכן הגרסה',
      'versions.timestamp': 'תאריך',
      'versions.user': 'משתמש'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => true),
  getLocale: jest.fn(() => 'he')
};

// Sample CSV content for tests
const mockCSVContent = `call_number,location,floor,x,y
QA76.73,Science Library,1,120,340
BF121,Psychology Section,2,80,200
HD58.7,Business Wing,0,200,150`;

// Sample version metadata
const mockVersionMetadata = {
  versionId: 'v123',
  timestamp: '2024-02-15T14:30:00Z',
  username: 'admin'
};

describe('VersionPreview Component', () => {
  let showVersionPreview, hideVersionPreview;

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset fetch mock
    global.fetch = jest.fn();

    // Reset modules to clear cached imports
    jest.resetModules();

    // Mock the i18n module before importing version-preview
    jest.unstable_mockModule('../i18n.js', () => ({
      default: mockI18n
    }));

    const module = await import('../components/version-preview.js');
    showVersionPreview = module.showVersionPreview;
    hideVersionPreview = module.hideVersionPreview;
  });

  afterEach(() => {
    // Clean up any leftover modals
    const modal = document.querySelector('[data-testid="version-preview-modal"]');
    if (modal) {
      modal.remove();
    }
  });

  describe('Rendering with CSV Data', () => {
    test('should render the preview modal with title', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const modal = document.querySelector('[data-testid="version-preview-modal"]');
      expect(modal).not.toBeNull();
      expect(modal.textContent).toContain('Version Preview');
    });

    test('should render CSV content as a table', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const table = document.querySelector('[data-testid="preview-table"]');
      expect(table).not.toBeNull();

      // Check headers are rendered
      const headers = table.querySelectorAll('th');
      expect(headers.length).toBe(5); // call_number, location, floor, x, y

      // Check data rows are rendered
      const rows = table.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
    });

    test('should render table cells as read-only', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const table = document.querySelector('[data-testid="preview-table"]');
      const inputs = table.querySelectorAll('input');

      // Should not have editable inputs
      expect(inputs.length).toBe(0);

      // Cells should be plain text
      const cells = table.querySelectorAll('td');
      expect(cells.length).toBeGreaterThan(0);
    });

    test('should display correct cell values from CSV', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const table = document.querySelector('[data-testid="preview-table"]');
      const firstRowCells = table.querySelectorAll('tbody tr:first-child td');

      expect(firstRowCells[0].textContent.trim()).toBe('QA76.73');
      expect(firstRowCells[1].textContent.trim()).toBe('Science Library');
      expect(firstRowCells[2].textContent.trim()).toBe('1');
    });
  });

  describe('Metadata Display', () => {
    test('should display version timestamp', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const metadata = document.querySelector('[data-testid="preview-metadata"]');
      expect(metadata).not.toBeNull();
      // Should contain some date representation
      expect(metadata.textContent).toMatch(/Feb|2024|15/);
    });

    test('should display username', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const metadata = document.querySelector('[data-testid="preview-metadata"]');
      expect(metadata.textContent).toContain('admin');
    });
  });

  describe('Loading State', () => {
    test('should show loading state while fetching content', async () => {
      let resolvePromise;
      const fetchPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      global.fetch.mockReturnValueOnce(fetchPromise);

      // Start preview but don't await
      const previewPromise = showVersionPreview({ versionId: 'v123' });

      // Check loading state is shown
      const loadingState = document.querySelector('[data-testid="preview-loading"]');
      expect(loadingState).not.toBeNull();
      expect(loadingState.textContent).toContain('Loading');

      // Resolve the fetch
      resolvePromise({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await previewPromise;
    });

    test('should hide loading state after content is loaded', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const loadingState = document.querySelector('[data-testid="preview-loading"]');
      expect(loadingState).toBeNull();
    });
  });

  describe('Error State', () => {
    test('should show error state on fetch failure', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await showVersionPreview({ versionId: 'v123' });

      const errorState = document.querySelector('[data-testid="preview-error"]');
      expect(errorState).not.toBeNull();
      expect(errorState.textContent).toContain('Failed to load');
    });

    test('should show error state on non-ok response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      await showVersionPreview({ versionId: 'v123' });

      const errorState = document.querySelector('[data-testid="preview-error"]');
      expect(errorState).not.toBeNull();
    });
  });

  describe('Close Button', () => {
    test('should have a close button (X)', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const closeButton = document.querySelector('[data-testid="preview-close-button"]');
      expect(closeButton).not.toBeNull();
      expect(closeButton.getAttribute('aria-label')).toBeTruthy();
    });

    test('should close modal when close button is clicked', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const closeButton = document.querySelector('[data-testid="preview-close-button"]');
      closeButton.click();

      const modal = document.querySelector('[data-testid="version-preview-modal"]');
      expect(modal).toBeNull();
    });

    test('should call onClose callback when closed', async () => {
      const onCloseMock = jest.fn();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123', onClose: onCloseMock });

      const closeButton = document.querySelector('[data-testid="preview-close-button"]');
      closeButton.click();

      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  describe('Restore Button', () => {
    test('should have a "Restore this version" button', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const restoreButton = document.querySelector('[data-testid="preview-restore-button"]');
      expect(restoreButton).not.toBeNull();
      expect(restoreButton.textContent).toContain('Restore');
    });

    test('should call onRestore callback with versionId when clicked', async () => {
      const onRestoreMock = jest.fn();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123', onRestore: onRestoreMock });

      const restoreButton = document.querySelector('[data-testid="preview-restore-button"]');
      restoreButton.click();

      expect(onRestoreMock).toHaveBeenCalledWith('v123');
    });
  });

  describe('Scrollable Container', () => {
    test('should have a scrollable container for large content', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const scrollContainer = document.querySelector('[data-testid="preview-scroll-container"]');
      expect(scrollContainer).not.toBeNull();

      // Check for overflow styles
      const styles = window.getComputedStyle(scrollContainer);
      expect(
        scrollContainer.classList.contains('overflow-auto') ||
        scrollContainer.classList.contains('overflow-y-auto') ||
        styles.overflow === 'auto' ||
        styles.overflowY === 'auto'
      ).toBe(true);
    });

    test('should have max-height constraint for scrolling', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const scrollContainer = document.querySelector('[data-testid="preview-scroll-container"]');

      // Should have max-height class or inline style
      const hasMaxHeight =
        scrollContainer.classList.contains('max-h-96') ||
        scrollContainer.classList.contains('max-h-[60vh]') ||
        scrollContainer.style.maxHeight !== '';

      expect(hasMaxHeight).toBe(true);
    });
  });

  describe('BiDi Text Support', () => {
    test('should have dir="auto" on table cells for BiDi support', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const table = document.querySelector('[data-testid="preview-table"]');
      const cells = table.querySelectorAll('td');

      cells.forEach(cell => {
        expect(cell.getAttribute('dir')).toBe('auto');
      });
    });

    test('should handle Hebrew content correctly', async () => {
      const hebrewCSV = `call_number,location,floor
QA76,ספרייה מרכזית,1
BF121,אגף פסיכולוגיה,2`;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: hebrewCSV,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const table = document.querySelector('[data-testid="preview-table"]');
      const cells = table.querySelectorAll('td');

      // Check Hebrew content is rendered
      const cellTexts = Array.from(cells).map(c => c.textContent);
      expect(cellTexts.some(t => t.includes('ספרייה'))).toBe(true);
    });
  });

  describe('Accessibility', () => {
    test('should have appropriate ARIA attributes on modal', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const modal = document.querySelector('[data-testid="version-preview-modal"]');
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
      expect(modal.getAttribute('aria-labelledby')).toBeTruthy();
    });

    test('should close modal on Escape key press', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(escapeEvent);

      const modal = document.querySelector('[data-testid="version-preview-modal"]');
      expect(modal).toBeNull();
    });

    test('should close modal when clicking backdrop', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const backdrop = document.querySelector('[data-testid="preview-backdrop"]');
      backdrop.click();

      const modal = document.querySelector('[data-testid="version-preview-modal"]');
      expect(modal).toBeNull();
    });

    test('should trap focus within modal', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const modal = document.querySelector('[data-testid="version-preview-modal"]');
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      expect(focusableElements.length).toBeGreaterThan(0);
    });
  });

  describe('API Integration', () => {
    test('should fetch from correct endpoint with versionId', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/versions/csv/v123')
      );
    });
  });

  describe('RTL Layout Support', () => {
    beforeEach(async () => {
      jest.resetModules();

      // Mock the i18n module with Hebrew settings
      jest.unstable_mockModule('../i18n.js', () => ({
        default: mockI18nHebrew
      }));

      const module = await import('../components/version-preview.js');
      showVersionPreview = module.showVersionPreview;
      hideVersionPreview = module.hideVersionPreview;

      // Set RTL direction on document
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    });

    test('should display Hebrew translations', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      const modal = document.querySelector('[data-testid="version-preview-modal"]');
      expect(modal.textContent).toContain('תצוגה מקדימה של גרסה');
    });
  });

  describe('hideVersionPreview function', () => {
    test('should export hideVersionPreview function', async () => {
      expect(typeof hideVersionPreview).toBe('function');
    });

    test('should close modal when hideVersionPreview is called', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: mockCSVContent,
          ...mockVersionMetadata
        })
      });

      await showVersionPreview({ versionId: 'v123' });

      // Modal should be visible
      expect(document.querySelector('[data-testid="version-preview-modal"]')).not.toBeNull();

      hideVersionPreview();

      // Modal should be removed
      expect(document.querySelector('[data-testid="version-preview-modal"]')).toBeNull();
    });
  });
});
