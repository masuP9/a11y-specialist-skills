/**
 * Compatibility test entry for the keyboard trap check (WCAG 2.1.2).
 *
 * Thin wrapper around `runKeyboardTrapCheck`. Target URL from `TEST_PAGE`,
 * output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). This check owns
 * its browser context (see runKeyboardTrapCheck).
 */

import { test } from '@playwright/test';
import { runKeyboardTrapCheck } from '../playwright/runKeyboardTrapCheck.js';

test('keyboard trap check', async ({ browser }) => {
  await runKeyboardTrapCheck({ browser, screenshot: true });
});
