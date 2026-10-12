/**
 * Compatibility test entry for the redundant entry check (WCAG 3.3.7).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/redundant-entry-check";`
 */

import { test } from '@playwright/test';
import { runRedundantEntryCheck } from '../playwright/runRedundantEntryCheck.js';
import { requireTargetUrl } from '../utils/test-harness.js';
import { gotoAndSettle } from '../playwright/gotoAndSettle.js';

test('redundant entry check (WCAG 3.3.7)', async ({ page }) => {
  await gotoAndSettle(page, requireTargetUrl());
  await runRedundantEntryCheck({ page });
});
