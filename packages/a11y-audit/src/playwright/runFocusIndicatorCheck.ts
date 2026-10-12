/**
 * Focus Indicator Visibility Check
 *
 * WCAG 2.4.7 (Focus Visible) / 2.4.11 (Focus Not Obscured (Minimum)) /
 * 2.4.12 (Focus Not Obscured (Enhanced)) / 3.2.1 (On Focus)
 *
 * Unlike the other checks, this one owns its `BrowserContext`: it tabs through
 * every focusable element and, when focus triggers a navigation (3.2.1), it
 * restarts in a fresh context with the offending element skipped. For that
 * reason it accepts a `browser` (not a `page`) and navigates internally.
 *
 * The context this function creates is closed before it returns.
 */

import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
} from '@playwright/test';
import type {
  FocusRecord,
  FocusElementRef,
  OnFocusViolation,
  FocusCheckResult,
  FocusCheckDetails,
  FocusObscuredIssue,
  FocusVisualDiff,
  PageRect,
} from '../types.js';
import {
  FOCUSABLE_SELECTOR,
  FOCUS_STYLE_PROPERTIES,
  EXTRA_TAB_ITERATIONS,
  DEFAULT_NAVIGATION_SETTLE_MS,
  DEFAULT_FOCUS_RESULT_FILE,
  DEFAULT_FOCUS_SCREENSHOT_FILE,
  FOCUS_OBSCURED_FULL_RATIO,
  FOCUS_OBSCURED_MIN_OVERLAP_PX,
  FOCUS_OBSCURED_EXCLUDE_SELECTORS,
  FOCUS_VISUAL_DIFF_MARGIN_PX,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import { buildAuditResult, normalizeFocusCheck } from '../utils/axe-format.js';
import { gotoAndSettle } from './gotoAndSettle.js';
import {
  resolveScreenshotPath,
  takeAuditScreenshot,
  requireTargetUrl,
  assertWalkLimits,
  createAuditOutput,
  resolveCreateContext,
  type AuditOutputOptions,
  type ContextSourceOptions,
} from '../utils/test-harness.js';

// =============================================================================
// Browser-injected styles for marking elements
// =============================================================================

// Overlay-based annotation styles (no content DOM modification)
const WARNING_STYLES = `
  #focus-audit-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 99999;
  }
  .focus-audit-box {
    position: absolute;
    border: 3px solid #dc2626;
    box-sizing: border-box;
    pointer-events: none;
  }
  .focus-audit-box.navigation-violation {
    border-color: #7c3aed;
  }
  .focus-audit-box.has-focus-style {
    border-color: #16a34a;
  }
  .focus-audit-label {
    position: absolute;
    top: -22px;
    left: -3px;
    background: #dc2626;
    color: white;
    font-size: 11px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
    font-family: system-ui, sans-serif;
  }
  .focus-audit-box.navigation-violation .focus-audit-label {
    background: #7c3aed;
  }
  .focus-audit-box.has-focus-style .focus-audit-label {
    background: #16a34a;
  }
  .focus-audit-box.focus-obscured {
    border-color: #ea580c;
    border-style: dashed;
  }
  .focus-audit-box.focus-obscured .focus-audit-label {
    background: #ea580c;
  }
`;

// Maximum retry attempts to avoid infinite loops
const MAX_RETRIES = 5;

// Hide our own annotation boxes while capturing, or they would differ every time.
const CAPTURE_STYLE = '#focus-audit-overlay { visibility: hidden !important; }';

type ImageCompare = typeof import('../utils/image-compare.js');

/**
 * Full-page PNG (or one clip of it) without the annotations and without the
 * styles kept from earlier elements, so only the current focus can differ.
 */
async function capturePage(page: Page, clip?: PageRect): Promise<Buffer> {
  const setCaptureMode = (on: boolean) =>
    page.evaluate(
      (on) =>
        (
          window as unknown as { setFocusCaptureMode: (on: boolean) => void }
        ).setFocusCaptureMode(on),
      on,
    );
  await setCaptureMode(true);
  try {
    return await page.screenshot({
      fullPage: true,
      clip,
      scale: 'css',
      animations: 'disabled',
      style: CAPTURE_STYLE,
    });
  } finally {
    await setCaptureMode(false);
  }
}

/** Compare the area around `rect` with the same area of `baseline`. */
async function measureVisualDiff(
  page: Page,
  imageCompare: ImageCompare,
  baseline: Buffer,
  rect: PageRect,
): Promise<FocusVisualDiff | null> {
  // PNG header: width and height are big-endian uint32 at bytes 16 and 20.
  const pageWidth = baseline.readUInt32BE(16);
  const pageHeight = baseline.readUInt32BE(20);
  const x0 = Math.max(0, Math.floor(rect.x - FOCUS_VISUAL_DIFF_MARGIN_PX));
  const y0 = Math.max(0, Math.floor(rect.y - FOCUS_VISUAL_DIFF_MARGIN_PX));
  const x1 = Math.min(
    pageWidth,
    Math.ceil(rect.x + rect.width + FOCUS_VISUAL_DIFF_MARGIN_PX),
  );
  const y1 = Math.min(
    pageHeight,
    Math.ceil(rect.y + rect.height + FOCUS_VISUAL_DIFF_MARGIN_PX),
  );
  if (x1 <= x0 || y1 <= y0) return null;
  const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  try {
    return imageCompare.compareRegionToBaseline(
      baseline,
      await capturePage(page, clip),
      clip,
    );
  } catch {
    return null;
  }
}

function toElementRef(data: FocusRecord): FocusElementRef {
  return {
    tag: data.tag,
    role: data.role,
    name: data.name,
    selector:
      data.selector || `${data.tag.toLowerCase()}:nth-of-type(${data.id + 1})`,
    html: data.html,
    htmlTruncated: data.htmlTruncated,
    frame: data.frame,
    shadowHosts: data.shadowHosts,
    ...(data.echo !== undefined && { echo: data.echo }),
  };
}

export interface RunFocusIndicatorCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Target URL. Falls back to the `TEST_PAGE` env var; required. */
  targetUrl?: string;
  /** Whether to capture a screenshot (default: false). */
  screenshot?: boolean;
  /**
   * Options forwarded to `browser.newContext()` (locale, viewport, storageState, ...).
   * Ignored when `createContext` is used.
   */
  contextOptions?: BrowserContextOptions;
  /**
   * Milliseconds to wait after each Tab press for a focus-triggered navigation
   * to surface (default: 50). A navigation that fires after this window may be
   * missed or attributed to a neighboring element — raise this value when
   * auditing pages with debounced or otherwise delayed focus handlers.
   */
  navigationSettleMs?: number;
  /**
   * Stop the Tab walk once this many milliseconds have passed since the check
   * started, counting every 3.2.1 restart (default: no limit). The result then
   * carries `details.aborted` with `reason: 'timeout'`.
   */
  timeBudgetMs?: number;
  /**
   * Stop after this many Tab presses in total, counting every 3.2.1 restart
   * (default: no limit). The result then carries `details.aborted` with
   * `reason: 'tab-limit'`.
   */
  maxTabPresses?: number;
  /**
   * Name of an attribute on the caller's elements (e.g. `data-test-id`). Every
   * record that points at an element gets an `echo` field holding that
   * attribute's value (`null` when the element lacks it), so results can be
   * matched to the caller's own elements. The check opens fresh contexts, so
   * the attribute must already be on the element when the page loads (page
   * markup, or an init script added to the context `createContext` returns).
   */
  echoAttribute?: string;
  /**
   * Compare screenshots of the area around each element before and after it
   * gets focus, and record the result as `visualDiff` (default: false). Catches
   * cues that computed styles cannot show (`::before` / `::after`, a parent's
   * `:focus-within`, another element). It takes screenshots on every Tab press,
   * so the walk is slower, and that time counts toward `timeBudgetMs`.
   *
   * Needs the optional `pixelmatch` and `pngjs`; without them a warning is
   * printed and every `visualDiff` is `null`. Limits are described on
   * `FocusVisualDiff`: fixed / sticky content and animations can produce a
   * difference that is not a focus indicator.
   */
  screenshotDiff?: boolean;
}

// HTML attribute names exclude whitespace, controls, and `" ' > / =`.
const INVALID_ATTRIBUTE_NAME = /[\s\p{Cc}"'>/=]|^$/u;

/**
 * Run the focus indicator check, write the result JSON (and optionally a
 * screenshot), and return the parsed result.
 */
export async function runFocusIndicatorCheck(
  options: RunFocusIndicatorCheckOptions,
): Promise<FocusCheckResult> {
  const {
    browser,
    createContext,
    targetUrl: targetUrlOption,
    screenshot = false,
    contextOptions,
    navigationSettleMs = DEFAULT_NAVIGATION_SETTLE_MS,
    timeBudgetMs,
    maxTabPresses,
    echoAttribute,
    screenshotDiff = false,
    ...location
  } = options;

  assertWalkLimits({ timeBudgetMs, maxTabPresses });
  if (
    echoAttribute !== undefined &&
    INVALID_ATTRIBUTE_NAME.test(echoAttribute)
  ) {
    throw new Error(
      `echoAttribute must be a valid HTML attribute name (no whitespace or any of " ' > / =), got ${JSON.stringify(echoAttribute)}`,
    );
  }

  const newContext = resolveCreateContext(
    { browser, createContext },
    contextOptions,
  );
  const targetUrl = requireTargetUrl(targetUrlOption);

  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_FOCUS_RESULT_FILE,
  });
  const resolvedScreenshotPath = resolveScreenshotPath(
    out.resultPath,
    DEFAULT_FOCUS_SCREENSHOT_FILE,
  );

  // pixelmatch / pngjs are optional deps, so load the comparison lazily and
  // degrade to `visualDiff: null` instead of failing when they are absent.
  let imageCompare: ImageCompare | null = null;
  if (screenshotDiff) {
    try {
      imageCompare = await import('../utils/image-compare.js');
    } catch {
      out.warn(
        '\n⚠️  screenshotDiff skipped: install the optional dependencies ' +
          '`pixelmatch` and `pngjs` to compare screenshots (`npm install pixelmatch pngjs`).',
      );
    }
  }

  const onFocusViolations: OnFocusViolation[] = [];
  const focusObscuredIssues: FocusObscuredIssue[] = [];
  const skipSelectors: string[] = [];
  let finalFocusHistory: FocusRecord[] = [];
  let retryCount = 0;
  // Whether the latest navigation's element could not be identified.
  let unidentifiedNavigation = false;
  let finalPage: Page | null = null;
  // The context for the current attempt. Held outside the loop so it is always
  // closed in `finally`, including if an attempt throws mid-way.
  let context: BrowserContext | null = null;

  const startedAt = Date.now();
  let tabPresses = 0;
  let aborted: FocusCheckDetails['aborted'] = null;
  const limitReached = (): 'timeout' | 'tab-limit' | null => {
    if (timeBudgetMs !== undefined && Date.now() - startedAt > timeBudgetMs) {
      return 'timeout';
    }
    if (maxTabPresses !== undefined && tabPresses >= maxTabPresses) {
      return 'tab-limit';
    }
    return null;
  };
  const abortWalk = (
    reason: 'timeout' | 'tab-limit',
    url: string,
    recordedCount: number,
    focusableCount: number,
  ): NonNullable<FocusCheckDetails['aborted']> => {
    out.warn(
      `\n⚠️  Stopped by ${reason === 'timeout' ? 'timeBudgetMs' : 'maxTabPresses'}: ` +
        `${recordedCount} of ${focusableCount} focusable elements were tested.`,
    );
    return { reason, url, recordedCount, focusableCount };
  };

  try {
    // Retry loop - restart test when navigation violation is detected
    while (retryCount < MAX_RETRIES) {
      // Create a fresh context for each attempt to reset init scripts
      context = await newContext();
      const page = await context.newPage();

      // Track main-frame navigations (WCAG 3.2.1). Catches URL changes that
      // commit and revert within a single settle window (which the before/after
      // URL diff alone would miss). A navigation landing between iterations is
      // absorbed into the next urlBeforeTab and is NOT caught by this listener —
      // raise navigationSettleMs for pages with slow focus-triggered handlers.
      // Reset after the initial goto; checked alongside the URL diff.
      let lateNavigationUrl: string | null = null;
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
          lateNavigationUrl = frame.url();
        }
      });

      const focusHistory: FocusRecord[] = [];
      // Elements before the violating one are focused again on every attempt,
      // so keep only the last attempt's records, like focusHistory.
      focusObscuredIssues.length = 0;
      // One entry per focusHistory record: the element and the document that
      // reported it, used to pick the 3.2.1 culprit.
      const focusReports: { ref: FocusElementRef; documentToken: string }[] =
        [];
      let navigationDetected = false;

      // Expose function to receive focus reports from browser context
      await page.exposeFunction(
        'reportFocus',
        ({
          documentToken,
          ...data
        }: FocusRecord & { documentToken: string }) => {
          // Filled in after the screenshots; stays null when none could be made.
          if (screenshotDiff) data.visualDiff = null;
          focusHistory.push(data);
          focusReports.push({ ref: toElementRef(data), documentToken });
        },
      );

      // Expose function to receive focus obscured reports (WCAG 2.4.11 / 2.4.12)
      await page.exposeFunction(
        'reportFocusObscured',
        (data: FocusObscuredIssue) => {
          focusObscuredIssues.push(data);
        },
      );

      // Inject focus tracking script with current skip list
      await page.addInitScript(createFocusTrackerScript, {
        focusableSelector: FOCUSABLE_SELECTOR,
        styleProperties: [...FOCUS_STYLE_PROPERTIES],
        warningStyles: WARNING_STYLES,
        skipSelectors: [...skipSelectors],
        htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
        echoAttribute: echoAttribute ?? null,
        obscuredConfig: {
          fullRatio: FOCUS_OBSCURED_FULL_RATIO,
          minOverlapPx: FOCUS_OBSCURED_MIN_OVERLAP_PX,
          excludeSelectors: [...FOCUS_OBSCURED_EXCLUDE_SELECTORS],
        },
      });

      // Navigate to target page
      await gotoAndSettle(page, targetUrl);

      // Initialize the focus tracker in every frame (it records each frame's
      // elements' styles before focus) and add up the element counts. A frame
      // that is mid-navigation counts as zero.
      const mainFrame = page.mainFrame();
      const counts = await Promise.all(
        page.frames().map((frame) => {
          const init = frame.evaluate(
            () =>
              (
                window as unknown as { initFocusTracker?: () => number }
              ).initFocusTracker?.() ?? 0,
          );
          return frame === mainFrame ? init : init.catch(() => 0);
        }),
      );
      const count = counts.reduce((sum, n) => sum + n, 0);

      // Tokens of the documents now in the page's frames, including iframes
      // loaded after the walk started. Read before each Tab so that, after a
      // navigation, only reports and answers from those documents can name
      // the culprit.
      const readDocumentTokens = async (): Promise<Set<string>> => {
        const tokens = await Promise.all(
          page
            .frames()
            .map((frame) =>
              frame
                .evaluate(
                  () =>
                    (window as unknown as { focusAuditDocumentToken?: string })
                      .focusAuditDocumentToken ?? null,
                )
                .catch(() => null),
            ),
        );
        return new Set(tokens.filter((token) => token !== null));
      };

      // Mark elements that caused navigation violations (from previous attempts)
      if (skipSelectors.length > 0) {
        await page.evaluate((selectors) => {
          selectors.forEach((sel) => {
            const el = document.querySelector(sel);
            if (el) {
              el.setAttribute('data-focus-navigation-violation', '');
              (el as HTMLElement).tabIndex = -1; // Remove from tab order

              // Add annotation box to overlay (uses function from initFocusTracker)
              const overlay = document.getElementById('focus-audit-overlay');
              if (overlay) {
                const rect = el.getBoundingClientRect();
                const box = document.createElement('div');
                box.className = 'focus-audit-box navigation-violation';
                box.style.left = `${rect.left + window.scrollX}px`;
                box.style.top = `${rect.top + window.scrollY}px`;
                box.style.width = `${rect.width}px`;
                box.style.height = `${rect.height}px`;

                const labelEl = document.createElement('span');
                labelEl.className = 'focus-audit-label';
                labelEl.textContent = '⚠ 3.2.1 Navigation on Focus';
                box.appendChild(labelEl);

                overlay.appendChild(box);
              }
            }
          });
        }, skipSelectors);
      }

      // Reset the late-navigation flag so the initial goto and skip-element
      // setup above don't produce false positives in the Tab loop.
      lateNavigationUrl = null;

      // Baseline for screenshotDiff: the whole page before anything is focused.
      let baseline: Buffer | null = null;
      if (imageCompare) {
        try {
          baseline = await capturePage(page);
        } catch {
          baseline = null;
        }
      }

      // Tab through all elements with navigation detection
      for (let i = 0; i < count + EXTRA_TAB_ITERATIONS; i++) {
        const reason = limitReached();
        if (reason) {
          aborted = abortWalk(reason, page.url(), focusHistory.length, count);
          break;
        }

        const urlBeforeTab = page.url();
        const recordedBeforeTab = focusHistory.length;
        const documentTokens = await readDocumentTokens();

        tabPresses++;
        await page.keyboard.press('Tab');

        // Get currently focused element IMMEDIATELY after Tab. An answer from
        // a document reached by navigation (e.g. its autofocus) is ignored.
        const fromWalkedDocument = (
          answer: { ref: FocusElementRef; documentToken: string } | null,
        ) =>
          answer && documentTokens.has(answer.documentToken)
            ? answer.ref
            : null;
        let currentFocusedElement: FocusElementRef | null = null;
        try {
          // While focus is inside an iframe the main frame's activeElement is
          // the iframe element itself, so prefer what a child frame reports.
          // Only the main frame's evaluate may throw (navigation in flight).
          const describeActive = () => {
            const w = window as unknown as {
              describeActiveElement?: () => FocusElementRef | null;
              focusAuditDocumentToken: string;
            };
            const ref = w.describeActiveElement?.() ?? null;
            return ref && { ref, documentToken: w.focusAuditDocumentToken };
          };
          const childRefs = await Promise.all(
            page
              .frames()
              .filter((frame) => frame !== page.mainFrame())
              .map((frame) =>
                frame
                  .evaluate(describeActive)
                  .then(fromWalkedDocument)
                  .catch(() => null),
              ),
          );
          currentFocusedElement =
            childRefs.find((ref) => ref !== null) ??
            fromWalkedDocument(await page.mainFrame().evaluate(describeActive));
        } catch {
          // Page might have navigated; fall back to the focus report below.
        }

        // Small wait to allow any navigation to start
        await page.waitForTimeout(navigationSettleMs);

        // Check if navigation occurred (either within the settle window or late)
        const urlAfterTab = page.url();
        const lateNav =
          lateNavigationUrl !== null && lateNavigationUrl !== urlBeforeTab;
        if (urlAfterTab !== urlBeforeTab || lateNav) {
          // 3.2.1 violation detected!
          navigationDetected = true;

          // The focus report can be lost in the navigation, and the page it
          // leads to can report its own focus (autofocus). Use only reports
          // that arrived after this Tab from the documents being walked;
          // otherwise the culprit is unknown and the attempt restarts without
          // recording or skipping anything. Limitation: a page that delays its
          // own reports (e.g. by wrapping reportFocus) can pass off an earlier
          // element's report as this Tab's.
          const culprit =
            currentFocusedElement ??
            focusReports
              .slice(recordedBeforeTab)
              .filter((report) => documentTokens.has(report.documentToken))
              .at(-1)?.ref ??
            null;
          unidentifiedNavigation = !culprit;
          if (!culprit) {
            out.warn(
              `\n⚠️  Focus caused navigation from ${urlBeforeTab}, but the element could not be identified. Restarting test...`,
            );
          } else if (!skipSelectors.includes(culprit.selector)) {
            const toUrl =
              urlAfterTab !== urlBeforeTab
                ? urlAfterTab
                : (lateNavigationUrl ?? urlAfterTab);
            onFocusViolations.push({
              element: culprit,
              fromUrl: urlBeforeTab,
              toUrl,
              changeType: 'navigation',
            });
            skipSelectors.push(culprit.selector);

            out.warn(
              `\n⚠️  WCAG 3.2.1 Violation: Focus on element caused navigation!`,
            );
            out.warn(`    Element: <${culprit.tag}> "${culprit.name}"`);
            out.warn(`    Selector: ${culprit.selector}`);
            out.warn(`    From: ${urlBeforeTab}`);
            out.warn(`    To: ${toUrl}`);
            out.warn(`    Restarting test with this element skipped...`);
          }
          lateNavigationUrl = null;
          break;
        }

        const focusedRecord = focusHistory[focusHistory.length - 1];
        if (
          imageCompare &&
          baseline &&
          focusedRecord &&
          focusHistory.length > recordedBeforeTab &&
          // An iframe element's rect is relative to its own document, so it
          // cannot be cut out of the main-page baseline; leave visualDiff null.
          focusedRecord.frame === null
        ) {
          focusedRecord.visualDiff = await measureVisualDiff(
            page,
            imageCompare,
            baseline,
            focusedRecord.rect,
          );
        }
      }

      if (!navigationDetected) {
        // Test completed successfully without navigation
        finalFocusHistory = focusHistory;
        finalPage = page;
        break;
      }

      retryCount++;
      if (retryCount >= MAX_RETRIES) {
        out.warn(
          `\n⚠️  Max retries (${MAX_RETRIES}) reached. Some elements may not have been tested.`,
        );
        // Keep this page with its annotations for the screenshot
        finalFocusHistory = focusHistory;
        finalPage = page;
        break;
      }

      const reason = limitReached();
      if (reason) {
        aborted = abortWalk(reason, page.url(), focusHistory.length, count);
        finalFocusHistory = focusHistory;
        finalPage = page;
        break;
      }

      // Close context before retry (only if we're going to retry)
      await context.close();
      context = null;
    }

    // Ensure finalPage is set (should always be set by this point)
    if (!finalPage) {
      throw new Error('No page available for screenshot');
    }

    // Report results
    const elementsWithoutFocusStyle = finalFocusHistory.filter(
      (f) => !f.hasFocusStyle,
    );

    if (elementsWithoutFocusStyle.length > 0) {
      out.warn(
        'Elements without visible focus indicator:',
        elementsWithoutFocusStyle,
      );
    }

    // Build result
    const details: FocusCheckDetails = {
      totalFocusableElements: finalFocusHistory.length,
      elementsWithFocusStyle:
        finalFocusHistory.length - elementsWithoutFocusStyle.length,
      elementsWithoutFocusStyle: elementsWithoutFocusStyle.length,
      issues: elementsWithoutFocusStyle.map((el) => ({
        tag: el.tag,
        role: el.role,
        name: el.name,
        selector: el.selector,
        html: el.html,
        htmlTruncated: el.htmlTruncated,
        frame: el.frame,
        shadowHosts: el.shadowHosts,
        ...(el.echo !== undefined && { echo: el.echo }),
        ...(el.visualDiff !== undefined && { visualDiff: el.visualDiff }),
      })),
      onFocusViolations,
      focusObscuredIssues,
      elementsWithObscuredFocus: focusObscuredIssues.length,
      allElements: finalFocusHistory,
      // Retries exhausted: elements after the last navigation were not tested.
      interrupted: retryCount >= MAX_RETRIES,
      unidentifiedNavigation,
      aborted,
      screenshotPath: screenshot ? resolvedScreenshotPath : '',
    };

    const result: FocusCheckResult = buildAuditResult({
      source: 'focus-indicator-check',
      url: finalPage.url(),
      details,
      buckets: normalizeFocusCheck(details),
    });

    // Output results
    out.header(
      'Focus Indicator Check Results',
      'WCAG 2.4.7 / 2.4.11 / 2.4.12 / 3.2.1',
      result.url,
    );

    out.log(`Total focusable elements: ${details.totalFocusableElements}`);
    out.log(`Elements with focus style: ${details.elementsWithFocusStyle}`);
    out.log(
      `Elements WITHOUT focus style: ${details.elementsWithoutFocusStyle}`,
    );
    out.log(
      `Elements with OBSCURED focus: ${details.elementsWithObscuredFocus}`,
    );

    if (retryCount > 0) {
      out.log(
        `\nTest restarted ${retryCount} time(s) due to navigation violations`,
      );
    }

    // WCAG 2.4.7 summary
    if (elementsWithoutFocusStyle.length > 0) {
      out.log('\n--- WCAG 2.4.7: Elements Missing Focus Indicator ---');
      elementsWithoutFocusStyle.forEach((el, i) => {
        out.log(
          `  ${i + 1}. <${el.tag}> "${el.name}" (role: ${el.role || 'none'})`,
        );
      });
    }

    // WCAG 2.4.11 / 2.4.12 summary
    if (focusObscuredIssues.length > 0) {
      out.log(
        '\n--- WCAG 2.4.11 / 2.4.12: Focus Obscured by Fixed/Sticky Elements ---',
      );
      focusObscuredIssues.forEach((issue, i) => {
        out.log(`  ${i + 1}. <${issue.element.tag}> "${issue.element.name}"`);
        out.log(`     Selector: ${issue.element.selector}`);
        out.log(
          `     Obscured ratio: ${(issue.obscuredRatio * 100).toFixed(1)}%` +
            (issue.fullyObscured
              ? ' (fully obscured: fails 2.4.11 and 2.4.12)'
              : ' (partly obscured: fails 2.4.12 only)'),
        );
        issue.overlaps.forEach((overlap) => {
          out.log(
            `     Obscured by: <${overlap.obscuredBy.tag}> "${overlap.obscuredBy.name}"`,
          );
        });
      });
    }

    // WCAG 3.2.1 summary
    if (onFocusViolations.length > 0) {
      out.log('\n--- WCAG 3.2.1: Focus Triggered Context Change ---');
      onFocusViolations.forEach((v, i) => {
        out.log(`  ${i + 1}. <${v.element.tag}> "${v.element.name}"`);
        out.log(`     Selector: ${v.element.selector}`);
        out.log(`     Navigated to: ${v.toUrl}`);
      });
    }

    let writtenScreenshotPath: string | undefined;
    if (screenshot) {
      writtenScreenshotPath = await takeAuditScreenshot(finalPage, {
        path: resolvedScreenshotPath,
      });
    }
    out.save(result);
    out.outputPaths(writtenScreenshotPath);

    return result;
  } finally {
    // Close the context for the final/in-flight attempt. Contexts from earlier
    // retries are already closed inside the loop; this also covers the case
    // where an attempt throws mid-way.
    if (context) {
      await context.close();
    }
  }
}

// =============================================================================
// Browser-injected script factory
// =============================================================================

function createFocusTrackerScript(args: {
  focusableSelector: string;
  styleProperties: string[];
  warningStyles: string;
  skipSelectors: string[];
  htmlSnippetMaxLength: number;
  echoAttribute: string | null;
  obscuredConfig: {
    fullRatio: number;
    minOverlapPx: number;
    excludeSelectors: string[];
  };
}): void {
  const {
    focusableSelector,
    styleProperties,
    warningStyles,
    skipSelectors,
    htmlSnippetMaxLength,
    echoAttribute,
    obscuredConfig,
  } = args;

  /** `{ echo }` for the caller's attribute, or nothing when not requested. */
  const getEcho = (el: Element): { echo?: string | null } =>
    echoAttribute === null ? {} : { echo: el.getAttribute(echoAttribute) };

  /**
   * Where the element lives: this window's frame (null for the main frame) and
   * the shadow hosts above it, outermost first. `window.frameElement` is null
   * when the parent is cross-origin, so `frame.selector` is null then.
   */
  const getLocation = (
    el: Element,
  ): {
    frame: { url: string; selector: string | null } | null;
    shadowHosts: string[];
  } => {
    const shadowHosts: string[] = [];
    let root = el.getRootNode();
    while (root instanceof ShadowRoot) {
      shadowHosts.unshift(getSelector(root.host));
      root = root.host.getRootNode();
    }
    let frame: { url: string; selector: string | null } | null = null;
    if (window !== window.top) {
      let frameElement: Element | null = null;
      try {
        frameElement = window.frameElement;
      } catch {
        frameElement = null;
      }
      frame = {
        url: window.location.href,
        selector: frameElement ? getSelector(frameElement) : null,
      };
    }
    return { frame, shadowHosts };
  };

  const getHtmlSnippet = (
    el: Element,
  ): { html: string; htmlTruncated: boolean } => {
    let html = '';
    try {
      html = el.outerHTML || '';
    } catch {
      html = '';
    }
    if (!html) {
      return { html: `<${el.tagName.toLowerCase()}>`, htmlTruncated: false };
    }
    if (html.length > htmlSnippetMaxLength) {
      return { html: html.slice(0, htmlSnippetMaxLength), htmlTruncated: true };
    }
    return { html, htmlTruncated: false };
  };

  // Add warning styles
  const styleSheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
  warningStyles
    .split('}')
    .filter((r) => r.trim())
    .forEach((rule, i) => {
      try {
        styleSheet.insertRule(rule + '}', i);
      } catch {
        // Ignore invalid rules
      }
    });

  // Styles kept on elements after they lose focus (for the final screenshot).
  // Kept apart so screenshotDiff can switch them off while capturing.
  const preservedSheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [
    ...document.adoptedStyleSheets,
    preservedSheet,
  ];
  (
    window as unknown as { setFocusCaptureMode: (on: boolean) => void }
  ).setFocusCaptureMode = (on) => {
    preservedSheet.disabled = on;
  };

  const baseStyles = new Map<Element, Record<string, string>>();
  const elementSelectors = new Map<Element, string>();
  let focusId = 0;

  // Tells this document apart from a page reached by navigation, which runs
  // this script again (randomUUID needs a secure context).
  const documentToken = Math.random().toString(36).slice(2);
  (
    window as unknown as { focusAuditDocumentToken: string }
  ).focusAuditDocumentToken = documentToken;

  // Tab presses seen on this page load. `tabPending` is true between a Tab
  // keydown and its keyup, so only a focusin caused by that press gets a tabStep.
  let tabPresses = 0;
  let tabPending = false;
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') {
        tabPresses++;
        tabPending = true;
      }
    },
    true,
  );
  document.addEventListener(
    'keyup',
    (e) => {
      if (e.key === 'Tab') tabPending = false;
    },
    true,
  );

  /**
   * Generate a CSS selector for an element, relative to the document or the
   * shadow root that contains it
   */
  const getSelector = (el: Element): string => {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;
    // A shadow root's top-level children have no parent element
    const container =
      parent ?? (el.parentNode instanceof ShadowRoot ? el.parentNode : null);
    if (!container) return tag;
    const siblings = [...container.children].filter(
      (c) => c.tagName === el.tagName,
    );
    const own =
      siblings.length === 1
        ? tag
        : `${tag}:nth-of-type(${siblings.indexOf(el) + 1})`;
    return parent ? `${getSelector(parent)} > ${own}` : own;
  };

  /**
   * Capture computed style for focus-related properties
   */
  const captureStyle = (el: Element): Record<string, string> => {
    const style = window.getComputedStyle(el);
    const result: Record<string, string> = {};
    for (const prop of styleProperties) {
      result[prop] = (style as unknown as Record<string, string>)[prop] ?? '';
    }
    return result;
  };

  /**
   * Convert camelCase to kebab-case
   */
  const toKebab = (str: string): string =>
    str.replace(/([A-Z])/g, '-$1').toLowerCase();

  /**
   * Check if element is visible
   */
  const isVisible = (el: Element): boolean => {
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      !el.closest('[inert]')
    );
  };

  /**
   * Check if style changes represent a visible focus indicator
   * outline-offset alone is not enough - need actual outline to be visible
   */
  const isVisibleFocusChange = (
    diff: Record<string, string>,
    focusedStyle: Record<string, string>,
  ): boolean => {
    const diffKeys = Object.keys(diff);
    if (diffKeys.length === 0) return false;

    // Filter out changes that don't result in visible indicators
    const visibleChanges = diffKeys.filter((key) => {
      // outline-offset alone is not visible without outline
      if (key === 'outlineOffset') {
        const outlineStyle = focusedStyle['outlineStyle'];
        const outlineWidth = focusedStyle['outlineWidth'];
        if (outlineStyle === 'none' || outlineWidth === '0px') {
          return false;
        }
      }

      // outline-color change alone is not visible without outline
      if (key === 'outlineColor') {
        const outlineStyle = focusedStyle['outlineStyle'];
        const outlineWidth = focusedStyle['outlineWidth'];
        if (outlineStyle === 'none' || outlineWidth === '0px') {
          return false;
        }
      }

      // Check outline-style/outline-width actually creates visible outline
      if (key === 'outlineStyle' || key === 'outlineWidth') {
        const outlineStyle = focusedStyle['outlineStyle'];
        const outlineWidth = focusedStyle['outlineWidth'];
        if (outlineStyle === 'none' || outlineWidth === '0px') {
          return false;
        }
      }

      // box-shadow: none is not visible
      if (key === 'boxShadow' && diff[key] === 'none') {
        return false;
      }

      return true;
    });

    return visibleChanges.length > 0;
  };

  /**
   * Check if element should be skipped (caused navigation in previous attempt)
   */
  const shouldSkip = (el: Element): boolean => {
    // Skipping is applied to the main document only (see the retry loop), so
    // a same-selector element in a frame or shadow root must not be dropped.
    const { frame, shadowHosts } = getLocation(el);
    if (frame !== null || shadowHosts.length > 0) return false;
    return skipSelectors.includes(getSelector(el));
  };

  /**
   * Create overlay container for annotations
   */
  const createOverlay = (): HTMLDivElement => {
    let overlay = document.getElementById(
      'focus-audit-overlay',
    ) as HTMLDivElement;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'focus-audit-overlay';
      document.body.appendChild(overlay);
    }
    return overlay;
  };

  /**
   * Add annotation box to overlay for an element
   */
  const addAnnotationBox = (
    el: Element,
    label: string,
    cssClass: string,
  ): void => {
    const overlay = createOverlay();
    const rect = el.getBoundingClientRect();

    const box = document.createElement('div');
    box.className = `focus-audit-box ${cssClass}`;
    box.style.left = `${rect.left + window.scrollX}px`;
    box.style.top = `${rect.top + window.scrollY}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;

    const labelEl = document.createElement('span');
    labelEl.className = 'focus-audit-label';
    labelEl.textContent = label;
    box.appendChild(labelEl);

    overlay.appendChild(box);
  };

  /**
   * Calculate rectangle intersection
   */
  const getIntersection = (
    rect1: DOMRect,
    rect2: DOMRect,
  ): { left: number; top: number; width: number; height: number } | null => {
    const left = Math.max(rect1.left, rect2.left);
    const top = Math.max(rect1.top, rect2.top);
    const right = Math.min(rect1.right, rect2.right);
    const bottom = Math.min(rect1.bottom, rect2.bottom);

    if (left < right && top < bottom) {
      return {
        left,
        top,
        width: right - left,
        height: bottom - top,
      };
    }
    return null;
  };

  /**
   * Get all fixed/sticky positioned elements that could obscure focus
   */
  const getObscurerCandidates = (): Element[] => {
    const all = document.querySelectorAll('*');
    const candidates: Element[] = [];

    all.forEach((el) => {
      // Skip excluded selectors
      if (obscuredConfig.excludeSelectors.some((sel) => el.matches(sel))) {
        return;
      }

      const style = window.getComputedStyle(el);
      const position = style.position;

      // Only fixed and sticky positioned elements can obscure
      if (position !== 'fixed' && position !== 'sticky') {
        return;
      }

      // Must be visible
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0
      ) {
        return;
      }

      // Must have area
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }

      candidates.push(el);
    });

    return candidates;
  };

  /**
   * Check if an obscurer is actually in front of the focused element
   */
  const isActuallyObscuring = (
    focusedEl: Element,
    obscurer: Element,
    intersection: { left: number; top: number; width: number; height: number },
  ): boolean => {
    // Calculate safe sample offsets (clamped to intersection bounds)
    const marginX = Math.min(2, intersection.width / 4);
    const marginY = Math.min(2, intersection.height / 4);

    // For very small intersections, only use center point
    const useOnlyCenter = intersection.width < 6 || intersection.height < 6;

    // Sample points within the intersection area (clamped to bounds)
    const samplePoints = useOnlyCenter
      ? [
          {
            x: intersection.left + intersection.width / 2,
            y: intersection.top + intersection.height / 2,
          },
        ]
      : [
          {
            x: intersection.left + intersection.width / 2,
            y: intersection.top + intersection.height / 2,
          }, // center
          { x: intersection.left + marginX, y: intersection.top + marginY }, // top-left
          {
            x: intersection.left + intersection.width - marginX,
            y: intersection.top + marginY,
          }, // top-right
          {
            x: intersection.left + marginX,
            y: intersection.top + intersection.height - marginY,
          }, // bottom-left
          {
            x: intersection.left + intersection.width - marginX,
            y: intersection.top + intersection.height - marginY,
          }, // bottom-right
        ];

    let obscuringCount = 0;
    let nullCount = 0;

    for (const point of samplePoints) {
      const topEl = document.elementFromPoint(point.x, point.y);
      if (topEl) {
        if (topEl === obscurer || obscurer.contains(topEl)) {
          obscuringCount++;
        }
      } else {
        nullCount++;
      }
    }

    // For small intersections (center only), require the center to confirm obscuring
    if (useOnlyCenter) {
      if (obscuringCount >= 1) return true;
      if (nullCount === 1) {
        return checkZIndexOrder(focusedEl, obscurer);
      }
      return false;
    }

    // For normal intersections: require at least 2/5 points
    if (obscuringCount >= 2) return true;
    if (nullCount >= 3) {
      return checkZIndexOrder(focusedEl, obscurer);
    }
    return false;
  };

  /**
   * Fallback z-index comparison for elements with pointer-events:none
   */
  const checkZIndexOrder = (focusedEl: Element, obscurer: Element): boolean => {
    const focusedStyle = window.getComputedStyle(focusedEl);
    const obscurerStyle = window.getComputedStyle(obscurer);

    const focusedZ = parseInt(focusedStyle.zIndex, 10) || 0;
    const obscurerZ = parseInt(obscurerStyle.zIndex, 10) || 0;

    if (obscurerZ > focusedZ) return true;

    const focusedPos = focusedStyle.position;
    const obscurerPos = obscurerStyle.position;

    if (
      obscurerPos === 'fixed' &&
      (focusedPos === 'static' || focusedPos === 'relative')
    ) {
      return true;
    }

    return false;
  };

  /**
   * Check if focused element is obscured by fixed/sticky elements
   * (WCAG 2.4.11 when fully, 2.4.12 when partly)
   */
  const checkFocusObscured = (focusedEl: Element): void => {
    const focusedRect = focusedEl.getBoundingClientRect();
    const focusedArea = focusedRect.width * focusedRect.height;

    if (focusedArea === 0) return;

    const obscurers = getObscurerCandidates();
    const overlaps: Array<{
      obscuredBy: {
        tag: string;
        role: string | null;
        name: string;
        selector: string;
        echo?: string | null;
      };
      overlapRect: { left: number; top: number; width: number; height: number };
      overlapArea: number;
    }> = [];

    obscurers.forEach((obscurer) => {
      // Don't check against self or ancestors/descendants
      if (
        obscurer === focusedEl ||
        obscurer.contains(focusedEl) ||
        focusedEl.contains(obscurer)
      ) {
        return;
      }

      const obscurerRect = obscurer.getBoundingClientRect();
      const intersection = getIntersection(focusedRect, obscurerRect);

      if (!intersection) return;

      const overlapArea = intersection.width * intersection.height;

      // Check minimum thresholds
      if (overlapArea < obscuredConfig.minOverlapPx) return;

      // Verify that the obscurer is actually in front using elementFromPoint
      if (!isActuallyObscuring(focusedEl, obscurer, intersection)) {
        return;
      }

      overlaps.push({
        obscuredBy: {
          tag: obscurer.tagName,
          role: obscurer.getAttribute('role'),
          name:
            obscurer.getAttribute('aria-label') ||
            obscurer.textContent?.slice(0, 30) ||
            '',
          selector: getSelector(obscurer),
          ...getEcho(obscurer),
        },
        overlapRect: intersection,
        overlapArea,
      });
    });

    // Obscurers can overlap each other, so measure the area of their union
    // (summing per-obscurer areas would count shared regions twice and could
    // report a partly covered element as fully covered).
    const toSegments = (edges: number[]): Array<[number, number]> => {
      const sorted = [...new Set(edges)].sort((a, b) => a - b);
      return sorted.slice(1).map((end, i) => [sorted[i] ?? end, end]);
    };
    const xSegments = toSegments(
      overlaps.flatMap((o) => [
        o.overlapRect.left,
        o.overlapRect.left + o.overlapRect.width,
      ]),
    );
    const ySegments = toSegments(
      overlaps.flatMap((o) => [
        o.overlapRect.top,
        o.overlapRect.top + o.overlapRect.height,
      ]),
    );
    let coveredArea = 0;
    for (const [x0, x1] of xSegments) {
      for (const [y0, y1] of ySegments) {
        const covered = overlaps.some(
          (o) =>
            o.overlapRect.left <= x0 &&
            x1 <= o.overlapRect.left + o.overlapRect.width &&
            o.overlapRect.top <= y0 &&
            y1 <= o.overlapRect.top + o.overlapRect.height,
        );
        if (covered) {
          coveredArea += (x1 - x0) * (y1 - y0);
        }
      }
    }
    const obscuredRatio = Math.min(coveredArea / focusedArea, 1.0);
    const fullyObscured = obscuredRatio >= obscuredConfig.fullRatio;

    // Any visible overlap is reported (2.4.12); `fullyObscured` marks the
    // subset that also fails 2.4.11.
    if (overlaps.length > 0) {
      // Add visual annotation
      addAnnotationBox(
        focusedEl,
        `⚠ ${fullyObscured ? '2.4.11' : '2.4.12'} Obscured (${(obscuredRatio * 100).toFixed(0)}%)`,
        'focus-obscured',
      );

      // Report to test
      (
        window as unknown as {
          reportFocusObscured: (data: unknown) => void;
        }
      ).reportFocusObscured({
        element: {
          tag: focusedEl.tagName,
          role: focusedEl.getAttribute('role'),
          name:
            focusedEl.getAttribute('aria-label') ||
            focusedEl.textContent?.slice(0, 30) ||
            '',
          selector: getSelector(focusedEl),
          ...getHtmlSnippet(focusedEl),
          ...getEcho(focusedEl),
          ...getLocation(focusedEl),
        },
        elementRect: {
          left: focusedRect.left,
          top: focusedRect.top,
          width: focusedRect.width,
          height: focusedRect.height,
        },
        overlaps,
        obscuredRatio,
        fullyObscured,
      });
    }
  };

  /**
   * Initialize focus tracker - called after page load
   */
  (window as unknown as { initFocusTracker: () => number }).initFocusTracker =
    () => {
      // Create overlay container
      createOverlay();

      // querySelectorAll does not see into shadow roots, so descend into the
      // open ones; their elements need base styles to be compared on focus.
      // Each shadow root also gets its own focusin listener: when focus moves
      // between two elements of one shadow root, both retarget to the host at
      // the document, so the event is not delivered there. (An element focused
      // from outside reaches both listeners; `data-focus-visited` makes the
      // second one a no-op.)
      const queryFocusable = (root: Document | ShadowRoot): Element[] => [
        ...root.querySelectorAll(focusableSelector),
        ...[...root.querySelectorAll('*')].flatMap((host) => {
          if (!host.shadowRoot) return [];
          host.shadowRoot.addEventListener(
            'focusin',
            onFocusIn as EventListener,
          );
          return queryFocusable(host.shadowRoot);
        }),
      ];
      const elements = queryFocusable(document)
        .filter(isVisible)
        .filter((el) => !shouldSkip(el));
      elements.forEach((el) => {
        baseStyles.set(el, captureStyle(el));
        elementSelectors.set(el, getSelector(el));
      });
      return elements.length;
    };

  /**
   * The focused element as seen from the main frame's code, for 3.2.1: the
   * innermost element (through open shadow roots) of this frame, or null when
   * nothing is focused here. A child frame whose focus is elsewhere reports
   * null, as its `activeElement` stays on the last element it had.
   */
  (
    window as unknown as {
      describeActiveElement: () => unknown;
    }
  ).describeActiveElement = () => {
    if (window !== window.top && !document.hasFocus()) return null;
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    if (!el || el === document.body) return null;
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      name: el.getAttribute('aria-label') || el.textContent?.slice(0, 30) || '',
      selector: getSelector(el),
      ...getHtmlSnippet(el),
      ...getEcho(el),
      ...getLocation(el),
    };
  };

  /**
   * Handle focus events
   */
  const onFocusIn = (e: FocusEvent): void => {
    // focusin's target is retargeted to the shadow host; the first entry of
    // the composed path is the element that really received focus.
    const el = e.composedPath()[0] as Element;
    if (el.hasAttribute('data-focus-visited')) return;
    if (el.hasAttribute('data-focus-navigation-violation')) return;

    const pre = baseStyles.get(el);
    const focused = captureStyle(el);
    const diff: Record<string, string> = {};

    if (pre) {
      for (const p of Object.keys(pre)) {
        const focusedValue = focused[p];
        if (pre[p] !== focusedValue && focusedValue !== undefined) {
          diff[p] = focusedValue;
        }
      }
    }

    const id = focusId++;
    const tabStep = tabPending ? tabPresses : null;
    tabPending = false;
    const box = el.getBoundingClientRect();
    el.setAttribute('data-focus-visited', String(id));

    // Check if changes are actually visible (not just outline-offset without outline)
    const hasFocusStyle = isVisibleFocusChange(diff, focused);

    if (hasFocusStyle) {
      // Preserve focus appearance for screenshot
      const cssText = Object.entries(diff)
        .map(([p, v]) => `${toKebab(p)}: ${v}`)
        .join('; ');
      preservedSheet.insertRule(
        `[data-focus-visited="${id}"] { ${cssText} }`,
        preservedSheet.cssRules.length,
      );
      // Add green annotation box for elements with focus style
      addAnnotationBox(el, '✓ Focus Style', 'has-focus-style');
    } else {
      // Mark element as missing focus style (data attribute for tracking)
      el.setAttribute('data-focus-missing', '');
      // Add red annotation box to overlay (no content DOM modification)
      addAnnotationBox(el, '⚠ No Focus Style', '');
    }

    // Report to test
    (window as unknown as { reportFocus: (data: unknown) => void }).reportFocus(
      {
        id,
        tabStep,
        rect: {
          x: box.left + window.scrollX,
          y: box.top + window.scrollY,
          width: box.width,
          height: box.height,
        },
        tag: el.tagName,
        role: el.getAttribute('role'),
        name:
          el.getAttribute('aria-label') || el.textContent?.slice(0, 30) || '',
        hasFocusStyle,
        diff,
        selector: elementSelectors.get(el) || getSelector(el),
        ...getHtmlSnippet(el),
        ...getEcho(el),
        ...getLocation(el),
        documentToken,
      },
    );

    // Check for WCAG 2.4.11 / 2.4.12 - focus obscured by fixed/sticky elements
    checkFocusObscured(el);
  };
  document.addEventListener('focusin', onFocusIn);
}
