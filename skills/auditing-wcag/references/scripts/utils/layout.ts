/**
 * Layout utilities for overflow and clipping detection
 * Used by reflow-check, zoom-200-check, text-spacing-check
 */

import type { ReflowIssue, ClippedTextElement } from '../types';

export interface LayoutCheckOptions {
  viewportWidth: number;
  overflowTolerance: number;
  checkSelector: string;
  allowedOverflowSelectors: readonly string[];
}

export interface LayoutCheckResult {
  hasHorizontalScroll: boolean;
  documentScrollWidth: number;
  documentClientWidth: number;
  overflowingElements: ReflowIssue[];
  clippedTextElements: ClippedTextElement[];
}

/**
 * Generate a unique CSS selector for an element using nth-child for uniqueness
 */
export function getUniqueSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    // Always use nth-child for uniqueness
    const parent: Element | null = current.parentElement;
    if (parent) {
      const childIndex = Array.from(parent.children).indexOf(current) + 1;
      selector += `:nth-child(${childIndex})`;
    }

    path.unshift(selector);
    current = parent;
  }

  return path.join(' > ');
}

/**
 * Check if element matches any of the allowed overflow selectors
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

/**
 * Create the browser-side layout check function
 * This is serialized and executed in the browser context
 */
export function createLayoutChecker(options: LayoutCheckOptions): LayoutCheckResult {
  const {
    viewportWidth,
    overflowTolerance,
    checkSelector,
    allowedOverflowSelectors,
  } = options;

  // Helper functions (must be defined inside for browser context)
  /**
   * Generate a unique CSS selector for an element using index-based approach
   * to avoid collisions with repeated components
   */
  function getUniqueSelector(element: Element, elementIndex: number): string {
    if (element.id) {
      return `#${element.id}`;
    }

    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Always use nth-child for uniqueness (addresses Codex review feedback)
      const parent: Element | null = current.parentElement;
      if (parent) {
        const childIndex = Array.from(parent.children).indexOf(current) + 1;
        selector += `:nth-child(${childIndex})`;
      }

      path.unshift(selector);
      current = parent;
    }

    // Append element index as fallback for guaranteed uniqueness
    return path.length > 0 ? path.join(' > ') : `[data-index="${elementIndex}"]`;
  }

  function isAllowedOverflow(element: Element): boolean {
    return allowedOverflowSelectors.some((selector) => {
      try {
        return element.matches(selector) || element.closest(selector) !== null;
      } catch {
        return false;
      }
    });
  }

  function isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity) > 0
    );
  }

  // Check document-level horizontal scroll
  const scrollEl = document.scrollingElement || document.documentElement;
  const documentScrollWidth = scrollEl.scrollWidth;
  const documentClientWidth = scrollEl.clientWidth;
  const hasHorizontalScroll = documentScrollWidth > documentClientWidth + overflowTolerance;

  // Find overflowing elements
  const overflowingElements: ReflowIssue[] = [];
  const clippedTextElements: ClippedTextElement[] = [];
  // Use WeakSet to track elements by identity, not selector string (addresses Codex review)
  const seenElements = new WeakSet<Element>();

  const elements = document.querySelectorAll(checkSelector);

  elements.forEach((element, elementIndex) => {
    if (!isVisible(element) || isAllowedOverflow(element)) {
      return;
    }

    // Skip if we've already reported this element (by identity)
    if (seenElements.has(element)) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const selector = getUniqueSelector(element, elementIndex);

    // Check for right overflow (element extends beyond viewport)
    if (rect.right > viewportWidth + overflowTolerance) {
      seenElements.add(element);
      overflowingElements.push({
        selector,
        tagName: element.tagName.toLowerCase(),
        rect: {
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        },
        viewportWidth,
        reason: 'overflow-right',
      });
    }
    // Check for left overflow (negative rect.left) - addresses Codex review feedback
    else if (rect.left < -overflowTolerance) {
      seenElements.add(element);
      overflowingElements.push({
        selector,
        tagName: element.tagName.toLowerCase(),
        rect: {
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        },
        viewportWidth,
        reason: 'overflow-left',
      });
    }

    // Check for clipped text (element has overflow hidden and content is clipped)
    const style = window.getComputedStyle(element);
    const overflow = style.overflow;
    const overflowX = style.overflowX;

    const isClipped =
      overflow === 'hidden' ||
      overflow === 'clip' ||
      overflowX === 'hidden' ||
      overflowX === 'clip';

    if (isClipped && !seenElements.has(element)) {
      const scrollWidth = element.scrollWidth;
      const clientWidth = element.clientWidth;
      const scrollHeight = element.scrollHeight;
      const clientHeight = element.clientHeight;

      const hasHorizontalClip = scrollWidth > clientWidth + overflowTolerance;
      const hasVerticalClip = scrollHeight > clientHeight + overflowTolerance;

      if (hasHorizontalClip || hasVerticalClip) {
        // Only report if element has text content
        const hasText = element.textContent && element.textContent.trim().length > 0;
        if (hasText) {
          seenElements.add(element);
          clippedTextElements.push({
            selector,
            tagName: element.tagName.toLowerCase(),
            scrollWidth,
            clientWidth,
            scrollHeight,
            clientHeight,
            overflow,
            overflowX,
          });
        }
      }
    }
  });

  return {
    hasHorizontalScroll,
    documentScrollWidth,
    documentClientWidth,
    overflowingElements,
    clippedTextElements,
  };
}
