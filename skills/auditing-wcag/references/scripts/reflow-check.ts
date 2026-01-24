/**
 * Reflow Check
 *
 * WCAG 1.4.10 (Reflow)
 *
 * This script:
 * 1. Sets viewport to 320px width (equivalent to 400% zoom on 1280px)
 * 2. Detects horizontal scrolling at document level
 * 3. Finds elements that overflow the viewport
 * 4. Detects text clipped by overflow:hidden
 * 5. Reports findings with element selectors
 *
 * Limitations:
 * - Cannot distinguish acceptable horizontal scroll (e.g., data tables)
 * - Does not verify functional reflow for complex widgets
 * - Manual verification needed for content that requires two-dimensional layout
 */

import { test } from '@playwright/test';
import type { ReflowIssue, ClippedTextElement } from './types';
import {
  REFLOW_VIEWPORT,
  REFLOW_OVERFLOW_TOLERANCE,
  REFLOW_CHECK_SELECTOR,
  REFLOW_ALLOWED_OVERFLOW_SELECTORS,
} from './constants';
import { createLayoutChecker } from './utils/layout';
import {
  getTargetUrl,
  logAuditHeader,
  logSummary,
  logIssueList,
  saveAuditResult,
  logOutputPaths,
  takeAuditScreenshot,
} from './utils/test-harness';

test('reflow check (WCAG 1.4.10)', async ({ page }) => {
  await page.setViewportSize(REFLOW_VIEWPORT);

  const targetUrl = getTargetUrl('?preset=1.4.4-text-size');
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  const layoutResult = await page.evaluate(createLayoutChecker, {
    viewportWidth: REFLOW_VIEWPORT.width,
    overflowTolerance: REFLOW_OVERFLOW_TOLERANCE,
    checkSelector: REFLOW_CHECK_SELECTOR,
    allowedOverflowSelectors: [...REFLOW_ALLOWED_OVERFLOW_SELECTORS],
  });

  const result = {
    url: page.url(),
    viewport: REFLOW_VIEWPORT,
    ...layoutResult,
  };

  const outputPath = 'reflow-result.json';
  const screenshotPath = 'reflow-screenshot.png';

  // Output results
  logAuditHeader('Reflow Check Results', 'WCAG 1.4.10', result.url);

  logSummary({
    Viewport: `${result.viewport.width}x${result.viewport.height}`,
    'Document scroll width': `${result.documentScrollWidth}px`,
    'Document client width': `${result.documentClientWidth}px`,
    'Horizontal scroll': result.hasHorizontalScroll,
    'Overflowing elements': result.overflowingElements.length,
    'Clipped text elements': result.clippedTextElements.length,
  });

  logIssueList<ReflowIssue>(
    'Overflowing Elements',
    result.overflowingElements,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   rect.right: ${el.rect.right}px (viewport: ${el.viewportWidth}px)`,
    ]
  );

  logIssueList<ClippedTextElement>(
    'Clipped Text Elements',
    result.clippedTextElements,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   scrollWidth: ${el.scrollWidth}px, clientWidth: ${el.clientWidth}px`,
      `   overflow: ${el.overflow}, overflowX: ${el.overflowX}`,
    ]
  );

  saveAuditResult(result, { outputPath });
  await takeAuditScreenshot(page, { path: screenshotPath });
  logOutputPaths(outputPath, screenshotPath);
});
