/**
 * Zoom 200% Check — WCAG 1.4.4 (Resize Text)
 *
 * Sets a standard viewport (default 1280x720), applies 200% zoom via the CSS
 * `zoom` property, then detects horizontal scrolling and elements whose content
 * becomes clipped (overflow:hidden) under zoom.
 *
 * If a `targetUrl` (or the `TEST_PAGE` env var) is available, this function
 * owns navigation: it sets the base viewport BEFORE navigating (matching the
 * legacy script, so pages that read the viewport at load time behave the same).
 * Otherwise it operates on the already-navigated page (just sets the viewport).
 *
 * Limitations:
 * - CSS zoom is engine-specific; actual browser zoom may behave differently
 * - Does not verify responsive breakpoint behavior
 * - Manual verification needed for complex interactions at zoom
 */

import type { Page } from '@playwright/test';
import type { ZoomCheckResult, ZoomIssue } from '../types.js';
import {
  ZOOM_FACTOR,
  ZOOM_BASE_VIEWPORT,
  ZOOM_CLIP_TOLERANCE,
  REFLOW_CHECK_SELECTOR,
  DEFAULT_ZOOM_RESULT_FILE,
  DEFAULT_ZOOM_SCREENSHOT_FILE,
} from '../constants.js';
import {
  saveAuditResult,
  takeAuditScreenshot,
  resolveScreenshotPath,
  logAuditHeader,
  logSummary,
  logIssueList,
  logOutputPaths,
  type OutputLocationOptions,
} from '../utils/test-harness.js';

interface ZoomCheckArgs {
  checkSelector: string;
  tolerance: number;
}

interface ZoomCheckResponse {
  hasHorizontalScroll: boolean;
  documentScrollWidth: number;
  documentClientWidth: number;
  clippedElements: ZoomIssue[];
}

/** Apply zoom and detect issues in browser context. */
function applyZoomAndCheck(args: ZoomCheckArgs): ZoomCheckResponse {
  const { checkSelector, tolerance } = args;

  // Apply CSS zoom
  (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom =
    '200%';

  // Force reflow
  void document.body.offsetHeight;

  function getUniqueSelector(element: Element, elementIndex: number): string {
    if (element.id) {
      return `#${element.id}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        const childIndex = Array.from(parent.children).indexOf(current) + 1;
        selector += `:nth-child(${childIndex})`;
      }
      path.unshift(selector);
      current = parent;
    }
    return path.length > 0 ? path.join(' > ') : `[data-index="${elementIndex}"]`;
  }

  function isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity) > 0
    );
  }

  function hasHiddenOverflow(style: CSSStyleDeclaration): boolean {
    return (
      style.overflow === 'hidden' ||
      style.overflow === 'clip' ||
      style.overflowX === 'hidden' ||
      style.overflowX === 'clip'
    );
  }

  // Check document-level horizontal scroll
  const scrollEl = document.scrollingElement || document.documentElement;
  const documentScrollWidth = scrollEl.scrollWidth;
  const documentClientWidth = scrollEl.clientWidth;
  const hasHorizontalScroll =
    documentScrollWidth > documentClientWidth + tolerance;

  // Find clipped elements
  const clippedElements: ZoomIssue[] = [];
  const seenElements = new WeakSet<Element>();
  const elements = document.querySelectorAll(checkSelector);

  elements.forEach((element, index) => {
    if (!isVisible(element) || seenElements.has(element)) {
      return;
    }

    const style = window.getComputedStyle(element);

    if (!hasHiddenOverflow(style)) {
      return;
    }

    const scrollWidth = element.scrollWidth;
    const clientWidth = element.clientWidth;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;

    const hasHorizontalClip = scrollWidth > clientWidth + tolerance;
    const hasVerticalClip = scrollHeight > clientHeight + tolerance;

    if ((hasHorizontalClip || hasVerticalClip) && element.textContent?.trim()) {
      seenElements.add(element);
      clippedElements.push({
        selector: getUniqueSelector(element, index),
        tagName: element.tagName.toLowerCase(),
        scrollWidth,
        clientWidth,
        scrollHeight,
        clientHeight,
        issueType: hasHorizontalClip ? 'horizontal-scroll' : 'clipped-content',
      });
    }
  });

  return {
    hasHorizontalScroll,
    documentScrollWidth,
    documentClientWidth,
    clippedElements,
  };
}

export interface RunZoomCheckOptions extends OutputLocationOptions {
  /** Page to run the check on (navigated by this function if `targetUrl`/`TEST_PAGE` is set). */
  page: Page;
  /**
   * Target URL. If provided (or `TEST_PAGE` is set), the function sets the base
   * viewport then navigates, for results identical to the legacy script. If
   * omitted, the page is assumed already navigated.
   */
  targetUrl?: string;
  /** Base viewport applied before zoom (default: 1280x720). */
  viewport?: { width: number; height: number };
  /** Whether to capture a screenshot next to the result file (default: false). */
  screenshot?: boolean;
}

/**
 * Run the zoom 200% check against the current page, write the result JSON
 * (and optionally a screenshot), and return the parsed result.
 */
export async function runZoomCheck(
  options: RunZoomCheckOptions
): Promise<ZoomCheckResult> {
  const {
    page,
    targetUrl: targetUrlOption,
    viewport = ZOOM_BASE_VIEWPORT,
    screenshot = false,
    ...location
  } = options;

  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  // If a URL is available, navigate at the base viewport (legacy ordering).
  const targetUrl = targetUrlOption ?? process.env.TEST_PAGE;
  if (targetUrl) {
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
  }

  const zoomResult = await page.evaluate(applyZoomAndCheck, {
    checkSelector: REFLOW_CHECK_SELECTOR,
    tolerance: ZOOM_CLIP_TOLERANCE,
  });

  const result: ZoomCheckResult = {
    url: page.url(),
    zoomFactor: ZOOM_FACTOR,
    viewport: { width: viewport.width, height: viewport.height },
    ...zoomResult,
  };

  // Output results
  logAuditHeader('Zoom 200% Check Results', 'WCAG 1.4.4', result.url);

  logSummary({
    'Zoom factor': `${result.zoomFactor}x`,
    'Base viewport': `${result.viewport.width}x${result.viewport.height}`,
    'Document scroll width': `${result.documentScrollWidth}px`,
    'Document client width': `${result.documentClientWidth}px`,
    'Horizontal scroll': result.hasHorizontalScroll,
    'Clipped elements': result.clippedElements.length,
  });

  logIssueList<ZoomIssue>(
    'Clipped Elements',
    result.clippedElements,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   scrollWidth: ${el.scrollWidth}px, clientWidth: ${el.clientWidth}px`,
      `   Issue: ${el.issueType}`,
    ]
  );

  const resolvedPath = saveAuditResult(result, {
    ...location,
    defaultFile: DEFAULT_ZOOM_RESULT_FILE,
  });

  let screenshotPath: string | undefined;
  if (screenshot) {
    screenshotPath = await takeAuditScreenshot(page, {
      path: resolveScreenshotPath(resolvedPath, DEFAULT_ZOOM_SCREENSHOT_FILE),
    });
  }

  logOutputPaths(resolvedPath, screenshotPath);

  return result;
}
