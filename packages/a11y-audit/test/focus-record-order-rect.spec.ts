/**
 * FocusRecord carries the Tab press that moved focus to the element (tabStep)
 * and the element's rectangle in page coordinates at that moment (rect).
 */

import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

test('records tabStep 1, 2, 3 in Tab order', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/tab-order-positions.html`,
    outputDir: testInfo.outputDir,
  });

  const steps = result.details.allElements.map((r) => [r.selector, r.tabStep]);
  expect(steps).toEqual([
    ['#first', 1],
    ['#second', 2],
    ['#third', 3],
  ]);
});

test('records rect in page coordinates, including an element that needs scrolling', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/tab-order-positions.html`,
    outputDir: testInfo.outputDir,
  });

  // Buttons are border-box, so 120x40 includes the border.
  const rects = result.details.allElements.map((r) => [r.selector, r.rect]);
  expect(rects).toEqual([
    ['#first', { x: 20, y: 30, width: 120, height: 40 }],
    ['#second', { x: 200, y: 90, width: 120, height: 40 }],
    ['#third', { x: 60, y: 2000, width: 120, height: 40 }],
  ]);
});

test('records tabStep null for an element focused by autofocus', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/autofocus-then-tab.html`,
    outputDir: testInfo.outputDir,
  });

  const steps = result.details.allElements.map((r) => [r.selector, r.tabStep]);
  expect(steps).toEqual([
    ['#auto', null],
    ['#next', 1],
  ]);
});
