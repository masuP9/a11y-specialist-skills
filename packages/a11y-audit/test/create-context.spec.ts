/**
 * The checks that own their BrowserContext accept `createContext` so callers
 * can attach their own guards (e.g. `context.route`) to every context.
 */

import { test, expect } from './helpers/fixtures.js';
import {
  runFocusIndicatorCheck,
  runKeyboardReachabilityCheck,
  runKeyboardTrapCheck,
} from '../dist/playwright/index.js';

const checks = [
  {
    name: 'runFocusIndicatorCheck',
    run: runFocusIndicatorCheck,
    fixture: 'focus-indicator/clear.html',
  },
  {
    name: 'runKeyboardReachabilityCheck',
    run: runKeyboardReachabilityCheck,
    fixture: 'keyboard-reachability/clear.html',
  },
  {
    name: 'runKeyboardTrapCheck',
    run: runKeyboardTrapCheck,
    fixture: 'keyboard-trap/clear.html',
  },
];

for (const { name, run, fixture } of checks) {
  test(`${name} uses createContext and runs without a browser`, async ({
    browser,
    baseUrl,
  }, testInfo) => {
    let createContextCalls = 0;

    const result = await run({
      createContext: async () => {
        createContextCalls++;
        return browser.newContext();
      },
      targetUrl: `${baseUrl}/${fixture}`,
      outputDir: testInfo.outputDir,
      quiet: true,
    });

    expect(createContextCalls).toBeGreaterThanOrEqual(1);
    expect(result.passes.length + result.violations.length).toBeGreaterThan(0);
  });

  test(`${name} throws when neither browser nor createContext is given`, async ({
    baseUrl,
  }, testInfo) => {
    await expect(
      run({
        targetUrl: `${baseUrl}/${fixture}`,
        outputDir: testInfo.outputDir,
        quiet: true,
      } as never),
    ).rejects.toThrow(/browser.*createContext/);
  });

  test(`${name} prefers createContext when browser is also given`, async ({
    browser,
    baseUrl,
  }, testInfo) => {
    let createContextCalls = 0;

    await run({
      browser,
      createContext: async () => {
        createContextCalls++;
        return browser.newContext();
      },
      targetUrl: `${baseUrl}/${fixture}`,
      outputDir: testInfo.outputDir,
      quiet: true,
    });

    expect(createContextCalls).toBeGreaterThanOrEqual(1);
  });
}
