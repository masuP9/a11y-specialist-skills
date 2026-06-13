/**
 * Playwright test fixtures for the fixture-gallery spec.
 *
 * Provides:
 *  - `baseUrl`: a worker-scoped HTTP server serving test/fixtures/pages/
 *  - `runCheck(checkName, fixtureRelPath)`: runs the named check against
 *    a fixture served over HTTP, abstracting over the three runner kinds
 *    (page-current / page-navigating / browser-navigating).
 *  - `expectRules(result, expectMap)`: asserts each ruleId lands in the
 *    expected bucket and (for clear scenarios) is not inapplicable.
 */

import * as path from 'node:path';
import { test as base, expect } from '@playwright/test';
import type { AuditCheckResult } from '../../dist/index.js';
import { startStaticServer } from './static-server.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BucketName = 'violations' | 'incomplete' | 'passes' | 'inapplicable';

export type ExpectRulesMap = Record<string, BucketName>;

/**
 * The three runner API shapes:
 *   page-current      → run({ page, outputDir })        — caller navigates before calling
 *   page-navigating   → run({ page, targetUrl, outputDir }) — check navigates internally
 *   browser-navigating → run({ browser, targetUrl, outputDir }) — check manages its own page
 */
type RunnerKind = 'page-current' | 'page-navigating' | 'browser-navigating';

interface RunnerEntry {
  kind: RunnerKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run(opts: any): Promise<AuditCheckResult<unknown>>;
}

// ---------------------------------------------------------------------------
// Runner registry (derived from src/cli.ts CHECK_REGISTRY)
// ---------------------------------------------------------------------------

async function buildRunnerRegistry(): Promise<Record<string, RunnerEntry>> {
  const {
    runAxeAudit,
    runFocusIndicatorCheck,
    runReflowCheck,
    runTextSpacingCheck,
    runZoomCheck,
    runOrientationCheck,
    runAutocompleteAudit,
    runTimeLimitDetector,
    runAutoPlayDetection,
    runTargetSizeCheck,
    runKeyboardTrapCheck,
  } = await import('../../dist/playwright/index.js');

  return {
    'axe-audit': {
      kind: 'page-current',
      run: (opts) => runAxeAudit(opts),
    },
    'focus-indicator-check': {
      kind: 'browser-navigating',
      run: (opts) => runFocusIndicatorCheck(opts),
    },
    'reflow-check': {
      kind: 'page-current',
      run: (opts) => runReflowCheck(opts),
    },
    'text-spacing-check': {
      kind: 'page-current',
      run: (opts) => runTextSpacingCheck(opts),
    },
    'zoom-200-check': {
      kind: 'page-current',
      run: (opts) => runZoomCheck(opts),
    },
    'orientation-check': {
      kind: 'page-navigating',
      run: (opts) => runOrientationCheck(opts),
    },
    'autocomplete-audit': {
      kind: 'page-current',
      run: (opts) => runAutocompleteAudit(opts),
    },
    'time-limit-detector': {
      kind: 'page-navigating',
      run: (opts) => runTimeLimitDetector(opts),
    },
    'auto-play-detection': {
      kind: 'page-current',
      run: (opts) => runAutoPlayDetection(opts),
    },
    'target-size-check': {
      kind: 'page-current',
      run: (opts) => runTargetSizeCheck(opts),
    },
    'keyboard-trap-check': {
      kind: 'browser-navigating',
      run: (opts) => runKeyboardTrapCheck(opts),
    },
  };
}

// ---------------------------------------------------------------------------
// Test fixture type
// ---------------------------------------------------------------------------

interface GalleryFixtures {
  /** HTTP base URL for test/fixtures/pages/ */
  baseUrl: string;
}

const FIXTURES_PAGES_DIR = path.resolve(
  new URL('../fixtures/pages', import.meta.url).pathname,
);

export const test = base.extend<
  // test-scoped (none currently)
  Record<string, never>,
  // worker-scoped
  GalleryFixtures
>({
  baseUrl: [
    // eslint-disable-next-line no-empty-pattern
    async ({} /* no fixtures needed */, use) => {
      const server = await startStaticServer(FIXTURES_PAGES_DIR);
      await use(server.baseUrl);
      await server.close();
    },
    { scope: 'worker' },
  ],
});

export { expect };

// ---------------------------------------------------------------------------
// Run helper
// ---------------------------------------------------------------------------

/**
 * Run a named check against a fixture file served from baseUrl.
 *
 * `fixtureRelPath` is relative to test/fixtures/pages/,
 * e.g. `"keyboard-trap/finding.html"`.
 */
export async function runFixtureCheck(
  checkName: string,
  fixtureRelPath: string,
  baseUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { page: any; browser: any; testInfo: any },
): Promise<AuditCheckResult<unknown>> {
  const registry = await buildRunnerRegistry();
  const entry = registry[checkName];
  if (!entry) {
    throw new Error(`Unknown check: ${checkName}`);
  }

  const targetUrl = `${baseUrl}/${fixtureRelPath}`;
  const outputDir = context.testInfo.outputDir;

  switch (entry.kind) {
    case 'page-current': {
      await context.page.goto(targetUrl, { waitUntil: 'networkidle' });
      return entry.run({ page: context.page, outputDir });
    }
    case 'page-navigating': {
      return entry.run({ page: context.page, targetUrl, outputDir });
    }
    case 'browser-navigating': {
      return entry.run({ browser: context.browser, targetUrl, outputDir });
    }
  }
}

// ---------------------------------------------------------------------------
// expectRules assertion helper
// ---------------------------------------------------------------------------

/**
 * Assert that each rule in `expectMap` appears in exactly the specified bucket.
 *
 * For `passes` expectation: also asserts the rule is NOT in `inapplicable`
 * (guards against "clear scenario silently treated as not applicable").
 */
export function assertRuleBuckets(
  result: AuditCheckResult<unknown>,
  expectMap: ExpectRulesMap,
): void {
  for (const [ruleId, expectedBucket] of Object.entries(expectMap)) {
    const allBuckets: BucketName[] = [
      'violations',
      'incomplete',
      'passes',
      'inapplicable',
    ];

    // Find which bucket(s) contain this rule
    const foundIn = allBuckets.filter((bucket) =>
      (result[bucket] as Array<{ id: string }>).some((r) => r.id === ruleId),
    );

    expect(
      foundIn,
      `Rule "${ruleId}" should be in exactly one bucket`,
    ).toHaveLength(1);

    expect(
      foundIn[0],
      `Rule "${ruleId}" expected in "${expectedBucket}" but found in "${foundIn[0]}"`,
    ).toBe(expectedBucket);

    // Guard: 'passes' expectation must not silently be 'inapplicable'
    if (expectedBucket === 'passes') {
      expect(
        result.inapplicable.map((r: { id: string }) => r.id),
        `Rule "${ruleId}" must NOT be inapplicable when expecting 'passes'`,
      ).not.toContain(ruleId);
    }
  }
}
