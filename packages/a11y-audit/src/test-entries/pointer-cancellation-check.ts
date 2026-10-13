/**
 * Compatibility test entry for the pointer cancellation check (WCAG 2.5.2).
 *
 * Thin wrapper around `runPointerCancellationCheck`. Target URL from
 * `TEST_PAGE`, output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). This
 * check owns its browser context (see runPointerCancellationCheck).
 */

import { test } from '@playwright/test';
import { runPointerCancellationCheck } from '../playwright/runPointerCancellationCheck.js';

test('pointer cancellation check', async ({ browser }) => {
  // The check's own budget is 60 s, longer than Playwright's default 30 s.
  test.setTimeout(180_000);
  await runPointerCancellationCheck({ browser });
});
