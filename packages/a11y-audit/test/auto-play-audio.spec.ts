/**
 * auto-play-audio (WCAG 1.4.2): runAutoPlayDetection reads the playback
 * state of every <audio>/<video> in the page and its frames.
 *
 * The fixtures build a 30-second tone in the page (tone.js), so no audio file
 * is checked in. Headless Chromium allows unmuted autoplay, so the tone
 * really plays. Each test waits for the ~6s screenshot window.
 */

import {
  test,
  expect,
  runFixtureCheck,
  assertRuleBuckets,
} from './helpers/fixtures.js';
import Ajv2020 from 'ajv/dist/2020.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import type { AutoPlayDetectionDetails } from '../dist/index.js';
import { runAutoPlayDetection } from '../dist/playwright/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateAutoPlay = ajv.compile(RESULT_SCHEMAS['auto-play-detection']);

test(
  '消音でない音が自動再生され止める部品が無いと、auto-play-audio は incomplete になり再生状態が details に入る',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({
      tag: 'audio',
      selector: '#bgm',
      frame: null,
      autoplay: true,
      paused: false,
      muted: false,
      volume: 1,
      duration: 30,
      controlsInFrame: [],
    });
    expect(media[0]?.playedSeconds).toBeGreaterThan(3);
    expect(
      validateAutoPlay(result),
      JSON.stringify(validateAutoPlay.errors),
    ).toBe(true);
  },
  { timeout: 60_000 },
);

test(
  'muted で自動再生される video だけなら、auto-play-audio は passes になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/clear-muted.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'passes' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]).toMatchObject({ tag: 'video', muted: true });
  },
  { timeout: 60_000 },
);

test(
  '見えている controls 付きの audio なら、音が鳴っていても auto-play-audio は passes になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/clear-visible-controls.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'passes' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]).toMatchObject({
      controls: true,
      visible: true,
      paused: false,
    });
  },
  { timeout: 60_000 },
);

test(
  'controls 付きでも display:none で見えない audio は、auto-play-audio が incomplete になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-hidden-controls.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]).toMatchObject({ controls: true, visible: false });
  },
  { timeout: 60_000 },
);

test(
  '同じページに「ミュート」ボタンがあると、auto-play-audio は incomplete のまま controlsInFrame にそのボタンが入る',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-mute-button.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]?.controlsInFrame).toEqual([
      expect.objectContaining({ name: 'ミュート', selector: '#mute' }),
    ]);
    // The control is found, not clicked: the audio is still unmuted.
    expect(media[0]?.muted).toBe(false);
  },
  { timeout: 60_000 },
);

test(
  '別オリジンの iframe の中で鳴る audio は、auto-play-audio が incomplete になり、target が iframe 経由になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    // `localhost` and `127.0.0.1` are different origins.
    const childUrl = `${baseUrl.replace('127.0.0.1', 'localhost')}/auto-play-audio/frame-child.html`;
    const result = await runFixtureCheck(
      'auto-play-detection',
      `auto-play-audio/finding-iframe.html?child=${encodeURIComponent(childUrl)}`,
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]?.frame).toEqual({ url: childUrl, selector: '#player' });
    const rule = result.incomplete.find(
      (r) => r.id === 'a11y-skills/auto-play-audio',
    );
    expect(rule?.nodes[0]?.target).toEqual(['#player', '#bgm']);
  },
  { timeout: 60_000 },
);

test(
  'audio も video も無いページでは、auto-play-audio は inapplicable になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play/clear.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, {
      'a11y-skills/auto-play-audio': 'inapplicable',
    });
  },
  { timeout: 60_000 },
);

test(
  '祖先が opacity:0 で controls が見えない audio は、auto-play-audio が incomplete になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-ancestor-opacity.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]).toMatchObject({ controls: true, visible: false });
  },
  { timeout: 60_000 },
);

test(
  'iframe 要素が visibility:hidden なら、中の controls が見えていても auto-play-audio は incomplete になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-hidden-iframe.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]).toMatchObject({ controls: true, visible: false });
  },
  { timeout: 60_000 },
);

test(
  '2 秒の音をループで 6 秒鳴らしてから止めると、played の合計は 3 秒以下でも auto-play-audio は incomplete になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-loop-then-stop.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]?.paused).toBe(true);
    expect(media[0]?.playedSeconds).toBeLessThanOrEqual(3);
    expect(media[0]?.audibleSeconds).toBeGreaterThan(3);
  },
  { timeout: 60_000 },
);

test(
  '音ありで 6 秒鳴らしてから消音すると、最後の測定で消音されていても auto-play-audio は incomplete になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-mute-after-playing.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]?.muted).toBe(true);
    expect(media[0]?.audibleSeconds).toBeGreaterThan(3);
  },
  { timeout: 60_000 },
);

test(
  '消音で 6 秒鳴らしてから最後に消音を解くと、音ありで鳴った秒数は 3 秒以下でも、この先も鳴り続けるので auto-play-audio は incomplete になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-unmute-at-end.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]?.muted).toBe(false);
    expect(media[0]?.playedSeconds).toBeGreaterThan(3);
    expect(media[0]?.audibleSeconds).toBeLessThanOrEqual(3);
  },
  { timeout: 60_000 },
);

/**
 * Follow a target the way auto-play-audio defines it: each selector is looked
 * up in the document or shadow root opened by the element before it (an
 * iframe's document, or a shadow host's shadow root). Same-origin only.
 * Returns the found element's data-marker.
 */
function resolveTargetMarker(
  page: import('@playwright/test').Page,
  target: string[],
): Promise<string | null> {
  return page.evaluate((selectors) => {
    let scope: Document | ShadowRoot = document;
    let element: Element | null = null;
    for (const selector of selectors) {
      // tagName, not instanceof: an iframe inside another frame belongs to
      // that frame's realm.
      if (element?.tagName === 'IFRAME') {
        scope = (element as HTMLIFrameElement).contentDocument as Document;
      } else if (element?.shadowRoot) {
        scope = element.shadowRoot;
      }
      element = scope.querySelector(selector);
    }
    return element?.getAttribute('data-marker') ?? null;
  }, target);
}

test(
  'shadow root の中の audio の target は、たどると元の要素を指す',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-nested.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    const nodes =
      result.incomplete.find((r) => r.id === 'a11y-skills/auto-play-audio')
        ?.nodes ?? [];
    const shadowNode = nodes.find((n) => n.html.includes('shadow-audio'));
    expect(shadowNode?.target).toEqual(['#host', 'div > audio']);
    expect(await resolveTargetMarker(page, shadowNode?.target ?? [])).toBe(
      'shadow-audio',
    );
  },
  { timeout: 60_000 },
);

test(
  '入れ子の iframe の中の audio の target は、外側の iframe から順にたどると元の要素を指す',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-nested.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    const nodes =
      result.incomplete.find((r) => r.id === 'a11y-skills/auto-play-audio')
        ?.nodes ?? [];
    const childNode = nodes.find((n) => n.html.includes('child-audio'));
    expect(childNode?.target).toEqual(['#outer', '#inner', '#bgm']);
    expect(await resolveTargetMarker(page, childNode?.target ?? [])).toBe(
      'child-audio',
    );
  },
  { timeout: 60_000 },
);

test(
  '祖先の clip-path で controls が切り取られた audio は、見えているか決めきれず auto-play-audio が incomplete になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-clipped-controls.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]).toMatchObject({ controls: true, visible: null });
  },
  { timeout: 60_000 },
);

test(
  '検査を始めて 3.5 秒後に停止すると、測定の間に止めても音ありで鳴った 3.5 秒が数えられ auto-play-audio は incomplete になる',
  async ({ baseUrl, page }, testInfo) => {
    await page.goto(`${baseUrl}/auto-play-audio/finding.html`, {
      waitUntil: 'networkidle',
    });

    const [result] = await Promise.all([
      runAutoPlayDetection({
        page,
        outputDir: testInfo.outputDir,
        quiet: true,
      }),
      page
        .waitForTimeout(3500)
        .then(() =>
          page.evaluate(() => document.querySelector('audio')?.pause()),
        ),
    ]);

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = result.details.mediaElements;
    expect(media[0]?.paused).toBe(true);
    expect(media[0]?.audibleSeconds).toBeGreaterThan(3);
  },
  { timeout: 60_000 },
);

test(
  '検査を始めて 3.5 秒後に消音すると、測定の間に消音しても音ありで鳴った 3.5 秒が数えられ auto-play-audio は incomplete になる',
  async ({ baseUrl, page }, testInfo) => {
    await page.goto(`${baseUrl}/auto-play-audio/finding.html`, {
      waitUntil: 'networkidle',
    });

    const [result] = await Promise.all([
      runAutoPlayDetection({
        page,
        outputDir: testInfo.outputDir,
        quiet: true,
      }),
      page.waitForTimeout(3500).then(() =>
        page.evaluate(() => {
          const audio = document.querySelector('audio');
          if (audio) audio.muted = true;
        }),
      ),
    ]);

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = result.details.mediaElements;
    expect(media[0]?.muted).toBe(true);
    expect(media[0]?.audibleSeconds).toBeGreaterThan(3);
  },
  { timeout: 60_000 },
);

test(
  '同じ page で 2 回検査すると、2 回目は前回の再生履歴を含まず、その間ずっと消音なら auto-play-audio は passes になる',
  async ({ baseUrl, page }, testInfo) => {
    await page.goto(`${baseUrl}/auto-play-audio/finding.html`, {
      waitUntil: 'networkidle',
    });
    const first = await runAutoPlayDetection({
      page,
      outputDir: testInfo.outputDir,
      quiet: true,
    });
    await page.evaluate(() => {
      const audio = document.querySelector('audio');
      if (audio) audio.muted = true;
    });

    const second = await runAutoPlayDetection({
      page,
      outputDir: testInfo.outputDir,
      quiet: true,
    });

    expect(first.details.mediaElements[0]?.audibleSeconds).toBeGreaterThan(3);
    assertRuleBuckets(second, { 'a11y-skills/auto-play-audio': 'passes' });
    expect(second.details.mediaElements[0]?.audibleSeconds).toBe(0);
  },
  { timeout: 90_000 },
);

test(
  '検査開始の 0.2 秒後に追加され 3.7 秒後に止まった audio は、追加された時点から数えられ auto-play-audio が incomplete になる',
  async ({ baseUrl, page }, testInfo) => {
    await page.goto(`${baseUrl}/auto-play-audio/no-media.html`, {
      waitUntil: 'networkidle',
    });

    const [result] = await Promise.all([
      runAutoPlayDetection({
        page,
        outputDir: testInfo.outputDir,
        quiet: true,
      }),
      page.waitForTimeout(200).then(() =>
        page.evaluate(() => {
          const audio = document.createElement('audio');
          audio.id = 'late';
          audio.autoplay = true;
          audio.src = (
            window as unknown as { toneUrl: () => string }
          ).toneUrl();
          document.body.append(audio);
        }),
      ),
      page
        .waitForTimeout(3700)
        .then(() =>
          page.evaluate(() =>
            document.querySelector<HTMLAudioElement>('#late')?.pause(),
          ),
        ),
    ]);

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = result.details.mediaElements;
    expect(media[0]?.selector).toBe('#late');
    expect(media[0]?.audibleSeconds).toBeGreaterThan(3);
  },
  { timeout: 60_000 },
);

test(
  '検査中に 3.5 秒鳴ってから DOM から消された audio は、消えたことが分かる印付きで結果に残り auto-play-audio が incomplete になる',
  async ({ baseUrl, page }, testInfo) => {
    await page.goto(`${baseUrl}/auto-play-audio/finding.html`, {
      waitUntil: 'networkidle',
    });

    const [result] = await Promise.all([
      runAutoPlayDetection({
        page,
        outputDir: testInfo.outputDir,
        quiet: true,
      }),
      page.waitForTimeout(3500).then(() =>
        page.evaluate(() => {
          const audio = document.querySelector('audio');
          audio?.pause();
          audio?.remove();
        }),
      ),
    ]);

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = result.details.mediaElements;
    expect(media).toHaveLength(1);
    expect(media[0]?.removed).toBe(true);
    expect(media[0]?.audibleSeconds).toBeGreaterThan(3);
  },
  { timeout: 60_000 },
);

test(
  '高さ 0・overflow:hidden の折り畳みの中で controls 付きの audio が自動再生すると、controls は見えないとして auto-play-audio が incomplete になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-collapsed.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]).toMatchObject({ controls: true, visible: false });
  },
  { timeout: 60_000 },
);

test(
  'slot に割り当てられた audio は、shadow tree 側の包み要素の clip-path も見て、見えているか決めきれず auto-play-audio が incomplete になる',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play-audio/finding-slot-clip.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true },
    );

    assertRuleBuckets(result, { 'a11y-skills/auto-play-audio': 'incomplete' });
    const media = (result.details as AutoPlayDetectionDetails).mediaElements;
    expect(media[0]).toMatchObject({ controls: true, visible: null });
  },
  { timeout: 60_000 },
);
