/**
 * Smoke tests for @a11y-skills/audit.
 *
 * These import from the BUILT `dist/` output (run `npm run build` first; the
 * `pretest` script does this automatically) so they exercise the actual
 * published artifact. Each fixture is crafted to trigger the relevant check.
 */

import { test, expect } from '@playwright/test';
import {
  runAxeAudit,
  runReflowCheck,
  runTargetSizeCheck,
  runFocusIndicatorCheck,
} from '../dist/playwright/index.js';

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

test('runAxeAudit detects violations', async ({ page }, testInfo) => {
  await page.setContent(AXE_FIXTURE);
  const result = await runAxeAudit({ page, outputDir: testInfo.outputDir });

  expect(result.violationCount).toBeGreaterThan(0);
  // image-alt is a reliable, deterministic violation for the fixture above.
  const ids = result.violations.map((v) => v.id);
  expect(ids).toContain('image-alt');
});

test('runReflowCheck detects horizontal overflow at 320px', async ({
  page,
}, testInfo) => {
  await page.setContent(REFLOW_FIXTURE);
  const result = await runReflowCheck({ page, outputDir: testInfo.outputDir });

  expect(result.viewport).toEqual({ width: 320, height: 256 });
  expect(
    result.hasHorizontalScroll || result.overflowingElements.length > 0
  ).toBe(true);
});

test('runTargetSizeCheck flags undersized adjacent targets', async ({
  page,
}, testInfo) => {
  await page.setContent(TARGET_FIXTURE);
  const result = await runTargetSizeCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.totalTargetsChecked).toBeGreaterThanOrEqual(2);
  expect(result.summary.failAACount).toBeGreaterThan(0);
});

test('runFocusIndicatorCheck flags missing focus indicator', async ({
  browser,
}, testInfo) => {
  const targetUrl = 'data:text/html,' + encodeURIComponent(FOCUS_FIXTURE);
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl,
    outputDir: testInfo.outputDir,
  });

  expect(result.totalFocusableElements).toBeGreaterThan(0);
  expect(result.elementsWithoutFocusStyle).toBeGreaterThan(0);
});
