/**
 * Fixture Gallery: manifest-driven integration tests for all 18 checks.
 *
 * Each manifest entry:
 * - Serves an HTML fixture from test/fixtures/pages/ via a worker-scoped
 *   local HTTP server (no file:// — required for ownsNavigation checks).
 * - Runs the check using the appropriate runner kind (page-current /
 *   page-navigating / browser-navigating).
 * - Asserts that each named rule lands in exactly the expected bucket.
 * - For 'passes' expectations: also guards against silent inapplicable pass.
 * - Validates the result envelope against RESULT_SCHEMAS[check] via Ajv.
 *
 * Coverage: all 32 custom finding-capable rules from rule-registry.ts
 * (auto-play and auto-play-audio live in their own specs).
 * axe-audit: representative rule (image-alt); full rule coverage is out of
 * scope for axe (hundreds of external rules).
 */

import {
  test,
  expect,
  runFixtureCheck,
  assertRuleBuckets,
} from './helpers/fixtures.js';
import type { ExpectRulesMap } from './helpers/fixtures.js';
import Ajv2020 from 'ajv/dist/2020.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';

// ---------------------------------------------------------------------------
// AJV — one compiled validator per check (reused across manifest entries)
// ---------------------------------------------------------------------------

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validators = Object.fromEntries(
  Object.entries(RESULT_SCHEMAS).map(([checkName, schema]) => [
    checkName,
    ajv.compile(schema),
  ]),
);

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

interface ManifestEntry {
  /** Check name (matches RESULT_SCHEMAS key) */
  check: string;
  /** Scenario label for the test name */
  scenario: string;
  /** Fixture path relative to test/fixtures/pages/ */
  fixture: string;
  /** Expected bucket per rule id */
  expectRules: ExpectRulesMap;
}

const MANIFEST: ManifestEntry[] = [
  // =========================================================================
  // axe-audit (representative rule — image-alt violation)
  // =========================================================================
  {
    check: 'axe-audit',
    scenario: 'finding: image-alt violation',
    fixture: 'axe-audit/finding.html',
    expectRules: {
      'image-alt': 'violations',
    },
  },
  {
    check: 'axe-audit',
    scenario: 'clear: no obvious axe violations',
    fixture: 'axe-audit/clear.html',
    // axe-audit produces dynamic rules — we only verify no violations/incomplete
    // for the specific rules we care about. For the clear case, assert passes.
    expectRules: {},
  },

  // =========================================================================
  // focus-indicator-check
  // Rule 1: a11y-skills/focus-visible (incomplete)
  // =========================================================================
  {
    check: 'focus-indicator-check',
    scenario: 'finding: focus-visible (missing focus style)',
    fixture: 'focus-indicator/finding-focus-visible.html',
    expectRules: {
      'a11y-skills/focus-visible': 'incomplete',
    },
  },
  // Rule 2: a11y-skills/no-context-change-on-focus (violation)
  {
    check: 'focus-indicator-check',
    scenario: 'finding: no-context-change-on-focus (navigation on focus)',
    fixture: 'focus-indicator/finding-context-change.html',
    expectRules: {
      'a11y-skills/no-context-change-on-focus': 'violations',
    },
  },
  // Rule 3: a11y-skills/focus-not-obscured (incomplete, 2.4.11: fully hidden)
  // Rule 3b: a11y-skills/focus-not-obscured-enhanced (incomplete, 2.4.12: any part hidden)
  {
    check: 'focus-indicator-check',
    scenario: 'finding: focus-not-obscured (sticky header fully covers button)',
    fixture: 'focus-indicator/finding-focus-obscured.html',
    expectRules: {
      'a11y-skills/focus-not-obscured': 'incomplete',
      'a11y-skills/focus-not-obscured-enhanced': 'incomplete',
    },
  },
  {
    check: 'focus-indicator-check',
    scenario: 'clear: visible focus indicators on all elements',
    fixture: 'focus-indicator/clear.html',
    expectRules: {
      'a11y-skills/focus-visible': 'passes',
      'a11y-skills/no-context-change-on-focus': 'passes',
      'a11y-skills/focus-not-obscured': 'passes',
      'a11y-skills/focus-not-obscured-enhanced': 'passes',
    },
  },

  // =========================================================================
  // reflow-check
  // Rule 4: a11y-skills/reflow-overflow (incomplete)
  // =========================================================================
  {
    check: 'reflow-check',
    scenario: 'finding: reflow-overflow (wide element)',
    fixture: 'reflow/finding-overflow.html',
    expectRules: {
      'a11y-skills/reflow-overflow': 'incomplete',
    },
  },
  // Rule 5: a11y-skills/reflow-clipped-text (incomplete)
  {
    check: 'reflow-check',
    scenario: 'finding: reflow-clipped-text (overflow:hidden clips text)',
    fixture: 'reflow/finding-clipped-text.html',
    expectRules: {
      'a11y-skills/reflow-clipped-text': 'incomplete',
    },
  },
  {
    check: 'reflow-check',
    scenario: 'clear: content reflows without overflow',
    fixture: 'reflow/clear.html',
    expectRules: {
      'a11y-skills/reflow-overflow': 'passes',
      'a11y-skills/reflow-clipped-text': 'passes',
    },
  },

  // =========================================================================
  // text-spacing-check
  // Rule 6: a11y-skills/text-spacing (violation)
  // =========================================================================
  {
    check: 'text-spacing-check',
    scenario: 'finding: text-spacing violation (clipped on spacing override)',
    fixture: 'text-spacing/finding.html',
    expectRules: {
      'a11y-skills/text-spacing': 'violations',
    },
  },
  {
    check: 'text-spacing-check',
    scenario: 'clear: no clipping under text spacing overrides',
    fixture: 'text-spacing/clear.html',
    expectRules: {
      'a11y-skills/text-spacing': 'passes',
    },
  },

  // =========================================================================
  // zoom-200-check
  // Rule 7: a11y-skills/resize-text (incomplete)
  // =========================================================================
  {
    check: 'zoom-200-check',
    scenario: 'finding: resize-text (horizontal scroll at 200% zoom)',
    fixture: 'zoom/finding.html',
    expectRules: {
      'a11y-skills/resize-text': 'incomplete',
    },
  },
  {
    check: 'zoom-200-check',
    scenario: 'clear: no overflow at 200% zoom',
    fixture: 'zoom/clear.html',
    expectRules: {
      'a11y-skills/resize-text': 'passes',
    },
  },

  // =========================================================================
  // orientation-check
  // Rule 8: a11y-skills/orientation-lock (incomplete)
  // =========================================================================
  {
    check: 'orientation-check',
    scenario: 'finding: orientation-lock (rotate-device text detected)',
    fixture: 'orientation/finding.html',
    expectRules: {
      'a11y-skills/orientation-lock': 'incomplete',
    },
  },
  {
    check: 'orientation-check',
    scenario: 'clear: no orientation restriction',
    fixture: 'orientation/clear.html',
    expectRules: {
      'a11y-skills/orientation-lock': 'passes',
    },
  },

  // =========================================================================
  // autocomplete-audit
  // Rule 9: a11y-skills/autocomplete-invalid (violation)
  // =========================================================================
  {
    check: 'autocomplete-audit',
    scenario: 'finding: autocomplete-invalid (wrong token)',
    fixture: 'autocomplete/finding-invalid.html',
    expectRules: {
      'a11y-skills/autocomplete-invalid': 'violations',
    },
  },
  {
    check: 'autocomplete-audit',
    scenario:
      'finding: autocomplete-invalid (valid tokens in an invalid combination)',
    fixture: 'autocomplete/finding-invalid-combination.html',
    expectRules: {
      'a11y-skills/autocomplete-invalid': 'violations',
    },
  },
  // Rule 9b: a11y-skills/autocomplete-invalid-unverified (incomplete)
  {
    check: 'autocomplete-audit',
    scenario:
      'finding: autocomplete-invalid-unverified (misspelled token on a field whose purpose is not inferred)',
    fixture: 'autocomplete/finding-invalid-unverified.html',
    expectRules: {
      'a11y-skills/autocomplete-invalid-unverified': 'incomplete',
      'a11y-skills/autocomplete-invalid': 'passes',
    },
  },
  // Rule 10: a11y-skills/autocomplete-missing (incomplete)
  {
    check: 'autocomplete-audit',
    scenario:
      'finding: autocomplete-missing (no autocomplete on personal-info field)',
    fixture: 'autocomplete/finding-missing.html',
    expectRules: {
      'a11y-skills/autocomplete-missing': 'incomplete',
    },
  },
  {
    check: 'autocomplete-audit',
    scenario: 'clear: correct autocomplete tokens on all fields',
    fixture: 'autocomplete/clear.html',
    expectRules: {
      'a11y-skills/autocomplete-invalid': 'passes',
      'a11y-skills/autocomplete-invalid-unverified': 'passes',
      'a11y-skills/autocomplete-missing': 'passes',
    },
  },
  {
    check: 'autocomplete-audit',
    scenario:
      'clear: valid token combinations; disabled/readonly fields are skipped',
    fixture: 'autocomplete/clear-combinations.html',
    expectRules: {
      'a11y-skills/autocomplete-invalid': 'passes',
      'a11y-skills/autocomplete-invalid-unverified': 'passes',
      'a11y-skills/autocomplete-missing': 'passes',
    },
  },

  // =========================================================================
  // redundant-entry-check
  // Rule: a11y-skills/redundant-entry (incomplete)
  // =========================================================================
  {
    check: 'redundant-entry-check',
    scenario: 'finding: redundant-entry (shipping/billing via autocomplete)',
    fixture: 'redundant-entry/finding-scoped.html',
    expectRules: {
      'a11y-skills/redundant-entry': 'incomplete',
    },
  },
  {
    check: 'redundant-entry-check',
    scenario: 'finding: redundant-entry (scope from legend and name prefix)',
    fixture: 'redundant-entry/finding-names.html',
    expectRules: {
      'a11y-skills/redundant-entry': 'incomplete',
    },
  },
  {
    check: 'redundant-entry-check',
    scenario: 'finding: redundant-entry (email and confirmation email)',
    fixture: 'redundant-entry/finding-repeated.html',
    expectRules: {
      'a11y-skills/redundant-entry': 'incomplete',
    },
  },
  {
    check: 'redundant-entry-check',
    scenario:
      'clear: passwords, other sections and other forms are not redundant',
    fixture: 'redundant-entry/clear.html',
    expectRules: {
      'a11y-skills/redundant-entry': 'passes',
    },
  },

  // =========================================================================
  // motion-actuation-check
  // Rule: a11y-skills/motion-actuation (incomplete)
  // =========================================================================
  {
    check: 'motion-actuation-check',
    scenario: 'finding: motion-actuation (shake to undo)',
    fixture: 'motion-actuation/finding-shake.html',
    expectRules: {
      'a11y-skills/motion-actuation': 'incomplete',
    },
  },
  {
    check: 'motion-actuation-check',
    scenario: 'clear: no devicemotion / deviceorientation listener',
    fixture: 'motion-actuation/none.html',
    expectRules: {
      'a11y-skills/motion-actuation': 'inapplicable',
    },
  },

  // =========================================================================
  // change-on-input-check
  // Rule: a11y-skills/no-context-change-on-input (incomplete)
  // =========================================================================
  {
    check: 'change-on-input-check',
    scenario: 'finding: no-context-change-on-input (select navigates)',
    fixture: 'change-on-input/select-navigates.html',
    expectRules: {
      'a11y-skills/no-context-change-on-input': 'incomplete',
    },
  },
  {
    check: 'change-on-input-check',
    scenario: 'clear: handlers only update a status text',
    fixture: 'change-on-input/clear.html',
    expectRules: {
      'a11y-skills/no-context-change-on-input': 'passes',
    },
  },

  // =========================================================================
  // accessible-authentication-check
  // Rules: a11y-skills/auth-paste-blocked, auth-autocomplete, auth-captcha (all incomplete)
  // =========================================================================
  {
    check: 'accessible-authentication-check',
    scenario: 'finding: auth-paste-blocked (onpaste returns false)',
    fixture: 'accessible-authentication/paste-blocked.html',
    expectRules: {
      'a11y-skills/auth-paste-blocked': 'incomplete',
    },
  },
  {
    check: 'accessible-authentication-check',
    scenario:
      'finding: auth-autocomplete (password field has autocomplete off)',
    fixture: 'accessible-authentication/autocomplete-off.html',
    expectRules: {
      'a11y-skills/auth-autocomplete': 'incomplete',
    },
  },
  {
    check: 'accessible-authentication-check',
    scenario: 'finding: auth-captcha (reCAPTCHA container)',
    fixture: 'accessible-authentication/captcha.html',
    expectRules: {
      'a11y-skills/auth-captcha': 'incomplete',
    },
  },
  {
    check: 'accessible-authentication-check',
    scenario: 'clear: no authentication field or CAPTCHA',
    fixture: 'accessible-authentication/none.html',
    expectRules: {
      'a11y-skills/auth-paste-blocked': 'inapplicable',
      'a11y-skills/auth-autocomplete': 'inapplicable',
      'a11y-skills/auth-captcha': 'inapplicable',
    },
  },

  // =========================================================================
  // pointer-gesture-check
  // Rule: a11y-skills/pointer-gestures (incomplete)
  // Rule: a11y-skills/dragging-movements (incomplete)
  // =========================================================================
  {
    check: 'pointer-gesture-check',
    scenario: 'finding: custom slider dragged with pointer events',
    fixture: 'pointer-gesture/custom-slider.html',
    expectRules: {
      'a11y-skills/pointer-gestures': 'incomplete',
      'a11y-skills/dragging-movements': 'incomplete',
    },
  },
  {
    check: 'pointer-gesture-check',
    scenario: 'finding: carousel markup (swipe candidate only)',
    fixture: 'pointer-gesture/carousel.html',
    expectRules: {
      'a11y-skills/pointer-gestures': 'incomplete',
      'a11y-skills/dragging-movements': 'inapplicable',
    },
  },
  {
    check: 'pointer-gesture-check',
    scenario: 'clear: native range input and a click button',
    fixture: 'pointer-gesture/none.html',
    expectRules: {
      'a11y-skills/pointer-gestures': 'inapplicable',
      'a11y-skills/dragging-movements': 'inapplicable',
    },
  },

  // =========================================================================
  // focus-order-check
  // Rules: a11y-skills/focus-order-visual, focus-order-dialog (both incomplete)
  // =========================================================================
  {
    check: 'focus-order-check',
    scenario:
      'finding: focus-order-visual (CSS order puts the first link below)',
    fixture: 'focus-order/backward-block.html',
    expectRules: {
      'a11y-skills/focus-order-visual': 'incomplete',
    },
  },
  {
    check: 'focus-order-check',
    scenario: 'clear: focus-order-visual (Tab order matches the layout)',
    fixture: 'focus-order/in-order.html',
    expectRules: {
      'a11y-skills/focus-order-visual': 'passes',
    },
  },
  {
    check: 'focus-order-check',
    scenario: 'finding: focus-order-dialog (focus stays on the trigger)',
    fixture: 'focus-order/dialog-focus-outside.html',
    expectRules: {
      'a11y-skills/focus-order-dialog': 'incomplete',
    },
  },
  {
    check: 'focus-order-check',
    scenario: 'clear: focus-order-dialog (focus moves in and returns)',
    fixture: 'focus-order/dialog-good.html',
    expectRules: {
      'a11y-skills/focus-order-dialog': 'passes',
    },
  },

  // =========================================================================
  // time-limit-detector
  // Rule 11: a11y-skills/meta-refresh (incomplete)
  // =========================================================================
  {
    check: 'time-limit-detector',
    scenario: 'finding: meta-refresh (30s page refresh)',
    fixture: 'time-limit/finding-meta-refresh.html',
    expectRules: {
      'a11y-skills/meta-refresh': 'incomplete',
    },
  },
  // Rule 12: a11y-skills/time-limit-timer (incomplete)
  {
    check: 'time-limit-detector',
    scenario: 'finding: time-limit-timer (setInterval 60s)',
    fixture: 'time-limit/finding-timer.html',
    expectRules: {
      'a11y-skills/time-limit-timer': 'incomplete',
    },
  },
  // Rule 13: a11y-skills/time-limit-countdown (incomplete)
  {
    check: 'time-limit-detector',
    scenario: 'finding: time-limit-countdown (countdown wording in DOM)',
    fixture: 'time-limit/finding-countdown.html',
    expectRules: {
      'a11y-skills/time-limit-countdown': 'incomplete',
    },
  },
  {
    check: 'time-limit-detector',
    scenario: 'clear: no time limits',
    fixture: 'time-limit/clear.html',
    expectRules: {
      'a11y-skills/meta-refresh': 'passes',
      'a11y-skills/time-limit-timer': 'passes',
      'a11y-skills/time-limit-countdown': 'passes',
    },
  },

  // =========================================================================
  // target-size-check
  // Rule 15: a11y-skills/target-size-minimum (incomplete)
  // Rule 16: a11y-skills/target-size-enhanced (incomplete)
  // =========================================================================
  {
    check: 'target-size-check',
    scenario: 'finding: target-size-minimum and target-size-enhanced',
    fixture: 'target-size/finding.html',
    expectRules: {
      'a11y-skills/target-size-minimum': 'incomplete',
    },
  },
  {
    check: 'target-size-check',
    scenario: 'clear: undersized targets with verified spacing exception',
    fixture: 'target-size/spacing.html',
    expectRules: {
      'a11y-skills/target-size-minimum': 'passes',
      'a11y-skills/target-size-enhanced': 'incomplete',
    },
  },
  {
    check: 'target-size-check',
    scenario: 'clear: targets meet 44px AAA requirement',
    fixture: 'target-size/clear.html',
    expectRules: {
      'a11y-skills/target-size-minimum': 'passes',
      'a11y-skills/target-size-enhanced': 'passes',
    },
  },

  // =========================================================================
  // keyboard-trap-check
  // Rule 17: a11y-skills/no-keyboard-trap (violation)
  // =========================================================================
  {
    check: 'keyboard-trap-check',
    scenario: 'finding: no-keyboard-trap (true trap, no exit)',
    fixture: 'keyboard-trap/finding.html',
    expectRules: {
      'a11y-skills/no-keyboard-trap': 'violations',
    },
  },
  // Rule 18: a11y-skills/keyboard-trap-needs-review (incomplete)
  {
    check: 'keyboard-trap-check',
    scenario:
      'needs-review: keyboard-trap-needs-review (Escape exits, undocumented)',
    fixture: 'keyboard-trap/needs-review.html',
    expectRules: {
      'a11y-skills/keyboard-trap-needs-review': 'incomplete',
    },
  },
  {
    check: 'keyboard-trap-check',
    scenario: 'clear: proper aria-modal dialog (Escape + close button)',
    fixture: 'keyboard-trap/clear-modal.html',
    expectRules: {
      'a11y-skills/no-keyboard-trap': 'passes',
      'a11y-skills/keyboard-trap-needs-review': 'passes',
    },
  },
  {
    check: 'keyboard-trap-check',
    scenario: 'clear: page with no trap',
    fixture: 'keyboard-trap/clear.html',
    expectRules: {
      'a11y-skills/no-keyboard-trap': 'passes',
      'a11y-skills/keyboard-trap-needs-review': 'passes',
    },
  },

  // =========================================================================
  // keyboard-reachability-check
  // Rule 19: a11y-skills/keyboard-unreachable (incomplete)
  // =========================================================================
  {
    check: 'keyboard-reachability-check',
    scenario: 'finding: keyboard-unreachable (tabindex=-1, onclick, listener)',
    fixture: 'keyboard-reachability/finding.html',
    expectRules: {
      'a11y-skills/keyboard-unreachable': 'incomplete',
    },
  },
  {
    check: 'keyboard-reachability-check',
    scenario: 'clear: roving tabindex, activedescendant and native radios',
    fixture: 'keyboard-reachability/clear.html',
    expectRules: {
      'a11y-skills/keyboard-unreachable': 'passes',
    },
  },
];

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

for (const entry of MANIFEST) {
  test(`${entry.check} — ${entry.scenario}`, async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const result = await runFixtureCheck(entry.check, entry.fixture, baseUrl, {
      page,
      browser,
      testInfo,
    });

    // 1. Rule bucket assertions
    assertRuleBuckets(result, entry.expectRules);

    // 2. axe-audit clear: assert no violations
    if (entry.check === 'axe-audit' && entry.scenario.startsWith('clear')) {
      expect(
        result.violations,
        'axe-audit clear fixture should have no violations',
      ).toHaveLength(0);
    }

    // 3. Schema validation
    const validate = validators[entry.check];
    if (validate) {
      const valid = validate(result);
      expect(
        valid,
        `Schema validation failed for ${entry.check}: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }
  });
}
