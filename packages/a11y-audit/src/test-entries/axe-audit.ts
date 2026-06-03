/**
 * Compatibility test entry for the axe audit.
 *
 * Use via Playwright `testMatch`:
 *   testMatch: ["**\/node_modules/@masup9/a11y-audit/dist/test-entries/*.js"]
 *
 * Target URL comes from the `TEST_PAGE` env var; output dir from
 * `A11Y_OUTPUT_DIR` (falling back to cwd). This is a thin wrapper around
 * `runAxeAudit` — all logic lives there.
 */

import { test } from '@playwright/test';
import { runAxeAudit } from '../playwright/runAxeAudit.js';
import { requireTargetUrl } from '../utils/test-harness.js';

test('axe-core accessibility audit', async ({ page }) => {
  const targetUrl = requireTargetUrl();
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await runAxeAudit({ page });
});
