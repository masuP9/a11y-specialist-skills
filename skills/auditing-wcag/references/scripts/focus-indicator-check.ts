/**
 * Focus Indicator Visibility Check
 *
 * WCAG 2.4.7 (Focus Visible) / 2.4.12 (Focus Not Obscured) / 3.2.1 (On Focus)
 *
 * This script:
 * 1. Detects all focusable elements on the page
 * 2. Tabs through each element
 * 3. Captures style changes on focus (outline, box-shadow, background-color, etc.)
 * 4. Reports elements without visible focus indicators (2.4.7)
 * 5. Detects focus indicators obscured by fixed/sticky elements (2.4.12)
 * 6. Detects navigation/context changes triggered by focus (3.2.1)
 * 7. If navigation occurs, restarts test skipping problematic elements
 * 8. Takes a screenshot highlighting elements with issues
 */

import { test, type Page } from '@playwright/test';
import type { FocusRecord, OnFocusViolation, FocusCheckResult, FocusObscuredIssue } from './types';
import {
  FOCUSABLE_SELECTOR,
  FOCUS_STYLE_PROPERTIES,
  EXTRA_TAB_ITERATIONS,
  DEFAULT_FOCUS_OUTPUT_PATH,
  AUDIT_DISCLAIMER,
  FOCUS_OBSCURED_MIN_OVERLAP_RATIO,
  FOCUS_OBSCURED_MIN_OVERLAP_PX,
  FOCUS_OBSCURED_EXCLUDE_SELECTORS,
} from './constants';
import {
  getTargetUrl,
  logAuditHeader,
  saveAuditResult,
  logOutputPaths,
  takeAuditScreenshot,
} from './utils/test-harness';

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

// =============================================================================
// Test
// =============================================================================

test('focus indicator visibility', async ({ browser }) => {
  const targetUrl = getTargetUrl('?preset=ng-terrible1&wcagver=22');
  const onFocusViolations: OnFocusViolation[] = [];
  const focusObscuredIssues: FocusObscuredIssue[] = [];
  const skipSelectors: string[] = [];
  let finalFocusHistory: FocusRecord[] = [];
  let retryCount = 0;
  let finalPage: Page | null = null;

  // Retry loop - restart test when navigation violation is detected
  while (retryCount < MAX_RETRIES) {
    // Create a fresh context for each attempt to reset init scripts
    const context = await browser.newContext();
    const page = await context.newPage();

    const focusHistory: FocusRecord[] = [];
    let lastFocusedElement: { tag: string; role: string | null; name: string; selector: string } | null = null;
    let navigationDetected = false;

    // Expose function to receive focus reports from browser context
    await page.exposeFunction('reportFocus', (data: FocusRecord & { selector?: string }) => {
      focusHistory.push(data);
      lastFocusedElement = {
        tag: data.tag,
        role: data.role,
        name: data.name,
        selector: data.selector || `${data.tag.toLowerCase()}:nth-of-type(${data.id + 1})`,
      };
    });

    // Expose function to receive focus obscured reports (WCAG 2.4.12)
    await page.exposeFunction('reportFocusObscured', (data: FocusObscuredIssue) => {
      focusObscuredIssues.push(data);
    });

    // Inject focus tracking script with current skip list
    await page.addInitScript(createFocusTrackerScript, {
      focusableSelector: FOCUSABLE_SELECTOR,
      styleProperties: [...FOCUS_STYLE_PROPERTIES],
      warningStyles: WARNING_STYLES,
      skipSelectors: [...skipSelectors],
      obscuredConfig: {
        minOverlapRatio: FOCUS_OBSCURED_MIN_OVERLAP_RATIO,
        minOverlapPx: FOCUS_OBSCURED_MIN_OVERLAP_PX,
        excludeSelectors: [...FOCUS_OBSCURED_EXCLUDE_SELECTORS],
      },
    });

    // Navigate to target page
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    const originalUrl = page.url();

    // Initialize focus tracker and get element count
    const count = await page.evaluate(() => (window as any).initFocusTracker());

    // Mark elements that caused navigation violations (from previous attempts)
    // This must be called after initFocusTracker to use the overlay functions
    if (skipSelectors.length > 0) {
      await page.evaluate((selectors) => {
        selectors.forEach(sel => {
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

    // Tab through all elements with navigation detection
    for (let i = 0; i < count + EXTRA_TAB_ITERATIONS; i++) {
      const urlBeforeTab = page.url();

      await page.keyboard.press('Tab');

      // Get currently focused element IMMEDIATELY after Tab
      // This is more reliable than waiting for async reportFocus callback
      let currentFocusedElement: { tag: string; role: string | null; name: string; selector: string } | null = null;
      try {
        currentFocusedElement = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;

          const getSelector = (element: Element): string => {
            if (element.id) return `#${element.id}`;
            const tag = element.tagName.toLowerCase();
            const parent = element.parentElement;
            if (!parent) return tag;
            const siblings = [...parent.children].filter(c => c.tagName === element.tagName);
            if (siblings.length === 1) return `${getSelector(parent)} > ${tag}`;
            const index = siblings.indexOf(element) + 1;
            return `${getSelector(parent)} > ${tag}:nth-of-type(${index})`;
          };

          return {
            tag: el.tagName,
            role: el.getAttribute('role'),
            name: el.getAttribute('aria-label') || el.textContent?.slice(0, 30) || '',
            selector: getSelector(el),
          };
        });
      } catch (e) {
        // Page might have navigated, use lastFocusedElement as fallback
        currentFocusedElement = lastFocusedElement;
      }

      // Small wait to allow any navigation to start
      await page.waitForTimeout(50);

      // Check if navigation occurred
      const urlAfterTab = page.url();
      if (urlAfterTab !== urlBeforeTab) {
        // 3.2.1 violation detected!
        navigationDetected = true;

        const culprit = currentFocusedElement || lastFocusedElement;
        if (culprit && !skipSelectors.includes(culprit.selector)) {
          onFocusViolations.push({
            element: culprit,
            fromUrl: urlBeforeTab,
            toUrl: urlAfterTab,
            changeType: 'navigation',
          });
          skipSelectors.push(culprit.selector);

          console.warn(`\n⚠️  WCAG 3.2.1 Violation: Focus on element caused navigation!`);
          console.warn(`    Element: <${culprit.tag}> "${culprit.name}"`);
          console.warn(`    Selector: ${culprit.selector}`);
          console.warn(`    From: ${urlBeforeTab}`);
          console.warn(`    To: ${urlAfterTab}`);
          console.warn(`    Restarting test with this element skipped...`);
        }
        break;
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
      console.warn(`\n⚠️  Max retries (${MAX_RETRIES}) reached. Some elements may not have been tested.`);
      // Keep this page with its annotations for the screenshot
      // Don't close context - use current page which has partial annotations
      finalFocusHistory = focusHistory;
      finalPage = page;
      break;
    }

    // Close context before retry (only if we're going to retry)
    await context.close();
  }

  // Ensure finalPage is set (should always be set by this point)
  if (!finalPage) {
    throw new Error('No page available for screenshot');
  }

  // Report results
  const elementsWithoutFocusStyle = finalFocusHistory.filter((f) => !f.hasFocusStyle);

  if (elementsWithoutFocusStyle.length > 0) {
    console.warn('Elements without visible focus indicator:', elementsWithoutFocusStyle);
  }

  // Build result
  const result: FocusCheckResult = {
    url: finalPage.url(),
    totalFocusableElements: finalFocusHistory.length,
    elementsWithFocusStyle: finalFocusHistory.length - elementsWithoutFocusStyle.length,
    elementsWithoutFocusStyle: elementsWithoutFocusStyle.length,
    issues: elementsWithoutFocusStyle.map((el) => ({
      tag: el.tag,
      role: el.role,
      name: el.name,
    })),
    onFocusViolations,
    focusObscuredIssues,
    elementsWithObscuredFocus: focusObscuredIssues.length,
    allElements: finalFocusHistory,
    interrupted: false,
    screenshotPath: DEFAULT_FOCUS_OUTPUT_PATH,
  };

  const outputPath = 'focus-indicator-result.json';

  // Output results
  logAuditHeader('Focus Indicator Check Results', 'WCAG 2.4.7 / 2.4.12 / 3.2.1', result.url);

  console.log(`Total focusable elements: ${result.totalFocusableElements}`);
  console.log(`Elements with focus style: ${result.elementsWithFocusStyle}`);
  console.log(`Elements WITHOUT focus style: ${result.elementsWithoutFocusStyle}`);
  console.log(`Elements with OBSCURED focus: ${result.elementsWithObscuredFocus}`);

  if (retryCount > 0) {
    console.log(`\nTest restarted ${retryCount} time(s) due to navigation violations`);
  }

  // WCAG 2.4.7 summary
  if (elementsWithoutFocusStyle.length > 0) {
    console.log('\n--- WCAG 2.4.7: Elements Missing Focus Indicator ---');
    elementsWithoutFocusStyle.forEach((el, i) => {
      console.log(`  ${i + 1}. <${el.tag}> "${el.name}" (role: ${el.role || 'none'})`);
    });
  }

  // WCAG 2.4.12 summary
  if (focusObscuredIssues.length > 0) {
    console.log('\n--- WCAG 2.4.12: Focus Obscured by Fixed/Sticky Elements ---');
    focusObscuredIssues.forEach((issue, i) => {
      console.log(`  ${i + 1}. <${issue.element.tag}> "${issue.element.name}"`);
      console.log(`     Selector: ${issue.element.selector}`);
      console.log(`     Obscured ratio: ${(issue.obscuredRatio * 100).toFixed(1)}%`);
      issue.overlaps.forEach((overlap) => {
        console.log(`     Obscured by: <${overlap.obscuredBy.tag}> "${overlap.obscuredBy.name}"`);
      });
    });
  }

  // WCAG 3.2.1 summary
  if (onFocusViolations.length > 0) {
    console.log('\n--- WCAG 3.2.1: Focus Triggered Context Change ---');
    onFocusViolations.forEach((v, i) => {
      console.log(`  ${i + 1}. <${v.element.tag}> "${v.element.name}"`);
      console.log(`     Selector: ${v.element.selector}`);
      console.log(`     Navigated to: ${v.toUrl}`);
    });
  }

  await takeAuditScreenshot(finalPage, { path: DEFAULT_FOCUS_OUTPUT_PATH });
  saveAuditResult(result, { outputPath });
  logOutputPaths(outputPath, DEFAULT_FOCUS_OUTPUT_PATH);
});

// =============================================================================
// Browser-injected script factory
// =============================================================================

function createFocusTrackerScript(args: {
  focusableSelector: string;
  styleProperties: string[];
  warningStyles: string;
  skipSelectors: string[];
  obscuredConfig: {
    minOverlapRatio: number;
    minOverlapPx: number;
    excludeSelectors: string[];
  };
}): void {
  const { focusableSelector, styleProperties, warningStyles, skipSelectors, obscuredConfig } = args;

  // Add warning styles
  const styleSheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
  warningStyles.split('}').filter(r => r.trim()).forEach((rule, i) => {
    try {
      styleSheet.insertRule(rule + '}', i);
    } catch (e) {
      // Ignore invalid rules
    }
  });

  const baseStyles = new Map<Element, Record<string, string>>();
  const elementSelectors = new Map<Element, string>();
  let focusId = 0;

  /**
   * Generate a CSS selector for an element
   */
  const getSelector = (el: Element): string => {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (!parent) return tag;
    const siblings = [...parent.children].filter(c => c.tagName === el.tagName);
    if (siblings.length === 1) return `${getSelector(parent)} > ${tag}`;
    const index = siblings.indexOf(el) + 1;
    return `${getSelector(parent)} > ${tag}:nth-of-type(${index})`;
  };

  /**
   * Capture computed style for focus-related properties
   */
  const captureStyle = (el: Element): Record<string, string> => {
    const style = window.getComputedStyle(el);
    const result: Record<string, string> = {};
    for (const prop of styleProperties) {
      result[prop] = (style as any)[prop];
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
    focusedStyle: Record<string, string>
  ): boolean => {
    const diffKeys = Object.keys(diff);
    if (diffKeys.length === 0) return false;

    // Filter out changes that don't result in visible indicators
    const visibleChanges = diffKeys.filter(key => {
      // outline-offset alone is not visible without outline
      if (key === 'outlineOffset') {
        const outlineStyle = focusedStyle['outlineStyle'];
        const outlineWidth = focusedStyle['outlineWidth'];
        // Check if outline is actually visible
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
    const selector = getSelector(el);
    return skipSelectors.includes(selector);
  };

  /**
   * Create overlay container for annotations
   */
  const createOverlay = (): HTMLDivElement => {
    let overlay = document.getElementById('focus-audit-overlay') as HTMLDivElement;
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
    cssClass: string
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
    rect2: DOMRect
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
      if (obscuredConfig.excludeSelectors.some(sel => el.matches(sel))) {
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
   * Uses multiple verification methods:
   * 1. elementFromPoint sampling (may miss pointer-events:none elements)
   * 2. z-index comparison as fallback for pointer-events:none cases
   */
  const isActuallyObscuring = (focusedEl: Element, obscurer: Element, intersection: { left: number; top: number; width: number; height: number }): boolean => {
    // Calculate safe sample offsets (clamped to intersection bounds)
    const marginX = Math.min(2, intersection.width / 4);
    const marginY = Math.min(2, intersection.height / 4);

    // For very small intersections, only use center point
    const useOnlyCenter = intersection.width < 6 || intersection.height < 6;

    // Sample points within the intersection area (clamped to bounds)
    const samplePoints = useOnlyCenter
      ? [{ x: intersection.left + intersection.width / 2, y: intersection.top + intersection.height / 2 }]
      : [
          { x: intersection.left + intersection.width / 2, y: intersection.top + intersection.height / 2 }, // center
          { x: intersection.left + marginX, y: intersection.top + marginY }, // top-left
          { x: intersection.left + intersection.width - marginX, y: intersection.top + marginY }, // top-right
          { x: intersection.left + marginX, y: intersection.top + intersection.height - marginY }, // bottom-left
          { x: intersection.left + intersection.width - marginX, y: intersection.top + intersection.height - marginY }, // bottom-right
        ];

    let obscuringCount = 0;
    let nullCount = 0; // Track points where elementFromPoint returns null or hits pointer-events:none elements

    for (const point of samplePoints) {
      const topEl = document.elementFromPoint(point.x, point.y);
      if (topEl) {
        // Check if the top element is the obscurer or a descendant of it
        if (topEl === obscurer || obscurer.contains(topEl)) {
          obscuringCount++;
        }
        // If focused element is on top, it's not being obscured at this point
      } else {
        // elementFromPoint returned null (point outside viewport or hit transparent area)
        nullCount++;
      }
    }

    // For small intersections (center only), require the center to confirm obscuring
    if (useOnlyCenter) {
      if (obscuringCount >= 1) return true;
      // Fallback: if null, check z-index as pointer-events:none elements are invisible to elementFromPoint
      if (nullCount === 1) {
        return checkZIndexOrder(focusedEl, obscurer);
      }
      return false;
    }

    // For normal intersections: require at least 2/5 points
    // But if many nulls, fall back to z-index comparison
    if (obscuringCount >= 2) return true;
    if (nullCount >= 3) {
      // Many null points suggests pointer-events:none or viewport edge issues
      return checkZIndexOrder(focusedEl, obscurer);
    }
    return false;
  };

  /**
   * Fallback z-index comparison for elements with pointer-events:none
   * Returns true if obscurer appears to be above focused element in stacking order
   */
  const checkZIndexOrder = (focusedEl: Element, obscurer: Element): boolean => {
    const focusedStyle = window.getComputedStyle(focusedEl);
    const obscurerStyle = window.getComputedStyle(obscurer);

    // Get z-index values (auto = 0 for comparison purposes)
    const focusedZ = parseInt(focusedStyle.zIndex, 10) || 0;
    const obscurerZ = parseInt(obscurerStyle.zIndex, 10) || 0;

    // Fixed/sticky elements typically have high z-index or come later in DOM
    // If obscurer has higher z-index, it's likely on top
    if (obscurerZ > focusedZ) return true;

    // If same z-index, fixed/sticky position typically renders on top of static/relative
    const focusedPos = focusedStyle.position;
    const obscurerPos = obscurerStyle.position;

    if (obscurerPos === 'fixed' && (focusedPos === 'static' || focusedPos === 'relative')) {
      return true;
    }

    return false;
  };

  /**
   * Check if focused element is obscured by fixed/sticky elements (WCAG 2.4.12)
   */
  const checkFocusObscured = (focusedEl: Element): void => {
    const focusedRect = focusedEl.getBoundingClientRect();
    const focusedArea = focusedRect.width * focusedRect.height;

    if (focusedArea === 0) return;

    const obscurers = getObscurerCandidates();
    const overlaps: Array<{
      obscuredBy: { tag: string; role: string | null; name: string; selector: string };
      overlapRect: { left: number; top: number; width: number; height: number };
      overlapArea: number;
    }> = [];

    let totalOverlapArea = 0;

    obscurers.forEach((obscurer) => {
      // Don't check against self or ancestors/descendants
      if (obscurer === focusedEl || obscurer.contains(focusedEl) || focusedEl.contains(obscurer)) {
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

      totalOverlapArea += overlapArea;

      overlaps.push({
        obscuredBy: {
          tag: obscurer.tagName,
          role: obscurer.getAttribute('role'),
          name: obscurer.getAttribute('aria-label') || obscurer.textContent?.slice(0, 30) || '',
          selector: getSelector(obscurer),
        },
        overlapRect: intersection,
        overlapArea,
      });
    });

    // Clamp ratio to max 1.0 to handle overlapping obscurers covering same region
    const obscuredRatio = Math.min(totalOverlapArea / focusedArea, 1.0);

    // Only report if obscured ratio exceeds threshold
    if (obscuredRatio >= obscuredConfig.minOverlapRatio && overlaps.length > 0) {
      // Add visual annotation
      addAnnotationBox(focusedEl, `⚠ 2.4.12 Obscured (${(obscuredRatio * 100).toFixed(0)}%)`, 'focus-obscured');

      // Report to test
      (window as any).reportFocusObscured({
        element: {
          tag: focusedEl.tagName,
          role: focusedEl.getAttribute('role'),
          name: focusedEl.getAttribute('aria-label') || focusedEl.textContent?.slice(0, 30) || '',
          selector: getSelector(focusedEl),
        },
        elementRect: {
          left: focusedRect.left,
          top: focusedRect.top,
          width: focusedRect.width,
          height: focusedRect.height,
        },
        overlaps,
        obscuredRatio,
      });
    }
  };

  /**
   * Initialize focus tracker - called after page load
   */
  (window as any).initFocusTracker = () => {
    // Create overlay container
    createOverlay();

    const elements = [...document.querySelectorAll(focusableSelector)]
      .filter(isVisible)
      .filter(el => !shouldSkip(el));
    elements.forEach((el) => {
      baseStyles.set(el, captureStyle(el));
      elementSelectors.set(el, getSelector(el));
    });
    return elements.length;
  };

  /**
   * Handle focus events
   */
  document.addEventListener('focusin', (e) => {
    const el = e.target as Element;
    if (el.hasAttribute('data-focus-visited')) return;
    if (el.hasAttribute('data-focus-navigation-violation')) return;

    const pre = baseStyles.get(el);
    const focused = captureStyle(el);
    const diff: Record<string, string> = {};

    if (pre) {
      for (const p of Object.keys(pre)) {
        if (pre[p] !== focused[p]) diff[p] = focused[p];
      }
    }

    const id = focusId++;
    el.setAttribute('data-focus-visited', String(id));

    // Check if changes are actually visible (not just outline-offset without outline)
    const hasFocusStyle = isVisibleFocusChange(diff, focused);

    if (hasFocusStyle) {
      // Preserve focus appearance for screenshot
      const cssText = Object.entries(diff)
        .map(([p, v]) => `${toKebab(p)}: ${v}`)
        .join('; ');
      styleSheet.insertRule(
        `[data-focus-visited="${id}"] { ${cssText} }`,
        styleSheet.cssRules.length
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
    (window as any).reportFocus({
      id,
      tag: el.tagName,
      role: el.getAttribute('role'),
      name: el.getAttribute('aria-label') || el.textContent?.slice(0, 30),
      hasFocusStyle,
      diff,
      selector: elementSelectors.get(el) || getSelector(el),
    });

    // Check for WCAG 2.4.12 - focus obscured by fixed/sticky elements
    checkFocusObscured(el);
  });
}
