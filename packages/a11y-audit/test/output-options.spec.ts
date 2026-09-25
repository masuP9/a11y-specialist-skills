/**
 * Output options shared by every check (`quiet`, `writeResult`), and the
 * "walk cut short" flags that `quiet` would otherwise hide.
 *
 * `quiet: true, writeResult: false` must leave no console output and no
 * result file for any check — the contract a server calling the checks per
 * request relies on.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { runKeyboardTrapCheck } from '../dist/playwright/index.js';
import type {
  FocusCheckDetails,
  KeyboardTrapCheckDetails,
  KeyboardTrapCheckResult,
} from '../dist/index.js';

const FINDING_FIXTURES: Record<string, string> = {
  'axe-audit': 'axe-audit/finding.html',
  'focus-indicator-check': 'focus-indicator/finding-focus-visible.html',
  'reflow-check': 'reflow/finding-overflow.html',
  'text-spacing-check': 'text-spacing/finding.html',
  'zoom-200-check': 'zoom/finding.html',
  'orientation-check': 'orientation/finding.html',
  'autocomplete-audit': 'autocomplete/finding-missing.html',
  'time-limit-detector': 'time-limit/finding-countdown.html',
  'auto-play-detection': 'auto-play/finding.html',
  'target-size-check': 'target-size/finding.html',
  'keyboard-trap-check': 'keyboard-trap/finding.html',
};

const CONSOLE_METHODS = ['log', 'warn', 'error', 'info'] as const;

/** Run `fn` with console methods captured; returns every captured call. */
async function captureConsole(fn: () => Promise<unknown>): Promise<string[]> {
  const calls: string[] = [];
  const originals = CONSOLE_METHODS.map((m) => [m, console[m]] as const);
  for (const m of CONSOLE_METHODS) {
    console[m] = (...args: unknown[]) => void calls.push(`${m}: ${args}`);
  }
  try {
    await fn();
  } finally {
    for (const [m, original] of originals) {
      console[m] = original;
    }
  }
  return calls;
}

const listDir = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir) : [];

test.describe('quiet + writeResult: false', () => {
  for (const [check, fixture] of Object.entries(FINDING_FIXTURES)) {
    test(`${check} prints nothing and writes no result`, async ({
      baseUrl,
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(60_000);
      const outputDir = path.join(testInfo.outputDir, 'out');

      const calls = await captureConsole(() =>
        runFixtureCheck(
          check,
          fixture,
          baseUrl,
          { page, browser, testInfo },
          {
            outputDir,
            quiet: true,
            writeResult: false,
          },
        ),
      );

      expect(calls).toEqual([]);
      const files = listDir(outputDir);
      expect(files.filter((f) => f.endsWith('.json'))).toEqual([]);
      if (check !== 'auto-play-detection') {
        expect(files).toEqual([]);
      } else {
        // Frames and diffs are compared on disk, so they are always written.
        expect(files.length).toBeGreaterThan(0);
        expect(files.filter((f) => !f.endsWith('.png'))).toEqual([]);
      }
    });
  }

  test('the defaults still print and write', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const outputDir = path.join(testInfo.outputDir, 'out');
    const calls = await captureConsole(() =>
      runFixtureCheck(
        'axe-audit',
        FINDING_FIXTURES['axe-audit']!,
        baseUrl,
        { page, browser, testInfo },
        { outputDir },
      ),
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(listDir(outputDir)).toEqual(['axe-result.json']);
  });

  test('writeResult: false alone still prints the disclaimer', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const outputDir = path.join(testInfo.outputDir, 'out');
    const calls = await captureConsole(() =>
      runFixtureCheck(
        'axe-audit',
        FINDING_FIXTURES['axe-audit']!,
        baseUrl,
        { page, browser, testInfo },
        { outputDir, writeResult: false },
      ),
    );
    const text = calls.join('\n');
    expect(text).toContain('Automated testing detects');
    expect(text).not.toContain('Results saved to');
    expect(listDir(outputDir)).toEqual([]);
  });
});

test.describe('writeResult: false + screenshot: true', () => {
  for (const check of [
    'reflow-check',
    'target-size-check',
    'keyboard-trap-check',
    'focus-indicator-check',
  ]) {
    test(`${check} writes the screenshot only`, async ({
      baseUrl,
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(60_000);
      const outputDir = path.join(testInfo.outputDir, 'out');
      await runFixtureCheck(
        check,
        FINDING_FIXTURES[check]!,
        baseUrl,
        { page, browser, testInfo },
        { outputDir, quiet: true, writeResult: false, screenshot: true },
      );
      const files = listDir(outputDir);
      expect(files.filter((f) => f.endsWith('.json'))).toEqual([]);
      expect(files.filter((f) => f.endsWith('.png'))).toHaveLength(1);
    });
  }
});

test.describe('keyboard-trap-check', () => {
  const readSaved = (dir: string): KeyboardTrapCheckResult =>
    JSON.parse(
      fs.readFileSync(path.join(dir, 'keyboard-trap-result.json'), 'utf8'),
    );

  test('saved JSON matches the returned result, screenshot path included', async ({
    baseUrl,
    browser,
  }, testInfo) => {
    for (const [label, targetUrl] of [
      ['walk', `${baseUrl}/keyboard-trap/finding.html`],
      ['no focusables', 'data:text/html,<p>nothing to focus</p>'],
    ] as const) {
      const outputDir = path.join(testInfo.outputDir, label);
      const result = await runKeyboardTrapCheck({
        browser,
        targetUrl,
        outputDir,
        quiet: true,
        screenshot: true,
      });
      expect(result.details.screenshotPath, label).not.toBe('');
      expect(readSaved(outputDir), label).toEqual(result);
    }
  });

  test('records a capped Tab walk', async ({ baseUrl, browser }, testInfo) => {
    test.setTimeout(120_000);
    const run = (fixture: string) =>
      runKeyboardTrapCheck({
        browser,
        targetUrl: `${baseUrl}/keyboard-trap/${fixture}`,
        outputDir: testInfo.outputDir,
        quiet: true,
        writeResult: false,
        walkSettleMs: 0,
      });
    let capped: KeyboardTrapCheckDetails | undefined;
    // The cap warning goes through the quiet-aware output too.
    const calls = await captureConsole(async () => {
      capped = (await run('capped.html')).details;
    });
    expect(calls).toEqual([]);
    expect(capped?.tabWalkCapped).toBe(true);
    expect((await run('finding.html')).details.tabWalkCapped).toBe(false);
  });
});

test('focus-indicator-check records exhausted retries as interrupted', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const run = async (fixture: string): Promise<FocusCheckDetails> =>
    (
      (await runFixtureCheck(
        'focus-indicator-check',
        fixture,
        baseUrl,
        { page, browser, testInfo },
        { quiet: true, writeResult: false },
      )) as { details: FocusCheckDetails }
    ).details;

  let interrupted: FocusCheckDetails | undefined;
  // Navigation / max-retry warnings go through the quiet-aware output too.
  const calls = await captureConsole(async () => {
    interrupted = await run('focus-indicator/interrupted.html');
  });
  expect(calls).toEqual([]);
  expect(interrupted?.interrupted).toBe(true);
  expect((await run('focus-indicator/clear.html')).interrupted).toBe(false);
});
