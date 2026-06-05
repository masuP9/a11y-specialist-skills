/**
 * Focus Indicator Visibility Check (WCAG 2.4.7 / 2.4.12 / 3.2.1)
 *
 * Thin wrapper — the implementation lives in `@a11y-skills/audit`.
 * See ./NPM-PACKAGE-NOTE.md.
 */

import { test } from '@playwright/test';
import {
  runFocusIndicatorCheck,
  getTargetUrl,
} from '@a11y-skills/audit/playwright';

// This check owns its browser context (it does not inherit the config baseURL),
// so the default must be an absolute URL.
const DEFAULT_URL =
  'https://a11yc.com/city-komaru/practice/?preset=ng-terrible1&wcagver=22';

test('focus indicator visibility', async ({ browser }) => {
  await runFocusIndicatorCheck({
    browser,
    targetUrl: getTargetUrl(DEFAULT_URL),
    screenshot: true,
  });
});
