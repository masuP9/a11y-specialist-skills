/**
 * Orientation Check
 *
 * WCAG 1.3.4 (Orientation)
 *
 * This script:
 * 1. Renders the page in portrait orientation (375x667)
 * 2. Renders the page in landscape orientation (667x375)
 * 3. Detects "rotate device" messages or overlays
 * 4. Checks if main content is hidden in either orientation
 * 5. Reports if the page restricts content to a specific orientation
 *
 * WCAG 1.3.4 requires content not to restrict its view and operation to a single
 * display orientation (unless essential).
 *
 * Limitations:
 * - Heuristics may miss CSS-only orientation restrictions
 * - Cannot detect JavaScript-based orientation detection without visual indicators
 * - Manual verification needed for exceptions (e.g., camera apps)
 */

import { test } from '@playwright/test';
import type { OrientationState } from './types';
import {
  ORIENTATION_VIEWPORTS,
  ORIENTATION_LOCK_KEYWORDS,
  MAIN_CONTENT_SELECTORS,
} from './constants';
import {
  getTargetUrl,
  logAuditHeader,
  saveAuditResult,
  logOutputPaths,
} from './utils/test-harness';

interface OrientationCheckArgs {
  lockKeywords: readonly string[];
  mainContentSelectors: readonly string[];
}

/**
 * Capture orientation state in browser context
 */
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

/**
 * Determine where orientation lock was detected
 */
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

/**
 * Log orientation state for a specific orientation
 */
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

test('orientation check (WCAG 1.3.4)', async ({ page }) => {
  const targetUrl = getTargetUrl('?preset=ok-aa');
  const checkArgs = {
    lockKeywords: [...ORIENTATION_LOCK_KEYWORDS],
    mainContentSelectors: [...MAIN_CONTENT_SELECTORS],
  };

  // Test portrait orientation
  await page.setViewportSize(ORIENTATION_VIEWPORTS.portrait);
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  const portraitState = await page.evaluate(captureOrientationState, checkArgs);
  await page.screenshot({
    path: 'orientation-screenshot-portrait.png',
    fullPage: true,
  });

  // Test landscape orientation
  await page.setViewportSize(ORIENTATION_VIEWPORTS.landscape);
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  const landscapeState = await page.evaluate(captureOrientationState, checkArgs);
  await page.screenshot({
    path: 'orientation-screenshot-landscape.png',
    fullPage: true,
  });

  // Determine lock status
  const portraitHasLock = portraitState.lockMessageFound || portraitState.mainContentHidden;
  const landscapeHasLock = landscapeState.lockMessageFound || landscapeState.mainContentHidden;
  const hasOrientationLock = portraitHasLock || landscapeHasLock;
  const lockDetectedIn = determineLockLocation(portraitHasLock, landscapeHasLock);

  const result = {
    url: page.url(),
    portrait: portraitState,
    landscape: landscapeState,
    hasOrientationLock,
    lockDetectedIn,
  };

  const outputPath = 'orientation-result.json';

  // Output results
  logAuditHeader('Orientation Check Results', 'WCAG 1.3.4', result.url);
  logOrientationState('Portrait', ORIENTATION_VIEWPORTS.portrait, result.portrait);
  logOrientationState('Landscape', ORIENTATION_VIEWPORTS.landscape, result.landscape);

  console.log(`\nOrientation lock detected: ${result.hasOrientationLock ? 'YES' : 'No'}`);
  if (result.hasOrientationLock) {
    console.log(`Lock detected in: ${result.lockDetectedIn}`);
  }

  saveAuditResult(result, { outputPath });
  logOutputPaths(
    outputPath,
    'orientation-screenshot-portrait.png, orientation-screenshot-landscape.png'
  );
});
