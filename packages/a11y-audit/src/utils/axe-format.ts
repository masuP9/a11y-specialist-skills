/**
 * Pure mappers from check-specific `details` to the axe-style buckets
 * (`violations` / `incomplete` / `passes` / `inapplicable`), plus the envelope
 * assembler and the opt-in cross-check merge.
 *
 * Everything here is browser-independent: the runners gather evidence into a
 * details object, and these functions derive the normalized view from it.
 * Because the details objects are part of the saved JSON, the buckets can be
 * re-derived from a result file at any time.
 */

import type {
  AccessibleAuthenticationCheckDetails,
  AuditCheckResult,
  AuthField,
  AuthFieldKind,
  AuditResultSummary,
  AutocompleteAuditDetails,
  AutoPlayDetectionDetails,
  ChangeOnInputCheckDetails,
  CheckSource,
  FocusCheckDetails,
  FocusElementRef,
  FocusObscuredIssue,
  FocusOrderCheckDetails,
  FocusOrderStop,
  FocusVisualDiff,
  KeyboardReachabilityCheckDetails,
  KeyboardTrapCheckDetails,
  MediaPlaybackRecord,
  MotionActuationCheckDetails,
  MotionListener,
  MotionSimulationResult,
  NonTextContrastCheckDetails,
  NonTextContrastComponent,
  NonTextContrastComponentKind,
  NonTextContrastIndicator,
  NonTextContrastUndeterminedReason,
  NormalizedImpact,
  NormalizedNode,
  NormalizedRuleResult,
  OrientationCheckDetails,
  PointerCancellationChange,
  PointerCancellationCheckDetails,
  PointerCancellationTarget,
  PointerGestureCheckDetails,
  PointerGestureCriterion,
  PointerGestureSignal,
  RedundantEntryCheckDetails,
  ReflowCheckDetails,
  TargetSizeCheckDetails,
  TargetSizeIssue,
  TextSpacingCheckDetails,
  TimeLimitDetectorDetails,
  ZoomCheckDetails,
} from '../types.js';
import {
  AUDIT_DISCLAIMER,
  AUTH_EXPECTED_AUTOCOMPLETE,
  HTML_SNIPPET_MAX_LENGTH,
  MOTION_MUTATION_MARGIN,
  NON_TEXT_CONTRAST_MAX_COMPONENTS,
  NON_TEXT_CONTRAST_MAX_ICON_PARTS,
  POINTER_GESTURE_CRITERIA_BY_SIGNAL,
  POINTER_GESTURE_DELEGATION_MIN_TYPES,
  POINTER_GESTURE_MAX_CANDIDATES,
  POINTER_GESTURE_MAX_LISTENER_NODES,
} from '../constants.js';
import { getRule, type RuleKey } from './rule-registry.js';
import { describeTargetSpacing } from './target-spacing.js';

// =============================================================================
// Buckets
// =============================================================================

export interface NormalizedBuckets {
  violations: NormalizedRuleResult[];
  incomplete: NormalizedRuleResult[];
  passes: NormalizedRuleResult[];
  inapplicable: NormalizedRuleResult[];
  /** Number of elements the check examined, when countable. */
  checkedNodes?: number;
}

function emptyBuckets(): NormalizedBuckets {
  return { violations: [], incomplete: [], passes: [], inapplicable: [] };
}

function ruleResult(
  key: RuleKey,
  nodes: NormalizedNode[],
): NormalizedRuleResult {
  const meta = getRule(key);
  return {
    id: meta.id,
    impact: meta.impact,
    description: meta.description,
    help: meta.help,
    helpUrl: meta.helpUrl,
    tags: [...meta.tags],
    nodes,
  };
}

/**
 * Route a rule's findings into the right bucket:
 * not applicable → `inapplicable`, no findings → `passes`, findings →
 * the registry's classification (or an explicit override).
 */
function bucketize(
  buckets: NormalizedBuckets,
  key: RuleKey,
  nodes: NormalizedNode[],
  applicable: boolean,
  override?: 'violation' | 'incomplete',
): void {
  if (!applicable) {
    buckets.inapplicable.push(ruleResult(key, []));
    return;
  }
  if (nodes.length === 0) {
    buckets.passes.push(ruleResult(key, []));
    return;
  }
  const classification = override ?? getRule(key).classification;
  (classification === 'violation'
    ? buckets.violations
    : buckets.incomplete
  ).push(ruleResult(key, nodes));
}

// =============================================================================
// Node helpers
// =============================================================================

interface ElementEvidence {
  selector: string;
  html?: string;
  htmlTruncated?: boolean;
  tagName?: string;
  tag?: string;
}

/** Build a node from element evidence, synthesizing `html` when missing. */
function toNode(el: ElementEvidence, failureSummary: string): NormalizedNode {
  const tag = (el.tagName ?? el.tag ?? 'element').toLowerCase();
  const html = el.html && el.html.length > 0 ? el.html : `<${tag}>`;
  return {
    target: [el.selector],
    html,
    htmlTruncated: el.htmlTruncated ?? false,
    failureSummary,
  };
}

/** Build a page-level node (`target: ['html']`). */
function pageNode(failureSummary: string): NormalizedNode {
  return {
    target: ['html'],
    html: '<html>',
    htmlTruncated: false,
    failureSummary,
  };
}

function describeElement(ref: FocusElementRef): string {
  return `<${ref.tag.toLowerCase()}> "${ref.name}"`;
}

// =============================================================================
// Envelope assembly
// =============================================================================

/** Assemble the common envelope from a check's details and buckets. */
export function buildAuditResult<TDetails>(args: {
  source: CheckSource;
  url: string;
  details: TDetails;
  buckets: NormalizedBuckets;
  timestamp?: string;
}): AuditCheckResult<TDetails> {
  const { source, url, details, buckets, timestamp } = args;
  const summary: AuditResultSummary = {
    violationCount: buckets.violations.length,
    incompleteCount: buckets.incomplete.length,
    passCount: buckets.passes.length,
  };
  if (buckets.checkedNodes !== undefined) {
    summary.checkedNodes = buckets.checkedNodes;
  }
  return {
    source,
    url,
    timestamp: timestamp ?? new Date().toISOString(),
    violations: buckets.violations,
    incomplete: buckets.incomplete,
    passes: buckets.passes,
    inapplicable: buckets.inapplicable,
    summary,
    details,
    disclaimer: AUDIT_DISCLAIMER,
  };
}

// =============================================================================
// Per-check normalizers
// =============================================================================

/**
 * Message for an element with no computed-style change on focus. `visualDiff`
 * is undefined without `screenshotDiff`, and null when it could not be taken.
 */
function describeMissingFocusStyle(
  el: FocusElementRef,
  visualDiff: FocusVisualDiff | null | undefined,
): string {
  const base = `${describeElement(el)} shows no computed-style change on focus `;
  if (visualDiff && visualDiff.diffRatio > 0) {
    return (
      base +
      `(outline, box-shadow, background-color), but the screenshot differs ` +
      `around it (${(visualDiff.diffRatio * 100).toFixed(2)}% of the compared ` +
      'area changed). A focus indicator may exist (pseudo-element, parent or ' +
      'another element); verify manually that the change is a visible focus ' +
      'indicator and not fixed/sticky content or an animation.'
    );
  }
  if (visualDiff) {
    return (
      base +
      '(outline, box-shadow, background-color) and the screenshot shows no ' +
      'visual change around it. No focus indicator was found; verify manually ' +
      '(canvas or content outside the compared area is not detected).'
    );
  }
  return (
    base +
    '(outline, box-shadow, background-color). Verify manually whether a ' +
    'visual focus indicator exists (pseudo-elements, canvas, or parent ' +
    'changes are not detected).'
  );
}

export function normalizeFocusCheck(
  details: FocusCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const applicable = details.totalFocusableElements > 0;
  buckets.checkedNodes = details.totalFocusableElements;

  bucketize(
    buckets,
    'focus-visible',
    details.issues.map((el) =>
      toNode(el, describeMissingFocusStyle(el, el.visualDiff)),
    ),
    applicable,
  );

  // Focus changed the page but the element was never identified (retries ran
  // out, or a limit stopped the restart): 3.2.1 can neither pass nor be
  // inapplicable. Confirmed violations still take precedence.
  const unattributedNavigation =
    (details.interrupted || details.unidentifiedNavigation === true) &&
    details.onFocusViolations.length === 0;
  bucketize(
    buckets,
    'no-context-change-on-focus',
    unattributedNavigation
      ? [
          pageNode(
            'Focus triggered a navigation, but the element that caused it ' +
              'could not be identified before retries ran out. Verify manually ' +
              'which element changes the context on focus.',
          ),
        ]
      : details.onFocusViolations.map((v) =>
          toNode(
            v.element,
            `Focusing ${describeElement(v.element)} triggered a ${v.changeType} ` +
              `from ${v.fromUrl} to ${v.toUrl}.`,
          ),
        ),
    applicable || unattributedNavigation,
    unattributedNavigation ? 'incomplete' : undefined,
  );

  // `checkDismiss`: only 2.4.11 exempts content the user can dismiss
  // without moving focus.
  const obscuredNode = (issue: FocusObscuredIssue, checkDismiss: boolean) =>
    toNode(
      issue.element,
      `${describeElement(issue.element)} is ${(issue.obscuredRatio * 100).toFixed(0)}% ` +
        `obscured when focused (${issue.fullyObscured ? 'fully' : 'not fully'} obscured; by ${issue.overlaps
          .map((o) => `<${o.obscuredBy.tag.toLowerCase()}>`)
          .join(', ')}). Verify whether the focused element is hidden` +
        (checkDismiss
          ? ' and whether the user can dismiss the covering content without moving focus.'
          : '.'),
    );

  // 2.4.11 fails only for a fully hidden element; 2.4.12 for any hidden part.
  bucketize(
    buckets,
    'focus-not-obscured',
    details.focusObscuredIssues
      .filter((issue) => issue.fullyObscured)
      .map((issue) => obscuredNode(issue, true)),
    applicable,
  );

  bucketize(
    buckets,
    'focus-not-obscured-enhanced',
    details.focusObscuredIssues.map((issue) => obscuredNode(issue, false)),
    applicable,
  );

  return buckets;
}

export function normalizeReflowCheck(
  details: ReflowCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();

  const overflowNodes = details.overflowingElements.map((el) =>
    toNode(
      el,
      `<${el.tagName}> extends to ${el.rect.right}px in a ${el.viewportWidth}px ` +
        `viewport (${el.reason}). Verify whether a two-dimensional layout ` +
        'exception (table, map, diagram, ...) applies.',
    ),
  );
  if (details.hasHorizontalScroll && overflowNodes.length === 0) {
    overflowNodes.push(
      pageNode(
        `Document scrolls horizontally at ${details.viewport.width}px ` +
          `(scrollWidth ${details.documentScrollWidth}px > clientWidth ` +
          `${details.documentClientWidth}px). Verify whether an exception applies.`,
      ),
    );
  }
  bucketize(buckets, 'reflow-overflow', overflowNodes, true);

  bucketize(
    buckets,
    'reflow-clipped-text',
    details.clippedTextElements.map((el) =>
      toNode(
        el,
        `<${el.tagName}> clips its text at ${details.viewport.width}px ` +
          `(scrollWidth ${el.scrollWidth}px > clientWidth ${el.clientWidth}px, ` +
          `overflow: ${el.overflow}). Verify whether content is lost.`,
      ),
    ),
    true,
  );

  return buckets;
}

export function normalizeTargetSizeCheck(
  details: TargetSizeCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const applicable = details.totalTargetsChecked > 0;
  buckets.checkedNodes = details.totalTargetsChecked;

  const spacingSummary = (issue: TargetSizeIssue): string =>
    issue.spacing && !issue.spacing.applies
      ? ` Spacing exception does not apply: ${describeTargetSpacing(issue.spacing)}.`
      : '';

  const minimumFailureSummary = (issue: TargetSizeIssue): string => {
    const base =
      `Target is ${issue.width}x${issue.height}px ` +
      `(min dimension ${issue.minDimension}px, requirement 24px).`;
    if (issue.exception) {
      return (
        `${base} Possible '${issue.exception}' exception: ` +
        `${issue.exceptionDetails ?? 'see manual review notes'}.` +
        `${spacingSummary(issue)} Confirm manually.`
      );
    }
    return (
      `${base}${spacingSummary(issue)} No other exception detected, ` +
      'but the essential exception cannot be ruled out automatically.'
    );
  };

  // Minimum (2.5.8 AA): findings are fail-aa targets, with and without
  // detected exceptions. Only 'ruled-out' assessments are confirmed
  // violations; 'verified' exceptions (spacing checked geometrically) conform
  // and are not reported as findings.
  const minimumIssues = [...details.failAA, ...details.exceptedTargets].filter(
    (issue) => issue.level === 'fail-aa',
  );
  const confirmed = minimumIssues.filter(
    (i) => i.exceptionAssessment === 'ruled-out',
  );
  const verified = minimumIssues.filter(
    (i) => i.exceptionAssessment === 'verified',
  );
  const needsReview = minimumIssues.filter(
    (i) =>
      i.exceptionAssessment !== 'ruled-out' &&
      i.exceptionAssessment !== 'verified',
  );
  if (!applicable) {
    buckets.inapplicable.push(ruleResult('target-size-minimum', []));
  } else if (confirmed.length === 0 && needsReview.length === 0) {
    buckets.passes.push(ruleResult('target-size-minimum', []));
  } else {
    if (confirmed.length > 0) {
      buckets.violations.push(
        ruleResult(
          'target-size-minimum',
          confirmed.map((i) => toNode(i, minimumFailureSummary(i))),
        ),
      );
    }
    if (needsReview.length > 0) {
      buckets.incomplete.push(
        ruleResult(
          'target-size-minimum',
          needsReview.map((i) => toNode(i, minimumFailureSummary(i))),
        ),
      );
    }
  }

  // Enhanced (2.5.5 AAA): targets that pass AA but miss the 44px requirement.
  // Targets already failing AA are reported under target-size-minimum only,
  // except those that conform to 2.5.8 via the verified spacing exception:
  // SC 2.5.5 has no spacing exception, so they still need review for AAA.
  bucketize(
    buckets,
    'target-size-enhanced',
    [...details.failAAAOnly, ...verified].map((issue) =>
      toNode(
        issue,
        `Target is ${issue.width}x${issue.height}px ` +
          `(min dimension ${issue.minDimension}px, AAA requirement 44px). ` +
          (issue.exceptionAssessment === 'verified'
            ? 'Conforms to SC 2.5.8 via the spacing exception, which SC 2.5.5 does not offer. '
            : '') +
          'Verify whether an SC 2.5.5 exception applies.',
      ),
    ),
    applicable,
  );

  return buckets;
}

export function normalizeTextSpacingCheck(
  details: TextSpacingCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  buckets.checkedNodes = details.totalElementsChecked;

  bucketize(
    buckets,
    'text-spacing',
    details.clippedElements.map((el) =>
      toNode(
        el,
        `<${el.tagName}> clips its content (${el.issueType}) when WCAG 1.4.12 ` +
          `text spacing is applied: ${el.afterMetrics.scrollWidth}x${el.afterMetrics.scrollHeight}px ` +
          `content in a ${el.afterMetrics.clientWidth}x${el.afterMetrics.clientHeight}px box.`,
      ),
    ),
    details.totalElementsChecked > 0,
  );

  return buckets;
}

export function normalizeZoomCheck(
  details: ZoomCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();

  const nodes = details.clippedElements.map((el) =>
    toNode(
      el,
      `<${el.tagName}> ${el.issueType === 'horizontal-scroll' ? 'overflows horizontally' : 'clips its content'} ` +
        `at ${details.zoomFactor * 100}% zoom (scrollWidth ${el.scrollWidth}px > ` +
        `clientWidth ${el.clientWidth}px). Verify whether content or ` +
        'functionality is lost.',
    ),
  );
  if (details.hasHorizontalScroll && nodes.length === 0) {
    nodes.push(
      pageNode(
        `Document scrolls horizontally at ${details.zoomFactor * 100}% zoom ` +
          `(scrollWidth ${details.documentScrollWidth}px > clientWidth ` +
          `${details.documentClientWidth}px). Horizontal scrolling alone does ` +
          'not fail SC 1.4.4 — verify whether text becomes unusable.',
      ),
    );
  }
  bucketize(buckets, 'resize-text', nodes, true);

  return buckets;
}

export function normalizeOrientationCheck(
  details: OrientationCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();

  const nodes: NormalizedNode[] = [];
  if (details.hasOrientationLock) {
    const state =
      details.lockDetectedIn === 'landscape'
        ? details.landscape
        : details.portrait;
    const messagePart = state.lockMessageText
      ? ` Lock message found: "${state.lockMessageText}".`
      : '';
    nodes.push(
      pageNode(
        `Content appears restricted to a single orientation ` +
          `(detected in: ${details.lockDetectedIn}).${messagePart} Verify ` +
          'whether the essential exception (SC 1.3.4) applies.',
      ),
    );
  }
  bucketize(buckets, 'orientation-lock', nodes, true);

  return buckets;
}

export function normalizeAutocompleteAudit(
  details: AutocompleteAuditDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const applicable = details.totalFieldsChecked > 0;
  buckets.checkedNodes = details.totalFieldsChecked;

  // A field whose purpose was not inferred may not collect information about
  // the user (1.3.5 would not apply), so its invalid value needs review.
  bucketize(
    buckets,
    'autocomplete-invalid',
    details.invalidAutocomplete
      .filter((field) => field.expectedToken !== null)
      .map((field) =>
        toNode(
          field,
          `autocomplete="${field.currentAutocomplete}" is not a valid ` +
            `autocomplete value. Expected "${field.expectedToken}" ` +
            `(purpose matched by ${field.matchedBy}).`,
        ),
      ),
    applicable,
  );

  bucketize(
    buckets,
    'autocomplete-invalid-unverified',
    details.invalidAutocomplete
      .filter((field) => field.expectedToken === null)
      .map((field) =>
        toNode(
          field,
          `autocomplete="${field.currentAutocomplete}" is not a valid ` +
            'autocomplete value. The field purpose could not be inferred; ' +
            'confirm whether it collects information about the user.',
        ),
      ),
    applicable,
  );

  bucketize(
    buckets,
    'autocomplete-missing',
    details.missingAutocomplete.map((field) =>
      toNode(
        field,
        `Field appears to collect "${field.expectedToken}" (matched by ` +
          `${field.matchedBy}) but has ${
            field.currentAutocomplete === null
              ? 'no autocomplete attribute'
              : `autocomplete="${field.currentAutocomplete}"`
          }. Confirm the field purpose manually.`,
      ),
    ),
    applicable,
  );

  return buckets;
}

export function normalizeRedundantEntryCheck(
  details: RedundantEntryCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const applicable = details.totalFieldsChecked > 0;
  buckets.checkedNodes = details.totalFieldsChecked;

  const nodes = details.groups.flatMap((group) => {
    const [first, ...rest] = group.fields;
    if (!first) return [];
    const copyControl = group.copyControls[0];
    // Disabled/readonly fields stay in `fields` as evidence but are not re-entry.
    return rest
      .filter((field) => field.editable)
      .map((field) => {
        const scopes =
          group.kind === 'scoped'
            ? ` (${first.scope ?? 'no scope'} / ${field.scope ?? 'no scope'})`
            : '';
        const guidance = copyControl
          ? `A control that may copy or select the earlier value was found: ${copyControl.selector} ("${copyControl.text}"). ` +
            'Verify it fills this field, or whether an exception to 3.3.7 applies.'
          : 'No control that copies or selects the earlier value was found nearby. ' +
            'Verify whether the user must re-enter it, or whether an exception to 3.3.7 applies (essential, security, no longer valid).';
        return toNode(
          field,
          `Field asks for "${group.purpose}" again${scopes}; the first is ${first.selector}. ${guidance}`,
        );
      });
  });
  bucketize(buckets, 'redundant-entry', nodes, applicable);

  return buckets;
}

/**
 * Findings become incomplete nodes (advice given beforehand makes the change
 * conform, which only a human can judge). A walk stopped early adds a page node
 * so the untested controls are not silently reported as passing.
 */
export function normalizeChangeOnInputCheck(
  details: ChangeOnInputCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();

  const nodes = details.findings.map(({ control, action, changes }) => {
    const caused = changes
      .map((change) => {
        switch (change.kind) {
          case 'navigation':
            return `navigation to ${change.toUrl}`;
          case 'new-window':
            return `a new window (${change.url})`;
          case 'focus-moved':
            return `focus moving to ${change.toSelector}`;
          case 'dialog':
            return `a ${change.dialogType} dialog ("${change.message}")`;
        }
      })
      .join('; ');
    return toNode(
      {
        selector: control.selector,
        html: control.html,
        htmlTruncated: control.htmlTruncated,
        tag: control.type,
      },
      `Changing this ${control.type} control (${control.label ?? control.name ?? 'unlabeled'}) — ${action} — caused: ${caused}. ` +
        'Unless users are advised of this behavior before using the control, this fails 3.2.2.',
    );
  });
  for (const { control, reason } of details.untested) {
    nodes.push(
      toNode(
        {
          selector: control.selector,
          html: control.html,
          htmlTruncated: control.htmlTruncated,
          tag: control.type,
        },
        `Could not change this ${control.type} control (${reason}). Check manually whether changing it causes a change of context.`,
      ),
    );
  }
  if (details.aborted) {
    const { reason, testedCount, foundCount } = details.aborted;
    nodes.push(
      pageNode(
        `Stopped early (${reason}): ${testedCount} of ${foundCount} controls were tested. Check the rest manually.`,
      ),
    );
  }
  bucketize(
    buckets,
    'no-context-change-on-input',
    nodes,
    nodes.length > 0 || details.controlsTested > 0,
  );

  return buckets;
}

/**
 * `inspectedUrl` (the envelope url) lets the wording tell a reload or page
 * replacement from a navigation elsewhere.
 */
export function normalizeMotionActuationCheck(
  details: MotionActuationCheckDetails,
  inspectedUrl?: string,
): NormalizedBuckets {
  const buckets = emptyBuckets();

  if (details.listenerInspection === 'unsupported') {
    bucketize(
      buckets,
      'motion-actuation',
      [
        pageNode(
          'Event listeners could not be inspected (CDP is only available in Chromium). Check manually whether the page reacts to device motion or orientation.',
        ),
      ],
      true,
    );
    return buckets;
  }

  const nodes = details.listeners.map((listener) => {
    const preview = listener.handlerPreview
      ? `: ${listener.handlerPreview}`
      : '';
    return pageNode(
      `${listener.target} has a "${listener.type}" listener (script ${listener.scriptId}, line ${listener.lineNumber + 1}:${listener.columnNumber + 1})${preview}. ` +
        `${describeMotionSimulation(listener, details.simulation.results, inspectedUrl)} ` +
        'Verify that the same function is available through UI components and that motion actuation can be turned off.',
    );
  });
  bucketize(buckets, 'motion-actuation', nodes, nodes.length > 0);

  return buckets;
}

function describeMotionSimulation(
  listener: MotionListener,
  results: MotionSimulationResult[],
  inspectedUrl: string | undefined,
): string {
  if (listener.target === 'document') {
    return 'Browsers dispatch this event only to window, so this listener may never run.';
  }
  const result = results.find((r) => r.type === listener.type);
  if (!result) return 'Not simulated.';
  if (result.error === 'navigated-before-dispatch') {
    return "The page navigated or reloaded before synthetic events were sent; the page's reaction is unknown.";
  }
  if (result.navigated) {
    if (inspectedUrl !== undefined && result.urlAfter === inspectedUrl) {
      return 'Synthetic events caused the page to reload or be replaced.';
    }
    return `Synthetic events caused navigation to ${result.urlAfter}.`;
  }
  if (result.domMutations === null) {
    return `Simulation did not finish (${result.error ?? 'unknown'}); the page's reaction is unknown.`;
  }
  const baseline = result.baselineDomMutations ?? 0;
  // Counts are timing dependent, so credit the events only when the DOM
  // changed clearly more than it does by itself.
  if (
    result.domMutations > 0 &&
    (baseline === 0 ||
      result.domMutations >= 2 * baseline + MOTION_MUTATION_MARGIN)
  ) {
    return `Synthetic events changed the DOM (${result.domMutations} mutations during dispatch, ${baseline} without events).`;
  }
  if (result.domMutations > 0) {
    return `The DOM changed ${result.domMutations} times during dispatch and ${baseline} times without events; the change may not come from motion.`;
  }
  return 'Synthetic events caused no DOM change (the page may react only to trusted events or draw on canvas).';
}

const AUTH_KIND_LABELS: Record<AuthFieldKind, string> = {
  password: 'Password',
  'one-time-code': 'Verification code',
  username: 'Username',
};

/** Why a paste-test target has no usable `paste` result. */
function describeUntestedPaste(field: AuthField): string {
  if (!field.visible) return 'not visible';
  if (!field.editable) return 'not editable';
  if (field.paste === null) {
    return 'not tried after an earlier timeout or navigation';
  }
  return field.paste.error ?? (field.paste.navigated ? 'navigated' : 'unknown');
}

export function normalizeAccessibleAuthenticationCheck(
  details: AccessibleAuthenticationCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const { fields, captchas, pasteTest } = details;
  buckets.checkedNodes = fields.length + captchas.length;

  const pasteTargets = fields.filter(
    (f) => f.kind === 'password' || f.kind === 'one-time-code',
  );
  const pasteNodes: NormalizedNode[] = [];
  for (const field of pasteTargets) {
    const label = AUTH_KIND_LABELS[field.kind];
    if (pasteTest.status === 'disabled' || pasteTest.status === 'unavailable') {
      const reason = pasteTest.reason ? `: ${pasteTest.reason}` : '';
      pasteNodes.push(
        toNode(
          field,
          `Paste was not tested (${pasteTest.status}${reason}). Check manually whether pasting works.`,
        ),
      );
    } else if (field.paste?.result === 'blocked') {
      const { valueAfterPaste, pasteEventPrevented } = field.paste;
      const how =
        pasteEventPrevented === true
          ? ' The paste event was cancelled (preventDefault).'
          : pasteEventPrevented === false
            ? ' The paste event was not cancelled; a script may clear the value after pasting.'
            : '';
      pasteNodes.push(
        toNode(
          field,
          `Pasting into this ${label} field did not insert the text (field value after paste: ${valueAfterPaste === 'empty' ? 'empty' : 'not the pasted text'}).${how} Allow pasting so password managers can be used.`,
        ),
      );
    } else if (field.paste?.result !== 'inserted') {
      pasteNodes.push(
        toNode(
          field,
          `Paste could not be tested (${describeUntestedPaste(field)}). Check manually whether pasting works.`,
        ),
      );
    }
  }
  bucketize(buckets, 'auth-paste-blocked', pasteNodes, pasteTargets.length > 0);

  const autocompleteNodes = fields
    .filter(
      (f) =>
        f.autocompleteStatus === 'off' || f.autocompleteStatus === 'mismatch',
    )
    .map((field) =>
      toNode(
        field,
        `${AUTH_KIND_LABELS[field.kind]} field ${
          field.autocomplete === null || field.autocomplete.trim() === ''
            ? `inherits autocomplete="${field.formAutocomplete}" from its form, which turns off autofill`
            : `has autocomplete="${field.autocomplete}", which ${
                field.autocompleteStatus === 'off'
                  ? 'turns off autofill'
                  : 'is not the expected value'
              }`
        }. Expected ${AUTH_EXPECTED_AUTOCOMPLETE[field.kind].join(' or ')}.`,
      ),
    );
  bucketize(buckets, 'auth-autocomplete', autocompleteNodes, fields.length > 0);

  const captchaNodes = captchas.map((captcha) =>
    toNode(
      captcha,
      `Looks like a CAPTCHA (matched ${captcha.matchedBy})${captcha.visible ? '' : ', not visible (may be score-based)'}. Check that authentication offers an alternative without a cognitive function test, or that it only asks to recognize objects or user-provided content.`,
    ),
  );
  bucketize(
    buckets,
    'auth-captcha',
    captchaNodes,
    fields.length > 0 || captchas.length > 0,
  );

  return buckets;
}

const POINTER_GESTURE_RULES: {
  key: RuleKey;
  criterion: PointerGestureCriterion;
  verify: string;
}[] = [
  {
    key: 'pointer-gestures',
    criterion: '2.5.1',
    verify:
      'Verify that the same function works with a single pointer without a path (e.g. buttons), unless the gesture is essential.',
  },
  {
    key: 'dragging-movements',
    criterion: '2.5.7',
    verify:
      'Verify that the same function works with a single pointer without dragging (e.g. buttons or click-to-place), unless dragging is essential.',
  },
];

function describePointerGestureLocation(loc: {
  scriptId: string;
  lineNumber: number;
  columnNumber: number;
}): string {
  return `script ${loc.scriptId}, line ${loc.lineNumber + 1}:${loc.columnNumber + 1}`;
}

function describePointerGestureSignal(signal: PointerGestureSignal): string {
  const at = signal.listener
    ? ` at ${describePointerGestureLocation(signal.listener)}`
    : '';
  switch (signal.kind) {
    case 'draggable-attribute':
      return 'has draggable="true"';
    case 'drag-listener':
      return `has ${signal.detail} listener(s)${at}`;
    case 'move-listener':
      return `has press and move listeners (${signal.detail})${at}`;
    case 'multipoint-listener':
      return `has a listener that looks at multiple touches (${signal.detail})${at}`;
    default:
      return `matches ${signal.kind.replace('widget-', '')} markup (${signal.detail})`;
  }
}

export function normalizePointerGestureCheck(
  details: PointerGestureCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  buckets.checkedNodes = details.candidates.length;

  for (const { key, criterion, verify } of POINTER_GESTURE_RULES) {
    const nodes: NormalizedNode[] = [];

    if (details.inspectionError === 'timeout-unrecoverable') {
      nodes.push(
        pageNode(
          `Event listeners could not be inspected (${details.listenerInspection}: ${details.inspectionError}) and the page scan was skipped, so nothing on this page was examined. Check drag and gesture interactions manually.`,
        ),
      );
    } else if (details.listenerInspection !== 'cdp') {
      const why = details.inspectionError ? `: ${details.inspectionError}` : '';
      const chromium =
        details.listenerInspection === 'unsupported'
          ? ' CDP is only available in Chromium.'
          : '';
      nodes.push(
        pageNode(
          `Event listeners could not be inspected (${details.listenerInspection}${why}).${chromium} Candidates come only from attributes and known widget markup; check drag and gesture interactions manually.`,
        ),
      );
    }

    for (const candidate of details.candidates) {
      if (!candidate.criteria.includes(criterion)) continue;
      const parts = candidate.signals
        .filter((s) =>
          POINTER_GESTURE_CRITERIA_BY_SIGNAL[s.kind].includes(criterion),
        )
        .map(describePointerGestureSignal);
      const hidden = candidate.visible ? '' : ' (not visible at load)';
      const node = toNode(candidate, `${parts.join('; ')}${hidden}. ${verify}`);
      // Qualify with the shadow hosts so equal ids in different roots stay apart.
      node.target = [...candidate.shadowHosts, candidate.selector];
      nodes.push(node);
    }

    for (const listener of details.pageListeners) {
      const matches =
        criterion === '2.5.1'
          ? listener.multipoint
          : listener.type === 'dragstart' || listener.type === 'drop';
      if (!matches) continue;
      const preview = listener.handlerPreview
        ? ` starting with: ${listener.handlerPreview}`
        : '';
      nodes.push(
        pageNode(
          `${listener.target} has a "${listener.type}" listener (${describePointerGestureLocation(listener)})${preview}. Handlers may implement gestures for elements through delegation; ${verify}`,
        ),
      );
    }

    if (details.delegationRoots.length > 0) {
      const roots = details.delegationRoots
        .map(
          (r) =>
            `${[...r.shadowHosts, r.selector].join(' >>> ')} (${r.eventTypeCount} types)`,
        )
        .join(', ');
      nodes.push(
        pageNode(
          `Listeners for many event types are attached to ${roots} (framework event delegation); gestures handled there cannot be attributed to elements. ${verify}`,
        ),
      );
    }

    const counts = details.candidateCounts.byCriterion[criterion];
    if (counts.found > counts.kept) {
      nodes.push(
        pageNode(
          `Only ${counts.kept} of ${counts.found} candidates for this criterion were recorded (the check keeps the first ${POINTER_GESTURE_MAX_CANDIDATES} candidates in document order); check the rest of the page manually.`,
        ),
      );
    }
    if (details.listenerNodesTruncated) {
      nodes.push(
        pageNode(
          `Listeners on more than ${POINTER_GESTURE_MAX_LISTENER_NODES} elements were found; elements beyond that were not examined. Check drag and gesture interactions manually.`,
        ),
      );
    }

    bucketize(buckets, key, nodes, nodes.length > 0);
  }

  return buckets;
}

const POINTER_CANCELLATION_VERIFY =
  'Verify that the function completes on the up-event, or can be aborted (e.g. by moving the pointer away before release) or undone, unless completing on the down-event is essential.';

function describePointerCancellationChange(
  change: PointerCancellationChange,
): string {
  switch (change.kind) {
    case 'navigation':
      return `navigation to ${change.toUrl}`;
    case 'new-window':
      return `a new window (${change.url})`;
    case 'focus-moved':
      return `focus moving to ${change.toSelector}`;
    case 'dialog':
      return `a ${change.dialogType} dialog ("${change.message}")`;
    case 'dom':
      return `DOM changes (${change.addedNodes} added, ${change.removedNodes} removed, ${change.textChanges} text, attributes: ${change.attributes.join(', ') || 'none'})`;
  }
}

/**
 * Findings and untested targets become incomplete nodes (whether the function
 * can be aborted or undone, or the down-event is essential, needs a human).
 * Page nodes keep a partial or blind run from being reported as a pass.
 */
export function normalizePointerCancellationCheck(
  details: PointerCancellationCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  buckets.checkedNodes = details.targetsTested;

  const nodes: NormalizedNode[] = [];
  const withScopedTarget = (
    target: PointerCancellationTarget,
    summary: string,
  ): NormalizedNode => {
    const node = toNode(target, summary);
    // Qualify with the shadow hosts so equal ids in different roots stay apart.
    node.target = [...target.shadowHosts, target.selector];
    return node;
  };

  for (const { target, kind, dispatched, changes } of details.findings) {
    if (kind === 'activated-on-press') {
      const caused = changes.map(describePointerCancellationChange).join(', ');
      nodes.push(
        withScopedTarget(
          target,
          `Pressing it (${dispatched.join(' + ')}, not released) caused ${caused}. ${POINTER_CANCELLATION_VERIFY}`,
        ),
      );
      continue;
    }
    const at = target.pressListener
      ? ` at script ${target.pressListener.scriptId}, line ${target.pressListener.lineNumber + 1}:${target.pressListener.columnNumber + 1}`
      : '';
    nodes.push(
      withScopedTarget(
        target,
        `Has ${(target.listeners?.press ?? []).join(' / ')} listener(s)${at} but no pointerup / mouseup / touchend / click listener on the element itself; pressing it caused no visible change. ${POINTER_CANCELLATION_VERIFY}`,
      ),
    );
  }

  for (const { target, reason } of details.untested) {
    nodes.push(
      withScopedTarget(
        target,
        `Could not be pressed or observed (${reason}). Check manually whether pressing it completes a function on the down-event.`,
      ),
    );
  }

  if (details.aborted) {
    const { reason, testedCount, foundCount } = details.aborted;
    nodes.push(
      pageNode(
        `Stopped early (${reason}): ${testedCount} of ${foundCount} targets were pressed. Check the rest manually.`,
      ),
    );
  }
  if (
    details.domObservation === 'ignored-background-activity' &&
    details.targetsTested > 0
  ) {
    nodes.push(
      pageNode(
        'The page changed on its own before any press, so DOM changes after a press were not used (navigation, new windows, dialogs and focus moves still were). Check press behaviour manually.',
      ),
    );
  }
  if (details.listenerInspection !== 'cdp') {
    const why = details.inspectionError ? `: ${details.inspectionError}` : '';
    const chromium =
      details.listenerInspection === 'unsupported'
        ? ' CDP is only available in Chromium.'
        : '';
    nodes.push(
      pageNode(
        `Event listeners could not be inspected (${details.listenerInspection}${why}).${chromium} Elements with only a press listener and no interactive role or inline handler were not pressed, and press-only listeners were not reported; check them manually.`,
      ),
    );
  }
  if (details.delegationRootCount > 0) {
    nodes.push(
      pageNode(
        `${details.delegationRootCount} delegation root(s) (listeners for ${POINTER_GESTURE_DELEGATION_MIN_TYPES} or more event types) were found; press handlers dispatched through them cannot be attributed to elements, and elements without an interactive role or inline handler were not pressed. Check press behaviour manually.`,
      ),
    );
  }
  for (const listener of details.pageListeners) {
    const preview = listener.handlerPreview
      ? `: ${listener.handlerPreview}`
      : '';
    nodes.push(
      pageNode(
        `${listener.target} has a "${listener.type}" listener (script ${listener.scriptId}, line ${listener.lineNumber + 1}:${listener.columnNumber + 1})${preview}. It may complete functions for elements through delegation; ${POINTER_CANCELLATION_VERIFY}`,
      ),
    );
  }
  if (details.listenerNodesTruncated) {
    nodes.push(
      pageNode(
        `Press listeners were found on more than ${POINTER_GESTURE_MAX_LISTENER_NODES} elements; elements beyond that were not examined. Check press behaviour manually.`,
      ),
    );
  }

  bucketize(
    buckets,
    'pointer-cancellation',
    nodes,
    nodes.length > 0 || details.targetsTested > 0,
  );

  return buckets;
}

export function normalizeTimeLimitDetector(
  details: TimeLimitDetectorDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();

  bucketize(
    buckets,
    'meta-refresh',
    details.metaRefresh.map((meta) => ({
      target: ['meta[http-equiv="refresh"]'],
      html:
        meta.html || `<meta http-equiv="refresh" content="${meta.content}">`,
      htmlTruncated: meta.htmlTruncated ?? false,
      failureSummary:
        `Page refreshes${meta.url ? ` to ${meta.url}` : ''} after ${meta.seconds}s. ` +
        'Verify whether the time limit can be turned off, adjusted, or extended, ' +
        'or whether an SC 2.2.1 exception (e.g. over 20 hours) applies.',
    })),
    true,
  );

  bucketize(
    buckets,
    'time-limit-timer',
    details.timers.map((timer) =>
      pageNode(
        `${timer.type} with a ${timer.delayMs}ms delay detected` +
          `${timer.callStack ? ` (${timer.callStack.split('\n')[0]?.trim()})` : ''}. ` +
          'Verify whether it implements a time limit and is adjustable.',
      ),
    ),
    true,
  );

  bucketize(
    buckets,
    'time-limit-countdown',
    details.countdownIndicators.map((indicator) =>
      toNode(
        indicator,
        `Countdown/timeout wording found: "${indicator.text.slice(0, 80)}". ` +
          'Verify whether it indicates an adjustable time limit.',
      ),
    ),
    true,
  );

  return buckets;
}

export function normalizeAutoPlayDetection(
  details: AutoPlayDetectionDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();

  const nodes: NormalizedNode[] = [];
  if (details.hasAutoPlayContent && !details.stopsWithin5Seconds) {
    const controlsPart = details.pauseControls.found
      ? `Pause controls found (${details.pauseControls.controls.length}); ` +
        `pause verified working: ${details.pauseVerification.pauseWorked ?? 'unknown'}.`
      : 'No pause controls found.';
    nodes.push(
      pageNode(
        `Moving content continues past 5 seconds (pixel-diff detection). ` +
          `${controlsPart} ${details.recommendation} Verify the content type ` +
          'manually.',
      ),
    );
  }
  bucketize(buckets, 'auto-play', nodes, true);

  const audioNodes: NormalizedNode[] = details.mediaElements.flatMap(
    (media) => {
      const summary = describeAutoPlayingAudio(media);
      return summary ? [mediaNode(media, summary)] : [];
    },
  );
  if (details.unmeasuredFrames > 0) {
    audioNodes.push(
      pageNode(
        `${details.unmeasuredFrames} frame(s) could not be inspected for ` +
          'auto-playing audio. Verify their media manually.',
      ),
    );
  }
  bucketize(
    buckets,
    'auto-play-audio',
    audioNodes,
    details.mediaElements.length > 0 || details.unmeasuredFrames > 0,
  );

  return buckets;
}

/** WCAG 1.4.2 applies to audio that plays automatically for more than 3s. */
const AUDIO_CONTROL_THRESHOLD_SECONDS = 3;

/**
 * Why this media element needs review under 1.4.2, or null when it does not:
 * it carries visible native controls, or it was heard for 3 seconds or less
 * between samples and will not keep playing with sound for more than 3
 * seconds after the last sample.
 */
function describeAutoPlayingAudio(media: MediaPlaybackRecord): string | null {
  if (media.controls && media.visible === true) return null;

  const location = media.frame ? ` in frame ${media.frame.url}` : '';
  const blocked =
    media.autoplay &&
    media.paused &&
    media.playedSeconds === 0 &&
    !media.hasError &&
    !media.muted &&
    media.volume > 0;
  if (blocked) {
    return (
      `<${media.tag}>${location} requests autoplay but playback did not start ` +
      '(the browser may have blocked unmuted autoplay), so its audio could ' +
      'not be measured. Verify manually whether it plays audio automatically.'
    );
  }

  const audibleInRecord =
    !media.paused &&
    !media.ended &&
    !media.muted &&
    media.volume > 0 &&
    media.playbackRate > 0;
  // A removed element (or one whose document went away) plays no more, even
  // if its last record was taken while it was playing.
  const audibleNow = !media.removed && audibleInRecord;
  // A document that went away after a record taken while it was playing with
  // sound may have played for any time until then, so it cannot be cleared.
  const unknownAfterRecord = media.documentRemoved && audibleInRecord;
  // Sound that starts just before the last sample is heard for too short a
  // time between samples, so also count what is left to play, in real time
  // at the current playback rate.
  const keepsPlaying =
    audibleNow &&
    (media.loop ||
      media.endless ||
      (media.duration !== null &&
        (media.duration - media.currentTime) / media.playbackRate >
          AUDIO_CONTROL_THRESHOLD_SECONDS));
  const heardLongEnough =
    media.audibleSeconds > AUDIO_CONTROL_THRESHOLD_SECONDS;
  if (!heardLongEnough && !keepsPlaying && !unknownAfterRecord) return null;

  const state = unknownAfterRecord
    ? 'and was still playing with sound at its last record (playback time ' +
      'after its last record is unknown)'
    : !audibleNow
      ? 'and has since been muted or stopped'
      : keepsPlaying
        ? 'and will keep playing with sound for more than 3s'
        : 'and is still playing';
  const decoded =
    media.audioDecodedBytes === 0
      ? ' No audio data was decoded, so the track may be silent.'
      : '';
  const controls =
    media.controlsInFrame.length > 0
      ? `Possible controls found in the same frame: ${media.controlsInFrame
          .map((c) => `"${c.name}" (${c.selector})`)
          .join(', ')}.`
      : 'No pause/stop/mute control was found in the same frame by name.';
  // Visibility covers size, display, visibility and opacity of the element
  // and its iframes, and non-overlapping overflow hidden / clip ancestors;
  // clip-path / clip, scroll containers, escaping boxes and transforms make
  // it undetermined; partial clipping and off-screen position are not
  // checked.
  const nativeControls = !media.controls
    ? ''
    : media.visible === false
      ? ' It has the controls attribute but they are not visible (size, ' +
        'display, visibility, opacity and overflow of the element, its ' +
        'ancestors and its iframes are checked; partial clipping and ' +
        'off-screen position are not).'
      : ' It has the controls attribute, but it could not be determined ' +
        'whether its controls are visible (e.g. clip-path or clip is ' +
        'applied, or an overflow ancestor scrolls or is transformed).';
  const path = media.documentRemoved
    ? ' It is gone because its frame was removed or replaced during the ' +
      'check, so this is its last record before that, and the target points ' +
      'at the nearest remaining parent document.'
    : media.removed
      ? ' It was removed from the page during the check, so the target ' +
        'points at its document.'
      : media.frame && media.framePath === null
        ? ' The iframe path is unknown, so the target is relative to the frame.'
        : '';
  return (
    `Unmuted <${media.tag}>${location} played automatically for ` +
    `${media.audibleSeconds.toFixed(1)}s with sound ${state} (volume ` +
    `${media.volume}). Sound is recorded from when the check started ` +
    '(every ~2s, on playback events, and from when media is added), not ' +
    'from page load.' +
    `${decoded}${nativeControls}${path} ${controls} Controls are matched by ` +
    'name only and were not clicked, and controls elsewhere on the page or ' +
    'in a parent frame are not searched: verify that the audio can be ' +
    'paused, stopped, or its volume controlled independently.'
  );
}

/**
 * A node for a media element. `target` is the full path: iframes (with the
 * shadow hosts above them), then the shadow hosts above the element, then the
 * element; each entry is looked up in the document or shadow root opened by
 * the entry before it. A removed element no longer resolves, so its target
 * ends at its document's `html`.
 */
function mediaNode(
  media: MediaPlaybackRecord,
  failureSummary: string,
): NormalizedNode {
  const node = toNode(media, failureSummary);
  node.target = media.removed
    ? [...(media.framePath ?? []), 'html']
    : [...(media.framePath ?? []), ...media.shadowHosts, media.selector];
  return node;
}

// =============================================================================
// Keyboard Trap Check normalization (WCAG 2.1.2)
// =============================================================================

export function normalizeKeyboardTrapCheck(
  details: KeyboardTrapCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const applicable = details.totalFocusableElements > 0;
  buckets.checkedNodes = details.totalFocusableElements;

  bucketize(
    buckets,
    'no-keyboard-trap',
    details.confirmedTraps.map((t) =>
      pageNode(
        `Keyboard focus is trapped in <${t.tag.toLowerCase()}> "${t.name}" ` +
          `(${t.selector}). None of Escape / Shift+Tab / a close control moved ` +
          `focus out. Keyboard users cannot leave this region.`,
      ),
    ),
    applicable,
  );

  bucketize(
    buckets,
    'keyboard-trap-needs-review',
    details.needsReview.map((t) =>
      pageNode(
        `Focus appears confined to <${t.tag.toLowerCase()}> "${t.name}" ` +
          `(${t.selector}); it can be left via ` +
          `${[t.escapeAttempts.escape && 'Escape', t.escapeAttempts.shiftTab && 'Shift+Tab', t.escapeAttempts.closeAffordance && 'a close control'].filter(Boolean).join(', ')}. ` +
          `Verify the escape method is documented/discoverable (WCAG 2.1.2 exception).`,
      ),
    ),
    applicable,
  );

  return buckets;
}

// =============================================================================
// Keyboard Reachability Check normalization (WCAG 2.1.1)
// =============================================================================

export function normalizeKeyboardReachabilityCheck(
  details: KeyboardReachabilityCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const applicable = details.totalOperableElements > 0;
  buckets.checkedNodes = details.totalOperableElements;

  const nodes = details.elements
    .filter((el) => el.reachedBy === 'unreachable')
    .map((el) =>
      toNode(
        el,
        `<${el.tag.toLowerCase()}> "${el.name}" (role: ${el.role ?? 'none'}) ` +
          'was not reached by Tab, arrow keys within its composite widget, or ' +
          `aria-activedescendant. Reason: ${el.reason} (confidence: ${el.confidence}). ` +
          'Verify whether the same function is keyboard operable elsewhere.',
      ),
    );

  // Untested elements are not "unreachable", but the page must not pass
  // while part of it was never exercised.
  if (details.notEvaluatedCount > 0) {
    const cause = details.aborted
      ? `exploration aborted: ${details.aborted.reason}`
      : 'arrow-key budget, Tab walk cap, or unsupported grid widget';
    nodes.push(
      pageNode(
        `${details.notEvaluatedCount} operable element(s) could not be ` +
          `evaluated (${cause}). Keyboard reachability for these is unknown; ` +
          'test them manually.',
      ),
    );
  }

  bucketize(buckets, 'keyboard-unreachable', nodes, applicable);
  return buckets;
}

// =============================================================================
// Focus Order Check normalization (WCAG 2.4.3)
// =============================================================================

function describeFocusOrderStop(stop: FocusOrderStop): string {
  return `<${stop.tag.toLowerCase()}> "${stop.name}"`;
}

/**
 * Every finding is incomplete: a move against the visual order still conforms
 * when meaning and operability are preserved, and focus that does not return to
 * the trigger can be right (the trigger disappeared, the flow moved on).
 *
 * Non-modal dialogs produce no node: they sit next to their trigger in the Tab
 * order, so neither moving focus in nor returning it is required.
 */
export function normalizeFocusOrderCheck(
  details: FocusOrderCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const { stops, tabWalk } = details;
  buckets.checkedNodes = stops.length + details.dialogs.length;

  const stopNode = (stop: FocusOrderStop, summary: string): NormalizedNode => {
    const node = toNode(
      stop,
      stop.shadowHosts.length > 0
        ? `${summary} (inside shadow host ${stop.shadowHosts.join(' > ')})`
        : summary,
    );
    node.target = [...stop.shadowHosts, stop.selector];
    return node;
  };

  // --- focus-order-visual ---
  const visualNodes: NormalizedNode[] = [];
  for (const transition of details.transitions) {
    if (
      transition.kind !== 'backward-block' &&
      transition.kind !== 'backward-inline'
    ) {
      continue;
    }
    const from = stops[transition.from];
    const to = stops[transition.to];
    if (!from || !to) continue;
    const how =
      transition.kind === 'backward-block'
        ? `${Math.round(-transition.dy)}px above it`
        : `${Math.round(-transition.dx)}px before it on the same row`;
    visualNodes.push(
      stopNode(
        to,
        `Tab moved from ${describeFocusOrderStop(from)} (step ${from.step}) to ${describeFocusOrderStop(to)} (step ${to.step}), which is ${how}. Verify that this order preserves meaning and operability.`,
      ),
    );
  }
  for (const detour of details.detours) {
    const stop = stops[detour.index];
    if (!stop) continue;
    visualNodes.push(
      stopNode(
        stop,
        `Tab jumps ${Math.round(detour.distanceIn)}px to ${describeFocusOrderStop(stop)} (step ${stop.step}) and ${Math.round(detour.distanceOut)}px back to an element ${Math.round(detour.distanceAcross)}px from where it started. Verify that this element belongs at this point in the order.`,
      ),
    );
  }
  const nothingToWalk =
    tabWalk.ended === 'tab-limit' &&
    stops.length === 0 &&
    tabWalk.focusableCount === 0 &&
    tabWalk.frameCount === 0;
  const walkIncomplete = tabWalk.ended !== 'cycle' && !nothingToWalk;
  if (walkIncomplete) {
    visualNodes.push(
      pageNode(
        `The Tab walk ended without returning to the first element (${tabWalk.ended}) after ${stops.length} elements; the rest of the order was not compared.`,
      ),
    );
  }
  bucketize(
    buckets,
    'focus-order-visual',
    visualNodes,
    details.transitions.length > 0 || walkIncomplete,
  );

  // --- focus-order-dialog ---
  const dialogNodes: NormalizedNode[] = [];
  const where = (
    place: 'inside' | 'trigger' | 'body' | 'elsewhere',
    selector: string | null,
  ): string => {
    if (place === 'trigger') return 'on the trigger';
    if (place === 'body') return 'on the document body';
    return `on ${selector ?? 'another element'}`;
  };
  for (const probe of details.dialogs) {
    const node = (summary: string): NormalizedNode =>
      toNode({ ...probe.trigger, selector: probe.trigger.selector }, summary);
    if (
      probe.modal === true &&
      probe.focusAfterOpen !== null &&
      probe.focusAfterOpen !== 'inside'
    ) {
      dialogNodes.push(
        node(
          `Opening the modal dialog ${probe.dialogSelector} with Enter left focus ${where(probe.focusAfterOpen, probe.focusAfterOpenSelector)}. Verify that focus moves into the dialog.`,
        ),
      );
    }
    if (
      probe.modal === true &&
      probe.closedBy !== null &&
      probe.focusAfterClose !== null &&
      probe.focusAfterClose !== 'trigger'
    ) {
      dialogNodes.push(
        node(
          `After closing the modal dialog (${probe.closedBy}), focus went ${where(probe.focusAfterClose, probe.focusAfterCloseSelector)} instead of back to this control. Verify where focus should return.`,
        ),
      );
    }
    let untestedReason: string | null = null;
    if (probe.status === 'not-opened') {
      untestedReason = 'Enter did not open a dialog';
    } else if (probe.status === 'error') {
      untestedReason = `error: ${probe.error}`;
    } else if (probe.status === 'navigated') {
      untestedReason = 'the page navigated';
    } else if (
      probe.status === 'opened' &&
      probe.modal === true &&
      probe.closedBy === null
    ) {
      untestedReason =
        'the dialog could not be closed with Escape or a close button, so focus return was not tested';
    }
    if (untestedReason !== null) {
      dialogNodes.push(
        node(
          `Could not test the dialog opened by this control (${untestedReason}). Verify manually that focus moves into the dialog and returns on close.`,
        ),
      );
    }
  }
  if (details.dialogsNotTried > 0) {
    dialogNodes.push(
      pageNode(
        `${details.dialogsNotTried} dialog trigger(s) were not tried because the time budget ran out.`,
      ),
    );
  }
  const dialogsTried = details.dialogs.length + details.dialogsNotTried;
  if (details.dialogTriggersFound > dialogsTried) {
    dialogNodes.push(
      pageNode(
        `Only the first ${dialogsTried} of ${details.dialogTriggersFound} dialog triggers were tried (maxDialogTriggers).`,
      ),
    );
  }
  const searchProblem = {
    ran: null,
    navigated: 'the page navigated',
    timeout: 'the time budget ran out',
    error: `error: ${details.dialogSearchError}`,
  }[details.dialogSearch];
  if (searchProblem !== null) {
    dialogNodes.push(
      pageNode(
        `Dialog triggers could not be collected (${searchProblem}); verify manually that modal dialogs move focus in and return it on close.`,
      ),
    );
  }
  bucketize(
    buckets,
    'focus-order-dialog',
    dialogNodes,
    details.dialogTriggersFound > 0 || searchProblem !== null,
  );

  return buckets;
}

// =============================================================================
// Non-text Contrast Check normalization (WCAG 1.4.11)
// =============================================================================

const NON_TEXT_CONTRAST_KIND_LABELS: Record<
  NonTextContrastComponentKind,
  string
> = {
  'text-input': 'text field',
  checkbox: 'checkbox',
  radio: 'radio button',
  switch: 'switch',
  'icon-button': 'icon button',
};

const NON_TEXT_CONTRAST_REASON_TEXT: Record<
  NonTextContrastUndeterminedReason,
  string
> = {
  'background-image': 'background image or gradient',
  opacity: 'opacity below 1',
  filter: 'filter or blend mode',
  'out-of-flow': 'positioned over content that is not its ancestor',
  'color-scheme': 'dark color-scheme without a background',
  'accent-color': 'native control with accent-color',
  'svg-paint-server': 'SVG gradient or pattern',
  'image-icon': 'icon is an image or a CSS background image',
  'mixed-icon-colors':
    'icon has parts above and below 3:1; check whether the parts below 3:1 are needed to understand it',
  'svg-overlap':
    'SVG shapes are drawn over filled shapes, so their background is not known',
  'svg-use': 'icon drawn with SVG <use> whose shapes set their own colors',
  'visually-hidden':
    'the control is visually hidden; check the custom control drawn in its place',
  'no-icon-color': 'no icon color could be read',
  'too-many-icon-parts': `icon has more than ${NON_TEXT_CONTRAST_MAX_ICON_PARTS} elements`,
};

function describeNonTextContrastIndicators(
  indicators: NonTextContrastIndicator[],
): string {
  return indicators
    .map((i) => `${i.part} ${i.color} vs ${i.against} ${i.ratio}:1`)
    .join(', ');
}

/**
 * Both rules are incomplete (see rule-registry). A group whose components were
 * cut off by NON_TEXT_CONTRAST_MAX_COMPONENTS gets a page node, so a clean
 * first 300 never turns into a pass for the rest.
 */
export function normalizeNonTextContrastCheck(
  details: NonTextContrastCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const { components, componentCounts } = details;
  buckets.checkedNodes = components.length;

  const summarize = (c: NonTextContrastComponent): string | null => {
    const kindLabel = NON_TEXT_CONTRAST_KIND_LABELS[c.kind];
    const others =
      c.otherVisuals.length > 0
        ? ` It also has ${c.otherVisuals.join(' and ')}, which was not measured; check whether that marks the boundary.`
        : '';
    if (c.status === 'low') {
      const subject =
        c.kind === 'icon-button' ? 'icon' : `${kindLabel} boundary`;
      return `Best contrast of the ${subject} is ${c.bestRatio}:1 (${describeNonTextContrastIndicators(c.indicators)}), below 3:1.${c.kind === 'icon-button' ? '' : others}`;
    }
    if (c.status === 'no-boundary') {
      return `The ${kindLabel} has no border or background to mark its boundary.${others} Check whether its extent is identifiable without one.`;
    }
    if (c.status === 'undetermined') {
      const reason = c.undeterminedReason
        ? NON_TEXT_CONTRAST_REASON_TEXT[c.undeterminedReason]
        : 'unknown reason';
      return `Contrast of the ${kindLabel} could not be measured (${reason}). Check manually.`;
    }
    return null;
  };

  const groups = [
    {
      key: 'non-text-contrast-boundary',
      counts: componentCounts.boundary,
      label: 'form controls',
      targets: components.filter((c) => c.kind !== 'icon-button'),
      measurable: (c: NonTextContrastComponent) => c.status !== 'user-agent',
    },
    {
      key: 'non-text-contrast-icon',
      counts: componentCounts.icon,
      label: 'icon buttons',
      targets: components.filter((c) => c.kind === 'icon-button'),
      measurable: () => true,
    },
  ] as const;

  for (const group of groups) {
    const nodes: NormalizedNode[] = [];
    for (const c of group.targets) {
      const summary = summarize(c);
      if (summary !== null) nodes.push(toNode(c, summary));
    }
    const cutOff = group.counts.found - group.counts.kept;
    if (cutOff > 0) {
      nodes.push(
        pageNode(
          `${cutOff} ${group.label} were not measured (limit ${NON_TEXT_CONTRAST_MAX_COMPONENTS} components per page). Check them manually.`,
        ),
      );
    }
    bucketize(
      buckets,
      group.key,
      nodes,
      group.targets.some(group.measurable) || cutOff > 0,
    );
  }

  return buckets;
}

// =============================================================================
// Axe results normalization
// =============================================================================

/** Structural subset of an axe-core rule result (avoids a hard axe dependency). */
export interface RawAxeRule {
  id: string;
  impact?: string | null;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: Array<{
    html: string;
    target: unknown[];
    failureSummary?: string | undefined;
  }>;
}

export interface RawAxeResults {
  violations: RawAxeRule[];
  incomplete: RawAxeRule[];
  passes: RawAxeRule[];
  inapplicable: RawAxeRule[];
}

function normalizeAxeRule(
  rule: RawAxeRule,
  includeNodes: boolean,
): NormalizedRuleResult {
  return {
    id: rule.id,
    impact: (rule.impact ?? null) as NormalizedImpact | null,
    description: rule.description,
    help: rule.help,
    helpUrl: rule.helpUrl,
    tags: [...rule.tags],
    nodes: includeNodes
      ? rule.nodes.map((n) => {
          const truncated = n.html.length > HTML_SNIPPET_MAX_LENGTH;
          return {
            target: n.target.map((t) => String(t)),
            html: truncated ? n.html.slice(0, HTML_SNIPPET_MAX_LENGTH) : n.html,
            htmlTruncated: truncated,
            failureSummary: n.failureSummary ?? '',
          };
        })
      : [],
  };
}

/**
 * Normalize raw axe-core results into the common buckets. Must be fed the RAW
 * `AxeResults` (before any reduction) — pass/incomplete details are not
 * recoverable afterwards. Node lists are kept for violations and incomplete;
 * passes/inapplicable carry rule metadata only.
 */
export function normalizeAxeResults(raw: RawAxeResults): NormalizedBuckets {
  return {
    violations: raw.violations.map((r) => normalizeAxeRule(r, true)),
    incomplete: raw.incomplete.map((r) => normalizeAxeRule(r, true)),
    passes: raw.passes.map((r) => normalizeAxeRule(r, false)),
    inapplicable: raw.inapplicable.map((r) => normalizeAxeRule(r, false)),
  };
}

// =============================================================================
// Merge (opt-in)
// =============================================================================

/** Combined view over several checks of the SAME page. */
export interface MergedAuditResult {
  url: string;
  /** Latest timestamp among the merged results. */
  timestamp: string;
  sources: CheckSource[];
  violations: NormalizedRuleResult[];
  incomplete: NormalizedRuleResult[];
  passes: NormalizedRuleResult[];
  inapplicable: NormalizedRuleResult[];
  summary: AuditResultSummary;
  disclaimer: typeof AUDIT_DISCLAIMER;
}

const BUCKETS = ['violations', 'incomplete', 'passes', 'inapplicable'] as const;
type BucketName = (typeof BUCKETS)[number];

/**
 * Merge several check results for the same URL into one normalized view.
 *
 * - Results with differing URLs are rejected (throws).
 * - The same rule id is merged into one entry; nodes are deduplicated by
 *   `target` + `failureSummary`. Identical selectors inside different frames
 *   or shadow roots are NOT distinguished.
 * - A rule appearing in several buckets is placed in the highest-priority one:
 *   violations > incomplete > passes > inapplicable.
 */
export function mergeNormalizedResults(
  results: Array<AuditCheckResult<unknown>>,
): MergedAuditResult {
  if (results.length === 0) {
    throw new Error('mergeNormalizedResults requires at least one result.');
  }
  const first = results[0]!;
  const mismatch = results.find((r) => r.url !== first.url);
  if (mismatch) {
    throw new Error(
      `mergeNormalizedResults: URL mismatch — "${first.url}" vs "${mismatch.url}". ` +
        'Merge only results for the same page.',
    );
  }

  interface MergedEntry {
    bucketIndex: number;
    rule: NormalizedRuleResult;
    nodeKeys: Set<string>;
  }
  const byId = new Map<string, MergedEntry>();
  const nodeKey = (n: NormalizedNode): string =>
    `${JSON.stringify(n.target)}|${n.failureSummary}`;

  for (const result of results) {
    BUCKETS.forEach((bucket: BucketName, bucketIndex) => {
      for (const rule of result[bucket]) {
        let entry = byId.get(rule.id);
        if (!entry) {
          entry = {
            bucketIndex,
            rule: { ...rule, nodes: [] },
            nodeKeys: new Set(),
          };
          byId.set(rule.id, entry);
        }
        entry.bucketIndex = Math.min(entry.bucketIndex, bucketIndex);
        for (const node of rule.nodes) {
          const key = nodeKey(node);
          if (!entry.nodeKeys.has(key)) {
            entry.nodeKeys.add(key);
            entry.rule.nodes.push(node);
          }
        }
      }
    });
  }

  const merged: Record<BucketName, NormalizedRuleResult[]> = {
    violations: [],
    incomplete: [],
    passes: [],
    inapplicable: [],
  };
  for (const entry of byId.values()) {
    merged[BUCKETS[entry.bucketIndex]!].push(entry.rule);
  }

  const latestTimestamp = results
    .map((r) => r.timestamp)
    .sort()
    .at(-1)!;
  const checkedNodes = results.reduce<number | undefined>((sum, r) => {
    if (r.summary.checkedNodes === undefined) return sum;
    return (sum ?? 0) + r.summary.checkedNodes;
  }, undefined);

  const summary: AuditResultSummary = {
    violationCount: merged.violations.length,
    incompleteCount: merged.incomplete.length,
    passCount: merged.passes.length,
  };
  if (checkedNodes !== undefined) {
    summary.checkedNodes = checkedNodes;
  }

  return {
    url: first.url,
    timestamp: latestTimestamp,
    sources: [...new Set(results.map((r) => r.source))],
    ...merged,
    summary,
    disclaimer: AUDIT_DISCLAIMER,
  };
}
