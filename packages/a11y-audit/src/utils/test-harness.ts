/**
 * Test harness utilities for the audit checks.
 *
 * Provides output-path resolution (options → env → cwd) and the per-run
 * output channel (result writing + console logging) shared by the checks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { DISCLAIMER_CONSOLE } from '../constants.js';

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
  options: OutputLocationOptions & { defaultFile: string },
): string {
  const { outputDir, outputFile, outputPath, defaultFile } = options;

  if (
    outputPath !== undefined &&
    (outputDir !== undefined || outputFile !== undefined)
  ) {
    throw new Error(
      '`outputPath` cannot be combined with `outputDir` / `outputFile`. ' +
        'Specify either `outputPath`, or `outputDir` + `outputFile`.',
    );
  }

  if (outputPath !== undefined) {
    return path.resolve(outputPath);
  }

  if (outputFile !== undefined && path.basename(outputFile) !== outputFile) {
    throw new Error(
      '`outputFile` must be a bare file name (no path separators or `..`). ' +
        'Use `outputDir` for the directory, or `outputPath` for a full path.',
    );
  }

  const dir = outputDir ?? process.env.A11Y_OUTPUT_DIR ?? process.cwd();
  const file = outputFile ?? defaultFile;
  return path.resolve(dir, file);
}

// =============================================================================
// Result Output
// =============================================================================

/**
 * Options shared by every check: where to write, and whether to write or log
 * at all. `writeResult: false` + `quiet: true` makes a check side-effect free
 * apart from the page itself (and screenshots, when enabled).
 */
export interface AuditOutputOptions extends OutputLocationOptions {
  /**
   * Whether to write the result JSON file (default: true). When `false` the
   * result is only returned. Screenshots, when enabled, are still written to
   * the resolved output location.
   */
  writeResult?: boolean;
  /** Suppress all console output of the check (default: false). */
  quiet?: boolean;
}

/**
 * Per-run output channel. Every console line and the result file of a check
 * goes through one of these, so `quiet` / `writeResult` hold for the whole
 * run and concurrent runs do not affect each other.
 */
export interface AuditOutput {
  /**
   * Absolute result path, resolved once at creation (also when
   * `writeResult` is false — screenshots are placed next to it).
   */
  readonly resultPath: string;
  /** Write the result JSON to `resultPath` unless `writeResult` is false. */
  save(result: object): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  /** Log the header for audit results. */
  header(title: string, wcagRef: string, url: string): void;
  /** Log key-value pairs. */
  summary(items: Record<string, string | number | boolean>): void;
  /** Log a list of issues, truncated after `maxItems`. */
  issueList<T>(
    title: string,
    items: T[],
    formatter: (item: T, index: number) => string[],
    maxItems?: number,
  ): void;
  /** Log what was saved (result, screenshot) and the disclaimer. */
  outputPaths(screenshotPath?: string): void;
}

/**
 * Create the output channel for one check run.
 *
 * @throws if the output location options are invalid (see
 *   `resolveOutputPath`) — before the check does any work, and also when
 *   `writeResult` is false.
 */
export function createAuditOutput(
  options: AuditOutputOptions & { defaultFile: string },
): AuditOutput {
  const { writeResult = true, quiet = false, ...location } = options;
  const resultPath = resolveOutputPath(location);
  let saved = false;

  const log = (...args: unknown[]): void => {
    if (!quiet) console.log(...args);
  };
  const warn = (...args: unknown[]): void => {
    if (!quiet) console.warn(...args);
  };

  return {
    resultPath,
    save(result) {
      if (!writeResult) return;
      // Written as-is — the envelope built by `buildAuditResult()` already
      // carries the disclaimer.
      fs.mkdirSync(path.dirname(resultPath), { recursive: true });
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
      saved = true;
    },
    log,
    warn,
    header(title, wcagRef, url) {
      log(`\n=== ${title} (${wcagRef}) ===`);
      log(`URL: ${url}`);
    },
    summary(items) {
      for (const [label, value] of Object.entries(items)) {
        const displayValue =
          typeof value === 'boolean' ? (value ? 'YES' : 'No') : value;
        log(`${label}: ${displayValue}`);
      }
    },
    issueList(title, items, formatter, maxItems = 10) {
      if (items.length === 0) {
        return;
      }
      log(`\n--- ${title} ---`);
      items.slice(0, maxItems).forEach((item, index) => {
        formatter(item, index).forEach((line) => log(`  ${line}`));
      });
      if (items.length > maxItems) {
        log(`  ... and ${items.length - maxItems} more`);
      }
    },
    outputPaths(screenshotPath) {
      if (saved) {
        log(`\nResults saved to: ${resultPath}`);
      }
      if (screenshotPath) {
        log(`${saved ? '' : '\n'}Screenshot saved to: ${screenshotPath}`);
      }
      log(DISCLAIMER_CONSOLE);
    },
  };
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
  options: TakeScreenshotOptions,
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
  defaultScreenshotFile: string,
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
      'No target URL provided. Pass `targetUrl` or set the TEST_PAGE environment variable.',
    );
  }
  return url;
}

/**
 * Resolve the target URL from the `TEST_PAGE` env var, falling back to the
 * given default. Useful for callers that want a sensible default (e.g. a test
 * fixture URL or preset) instead of throwing when `TEST_PAGE` is unset.
 */
export function getTargetUrl(defaultPath: string): string {
  return process.env.TEST_PAGE || defaultPath;
}
