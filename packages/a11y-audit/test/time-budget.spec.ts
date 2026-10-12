/**
 * `timeBudgetMs` / `maxTabPresses` on focus-indicator-check and
 * keyboard-reachability-check (Issue #55).
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  runFocusIndicatorCheck,
  runKeyboardReachabilityCheck,
} from '../dist/playwright/index.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });

const BUTTON_COUNT = 40;

const MANY_BUTTONS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>many buttons</title></head>
<body>
${Array.from({ length: BUTTON_COUNT }, (_, i) => `  <button id="b${i}">button ${i}</button>`).join('\n')}
</body></html>`;

let server: Server;
let url: string;

test.beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(MANY_BUTTONS_HTML);
    });
    server.listen(0, '127.0.0.1', () => {
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
      resolve();
    });
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test.describe('focus-indicator-check', () => {
  test('オプションを渡さないと最後まで回り aborted は null', async ({
    browser,
  }, testInfo) => {
    const result = await runFocusIndicatorCheck({
      browser,
      targetUrl: url,
      outputDir: testInfo.outputDir,
      quiet: true,
      writeResult: false,
    });

    expect(result.details.totalFocusableElements).toBe(BUTTON_COUNT);
    expect(result.details.aborted).toBeNull();
  });

  test('maxTabPresses が要素数より小さいと tab-limit で打ち切られ、記録済みの件数と全体の件数が入る', async ({
    browser,
  }, testInfo) => {
    const result = await runFocusIndicatorCheck({
      browser,
      targetUrl: url,
      outputDir: testInfo.outputDir,
      quiet: true,
      writeResult: false,
      maxTabPresses: 5,
    });

    expect(result.details.aborted).toEqual({
      reason: 'tab-limit',
      url,
      recordedCount: 5,
      focusableCount: BUTTON_COUNT,
    });
    expect(result.details.totalFocusableElements).toBe(5);
    expect(result.details.interrupted).toBe(false);
  });

  test('打ち切った結果は JSON スキーマに通る', async ({
    browser,
  }, testInfo) => {
    const result = await runFocusIndicatorCheck({
      browser,
      targetUrl: url,
      outputDir: testInfo.outputDir,
      quiet: true,
      writeResult: false,
      maxTabPresses: 5,
    });

    const validate = ajv.compile(RESULT_SCHEMAS['focus-indicator-check']);
    expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
  });

  test('maxTabPresses が最後まで回るのに足りていれば aborted は null', async ({
    browser,
  }, testInfo) => {
    const result = await runFocusIndicatorCheck({
      browser,
      targetUrl: url,
      outputDir: testInfo.outputDir,
      quiet: true,
      writeResult: false,
      maxTabPresses: BUTTON_COUNT + 10,
    });

    expect(result.details.aborted).toBeNull();
    expect(result.details.totalFocusableElements).toBe(BUTTON_COUNT);
  });

  test('timeBudgetMs が全体の所要時間より小さいと timeout で打ち切られる', async ({
    browser,
  }, testInfo) => {
    const result = await runFocusIndicatorCheck({
      browser,
      targetUrl: url,
      outputDir: testInfo.outputDir,
      quiet: true,
      writeResult: false,
      navigationSettleMs: 100,
      timeBudgetMs: 500,
    });

    expect(result.details.aborted?.reason).toBe('timeout');
    expect(result.details.aborted?.focusableCount).toBe(BUTTON_COUNT);
    expect(result.details.aborted?.recordedCount).toBeLessThan(BUTTON_COUNT);
    expect(result.details.totalFocusableElements).toBe(
      result.details.aborted?.recordedCount,
    );
  });

  for (const [name, value] of [
    ['0', 0],
    ['負の数', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['文字列', '100' as unknown as number],
  ] as const) {
    test(`timeBudgetMs に ${name} を渡すとエラーになる`, async ({
      browser,
    }, testInfo) => {
      await expect(
        runFocusIndicatorCheck({
          browser,
          targetUrl: url,
          outputDir: testInfo.outputDir,
          quiet: true,
          writeResult: false,
          timeBudgetMs: value,
        }),
      ).rejects.toThrow(/timeBudgetMs/);
    });
  }

  for (const [name, value] of [
    ['0', 0],
    ['小数', 1.5],
    ['NaN', Number.NaN],
  ] as const) {
    test(`maxTabPresses に ${name} を渡すとエラーになる`, async ({
      browser,
    }, testInfo) => {
      await expect(
        runFocusIndicatorCheck({
          browser,
          targetUrl: url,
          outputDir: testInfo.outputDir,
          quiet: true,
          writeResult: false,
          maxTabPresses: value,
        }),
      ).rejects.toThrow(/maxTabPresses/);
    });
  }
});

test.describe('keyboard-reachability-check', () => {
  test('maxTabPresses を渡すとその回数で Tab が止まり tabWalkCapped になる', async ({
    browser,
  }, testInfo) => {
    const result = await runKeyboardReachabilityCheck({
      browser,
      targetUrl: url,
      outputDir: testInfo.outputDir,
      quiet: true,
      writeResult: false,
      walkSettleMs: 0,
      maxTabPresses: 5,
    });

    expect(result.details.tabWalkCapped).toBe(true);
    expect(result.details.reachedCount).toBe(5);
  });

  test('timeBudgetMs が全体の所要時間より小さいと timeout で打ち切られる', async ({
    browser,
  }, testInfo) => {
    const result = await runKeyboardReachabilityCheck({
      browser,
      targetUrl: url,
      outputDir: testInfo.outputDir,
      quiet: true,
      writeResult: false,
      walkSettleMs: 100,
      timeBudgetMs: 500,
    });

    expect(result.details.aborted?.reason).toBe('timeout');
  });

  test('オプションを渡さないと今までどおり最後まで回る', async ({
    browser,
  }, testInfo) => {
    const result = await runKeyboardReachabilityCheck({
      browser,
      targetUrl: url,
      outputDir: testInfo.outputDir,
      quiet: true,
      writeResult: false,
      walkSettleMs: 0,
    });

    expect(result.details.tabWalkCapped).toBe(false);
    expect(result.details.aborted).toBeNull();
    expect(result.details.reachedCount).toBe(BUTTON_COUNT);
  });

  for (const [name, value] of [
    ['0', 0],
    ['負の数', -1],
    ['NaN', Number.NaN],
  ] as const) {
    test(`timeBudgetMs に ${name} を渡すとエラーになる`, async ({
      browser,
    }, testInfo) => {
      await expect(
        runKeyboardReachabilityCheck({
          browser,
          targetUrl: url,
          outputDir: testInfo.outputDir,
          quiet: true,
          writeResult: false,
          timeBudgetMs: value,
        }),
      ).rejects.toThrow(/timeBudgetMs/);
    });
  }

  test('maxTabPresses に 0 を渡すとエラーになる', async ({
    browser,
  }, testInfo) => {
    await expect(
      runKeyboardReachabilityCheck({
        browser,
        targetUrl: url,
        outputDir: testInfo.outputDir,
        quiet: true,
        writeResult: false,
        maxTabPresses: 0,
      }),
    ).rejects.toThrow(/maxTabPresses/);
  });
});
