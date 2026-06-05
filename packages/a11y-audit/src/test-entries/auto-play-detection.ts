/**
 * Compatibility test entry for auto-play detection (WCAG 1.4.2 / 2.2.2).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/auto-play-detection";`
 *
 * Requires the optional `pixelmatch` + `pngjs` deps.
 */

import { test } from '@playwright/test';
import { runAutoPlayDetection } from '../playwright/runAutoPlayDetection.js';
import { requireTargetUrl } from '../utils/test-harness.js';

test('auto-play content detection', async ({ page }) => {
  await page.goto(requireTargetUrl(), { waitUntil: 'networkidle' });
  await runAutoPlayDetection({ page });
});
