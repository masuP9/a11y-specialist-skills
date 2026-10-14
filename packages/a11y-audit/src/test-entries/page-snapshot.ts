/**
 * Compatibility test entry for the page snapshot (material only, no verdict).
 *
 * Thin wrapper around `runPageSnapshot`. Target URL from `TEST_PAGE`, output
 * dir from `A11Y_OUTPUT_DIR` (falling back to cwd). The check navigates the
 * page itself so it can record the requested URL.
 */

import { test } from '@playwright/test';
import { runPageSnapshot } from '../playwright/runPageSnapshot.js';
import { requireTargetUrl } from '../utils/test-harness.js';

test('page snapshot', async ({ page }) => {
  await runPageSnapshot({ page, targetUrl: requireTargetUrl() });
});
