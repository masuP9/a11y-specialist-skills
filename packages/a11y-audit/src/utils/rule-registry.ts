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
  // --- change-on-input-check ---
  'no-context-change-on-input': {
    id: 'a11y-skills/no-context-change-on-input',
    sc: ['3.2.2'],
    tags: ['a11y-skills', 'wcag2a', 'wcag322'],
    impact: 'serious',
    scope: 'node',
    description:
      'Ensure changing the setting of a form control does not automatically cause a change of context',
    help: 'Changing a form control value must not trigger a context change unless users are advised beforehand',
    helpUrl: `${UNDERSTANDING}/on-input.html`,
    // The change is observed, but advising users beforehand makes it conform,
    // and that advice can only be judged by a human.
    classification: 'incomplete',
  },
  'focus-not-obscured': {
    id: 'a11y-skills/focus-not-obscured',
    sc: ['2.4.11'],
    tags: ['a11y-skills', 'wcag22aa', 'wcag2411'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure the focused element is not entirely hidden by fixed or sticky content',
    help: 'Focused elements should not be entirely obscured by author-created content',
    helpUrl: `${UNDERSTANDING}/focus-not-obscured-minimum.html`,
    // only the element's box is compared, not the focus indicator itself, and
    // 2.4.11 does not apply when the user can dismiss the covering content
    // without moving focus.
    classification: 'incomplete',
  },
  'focus-not-obscured-enhanced': {
    id: 'a11y-skills/focus-not-obscured-enhanced',
    sc: ['2.4.12'],
    // axe-core has no WCAG 2.2 AAA tag; follow its `wcag21aaa` naming.
    tags: ['a11y-skills', 'wcag22aaa', 'wcag2412'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure no part of the focused element is hidden by fixed or sticky content',
    help: 'Focused elements should not be obscured at all by author-created content',
    helpUrl: `${UNDERSTANDING}/focus-not-obscured-enhanced.html`,
    // only the element's box is compared, not the focus indicator itself.
    // Unlike 2.4.11, 2.4.12 has no exception for content the user can dismiss.
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
    // syntactic validity is machine-checkable; reported only on fields whose
    // purpose was inferred (see autocomplete-invalid-unverified).
    classification: 'violation',
  },
  'autocomplete-invalid-unverified': {
    id: 'a11y-skills/autocomplete-invalid-unverified',
    sc: ['1.3.5'],
    tags: ['a11y-skills', 'wcag21aa', 'wcag135'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure autocomplete attribute values are valid tokens on fields whose purpose could not be inferred',
    help: 'Fix the autocomplete value if the field collects information about the user',
    helpUrl: `${UNDERSTANDING}/identify-input-purpose.html`,
    // the value is invalid, but 1.3.5 applies only if the field collects
    // information about the user — which needs a human to confirm.
    classification: 'incomplete',
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

  // --- redundant-entry-check ---
  'redundant-entry': {
    id: 'a11y-skills/redundant-entry',
    sc: ['3.3.7'],
    tags: ['a11y-skills', 'wcag22a', 'wcag337'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure information already entered in the same page is not requested again',
    help: 'Provide a way to copy or select earlier entries, or confirm an exception applies',
    helpUrl: `${UNDERSTANDING}/redundant-entry.html`,
    // Whether re-entry is required, and whether an exception applies (essential,
    // security, no longer valid), needs a human; multi-page flows are out of scope.
    classification: 'incomplete',
  },

  // --- motion-actuation-check ---
  'motion-actuation': {
    id: 'a11y-skills/motion-actuation',
    sc: ['2.5.4'],
    tags: ['a11y-skills', 'wcag21a', 'wcag254'],
    impact: 'serious',
    scope: 'page',
    description:
      'Ensure functions operated by device motion can also be operated by UI components and motion actuation can be disabled',
    help: 'Provide a UI alternative to device motion and a way to turn motion actuation off',
    helpUrl: `${UNDERSTANDING}/motion-actuation.html`,
    // A listener only shows the page reacts to motion; whether a UI alternative and
    // an off switch exist (or the essential / accessibility-supported-interface
    // exceptions apply) needs a human.
    classification: 'incomplete',
  },

  // --- accessible-authentication-check ---
  'auth-paste-blocked': {
    id: 'a11y-skills/auth-paste-blocked',
    sc: ['3.3.8'],
    tags: ['a11y-skills', 'wcag22aa', 'wcag338'],
    impact: 'serious',
    scope: 'node',
    description: 'Ensure password and verification code fields allow pasting',
    help: 'Allow pasting into authentication fields so password managers can be used (unless another authentication method without a cognitive function test is offered)',
    helpUrl: `${UNDERSTANDING}/accessible-authentication-minimum.html`,
    // The failed paste is measured, but 3.3.8 is met when another method without
    // a cognitive function test exists, or an assistive mechanism (autofill)
    // works; neither is determined here, so this stays in the manual-review
    // queue (see the classification policy above).
    classification: 'incomplete',
  },
  'auth-autocomplete': {
    id: 'a11y-skills/auth-autocomplete',
    sc: ['3.3.8'],
    tags: ['a11y-skills', 'wcag22aa', 'wcag338'],
    impact: 'moderate',
    scope: 'node',
    description: 'Ensure authentication fields do not disable autofill',
    help: 'Use autocomplete="current-password" / "new-password" / "one-time-code" / "username" on authentication fields instead of "off"',
    helpUrl: `${UNDERSTANDING}/accessible-authentication-minimum.html`,
    // Whether autofill really is blocked, and whether another mechanism is
    // available, needs a human.
    classification: 'incomplete',
  },
  'auth-captcha': {
    id: 'a11y-skills/auth-captcha',
    sc: ['3.3.8'],
    tags: ['a11y-skills', 'wcag22aa', 'wcag338'],
    impact: 'moderate',
    scope: 'node',
    description:
      'Ensure CAPTCHAs in authentication offer an alternative without a cognitive function test',
    help: 'Check that a CAPTCHA is not the only way through authentication, or that it recognizes objects or user-provided content',
    helpUrl: `${UNDERSTANDING}/accessible-authentication-minimum.html`,
    // Candidates are found by name; the alternative and the object-recognition /
    // user-content exceptions need a human.
    classification: 'incomplete',
  },

  // --- pointer-gesture-check ---
  'pointer-gestures': {
    id: 'a11y-skills/pointer-gestures',
    sc: ['2.5.1'],
    tags: ['a11y-skills', 'wcag21a', 'wcag251'],
    impact: 'serious',
    scope: 'node',
    description:
      'Ensure functions that use multipoint or path-based gestures can also be operated with a single pointer without a path',
    help: 'Provide a single-pointer alternative (e.g. buttons) to pinch, swipe and other path-based or multipoint gestures',
    helpUrl: `${UNDERSTANDING}/pointer-gestures.html`,
    // Listeners and widget markup only show a gesture may be used; whether a
    // single-pointer alternative exists, or the gesture is essential, needs a human.
    classification: 'incomplete',
  },
  'dragging-movements': {
    id: 'a11y-skills/dragging-movements',
    sc: ['2.5.7'],
    tags: ['a11y-skills', 'wcag22aa', 'wcag257'],
    impact: 'serious',
    scope: 'node',
    description:
      'Ensure functions that use dragging can also be operated with a single pointer without dragging',
    help: 'Provide a single-pointer alternative (e.g. buttons or click-to-place) to drag-and-drop, sliders and sortable lists',
    helpUrl: `${UNDERSTANDING}/dragging-movements.html`,
    // Same reason as pointer-gestures: the alternative and the essential
    // exception need a human.
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
    // Audio is not inspected, so 1.4.2 is left to axe-core's
    // no-autoplay-audio and manual review.
    sc: ['2.2.2'],
    tags: ['a11y-skills', 'wcag2a', 'wcag222'],
    impact: 'moderate',
    scope: 'page',
    description:
      'Detect auto-playing/moving content lasting longer than 5 seconds without a working pause control',
    help: 'Moving content over 5 seconds needs a pause, stop, or hide mechanism',
    helpUrl: `${UNDERSTANDING}/pause-stop-hide.html`,
    // pixel diffing cannot identify the content type.
    classification: 'incomplete',
  },
  'auto-play-audio': {
    id: 'a11y-skills/auto-play-audio',
    sc: ['1.4.2'],
    tags: ['a11y-skills', 'wcag2a', 'wcag142'],
    impact: 'serious',
    scope: 'node',
    description:
      'Detect unmuted <audio>/<video> that plays automatically for more than 3 seconds without a visible way to pause it or control its volume',
    help: 'Audio playing over 3 seconds needs a pause/stop mechanism or an independent volume control',
    helpUrl: `${UNDERSTANDING}/audio-control.html`,
    // playback state is measured, but the audio track may be silent, the
    // control may live elsewhere on the page (or in a parent frame), and
    // control detection is keyword-based and never clicked to verify.
    classification: 'incomplete',
  },

  // --- keyboard-trap-check ---
  'no-keyboard-trap': {
    id: 'a11y-skills/no-keyboard-trap',
    sc: ['2.1.2'],
    tags: ['a11y-skills', 'wcag2a', 'wcag212'],
    impact: 'critical',
    scope: 'page',
    description: 'Ensure keyboard focus can be moved away from all components',
    help: 'Keyboard users must be able to navigate away from any focused component',
    helpUrl: `${UNDERSTANDING}/no-keyboard-trap.html`,
    // focus confinement with no working exit is directly observed; no exception applies.
    classification: 'violation',
  },
  'keyboard-trap-needs-review': {
    id: 'a11y-skills/keyboard-trap-needs-review',
    sc: ['2.1.2'],
    tags: ['a11y-skills', 'wcag2a', 'wcag212'],
    impact: 'critical',
    scope: 'page',
    description:
      'Focus appears confined; verify whether the escape path is documented or discoverable',
    help: 'Verify that users can escape focus-confined areas via documented keyboard methods',
    helpUrl: `${UNDERSTANDING}/no-keyboard-trap.html`,
    // 2.1.2 allows non-standard exit if the user is advised; that judgment is manual.
    classification: 'incomplete',
  },

  // --- keyboard-reachability-check ---
  'keyboard-unreachable': {
    id: 'a11y-skills/keyboard-unreachable',
    sc: ['2.1.1'],
    tags: ['a11y-skills', 'wcag2a', 'wcag211'],
    impact: 'serious',
    scope: 'node',
    description:
      'Ensure every operable element can be reached with the keyboard',
    help: 'Operable elements must be reachable via Tab, arrow keys within composite widgets, or aria-activedescendant',
    helpUrl: `${UNDERSTANDING}/keyboard.html`,
    // 2.1.1 is about functions, not elements: the same function may be keyboard
    // operable elsewhere (duplicate control, custom shortcut). Always manual review.
    classification: 'incomplete',
  },
} as const satisfies Record<string, RuleMeta>;

export type RuleKey = keyof typeof RULES;

/** Look up a rule's metadata. */
export function getRule(key: RuleKey): RuleMeta {
  return RULES[key];
}
