#!/usr/bin/env node
/**
 * @a11y-skills/audit CLI
 *
 * Runs WCAG 2.2 accessibility checks against a URL without needing a
 * Playwright test runner. All 10 checks are available via --checks.
 *
 * Exit codes:
 *   0 — completed, no violations found across all checks
 *   1 — completed, at least one violation found
 *   2 — runtime error (bad args, missing peers, navigation failure, check crash)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckKind = 'page' | 'browser';

interface RunCheckOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any;
  outputDir: string;
  screenshot: boolean;
  url: string;
}

interface AuditResultEnvelope {
  summary?: {
    violationCount?: number;
    incompleteCount?: number;
    passCount?: number;
  };
}

interface CheckEntry {
  name: string;
  kind: CheckKind;
  run: (opts: RunCheckOptions) => Promise<AuditResultEnvelope>;
}

interface CheckSummary {
  name: string;
  status: 'DONE' | 'SKIPPED' | 'ERROR';
  durationMs: number;
  violationCount?: number;
  incompleteCount?: number;
  passCount?: number;
  skipReason?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Check registry
// ---------------------------------------------------------------------------

// Checks are registered with lazy imports to avoid top-level peer resolution.
const CHECK_REGISTRY: CheckEntry[] = [
  {
    name: 'axe-audit',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runAxeAudit } = await import('./playwright/runAxeAudit.js');
      return (await runAxeAudit({ page, outputDir })) as AuditResultEnvelope;
    },
  },
  {
    name: 'focus-indicator-check',
    kind: 'browser',
    async run({ browser, outputDir, screenshot, url }) {
      const { runFocusIndicatorCheck } =
        await import('./playwright/runFocusIndicatorCheck.js');
      return (await runFocusIndicatorCheck({
        browser,
        targetUrl: url,
        outputDir,
        screenshot,
      })) as AuditResultEnvelope;
    },
  },
  {
    name: 'reflow-check',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runReflowCheck } = await import('./playwright/runReflowCheck.js');
      return (await runReflowCheck({ page, outputDir })) as AuditResultEnvelope;
    },
  },
  {
    name: 'text-spacing-check',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runTextSpacingCheck } =
        await import('./playwright/runTextSpacingCheck.js');
      return (await runTextSpacingCheck({
        page,
        outputDir,
      })) as AuditResultEnvelope;
    },
  },
  {
    name: 'zoom-200-check',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runZoomCheck } = await import('./playwright/runZoomCheck.js');
      return (await runZoomCheck({ page, outputDir })) as AuditResultEnvelope;
    },
  },
  {
    name: 'orientation-check',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runOrientationCheck } =
        await import('./playwright/runOrientationCheck.js');
      return (await runOrientationCheck({
        page,
        outputDir,
      })) as AuditResultEnvelope;
    },
  },
  {
    name: 'autocomplete-audit',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runAutocompleteAudit } =
        await import('./playwright/runAutocompleteAudit.js');
      return (await runAutocompleteAudit({
        page,
        outputDir,
      })) as AuditResultEnvelope;
    },
  },
  {
    name: 'time-limit-detector',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runTimeLimitDetector } =
        await import('./playwright/runTimeLimitDetector.js');
      return (await runTimeLimitDetector({
        page,
        outputDir,
      })) as AuditResultEnvelope;
    },
  },
  {
    name: 'auto-play-detection',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runAutoPlayDetection } =
        await import('./playwright/runAutoPlayDetection.js');
      return (await runAutoPlayDetection({
        page,
        outputDir: path.join(outputDir, 'auto-play-screenshots'),
      })) as AuditResultEnvelope;
    },
  },
  {
    name: 'target-size-check',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runTargetSizeCheck } =
        await import('./playwright/runTargetSizeCheck.js');
      return (await runTargetSizeCheck({
        page,
        outputDir,
      })) as AuditResultEnvelope;
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printUsage(): void {
  process.stdout.write(`
Usage: a11y-audit --url <url> [options]

Options:
  --url <url>            Target URL to audit. Overrides TEST_PAGE env var.
  --checks <list>        Comma-separated check names (default: all).
                         Use --list-checks to see available names.
  --output-dir <dir>     Directory for result JSON files (default: ./a11y-audit-results).
  --screenshot           Enable focus-indicator screenshot (default: off).
  --list-checks          Print available check names and exit.
  --version              Print version and exit.
  --help                 Print this message and exit.

Exit codes:
  0  No violations found.
  1  One or more violations found.
  2  Runtime error (bad arguments, missing peers, navigation failure).

Peer requirements:
  @playwright/test >=1.50.0
  @axe-core/playwright >=4.10.0

  Install if missing: npm i -D @playwright/test @axe-core/playwright
  Install browsers:   npx playwright install chromium

auto-play-detection requires optional deps (pixelmatch, pngjs). If they are
missing, that check is skipped with a SKIPPED notice.
`);
}

/** Verify required peers are resolvable. Returns an error string or null. */
async function checkPeers(): Promise<string | null> {
  const missing: string[] = [];
  for (const pkg of ['@playwright/test', '@axe-core/playwright']) {
    try {
      await import(pkg);
    } catch {
      missing.push(pkg);
    }
  }
  if (missing.length > 0) {
    return (
      `Missing required peer dependencies: ${missing.join(', ')}\n` +
      `Install them with: npm i -D @playwright/test @axe-core/playwright`
    );
  }
  return null;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Read package version from package.json
  let pkgVersion = 'unknown';
  try {
    const pkgPath = new URL('../package.json', import.meta.url);
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      version: string;
    };
    pkgVersion = pkgJson.version;
  } catch {
    // ignore
  }

  // Parse arguments with explicit types
  interface ParsedValues {
    url?: string;
    checks?: string;
    'output-dir'?: string;
    screenshot?: boolean;
    'list-checks'?: boolean;
    version?: boolean;
    help?: boolean;
  }

  let values: ParsedValues;
  try {
    const result = parseArgs({
      args: process.argv.slice(2),
      options: {
        url: { type: 'string' as const },
        checks: { type: 'string' as const },
        'output-dir': { type: 'string' as const },
        screenshot: { type: 'boolean' as const, default: false },
        'list-checks': { type: 'boolean' as const, default: false },
        version: { type: 'boolean' as const, default: false },
        help: { type: 'boolean' as const, default: false },
      },
      strict: true,
    });
    values = result.values as ParsedValues;
  } catch (err) {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    printUsage();
    process.exit(2);
  }

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  if (values.version) {
    process.stdout.write(`${pkgVersion}\n`);
    process.exit(0);
  }

  if (values['list-checks']) {
    process.stdout.write(CHECK_REGISTRY.map((c) => c.name).join('\n') + '\n');
    process.exit(0);
  }

  // --- Resolve URL ---
  const url = values.url ?? process.env.TEST_PAGE;
  if (!url) {
    process.stderr.write(
      'Error: --url is required (or set the TEST_PAGE environment variable).\n',
    );
    printUsage();
    process.exit(2);
  }

  // --- Resolve checks ---
  const checksArg = values.checks;
  let selectedChecks: CheckEntry[];
  if (!checksArg || checksArg === 'all') {
    selectedChecks = CHECK_REGISTRY;
  } else {
    const names = checksArg.split(',').map((n) => n.trim());
    const unknown = names.filter(
      (n) => !CHECK_REGISTRY.some((c) => c.name === n),
    );
    if (unknown.length > 0) {
      process.stderr.write(
        `Error: unknown check(s): ${unknown.join(', ')}\n` +
          `Run --list-checks to see available names.\n`,
      );
      process.exit(2);
    }
    selectedChecks = names
      .map((n) => CHECK_REGISTRY.find((c) => c.name === n))
      .filter((c): c is CheckEntry => c !== undefined);
  }

  const outputDir = path.resolve(
    values['output-dir'] ?? './a11y-audit-results',
  );
  const screenshot = values.screenshot === true;

  // --- Peer check (only before running checks) ---
  const peerError = await checkPeers();
  if (peerError) {
    process.stderr.write(`Error: ${peerError}\n`);
    process.exit(2);
  }

  // --- Launch browser ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pw = (await import('@playwright/test')) as any;
    browser = await pw.chromium.launch();
  } catch (err) {
    process.stderr.write(
      `Error launching browser: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  process.stdout.write(`a11y-audit v${pkgVersion}\n`);
  process.stdout.write(`URL:        ${url}\n`);
  process.stdout.write(
    `Checks:     ${selectedChecks.map((c) => c.name).join(', ')}\n`,
  );
  process.stdout.write(`Output dir: ${outputDir}\n`);
  process.stdout.write(`\n`);

  const summaries: CheckSummary[] = [];
  let hasViolations = false;
  let hasErrors = false;

  for (const check of selectedChecks) {
    const start = Date.now();

    // page-based checks get a fresh context + navigated page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let context: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page: any = null;

    try {
      if (check.kind === 'page') {
        context = await browser.newContext();
        page = await context.newPage();

        // Use 'load' for file: URLs to avoid networkidle hanging
        const waitUntil = url.startsWith('file:') ? 'load' : 'networkidle';
        try {
          await page.goto(url, { waitUntil });
        } catch (navErr) {
          const msg = navErr instanceof Error ? navErr.message : String(navErr);
          process.stderr.write(`[${check.name}] Navigation failed: ${msg}\n`);
          summaries.push({
            name: check.name,
            status: 'ERROR',
            durationMs: Date.now() - start,
            error: msg,
          });
          hasErrors = true;
          continue;
        }
      }

      const result = await check.run({
        page,
        browser,
        outputDir,
        screenshot,
        url,
      });

      const durationMs = Date.now() - start;
      const summary = result.summary;

      const violationCount = summary?.violationCount ?? 0;
      const incompleteCount = summary?.incompleteCount ?? 0;
      const passCount = summary?.passCount ?? 0;

      if (violationCount > 0) {
        hasViolations = true;
      }

      process.stdout.write(
        `[${check.name}] DONE in ${formatDuration(durationMs)} — ` +
          `violations: ${violationCount}, passes: ${passCount}, incomplete: ${incompleteCount}\n`,
      );

      summaries.push({
        name: check.name,
        status: 'DONE',
        durationMs,
        violationCount,
        incompleteCount,
        passCount,
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);

      // auto-play-detection: optional dep missing → SKIPPED, not ERROR
      const isOptionalDepMissing =
        check.name === 'auto-play-detection' &&
        (msg.includes('pixelmatch') ||
          msg.includes('pngjs') ||
          msg.includes('Cannot find module') ||
          msg.includes('ERR_MODULE_NOT_FOUND'));

      if (isOptionalDepMissing) {
        process.stdout.write(
          `[${check.name}] SKIPPED — optional deps missing (pixelmatch, pngjs). ` +
            `Install with: npm i pixelmatch pngjs\n`,
        );
        summaries.push({
          name: check.name,
          status: 'SKIPPED',
          durationMs,
          skipReason: 'optional deps missing (pixelmatch, pngjs)',
        });
      } else {
        process.stderr.write(`[${check.name}] ERROR: ${msg}\n`);
        summaries.push({
          name: check.name,
          status: 'ERROR',
          durationMs,
          error: msg,
        });
        hasErrors = true;
      }
    } finally {
      if (context !== null) {
        try {
          await context.close();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  // --- Close browser ---
  try {
    await browser.close();
  } catch {
    // ignore
  }

  // --- Summary ---
  const totalMs = summaries.reduce((acc, s) => acc + s.durationMs, 0);
  const doneCount = summaries.filter((s) => s.status === 'DONE').length;
  const skippedCount = summaries.filter((s) => s.status === 'SKIPPED').length;
  const errorCount = summaries.filter((s) => s.status === 'ERROR').length;
  const totalViolations = summaries.reduce(
    (acc, s) => acc + (s.violationCount ?? 0),
    0,
  );

  process.stdout.write(`\n`);
  process.stdout.write(
    `--- Summary (${formatDuration(totalMs)}) ---\n` +
      `  Checks run:   ${doneCount}\n` +
      `  Skipped:      ${skippedCount}\n` +
      `  Errors:       ${errorCount}\n` +
      `  Total violations: ${totalViolations}\n` +
      `  Results written to: ${outputDir}\n`,
  );

  if (hasErrors) {
    process.exit(2);
  } else if (hasViolations) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(2);
});
