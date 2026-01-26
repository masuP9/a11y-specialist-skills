/**
 * Zoom 200% Check
 *
 * WCAG 1.4.4 (Resize Text)
 *
 * This script:
 * 1. Sets a standard viewport (1280x720)
 * 2. Applies 200% zoom via CSS zoom property
 * 3. Detects horizontal scrolling
 * 4. Finds elements with clipped content due to overflow:hidden
 * 5. Reports issues with element selectors
 *
 * WCAG 1.4.4 requires text to be resizable up to 200% without loss of content
 * or functionality (except for captions and images of text).
 *
 * Limitations:
 * - CSS zoom is engine-specific; actual browser zoom may behave differently
 * - Does not verify responsive breakpoint behavior
 * - Manual verification needed for complex interactions at zoom
 */

import { test } from '@playwright/test';
import type { ZoomIssue } from './types';
import {
  ZOOM_FACTOR,
  ZOOM_BASE_VIEWPORT,
  ZOOM_CLIP_TOLERANCE,
  REFLOW_CHECK_SELECTOR,
} from './constants';
import {
  getTargetUrl,
  logAuditHeader,
  logSummary,
  logIssueList,
  saveAuditResult,
  logOutputPaths,
  takeAuditScreenshot,
} from './utils/test-harness';

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

/**
 * Apply zoom and detect issues in browser context
 */
function applyZoomAndCheck(args: ZoomCheckArgs): ZoomCheckResponse {
  const { checkSelector, tolerance } = args;

  // Apply CSS zoom
  document.documentElement.style.zoom = '200%';

  // Force reflow
  document.body.offsetHeight;

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
  const hasHorizontalScroll = documentScrollWidth > documentClientWidth + tolerance;

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

test('zoom 200% check (WCAG 1.4.4)', async ({ page }) => {
  await page.setViewportSize(ZOOM_BASE_VIEWPORT);

  const targetUrl = getTargetUrl('?preset=1.4.4-text-size');
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  const zoomResult = await page.evaluate(applyZoomAndCheck, {
    checkSelector: REFLOW_CHECK_SELECTOR,
    tolerance: ZOOM_CLIP_TOLERANCE,
  });

  const result = {
    url: page.url(),
    zoomFactor: ZOOM_FACTOR,
    viewport: ZOOM_BASE_VIEWPORT,
    ...zoomResult,
  };

  const outputPath = 'zoom-200-result.json';
  const screenshotPath = 'zoom-200-screenshot.png';

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

  saveAuditResult(result, { outputPath });
  await takeAuditScreenshot(page, { path: screenshotPath });
  logOutputPaths(outputPath, screenshotPath);
});
