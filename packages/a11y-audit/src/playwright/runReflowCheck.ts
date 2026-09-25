/**
 * Reflow Check — WCAG 1.4.10 (Reflow)
 *
 * Sets the viewport to a narrow width (default 320px, equivalent to 400% zoom
 * on a 1280px viewport), then detects horizontal scrolling, overflowing
 * elements, and clipped text.
 *
 * The caller is responsible for navigating the page before calling this
 * function. This function sets the viewport size itself so the measurement is
 * taken at the reflow width regardless of how the page was loaded.
 *
 * Limitations:
 * - Cannot distinguish acceptable horizontal scroll (e.g., data tables)
 * - Does not verify functional reflow for complex widgets
 */

import type { Page } from '@playwright/test';
import type {
  ReflowCheckResult,
  ReflowCheckDetails,
  ReflowIssue,
  ClippedTextElement,
} from '../types.js';
import {
  REFLOW_VIEWPORT,
  REFLOW_OVERFLOW_TOLERANCE,
  REFLOW_CHECK_SELECTOR,
  REFLOW_ALLOWED_OVERFLOW_SELECTORS,
  DEFAULT_REFLOW_RESULT_FILE,
  DEFAULT_REFLOW_SCREENSHOT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import { createLayoutChecker } from '../utils/layout.js';
import { buildAuditResult, normalizeReflowCheck } from '../utils/axe-format.js';
import {
  takeAuditScreenshot,
  resolveScreenshotPath,
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';

export interface RunReflowCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /** Viewport to measure reflow at (default: 320x256). */
  viewport?: { width: number; height: number };
  /** Overflow tolerance in pixels (default: 5). */
  overflowTolerance?: number;
  /** Whether to capture a screenshot next to the result file (default: false). */
  screenshot?: boolean;
}

/**
 * Run the reflow check against the current page, write the result JSON
 * (and optionally a screenshot), and return the parsed result.
 */
export async function runReflowCheck(
  options: RunReflowCheckOptions,
): Promise<ReflowCheckResult> {
  const {
    page,
    viewport = REFLOW_VIEWPORT,
    overflowTolerance = REFLOW_OVERFLOW_TOLERANCE,
    screenshot = false,
    ...location
  } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_REFLOW_RESULT_FILE,
  });

  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  const layoutResult = await page.evaluate(createLayoutChecker, {
    viewportWidth: viewport.width,
    overflowTolerance,
    checkSelector: REFLOW_CHECK_SELECTOR,
    allowedOverflowSelectors: [...REFLOW_ALLOWED_OVERFLOW_SELECTORS],
    htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
  });

  const details: ReflowCheckDetails = {
    viewport: { width: viewport.width, height: viewport.height },
    ...layoutResult,
  };

  const result: ReflowCheckResult = buildAuditResult({
    source: 'reflow-check',
    url: page.url(),
    details,
    buckets: normalizeReflowCheck(details),
  });

  // Output results
  out.header('Reflow Check Results', 'WCAG 1.4.10', result.url);

  out.summary({
    Viewport: `${details.viewport.width}x${details.viewport.height}`,
    'Document scroll width': `${details.documentScrollWidth}px`,
    'Document client width': `${details.documentClientWidth}px`,
    'Horizontal scroll': details.hasHorizontalScroll,
    'Overflowing elements': details.overflowingElements.length,
    'Clipped text elements': details.clippedTextElements.length,
  });

  out.issueList<ReflowIssue>(
    'Overflowing Elements',
    details.overflowingElements,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   rect.right: ${el.rect.right}px (viewport: ${el.viewportWidth}px)`,
    ],
  );

  out.issueList<ClippedTextElement>(
    'Clipped Text Elements',
    details.clippedTextElements,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   scrollWidth: ${el.scrollWidth}px, clientWidth: ${el.clientWidth}px`,
      `   overflow: ${el.overflow}, overflowX: ${el.overflowX}`,
    ],
  );

  out.save(result);

  let screenshotPath: string | undefined;
  if (screenshot) {
    screenshotPath = await takeAuditScreenshot(page, {
      path: resolveScreenshotPath(
        out.resultPath,
        DEFAULT_REFLOW_SCREENSHOT_FILE,
      ),
    });
  }

  out.outputPaths(screenshotPath);

  return result;
}
