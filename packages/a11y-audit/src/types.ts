/**
 * Type definitions for the WCAG audit checks shipped in @masup9/a11y-audit.
 */

import type { AUDIT_DISCLAIMER } from './constants.js';

// =============================================================================
// Axe Audit Types (broad WCAG coverage)
// =============================================================================

export interface AxeViolationNode {
  html: string;
  target: string[];
  failureSummary: string | undefined;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeViolationNode[];
}

export interface AxeAuditResult {
  url: string;
  timestamp: string;
  violations: AxeViolation[];
  passes: number;
  incomplete: number;
  inapplicable: number;
  violationCount: number;
  disclaimer: typeof AUDIT_DISCLAIMER;
}

// =============================================================================
// Focus Indicator Types (WCAG 2.4.7)
// =============================================================================

export interface FocusRecord {
  id: number;
  tag: string;
  role: string | null;
  name: string;
  hasFocusStyle: boolean;
  diff: Record<string, string>;
}

/**
 * WCAG 3.2.1 On Focus violation - context change triggered by focus
 */
export interface OnFocusViolation {
  /** Element that triggered the navigation */
  element: {
    tag: string;
    role: string | null;
    name: string;
    selector: string;
  };
  /** URL before focus */
  fromUrl: string;
  /** URL after focus (navigation target) */
  toUrl: string;
  /** Type of context change */
  changeType: 'navigation' | 'new-window' | 'dialog';
}

export interface FocusCheckResult {
  url: string;
  totalFocusableElements: number;
  elementsWithFocusStyle: number;
  elementsWithoutFocusStyle: number;
  /** WCAG 2.4.7 violations */
  issues: Array<{
    tag: string;
    role: string | null;
    name: string;
  }>;
  /** WCAG 3.2.1 violations - focus triggered context change */
  onFocusViolations: OnFocusViolation[];
  /** WCAG 2.4.12 violations - focus obscured by fixed/sticky elements */
  focusObscuredIssues: FocusObscuredIssue[];
  elementsWithObscuredFocus: number;
  allElements: FocusRecord[];
  /** Whether test was interrupted by navigation */
  interrupted: boolean;
  interruptedAt?: number;
  /**
   * Path the screenshot was (or would be) written to. Empty string when
   * `screenshot` was disabled and no screenshot file was produced.
   */
  screenshotPath: string;
}

// =============================================================================
// Focus Obscured Types (WCAG 2.4.12)
// =============================================================================

/**
 * Bounding rect for overlap calculations
 */
export interface BoundingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Information about an element obscuring the focused element
 */
export interface FocusObscuredOverlap {
  /** The element causing the obscuring */
  obscuredBy: {
    tag: string;
    role: string | null;
    name: string;
    selector: string;
  };
  /** The overlapping area */
  overlapRect: BoundingRect;
  /** Area of overlap in square pixels */
  overlapArea: number;
}

/**
 * WCAG 2.4.12 violation - focus indicator hidden by fixed/sticky content
 */
export interface FocusObscuredIssue {
  /** The focused element that is obscured */
  element: {
    tag: string;
    role: string | null;
    name: string;
    selector: string;
  };
  /** Bounding rect of the focused element */
  elementRect: BoundingRect;
  /** List of overlapping fixed/sticky elements */
  overlaps: FocusObscuredOverlap[];
  /** Ratio of element area that is obscured (0-1) */
  obscuredRatio: number;
}

// =============================================================================
// Reflow Check Types (WCAG 1.4.10)
// =============================================================================

export interface ReflowIssue {
  selector: string;
  tagName: string;
  rect: {
    left: number;
    right: number;
    width: number;
  };
  viewportWidth: number;
  reason: 'overflow-right' | 'overflow-left' | 'clipped-text';
}

export interface ClippedTextElement {
  selector: string;
  tagName: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  overflow: string;
  overflowX: string;
}

export interface ReflowCheckResult {
  url: string;
  viewport: { width: number; height: number };
  hasHorizontalScroll: boolean;
  documentScrollWidth: number;
  documentClientWidth: number;
  overflowingElements: ReflowIssue[];
  clippedTextElements: ClippedTextElement[];
}

// =============================================================================
// Target Size Check Types (WCAG 2.5.5 / 2.5.8)
// =============================================================================

/**
 * Exception types for WCAG 2.5.8 Target Size (Minimum)
 * - inline: Target is in a sentence or text block
 * - redundant: Another target with same function meets size requirement
 * - ua-control: Size is determined by user agent (native controls)
 * - spacing: Target has sufficient spacing from adjacent targets
 * - essential-review: May be essential exception but requires manual review
 */
export type TargetSizeException =
  | 'inline'
  | 'redundant'
  | 'ua-control'
  | 'spacing'
  | 'essential-review';

export interface TargetSizeIssue {
  /** CSS selector for the element */
  selector: string;
  /** HTML tag name */
  tagName: string;
  /** ARIA role if present */
  role: string | null;
  /** Computed accessible name */
  accessibleName: string | null;
  /** Element width in CSS pixels */
  width: number;
  /** Element height in CSS pixels */
  height: number;
  /** Smallest dimension (min of width/height) */
  minDimension: number;
  /** Pass/fail level */
  level: 'fail-aa' | 'fail-aaa-only' | 'pass';
  /** Exception that may apply */
  exception: TargetSizeException | null;
  /** Human-readable exception details */
  exceptionDetails: string | null;
  /** Link href for redundancy check */
  href: string | null;
}

export interface TargetSizeSummary {
  /** Number of targets failing AA (< 24px) */
  failAACount: number;
  /** Number of targets failing only AAA (24-43px) */
  failAAAOnlyCount: number;
  /** Number of targets passing (>= 44px) */
  passCount: number;
  /** Number of targets with possible exceptions */
  exceptedCount: number;
}

export interface TargetSizeCheckResult {
  /** Page URL */
  url: string;
  /** Total interactive elements checked */
  totalTargetsChecked: number;
  /** Elements failing AA threshold (< 24px) */
  failAA: TargetSizeIssue[];
  /** Elements failing only AAA threshold (24-43px) */
  failAAAOnly: TargetSizeIssue[];
  /** Number of elements passing (>= 44px) */
  passedTargets: number;
  /** Elements with possible exceptions */
  exceptedTargets: TargetSizeIssue[];
  /** Summary counts */
  summary: TargetSizeSummary;
}
