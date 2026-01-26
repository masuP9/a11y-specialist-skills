/**
 * Annotation overlay utilities for WCAG audit scripts
 *
 * Provides consistent visual annotations for audit screenshots without
 * modifying the content DOM. Uses an overlay layer with positioned boxes
 * and labels to highlight elements.
 */

// =============================================================================
// Annotation Styles
// =============================================================================

/**
 * Standard annotation color schemes
 * Colors chosen for sufficient contrast with white text
 */
export const ANNOTATION_COLORS = {
  /** Pass - Dark green with white text (contrast 7.5:1) */
  pass: { bg: '#16a34a', border: '#16a34a', text: '#ffffff' },
  /** Warning - Dark orange with white text (contrast 4.6:1) */
  warning: { bg: '#e65100', border: '#e65100', text: '#ffffff' },
  /** Fail - Dark red with white text (contrast 7.8:1) */
  fail: { bg: '#dc2626', border: '#dc2626', text: '#ffffff' },
  /** Info - Dark blue with white text (contrast 8.6:1) */
  info: { bg: '#0d47a1', border: '#0d47a1', text: '#ffffff' },
  /** Violation - Purple with white text */
  violation: { bg: '#7c3aed', border: '#7c3aed', text: '#ffffff' },
} as const;

export type AnnotationColorScheme = keyof typeof ANNOTATION_COLORS;

/**
 * CSS styles for the annotation overlay system
 * Inject these into the page using adoptedStyleSheets or a style element
 */
export const ANNOTATION_OVERLAY_STYLES = `
  .wcag-audit-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 99999;
  }

  .wcag-audit-box {
    position: absolute;
    border-width: 3px;
    border-style: solid;
    box-sizing: border-box;
    pointer-events: none;
  }

  .wcag-audit-label {
    position: absolute;
    top: -22px;
    left: -3px;
    font-size: 11px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
    font-family: system-ui, sans-serif;
  }

  /* Color scheme classes */
  .wcag-audit-box--pass {
    border-color: #16a34a;
  }
  .wcag-audit-box--pass .wcag-audit-label {
    background: #16a34a;
    color: #ffffff;
  }

  .wcag-audit-box--warning {
    border-color: #e65100;
  }
  .wcag-audit-box--warning .wcag-audit-label {
    background: #e65100;
    color: #ffffff;
  }

  .wcag-audit-box--fail {
    border-color: #dc2626;
  }
  .wcag-audit-box--fail .wcag-audit-label {
    background: #dc2626;
    color: #ffffff;
  }

  .wcag-audit-box--info {
    border-color: #0d47a1;
  }
  .wcag-audit-box--info .wcag-audit-label {
    background: #0d47a1;
    color: #ffffff;
  }

  .wcag-audit-box--violation {
    border-color: #7c3aed;
  }
  .wcag-audit-box--violation .wcag-audit-label {
    background: #7c3aed;
    color: #ffffff;
  }
`;

// =============================================================================
// Browser-Context Functions
// =============================================================================

/**
 * Annotation configuration for browser context
 */
export interface AnnotationConfig {
  /** CSS selector or element to annotate */
  selector: string;
  /** Label text to display */
  label: string;
  /** Color scheme to use */
  colorScheme: AnnotationColorScheme;
}

/**
 * Create or get the annotation overlay container
 * This function is designed to run in browser context
 *
 * @param overlayId - ID for the overlay element (default: 'wcag-audit-overlay')
 * @returns The overlay container element
 */
export function createAnnotationOverlay(overlayId = 'wcag-audit-overlay'): HTMLDivElement {
  let overlay = document.getElementById(overlayId) as HTMLDivElement | null;

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'wcag-audit-overlay';
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

  return overlay;
}

/**
 * Add an annotation box to the overlay for a given element
 * This function is designed to run in browser context
 *
 * @param element - The DOM element to annotate
 * @param label - Label text to display
 * @param colorScheme - Color scheme to use
 * @param overlayId - ID of the overlay container
 */
export function addAnnotationBox(
  element: Element,
  label: string,
  colorScheme: AnnotationColorScheme,
  overlayId = 'wcag-audit-overlay'
): void {
  const overlay = createAnnotationOverlay(overlayId);
  const rect = element.getBoundingClientRect();
  const colors = {
    pass: { bg: '#16a34a', border: '#16a34a', text: '#ffffff' },
    warning: { bg: '#e65100', border: '#e65100', text: '#ffffff' },
    fail: { bg: '#dc2626', border: '#dc2626', text: '#ffffff' },
    info: { bg: '#0d47a1', border: '#0d47a1', text: '#ffffff' },
    violation: { bg: '#7c3aed', border: '#7c3aed', text: '#ffffff' },
  };
  const color = colors[colorScheme];

  const box = document.createElement('div');
  box.className = `wcag-audit-box wcag-audit-box--${colorScheme}`;
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
  labelEl.className = 'wcag-audit-label';
  labelEl.textContent = label;
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
}

/**
 * Add annotations for multiple elements by selector
 * This function is designed to run in browser context
 *
 * @param annotations - Array of annotation configurations
 * @param overlayId - ID of the overlay container
 */
export function addAnnotations(
  annotations: AnnotationConfig[],
  overlayId = 'wcag-audit-overlay'
): void {
  const overlay = createAnnotationOverlay(overlayId);
  const colors = {
    pass: { bg: '#16a34a', border: '#16a34a', text: '#ffffff' },
    warning: { bg: '#e65100', border: '#e65100', text: '#ffffff' },
    fail: { bg: '#dc2626', border: '#dc2626', text: '#ffffff' },
    info: { bg: '#0d47a1', border: '#0d47a1', text: '#ffffff' },
    violation: { bg: '#7c3aed', border: '#7c3aed', text: '#ffffff' },
  };

  for (const annotation of annotations) {
    try {
      const element = document.querySelector(annotation.selector);
      if (!element) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const color = colors[annotation.colorScheme];

      const box = document.createElement('div');
      box.className = `wcag-audit-box wcag-audit-box--${annotation.colorScheme}`;
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
      labelEl.className = 'wcag-audit-label';
      labelEl.textContent = annotation.label;
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
}

// =============================================================================
// Playwright Helper
// =============================================================================

/**
 * Add annotations to a page using Playwright
 *
 * @param page - Playwright page object
 * @param annotations - Array of annotation configurations
 *
 * @example
 * await addPageAnnotations(page, [
 *   { selector: '#header', label: 'PASS', colorScheme: 'pass' },
 *   { selector: '.error', label: 'FAIL', colorScheme: 'fail' },
 * ]);
 */
export async function addPageAnnotations(
  page: import('@playwright/test').Page,
  annotations: AnnotationConfig[]
): Promise<void> {
  await page.evaluate((configs) => {
    // Inline the function to avoid serialization issues
    const colors = {
      pass: { bg: '#16a34a', border: '#16a34a', text: '#ffffff' },
      warning: { bg: '#e65100', border: '#e65100', text: '#ffffff' },
      fail: { bg: '#dc2626', border: '#dc2626', text: '#ffffff' },
      info: { bg: '#0d47a1', border: '#0d47a1', text: '#ffffff' },
      violation: { bg: '#7c3aed', border: '#7c3aed', text: '#ffffff' },
    };

    // Create overlay
    let overlay = document.getElementById('wcag-audit-overlay') as HTMLDivElement | null;
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
