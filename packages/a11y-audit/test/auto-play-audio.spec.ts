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
