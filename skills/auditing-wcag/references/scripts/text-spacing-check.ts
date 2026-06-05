/**
 * Text Spacing Check (WCAG 1.4.12)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import { runTextSpacingCheck, getTargetUrl } from '@a11y-skills/audit/playwright';

test('text spacing check (WCAG 1.4.12)', async ({ page }) => {
  await page.goto(getTargetUrl('?preset=1.4.4-text-size'), {
    waitUntil: 'networkidle',
  });
  await runTextSpacingCheck({ page, screenshot: true });
});
