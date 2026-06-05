/**
 * Orientation Check (WCAG 1.3.4)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import { runOrientationCheck, getTargetUrl } from '@a11y-skills/audit/playwright';

test('orientation check (WCAG 1.3.4)', async ({ page }) => {
  // runOrientationCheck owns navigation (loads the page at two viewports).
  await runOrientationCheck({
    page,
    targetUrl: getTargetUrl('?preset=ok-aa'),
    screenshot: true,
  });
});
