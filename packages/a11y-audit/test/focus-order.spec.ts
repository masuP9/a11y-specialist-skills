/**
 * Behavior of focus-order-check (WCAG 2.4.3).
 *
 * Each test runs the check against one fixture under
 * test/fixtures/pages/focus-order/ and asserts on `details` and the buckets.
 * Position classification itself is covered by focus-order-analysis.spec.ts.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { FOCUS_ORDER_SETTLE_MS } from '../dist/constants.js';
import type { FocusOrderCheckDetails } from '../dist/index.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validate = ajv.compile(RESULT_SCHEMAS['focus-order-check']);

const VISUAL = 'a11y-skills/focus-order-visual';
const DIALOG = 'a11y-skills/focus-order-dialog';

type Context = Parameters<typeof runFixtureCheck>[3];

async function run(
  fixture: string,
  baseUrl: string,
  context: Context,
  extra: Record<string, unknown> = {},
) {
  const result = await runFixtureCheck(
    'focus-order-check',
    `focus-order/${fixture}`,
    baseUrl,
    context,
    { quiet: true, ...extra },
  );
  expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
  const details = result.details as FocusOrderCheckDetails;
  const bucketOf = (ruleId: string): string | undefined =>
    (['violations', 'incomplete', 'passes', 'inapplicable'] as const).find(
      (bucket) => result[bucket].some((rule) => rule.id === ruleId),
    );
  const nodesOf = (ruleId: string) =>
    result.incomplete.find((rule) => rule.id === ruleId)?.nodes ?? [];
  return { result, details, bucketOf, nodesOf };
}

test.describe('Tab walk', () => {
  test('見た目どおりに並んだページは 6 件を巡回して一巡し、逆向きの移動を報告しない', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run('in-order.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.stops).toHaveLength(6);
    expect(details.tabWalk.ended).toBe('cycle');
    expect(
      details.transitions.filter((t) => t.kind.startsWith('backward')),
    ).toEqual([]);
    expect(details.detours).toEqual([]);
    expect(bucketOf(VISUAL)).toBe('passes');
    expect(bucketOf(DIALOG)).toBe('inapplicable');
  });

  test('autofocus で途中から始まり末尾で外へ出て先頭へ戻る巡回は、折り返しの移動を比べず passes になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run('autofocus.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.stops.some((s) => s.afterWrap)).toBe(true);
    expect(
      details.transitions.filter((t) => t.kind.startsWith('backward')),
    ).toEqual([]);
    expect(bucketOf(VISUAL)).toBe('passes');
  });

  test('autofocus の要素へ画面内で戻る最後の移動が上向きなら、revisit の停止点として backward-block を報告する', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run(
      'autofocus-backward.html',
      baseUrl,
      {
        page,
        browser,
        testInfo,
      },
    );
    expect(details.stops[0]?.step).toBe(0);
    const closing = details.transitions.find(
      (t) => t.kind === 'backward-block',
    );
    expect(closing).toBeDefined();
    expect(details.stops[closing!.to]?.revisit).toBe(true);
    expect(bucketOf(VISUAL)).toBe('incomplete');
  });

  test('読み込み時に Tab で届かない見出しへフォーカスされても、最初に Tab で届いた要素へ戻った時点で一巡として終える', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run(
      'autofocus-nontabbable.html',
      baseUrl,
      { page, browser, testInfo },
    );
    expect(details.tabWalk.ended).toBe('cycle');
    expect(details.stops[0]?.step).toBe(0);
    expect(details.stops[0]?.tag).toBe('h1');
    const selectors = details.stops
      .filter((s) => !s.revisit)
      .map((s) => s.selector);
    expect(new Set(selectors).size).toBe(selectors.length);
    expect(details.tabWalk.presses).toBeLessThan(
      details.tabWalk.focusableCount + 5,
    );
    expect(bucketOf(VISUAL)).toBe('passes');
  });

  test('shadow root の中で上へ戻る移動の node は、target がホストと要素の 2 要素になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, nodesOf } = await run('shadow-backward.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.transitions.map((t) => t.kind)).toContain('backward-block');
    const node = nodesOf(VISUAL)[0];
    expect(node?.target).toHaveLength(2);
    expect(node?.target[0]).toBe(details.stops[0]?.shadowHosts[0]);
  });

  test('order で DOM 1 つ目を下に置くと backward-block を 1 件報告する', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run('backward-block.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.transitions.map((t) => t.kind)).toEqual(['backward-block']);
    expect(bucketOf(VISUAL)).toBe('incomplete');
  });

  test('row-reverse の 3 ボタンは backward-inline を 2 件報告する', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run('backward-inline.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.transitions.map((t) => t.kind)).toEqual([
      'backward-inline',
      'backward-inline',
    ]);
    expect(bucketOf(VISUAL)).toBe('incomplete');
  });

  test('左列の下から右列の上への移動は column-wrap で、passes になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run('columns.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(
      details.transitions.filter((t) => t.kind === 'column-wrap'),
    ).toHaveLength(1);
    expect(
      details.transitions.filter((t) => t.kind.startsWith('backward')),
    ).toEqual([]);
    expect(bucketOf(VISUAL)).toBe('passes');
  });

  test('rtl のページでは左へ進む Tab を順方向とみなして passes になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run('rtl.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.direction).toBe('rtl');
    expect(
      details.transitions.filter((t) => t.kind.startsWith('backward')),
    ).toEqual([]);
    expect(bucketOf(VISUAL)).toBe('passes');
  });

  test('離れた B に飛んで A の近くへ戻る並びは detour として報告する', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf, nodesOf } = await run('detour.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.detours.map((d) => d.index)).toEqual([1]);
    expect(bucketOf(VISUAL)).toBe('incomplete');
    expect(
      nodesOf(VISUAL).some((n) => n.failureSummary?.includes('Tab jumps')),
    ).toBe(true);
  });

  test('sticky と fixed の要素は比べず、skippedTransitions に数えて passes になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run('fixed.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.skippedTransitions).toBeGreaterThanOrEqual(2);
    expect(bucketOf(VISUAL)).toBe('passes');
  });

  test('shadow root の中の 25 ボタンを上限に切られず巡回して一巡する', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run('shadow.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.stops).toHaveLength(25);
    expect(details.tabWalk.ended).toBe('cycle');
    expect(details.stops[0]?.shadowHosts).toHaveLength(1);
    expect(bucketOf(VISUAL)).toBe('passes');
  });

  test('フォーカスできる要素が無いページは有限時間で終わり、2 ルールとも inapplicable になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const startedAt = Date.now();
    const { details, bucketOf } = await run('none.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(Date.now() - startedAt).toBeLessThan(10_000);
    expect(details.stops).toEqual([]);
    expect(bucketOf(VISUAL)).toBe('inapplicable');
    expect(bucketOf(DIALOG)).toBe('inapplicable');
  });

  test('maxTabPresses: 2 では 2 件で打ち切り、capped になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details } = await run(
      'in-order.html',
      baseUrl,
      {
        page,
        browser,
        testInfo,
      },
      { maxTabPresses: 2 },
    );
    expect(details.tabWalk.ended).toBe('tab-limit');
    expect(details.tabWalk.capped).toBe(true);
    expect(details.stops).toHaveLength(2);
  });

  test('maxTabPresses: 2 で先頭の順方向だけを見た場合は passes ではなく incomplete になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { bucketOf, nodesOf } = await run(
      'backward-tail.html',
      baseUrl,
      { page, browser, testInfo },
      { maxTabPresses: 2 },
    );
    expect(bucketOf(VISUAL)).toBe('incomplete');
    expect(
      nodesOf(VISUAL).some((n) =>
        n.failureSummary?.includes(
          'ended without returning to the first element',
        ),
      ),
    ).toBe(true);
  });

  test('最初の要素の focus で遷移するページは、記録 0 件でも inapplicable にせず incomplete になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run(
      'first-focus-navigates.html',
      baseUrl,
      { page, browser, testInfo },
    );
    expect(details.stops).toEqual([]);
    expect(details.tabWalk.ended).toBe('navigation');
    expect(bucketOf(VISUAL)).toBe('incomplete');
  });

  test('timeBudgetMs: 1 では記録前に時間切れとなり incomplete になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run(
      'in-order.html',
      baseUrl,
      { page, browser, testInfo },
      { timeBudgetMs: 1 },
    );
    expect(details.stops).toEqual([]);
    expect(details.tabWalk.ended).toBe('timeout');
    expect(bucketOf(VISUAL)).toBe('incomplete');
  });
});

test.describe('Dialogs', () => {
  test('Escape で閉じ、開くボタンへ戻るモーダルは passes になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf } = await run('dialog-good.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    const probe = details.dialogs[0];
    expect(probe?.status).toBe('opened');
    expect(probe?.modal).toBe(true);
    expect(probe?.focusAfterOpen).toBe('inside');
    expect(probe?.closedBy).toBe('escape');
    expect(probe?.focusAfterClose).toBe('trigger');
    expect(bucketOf(DIALOG)).toBe('passes');
  });

  test('開いてもフォーカスが開くボタンに残るモーダルは incomplete で 1 件になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf, nodesOf } = await run(
      'dialog-focus-outside.html',
      baseUrl,
      { page, browser, testInfo },
    );
    expect(details.dialogs[0]?.focusAfterOpen).toBe('trigger');
    expect(bucketOf(DIALOG)).toBe('incomplete');
    expect(nodesOf(DIALOG)).toHaveLength(1);
  });

  test('閉じるボタンで閉じてフォーカスが body に落ちるモーダルは incomplete で 1 件になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf, nodesOf } = await run(
      'dialog-no-return.html',
      baseUrl,
      { page, browser, testInfo },
    );
    expect(details.dialogs[0]?.closedBy).toBe('close-button');
    expect(details.dialogs[0]?.focusAfterClose).toBe('body');
    expect(bucketOf(DIALOG)).toBe('incomplete');
    expect(nodesOf(DIALOG)).toHaveLength(1);
    expect(nodesOf(DIALOG)[0]?.failureSummary).toContain(
      'instead of back to this control',
    );
  });

  test('開くボタンが遷移するリンクなら navigated とし、元の URL を結果に残す', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { result, details, bucketOf, nodesOf } = await run(
      'dialog-navigates.html',
      baseUrl,
      { page, browser, testInfo },
    );
    expect(details.dialogs[0]?.status).toBe('navigated');
    expect(result.url).toBe(`${baseUrl}/focus-order/dialog-navigates.html`);
    expect(bucketOf(DIALOG)).toBe('incomplete');
    expect(nodesOf(DIALOG)).toHaveLength(1);
    expect(nodesOf(DIALOG)[0]?.failureSummary).toContain('the page navigated');
  });

  test('閉じる操作で遷移しても、開いた直後に観察した値を残して 2 件を報告する', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, nodesOf } = await run(
      'dialog-open-navigates.html',
      baseUrl,
      { page, browser, testInfo },
    );
    expect(details.dialogs[0]?.status).toBe('navigated');
    expect(details.dialogs[0]?.focusAfterOpen).toBe('trigger');
    expect(nodesOf(DIALOG)).toHaveLength(2);
  });

  test('正常なモーダルと何もしないボタンがあると、何もしないボタンだけを 1 件報告する', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { result, details, bucketOf, nodesOf } = await run(
      'dialog-mixed.html',
      baseUrl,
      { page, browser, testInfo },
    );
    expect(details.dialogs.map((d) => d.status)).toEqual([
      'opened',
      'not-opened',
    ]);
    expect(result.summary.checkedNodes).toBe(
      details.stops.length + details.dialogs.length,
    );
    expect(bucketOf(DIALOG)).toBe('incomplete');
    expect(nodesOf(DIALOG)).toHaveLength(1);
    expect(nodesOf(DIALOG)[0]?.failureSummary).toContain(
      'Enter did not open a dialog',
    );
  });

  test('ダイアログ探索の再読み込みで遷移するページは、例外にせず Tab の結果を残して incomplete になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf, nodesOf } = await run(
      'redirect-after-load.html',
      baseUrl,
      { page, browser, testInfo },
    );
    expect(details.stops).toHaveLength(2);
    expect(details.dialogSearch).toBe('navigated');
    expect(details.dialogs).toEqual([]);
    expect(bucketOf(DIALOG)).toBe('incomplete');
    expect(nodesOf(DIALOG)[0]?.failureSummary).toContain(
      'Dialog triggers could not be collected (the page navigated)',
    );
  });

  test('時間切れ後はページを読み直さず、dialogSearch を timeout にして incomplete になる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf, nodesOf } = await run(
      'dialog-good.html',
      baseUrl,
      { page, browser, testInfo },
      { timeBudgetMs: 1 },
    );
    expect(details.dialogSearch).toBe('timeout');
    expect(details.dialogs).toEqual([]);
    expect(bucketOf(DIALOG)).toBe('incomplete');
    expect(nodesOf(DIALOG)[0]?.failureSummary).toContain(
      'the time budget ran out',
    );
  });

  test('aria-controls だけで指す閉じたネイティブ dialog も開くボタンとして見つけ、モーダルとして開く', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details } = await run('dialog-native-aria-controls.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.dialogTriggersFound).toBe(1);
    expect(details.dialogs[0]?.status).toBe('opened');
    expect(details.dialogs[0]?.modal).toBe(true);
  });

  test('ハッシュだけが変わるリンクで開くモーダルは遷移とみなさず、フォーカスが中へ移ったと記録する', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details } = await run('hash-dialog.html', baseUrl, {
      page,
      browser,
      testInfo,
    });
    expect(details.dialogs[0]?.status).toBe('opened');
    expect(details.dialogs[0]?.focusAfterOpen).toBe('inside');
  });

  test('maxDialogTriggers: 0 ではダイアログを試さず、候補があることを incomplete で知らせる', async ({
    baseUrl,
    page,
    browser,
  }, testInfo) => {
    const { details, bucketOf, nodesOf } = await run(
      'dialog-good.html',
      baseUrl,
      { page, browser, testInfo },
      { maxDialogTriggers: 0 },
    );
    expect(details.dialogs).toEqual([]);
    expect(details.dialogTriggersFound).toBe(1);
    expect(bucketOf(DIALOG)).toBe('incomplete');
    expect(nodesOf(DIALOG)).toHaveLength(1);
    expect(nodesOf(DIALOG)[0]?.failureSummary).toContain('maxDialogTriggers');
  });
});

test('focus-order-check の Tab ごとの既定の待ちは 25ms（Plan 021 で 5 ページと fixture 13 件の結果が 50ms と同じだった値）', () => {
  expect(FOCUS_ORDER_SETTLE_MS).toBe(25);
});
