/**
 * Compatibility test entry for the reflow check (WCAG 1.4.10).
 *
 * Thin wrapper around `runReflowCheck`. Target URL from `TEST_PAGE`,
 * output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). Sets the narrow
 * viewport before navigation to match the legacy script behavior, and captures
 * the legacy screenshot.
 */

import { test } from '@playwright/test';
import { runReflowCheck } from '../playwright/runReflowCheck.js';
import { requireTargetUrl } from '../utils/test-harness.js';
import { REFLOW_VIEWPORT } from '../constants.js';

test('reflow check (WCAG 1.4.10)', async ({ page }) => {
  await page.setViewportSize({
    width: REFLOW_VIEWPORT.width,
    height: REFLOW_VIEWPORT.height,
  });
  const targetUrl = requireTargetUrl();
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await runReflowCheck({ page, screenshot: true });
});
