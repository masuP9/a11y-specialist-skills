/**
 * Function API for the WCAG audit checks.
 *
 * Import these to wire the checks into your own Playwright tests:
 *
 * ```ts
 * import { runAxeAudit } from "@a11y-skills/audit/playwright";
 *
 * test("axe", async ({ page }, testInfo) => {
 *   await page.goto(url);
 *   await runAxeAudit({ page, outputDir: testInfo.outputDir });
 * });
 * ```
 */

export { runAxeAudit, type RunAxeAuditOptions } from './runAxeAudit.js';
export {
  runFocusIndicatorCheck,
  type RunFocusIndicatorCheckOptions,
} from './runFocusIndicatorCheck.js';
export { runReflowCheck, type RunReflowCheckOptions } from './runReflowCheck.js';
export {
  runTargetSizeCheck,
  type RunTargetSizeCheckOptions,
} from './runTargetSizeCheck.js';

export {
  resolveOutputPath,
  type OutputLocationOptions,
} from '../utils/test-harness.js';
