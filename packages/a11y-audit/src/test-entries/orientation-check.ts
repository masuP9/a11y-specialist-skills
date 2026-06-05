/**
 * Compatibility test entry for the orientation check (WCAG 1.3.4).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/orientation-check";`
 *
 * This check owns navigation (it loads the page at two viewports), so the
 * target URL comes from `TEST_PAGE` via the function.
 */

import { test } from '@playwright/test';
import { runOrientationCheck } from '../playwright/runOrientationCheck.js';

test('orientation check (WCAG 1.3.4)', async ({ page }) => {
  await runOrientationCheck({ page, screenshot: true });
});
