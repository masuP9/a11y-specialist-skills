/**
 * Unit tests for the pure normalization mappers, the envelope assembler, and
 * the cross-check merge. No browser needed — fixtures are hand-built details
 * objects (the same data a runner would gather).
 */

import { test, expect } from '@playwright/test';
import {
  buildAuditResult,
  mergeNormalizedResults,
  normalizeAutocompleteAudit,
  normalizeFocusCheck,
  normalizeTargetSizeCheck,
  normalizeTextSpacingCheck,
  normalizeTimeLimitDetector,
} from '../dist/index.js';
import type {
  FocusCheckDetails,
  TargetSizeCheckDetails,
  TargetSizeIssue,
  TextSpacingCheckDetails,
  TimeLimitDetectorDetails,
} from '../dist/index.js';

const targetSizeIssue = (
  overrides: Partial<TargetSizeIssue> = {}
): TargetSizeIssue => ({
  selector: '#b1',
  tagName: 'button',
  html: '<button id="b1">a</button>',
  htmlTruncated: false,
  role: null,
  accessibleName: 'a',
  width: 10,
  height: 10,
  minDimension: 10,
  level: 'fail-aa',
  exception: null,
  exceptionDetails: null,
  exceptionAssessment: 'not-assessed',
  href: null,
  ...overrides,
});

const emptyFocusDetails = (
  overrides: Partial<FocusCheckDetails> = {}
): FocusCheckDetails => ({
  totalFocusableElements: 0,
  elementsWithFocusStyle: 0,
  elementsWithoutFocusStyle: 0,
  issues: [],
  onFocusViolations: [],
  focusObscuredIssues: [],
  elementsWithObscuredFocus: 0,
  allElements: [],
  interrupted: false,
  screenshotPath: '',
  ...overrides,
});

// =============================================================================
// Classification boundaries
// =============================================================================

test('target-size: not-assessed findings go to incomplete, ruled-out to violations', () => {
  const details: TargetSizeCheckDetails = {
    totalTargetsChecked: 3,
    failAA: [
      targetSizeIssue({ selector: '#review', exceptionAssessment: 'not-assessed' }),
      targetSizeIssue({ selector: '#confirmed', exceptionAssessment: 'ruled-out' }),
    ],
    failAAAOnly: [],
    passedTargets: 1,
    exceptedTargets: [],
    summary: { failAACount: 2, failAAAOnlyCount: 0, passCount: 1, exceptedCount: 0 },
  };

  const buckets = normalizeTargetSizeCheck(details);

  const violation = buckets.violations.find(
    (r) => r.id === 'a11y-skills/target-size-minimum'
  );
  const incomplete = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-minimum'
  );
  expect(violation?.nodes.map((n) => n.target[0])).toEqual(['#confirmed']);
  expect(incomplete?.nodes.map((n) => n.target[0])).toEqual(['#review']);
  expect(buckets.checkedNodes).toBe(3);
});

test('target-size: correct WCAG tags per rule (AA vs AAA)', () => {
  const details: TargetSizeCheckDetails = {
    totalTargetsChecked: 2,
    failAA: [targetSizeIssue()],
    failAAAOnly: [
      targetSizeIssue({
        selector: '#mid',
        width: 30,
        height: 30,
        minDimension: 30,
        level: 'fail-aaa-only',
      }),
    ],
    passedTargets: 0,
    exceptedTargets: [],
    summary: { failAACount: 1, failAAAOnlyCount: 1, passCount: 0, exceptedCount: 0 },
  };

  const buckets = normalizeTargetSizeCheck(details);
  const minimum = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-minimum'
  );
  const enhanced = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-enhanced'
  );
  expect(minimum?.tags).toEqual(
    expect.arrayContaining(['a11y-skills', 'wcag22aa', 'wcag258'])
  );
  expect(enhanced?.tags).toEqual(
    expect.arrayContaining(['a11y-skills', 'wcag21aaa', 'wcag255'])
  );
});

test('focus check: zero focusable elements → all rules inapplicable', () => {
  const buckets = normalizeFocusCheck(emptyFocusDetails());
  expect(buckets.violations).toEqual([]);
  expect(buckets.incomplete).toEqual([]);
  expect(buckets.passes).toEqual([]);
  expect(buckets.inapplicable.map((r) => r.id).sort()).toEqual([
    'a11y-skills/focus-not-obscured',
    'a11y-skills/focus-visible',
    'a11y-skills/no-context-change-on-focus',
  ]);
});

test('focus check: on-focus navigation is a confirmed violation, missing style is not', () => {
  const element = {
    tag: 'A',
    role: null,
    name: 'go',
    selector: '#go',
    html: '<a id="go" href="/x">go</a>',
    htmlTruncated: false,
  };
  const buckets = normalizeFocusCheck(
    emptyFocusDetails({
      totalFocusableElements: 2,
      elementsWithoutFocusStyle: 1,
      issues: [element],
      onFocusViolations: [
        { element, fromUrl: 'a:b', toUrl: 'a:c', changeType: 'navigation' },
      ],
    })
  );

  expect(buckets.violations.map((r) => r.id)).toEqual([
    'a11y-skills/no-context-change-on-focus',
  ]);
  expect(buckets.incomplete.map((r) => r.id)).toContain(
    'a11y-skills/focus-visible'
  );
  const violation = buckets.violations[0];
  expect(violation.nodes[0].failureSummary).toContain('navigation');
});

test('text-spacing clipping is a confirmed violation', () => {
  const details: TextSpacingCheckDetails = {
    totalElementsChecked: 5,
    clippedElements: [
      {
        selector: '.box',
        tagName: 'div',
        html: '<div class="box">text</div>',
        htmlTruncated: false,
        beforeMetrics: { scrollWidth: 80, scrollHeight: 20, clientWidth: 80, clientHeight: 20 },
        afterMetrics: { scrollWidth: 120, scrollHeight: 20, clientWidth: 80, clientHeight: 20 },
        overflow: 'hidden',
        overflowX: 'hidden',
        overflowY: 'visible',
        issueType: 'horizontal-clip',
      },
    ],
  };
  const buckets = normalizeTextSpacingCheck(details);
  expect(buckets.violations.map((r) => r.id)).toEqual(['a11y-skills/text-spacing']);
});

test('time-limit: meta refresh and timers are incomplete; timers are page-level', () => {
  const details: TimeLimitDetectorDetails = {
    metaRefresh: [
      {
        content: '30',
        seconds: 30,
        url: null,
        html: '<meta http-equiv="refresh" content="30">',
        htmlTruncated: false,
      },
    ],
    timers: [{ type: 'setInterval', delayMs: 60000, callStack: null }],
    countdownIndicators: [],
    hasTimeLimits: true,
  };
  const buckets = normalizeTimeLimitDetector(details);
  expect(buckets.violations).toEqual([]);
  const ids = buckets.incomplete.map((r) => r.id);
  expect(ids).toContain('a11y-skills/meta-refresh');
  expect(ids).toContain('a11y-skills/time-limit-timer');
  const timerRule = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/time-limit-timer'
  );
  expect(timerRule?.nodes[0].target).toEqual(['html']);
  expect(timerRule?.nodes[0].html.length).toBeGreaterThan(0);
});

test('autocomplete: invalid tokens are violations, missing ones incomplete', () => {
  const field = {
    selector: '#e',
    tagName: 'input',
    html: '<input id="e">',
    htmlTruncated: false,
    inputType: 'text',
    name: 'email',
    id: 'e',
    labelText: 'Email',
    currentAutocomplete: null as string | null,
    expectedToken: 'email',
    matchedBy: 'name' as const,
    issueType: 'missing' as const,
  };
  const buckets = normalizeAutocompleteAudit({
    totalFieldsChecked: 2,
    missingAutocomplete: [field],
    invalidAutocomplete: [
      {
        ...field,
        selector: '#bad',
        currentAutocomplete: 'e-mail',
        issueType: 'invalid',
      },
    ],
  });
  expect(buckets.violations.map((r) => r.id)).toEqual([
    'a11y-skills/autocomplete-invalid',
  ]);
  expect(buckets.incomplete.map((r) => r.id)).toEqual([
    'a11y-skills/autocomplete-missing',
  ]);
});

// =============================================================================
// Envelope contract
// =============================================================================

test('buildAuditResult derives summary from the buckets and stamps the contract fields', () => {
  const details: TextSpacingCheckDetails = {
    totalElementsChecked: 0,
    clippedElements: [],
  };
  const result = buildAuditResult({
    source: 'text-spacing-check',
    url: 'about:blank',
    details,
    buckets: normalizeTextSpacingCheck(details),
  });

  expect(result.source).toBe('text-spacing-check');
  expect(result.url).toBe('about:blank');
  expect(typeof result.timestamp).toBe('string');
  expect(result.disclaimer.coverage).toBeDefined();
  expect(result.summary.violationCount).toBe(result.violations.length);
  expect(result.summary.incompleteCount).toBe(result.incomplete.length);
  expect(result.summary.passCount).toBe(result.passes.length);
});

// =============================================================================
// Merge invariants
// =============================================================================

test('mergeNormalizedResults rejects URL mismatches', () => {
  const details: TextSpacingCheckDetails = {
    totalElementsChecked: 0,
    clippedElements: [],
  };
  const a = buildAuditResult({
    source: 'text-spacing-check',
    url: 'https://example.com/a',
    details,
    buckets: normalizeTextSpacingCheck(details),
  });
  const b = buildAuditResult({
    source: 'reflow-check',
    url: 'https://example.com/b',
    details,
    buckets: normalizeTextSpacingCheck(details),
  });
  expect(() => mergeNormalizedResults([a, b])).toThrow(/URL mismatch/);
});

test('mergeNormalizedResults dedupes nodes and applies bucket priority', () => {
  const mkRule = (nodes: Array<{ sel: string; summary: string }>) => ({
    id: 'a11y-skills/text-spacing',
    impact: 'moderate' as const,
    description: 'd',
    help: 'h',
    helpUrl: 'u',
    tags: ['a11y-skills'],
    nodes: nodes.map((n) => ({
      target: [n.sel],
      html: '<div>',
      htmlTruncated: false,
      failureSummary: n.summary,
    })),
  });
  const base = {
    url: 'https://example.com/',
    details: {},
    summary: { violationCount: 0, incompleteCount: 0, passCount: 0 },
    disclaimer: { message: '', messageEn: '', coverage: '', moreInfo: '' },
  };
  const first = {
    ...base,
    source: 'text-spacing-check' as const,
    timestamp: '2026-01-01T00:00:00.000Z',
    violations: [],
    incomplete: [mkRule([{ sel: '.a', summary: 's1' }])],
    passes: [],
    inapplicable: [],
  };
  const second = {
    ...base,
    source: 'text-spacing-check' as const,
    timestamp: '2026-01-02T00:00:00.000Z',
    violations: [
      mkRule([
        { sel: '.a', summary: 's1' }, // duplicate of first's node
        { sel: '.b', summary: 's2' },
      ]),
    ],
    incomplete: [],
    passes: [],
    inapplicable: [],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged = mergeNormalizedResults([first, second] as any);

  // priority: the rule ends up in violations, not incomplete
  expect(merged.incomplete).toEqual([]);
  expect(merged.violations).toHaveLength(1);
  // node '.a'/'s1' deduplicated across results
  expect(merged.violations[0].nodes.map((n) => n.target[0]).sort()).toEqual([
    '.a',
    '.b',
  ]);
  expect(merged.timestamp).toBe('2026-01-02T00:00:00.000Z');
});
