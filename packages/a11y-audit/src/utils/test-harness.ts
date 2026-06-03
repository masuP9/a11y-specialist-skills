/**
 * Test harness utilities for the audit checks.
 *
 * Provides output-path resolution (options → env → cwd), result writing, and
 * console logging helpers shared by the four checks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { AUDIT_DISCLAIMER, DISCLAIMER_CONSOLE } from '../constants.js';

// =============================================================================
// Output location resolution
// =============================================================================

/**
 * Shared options for controlling where a check writes its result file.
 *
 * Resolution order:
 *   1. `outputPath` (absolute or relative full path) — mutually exclusive with
 *      `outputDir` / `outputFile`.
 *   2. `outputDir` option → `A11Y_OUTPUT_DIR` env → `process.cwd()`, joined with
 *      `outputFile` option → the check's default filename.
 */
export interface OutputLocationOptions {
  /** Directory to write result/screenshot into. Falls back to `A11Y_OUTPUT_DIR`, then cwd. */
  outputDir?: string;
  /** Result file name (basename only). Falls back to the check's default. */
  outputFile?: string;
  /** Full path for the result file. Mutually exclusive with `outputDir`/`outputFile`. */
  outputPath?: string;
}

/**
 * Resolve the absolute path a check should write its result to.
 *
 * @throws if `outputPath` is combined with `outputDir`/`outputFile`, or if
 *   `outputFile` is an absolute path.
 */
export function resolveOutputPath(
  options: OutputLocationOptions & { defaultFile: string }
): string {
  const { outputDir, outputFile, outputPath, defaultFile } = options;

  if (
    outputPath !== undefined &&
    (outputDir !== undefined || outputFile !== undefined)
  ) {
    throw new Error(
      '`outputPath` cannot be combined with `outputDir` / `outputFile`. ' +
        'Specify either `outputPath`, or `outputDir` + `outputFile`.'
    );
  }

  if (outputPath !== undefined) {
    return path.resolve(outputPath);
  }

  if (outputFile !== undefined && path.basename(outputFile) !== outputFile) {
    throw new Error(
      '`outputFile` must be a bare file name (no path separators or `..`). ' +
        'Use `outputDir` for the directory, or `outputPath` for a full path.'
    );
  }

  const dir = outputDir ?? process.env.A11Y_OUTPUT_DIR ?? process.cwd();
  const file = outputFile ?? defaultFile;
  return path.resolve(dir, file);
}

// =============================================================================
// Result Output
// =============================================================================

export interface SaveResultOptions extends OutputLocationOptions {
  /** Default file name when none is provided via options. */
  defaultFile: string;
  /** Whether to append the disclaimer to the written JSON (default: true). */
  includeDisclaimer?: boolean;
}

/**
 * Save an audit result to a JSON file, creating parent directories as needed.
 *
 * @returns the absolute path the result was written to.
 */
export function saveAuditResult<T extends object>(
  result: T,
  options: SaveResultOptions
): string {
  const { defaultFile, includeDisclaimer = true, ...location } = options;
  const resolvedPath = resolveOutputPath({ ...location, defaultFile });

  const outputData = includeDisclaimer
    ? { ...result, disclaimer: AUDIT_DISCLAIMER }
    : result;

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(outputData, null, 2));

  return resolvedPath;
}

// =============================================================================
// Screenshot Capture
// =============================================================================

export interface TakeScreenshotOptions {
  /** Absolute or relative path to write the screenshot to. */
  path: string;
  /** Whether to capture the full page (default: true). */
  fullPage?: boolean;
}

/**
 * Take a screenshot with standard audit settings, creating parent dirs.
 *
 * @returns the absolute path the screenshot was written to.
 */
export async function takeAuditScreenshot(
  page: Page,
  options: TakeScreenshotOptions
): Promise<string> {
  const { path: screenshotPath, fullPage = true } = options;
  const resolvedPath = path.resolve(screenshotPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  await page.screenshot({ path: resolvedPath, fullPage });
  return resolvedPath;
}

/**
 * Resolve the screenshot path so it sits next to the resolved result file,
 * using the given default screenshot filename when no explicit path is set.
 */
export function resolveScreenshotPath(
  resolvedResultPath: string,
  defaultScreenshotFile: string
): string {
  return path.join(path.dirname(resolvedResultPath), defaultScreenshotFile);
}

// =============================================================================
// URL resolution (used by compatibility test-entries)
// =============================================================================

/**
 * Resolve the target URL from an explicit value or the `TEST_PAGE` env var.
 *
 * @throws if neither is provided.
 */
export function requireTargetUrl(explicit?: string): string {
  const url = explicit ?? process.env.TEST_PAGE;
  if (!url) {
    throw new Error(
      'No target URL provided. Pass `targetUrl` or set the TEST_PAGE environment variable.'
    );
  }
  return url;
}

// =============================================================================
// Console Logging
// =============================================================================

/** Log the header for audit results to console. */
export function logAuditHeader(title: string, wcagRef: string, url: string): void {
  console.log(`\n=== ${title} (${wcagRef}) ===`);
  console.log(`URL: ${url}`);
}

/** Log a summary section with key-value pairs. */
export function logSummary(
  items: Record<string, string | number | boolean>
): void {
  for (const [label, value] of Object.entries(items)) {
    const displayValue =
      typeof value === 'boolean' ? (value ? 'YES' : 'No') : value;
    console.log(`${label}: ${displayValue}`);
  }
}

/** Log a list of issues with truncation. */
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

/** Log the output file paths and disclaimer. */
export function logOutputPaths(outputPath: string, screenshotPath?: string): void {
  console.log(`\nResults saved to: ${outputPath}`);
  if (screenshotPath) {
    console.log(`Screenshot saved to: ${screenshotPath}`);
  }
  console.log(DISCLAIMER_CONSOLE);
}
