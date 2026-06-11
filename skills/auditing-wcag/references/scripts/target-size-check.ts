/**
 * Target Size Check (WCAG 2.5.5 / 2.5.8)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import {
  runTargetSizeCheck,
  getTargetUrl,
} from '@a11y-skills/audit/playwright';

test('target size check (WCAG 2.5.5 / 2.5.8)', async ({ page }) => {
  await page.goto(getTargetUrl('?preset=ng-terrible1&wcagver=22'), {
    waitUntil: 'networkidle',
  });
  await runTargetSizeCheck({ page, screenshot: true });
});
