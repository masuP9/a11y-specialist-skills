/**
 * Axe-core Accessibility Audit (broad WCAG coverage)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import { runAxeAudit, getTargetUrl } from '@a11y-skills/audit/playwright';

test('axe-core accessibility audit', async ({ page }) => {
  await page.goto(getTargetUrl('?preset=ng-terrible1&wcagver=22'), {
    waitUntil: 'networkidle',
  });
  await runAxeAudit({ page });
});
