/**
 * Integration test for the target-size spacing exception against a fixture
 * with deterministic (absolutely positioned) geometry.
 *
 * Covers: touching vs. intersecting circles, circle vs. a large neighbor,
 * nested targets, label/control pairs, covered (occluded) targets, wrapped
 * inline links measured by line box, and targets beyond the initial viewport.
 */

import { test, expect } from './helpers/fixtures.js';
import { runTargetSizeCheck } from '../dist/playwright/index.js';
import type { TargetSizeIssue } from '../dist/index.js';

test('target-size-check — spacing exception geometry', async ({
  baseUrl,
  page,
}, testInfo) => {
  await page.goto(`${baseUrl}/target-size/spacing-cases.html`, {
    waitUntil: 'networkidle',
  });

  const result = await runTargetSizeCheck({
    page,
    outputDir: testInfo.outputDir,
    screenshot: true,
  });
  const { details } = result;

  const allIssues: TargetSizeIssue[] = [
    ...details.failAA,
    ...details.exceptedTargets,
    ...details.failAAAOnly,
  ];
  const issue = (selector: string): TargetSizeIssue => {
    const found = allIssues.find((i) => i.selector === selector);
    expect(found, `issue for ${selector}`).toBeDefined();
    return found!;
  };
  const expectVerified = (selector: string): void => {
    const i = issue(selector);
    expect(i.level, selector).toBe('fail-aa');
    expect(i.exception, selector).toBe('spacing');
    expect(i.exceptionAssessment, selector).toBe('verified');
    expect(i.spacing?.applies, selector).toBe(true);
    expect(i.spacing?.intersections, selector).toEqual([]);
  };

  // Touching circles (centers exactly 24px apart) → exception applies
  expectVerified('#pair-ok-a');
  expectVerified('#pair-ok-b');
  expect(issue('#pair-ok-a').spacing?.center).toEqual({ x: 30, y: 30 });

  // Intersecting circles (centers 22px apart) → no exception
  const failA = issue('#pair-fail-a');
  expect(failA.exception).toBeNull();
  expect(failA.exceptionAssessment).toBe('not-assessed');
  expect(failA.spacing?.applies).toBe(false);
  expect(failA.spacing?.intersections).toEqual([
    { selector: '#pair-fail-b', kind: 'circle', distance: 22, required: 24 },
  ]);

  // Circle vs. a large neighbor 11px from the center
  const nearLarge = issue('#near-large');
  expect(nearLarge.spacing?.applies).toBe(false);
  expect(nearLarge.spacing?.intersections).toEqual([
    { selector: '#large', kind: 'target', distance: 11, required: 12 },
  ]);

  // Nested link/button share one box: not each other's neighbor
  expectVerified('#wrap');
  expectVerified('#inner');

  // Label and its control are the same target
  expectVerified('#lbl');
  const chk = issue('#chk');
  expect(chk.exception).toBe('ua-control');
  expect(chk.spacing?.applies).toBe(true);

  // Covered target is dropped entirely; its neighbor is unaffected
  expect(allIssues.some((i) => i.selector === '#covered')).toBe(false);
  expectVerified('#beside');

  // Wrapped link neighbor: line boxes, not the bounding box
  expectVerified('#near-wrapped');
  expect(issue('#wrapped').level).toBe('fail-aaa-only');

  // Beyond the initial viewport: scrolled, hit-tested, and scroll restored
  expectVerified('#far');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // Normalized buckets: verified targets leave 2.5.8 review and enter 2.5.5
  const minimum = result.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-minimum',
  );
  const minimumTargets = minimum?.nodes.map((n) => n.target[0]) ?? [];
  expect(minimumTargets).toContain('#pair-fail-a');
  expect(minimumTargets).toContain('#near-large');
  expect(minimumTargets).not.toContain('#pair-ok-a');
  expect(minimumTargets).not.toContain('#far');
  expect(
    minimum?.nodes.find((n) => n.target[0] === '#pair-fail-a')?.failureSummary,
  ).toContain('intersects the circle of undersized target #pair-fail-b');

  const enhanced = result.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-enhanced',
  );
  const enhancedTargets = enhanced?.nodes.map((n) => n.target[0]) ?? [];
  expect(enhancedTargets).toContain('#pair-ok-a');
  expect(enhancedTargets).toContain('#wrapped');
  expect(enhancedTargets).not.toContain('#pair-fail-a');
});
