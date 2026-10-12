/**
 * Focus cues made only of a border color change or an added underline have
 * to count as a focus style, not as "no computed-style change".
 */

import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

test('フォーカスで border の色だけが変わるボタンは hasFocusStyle が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/border-and-underline-only.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.hasFocusStyle).toBe(true);
});

test('フォーカスで下線だけが付くリンクは hasFocusStyle が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/border-and-underline-only.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.hasFocusStyle).toBe(true);
});
