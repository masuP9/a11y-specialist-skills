/**
 * Layout utilities for overflow and clipping detection.
 * Used by the reflow check (and, in the future, zoom / text-spacing checks).
 */

import type { ReflowIssue, ClippedTextElement } from '../types.js';

export interface LayoutCheckOptions {
  viewportWidth: number;
  overflowTolerance: number;
  checkSelector: string;
  allowedOverflowSelectors: readonly string[];
  /** Maximum length of captured outerHTML snippets. */
  htmlSnippetMaxLength: number;
}

export interface LayoutCheckResult {
  hasHorizontalScroll: boolean;
  documentScrollWidth: number;
  documentClientWidth: number;
  overflowingElements: ReflowIssue[];
  clippedTextElements: ClippedTextElement[];
}

/**
 * Create the browser-side layout check function.
 * This is serialized and executed in the browser context.
 */
export function createLayoutChecker(
  options: LayoutCheckOptions,
): LayoutCheckResult {
  const {
    viewportWidth,
    overflowTolerance,
    checkSelector,
    allowedOverflowSelectors,
    htmlSnippetMaxLength,
  } = options;

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

      // Always use nth-child for uniqueness
      const parent: Element | null = current.parentElement;
      if (parent) {
        const childIndex = Array.from(parent.children).indexOf(current) + 1;
        selector += `:nth-child(${childIndex})`;
      }

      path.unshift(selector);
      current = parent;
    }

    // Append element index as fallback for guaranteed uniqueness
    return path.length > 0
      ? path.join(' > ')
      : `[data-index="${elementIndex}"]`;
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
  const hasHorizontalScroll =
    documentScrollWidth > documentClientWidth + overflowTolerance;

  // Find overflowing elements
  const overflowingElements: ReflowIssue[] = [];
  const clippedTextElements: ClippedTextElement[] = [];
  // Use WeakSet to track elements by identity, not selector string
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
        ...getHtmlSnippet(element),
        rect: {
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        },
        viewportWidth,
        reason: 'overflow-right',
      });
    }
    // Check for left overflow (negative rect.left)
    else if (rect.left < -overflowTolerance) {
      seenElements.add(element);
      overflowingElements.push({
        selector,
        tagName: element.tagName.toLowerCase(),
        ...getHtmlSnippet(element),
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
        const hasText =
          element.textContent && element.textContent.trim().length > 0;
        if (hasText) {
          seenElements.add(element);
          clippedTextElements.push({
            selector,
            tagName: element.tagName.toLowerCase(),
            ...getHtmlSnippet(element),
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
