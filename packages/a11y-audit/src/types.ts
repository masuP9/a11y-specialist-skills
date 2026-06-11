/**
 * Type definitions for the WCAG audit checks shipped in @a11y-skills/audit.
 *
 * Every check returns the same axe-style envelope (`AuditCheckResult`):
 * findings are normalized into `violations` / `incomplete` / `passes` /
 * `inapplicable` rule arrays, while the check-specific evidence (measurements,
 * screenshots, raw element records) lives under `details`.
 *
 * Classification policy: a finding is only a `violation` when the detection
 * has no known blind spots and no WCAG exception could apply. Everything else
 * (most heuristic detections) lands in `incomplete` — the manual-review queue.
 */

import type { AUDIT_DISCLAIMER } from './constants.js';

// =============================================================================
// Normalized envelope (axe-style common format)
// =============================================================================

/** Identifier of the check that produced a result. */
export type CheckSource =
  | 'axe-audit'
  | 'focus-indicator-check'
  | 'reflow-check'
  | 'target-size-check'
  | 'text-spacing-check'
  | 'zoom-200-check'
  | 'orientation-check'
  | 'autocomplete-audit'
  | 'time-limit-detector'
  | 'auto-play-detection';

export type NormalizedImpact = 'critical' | 'serious' | 'moderate' | 'minor';

/** One affected element (or the page itself, `target: ['html']`). */
export interface NormalizedNode {
  /** CSS selector path. Page-level findings use `['html']`. */
  target: string[];
  /**
   * outerHTML snippet (possibly truncated). When the source element's HTML
   * could not be captured, a short synthetic representation is generated from
   * the tag/role/name instead — never an empty string.
   */
  html: string;
  /** Whether `html` was truncated to the snippet length limit. */
  htmlTruncated: boolean;
  /** Human-readable description of why this node was flagged. */
  failureSummary: string;
}

/** One rule's outcome, axe-style. */
export interface NormalizedRuleResult {
  /** Namespaced rule id, e.g. `a11y-skills/focus-visible` (axe rules keep their own ids). */
  id: string;
  impact: NormalizedImpact | null;
  description: string;
  help: string;
  /** W3C Understanding document (or axe docs for axe rules). */
  helpUrl: string;
  /** axe-style tags: `a11y-skills`, `wcag2aa` / `wcag21aa` / `wcag22aa`, `wcag247`-style SC tags. */
  tags: string[];
  nodes: NormalizedNode[];
}

/** Rule-level counts derived from the four buckets (not from `details`). */
export interface AuditResultSummary {
  /** Number of rules in `violations`. */
  violationCount: number;
  /** Number of rules in `incomplete`. */
  incompleteCount: number;
  /** Number of rules in `passes`. */
  passCount: number;
  /** Number of elements the check examined, when the check can count them. */
  checkedNodes?: number;
}

/** Common envelope returned (and saved as JSON) by every check. */
export interface AuditCheckResult<TDetails> {
  source: CheckSource;
  url: string;
  timestamp: string;
  /** Confirmed findings — detection has no blind spot and no exception can apply. */
  violations: NormalizedRuleResult[];
  /** Findings that need manual confirmation (heuristic detections, possible exceptions). */
  incomplete: NormalizedRuleResult[];
  /** Rules that ran and found nothing (nodes omitted). */
  passes: NormalizedRuleResult[];
  /** Rules that had nothing to examine on this page. */
  inapplicable: NormalizedRuleResult[];
  summary: AuditResultSummary;
  /** Check-specific evidence; sufficient to re-derive the buckets above. */
  details: TDetails;
  disclaimer: typeof AUDIT_DISCLAIMER;
}

// =============================================================================
// Axe Audit (broad WCAG coverage)
// =============================================================================

/** Execution configuration; rule/node data is fully held in the envelope buckets. */
export interface AxeAuditDetails {
  /** axe-core tags the run was filtered by. */
  tagsRun: string[];
  /** Rule overrides forwarded to axe, if any. */
  rulesOverride: Record<string, { enabled: boolean }> | null;
  /** Raw axe result counts (rule-level). */
  violationRuleCount: number;
  passRuleCount: number;
  incompleteRuleCount: number;
  inapplicableRuleCount: number;
}

export type AxeAuditResult = AuditCheckResult<AxeAuditDetails>;

// =============================================================================
// Focus Indicator (WCAG 2.4.7 / 2.4.11 / 3.2.1)
// =============================================================================

export interface FocusRecord {
  id: number;
  tag: string;
  role: string | null;
  name: string;
  selector: string;
  html: string;
  htmlTruncated: boolean;
  hasFocusStyle: boolean;
  diff: Record<string, string>;
}

/** Reference to an element captured in the browser context. */
export interface FocusElementRef {
  tag: string;
  role: string | null;
  name: string;
  selector: string;
  html: string;
  htmlTruncated: boolean;
}

/**
 * WCAG 3.2.1 On Focus violation - context change triggered by focus
 */
export interface OnFocusViolation {
  /** Element that triggered the navigation */
  element: FocusElementRef;
  /** URL before focus */
  fromUrl: string;
  /** URL after focus (navigation target) */
  toUrl: string;
  /** Type of context change */
  changeType: 'navigation' | 'new-window' | 'dialog';
}

export interface FocusCheckDetails {
  totalFocusableElements: number;
  elementsWithFocusStyle: number;
  elementsWithoutFocusStyle: number;
  /** WCAG 2.4.7 findings (no computed-style change on focus) */
  issues: FocusElementRef[];
  /** WCAG 3.2.1 violations - focus triggered context change */
  onFocusViolations: OnFocusViolation[];
  /** WCAG 2.4.11/2.4.12 findings - focus obscured by fixed/sticky elements */
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

export type FocusCheckResult = AuditCheckResult<FocusCheckDetails>;

// =============================================================================
// Focus Obscured (WCAG 2.4.11 / 2.4.12)
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
 * WCAG 2.4.11/2.4.12 finding - focus indicator hidden by fixed/sticky content
 */
export interface FocusObscuredIssue {
  /** The focused element that is obscured */
  element: FocusElementRef;
  /** Bounding rect of the focused element */
  elementRect: BoundingRect;
  /** List of overlapping fixed/sticky elements */
  overlaps: FocusObscuredOverlap[];
  /** Ratio of element area that is obscured (0-1) */
  obscuredRatio: number;
}

// =============================================================================
// Reflow Check (WCAG 1.4.10)
// =============================================================================

export interface ReflowIssue {
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
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
  html: string;
  htmlTruncated: boolean;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  overflow: string;
  overflowX: string;
}

export interface ReflowCheckDetails {
  viewport: { width: number; height: number };
  hasHorizontalScroll: boolean;
  documentScrollWidth: number;
  documentClientWidth: number;
  overflowingElements: ReflowIssue[];
  clippedTextElements: ClippedTextElement[];
}

export type ReflowCheckResult = AuditCheckResult<ReflowCheckDetails>;

// =============================================================================
// Target Size Check (WCAG 2.5.5 / 2.5.8)
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

/**
 * How thoroughly the SC 2.5.8 exceptions were assessed for a target.
 * - ruled-out: every exception was checked and none applies — the finding is a
 *   confirmed violation
 * - possible: a heuristic matched an exception; needs manual confirmation
 * - not-assessed: the heuristics found no exception, but they cannot rule out
 *   the essential exception — needs manual confirmation
 */
export type TargetSizeExceptionAssessment =
  | 'ruled-out'
  | 'possible'
  | 'not-assessed';

export interface TargetSizeIssue {
  /** CSS selector for the element */
  selector: string;
  /** HTML tag name */
  tagName: string;
  html: string;
  htmlTruncated: boolean;
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
  /** Exception-coverage of the assessment (drives violation vs incomplete) */
  exceptionAssessment: TargetSizeExceptionAssessment;
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

export interface TargetSizeCheckDetails {
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
  /** Per-target counts */
  summary: TargetSizeSummary;
}

export type TargetSizeCheckResult = AuditCheckResult<TargetSizeCheckDetails>;

// =============================================================================
// Text Spacing Check (WCAG 1.4.12)
// =============================================================================

export interface TextSpacingIssue {
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
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

export interface TextSpacingCheckDetails {
  clippedElements: TextSpacingIssue[];
  totalElementsChecked: number;
}

export type TextSpacingCheckResult = AuditCheckResult<TextSpacingCheckDetails>;

// =============================================================================
// Zoom 200% Check (WCAG 1.4.4)
// =============================================================================

export interface ZoomIssue {
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  issueType: 'horizontal-scroll' | 'clipped-content';
}

export interface ZoomCheckDetails {
  zoomFactor: number;
  viewport: { width: number; height: number };
  hasHorizontalScroll: boolean;
  documentScrollWidth: number;
  documentClientWidth: number;
  clippedElements: ZoomIssue[];
}

export type ZoomCheckResult = AuditCheckResult<ZoomCheckDetails>;

// =============================================================================
// Orientation Check (WCAG 1.3.4)
// =============================================================================

export interface OrientationState {
  lockMessageFound: boolean;
  lockMessageText: string | null;
  mainContentHidden: boolean;
  bodyWidth: number;
  bodyHeight: number;
  visibleTextLength: number;
}

export interface OrientationCheckDetails {
  portrait: OrientationState;
  landscape: OrientationState;
  hasOrientationLock: boolean;
  lockDetectedIn: 'portrait' | 'landscape' | 'both' | 'none';
}

export type OrientationCheckResult = AuditCheckResult<OrientationCheckDetails>;

// =============================================================================
// Autocomplete Audit (WCAG 1.3.5)
// =============================================================================

export interface AutocompleteIssue {
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
  inputType: string;
  name: string | null;
  id: string | null;
  labelText: string | null;
  currentAutocomplete: string | null;
  expectedToken: string;
  matchedBy: 'name' | 'id' | 'label' | 'placeholder';
  issueType: 'missing' | 'invalid';
}

export interface AutocompleteAuditDetails {
  totalFieldsChecked: number;
  missingAutocomplete: AutocompleteIssue[];
  invalidAutocomplete: AutocompleteIssue[];
}

export type AutocompleteAuditResult =
  AuditCheckResult<AutocompleteAuditDetails>;

// =============================================================================
// Time Limit Detector (WCAG 2.2.1)
// =============================================================================

export interface MetaRefreshInfo {
  content: string;
  seconds: number;
  url: string | null;
  html: string;
  htmlTruncated: boolean;
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
  html: string;
  htmlTruncated: boolean;
}

export interface TimeLimitDetectorDetails {
  metaRefresh: MetaRefreshInfo[];
  timers: TimerInfo[];
  countdownIndicators: CountdownIndicator[];
  hasTimeLimits: boolean;
}

export type TimeLimitDetectorResult =
  AuditCheckResult<TimeLimitDetectorDetails>;

// =============================================================================
// Auto-play Detection (WCAG 1.4.2 / 2.2.2)
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

export interface PauseControl {
  element: string;
  name: string;
  matchedBy:
    | 'accessible-name'
    | 'class-name-near-carousel'
    | 'svg-icon-pattern';
  selector: string;
}

export interface CarouselIndicator {
  element: string;
  name: string;
}

export interface PauseControlInfo {
  found: boolean;
  controls: PauseControl[];
  carouselIndicators: CarouselIndicator[];
  hasAccessibleName: boolean;
}

export interface PauseVerificationResult {
  attempted: boolean;
  controlClicked: string | null;
  beforeClickDiffPercent: string | null;
  afterClickDiffPercent: string | null;
  pauseWorked: boolean | null;
  error: string | null;
}

export interface AutoPlayDetectionDetails {
  screenshotRecords: ScreenshotRecord[];
  comparisons: ComparisonResult[];
  hasAutoPlayContent: boolean;
  stopsWithin5Seconds: boolean;
  pauseControls: PauseControlInfo;
  pauseVerification: PauseVerificationResult;
  recommendation: string;
}

export type AutoPlayDetectionResult =
  AuditCheckResult<AutoPlayDetectionDetails>;
