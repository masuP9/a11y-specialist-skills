/**
 * motion-actuation-check (WCAG 2.5.4): listeners for devicemotion /
 * deviceorientation are reported as candidates (`incomplete`), and synthetic
 * events show whether the page reacts.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { runCli } from './helpers/cli.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { MOTION_SIMULATION_TIMEOUT_MS } from '../dist/constants.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import { normalizeMotionActuationCheck } from '../dist/index.js';
import type {
  MotionActuationCheckDetails,
  MotionActuationCheckResult,
} from '../dist/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateEnvelope = ajv.compile(RESULT_SCHEMAS['motion-actuation-check']);

const RULE_ID = 'a11y-skills/motion-actuation';

async function runMotion(
  fixture: string,
  context: Parameters<typeof runFixtureCheck>[3],
  baseUrl: string,
  extra: Record<string, unknown> = {},
): Promise<MotionActuationCheckResult> {
  return (await runFixtureCheck(
    'motion-actuation-check',
    `motion-actuation/${fixture}`,
    baseUrl,
    context,
    extra,
  )) as MotionActuationCheckResult;
}

test('振ると元に戻す devicemotion の listener は incomplete になり、合成イベントで DOM が変わる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runMotion(
    'finding-shake.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.details.listeners).toHaveLength(1);
  expect(result.details.listeners[0]?.target).toBe('window');
  expect(result.details.listeners[0]?.type).toBe('devicemotion');
  expect(result.details.simulation.status).toBe('ran');
  expect(result.details.simulation.results[0]?.domMutations).toBeGreaterThan(0);
});

test('傾けて次へ進む deviceorientation の listener は incomplete になり、合成イベントで DOM が変わる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runMotion(
    'finding-tilt.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.details.listeners[0]?.type).toBe('deviceorientation');
  expect(result.details.simulation.results[0]?.domMutations).toBeGreaterThan(0);
});

test('document にだけ付いた devicemotion の listener は送信せず、動かない可能性を summary に書く', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runMotion(
    'document-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.details.listeners[0]?.target).toBe('document');
  expect(result.details.simulation.status).toBe('skipped-document-only');
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'only to window',
  );
});

test('isTrusted でない合成イベントを無視するページは DOM の変化 0 件で「変化なし」と書く', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runMotion(
    'no-reaction.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.details.simulation.results[0]?.domMutations).toBe(0);
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'no DOM change',
  );
});

test('自分で DOM を更新し続けるページで listener が何もしないとき、合成イベントで変わったとは書かない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runMotion(
    'busy-no-reaction.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const simulated = result.details.simulation.results[0];
  expect(simulated?.baselineDomMutations).toBeGreaterThan(0);
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).not.toContain(
    'Synthetic events changed the DOM',
  );
});

test('合成イベントでページが再読み込みされると、遷移ではなく再読み込みか置き換えと書く', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runMotion(
    'reloads.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const simulated = result.details.simulation.results[0];
  expect(simulated?.navigated).toBe(true);
  expect(simulated?.urlAfter).toBe(result.url);
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'reload or be replaced',
  );
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).not.toContain(
    'navigation to',
  );
});

test('動きの listener が無いページは inapplicable で、送信もしない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runMotion(
    'none.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.inapplicable.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.details.simulation.status).toBe('skipped-no-listeners');
});

test('simulate: false のとき合成イベントを送らず status は disabled で results は空', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runMotion(
    'finding-shake.html',
    { page, browser, testInfo },
    baseUrl,
    { simulate: false },
  );

  expect(result.details.simulation.status).toBe('disabled');
  expect(result.details.simulation.results).toEqual([]);
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'Not simulated.',
  );
});

for (const fixture of [
  'finding-shake.html',
  'finding-tilt.html',
  'document-only.html',
  'no-reaction.html',
  'none.html',
  'navigates.html',
  'busy-no-reaction.html',
  'reloads.html',
]) {
  test(`${fixture} の結果は motion-actuation-check の schema に合う`, async ({
    page,
    browser,
    baseUrl,
  }, testInfo) => {
    const result = await runMotion(
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

test('合成イベントでページが遷移しても例外を投げず、url は元のページのまま、未計測は null になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runMotion(
    'navigates.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const simulated = result.details.simulation.results[0];
  expect(simulated?.navigated).toBe(true);
  expect(simulated?.eventsDispatched).toBeNull();
  expect(simulated?.domMutations).toBeNull();
  expect(result.url).toBe(`${baseUrl}/motion-actuation/navigates.html`);
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).not.toContain(
    'no DOM change',
  );
});

test('戻らない listener があっても期限内に結果を返し、timeout として記録して未計測は null にする', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  test.setTimeout(20_000);
  const startedAt = Date.now();

  const result = await runMotion(
    'hangs.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(Date.now() - startedAt).toBeLessThan(
    MOTION_SIMULATION_TIMEOUT_MS + 5_000,
  );
  const simulated = result.details.simulation.results[0];
  expect(simulated?.error).toBe('timeout');
  expect(simulated?.domMutations).toBeNull();
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
});

test('戻らない listener のページでも CLI は有限時間で終了コード 0 か 1 で終わる', async ({
  baseUrl,
}, testInfo) => {
  test.setTimeout(40_000);
  const { code } = await runCli(
    [
      '--url',
      `${baseUrl}/motion-actuation/hangs.html`,
      '--checks',
      'motion-actuation-check',
      '--output-dir',
      testInfo.outputDir,
    ],
    30_000,
  );

  expect([0, 1]).toContain(code);
});

function summaryFor(
  simulation: Partial<
    MotionActuationCheckDetails['simulation']['results'][number]
  >,
): string {
  const details: MotionActuationCheckDetails = {
    listenerInspection: 'cdp',
    listeners: [
      {
        target: 'window',
        type: 'devicemotion',
        useCapture: false,
        passive: false,
        once: false,
        scriptId: '1',
        lineNumber: 0,
        columnNumber: 0,
        handlerPreview: null,
      },
    ],
    simulation: {
      status: 'ran',
      results: [
        {
          type: 'devicemotion',
          eventsDispatched: 10,
          domMutations: 0,
          baselineDomMutations: 0,
          navigated: false,
          urlAfter: null,
          error: null,
          ...simulation,
        },
      ],
    },
  };
  return (
    normalizeMotionActuationCheck(details, 'http://x/p.html').incomplete[0]
      ?.nodes[0]?.failureSummary ?? ''
  );
}

test('ベースラインが 0 件で送信中に変化があれば、合成イベントで DOM が変わったと書く', () => {
  expect(summaryFor({ domMutations: 1, baselineDomMutations: 0 })).toContain(
    'Synthetic events changed the DOM',
  );
});

test('送信中の変化がベースラインの 2 倍に余裕分 3 を足した数以上なら、合成イベントで DOM が変わったと書く', () => {
  expect(summaryFor({ domMutations: 23, baselineDomMutations: 10 })).toContain(
    'Synthetic events changed the DOM',
  );
});

test('送信中の変化がベースラインの 2 倍に余裕分を足した数に満たなければ、動きが原因とは限らないと書く', () => {
  const summary = summaryFor({ domMutations: 22, baselineDomMutations: 10 });
  expect(summary).not.toContain('Synthetic events changed the DOM');
  expect(summary).toContain('may not come from motion');
});

test('ベースラインの途中で遷移したときは、合成イベントが原因とは書かず反応は不明と書く', () => {
  const summary = summaryFor({
    eventsDispatched: null,
    domMutations: null,
    baselineDomMutations: null,
    navigated: true,
    urlAfter: 'http://x/other.html',
    error: 'navigated-before-dispatch',
  });
  expect(summary).toContain('before synthetic events were sent');
  expect(summary).not.toContain('Synthetic events caused');
});
