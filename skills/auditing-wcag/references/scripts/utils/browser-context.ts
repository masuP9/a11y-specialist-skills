/**
 * Browser-context utility functions for WCAG audit scripts
 *
 * These functions are designed to be serialized and executed in the browser
 * context via page.evaluate(). They must be self-contained and cannot
 * reference external modules or closures.
 *
 * Usage pattern:
 *   await page.evaluate(functionName, args);
 *
 * Note: When using createBrowserHelpers, the returned object contains
 * functions that can be called directly within the browser context.
 */

// =============================================================================
// Selector Generation
// =============================================================================

/**
 * Generate a unique CSS selector for an element using nth-child for uniqueness
 *
 * @param element - The DOM element to generate a selector for
 * @param elementIndex - Optional fallback index for guaranteed uniqueness
 * @returns A CSS selector string that uniquely identifies the element
 *
 * @example
 * // In browser context:
 * const selector = getUniqueSelector(document.activeElement, 0);
 */
export function getUniqueSelector(element: Element, elementIndex?: number): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    const parentEl: Element | null = current.parentElement;
    if (parentEl) {
      const childIndex = Array.from(parentEl.children).indexOf(current) + 1;
      selector += `:nth-child(${childIndex})`;
    }

    path.unshift(selector);
    current = parentEl;
  }

  if (path.length > 0) {
    return path.join(' > ');
  }

  if (elementIndex !== undefined) {
    return `[data-index="${elementIndex}"]`;
  }

  return element.tagName.toLowerCase();
}

// =============================================================================
// Visibility Detection
// =============================================================================

/**
 * Check if an element is visible based on computed styles
 *
 * @param element - The DOM element to check
 * @returns true if the element is visible, false otherwise
 *
 * @example
 * // In browser context:
 * if (isVisible(element)) {
 *   // Process visible element
 * }
 */
export function isVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity) > 0
  );
}

// =============================================================================
// Overflow Detection
// =============================================================================

/**
 * Check if an element has hidden overflow (clips content)
 *
 * @param style - The computed style of the element
 * @returns true if the element clips overflow content
 */
export function hasHiddenOverflow(style: CSSStyleDeclaration): boolean {
  return (
    style.overflow === 'hidden' ||
    style.overflow === 'clip' ||
    style.overflowX === 'hidden' ||
    style.overflowX === 'clip' ||
    style.overflowY === 'hidden' ||
    style.overflowY === 'clip'
  );
}

/**
 * Check if element matches any of the allowed overflow selectors
 *
 * @param element - The DOM element to check
 * @param allowedSelectors - Array of CSS selectors that are allowed to overflow
 * @returns true if the element or its ancestors match an allowed selector
 */
export function isAllowedOverflow(
  element: Element,
  allowedSelectors: readonly string[]
): boolean {
  return allowedSelectors.some((selector) => {
    try {
      return element.matches(selector) || element.closest(selector) !== null;
    } catch {
      return false;
    }
  });
}

// =============================================================================
// Browser Helpers Factory
// =============================================================================

/**
 * Options for creating browser helper functions
 */
export interface BrowserHelpersOptions {
  /** Selectors that are allowed to have horizontal overflow */
  allowedOverflowSelectors?: readonly string[];
}

/**
 * Browser helper functions returned by createBrowserHelpers
 */
export interface BrowserHelpers {
  getUniqueSelector: (element: Element, elementIndex?: number) => string;
  isVisible: (element: Element) => boolean;
  hasHiddenOverflow: (style: CSSStyleDeclaration) => boolean;
  isAllowedOverflow: (element: Element) => boolean;
}

/**
 * Create a set of browser helper functions for use in page.evaluate()
 *
 * This factory function returns an object with all common browser-context
 * utilities pre-configured. Use this when you need multiple helpers in
 * a single evaluate call.
 *
 * @param options - Configuration options for the helpers
 * @returns An object containing browser helper functions
 *
 * @example
 * const result = await page.evaluate((options) => {
 *   const helpers = createBrowserHelpers(options);
 *   const elements = document.querySelectorAll('div');
 *   return Array.from(elements)
 *     .filter(el => helpers.isVisible(el))
 *     .map((el, i) => ({
 *       selector: helpers.getUniqueSelector(el, i),
 *       tagName: el.tagName.toLowerCase(),
 *     }));
 * }, { allowedOverflowSelectors: ['pre', 'code'] });
 */
export function createBrowserHelpers(options: BrowserHelpersOptions = {}): BrowserHelpers {
  const { allowedOverflowSelectors = [] } = options;

  return {
    getUniqueSelector(element: Element, elementIndex?: number): string {
      if (element.id) {
        return `#${element.id}`;
      }

      const path: string[] = [];
      let current: Element | null = element;

      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();

        const parentEl: Element | null = current.parentElement;
        if (parentEl) {
          const childIndex = Array.from(parentEl.children).indexOf(current) + 1;
          selector += `:nth-child(${childIndex})`;
        }

        path.unshift(selector);
        current = parentEl;
      }

      if (path.length > 0) {
        return path.join(' > ');
      }

      if (elementIndex !== undefined) {
        return `[data-index="${elementIndex}"]`;
      }

      return element.tagName.toLowerCase();
    },

    isVisible(element: Element): boolean {
      const style = window.getComputedStyle(element);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) > 0
      );
    },

    hasHiddenOverflow(style: CSSStyleDeclaration): boolean {
      return (
        style.overflow === 'hidden' ||
        style.overflow === 'clip' ||
        style.overflowX === 'hidden' ||
        style.overflowX === 'clip' ||
        style.overflowY === 'hidden' ||
        style.overflowY === 'clip'
      );
    },

    isAllowedOverflow(element: Element): boolean {
      return allowedOverflowSelectors.some((selector) => {
        try {
          return element.matches(selector) || element.closest(selector) !== null;
        } catch {
          return false;
        }
      });
    },
  };
}
