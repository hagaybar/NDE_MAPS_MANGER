import { Page, Locator, expect } from '@playwright/test';

/**
 * Base Page Object containing common functionality shared across all pages
 */
export class BasePage {
  readonly page: Page;

  // Header elements
  readonly appTitle: Locator;
  readonly langEnButton: Locator;
  readonly langHeButton: Locator;
  readonly userMenuContainer: Locator;

  // Navigation tabs
  readonly navCsvTab: Locator;
  readonly navSvgTab: Locator;
  readonly navVersionsTab: Locator;
  readonly navUsersTab: Locator;

  // Toast notifications
  readonly toastContainer: Locator;

  // Auth overlay
  readonly authOverlay: Locator;
  readonly authLoginButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header elements
    this.appTitle = page.locator('#app-title');
    this.langEnButton = page.locator('#lang-en');
    this.langHeButton = page.locator('#lang-he');
    this.userMenuContainer = page.locator('#user-menu-container');

    // Navigation tabs
    this.navCsvTab = page.locator('#nav-csv');
    this.navSvgTab = page.locator('#nav-svg');
    this.navVersionsTab = page.locator('#nav-versions');
    this.navUsersTab = page.locator('#nav-users');

    // Toast notifications
    this.toastContainer = page.locator('#toast-container');

    // Auth overlay
    this.authOverlay = page.locator('#auth-overlay');
    this.authLoginButton = page.locator('#auth-login-btn');
  }

  /**
   * Navigate to the admin app root
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /**
   * Wait for page to be fully loaded and authenticated
   * The app shows auth overlay when not authenticated
   */
  async waitForPageLoad(): Promise<void> {
    // Wait for basic DOM content
    await this.page.waitForLoadState('domcontentloaded');

    // Wait for either the nav tabs to be visible (authenticated)
    // or auth overlay to be visible (not authenticated)
    await Promise.race([
      this.navCsvTab.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      this.authOverlay.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
    ]);
  }

  /**
   * Wait for authenticated state - nav tabs visible and no auth overlay
   */
  async waitForAuthenticatedState(): Promise<void> {
    // Wait for navigation to be visible indicating we're authenticated
    await this.navCsvTab.waitFor({ state: 'visible', timeout: 15000 });
    // Ensure auth overlay is hidden
    await expect(this.authOverlay).toBeHidden({ timeout: 5000 }).catch(() => {});
  }

  /**
   * Switch to English language
   */
  async switchToEnglish(): Promise<void> {
    await this.langEnButton.click();
    await expect(this.langEnButton).toHaveClass(/active/);
    await expect(this.page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(this.page.locator('html')).toHaveAttribute('dir', 'ltr');
  }

  /**
   * Switch to Hebrew language
   */
  async switchToHebrew(): Promise<void> {
    await this.langHeButton.click();
    await expect(this.langHeButton).toHaveClass(/active/);
    await expect(this.page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(this.page.locator('html')).toHaveAttribute('dir', 'rtl');
  }

  /**
   * Get current language
   */
  async getCurrentLanguage(): Promise<'en' | 'he'> {
    const lang = await this.page.locator('html').getAttribute('lang');
    return lang as 'en' | 'he';
  }

  /**
   * Navigate to CSV Editor tab
   */
  async navigateToCsvEditor(): Promise<void> {
    await this.navCsvTab.click();
    await expect(this.navCsvTab).toHaveClass(/active/);
    await expect(this.page.locator('#csv-editor')).toBeVisible();
  }

  /**
   * Navigate to SVG Manager tab
   */
  async navigateToSvgManager(): Promise<void> {
    await this.navSvgTab.click();
    await expect(this.navSvgTab).toHaveClass(/active/);
    await expect(this.page.locator('#svg-manager')).toBeVisible();
  }

  /**
   * Navigate to Version History tab
   */
  async navigateToVersionHistory(): Promise<void> {
    await this.navVersionsTab.click();
    await expect(this.navVersionsTab).toHaveClass(/active/);
    await expect(this.page.locator('#version-history')).toBeVisible();
  }

  /**
   * Navigate to User Management tab (admin only)
   */
  async navigateToUserManagement(): Promise<void> {
    await this.navUsersTab.click();
    await expect(this.navUsersTab).toHaveClass(/active/);
    await expect(this.page.locator('#user-management')).toBeVisible();
  }

  /**
   * Check if Users tab is visible (admin only)
   */
  async isUsersTabVisible(): Promise<boolean> {
    return await this.navUsersTab.isVisible();
  }

  /**
   * Wait for a toast notification to appear
   */
  async waitForToast(type?: 'success' | 'error' | 'info' | 'warning'): Promise<Locator> {
    // Toast uses Tailwind classes: bg-green-500 for success, bg-red-500 for error, bg-blue-500 for info
    const colorClass = type === 'success' ? 'bg-green-500' :
                       type === 'error' ? 'bg-red-500' :
                       type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500';
    const toast = type ?
      this.toastContainer.locator(`div.${colorClass}`).first() :
      this.toastContainer.locator('div').first();
    await expect(toast).toBeVisible({ timeout: 5000 });
    return toast;
  }

  /**
   * Get toast message text
   */
  async getToastMessage(): Promise<string> {
    const toast = this.toastContainer.locator('div').first();
    await expect(toast).toBeVisible();
    return await toast.textContent() || '';
  }

  /**
   * Check if auth overlay is shown
   */
  async isAuthOverlayVisible(): Promise<boolean> {
    return await this.authOverlay.isVisible();
  }

  /**
   * Click login button on auth overlay
   */
  async clickLogin(): Promise<void> {
    await this.authLoginButton.click();
  }

  /**
   * Take a screenshot with a descriptive name
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `e2e/screenshots/${name}.png` });
  }
}
