/**
 * Compatibility test entry for the motion actuation check (WCAG 2.5.4).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/motion-actuation-check";`
 */

import { test } from '@playwright/test';
import { runMotionActuationCheck } from '../playwright/runMotionActuationCheck.js';
import { requireTargetUrl } from '../utils/test-harness.js';
import { gotoAndSettle } from '../playwright/gotoAndSettle.js';

test('motion actuation check (WCAG 2.5.4)', async ({ page }) => {
  await gotoAndSettle(page, requireTargetUrl());
  await runMotionActuationCheck({ page });
});
