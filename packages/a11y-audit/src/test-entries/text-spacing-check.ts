/**
 * Compatibility test entry for the text spacing check (WCAG 1.4.12).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/text-spacing-check";`
 */

import { test } from '@playwright/test';
import { runTextSpacingCheck } from '../playwright/runTextSpacingCheck.js';
import { requireTargetUrl } from '../utils/test-harness.js';
import { gotoAndSettle } from '../playwright/gotoAndSettle.js';

test('text spacing check (WCAG 1.4.12)', async ({ page }) => {
  await gotoAndSettle(page, requireTargetUrl());
  await runTextSpacingCheck({ page, screenshot: true });
});
