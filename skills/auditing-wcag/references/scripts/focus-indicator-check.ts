/**
 * Focus Indicator Visibility Check
 *
 * WCAG 2.4.7 (Focus Visible) / 2.4.11 (Focus Not Obscured)
 *
 * This script:
 * 1. Detects all focusable elements on the page
 * 2. Tabs through each element
 * 3. Captures style changes on focus (outline, box-shadow, background-color, etc.)
 * 4. Reports elements without visible focus indicators
 * 5. Takes a screenshot highlighting elements missing focus styles
 */

import { test } from '@playwright/test';
import type { FocusRecord } from './types';
import {
  FOCUSABLE_SELECTOR,
  FOCUS_STYLE_PROPERTIES,
  EXTRA_TAB_ITERATIONS,
  DEFAULT_FOCUS_OUTPUT_PATH,
} from './constants';

// =============================================================================
// Browser-injected styles for marking elements without focus indicators
// =============================================================================

const WARNING_STYLES = `
  [data-focus-missing] {
    outline: 3px solid #dc2626 !important;
    outline-offset: 2px !important;
    position: relative;
  }
  [data-focus-missing]::after {
    content: '⚠ No Focus Style';
    position: absolute;
    top: -24px;
    left: 0;
    background: #dc2626;
    color: white;
    font-size: 11px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
    z-index: 10000;
    font-family: system-ui, sans-serif;
    pointer-events: none;
  }
`;

// =============================================================================
// Test
// =============================================================================

test('focus indicator visibility', async ({ page }) => {
  const focusHistory: FocusRecord[] = [];

  // Expose function to receive focus reports from browser context
  await page.exposeFunction('reportFocus', (data: FocusRecord) => {
    focusHistory.push(data);
  });

  // Inject focus tracking script
  await page.addInitScript(createFocusTrackerScript, {
    focusableSelector: FOCUSABLE_SELECTOR,
    styleProperties: [...FOCUS_STYLE_PROPERTIES],
    warningStyles: WARNING_STYLES,
  });

  // Navigate to target page
  await page.goto('/target-page');

  // Initialize focus tracker and get element count
  const count = await page.evaluate(() => (window as any).initFocusTracker());

  // Tab through all elements
  for (let i = 0; i < count + EXTRA_TAB_ITERATIONS; i++) {
    await page.keyboard.press('Tab');
  }

  // Report results
  const elementsWithoutFocusStyle = focusHistory.filter((f) => !f.hasFocusStyle);

  if (elementsWithoutFocusStyle.length > 0) {
    console.warn('Elements without visible focus indicator:', elementsWithoutFocusStyle);
  }

  // Take screenshot with warning labels
  await page.screenshot({ path: DEFAULT_FOCUS_OUTPUT_PATH, fullPage: true });

  // Summary
  console.log('\n=== Focus Indicator Check Results ===');
  console.log(`Total focusable elements: ${focusHistory.length}`);
  console.log(`Elements with focus style: ${focusHistory.length - elementsWithoutFocusStyle.length}`);
  console.log(`Elements WITHOUT focus style: ${elementsWithoutFocusStyle.length}`);

  if (elementsWithoutFocusStyle.length > 0) {
    console.log('\nProblematic elements:');
    elementsWithoutFocusStyle.forEach((el, i) => {
      console.log(`  ${i + 1}. <${el.tag}> "${el.name}" (role: ${el.role || 'none'})`);
    });
  }

  // Strict assertion (optional - uncomment to fail test on issues)
  // expect(elementsWithoutFocusStyle).toHaveLength(0);
});

// =============================================================================
// Browser-injected script factory
// =============================================================================

function createFocusTrackerScript(args: {
  focusableSelector: string;
  styleProperties: string[];
  warningStyles: string;
}): void {
  const { focusableSelector, styleProperties, warningStyles } = args;
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
    let focusId = 0;

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
     * Initialize focus tracker - called after page load
     */
    (window as any).initFocusTracker = () => {
      const elements = [...document.querySelectorAll(focusableSelector)].filter(isVisible);
      elements.forEach((el) => baseStyles.set(el, captureStyle(el)));
      return elements.length;
    };

    /**
     * Handle focus events
     */
    document.addEventListener('focusin', (e) => {
      const el = e.target as Element;
      if (el.hasAttribute('data-focus-visited')) return;

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

      const hasFocusStyle = Object.keys(diff).length > 0;

      if (hasFocusStyle) {
        // Preserve focus appearance for screenshot
        const cssText = Object.entries(diff)
          .map(([p, v]) => `${toKebab(p)}: ${v}`)
          .join('; ');
        styleSheet.insertRule(
          `[data-focus-visited="${id}"] { ${cssText} }`,
          styleSheet.cssRules.length
        );
      } else {
        // Mark element as missing focus style
        el.setAttribute('data-focus-missing', '');
      }

      // Report to test
      (window as any).reportFocus({
        id,
        tag: el.tagName,
        role: el.getAttribute('role'),
        name: el.getAttribute('aria-label') || el.textContent?.slice(0, 30),
        hasFocusStyle,
        diff,
      });
    });
}
