/**
 * Compatibility test entry for the autocomplete audit (WCAG 1.3.5).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/autocomplete-audit";`
 */

import { test } from '@playwright/test';
import { runAutocompleteAudit } from '../playwright/runAutocompleteAudit.js';
import { requireTargetUrl } from '../utils/test-harness.js';
import { gotoAndSettle } from '../playwright/gotoAndSettle.js';

test('autocomplete audit (WCAG 1.3.5)', async ({ page }) => {
  await gotoAndSettle(page, requireTargetUrl());
  await runAutocompleteAudit({ page });
});
