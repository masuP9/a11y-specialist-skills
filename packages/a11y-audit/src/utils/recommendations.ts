/**
 * Recommendation generation for auto-play detection.
 */

import type { PauseControlInfo, PauseVerificationResult } from '../types.js';

export interface RecommendationContext {
  hasAutoPlayContent: boolean;
  stopsWithin5Seconds: boolean;
  pauseControls: PauseControlInfo;
  pauseVerification: PauseVerificationResult;
}

/**
 * Generate a recommendation based on detection results.
 */
export function generateRecommendation(ctx: RecommendationContext): string {
  const {
    hasAutoPlayContent,
    stopsWithin5Seconds,
    pauseControls,
    pauseVerification,
  } = ctx;

  if (!hasAutoPlayContent) {
    return 'No auto-playing content detected in viewport.';
  }

  if (stopsWithin5Seconds) {
    return 'Auto-playing content detected but stops within 5 seconds. WCAG 2.2.2 may be satisfied, but verify no user impact.';
  }

  if (pauseControls.found) {
    if (pauseVerification.pauseWorked === true) {
      return pauseControls.hasAccessibleName
        ? 'Auto-playing content detected with working pause control. Verify keyboard accessibility.'
        : 'Auto-playing content detected. Pause control works but lacks accessible name (aria-label). Add accessible labels (WCAG 4.1.2).';
    }

    if (pauseVerification.pauseWorked === false) {
      return 'Auto-playing content detected. Pause control found but does NOT stop the animation. Fix the control or add a working one (WCAG 1.4.2, 2.2.2).';
    }

    // Verification not conclusive
    return pauseControls.hasAccessibleName
      ? 'Auto-playing content detected with pause controls. Manually verify controls work and are keyboard accessible.'
      : 'Auto-playing content detected. Pause control found but lacks accessible name (aria-label). Add accessible labels (WCAG 1.4.2, 2.2.2, 4.1.2).';
  }

  return 'Auto-playing content detected and continues beyond 5 seconds. No pause/stop controls found. Add controls (WCAG 1.4.2, 2.2.2).';
}

/**
 * Print the summary through `log` (the caller decides whether to print).
 */
export function printSummary(
  ctx: RecommendationContext,
  outputDir: string,
  log: (...args: unknown[]) => void,
): void {
  const {
    hasAutoPlayContent,
    stopsWithin5Seconds,
    pauseControls,
    pauseVerification,
  } = ctx;

  log('\n--- Summary ---');

  if (!hasAutoPlayContent) {
    log('✓ No auto-playing content detected in viewport');
    return;
  }

  log('⚠ Auto-playing content detected!');
  log(`  Stops within 5 seconds: ${stopsWithin5Seconds ? 'Yes' : 'No'}`);
  log(`  Screenshots saved to: ${outputDir}`);
  log('  Diff images generated for visual verification');

  // Pause control detection
  log('\n--- Pause Control Detection ---');
  if (pauseControls.found) {
    log(`✓ Pause controls found: ${pauseControls.controls.length}`);
    pauseControls.controls.forEach((ctrl, i) => {
      log(
        `  ${i + 1}. <${ctrl.element}> "${ctrl.name}" (matched by: ${ctrl.matchedBy})`,
      );
    });
    if (!pauseControls.hasAccessibleName) {
      log('⚠ Warning: Pause control lacks accessible name (aria-label)');
    }
  } else {
    log('✗ No pause controls detected');
  }

  // Pause verification results
  if (pauseVerification.attempted) {
    log('\n--- Pause Control Verification ---');
    log(`  Control clicked: ${pauseVerification.controlClicked}`);
    log(`  Change before click: ${pauseVerification.beforeClickDiffPercent}`);
    log(`  Change after click: ${pauseVerification.afterClickDiffPercent}`);
    if (pauseVerification.pauseWorked === true) {
      log('✓ Pause control WORKS - animation stopped after clicking');
    } else if (pauseVerification.pauseWorked === false) {
      log('✗ Pause control DOES NOT WORK - animation continues after clicking');
    } else if (pauseVerification.error) {
      log(`⚠ Verification error: ${pauseVerification.error}`);
    }
  }

  if (pauseControls.carouselIndicators.length > 0) {
    log(
      `\nCarousel navigation controls found: ${pauseControls.carouselIndicators.length}`,
    );
  }

  // Manual verification checklist
  log('\nManual verification required:');
  log('  - Verify pause/stop controls are keyboard accessible');
  log('  - Check for audio auto-play (requires manual listening)');
  if (!pauseControls.hasAccessibleName && pauseControls.found) {
    log('  - Add aria-label to pause control buttons');
  }
  if (pauseVerification.pauseWorked === false) {
    log('  - Fix the pause control to actually stop the animation');
  }
}
