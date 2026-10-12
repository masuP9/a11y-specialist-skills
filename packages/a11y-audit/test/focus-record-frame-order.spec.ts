/**
 * tabStep and id are numbered on the Node side, so they run on across
 * documents: an element in an iframe gets the Tab press that moved focus to it,
 * and ids never repeat between the main page and its iframes.
 */

import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

async function runOnFramesPage(
  browser: Parameters<typeof runFocusIndicatorCheck>[0]['browser'],
  baseUrl: string,
  outputDir: string,
) {
  const childUrl = `${baseUrl.replace('127.0.0.1', 'localhost')}/focus-indicator/frame-child.html`;
  return runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/frames-and-shadow.html?child=${encodeURIComponent(childUrl)}`,
    outputDir,
    quiet: true,
  });
}

test('主フレームから iframe の中へ、また主フレームへ Tab で移っても、すべての要素の tabStep が Tab を押した回数どおりに付く', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const steps = result.details.allElements.map((r) => [r.name, r.tabStep]);
  expect(steps).toEqual([
    ['Outside', 1],
    ['Inside same-origin', 2],
    ['Inside cross-origin', 3],
    ['Inside shadow', 4],
    ['Shadow plain', 5],
  ]);
});

test('主フレームと iframe の要素の id は、記録された順に 0 から重ならずに増える', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const ids = result.details.allElements.map((r) => r.id);
  expect(ids).toEqual([0, 1, 2, 3, 4]);
});
