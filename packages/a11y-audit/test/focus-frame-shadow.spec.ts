/**
 * Records say which document an element lives in: `frame` for an iframe's
 * document, `shadowHosts` for the shadow roots between the element and its
 * document. Elements inside a shadow root are recorded themselves, not as the
 * host that `focusin` retargets them to.
 */

import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

const PAGE = 'focus-indicator/frames-and-shadow.html';
const FOCUSABLE_FRAME_PAGE = 'focus-indicator/frame-focusable.html';

async function runOnFramesPage(
  browser: Parameters<typeof runFocusIndicatorCheck>[0]['browser'],
  baseUrl: string,
  outputDir: string,
) {
  // `localhost` and `127.0.0.1` are different origins, so this frame is
  // cross-origin to the page served from `127.0.0.1`.
  const childUrl = `${baseUrl.replace('127.0.0.1', 'localhost')}/focus-indicator/frame-child.html`;
  return runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}?child=${encodeURIComponent(childUrl)}`,
    outputDir,
    quiet: true,
  });
}

test('主フレームの要素の記録は、frame が null で shadowHosts が空になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const outside = result.details.allElements.find((r) => r.name === 'Outside');
  expect(outside?.frame).toBeNull();
  expect(outside?.shadowHosts).toEqual([]);
});

test('同じオリジンの iframe の中の要素の記録は、frame に iframe 要素の selector と文書の URL が入り、外の同じ selector の要素と区別できる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const inside = result.details.allElements.find(
    (r) => r.name === 'Inside same-origin',
  );
  expect(inside?.selector).toBe('#shared');
  expect(inside?.frame).toEqual({
    url: 'about:srcdoc',
    selector: '#same-origin-frame',
  });
  expect(inside?.shadowHosts).toEqual([]);
});

test('別オリジンの iframe の中の要素の記録は、frame.selector が null で frame.url に iframe の文書の URL が入る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const inside = result.details.allElements.find(
    (r) => r.name === 'Inside cross-origin',
  );
  expect(inside?.frame).toEqual({
    url: `${baseUrl.replace('127.0.0.1', 'localhost')}/focus-indicator/frame-child.html`,
    selector: null,
  });
});

test('iframe の中の要素にフォーカス表示があれば、hasFocusStyle が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const inside = result.details.allElements.find(
    (r) => r.name === 'Inside same-origin',
  );
  expect(inside?.hasFocusStyle).toBe(true);
});

test('iframe の中の要素の rect は、iframe の文書の左上を原点とした座標になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const inside = result.details.allElements.find(
    (r) => r.name === 'Inside same-origin',
  );
  expect(inside?.rect.x).toBe(0);
  expect(inside?.rect.y).toBe(0);
});

test('shadow DOM の中の要素は、host ではなく中の要素そのものが記録され、shadowHosts に host の selector が入る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const inside = result.details.allElements.find(
    (r) => r.name === 'Inside shadow',
  );
  expect(inside?.tag).toBe('BUTTON');
  expect(inside?.selector).toBe('#shared');
  expect(inside?.shadowHosts).toEqual(['#shadow-host']);
  expect(inside?.frame).toBeNull();
  expect(
    result.details.allElements.some((r) => r.selector === '#shadow-host'),
  ).toBe(false);
});

test('shadow DOM の中の要素にフォーカス表示があれば、hasFocusStyle が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const inside = result.details.allElements.find(
    (r) => r.name === 'Inside shadow',
  );
  expect(inside?.hasFocusStyle).toBe(true);
});

test('shadow DOM の中の要素にフォーカス表示が無いと、issues の指摘にも shadowHosts が入る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runOnFramesPage(browser, baseUrl, testInfo.outputDir);

  const issue = result.details.issues.find((i) => i.name === 'Shadow plain');
  expect(issue?.selector).toBe('#plain');
  expect(issue?.shadowHosts).toEqual(['#shadow-host']);
  expect(issue?.frame).toBeNull();
});

test('フォーカスが隠れた iframe の中の要素は、focusObscuredIssues の element にも frame が入る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/frame-obscured.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  const issue = result.details.focusObscuredIssues.find(
    (i) => i.element.selector === '#inner',
  );
  expect(issue?.element.frame).toEqual({
    url: 'about:srcdoc',
    selector: '#obscured-frame',
  });
  expect(issue?.element.shadowHosts).toEqual([]);
});

test('Tab 停止点になる iframe 要素は、中の要素と二重には記録されない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${FOCUSABLE_FRAME_PAGE}`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.allElements.map((r) => r.selector)).toEqual(['#inner']);
});
