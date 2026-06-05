/**
 * Reflow Check (WCAG 1.4.10)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import { runReflowCheck, getTargetUrl } from '@a11y-skills/audit/playwright';
import { REFLOW_VIEWPORT } from '@a11y-skills/audit';

test('reflow check (WCAG 1.4.10)', async ({ page }) => {
  // Narrow the viewport before navigation to match the legacy script.
  await page.setViewportSize({
    width: REFLOW_VIEWPORT.width,
    height: REFLOW_VIEWPORT.height,
  });
  await page.goto(getTargetUrl('?preset=1.4.4-text-size'), {
    waitUntil: 'networkidle',
  });
  await runReflowCheck({ page, screenshot: true });
});
