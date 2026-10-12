/**
 * Compatibility test entry for the change on input check (WCAG 3.2.2).
 *
 * Thin wrapper around `runChangeOnInputCheck`. Target URL from `TEST_PAGE`,
 * output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). This check owns its
 * browser context (see runChangeOnInputCheck).
 */

import { test } from '@playwright/test';
import { runChangeOnInputCheck } from '../playwright/runChangeOnInputCheck.js';

test('change on input check', async ({ browser }) => {
  await runChangeOnInputCheck({ browser });
});
