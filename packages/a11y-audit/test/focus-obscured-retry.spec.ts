/**
 * A 3.2.1 violation makes runFocusIndicatorCheck retry in a fresh context.
 * Elements before the violating one are focused again on every attempt, so
 * their 2.4.11 / 2.4.12 (focus not obscured) records must not pile up across attempts.
 */

import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

test('runFocusIndicatorCheck records an obscured element once when it precedes an element that forces a retry', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/focus-obscured-with-retry.html`,
    outputDir: testInfo.outputDir,
  });

  // Guard: the retry actually happened.
  expect(result.details.onFocusViolations).toHaveLength(1);

  expect(result.details.elementsWithObscuredFocus).toBe(1);
  expect(result.details.focusObscuredIssues).toHaveLength(1);
});
