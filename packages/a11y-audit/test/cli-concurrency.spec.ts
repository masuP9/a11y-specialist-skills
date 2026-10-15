/**
 * The CLI runs checks through a bounded pool (`--concurrency`). These tests
 * check the flag validation and that a concurrent run reaches the same
 * per-check verdict counts as a sequential one on pages that exercise the
 * paths concurrency could disturb (clipboard/bringToFront, the auto-play
 * screenshot series, countdown detection).
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from './helpers/fixtures.js';

interface CliRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

// Async on purpose: a sync spawn would block this process, which also serves
// the fixture pages.
function runCli(args: string[], timeoutMs: number): Promise<CliRun> {
  const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [cliPath, ...args],
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (_error, stdout, stderr) =>
        resolve({ code: child.exitCode, stdout, stderr }),
    );
  });
}

function readJson(file: string): {
  summary: Record<string, unknown>;
  details: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
} {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

/** Result files of a CLI run: every top-level *.json plus auto-play's. */
function resultFiles(dir: string): string[] {
  const top = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const autoPlay = path.join('auto-play-screenshots', 'detection-result.json');
  return fs.existsSync(path.join(dir, autoPlay)) ? [...top, autoPlay] : top;
}

test('--concurrency 0 で usage エラーになり終了コード 2 で終わる', async () => {
  const { code, stderr } = await runCli(
    ['--url', 'file:///dev/null', '--concurrency', '0'],
    30_000,
  );
  expect(code).toBe(2);
  expect(stderr).toContain('--concurrency must be a positive integer');
});

test('--concurrency abc で usage エラーになり終了コード 2 で終わる', async () => {
  const { code, stderr } = await runCli(
    ['--url', 'file:///dev/null', '--concurrency', 'abc'],
    30_000,
  );
  expect(code).toBe(2);
  expect(stderr).toContain('--concurrency must be a positive integer');
});

test('accessible-authentication/paste-ok.html を --checks all で --concurrency 1 と 4 で走らせると検査ごとの summary と終了コードが一致する', async ({
  baseUrl,
}, testInfo) => {
  test.setTimeout(300_000);
  const url = `${baseUrl}/accessible-authentication/paste-ok.html`;
  const seqDir = path.join(testInfo.outputDir, 'seq');
  const parDir = path.join(testInfo.outputDir, 'par');

  const seq = await runCli(
    [
      '--url',
      url,
      '--checks',
      'all',
      '--concurrency',
      '1',
      '--output-dir',
      seqDir,
    ],
    280_000,
  );
  const par = await runCli(
    [
      '--url',
      url,
      '--checks',
      'all',
      '--concurrency',
      '4',
      '--output-dir',
      parDir,
    ],
    280_000,
  );

  // Precondition: the sequential run really measured the paste test.
  const seqAuth = readJson(
    path.join(seqDir, 'accessible-authentication-result.json'),
  );
  expect(seqAuth.details.pasteTest.status).toBe('ran');
  // The concurrent run must also have measured it, not fallen back.
  const parAuth = readJson(
    path.join(parDir, 'accessible-authentication-result.json'),
  );
  expect(parAuth.details.pasteTest.status).toBe('ran');

  const files = resultFiles(seqDir);
  expect(files).toHaveLength(
    seq.stdout.includes('[auto-play-detection] SKIPPED') ? 22 : 23,
  );
  for (const file of files) {
    expect(readJson(path.join(parDir, file)).summary, file).toEqual(
      readJson(path.join(seqDir, file)).summary,
    );
  }
  expect(par.code).toBe(seq.code);
  expect(seq.stdout).toContain('Errors:       0');
  expect(par.stdout).toContain('Errors:       0');
});

test('auto-play/finding.html を --checks all で --concurrency 1 と 4 で走らせると検査ごとの summary と終了コードが一致する', async ({
  baseUrl,
}, testInfo) => {
  test.setTimeout(300_000);
  const url = `${baseUrl}/auto-play/finding.html`;
  const seqDir = path.join(testInfo.outputDir, 'seq');
  const parDir = path.join(testInfo.outputDir, 'par');

  const seq = await runCli(
    [
      '--url',
      url,
      '--checks',
      'all',
      '--concurrency',
      '1',
      '--output-dir',
      seqDir,
    ],
    280_000,
  );
  const par = await runCli(
    [
      '--url',
      url,
      '--checks',
      'all',
      '--concurrency',
      '4',
      '--output-dir',
      parDir,
    ],
    280_000,
  );

  // Precondition: the sequential run really detected auto-playing content.
  const seqAutoPlay = readJson(
    path.join(seqDir, 'auto-play-screenshots', 'detection-result.json'),
  );
  expect(seqAutoPlay.details.hasAutoPlayContent).toBe(true);
  expect(seqAutoPlay.summary.incompleteCount).toBeGreaterThanOrEqual(1);

  const files = resultFiles(seqDir);
  expect(files).toHaveLength(
    seq.stdout.includes('[auto-play-detection] SKIPPED') ? 22 : 23,
  );
  for (const file of files) {
    expect(readJson(path.join(parDir, file)).summary, file).toEqual(
      readJson(path.join(seqDir, file)).summary,
    );
  }
  expect(par.code).toBe(seq.code);
  expect(seq.stdout).toContain('Errors:       0');
  expect(par.stdout).toContain('Errors:       0');
});

test('time-limit/finding-countdown.html を --checks all で --concurrency 1 と 4 で走らせると検査ごとの summary と終了コードが一致する', async ({
  baseUrl,
}, testInfo) => {
  test.setTimeout(300_000);
  const url = `${baseUrl}/time-limit/finding-countdown.html`;
  const seqDir = path.join(testInfo.outputDir, 'seq');
  const parDir = path.join(testInfo.outputDir, 'par');

  const seq = await runCli(
    [
      '--url',
      url,
      '--checks',
      'all',
      '--concurrency',
      '1',
      '--output-dir',
      seqDir,
    ],
    280_000,
  );
  const par = await runCli(
    [
      '--url',
      url,
      '--checks',
      'all',
      '--concurrency',
      '4',
      '--output-dir',
      parDir,
    ],
    280_000,
  );

  // Precondition: the sequential run really flagged the countdown.
  const seqTimeLimit = readJson(path.join(seqDir, 'time-limit-result.json'));
  expect(seqTimeLimit.summary.incompleteCount).toBeGreaterThanOrEqual(1);

  const files = resultFiles(seqDir);
  expect(files).toHaveLength(
    seq.stdout.includes('[auto-play-detection] SKIPPED') ? 22 : 23,
  );
  for (const file of files) {
    expect(readJson(path.join(parDir, file)).summary, file).toEqual(
      readJson(path.join(seqDir, file)).summary,
    );
  }
  expect(par.code).toBe(seq.code);
  expect(seq.stdout).toContain('Errors:       0');
  expect(par.stdout).toContain('Errors:       0');
});

test('--concurrency 4 でも CLI の DONE 行と Errors 行が標準出力に出る', async ({
  baseUrl,
}) => {
  const url = `${baseUrl}/time-limit/clear.html`;
  const checks = ['--checks', 'axe-audit,orientation-check'];
  // axe-audit itself prints this header unless it runs quiet.
  const checkOwnHeader = '=== Axe-core Accessibility Audit Results';

  const seq = await runCli(
    [
      '--url',
      url,
      ...checks,
      '--concurrency',
      '1',
      '--output-dir',
      path.join(test.info().outputDir, 'seq'),
    ],
    120_000,
  );
  const par = await runCli(
    [
      '--url',
      url,
      ...checks,
      '--concurrency',
      '4',
      '--output-dir',
      path.join(test.info().outputDir, 'par'),
    ],
    120_000,
  );

  expect(seq.stdout).toContain(checkOwnHeader);
  expect(par.code).toBe(0);
  expect(par.stdout).toMatch(/^\[axe-audit\] DONE in /m);
  expect(par.stdout).toMatch(/^\[orientation-check\] DONE in /m);
  expect(par.stdout).toMatch(/Errors: +0/);
  expect(par.stdout).not.toContain(checkOwnHeader);
});
