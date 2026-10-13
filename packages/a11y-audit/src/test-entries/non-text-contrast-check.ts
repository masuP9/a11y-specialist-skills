import { test } from '@playwright/test';
import { runNonTextContrastCheck } from '../playwright/runNonTextContrastCheck.js';
import { requireTargetUrl } from '../utils/test-harness.js';
import { gotoAndSettle } from '../playwright/gotoAndSettle.js';

test('non-text contrast check (WCAG 1.4.11)', async ({ page }) => {
  await gotoAndSettle(page, requireTargetUrl());
  await runNonTextContrastCheck({ page });
});
