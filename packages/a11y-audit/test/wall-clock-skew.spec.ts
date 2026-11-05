/**
 * Issue #170: elapsed times must not depend on the wall clock, which can run
 * slow, stop or go back on some machines. These tests replace `Date.now` while
 * a check runs: tests in one worker run one at a time, so nothing else in the
 * process sees the replaced clock.
 */

import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test, expect } from '@playwright/test';
import {
  runChangeOnInputCheck,
  runCharacterKeyShortcutCheck,
  runContentOnHoverCheck,
  runFocusIndicatorCheck,
  runFocusOrderCheck,
  runKeyboardReachabilityCheck,
  runPointerCancellationCheck,
} from '../dist/playwright/index.js';

/** Runs `fn` while the wall clock moves at `rate` times real time. */
async function withWallClockRate<T>(
  rate: number,
  fn: () => Promise<T>,
): Promise<T> {
  const realNow = Date.now;
  const base = realNow();
  Date.now = () => base + (realNow() - base) * rate;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}

const STOPPED = 0;
const BACKWARDS = -10;
/** With this rate, a 60-second budget is used up in 60 ms of real time. */
const FAST = 1000;
const BUDGET_MS = 60_000;

// #jump navigates 300 ms after its focus, from a timer, so finding it takes
// replays that wait as long as the navigation took on the first walk.
const DELAYED_JUMP_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>delayed jump</title></head>
<body>
  <a id="before" href="#">before</a>
  <a id="jump" href="#" onfocus="setTimeout(function () { location.href = '/navigated'; }, 300)">jump</a>
  <a id="after-1" href="#">after 1</a>
  <a id="after-2" href="#">after 2</a>
</body></html>`;

const NAVIGATED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>navigated</title></head>
<body><a id="destination" href="#">destination</a></body></html>`;

const LINKS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>links</title></head>
<body><a href="#">one</a> <a href="#">two</a> <a href="#">three</a></body></html>`;

const SELECT_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>select</title></head>
<body><label>Size <select><option>S</option><option>M</option></select></label></body></html>`;

const PRESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>press</title></head>
<body><button onpointerdown="">press</button></body></html>`;

const KEY_LISTENER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>keys</title></head>
<body><script>document.addEventListener('keydown', function () {});</script></body></html>`;

const HOVER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>hover</title>
<style>.sub { display: none; } .menu:hover > .sub { display: block; }</style></head>
<body><div class="menu">menu <div class="sub">content</div></div></body></html>`;

const PAGES: Record<string, string> = {
  '/delayed-jump': DELAYED_JUMP_HTML,
  '/links': LINKS_HTML,
  '/select': SELECT_HTML,
  '/press': PRESS_HTML,
  '/keys': KEY_LISTENER_HTML,
  '/hover': HOVER_HTML,
};

let server: Server;
let origin: string;

test.beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(PAGES[req.url ?? ''] ?? NAVIGATED_HTML);
    });
    server.listen(0, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test.describe('3.2.1 の違反の要素', () => {
  test('壁時計が止まっていても、onfocus から 300ms 後に遷移するページでは遷移を起こしたリンクだけが違反になる', async ({
    browser,
  }, testInfo) => {
    const result = await withWallClockRate(STOPPED, () =>
      runFocusIndicatorCheck({
        browser,
        targetUrl: `${origin}/delayed-jump`,
        outputDir: testInfo.outputDir,
        quiet: true,
      }),
    );

    expect(
      result.details.onFocusViolations.map((v) => v.element.selector),
    ).toEqual(['#jump']);
  });

  test('壁時計が逆に進んでも、onfocus から 300ms 後に遷移するページでは遷移を起こしたリンクだけが違反になる', async ({
    browser,
  }, testInfo) => {
    const result = await withWallClockRate(BACKWARDS, () =>
      runFocusIndicatorCheck({
        browser,
        targetUrl: `${origin}/delayed-jump`,
        outputDir: testInfo.outputDir,
        quiet: true,
      }),
    );

    expect(
      result.details.onFocusViolations.map((v) => v.element.selector),
    ).toEqual(['#jump']);
  });

  test('壁時計が逆に進んでも、遷移を待つ時間が負にならず TimeoutNegativeWarning が出ない', async ({
    browser,
  }, testInfo) => {
    const warnings: string[] = [];
    const onWarning = (warning: Error) => warnings.push(warning.name);
    process.on('warning', onWarning);
    try {
      await withWallClockRate(BACKWARDS, () =>
        runFocusIndicatorCheck({
          browser,
          targetUrl: `${origin}/delayed-jump`,
          outputDir: testInfo.outputDir,
          quiet: true,
        }),
      );
      // Node emits process warnings on a later tick.
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('warning', onWarning);
    }

    expect(warnings).not.toContain('TimeoutNegativeWarning');
  });
});

test.describe('timeBudgetMs は実際の経過時間で数える', () => {
  test('壁時計が速く進んでも、runFocusIndicatorCheck は時間切れにならない', async ({
    browser,
  }, testInfo) => {
    const result = await withWallClockRate(FAST, () =>
      runFocusIndicatorCheck({
        browser,
        targetUrl: `${origin}/links`,
        outputDir: testInfo.outputDir,
        quiet: true,
        timeBudgetMs: BUDGET_MS,
      }),
    );

    expect(result.details.aborted).toBeNull();
  });

  test('壁時計が速く進んでも、runKeyboardReachabilityCheck は時間切れにならない', async ({
    browser,
  }, testInfo) => {
    const result = await withWallClockRate(FAST, () =>
      runKeyboardReachabilityCheck({
        browser,
        targetUrl: `${origin}/links`,
        outputDir: testInfo.outputDir,
        quiet: true,
        timeBudgetMs: BUDGET_MS,
      }),
    );

    expect(result.details.aborted).toBeNull();
  });

  test('壁時計が速く進んでも、runFocusOrderCheck は時間切れにならない', async ({
    browser,
  }, testInfo) => {
    const result = await withWallClockRate(FAST, () =>
      runFocusOrderCheck({
        browser,
        targetUrl: `${origin}/links`,
        outputDir: testInfo.outputDir,
        quiet: true,
        timeBudgetMs: BUDGET_MS,
      }),
    );

    expect(result.details.aborted).toBeNull();
  });

  test('壁時計が速く進んでも、runChangeOnInputCheck は時間切れにならない', async ({
    browser,
  }, testInfo) => {
    const result = await withWallClockRate(FAST, () =>
      runChangeOnInputCheck({
        browser,
        targetUrl: `${origin}/select`,
        outputDir: testInfo.outputDir,
        quiet: true,
        timeBudgetMs: BUDGET_MS,
      }),
    );

    expect(result.details.aborted).toBeNull();
  });

  test('壁時計が速く進んでも、runPointerCancellationCheck は時間切れにならない', async ({
    browser,
  }, testInfo) => {
    const result = await withWallClockRate(FAST, () =>
      runPointerCancellationCheck({
        browser,
        targetUrl: `${origin}/press`,
        outputDir: testInfo.outputDir,
        quiet: true,
        timeBudgetMs: BUDGET_MS,
      }),
    );

    expect(result.details.aborted).toBeNull();
  });

  test('壁時計が速く進んでも、runCharacterKeyShortcutCheck は時間切れにならない', async ({
    browser,
  }, testInfo) => {
    const result = await withWallClockRate(FAST, () =>
      runCharacterKeyShortcutCheck({
        browser,
        targetUrl: `${origin}/keys`,
        outputDir: testInfo.outputDir,
        quiet: true,
        timeBudgetMs: BUDGET_MS,
        keys: ['j'],
      }),
    );

    expect(result.details.aborted).toBeNull();
  });

  test('壁時計が速く進んでも、runContentOnHoverCheck は時間切れにならない', async ({
    browser,
  }, testInfo) => {
    const result = await withWallClockRate(FAST, () =>
      runContentOnHoverCheck({
        browser,
        targetUrl: `${origin}/hover`,
        outputDir: testInfo.outputDir,
        quiet: true,
        timeBudgetMs: BUDGET_MS,
        persistMs: 100,
      }),
    );

    expect(result.details.aborted).toBeNull();
  });
});

test('壁時計が逆に進んでも、CLI が表示する所要時間は負にならない', async () => {
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const backwardsClock = `data:text/javascript,const n=Date.now,b=n();Date.now=()=>b-(n()-b)*10;`;

  const { stdout } = await promisify(execFile)(process.execPath, [
    '--import',
    backwardsClock,
    cli,
    '--url',
    `${origin}/links`,
    '--checks',
    'page-snapshot',
    '--output-dir',
    test.info().outputDir,
  ]);

  expect(stdout).toMatch(/\[page-snapshot\] DONE in \d/);
});
