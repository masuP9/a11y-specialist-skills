/**
 * Keyboard Trap Check (WCAG 2.1.2 — No Keyboard Trap)
 *
 * Tabs through every focusable element on the page and detects regions where
 * focus cannot escape. Like the focus-indicator check, this owns its
 * BrowserContext (accepts `browser`, not `page`) so it can perform its own
 * navigation with `waitUntil: 'load'` for file: URLs (required for CI smoke
 * tests).
 *
 * Limitations:
 * - Shadow DOM: querySelectorAll does not pierce shadow roots; traps inside
 *   shadow components are not detected.
 * - iframes: document.activeElement returns the <iframe> element, not the
 *   focused descendant; traps inside iframes are not detected.
 * - Dynamic inert: traps created by toggling the `inert` attribute mid-walk
 *   are not detected.
 * - SPA churn: if the number of focusable elements changes during the Tab
 *   walk the window-size calculation may be off.
 *
 * The primary value of this check is as a manual-review filter (incomplete
 * findings); confirmed violations (no escape at all) are rare but critical.
 */

import type { Browser, BrowserContextOptions } from '@playwright/test';
import type {
  KeyboardTrapCheckResult,
  KeyboardTrapCheckDetails,
  KeyboardTrapEvidence,
} from '../types.js';
import {
  FOCUSABLE_SELECTOR,
  DEFAULT_NAVIGATION_SETTLE_MS,
  DEFAULT_KEYBOARD_TRAP_RESULT_FILE,
  DEFAULT_KEYBOARD_TRAP_SCREENSHOT_FILE,
  KEYBOARD_TRAP_SLACK,
  KEYBOARD_TRAP_MAX_TAB_PRESSES,
  KEYBOARD_TRAP_ESCAPE_SETTLE_MS,
  KEYBOARD_TRAP_MAX_ESCAPE_ATTEMPTS,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeKeyboardTrapCheck,
} from '../utils/axe-format.js';
import {
  saveAuditResult,
  takeAuditScreenshot,
  resolveScreenshotPath,
  requireTargetUrl,
  logAuditHeader,
  logOutputPaths,
  type OutputLocationOptions,
} from '../utils/test-harness.js';

// =============================================================================
// Options
// =============================================================================

export interface RunKeyboardTrapCheckOptions extends OutputLocationOptions {
  /** The browser to create audit contexts in. */
  browser: Browser;
  /** Target URL. Falls back to the `TEST_PAGE` env var; required. */
  targetUrl?: string;
  /** Whether to capture a screenshot (default: false). */
  screenshot?: boolean;
  /** Options forwarded to `browser.newContext()`. */
  contextOptions?: BrowserContextOptions;
  /** Milliseconds to wait after each Tab press (default: DEFAULT_NAVIGATION_SETTLE_MS). */
  walkSettleMs?: number;
}

// =============================================================================
// Internal types
// =============================================================================

interface ActiveElementInfo {
  selector: string;
  tag: string;
  name: string;
  html: string;
  htmlTruncated: boolean;
}

// =============================================================================
// Runner
// =============================================================================

/**
 * Run the keyboard trap check, write the result JSON (and optionally a
 * screenshot), and return the parsed result.
 */
export async function runKeyboardTrapCheck(
  options: RunKeyboardTrapCheckOptions,
): Promise<KeyboardTrapCheckResult> {
  const {
    browser,
    targetUrl: targetUrlOption,
    screenshot = false,
    contextOptions,
    walkSettleMs = DEFAULT_NAVIGATION_SETTLE_MS,
    ...location
  } = options;

  const targetUrl = requireTargetUrl(targetUrlOption);

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    // Use 'load' for file: URLs — networkidle never resolves for file: protocol.
    const waitUntil = targetUrl.startsWith('file:') ? 'load' : 'networkidle';
    await page.goto(targetUrl, { waitUntil });

    // ------------------------------------------------------------------
    // 1. Enumerate focusable elements
    // ------------------------------------------------------------------
    const focusableSelector = FOCUSABLE_SELECTOR;
    const htmlSnippetMaxLength = HTML_SNIPPET_MAX_LENGTH;

    const count: number = await page.evaluate(
      ({ sel }: { sel: string }) => {
        return document.querySelectorAll(sel).length;
      },
      { sel: focusableSelector },
    );

    // Early exit: no focusable elements → inapplicable
    if (count === 0) {
      const details: KeyboardTrapCheckDetails = {
        totalFocusableElements: 0,
        trapCandidates: 0,
        confirmedTraps: [],
        needsReview: [],
        screenshotPath: '',
      };
      const buckets = normalizeKeyboardTrapCheck(details);
      const result = buildAuditResult({
        source: 'keyboard-trap-check',
        url: page.url(),
        details,
        buckets,
      });

      let screenshotPathOut = '';
      if (screenshot) {
        const resolvedPath = saveAuditResult(result, {
          ...location,
          defaultFile: DEFAULT_KEYBOARD_TRAP_RESULT_FILE,
        });
        screenshotPathOut = await takeAuditScreenshot(page, {
          path: resolveScreenshotPath(
            resolvedPath,
            DEFAULT_KEYBOARD_TRAP_SCREENSHOT_FILE,
          ),
        });
        details.screenshotPath = screenshotPathOut;
        logAuditHeader('Keyboard Trap Check', 'WCAG 2.1.2', page.url());
        logOutputPaths(resolvedPath, screenshotPathOut);
      } else {
        const resolvedPath = saveAuditResult(result, {
          ...location,
          defaultFile: DEFAULT_KEYBOARD_TRAP_RESULT_FILE,
        });
        logAuditHeader('Keyboard Trap Check', 'WCAG 2.1.2', page.url());
        logOutputPaths(resolvedPath);
      }
      return result;
    }

    // ------------------------------------------------------------------
    // 2. Tab walk
    // ------------------------------------------------------------------
    const pressN = Math.min(
      2 * count + KEYBOARD_TRAP_SLACK,
      KEYBOARD_TRAP_MAX_TAB_PRESSES,
    );

    if (2 * count + KEYBOARD_TRAP_SLACK > KEYBOARD_TRAP_MAX_TAB_PRESSES) {
      console.warn(
        `[keyboard-trap-check] Tab walk capped at ${KEYBOARD_TRAP_MAX_TAB_PRESSES} ` +
          `presses (page has ${count} focusable elements). Large pages may produce ` +
          `false negatives for traps near the end of the tab order.`,
      );
    }

    const walk: string[] = [];
    const walkDetails: ActiveElementInfo[] = [];

    for (let i = 0; i < pressN; i++) {
      await page.keyboard.press('Tab');
      if (walkSettleMs > 0) {
        await page.waitForTimeout(walkSettleMs);
      }

      const info: ActiveElementInfo = await page.evaluate(
        ({ maxLen }: { maxLen: number }) => {
          const el = document.activeElement;
          if (!el || el === document.body || el === document.documentElement) {
            return {
              selector: '(body)',
              tag: 'body',
              name: '',
              html: '<body>',
              htmlTruncated: false,
            };
          }

          // Build a simple CSS selector for the element
          function getSelector(element: Element): string {
            const parts: string[] = [];
            let current: Element | null = element;
            while (current && current !== document.documentElement) {
              const tag = current.tagName.toLowerCase();
              const id = current.id ? `#${CSS.escape(current.id)}` : '';
              if (id) {
                parts.unshift(`${tag}${id}`);
                break;
              }
              const p: Element | null = current.parentElement;
              if (p) {
                const siblings = [...p.children].filter(
                  (c) => c.tagName === current!.tagName,
                );
                const idx = siblings.indexOf(current) + 1;
                parts.unshift(
                  siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag,
                );
              } else {
                parts.unshift(tag);
              }
              current = p;
            }
            return parts.join(' > ');
          }

          const selector = getSelector(el);
          const ariaLabel = (el as HTMLElement).getAttribute('aria-label');
          const name = ariaLabel
            ? ariaLabel
            : (el as HTMLElement).textContent?.trim().slice(0, 50) ?? '';

          const rawHtml = el.outerHTML;
          const htmlTruncated = rawHtml.length > maxLen;

          return {
            selector,
            tag: el.tagName,
            name,
            html: htmlTruncated ? rawHtml.slice(0, maxLen) : rawHtml,
            htmlTruncated,
          };
        },
        { maxLen: htmlSnippetMaxLength },
      );

      walk.push(info.selector);
      walkDetails.push(info);
    }

    // ------------------------------------------------------------------
    // 3. Trap detection (corrected algorithm: window = count + 1)
    // ------------------------------------------------------------------
    const windowSize = count + 1;
    const tail = walk.slice(-windowSize);
    const tailSet = new Set(tail);

    const confirmedTraps: KeyboardTrapEvidence[] = [];
    const needsReview: KeyboardTrapEvidence[] = [];

    // Trap candidate: no (body) in tail, and tail doesn't cover all elements
    const isTrapCandidate =
      !tailSet.has('(body)') && tailSet.size < count;

    if (isTrapCandidate) {
      const trapSelectors = [...tailSet];

      // Find the detail record for each selector
      const representative: ActiveElementInfo = walkDetails.find(
        (d) => d.selector === trapSelectors[0],
      ) ?? {
        selector: trapSelectors[0] ?? '(unknown)',
        tag: 'UNKNOWN',
        name: '',
        html: `<element>`,
        htmlTruncated: false,
      };

      // ------------------------------------------------------------------
      // 4. Escape path attempts
      // ------------------------------------------------------------------

      const escapeAttempts = {
        escape: false,
        shiftTab: false,
        closeAffordance: false,
      };

      // Helper: focus a trap element and try a key or action; return whether
      // focus moved outside the trap set.
      async function tryKey(key: string): Promise<boolean> {
        await page.evaluate(
          ({ sel }: { sel: string }) => {
            const el = document.querySelector(sel);
            if (el instanceof HTMLElement) el.focus();
          },
          { sel: representative.selector },
        );
        await page.keyboard.press(key);
        await page.waitForTimeout(KEYBOARD_TRAP_ESCAPE_SETTLE_MS);
        const afterSel: string = await page.evaluate(() => {
          const active = document.activeElement;
          if (
            !active ||
            active === document.body ||
            active === document.documentElement
          ) {
            return '(body)';
          }
          function getSelector(element: Element): string {
            const parts: string[] = [];
            let current: Element | null = element;
            while (current && current !== document.documentElement) {
              const tag = current.tagName.toLowerCase();
              const id = current.id ? `#${CSS.escape(current.id)}` : '';
              if (id) {
                parts.unshift(`${tag}${id}`);
                break;
              }
              const p: Element | null = current.parentElement;
              if (p) {
                const siblings = [...p.children].filter(
                  (c) => c.tagName === current!.tagName,
                );
                const idx = siblings.indexOf(current) + 1;
                parts.unshift(
                  siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag,
                );
              } else {
                parts.unshift(tag);
              }
              current = p;
            }
            return parts.join(' > ');
          }
          return getSelector(active);
        });
        return afterSel === '(body)' || !tailSet.has(afterSel);
      }

      let attemptCount = 0;

      // Attempt 1: Escape key
      if (attemptCount < KEYBOARD_TRAP_MAX_ESCAPE_ATTEMPTS) {
        escapeAttempts.escape = await tryKey('Escape');
        attemptCount++;
      }

      // Attempt 2: Shift+Tab
      if (attemptCount < KEYBOARD_TRAP_MAX_ESCAPE_ATTEMPTS) {
        escapeAttempts.shiftTab = await tryKey('Shift+Tab');
        attemptCount++;
      }

      // Attempt 3: Visible close affordance
      if (attemptCount < KEYBOARD_TRAP_MAX_ESCAPE_ATTEMPTS) {
        // Focus a trap element
        await page.evaluate(
          ({ sel }: { sel: string }) => {
            const el = document.querySelector(sel);
            if (el instanceof HTMLElement) el.focus();
          },
          { sel: representative.selector },
        );

        const clicked: boolean = await page.evaluate(
          ({ selectors }: { selectors: string[] }) => {
            const els = selectors
              .map((s) => document.querySelector(s))
              .filter((el): el is Element => el !== null);
            if (els.length === 0) return false;

            let container: Element | null = els[0] ?? null;
            while (container && container !== document.body) {
              const closeBtn = container.querySelector(
                'button, [role="button"]',
              );
              if (closeBtn) {
                const label =
                  (closeBtn as HTMLElement).getAttribute('aria-label') ||
                  (closeBtn as HTMLElement).textContent?.trim() ||
                  '';
                if (/close|閉じる|dismiss/i.test(label)) {
                  (closeBtn as HTMLElement).click();
                  return true;
                }
              }
              container = container.parentElement;
            }
            return false;
          },
          { selectors: trapSelectors.slice(0, 3) },
        );

        if (clicked) {
          await page.waitForTimeout(KEYBOARD_TRAP_ESCAPE_SETTLE_MS);
          const afterSel: string = await page.evaluate(() => {
            const active = document.activeElement;
            if (
              !active ||
              active === document.body ||
              active === document.documentElement
            ) {
              return '(body)';
            }
            function getSelector(element: Element): string {
              const parts: string[] = [];
              let current: Element | null = element;
              while (current && current !== document.documentElement) {
                const tag = current.tagName.toLowerCase();
                const id = current.id ? `#${CSS.escape(current.id)}` : '';
                if (id) {
                  parts.unshift(`${tag}${id}`);
                  break;
                }
                const p: Element | null = current.parentElement;
                if (p) {
                  const siblings = [...p.children].filter(
                    (c) => c.tagName === current!.tagName,
                  );
                  const idx = siblings.indexOf(current) + 1;
                  parts.unshift(
                    siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag,
                  );
                } else {
                  parts.unshift(tag);
                }
                current = p;
              }
              return parts.join(' > ');
            }
            return getSelector(active);
          });
          escapeAttempts.closeAffordance =
            afterSel === '(body)' || !tailSet.has(afterSel);
        }
        attemptCount++;
      }

      // ------------------------------------------------------------------
      // 5. Check if container is aria-modal dialog
      // ------------------------------------------------------------------
      const isAriaModal: boolean = await page.evaluate(
        ({ selectors }: { selectors: string[] }) => {
          for (const sel of selectors) {
            let el: Element | null = document.querySelector(sel);
            while (el && el !== document.body) {
              if (
                el.getAttribute('role') === 'dialog' &&
                el.getAttribute('aria-modal') === 'true'
              ) {
                return true;
              }
              el = el.parentElement;
            }
          }
          return false;
        },
        { selectors: trapSelectors.slice(0, 3) },
      );

      // ------------------------------------------------------------------
      // 6. Classify
      // ------------------------------------------------------------------
      const anyEscapeWorks =
        escapeAttempts.escape ||
        escapeAttempts.shiftTab ||
        escapeAttempts.closeAffordance;

      const evidence: KeyboardTrapEvidence = {
        selector: representative.selector,
        tag: representative.tag,
        name: representative.name,
        html: representative.html,
        htmlTruncated: representative.htmlTruncated,
        escapeAttempts,
        isAriaModal,
      };

      if (!anyEscapeWorks) {
        // True trap: no escape works → violation
        confirmedTraps.push(evidence);
      } else if (isAriaModal && escapeAttempts.escape) {
        // Correct modal pattern: role=dialog + aria-modal=true + Escape → pass
        // Don't push to either bucket
      } else {
        // Escape exists but non-standard → needs review
        needsReview.push(evidence);
      }
    }

    // ------------------------------------------------------------------
    // 7. Assemble result
    // ------------------------------------------------------------------
    const details: KeyboardTrapCheckDetails = {
      totalFocusableElements: count,
      trapCandidates: isTrapCandidate ? 1 : 0,
      confirmedTraps,
      needsReview,
      screenshotPath: '',
    };

    const buckets = normalizeKeyboardTrapCheck(details);
    const result = buildAuditResult({
      source: 'keyboard-trap-check',
      url: page.url(),
      details,
      buckets,
    });

    const resolvedPath = saveAuditResult(result, {
      ...location,
      defaultFile: DEFAULT_KEYBOARD_TRAP_RESULT_FILE,
    });

    if (screenshot) {
      const screenshotPathOut = await takeAuditScreenshot(page, {
        path: resolveScreenshotPath(
          resolvedPath,
          DEFAULT_KEYBOARD_TRAP_SCREENSHOT_FILE,
        ),
      });
      details.screenshotPath = screenshotPathOut;
    }

    logAuditHeader('Keyboard Trap Check', 'WCAG 2.1.2', page.url());
    logOutputPaths(
      resolvedPath,
      screenshot
        ? resolveScreenshotPath(resolvedPath, DEFAULT_KEYBOARD_TRAP_SCREENSHOT_FILE)
        : undefined,
    );

    return result;
  } finally {
    await context.close();
  }
}
