import type { Page } from '@playwright/test';

/**
 * Navigate and wait for `load`, then give network idle at most
 * `networkIdleGraceMs`. Pages with constant analytics traffic never reach
 * `networkidle`, so waiting for it in `goto` times out (30s by default).
 */
export async function gotoAndSettle(
  page: Page,
  url: string,
  networkIdleGraceMs = 5_000,
): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForLoadState('networkidle', {
      timeout: networkIdleGraceMs,
    });
  } catch (error) {
    // Only the grace period elapsing is expected; anything else is real.
    if ((error as Error)?.name !== 'TimeoutError') throw error;
  }
}
