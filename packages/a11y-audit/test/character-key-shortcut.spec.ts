/**
 * character-key-shortcut-check (WCAG 2.1.4): presses printable characters one
 * at a time with focus on <body> and reports the keys that cause a reaction.
 * Reactions are `incomplete`: whether the shortcut can be turned off or
 * remapped needs a human.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import type { CharacterKeyShortcutCheckResult } from '../dist/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateEnvelope = ajv.compile(
  RESULT_SCHEMAS['character-key-shortcut-check'],
);

const RULE_ID = 'a11y-skills/character-key-shortcut';

async function runKeys(
  fixture: string,
  context: Parameters<typeof runFixtureCheck>[3],
  baseUrl: string,
  extra: Record<string, unknown> = {},
): Promise<CharacterKeyShortcutCheckResult> {
  const result = (await runFixtureCheck(
    'character-key-shortcut-check',
    `character-key-shortcut/${fixture}`,
    baseUrl,
    context,
    { quiet: true, ...extra },
  )) as CharacterKeyShortcutCheckResult;
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
  return result;
}

test('スクリプトが無いページは listener が無いのでキーを送らず inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runKeys(
    'none.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.listeners).toEqual([]);
  expect(result.details.keyProbe).toBe('skipped-no-listeners');
  expect(result.details.keysTried).toEqual([]);
  expect(result.inapplicable.map((r) => r.id)).toEqual([RULE_ID]);
  expect(Date.now() - startedAt).toBeLessThan(5_000);
});

test('Escape だけに反応するページは 94 キーすべてを押して、どれにも反応せず passes になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'escape-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.listeners.map((l) => [l.target, l.type])).toEqual([
    ['document', 'keydown'],
  ]);
  expect(result.details.keysTried).toHaveLength(94);
  expect(result.details.reacted).toEqual([]);
  expect(result.passes.map((r) => r.id)).toEqual([RULE_ID]);
});

test('k でパネルを切り替えるページは k だけが dom-change で反応して incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'toggle-panel.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['j', 'k'] },
  );

  expect(result.details.reacted.map((r) => r.key)).toEqual(['k']);
  expect(result.details.reacted[0]?.reactions[0]?.kind).toBe('dom-change');
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  const summary = result.incomplete[0]?.nodes[0]?.failureSummary ?? '';
  expect(summary).toContain('Pressing "k"');
  expect(summary).toContain('Key listeners: document "keydown"');
});

test('/ で検索欄にフォーカスを移すページは focus-moved になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'focus-search.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['/'] },
  );

  expect(result.details.reacted).toHaveLength(1);
  expect(result.details.reacted[0]?.reactions).toContainEqual({
    kind: 'focus-moved',
    toSelector: '#search',
  });
});

test('g で別ページへ移動するページは navigation を記録し、読み込み直して続きの h を押す', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'navigate.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['g', 'h'] },
  );

  expect(result.details.reacted.map((r) => r.key)).toEqual(['g', 'h']);
  expect(result.details.reacted[0]?.reactions).toEqual([
    {
      kind: 'navigation',
      toUrl: `${baseUrl}/character-key-shortcut/none.html`,
    },
  ]);
  expect(result.details.reacted[1]?.reactions[0]?.kind).toBe('dom-change');
  expect(result.details.reloads).toBe(1);
  expect(result.url).toBe(`${baseUrl}/character-key-shortcut/navigate.html`);
});

test('? と大文字 A に反応するページは、小文字 a には反応しないと記録する', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'question-mark.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['?', 'A', 'a'] },
  );

  expect(result.details.reacted.map((r) => r.key)).toEqual(['?', 'A']);
  expect(result.details.keysTried).toEqual(['?', 'A', 'a']);
});

test('preventDefault() だけを呼ぶ window の listener は default-prevented になり、読み込み直さない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'prevent-default.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['x'] },
  );

  expect(result.details.reacted).toEqual([
    { key: 'x', reactions: [{ kind: 'default-prevented' }] },
  ]);
  expect(result.details.reloads).toBe(0);
});

test('入力欄に autofocus があるページでも、body に戻してから押すので k に反応する', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'autofocus.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['k'] },
  );

  expect(result.details.reacted.map((r) => r.key)).toEqual(['k']);
});

test('listener が body にだけあるページは target が body の listener を記録し、k に反応する', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'body-listener.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['k'] },
  );

  expect(result.details.listeners.map((l) => l.target)).toEqual(['body']);
  expect(result.details.reacted.map((r) => r.key)).toEqual(['k']);
});

test('時計が自分で DOM を書き換え続けるページは、キーの反応とみなさない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'self-mutating.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['a', 'b', 'c'] },
  );

  expect(result.details.reacted).toEqual([]);
  expect(result.details.baselineDomMutations).toBeGreaterThan(0);
});

test('j で 200px スクロールするページは scroll の dy が 200 になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'scroll.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['j'] },
  );

  expect(result.details.reacted[0]?.reactions).toContainEqual({
    kind: 'scroll',
    dx: 0,
    dy: 200,
  });
});

test('maxReloads が 0 のとき、g で遷移したあと h は reload-limit で untested になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'navigate.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['g', 'h'], maxReloads: 0 },
  );

  expect(result.details.aborted?.reason).toBe('reload-limit');
  expect(result.details.untested).toEqual([
    { key: 'h', reason: 'reload-limit' },
  ]);
  expect(result.incomplete[0]?.nodes).toHaveLength(2);
});

test('maxReloads が 0 でも、最後のキー g で遷移するなら読み込み直さず aborted にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'navigate.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['a', 'g'], maxReloads: 0 },
  );

  expect(result.details.aborted).toBeNull();
  expect(result.details.untested).toEqual([]);
  expect(result.details.reloads).toBe(0);
  expect(result.details.reacted.map((r) => r.key)).toEqual(['g']);
});

test('timeBudgetMs が 1 のとき、時間切れで aborted になり残りのキーは untested になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'toggle-panel.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['j', 'k'], timeBudgetMs: 1 },
  );

  expect(result.details.aborted?.reason).toBe('timeout');
  expect(result.details.untested.length).toBeGreaterThan(0);
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
});

test('settleMs が 5000 で timeBudgetMs が 1000 のとき、baseline の途中で時間切れになりキーを 1 つも押さず全 94 キーが untested になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runKeys(
    'escape-only.html',
    { page, browser, testInfo },
    baseUrl,
    { settleMs: 5000, timeBudgetMs: 1000 },
  );

  expect(Date.now() - startedAt).toBeLessThan(10_000);
  expect(result.details.aborted?.reason).toBe('timeout');
  expect(result.details.keysTried).toEqual([]);
  expect(result.details.untested).toHaveLength(94);
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
});

test('e.code と e.shiftKey で判定するページでは、Shift が要る ? と A だけが反応し、Shift なしの / と a は反応しない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'shift-code.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['?', 'A', '/', 'a'] },
  );

  expect(result.details.reacted.map((r) => r.key)).toEqual(['?', 'A']);
});

test('Shift キー自体にだけ反応するページは、Shift が要る A と ? を押しても文字キーの反応とみなさず、開き直さない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'shift-only.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['A', '?', 'a'] },
  );

  expect(result.details.reacted).toEqual([]);
  expect(result.details.reloads).toBe(0);
});

test('Shift の keyup でダイアログを開くページは、Shift を離すのが反応の確定後なので A の反応とみなさず、開き直さない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'shift-keyup-dialog.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['A', 'a'] },
  );

  expect(result.details.reacted).toEqual([]);
  expect(result.details.reloads).toBe(0);
});

test('baseline の途中で自分で遷移するページは、例外にならず開き直して測り直し、maxReloads に達したらキーを押さず全キーが untested になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'baseline-redirect.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['k', 'j'], maxReloads: 2 },
  );

  expect(result.details.reloads).toBe(2);
  expect(result.details.aborted?.reason).toBe('reload-limit');
  expect(result.details.keysTried).toEqual([]);
  expect(result.details.untested).toEqual([
    { key: 'k', reason: 'reload-limit' },
    { key: 'j', reason: 'reload-limit' },
  ]);
});

test('maxReloads が 0 のとき、baseline の途中で遷移するページは例外にならず reload-limit で止まり結果を返す', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'baseline-redirect.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['k'], maxReloads: 0 },
  );

  expect(result.details.reloads).toBe(0);
  expect(result.details.aborted?.reason).toBe('reload-limit');
  expect(result.details.untested).toEqual([
    { key: 'k', reason: 'reload-limit' },
  ]);
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
});

test('keys に Enter を渡すと Error を投げる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runKeys('none.html', { page, browser, testInfo }, baseUrl, {
      keys: ['Enter'],
    }),
  ).rejects.toThrow();
});

test('keys に空配列を渡すと Error を投げる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runKeys('none.html', { page, browser, testInfo }, baseUrl, { keys: [] }),
  ).rejects.toThrow();
});

test('keys に 2 文字の文字列を渡すと Error を投げる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runKeys('none.html', { page, browser, testInfo }, baseUrl, {
      keys: ['ab'],
    }),
  ).rejects.toThrow();
});

test('settleMs のあとに遷移が確定するページは、次のキーを押す前に気づいて直前の g の navigation として記録し、読み込み直して h を押す', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'late-navigate.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['g', 'h'] },
  );

  expect(result.details.reacted.map((r) => r.key)).toEqual(['g', 'h']);
  expect(result.details.reacted[0]?.reactions).toEqual([
    {
      kind: 'navigation',
      toUrl: `${baseUrl}/character-key-shortcut/none.html`,
    },
  ]);
  expect(result.details.reacted[1]?.reactions[0]?.kind).toBe('dom-change');
  expect(result.details.reloads).toBe(1);
});

test('maxReloads が 0 のとき、遅れて起きた遷移は g に記録したうえで reload-limit で止まり h は untested になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'late-navigate.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['g', 'h'], maxReloads: 0 },
  );

  expect(result.details.reacted.map((r) => r.key)).toEqual(['g']);
  expect(result.details.reacted[0]?.reactions[0]?.kind).toBe('navigation');
  expect(result.details.aborted?.reason).toBe('reload-limit');
  expect(result.details.untested).toEqual([
    { key: 'h', reason: 'reload-limit' },
  ]);
});

test('1 秒に 1 回だけ DOM を書き換えるページは、baseline が 1 秒ぶん測られるのでキーの反応とみなさない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'slow-ticker.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] },
  );

  expect(result.details.reacted).toEqual([]);
  expect(result.details.baselineDomMutations).toBeGreaterThan(0);
});

test('blur されると input にフォーカスを戻すページは、body に置けないので全キーが focus-not-on-body で untested になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'refocus.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['a', 'b'] },
  );

  expect(result.details.reacted).toEqual([]);
  expect(result.details.keysTried).toEqual([]);
  expect(result.details.untested).toEqual([
    { key: 'a', reason: 'focus-not-on-body' },
    { key: 'b', reason: 'focus-not-on-body' },
  ]);
});

test('keypress の listener だけが preventDefault() するページは default-prevented になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'prevent-keypress.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['s'] },
  );

  expect(result.details.reacted).toEqual([
    { key: 's', reactions: [{ kind: 'default-prevented' }] },
  ]);
});

test('同じ URL で history.replaceState() を繰り返すページは、同一文書内の更新を遷移とみなさない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runKeys(
    'replace-state.html',
    { page, browser, testInfo },
    baseUrl,
    { keys: ['a', 'b', 'c', 'd', 'e'] },
  );

  expect(result.details.reacted).toEqual([]);
  expect(result.details.reloads).toBe(0);
});

test('maxReloads に負の数を渡すと Error を投げる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runKeys('none.html', { page, browser, testInfo }, baseUrl, {
      maxReloads: -1,
    }),
  ).rejects.toThrow();
});
