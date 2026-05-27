// Blocking modal overlay rendered while the staged-replace sequence
// (Upload → Validate → Refresh) is in flight. Issue #62.
//
// Live testing of #58's inline progress text + button-disable proved the cues
// are correctly fired but visually too easy to miss — a librarian who isn't
// actively watching the SVG Manager view can read 3–15s of silence as "the
// app is broken" and trigger double-clicks or close the tab mid-promote. This
// modal makes that physically impossible by:
//   - Taking the entire viewport with a dimmed backdrop and centered card
//   - Swallowing backdrop clicks (with a shake cue so the click is visibly
//     intercepted) and Escape keydowns (preventDefault + stopPropagation)
//   - Rendering no close affordance (other than a stuck-state Force close
//     button that only appears after 60s of no step advance)
//   - Trapping Tab focus inside the card and locking body scroll
//   - aria-modal="true" for assistive tech
//
// The button-disable and beforeunload guard in svg-manager.js remain as
// complementary defense in depth; this module owns only the modal's DOM.

import i18n from '../i18n.js?v=5';

const STYLE_ELEMENT_ID = 'spm-styles';
const STUCK_TIMEOUT_MS = 60_000;

// Same fallback map shape as svg-manager.js — keeps the modal usable when
// i18n hasn't loaded yet (e.g., the very first replace after page load
// occasionally races the i18n fetch on cold cache).
const FALLBACKS = {
  'svg.staging.progress.heading':        { en: 'Replacing the Floor {floor} map', he: 'מחליף את מפת קומה {floor}' },
  'svg.staging.progress.headingGeneric': { en: 'Replacing the map',                he: 'מחליף את המפה' },
  'svg.staging.progress.uploading':      { en: 'Sending your new map…',            he: 'שולח את המפה החדשה…' },
  'svg.staging.progress.validating':     { en: 'Checking it against your shelf information…', he: 'בודק מול נתוני המדפים שלך…' },
  'svg.staging.progress.refreshing':     { en: 'Almost done…',                     he: 'כמעט סיימתי…' },
  'svg.staging.progress.doNotClose':     { en: "Please keep this tab open — I'm still working.", he: 'נא להשאיר את הלשונית פתוחה — אני עדיין עובד על זה.' },
  'svg.staging.progress.stuckWarning':   { en: 'This is taking longer than usual — it may not have gone through. Keep waiting, or close and try again.', he: 'זה לוקח יותר זמן מהרגיל — ייתכן שזה לא הושלם. אפשר להמשיך להמתין, או לסגור ולנסות שוב.' },
  'svg.staging.progress.forceClose':     { en: 'Close anyway',                     he: 'סגור בכל זאת' },
};

/**
 * Resolve a translation, falling back to the local map if i18n hasn't yet
 * loaded the bundle. The Hebrew bundle is loaded asynchronously and the modal
 * may be requested before it finishes; without this fallback the user briefly
 * sees raw dot-paths instead of copy.
 */
function t(key) {
  const value = i18n.t(key);
  if (value === key && FALLBACKS[key]) {
    const locale = i18n.getLocale?.() || 'en';
    return FALLBACKS[key][locale] || FALLBACKS[key]['en'];
  }
  return value;
}

/**
 * Inject the modal's CSS once per page load. Scoped under `.spm-*` class
 * prefix so it does not bleed into the rest of the SPA (which uses Tailwind
 * utility classes). The shake animation is the visible feedback when the
 * user attempts to dismiss via backdrop click — without it, the click looks
 * like nothing happened.
 */
function ensureStyles() {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
    .spm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .spm-card {
      background: #ffffff;
      border-radius: 0.75rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
      padding: 1.75rem 2rem;
      max-width: 28rem;
      width: 100%;
      color: #111827;
      position: relative;
    }
    .spm-card.spm-shake {
      animation: spm-shake 0.32s cubic-bezier(.36,.07,.19,.97) both;
    }
    @keyframes spm-shake {
      10%, 90% { transform: translateX(-1px); }
      20%, 80% { transform: translateX(2px); }
      30%, 50%, 70% { transform: translateX(-4px); }
      40%, 60% { transform: translateX(4px); }
    }
    .spm-heading {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 1rem 0;
      color: #1f2937;
    }
    .spm-steps {
      display: flex;
      gap: 0.5rem;
      margin: 0.75rem 0 1rem 0;
    }
    .spm-step {
      flex: 1;
      height: 0.5rem;
      border-radius: 0.25rem;
      background: #e5e7eb;
      overflow: hidden;
      position: relative;
    }
    .spm-step.is-active {
      background: #bfdbfe;
    }
    .spm-step.is-active::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, #3b82f6, transparent);
      animation: spm-shimmer 1.4s linear infinite;
    }
    .spm-step.is-done {
      background: #2563eb;
    }
    @keyframes spm-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    .spm-step-text {
      font-size: 0.95rem;
      font-weight: 500;
      color: #1d4ed8;
      margin: 0 0 0.25rem 0;
    }
    .spm-subtitle {
      font-size: 0.8125rem;
      color: #6b7280;
      margin: 0;
    }
    .spm-stuck {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: #92400e;
    }
    .spm-stuck-text {
      margin: 0 0 0.5rem 0;
    }
    .spm-force-close {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
      background: #b45309;
      color: #ffffff;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
    }
    .spm-force-close:hover {
      background: #92400e;
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

const STEP_ORDER = ['uploading', 'validating', 'refreshing'];

/**
 * Render the step indicator: three pills, the current one shimmers, previous
 * ones are filled solid. The visual matches the three-stage chain so users
 * can see progress without reading text.
 */
function renderStepsHtml(currentStep) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  return STEP_ORDER.map((step, idx) => {
    let cls = 'spm-step';
    if (idx < currentIdx) cls += ' is-done';
    else if (idx === currentIdx) cls += ' is-active';
    return `<div class="${cls}" data-spm-step="${escapeHtml(step)}"></div>`;
  }).join('');
}

/**
 * Resolve the i18n step text for the visible status line. The step copy is now
 * plain librarian language with no placeholders, so we return it directly.
 */
function resolveStepText(step) {
  const key = `svg.staging.progress.${step}`;
  return t(key);
}

/**
 * Show the staging progress modal and return a controller for advancing the
 * step indicator, surfacing the stuck-state warning, or tearing down. Safe to
 * call multiple times — each call creates a fresh overlay; the caller is
 * responsible for `close()`-ing the prior controller (the staged-replace
 * sequence guarantees this via a finally block).
 *
 * Controller methods:
 *   - updateStep('uploading' | 'validating' | 'refreshing'): swap the visible
 *     step text and advance the indicator. Resets the stuck-warning timer.
 *   - showStuckWarning(): manually surface the stuck-state warning + Force
 *     close button. Also called automatically after STUCK_TIMEOUT_MS without
 *     an updateStep call.
 *   - close(): remove the overlay, restore body scroll, drop all listeners
 *     and timers. Idempotent.
 */
export function showStagingProgressModal(opts = {}) {
  ensureStyles();

  // Thread the floor (from the floor_N.svg filename the replace flow has) into
  // the heading so the librarian sees exactly which map is being replaced.
  const floor = opts.floor;
  const headingText = (floor !== undefined && floor !== null && !Number.isNaN(Number(floor)))
    ? t('svg.staging.progress.heading').replace('{floor}', String(floor))
    : t('svg.staging.progress.headingGeneric');

  // Preserve the prior body overflow so close() restores it exactly, instead
  // of assuming '' was the default. Some host pages may run with a
  // pre-existing scroll-lock from another modal stack.
  const previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // Top-level overlay — receives the backdrop click. The card sits inside;
  // clicks on the card stopPropagation upward so they don't trigger the
  // shake animation.
  const overlay = document.createElement('div');
  overlay.className = 'spm-overlay';
  overlay.setAttribute('data-testid', 'staging-progress-modal');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'spm-heading');
  overlay.setAttribute('aria-describedby', 'spm-subtitle');

  let currentStep = 'uploading';

  overlay.innerHTML = `
    <div class="spm-card" data-testid="staging-progress-modal-card" tabindex="-1">
      <h2 class="spm-heading" id="spm-heading" data-testid="staging-progress-modal-heading">
        ${escapeHtml(headingText)}
      </h2>
      <div class="spm-steps" aria-hidden="true">
        ${renderStepsHtml(currentStep)}
      </div>
      <p class="spm-step-text" data-testid="staging-progress-modal-step" role="status" aria-live="polite">
        ${escapeHtml(resolveStepText(currentStep))}
      </p>
      <p class="spm-subtitle" id="spm-subtitle">
        ${escapeHtml(t('svg.staging.progress.doNotClose'))}
      </p>
      <div data-testid="staging-progress-modal-stuck-slot"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const card = overlay.querySelector('[data-testid="staging-progress-modal-card"]');
  const stepEl = overlay.querySelector('[data-testid="staging-progress-modal-step"]');
  const stepsContainer = overlay.querySelector('.spm-steps');
  const stuckSlot = overlay.querySelector('[data-testid="staging-progress-modal-stuck-slot"]');

  // Backdrop click is swallowed. The card stops propagation, so a click that
  // bubbles to overlay came from outside the card → shake the card so the
  // user gets visible feedback the click was intercepted.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      card.classList.remove('spm-shake');
      // Force reflow to restart the animation on rapid repeated clicks.
      void card.offsetWidth;
      card.classList.add('spm-shake');
    }
  });
  // Clicks inside the card do not trigger backdrop logic.
  card.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Capture-phase Escape interceptor on document. We use `keydown` and call
  // both preventDefault + stopPropagation so the SPA's other Escape handlers
  // (e.g., closing preview modals) don't see the event either.
  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  // capture=true so we run BEFORE bubble-phase listeners attached elsewhere.
  document.addEventListener('keydown', onKeydown, true);

  // Focus trap: Tab/Shift+Tab cycles focus inside the card. We listen on the
  // card itself, not the document, so the trap is automatically scoped.
  const cardKeydown = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = card.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first || !card.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last || !card.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  card.addEventListener('keydown', cardKeydown);

  // Initial focus: the card itself (tabindex=-1) so the user's first Tab
  // brings them into focusable elements inside, never outside.
  card.focus();

  let closed = false;
  let stuckTimer = null;
  let stuckShown = false;

  function clearStuckTimer() {
    if (stuckTimer !== null) {
      clearTimeout(stuckTimer);
      stuckTimer = null;
    }
  }

  function scheduleStuckTimer() {
    clearStuckTimer();
    stuckTimer = setTimeout(() => {
      stuckTimer = null;
      showStuckWarningImpl();
    }, STUCK_TIMEOUT_MS);
  }

  function showStuckWarningImpl() {
    if (stuckShown || closed) return;
    stuckShown = true;
    stuckSlot.innerHTML = `
      <div class="spm-stuck" data-testid="staging-progress-modal-stuck" role="alert">
        <p class="spm-stuck-text">${escapeHtml(t('svg.staging.progress.stuckWarning'))}</p>
        <button type="button" class="spm-force-close" data-testid="staging-progress-modal-force-close">
          ${escapeHtml(t('svg.staging.progress.forceClose'))}
        </button>
      </div>
    `;
    const forceBtn = stuckSlot.querySelector('[data-testid="staging-progress-modal-force-close"]');
    forceBtn?.addEventListener('click', () => {
      // The user has acknowledged the stuck state. We close the modal but the
      // server-side lock may still be held — surfacing that warning is the
      // caller's responsibility (it has access to the toast helper); from the
      // modal's perspective, the user explicitly chose to escape.
      closeImpl();
    });
  }

  function updateStepImpl(name) {
    if (closed) return;
    if (!STEP_ORDER.includes(name)) return;
    currentStep = name;
    stepEl.textContent = resolveStepText(name);
    stepsContainer.innerHTML = renderStepsHtml(name);
    // Reset stuck-warning timer on every advance: a fresh step means the
    // chain is still progressing.
    scheduleStuckTimer();
  }

  function closeImpl() {
    if (closed) return;
    closed = true;
    clearStuckTimer();
    document.removeEventListener('keydown', onKeydown, true);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    // Restore body overflow to whatever it was before mount.
    document.body.style.overflow = previousBodyOverflow;
  }

  // Initial stuck-warning timer fires from the moment the modal mounts —
  // covers the case where the very first network call (Upload) itself hangs.
  scheduleStuckTimer();

  return {
    updateStep: updateStepImpl,
    showStuckWarning: showStuckWarningImpl,
    close: closeImpl,
  };
}
