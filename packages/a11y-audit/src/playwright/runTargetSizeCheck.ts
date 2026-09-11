/**
 * Target Size Check
 *
 * WCAG 2.5.8 (Target Size Minimum - AA): 24x24 CSS px
 * WCAG 2.5.5 (Target Size Enhanced - AAA): 44x44 CSS px
 *
 * The caller is responsible for navigating the page before calling this
 * function.
 *
 * Note: when `screenshot` is enabled this function appends an annotation
 * overlay to the page DOM before capturing the screenshot. Collecting targets
 * also scrolls the page (to hit-test targets outside the initial viewport)
 * and restores the original scroll position afterwards.
 *
 * Spacing exception (SC 2.5.8): evaluated geometrically per the WCAG
 * definition — a 24px-diameter circle centered on each undersized target's
 * bounding box must not intersect another target, nor the circle of another
 * undersized target. See `utils/target-spacing.ts`. Nested interactive
 * elements count as separate targets (an undersized control inside a larger
 * clickable ancestor fails the exception); only a `<label>` and its control
 * are treated as one target.
 *
 * Limitations:
 * - Essential exception requires manual review
 * - Cannot detect all redundant target cases
 * - Targets that only react to script-attached handlers (no `onclick`
 *   attribute, no role, no tabindex) are not detected, so a verified spacing
 *   exception can miss such a neighbor
 * - Shadow DOM and iframe content are not inspected
 */

import type { Page } from '@playwright/test';
import type {
  TargetSizeIssue,
  TargetSizeCheckResult,
  TargetSizeCheckDetails,
  TargetSizeException,
  TargetSizeExceptionAssessment,
  TargetSpacingResult,
} from '../types.js';
import {
  INTERACTIVE_SELECTOR,
  TARGET_SIZE_AA,
  TARGET_SIZE_AAA,
  INLINE_CONTEXT_TAGS,
  UA_CONTROLLED_INPUT_TYPES,
  INLINE_CONTEXT_MIN_TEXT,
  DEFAULT_TARGET_SIZE_RESULT_FILE,
  DEFAULT_TARGET_SIZE_SCREENSHOT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeTargetSizeCheck,
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
import {
  addPageAnnotations,
  type AnnotationConfig,
  type CircleAnnotationConfig,
} from '../utils/annotations.js';
import {
  describeTargetSpacing,
  evaluateTargetSpacing,
  type Point,
  type Rect,
  type SpacingTarget,
} from '../utils/target-spacing.js';

/** Basic target info collected from DOM */
interface BasicTargetInfo {
  /** Position in the collected list; stable identifier for relations. */
  index: number;
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
  role: string | null;
  width: number;
  height: number;
  href: string | null;
  inputType: string | null;
  appearance: string;
  parentTag: string | null;
  parentTextLength: number;
  /** Bounding box in document coordinates (CSS px). */
  boundingRect: Rect;
  /** Per-line painted boxes in document coordinates (CSS px). */
  clientRects: Rect[];
  /** Indices of targets that share this target's function (label ↔ control). */
  sameTargetIndices: number[];
}

interface CollectedTargets {
  targets: BasicTargetInfo[];
  /** Targets skipped because another element covers their hit-test point. */
  occludedCount: number;
}

/**
 * Collect basic target information from DOM (runs in browser context).
 *
 * Scrolls the page to hit-test every target's painted center and restores
 * the original scroll position before returning.
 */
function collectBasicTargetInfo(args: {
  interactiveSelector: string;
  htmlSnippetMaxLength: number;
}): CollectedTargets {
  const { interactiveSelector, htmlSnippetMaxLength } = args;

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
      return `#${CSS.escape(element.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current!.tagName,
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      current = parent;
    }
    return path.length > 0
      ? path.join(' > ')
      : `[data-index="${elementIndex}"]`;
  }

  // Mirrors `roundPx` in utils/target-spacing.ts (this closure cannot import).
  const round2 = (n: number): number => Math.round(n * 100) / 100;

  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;

  const toDocRect = (rect: DOMRect): Rect => ({
    left: round2(rect.left + originalScrollX),
    top: round2(rect.top + originalScrollY),
    right: round2(rect.right + originalScrollX),
    bottom: round2(rect.bottom + originalScrollY),
  });

  // Pass 1: visible candidates, measured at the original scroll position.
  interface Candidate {
    el: HTMLElement;
    rect: DOMRect;
    appearance: string;
    boundingRect: Rect;
    clientRects: Rect[];
  }
  const candidates: Candidate[] = [];
  const elements = document.querySelectorAll(interactiveSelector);

  elements.forEach((element) => {
    const el = element as HTMLElement;
    const rect = el.getBoundingClientRect();

    // Skip invisible elements
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    // Skip elements positioned off the document (e.g. `left: -9999px`
    // skip links). Measured in document coordinates so targets above/left of
    // the current scroll position are kept — they are still spacing neighbors.
    if (rect.bottom + originalScrollY < 0 || rect.right + originalScrollX < 0) {
      return;
    }

    const computedStyle = getComputedStyle(el);
    if (
      computedStyle.visibility === 'hidden' ||
      computedStyle.display === 'none'
    ) {
      return;
    }

    const clientRects = Array.from(el.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .map(toDocRect);

    candidates.push({
      el,
      rect,
      appearance: computedStyle.appearance,
      boundingRect: toDocRect(rect),
      clientRects: clientRects.length > 0 ? clientRects : [toDocRect(rect)],
    });
  });

  // Pass 2: hit-test each candidate's painted center. Targets covered by
  // another element (overlay, sticky header, clipped container) are not
  // pointer targets and are dropped. Scroll only when the point is outside
  // the current viewport; visit candidates in document order to minimise
  // scrolling.
  const canScroll = typeof window.scrollTo === 'function';
  // `behavior: 'instant'` bypasses CSS `scroll-behavior: smooth`, which
  // would otherwise animate asynchronously and leave the synchronous
  // re-measure below looking at the old position.
  const scrollTo = (left: number, top: number): void => {
    window.scrollTo({ left, top, behavior: 'instant' });
  };
  const firstRect = (c: Candidate): Rect => c.clientRects[0] ?? c.boundingRect;
  const tileH = Math.max(1, window.innerHeight);
  const tileW = Math.max(1, window.innerWidth);
  // Visit viewport-sized tiles in order so each tile is scrolled to once.
  const order = candidates
    .map((c, i) => {
      const r = firstRect(c);
      return {
        i,
        ty: Math.floor(r.top / tileH),
        tx: Math.floor(r.left / tileW),
        y: r.top,
        x: r.left,
      };
    })
    .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.y - b.y || a.x - b.x)
    .map((o) => o.i);
  const inViewport = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
  /** Viewport center of the element's first painted box, measured now. */
  const paintedCenter = (el: Element): Point | null => {
    const fresh = Array.from(el.getClientRects()).find(
      (r) => r.width > 0 && r.height > 0,
    );
    return fresh
      ? { x: (fresh.left + fresh.right) / 2, y: (fresh.top + fresh.bottom) / 2 }
      : null;
  };

  const occluded = new Set<number>();
  for (const i of order) {
    const candidate = candidates[i];
    if (!candidate) {
      continue;
    }
    const { el } = candidate;
    const first = firstRect(candidate);
    const docX = (first.left + first.right) / 2;
    const docY = (first.top + first.bottom) / 2;

    if (
      !inViewport(docX - window.scrollX, docY - window.scrollY) &&
      canScroll
    ) {
      scrollTo(
        Math.max(0, docX - window.innerWidth / 2),
        Math.max(0, docY - window.innerHeight / 2),
      );
    }

    // Always measure at hit-test time: fixed/sticky elements move relative
    // to the document whenever the page scrolls.
    const point = paintedCenter(el);
    if (!point || !inViewport(point.x, point.y)) {
      // Cannot hit-test (e.g. inner scroll container); keep the target.
      continue;
    }

    const hit = document.elementFromPoint(point.x, point.y);
    if (hit && hit !== el && !el.contains(hit)) {
      occluded.add(i);
    }
  }

  if (canScroll) {
    scrollTo(originalScrollX, originalScrollY);
  }

  // Pass 3: build the target list with relations.
  const kept = candidates.filter((_, i) => !occluded.has(i));
  const indexByElement = new Map<Element, number>();
  kept.forEach((c, index) => indexByElement.set(c.el, index));

  const sameTarget: number[][] = kept.map(() => []);
  kept.forEach((c, index) => {
    if (c.el instanceof HTMLLabelElement && c.el.control) {
      const controlIndex = indexByElement.get(c.el.control);
      if (controlIndex !== undefined && controlIndex !== index) {
        sameTarget[index]?.push(controlIndex);
        sameTarget[controlIndex]?.push(index);
      }
    }
  });

  const targets: BasicTargetInfo[] = kept.map((c, index) => {
    const { el, rect } = c;
    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const inputType = el instanceof HTMLInputElement ? el.type : null;
    const href = el instanceof HTMLAnchorElement ? el.href : null;

    // Get parent info for inline exception check
    const parent = el.parentElement;
    const parentTag = parent ? parent.tagName.toLowerCase() : null;
    const parentTextLength = parent ? (parent.textContent || '').length : 0;

    return {
      index,
      selector: getUniqueSelector(el, index),
      tagName,
      ...getHtmlSnippet(el),
      role,
      width: round2(rect.width),
      height: round2(rect.height),
      href,
      inputType,
      appearance: c.appearance,
      parentTag,
      parentTextLength,
      boundingRect: c.boundingRect,
      clientRects: c.clientRects,
      sameTargetIndices: sameTarget[index] ?? [],
    };
  });

  return { targets, occludedCount: occluded.size };
}

/**
 * Parse accessible name from ariaSnapshot output.
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
 * Check if element qualifies for inline exception.
 */
function checkInlineException(
  target: BasicTargetInfo,
  inlineContextTags: readonly string[],
  minTextLength: number,
): { applies: boolean; details: string | null } {
  // Only links typically qualify for inline exception
  if (target.tagName !== 'a' || !target.href) {
    return { applies: false, details: null };
  }

  if (
    target.parentTag &&
    inlineContextTags.includes(target.parentTag) &&
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
 * Check if element qualifies for UA control exception.
 */
function checkUAControlException(
  target: BasicTargetInfo,
  uaControlledTypes: readonly string[],
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
    uaControlledTypes.includes(target.inputType)
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
 * Check for redundant targets (same href with at least one meeting size).
 */
function findRedundantTargets(
  targets: BasicTargetInfo[],
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
 * Build the spacing evaluator: a function that returns the spacing result
 * for one undersized target against every other collected target. A
 * `<label>` and its control are the same target; every other pair —
 * nested interactive elements included — counts as separate targets.
 */
function buildSpacingEvaluator(
  targets: readonly BasicTargetInfo[],
  aaThreshold: number,
): (target: BasicTargetInfo) => TargetSpacingResult {
  const toSpacingTarget = (t: BasicTargetInfo): SpacingTarget => ({
    index: t.index,
    selector: t.selector,
    bounds: t.boundingRect,
    rects: t.clientRects,
    undersized: Math.min(t.width, t.height) < aaThreshold,
  });
  const spacingTargets = targets.map(toSpacingTarget);

  const isSameTarget = (a: SpacingTarget, b: SpacingTarget): boolean =>
    targets[a.index]?.sameTargetIndices.includes(b.index) ?? false;

  return (target) =>
    evaluateTargetSpacing(toSpacingTarget(target), spacingTargets, {
      diameter: aaThreshold,
      isSameTarget,
    });
}

/**
 * Analyze targets and categorize by pass/fail level.
 */
function analyzeTargets(
  targets: Array<BasicTargetInfo & { accessibleName: string | null }>,
  aaThreshold: number,
  aaaThreshold: number,
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
  const evaluateSpacing = buildSpacingEvaluator(targets, aaThreshold);

  for (const target of targets) {
    const minDimension = Math.min(target.width, target.height);

    // Determine level
    let level: 'fail-aa' | 'fail-aaa-only' | 'pass';
    if (minDimension >= aaaThreshold) {
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
    let exceptionAssessment: TargetSizeExceptionAssessment = 'not-assessed';
    let spacing: TargetSpacingResult | null = null;

    if (level === 'fail-aa') {
      // Spacing geometry is evaluated for every undersized target so the
      // result (and the screenshot circle) is available whichever exception
      // is finally recorded.
      spacing = evaluateSpacing(target);

      if (spacing.applies) {
        // Verified geometrically: strongest evidence, wins over heuristics.
        exception = 'spacing';
        exceptionDetails = describeTargetSpacing(spacing);
        exceptionAssessment = 'verified';
      }

      // Check inline exception
      const inlineCheck = checkInlineException(
        target,
        INLINE_CONTEXT_TAGS,
        INLINE_CONTEXT_MIN_TEXT,
      );
      if (!exception && inlineCheck.applies) {
        exception = 'inline';
        exceptionDetails = inlineCheck.details;
      }

      // Check UA control exception
      if (!exception) {
        const uaCheck = checkUAControlException(
          target,
          UA_CONTROLLED_INPUT_TYPES,
        );
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
            Math.min(t.width, t.height) >= aaThreshold,
        );
        if (hasLargerTarget) {
          exception = 'redundant';
          exceptionDetails = `Another link to same URL meets size requirement`;
        }
      }

      if (exception && exceptionAssessment !== 'verified') {
        // Heuristic exceptions can never rule out manual confirmation.
        exceptionAssessment = 'possible';
      }
      // Otherwise `not-assessed` (initial value): no exception found and the
      // essential exception cannot be ruled out automatically.
    }

    const issue: TargetSizeIssue = {
      selector: target.selector,
      tagName: target.tagName,
      html: target.html,
      htmlTruncated: target.htmlTruncated,
      role: target.role,
      accessibleName: target.accessibleName,
      width: target.width,
      height: target.height,
      minDimension: Math.round(minDimension * 100) / 100,
      level,
      exception,
      exceptionDetails,
      exceptionAssessment,
      href: target.href,
      spacing,
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

export interface RunTargetSizeCheckOptions extends OutputLocationOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /** Minimum (AA) threshold in CSS px (default: 24). */
  aaThreshold?: number;
  /** Enhanced (AAA) threshold in CSS px (default: 44). */
  aaaThreshold?: number;
  /** Whether to capture an annotated screenshot (default: false). Mutates the page DOM. */
  screenshot?: boolean;
}

/**
 * Run the target size check against the current page, write the result JSON
 * (and optionally an annotated screenshot), and return the parsed result.
 */
export async function runTargetSizeCheck(
  options: RunTargetSizeCheckOptions,
): Promise<TargetSizeCheckResult> {
  const {
    page,
    aaThreshold = TARGET_SIZE_AA,
    aaaThreshold = TARGET_SIZE_AAA,
    screenshot = false,
    ...location
  } = options;

  // Collect basic target info from DOM
  const { targets: basicTargets, occludedCount } = await page.evaluate(
    collectBasicTargetInfo,
    {
      interactiveSelector: INTERACTIVE_SELECTOR,
      htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
    },
  );

  // Enhance with accessible names via ariaSnapshot()
  const targets: Array<BasicTargetInfo & { accessibleName: string | null }> =
    [];
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
    aaThreshold,
    aaaThreshold,
  );

  const verifiedSpacing = excepted.filter(
    (t) => t.exceptionAssessment === 'verified',
  );
  const possibleExceptions = excepted.filter(
    (t) => t.exceptionAssessment !== 'verified',
  );

  const details: TargetSizeCheckDetails = {
    totalTargetsChecked: targets.length,
    failAA,
    failAAAOnly,
    passedTargets: passCount,
    occludedTargets: occludedCount,
    exceptedTargets: excepted,
    summary: {
      failAACount: failAA.length,
      failAAAOnlyCount: failAAAOnly.length,
      passCount,
      exceptedCount: excepted.length,
      verifiedCount: verifiedSpacing.length,
    },
  };

  const result: TargetSizeCheckResult = buildAuditResult({
    source: 'target-size-check',
    url: page.url(),
    details,
    buckets: normalizeTargetSizeCheck(details),
  });

  // Output results
  logAuditHeader('Target Size Check Results', 'WCAG 2.5.5 / 2.5.8', result.url);

  logSummary({
    'Total targets checked': details.totalTargetsChecked,
    'Skipped (covered by another element)': details.occludedTargets,
  });

  console.log('\nSummary:');
  console.log(`  Pass (>= ${aaaThreshold}px): ${details.summary.passCount}`);
  console.log(
    `  Fail AAA only (${aaThreshold}-${aaaThreshold - 1}px): ${details.summary.failAAAOnlyCount}`,
  );
  console.log(`  Fail AA (< ${aaThreshold}px): ${details.summary.failAACount}`);
  console.log(`  Verified spacing exception: ${verifiedSpacing.length}`);
  console.log(`  Possible exceptions: ${possibleExceptions.length}`);

  logIssueList<TargetSizeIssue>(
    `Fail AA (< ${aaThreshold}px) - Requires Fix`,
    failAA,
    (el, i) => {
      const lines = [
        `${i + 1}. <${el.tagName}> "${el.selector}"`,
        `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
        `   Name: "${el.accessibleName || 'none'}"`,
      ];
      if (el.spacing) {
        lines.push(`   Spacing: ${describeTargetSpacing(el.spacing)}`);
      }
      return lines;
    },
  );

  logIssueList<TargetSizeIssue>(
    `Fail AAA Only (${aaThreshold}-${aaaThreshold - 1}px) - Recommended Fix`,
    failAAAOnly,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
      `   Name: "${el.accessibleName || 'none'}"`,
    ],
    5,
  );

  logIssueList<TargetSizeIssue>(
    `Verified Spacing Exception (< ${aaThreshold}px, conforms to 2.5.8)`,
    verifiedSpacing,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
    ],
    5,
  );

  logIssueList<TargetSizeIssue>(
    'Possible Exceptions (Manual Review Recommended)',
    possibleExceptions,
    (el, i) => {
      const lines = [
        `${i + 1}. <${el.tagName}> "${el.selector}"`,
        `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
        `   Exception: ${el.exception} - ${el.exceptionDetails}`,
      ];
      if (el.spacing) {
        lines.push(`   Spacing: ${describeTargetSpacing(el.spacing)}`);
      }
      return lines;
    },
    5,
  );

  const resolvedPath = saveAuditResult(result, {
    ...location,
    defaultFile: DEFAULT_TARGET_SIZE_RESULT_FILE,
  });

  let screenshotPath: string | undefined;
  if (screenshot) {
    // Build annotations for screenshot
    const passSelectors = targets
      .filter((t) => Math.min(t.width, t.height) >= aaaThreshold)
      .map((t) => t.selector);

    const annotations: AnnotationConfig[] = [
      ...passSelectors.map((s) => ({
        selector: s,
        label: 'PASS',
        colorScheme: 'pass' as const,
      })),
      ...failAAAOnly.map((t) => ({
        selector: t.selector,
        label: 'AA Pass',
        colorScheme: 'warning' as const,
      })),
      ...failAA.map((t) => ({
        selector: t.selector,
        label: 'AA Fail',
        colorScheme: 'fail' as const,
      })),
      ...verifiedSpacing.map((t) => ({
        selector: t.selector,
        label: 'Spacing OK',
        colorScheme: 'info' as const,
      })),
      ...possibleExceptions.map((t) => ({
        selector: t.selector,
        label: 'Exception',
        colorScheme: 'info' as const,
      })),
    ];

    // Spacing circles for every undersized target
    const circles: CircleAnnotationConfig[] = [...failAA, ...excepted].flatMap(
      (t): CircleAnnotationConfig[] =>
        t.spacing
          ? [
              {
                x: t.spacing.center.x,
                y: t.spacing.center.y,
                diameter: t.spacing.diameter,
                colorScheme: t.spacing.applies ? 'pass' : 'fail',
              },
            ]
          : [],
    );

    await addPageAnnotations(page, annotations, circles);
    screenshotPath = await takeAuditScreenshot(page, {
      path: resolveScreenshotPath(
        resolvedPath,
        DEFAULT_TARGET_SIZE_SCREENSHOT_FILE,
      ),
    });

    // Legend
    console.log('\nLegend:');
    console.log(`  PASS (green): >= ${aaaThreshold}px - AA Pass, AAA Pass`);
    console.log(
      `  AA Pass (orange): ${aaThreshold}-${aaaThreshold - 1}px - AA Pass, AAA Fail`,
    );
    console.log(`  AA Fail (red): < ${aaThreshold}px - AA Fail, AAA Fail`);
    console.log(
      `  Spacing OK (blue): < ${aaThreshold}px but spacing exception verified`,
    );
    console.log(
      `  Exception (blue): Possible exception (manual review needed)`,
    );
    console.log(
      `  Circles (${aaThreshold}px): green = no other target inside, red = intersects another target`,
    );
  }

  logOutputPaths(resolvedPath, screenshotPath);

  return result;
}
