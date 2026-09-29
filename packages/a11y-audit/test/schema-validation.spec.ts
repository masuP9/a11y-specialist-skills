/**
 * Validates that envelopes produced by the builders conform to the published
 * JSON Schemas (ajv, draft 2020-12), and that the pre-0.3.0 flat result shape
 * is rejected.
 */

import { test, expect } from '@playwright/test';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  buildAuditResult,
  normalizeAxeResults,
  normalizeFocusCheck,
  normalizeKeyboardReachabilityCheck,
  normalizeKeyboardTrapCheck,
  normalizeReflowCheck,
  normalizeTargetSizeCheck,
} from '../dist/index.js';
import type {
  FocusCheckDetails,
  KeyboardReachabilityCheckDetails,
  KeyboardTrapCheckDetails,
  ReflowCheckDetails,
  TargetSizeCheckDetails,
} from '../dist/index.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });

function expectValid(
  schemaKey: keyof typeof RESULT_SCHEMAS,
  data: unknown,
): void {
  const validate = ajv.compile(RESULT_SCHEMAS[schemaKey]);
  const valid = validate(data);
  expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
}

test('axe-audit envelope validates against its schema', () => {
  const buckets = normalizeAxeResults({
    violations: [
      {
        id: 'image-alt',
        impact: 'critical',
        description: 'd',
        help: 'h',
        helpUrl: 'https://example.com',
        tags: ['wcag2a', 'wcag111'],
        nodes: [
          {
            html: '<img src="missing.png">',
            target: ['img'],
            failureSummary: 'Fix it',
          },
        ],
      },
    ],
    incomplete: [],
    passes: [],
    inapplicable: [],
  });
  const result = buildAuditResult({
    source: 'axe-audit',
    url: 'about:blank',
    details: {
      tagsRun: ['wcag2a'],
      rulesOverride: null,
      violationRuleCount: 1,
      passRuleCount: 0,
      incompleteRuleCount: 0,
      inapplicableRuleCount: 0,
    },
    buckets,
  });
  expectValid('axe-audit', result);
});

test('focus-indicator-check envelope validates against its schema', () => {
  const element = {
    tag: 'BUTTON',
    role: null,
    name: 'x',
    selector: '#x',
    html: '<button id="x">x</button>',
    htmlTruncated: false,
  };
  const details: FocusCheckDetails = {
    totalFocusableElements: 1,
    elementsWithFocusStyle: 0,
    elementsWithoutFocusStyle: 1,
    issues: [element],
    onFocusViolations: [],
    focusObscuredIssues: [],
    elementsWithObscuredFocus: 0,
    allElements: [
      { id: 0, ...element, tag: 'BUTTON', hasFocusStyle: false, diff: {} },
    ],
    interrupted: false,
    screenshotPath: '',
  };
  const result = buildAuditResult({
    source: 'focus-indicator-check',
    url: 'about:blank',
    details,
    buckets: normalizeFocusCheck(details),
  });
  expectValid('focus-indicator-check', result);
});

test('reflow-check envelope validates against its schema', () => {
  const details: ReflowCheckDetails = {
    viewport: { width: 320, height: 256 },
    hasHorizontalScroll: true,
    documentScrollWidth: 1200,
    documentClientWidth: 320,
    overflowingElements: [
      {
        selector: 'div:nth-child(1)',
        tagName: 'div',
        html: '<div class="wide"></div>',
        htmlTruncated: false,
        rect: { left: 0, right: 1200, width: 1200 },
        viewportWidth: 320,
        reason: 'overflow-right',
      },
    ],
    clippedTextElements: [],
  };
  const result = buildAuditResult({
    source: 'reflow-check',
    url: 'about:blank',
    details,
    buckets: normalizeReflowCheck(details),
  });
  expectValid('reflow-check', result);
});

test('target-size-check envelope validates against its schema', () => {
  const details: TargetSizeCheckDetails = {
    totalTargetsChecked: 1,
    failAA: [
      {
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
        spacing: {
          diameter: 24,
          center: { x: 15, y: 15 },
          applies: false,
          intersections: [
            { selector: '#b2', kind: 'circle', distance: 20, required: 24 },
          ],
        },
      },
    ],
    failAAAOnly: [],
    passedTargets: 0,
    occludedTargets: 0,
    exceptedTargets: [],
    summary: {
      failAACount: 1,
      failAAAOnlyCount: 0,
      passCount: 0,
      exceptedCount: 0,
      verifiedCount: 0,
    },
  };
  const result = buildAuditResult({
    source: 'target-size-check',
    url: 'about:blank',
    details,
    buckets: normalizeTargetSizeCheck(details),
  });
  expectValid('target-size-check', result);
});

test('keyboard-trap-check envelope validates against its schema', () => {
  const details: KeyboardTrapCheckDetails = {
    totalFocusableElements: 2,
    trapCandidates: 1,
    confirmedTraps: [
      {
        selector: '#trap-a',
        tag: 'BUTTON',
        name: 'Trap Button A',
        html: '<button id="trap-a">Trap Button A</button>',
        htmlTruncated: false,
        escapeAttempts: {
          escape: false,
          shiftTab: false,
          closeAffordance: false,
        },
        isAriaModal: false,
      },
    ],
    needsReview: [],
    tabWalkCapped: false,
    screenshotPath: '',
  };
  const result = buildAuditResult({
    source: 'keyboard-trap-check',
    url: 'about:blank',
    details,
    buckets: normalizeKeyboardTrapCheck(details),
  });
  expectValid('keyboard-trap-check', result);

  // Results from versions before `tabWalkCapped` existed still validate.
  const legacy = structuredClone(result);
  delete legacy.details.tabWalkCapped;
  expectValid('keyboard-trap-check', legacy);
});

test('keyboard-reachability-check envelope with every reachedBy value validates against its schema', () => {
  const base = {
    tag: 'button',
    role: 'button',
    html: '<button>x</button>',
    htmlTruncated: false,
    tabindex: null,
    evidence: 'native' as const,
    compositeSelector: null,
    foundIn: 'load' as const,
  };
  const details: KeyboardReachabilityCheckDetails = {
    totalOperableElements: 5,
    reachedCount: 3,
    unreachableCount: 1,
    notEvaluatedCount: 1,
    excluded: { disabled: 1, inert: 0, hidden: 2, insideOperable: 0 },
    elements: [
      {
        ...base,
        selector: '#a',
        name: 'A',
        reachedBy: 'tab',
        reason: null,
        confidence: null,
      },
      {
        ...base,
        selector: '#b',
        name: 'B',
        reachedBy: 'arrow',
        compositeSelector: '#tb',
        reason: null,
        confidence: null,
      },
      {
        ...base,
        selector: '#c',
        name: 'C',
        role: 'option',
        reachedBy: 'activedescendant',
        compositeSelector: '#lb',
        foundIn: 'popup',
        reason: null,
        confidence: null,
      },
      {
        ...base,
        selector: '#d',
        name: 'D',
        tabindex: '-1',
        reachedBy: 'unreachable',
        reason: 'tabindex-negative-outside-composite',
        confidence: 'high',
      },
      {
        ...base,
        selector: '#e',
        name: 'E',
        reachedBy: 'not-evaluated',
        compositeSelector: '#tb',
        reason: 'exploration-aborted',
        confidence: null,
      },
    ],
    composites: [
      {
        selector: '#tb',
        role: 'toolbar',
        orientation: 'horizontal',
        keysPressed: 3,
        status: 'stopped',
        stopReason: 'aborted',
      },
      {
        selector: '#lb',
        role: 'listbox',
        orientation: 'vertical',
        keysPressed: 4,
        status: 'explored',
        stopReason: null,
      },
    ],
    popups: [
      {
        triggerSelector: '#combo',
        popupSelector: '#lb',
        status: 'explored',
        itemsFound: 1,
        keysPressed: 2,
        stopReason: null,
      },
      {
        triggerSelector: '#hint',
        popupSelector: null,
        status: 'opened-not-entered',
        itemsFound: 1,
        keysPressed: 2,
        stopReason: null,
      },
    ],
    tabWalkCapped: false,
    aborted: { reason: 'navigation', url: 'about:blank#next' },
    screenshotPath: '',
  };
  const result = buildAuditResult({
    source: 'keyboard-reachability-check',
    url: 'about:blank',
    details,
    buckets: normalizeKeyboardReachabilityCheck(details),
  });
  expectValid('keyboard-reachability-check', result);
});

test('the pre-0.3.0 flat result shape is rejected', () => {
  const legacy = {
    url: 'about:blank',
    timestamp: '2026-01-01T00:00:00.000Z',
    violations: [],
    passes: 8,
    incomplete: 1,
    inapplicable: 50,
    violationCount: 0,
  };
  const validate = ajv.compile(RESULT_SCHEMAS['axe-audit']);
  expect(validate(legacy)).toBe(false);
});
