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
  normalizeReflowCheck,
  normalizeTargetSizeCheck,
} from '../dist/index.js';
import type {
  FocusCheckDetails,
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
      },
    ],
    failAAAOnly: [],
    passedTargets: 0,
    exceptedTargets: [],
    summary: {
      failAACount: 1,
      failAAAOnlyCount: 0,
      passCount: 0,
      exceptedCount: 0,
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
