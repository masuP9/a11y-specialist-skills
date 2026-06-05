/**
 * Constants for the WCAG audit checks shipped in @a11y-skills/audit.
 *
 * Only the constants used by the four checks (axe / focus indicator / reflow /
 * target size) are included here. Constants for the Phase 2 checks remain in the
 * skill repository until those checks are ported.
 */

// =============================================================================
// Common Disclaimer
// =============================================================================

/** Disclaimer to include in all audit results */
export const AUDIT_DISCLAIMER = {
  message:
    '自動テストで検出できるのはWCAG違反の一部です。完全な準拠確認には手動テストが必須です。',
  messageEn:
    'Automated testing can only detect a subset of WCAG violations. Manual testing is required for full compliance.',
  coverage: 'approximately 30-40%',
  moreInfo: 'https://www.w3.org/WAI/test-evaluate/preliminary/',
} as const;

/** Console disclaimer message */
export const DISCLAIMER_CONSOLE = `
Note: Automated testing detects only ~30-40% of WCAG issues.
      Manual testing is required for complete accessibility evaluation.
`;

// =============================================================================
// Axe Audit defaults (broad WCAG coverage)
// =============================================================================

/** Default axe-core tag set (WCAG 2.0/2.1/2.2 A & AA) */
export const DEFAULT_AXE_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
] as const;

// =============================================================================
// Focus Indicator Detection Constants (WCAG 2.4.7)
// =============================================================================

/** CSS properties to check for focus style changes */
export const FOCUS_STYLE_PROPERTIES = [
  'outline',
  'outlineStyle',
  'outlineColor',
  'outlineWidth',
  'outlineOffset',
  'boxShadow',
  'backgroundColor',
] as const;

/** Selector for focusable elements */
export const FOCUSABLE_SELECTOR = `
  input:not([type="hidden"]):not([disabled]),
  select:not([disabled]),
  textarea:not([disabled]),
  button:not([disabled]),
  a[href],
  [tabindex]:not([tabindex="-1"])
`.trim();

/** Extra tab iterations for safety margin */
export const EXTRA_TAB_ITERATIONS = 10;

// =============================================================================
// Focus Obscured Detection Constants (WCAG 2.4.12)
// =============================================================================

/**
 * Minimum overlap ratio to report as obscured (0-1)
 * 0.2 means 20% of the focused element must be covered
 */
export const FOCUS_OBSCURED_MIN_OVERLAP_RATIO = 0.2;

/**
 * Minimum overlap area in pixels to report
 * Ignores tiny overlaps (e.g., 1px border touches)
 */
export const FOCUS_OBSCURED_MIN_OVERLAP_PX = 8;

/**
 * Selectors to exclude from obscurer detection
 * These elements should not be considered as obscurers
 */
export const FOCUS_OBSCURED_EXCLUDE_SELECTORS = [
  '#focus-audit-overlay',
  '.focus-audit-box',
  '[data-focus-visited]',
] as const;

// =============================================================================
// Output filename defaults
// =============================================================================

/** Default screenshot filename for the focus indicator check */
export const DEFAULT_FOCUS_SCREENSHOT_FILE = 'focus-indicators.png';
/** Default result filename for the focus indicator check */
export const DEFAULT_FOCUS_RESULT_FILE = 'focus-indicator-result.json';
/** Default result filename for the axe audit */
export const DEFAULT_AXE_RESULT_FILE = 'axe-result.json';
/** Default result filename for the reflow check */
export const DEFAULT_REFLOW_RESULT_FILE = 'reflow-result.json';
/** Default screenshot filename for the reflow check */
export const DEFAULT_REFLOW_SCREENSHOT_FILE = 'reflow-screenshot.png';
/** Default result filename for the target size check */
export const DEFAULT_TARGET_SIZE_RESULT_FILE = 'target-size-result.json';
/** Default screenshot filename for the target size check */
export const DEFAULT_TARGET_SIZE_SCREENSHOT_FILE = 'target-size-screenshot.png';

// =============================================================================
// Reflow Check Constants (WCAG 1.4.10)
// =============================================================================

/** Viewport size for reflow test (320 CSS px width at 400% zoom equivalent) */
export const REFLOW_VIEWPORT = { width: 320, height: 256 } as const;

/** Tolerance for overflow detection in pixels */
export const REFLOW_OVERFLOW_TOLERANCE = 5;

/** Selector for elements to check for overflow */
export const REFLOW_CHECK_SELECTOR = `
  p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, section, article,
  a, button, input, select, textarea, label,
  img, svg, table, nav, header, footer, main, aside
`.trim();

/** Elements that are allowed to have horizontal scroll */
export const REFLOW_ALLOWED_OVERFLOW_SELECTORS = [
  'pre',
  'code',
  'table[role="presentation"]',
  '.data-table',
  '[data-allow-scroll]',
] as const;

// =============================================================================
// Target Size Check Constants (WCAG 2.5.5 / 2.5.8)
// =============================================================================

/**
 * Target Size thresholds in CSS pixels
 * - AA (2.5.8 Minimum): 24x24 px
 * - AAA (2.5.5 Enhanced): 44x44 px
 */
export const TARGET_SIZE_AA = 24;
export const TARGET_SIZE_AAA = 44;

/**
 * Selector for interactive elements (tap/click targets)
 * Includes all elements that users may tap/click to perform actions
 */
export const INTERACTIVE_SELECTOR = `
  a[href],
  button:not([disabled]),
  input:not([type="hidden"]):not([disabled]),
  select:not([disabled]),
  textarea:not([disabled]),
  [role="button"]:not([aria-disabled="true"]),
  [role="link"]:not([aria-disabled="true"]),
  [role="checkbox"]:not([aria-disabled="true"]),
  [role="radio"]:not([aria-disabled="true"]),
  [role="switch"]:not([aria-disabled="true"]),
  [role="menuitem"]:not([aria-disabled="true"]),
  [role="tab"]:not([aria-disabled="true"]),
  [role="slider"]:not([aria-disabled="true"]),
  [role="option"]:not([aria-disabled="true"]),
  [tabindex]:not([tabindex="-1"]):not([disabled]),
  summary,
  label[for],
  [onclick]:not([disabled])
`.trim();

/**
 * Tags that indicate inline context (for inline exception)
 */
export const INLINE_CONTEXT_TAGS = [
  'p',
  'li',
  'dd',
  'td',
  'th',
  'span',
  'blockquote',
  'cite',
  'figcaption',
] as const;

/**
 * Native input types controlled by user agent (for ua-control exception)
 */
export const UA_CONTROLLED_INPUT_TYPES = [
  'checkbox',
  'radio',
  'range',
  'color',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'file',
] as const;

/**
 * Minimum text length around inline link to qualify for inline exception
 */
export const INLINE_CONTEXT_MIN_TEXT = 10;
