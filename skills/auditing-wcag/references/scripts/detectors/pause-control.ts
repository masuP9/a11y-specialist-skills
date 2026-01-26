/**
 * Pause/Stop control detection for auto-playing content
 * WCAG 1.4.2 (Audio Control) / 2.2.2 (Pause, Stop, Hide)
 */

import * as path from 'path';
import type { Page } from '@playwright/test';
import type { PauseControlInfo, PauseVerificationResult } from '../types';
import { compareImages, formatDiffPercent, hasSignificantChange } from '../utils';
import {
  PAUSE_KEYWORDS,
  CONTROL_CLASS_PATTERNS,
  CAROUSEL_PATTERNS,
  NAV_KEYWORDS,
  SVG_METADATA_PATTERNS,
  MAX_PARENT_LEVELS,
  PAUSE_CLICK_WAIT,
  SCREENSHOT_COMPARISON_WAIT,
} from '../constants';

/**
 * Detect pause/stop controls in the page
 * Searches for buttons and controls that likely control auto-play content
 */
export async function detectPauseControls(page: Page): Promise<PauseControlInfo> {
  // Pass constants to browser context
  const config = {
    pauseKeywords: [...PAUSE_KEYWORDS],
    controlClassPatterns: [...CONTROL_CLASS_PATTERNS],
    carouselPatterns: [...CAROUSEL_PATTERNS],
    navKeywords: [...NAV_KEYWORDS],
    svgMetadataPatterns: [...SVG_METADATA_PATTERNS],
    maxParentLevels: MAX_PARENT_LEVELS,
  };

  return await page.evaluate((cfg) => {
    const controls: Array<{ element: string; name: string; matchedBy: 'accessible-name' | 'class-name-near-carousel' | 'svg-icon-pattern'; selector: string }> = [];
    const carouselIndicators: Array<{ element: string; name: string }> = [];
    let hasAccessibleName = false;

    const getSelector = (el: HTMLElement): string => {
      if (el.id) return `#${el.id}`;
      if (el.className) {
        const classes = el.className.toString().split(' ').filter(c => c).join('.');
        if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
      }
      return el.tagName.toLowerCase();
    };

    const interactiveElements = document.querySelectorAll(
      'button, [role="button"], input[type="button"], [tabindex="0"]'
    );

    interactiveElements.forEach((el) => {
      const element = el as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      const ariaLabel = element.getAttribute('aria-label') || '';
      const textContent = element.textContent?.trim() || '';
      const className = element.className?.toString() || '';

      // Check accessible name, excluding SVG metadata
      let accessibleName = ariaLabel || textContent;
      const isSvgMetadata = cfg.svgMetadataPatterns.some((pattern: string) =>
        accessibleName.toLowerCase().includes(pattern)
      );
      if (isSvgMetadata) {
        accessibleName = '';
      }
      const lowerName = accessibleName.toLowerCase();
      const lowerClass = className.toLowerCase();

      // Check for keyword matches
      const nameMatch = cfg.pauseKeywords.some((kw: string) =>
        lowerName.includes(kw.toLowerCase())
      );

      const classMatch = cfg.controlClassPatterns.some((pattern: string) =>
        lowerClass.includes(pattern)
      );

      // Check carousel context
      const isNearCarousel = cfg.carouselPatterns.some((pattern: string) => {
        if (lowerClass.includes(pattern)) return true;
        let parent = element.parentElement;
        for (let i = 0; i < cfg.maxParentLevels && parent; i++) {
          if (parent.className?.toString().toLowerCase().includes(pattern)) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      });

      // Check SVG pause icon pattern
      const hasSvg = element.querySelector('svg');
      let hasPauseIconPattern = false;
      if (hasSvg) {
        const rects = hasSvg.querySelectorAll('rect, path');
        if (rects.length === 2) {
          hasPauseIconPattern = true;
        }
      }

      // Classify control
      if (nameMatch) {
        controls.push({
          element: tagName,
          name: accessibleName || `[class: ${className.slice(0, 50)}]`,
          matchedBy: 'accessible-name',
          selector: getSelector(element),
        });
        hasAccessibleName = true;
      } else if (classMatch && isNearCarousel) {
        controls.push({
          element: tagName,
          name: accessibleName || `[class: ${className.slice(0, 50)}]`,
          matchedBy: 'class-name-near-carousel',
          selector: getSelector(element),
        });
        if (accessibleName) hasAccessibleName = true;
      } else if (hasPauseIconPattern && isNearCarousel) {
        controls.push({
          element: tagName,
          name: accessibleName || `[class: ${className.slice(0, 50)}]`,
          matchedBy: 'svg-icon-pattern',
          selector: getSelector(element),
        });
        if (accessibleName) hasAccessibleName = true;
      }

      // Track carousel navigation controls
      const isNavControl = cfg.navKeywords.some((kw: string) =>
        lowerName.includes(kw) || lowerClass.includes(kw)
      );
      if (isNavControl && isNearCarousel) {
        carouselIndicators.push({
          element: tagName,
          name: accessibleName || `[class: ${className.slice(0, 50)}]`,
        });
      }
    });

    return {
      found: controls.length > 0,
      controls,
      carouselIndicators,
      hasAccessibleName,
    };
  }, config);
}

/**
 * Verify if clicking the pause control actually stops the auto-play
 */
export async function verifyPauseControl(
  page: Page,
  pauseControls: PauseControlInfo,
  outputDir: string,
  changeThreshold: number
): Promise<PauseVerificationResult> {
  if (!pauseControls.found || pauseControls.controls.length === 0) {
    return {
      attempted: false,
      controlClicked: null,
      beforeClickDiffPercent: null,
      afterClickDiffPercent: null,
      pauseWorked: null,
      error: 'No pause controls found to verify',
    };
  }

  const control = pauseControls.controls[0];
  const selector = control.selector;

  if (!selector) {
    return {
      attempted: false,
      controlClicked: null,
      beforeClickDiffPercent: null,
      afterClickDiffPercent: null,
      pauseWorked: null,
      error: 'No selector available for pause control',
    };
  }

  try {
    // Take screenshots before clicking
    const beforePath1 = path.join(outputDir, 'verify-before-1.png');
    const beforePath2 = path.join(outputDir, 'verify-before-2.png');

    await page.screenshot({ path: beforePath1, fullPage: false });
    await page.waitForTimeout(SCREENSHOT_COMPARISON_WAIT);
    await page.screenshot({ path: beforePath2, fullPage: false });

    const beforeDiff = compareImages(
      beforePath1,
      beforePath2,
      path.join(outputDir, 'verify-before-diff.png')
    );

    // Click pause control
    const element = await page.$(selector);
    if (!element) {
      return {
        attempted: true,
        controlClicked: selector,
        beforeClickDiffPercent: formatDiffPercent(beforeDiff.diffPercent),
        afterClickDiffPercent: null,
        pauseWorked: null,
        error: `Could not find element with selector: ${selector}`,
      };
    }

    await element.click();
    await page.waitForTimeout(PAUSE_CLICK_WAIT);

    // Take screenshots after clicking
    const afterPath1 = path.join(outputDir, 'verify-after-1.png');
    const afterPath2 = path.join(outputDir, 'verify-after-2.png');

    await page.screenshot({ path: afterPath1, fullPage: false });
    await page.waitForTimeout(SCREENSHOT_COMPARISON_WAIT);
    await page.screenshot({ path: afterPath2, fullPage: false });

    const afterDiff = compareImages(
      afterPath1,
      afterPath2,
      path.join(outputDir, 'verify-after-diff.png')
    );

    // Determine if pause worked
    const hadChangeBefore = hasSignificantChange(beforeDiff.diffPercent, changeThreshold);
    const hasChangeAfter = hasSignificantChange(afterDiff.diffPercent, changeThreshold);
    const pauseWorked = hadChangeBefore && !hasChangeAfter;

    return {
      attempted: true,
      controlClicked: selector,
      beforeClickDiffPercent: formatDiffPercent(beforeDiff.diffPercent),
      afterClickDiffPercent: formatDiffPercent(afterDiff.diffPercent),
      pauseWorked,
      error: null,
    };
  } catch (err) {
    return {
      attempted: true,
      controlClicked: selector,
      beforeClickDiffPercent: null,
      afterClickDiffPercent: null,
      pauseWorked: null,
      error: `Error during verification: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Create a skipped verification result
 */
export function createSkippedVerification(reason: string): PauseVerificationResult {
  return {
    attempted: false,
    controlClicked: null,
    beforeClickDiffPercent: null,
    afterClickDiffPercent: null,
    pauseWorked: null,
    error: reason,
  };
}
