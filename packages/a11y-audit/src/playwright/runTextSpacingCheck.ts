/**
 * Text Spacing Check — WCAG 1.4.12 (Text Spacing)
 *
 * Captures baseline metrics, injects the WCAG 1.4.12 spacing overrides, and
 * reports elements whose text becomes clipped (overflow:hidden) under the
 * increased spacing.
 *
 * The caller is responsible for navigating the page before calling this.
 */

import type { Page } from '@playwright/test';
import type {
  TextSpacingCheckResult,
  TextSpacingCheckDetails,
  TextSpacingIssue,
} from '../types.js';
import {
  TEXT_SPACING_CSS,
  TEXT_SPACING_CLIP_TOLERANCE,
  TEXT_SPACING_CHECK_SELECTOR,
  DEFAULT_TEXT_SPACING_RESULT_FILE,
  DEFAULT_TEXT_SPACING_SCREENSHOT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeTextSpacingCheck,
} from '../utils/axe-format.js';
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

interface ElementMetrics {
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  overflow: string;
  overflowX: string;
  overflowY: string;
}

/** Collect metrics for elements with hidden overflow (browser context). */
function collectElementMetrics(args: {
  checkSelector: string;
  htmlSnippetMaxLength: number;
}): ElementMetrics[] {
  const { checkSelector, htmlSnippetMaxLength } = args;

  function getHtmlSnippet(element: Element): {
    html: string;
    htmlTruncated: boolean;
  } {
    let html = '';
    try {
      html = element.outerHTML || '';
    } catch {
      html = '';
    }
    if (!html) {
      return {
        html: `<${element.tagName.toLowerCase()}>`,
        htmlTruncated: false,
      };
    }
    if (html.length > htmlSnippetMaxLength) {
      return { html: html.slice(0, htmlSnippetMaxLength), htmlTruncated: true };
    }
    return { html, htmlTruncated: false };
  }

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
    return path.length > 0
      ? path.join(' > ')
      : `[data-index="${elementIndex}"]`;
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
    const hasText =
      element.textContent && element.textContent.trim().length > 0;

    if (hasText && hasHiddenOverflow(style)) {
      metrics.push({
        selector: getUniqueSelector(element, index),
        tagName: element.tagName.toLowerCase(),
        ...getHtmlSnippet(element),
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

/** Inject text spacing CSS and re-collect metrics (browser context). */
function injectSpacingAndCollect(args: {
  css: string;
  checkSelector: string;
  htmlSnippetMaxLength: number;
}): ElementMetrics[] {
  const { css, checkSelector, htmlSnippetMaxLength } = args;

  const styleEl = document.createElement('style');
  styleEl.id = 'wcag-text-spacing-override';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // Force reflow
  void document.body.offsetHeight;

  function getHtmlSnippet(element: Element): {
    html: string;
    htmlTruncated: boolean;
  } {
    let html = '';
    try {
      html = element.outerHTML || '';
    } catch {
      html = '';
    }
    if (!html) {
      return {
        html: `<${element.tagName.toLowerCase()}>`,
        htmlTruncated: false,
      };
    }
    if (html.length > htmlSnippetMaxLength) {
      return { html: html.slice(0, htmlSnippetMaxLength), htmlTruncated: true };
    }
    return { html, htmlTruncated: false };
  }

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
    return path.length > 0
      ? path.join(' > ')
      : `[data-index="${elementIndex}"]`;
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
    const hasText =
      element.textContent && element.textContent.trim().length > 0;

    if (hasText && hasHiddenOverflow(style)) {
      metrics.push({
        selector: getUniqueSelector(element, index),
        tagName: element.tagName.toLowerCase(),
        ...getHtmlSnippet(element),
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

function determineIssueType(
  hasHorizontalIssue: boolean,
  hasVerticalIssue: boolean,
): 'horizontal-clip' | 'vertical-clip' | 'both' {
  if (hasHorizontalIssue && hasVerticalIssue) {
    return 'both';
  }
  if (hasVerticalIssue) {
    return 'vertical-clip';
  }
  return 'horizontal-clip';
}

function detectClippingIssues(
  beforeMetrics: ElementMetrics[],
  afterMetrics: ElementMetrics[],
  tolerance: number,
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

    const horizontalClipBefore =
      beforeData.scrollWidth > beforeData.clientWidth + tolerance;
    const horizontalClipAfter =
      after.scrollWidth > after.clientWidth + tolerance;
    const verticalClipBefore =
      beforeData.scrollHeight > beforeData.clientHeight + tolerance;
    const verticalClipAfter =
      after.scrollHeight > after.clientHeight + tolerance;

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
        html: after.html,
        htmlTruncated: after.htmlTruncated,
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

export interface RunTextSpacingCheckOptions extends OutputLocationOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /** Tolerance in pixels for clip detection (default: 2). */
  tolerance?: number;
  /** Whether to capture a screenshot next to the result file (default: false). */
  screenshot?: boolean;
}

/**
 * Run the text spacing check against the current page, write the result JSON
 * (and optionally a screenshot), and return the parsed result.
 */
export async function runTextSpacingCheck(
  options: RunTextSpacingCheckOptions,
): Promise<TextSpacingCheckResult> {
  const {
    page,
    tolerance = TEXT_SPACING_CLIP_TOLERANCE,
    screenshot = false,
    ...location
  } = options;

  const beforeMetrics = await page.evaluate(collectElementMetrics, {
    checkSelector: TEXT_SPACING_CHECK_SELECTOR,
    htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
  });

  const afterMetrics = await page.evaluate(injectSpacingAndCollect, {
    css: TEXT_SPACING_CSS,
    checkSelector: TEXT_SPACING_CHECK_SELECTOR,
    htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
  });

  const clippedElements = detectClippingIssues(
    beforeMetrics,
    afterMetrics,
    tolerance,
  );

  const details: TextSpacingCheckDetails = {
    clippedElements,
    totalElementsChecked: afterMetrics.length,
  };

  const result: TextSpacingCheckResult = buildAuditResult({
    source: 'text-spacing-check',
    url: page.url(),
    details,
    buckets: normalizeTextSpacingCheck(details),
  });

  logAuditHeader('Text Spacing Check Results', 'WCAG 1.4.12', result.url);

  logSummary({
    'Elements with overflow:hidden checked': details.totalElementsChecked,
    'Elements with clipping issues': details.clippedElements.length,
  });

  logIssueList<TextSpacingIssue>(
    'Clipped Elements',
    details.clippedElements,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Issue: ${el.issueType}`,
      `   Before: ${el.beforeMetrics.scrollWidth}x${el.beforeMetrics.scrollHeight} in ${el.beforeMetrics.clientWidth}x${el.beforeMetrics.clientHeight}`,
      `   After:  ${el.afterMetrics.scrollWidth}x${el.afterMetrics.scrollHeight} in ${el.afterMetrics.clientWidth}x${el.afterMetrics.clientHeight}`,
    ],
  );

  const resolvedPath = saveAuditResult(result, {
    ...location,
    defaultFile: DEFAULT_TEXT_SPACING_RESULT_FILE,
  });

  let screenshotPath: string | undefined;
  if (screenshot) {
    screenshotPath = await takeAuditScreenshot(page, {
      path: resolveScreenshotPath(
        resolvedPath,
        DEFAULT_TEXT_SPACING_SCREENSHOT_FILE,
      ),
    });
  }

  logOutputPaths(resolvedPath, screenshotPath);

  return result;
}
