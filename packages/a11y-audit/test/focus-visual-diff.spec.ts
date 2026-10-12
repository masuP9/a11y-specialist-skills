/**
 * `screenshotDiff` compares the area around each element before and after it
 * gets focus, so cues that computed styles cannot show (pseudo-elements, a
 * parent's :focus-within) still leave a trace in the record.
 */

import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

const PAGE = 'focus-indicator/visual-diff.html';

test('screenshotDiff 有効で ::after の下線だけが出る要素は hasFocusStyle が false でも diffRatio が 0 より大きい', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
    screenshotDiff: true,
  });

  const link = result.details.allElements.find(
    (e) => e.selector === '#pseudo-cue',
  );
  expect(link?.hasFocusStyle).toBe(false);
  expect(link?.visualDiff?.diffRatio).toBeGreaterThan(0);
  expect(link?.visualDiff?.rect).not.toBeNull();
});

test('screenshotDiff 有効で親の :focus-within だけが変わる要素は hasFocusStyle が false でも diffRatio が 0 より大きい', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
    screenshotDiff: true,
  });

  const button = result.details.allElements.find(
    (e) => e.selector === '#parent-cue',
  );
  expect(button?.hasFocusStyle).toBe(false);
  expect(button?.visualDiff?.diffRatio).toBeGreaterThan(0);
});

test('screenshotDiff 有効で印が全く無い要素は diffRatio が 0 で rect が null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
    screenshotDiff: true,
  });

  const button = result.details.allElements.find(
    (e) => e.selector === '#no-cue',
  );
  expect(button?.visualDiff).toEqual({ diffRatio: 0, rect: null });
});

test('screenshotDiff 有効のとき画像に差がある要素と無い要素で focus-visible のメッセージが違う', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
    screenshotDiff: true,
  });

  const rule = result.incomplete.find(
    (r) => r.id === 'a11y-skills/focus-visible',
  );
  const messageFor = (selector: string) =>
    rule?.nodes.find((n) => n.target[0] === selector)?.failureSummary ?? '';
  expect(messageFor('#pseudo-cue')).toContain('screenshot differs');
  expect(messageFor('#no-cue')).toContain('no visual change');
  expect(
    result.violations.find((r) => r.id === 'a11y-skills/focus-visible'),
  ).toBeUndefined();
});

test('screenshotDiff を指定しないと記録に visualDiff が付かない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
  });

  for (const record of result.details.allElements) {
    expect(record).not.toHaveProperty('visualDiff');
  }
  for (const issue of result.details.issues) {
    expect(issue).not.toHaveProperty('visualDiff');
  }
});
