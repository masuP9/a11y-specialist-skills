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
  runTextSpacingCheck,
  type RunTextSpacingCheckOptions,
} from './runTextSpacingCheck.js';
export { runZoomCheck, type RunZoomCheckOptions } from './runZoomCheck.js';
export {
  runOrientationCheck,
  type RunOrientationCheckOptions,
} from './runOrientationCheck.js';
export {
  runAutocompleteAudit,
  type RunAutocompleteAuditOptions,
} from './runAutocompleteAudit.js';
export {
  runTimeLimitDetector,
  type RunTimeLimitDetectorOptions,
} from './runTimeLimitDetector.js';
export {
  runAutoPlayDetection,
  type RunAutoPlayDetectionOptions,
} from './runAutoPlayDetection.js';

export {
  resolveOutputPath,
  getTargetUrl,
  requireTargetUrl,
  type OutputLocationOptions,
} from '../utils/test-harness.js';
