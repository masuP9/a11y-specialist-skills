/**
 * Compatibility test entry for the time limit detector (WCAG 2.2.1).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/time-limit-detector";`
 *
 * This check installs a timer hook before navigation, so it owns navigation;
 * the target URL comes from `TEST_PAGE` via the function.
 */

import { test } from '@playwright/test';
import { runTimeLimitDetector } from '../playwright/runTimeLimitDetector.js';

test('time limit detector (WCAG 2.2.1)', async ({ page }) => {
  await runTimeLimitDetector({ page });
});
