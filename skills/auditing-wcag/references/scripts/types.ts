/**
 * Common type definitions for WCAG audit scripts
 */

// =============================================================================
// Auto-play Detection Types
// =============================================================================

export interface ScreenshotRecord {
  time: string;
  path: string;
}

export interface ComparisonResult {
  compare: string;
  diffPixels: number;
  totalPixels: number;
  diffPercent: string;
  hasChange: boolean;
}

export interface ImageDiffResult {
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
}

export interface PauseControlInfo {
  found: boolean;
  controls: PauseControl[];
  carouselIndicators: CarouselIndicator[];
  hasAccessibleName: boolean;
}

export interface PauseControl {
  element: string;
  name: string;
  matchedBy: 'accessible-name' | 'class-name-near-carousel' | 'svg-icon-pattern';
  selector: string;
}

export interface CarouselIndicator {
  element: string;
  name: string;
}

export interface PauseVerificationResult {
  attempted: boolean;
  controlClicked: string | null;
  beforeClickDiffPercent: string | null;
  afterClickDiffPercent: string | null;
  pauseWorked: boolean | null;
  error: string | null;
}

export interface AutoPlayDetectionResult {
  url: string;
  screenshotRecords: ScreenshotRecord[];
  comparisons: ComparisonResult[];
  hasAutoPlayContent: boolean;
  stopsWithin5Seconds: boolean;
  pauseControls: PauseControlInfo;
  pauseVerification: PauseVerificationResult;
  recommendation: string;
}

// =============================================================================
// Focus Indicator Types
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
// Text Spacing Check Types (WCAG 1.4.12)
// =============================================================================

export interface TextSpacingIssue {
  selector: string;
  tagName: string;
  beforeMetrics: {
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
  };
  afterMetrics: {
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
  };
  overflow: string;
  overflowX: string;
  overflowY: string;
  issueType: 'horizontal-clip' | 'vertical-clip' | 'both';
}

export interface TextSpacingCheckResult {
  url: string;
  clippedElements: TextSpacingIssue[];
  totalElementsChecked: number;
}

// =============================================================================
// Zoom 200% Check Types (WCAG 1.4.4)
// =============================================================================

export interface ZoomIssue {
  selector: string;
  tagName: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  issueType: 'horizontal-scroll' | 'clipped-content';
}

export interface ZoomCheckResult {
  url: string;
  zoomFactor: number;
  viewport: { width: number; height: number };
  hasHorizontalScroll: boolean;
  documentScrollWidth: number;
  documentClientWidth: number;
  clippedElements: ZoomIssue[];
}

// =============================================================================
// Orientation Check Types (WCAG 1.3.4)
// =============================================================================

export interface OrientationState {
  lockMessageFound: boolean;
  lockMessageText: string | null;
  mainContentHidden: boolean;
  bodyWidth: number;
  bodyHeight: number;
  visibleTextLength: number;
}

export interface OrientationCheckResult {
  url: string;
  portrait: OrientationState;
  landscape: OrientationState;
  hasOrientationLock: boolean;
  lockDetectedIn: 'portrait' | 'landscape' | 'both' | 'none';
}

// =============================================================================
// Autocomplete Audit Types (WCAG 1.3.5)
// =============================================================================

export interface AutocompleteIssue {
  selector: string;
  tagName: string;
  inputType: string;
  name: string | null;
  id: string | null;
  labelText: string | null;
  currentAutocomplete: string | null;
  expectedToken: string;
  matchedBy: 'name' | 'id' | 'label' | 'placeholder';
  issueType: 'missing' | 'invalid';
}

export interface AutocompleteAuditResult {
  url: string;
  totalFieldsChecked: number;
  missingAutocomplete: AutocompleteIssue[];
  invalidAutocomplete: AutocompleteIssue[];
}

// =============================================================================
// Time Limit Detector Types (WCAG 2.2.1)
// =============================================================================

export interface MetaRefreshInfo {
  content: string;
  seconds: number;
  url: string | null;
}

export interface TimerInfo {
  type: 'setTimeout' | 'setInterval';
  delayMs: number;
  callStack: string | null;
}

export interface CountdownIndicator {
  selector: string;
  text: string;
  tagName: string;
}

export interface TimeLimitDetectorResult {
  url: string;
  metaRefresh: MetaRefreshInfo[];
  timers: TimerInfo[];
  countdownIndicators: CountdownIndicator[];
  hasTimeLimits: boolean;
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
