/**
 * Auto-play detection fixture tests.
 *
 * Kept in a separate spec file because the pixel-diff detection takes time.
 * timeout is set to 60s per test.
 *
 * Finding fixture: CSS animation covering most of the viewport (no <video>),
 * 7-second cycle asynchronous with the detector's capture window, no pause
 * control. Expected: auto-play (incomplete) finding.
 *
 * Clear fixture: static page with no animation. Expected: auto-play in passes.
 *
 * Note: pixelmatch + pngjs are optional dependencies — they must be present
 * in this dev environment. We do not silently skip if they are absent.
 */

import {
  test,
  expect,
  runFixtureCheck,
  assertRuleBuckets,
} from './helpers/fixtures.js';
import Ajv2020 from 'ajv/dist/2020.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateAutoPlay = ajv.compile(RESULT_SCHEMAS['auto-play-detection']);

// Rule 14: a11y-skills/auto-play (incomplete)
test(
  'auto-play-detection — finding: auto-play (CSS animation, no pause control)',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play/finding.html',
      baseUrl,
      { page, browser, testInfo },
    );

    // The CSS animation should be detected as moving content past 5 seconds.
    // auto-play rule → incomplete bucket.
    assertRuleBuckets(result, {
      'a11y-skills/auto-play': 'incomplete',
    });

    // Detail signal: hasAutoPlayContent should be true
    const details = result.details as {
      hasAutoPlayContent: boolean;
      stopsWithin5Seconds: boolean;
    };
    expect(
      details.hasAutoPlayContent,
      'details.hasAutoPlayContent should be true for CSS animation fixture',
    ).toBe(true);
    expect(
      details.stopsWithin5Seconds,
      'details.stopsWithin5Seconds should be false (animation is infinite)',
    ).toBe(false);

    // Schema validation
    const valid = validateAutoPlay(result);
    expect(
      valid,
      `Schema validation failed: ${JSON.stringify(validateAutoPlay.errors)}`,
    ).toBe(true);
  },
  { timeout: 60_000 },
);

test(
  'auto-play-detection — clear: static page with no animation',
  async ({ baseUrl, page, browser }, testInfo) => {
    const result = await runFixtureCheck(
      'auto-play-detection',
      'auto-play/clear.html',
      baseUrl,
      { page, browser, testInfo },
    );

    // Static page → auto-play rule should be in passes
    assertRuleBuckets(result, {
      'a11y-skills/auto-play': 'passes',
    });

    // Detail signal: hasAutoPlayContent should be false
    const details = result.details as { hasAutoPlayContent: boolean };
    expect(
      details.hasAutoPlayContent,
      'details.hasAutoPlayContent should be false for static page',
    ).toBe(false);

    // Schema validation
    const valid = validateAutoPlay(result);
    expect(
      valid,
      `Schema validation failed: ${JSON.stringify(validateAutoPlay.errors)}`,
    ).toBe(true);
  },
  { timeout: 60_000 },
);
