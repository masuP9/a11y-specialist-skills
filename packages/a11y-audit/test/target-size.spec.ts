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

  // Nested interactive elements are separate targets: the inner button's
  // circle is inside the wrapping link, and vice versa.
  const inner = issue('#inner');
  expect(inner.exception).toBeNull();
  expect(inner.spacing?.intersections).toEqual([
    { selector: '#wrap', kind: 'target', distance: 0, required: 12 },
  ]);
  expect(issue('#wrap').spacing?.intersections).toEqual([
    { selector: '#inner', kind: 'target', distance: 0, required: 12 },
  ]);

  // Card link wrapping a small button: no spacing exception for the button
  const fav = issue('#card-fav');
  expect(fav.exceptionAssessment).toBe('not-assessed');
  expect(fav.spacing?.intersections).toEqual([
    { selector: '#card', kind: 'target', distance: 0, required: 12 },
  ]);
  // The 120x60 card itself passes both thresholds and is not an issue
  expect(allIssues.some((i) => i.selector === '#card')).toBe(false);

  // Label and its control are the same target
  expectVerified('#lbl');
  // Verified spacing wins over the ua-control heuristic
  expectVerified('#chk');

  // Covered target is dropped entirely; its neighbor is unaffected
  expect(allIssues.some((i) => i.selector === '#covered')).toBe(false);
  expect(details.occludedTargets).toBe(1);
  expectVerified('#beside');

  // Wrapped link neighbor: line boxes, not the bounding box
  expectVerified('#near-wrapped');
  expect(issue('#wrapped').level).toBe('fail-aaa-only');

  // Beyond the initial viewport: scrolled, hit-tested, and scroll restored
  expectVerified('#far');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // Implicit label (no `for`) is a target; its wrapped checkbox is the same
  // target, but a button 11px from the label's edge intersects it.
  expect(issue('#near-implicit').spacing?.intersections).toEqual([
    { selector: '#implicit', kind: 'target', distance: 11, required: 12 },
  ]);
  expectVerified('#implicit-input');

  // Two labels for the same control are one target (centers 22px apart)
  expectVerified('#dual-a');
  expectVerified('#dual-b');
  expectVerified('#dual');

  // position: fixed neighbor: evaluated over the scroll range in which the
  // subject is visible, not at the scroll position of collection.
  expect(issue('#near-fixed').spacing?.intersections).toEqual([
    { selector: '#fixed-btn', kind: 'target', distance: 11, required: 12 },
  ]);

  // Normalized buckets: verified targets leave 2.5.8 review and enter 2.5.5
  const minimum = result.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-minimum',
  );
  const minimumTargets = minimum?.nodes.map((n) => n.target[0]) ?? [];
  expect(minimumTargets).toContain('#pair-fail-a');
  expect(minimumTargets).toContain('#near-large');
  expect(minimumTargets).toContain('#card-fav');
  expect(minimumTargets).not.toContain('#pair-ok-a');
  expect(minimumTargets).not.toContain('#chk');
  expect(minimumTargets).not.toContain('#far');
  expect(
    minimum?.nodes.find((n) => n.target[0] === '#pair-fail-a')?.failureSummary,
  ).toContain(
    'intersects the circle of undersized target #pair-fail-b (22px, requires 24px)',
  );
  expect(details.summary.verifiedCount).toBe(
    details.exceptedTargets.filter((t) => t.exceptionAssessment === 'verified')
      .length,
  );

  const enhanced = result.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-enhanced',
  );
  const enhancedTargets = enhanced?.nodes.map((n) => n.target[0]) ?? [];
  expect(enhancedTargets).toContain('#pair-ok-a');
  expect(enhancedTargets).toContain('#wrapped');
  expect(enhancedTargets).not.toContain('#pair-fail-a');
});

test('target-size-check — pre-scrolled page with smooth scrolling', async ({
  baseUrl,
  page,
}, testInfo) => {
  await page.goto(`${baseUrl}/target-size/spacing-cases.html`, {
    waitUntil: 'networkidle',
  });
  // Simulate a site-wide `scroll-behavior: smooth` and a caller that scrolled
  // before running the check (hash navigation, scroll restoration, ...).
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    window.scrollTo({ top: 500, behavior: 'instant' });
  });
  expect(await page.evaluate(() => window.scrollY)).toBe(500);

  const result = await runTargetSizeCheck({
    page,
    outputDir: testInfo.outputDir,
  });
  const { details } = result;
  const all = [...details.failAA, ...details.exceptedTargets];
  const bySelector = (s: string): TargetSizeIssue | undefined =>
    all.find((i) => i.selector === s);

  // #stack-a sits above the viewport (bottom at 496 < scrollY 500) but is
  // still collected and still counts as #stack-b's neighbor.
  expect(bySelector('#stack-a')?.exception).toBeNull();
  expect(bySelector('#stack-b')?.spacing?.intersections).toEqual([
    { selector: '#stack-a', kind: 'circle', distance: 22, required: 24 },
  ]);

  // Occlusion hit-testing still works below the fold despite smooth scrolling,
  // and the caller's scroll position is restored.
  expect(all.some((i) => i.selector === '#covered')).toBe(false);
  expect(details.occludedTargets).toBe(1);
  expect(bySelector('#far')?.exceptionAssessment).toBe('verified');
  expect(await page.evaluate(() => window.scrollY)).toBe(500);

  // The fixed-neighbor result does not depend on the caller's scroll position.
  expect(bySelector('#near-fixed')?.spacing?.intersections).toEqual([
    { selector: '#fixed-btn', kind: 'target', distance: 11, required: 12 },
  ]);
});
