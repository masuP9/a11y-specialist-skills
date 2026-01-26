/**
 * Test harness utilities for WCAG audit scripts
 *
 * Provides common patterns for:
 * - URL resolution from environment variables
 * - Result output with consistent formatting
 * - Screenshot capture with standard naming
 * - Console logging with consistent styling
 */

import * as fs from 'fs';
import type { Page } from '@playwright/test';
import { AUDIT_DISCLAIMER, DISCLAIMER_CONSOLE } from '../constants';

// =============================================================================
// URL Resolution
// =============================================================================

/**
 * Get the target URL from environment variable or use default
 *
 * @param defaultPath - Default path/preset to use if TEST_PAGE is not set
 * @returns The resolved target URL
 *
 * @example
 * const targetUrl = getTargetUrl('?preset=1.4.4-text-size');
 * await page.goto(targetUrl);
 */
export function getTargetUrl(defaultPath: string): string {
  return process.env.TEST_PAGE || defaultPath;
}

// =============================================================================
// Result Output
// =============================================================================

/**
 * Options for saving audit results
 */
export interface SaveResultOptions {
  /** Path to save the JSON result file */
  outputPath: string;
  /** Whether to include the disclaimer in the output */
  includeDisclaimer?: boolean;
}

/**
 * Save audit results to a JSON file with optional disclaimer
 *
 * @param result - The audit result object to save
 * @param options - Save options including output path
 *
 * @example
 * saveAuditResult(result, { outputPath: 'reflow-result.json' });
 */
export function saveAuditResult<T extends object>(
  result: T,
  options: SaveResultOptions
): void {
  const { outputPath, includeDisclaimer = true } = options;

  const outputData = includeDisclaimer
    ? { ...result, disclaimer: AUDIT_DISCLAIMER }
    : result;

  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
}

// =============================================================================
// Console Logging
// =============================================================================

/**
 * Log the header for audit results to console
 *
 * @param title - The title of the audit (e.g., "Reflow Check Results")
 * @param wcagRef - The WCAG reference (e.g., "WCAG 1.4.10")
 * @param url - The URL that was audited
 *
 * @example
 * logAuditHeader('Reflow Check Results', 'WCAG 1.4.10', page.url());
 */
export function logAuditHeader(title: string, wcagRef: string, url: string): void {
  console.log(`\n=== ${title} (${wcagRef}) ===`);
  console.log(`URL: ${url}`);
}

/**
 * Log a summary section with key-value pairs
 *
 * @param items - Object with label keys and values to display
 *
 * @example
 * logSummary({
 *   'Viewport': '320x256',
 *   'Horizontal scroll': result.hasHorizontalScroll ? 'YES' : 'No',
 *   'Overflowing elements': result.overflowingElements.length,
 * });
 */
export function logSummary(items: Record<string, string | number | boolean>): void {
  for (const [label, value] of Object.entries(items)) {
    const displayValue = typeof value === 'boolean' ? (value ? 'YES' : 'No') : value;
    console.log(`${label}: ${displayValue}`);
  }
}

/**
 * Log a list of issues with truncation
 *
 * @param title - Section title
 * @param items - Array of items to display
 * @param formatter - Function to format each item for display
 * @param maxItems - Maximum number of items to show before truncating
 *
 * @example
 * logIssueList(
 *   'Overflowing Elements',
 *   issues,
 *   (el, i) => [`${i + 1}. <${el.tagName}> "${el.selector}"`],
 *   10
 * );
 */
export function logIssueList<T>(
  title: string,
  items: T[],
  formatter: (item: T, index: number) => string[],
  maxItems = 10
): void {
  if (items.length === 0) {
    return;
  }

  console.log(`\n--- ${title} ---`);
  items.slice(0, maxItems).forEach((item, index) => {
    const lines = formatter(item, index);
    lines.forEach((line) => console.log(`  ${line}`));
  });

  if (items.length > maxItems) {
    console.log(`  ... and ${items.length - maxItems} more`);
  }
}

/**
 * Log the output file paths and disclaimer
 *
 * @param outputPath - Path to the JSON result file
 * @param screenshotPath - Optional path to the screenshot file
 */
export function logOutputPaths(outputPath: string, screenshotPath?: string): void {
  console.log(`\nResults saved to: ${outputPath}`);
  if (screenshotPath) {
    console.log(`Screenshot saved to: ${screenshotPath}`);
  }
  console.log(DISCLAIMER_CONSOLE);
}

// =============================================================================
// Screenshot Capture
// =============================================================================

/**
 * Options for taking audit screenshots
 */
export interface ScreenshotOptions {
  /** Path to save the screenshot */
  path: string;
  /** Whether to capture the full page (default: true) */
  fullPage?: boolean;
}

/**
 * Take a screenshot with standard audit settings
 *
 * @param page - Playwright page object
 * @param options - Screenshot options
 * @returns The path where the screenshot was saved
 *
 * @example
 * const screenshotPath = await takeAuditScreenshot(page, {
 *   path: 'reflow-screenshot.png',
 * });
 */
export async function takeAuditScreenshot(
  page: Page,
  options: ScreenshotOptions
): Promise<string> {
  const { path, fullPage = true } = options;

  await page.screenshot({ path, fullPage });

  return path;
}

// =============================================================================
// Complete Audit Output Helper
// =============================================================================

/**
 * Options for complete audit output
 */
export interface AuditOutputOptions<T extends object> {
  /** The audit result object */
  result: T;
  /** Title for the console header */
  title: string;
  /** WCAG reference (e.g., "WCAG 1.4.10") */
  wcagRef: string;
  /** URL that was audited */
  url: string;
  /** Path to save the JSON result */
  outputPath: string;
  /** Summary items to display (label -> value) */
  summary: Record<string, string | number | boolean>;
  /** Path for screenshot (optional) */
  screenshotPath?: string;
  /** Playwright page for screenshot (required if screenshotPath is set) */
  page?: Page;
}

/**
 * Complete audit output helper - logs results, saves JSON, and takes screenshot
 *
 * This is a convenience function that combines all the common output patterns
 * into a single call.
 *
 * @param options - Complete audit output options
 *
 * @example
 * await completeAuditOutput({
 *   result,
 *   title: 'Reflow Check Results',
 *   wcagRef: 'WCAG 1.4.10',
 *   url: page.url(),
 *   outputPath: 'reflow-result.json',
 *   summary: {
 *     'Viewport': `${result.viewport.width}x${result.viewport.height}`,
 *     'Horizontal scroll': result.hasHorizontalScroll,
 *   },
 *   screenshotPath: 'reflow-screenshot.png',
 *   page,
 * });
 */
export async function completeAuditOutput<T extends object>(
  options: AuditOutputOptions<T>
): Promise<void> {
  const {
    result,
    title,
    wcagRef,
    url,
    outputPath,
    summary,
    screenshotPath,
    page,
  } = options;

  // Log header
  logAuditHeader(title, wcagRef, url);

  // Log summary
  logSummary(summary);

  // Save result
  saveAuditResult(result, { outputPath });

  // Take screenshot if requested
  if (screenshotPath && page) {
    await takeAuditScreenshot(page, { path: screenshotPath });
  }

  // Log output paths
  logOutputPaths(outputPath, screenshotPath);
}
