/**
 * Result types and JSON Schemas for the audit checks.
 *
 * The TypeScript types are the source of truth; the JSON Schemas are
 * hand-written for consumers that validate the result files at runtime
 * (e.g. an issue creator that reads `*-result.json`). They are intentionally
 * permissive (no `additionalProperties: false`) so that additive changes to a
 * result shape do not break downstream validation.
 *
 * Every check shares the same envelope (`source` / `url` / `timestamp` / the
 * four normalized buckets / `summary` / `details` / `disclaimer`); the common
 * pieces live in `$defs` and each check schema defines its own `details`.
 */

export type {
  AuditCheckResult,
  AuditResultSummary,
  CheckSource,
  NormalizedImpact,
  NormalizedNode,
  NormalizedRuleResult,
  AxeAuditDetails,
  AxeAuditResult,
  FocusRecord,
  FocusElementRef,
  OnFocusViolation,
  FocusCheckDetails,
  FocusCheckResult,
  BoundingRect,
  FocusObscuredOverlap,
  FocusObscuredIssue,
  ReflowIssue,
  ClippedTextElement,
  ReflowCheckDetails,
  ReflowCheckResult,
  TargetSizeException,
  TargetSizeExceptionAssessment,
  TargetSizeIssue,
  TargetSizeSummary,
  TargetSizeCheckDetails,
  TargetSizeCheckResult,
  TextSpacingIssue,
  TextSpacingCheckDetails,
  TextSpacingCheckResult,
  ZoomIssue,
  ZoomCheckDetails,
  ZoomCheckResult,
  OrientationState,
  OrientationCheckDetails,
  OrientationCheckResult,
  AutocompleteIssue,
  AutocompleteAuditDetails,
  AutocompleteAuditResult,
  MetaRefreshInfo,
  TimerInfo,
  CountdownIndicator,
  TimeLimitDetectorDetails,
  TimeLimitDetectorResult,
  ScreenshotRecord,
  ComparisonResult,
  ImageDiffResult,
  PauseControl,
  CarouselIndicator,
  PauseControlInfo,
  PauseVerificationResult,
  AutoPlayDetectionDetails,
  AutoPlayDetectionResult,
  KeyboardTrapEvidence,
  KeyboardTrapCheckDetails,
  KeyboardTrapCheckResult,
  RedundantEntryField,
  RedundantEntryCopyControl,
  RedundantEntryGroup,
  RedundantEntryCheckDetails,
  RedundantEntryCheckResult,
  MotionListener,
  MotionSimulationResult,
  MotionActuationCheckDetails,
  MotionActuationCheckResult,
} from '../types.js';

/** Minimal JSON Schema object shape (Draft 2020-12 compatible subset). */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  title?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  [key: string]: unknown;
}

// =============================================================================
// Shared $defs
// =============================================================================

const NORMALIZED_NODE_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['target', 'html', 'htmlTruncated', 'failureSummary'],
  properties: {
    target: { type: 'array', items: { type: 'string' } },
    html: { type: 'string' },
    htmlTruncated: { type: 'boolean' },
    failureSummary: { type: 'string' },
  },
};

const NORMALIZED_RULE_RESULT_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['id', 'impact', 'description', 'help', 'helpUrl', 'tags', 'nodes'],
  properties: {
    id: { type: 'string' },
    impact: {
      type: ['string', 'null'],
      enum: ['critical', 'serious', 'moderate', 'minor', null],
    },
    description: { type: 'string' },
    help: { type: 'string' },
    helpUrl: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    nodes: { type: 'array', items: { $ref: '#/$defs/normalizedNode' } },
  },
};

const SUMMARY_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['violationCount', 'incompleteCount', 'passCount'],
  properties: {
    violationCount: { type: 'number' },
    incompleteCount: { type: 'number' },
    passCount: { type: 'number' },
    checkedNodes: { type: 'number' },
  },
};

const DISCLAIMER_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    messageEn: { type: 'string' },
    coverage: { type: 'string' },
    moreInfo: { type: 'string' },
  },
};

const COMMON_DEFS: Record<string, JsonSchema> = {
  normalizedNode: NORMALIZED_NODE_SCHEMA,
  normalizedRuleResult: NORMALIZED_RULE_RESULT_SCHEMA,
  summary: SUMMARY_SCHEMA,
  disclaimer: DISCLAIMER_SCHEMA,
};

const RULE_ARRAY: JsonSchema = {
  type: 'array',
  items: { $ref: '#/$defs/normalizedRuleResult' },
};

/** Build the envelope schema for one check, plugging in its details schema. */
function buildEnvelopeSchema(args: {
  id: string;
  title: string;
  source: string;
  details: JsonSchema;
}): JsonSchema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://masup9.github.io/a11y-audit/schemas/${args.id}.json`,
    title: args.title,
    type: 'object',
    required: [
      'source',
      'url',
      'timestamp',
      'violations',
      'incomplete',
      'passes',
      'inapplicable',
      'summary',
      'details',
      'disclaimer',
    ],
    properties: {
      source: { const: args.source },
      url: { type: 'string' },
      timestamp: { type: 'string' },
      violations: RULE_ARRAY,
      incomplete: RULE_ARRAY,
      passes: RULE_ARRAY,
      inapplicable: RULE_ARRAY,
      summary: { $ref: '#/$defs/summary' },
      details: args.details,
      disclaimer: { $ref: '#/$defs/disclaimer' },
    },
    $defs: COMMON_DEFS,
  };
}

// =============================================================================
// Detail building blocks
// =============================================================================

const ELEMENT_EVIDENCE_PROPS: Record<string, JsonSchema> = {
  selector: { type: 'string' },
  tagName: { type: 'string' },
  html: { type: 'string' },
  htmlTruncated: { type: 'boolean' },
};

const FOCUS_LOCATION_PROPS: Record<string, JsonSchema> = {
  frame: {
    type: ['object', 'null'],
    required: ['url', 'selector'],
    properties: {
      url: { type: 'string' },
      selector: { type: ['string', 'null'] },
    },
  },
  shadowHosts: { type: 'array', items: { type: 'string' } },
};

const FOCUS_ELEMENT_REF_SCHEMA: JsonSchema = {
  type: 'object',
  required: [
    'tag',
    'name',
    'selector',
    'html',
    'htmlTruncated',
    'frame',
    'shadowHosts',
  ],
  properties: {
    tag: { type: 'string' },
    role: { type: ['string', 'null'] },
    name: { type: 'string' },
    selector: { type: 'string' },
    html: { type: 'string' },
    htmlTruncated: { type: 'boolean' },
    ...FOCUS_LOCATION_PROPS,
    echo: { type: ['string', 'null'] },
  },
};

const PAGE_RECT_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['x', 'y', 'width', 'height'],
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
  },
};

/** Present only with `screenshotDiff`; null when no comparison could be made. */
const FOCUS_VISUAL_DIFF_SCHEMA: JsonSchema = {
  type: ['object', 'null'],
  required: ['diffRatio', 'rect'],
  properties: {
    diffRatio: { type: 'number' },
    rect: { oneOf: [PAGE_RECT_SCHEMA, { type: 'null' }] },
  },
};

// =============================================================================
// Check schemas
// =============================================================================

export const AXE_AUDIT_RESULT_SCHEMA: JsonSchema = buildEnvelopeSchema({
  id: 'axe-audit-result',
  title: 'AxeAuditResult',
  source: 'axe-audit',
  details: {
    type: 'object',
    required: [
      'tagsRun',
      'rulesOverride',
      'violationRuleCount',
      'passRuleCount',
      'incompleteRuleCount',
      'inapplicableRuleCount',
    ],
    properties: {
      tagsRun: { type: 'array', items: { type: 'string' } },
      rulesOverride: { type: ['object', 'null'] },
      violationRuleCount: { type: 'number' },
      passRuleCount: { type: 'number' },
      incompleteRuleCount: { type: 'number' },
      inapplicableRuleCount: { type: 'number' },
    },
  },
});

export const FOCUS_CHECK_RESULT_SCHEMA: JsonSchema = buildEnvelopeSchema({
  id: 'focus-check-result',
  title: 'FocusCheckResult',
  source: 'focus-indicator-check',
  details: {
    type: 'object',
    required: [
      'totalFocusableElements',
      'elementsWithFocusStyle',
      'elementsWithoutFocusStyle',
      'issues',
      'onFocusViolations',
      'focusObscuredIssues',
      'elementsWithObscuredFocus',
      'allElements',
      'interrupted',
      'screenshotPath',
    ],
    properties: {
      totalFocusableElements: { type: 'number' },
      elementsWithFocusStyle: { type: 'number' },
      elementsWithoutFocusStyle: { type: 'number' },
      issues: {
        type: 'array',
        items: {
          ...FOCUS_ELEMENT_REF_SCHEMA,
          properties: {
            ...(FOCUS_ELEMENT_REF_SCHEMA['properties'] as Record<
              string,
              JsonSchema
            >),
            visualDiff: FOCUS_VISUAL_DIFF_SCHEMA,
          },
        },
      },
      onFocusViolations: {
        type: 'array',
        items: {
          type: 'object',
          required: ['element', 'fromUrl', 'toUrl', 'changeType'],
          properties: {
            element: FOCUS_ELEMENT_REF_SCHEMA,
            fromUrl: { type: 'string' },
            toUrl: { type: 'string' },
            changeType: {
              type: 'string',
              enum: ['navigation', 'new-window', 'dialog'],
            },
          },
        },
      },
      focusObscuredIssues: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'element',
            'elementRect',
            'overlaps',
            'obscuredRatio',
            'fullyObscured',
          ],
          properties: {
            element: FOCUS_ELEMENT_REF_SCHEMA,
            elementRect: { type: 'object' },
            overlaps: { type: 'array', items: { type: 'object' } },
            obscuredRatio: { type: 'number' },
            fullyObscured: { type: 'boolean' },
          },
        },
      },
      elementsWithObscuredFocus: { type: 'number' },
      allElements: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'tabStep', 'rect', 'frame', 'shadowHosts'],
          properties: {
            id: { type: 'number' },
            ...FOCUS_LOCATION_PROPS,
            tabStep: { type: ['number', 'null'] },
            rect: PAGE_RECT_SCHEMA,
            visualDiff: FOCUS_VISUAL_DIFF_SCHEMA,
          },
        },
      },
      interrupted: { type: 'boolean' },
      interruptedAt: { type: 'number' },
      unidentifiedNavigation: { type: 'boolean' },
      aborted: {
        type: ['object', 'null'],
        required: ['reason', 'url', 'recordedCount', 'focusableCount'],
        properties: {
          reason: { enum: ['timeout', 'tab-limit'] },
          url: { type: 'string' },
          recordedCount: { type: 'number' },
          focusableCount: { type: 'number' },
        },
      },
      screenshotPath: { type: 'string' },
    },
  },
});

export const REFLOW_CHECK_RESULT_SCHEMA: JsonSchema = buildEnvelopeSchema({
  id: 'reflow-check-result',
  title: 'ReflowCheckResult',
  source: 'reflow-check',
  details: {
    type: 'object',
    required: [
      'viewport',
      'hasHorizontalScroll',
      'documentScrollWidth',
      'documentClientWidth',
      'overflowingElements',
      'clippedTextElements',
    ],
    properties: {
      viewport: {
        type: 'object',
        required: ['width', 'height'],
        properties: {
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
      hasHorizontalScroll: { type: 'boolean' },
      documentScrollWidth: { type: 'number' },
      documentClientWidth: { type: 'number' },
      overflowingElements: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'selector',
            'tagName',
            'html',
            'htmlTruncated',
            'rect',
            'viewportWidth',
            'reason',
          ],
          properties: {
            ...ELEMENT_EVIDENCE_PROPS,
            rect: { type: 'object' },
            viewportWidth: { type: 'number' },
            reason: {
              type: 'string',
              enum: ['overflow-right', 'overflow-left', 'clipped-text'],
            },
          },
        },
      },
      clippedTextElements: { type: 'array', items: { type: 'object' } },
    },
  },
});

export const TARGET_SIZE_CHECK_RESULT_SCHEMA: JsonSchema = buildEnvelopeSchema({
  id: 'target-size-check-result',
  title: 'TargetSizeCheckResult',
  source: 'target-size-check',
  details: {
    type: 'object',
    required: [
      'totalTargetsChecked',
      'failAA',
      'failAAAOnly',
      'passedTargets',
      'occludedTargets',
      'exceptedTargets',
      'summary',
    ],
    properties: {
      totalTargetsChecked: { type: 'number' },
      failAA: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'selector',
            'tagName',
            'html',
            'htmlTruncated',
            'width',
            'height',
            'minDimension',
            'level',
            'exceptionAssessment',
            'spacing',
          ],
          properties: {
            ...ELEMENT_EVIDENCE_PROPS,
            role: { type: ['string', 'null'] },
            accessibleName: { type: ['string', 'null'] },
            width: { type: 'number' },
            height: { type: 'number' },
            minDimension: { type: 'number' },
            level: {
              type: 'string',
              enum: ['fail-aa', 'fail-aaa-only', 'pass'],
            },
            exception: { type: ['string', 'null'] },
            exceptionDetails: { type: ['string', 'null'] },
            exceptionAssessment: {
              type: 'string',
              enum: ['ruled-out', 'verified', 'possible', 'not-assessed'],
            },
            href: { type: ['string', 'null'] },
            spacing: {
              type: ['object', 'null'],
              required: ['diameter', 'center', 'applies', 'intersections'],
              properties: {
                diameter: { type: 'number' },
                center: {
                  type: 'object',
                  required: ['x', 'y'],
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                },
                applies: { type: 'boolean' },
                intersections: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['selector', 'kind', 'distance', 'required'],
                    properties: {
                      selector: { type: 'string' },
                      kind: { type: 'string', enum: ['target', 'circle'] },
                      distance: { type: 'number' },
                      required: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      failAAAOnly: { type: 'array', items: { type: 'object' } },
      passedTargets: { type: 'number' },
      occludedTargets: { type: 'number' },
      exceptedTargets: { type: 'array', items: { type: 'object' } },
      summary: {
        type: 'object',
        required: [
          'failAACount',
          'failAAAOnlyCount',
          'passCount',
          'exceptedCount',
          'verifiedCount',
        ],
        properties: {
          failAACount: { type: 'number' },
          failAAAOnlyCount: { type: 'number' },
          passCount: { type: 'number' },
          exceptedCount: { type: 'number' },
          verifiedCount: { type: 'number' },
        },
      },
    },
  },
});

export const TEXT_SPACING_CHECK_RESULT_SCHEMA: JsonSchema = buildEnvelopeSchema(
  {
    id: 'text-spacing-check-result',
    title: 'TextSpacingCheckResult',
    source: 'text-spacing-check',
    details: {
      type: 'object',
      required: ['clippedElements', 'totalElementsChecked'],
      properties: {
        clippedElements: { type: 'array', items: { type: 'object' } },
        totalElementsChecked: { type: 'number' },
      },
    },
  },
);

export const ZOOM_CHECK_RESULT_SCHEMA: JsonSchema = buildEnvelopeSchema({
  id: 'zoom-check-result',
  title: 'ZoomCheckResult',
  source: 'zoom-200-check',
  details: {
    type: 'object',
    required: [
      'zoomFactor',
      'viewport',
      'hasHorizontalScroll',
      'documentScrollWidth',
      'documentClientWidth',
      'clippedElements',
    ],
    properties: {
      zoomFactor: { type: 'number' },
      viewport: { type: 'object' },
      hasHorizontalScroll: { type: 'boolean' },
      documentScrollWidth: { type: 'number' },
      documentClientWidth: { type: 'number' },
      clippedElements: { type: 'array', items: { type: 'object' } },
    },
  },
});

export const ORIENTATION_CHECK_RESULT_SCHEMA: JsonSchema = buildEnvelopeSchema({
  id: 'orientation-check-result',
  title: 'OrientationCheckResult',
  source: 'orientation-check',
  details: {
    type: 'object',
    required: ['portrait', 'landscape', 'hasOrientationLock', 'lockDetectedIn'],
    properties: {
      portrait: { type: 'object' },
      landscape: { type: 'object' },
      hasOrientationLock: { type: 'boolean' },
      lockDetectedIn: {
        type: 'string',
        enum: ['portrait', 'landscape', 'both', 'none'],
      },
    },
  },
});

export const AUTOCOMPLETE_AUDIT_RESULT_SCHEMA: JsonSchema = buildEnvelopeSchema(
  {
    id: 'autocomplete-audit-result',
    title: 'AutocompleteAuditResult',
    source: 'autocomplete-audit',
    details: {
      type: 'object',
      required: [
        'totalFieldsChecked',
        'missingAutocomplete',
        'invalidAutocomplete',
      ],
      properties: {
        totalFieldsChecked: { type: 'number' },
        missingAutocomplete: { type: 'array', items: { type: 'object' } },
        invalidAutocomplete: { type: 'array', items: { type: 'object' } },
      },
    },
  },
);

export const TIME_LIMIT_DETECTOR_RESULT_SCHEMA: JsonSchema =
  buildEnvelopeSchema({
    id: 'time-limit-detector-result',
    title: 'TimeLimitDetectorResult',
    source: 'time-limit-detector',
    details: {
      type: 'object',
      required: [
        'metaRefresh',
        'timers',
        'countdownIndicators',
        'hasTimeLimits',
      ],
      properties: {
        metaRefresh: { type: 'array', items: { type: 'object' } },
        timers: { type: 'array', items: { type: 'object' } },
        countdownIndicators: { type: 'array', items: { type: 'object' } },
        hasTimeLimits: { type: 'boolean' },
      },
    },
  });

export const AUTO_PLAY_DETECTION_RESULT_SCHEMA: JsonSchema =
  buildEnvelopeSchema({
    id: 'auto-play-detection-result',
    title: 'AutoPlayDetectionResult',
    source: 'auto-play-detection',
    details: {
      type: 'object',
      required: [
        'screenshotRecords',
        'comparisons',
        'hasAutoPlayContent',
        'stopsWithin5Seconds',
        'pauseControls',
        'pauseVerification',
        'recommendation',
        'mediaElements',
        'unmeasuredFrames',
      ],
      properties: {
        screenshotRecords: { type: 'array', items: { type: 'object' } },
        comparisons: { type: 'array', items: { type: 'object' } },
        hasAutoPlayContent: { type: 'boolean' },
        stopsWithin5Seconds: { type: 'boolean' },
        pauseControls: { type: 'object' },
        pauseVerification: { type: 'object' },
        recommendation: { type: 'string' },
        mediaElements: { type: 'array', items: { type: 'object' } },
        unmeasuredFrames: { type: 'number' },
      },
    },
  });

export const KEYBOARD_TRAP_CHECK_RESULT_SCHEMA: JsonSchema =
  buildEnvelopeSchema({
    id: 'keyboard-trap-check-result',
    title: 'KeyboardTrapCheckResult',
    source: 'keyboard-trap-check',
    details: {
      type: 'object',
      required: [
        'totalFocusableElements',
        'trapCandidates',
        'confirmedTraps',
        'needsReview',
        'screenshotPath',
      ],
      properties: {
        totalFocusableElements: { type: 'number' },
        trapCandidates: { type: 'number' },
        confirmedTraps: { type: 'array', items: { type: 'object' } },
        needsReview: { type: 'array', items: { type: 'object' } },
        tabWalkCapped: { type: 'boolean' },
        screenshotPath: { type: 'string' },
      },
    },
  });

const KEYBOARD_REACHABILITY_ELEMENT_SCHEMA: JsonSchema = {
  type: 'object',
  required: [
    'selector',
    'tag',
    'role',
    'name',
    'html',
    'htmlTruncated',
    'tabindex',
    'evidence',
    'reachedBy',
    'compositeSelector',
    'foundIn',
    'reason',
    'confidence',
  ],
  properties: {
    selector: { type: 'string' },
    tag: { type: 'string' },
    role: { type: ['string', 'null'] },
    name: { type: 'string' },
    html: { type: 'string' },
    htmlTruncated: { type: 'boolean' },
    tabindex: { type: ['string', 'null'] },
    evidence: { enum: ['native', 'role', 'onclick', 'click-listener'] },
    reachedBy: {
      enum: [
        'tab',
        'arrow',
        'activedescendant',
        'unreachable',
        'not-evaluated',
      ],
    },
    compositeSelector: { type: ['string', 'null'] },
    foundIn: { enum: ['load', 'popup'] },
    reason: { type: ['string', 'null'] },
    confidence: {
      type: ['string', 'null'],
      enum: ['high', 'medium', 'low', null],
    },
  },
};

const KEYBOARD_REACHABILITY_COMPOSITE_SCHEMA: JsonSchema = {
  type: 'object',
  required: [
    'selector',
    'role',
    'orientation',
    'keysPressed',
    'status',
    'stopReason',
  ],
  properties: {
    selector: { type: 'string' },
    role: { type: 'string' },
    orientation: { enum: ['horizontal', 'vertical', 'both', 'none'] },
    keysPressed: { type: 'number' },
    status: { enum: ['explored', 'stopped', 'not-explored'] },
    stopReason: { type: ['string', 'null'] },
  },
};

const KEYBOARD_REACHABILITY_POPUP_SCHEMA: JsonSchema = {
  type: 'object',
  required: [
    'triggerSelector',
    'popupSelector',
    'status',
    'itemsFound',
    'keysPressed',
    'stopReason',
  ],
  properties: {
    triggerSelector: { type: 'string' },
    popupSelector: { type: ['string', 'null'] },
    status: {
      enum: [
        'explored',
        'sampled',
        'stopped',
        'opened-not-entered',
        'not-opened',
        'not-explored',
      ],
    },
    itemsFound: { type: 'number' },
    keysPressed: { type: 'number' },
    stopReason: { type: ['string', 'null'] },
  },
};

export const KEYBOARD_REACHABILITY_CHECK_RESULT_SCHEMA: JsonSchema =
  buildEnvelopeSchema({
    id: 'keyboard-reachability-check-result',
    title: 'KeyboardReachabilityCheckResult',
    source: 'keyboard-reachability-check',
    details: {
      type: 'object',
      required: [
        'totalOperableElements',
        'reachedCount',
        'unreachableCount',
        'notEvaluatedCount',
        'excluded',
        'elements',
        'composites',
        'popups',
        'tabWalkCapped',
        'aborted',
        'screenshotPath',
      ],
      properties: {
        totalOperableElements: { type: 'number' },
        reachedCount: { type: 'number' },
        unreachableCount: { type: 'number' },
        notEvaluatedCount: { type: 'number' },
        excluded: {
          type: 'object',
          required: ['disabled', 'inert', 'hidden', 'insideOperable'],
          properties: {
            disabled: { type: 'number' },
            inert: { type: 'number' },
            hidden: { type: 'number' },
            insideOperable: { type: 'number' },
          },
        },
        elements: {
          type: 'array',
          items: KEYBOARD_REACHABILITY_ELEMENT_SCHEMA,
        },
        composites: {
          type: 'array',
          items: KEYBOARD_REACHABILITY_COMPOSITE_SCHEMA,
        },
        popups: {
          type: 'array',
          items: KEYBOARD_REACHABILITY_POPUP_SCHEMA,
        },
        tabWalkCapped: { type: 'boolean' },
        aborted: {
          type: ['object', 'null'],
          required: ['reason', 'url'],
          properties: {
            reason: { enum: ['navigation', 'timeout'] },
            url: { type: 'string' },
          },
        },
        screenshotPath: { type: 'string' },
      },
    },
  });

export const REDUNDANT_ENTRY_CHECK_RESULT_SCHEMA: JsonSchema =
  buildEnvelopeSchema({
    id: 'redundant-entry-check-result',
    title: 'RedundantEntryCheckResult',
    source: 'redundant-entry-check',
    details: {
      type: 'object',
      required: ['totalFieldsChecked', 'fieldsWithPurpose', 'groups'],
      properties: {
        totalFieldsChecked: { type: 'number' },
        fieldsWithPurpose: { type: 'number' },
        groups: {
          type: 'array',
          items: {
            type: 'object',
            required: ['purpose', 'kind', 'fields', 'copyControls'],
            properties: {
              purpose: { type: 'string' },
              formSelector: { type: ['string', 'null'] },
              kind: { type: 'string', enum: ['scoped', 'repeated'] },
              fields: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'selector',
                    'purpose',
                    'purposeSource',
                    'scope',
                    'contactType',
                    'editable',
                  ],
                  properties: {
                    selector: { type: 'string' },
                    purpose: { type: 'string' },
                    purposeSource: {
                      type: 'string',
                      enum: [
                        'autocomplete',
                        'name',
                        'id',
                        'label',
                        'placeholder',
                      ],
                    },
                    scope: { enum: ['shipping', 'billing', null] },
                    section: { type: ['string', 'null'] },
                    contactType: { type: ['string', 'null'] },
                    editable: { type: 'boolean' },
                    formSelector: { type: ['string', 'null'] },
                    name: { type: ['string', 'null'] },
                    id: { type: ['string', 'null'] },
                    labelText: { type: ['string', 'null'] },
                    autocomplete: { type: ['string', 'null'] },
                  },
                },
              },
              copyControls: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['selector', 'tagName', 'text'],
                  properties: {
                    selector: { type: 'string' },
                    tagName: { type: 'string' },
                    text: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

const MOTION_EVENT_TYPE_SCHEMA: JsonSchema = {
  type: 'string',
  enum: ['devicemotion', 'deviceorientation', 'deviceorientationabsolute'],
};

export const MOTION_ACTUATION_CHECK_RESULT_SCHEMA: JsonSchema =
  buildEnvelopeSchema({
    id: 'motion-actuation-check-result',
    title: 'MotionActuationCheckResult',
    source: 'motion-actuation-check',
    details: {
      type: 'object',
      required: ['listenerInspection', 'listeners', 'simulation'],
      properties: {
        listenerInspection: { type: 'string', enum: ['cdp', 'unsupported'] },
        listeners: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'target',
              'type',
              'useCapture',
              'passive',
              'once',
              'scriptId',
              'lineNumber',
              'columnNumber',
              'handlerPreview',
            ],
            properties: {
              target: { type: 'string', enum: ['window', 'document'] },
              type: MOTION_EVENT_TYPE_SCHEMA,
              useCapture: { type: 'boolean' },
              passive: { type: 'boolean' },
              once: { type: 'boolean' },
              scriptId: { type: 'string' },
              lineNumber: { type: 'integer' },
              columnNumber: { type: 'integer' },
              handlerPreview: { type: ['string', 'null'] },
            },
          },
        },
        simulation: {
          type: 'object',
          required: ['status', 'results'],
          properties: {
            status: {
              type: 'string',
              enum: [
                'ran',
                'disabled',
                'skipped-no-listeners',
                'skipped-document-only',
                'unsupported',
              ],
            },
            results: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'type',
                  'eventsDispatched',
                  'domMutations',
                  'baselineDomMutations',
                  'navigated',
                  'urlAfter',
                  'error',
                ],
                properties: {
                  type: MOTION_EVENT_TYPE_SCHEMA,
                  eventsDispatched: { type: ['integer', 'null'] },
                  domMutations: { type: ['integer', 'null'] },
                  baselineDomMutations: { type: ['integer', 'null'] },
                  navigated: { type: 'boolean' },
                  urlAfter: { type: ['string', 'null'] },
                  error: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
  });

const INPUT_CONTEXT_CHANGE_SCHEMA: JsonSchema = {
  oneOf: [
    {
      type: 'object',
      required: ['kind', 'toUrl'],
      properties: { kind: { const: 'navigation' }, toUrl: { type: 'string' } },
    },
    {
      type: 'object',
      required: ['kind', 'url'],
      properties: { kind: { const: 'new-window' }, url: { type: 'string' } },
    },
    {
      type: 'object',
      required: ['kind', 'toSelector'],
      properties: {
        kind: { const: 'focus-moved' },
        toSelector: { type: 'string' },
      },
    },
    {
      type: 'object',
      required: ['kind', 'dialogType', 'message'],
      properties: {
        kind: { const: 'dialog' },
        dialogType: { type: 'string' },
        message: { type: 'string' },
      },
    },
  ],
};

const CHANGE_ON_INPUT_CONTROL_SCHEMA: JsonSchema = {
  type: 'object',
  required: [
    'selector',
    'controlKind',
    'type',
    'name',
    'label',
    'html',
    'htmlTruncated',
  ],
  properties: {
    selector: { type: 'string' },
    controlKind: {
      type: 'string',
      enum: ['select', 'radio', 'checkbox', 'text'],
    },
    type: { type: 'string' },
    name: { type: ['string', 'null'] },
    label: { type: ['string', 'null'] },
    html: { type: 'string' },
    htmlTruncated: { type: 'boolean' },
  },
};

export const CHANGE_ON_INPUT_CHECK_RESULT_SCHEMA: JsonSchema =
  buildEnvelopeSchema({
    id: 'change-on-input-check-result',
    title: 'ChangeOnInputCheckResult',
    source: 'change-on-input-check',
    details: {
      type: 'object',
      required: [
        'controlsFound',
        'controlsTested',
        'skipped',
        'untested',
        'findings',
        'restarts',
        'aborted',
      ],
      properties: {
        controlsFound: { type: 'integer' },
        controlsTested: { type: 'integer' },
        skipped: {
          type: 'array',
          items: {
            type: 'object',
            required: ['selector', 'reason'],
            properties: {
              selector: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
        untested: {
          type: 'array',
          items: {
            type: 'object',
            required: ['control', 'reason'],
            properties: {
              control: CHANGE_ON_INPUT_CONTROL_SCHEMA,
              reason: { type: 'string' },
            },
          },
        },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            required: ['control', 'action', 'changes'],
            properties: {
              control: CHANGE_ON_INPUT_CONTROL_SCHEMA,
              action: { type: 'string' },
              changes: { type: 'array', items: INPUT_CONTEXT_CHANGE_SCHEMA },
            },
          },
        },
        restarts: { type: 'integer' },
        aborted: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              required: ['reason', 'testedCount', 'foundCount'],
              properties: {
                reason: {
                  type: 'string',
                  enum: ['timeout', 'control-limit', 'restart-limit'],
                },
                testedCount: { type: 'integer' },
                foundCount: { type: 'integer' },
              },
            },
          ],
        },
      },
    },
  });

/** All result schemas keyed by check id. */
export const RESULT_SCHEMAS = {
  'axe-audit': AXE_AUDIT_RESULT_SCHEMA,
  'focus-indicator-check': FOCUS_CHECK_RESULT_SCHEMA,
  'reflow-check': REFLOW_CHECK_RESULT_SCHEMA,
  'target-size-check': TARGET_SIZE_CHECK_RESULT_SCHEMA,
  'text-spacing-check': TEXT_SPACING_CHECK_RESULT_SCHEMA,
  'zoom-200-check': ZOOM_CHECK_RESULT_SCHEMA,
  'orientation-check': ORIENTATION_CHECK_RESULT_SCHEMA,
  'autocomplete-audit': AUTOCOMPLETE_AUDIT_RESULT_SCHEMA,
  'time-limit-detector': TIME_LIMIT_DETECTOR_RESULT_SCHEMA,
  'auto-play-detection': AUTO_PLAY_DETECTION_RESULT_SCHEMA,
  'keyboard-trap-check': KEYBOARD_TRAP_CHECK_RESULT_SCHEMA,
  'keyboard-reachability-check': KEYBOARD_REACHABILITY_CHECK_RESULT_SCHEMA,
  'redundant-entry-check': REDUNDANT_ENTRY_CHECK_RESULT_SCHEMA,
  'motion-actuation-check': MOTION_ACTUATION_CHECK_RESULT_SCHEMA,
  'change-on-input-check': CHANGE_ON_INPUT_CHECK_RESULT_SCHEMA,
} as const;
