/**
 * Unit tests for the pure normalization mappers, the envelope assembler, and
 * the cross-check merge. No browser needed — fixtures are hand-built details
 * objects (the same data a runner would gather).
 */

import { test, expect } from '@playwright/test';
import {
  buildAuditResult,
  mergeNormalizedResults,
  normalizeAutocompleteAudit,
  normalizeAutoPlayDetection,
  normalizeFocusCheck,
  normalizeTargetSizeCheck,
  normalizeTextSpacingCheck,
  normalizeTimeLimitDetector,
} from '../dist/index.js';
import type {
  AutoPlayDetectionDetails,
  FocusCheckDetails,
  MediaPlaybackRecord,
  TargetSizeCheckDetails,
  TargetSizeIssue,
  TextSpacingCheckDetails,
  TimeLimitDetectorDetails,
} from '../dist/index.js';

const targetSizeIssue = (
  overrides: Partial<TargetSizeIssue> = {},
): TargetSizeIssue => ({
  selector: '#b1',
  tagName: 'button',
  html: '<button id="b1">a</button>',
  htmlTruncated: false,
  role: null,
  accessibleName: 'a',
  width: 10,
  height: 10,
  minDimension: 10,
  level: 'fail-aa',
  exception: null,
  exceptionDetails: null,
  exceptionAssessment: 'not-assessed',
  href: null,
  spacing: null,
  ...overrides,
});

const emptyFocusDetails = (
  overrides: Partial<FocusCheckDetails> = {},
): FocusCheckDetails => ({
  totalFocusableElements: 0,
  elementsWithFocusStyle: 0,
  elementsWithoutFocusStyle: 0,
  issues: [],
  onFocusViolations: [],
  focusObscuredIssues: [],
  elementsWithObscuredFocus: 0,
  allElements: [],
  interrupted: false,
  screenshotPath: '',
  ...overrides,
});

/**
 * An unmuted <audio> in the main frame that was audible at every sample
 * (6 seconds with sound) and is still playing.
 */
const playingAudio = (
  overrides: Partial<MediaPlaybackRecord> = {},
): MediaPlaybackRecord => ({
  tag: 'audio',
  selector: '#bgm',
  html: '<audio id="bgm" autoplay="">',
  htmlTruncated: false,
  frame: null,
  framePath: [],
  shadowHosts: [],
  audibleSeconds: 6,
  autoplay: true,
  loop: false,
  controls: false,
  visible: false,
  paused: false,
  ended: false,
  muted: false,
  volume: 1,
  playbackRate: 1,
  removed: false,
  documentRemoved: false,
  duration: 10,
  endless: false,
  currentTime: 6,
  playedSeconds: 6,
  hasError: false,
  audioDecodedBytes: 96000,
  controlsInFrame: [],
  ...overrides,
});

/** auto-play-detection details with no moving content and no media. */
const autoPlayDetails = (
  overrides: Partial<AutoPlayDetectionDetails> = {},
): AutoPlayDetectionDetails => ({
  screenshotRecords: [],
  comparisons: [],
  hasAutoPlayContent: false,
  stopsWithin5Seconds: false,
  pauseControls: {
    found: false,
    controls: [],
    carouselIndicators: [],
    hasAccessibleName: false,
  },
  pauseVerification: {
    attempted: false,
    controlClicked: null,
    beforeClickDiffPercent: null,
    afterClickDiffPercent: null,
    pauseWorked: null,
    error: 'No auto-play detected',
  },
  recommendation: '',
  mediaElements: [],
  unmeasuredFrames: 0,
  ...overrides,
});

const AUDIO_RULE = 'a11y-skills/auto-play-audio';

/** Which bucket the auto-play-audio rule landed in. */
const audioBucket = (details: AutoPlayDetectionDetails) => {
  const buckets = normalizeAutoPlayDetection(details);
  return (['violations', 'incomplete', 'passes', 'inapplicable'] as const).find(
    (bucket) => buckets[bucket].some((r) => r.id === AUDIO_RULE),
  );
};

/** The auto-play-audio nodes in the incomplete bucket. */
const audioIncompleteNodes = (details: AutoPlayDetectionDetails) =>
  normalizeAutoPlayDetection(details).incomplete.find(
    (r) => r.id === AUDIO_RULE,
  )?.nodes ?? [];

// =============================================================================
// Classification boundaries
// =============================================================================

test('target-size: not-assessed findings go to incomplete, ruled-out to violations', () => {
  const details: TargetSizeCheckDetails = {
    totalTargetsChecked: 3,
    failAA: [
      targetSizeIssue({
        selector: '#review',
        exceptionAssessment: 'not-assessed',
      }),
      targetSizeIssue({
        selector: '#confirmed',
        exceptionAssessment: 'ruled-out',
      }),
    ],
    failAAAOnly: [],
    passedTargets: 1,
    occludedTargets: 0,
    exceptedTargets: [],
    summary: {
      failAACount: 2,
      failAAAOnlyCount: 0,
      passCount: 1,
      exceptedCount: 0,
      verifiedCount: 0,
    },
  };

  const buckets = normalizeTargetSizeCheck(details);

  const violation = buckets.violations.find(
    (r) => r.id === 'a11y-skills/target-size-minimum',
  );
  const incomplete = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-minimum',
  );
  expect(violation?.nodes.map((n) => n.target[0])).toEqual(['#confirmed']);
  expect(incomplete?.nodes.map((n) => n.target[0])).toEqual(['#review']);
  expect(buckets.checkedNodes).toBe(3);
});

test('target-size: verified spacing exception passes 2.5.8 and is reviewed under 2.5.5', () => {
  const details: TargetSizeCheckDetails = {
    totalTargetsChecked: 2,
    failAA: [
      targetSizeIssue({
        selector: '#crowded',
        spacing: {
          diameter: 24,
          center: { x: 30, y: 30 },
          applies: false,
          intersections: [
            { selector: '#next', kind: 'circle', distance: 22, required: 24 },
          ],
        },
      }),
    ],
    failAAAOnly: [],
    passedTargets: 0,
    occludedTargets: 0,
    exceptedTargets: [
      targetSizeIssue({
        selector: '#spaced',
        exception: 'spacing',
        exceptionDetails: 'No other target within a 24px circle',
        exceptionAssessment: 'verified',
        spacing: {
          diameter: 24,
          center: { x: 100, y: 30 },
          applies: true,
          intersections: [],
        },
      }),
    ],
    summary: {
      failAACount: 1,
      failAAAOnlyCount: 0,
      passCount: 0,
      exceptedCount: 1,
      verifiedCount: 1,
    },
  };
  const buckets = normalizeTargetSizeCheck(details);

  const minimum = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-minimum',
  );
  expect(minimum?.nodes.map((n) => n.target[0])).toEqual(['#crowded']);
  expect(minimum?.nodes[0]?.failureSummary).toContain(
    'intersects the circle of undersized target #next (22px, requires 24px)',
  );
  expect(buckets.violations).toHaveLength(0);

  const enhanced = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-enhanced',
  );
  expect(enhanced?.nodes.map((n) => n.target[0])).toEqual(['#spaced']);
  expect(enhanced?.nodes[0]?.failureSummary).toContain('spacing exception');
});

test('target-size: only verified exceptions → minimum passes', () => {
  const details: TargetSizeCheckDetails = {
    totalTargetsChecked: 1,
    failAA: [],
    failAAAOnly: [],
    passedTargets: 0,
    occludedTargets: 0,
    exceptedTargets: [
      targetSizeIssue({
        exception: 'spacing',
        exceptionAssessment: 'verified',
        spacing: {
          diameter: 24,
          center: { x: 10, y: 10 },
          applies: true,
          intersections: [],
        },
      }),
    ],
    summary: {
      failAACount: 0,
      failAAAOnlyCount: 0,
      passCount: 0,
      exceptedCount: 1,
      verifiedCount: 1,
    },
  };
  const buckets = normalizeTargetSizeCheck(details);
  expect(
    buckets.passes.some((r) => r.id === 'a11y-skills/target-size-minimum'),
  ).toBe(true);
  expect(
    buckets.incomplete.some((r) => r.id === 'a11y-skills/target-size-minimum'),
  ).toBe(false);
});

test('target-size: correct WCAG tags per rule (AA vs AAA)', () => {
  const details: TargetSizeCheckDetails = {
    totalTargetsChecked: 2,
    failAA: [targetSizeIssue()],
    failAAAOnly: [
      targetSizeIssue({
        selector: '#mid',
        width: 30,
        height: 30,
        minDimension: 30,
        level: 'fail-aaa-only',
      }),
    ],
    passedTargets: 0,
    occludedTargets: 0,
    exceptedTargets: [],
    summary: {
      failAACount: 1,
      failAAAOnlyCount: 1,
      passCount: 0,
      exceptedCount: 0,
      verifiedCount: 0,
    },
  };

  const buckets = normalizeTargetSizeCheck(details);
  const minimum = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-minimum',
  );
  const enhanced = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/target-size-enhanced',
  );
  expect(minimum?.tags).toEqual(
    expect.arrayContaining(['a11y-skills', 'wcag22aa', 'wcag258']),
  );
  expect(enhanced?.tags).toEqual(
    expect.arrayContaining(['a11y-skills', 'wcag21aaa', 'wcag255']),
  );
});

test('focus check: zero focusable elements → all rules inapplicable', () => {
  const buckets = normalizeFocusCheck(emptyFocusDetails());
  expect(buckets.violations).toEqual([]);
  expect(buckets.incomplete).toEqual([]);
  expect(buckets.passes).toEqual([]);
  expect(buckets.inapplicable.map((r) => r.id).sort()).toEqual([
    'a11y-skills/focus-not-obscured',
    'a11y-skills/focus-not-obscured-enhanced',
    'a11y-skills/focus-visible',
    'a11y-skills/no-context-change-on-focus',
  ]);
});

test('focus check: on-focus navigation is a confirmed violation, missing style is not', () => {
  const element = {
    tag: 'A',
    role: null,
    name: 'go',
    selector: '#go',
    html: '<a id="go" href="/x">go</a>',
    htmlTruncated: false,
  };
  const buckets = normalizeFocusCheck(
    emptyFocusDetails({
      totalFocusableElements: 2,
      elementsWithoutFocusStyle: 1,
      issues: [element],
      onFocusViolations: [
        { element, fromUrl: 'a:b', toUrl: 'a:c', changeType: 'navigation' },
      ],
    }),
  );

  expect(buckets.violations.map((r) => r.id)).toEqual([
    'a11y-skills/no-context-change-on-focus',
  ]);
  expect(buckets.incomplete.map((r) => r.id)).toContain(
    'a11y-skills/focus-visible',
  );
  const violation = buckets.violations[0];
  expect(violation.nodes[0].failureSummary).toContain('navigation');
});

test('focus check: retries exhausted with no identified 3.2.1 element → on-focus rule is incomplete, not passes', () => {
  const buckets = normalizeFocusCheck(
    emptyFocusDetails({
      totalFocusableElements: 2,
      interrupted: true,
      onFocusViolations: [],
    }),
  );

  expect(
    buckets.passes.some(
      (r) => r.id === 'a11y-skills/no-context-change-on-focus',
    ),
  ).toBe(false);
  const incomplete = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/no-context-change-on-focus',
  );
  expect(incomplete?.nodes.map((n) => n.target[0])).toEqual(['html']);
  expect(incomplete?.nodes[0]?.failureSummary).toContain('could not');
});

test('focus check: walk stopped by a limit right after an unidentified navigation → on-focus rule is incomplete, not passes', () => {
  const buckets = normalizeFocusCheck(
    emptyFocusDetails({
      totalFocusableElements: 1,
      interrupted: false,
      unidentifiedNavigation: true,
      onFocusViolations: [],
    }),
  );

  expect(buckets.incomplete.map((r) => r.id)).toContain(
    'a11y-skills/no-context-change-on-focus',
  );
  expect(
    buckets.passes.some(
      (r) => r.id === 'a11y-skills/no-context-change-on-focus',
    ),
  ).toBe(false);
});

test('focus check: an unidentified navigation does not hide confirmed 3.2.1 violations', () => {
  const element = {
    tag: 'A',
    role: null,
    name: 'go',
    selector: '#go',
    html: '<a id="go" href="/x">go</a>',
    htmlTruncated: false,
  };
  const buckets = normalizeFocusCheck(
    emptyFocusDetails({
      totalFocusableElements: 2,
      unidentifiedNavigation: true,
      onFocusViolations: [
        { element, fromUrl: 'a:b', toUrl: 'a:c', changeType: 'navigation' },
      ],
    }),
  );

  const violation = buckets.violations.find(
    (r) => r.id === 'a11y-skills/no-context-change-on-focus',
  );
  expect(violation?.nodes.map((n) => n.target[0])).toEqual(['#go']);
});

test('focus check: retries exhausted before any element was recorded → on-focus rule is incomplete, not inapplicable', () => {
  const buckets = normalizeFocusCheck(
    emptyFocusDetails({
      totalFocusableElements: 0,
      interrupted: true,
      onFocusViolations: [],
    }),
  );

  expect(buckets.incomplete.map((r) => r.id)).toEqual([
    'a11y-skills/no-context-change-on-focus',
  ]);
  expect(
    buckets.inapplicable.some(
      (r) => r.id === 'a11y-skills/no-context-change-on-focus',
    ),
  ).toBe(false);
});

test('text-spacing clipping is a confirmed violation', () => {
  const details: TextSpacingCheckDetails = {
    totalElementsChecked: 5,
    clippedElements: [
      {
        selector: '.box',
        tagName: 'div',
        html: '<div class="box">text</div>',
        htmlTruncated: false,
        beforeMetrics: {
          scrollWidth: 80,
          scrollHeight: 20,
          clientWidth: 80,
          clientHeight: 20,
        },
        afterMetrics: {
          scrollWidth: 120,
          scrollHeight: 20,
          clientWidth: 80,
          clientHeight: 20,
        },
        overflow: 'hidden',
        overflowX: 'hidden',
        overflowY: 'visible',
        issueType: 'horizontal-clip',
      },
    ],
  };
  const buckets = normalizeTextSpacingCheck(details);
  expect(buckets.violations.map((r) => r.id)).toEqual([
    'a11y-skills/text-spacing',
  ]);
});

test('time-limit: meta refresh and timers are incomplete; timers are page-level', () => {
  const details: TimeLimitDetectorDetails = {
    metaRefresh: [
      {
        content: '30',
        seconds: 30,
        url: null,
        html: '<meta http-equiv="refresh" content="30">',
        htmlTruncated: false,
      },
    ],
    timers: [{ type: 'setInterval', delayMs: 60000, callStack: null }],
    countdownIndicators: [],
    hasTimeLimits: true,
  };
  const buckets = normalizeTimeLimitDetector(details);
  expect(buckets.violations).toEqual([]);
  const ids = buckets.incomplete.map((r) => r.id);
  expect(ids).toContain('a11y-skills/meta-refresh');
  expect(ids).toContain('a11y-skills/time-limit-timer');
  const timerRule = buckets.incomplete.find(
    (r) => r.id === 'a11y-skills/time-limit-timer',
  );
  expect(timerRule?.nodes[0].target).toEqual(['html']);
  expect(timerRule?.nodes[0].html.length).toBeGreaterThan(0);
});

test('auto-play-audio: audio/video が無く読めない frame も無ければ inapplicable になる', () => {
  expect(audioBucket(autoPlayDetails())).toBe('inapplicable');
});

test('auto-play-audio: 消音でない音が 3 秒を超えて鳴り、見える controls が無ければその要素が incomplete になる', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({ mediaElements: [playingAudio()] }),
  );
  expect(nodes).toHaveLength(1);
  expect(nodes[0]?.target).toEqual(['#bgm']);
  expect(nodes[0]?.html).toBe('<audio id="bgm" autoplay="">');
});

test('auto-play-audio: ずっと muted で再生していれば passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [playingAudio({ muted: true, audibleSeconds: 0 })],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: ずっと volume 0 で再生していれば passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [playingAudio({ volume: 0, audibleSeconds: 0 })],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: 音ありで鳴った秒数がちょうど 3 秒なら passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            paused: true,
            ended: true,
            duration: 3,
            currentTime: 3,
            playedSeconds: 3,
            audibleSeconds: 3,
          }),
        ],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: 最後の測定で消音されていても、音ありで鳴った秒数が 3 秒を超えていれば incomplete になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [playingAudio({ muted: true, audibleSeconds: 4 })],
      }),
    ),
  ).toBe('incomplete');
});

test('auto-play-audio: played の合計が 2 秒（ループ）で止まっていても、音ありで鳴った秒数が 3 秒を超えていれば incomplete になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            loop: true,
            paused: true,
            duration: 2,
            currentTime: 1,
            playedSeconds: 2,
            audibleSeconds: 4,
          }),
        ],
      }),
    ),
  ).toBe('incomplete');
});

test('auto-play-audio: 音ありで鳴った秒数が 0 でも、最後の測定で音ありで再生中で残りが 3 秒を超えれば incomplete になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({ duration: 30, currentTime: 6.5, audibleSeconds: 0 }),
        ],
      }),
    ),
  ).toBe('incomplete');
});

test('auto-play-audio: 最後の測定で音ありで再生中でも、残りがちょうど 3 秒なら passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({ duration: 10, currentTime: 7, audibleSeconds: 0 }),
        ],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: 最後の測定で音ありで再生中の loop なら、残りが短くても incomplete になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            loop: true,
            duration: 2,
            currentTime: 1.5,
            audibleSeconds: 0,
          }),
        ],
      }),
    ),
  ).toBe('incomplete');
});

test('auto-play-audio: 最後の測定で音ありで再生中の終わりのない配信なら incomplete になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({ duration: null, endless: true, audibleSeconds: 0 }),
        ],
      }),
    ),
  ).toBe('incomplete');
});

test('auto-play-audio: 残りが 3 秒を超えていても、最後の測定で消音されていれば鳴った秒数で判断し passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            muted: true,
            duration: 30,
            currentTime: 6.5,
            audibleSeconds: 0,
          }),
        ],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: 2 倍速で残り 7 秒（実時間 3.5 秒）なら、この先も鳴り続けるとして incomplete になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            playbackRate: 2,
            duration: 10,
            currentTime: 3,
            audibleSeconds: 0,
          }),
        ],
      }),
    ),
  ).toBe('incomplete');
});

test('auto-play-audio: 2 倍速で残り 6 秒（実時間ちょうど 3 秒）なら passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            playbackRate: 2,
            duration: 10,
            currentTime: 4,
            audibleSeconds: 0,
          }),
        ],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: 0.5 倍速で残り 2 秒（実時間 4 秒）なら、この先も鳴り続けるとして incomplete になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            playbackRate: 0.5,
            duration: 10,
            currentTime: 8,
            audibleSeconds: 0,
          }),
        ],
      }),
    ),
  ).toBe('incomplete');
});

test('auto-play-audio: 0.5 倍速で残り 1.5 秒（実時間ちょうど 3 秒）なら passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            playbackRate: 0.5,
            duration: 10,
            currentTime: 8.5,
            audibleSeconds: 0,
          }),
        ],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: これから鳴り続けることで候補になったときは、説明にそう書く', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [
        playingAudio({ duration: 30, currentTime: 6.5, audibleSeconds: 0 }),
      ],
    }),
  );
  expect(nodes[0]?.failureSummary).toContain(
    'will keep playing with sound for more than 3s',
  );
});

test('auto-play-audio: 説明文に音ありで鳴った秒数と、記録は検査の開始からであることが入る', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({ mediaElements: [playingAudio({ audibleSeconds: 4 })] }),
  );
  expect(nodes[0]?.failureSummary).toContain('4.0s with sound');
  expect(nodes[0]?.failureSummary).toContain('not from page load');
});

test('auto-play-audio: 見えている controls 付きの要素なら鳴っていても passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [playingAudio({ controls: true, visible: true })],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: controls 属性があっても見えていなければ incomplete になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [playingAudio({ controls: true, visible: false })],
      }),
    ),
  ).toBe('incomplete');
});

test('auto-play-audio: 見えているか決めきれない controls 付きの要素は incomplete になり、説明にそう書く', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [playingAudio({ controls: true, visible: null })],
    }),
  );
  expect(nodes).toHaveLength(1);
  expect(nodes[0]?.failureSummary).toContain(
    'could not be determined whether its controls are visible',
  );
});

test('auto-play-audio: 見えない controls の説明には、切り取りや画面外までは見ていないことが入る', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [playingAudio({ controls: true, visible: false })],
    }),
  );
  expect(nodes[0]?.failureSummary).toContain('clipping');
});

test('auto-play-audio: iframe の中の要素は target が iframe の経路と要素の selector の順になり、説明に frame の URL が入る', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [
        playingAudio({
          frame: { url: 'https://player.example/embed', selector: '#player' },
          framePath: ['#player'],
        }),
      ],
    }),
  );
  expect(nodes[0]?.target).toEqual(['#player', '#bgm']);
  expect(nodes[0]?.failureSummary).toContain('https://player.example/embed');
});

test('auto-play-audio: 入れ子の iframe と shadow root の中の要素は、target に外側から順にすべての経路が入る', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [
        playingAudio({
          selector: 'div > audio',
          frame: { url: 'https://player.example/inner', selector: '#inner' },
          framePath: ['#outer', '#inner'],
          shadowHosts: ['#host'],
        }),
      ],
    }),
  );
  expect(nodes[0]?.target).toEqual([
    '#outer',
    '#inner',
    '#host',
    'div > audio',
  ]);
});

test('auto-play-audio: iframe の経路が分からなければ target は shadow host と要素の selector だけになり、説明にそう書く', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [
        playingAudio({
          frame: { url: 'https://player.example/embed', selector: null },
          framePath: null,
        }),
      ],
    }),
  );
  expect(nodes[0]?.target).toEqual(['#bgm']);
  expect(nodes[0]?.failureSummary).toContain('iframe path is unknown');
});

test('auto-play-audio: 同じ frame に止める部品が見つかれば incomplete のまま説明にその名前が入る', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [
        playingAudio({
          controlsInFrame: [
            {
              element: 'button',
              name: 'ミュート',
              matchedBy: 'accessible-name',
              selector: '#mute',
            },
          ],
        }),
      ],
    }),
  );
  expect(nodes).toHaveLength(1);
  expect(nodes[0]?.failureSummary).toContain('"ミュート"');
});

test('auto-play-audio: 止める部品が見つからなければ説明にそう書き、クリックでは確かめていないことも書く', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({ mediaElements: [playingAudio()] }),
  );
  expect(nodes[0]?.failureSummary).toContain('No pause/stop/mute control');
  expect(nodes[0]?.failureSummary).toContain('not clicked');
});

test('auto-play-audio: autoplay 属性があるのに再生が始まっていなければ、ブラウザに止められたとして incomplete になる', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [
        playingAudio({
          paused: true,
          currentTime: 0,
          playedSeconds: 0,
          audibleSeconds: 0,
        }),
      ],
    }),
  );
  expect(nodes).toHaveLength(1);
  expect(nodes[0]?.failureSummary).toContain('did not start');
});

test('auto-play-audio: autoplay 属性があっても読み込みに失敗した要素は passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            paused: true,
            currentTime: 0,
            playedSeconds: 0,
            audibleSeconds: 0,
            hasError: true,
          }),
        ],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: 検査中に DOM から消えた要素は、target がその frame の html になり、説明に消えたことが入る', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [
        playingAudio({
          removed: true,
          paused: true,
          frame: { url: 'https://player.example/embed', selector: '#player' },
          framePath: ['#player'],
        }),
      ],
    }),
  );
  expect(nodes[0]?.target).toEqual(['#player', 'html']);
  expect(nodes[0]?.failureSummary).toContain('removed from the page');
});

test('auto-play-audio: 主フレームで DOM から消えた要素の target は html になる', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [playingAudio({ removed: true, paused: true })],
    }),
  );
  expect(nodes[0]?.target).toEqual(['html']);
});

test('auto-play-audio: frame ごと消えた要素は、説明に frame が消えたか置き換えられたことと元の URL が入る', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [
        playingAudio({
          removed: true,
          documentRemoved: true,
          frame: { url: 'https://player.example/embed', selector: '#player' },
          framePath: [],
        }),
      ],
    }),
  );
  expect(nodes[0]?.target).toEqual(['html']);
  expect(nodes[0]?.failureSummary).toContain(
    'its frame was removed or replaced',
  );
  expect(nodes[0]?.failureSummary).toContain('https://player.example/embed');
});

test('auto-play-audio: 文書の残っている DOM から消えた要素は、記録が再生中でもこの先も鳴り続けるとはみなさず、鳴った秒数が 3 秒以下なら passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            removed: true,
            documentRemoved: false,
            paused: false,
            duration: 30,
            currentTime: 2,
            audibleSeconds: 2,
          }),
        ],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: frame ごと消えた要素の最後の記録が音ありの再生中なら、鳴った秒数が 3 秒以下でも incomplete になり、説明にその後の再生時間は不明と書く', () => {
  const nodes = audioIncompleteNodes(
    autoPlayDetails({
      mediaElements: [
        playingAudio({
          removed: true,
          documentRemoved: true,
          paused: false,
          duration: 30,
          currentTime: 2,
          audibleSeconds: 2,
        }),
      ],
    }),
  );
  expect(nodes).toHaveLength(1);
  expect(nodes[0]?.failureSummary).toContain(
    'playback time after its last record is unknown',
  );
});

test('auto-play-audio: frame ごと消えた要素の最後の記録が消音なら、鳴った秒数が 3 秒以下で passes になる', () => {
  expect(
    audioBucket(
      autoPlayDetails({
        mediaElements: [
          playingAudio({
            removed: true,
            documentRemoved: true,
            paused: false,
            muted: true,
            duration: 30,
            currentTime: 2,
            audibleSeconds: 2,
          }),
        ],
      }),
    ),
  ).toBe('passes');
});

test('auto-play-audio: 読めなかった frame があるとページ単位の incomplete になる', () => {
  const nodes = audioIncompleteNodes(autoPlayDetails({ unmeasuredFrames: 2 }));
  expect(nodes).toHaveLength(1);
  expect(nodes[0]?.target).toEqual(['html']);
  expect(nodes[0]?.failureSummary).toContain('2 frame(s)');
});

test('auto-play: 画面の変化の説明には音を手で確かめる文言を入れない', () => {
  const nodes = normalizeAutoPlayDetection(
    autoPlayDetails({ hasAutoPlayContent: true }),
  ).incomplete.find((r) => r.id === 'a11y-skills/auto-play')?.nodes;
  expect(nodes?.[0]?.failureSummary).not.toContain('audio');
});

test('autocomplete: invalid tokens are violations, missing ones incomplete', () => {
  const field = {
    selector: '#e',
    tagName: 'input',
    html: '<input id="e">',
    htmlTruncated: false,
    inputType: 'text',
    name: 'email',
    id: 'e',
    labelText: 'Email',
    currentAutocomplete: null as string | null,
    expectedToken: 'email',
    matchedBy: 'name' as const,
    issueType: 'missing' as const,
  };
  const buckets = normalizeAutocompleteAudit({
    totalFieldsChecked: 2,
    missingAutocomplete: [field],
    invalidAutocomplete: [
      {
        ...field,
        selector: '#bad',
        currentAutocomplete: 'e-mail',
        issueType: 'invalid',
      },
    ],
  });
  expect(buckets.violations.map((r) => r.id)).toEqual([
    'a11y-skills/autocomplete-invalid',
  ]);
  expect(buckets.incomplete.map((r) => r.id)).toEqual([
    'a11y-skills/autocomplete-missing',
  ]);
});

test('autocomplete: invalid tokens on a field whose purpose was not inferred are incomplete', () => {
  const buckets = normalizeAutocompleteAudit({
    totalFieldsChecked: 1,
    missingAutocomplete: [],
    invalidAutocomplete: [
      {
        selector: '#q',
        tagName: 'input',
        html: '<input id="q" autocomplete="nope">',
        htmlTruncated: false,
        inputType: 'search',
        name: null,
        id: 'q',
        labelText: 'Search',
        currentAutocomplete: 'nope',
        expectedToken: null,
        matchedBy: null,
        issueType: 'invalid',
      },
    ],
  });
  expect(buckets.violations).toEqual([]);
  expect(buckets.incomplete.map((r) => r.id)).toEqual([
    'a11y-skills/autocomplete-invalid-unverified',
  ]);
  expect(buckets.incomplete[0].nodes[0].failureSummary).toBe(
    'autocomplete="nope" is not a valid autocomplete value. The field ' +
      'purpose could not be inferred; confirm whether it collects ' +
      'information about the user.',
  );
});

// =============================================================================
// Envelope contract
// =============================================================================

test('buildAuditResult derives summary from the buckets and stamps the contract fields', () => {
  const details: TextSpacingCheckDetails = {
    totalElementsChecked: 0,
    clippedElements: [],
  };
  const result = buildAuditResult({
    source: 'text-spacing-check',
    url: 'about:blank',
    details,
    buckets: normalizeTextSpacingCheck(details),
  });

  expect(result.source).toBe('text-spacing-check');
  expect(result.url).toBe('about:blank');
  expect(typeof result.timestamp).toBe('string');
  expect(result.disclaimer.coverage).toBeDefined();
  expect(result.summary.violationCount).toBe(result.violations.length);
  expect(result.summary.incompleteCount).toBe(result.incomplete.length);
  expect(result.summary.passCount).toBe(result.passes.length);
});

// =============================================================================
// Merge invariants
// =============================================================================

test('mergeNormalizedResults rejects URL mismatches', () => {
  const details: TextSpacingCheckDetails = {
    totalElementsChecked: 0,
    clippedElements: [],
  };
  const a = buildAuditResult({
    source: 'text-spacing-check',
    url: 'https://example.com/a',
    details,
    buckets: normalizeTextSpacingCheck(details),
  });
  const b = buildAuditResult({
    source: 'reflow-check',
    url: 'https://example.com/b',
    details,
    buckets: normalizeTextSpacingCheck(details),
  });
  expect(() => mergeNormalizedResults([a, b])).toThrow(/URL mismatch/);
});

test('mergeNormalizedResults dedupes nodes and applies bucket priority', () => {
  const mkRule = (nodes: Array<{ sel: string; summary: string }>) => ({
    id: 'a11y-skills/text-spacing',
    impact: 'moderate' as const,
    description: 'd',
    help: 'h',
    helpUrl: 'u',
    tags: ['a11y-skills'],
    nodes: nodes.map((n) => ({
      target: [n.sel],
      html: '<div>',
      htmlTruncated: false,
      failureSummary: n.summary,
    })),
  });
  const base = {
    url: 'https://example.com/',
    details: {},
    summary: { violationCount: 0, incompleteCount: 0, passCount: 0 },
    disclaimer: { message: '', messageEn: '', coverage: '', moreInfo: '' },
  };
  const first = {
    ...base,
    source: 'text-spacing-check' as const,
    timestamp: '2026-01-01T00:00:00.000Z',
    violations: [],
    incomplete: [mkRule([{ sel: '.a', summary: 's1' }])],
    passes: [],
    inapplicable: [],
  };
  const second = {
    ...base,
    source: 'text-spacing-check' as const,
    timestamp: '2026-01-02T00:00:00.000Z',
    violations: [
      mkRule([
        { sel: '.a', summary: 's1' }, // duplicate of first's node
        { sel: '.b', summary: 's2' },
      ]),
    ],
    incomplete: [],
    passes: [],
    inapplicable: [],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged = mergeNormalizedResults([first, second] as any);

  // priority: the rule ends up in violations, not incomplete
  expect(merged.incomplete).toEqual([]);
  expect(merged.violations).toHaveLength(1);
  // node '.a'/'s1' deduplicated across results
  expect(merged.violations[0].nodes.map((n) => n.target[0]).sort()).toEqual([
    '.a',
    '.b',
  ]);
  expect(merged.timestamp).toBe('2026-01-02T00:00:00.000Z');
});
