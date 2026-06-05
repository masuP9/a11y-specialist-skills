/**
 * Autocomplete Audit (WCAG 1.3.5)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import { runAutocompleteAudit, getTargetUrl } from '@a11y-skills/audit/playwright';

test('autocomplete audit (WCAG 1.3.5)', async ({ page }) => {
  await page.goto(getTargetUrl('?preset=3.3-input-assist'), {
    waitUntil: 'networkidle',
  });
  await runAutocompleteAudit({ page });
});
