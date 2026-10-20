/**
 * `allElements[].visibility` records whether the focused element is on screen,
 * measured synchronously when it receives focus.
 */

import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

test('position: fixed で平行移動だけの transform を持つヘッダーの nav が overflow: hidden で切り取るリンクは ancestor-overflow で見えない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-clipped-nav.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({
    visible: false,
    reason: 'ancestor-overflow',
  });
});

test('opacity: 0 の祖先の中のボタンは ancestor-opacity で見えない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-ancestor-opacity.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({
    visible: false,
    reason: 'ancestor-opacity',
  });
});

test('opacity: 0 で label に重ねた checkbox は own-opacity で見えない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-own-opacity.html`,
    outputDir: testInfo.outputDir,
  });

  const checkbox = result.details.allElements.find((e) => e.tag === 'INPUT');
  expect(checkbox?.visibility).toEqual({
    visible: false,
    reason: 'own-opacity',
  });
});

test('left: -9999px で :focus のとき left: 0 に戻るスキップリンクは見える', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-skip-link.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({ visible: true, reason: null });
});

test('left: -9999px のままのリンクは outside-viewport で見えない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-offscreen-link.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({
    visible: false,
    reason: 'outside-viewport',
  });
});

test('ページの下の方にあるリンクはフォーカスのスクロールで届くので見える', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-below-fold.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({ visible: true, reason: null });
});

test('フォーカスで 200ms の transition をかけて開くメニューのリンクは、動いている途中なので visible が null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-opening-menu.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({ visible: null, reason: null });
});

test('transition を指定してあるだけで開かないメニューのリンクは ancestor-overflow で見えない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-closed-transition.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({
    visible: false,
    reason: 'ancestor-overflow',
  });
});

test('overflow: auto の祖先の外にあるリンクはスクロールで届くかもしれないので visible が null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-scroll-container.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({ visible: null, reason: null });
});

test('transform: scale(0.5) の祖先の中で切り取られたリンクは位置を決められず visible が null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-scaled-clip.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({ visible: null, reason: null });
});

test('ふつうのボタンは visible が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-plain-button.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({ visible: true, reason: null });
});

test('outline だけに transition をかけたふつうのボタンは、見え方に関わらない変化なので visible が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-decorative-transition.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({ visible: true, reason: null });
});

test('outline だけに transition をかけたリンクが高さ 0 の閉じたメニューの中にあると ancestor-overflow で見えない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-closed-decorative.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({
    visible: false,
    reason: 'ancestor-overflow',
  });
});

test('html に overflow: hidden があり、フォーカスでスクロールした先のボタンは visible が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-root-overflow.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({ visible: true, reason: null });
});

test('body に overflow-x: hidden があり left: -9999px のままのリンクは outside-viewport で見えない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-body-overflow-x.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({
    visible: false,
    reason: 'outside-viewport',
  });
});

test('ページを下へスクロールした状態で、position: fixed; top: -100px のヘッダーの中のリンクは outside-viewport で見えない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-fixed-above.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({
    visible: false,
    reason: 'outside-viewport',
  });
});

test('dir="rtl" のページで right: -9999px のままのリンクは outside-viewport で見えない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-rtl-offscreen.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({
    visible: false,
    reason: 'outside-viewport',
  });
});

test('overflow-x: clip だけの箱の下へはみ出したボタンは、縦を切り取られないので visible が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-clip-x-only.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({ visible: true, reason: null });
});

test('scale(0.5) の中の overflow: clip の箱に、縮小前の寸法では重なって見えるボタンは、切り取られているかもしれないので visible が null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-scaled-overlap.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({ visible: null, reason: null });
});

test('overflow: clip の箱の overflow-clip-margin: 40px の中に置いたボタンは、切り取りの線が広がるので visible が null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-clip-margin.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({ visible: null, reason: null });
});

test('祖先に transform: scale(0) があり大きさ 0 になったボタンは visible が null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-scale-zero.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({ visible: null, reason: null });
});

test('opacity: 0 や overflow: hidden を持つ display: contents の祖先の中のボタンは、祖先が箱を作らないので visible が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-display-contents.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({ visible: true, reason: null });
});

test('overflow: hidden を持つインライン要素の中のボタンは、インラインは切り取れないので visible が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-inline-overflow.html`,
    outputDir: testInfo.outputDir,
  });

  const button = result.details.allElements.find((e) => e.tag === 'BUTTON');
  expect(button?.visibility).toEqual({ visible: true, reason: null });
});

test('左上に置いた幅と高さが 0 でも中の文字がはみ出して見えるリンクは、outside-viewport と決めず visible が null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-zero-size-overflow.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({ visible: null, reason: null });
});

test('overflow: hidden の箱の中にある幅と高さが 0 で文字がはみ出して見えるリンクは、ancestor-overflow と決めず visible が null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-zero-size-in-box.html`,
    outputDir: testInfo.outputDir,
  });

  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({ visible: null, reason: null });
});
