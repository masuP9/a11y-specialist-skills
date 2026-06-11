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

const dataUrl = (html: string) => 'data:text/html,' + encodeURIComponent(html);

test('runTextSpacingCheck returns the normalized envelope', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>
    <style>.box{width:80px;height:20px;overflow:hidden;white-space:nowrap}</style></head>
    <body><div class="box">spacing sensitive text content here</div></body></html>`);
  const result = await runTextSpacingCheck({
    page,
    outputDir: testInfo.outputDir,
  });
  expect(result.source).toBe('text-spacing-check');
  expect(typeof result.details.totalElementsChecked).toBe('number');
  expect(Array.isArray(result.details.clippedElements)).toBe(true);
  // text-spacing clipping is the SC's own mechanical test → violations bucket
  if (result.details.clippedElements.length > 0) {
    expect(result.violations.map((r) => r.id)).toContain(
      'a11y-skills/text-spacing',
    );
  }
});

test('runZoomCheck reports horizontal scroll at 200% as incomplete', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>
    <style>body{margin:0}.wide{width:900px;height:40px;background:#06c}</style></head>
    <body><div class="wide">wide</div></body></html>`);
  const result = await runZoomCheck({ page, outputDir: testInfo.outputDir });
  expect(result.details.zoomFactor).toBe(2);
  expect(
    result.details.hasHorizontalScroll ||
      result.details.clippedElements.length > 0,
  ).toBe(true);
  expect(result.violations).toEqual([]);
  expect(result.incomplete.map((r) => r.id)).toContain(
    'a11y-skills/resize-text',
  );
});

test('runOrientationCheck reports a rotate-device lock as incomplete', async ({
  page,
}, testInfo) => {
  const url =
    dataUrl(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><p>Please rotate your device to continue.</p><main>content</main></body></html>`);
  const result = await runOrientationCheck({
    page,
    targetUrl: url,
    outputDir: testInfo.outputDir,
  });
  expect(result.details.hasOrientationLock).toBe(true);
  const lock = result.incomplete.find(
    (r) => r.id === 'a11y-skills/orientation-lock',
  );
  expect(lock).toBeDefined();
  // page-level finding
  expect(lock!.nodes[0].target).toEqual(['html']);
});

test('runAutocompleteAudit flags a missing autocomplete as incomplete', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><form><label for="e">Email</label><input id="e" name="email" type="text"></form></body></html>`);
  const result = await runAutocompleteAudit({
    page,
    outputDir: testInfo.outputDir,
  });
  expect(result.details.totalFieldsChecked).toBeGreaterThan(0);
  expect(result.details.missingAutocomplete.length).toBeGreaterThan(0);
  const missing = result.incomplete.find(
    (r) => r.id === 'a11y-skills/autocomplete-missing',
  );
  expect(missing).toBeDefined();
  expect(missing!.nodes[0].html).toContain('input');
});

test('runTimeLimitDetector reports a meta refresh as incomplete', async ({
  page,
}, testInfo) => {
  const url =
    dataUrl(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta http-equiv="refresh" content="30"><title>t</title></head><body>hi</body></html>`);
  const result = await runTimeLimitDetector({
    page,
    targetUrl: url,
    settleMs: 200,
    outputDir: testInfo.outputDir,
  });
  expect(result.details.hasTimeLimits).toBe(true);
  expect(result.details.metaRefresh.length).toBeGreaterThan(0);
  // meta refresh needs an adjustability/exception check → incomplete
  expect(result.violations).toEqual([]);
  expect(result.incomplete.map((r) => r.id)).toContain(
    'a11y-skills/meta-refresh',
  );
});

test('runAutoPlayDetection passes on a static page', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><p>static content, no animation</p></body></html>`);
  const result = await runAutoPlayDetection({
    page,
    outputDir: testInfo.outputDir,
  });
  expect(result.details.hasAutoPlayContent).toBe(false);
  expect(typeof result.details.recommendation).toBe('string');
  expect(result.passes.map((r) => r.id)).toContain('a11y-skills/auto-play');
});
