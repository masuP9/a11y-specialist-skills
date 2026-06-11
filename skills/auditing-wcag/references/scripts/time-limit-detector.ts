/**
 * Time Limit Detector (WCAG 2.2.1)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import {
  runTimeLimitDetector,
  getTargetUrl,
} from '@a11y-skills/audit/playwright';

test('time limit detector (WCAG 2.2.1)', async ({ page }) => {
  // runTimeLimitDetector owns navigation (installs a timer hook before goto).
  await runTimeLimitDetector({
    page,
    targetUrl: getTargetUrl('?criteria=2.2.1'),
  });
});
