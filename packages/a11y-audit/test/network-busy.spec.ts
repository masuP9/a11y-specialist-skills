/**
 * Pages with constant network traffic (analytics beacons, polling) never
 * reach `networkidle`. Every navigation path — the CLI's pre-navigation,
 * the checks that navigate themselves, and gotoAndSettle — must still finish
 * well before the 30s navigation timeout.
 */

import { execFile } from 'node:child_process';
import { test, expect } from './helpers/fixtures.js';
import {
  runFocusIndicatorCheck,
  runKeyboardReachabilityCheck,
  runKeyboardTrapCheck,
  runOrientationCheck,
  runTimeLimitDetector,
  runZoomCheck,
} from '../dist/playwright/index.js';
import { gotoAndSettle } from '../dist/playwright/gotoAndSettle.js';

const BUSY_PAGE = 'network-busy/busy.html';

test.beforeEach(({ page }) => {
  test.setTimeout(60_000);
  // Playwright Test's page has no default navigation timeout; the capture
  // service's Playwright library page has 30s. Match production.
  page.setDefaultNavigationTimeout(30_000);
});

test('runTimeLimitDetector returns within 15s on a page whose network never goes idle', async ({
  page,
  baseUrl,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runTimeLimitDetector({
    page,
    targetUrl: `${baseUrl}/${BUSY_PAGE}`,
    settleMs: 200,
    outputDir: testInfo.outputDir,
  });
  expect(result.source).toBe('time-limit-detector');
  expect(Date.now() - startedAt).toBeLessThan(15_000);
});

test('runOrientationCheck returns within 20s on a page whose network never goes idle', async ({
  page,
  baseUrl,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runOrientationCheck({
    page,
    targetUrl: `${baseUrl}/${BUSY_PAGE}`,
    outputDir: testInfo.outputDir,
  });
  expect(result.source).toBe('orientation-check');
  expect(Date.now() - startedAt).toBeLessThan(20_000);
});

test('runFocusIndicatorCheck returns within 20s on a page whose network never goes idle', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${BUSY_PAGE}`,
    outputDir: testInfo.outputDir,
  });
  expect(result.source).toBe('focus-indicator-check');
  expect(Date.now() - startedAt).toBeLessThan(20_000);
});

test('runKeyboardTrapCheck returns within 20s on a page whose network never goes idle', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runKeyboardTrapCheck({
    browser,
    targetUrl: `${baseUrl}/${BUSY_PAGE}`,
    outputDir: testInfo.outputDir,
  });
  expect(result.source).toBe('keyboard-trap-check');
  expect(Date.now() - startedAt).toBeLessThan(20_000);
});

test('runKeyboardReachabilityCheck returns within 20s on a page whose network never goes idle', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runKeyboardReachabilityCheck({
    browser,
    targetUrl: `${baseUrl}/${BUSY_PAGE}`,
    outputDir: testInfo.outputDir,
  });
  expect(result.source).toBe('keyboard-reachability-check');
  expect(Date.now() - startedAt).toBeLessThan(20_000);
});

test('runZoomCheck with a targetUrl returns within 20s on a page whose network never goes idle', async ({
  page,
  baseUrl,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runZoomCheck({
    page,
    targetUrl: `${baseUrl}/${BUSY_PAGE}`,
    outputDir: testInfo.outputDir,
  });
  expect(result.source).toBe('zoom-200-check');
  expect(Date.now() - startedAt).toBeLessThan(20_000);
});

test('the CLI audits a page whose network never goes idle without a navigation failure', async ({
  baseUrl,
}, testInfo) => {
  const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
  // Async on purpose: a sync spawn would block this process, which also
  // serves the fixture page.
  const { code, stderr } = await new Promise<{
    code: number | null;
    stderr: string;
  }>((resolve) => {
    const child = execFile(
      process.execPath,
      [
        cliPath,
        '--url',
        `${baseUrl}/${BUSY_PAGE}`,
        '--checks',
        'axe-audit',
        '--output-dir',
        testInfo.outputDir,
      ],
      (_error, _stdout, stderr) => resolve({ code: child.exitCode, stderr }),
    );
  });
  expect(stderr).not.toContain('Navigation failed');
  expect(code).not.toBe(2);
});

test('gotoAndSettle skips the network-idle grace period for file: URLs', async ({
  page,
}) => {
  const fileUrl = new URL(
    './fixtures/pages/network-busy/busy.html',
    import.meta.url,
  ).href;
  const startedAt = Date.now();
  await gotoAndSettle(page, fileUrl);
  expect(Date.now() - startedAt).toBeLessThan(2_000);
});
