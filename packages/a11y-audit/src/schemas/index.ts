/**
 * Result types and JSON Schemas for the audit checks.
 *
 * The TypeScript types are the source of truth; the JSON Schemas are
 * hand-written for consumers that validate the result files at runtime
 * (e.g. an issue creator that reads `*-result.json`). They are intentionally
 * permissive (no `additionalProperties: false`) so that additive changes to a
 * result shape do not break downstream validation.
 */

export type {
  AxeViolationNode,
  AxeViolation,
  AxeAuditResult,
  FocusRecord,
  OnFocusViolation,
  FocusCheckResult,
  BoundingRect,
  FocusObscuredOverlap,
  FocusObscuredIssue,
  ReflowIssue,
  ClippedTextElement,
  ReflowCheckResult,
  TargetSizeException,
  TargetSizeIssue,
  TargetSizeSummary,
  TargetSizeCheckResult,
  TextSpacingIssue,
  TextSpacingCheckResult,
  ZoomIssue,
  ZoomCheckResult,
  OrientationState,
  OrientationCheckResult,
  AutocompleteIssue,
  AutocompleteAuditResult,
  MetaRefreshInfo,
  TimerInfo,
  CountdownIndicator,
  TimeLimitDetectorResult,
  ScreenshotRecord,
  ComparisonResult,
  ImageDiffResult,
  PauseControl,
  CarouselIndicator,
  PauseControlInfo,
  PauseVerificationResult,
  AutoPlayDetectionResult,
} from '../types.js';

/** Minimal JSON Schema object shape (Draft 2020-12 compatible subset). */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  [key: string]: unknown;
}

const DISCLAIMER_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    messageEn: { type: 'string' },
    coverage: { type: 'string' },
    moreInfo: { type: 'string' },
  },
};

export const AXE_AUDIT_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/axe-audit-result.json',
  title: 'AxeAuditResult',
  type: 'object',
  required: [
    'url',
    'timestamp',
    'violations',
    'passes',
    'incomplete',
    'inapplicable',
    'violationCount',
  ],
  properties: {
    url: { type: 'string' },
    timestamp: { type: 'string' },
    violations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'description', 'help', 'helpUrl', 'tags', 'nodes'],
        properties: {
          id: { type: 'string' },
          impact: { type: ['string', 'null'] },
          description: { type: 'string' },
          help: { type: 'string' },
          helpUrl: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['html', 'target'],
              properties: {
                html: { type: 'string' },
                target: { type: 'array', items: { type: 'string' } },
                failureSummary: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
    passes: { type: 'number' },
    incomplete: { type: 'number' },
    inapplicable: { type: 'number' },
    violationCount: { type: 'number' },
    disclaimer: DISCLAIMER_SCHEMA,
  },
};

const FOCUS_ELEMENT_REF_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['tag', 'name', 'selector'],
  properties: {
    tag: { type: 'string' },
    role: { type: ['string', 'null'] },
    name: { type: 'string' },
    selector: { type: 'string' },
  },
};

export const FOCUS_CHECK_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/focus-check-result.json',
  title: 'FocusCheckResult',
  type: 'object',
  required: [
    'url',
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
    url: { type: 'string' },
    totalFocusableElements: { type: 'number' },
    elementsWithFocusStyle: { type: 'number' },
    elementsWithoutFocusStyle: { type: 'number' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tag', 'name'],
        properties: {
          tag: { type: 'string' },
          role: { type: ['string', 'null'] },
          name: { type: 'string' },
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
        required: ['element', 'elementRect', 'overlaps', 'obscuredRatio'],
        properties: {
          element: FOCUS_ELEMENT_REF_SCHEMA,
          elementRect: { type: 'object' },
          overlaps: { type: 'array', items: { type: 'object' } },
          obscuredRatio: { type: 'number' },
        },
      },
    },
    elementsWithObscuredFocus: { type: 'number' },
    allElements: { type: 'array', items: { type: 'object' } },
    interrupted: { type: 'boolean' },
    interruptedAt: { type: 'number' },
    screenshotPath: { type: 'string' },
    disclaimer: DISCLAIMER_SCHEMA,
  },
};

export const REFLOW_CHECK_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/reflow-check-result.json',
  title: 'ReflowCheckResult',
  type: 'object',
  required: [
    'url',
    'viewport',
    'hasHorizontalScroll',
    'documentScrollWidth',
    'documentClientWidth',
    'overflowingElements',
    'clippedTextElements',
  ],
  properties: {
    url: { type: 'string' },
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
        required: ['selector', 'tagName', 'rect', 'viewportWidth', 'reason'],
        properties: {
          selector: { type: 'string' },
          tagName: { type: 'string' },
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
    disclaimer: DISCLAIMER_SCHEMA,
  },
};

export const TARGET_SIZE_CHECK_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/target-size-check-result.json',
  title: 'TargetSizeCheckResult',
  type: 'object',
  required: [
    'url',
    'totalTargetsChecked',
    'failAA',
    'failAAAOnly',
    'passedTargets',
    'exceptedTargets',
    'summary',
  ],
  properties: {
    url: { type: 'string' },
    totalTargetsChecked: { type: 'number' },
    failAA: { type: 'array', items: { type: 'object' } },
    failAAAOnly: { type: 'array', items: { type: 'object' } },
    passedTargets: { type: 'number' },
    exceptedTargets: { type: 'array', items: { type: 'object' } },
    summary: {
      type: 'object',
      required: [
        'failAACount',
        'failAAAOnlyCount',
        'passCount',
        'exceptedCount',
      ],
      properties: {
        failAACount: { type: 'number' },
        failAAAOnlyCount: { type: 'number' },
        passCount: { type: 'number' },
        exceptedCount: { type: 'number' },
      },
    },
    disclaimer: DISCLAIMER_SCHEMA,
  },
};

export const TEXT_SPACING_CHECK_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/text-spacing-check-result.json',
  title: 'TextSpacingCheckResult',
  type: 'object',
  required: ['url', 'clippedElements', 'totalElementsChecked'],
  properties: {
    url: { type: 'string' },
    clippedElements: { type: 'array', items: { type: 'object' } },
    totalElementsChecked: { type: 'number' },
    disclaimer: DISCLAIMER_SCHEMA,
  },
};

export const ZOOM_CHECK_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/zoom-check-result.json',
  title: 'ZoomCheckResult',
  type: 'object',
  required: [
    'url',
    'zoomFactor',
    'viewport',
    'hasHorizontalScroll',
    'documentScrollWidth',
    'documentClientWidth',
    'clippedElements',
  ],
  properties: {
    url: { type: 'string' },
    zoomFactor: { type: 'number' },
    viewport: { type: 'object' },
    hasHorizontalScroll: { type: 'boolean' },
    documentScrollWidth: { type: 'number' },
    documentClientWidth: { type: 'number' },
    clippedElements: { type: 'array', items: { type: 'object' } },
    disclaimer: DISCLAIMER_SCHEMA,
  },
};

export const ORIENTATION_CHECK_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/orientation-check-result.json',
  title: 'OrientationCheckResult',
  type: 'object',
  required: ['url', 'portrait', 'landscape', 'hasOrientationLock', 'lockDetectedIn'],
  properties: {
    url: { type: 'string' },
    portrait: { type: 'object' },
    landscape: { type: 'object' },
    hasOrientationLock: { type: 'boolean' },
    lockDetectedIn: {
      type: 'string',
      enum: ['portrait', 'landscape', 'both', 'none'],
    },
    disclaimer: DISCLAIMER_SCHEMA,
  },
};

export const AUTOCOMPLETE_AUDIT_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/autocomplete-audit-result.json',
  title: 'AutocompleteAuditResult',
  type: 'object',
  required: [
    'url',
    'totalFieldsChecked',
    'missingAutocomplete',
    'invalidAutocomplete',
  ],
  properties: {
    url: { type: 'string' },
    totalFieldsChecked: { type: 'number' },
    missingAutocomplete: { type: 'array', items: { type: 'object' } },
    invalidAutocomplete: { type: 'array', items: { type: 'object' } },
    disclaimer: DISCLAIMER_SCHEMA,
  },
};

export const TIME_LIMIT_DETECTOR_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/time-limit-detector-result.json',
  title: 'TimeLimitDetectorResult',
  type: 'object',
  required: ['url', 'metaRefresh', 'timers', 'countdownIndicators', 'hasTimeLimits'],
  properties: {
    url: { type: 'string' },
    metaRefresh: { type: 'array', items: { type: 'object' } },
    timers: { type: 'array', items: { type: 'object' } },
    countdownIndicators: { type: 'array', items: { type: 'object' } },
    hasTimeLimits: { type: 'boolean' },
    disclaimer: DISCLAIMER_SCHEMA,
  },
};

export const AUTO_PLAY_DETECTION_RESULT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://masup9.github.io/a11y-audit/schemas/auto-play-detection-result.json',
  title: 'AutoPlayDetectionResult',
  type: 'object',
  required: [
    'url',
    'screenshotRecords',
    'comparisons',
    'hasAutoPlayContent',
    'stopsWithin5Seconds',
    'pauseControls',
    'pauseVerification',
    'recommendation',
  ],
  properties: {
    url: { type: 'string' },
    screenshotRecords: { type: 'array', items: { type: 'object' } },
    comparisons: { type: 'array', items: { type: 'object' } },
    hasAutoPlayContent: { type: 'boolean' },
    stopsWithin5Seconds: { type: 'boolean' },
    pauseControls: { type: 'object' },
    pauseVerification: { type: 'object' },
    recommendation: { type: 'string' },
  },
};

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
} as const;
