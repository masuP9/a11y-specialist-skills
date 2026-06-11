/**
 * Auto-play Content Detection (WCAG 1.4.2 / 2.2.2)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * Needs the optional `pixelmatch` + `pngjs` deps (installed transitively with
 * @a11y-skills/audit). See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import {
  runAutoPlayDetection,
  getTargetUrl,
} from '@a11y-skills/audit/playwright';

test('auto-play content detection', async ({ page }) => {
  await page.goto(getTargetUrl('?preset=ng-terrible1&wcagver=22'), {
    waitUntil: 'networkidle',
  });
  await runAutoPlayDetection({ page });
});
