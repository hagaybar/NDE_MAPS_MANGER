/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Test suite for version-history component
// Following TDD methodology - RED phase

// Mock i18n module
const mockI18n = {
  locale: 'en',
  t: jest.fn((key) => {
    const translations = {
      'versions.title': 'Version History',
      'versions.timestamp': 'Date',
      'versions.user': 'User',
      'versions.size': 'Size',
      'versions.restore': 'Restore',
      'versions.preview': 'Preview',
      'versions.noVersions': 'No versions available',
      'versions.loadError': 'Failed to load versions',
      'common.loading': 'Loading...'
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
      'versions.title': 'היסטוריית גרסאות',
      'versions.timestamp': 'תאריך',
      'versions.user': 'משתמש',
      'versions.size': 'גודל',
      'versions.restore': 'שחזר',
      'versions.preview': 'תצוגה מקדימה',
      'versions.noVersions': 'אין גרסאות זמינות',
      'versions.loadError': 'שגיאה בטעינת גרסאות',
      'common.loading': 'טוען...'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => true),
  getLocale: jest.fn(() => 'he')
};

// Sample version data for tests
const mockVersions = [
  {
    versionId: 'v3',
    timestamp: '2024-02-15T14:30:00Z',
    username: 'admin',
    size: 2048576 // ~2MB
  },
  {
    versionId: 'v2',
    timestamp: '2024-02-10T09:15:00Z',
    username: 'editor1',
    size: 1536000 // ~1.5MB
  },
  {
    versionId: 'v1',
    timestamp: '2024-01-05T16:45:00Z',
    username: 'admin',
    size: 512 // 512 bytes
  }
];

describe('VersionHistory Component', () => {
  let initVersionHistory, formatFileSize, formatTimestamp;

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = '<div id="version-history"></div>';

    // Reset fetch mock
    global.fetch = jest.fn();

    // Reset modules to clear cached imports
    jest.resetModules();

    // Mock the i18n module before importing version-history
    jest.unstable_mockModule('../i18n.js', () => ({
      default: mockI18n
    }));

    const module = await import('../components/version-history.js');
    initVersionHistory = module.initVersionHistory;
    formatFileSize = module.formatFileSize;
    formatTimestamp = module.formatTimestamp;
  });

  describe('Rendering Version List', () => {
    test('should render the component container with title', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const container = document.getElementById('version-history');
      expect(container).not.toBeNull();
      expect(container.textContent).toContain('Version History');
    });

    test('should display all versions in a list', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const rows = document.querySelectorAll('[data-testid="version-row"]');
      expect(rows.length).toBe(3);
    });

    test('should sort versions by date with newest first', async () => {
      // Provide unsorted data
      const unsortedVersions = [
        { versionId: 'v1', timestamp: '2024-01-05T16:45:00Z', username: 'admin', size: 512 },
        { versionId: 'v3', timestamp: '2024-02-15T14:30:00Z', username: 'admin', size: 2048576 },
        { versionId: 'v2', timestamp: '2024-02-10T09:15:00Z', username: 'editor1', size: 1536000 }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: unsortedVersions })
      });

      await initVersionHistory();

      const rows = document.querySelectorAll('[data-testid="version-row"]');
      const firstRowVersionId = rows[0].getAttribute('data-version-id');
      expect(firstRowVersionId).toBe('v3'); // Newest version should be first
    });

    test('should display username for each version', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const userCells = document.querySelectorAll('[data-testid="version-user"]');
      expect(userCells[0].textContent.trim()).toBe('admin');
      expect(userCells[1].textContent.trim()).toBe('editor1');
    });
  });

  describe('Localized Timestamps', () => {
    test('should format timestamp in English locale', () => {
      const timestamp = '2024-02-15T14:30:00Z';
      const formatted = formatTimestamp(timestamp, 'en');

      // Should contain date components
      expect(formatted).toMatch(/Feb|February/);
      expect(formatted).toMatch(/15/);
      expect(formatted).toMatch(/2024/);
    });

    test('should format timestamp in Hebrew locale', () => {
      const timestamp = '2024-02-15T14:30:00Z';
      const formatted = formatTimestamp(timestamp, 'he');

      // Hebrew date formatting - should contain Hebrew characters or be localized
      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
    });

    test('should display timestamps in localized format in the UI', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const timestampCells = document.querySelectorAll('[data-testid="version-timestamp"]');
      expect(timestampCells.length).toBe(3);
      // Each timestamp cell should have content
      timestampCells.forEach(cell => {
        expect(cell.textContent.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Human-Readable File Sizes', () => {
    test('should format bytes correctly', () => {
      expect(formatFileSize(512)).toBe('512 B');
    });

    test('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1.00 KB');
      expect(formatFileSize(2560)).toBe('2.50 KB');
    });

    test('should format megabytes correctly', () => {
      expect(formatFileSize(1048576)).toBe('1.00 MB');
      expect(formatFileSize(2048576)).toBe('1.95 MB');
    });

    test('should format gigabytes correctly', () => {
      expect(formatFileSize(1073741824)).toBe('1.00 GB');
    });

    test('should display file sizes in the UI', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const sizeCells = document.querySelectorAll('[data-testid="version-size"]');
      expect(sizeCells.length).toBe(3);
      expect(sizeCells[0].textContent).toContain('MB'); // ~2MB
      expect(sizeCells[2].textContent).toContain('B'); // 512 bytes
    });
  });

  describe('Loading State', () => {
    test('should show loading state while fetching versions', async () => {
      // Create a promise that we control
      let resolvePromise;
      const fetchPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      global.fetch.mockReturnValueOnce(fetchPromise);

      // Start initialization but don't await
      const initPromise = initVersionHistory();

      // Check loading state is shown
      const container = document.getElementById('version-history');
      expect(container.textContent).toContain('Loading');

      // Resolve the fetch
      resolvePromise({
        ok: true,
        json: () => Promise.resolve({ versions: [] })
      });

      await initPromise;
    });

    test('should hide loading state after versions are loaded', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const loadingElement = document.querySelector('[data-testid="loading-state"]');
      expect(loadingElement).toBeNull();
    });
  });

  describe('Empty State', () => {
    test('should show empty state when no versions exist', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: [] })
      });

      await initVersionHistory();

      const emptyState = document.querySelector('[data-testid="empty-state"]');
      expect(emptyState).not.toBeNull();
      expect(emptyState.textContent).toContain('No versions available');
    });
  });

  describe('Error State', () => {
    test('should show error state on fetch failure', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await initVersionHistory();

      const errorState = document.querySelector('[data-testid="error-state"]');
      expect(errorState).not.toBeNull();
      expect(errorState.textContent).toContain('Failed to load versions');
    });

    test('should show error state on non-ok response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await initVersionHistory();

      const errorState = document.querySelector('[data-testid="error-state"]');
      expect(errorState).not.toBeNull();
    });
  });

  describe('Interactive Elements', () => {
    test('should have clickable rows for preview', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const rows = document.querySelectorAll('[data-testid="version-row"]');
      rows.forEach(row => {
        expect(row.getAttribute('role')).toBe('button');
        expect(row.getAttribute('tabindex')).toBe('0');
      });
    });

    test('should have restore button on each version row', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const restoreButtons = document.querySelectorAll('[data-testid="restore-button"]');
      expect(restoreButtons.length).toBe(3);
    });

    test('restore buttons should have accessible labels', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const restoreButtons = document.querySelectorAll('[data-testid="restore-button"]');
      restoreButtons.forEach(button => {
        expect(button.getAttribute('aria-label') || button.textContent).toBeTruthy();
      });
    });

    test('should call onPreview callback when row is clicked', async () => {
      const onPreviewMock = jest.fn();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory({ onPreview: onPreviewMock });

      const firstRow = document.querySelector('[data-testid="version-row"]');
      firstRow.click();

      expect(onPreviewMock).toHaveBeenCalledWith('v3');
    });

    test('should call onRestore callback when restore button is clicked', async () => {
      const onRestoreMock = jest.fn();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory({ onRestore: onRestoreMock });

      const firstRestoreButton = document.querySelector('[data-testid="restore-button"]');
      firstRestoreButton.click();

      expect(onRestoreMock).toHaveBeenCalledWith('v3');
    });
  });

  describe('Accessibility', () => {
    test('should have appropriate ARIA roles', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      // Table or list should have appropriate role
      const list = document.querySelector('[role="list"]') ||
                   document.querySelector('table');
      expect(list).not.toBeNull();
    });

    test('should have accessible column headers', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const headers = document.querySelectorAll('th, [role="columnheader"]');
      expect(headers.length).toBeGreaterThan(0);
    });

    test('should support keyboard navigation on rows', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const rows = document.querySelectorAll('[data-testid="version-row"]');
      rows.forEach(row => {
        // Should be focusable
        expect(row.getAttribute('tabindex')).toBe('0');
      });
    });

    test('rows should respond to Enter key for preview', async () => {
      const onPreviewMock = jest.fn();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory({ onPreview: onPreviewMock });

      const firstRow = document.querySelector('[data-testid="version-row"]');
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      firstRow.dispatchEvent(enterEvent);

      expect(onPreviewMock).toHaveBeenCalledWith('v3');
    });
  });

  describe('RTL Layout Support', () => {
    beforeEach(async () => {
      jest.resetModules();

      // Mock the i18n module with Hebrew settings
      jest.unstable_mockModule('../i18n.js', () => ({
        default: mockI18nHebrew
      }));

      const module = await import('../components/version-history.js');
      initVersionHistory = module.initVersionHistory;

      // Set RTL direction on document
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    });

    test('should use logical CSS properties for RTL support', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: mockVersions })
      });

      await initVersionHistory();

      const container = document.getElementById('version-history');
      // Component should render in RTL context
      expect(container.innerHTML).toBeTruthy();

      // Check that Hebrew text is displayed
      expect(container.textContent).toContain('היסטוריית גרסאות');
    });

    test('should display Hebrew translations in RTL mode', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: [] })
      });

      await initVersionHistory();

      const emptyState = document.querySelector('[data-testid="empty-state"]');
      expect(emptyState.textContent).toContain('אין גרסאות זמינות');
    });
  });

  describe('API Integration', () => {
    test('should fetch from correct endpoint', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: [] })
      });

      await initVersionHistory();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/versions/csv')
      );
    });

    test('should accept custom fileType parameter', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ versions: [] })
      });

      await initVersionHistory({ fileType: 'svg' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/versions/svg')
      );
    });
  });
});
