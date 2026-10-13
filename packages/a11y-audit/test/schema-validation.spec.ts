/**
 * Validates that envelopes produced by the builders conform to the published
 * JSON Schemas (ajv, draft 2020-12), and that the pre-0.3.0 flat result shape
 * is rejected.
 */

import { test, expect } from '@playwright/test';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  buildAuditResult,
  normalizeAccessibleAuthenticationCheck,
  normalizeAxeResults,
  normalizeChangeOnInputCheck,
  normalizeFocusCheck,
  normalizeFocusOrderCheck,
  normalizeKeyboardReachabilityCheck,
  normalizeKeyboardTrapCheck,
  normalizeMotionActuationCheck,
  normalizeRedundantEntryCheck,
  normalizeReflowCheck,
  normalizeTargetSizeCheck,
} from '../dist/index.js';
import type {
  AccessibleAuthenticationCheckDetails,
  ChangeOnInputCheckDetails,
  FocusCheckDetails,
  FocusOrderCheckDetails,
  FocusOrderStop,
  FocusOrderTransition,
  KeyboardReachabilityCheckDetails,
  KeyboardTrapCheckDetails,
  MotionActuationCheckDetails,
  RedundantEntryCheckDetails,
  RedundantEntryField,
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
    frame: null,
    shadowHosts: [],
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
      {
        id: 0,
        tabStep: 1,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        ...element,
        tag: 'BUTTON',
        hasFocusStyle: false,
        diff: {},
      },
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

test('focus-indicator-check envelope with a visualDiff validates, and a non-numeric diffRatio is rejected', () => {
  const element = {
    tag: 'BUTTON',
    role: null,
    name: 'x',
    selector: '#x',
    html: '<button id="x">x</button>',
    htmlTruncated: false,
    frame: null,
    shadowHosts: [],
    visualDiff: {
      diffRatio: 0.25,
      rect: { x: 1, y: 2, width: 3, height: 4 },
    },
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
      {
        id: 0,
        tabStep: 1,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        ...element,
        hasFocusStyle: false,
        diff: {},
      },
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

  const broken = structuredClone(result);
  (
    broken.details.allElements[0] as unknown as {
      visualDiff: { diffRatio: unknown };
    }
  ).visualDiff.diffRatio = 'a lot';
  const validate = ajv.compile(RESULT_SCHEMAS['focus-indicator-check']);
  expect(validate(broken)).toBe(false);
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

test('redundant-entry-check envelope with scoped and repeated groups (with and without copyControls) validates against its schema', () => {
  const field = (
    selector: string,
    overrides: Partial<RedundantEntryField>,
  ): RedundantEntryField => ({
    selector,
    tagName: 'input',
    html: `<input id="${selector.slice(1)}">`,
    htmlTruncated: false,
    inputType: 'text',
    name: null,
    id: selector.slice(1),
    labelText: null,
    autocomplete: null,
    purpose: 'email',
    purposeSource: 'name',
    scope: null,
    section: null,
    contactType: null,
    editable: true,
    formSelector: '#checkout',
    ...overrides,
  });
  const details: RedundantEntryCheckDetails = {
    totalFieldsChecked: 4,
    fieldsWithPurpose: 4,
    groups: [
      {
        purpose: 'street-address',
        formSelector: '#checkout',
        kind: 'scoped',
        fields: [
          field('#ship', {
            purpose: 'street-address',
            purposeSource: 'autocomplete',
            autocomplete: 'shipping street-address',
            scope: 'shipping',
          }),
          field('#bill', {
            purpose: 'street-address',
            purposeSource: 'autocomplete',
            autocomplete: 'billing street-address',
            scope: 'billing',
          }),
        ],
        copyControls: [
          { selector: '#same', tagName: 'input', text: 'Same as shipping' },
        ],
      },
      {
        purpose: 'email',
        formSelector: null,
        kind: 'repeated',
        fields: [
          field('#mail', { formSelector: null }),
          field('#mail2', { name: 'email_confirm', formSelector: null }),
        ],
        copyControls: [],
      },
    ],
  };
  const result = buildAuditResult({
    source: 'redundant-entry-check',
    url: 'about:blank',
    details,
    buckets: normalizeRedundantEntryCheck(details),
  });
  expectValid('redundant-entry-check', result);
});

test('motion-actuation-check envelope with window and document listeners and a simulation result validates against its schema', () => {
  const details: MotionActuationCheckDetails = {
    listenerInspection: 'cdp',
    listeners: [
      {
        target: 'window',
        type: 'devicemotion',
        useCapture: false,
        passive: false,
        once: false,
        scriptId: '12',
        lineNumber: 9,
        columnNumber: 4,
        handlerPreview: 'function () {}',
      },
      {
        target: 'document',
        type: 'deviceorientation',
        useCapture: true,
        passive: false,
        once: false,
        scriptId: '12',
        lineNumber: 20,
        columnNumber: 0,
        handlerPreview: null,
      },
    ],
    simulation: {
      status: 'ran',
      results: [
        {
          type: 'devicemotion',
          eventsDispatched: 10,
          domMutations: 3,
          baselineDomMutations: 0,
          navigated: false,
          urlAfter: null,
          error: null,
        },
      ],
    },
  };
  const result = buildAuditResult({
    source: 'motion-actuation-check',
    url: 'about:blank',
    details,
    buckets: normalizeMotionActuationCheck(details),
  });
  expectValid('motion-actuation-check', result);
});

test('motion-actuation-check envelope for an unsupported browser validates against its schema', () => {
  const details: MotionActuationCheckDetails = {
    listenerInspection: 'unsupported',
    listeners: [],
    simulation: { status: 'unsupported', results: [] },
  };
  const result = buildAuditResult({
    source: 'motion-actuation-check',
    url: 'about:blank',
    details,
    buckets: normalizeMotionActuationCheck(details),
  });
  expectValid('motion-actuation-check', result);
});

const CHANGE_ON_INPUT_CONTROL = {
  selector: '#city',
  controlKind: 'select' as const,
  type: 'select',
  name: 'city',
  label: 'City',
  html: '<select id="city"></select>',
  htmlTruncated: false,
};

test('change-on-input-check envelope with every kind of context change validates against its schema', () => {
  const details: ChangeOnInputCheckDetails = {
    controlsFound: 3,
    controlsTested: 2,
    skipped: [{ selector: '#only', reason: 'no-alternative-option' }],
    untested: [
      {
        control: { ...CHANGE_ON_INPUT_CONTROL, selector: '#covered' },
        reason: 'locator.click: Timeout 5000ms exceeded.',
      },
    ],
    findings: [
      {
        control: CHANGE_ON_INPUT_CONTROL,
        action: 'selected option 2 "Tokyo"',
        changes: [
          { kind: 'navigation', toUrl: 'https://example.com/landing' },
          { kind: 'new-window', url: 'https://example.com/help' },
          { kind: 'focus-moved', toSelector: '#next' },
          { kind: 'dialog', dialogType: 'alert', message: 'saved' },
        ],
      },
    ],
    restarts: 1,
    aborted: null,
  };
  const result = buildAuditResult({
    source: 'change-on-input-check',
    url: 'about:blank',
    details,
    buckets: normalizeChangeOnInputCheck(details),
  });
  expectValid('change-on-input-check', result);
});

test('change-on-input-check envelope that stopped early validates against its schema', () => {
  const details: ChangeOnInputCheckDetails = {
    controlsFound: 5,
    controlsTested: 1,
    skipped: [],
    untested: [],
    findings: [],
    restarts: 0,
    aborted: { reason: 'control-limit', testedCount: 1, foundCount: 5 },
  };
  const result = buildAuditResult({
    source: 'change-on-input-check',
    url: 'about:blank',
    details,
    buckets: normalizeChangeOnInputCheck(details),
  });
  expectValid('change-on-input-check', result);
});

test('accessible-authentication-check envelope with three kinds of fields, a CAPTCHA and a ran paste test validates against its schema', () => {
  const details: AccessibleAuthenticationCheckDetails = {
    fields: [
      {
        selector: '#user',
        html: '<input id="user" type="text">',
        htmlTruncated: false,
        kind: 'username',
        inputType: 'text',
        name: 'user',
        id: 'user',
        labelText: 'User',
        autocomplete: null,
        formAutocomplete: null,
        autocompleteStatus: 'missing',
        editable: true,
        visible: true,
        formSelector: '#login',
        paste: null,
        pasteListenerCount: null,
      },
      {
        selector: '#pw',
        html: '<input id="pw" type="password" autocomplete="off">',
        htmlTruncated: false,
        kind: 'password',
        inputType: 'password',
        name: null,
        id: 'pw',
        labelText: 'Password',
        autocomplete: 'off',
        formAutocomplete: 'off',
        autocompleteStatus: 'off',
        editable: true,
        visible: true,
        formSelector: '#login',
        paste: {
          result: 'blocked',
          valueAfterPaste: 'empty',
          pasteEventPrevented: true,
          navigated: false,
          error: null,
        },
        pasteListenerCount: 1,
      },
      {
        selector: '#code',
        html: '<input id="code" name="otp">',
        htmlTruncated: false,
        kind: 'one-time-code',
        inputType: 'text',
        name: 'otp',
        id: 'code',
        labelText: null,
        autocomplete: null,
        formAutocomplete: null,
        autocompleteStatus: 'missing',
        editable: true,
        visible: true,
        formSelector: null,
        paste: {
          result: null,
          valueAfterPaste: null,
          pasteEventPrevented: null,
          navigated: true,
          error: null,
        },
        pasteListenerCount: null,
      },
    ],
    captchas: [
      {
        selector: '.g-recaptcha',
        html: '<div class="g-recaptcha"></div>',
        htmlTruncated: false,
        matchedBy: '.g-recaptcha',
        visible: true,
      },
    ],
    pasteTest: { status: 'ran', reason: null, probe: '1234' },
  };
  const result = buildAuditResult({
    source: 'accessible-authentication-check',
    url: 'about:blank',
    details,
    buckets: normalizeAccessibleAuthenticationCheck(details),
  });
  expectValid('accessible-authentication-check', result);
});

test('accessible-authentication-check envelope for an unavailable paste test validates against its schema', () => {
  const details: AccessibleAuthenticationCheckDetails = {
    fields: [],
    captchas: [],
    pasteTest: {
      status: 'unavailable',
      reason: 'clipboard-permission',
      probe: null,
    },
  };
  const result = buildAuditResult({
    source: 'accessible-authentication-check',
    url: 'about:blank',
    details,
    buckets: normalizeAccessibleAuthenticationCheck(details),
  });
  expectValid('accessible-authentication-check', result);
});

test('focus-order-check envelope with stops, every transition kind, a detour, dialog probes and an abort validates against its schema', () => {
  const stop = (step: number, x: number, y: number): FocusOrderStop => ({
    step,
    selector: `body > a:nth-child(${step})`,
    shadowHosts: [],
    tag: 'a',
    role: null,
    name: `Link ${step}`,
    html: `<a href="#">Link ${step}</a>`,
    htmlTruncated: false,
    rect: { x, y, width: 100, height: 40 },
    positioning: 'flow',
    inFrame: false,
    afterWrap: false,
  });
  const transition = (
    from: number,
    kind: FocusOrderTransition['kind'],
  ): FocusOrderTransition => ({
    from,
    to: from + 1,
    kind,
    dx: -200,
    dy: -400,
    distance: 447.2,
    distanceRatio: 0.316,
  });
  const trigger = {
    selector: '#open',
    tag: 'button',
    role: null,
    name: 'Open',
    html: '<button id="open">Open</button>',
    htmlTruncated: false,
  };
  const details: FocusOrderCheckDetails = {
    viewport: { width: 1280, height: 720 },
    direction: 'ltr',
    stops: [stop(1, 0, 0), stop(2, 300, 0), stop(3, 0, 400)],
    transitions: [
      transition(0, 'forward'),
      transition(1, 'column-wrap'),
      transition(2, 'backward-block'),
      transition(3, 'backward-inline'),
    ],
    skippedTransitions: 1,
    detours: [
      { index: 1, distanceIn: 900, distanceOut: 880, distanceAcross: 40 },
    ],
    tabWalk: {
      presses: 4,
      ended: 'cycle',
      capped: false,
      focusableCount: 3,
      frameCount: 0,
    },
    dialogTriggersFound: 3,
    dialogs: [
      {
        trigger,
        status: 'opened',
        dialogSelector: '#dlg',
        modal: true,
        focusAfterOpen: 'inside',
        focusAfterOpenSelector: null,
        closedBy: 'escape',
        focusAfterClose: 'elsewhere',
        focusAfterCloseSelector: '#other',
        error: null,
      },
      {
        trigger,
        status: 'not-opened',
        dialogSelector: null,
        modal: null,
        focusAfterOpen: null,
        focusAfterOpenSelector: null,
        closedBy: null,
        focusAfterClose: null,
        focusAfterCloseSelector: null,
        error: null,
      },
      {
        trigger,
        status: 'navigated',
        dialogSelector: '#dlg',
        modal: true,
        focusAfterOpen: 'trigger',
        focusAfterOpenSelector: null,
        closedBy: null,
        focusAfterClose: null,
        focusAfterCloseSelector: null,
        error: null,
      },
    ],
    dialogsNotTried: 0,
    dialogSearch: 'ran',
    dialogSearchError: null,
    aborted: { reason: 'timeout', url: 'about:blank' },
  };
  const result = buildAuditResult({
    source: 'focus-order-check',
    url: 'about:blank',
    details,
    buckets: normalizeFocusOrderCheck(details),
  });
  expectValid('focus-order-check', result);
});

test('focus-order-check envelope without an abort validates against its schema', () => {
  const details: FocusOrderCheckDetails = {
    viewport: { width: 1280, height: 720 },
    direction: 'rtl',
    stops: [],
    transitions: [],
    skippedTransitions: 0,
    detours: [],
    tabWalk: {
      presses: 10,
      ended: 'tab-limit',
      capped: false,
      focusableCount: 0,
      frameCount: 0,
    },
    dialogTriggersFound: 0,
    dialogs: [],
    dialogsNotTried: 0,
    dialogSearch: 'ran',
    dialogSearchError: null,
    aborted: null,
  };
  const result = buildAuditResult({
    source: 'focus-order-check',
    url: 'about:blank',
    details,
    buckets: normalizeFocusOrderCheck(details),
  });
  expectValid('focus-order-check', result);
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

test('auto-play-detection のスキーマは mediaElements と unmeasuredFrames を必須にする', () => {
  const details = RESULT_SCHEMAS['auto-play-detection'].properties?.details as {
    required: string[];
  };
  expect(details.required).toEqual(
    expect.arrayContaining(['mediaElements', 'unmeasuredFrames']),
  );
});
