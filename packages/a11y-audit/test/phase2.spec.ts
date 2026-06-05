/**
 * Smoke tests for the Phase 2 checks (imported from built dist).
 * Each fixture is crafted to exercise the check; the timing-heavy ones
 * (time-limit, auto-play) use lenient but meaningful assertions.
 */

import { test, expect } from '@playwright/test';
import {
  runTextSpacingCheck,
  runZoomCheck,
  runOrientationCheck,
  runAutocompleteAudit,
  runTimeLimitDetector,
  runAutoPlayDetection,
} from '../dist/playwright/index.js';

const dataUrl = (html: string) =>
  'data:text/html,' + encodeURIComponent(html);

test('runTextSpacingCheck runs and returns a result shape', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>
    <style>.box{width:80px;height:20px;overflow:hidden;white-space:nowrap}</style></head>
    <body><div class="box">spacing sensitive text content here</div></body></html>`);
  const result = await runTextSpacingCheck({ page, outputDir: testInfo.outputDir });
  expect(typeof result.totalElementsChecked).toBe('number');
  expect(Array.isArray(result.clippedElements)).toBe(true);
});

test('runZoomCheck detects horizontal scroll at 200%', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>
    <style>body{margin:0}.wide{width:900px;height:40px;background:#06c}</style></head>
    <body><div class="wide">wide</div></body></html>`);
  const result = await runZoomCheck({ page, outputDir: testInfo.outputDir });
  expect(result.zoomFactor).toBe(2);
  expect(
    result.hasHorizontalScroll || result.clippedElements.length > 0
  ).toBe(true);
});

test('runOrientationCheck detects a rotate-device lock message', async ({
  page,
}, testInfo) => {
  const url = dataUrl(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><p>Please rotate your device to continue.</p><main>content</main></body></html>`);
  const result = await runOrientationCheck({
    page,
    targetUrl: url,
    outputDir: testInfo.outputDir,
  });
  expect(result.hasOrientationLock).toBe(true);
});

test('runAutocompleteAudit flags a missing autocomplete', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><form><label for="e">Email</label><input id="e" name="email" type="text"></form></body></html>`);
  const result = await runAutocompleteAudit({ page, outputDir: testInfo.outputDir });
  expect(result.totalFieldsChecked).toBeGreaterThan(0);
  expect(result.missingAutocomplete.length).toBeGreaterThan(0);
});

test('runTimeLimitDetector detects a meta refresh', async ({
  page,
}, testInfo) => {
  const url = dataUrl(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta http-equiv="refresh" content="30"><title>t</title></head><body>hi</body></html>`);
  const result = await runTimeLimitDetector({
    page,
    targetUrl: url,
    settleMs: 200,
    outputDir: testInfo.outputDir,
  });
  expect(result.hasTimeLimits).toBe(true);
  expect(result.metaRefresh.length).toBeGreaterThan(0);
});

test('runAutoPlayDetection reports no change on a static page', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><p>static content, no animation</p></body></html>`);
  const result = await runAutoPlayDetection({
    page,
    outputDir: testInfo.outputDir,
  });
  expect(result.hasAutoPlayContent).toBe(false);
  expect(typeof result.recommendation).toBe('string');
});
