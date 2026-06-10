/**
 * Auto-play Content Detection — WCAG 1.4.2 (Audio Control) / 2.2.2 (Pause, Stop, Hide)
 *
 * Takes screenshots at 2s intervals (0/2/4/6s), pixel-diffs consecutive frames,
 * detects whether visual content continues past 5s, finds pause/stop controls,
 * and verifies whether they work.
 *
 * The caller is responsible for navigating the page before calling this.
 *
 * IMPORTANT: this is the only check that needs `pixelmatch` + `pngjs` (declared
 * as optionalDependencies). To keep them out of the package barrel, the modules
 * that pull them (`utils/image-compare`, `detectors`) are imported LAZILY here,
 * so importing `@a11y-skills/audit/playwright` never requires the optional deps
 * unless `runAutoPlayDetection` is actually called.
 */

import * as path from 'node:path';
import type { Page } from '@playwright/test';
import type {
  ScreenshotRecord,
  ComparisonResult,
  AutoPlayDetectionResult,
  AutoPlayDetectionDetails,
} from '../types.js';
import {
  SCREENSHOT_INTERVALS,
  CHANGE_THRESHOLD,
  DEFAULT_AUTO_PLAY_OUTPUT_DIR,
  DETECTION_RESULT_FILENAME,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeAutoPlayDetection,
} from '../utils/axe-format.js';
import { generateRecommendation, printSummary } from '../utils/recommendations.js';

/** Capture screenshots at configured intervals. */
async function captureScreenshots(
  page: Page,
  outputDir: string
): Promise<ScreenshotRecord[]> {
  const screenshots: ScreenshotRecord[] = [];

  for (let i = 0; i < SCREENSHOT_INTERVALS.length; i++) {
    const current = SCREENSHOT_INTERVALS[i] ?? 0;
    if (i > 0) {
      const previous = SCREENSHOT_INTERVALS[i - 1] ?? 0;
      await page.waitForTimeout(current - previous);
    }

    const timeLabel = `${current / 1000}s`;
    const filename = `screenshot-${timeLabel}.png`;
    const filepath = path.join(outputDir, filename);

    await page.screenshot({ path: filepath, fullPage: false });

    screenshots.push({ time: timeLabel, path: filepath });
  }

  return screenshots;
}

export interface RunAutoPlayDetectionOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /**
   * Directory for screenshots, diffs, and the result JSON. Defaults to
   * `<A11Y_OUTPUT_DIR | cwd>/auto-play-screenshots`.
   */
  outputDir?: string;
  /** Significant-change threshold in percent (default: 0.1). */
  changeThreshold?: number;
}

/**
 * Run auto-play detection against the current page. Writes screenshots, diff
 * images, and `detection-result.json` into the output directory; returns the
 * result.
 *
 * @throws if the optional `pixelmatch` / `pngjs` deps are not installed.
 */
export async function runAutoPlayDetection(
  options: RunAutoPlayDetectionOptions
): Promise<AutoPlayDetectionResult> {
  const { page, changeThreshold = CHANGE_THRESHOLD } = options;
  const outputDir =
    options.outputDir ??
    path.join(
      process.env.A11Y_OUTPUT_DIR ?? process.cwd(),
      DEFAULT_AUTO_PLAY_OUTPUT_DIR
    );

  // Lazy-load the modules that depend on the optional pixelmatch/pngjs deps.
  let imageCompare: typeof import('../utils/image-compare.js');
  let detectors: typeof import('../detectors/index.js');
  try {
    imageCompare = await import('../utils/image-compare.js');
    detectors = await import('../detectors/index.js');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    // Only translate a genuine missing-optional-dep error; re-throw anything
    // else (e.g. a real bug inside image-compare/detectors) unchanged.
    if (code === 'ERR_MODULE_NOT_FOUND' || /pixelmatch|pngjs/.test(msg)) {
      throw new Error(
        'runAutoPlayDetection requires the optional dependencies `pixelmatch` and `pngjs`. ' +
          'Install them: `npm install pixelmatch pngjs`.\n' +
          `Original error: ${msg}`
      );
    }
    throw err;
  }

  const {
    compareImages,
    formatDiffPercent,
    hasSignificantChange,
    ensureOutputDir,
    saveJsonResult,
  } = imageCompare;
  const { detectPauseControls, verifyPauseControl, createSkippedVerification } =
    detectors;

  ensureOutputDir(outputDir);

  // Take screenshots at intervals.
  const screenshots = await captureScreenshots(page, outputDir);

  // Compare consecutive screenshots.
  const comparisons: ComparisonResult[] = [];
  let hasAnyChange = false;
  let hasChangeAfter5s = false;

  for (let i = 1; i < screenshots.length; i++) {
    const prev = screenshots[i - 1];
    const curr = screenshots[i];
    if (!prev || !curr) continue;

    const diffPath = path.join(outputDir, `diff-${prev.time}-vs-${curr.time}.png`);
    const { diffPixels, totalPixels, diffPercent } = compareImages(
      prev.path,
      curr.path,
      diffPath
    );
    const hasChange = hasSignificantChange(diffPercent, changeThreshold);

    if (hasChange) {
      hasAnyChange = true;
      if ((SCREENSHOT_INTERVALS[i] ?? 0) > 5000) {
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

  const stopsWithin5Seconds = hasAnyChange && !hasChangeAfter5s;

  // Detect and verify pause controls.
  const pauseControls = await detectPauseControls(page);

  let pauseVerification;
  if (hasAnyChange && !stopsWithin5Seconds && pauseControls.found) {
    pauseVerification = await verifyPauseControl(
      page,
      pauseControls,
      outputDir,
      changeThreshold
    );
  } else {
    let reason: string;
    if (!hasAnyChange) {
      reason = 'No auto-play detected';
    } else if (stopsWithin5Seconds) {
      reason = 'Content stops within 5 seconds';
    } else {
      reason = 'No pause controls found';
    }
    pauseVerification = createSkippedVerification(reason);
  }

  const details: AutoPlayDetectionDetails = {
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

  const result: AutoPlayDetectionResult = buildAuditResult({
    source: 'auto-play-detection',
    url: page.url(),
    details,
    buckets: normalizeAutoPlayDetection(details),
  });

  console.log('\n=== Auto-play Detection Results ===\n');
  console.log(JSON.stringify(result, null, 2));

  saveJsonResult(path.join(outputDir, DETECTION_RESULT_FILENAME), result);

  printSummary(
    { hasAutoPlayContent: hasAnyChange, stopsWithin5Seconds, pauseControls, pauseVerification },
    outputDir
  );

  return result;
}
