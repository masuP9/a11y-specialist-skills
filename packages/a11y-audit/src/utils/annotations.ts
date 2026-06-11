/**
 * Annotation overlay utilities for audit screenshots.
 *
 * Adds positioned boxes + labels over elements without modifying the content
 * DOM. Used by the target size check to highlight pass/fail targets.
 */

// =============================================================================
// Annotation Styles
// =============================================================================

/**
 * Standard annotation color schemes.
 * Colors chosen for sufficient contrast with white text.
 */
export const ANNOTATION_COLORS = {
  /** Pass - Dark green with white text */
  pass: { bg: '#16a34a', border: '#16a34a', text: '#ffffff' },
  /** Warning - Dark orange with white text */
  warning: { bg: '#e65100', border: '#e65100', text: '#ffffff' },
  /** Fail - Dark red with white text */
  fail: { bg: '#dc2626', border: '#dc2626', text: '#ffffff' },
  /** Info - Dark blue with white text */
  info: { bg: '#0d47a1', border: '#0d47a1', text: '#ffffff' },
  /** Violation - Purple with white text */
  violation: { bg: '#7c3aed', border: '#7c3aed', text: '#ffffff' },
} as const;

export type AnnotationColorScheme = keyof typeof ANNOTATION_COLORS;

/**
 * Annotation configuration for browser context.
 */
export interface AnnotationConfig {
  /** CSS selector to annotate */
  selector: string;
  /** Label text to display */
  label: string;
  /** Color scheme to use */
  colorScheme: AnnotationColorScheme;
}

// =============================================================================
// Playwright Helper
// =============================================================================

/**
 * Add annotations to a page using Playwright.
 *
 * Note: this mutates the page DOM (it appends an overlay element). Take any
 * "clean" screenshot before calling this.
 *
 * @example
 * await addPageAnnotations(page, [
 *   { selector: '#header', label: 'PASS', colorScheme: 'pass' },
 *   { selector: '.error', label: 'FAIL', colorScheme: 'fail' },
 * ]);
 */
export async function addPageAnnotations(
  page: import('@playwright/test').Page,
  annotations: AnnotationConfig[],
): Promise<void> {
  await page.evaluate((configs) => {
    // Inline the colors to avoid serialization issues
    const colors = {
      pass: { bg: '#16a34a', border: '#16a34a', text: '#ffffff' },
      warning: { bg: '#e65100', border: '#e65100', text: '#ffffff' },
      fail: { bg: '#dc2626', border: '#dc2626', text: '#ffffff' },
      info: { bg: '#0d47a1', border: '#0d47a1', text: '#ffffff' },
      violation: { bg: '#7c3aed', border: '#7c3aed', text: '#ffffff' },
    };

    // Create overlay
    let overlay = document.getElementById(
      'wcag-audit-overlay',
    ) as HTMLDivElement | null;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'wcag-audit-overlay';
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 99999;
      `;
      document.body.appendChild(overlay);
    }

    // Add annotations
    for (const config of configs) {
      try {
        const element = document.querySelector(config.selector);
        if (!element) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const color = colors[config.colorScheme as keyof typeof colors];

        const box = document.createElement('div');
        box.style.cssText = `
          position: absolute;
          left: ${rect.left + window.scrollX}px;
          top: ${rect.top + window.scrollY}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          border: 3px solid ${color.border};
          box-sizing: border-box;
          pointer-events: none;
        `;

        const labelEl = document.createElement('span');
        labelEl.textContent = config.label;
        labelEl.style.cssText = `
          position: absolute;
          top: -22px;
          left: -3px;
          background: ${color.bg};
          color: ${color.text};
          font-size: 11px;
          font-weight: bold;
          padding: 2px 6px;
          border-radius: 3px;
          white-space: nowrap;
          font-family: system-ui, sans-serif;
        `;

        box.appendChild(labelEl);
        overlay.appendChild(box);
      } catch {
        // Ignore selector errors
      }
    }
  }, annotations);
}
