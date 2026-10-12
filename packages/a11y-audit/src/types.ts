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
  | 'auto-play-detection'
  | 'keyboard-trap-check'
  | 'keyboard-reachability-check'
  | 'redundant-entry-check'
  | 'motion-actuation-check'
  | 'change-on-input-check';

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
// Focus Indicator (WCAG 2.4.7 / 2.4.11 / 2.4.12 / 3.2.1)
// =============================================================================

/** Element rectangle in page coordinates (viewport rect + scroll offset). */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where an element lives: which document, and which shadow roots. */
export interface FocusElementLocation {
  /**
   * The iframe document the element is in; null for the main frame. `url` is
   * that document's URL (`about:srcdoc` for a `srcdoc` frame). `selector`
   * points at the iframe element in its parent document, or is null when the
   * parent cannot be reached from the frame (cross-origin). For nested frames
   * it describes the innermost frame only.
   */
  frame: { url: string; selector: string | null } | null;
  /**
   * Selectors of the shadow hosts between the element and its document,
   * outermost first; empty outside shadow DOM. Each one is relative to the
   * root that contains the host, like `selector` (which is relative to the
   * shadow root that contains the element). Closed shadow roots are not seen.
   */
  shadowHosts: string[];
}

/**
 * Result of comparing screenshots of the area around an element before and
 * after it got focus (`screenshotDiff` option).
 *
 * `diffRatio` is the share (0-1) of pixels in the compared area that changed;
 * `rect` is the bounding box of the changed pixels in page coordinates (`null`
 * when nothing changed).
 *
 * Limits: the baseline is one full-page capture taken before the Tab walk, so
 * fixed / sticky content, animations, video, carets and anything that changes
 * with scroll position or time can show up as a difference that is not a focus
 * indicator, and a cue on an element already focused at load (autofocus) has no
 * baseline to differ from. Treat a non-zero ratio as "a cue may exist".
 * Elements inside an iframe are not compared (their `rect` is relative to the
 * iframe document), so their `visualDiff` is `null`.
 */
export interface FocusVisualDiff {
  diffRatio: number;
  rect: PageRect | null;
}

export interface FocusRecord extends FocusElementLocation {
  /**
   * Order in which focusin events were received (0-based), across the main
   * page and its iframes, so it never repeats within a record list. Not the Tab order:
   * autofocus and scripted focus also advance it, already-visited elements and
   * elements skipped after a 3.2.1 violation get none, and a retry restarts it.
   * Use `tabStep` for the Tab order.
   */
  id: number;
  /**
   * Which Tab key press (1-based, counted per page load) moved focus to this
   * element, including an element inside an iframe. null when focus arrived
   * another way (autofocus, script).
   */
  tabStep: number | null;
  /**
   * Element rectangle at the moment it received focus. Page coordinates of the
   * element's own document: inside an iframe the origin is that iframe
   * document's top-left, not the main page's (see `frame`).
   */
  rect: PageRect;
  tag: string;
  role: string | null;
  name: string;
  selector: string;
  html: string;
  htmlTruncated: boolean;
  hasFocusStyle: boolean;
  diff: Record<string, string>;
  /**
   * Screenshot comparison around the element. Absent when the `screenshotDiff`
   * option was not passed; `null` when it was passed but no comparison could be
   * made (optional `pixelmatch` / `pngjs` missing, or the capture failed).
   */
  visualDiff?: FocusVisualDiff | null;
  /**
   * Value of the attribute named by the `echoAttribute` option (`null` when
   * the element lacks it). Absent when the option was not passed.
   */
  echo?: string | null;
}

/** A WCAG 2.4.7 finding: the element plus its screenshot comparison, if any. */
export interface FocusIssue extends FocusElementRef {
  visualDiff?: FocusVisualDiff | null;
}

/** Reference to an element captured in the browser context. */
export interface FocusElementRef extends FocusElementLocation {
  tag: string;
  role: string | null;
  name: string;
  selector: string;
  html: string;
  htmlTruncated: boolean;
  /**
   * Value of the attribute named by the `echoAttribute` option (`null` when
   * the element lacks it). Absent when the option was not passed.
   */
  echo?: string | null;
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
  issues: FocusIssue[];
  /** WCAG 3.2.1 violations - focus triggered context change */
  onFocusViolations: OnFocusViolation[];
  /**
   * WCAG 2.4.12 findings (any part obscured); those with `fullyObscured` are
   * also 2.4.11 findings - focus obscured by fixed/sticky elements
   */
  focusObscuredIssues: FocusObscuredIssue[];
  /**
   * Number of elements in `focusObscuredIssues`, i.e. partly or fully
   * obscured (2.4.12). Count `fullyObscured` entries for 2.4.11. Before the
   * 2.4.11 / 2.4.12 split, only elements with 20% or more obscured counted.
   */
  elementsWithObscuredFocus: number;
  allElements: FocusRecord[];
  /** Whether test was interrupted by navigation */
  interrupted: boolean;
  interruptedAt?: number;
  /**
   * True when focus caused a navigation whose element could not be identified
   * and no later attempt identified one (the walk was then stopped by a limit,
   * ran out of retries, or did not see the navigation again). 3.2.1 is then
   * `incomplete` unless `onFocusViolations` has entries. Absent in results
   * from older versions.
   */
  unidentifiedNavigation?: boolean;
  /**
   * Set when `timeBudgetMs` or `maxTabPresses` stopped the Tab walk before it
   * finished; `null` otherwise (absent in results from older versions).
   * Elements after the stop point were not tested: `recordedCount` of
   * `focusableCount` focusable elements were recorded. Distinct from
   * `interrupted`, which means the 3.2.1 retries were exhausted.
   */
  aborted?: {
    reason: 'timeout' | 'tab-limit';
    url: string;
    recordedCount: number;
    focusableCount: number;
  } | null;
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
    echo?: string | null;
  };
  /** The overlapping area */
  overlapRect: BoundingRect;
  /** Area of overlap in square pixels */
  overlapArea: number;
}

/**
 * WCAG 2.4.12 finding (any part hidden) - focused element obscured by
 * fixed/sticky content; also a 2.4.11 finding when `fullyObscured`
 */
export interface FocusObscuredIssue {
  /** The focused element that is obscured */
  element: FocusElementRef;
  /** Bounding rect of the focused element */
  elementRect: BoundingRect;
  /** List of overlapping fixed/sticky elements */
  overlaps: FocusObscuredOverlap[];
  /** Ratio of element area that is obscured (0-1); overlapping obscurers are counted once */
  obscuredRatio: number;
  /** True when (almost) the whole element is obscured - the 2.4.11 condition */
  fullyObscured: boolean;
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
 * - spacing: a 24px circle centered on the target intersects no other target
 *   (verified geometrically, see `TargetSpacingResult`)
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
 * - verified: an exception was verified against the page geometry (currently
 *   only `spacing`) — the target conforms to SC 2.5.8 unless a neighboring
 *   target escaped detection (e.g. a click handler attached via script)
 * - possible: a heuristic matched an exception; needs manual confirmation
 * - not-assessed: the heuristics found no exception, but they cannot rule out
 *   the essential exception — needs manual confirmation
 */
export type TargetSizeExceptionAssessment =
  | 'ruled-out'
  | 'verified'
  | 'possible'
  | 'not-assessed';

/** A point in CSS px (document coordinates unless stated otherwise). */
export interface Point {
  x: number;
  y: number;
}

/** An edge-based rectangle in CSS px (document coordinates unless stated otherwise). */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Why a neighboring target breaks the SC 2.5.8 spacing exception. */
export interface TargetSpacingIntersection {
  /** Selector of the neighboring target. */
  selector: string;
  /**
   * - `target`: the 24px circle intersects the neighbor's painted area
   * - `circle`: the neighbor is undersized too and the two circles intersect
   */
  kind: 'target' | 'circle';
  /**
   * Measured distance in CSS px: circle center to the neighbor's nearest
   * painted point (`target`) or center to center (`circle`).
   */
  distance: number;
  /** Minimum distance that would have satisfied the exception (12 or 24). */
  required: number;
}

/**
 * Outcome of the SC 2.5.8 spacing exception for one undersized target: a
 * circle of `diameter` CSS px centered on the target's bounding box must not
 * intersect another target, nor the circle of another undersized target.
 */
export interface TargetSpacingResult {
  /** Circle diameter in CSS px (the AA threshold, normally 24). */
  diameter: number;
  /** Circle center in document coordinates (CSS px). */
  center: Point;
  /** `true` when no neighbor intersects — the spacing exception applies. */
  applies: boolean;
  /** Neighbors that intersect, nearest first. Empty when `applies` is `true`. */
  intersections: TargetSpacingIntersection[];
}

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
  /**
   * Spacing-exception geometry. Evaluated for every undersized (`fail-aa`)
   * target regardless of which exception was finally recorded; `null` for
   * targets that meet the AA threshold.
   */
  spacing: TargetSpacingResult | null;
}

export interface TargetSizeSummary {
  /** Number of targets failing AA (< 24px) */
  failAACount: number;
  /** Number of targets failing only AAA (24-43px) */
  failAAAOnlyCount: number;
  /** Number of targets passing (>= 44px) */
  passCount: number;
  /** Number of targets with a detected exception (possible or verified) */
  exceptedCount: number;
  /**
   * Number of targets whose exception was verified geometrically (subset of
   * `exceptedCount`); these conform to SC 2.5.8 without manual review.
   */
  verifiedCount: number;
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
  /**
   * Targets skipped because another element covers their painted center
   * (overlay, sticky header, clipped container); they are neither reported
   * nor used as spacing neighbors.
   */
  occludedTargets: number;
  /** Elements with a detected exception (possible or verified) */
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
  /**
   * Token inferred from name/id/label/placeholder. Always set on missing
   * issues; null on invalid issues whose field purpose was not inferred.
   */
  expectedToken: string | null;
  matchedBy: 'name' | 'id' | 'label' | 'placeholder' | null;
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
// Redundant Entry Check (WCAG 3.3.7)
// =============================================================================

export interface RedundantEntryField {
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
  inputType: string;
  name: string | null;
  id: string | null;
  labelText: string | null;
  autocomplete: string | null;
  /** Autofill field name (e.g. 'street-address'). */
  purpose: string;
  purposeSource: 'autocomplete' | 'name' | 'id' | 'label' | 'placeholder';
  scope: 'shipping' | 'billing' | null;
  section: string | null;
  /** Contact type token (home, work, mobile, fax, pager); null when absent. */
  contactType: string | null;
  /** False for disabled or readonly fields (earlier information, not re-entry). */
  editable: boolean;
  formSelector: string | null;
}

export interface RedundantEntryCopyControl {
  selector: string;
  tagName: string;
  text: string;
}

export interface RedundantEntryGroup {
  purpose: string;
  formSelector: string | null;
  kind: 'scoped' | 'repeated';
  /** DOM order; always 2 or more. */
  fields: RedundantEntryField[];
  copyControls: RedundantEntryCopyControl[];
}

export interface RedundantEntryCheckDetails {
  totalFieldsChecked: number;
  fieldsWithPurpose: number;
  groups: RedundantEntryGroup[];
}

export type RedundantEntryCheckResult =
  AuditCheckResult<RedundantEntryCheckDetails>;

// =============================================================================
// Motion Actuation Check (WCAG 2.5.4)
// =============================================================================

export type MotionEventType =
  | 'devicemotion'
  | 'deviceorientation'
  | 'deviceorientationabsolute';

export interface MotionListener {
  target: 'window' | 'document';
  type: MotionEventType;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  scriptId: string;
  lineNumber: number;
  columnNumber: number;
  handlerPreview: string | null;
}

export interface MotionSimulationResult {
  type: MotionEventType;
  /** null when not measured (navigation, timeout or evaluate failure). */
  eventsDispatched: number | null;
  /**
   * childList + attributes + characterData records observed during dispatch and
   * settle. null when not measured; 0 only means "dispatched, nothing changed".
   */
  domMutations: number | null;
  /**
   * Same measurement over a window of the same length without dispatching:
   * the page's own DOM changes. null when not measured.
   */
  baselineDomMutations: number | null;
  navigated: boolean;
  urlAfter: string | null;
  error: string | null;
}

export interface MotionActuationCheckDetails {
  listenerInspection: 'cdp' | 'unsupported';
  listeners: MotionListener[];
  simulation: {
    status:
      | 'ran'
      | 'disabled'
      | 'skipped-no-listeners'
      | 'skipped-document-only'
      | 'unsupported';
    results: MotionSimulationResult[];
  };
}

export type MotionActuationCheckResult =
  AuditCheckResult<MotionActuationCheckDetails>;

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
// Auto-play Detection (WCAG 2.2.2)
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

/**
 * Playback state of one `<audio>` / `<video>` (WCAG 1.4.2), read in its own
 * frame. The state fields are the last sample, taken once the screenshot
 * window (~6s after the check starts) ends; `audibleSeconds` covers all
 * samples.
 */
export interface MediaPlaybackRecord {
  tag: 'audio' | 'video';
  /**
   * Selector relative to the element's document, or to its shadow root when
   * `shadowHosts` is not empty (same rules as focus-indicator records).
   */
  selector: string;
  html: string;
  htmlTruncated: boolean;
  /**
   * The iframe document holding the element (null for the main frame).
   * `selector` is the innermost iframe element's selector in its parent
   * (same shape as focus-indicator records).
   */
  frame: { url: string; selector: string | null } | null;
  /**
   * Path from the top document to the element's document: for each iframe,
   * outermost first, the shadow hosts above it and then its selector. Each
   * entry is looked up in the document or shadow root opened by the entry
   * before it. `[]` for the main frame; null when it could not be read.
   */
  framePath: string[] | null;
  /** Shadow hosts between the element and its document, outermost first. */
  shadowHosts: string[];
  autoplay: boolean;
  loop: boolean;
  /** Whether the `controls` attribute is present. */
  controls: boolean;
  /**
   * The element has a non-zero box and `checkVisibility()` (opacity and
   * visibility included) passes for it and for every iframe element above
   * it. null when it could not be determined, including when the element,
   * an ancestor or an iframe element above it has `clip-path` (not `none`) or
   * `clip` (not `auto`). Overflow clipping and off-screen position are not
   * considered.
   */
  visible: boolean | null;
  /**
   * Seconds with sound (playing, unmuted, volume > 0, playbackRate > 0).
   * State is recorded when the check starts, on every play / pause / ended /
   * volumechange / ratechange event, with each screenshot (every ~2s) and
   * once more at the end; each state lasts until the next record. Recording
   * starts when the check starts, not at page load.
   */
  audibleSeconds: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  /**
   * The element was recorded during the check but is no longer in its
   * document. Its selector then no longer resolves.
   */
  removed: boolean;
  /**
   * The element's whole document went away during the check: its iframe was
   * removed, or the frame navigated / was replaced. The record is the last
   * one taken while the document existed (`removed` is true too), and
   * `framePath` then points at the nearest ancestor document that remains,
   * while `frame.url` keeps the original frame's URL.
   */
  documentRemoved: boolean;
  /** Seconds; null when unknown (no metadata) or endless (see `endless`). */
  duration: number | null;
  /** `duration` is Infinity (a live stream). */
  endless: boolean;
  currentTime: number;
  /**
   * Sum of the `played` time ranges, in seconds (reference only: repeated
   * loops are counted once).
   */
  playedSeconds: number;
  /** The element failed to load (`error` is set). */
  hasError: boolean;
  /**
   * Chromium's `webkitAudioDecodedByteCount`: 0 suggests no audio track was
   * decoded. null in browsers without it.
   */
  audioDecodedBytes: number | null;
  /** Pause/stop/mute/volume controls found by keyword in the same frame. */
  controlsInFrame: PauseControl[];
}

export interface AutoPlayDetectionDetails {
  screenshotRecords: ScreenshotRecord[];
  comparisons: ComparisonResult[];
  hasAutoPlayContent: boolean;
  stopsWithin5Seconds: boolean;
  pauseControls: PauseControlInfo;
  pauseVerification: PauseVerificationResult;
  recommendation: string;
  /** Every `<audio>` / `<video>` found in the page and its frames (1.4.2). */
  mediaElements: MediaPlaybackRecord[];
  /** Frames whose media could not be read (detached or navigating). */
  unmeasuredFrames: number;
}

export type AutoPlayDetectionResult =
  AuditCheckResult<AutoPlayDetectionDetails>;

// =============================================================================
// Keyboard Trap Check (WCAG 2.1.2)
// =============================================================================

export interface KeyboardTrapEvidence {
  selector: string;
  tag: string;
  name: string;
  html: string;
  htmlTruncated: boolean;
  /** Escape attempts and their outcomes (used in incomplete failure summaries). */
  escapeAttempts: {
    escape: boolean;
    shiftTab: boolean;
    closeAffordance: boolean;
  };
  /** Whether the trap container has role=dialog and aria-modal=true. */
  isAriaModal: boolean;
}

export interface KeyboardTrapCheckDetails {
  totalFocusableElements: number;
  /** Number of trap candidates detected. */
  trapCandidates: number;
  /** Traps from which no escape path worked (→ violation). */
  confirmedTraps: KeyboardTrapEvidence[];
  /** Traps that have an escape path but require manual review (→ incomplete). */
  needsReview: KeyboardTrapEvidence[];
  /**
   * `true` when the Tab walk hit the press limit before cycling through
   * every focusable element twice: traps late in the tab order may be missed.
   * Always set by this version; absent in results from versions before it
   * (treat as unknown).
   */
  tabWalkCapped?: boolean;
  /**
   * Path the screenshot was (or would be) written to. Empty string when
   * `screenshot` was disabled.
   */
  screenshotPath: string;
}

export type KeyboardTrapCheckResult =
  AuditCheckResult<KeyboardTrapCheckDetails>;

// =============================================================================
// Keyboard Reachability Check (WCAG 2.1.1)
// =============================================================================

/**
 * How an operable element was first reached. `not-evaluated` means the check
 * could not test it (aborted, budget exhausted, unsupported widget) — distinct
 * from `unreachable`, which was tested and not reached.
 */
export type KeyboardReachMethod =
  | 'tab'
  | 'arrow'
  | 'activedescendant'
  | 'unreachable'
  | 'not-evaluated';

export interface KeyboardReachabilityElement {
  selector: string;
  tag: string;
  role: string | null;
  name: string;
  html: string;
  htmlTruncated: boolean;
  /** Raw tabindex attribute, or null when absent. */
  tabindex: string | null;
  /** Why the element counts as operable (native > role > onclick > click-listener). */
  evidence: 'native' | 'role' | 'onclick' | 'click-listener';
  reachedBy: KeyboardReachMethod;
  /** Selector of the nearest composite widget (or native radio group), if any. */
  compositeSelector: string | null;
  /** 'popup' when found only after ArrowDown opened a popup (hidden at load). */
  foundIn: 'load' | 'popup';
  /** Set only when reachedBy is 'unreachable' or 'not-evaluated'. */
  reason: string | null;
  /** Set only when reachedBy is 'unreachable'. */
  confidence: 'high' | 'medium' | 'low' | null;
}

export interface KeyboardReachabilityComposite {
  selector: string;
  role: string;
  orientation: 'horizontal' | 'vertical' | 'both' | 'none';
  keysPressed: number;
  status: 'explored' | 'stopped' | 'not-explored';
  stopReason: string | null;
}

/**
 * A popup opened with ArrowDown from a combobox or aria-haspopup trigger.
 * Items are judged only when the keyboard got inside ('explored'/'stopped').
 */
export interface KeyboardReachabilityPopup {
  triggerSelector: string;
  /** aria-controls / aria-owns target, or null when found by visibility diff. */
  popupSelector: string | null;
  /**
   * 'sampled': more than KEYBOARD_REACHABILITY_POPUP_SAMPLE_THRESHOLD items;
   * entering, moving on with ArrowDown and back with ArrowUp all worked.
   * Only the visited items are listed in `elements`.
   */
  status:
    | 'explored'
    | 'sampled'
    | 'stopped'
    | 'opened-not-entered'
    | 'not-opened'
    | 'not-explored';
  /** Items (option / menuitem* / treeitem) that became visible when opened. */
  itemsFound: number;
  keysPressed: number;
  stopReason: string | null;
}

export interface KeyboardReachabilityCheckDetails {
  totalOperableElements: number;
  reachedCount: number;
  unreachableCount: number;
  /** Elements that could not be tested (reachedBy 'not-evaluated'). */
  notEvaluatedCount: number;
  /** Operable elements left out of `elements`, by first matching reason. */
  excluded: {
    disabled: number;
    inert: number;
    hidden: number;
    insideOperable: number;
  };
  /** Every operable element (reached and unreached). */
  elements: KeyboardReachabilityElement[];
  composites: KeyboardReachabilityComposite[];
  popups: KeyboardReachabilityPopup[];
  /** `true` when the Tab walk hit its press limit before cycling the page. */
  tabWalkCapped: boolean;
  /** Set when exploration stopped early for the whole page. */
  aborted: { reason: 'navigation' | 'timeout'; url: string } | null;
  /**
   * Path the screenshot was written to. Empty string when `screenshot` was
   * disabled or the check was aborted.
   */
  screenshotPath: string;
}

export type KeyboardReachabilityCheckResult =
  AuditCheckResult<KeyboardReachabilityCheckDetails>;

// =============================================================================
// Change on Input Check (WCAG 3.2.2)
// =============================================================================

export type ChangeOnInputControlKind = 'select' | 'radio' | 'checkbox' | 'text';

export type InputContextChange =
  | { kind: 'navigation'; toUrl: string }
  | { kind: 'new-window'; url: string }
  | { kind: 'focus-moved'; toSelector: string }
  | { kind: 'dialog'; dialogType: string; message: string };

export interface ChangeOnInputControl {
  selector: string;
  controlKind: ChangeOnInputControlKind;
  /** <input> type attribute, 'select' or 'textarea'. */
  type: string;
  name: string | null;
  /** Visible label text (label[for], wrapping label, aria-label), trimmed; null if none. */
  label: string | null;
  html: string;
  htmlTruncated: boolean;
}

export interface ChangeOnInputFinding {
  control: ChangeOnInputControl;
  /** What was done, e.g. 'selected option 2 "Tokyo"', 'checked', 'typed "a11y-test" and blurred'. */
  action: string;
  changes: InputContextChange[];
}

export interface ChangeOnInputCheckDetails {
  controlsFound: number;
  controlsTested: number;
  skipped: { selector: string; reason: string }[];
  findings: ChangeOnInputFinding[];
  restarts: number;
  aborted: {
    reason: 'timeout' | 'control-limit' | 'restart-limit';
    testedCount: number;
    foundCount: number;
  } | null;
}

export type ChangeOnInputCheckResult =
  AuditCheckResult<ChangeOnInputCheckDetails>;
