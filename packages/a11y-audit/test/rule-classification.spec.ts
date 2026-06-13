/**
 * Rule classification integrity test.
 *
 * Verifies that the `expectRules` values declared in the fixture-gallery
 * manifest agree with the canonical `classification` field in rule-registry.ts
 * for every rule that expects 'violations' or 'incomplete'.
 *
 * This guards against a manifest entry that says "I expect violations"
 * but the registry says the rule is "incomplete" (or vice-versa) —
 * which would mean the expectation is either wrong or the registry needs
 * to be updated.
 *
 * passes/inapplicable expectations are NOT checked against the registry
 * (those buckets are reached via the absence of findings, not via the
 * classification field).
 */

import { test, expect } from '@playwright/test';
import { RULES } from '../dist/utils/rule-registry.js';

/** The manifest expectations extracted from fixture-gallery.spec.ts.
 *  Only violations/incomplete expectations are listed — they are the only
 *  ones that need to match the registry's classification. */
const FINDING_EXPECTATIONS: Array<{
  ruleId: string;
  expectedBucket: 'violations' | 'incomplete';
}> = [
  // focus-indicator-check
  { ruleId: 'a11y-skills/focus-visible', expectedBucket: 'incomplete' },
  {
    ruleId: 'a11y-skills/no-context-change-on-focus',
    expectedBucket: 'violations',
  },
  { ruleId: 'a11y-skills/focus-not-obscured', expectedBucket: 'incomplete' },

  // reflow-check
  { ruleId: 'a11y-skills/reflow-overflow', expectedBucket: 'incomplete' },
  { ruleId: 'a11y-skills/reflow-clipped-text', expectedBucket: 'incomplete' },

  // text-spacing-check
  { ruleId: 'a11y-skills/text-spacing', expectedBucket: 'violations' },

  // zoom-200-check
  { ruleId: 'a11y-skills/resize-text', expectedBucket: 'incomplete' },

  // orientation-check
  { ruleId: 'a11y-skills/orientation-lock', expectedBucket: 'incomplete' },

  // autocomplete-audit
  {
    ruleId: 'a11y-skills/autocomplete-invalid',
    expectedBucket: 'violations',
  },
  {
    ruleId: 'a11y-skills/autocomplete-missing',
    expectedBucket: 'incomplete',
  },

  // time-limit-detector
  { ruleId: 'a11y-skills/meta-refresh', expectedBucket: 'incomplete' },
  { ruleId: 'a11y-skills/time-limit-timer', expectedBucket: 'incomplete' },
  {
    ruleId: 'a11y-skills/time-limit-countdown',
    expectedBucket: 'incomplete',
  },

  // auto-play-detection
  { ruleId: 'a11y-skills/auto-play', expectedBucket: 'incomplete' },

  // target-size-check
  {
    ruleId: 'a11y-skills/target-size-minimum',
    expectedBucket: 'incomplete',
  },
  {
    ruleId: 'a11y-skills/target-size-enhanced',
    expectedBucket: 'incomplete',
  },

  // keyboard-trap-check
  { ruleId: 'a11y-skills/no-keyboard-trap', expectedBucket: 'violations' },
  {
    ruleId: 'a11y-skills/keyboard-trap-needs-review',
    expectedBucket: 'incomplete',
  },
];

/**
 * Map from namespaced rule id → registry key.
 * rule-registry.ts uses short keys like 'focus-visible';
 * the id field is 'a11y-skills/focus-visible'.
 */
function findRuleByNamespacedId(id: string) {
  return Object.values(RULES).find((rule) => rule.id === id);
}

test('all manifest finding expectations agree with rule-registry classification', () => {
  for (const { ruleId, expectedBucket } of FINDING_EXPECTATIONS) {
    const rule = findRuleByNamespacedId(ruleId);
    expect(
      rule,
      `Rule "${ruleId}" must exist in rule-registry.ts`,
    ).toBeDefined();

    const registryClassification = rule!.classification;
    // Map: 'violation' (registry) → 'violations' (bucket name)
    const registryBucket =
      registryClassification === 'violation' ? 'violations' : 'incomplete';

    expect(
      expectedBucket,
      `Manifest expects "${ruleId}" in "${expectedBucket}" but registry classifies it as "${registryClassification}" (bucket: "${registryBucket}")`,
    ).toBe(registryBucket);
  }
});

test('all 18 custom finding rules have a manifest entry', () => {
  const manifestRuleIds = new Set(FINDING_EXPECTATIONS.map((e) => e.ruleId));

  const registryRuleIds = Object.values(RULES).map((r) => r.id);
  expect(
    registryRuleIds.length,
    'rule-registry should have 18 custom rules',
  ).toBe(18);

  for (const ruleId of registryRuleIds) {
    expect(
      manifestRuleIds.has(ruleId),
      `Rule "${ruleId}" from registry has no manifest finding expectation`,
    ).toBe(true);
  }
});
