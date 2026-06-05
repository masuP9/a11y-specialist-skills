/**
 * Compatibility test entry for the zoom 200% check (WCAG 1.4.4).
 * Run from a one-line local spec: `import "@a11y-skills/audit/test-entries/zoom-200-check";`
 */

import { test } from '@playwright/test';
import { runZoomCheck } from '../playwright/runZoomCheck.js';
import { requireTargetUrl } from '../utils/test-harness.js';

test('zoom 200% check (WCAG 1.4.4)', async ({ page }) => {
  // Let runZoomCheck navigate so the base viewport is applied before load.
  await runZoomCheck({ page, targetUrl: requireTargetUrl(), screenshot: true });
});
