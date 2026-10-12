/**
 * change-on-input-check (WCAG 3.2.2): changing a form control's value must not
 * cause a change of context. Observed changes are reported as `incomplete`
 * (advice given beforehand makes them conform).
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import type { ChangeOnInputCheckResult } from '../dist/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateEnvelope = ajv.compile(RESULT_SCHEMAS['change-on-input-check']);

const RULE_ID = 'a11y-skills/no-context-change-on-input';

async function runChange(
  fixture: string,
  context: Parameters<typeof runFixtureCheck>[3],
  baseUrl: string,
  extra: Record<string, unknown> = {},
): Promise<ChangeOnInputCheckResult> {
  const result = (await runFixtureCheck(
    'change-on-input-check',
    `change-on-input/${fixture}`,
    baseUrl,
    context,
    { quiet: true, ...extra },
  )) as ChangeOnInputCheckResult;
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
  return result;
}

test('select の変更で移動するページは incomplete になり、移動後のやり直しで残りの欄も試される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'select-navigates.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.control.controlKind).toBe('select');
  expect(result.details.findings[0]?.changes[0]).toEqual({
    kind: 'navigation',
    toUrl: `${baseUrl}/change-on-input/landing.html`,
  });
  expect(result.details.restarts).toBe(1);
  expect(result.details.controlsTested).toBe(2);
  expect(result.url).toBe(`${baseUrl}/change-on-input/select-navigates.html`);
});

test('チェックボックスを入れると新しいウィンドウが開くページは new-window の finding になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'checkbox-popup.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
  expect(result.details.findings[0]?.changes).toEqual([
    { kind: 'new-window', url: `${baseUrl}/change-on-input/landing.html` },
  ]);
});

test('radio を選ぶとフォーカスが移るページは移動先を toSelector に持つ focus-moved になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'radio-focus.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.control.controlKind).toBe('radio');
  expect(result.details.findings[0]?.changes).toEqual([
    { kind: 'focus-moved', toSelector: '#other-text' },
  ]);
});

test('maxlength に達すると次の欄へ自動送りする text 欄は focus-moved の finding になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'text-autoadvance.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.control.selector).toBe('#zip1');
  expect(result.details.findings[0]?.changes).toEqual([
    { kind: 'focus-moved', toSelector: '#zip2' },
  ]);
});

test('text 欄の change で form を submit するページは navigation の finding になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'text-submit-on-change.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.changes[0]?.kind).toBe('navigation');
});

test('text 欄の input で入力の最中に移動するページは例外にならず navigation の finding になり、残りの欄も試される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'text-navigates-on-input.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.control.selector).toBe('#live');
  expect(result.details.findings[0]?.changes[0]?.kind).toBe('navigation');
  expect(result.details.restarts).toBe(1);
  expect(result.details.controlsTested).toBe(2);
});

test('text 欄の change で別の欄へ focus するページは移動先を toSelector に持つ focus-moved になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'text-change-focus.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.control.selector).toBe('#first');
  expect(result.details.findings[0]?.changes).toEqual([
    { kind: 'focus-moved', toSelector: '#second' },
  ]);
});

test('初期値が試験値と同じ欄でも別の値に変えて、2 欄とも controlsTested に数える', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'initial-value.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.controlsTested).toBe(2);
  expect(result.details.skipped).toEqual([]);
  expect(result.details.findings).toEqual([]);
});

test('値を即座に戻される欄は value-unchanged で skipped になり、対象なしの inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'value-reverted.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.controlsTested).toBe(0);
  expect(result.details.skipped).toHaveLength(1);
  expect(result.details.skipped[0]?.reason).toBe('value-unchanged');
  expect(result.inapplicable.map((r) => r.id)).toContain(RULE_ID);
});

test('select で alert が出るページは dialog の finding になり、チェックがハングしない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'select-alert.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toHaveLength(1);
  expect(result.details.findings[0]?.changes).toEqual([
    { kind: 'dialog', dialogType: 'alert', message: 'saved' },
  ]);
});

test('文脈が変わらないページは passes になり、4 種の欄すべてが試される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'clear.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.passes.map((r) => r.id)).toContain(RULE_ID);
  expect(result.details.controlsTested).toBe(4);
  expect(result.details.findings).toEqual([]);
});

test('欄がないページは inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'none.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.inapplicable.map((r) => r.id)).toContain(RULE_ID);
  expect(result.details.controlsFound).toBe(0);
});

test('disabled・readonly・hidden・見えない欄は試さず、option が 1 つの select だけ理由付きで skipped になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'skips.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.inapplicable.map((r) => r.id)).toContain(RULE_ID);
  expect(result.details.controlsTested).toBe(0);
  expect(result.details.skipped).toHaveLength(1);
  expect(result.details.skipped[0]?.selector).toBe('#only');
  expect(result.details.skipped[0]?.reason).not.toBe('');
});

test('maxControls を超えた欄は試さず、control-limit で止まって incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'clear.html',
    { page, browser, testInfo },
    baseUrl,
    { maxControls: 1 },
  );

  expect(result.details.aborted?.reason).toBe('control-limit');
  expect(result.details.controlsTested).toBe(1);
  expect(result.incomplete.map((r) => r.id)).toEqual([RULE_ID]);
});

test('値の戻しで change イベントが起きないので、2 回目の呼び出しで移動する handler は finding にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'restore-silent.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toEqual([]);
  expect(result.passes.map((r) => r.id)).toContain(RULE_ID);
});

test('settleMs に 0 を渡すと Error になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runChange('clear.html', { page, browser, testInfo }, baseUrl, {
      settleMs: 0,
    }),
  ).rejects.toThrow(/settleMs/);
});

test('maxControls に 1.5 を渡すと Error になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runChange('clear.html', { page, browser, testInfo }, baseUrl, {
      maxControls: 1.5,
    }),
  ).rejects.toThrow(/maxControls/);
});
