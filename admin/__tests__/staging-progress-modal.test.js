/**
 * @jest-environment jsdom
 *
 * Tests for issue #62 — blocking modal overlay used during the staged-replace
 * sequence (Upload → Validate → Refresh). Covers:
 *   - Mount with aria-modal="true" + body scroll lock
 *   - Step transitions via updateStep()
 *   - Dismissal interception: backdrop click is swallowed; Escape suppressed
 *   - Stuck-state warning surfaces after 60s; Force close button closes modal
 *   - close() removes overlay and restores body.style.overflow
 *   - Focus trap wraps Tab and Shift+Tab inside the card
 */

import { jest } from '@jest/globals';

let showStagingProgressModal;

beforeEach(async () => {
  jest.resetModules();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  const mod = await import('../components/staging-progress-modal.js');
  showStagingProgressModal = mod.showStagingProgressModal;
  // Force English on the same i18n module the SUT consumes.
  const i18n = (await import('../i18n.js?v=5')).default;
  i18n.locale = 'en';
});

afterEach(() => {
  // Clear any stale overlays so the next test's mount assertion is honest.
  document.querySelectorAll('[data-testid="staging-progress-modal"]').forEach(el => el.remove());
  document.body.style.overflow = '';
});

describe('showStagingProgressModal — mount, ARIA, body scroll lock', () => {
  test('mounts overlay in document.body with aria-modal="true" and locks body scroll', () => {
    const controller = showStagingProgressModal();

    const overlay = document.querySelector('[data-testid="staging-progress-modal"]');
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');

    controller.close();
  });

  test('renders heading and current-step text starting at "uploading"', () => {
    const controller = showStagingProgressModal();
    const overlay = document.querySelector('[data-testid="staging-progress-modal"]');

    // No floor passed → generic heading.
    expect(overlay.textContent).toMatch(/Replacing the map/i);
    // Initial step is "uploading" — plain copy.
    expect(overlay.textContent).toMatch(/Sending your new map/i);
    expect(overlay.textContent).toMatch(/keep this tab open/i);

    controller.close();
  });

  test('heading shows the floor when a floor is passed', () => {
    const modal = showStagingProgressModal({ floor: 1 });
    expect(document.querySelector('[data-testid="staging-progress-modal-heading"]').textContent)
      .toContain('Replacing the Floor 1 map');
    modal.close();
  });

  test('heading is generic when no floor is passed', () => {
    const modal = showStagingProgressModal();
    expect(document.querySelector('[data-testid="staging-progress-modal-heading"]').textContent)
      .toContain('Replacing the map');
    modal.close();
  });
});

describe('showStagingProgressModal — step transitions', () => {
  test('updateStep("validating") swaps the visible step text', () => {
    const controller = showStagingProgressModal();
    const overlay = document.querySelector('[data-testid="staging-progress-modal"]');

    const stepEl = overlay.querySelector('[data-testid="staging-progress-modal-step"]');
    expect(stepEl).not.toBeNull();
    expect(stepEl.textContent).toMatch(/Sending your new map/i);

    controller.updateStep('validating');
    expect(stepEl.textContent).toMatch(/Checking it against your shelf information/i);
    expect(stepEl.textContent).not.toMatch(/Sending your new map/i);

    controller.updateStep('refreshing');
    expect(stepEl.textContent).toMatch(/Almost done/i);
    expect(stepEl.textContent).not.toMatch(/Checking it against your shelf information/i);

    controller.close();
  });
});

describe('showStagingProgressModal — dismissal interception', () => {
  test('backdrop click does NOT close the modal', () => {
    const controller = showStagingProgressModal();
    const overlay = document.querySelector('[data-testid="staging-progress-modal"]');

    // Click on the overlay itself (not the card)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    overlay.dispatchEvent(event);

    // Still in DOM after backdrop click
    expect(document.querySelector('[data-testid="staging-progress-modal"]')).not.toBeNull();

    controller.close();
  });

  test('Escape keydown does NOT close the modal (preventDefault called)', () => {
    const controller = showStagingProgressModal();

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    // Still in DOM
    expect(document.querySelector('[data-testid="staging-progress-modal"]')).not.toBeNull();

    controller.close();
  });
});

describe('showStagingProgressModal — stuck-state warning + force close', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('after 60s with no updateStep, surfaces a stuck-warning line and a Force close button', () => {
    const controller = showStagingProgressModal();

    // Before timeout: no warning
    let warning = document.querySelector('[data-testid="staging-progress-modal-stuck"]');
    expect(warning).toBeNull();

    jest.advanceTimersByTime(60_000);

    warning = document.querySelector('[data-testid="staging-progress-modal-stuck"]');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toMatch(/taking longer than usual/i);

    const forceClose = document.querySelector('[data-testid="staging-progress-modal-force-close"]');
    expect(forceClose).not.toBeNull();
    expect(forceClose.textContent).toMatch(/Close anyway/i);

    controller.close();
  });

  test('Force close button closes the modal', () => {
    const controller = showStagingProgressModal();
    jest.advanceTimersByTime(60_000);

    const forceClose = document.querySelector('[data-testid="staging-progress-modal-force-close"]');
    forceClose.click();

    expect(document.querySelector('[data-testid="staging-progress-modal"]')).toBeNull();
    // body overflow restored
    expect(document.body.style.overflow).not.toBe('hidden');

    // Calling close() again must not throw
    expect(() => controller.close()).not.toThrow();
  });

  test('updateStep resets the stuck timer so the warning does not appear if steps are progressing', () => {
    const controller = showStagingProgressModal();

    jest.advanceTimersByTime(30_000);
    controller.updateStep('validating');
    jest.advanceTimersByTime(30_000);

    // We've advanced 60s total but the timer was reset at 30s, so only 30s
    // since the last step — warning should not yet have fired.
    let warning = document.querySelector('[data-testid="staging-progress-modal-stuck"]');
    expect(warning).toBeNull();

    jest.advanceTimersByTime(30_000);
    warning = document.querySelector('[data-testid="staging-progress-modal-stuck"]');
    expect(warning).not.toBeNull();

    controller.close();
  });
});

describe('showStagingProgressModal — close() cleanup', () => {
  test('close() removes overlay and restores body.style.overflow', () => {
    const controller = showStagingProgressModal();
    expect(document.querySelector('[data-testid="staging-progress-modal"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    controller.close();

    expect(document.querySelector('[data-testid="staging-progress-modal"]')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  test('close() is idempotent', () => {
    const controller = showStagingProgressModal();
    controller.close();
    expect(() => controller.close()).not.toThrow();
  });

  test('close() removes the document keydown listener (Escape no longer blocked after close)', () => {
    const controller = showStagingProgressModal();
    controller.close();

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    // After close, the modal's escape handler is gone — defaultPrevented should be false
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('showStagingProgressModal — focus trap', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Tab from the last focusable wraps back to the first; Shift+Tab from first wraps to last', () => {
    // Mount under fake timers so the stuck-warning setTimeout is fake-clock
    // controllable. Force the warning so we have a focusable Force close
    // button to populate the trap with >=1 element.
    const controller = showStagingProgressModal();
    jest.advanceTimersByTime(60_000);

    const card = document.querySelector('[data-testid="staging-progress-modal-card"]');
    expect(card).not.toBeNull();

    const focusables = card.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
    );
    expect(focusables.length).toBeGreaterThan(0);

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // Simulate Tab from last
    last.focus();
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    card.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    // Simulate Shift+Tab from first
    first.focus();
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    card.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    controller.close();
  });
});
