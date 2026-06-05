/**
 * Zoom 200% Check (WCAG 1.4.4)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import { runZoomCheck, getTargetUrl } from '@a11y-skills/audit/playwright';

test('zoom 200% check (WCAG 1.4.4)', async ({ page }) => {
  // runZoomCheck owns navigation (sets the base viewport before goto).
  await runZoomCheck({
    page,
    targetUrl: getTargetUrl('?preset=1.4.4-text-size'),
    screenshot: true,
  });
});
