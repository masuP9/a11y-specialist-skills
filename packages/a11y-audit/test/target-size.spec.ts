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
import type { TargetSizeCheckResult, TargetSizeIssue } from '../dist/index.js';

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

  // A fixed/flow pair is compared where the flow target is farthest from the
  // fixed one: scroll 0 when the fixed one is above, the maximum scroll when
  // it is below. Only passing the fixed element while scrolling is fine.
  expectVerified('#near-fixed');
  // Just below a fixed header at scroll 0 → intersects.
  expect(issue('#under-hdr').spacing?.intersections).toEqual([
    { selector: '#hdr-fixed', kind: 'target', distance: 10, required: 12 },
  ]);
  // Just above a fixed bottom bar at scroll 0, far at the maximum scroll.
  expectVerified('#above-bottom');
  // Undersized fixed target: the flow neighbor below is too close at scroll
  // 0; the one above is far at the maximum scroll.
  expect(issue('#tiny-fixed2').spacing?.intersections).toEqual([
    { selector: '#below-tiny', kind: 'circle', distance: 22, required: 24 },
  ]);
  expect(issue('#below-tiny').spacing?.intersections).toEqual([
    { selector: '#tiny-fixed2', kind: 'circle', distance: 22, required: 24 },
  ]);
  expectVerified('#tiny-fixed3');
  expectVerified('#above-tiny');

  // position: fixed under a transformed ancestor scrolls with the page: it is
  // a normal flow neighbor (centers 22px apart → circles intersect).
  expect(issue('#tflow').spacing?.intersections).toEqual([
    { selector: '#tfixed', kind: 'circle', distance: 22, required: 24 },
  ]);
  expect(issue('#tfixed').spacing?.intersections).toEqual([
    { selector: '#tflow', kind: 'circle', distance: 22, required: 24 },
  ]);
  // Same with the individual `translate` property on the ancestor.
  expect(issue('#tflow2').spacing?.intersections).toEqual([
    { selector: '#tfixed2', kind: 'circle', distance: 22, required: 24 },
  ]);

  // Undersized viewport-fixed target: verified, center reported in document
  // coordinates (scroll is 0 here, so equal to viewport coordinates).
  expectVerified('#tiny-fixed');
  expect(issue('#tiny-fixed').spacing?.center).toEqual({ x: 610, y: 310 });

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
  expect(bySelector('#near-fixed')?.exceptionAssessment).toBe('verified');
  expect(bySelector('#under-hdr')?.spacing?.intersections).toEqual([
    { selector: '#hdr-fixed', kind: 'target', distance: 10, required: 12 },
  ]);

  // A fixed element under a transformed ancestor sits above the viewport at
  // scrollY=500 (document y 100..120) but is still collected as a flow
  // neighbor of #tflow.
  expect(bySelector('#tflow')?.spacing?.intersections).toEqual([
    { selector: '#tfixed', kind: 'circle', distance: 22, required: 24 },
  ]);
  expect(bySelector('#tflow2')?.spacing?.intersections).toEqual([
    { selector: '#tfixed2', kind: 'circle', distance: 22, required: 24 },
  ]);

  // Viewport-fixed target center is reported in document coordinates:
  // viewport (610, 310) + scroll (0, 500).
  expect(bySelector('#tiny-fixed')?.exceptionAssessment).toBe('verified');
  expect(bySelector('#tiny-fixed')?.spacing?.center).toEqual({
    x: 610,
    y: 810,
  });
});

test('target-size-check — fixed target below a flow target with little scroll room', async ({
  baseUrl,
  page,
}, testInfo) => {
  await page.goto(`${baseUrl}/target-size/fixed-short-scroll.html`, {
    waitUntil: 'networkidle',
  });

  const { details } = await runTargetSizeCheck({
    page,
    outputDir: testInfo.outputDir,
  });
  const all = [...details.failAA, ...details.exceptedTargets];
  const bySelector = (s: string): TargetSizeIssue | undefined =>
    all.find((i) => i.selector === s);

  // A fixed element below is compared at the maximum scroll (5px), where the
  // flow target is farthest from it: still too close → intersects.
  expect(bySelector('#near-bottom')?.spacing?.intersections).toEqual([
    { selector: '#bottom-btn', kind: 'target', distance: 11, required: 12 },
  ]);
  expect(bySelector('#tiny-bottom')?.spacing?.intersections).toEqual([
    {
      selector: '#above-tiny-bottom',
      kind: 'target',
      distance: 11,
      required: 12,
    },
  ]);
  expect(bySelector('#above-tiny-bottom')?.spacing?.intersections).toEqual([
    { selector: '#tiny-bottom', kind: 'target', distance: 11, required: 12 },
  ]);
});

test.describe('target-size-check — resolveAccessibleNames', () => {
  const allIssues = (r: TargetSizeCheckResult): TargetSizeIssue[] => [
    ...r.details.failAA,
    ...r.details.failAAAOnly,
    ...r.details.exceptedTargets,
  ];

  test.beforeEach(async ({ baseUrl, page }) => {
    await page.goto(`${baseUrl}/target-size/finding.html`, {
      waitUntil: 'networkidle',
    });
  });

  test('resolveAccessibleNames: false leaves every name null', async ({
    page,
  }, testInfo) => {
    const common = { page, outputDir: testInfo.outputDir, quiet: true };
    const named = allIssues(await runTargetSizeCheck(common));
    expect(named.some((i) => i.accessibleName !== null)).toBe(true);

    const unnamed = allIssues(
      await runTargetSizeCheck({ ...common, resolveAccessibleNames: false }),
    );
    expect(unnamed.every((i) => i.accessibleName === null)).toBe(true);
    // Everything but the name is unchanged.
    expect(unnamed).toEqual(named.map((i) => ({ ...i, accessibleName: null })));
  });
});
