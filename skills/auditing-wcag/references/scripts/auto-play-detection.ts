/**
 * Auto-play Content Detection
 *
 * WCAG 1.4.2 (Audio Control) / 2.2.2 (Pause, Stop, Hide)
 *
 * This script:
 * 1. Takes screenshots at 2-second intervals (0s, 2s, 4s, 6s)
 * 2. Uses pixel-level diff detection for accurate comparison
 * 3. Detects if content continues beyond 5 seconds
 * 4. Detects pause/stop controls in the page
 * 5. Verifies if pause controls actually work
 * 6. Reports findings with recommendations
 *
 * Note: This detects VISUAL changes only (carousels, animations, video).
 * Audio auto-play requires manual verification.
 *
 * Dependencies:
 *   npm install pixelmatch pngjs
 */

import { test } from '@playwright/test';
import * as path from 'path';
import type { ScreenshotRecord, ComparisonResult, AutoPlayDetectionResult } from './types';
import {
  SCREENSHOT_INTERVALS,
  CHANGE_THRESHOLD,
  DEFAULT_AUTO_PLAY_OUTPUT_DIR,
  DETECTION_RESULT_FILENAME,
} from './constants';
import {
  compareImages,
  formatDiffPercent,
  hasSignificantChange,
  ensureOutputDir,
  saveJsonResult,
  generateRecommendation,
  printSummary,
} from './utils';
import {
  detectPauseControls,
  verifyPauseControl,
  createSkippedVerification,
} from './detectors';

test('auto-play content detection', async ({ page }) => {
  const targetUrl = process.env.TEST_PAGE || '?preset=ng-terrible1&wcagver=22';
  const outputDir = DEFAULT_AUTO_PLAY_OUTPUT_DIR;

  ensureOutputDir(outputDir);

  // Navigate to target page
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  // Take screenshots at intervals
  const screenshots = await captureScreenshots(page, outputDir);

  // Compare consecutive screenshots
  const { comparisons, hasAnyChange, hasChangeAfter5s } = analyzeChanges(screenshots, outputDir);

  // Determine if content stops within 5 seconds
  const stopsWithin5Seconds = hasAnyChange && !hasChangeAfter5s;

  // Detect and verify pause controls
  const pauseControls = await detectPauseControls(page);
  const pauseVerification = await getPauseVerification(
    page, hasAnyChange, stopsWithin5Seconds, pauseControls, outputDir
  );

  // Generate result
  const result: AutoPlayDetectionResult = {
    url: page.url(),
    screenshotRecords: screenshots,
    comparisons,
    hasAutoPlayContent: hasAnyChange,
    stopsWithin5Seconds,
    pauseControls,
    pauseVerification,
    recommendation: generateRecommendation({
      hasAutoPlayContent: hasAnyChange,
      stopsWithin5Seconds,
      pauseControls,
      pauseVerification,
    }),
  };

  // Output results
  console.log('\n=== Auto-play Detection Results ===\n');
  console.log(JSON.stringify(result, null, 2));

  saveJsonResult(path.join(outputDir, DETECTION_RESULT_FILENAME), result);

  printSummary(
    { hasAutoPlayContent: hasAnyChange, stopsWithin5Seconds, pauseControls, pauseVerification },
    outputDir
  );
});

/**
 * Capture screenshots at configured intervals
 */
async function captureScreenshots(
  page: import('@playwright/test').Page,
  outputDir: string
): Promise<ScreenshotRecord[]> {
  const screenshots: ScreenshotRecord[] = [];

  for (let i = 0; i < SCREENSHOT_INTERVALS.length; i++) {
    if (i > 0) {
      await page.waitForTimeout(SCREENSHOT_INTERVALS[i] - SCREENSHOT_INTERVALS[i - 1]);
    }

    const timeLabel = `${SCREENSHOT_INTERVALS[i] / 1000}s`;
    const filename = `screenshot-${timeLabel}.png`;
    const filepath = path.join(outputDir, filename);

    await page.screenshot({ path: filepath, fullPage: false });

    screenshots.push({ time: timeLabel, path: filepath });
  }

  return screenshots;
}

/**
 * Analyze changes between consecutive screenshots
 */
function analyzeChanges(
  screenshots: ScreenshotRecord[],
  outputDir: string
): { comparisons: ComparisonResult[]; hasAnyChange: boolean; hasChangeAfter5s: boolean } {
  const comparisons: ComparisonResult[] = [];
  let hasAnyChange = false;
  let hasChangeAfter5s = false;

  for (let i = 1; i < screenshots.length; i++) {
    const prev = screenshots[i - 1];
    const curr = screenshots[i];
    const diffPath = path.join(outputDir, `diff-${prev.time}-vs-${curr.time}.png`);

    const { diffPixels, totalPixels, diffPercent } = compareImages(prev.path, curr.path, diffPath);
    const hasChange = hasSignificantChange(diffPercent, CHANGE_THRESHOLD);

    if (hasChange) {
      hasAnyChange = true;
      if (SCREENSHOT_INTERVALS[i] > 5000) {
        hasChangeAfter5s = true;
      }
    }

    comparisons.push({
      compare: `${prev.time} vs ${curr.time}`,
      diffPixels,
      totalPixels,
      diffPercent: formatDiffPercent(diffPercent),
      hasChange,
    });
  }

  return { comparisons, hasAnyChange, hasChangeAfter5s };
}

/**
 * Get pause verification result based on detection state
 */
async function getPauseVerification(
  page: import('@playwright/test').Page,
  hasAnyChange: boolean,
  stopsWithin5Seconds: boolean,
  pauseControls: import('./types').PauseControlInfo,
  outputDir: string
) {
  if (hasAnyChange && !stopsWithin5Seconds && pauseControls.found) {
    return verifyPauseControl(page, pauseControls, outputDir, CHANGE_THRESHOLD);
  }

  // Determine why verification was skipped
  let reason: string;
  if (!hasAnyChange) {
    reason = 'No auto-play detected';
  } else if (stopsWithin5Seconds) {
    reason = 'Content stops within 5 seconds';
  } else {
    reason = 'No pause controls found';
  }

  return createSkippedVerification(reason);
}
