/**
 * Text Spacing Check
 *
 * WCAG 1.4.12 (Text Spacing)
 *
 * This script:
 * 1. Captures baseline metrics of text elements
 * 2. Injects CSS overrides for text spacing (line-height, letter-spacing, word-spacing)
 * 3. Detects elements where text is clipped due to overflow:hidden
 * 4. Reports elements that fail to accommodate increased spacing
 *
 * WCAG 1.4.12 requires content to not lose functionality when:
 * - Line height: at least 1.5 times the font size
 * - Letter spacing: at least 0.12 times the font size
 * - Word spacing: at least 0.16 times the font size
 * - Paragraph spacing: at least 2 times the font size
 *
 * Limitations:
 * - Cannot detect visual overlap between positioned elements
 * - Some clipping may be acceptable for non-text decorative content
 * - Manual verification needed for complex layouts
 */

import { test } from '@playwright/test';
import type { TextSpacingIssue } from './types';
import {
  TEXT_SPACING_CSS,
  TEXT_SPACING_CLIP_TOLERANCE,
  TEXT_SPACING_CHECK_SELECTOR,
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

interface ElementMetrics {
  selector: string;
  tagName: string;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  overflow: string;
  overflowX: string;
  overflowY: string;
}

interface CollectMetricsArgs {
  checkSelector: string;
}

interface InjectAndCollectArgs {
  css: string;
  checkSelector: string;
}

/**
 * Collect metrics for elements with hidden overflow in browser context
 */
function collectElementMetrics(args: CollectMetricsArgs): ElementMetrics[] {
  const { checkSelector } = args;

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
      style.overflowX === 'clip' ||
      style.overflowY === 'hidden' ||
      style.overflowY === 'clip'
    );
  }

  const elements = document.querySelectorAll(checkSelector);
  const metrics: ElementMetrics[] = [];

  elements.forEach((element, index) => {
    if (!isVisible(element)) {
      return;
    }

    const style = window.getComputedStyle(element);
    const hasText = element.textContent && element.textContent.trim().length > 0;

    if (hasText && hasHiddenOverflow(style)) {
      metrics.push({
        selector: getUniqueSelector(element, index),
        tagName: element.tagName.toLowerCase(),
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        overflow: style.overflow,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      });
    }
  });

  return metrics;
}

/**
 * Inject text spacing CSS and re-collect metrics in browser context
 */
function injectSpacingAndCollect(args: InjectAndCollectArgs): ElementMetrics[] {
  const { css, checkSelector } = args;

  // Inject CSS
  const styleEl = document.createElement('style');
  styleEl.id = 'wcag-text-spacing-override';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // Force reflow
  document.body.offsetHeight;

  // Reuse the same collection logic
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
      style.overflowX === 'clip' ||
      style.overflowY === 'hidden' ||
      style.overflowY === 'clip'
    );
  }

  const elements = document.querySelectorAll(checkSelector);
  const metrics: ElementMetrics[] = [];

  elements.forEach((element, index) => {
    if (!isVisible(element)) {
      return;
    }

    const style = window.getComputedStyle(element);
    const hasText = element.textContent && element.textContent.trim().length > 0;

    if (hasText && hasHiddenOverflow(style)) {
      metrics.push({
        selector: getUniqueSelector(element, index),
        tagName: element.tagName.toLowerCase(),
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        overflow: style.overflow,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      });
    }
  });

  return metrics;
}

/**
 * Determine issue type based on clipping direction
 */
function determineIssueType(
  hasHorizontalIssue: boolean,
  hasVerticalIssue: boolean
): 'horizontal-clip' | 'vertical-clip' | 'both' {
  if (hasHorizontalIssue && hasVerticalIssue) {
    return 'both';
  }
  if (hasVerticalIssue) {
    return 'vertical-clip';
  }
  return 'horizontal-clip';
}

/**
 * Detect clipping issues by comparing before and after metrics
 */
function detectClippingIssues(
  beforeMetrics: ElementMetrics[],
  afterMetrics: ElementMetrics[],
  tolerance: number
): TextSpacingIssue[] {
  const beforeMap = new Map<string, ElementMetrics>();
  beforeMetrics.forEach((m) => beforeMap.set(m.selector, m));

  const issues: TextSpacingIssue[] = [];

  afterMetrics.forEach((after) => {
    const before = beforeMap.get(after.selector);
    const defaultBefore = {
      scrollWidth: after.clientWidth,
      scrollHeight: after.clientHeight,
      clientWidth: after.clientWidth,
      clientHeight: after.clientHeight,
    };
    const beforeData = before || defaultBefore;

    const horizontalClipBefore = beforeData.scrollWidth > beforeData.clientWidth + tolerance;
    const horizontalClipAfter = after.scrollWidth > after.clientWidth + tolerance;
    const verticalClipBefore = beforeData.scrollHeight > beforeData.clientHeight + tolerance;
    const verticalClipAfter = after.scrollHeight > after.clientHeight + tolerance;

    const newHorizontalClip = !horizontalClipBefore && horizontalClipAfter;
    const newVerticalClip = !verticalClipBefore && verticalClipAfter;
    const worsenedHorizontalClip =
      horizontalClipBefore &&
      horizontalClipAfter &&
      after.scrollWidth - after.clientWidth >
        beforeData.scrollWidth - beforeData.clientWidth + tolerance;
    const worsenedVerticalClip =
      verticalClipBefore &&
      verticalClipAfter &&
      after.scrollHeight - after.clientHeight >
        beforeData.scrollHeight - beforeData.clientHeight + tolerance;

    const hasHorizontalIssue = newHorizontalClip || worsenedHorizontalClip;
    const hasVerticalIssue = newVerticalClip || worsenedVerticalClip;

    if (hasHorizontalIssue || hasVerticalIssue) {
      issues.push({
        selector: after.selector,
        tagName: after.tagName,
        beforeMetrics: {
          scrollWidth: beforeData.scrollWidth,
          scrollHeight: beforeData.scrollHeight,
          clientWidth: beforeData.clientWidth,
          clientHeight: beforeData.clientHeight,
        },
        afterMetrics: {
          scrollWidth: after.scrollWidth,
          scrollHeight: after.scrollHeight,
          clientWidth: after.clientWidth,
          clientHeight: after.clientHeight,
        },
        overflow: after.overflow,
        overflowX: after.overflowX,
        overflowY: after.overflowY,
        issueType: determineIssueType(hasHorizontalIssue, hasVerticalIssue),
      });
    }
  });

  return issues;
}

test('text spacing check (WCAG 1.4.12)', async ({ page }) => {
  const targetUrl = getTargetUrl('?preset=1.4.4-text-size');
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  const beforeMetrics = await page.evaluate(collectElementMetrics, {
    checkSelector: TEXT_SPACING_CHECK_SELECTOR,
  });

  const afterMetrics = await page.evaluate(injectSpacingAndCollect, {
    css: TEXT_SPACING_CSS,
    checkSelector: TEXT_SPACING_CHECK_SELECTOR,
  });

  const clippedElements = detectClippingIssues(
    beforeMetrics,
    afterMetrics,
    TEXT_SPACING_CLIP_TOLERANCE
  );

  const result = {
    url: page.url(),
    clippedElements,
    totalElementsChecked: afterMetrics.length,
  };

  const outputPath = 'text-spacing-result.json';
  const screenshotPath = 'text-spacing-screenshot.png';

  // Output results
  logAuditHeader('Text Spacing Check Results', 'WCAG 1.4.12', result.url);

  logSummary({
    'Elements with overflow:hidden checked': result.totalElementsChecked,
    'Elements with clipping issues': result.clippedElements.length,
  });

  logIssueList<TextSpacingIssue>(
    'Clipped Elements',
    result.clippedElements,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Issue: ${el.issueType}`,
      `   Before: ${el.beforeMetrics.scrollWidth}x${el.beforeMetrics.scrollHeight} in ${el.beforeMetrics.clientWidth}x${el.beforeMetrics.clientHeight}`,
      `   After:  ${el.afterMetrics.scrollWidth}x${el.afterMetrics.scrollHeight} in ${el.afterMetrics.clientWidth}x${el.afterMetrics.clientHeight}`,
    ]
  );

  saveAuditResult(result, { outputPath });
  await takeAuditScreenshot(page, { path: screenshotPath });
  logOutputPaths(outputPath, screenshotPath);
});
