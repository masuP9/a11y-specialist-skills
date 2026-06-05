/**
 * Orientation Check — WCAG 1.3.4 (Orientation)
 *
 * Renders the page in portrait (375x667) and landscape (667x375), detecting
 * "rotate device" messages/overlays and whether the main content is hidden in
 * either orientation. Reports if the page restricts content to a specific
 * orientation.
 *
 * This function OWNS navigation: it sets each viewport then navigates to the
 * target URL for that orientation (two full navigations, not a reload), so the
 * page lays out fresh for each orientation.
 *
 * Limitations:
 * - Heuristics may miss CSS-only orientation restrictions
 * - Cannot detect JavaScript-based orientation detection without visual indicators
 * - Manual verification needed for exceptions (e.g., camera apps)
 */

import type { Page } from '@playwright/test';
import type { OrientationCheckResult, OrientationState } from '../types.js';
import {
  ORIENTATION_VIEWPORTS,
  ORIENTATION_LOCK_KEYWORDS,
  MAIN_CONTENT_SELECTORS,
  DEFAULT_ORIENTATION_RESULT_FILE,
  DEFAULT_ORIENTATION_PORTRAIT_SCREENSHOT_FILE,
  DEFAULT_ORIENTATION_LANDSCAPE_SCREENSHOT_FILE,
} from '../constants.js';
import {
  saveAuditResult,
  resolveOutputPath,
  takeAuditScreenshot,
  resolveScreenshotPath,
  requireTargetUrl,
  logAuditHeader,
  logOutputPaths,
  type OutputLocationOptions,
} from '../utils/test-harness.js';

interface OrientationCheckArgs {
  lockKeywords: readonly string[];
  mainContentSelectors: readonly string[];
}

/** Capture orientation state in browser context. */
function captureOrientationState(args: OrientationCheckArgs): OrientationState {
  const { lockKeywords, mainContentSelectors } = args;

  const bodyWidth = document.body.scrollWidth;
  const bodyHeight = document.body.scrollHeight;
  const visibleText = document.body.innerText || '';
  const visibleTextLength = visibleText.length;
  const lowerText = visibleText.toLowerCase();

  // Search for lock message keywords
  let lockMessageFound = false;
  let lockMessageText: string | null = null;

  for (const keyword of lockKeywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      lockMessageFound = true;
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.textContent?.toLowerCase() || '';
        if (text.includes(keyword.toLowerCase()) && text.length < 200) {
          lockMessageText = el.textContent?.trim().slice(0, 100) || null;
          break;
        }
      }
      break;
    }
  }

  // Check if main content is hidden
  let mainContentHidden = false;
  for (const selector of mainContentSelectors) {
    const mainEl = document.querySelector(selector);
    if (mainEl) {
      const style = window.getComputedStyle(mainEl);
      const isHidden =
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0;

      if (isHidden) {
        mainContentHidden = true;
        break;
      }

      const rect = mainEl.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) {
        mainContentHidden = true;
        break;
      }
    }
  }

  return {
    lockMessageFound,
    lockMessageText,
    mainContentHidden,
    bodyWidth,
    bodyHeight,
    visibleTextLength,
  };
}

/** Determine where orientation lock was detected. */
function determineLockLocation(
  portraitHasLock: boolean,
  landscapeHasLock: boolean
): 'portrait' | 'landscape' | 'both' | 'none' {
  if (portraitHasLock && landscapeHasLock) {
    return 'both';
  }
  if (portraitHasLock) {
    return 'portrait';
  }
  if (landscapeHasLock) {
    return 'landscape';
  }
  return 'none';
}

/** Log orientation state for a specific orientation. */
function logOrientationState(
  label: string,
  viewport: { width: number; height: number },
  state: OrientationState
): void {
  console.log(`\n${label} (${viewport.width}x${viewport.height}):`);
  console.log(`  Lock message found: ${state.lockMessageFound ? 'YES' : 'No'}`);
  if (state.lockMessageText) {
    console.log(`  Message: "${state.lockMessageText}"`);
  }
  console.log(`  Main content hidden: ${state.mainContentHidden ? 'YES' : 'No'}`);
  console.log(`  Body size: ${state.bodyWidth}x${state.bodyHeight}`);
}

export interface RunOrientationCheckOptions extends OutputLocationOptions {
  /**
   * A page to drive. This check navigates the page itself (once per
   * orientation), so the page does not need to be pre-navigated.
   */
  page: Page;
  /** Target URL to audit. Falls back to the `TEST_PAGE` env var. */
  targetUrl?: string;
  /**
   * Whether to capture portrait/landscape screenshots next to the result file
   * (default: false).
   */
  screenshot?: boolean;
}

/**
 * Run the orientation check, navigating the page in both portrait and landscape,
 * write the result JSON (and optionally screenshots), and return the parsed
 * result.
 */
export async function runOrientationCheck(
  options: RunOrientationCheckOptions
): Promise<OrientationCheckResult> {
  const { page, targetUrl, screenshot = false, ...location } = options;

  const url = requireTargetUrl(targetUrl);
  const checkArgs = {
    lockKeywords: [...ORIENTATION_LOCK_KEYWORDS],
    mainContentSelectors: [...MAIN_CONTENT_SELECTORS],
  };

  // Resolve where the result will be written up front so screenshots can be
  // placed next to it (mirrors saveAuditResult's resolution).
  const resolvedPath = resolveOutputPath({
    ...location,
    defaultFile: DEFAULT_ORIENTATION_RESULT_FILE,
  });

  // Test portrait orientation
  await page.setViewportSize(ORIENTATION_VIEWPORTS.portrait);
  await page.goto(url, { waitUntil: 'networkidle' });
  const portraitState = await page.evaluate(captureOrientationState, checkArgs);

  let portraitScreenshotPath: string | undefined;
  if (screenshot) {
    portraitScreenshotPath = await takeAuditScreenshot(page, {
      path: resolveScreenshotPath(
        resolvedPath,
        DEFAULT_ORIENTATION_PORTRAIT_SCREENSHOT_FILE
      ),
    });
  }

  // Test landscape orientation
  await page.setViewportSize(ORIENTATION_VIEWPORTS.landscape);
  await page.goto(url, { waitUntil: 'networkidle' });
  const landscapeState = await page.evaluate(captureOrientationState, checkArgs);

  let landscapeScreenshotPath: string | undefined;
  if (screenshot) {
    landscapeScreenshotPath = await takeAuditScreenshot(page, {
      path: resolveScreenshotPath(
        resolvedPath,
        DEFAULT_ORIENTATION_LANDSCAPE_SCREENSHOT_FILE
      ),
    });
  }

  // Determine lock status
  const portraitHasLock =
    portraitState.lockMessageFound || portraitState.mainContentHidden;
  const landscapeHasLock =
    landscapeState.lockMessageFound || landscapeState.mainContentHidden;
  const hasOrientationLock = portraitHasLock || landscapeHasLock;
  const lockDetectedIn = determineLockLocation(portraitHasLock, landscapeHasLock);

  const result: OrientationCheckResult = {
    url: page.url(),
    portrait: portraitState,
    landscape: landscapeState,
    hasOrientationLock,
    lockDetectedIn,
  };

  // Output results
  logAuditHeader('Orientation Check Results', 'WCAG 1.3.4', result.url);
  logOrientationState('Portrait', ORIENTATION_VIEWPORTS.portrait, result.portrait);
  logOrientationState(
    'Landscape',
    ORIENTATION_VIEWPORTS.landscape,
    result.landscape
  );

  console.log(
    `\nOrientation lock detected: ${result.hasOrientationLock ? 'YES' : 'No'}`
  );
  if (result.hasOrientationLock) {
    console.log(`Lock detected in: ${result.lockDetectedIn}`);
  }

  const writtenPath = saveAuditResult(result, {
    ...location,
    defaultFile: DEFAULT_ORIENTATION_RESULT_FILE,
  });

  const screenshotPaths = [portraitScreenshotPath, landscapeScreenshotPath]
    .filter((p): p is string => p !== undefined)
    .join(', ');
  logOutputPaths(writtenPath, screenshotPaths || undefined);

  return result;
}
