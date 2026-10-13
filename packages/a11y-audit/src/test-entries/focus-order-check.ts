/**
 * Compatibility test entry for the focus order check (WCAG 2.4.3).
 *
 * Thin wrapper around `runFocusOrderCheck`. Target URL from `TEST_PAGE`,
 * output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). This check owns its
 * browser context (see runFocusOrderCheck).
 */

import { test } from '@playwright/test';
import { runFocusOrderCheck } from '../playwright/runFocusOrderCheck.js';

test('focus order check', async ({ browser }) => {
  await runFocusOrderCheck({ browser });
});
