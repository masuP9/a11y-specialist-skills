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
  AuditCheckResult,
  AuditResultSummary,
  AutocompleteAuditDetails,
  AutoPlayDetectionDetails,
  CheckSource,
  FocusCheckDetails,
  FocusElementRef,
  NormalizedImpact,
  NormalizedNode,
  NormalizedRuleResult,
  OrientationCheckDetails,
  ReflowCheckDetails,
  TargetSizeCheckDetails,
  TargetSizeIssue,
  TextSpacingCheckDetails,
  TimeLimitDetectorDetails,
  ZoomCheckDetails,
} from '../types.js';
import { AUDIT_DISCLAIMER, HTML_SNIPPET_MAX_LENGTH } from '../constants.js';
import { getRule, type RuleKey } from './rule-registry.js';

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
      toNode(
        el,
        `${describeElement(el)} shows no computed-style change on focus ` +
          '(outline, box-shadow, background-color). Verify manually whether a ' +
          'visual focus indicator exists (pseudo-elements, canvas, or parent ' +
          'changes are not detected).',
      ),
    ),
    applicable,
  );

  bucketize(
    buckets,
    'no-context-change-on-focus',
    details.onFocusViolations.map((v) =>
      toNode(
        v.element,
        `Focusing ${describeElement(v.element)} triggered a ${v.changeType} ` +
          `from ${v.fromUrl} to ${v.toUrl}.`,
      ),
    ),
    applicable,
  );

  bucketize(
    buckets,
    'focus-not-obscured',
    details.focusObscuredIssues.map((issue) =>
      toNode(
        issue.element,
        `${describeElement(issue.element)} is ${(issue.obscuredRatio * 100).toFixed(0)}% ` +
          `obscured when focused (by ${issue.overlaps
            .map((o) => `<${o.obscuredBy.tag.toLowerCase()}>`)
            .join(', ')}). Verify whether the focused element is hidden.`,
      ),
    ),
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

  const minimumFailureSummary = (issue: TargetSizeIssue): string => {
    const base =
      `Target is ${issue.width}x${issue.height}px ` +
      `(min dimension ${issue.minDimension}px, requirement 24px).`;
    if (issue.exception) {
      return (
        `${base} Possible '${issue.exception}' exception: ` +
        `${issue.exceptionDetails ?? 'see manual review notes'}. Confirm manually.`
      );
    }
    return `${base} No exception detected, but the essential exception cannot be ruled out automatically.`;
  };

  // Minimum (2.5.8 AA): findings are fail-aa targets, with and without
  // detected exceptions. Only 'ruled-out' assessments are confirmed violations.
  const minimumIssues = [...details.failAA, ...details.exceptedTargets].filter(
    (issue) => issue.level === 'fail-aa',
  );
  const confirmed = minimumIssues.filter(
    (i) => i.exceptionAssessment === 'ruled-out',
  );
  const needsReview = minimumIssues.filter(
    (i) => i.exceptionAssessment !== 'ruled-out',
  );
  if (!applicable) {
    buckets.inapplicable.push(ruleResult('target-size-minimum', []));
  } else if (minimumIssues.length === 0) {
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
  // Targets already failing AA are reported under target-size-minimum only.
  bucketize(
    buckets,
    'target-size-enhanced',
    details.failAAAOnly.map((issue) =>
      toNode(
        issue,
        `Target is ${issue.width}x${issue.height}px ` +
          `(min dimension ${issue.minDimension}px, AAA requirement 44px). ` +
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

  bucketize(
    buckets,
    'autocomplete-invalid',
    details.invalidAutocomplete.map((field) =>
      toNode(
        field,
        `autocomplete="${field.currentAutocomplete}" is not a valid token. ` +
          `Expected "${field.expectedToken}" (purpose matched by ${field.matchedBy}).`,
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
          'and audio manually.',
      ),
    );
  }
  bucketize(buckets, 'auto-play', nodes, true);

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
