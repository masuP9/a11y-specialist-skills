/**
 * Compatibility test entry for the focus indicator check
 * (WCAG 2.4.7 / 2.4.12 / 3.2.1).
 *
 * Thin wrapper around `runFocusIndicatorCheck`. Target URL from `TEST_PAGE`,
 * output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). Captures the legacy
 * screenshot. This check owns its browser context (see runFocusIndicatorCheck).
 */

import { test } from '@playwright/test';
import { runFocusIndicatorCheck } from '../playwright/runFocusIndicatorCheck.js';

test('focus indicator visibility', async ({ browser }) => {
  await runFocusIndicatorCheck({ browser, screenshot: true });
});
