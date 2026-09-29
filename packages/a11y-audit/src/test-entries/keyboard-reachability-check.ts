/**
 * Compatibility test entry for the keyboard reachability check (WCAG 2.1.1).
 *
 * Thin wrapper around `runKeyboardReachabilityCheck`. Target URL from
 * `TEST_PAGE`, output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). This
 * check owns its browser context (see runKeyboardReachabilityCheck).
 */

import { test } from '@playwright/test';
import { runKeyboardReachabilityCheck } from '../playwright/runKeyboardReachabilityCheck.js';

test('keyboard reachability check', async ({ browser }) => {
  await runKeyboardReachabilityCheck({ browser, screenshot: true });
});
