/**
 * The CLI's argument handling and exit-code contract: 0 = no violations,
 * 1 = violations, 2 = usage or runtime error.
 */

import * as fs from 'node:fs';
import { runCli } from './helpers/cli.js';
import { test, expect } from './helpers/fixtures.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';

test('--help で usage を出して終了コード 0 で終わる', async () => {
  const { code, stdout } = await runCli(['--help'], 30_000);

  expect(code).toBe(0);
  expect(stdout).toContain('Usage: a11y-audit --url <url> [options]');
});

test('--version で package.json の version を出して終了コード 0 で終わる', async () => {
  const pkg = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
  );

  const { code, stdout } = await runCli(['--version'], 30_000);

  expect(code).toBe(0);
  expect(stdout.trim()).toBe(pkg.version);
});

test('--list-checks で RESULT_SCHEMAS のキーと同じ名前を 1 行ずつ出して終了コード 0 で終わる', async () => {
  const { code, stdout } = await runCli(['--list-checks'], 30_000);

  expect(code).toBe(0);
  expect(stdout.trim().split('\n').sort()).toEqual(
    Object.keys(RESULT_SCHEMAS).sort(),
  );
});

test('--url も TEST_PAGE も無いと終了コード 2 で --url is required を出す', async () => {
  const { code, stderr } = await runCli([], 30_000, {
    env: { ...process.env, TEST_PAGE: undefined },
  });

  expect(code).toBe(2);
  expect(stderr).toContain('--url is required');
});

test('不明な検査名を渡すと終了コード 2 で unknown check(s) と --list-checks の案内を出す', async () => {
  const { code, stderr } = await runCli(
    ['--url', 'file:///dev/null', '--checks', 'axe-audit,no-such-check'],
    30_000,
  );

  expect(code).toBe(2);
  expect(stderr).toContain('unknown check(s): no-such-check');
  expect(stderr).toContain('Run --list-checks to see available names.');
});

test('不明なフラグを渡すと終了コード 2 で usage を出す', async () => {
  const { code, stdout, stderr } = await runCli(
    ['--url', 'file:///dev/null', '--bogus'],
    30_000,
  );

  expect(code).toBe(2);
  expect(stderr).toContain('Error:');
  expect(stdout).toContain('Usage:');
});

test('違反の無いページを --checks axe-audit で走らせると終了コード 0 で [axe-audit] DONE を出す', async ({
  baseUrl,
}, testInfo) => {
  test.setTimeout(90_000);

  const { code, stdout } = await runCli(
    [
      '--url',
      `${baseUrl}/axe-audit/clear.html`,
      '--checks',
      'axe-audit',
      '--output-dir',
      testInfo.outputDir,
    ],
    60_000,
  );

  expect(code).toBe(0);
  expect(stdout).toMatch(/^\[axe-audit\] DONE/m);
});

test('違反のあるページを --checks axe-audit で走らせると終了コード 1 になる', async () => {
  test.setTimeout(90_000);
  const testInfo = test.info();
  const violatingPage = new URL('./fixtures/cli-smoke.html', import.meta.url)
    .href;

  const { code } = await runCli(
    [
      '--url',
      violatingPage,
      '--checks',
      'axe-audit',
      '--output-dir',
      testInfo.outputDir,
    ],
    60_000,
  );

  expect(code).toBe(1);
});

test('--checks axe-audit,axe-audit と重ねて書いても axe-audit は 1 回だけ走る', async ({
  baseUrl,
}, testInfo) => {
  test.setTimeout(90_000);

  const { code, stdout } = await runCli(
    [
      '--url',
      `${baseUrl}/axe-audit/clear.html`,
      '--checks',
      'axe-audit,axe-audit',
      '--output-dir',
      testInfo.outputDir,
    ],
    60_000,
  );

  expect(code).toBe(0);
  expect(stdout.match(/^\[axe-audit\] DONE/gm)).toHaveLength(1);
  expect(stdout).toMatch(/^ {2}Checks run: +1$/m);
});
