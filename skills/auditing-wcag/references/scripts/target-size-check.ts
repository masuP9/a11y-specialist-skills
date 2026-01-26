/**
 * Target Size Check
 *
 * WCAG 2.5.8 (Target Size Minimum - AA): 24x24 CSS px
 * WCAG 2.5.5 (Target Size Enhanced - AAA): 44x44 CSS px
 *
 * This script:
 * 1. Finds all interactive elements (tap/click targets)
 * 2. Measures their bounding box dimensions
 * 3. Checks for WCAG 2.5.8 exceptions (inline, redundant, ua-control, spacing)
 * 4. Reports issues at both AA and AAA levels
 *
 * Exceptions per WCAG 2.5.8:
 * - Inline: Target is within a sentence or text block
 * - User Agent Control: Size determined by UA (native form controls)
 * - Equivalent: Alternative target exists that meets size requirement
 * - Spacing: Undersized target has 24px spacing from adjacent targets
 * - Essential: Particular presentation is legally/informationally essential
 *
 * Limitations:
 * - Essential exception requires manual review
 * - Cannot detect all redundant target cases
 * - CSS transform may affect measurements (getBoundingClientRect returns transformed size)
 * - Pseudo-elements expanding click area not fully detectable
 */

import { test } from '@playwright/test';
import type {
  TargetSizeIssue,
  TargetSizeCheckResult,
  TargetSizeException,
} from './types';
import {
  INTERACTIVE_SELECTOR,
  TARGET_SIZE_AA,
  TARGET_SIZE_AAA,
  INLINE_CONTEXT_TAGS,
  UA_CONTROLLED_INPUT_TYPES,
  INLINE_CONTEXT_MIN_TEXT,
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
import { addPageAnnotations, type AnnotationConfig } from './utils/annotations';

/** Basic target info collected from DOM */
interface BasicTargetInfo {
  selector: string;
  tagName: string;
  role: string | null;
  width: number;
  height: number;
  href: string | null;
  inputType: string | null;
  appearance: string;
  parentTag: string | null;
  parentTextLength: number;
  boundingRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

/**
 * Collect basic target information from DOM
 */
function collectBasicTargetInfo(interactiveSelector: string): BasicTargetInfo[] {
  function getUniqueSelector(element: Element, elementIndex: number): string {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current!.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      current = parent;
    }
    return path.length > 0 ? path.join(' > ') : `[data-index="${elementIndex}"]`;
  }

  const targets: BasicTargetInfo[] = [];
  const elements = document.querySelectorAll(interactiveSelector);

  elements.forEach((element, index) => {
    const el = element as HTMLElement;
    const rect = el.getBoundingClientRect();

    // Skip invisible elements
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    // Skip elements outside viewport (likely hidden)
    if (rect.bottom < 0 || rect.right < 0) {
      return;
    }

    const computedStyle = getComputedStyle(el);
    if (computedStyle.visibility === 'hidden' || computedStyle.display === 'none') {
      return;
    }

    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const inputType =
      el instanceof HTMLInputElement ? el.type : null;
    const href =
      el instanceof HTMLAnchorElement ? el.href : null;

    // Get parent info for inline exception check
    const parent = el.parentElement;
    const parentTag = parent ? parent.tagName.toLowerCase() : null;
    const parentTextLength = parent ? (parent.textContent || '').length : 0;

    targets.push({
      selector: getUniqueSelector(element, index),
      tagName,
      role,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      href,
      inputType,
      appearance: computedStyle.appearance,
      parentTag,
      parentTextLength,
      boundingRect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
    });
  });

  return targets;
}

/**
 * Parse accessible name from ariaSnapshot output
 */
function parseAccessibleName(snapshot: string): string | null {
  // ariaSnapshot format: "- role \"accessible name\"" or "- role \"accessible name\" [state]"
  const match = snapshot.match(/^- \w+(?:\s+"([^"]*)")?/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/**
 * Check if element qualifies for inline exception
 */
function checkInlineException(
  target: BasicTargetInfo,
  inlineContextTags: readonly string[],
  minTextLength: number
): { applies: boolean; details: string | null } {
  // Only links typically qualify for inline exception
  if (target.tagName !== 'a' || !target.href) {
    return { applies: false, details: null };
  }

  if (
    target.parentTag &&
    inlineContextTags.includes(target.parentTag as typeof inlineContextTags[number]) &&
    target.parentTextLength >= minTextLength
  ) {
    return {
      applies: true,
      details: `Inline link within <${target.parentTag}>, surrounding text: ${target.parentTextLength} chars`,
    };
  }

  return { applies: false, details: null };
}

/**
 * Check if element qualifies for UA control exception
 */
function checkUAControlException(
  target: BasicTargetInfo,
  uaControlledTypes: readonly string[]
): { applies: boolean; details: string | null } {
  // Check native form controls that haven't been restyled
  if (target.tagName === 'select') {
    if (target.appearance !== 'none') {
      return {
        applies: true,
        details: 'Native <select> element with default appearance',
      };
    }
  }

  if (
    target.tagName === 'input' &&
    target.inputType &&
    uaControlledTypes.includes(target.inputType as typeof uaControlledTypes[number])
  ) {
    if (target.appearance !== 'none') {
      return {
        applies: true,
        details: `Native <input type="${target.inputType}"> with default appearance`,
      };
    }
  }

  return { applies: false, details: null };
}

/**
 * Check for redundant targets (same href with at least one meeting size)
 */
function findRedundantTargets(
  targets: BasicTargetInfo[]
): Map<string, BasicTargetInfo[]> {
  const byHref = new Map<string, BasicTargetInfo[]>();

  for (const target of targets) {
    if (target.href) {
      const existing = byHref.get(target.href) || [];
      existing.push(target);
      byHref.set(target.href, existing);
    }
  }

  return byHref;
}

/**
 * Check if target has adequate spacing from adjacent targets
 */
function checkSpacingException(
  target: BasicTargetInfo,
  allTargets: BasicTargetInfo[],
  requiredSpacing: number
): { applies: boolean; details: string | null } {
  const targetRect = target.boundingRect;

  for (const other of allTargets) {
    if (other.selector === target.selector) {
      continue;
    }

    const otherRect = other.boundingRect;

    // Calculate distance between edges
    const horizontalGap = Math.max(
      0,
      Math.max(otherRect.left - targetRect.right, targetRect.left - otherRect.right)
    );
    const verticalGap = Math.max(
      0,
      Math.max(otherRect.top - targetRect.bottom, targetRect.top - otherRect.bottom)
    );

    // If adjacent (gaps are small), check if spacing is adequate
    if (horizontalGap < requiredSpacing && verticalGap < requiredSpacing) {
      // Not enough spacing
      return { applies: false, details: null };
    }
  }

  // All adjacent targets have adequate spacing
  return {
    applies: true,
    details: `No adjacent targets within ${requiredSpacing}px`,
  };
}

/**
 * Analyze targets and categorize by pass/fail level
 */
function analyzeTargets(
  targets: Array<BasicTargetInfo & { accessibleName: string | null }>,
  aaThreshold: number,
  aaaThreshold: number
): {
  failAA: TargetSizeIssue[];
  failAAAOnly: TargetSizeIssue[];
  passCount: number;
  excepted: TargetSizeIssue[];
} {
  const failAA: TargetSizeIssue[] = [];
  const failAAAOnly: TargetSizeIssue[] = [];
  const excepted: TargetSizeIssue[] = [];
  let passCount = 0;

  // Build href map for redundancy check
  const hrefMap = findRedundantTargets(targets);

  for (const target of targets) {
    const minDimension = Math.min(target.width, target.height);

    // Determine level
    let level: 'fail-aa' | 'fail-aaa-only' | 'pass';
    if (minDimension >= aaaThreshold) {
      level = 'pass';
      passCount++;
      continue;
    } else if (minDimension >= aaThreshold) {
      level = 'fail-aaa-only';
    } else {
      level = 'fail-aa';
    }

    // Check exceptions (only relevant for fail-aa)
    let exception: TargetSizeException | null = null;
    let exceptionDetails: string | null = null;

    if (level === 'fail-aa') {
      // Check inline exception
      const inlineCheck = checkInlineException(
        target,
        INLINE_CONTEXT_TAGS,
        INLINE_CONTEXT_MIN_TEXT
      );
      if (inlineCheck.applies) {
        exception = 'inline';
        exceptionDetails = inlineCheck.details;
      }

      // Check UA control exception
      if (!exception) {
        const uaCheck = checkUAControlException(target, UA_CONTROLLED_INPUT_TYPES);
        if (uaCheck.applies) {
          exception = 'ua-control';
          exceptionDetails = uaCheck.details;
        }
      }

      // Check redundant exception
      if (!exception && target.href) {
        const sameHrefTargets = hrefMap.get(target.href) || [];
        const hasLargerTarget = sameHrefTargets.some(
          (t) =>
            t.selector !== target.selector &&
            Math.min(t.width, t.height) >= aaThreshold
        );
        if (hasLargerTarget) {
          exception = 'redundant';
          exceptionDetails = `Another link to same URL meets size requirement`;
        }
      }

      // Check spacing exception
      if (!exception) {
        const spacingCheck = checkSpacingException(target, targets, aaThreshold);
        if (spacingCheck.applies) {
          exception = 'spacing';
          exceptionDetails = spacingCheck.details;
        }
      }
    }

    const issue: TargetSizeIssue = {
      selector: target.selector,
      tagName: target.tagName,
      role: target.role,
      accessibleName: target.accessibleName,
      width: target.width,
      height: target.height,
      minDimension: Math.round(minDimension * 100) / 100,
      level,
      exception,
      exceptionDetails,
      href: target.href,
    };

    if (exception) {
      excepted.push(issue);
    } else if (level === 'fail-aa') {
      failAA.push(issue);
    } else {
      failAAAOnly.push(issue);
    }
  }

  return { failAA, failAAAOnly, passCount, excepted };
}

test('target size check (WCAG 2.5.5 / 2.5.8)', async ({ page }) => {
  const targetUrl = getTargetUrl('?preset=ng-terrible1&wcagver=22');
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  // Collect basic target info from DOM
  const basicTargets = await page.evaluate(
    collectBasicTargetInfo,
    INTERACTIVE_SELECTOR
  );

  // Enhance with accessible names via ariaSnapshot()
  const targets: Array<BasicTargetInfo & { accessibleName: string | null }> = [];
  for (const basicTarget of basicTargets) {
    let accessibleName: string | null = null;

    try {
      const locator = page.locator(basicTarget.selector).first();
      const snapshot = await locator.ariaSnapshot();
      accessibleName = parseAccessibleName(snapshot);
    } catch {
      // If ariaSnapshot fails, accessibleName remains null
    }

    targets.push({
      ...basicTarget,
      accessibleName,
    });
  }

  // Analyze targets
  const { failAA, failAAAOnly, passCount, excepted } = analyzeTargets(
    targets,
    TARGET_SIZE_AA,
    TARGET_SIZE_AAA
  );

  const result: TargetSizeCheckResult = {
    url: page.url(),
    totalTargetsChecked: targets.length,
    failAA,
    failAAAOnly,
    passedTargets: passCount,
    exceptedTargets: excepted,
    summary: {
      failAACount: failAA.length,
      failAAAOnlyCount: failAAAOnly.length,
      passCount,
      exceptedCount: excepted.length,
    },
  };

  const outputPath = 'target-size-result.json';
  const screenshotPath = 'target-size-screenshot.png';

  // Output results
  logAuditHeader('Target Size Check Results', 'WCAG 2.5.5 / 2.5.8', result.url);

  logSummary({
    'Total targets checked': result.totalTargetsChecked,
  });

  console.log('\nSummary:');
  console.log(`  Pass (>= ${TARGET_SIZE_AAA}px): ${result.summary.passCount}`);
  console.log(`  Fail AAA only (${TARGET_SIZE_AA}-${TARGET_SIZE_AAA - 1}px): ${result.summary.failAAAOnlyCount}`);
  console.log(`  Fail AA (< ${TARGET_SIZE_AA}px): ${result.summary.failAACount}`);
  console.log(`  Possible exceptions: ${result.summary.exceptedCount}`);

  logIssueList<TargetSizeIssue>(
    `Fail AA (< ${TARGET_SIZE_AA}px) - Requires Fix`,
    failAA,
    (el, i) => {
      const lines = [
        `${i + 1}. <${el.tagName}> "${el.selector}"`,
        `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
        `   Name: "${el.accessibleName || 'none'}"`,
      ];
      if (el.exception) {
        lines.push(`   Exception: ${el.exception} - ${el.exceptionDetails}`);
      }
      return lines;
    }
  );

  logIssueList<TargetSizeIssue>(
    `Fail AAA Only (${TARGET_SIZE_AA}-${TARGET_SIZE_AAA - 1}px) - Recommended Fix`,
    failAAAOnly,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
      `   Name: "${el.accessibleName || 'none'}"`,
    ],
    5
  );

  logIssueList<TargetSizeIssue>(
    'Possible Exceptions (Manual Review Recommended)',
    excepted,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
      `   Exception: ${el.exception} - ${el.exceptionDetails}`,
    ],
    5
  );

  // Build annotations for screenshot
  const passSelectors = targets
    .filter((t) => Math.min(t.width, t.height) >= TARGET_SIZE_AAA)
    .map((t) => t.selector);

  const annotations: AnnotationConfig[] = [
    ...passSelectors.map((s) => ({ selector: s, label: 'PASS', colorScheme: 'pass' as const })),
    ...failAAAOnly.map((t) => ({ selector: t.selector, label: 'AA Pass', colorScheme: 'warning' as const })),
    ...failAA.map((t) => ({ selector: t.selector, label: 'AA Fail', colorScheme: 'fail' as const })),
    ...excepted.map((t) => ({ selector: t.selector, label: 'Exception', colorScheme: 'info' as const })),
  ];

  await addPageAnnotations(page, annotations);
  await takeAuditScreenshot(page, { path: screenshotPath });

  // Legend
  console.log('\nLegend:');
  console.log(`  PASS (green): >= ${TARGET_SIZE_AAA}px - AA Pass, AAA Pass`);
  console.log(`  AA Pass (orange): ${TARGET_SIZE_AA}-${TARGET_SIZE_AAA - 1}px - AA Pass, AAA Fail`);
  console.log(`  AA Fail (red): < ${TARGET_SIZE_AA}px - AA Fail, AAA Fail`);
  console.log(`  Exception (blue): Possible exception (manual review needed)`);

  saveAuditResult(result, { outputPath });
  logOutputPaths(outputPath, screenshotPath);
});
