/**
 * Compatibility test entry for the pointer gesture check (WCAG 2.5.1 / 2.5.7).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/pointer-gesture-check";`
 */

import { test } from '@playwright/test';
import { runPointerGestureCheck } from '../playwright/runPointerGestureCheck.js';
import { requireTargetUrl } from '../utils/test-harness.js';
import { gotoAndSettle } from '../playwright/gotoAndSettle.js';

test('pointer gesture check (WCAG 2.5.1 / 2.5.7)', async ({ page }) => {
  await gotoAndSettle(page, requireTargetUrl());
  await runPointerGestureCheck({ page });
});
