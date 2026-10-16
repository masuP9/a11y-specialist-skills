/**
 * pointer-cancellation-check (WCAG 2.5.2): pressing a control (down-event only,
 * never released) must not complete a function unless it can be aborted or
 * undone. Observed reactions are reported as `incomplete`.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import { normalizePointerCancellationCheck } from '../dist/index.js';
import { POINTER_CANCELLATION_SETTLE_MS } from '../dist/constants.js';
import type {
  PointerCancellationCheckDetails,
  PointerCancellationCheckResult,
  PointerCancellationFinding,
  PointerCancellationTarget,
} from '../dist/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateEnvelope = ajv.compile(
  RESULT_SCHEMAS['pointer-cancellation-check'],
);

const RULE_ID = 'a11y-skills/pointer-cancellation';

test('押した後の既定の待ちは 150ms（Plan 021 で 5 ページと fixture 17 件の結果が 300ms と同じだった値）', () => {
  expect(POINTER_CANCELLATION_SETTLE_MS).toBe(150);
});

async function runCancel(
  fixture: string,
  context: Parameters<typeof runFixtureCheck>[3],
  baseUrl: string,
  extra: Record<string, unknown> = {},
): Promise<PointerCancellationCheckResult> {
  const result = (await runFixtureCheck(
    'pointer-cancellation-check',
    `pointer-cancellation/${fixture}`,
    baseUrl,
    context,
    { quiet: true, ...extra },
  )) as PointerCancellationCheckResult;
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
  return result;
}

const noListenerTarget: PointerCancellationTarget = {
  selector: '#go',
  shadowHosts: [],
  html: '<button id="go">Go</button>',
  htmlTruncated: false,
  tagName: 'button',
  role: null,
  sources: ['interactive'],
  listeners: { press: [], release: [] },
  pressListener: null,
};

function emptyDetails(
  overrides: Partial<PointerCancellationCheckDetails> = {},
): PointerCancellationCheckDetails {
  return {
    listenerInspection: 'cdp',
    inspectionError: null,
    listenerNodesTruncated: false,
    domObservation: 'used',
    targetsFound: 0,
    targetsTested: 0,
    findings: [],
    untested: [],
    pageListeners: [],
    delegationRootCount: 0,
    restarts: 0,
    aborted: null,
    ...overrides,
  };
}

function bucketOf(
  buckets: ReturnType<typeof normalizePointerCancellationCheck>,
): string {
  const found = (
    ['violations', 'incomplete', 'passes', 'inapplicable'] as const
  )
    .filter((name) => buckets[name].some((r) => r.id === RULE_ID))
    .join(',');
  return found;
}

test('押す対象も押した要素も無いとき、ルールは inapplicable になる', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({ targetsFound: 0, targetsTested: 0 }),
  );

  expect(bucketOf(buckets)).toBe('inapplicable');
});

test('3 つ押して候補が 0 件のとき、ルールは passes になる', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({ targetsFound: 3, targetsTested: 3 }),
  );

  expect(bucketOf(buckets)).toBe('passes');
});

test('押し下げでページが移動した finding は incomplete になり、移動と up-event の確認依頼を伝える', () => {
  const finding: PointerCancellationFinding = {
    target: noListenerTarget,
    kind: 'activated-on-press',
    dispatched: ['pointerdown', 'mousedown'],
    changes: [
      { kind: 'navigation', toUrl: 'http://example.test/landing.html' },
    ],
  };

  const buckets = normalizePointerCancellationCheck(
    emptyDetails({ targetsFound: 1, targetsTested: 1, findings: [finding] }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  const summary = buckets.incomplete[0]?.nodes[0]?.failureSummary ?? '';
  expect(summary).toContain('navigation to http://example.test/landing.html');
  expect(summary).toContain('up-event');
});

test('押し下げで DOM が変わった finding は、追加数と変わった属性名を summary に出す', () => {
  const finding: PointerCancellationFinding = {
    target: noListenerTarget,
    kind: 'activated-on-press',
    dispatched: ['pointerdown', 'mousedown'],
    changes: [
      {
        kind: 'dom',
        addedNodes: 2,
        removedNodes: 0,
        textChanges: 0,
        attributes: ['aria-expanded'],
      },
    ],
  };

  const buckets = normalizePointerCancellationCheck(
    emptyDetails({ targetsFound: 1, targetsTested: 1, findings: [finding] }),
  );

  const summary = buckets.incomplete[0]?.nodes[0]?.failureSummary ?? '';
  expect(summary).toContain('2 added');
  expect(summary).toContain('aria-expanded');
});

test('押す listener だけを持つ press-only-listener の finding は、離す側の listener が無いことを summary に出す', () => {
  const finding: PointerCancellationFinding = {
    target: {
      ...noListenerTarget,
      selector: '#s',
      sources: ['listener'],
      listeners: { press: ['mousedown'], release: [] },
      pressListener: {
        scriptId: '12',
        lineNumber: 4,
        columnNumber: 2,
        handlerPreview: 'function onPressOnly() {}',
      },
    },
    kind: 'press-only-listener',
    dispatched: ['pointerdown', 'mousedown'],
    changes: [],
  };

  const buckets = normalizePointerCancellationCheck(
    emptyDetails({ targetsFound: 1, targetsTested: 1, findings: [finding] }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  const summary = buckets.incomplete[0]?.nodes[0]?.failureSummary ?? '';
  expect(summary).toContain(
    'no pointerup / mouseup / touchend / click listener',
  );
});

test('shadow root の中の finding は node の target に shadow host を前置する', () => {
  const finding: PointerCancellationFinding = {
    target: { ...noListenerTarget, selector: '#b', shadowHosts: ['#host'] },
    kind: 'activated-on-press',
    dispatched: ['pointerdown', 'mousedown'],
    changes: [{ kind: 'dialog', dialogType: 'alert', message: 'x' }],
  };

  const buckets = normalizePointerCancellationCheck(
    emptyDetails({ targetsFound: 1, targetsTested: 1, findings: [finding] }),
  );

  expect(buckets.incomplete[0]?.nodes[0]?.target).toEqual(['#host', '#b']);
});

test('途中で打ち切られたとき、候補が無くても incomplete になり page node が押した数と見つけた数を伝える', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({
      targetsFound: 5,
      targetsTested: 1,
      aborted: { reason: 'timeout', testedCount: 1, foundCount: 5 },
    }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain('1 of 5');
});

test('何もしなくても DOM が変わるページで 2 つ押したとき、incomplete になり page node が背景の変化を伝える', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({
      domObservation: 'ignored-background-activity',
      targetsFound: 2,
      targetsTested: 2,
    }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'changed on its own',
  );
});

test('未検査の要素が 1 件あるとき、passes にせず incomplete になり node に reason が出る', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({
      targetsFound: 3,
      targetsTested: 2,
      untested: [
        {
          target: { ...noListenerTarget, selector: '#hang' },
          reason: 'handler-timeout',
        },
      ],
    }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  const node = buckets.incomplete[0]?.nodes[0];
  expect(node?.target).toEqual(['#hang']);
  expect(node?.failureSummary).toContain('handler-timeout');
});

test('全件が未検査のとき、押した数が 0 でも inapplicable にならず incomplete になる', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({
      targetsFound: 1,
      targetsTested: 0,
      untested: [
        {
          target: { ...noListenerTarget, selector: '#hang' },
          reason: 'handler-timeout',
        },
      ],
    }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
});

test('listener の検査が failed で対象が 0 件のとき、inapplicable にならず page node が検査できなかったことを伝える', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({
      listenerInspection: 'failed',
      inspectionError: 'timeout',
      targetsFound: 0,
      targetsTested: 0,
    }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'could not be inspected (failed: timeout)',
  );
});

test('listener を検査できない unsupported のとき、押した要素が 3 つで候補が 0 件でも incomplete になり Chromium に触れる', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({
      listenerInspection: 'unsupported',
      targetsFound: 3,
      targetsTested: 3,
    }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain('Chromium');
});

test('listener のある要素が上限を超えたとき、候補が 0 件でも incomplete になり未検査を伝える', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({
      listenerNodesTruncated: true,
      targetsFound: 3,
      targetsTested: 3,
    }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'were not examined',
  );
});

test('委譲先の root が 1 つあるとき、押した要素が 3 つで候補が 0 件でも incomplete になり page node が委譲を伝える', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({
      delegationRootCount: 1,
      targetsFound: 3,
      targetsTested: 3,
    }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  const summary = buckets.incomplete[0]?.nodes[0]?.failureSummary ?? '';
  expect(summary).toContain('1 delegation root(s)');
  expect(summary).toContain('Check press behaviour manually.');
});

test('document に押す listener が 1 つあるとき、対象が 0 件でも inapplicable にならず incomplete になり page node が listener の場所を伝える', () => {
  const buckets = normalizePointerCancellationCheck(
    emptyDetails({
      pageListeners: [
        {
          target: 'document',
          type: 'mousedown',
          scriptId: '5',
          lineNumber: 9,
          columnNumber: 2,
          handlerPreview: 'function onDocDown() {}',
        },
      ],
      targetsFound: 0,
      targetsTested: 0,
    }),
  );

  expect(bucketOf(buckets)).toBe('incomplete');
  const summary = buckets.incomplete[0]?.nodes[0]?.failureSummary ?? '';
  expect(summary).toContain(
    'document has a "mousedown" listener (script 5, line 10:3): function onDocDown() {}',
  );
  expect(summary).toContain('through delegation');
});

// ---------------------------------------------------------------------------
// Fixtures (real browser)
// ---------------------------------------------------------------------------

test('mousedown でページが移動するページは incomplete になり、移動後のやり直しで残りのボタンも押される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'mousedown-navigates.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.target.selector).toBe('#go');
  expect(result.details.findings[0]?.kind).toBe('activated-on-press');
  expect(result.details.findings[0]?.changes).toEqual([
    {
      kind: 'navigation',
      toUrl: `${baseUrl}/pointer-cancellation/landing.html`,
    },
  ]);
  expect(result.details.restarts).toBe(1);
  expect(result.details.targetsTested).toBe(2);
});

test('pointerdown でメニューを開く div ボタンは dom の変化を持つ finding になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'pointerdown-opens-menu.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.target.selector).toBe('#menu-btn');
  const change = result.details.findings[0]?.changes[0];
  expect(change?.kind).toBe('dom');
  if (change?.kind === 'dom') {
    expect(change.addedNodes).toBeGreaterThanOrEqual(1);
    expect(change.attributes).toContain('aria-expanded');
  }
});

test('pointerdown を preventDefault するボタンには mousedown を送らない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'pointerdown-prevented.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.target.selector).toBe('#p');
  expect(result.details.findings[0]?.dispatched).toEqual(['pointerdown']);
});

test('mousedown で alert を出すボタンは dialog の変化を持つ finding になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'mousedown-alert.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings[0]?.changes).toContainEqual({
    kind: 'dialog',
    dialogType: 'alert',
    message: 'x',
  });
});

test('mousedown で window.open するボタンは new-window の変化を持つ finding になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'mousedown-window-open.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings[0]?.changes).toContainEqual({
    kind: 'new-window',
    url: `${baseUrl}/pointer-cancellation/landing.html`,
  });
});

test('mousedown の listener だけを持ち何も起きない div は press-only-listener の finding になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'press-only-silent.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.details.listenerInspection).toBe('cdp');
  expect(result.details.findings).toHaveLength(1);
  const finding = result.details.findings[0];
  expect(finding?.kind).toBe('press-only-listener');
  expect(finding?.target.selector).toBe('#s');
  expect(finding?.target.sources).toEqual(['listener']);
  expect(finding?.target.pressListener?.handlerPreview).toContain(
    'onPressOnly',
  );
});

test('mousedown と click の listener を両方持つ要素は press-only にならず passes になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'press-and-click.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(0);
  expect(result.passes.map((r) => r.id)).toEqual([RULE_ID]);
});

test('click だけで動くボタンとリンクは、押しただけでは移動せず passes になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'click-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(0);
  expect(result.details.targetsTested).toBe(2);
  expect(result.details.restarts).toBe(0);
  expect(result.passes.map((r) => r.id)).toEqual([RULE_ID]);
});

test('mousedown で自分にフォーカスするだけの要素は finding にならず passes になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'focus-self.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(0);
  expect(result.passes.map((r) => r.id)).toEqual([RULE_ID]);
});

test('pointerdown で style だけが変わるボタンは finding にならず passes になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'style-feedback.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(0);
  expect(result.passes.map((r) => r.id)).toEqual([RULE_ID]);
});

test('委譲先の root が押し下げで動くとき、root は根拠から外れ中のボタンが押して確かめる側で拾われる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'delegated.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.delegationRootCount).toBe(1);
  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.kind).toBe('activated-on-press');
  expect(result.details.findings[0]?.target.selector).toBe('#d');
  expect(result.details.findings[0]?.target.sources).toEqual(['interactive']);
});

test('何もしなくても DOM が変わるページでは、DOM の変化を根拠に使わず incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'background-ticker.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.domObservation).toBe('ignored-background-activity');
  expect(result.details.findings).toHaveLength(0);
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
});

test('open shadow root の中のボタンは shadowHosts と selector で示される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'shadow.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.target.shadowHosts).toEqual(['#host']);
  expect(result.details.findings[0]?.target.selector).toBe('#b');
});

test('押す対象が無いページは targetsFound が 0 で inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'none.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.targetsFound).toBe(0);
  expect(result.inapplicable.map((r) => r.id)).toEqual([RULE_ID]);
});

test('押すと次のボタンが DOM から消えるページは、消えたボタンを element-gone の未検査にして incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'removes-next.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings.map((f) => f.target.selector)).toEqual([
    '#first',
  ]);
  expect(
    result.details.untested.map((u) => [u.target.selector, u.reason]),
  ).toEqual([['#second', 'element-gone']]);
  expect(result.incomplete[0]?.nodes.map((n) => n.target)).toEqual([
    ['#first'],
    ['#second'],
  ]);
});

test('pointerdown が戻らないボタンは handler-timeout の未検査になり、やり直しで後ろのボタンが押される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  test.setTimeout(60_000);
  const result = await runCancel(
    'hang-pointerdown.html',
    { page, browser, testInfo },
    baseUrl,
    { stepTimeoutMs: 1_000 },
  );

  expect(result.details.aborted).toBeNull();
  expect(
    result.details.untested.map((u) => [u.target.selector, u.reason]),
  ).toEqual([['#hang', 'handler-timeout']]);
  expect(result.details.restarts).toBeGreaterThanOrEqual(1);
  expect(
    result.details.findings.map((f) => [f.target.selector, f.kind]),
  ).toEqual([['#after', 'activated-on-press']]);
});

test('pointercancel が戻らないボタンは、押下は観察済みなので未検査にせず、context を閉じてやり直して終わる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  test.setTimeout(60_000);
  const result = await runCancel(
    'hang-pointercancel.html',
    { page, browser, testInfo },
    baseUrl,
    { stepTimeoutMs: 1_000 },
  );

  expect(result.details.aborted).toBeNull();
  expect(result.details.untested).toEqual([]);
  expect(result.details.targetsTested).toBe(1);
  // Nothing is left to press after the hung cancel, so no restart is needed.
  expect(result.details.restarts).toBe(0);
  expect(result.details.findings).toEqual([]);
});

test('maxTargets を超えるとき、押した数で打ち切られ target-limit になり incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'click-only.html',
    { page, browser, testInfo },
    baseUrl,
    { maxTargets: 1 },
  );

  expect(result.details.aborted?.reason).toBe('target-limit');
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
});

test('listener の検査が時間切れでも例外を投げず、failed の page node で incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'press-only-silent.html',
    { page, browser, testInfo },
    baseUrl,
    { inspectionTimeoutMs: 1 },
  );

  expect(result.details.listenerInspection).toBe('failed');
  expect(result.details.inspectionError).toBe('timeout');
  expect(
    result.details.findings.filter((f) => f.kind === 'press-only-listener'),
  ).toHaveLength(0);
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
});

test('ボタンが 150 個あるページは、既定の設定で 100 個押したところで target-limit により予算内に終わる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();

  const result = await runCancel(
    'many.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(Date.now() - startedAt).toBeLessThan(80_000);
  expect(result.details.aborted?.reason).toBe('target-limit');
  expect(result.details.targetsTested).toBe(100);
});

test('press listener を持つ要素が 1001 個あるページは、listenerNodesTruncated になり incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  test.setTimeout(120_000);

  const result = await runCancel(
    'many-listeners.html',
    { page, browser, testInfo },
    baseUrl,
    { maxTargets: 5 },
  );

  expect(result.details.listenerNodesTruncated).toBe(true);
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
});

test('listener の上限を超えた要素は、押せても listeners が null になる (空の配列で「無い」と言い切らない)', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  test.setTimeout(120_000);

  const result = await runCancel(
    'many-listeners.html',
    { page, browser, testInfo },
    baseUrl,
    { maxTargets: 1001, settleMs: 10 },
  );

  const late = result.details.findings.find(
    (f) => f.kind === 'activated-on-press',
  );
  expect(late?.target.selector).toBe('#d1000');
  expect(late?.target.listeners).toBeNull();
});

test('pointercancel で alert を出すボタンの dialog は押下の finding に入らず、次のボタンも責められない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'cancel-dialog.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toEqual([]);
  expect(result.details.untested).toEqual([]);
  expect(result.details.targetsTested).toBe(2);
  expect(result.passes.map((r) => r.id)).toEqual([RULE_ID]);
});

test('settleMs より後に移動するページでも、後ろのボタンは element-gone にならず、やり直して押される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'slow-navigation.html',
    { page, browser, testInfo },
    baseUrl,
    { settleMs: 300 },
  );

  expect(result.details.untested).toEqual([]);
  expect(result.details.findings.map((f) => f.target.selector)).not.toContain(
    '#after',
  );
  expect(result.details.restarts).toBeGreaterThanOrEqual(1);
  expect(result.details.targetsTested).toBe(2);
});

test('700ms ごとに DOM が変わるページでも、押す前の観察で背景の変化と判定される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runCancel(
    'slow-ticker.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.domObservation).toBe('ignored-background-activity');
});

test('stepTimeoutMs が 0 のときは例外を投げる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runFixtureCheck(
      'pointer-cancellation-check',
      'pointer-cancellation/none.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true, stepTimeoutMs: 0 },
    ),
  ).rejects.toThrow('`stepTimeoutMs` must be a positive finite number');
});
