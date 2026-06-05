/**
 * Compatibility test entry for the target size check (WCAG 2.5.5 / 2.5.8).
 *
 * Thin wrapper around `runTargetSizeCheck`. Target URL from `TEST_PAGE`,
 * output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). Captures the legacy
 * annotated screenshot.
 */

import { test } from '@playwright/test';
import { runTargetSizeCheck } from '../playwright/runTargetSizeCheck.js';
import { requireTargetUrl } from '../utils/test-harness.js';

test('target size check (WCAG 2.5.5 / 2.5.8)', async ({ page }) => {
  const targetUrl = requireTargetUrl();
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await runTargetSizeCheck({ page, screenshot: true });
});
