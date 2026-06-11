/**
 * Rule metadata registry for the custom (non-axe) checks.
 *
 * Single source of truth for rule ids, WCAG mapping, severity, and the
 * violation/incomplete classification. The mappers in `axe-format.ts` read
 * from here so that classification policy is reviewable in one place.
 *
 * Classification policy: `'violation'` is reserved for rules whose detection
 * has no blind spot AND where no WCAG exception can apply to a finding.
 * Heuristic detections and findings with possible exceptions are
 * `'incomplete'` (the manual-review queue). impact is NOT derived from the
 * WCAG conformance level; it is assigned per rule, conservatively defaulting
 * to `moderate`.
 */

import type { NormalizedImpact } from '../types.js';

export interface RuleMeta {
  /** Namespaced rule id, e.g. `a11y-skills/focus-visible`. */
  id: string;
  /** WCAG success criteria, e.g. `['2.4.7']`. */
  sc: string[];
  /**
   * axe-style tags. The version+level tag reflects the WCAG version that
   * introduced the SC (2.4.7 → `wcag2aa`, 1.4.10 → `wcag21aa`, ...).
   */
  tags: string[];
  impact: NormalizedImpact;
  /** Whether findings refer to specific elements or the page as a whole. */
  scope: 'node' | 'page';
  description: string;
  help: string;
  /** W3C Understanding document URL. */
  helpUrl: string;
  /** Default bucket for findings of this rule. */
  classification: 'violation' | 'incomplete';
}

const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

export const RULES = {
  // --- focus-indicator-check ---
  'focus-visible': {
    id: 'a11y-skills/focus-visible',
    sc: ['2.4.7'],
    tags: ['a11y-skills', 'wcag2aa', 'wcag247'],
    impact: 'serious',
    scope: 'node',
    description:
      'Ensure keyboard focus produces a visible indicator on focusable elements',
    help: 'Focusable elements should have a visible focus indicator',
    helpUrl: `${UNDERSTANDING}/focus-visible.html`,
    // computed-style diffing cannot see pseudo-elements, canvas drawing, or
    // parent-element changes, so a "no style change" finding is not proof.
    classification: 'incomplete',
  },
  'no-context-change-on-focus': {
    id: 'a11y-skills/no-context-change-on-focus',
    sc: ['3.2.1'],
    tags: ['a11y-skills', 'wcag2a', 'wcag321'],
    impact: 'serious',
    scope: 'node',
    description:
      'Ensure receiving focus does not trigger a change of context (navigation, new window)',
    help: 'Focusing an element must not trigger a context change',
    helpUrl: `${UNDERSTANDING}/on-focus.html`,
    // the navigation is directly observed, no exception applies.
    classification: 'violation',
  },
  'focus-not-obscured': {
    id: 'a11y-skills/focus-not-obscured',
    sc: ['2.4.11', '2.4.12'],
    tags: ['a11y-skills', 'wcag22aa', 'wcag2411'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure the focused element is not hidden by fixed or sticky content',
    help: 'Focused elements should not be obscured by author-created content',
    helpUrl: `${UNDERSTANDING}/focus-not-obscured-minimum.html`,
    classification: 'incomplete',
  },

  // --- reflow-check ---
  'reflow-overflow': {
    id: 'a11y-skills/reflow-overflow',
    sc: ['1.4.10'],
    tags: ['a11y-skills', 'wcag21aa', 'wcag1410'],
    impact: 'serious',
    scope: 'node',
    description:
      'Ensure content reflows at 320 CSS px width without horizontal scrolling',
    help: 'Content should not require horizontal scrolling at 320px width',
    helpUrl: `${UNDERSTANDING}/reflow.html`,
    // two-dimensional layout exceptions (tables, maps, ...) need human judgment.
    classification: 'incomplete',
  },
  'reflow-clipped-text': {
    id: 'a11y-skills/reflow-clipped-text',
    sc: ['1.4.10'],
    tags: ['a11y-skills', 'wcag21aa', 'wcag1410'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure text is not clipped when content reflows at 320 CSS px',
    help: 'Text should remain readable at 320px width',
    helpUrl: `${UNDERSTANDING}/reflow.html`,
    classification: 'incomplete',
  },

  // --- target-size-check ---
  'target-size-minimum': {
    id: 'a11y-skills/target-size-minimum',
    sc: ['2.5.8'],
    tags: ['a11y-skills', 'wcag22aa', 'wcag258'],
    impact: 'serious',
    scope: 'node',
    description:
      'Ensure pointer targets are at least 24x24 CSS px (WCAG 2.5.8 AA)',
    help: 'Pointer targets should be at least 24x24 CSS px',
    helpUrl: `${UNDERSTANDING}/target-size-minimum.html`,
    // exception heuristics cannot rule out the essential exception; only
    // nodes with exceptionAssessment 'ruled-out' are promoted to violations.
    classification: 'incomplete',
  },
  'target-size-enhanced': {
    id: 'a11y-skills/target-size-enhanced',
    sc: ['2.5.5'],
    tags: ['a11y-skills', 'wcag21aaa', 'wcag255'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure pointer targets are at least 44x44 CSS px (WCAG 2.5.5 AAA)',
    help: 'Pointer targets should be at least 44x44 CSS px',
    helpUrl: `${UNDERSTANDING}/target-size-enhanced.html`,
    classification: 'incomplete',
  },

  // --- text-spacing-check ---
  'text-spacing': {
    id: 'a11y-skills/text-spacing',
    sc: ['1.4.12'],
    tags: ['a11y-skills', 'wcag21aa', 'wcag1412'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure no loss of content when WCAG 1.4.12 text spacing overrides are applied',
    help: 'Text must not be clipped under increased text spacing',
    helpUrl: `${UNDERSTANDING}/text-spacing.html`,
    // applying the spacing values and observing clipping is the SC's own
    // mechanical test procedure.
    classification: 'violation',
  },

  // --- zoom-200-check ---
  'resize-text': {
    id: 'a11y-skills/resize-text',
    sc: ['1.4.4'],
    tags: ['a11y-skills', 'wcag2aa', 'wcag144'],
    impact: 'moderate',
    scope: 'node',
    description: 'Ensure content remains usable when text is resized to 200%',
    help: 'Content should not be lost or clipped at 200% zoom',
    helpUrl: `${UNDERSTANDING}/resize-text.html`,
    // horizontal scrolling at zoom does not by itself fail SC 1.4.4.
    classification: 'incomplete',
  },

  // --- orientation-check ---
  'orientation-lock': {
    id: 'a11y-skills/orientation-lock',
    sc: ['1.3.4'],
    tags: ['a11y-skills', 'wcag21aa', 'wcag134'],
    impact: 'serious',
    scope: 'page',
    description:
      'Ensure content does not restrict its view to a single display orientation',
    help: 'Content should work in both portrait and landscape orientation',
    helpUrl: `${UNDERSTANDING}/orientation.html`,
    // the essential exception requires human judgment.
    classification: 'incomplete',
  },

  // --- autocomplete-audit ---
  'autocomplete-invalid': {
    id: 'a11y-skills/autocomplete-invalid',
    sc: ['1.3.5'],
    tags: ['a11y-skills', 'wcag21aa', 'wcag135'],
    impact: 'moderate',
    scope: 'node',
    description: 'Ensure autocomplete attribute values are valid tokens',
    help: 'autocomplete attributes must use valid token values',
    helpUrl: `${UNDERSTANDING}/identify-input-purpose.html`,
    // syntactic validity is machine-checkable.
    classification: 'violation',
  },
  'autocomplete-missing': {
    id: 'a11y-skills/autocomplete-missing',
    sc: ['1.3.5'],
    tags: ['a11y-skills', 'wcag21aa', 'wcag135'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure fields collecting user information declare their purpose via autocomplete',
    help: 'Add an autocomplete attribute matching the field purpose',
    helpUrl: `${UNDERSTANDING}/identify-input-purpose.html`,
    // field purpose is inferred from name/id/label patterns — heuristic.
    classification: 'incomplete',
  },

  // --- time-limit-detector ---
  'meta-refresh': {
    id: 'a11y-skills/meta-refresh',
    sc: ['2.2.1'],
    tags: ['a11y-skills', 'wcag2a', 'wcag221'],
    impact: 'serious',
    scope: 'node',
    description:
      'Ensure meta refresh time limits can be turned off, adjusted, or extended',
    help: 'Verify the meta refresh satisfies an SC 2.2.1 exception or is adjustable',
    helpUrl: `${UNDERSTANDING}/timing-adjustable.html`,
    // adjustability / 20-hour exception cannot be determined automatically.
    classification: 'incomplete',
  },
  'time-limit-timer': {
    id: 'a11y-skills/time-limit-timer',
    sc: ['2.2.1'],
    tags: ['a11y-skills', 'wcag2a', 'wcag221'],
    impact: 'moderate',
    scope: 'page',
    description: 'Detect JavaScript timers that may implement a time limit',
    help: 'Verify whether detected timers implement an adjustable time limit',
    helpUrl: `${UNDERSTANDING}/timing-adjustable.html`,
    classification: 'incomplete',
  },
  'time-limit-countdown': {
    id: 'a11y-skills/time-limit-countdown',
    sc: ['2.2.1'],
    tags: ['a11y-skills', 'wcag2a', 'wcag221'],
    impact: 'moderate',
    scope: 'node',
    description: 'Detect countdown/timeout wording in visible text',
    help: 'Verify whether the countdown text indicates an adjustable time limit',
    helpUrl: `${UNDERSTANDING}/timing-adjustable.html`,
    classification: 'incomplete',
  },

  // --- auto-play-detection ---
  'auto-play': {
    id: 'a11y-skills/auto-play',
    sc: ['2.2.2', '1.4.2'],
    tags: ['a11y-skills', 'wcag2a', 'wcag222', 'wcag142'],
    impact: 'moderate',
    scope: 'page',
    description:
      'Detect auto-playing/moving content lasting longer than 5 seconds without a working pause control',
    help: 'Moving content over 5 seconds needs a pause, stop, or hide mechanism',
    helpUrl: `${UNDERSTANDING}/pause-stop-hide.html`,
    // pixel diffing cannot identify the content type or audio.
    classification: 'incomplete',
  },
} as const satisfies Record<string, RuleMeta>;

export type RuleKey = keyof typeof RULES;

/** Look up a rule's metadata. */
export function getRule(key: RuleKey): RuleMeta {
  return RULES[key];
}
