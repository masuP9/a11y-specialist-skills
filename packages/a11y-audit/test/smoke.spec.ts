/**
 * Smoke tests for @a11y-skills/audit.
 *
 * These import from the BUILT `dist/` output (run `npm run build` first; the
 * `pretest` script does this automatically) so they exercise the actual
 * published artifact. Each fixture is crafted to trigger the relevant check.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  runAxeAudit,
  runReflowCheck,
  runTargetSizeCheck,
  runFocusIndicatorCheck,
  runKeyboardTrapCheck,
} from '../dist/playwright/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureUrl = (name: string) =>
  `file://${path.join(__dirname, 'fixtures', name)}`;

const AXE_FIXTURE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>axe fixture</title></head>
<body>
  <img src="missing.png">
  <a href="#"></a>
  <input type="text">
</body></html>`;

const REFLOW_FIXTURE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>reflow fixture</title>
<style>
  body { margin: 0; }
  .wide { width: 1200px; height: 80px; background: #c00; }
</style></head>
<body>
  <div class="wide">A very wide block that cannot fit into a 320px viewport.</div>
</body></html>`;

const TARGET_FIXTURE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>target fixture</title>
<style>
  body { margin: 0; }
  .tiny { width: 10px; height: 10px; padding: 0; border: 0; font-size: 6px; }
</style></head>
<body>
  <button id="b1" class="tiny">a</button><button id="b2" class="tiny">b</button>
</body></html>`;

const FOCUS_FIXTURE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>focus fixture</title>
<style>
  button:focus { outline: none; }
</style></head>
<body>
  <button id="nofocus">no focus indicator</button>
</body></html>`;

test('runAxeAudit detects violations in the normalized envelope', async ({
  page,
}, testInfo) => {
  await page.setContent(AXE_FIXTURE);
  const result = await runAxeAudit({ page, outputDir: testInfo.outputDir });

  expect(result.source).toBe('axe-audit');
  expect(result.summary.violationCount).toBeGreaterThan(0);
  // image-alt is a reliable, deterministic violation for the fixture above.
  const ids = result.violations.map((v) => v.id);
  expect(ids).toContain('image-alt');
  // nodes carry html evidence and selector targets
  const imageAlt = result.violations.find((v) => v.id === 'image-alt')!;
  expect(imageAlt.nodes.length).toBeGreaterThan(0);
  expect(imageAlt.nodes[0].html).toContain('img');
  expect(imageAlt.nodes[0].target.length).toBeGreaterThan(0);
});

test('runReflowCheck reports overflow as incomplete (manual-review queue)', async ({
  page,
}, testInfo) => {
  await page.setContent(REFLOW_FIXTURE);
  const result = await runReflowCheck({ page, outputDir: testInfo.outputDir });

  expect(result.source).toBe('reflow-check');
  expect(result.details.viewport).toEqual({ width: 320, height: 256 });
  expect(
    result.details.hasHorizontalScroll ||
      result.details.overflowingElements.length > 0,
  ).toBe(true);
  // reflow findings are never auto-confirmed violations
  expect(result.violations).toEqual([]);
  const incompleteIds = result.incomplete.map((r) => r.id);
  expect(incompleteIds).toContain('a11y-skills/reflow-overflow');
});

test('runTargetSizeCheck flags undersized adjacent targets as incomplete', async ({
  page,
}, testInfo) => {
  await page.setContent(TARGET_FIXTURE);
  const result = await runTargetSizeCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.totalTargetsChecked).toBeGreaterThanOrEqual(2);
  expect(result.details.summary.failAACount).toBeGreaterThan(0);
  expect(result.summary.checkedNodes).toBe(result.details.totalTargetsChecked);

  const minimum = result.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-minimum',
  );
  expect(minimum).toBeDefined();
  expect(minimum!.tags).toContain('wcag22aa');
  expect(minimum!.tags).toContain('wcag258');
  expect(minimum!.nodes[0].html).toContain('button');
  // heuristics cannot rule out the essential exception
  expect(result.details.failAA[0].exceptionAssessment).not.toBe('ruled-out');
});

test('runFocusIndicatorCheck flags missing focus indicator as incomplete', async ({
  browser,
}, testInfo) => {
  const targetUrl = 'data:text/html,' + encodeURIComponent(FOCUS_FIXTURE);
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.totalFocusableElements).toBeGreaterThan(0);
  expect(result.details.elementsWithoutFocusStyle).toBeGreaterThan(0);

  const focusVisible = result.incomplete.find(
    (r) => r.id === 'a11y-skills/focus-visible',
  );
  expect(focusVisible).toBeDefined();
  expect(focusVisible!.nodes[0].target[0]).toContain('#nofocus');
  expect(focusVisible!.nodes[0].html).toContain('button');
});

test('runKeyboardTrapCheck detects true keyboard trap as violation', async ({
  browser,
}, testInfo) => {
  const result = await runKeyboardTrapCheck({
    browser,
    targetUrl: fixtureUrl('keyboard-trap-true.html'),
    outputDir: testInfo.outputDir,
  });

  expect(result.source).toBe('keyboard-trap-check');
  expect(result.details.totalFocusableElements).toBeGreaterThan(0);
  expect(result.summary.checkedNodes).toBe(
    result.details.totalFocusableElements,
  );
  expect(
    result.violations.some((r) => r.id === 'a11y-skills/no-keyboard-trap'),
  ).toBe(true);
});

test('runKeyboardTrapCheck passes for a proper aria-modal dialog', async ({
  browser,
}, testInfo) => {
  const result = await runKeyboardTrapCheck({
    browser,
    targetUrl: fixtureUrl('keyboard-trap-modal.html'),
    outputDir: testInfo.outputDir,
  });

  expect(result.source).toBe('keyboard-trap-check');
  expect(result.violations).toHaveLength(0);
  expect(result.incomplete).toHaveLength(0);
});

test('runKeyboardTrapCheck passes for a page with no keyboard trap', async ({
  browser,
}, testInfo) => {
  const result = await runKeyboardTrapCheck({
    browser,
    targetUrl: fixtureUrl('keyboard-trap-none.html'),
    outputDir: testInfo.outputDir,
  });

  expect(result.source).toBe('keyboard-trap-check');
  expect(result.violations).toHaveLength(0);
  expect(result.incomplete).toHaveLength(0);
  expect(result.details.totalFocusableElements).toBeGreaterThan(0);
});
