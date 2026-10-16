/**
 * content-on-hover-check (WCAG 1.4.13): finds elements that may show content on
 * hover or focus (CSS :hover / :focus rules and listeners), hovers and focuses
 * them, and measures whether the new content can be dismissed with Escape,
 * whether the pointer can move onto it, and whether it stays. Failed conditions
 * are `incomplete`: the exceptions need a human.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import {
  normalizeContentOnHoverCheck,
  type ContentOnHoverCheckDetails,
  type ContentOnHoverCheckResult,
} from '../dist/index.js';
import {
  CONTENT_ON_HOVER_PERSIST_MS,
  CONTENT_ON_HOVER_SETTLE_MS,
} from '../dist/constants.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateEnvelope = ajv.compile(RESULT_SCHEMAS['content-on-hover-check']);

const DISMISSIBLE = 'a11y-skills/content-on-hover-dismissible';
const HOVERABLE = 'a11y-skills/content-on-hover-hoverable';
const PERSISTENT = 'a11y-skills/content-on-hover-persistent';

async function runHover(
  fixture: string,
  context: Parameters<typeof runFixtureCheck>[3],
  baseUrl: string,
  extra: Record<string, unknown> = {},
): Promise<ContentOnHoverCheckResult> {
  const result = (await runFixtureCheck(
    'content-on-hover-check',
    `content-on-hover/${fixture}`,
    baseUrl,
    context,
    { quiet: true, ...extra },
  )) as ContentOnHoverCheckResult;
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
  return result;
}

test('表示や後始末の後の既定の待ちは 200ms（Plan 021 で 400ms と結果が同じで、100ms では実ページで見落とした値）', () => {
  expect(CONTENT_ON_HOVER_SETTLE_MS).toBe(200);
});

test('内容が残り続けるかを見る既定の待ちは 3000ms のまま変えない', () => {
  expect(CONTENT_ON_HOVER_PERSIST_MS).toBe(3_000);
});

// ---------------------------------------------------------------------------
// Triggers and nothing to try
// ---------------------------------------------------------------------------

test('スクリプトも CSS もないページは何も操作せず inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runHover(
    'none.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.triggers).toEqual([]);
  expect(result.details.delegationRoots).toEqual([]);
  expect(result.details.results).toEqual([]);
  expect(result.inapplicable.map((r) => r.id).sort()).toEqual(
    [DISMISSIBLE, HOVERABLE, PERSISTENT].sort(),
  );
  expect(Date.now() - startedAt).toBeLessThan(3_000);
});

test('自分の見た目を変えるだけの :hover 規則は候補にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'css-self-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.triggers).toEqual([]);
  expect(result.inapplicable).toHaveLength(3);
});

test('title・aria-describedby・aria-haspopup だけの要素は候補にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'attributes-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.triggers).toEqual([]);
  expect(result.inapplicable).toHaveLength(3);
});

test('display: none の要素に付いた mouseenter の listener は候補にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'hidden-trigger.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.triggers).toEqual([]);
});

test('CSS の :hover 規則のあとに結合子がある要素は css の候補になり、フォーカスできないので hover だけ試す', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'css-hover-menu.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.triggers).toHaveLength(1);
  expect(result.details.triggers[0]?.sources).toEqual(['css']);
  expect(result.details.triggers[0]?.focusTarget).toBeNull();
  expect(result.details.results.map((r) => r.method)).toEqual(['hover']);
});

test('CSS のメニューは Escape で消えず、ポインタを載せても消えない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'css-hover-menu.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  const hover = result.details.results[0];
  expect(hover?.persistent).toBe('stayed');
  expect(hover?.dismissible).toBe('stayed');
  expect(hover?.hoverable).toBe('stayed');
  expect(result.incomplete.map((r) => r.id)).toEqual([DISMISSIBLE]);
});

test(':focus-within の規則はフォーカスできない親ではなく中の input にフォーカスして試す', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'focus-within.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.triggers).toHaveLength(1);
  expect(result.details.triggers[0]?.selector).toBe('#group');
  expect(result.details.triggers[0]?.focusTarget).toBe('#email');
  expect(result.details.results).toHaveLength(1);
  expect(result.details.results[0]?.method).toBe('focus');
  expect(result.details.results[0]?.content[0]?.selector).toContain('div');
  expect(result.details.results[0]?.dismissible).toBe('stayed');
  expect(result.incomplete.map((r) => r.id)).toEqual([DISMISSIBLE]);
});

test('フォーカスだけで出るヒントは hoverable が not-applicable で、hover は中身なしに数える', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'focus-only.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.noContent).toBe(1);
  expect(result.details.results).toHaveLength(1);
  const focus = result.details.results[0];
  expect(focus?.method).toBe('focus');
  expect(focus?.hoverable).toBe('not-applicable');
  expect(focus?.dismissible).toBe('stayed');
  expect(result.incomplete.map((r) => r.id)).toEqual([DISMISSIBLE]);
  expect(result.inapplicable.map((r) => r.id)).toEqual([HOVERABLE]);
});

// ---------------------------------------------------------------------------
// The three conditions
// ---------------------------------------------------------------------------

test('Escape で消え、ポインタを載せても消えず、残り続けるツールチップは既定の待ち時間で 3 ルールとも passes になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'compliant-tooltip.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.triggers.map((t) => t.selector)).toEqual(['#btn']);
  expect(result.details.results.map((r) => r.method)).toEqual([
    'hover',
    'focus',
  ]);
  for (const entry of result.details.results) {
    expect(entry.trigger).toBe('#btn');
    expect(entry.persistent).toBe('stayed');
    expect(entry.dismissible).toBe('dismissed');
    expect(entry.escapeMovedFocus).toBe(false);
  }
  expect(result.details.results[0]?.hoverable).toBe('stayed');
  expect(result.details.results[1]?.hoverable).toBe('not-applicable');
  expect(result.passes.map((r) => r.id).sort()).toEqual(
    [DISMISSIBLE, HOVERABLE, PERSISTENT].sort(),
  );
});

test('Escape を聞かないツールチップは hover・focus とも dismissible が stayed で、dismissible だけが incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'no-escape.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.results.map((r) => [r.method, r.dismissible])).toEqual([
    ['hover', 'stayed'],
    ['focus', 'stayed'],
  ]);
  expect(result.incomplete.map((r) => r.id)).toEqual([DISMISSIBLE]);
  const targets = result.incomplete[0]?.nodes.map((n) => n.target);
  expect(targets).toEqual([['#btn'], ['#btn']]);
});

test('ボタンの mouseleave で消えるツールチップは hover の hoverable が disappeared で、hoverable だけが incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'not-hoverable.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  const hover = result.details.results.find((r) => r.method === 'hover');
  expect(hover?.hoverable).toBe('disappeared');
  expect(hover?.dismissible).toBe('dismissed');
  expect(hover?.persistent).toBe('stayed');
  expect(result.incomplete.map((r) => r.id)).toEqual([HOVERABLE]);
});

test('出して 700ms 後に自分で消えるツールチップは persistent が disappeared で、消せるかとポインタを載せられるかは not-tested になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'auto-hide.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 1000, settleMs: 150 },
  );

  expect(result.details.results).toHaveLength(1);
  const hover = result.details.results[0];
  expect(hover?.persistent).toBe('disappeared');
  expect(hover?.dismissible).toBe('not-tested');
  expect(hover?.hoverable).toBe('not-tested');
  expect(result.incomplete.map((r) => r.id)).toEqual([PERSISTENT]);
  expect(result.inapplicable.map((r) => r.id).sort()).toEqual(
    [DISMISSIBLE, HOVERABLE].sort(),
  );
  expect(result.passes).toEqual([]);
});

test('Escape で blur して消えるツールチップは dismissed でも escapeMovedFocus になり、dismissible が incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'escape-blurs.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.results).toHaveLength(1);
  const focus = result.details.results[0];
  expect(focus?.method).toBe('focus');
  expect(focus?.dismissible).toBe('dismissed');
  expect(focus?.escapeMovedFocus).toBe(true);
  expect(result.incomplete.map((r) => r.id)).toEqual([DISMISSIBLE]);
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'moved focus',
  );
});

// ---------------------------------------------------------------------------
// Putting the page back, navigation
// ---------------------------------------------------------------------------

test('戻せない中身があると読み込み直し、次のボタンの中身を前の中身と取り違えない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'stuck.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.reloads).toBe(1);
  const second = result.details.results.filter((r) => r.trigger === '#b2');
  expect(second.map((r) => r.method)).toEqual(['hover', 'focus']);
  for (const entry of second) {
    expect(entry.content.map((c) => c.selector)).toEqual(['#tip2']);
    expect(entry.persistent).toBe('stayed');
    expect(entry.dismissible).toBe('dismissed');
  }
  expect(result.details.aborted).toBeNull();
});

test('maxReloads が 0 で戻せない中身があると reload-limit で止まり、残りを untested に入れる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'stuck.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150, maxReloads: 0 },
  );

  expect(result.details.aborted?.reason).toBe('reload-limit');
  const untestedSecond = result.details.untested.filter(
    (u) => u.trigger === '#b2',
  );
  expect(untestedSecond.length).toBeGreaterThan(0);
  for (const entry of untestedSecond) {
    expect(entry.reason).toBe('reload-limit');
  }
});

test('フォーカスで別ページへ遷移するリンクは focus の組を navigated として untested に入れ、例外にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'focus-navigates.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.untested).toEqual([
    { trigger: '#link', method: 'focus', reason: 'navigated' },
  ]);
  expect(result.url).toBe(`${baseUrl}/content-on-hover/focus-navigates.html`);
});

// ---------------------------------------------------------------------------
// Delegated listeners are reported, not tried
// ---------------------------------------------------------------------------

test('document に付いた mouseover の listener は delegationRoots に入り、候補にはならず 3 ルールとも incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'document-delegation.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.delegationRoots).toEqual([
    {
      selector: 'document',
      shadowHosts: [],
      eventTypeCount: 1,
      types: ['mouseover'],
    },
  ]);
  expect(result.details.triggers).toEqual([]);
  expect(result.incomplete.map((r) => r.id).sort()).toEqual(
    [DISMISSIBLE, HOVERABLE, PERSISTENT].sort(),
  );
  for (const rule of result.incomplete) {
    expect(rule.nodes).toHaveLength(1);
    expect(rule.nodes[0]?.failureSummary).toContain('delegated to document');
  }
});

test('20 種類以上の listener が付いたルート要素は delegationRoots に入り、候補にはならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'root-delegation.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.delegationRoots).toHaveLength(1);
  expect(result.details.delegationRoots[0]?.selector).toBe('#root');
  expect(
    result.details.delegationRoots[0]?.eventTypeCount,
  ).toBeGreaterThanOrEqual(20);
  expect(result.details.triggers).toEqual([]);
  expect(result.incomplete).toHaveLength(3);
});

// ---------------------------------------------------------------------------
// Limits and arguments
// ---------------------------------------------------------------------------

test('timeBudgetMs を使い切ると timeout で止まり、残りを untested に入れて 3 ルールとも incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'compliant-tooltip.html',
    { page, browser, testInfo },
    baseUrl,
    { timeBudgetMs: 1 },
  );

  expect(result.details.aborted?.reason).toBe('timeout');
  expect(result.details.untested.length).toBeGreaterThan(0);
  expect(result.incomplete).toHaveLength(3);
});

test('maxTriggers が候補より小さいと切り捨てを記録し、3 ルールとも incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'stuck.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150, maxTriggers: 1 },
  );

  expect(result.details.triggers).toHaveLength(1);
  expect(result.details.triggersTruncated).toBe(1);
  expect(result.incomplete).toHaveLength(3);
});

test('settleMs が負の数だと Error を投げる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runFixtureCheck(
      'content-on-hover-check',
      'content-on-hover/none.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true, settleMs: -1 },
    ),
  ).rejects.toThrow(/settleMs/);
});

test('persistMs が NaN だと Error を投げる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runFixtureCheck(
      'content-on-hover-check',
      'content-on-hover/none.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true, persistMs: Number.NaN },
    ),
  ).rejects.toThrow(/persistMs/);
});

test('maxTriggers が 0 だと Error を投げる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runFixtureCheck(
      'content-on-hover-check',
      'content-on-hover/none.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true, maxTriggers: 0 },
    ),
  ).rejects.toThrow(/maxTriggers/);
});

test('maxReloads が負の数だと Error を投げる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runFixtureCheck(
      'content-on-hover-check',
      'content-on-hover/none.html',
      baseUrl,
      { page, browser, testInfo },
      { quiet: true, maxReloads: -1 },
    ),
  ).rejects.toThrow(/maxReloads/);
});

// ---------------------------------------------------------------------------
// Normalizer: what could not be examined
// ---------------------------------------------------------------------------

test('調べきれなかったことが何も無く、候補も無い details は 3 ルールとも inapplicable になる', () => {
  const details: ContentOnHoverCheckDetails = {
    listenerInspection: 'cdp',
    delegationRoots: [],
    listenerNodesTruncated: false,
    triggers: [],
    triggersTruncated: 0,
    cssRulesUnreadable: 0,
    shadowTriggersSkipped: 0,
    results: [],
    noContent: 0,
    untested: [],
    reloads: 0,
    aborted: null,
  };

  const buckets = normalizeContentOnHoverCheck(details);

  expect(buckets.inapplicable).toHaveLength(3);
  expect(buckets.incomplete).toEqual([]);
  expect(buckets.passes).toEqual([]);
});

test('Chromium 以外で listener を調べられなかった details は 3 ルールとも incomplete の page node 1 つになる', () => {
  const details: ContentOnHoverCheckDetails = {
    listenerInspection: 'unsupported',
    delegationRoots: [],
    listenerNodesTruncated: false,
    triggers: [],
    triggersTruncated: 0,
    cssRulesUnreadable: 0,
    shadowTriggersSkipped: 0,
    results: [],
    noContent: 0,
    untested: [],
    reloads: 0,
    aborted: null,
  };

  const buckets = normalizeContentOnHoverCheck(details);

  expect(buckets.incomplete).toHaveLength(3);
  for (const rule of buckets.incomplete) {
    expect(rule.nodes).toHaveLength(1);
    expect(rule.nodes[0]?.failureSummary).toContain('Chromium');
  }
});

test('別オリジンの CSS を読めなかった details は 3 ルールとも incomplete の page node 1 つになる', () => {
  const details: ContentOnHoverCheckDetails = {
    listenerInspection: 'cdp',
    delegationRoots: [],
    listenerNodesTruncated: false,
    triggers: [],
    triggersTruncated: 0,
    cssRulesUnreadable: 1,
    shadowTriggersSkipped: 0,
    results: [],
    noContent: 0,
    untested: [],
    reloads: 0,
    aborted: null,
  };

  const buckets = normalizeContentOnHoverCheck(details);

  expect(buckets.incomplete).toHaveLength(3);
  for (const rule of buckets.incomplete) {
    expect(rule.nodes).toHaveLength(1);
    expect(rule.nodes[0]?.failureSummary).toContain('cross-origin');
  }
});

test('listener の上限で切り捨てた details は 3 ルールとも incomplete の page node 1 つになる', () => {
  const details: ContentOnHoverCheckDetails = {
    listenerInspection: 'cdp',
    delegationRoots: [],
    listenerNodesTruncated: true,
    triggers: [],
    triggersTruncated: 0,
    cssRulesUnreadable: 0,
    shadowTriggersSkipped: 0,
    results: [],
    noContent: 0,
    untested: [],
    reloads: 0,
    aborted: null,
  };

  const buckets = normalizeContentOnHoverCheck(details);

  expect(buckets.incomplete).toHaveLength(3);
  for (const rule of buckets.incomplete) {
    expect(rule.nodes).toHaveLength(1);
    expect(rule.nodes[0]?.failureSummary).toContain('were not tried');
  }
});

// ---------------------------------------------------------------------------
// Review fixes
// ---------------------------------------------------------------------------

test('hover で残ったのにポインタを載せる試験ができなかった結果は、hoverable の incomplete の要素 node になる', () => {
  const details: ContentOnHoverCheckDetails = {
    listenerInspection: 'cdp',
    delegationRoots: [],
    listenerNodesTruncated: false,
    triggers: [
      {
        selector: '#btn',
        sources: ['listener'],
        focusTarget: '#btn',
        html: '<button id="btn">Info</button>',
        htmlTruncated: false,
      },
    ],
    triggersTruncated: 0,
    cssRulesUnreadable: 0,
    shadowTriggersSkipped: 0,
    results: [
      {
        trigger: '#btn',
        method: 'hover',
        content: [
          {
            selector: '#tip',
            rect: { x: 0, y: 0, width: 10, height: 10 },
            html: '<div id="tip">Tip</div>',
            htmlTruncated: false,
            text: 'Tip',
          },
        ],
        persistent: 'stayed',
        dismissible: 'dismissed',
        escapeMovedFocus: false,
        hoverable: 'not-tested',
      },
    ],
    noContent: 0,
    untested: [],
    reloads: 0,
    aborted: null,
  };

  const buckets = normalizeContentOnHoverCheck(details);

  expect(buckets.incomplete.map((r) => r.id)).toEqual([HOVERABLE]);
  expect(buckets.incomplete[0]?.nodes[0]?.target).toEqual(['#btn']);
  expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'could not be reached with the pointer',
  );
  expect(buckets.passes.map((r) => r.id).sort()).toEqual(
    [DISMISSIBLE, PERSISTENT].sort(),
  );
});

test('shadow root の中の listener を数えた details は 3 ルールとも incomplete の page node 1 つになる', () => {
  const details: ContentOnHoverCheckDetails = {
    listenerInspection: 'cdp',
    delegationRoots: [],
    listenerNodesTruncated: false,
    triggers: [],
    triggersTruncated: 0,
    cssRulesUnreadable: 0,
    shadowTriggersSkipped: 2,
    results: [],
    noContent: 0,
    untested: [],
    reloads: 0,
    aborted: null,
  };

  const buckets = normalizeContentOnHoverCheck(details);

  expect(buckets.incomplete).toHaveLength(3);
  for (const rule of buckets.incomplete) {
    expect(rule.nodes).toHaveLength(1);
    expect(rule.nodes[0]?.failureSummary).toContain(
      '2 element(s) inside shadow roots',
    );
  }
});

test('2 つの要素の 3 組が試せなかった details は、組の数と要素の数を別々に書く', () => {
  const details: ContentOnHoverCheckDetails = {
    listenerInspection: 'cdp',
    delegationRoots: [],
    listenerNodesTruncated: false,
    triggers: [],
    triggersTruncated: 0,
    cssRulesUnreadable: 0,
    shadowTriggersSkipped: 0,
    results: [],
    noContent: 0,
    untested: [
      { trigger: '#a', method: 'hover', reason: 'timeout' },
      { trigger: '#a', method: 'focus', reason: 'timeout' },
      { trigger: '#b', method: 'hover', reason: 'timeout' },
    ],
    reloads: 0,
    aborted: { reason: 'timeout', url: 'about:blank' },
  };

  const buckets = normalizeContentOnHoverCheck(details);

  expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    '3 trigger and method pair(s) on 2 trigger(s) were not tried',
  );
});

test('Shadow root の中のボタンに付いた listener は試さず、shadowTriggersSkipped に数えて 3 ルールとも incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'shadow-button.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.triggers).toEqual([]);
  expect(result.details.shadowTriggersSkipped).toBe(1);
  expect(result.incomplete).toHaveLength(3);
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'inside shadow roots',
  );
});

test('スクロールして現れる「トップへ戻る」は、遠くのボタンの中身に数えず、読み込み直しもしない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'scroll-reveal.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.triggers.map((t) => t.selector)).toEqual(['#btn']);
  const selectors = result.details.results.flatMap((r) =>
    r.content.map((c) => c.selector),
  );
  expect(selectors).toEqual(['#tip', '#tip']);
  expect(result.details.reloads).toBe(0);
});

test('window に付いた capture でない focus の listener は delegationRoots にならず、ボタンは普通に試される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'window-focus.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.delegationRoots).toEqual([]);
  expect(result.details.results.map((r) => [r.trigger, r.method])).toEqual([
    ['#btn', 'hover'],
    ['#btn', 'focus'],
  ]);
});

test('先の要素の hover で兄弟要素が挿入されても、id の無い 2 つ目のボタンを取り違えずに試す', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'inserts-sibling.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.triggers).toHaveLength(2);
  const second = result.details.triggers[1]?.selector;
  const secondResults = result.details.results.filter(
    (r) => r.trigger === second,
  );
  expect(secondResults.map((r) => r.method)).toEqual(['hover', 'focus']);
  for (const entry of secondResults) {
    expect(entry.content.map((c) => c.selector)).toEqual(['#tip2']);
  }
  expect(result.details.untested).toEqual([]);
});

test('CSS ネストで書いた &:hover > .sub の規則も css の候補になり、hover の結果が出る', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'css-nested-menu.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.triggers).toHaveLength(1);
  expect(result.details.triggers[0]?.sources).toEqual(['css']);
  expect(result.details.results.map((r) => r.method)).toEqual(['hover']);
});

test('tabindex="-1" の要素はキーボードでフォーカスできないので focusTarget が null で、focus は試さない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'tabindex-minus-one.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.triggers).toHaveLength(1);
  expect(result.details.triggers[0]?.focusTarget).toBeNull();
  expect(result.details.results).toEqual([]);
  expect(result.details.noContent).toBe(1);
});

test('aria-hidden の付いたツールチップも見た目には出ているので中身に数え、Escape で消えなければ dismissible が incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runHover(
    'aria-hidden-tooltip.html',
    { page, browser, testInfo },
    baseUrl,
    { persistMs: 600, settleMs: 150 },
  );

  expect(result.details.results.map((r) => r.method)).toEqual([
    'hover',
    'focus',
  ]);
  for (const entry of result.details.results) {
    expect(entry.content.map((c) => c.selector)).toEqual(['#tip']);
  }
  expect(result.incomplete.map((r) => r.id)).toEqual([DISMISSIBLE]);
});
