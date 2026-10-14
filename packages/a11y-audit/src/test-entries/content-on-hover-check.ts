/**
 * Compatibility test entry for the content on hover or focus check (WCAG 1.4.13).
 *
 * Thin wrapper around `runContentOnHoverCheck`. Target URL from `TEST_PAGE`,
 * output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). This check owns its
 * browser context (see runContentOnHoverCheck).
 */

import { test } from '@playwright/test';
import { runContentOnHoverCheck } from '../playwright/runContentOnHoverCheck.js';

test('content on hover or focus check', async ({ browser }) => {
  // The check's own budget is 120 s, longer than Playwright's default 30 s.
  test.setTimeout(240_000);
  await runContentOnHoverCheck({ browser });
});
