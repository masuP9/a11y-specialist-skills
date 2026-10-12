/**
 * Compatibility test entry for the accessible authentication check (WCAG 3.3.8).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/accessible-authentication-check";`
 */

import { test } from '@playwright/test';
import { runAccessibleAuthenticationCheck } from '../playwright/runAccessibleAuthenticationCheck.js';
import { requireTargetUrl } from '../utils/test-harness.js';
import { gotoAndSettle } from '../playwright/gotoAndSettle.js';

test('accessible authentication check (WCAG 3.3.8)', async ({ page }) => {
  await gotoAndSettle(page, requireTargetUrl());
  await runAccessibleAuthenticationCheck({ page });
});
