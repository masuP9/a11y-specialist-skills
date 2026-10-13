/**
 * pointer-gesture-check (WCAG 2.5.1 / 2.5.7): elements that may be operated by
 * dragging, swiping or multiple fingers are reported as candidates
 * (`incomplete`); a human checks for a single-pointer alternative.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import { normalizePointerGestureCheck } from '../dist/index.js';
import type {
  PointerGestureCandidate,
  PointerGestureCheckDetails,
  PointerGestureCheckResult,
} from '../dist/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateEnvelope = ajv.compile(RESULT_SCHEMAS['pointer-gesture-check']);

const GESTURES_ID = 'a11y-skills/pointer-gestures';
const DRAGGING_ID = 'a11y-skills/dragging-movements';

async function runPointerGesture(
  fixture: string,
  context: Parameters<typeof runFixtureCheck>[3],
  baseUrl: string,
  extra: Record<string, unknown> = {},
): Promise<PointerGestureCheckResult> {
  return (await runFixtureCheck(
    'pointer-gesture-check',
    `pointer-gesture/${fixture}`,
    baseUrl,
    context,
    extra,
  )) as PointerGestureCheckResult;
}

// ---------------------------------------------------------------------------
// normalizer (no browser)
// ---------------------------------------------------------------------------

function emptyDetails(
  overrides: Partial<PointerGestureCheckDetails> = {},
): PointerGestureCheckDetails {
  return {
    listenerInspection: 'cdp',
    inspectionError: null,
    candidates: [],
    candidateCounts: {
      total: 0,
      byCriterion: {
        '2.5.1': { found: 0, kept: 0 },
        '2.5.7': { found: 0, kept: 0 },
      },
    },
    listenerNodesTruncated: false,
    pageListeners: [],
    delegationRoots: [],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<PointerGestureCandidate>,
): PointerGestureCandidate {
  return {
    selector: '#target',
    shadowHosts: [],
    html: '<div id="target"></div>',
    htmlTruncated: false,
    tagName: 'div',
    role: null,
    visible: true,
    signals: [],
    criteria: [],
    ...overrides,
  };
}

const listenerLocation = {
  scriptId: '12',
  lineNumber: 4,
  columnNumber: 2,
  handlerPreview: 'function () {}',
};

test('listener を検査できず候補も無いとき、両ルールにページ単位の node が付き Chromium に触れる', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({ listenerInspection: 'unsupported' }),
  );

  expect(buckets.incomplete.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
  for (const rule of buckets.incomplete) {
    expect(rule.nodes[0]?.target).toEqual(['html']);
    expect(rule.nodes[0]?.failureSummary).toContain('Chromium');
  }
});

test('委譲先の根があるとき、候補が無くても両ルールにページ単位の node が付き event delegation を伝える', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({
      delegationRoots: [
        { selector: '#root', shadowHosts: [], eventTypeCount: 25 },
        { selector: '#app', shadowHosts: ['#host'], eventTypeCount: 30 },
      ],
    }),
  );

  expect(buckets.incomplete.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
  for (const rule of buckets.incomplete) {
    expect(rule.nodes).toHaveLength(1);
    expect(rule.nodes[0]?.target).toEqual(['html']);
    expect(rule.nodes[0]?.failureSummary).toContain('event delegation');
    expect(rule.nodes[0]?.failureSummary).toContain('#root (25 types)');
    expect(rule.nodes[0]?.failureSummary).toContain(
      '#host >>> #app (30 types)',
    );
  }
});

test('timeout-unrecoverable のとき、ページ単位 node は属性や部品のしるしではなく検査を飛ばしたことを伝える', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({
      listenerInspection: 'failed',
      inspectionError: 'timeout-unrecoverable',
    }),
  );

  const text = buckets.incomplete[0]?.nodes[0]?.failureSummary ?? '';
  expect(text).toContain(
    'Event listeners could not be inspected (failed: timeout-unrecoverable) and the page scan was skipped, so nothing on this page was examined.',
  );
  expect(text).not.toContain('widget markup');
});

test('timeout など unrecoverable 以外の failed では、属性と部品のしるしから候補を出した旨の文言のままになる', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({ listenerInspection: 'failed', inspectionError: 'timeout' }),
  );

  expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'Event listeners could not be inspected (failed: timeout). Candidates come only from attributes and known widget markup',
  );
});

test('押す・動かす listener を持つ候補は両ルールの確認依頼を、それぞれの基準の文言で出す', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({
      candidates: [
        candidate({
          signals: [
            {
              kind: 'move-listener',
              detail: 'pointerdown+pointermove',
              listener: listenerLocation,
            },
          ],
          criteria: ['2.5.1', '2.5.7'],
        }),
      ],
    }),
  );

  const gestures = buckets.incomplete.find((r) => r.id === GESTURES_ID);
  const dragging = buckets.incomplete.find((r) => r.id === DRAGGING_ID);
  expect(gestures?.nodes[0]?.failureSummary).toContain(
    'single pointer without a path',
  );
  expect(dragging?.nodes[0]?.failureSummary).toContain('without dragging');
});

test('draggable 属性だけの候補は dragging-movements が incomplete で pointer-gestures が inapplicable になる', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({
      candidates: [
        candidate({
          signals: [
            {
              kind: 'draggable-attribute',
              detail: 'draggable="true"',
              listener: null,
            },
          ],
          criteria: ['2.5.7'],
        }),
      ],
    }),
  );

  expect(buckets.incomplete.map((r) => r.id)).toEqual([DRAGGING_ID]);
  expect(buckets.inapplicable.map((r) => r.id)).toEqual([GESTURES_ID]);
});

test('カルーセルのしるしだけの候補は pointer-gestures が incomplete で dragging-movements が inapplicable になる', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({
      candidates: [
        candidate({
          signals: [
            {
              kind: 'widget-carousel',
              detail: '[aria-roledescription="carousel" i]',
              listener: null,
            },
          ],
          criteria: ['2.5.1'],
        }),
      ],
    }),
  );

  expect(buckets.incomplete.map((r) => r.id)).toEqual([GESTURES_ID]);
  expect(buckets.inapplicable.map((r) => r.id)).toEqual([DRAGGING_ID]);
});

test('複数の指を見る document の listener だけがあるとき、pointer-gestures にページ単位 node が 1 つ付き dragging-movements は inapplicable になる', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({
      pageListeners: [
        {
          ...listenerLocation,
          target: 'document',
          type: 'touchstart',
          multipoint: true,
        },
      ],
    }),
  );

  const gestures = buckets.incomplete.find((r) => r.id === GESTURES_ID);
  expect(gestures?.nodes).toHaveLength(1);
  expect(gestures?.nodes[0]?.target).toEqual(['html']);
  expect(buckets.inapplicable.map((r) => r.id)).toEqual([DRAGGING_ID]);
});

test('window の mousemove だけがあり候補が無いとき、両ルールとも inapplicable になる', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({
      pageListeners: [
        {
          ...listenerLocation,
          target: 'window',
          type: 'mousemove',
          multipoint: false,
        },
      ],
    }),
  );

  expect(buckets.incomplete).toEqual([]);
  expect(buckets.inapplicable.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
});

test('2.5.1 の候補が上限で全部切られたとき、候補配列が空でも pointer-gestures が incomplete になる', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({
      candidateCounts: {
        total: 1,
        byCriterion: {
          '2.5.1': { found: 1, kept: 0 },
          '2.5.7': { found: 200, kept: 200 },
        },
      },
    }),
  );

  const gestures = buckets.incomplete.find((r) => r.id === GESTURES_ID);
  expect(gestures?.nodes[0]?.failureSummary).toContain(
    'Only 0 of 1 candidates',
  );
});

test('listener のある要素が上限を超えたとき、候補が無くても両ルールが incomplete になり未検査を伝える', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({ listenerNodesTruncated: true }),
  );

  expect(buckets.incomplete.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
  for (const rule of buckets.incomplete) {
    expect(rule.nodes[0]?.failureSummary).toContain('were not examined');
  }
});

test('shadow root の中の候補は node の target に shadow host を前置する', () => {
  const buckets = normalizePointerGestureCheck(
    emptyDetails({
      candidates: [
        candidate({
          selector: '#swipe',
          shadowHosts: ['#host-a'],
          signals: [
            {
              kind: 'move-listener',
              detail: 'touchstart+touchmove',
              listener: listenerLocation,
            },
          ],
          criteria: ['2.5.1', '2.5.7'],
        }),
      ],
    }),
  );

  const dragging = buckets.incomplete.find((r) => r.id === DRAGGING_ID);
  expect(dragging?.nodes[0]?.target).toEqual(['#host-a', '#swipe']);
});

// ---------------------------------------------------------------------------
// fixtures (Chromium)
// ---------------------------------------------------------------------------

const TEMP_PROPERTY_PREFIX = '__a11yPointerGesture_';

test('dragstart と drop の listener と draggable の li があるとき、dragging-movements だけが incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'sortable.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([DRAGGING_ID]);
  expect(result.inapplicable.map((r) => r.id)).toEqual([GESTURES_ID]);
  const tasks = result.details.candidates.find((c) => c.selector === '#tasks');
  expect(tasks?.signals.map((s) => [s.kind, s.detail])).toEqual([
    ['drag-listener', 'dragstart+drop'],
  ]);
  const draggables = result.details.candidates.filter((c) =>
    c.signals.some((s) => s.kind === 'draggable-attribute'),
  );
  expect(draggables).toHaveLength(3);
});

test('role=slider の要素に pointerdown と pointermove があるとき、widget-slider と move-listener の両方で両ルールが incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'custom-slider.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
  expect(result.details.candidates).toHaveLength(1);
  const thumb = result.details.candidates[0];
  expect(thumb?.selector).toBe('#thumb');
  expect(thumb?.signals.map((s) => s.kind).sort()).toEqual([
    'move-listener',
    'widget-slider',
  ]);
  expect(thumb?.criteria).toEqual(['2.5.1', '2.5.7']);
});

test('touchstart の handler が touches.length を見るとき、multipoint-listener だけの候補で pointer-gestures だけが incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'pinch-zoom.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([GESTURES_ID]);
  expect(result.inapplicable.map((r) => r.id)).toEqual([DRAGGING_ID]);
  expect(result.details.candidates).toHaveLength(1);
  expect(result.details.candidates[0]?.selector).toBe('#photo');
  expect(result.details.candidates[0]?.signals.map((s) => s.kind)).toEqual([
    'multipoint-listener',
  ]);
});

test('listener の無いカルーセルのしるしだけがあるとき、pointer-gestures だけが incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'carousel.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([GESTURES_ID]);
  expect(result.inapplicable.map((r) => r.id)).toEqual([DRAGGING_ID]);
  expect(result.details.candidates[0]?.signals.map((s) => s.kind)).toEqual([
    'widget-carousel',
  ]);
});

test('mousemove の listener だけがある要素は候補にならず、両ルールが inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'hover-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.candidates).toEqual([]);
  expect(result.incomplete).toEqual([]);
  expect(result.inapplicable.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
});

test('25 種類の listener を持つ根の要素は委譲先として記録され、候補にならないが両ルールが incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'delegation-root.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.candidates).toEqual([]);
  expect(result.details.delegationRoots).toEqual([
    { selector: '#root', shadowHosts: [], eventTypeCount: 25 },
  ]);
  expect(result.incomplete.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
});

test('document が委譲先でも、複数の指を見る touchmove は pageListeners に残り pointer-gestures のページ単位 node になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'document-delegation-pinch.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.delegationRoots.map((r) => r.selector)).toEqual([
    'document',
  ]);
  expect(result.details.pageListeners).toHaveLength(1);
  expect(result.details.pageListeners[0]?.type).toBe('touchmove');
  expect(result.details.pageListeners[0]?.multipoint).toBe(true);
  const gestures = result.incomplete.find((r) => r.id === GESTURES_ID);
  expect(
    gestures?.nodes.some((n) => n.failureSummary.includes('"touchmove"')),
  ).toBe(true);
});

test('touchstart の handler が ctx.scale() を呼ぶだけの要素は move-listener のみで multipoint-listener にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'canvas-scale.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.candidates).toHaveLength(1);
  expect(result.details.candidates[0]?.signals.map((s) => s.kind)).toEqual([
    'move-listener',
  ]);
});

test('document にだけ複数の指を見る touchstart があるとき、pointer-gestures にページ単位 node が付く', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'document-pinch.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([GESTURES_ID]);
  expect(result.incomplete[0]?.nodes[0]?.target).toEqual(['html']);
  expect(result.details.pageListeners[0]?.multipoint).toBe(true);
});

test('同じ id が文書と 2 つの shadow root にあるとき、shadowHosts と target で区別でき、shadow 内の draggable も拾う', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'shadow.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(
    result.details.candidates.map((c) => [c.selector, c.shadowHosts]),
  ).toEqual([
    ['#swipe', []],
    ['#swipe', ['#host-a']],
    ['#swipe', ['#host-b']],
    ['#drag-in-shadow', ['#host-b']],
  ]);
  expect(result.details.candidates[3]?.signals.map((s) => s.kind)).toEqual([
    'draggable-attribute',
  ]);
  const dragging = result.incomplete.find((r) => r.id === DRAGGING_ID);
  expect(dragging?.nodes.map((n) => n.target)).toEqual([
    ['#swipe'],
    ['#host-a', '#swipe'],
    ['#host-b', '#swipe'],
    ['#host-b', '#drag-in-shadow'],
  ]);
});

test('iframe の中の要素にだけ listener があるとき、候補にならず両ルールが inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'iframe.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.candidates).toEqual([]);
  expect(result.incomplete).toEqual([]);
});

test('候補が 250 件を超えるとき、200 件で切り、件数を記録して両ルールを incomplete にする', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'many.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.candidates).toHaveLength(200);
  expect(result.details.candidateCounts).toEqual({
    total: 251,
    byCriterion: {
      '2.5.7': { found: 250, kept: 200 },
      '2.5.1': { found: 1, kept: 0 },
    },
  });
  expect(result.incomplete.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
});

test('range input と click だけのページでは候補が無く、両ルールが inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runPointerGesture(
    'none.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.candidates).toEqual([]);
  expect(result.incomplete).toEqual([]);
  expect(result.inapplicable.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
});

for (const fixture of [
  'sortable.html',
  'custom-slider.html',
  'pinch-zoom.html',
  'carousel.html',
  'hover-only.html',
  'delegation-root.html',
  'document-pinch.html',
  'shadow.html',
  'iframe.html',
  'many.html',
  'none.html',
  'document-delegation-pinch.html',
  'canvas-scale.html',
]) {
  test(`${fixture} の結果は JSON Schema に適合する`, async ({
    page,
    browser,
    baseUrl,
  }, testInfo) => {
    const result = await runPointerGesture(
      fixture,
      { page, browser, testInfo },
      baseUrl,
    );

    expect(
      validateEnvelope(result),
      JSON.stringify(validateEnvelope.errors),
    ).toBe(true);
  });
}

test('チェックの後に window へ一時プロパティが残らない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await runPointerGesture(
    'sortable.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const leftover = await page.evaluate(
    (prefix) => Object.keys(window).filter((k) => k.startsWith(prefix)),
    TEMP_PROPERTY_PREFIX,
  );
  expect(leftover).toEqual([]);
});

test('listener の取り出しが時間切れになっても例外を投げず、中止後にページへ書き込まず、両ルールが incomplete になる', async ({
  page,
  baseUrl,
}, testInfo) => {
  await page.goto(`${baseUrl}/pointer-gesture/none.html`);
  await page.evaluate(() => {
    for (let i = 0; i < 3000; i++) {
      const span = document.createElement('span');
      span.addEventListener('pointerdown', () => {});
      span.addEventListener('pointermove', () => {});
      document.body.appendChild(span);
    }
  });

  const result = (await (
    await import('../dist/playwright/index.js')
  ).runPointerGestureCheck({
    page,
    outputDir: testInfo.outputDir,
    inspectionTimeoutMs: 1,
  })) as PointerGestureCheckResult;
  await page.waitForTimeout(1000);

  expect(result.details.listenerInspection).toBe('failed');
  expect(result.details.inspectionError).toBe('timeout');
  expect(result.incomplete.map((r) => r.id).sort()).toEqual([
    DRAGGING_ID,
    GESTURES_ID,
  ]);
  const leftover = await page.evaluate(
    (prefix) => Object.keys(window).filter((k) => k.startsWith(prefix)),
    TEMP_PROPERTY_PREFIX,
  );
  expect(leftover).toEqual([]);
});

test('listener のある要素が 5000 個あるページでも 20 秒以内に終わり、上限超過を記録する', async ({
  page,
  baseUrl,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto(`${baseUrl}/pointer-gesture/none.html`);
  await page.evaluate(() => {
    for (let i = 0; i < 5000; i++) {
      const span = document.createElement('span');
      span.addEventListener('pointerdown', () => {});
      span.addEventListener('pointermove', () => {});
      document.body.appendChild(span);
    }
  });

  const started = Date.now();
  const result = (await (
    await import('../dist/playwright/index.js')
  ).runPointerGestureCheck({
    page,
    outputDir: testInfo.outputDir,
  })) as PointerGestureCheckResult;
  const elapsed = Date.now() - started;

  expect(elapsed).toBeLessThan(20_000);
  expect(result.details.listenerNodesTruncated).toBe(true);
});
