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

/** All result schemas keyed by check id. */
export const RESULT_SCHEMAS = {
  'axe-audit': AXE_AUDIT_RESULT_SCHEMA,
  'focus-indicator-check': FOCUS_CHECK_RESULT_SCHEMA,
  'reflow-check': REFLOW_CHECK_RESULT_SCHEMA,
  'target-size-check': TARGET_SIZE_CHECK_RESULT_SCHEMA,
} as const;
