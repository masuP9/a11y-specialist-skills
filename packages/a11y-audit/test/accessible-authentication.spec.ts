/**
 * accessible-authentication-check (WCAG 3.3.8): pasting into password /
 * verification code fields is measured, autocomplete="off" is reported, and
 * CAPTCHA-like elements are listed as candidates (all `incomplete`).
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { runCli } from './helpers/cli.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { AUTH_PASTE_FIELD_TIMEOUT_MS } from '../dist/constants.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import type { AccessibleAuthenticationCheckResult } from '../dist/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateEnvelope = ajv.compile(
  RESULT_SCHEMAS['accessible-authentication-check'],
);

const PASTE_RULE_ID = 'a11y-skills/auth-paste-blocked';
const AUTOCOMPLETE_RULE_ID = 'a11y-skills/auth-autocomplete';
const CAPTCHA_RULE_ID = 'a11y-skills/auth-captcha';

async function runAuth(
  fixture: string,
  context: Parameters<typeof runFixtureCheck>[3],
  baseUrl: string,
  extra: Record<string, unknown> = {},
): Promise<AccessibleAuthenticationCheckResult> {
  return (await runFixtureCheck(
    'accessible-authentication-check',
    `accessible-authentication/${fixture}`,
    baseUrl,
    context,
    extra,
  )) as AccessibleAuthenticationCheckResult;
}

test('貼り付けが効く普通のログインフォームは 3 ルールとも passes になり、パスワード欄は inserted と記録される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'paste-ok.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.passes.map((r) => r.id).sort()).toEqual(
    [PASTE_RULE_ID, AUTOCOMPLETE_RULE_ID, CAPTCHA_RULE_ID].sort(),
  );
  expect(result.details.pasteTest.status).toBe('ran');
  const password = result.details.fields.find((f) => f.kind === 'password');
  expect(password?.paste?.result).toBe('inserted');
  expect(password?.paste?.valueAfterPaste).toBe('probe');
});

test('貼り付けの検査後、パスワード欄の値は検査前と同じ空に戻っている', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await runAuth('paste-ok.html', { page, browser, testInfo }, baseUrl);

  expect(await page.locator('input[type=password]').inputValue()).toBe('');
});

test('貼り付けで元の値を復元するページでも、結果 JSON に元の値（秘密）が含まれず、検査後に元の値へ戻っている', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'secret-restored.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const first = result.details.fields.find((f) => f.id === 'pw');
  expect(first?.paste?.result).toBe('blocked');
  expect(first?.paste?.valueAfterPaste).toBe('other');
  const json = JSON.stringify(result);
  expect(json).not.toContain('S3cret-Leak-Canary');
  expect(await page.locator('#pw').inputValue()).toBe('S3cret-Leak-Canary');
});

test('id に captcha を含む form の中のパスワードの初期値は、CAPTCHA 候補の html にも含まれない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'secret-restored.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.captchas).toHaveLength(1);
  expect(result.details.captchas[0]?.selector).toBe('#captcha-login');
  expect(JSON.stringify(result)).not.toContain('S3cret-Leak-Canary-2');
});

test('onpaste が false を返す欄は blocked になり、paste イベントの取り消しが true と記録される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'paste-blocked.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.incomplete.map((r) => r.id)).toEqual([PASTE_RULE_ID]);
  const password = result.details.fields.find((f) => f.kind === 'password');
  expect(password?.paste?.result).toBe('blocked');
  expect(password?.paste?.pasteEventPrevented).toBe(true);
});

test('貼った後に値を消すページは blocked になり、paste イベントは取り消されていないと summary に書く', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'paste-cleared.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const password = result.details.fields.find((f) => f.kind === 'password');
  expect(password?.paste?.result).toBe('blocked');
  expect(password?.paste?.pasteEventPrevented).toBe(false);
  expect(result.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'may clear the value',
  );
});

test('パスワード欄の autocomplete="off" は incomplete の node 1 件になり、autocomplete 属性の無いユーザー名欄は node にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'autocomplete-off.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const rule = result.incomplete.find((r) => r.id === AUTOCOMPLETE_RULE_ID);
  expect(rule?.nodes).toHaveLength(1);
  expect(rule?.nodes[0]?.failureSummary).toContain('turns off autofill');
  const username = result.details.fields.find((f) => f.kind === 'username');
  expect(username?.autocompleteStatus).toBe('missing');
});

test('パスワード欄の直前の文字入力欄は username として分類される', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'autocomplete-off.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.fields.map((f) => f.kind)).toEqual([
    'username',
    'password',
  ]);
});

test('名前が otp の欄と autocomplete="one-time-code" の欄は one-time-code と分類され、カードのセキュリティコード欄は対象にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'otp.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.fields.map((f) => f.kind)).toEqual([
    'one-time-code',
    'one-time-code',
  ]);
  expect(result.details.fields.map((f) => f.name)).not.toContain('cc-csc');
});

test('確認コード欄のうち貼り付けを取り消す欄だけが blocked になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'otp.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.fields.map((f) => f.paste?.result)).toEqual([
    'inserted',
    'blocked',
  ]);
});

test('入れ子の CAPTCHA 要素は外側の 1 件だけを node にする', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'captcha.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const rule = result.incomplete.find((r) => r.id === CAPTCHA_RULE_ID);
  expect(rule?.nodes).toHaveLength(1);
  expect(result.details.captchas).toHaveLength(1);
  expect(result.details.captchas[0]?.matchedBy).toContain('g-recaptcha');
});

test('認証欄も CAPTCHA も無いページは 3 ルールとも inapplicable で、貼り付けの検査は skipped-no-targets', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'none.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.inapplicable.map((r) => r.id).sort()).toEqual(
    [PASTE_RULE_ID, AUTOCOMPLETE_RULE_ID, CAPTCHA_RULE_ID].sort(),
  );
  expect(result.details.pasteTest.status).toBe('skipped-no-targets');
});

test('見えないパスワード欄は貼り付けを試さず paste が null で、auth-paste-blocked は incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'hidden.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const password = result.details.fields.find((f) => f.kind === 'password');
  expect(password?.visible).toBe(false);
  expect(password?.paste).toBeNull();
  expect(result.incomplete.map((r) => r.id)).toContain(PASTE_RULE_ID);
  expect(
    result.incomplete.find((r) => r.id === PASTE_RULE_ID)?.nodes[0]
      ?.failureSummary,
  ).toContain('not visible');
});

test('貼り付け中にページが遷移しても例外を投げず、遷移した欄は未計測、残りの欄は試さない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'navigates.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [first, second] = result.details.fields;
  expect(first?.paste?.navigated).toBe(true);
  expect(first?.paste?.result).toBeNull();
  expect(second?.paste).toBeNull();
  expect(result.url).toBe(
    `${baseUrl}/accessible-authentication/navigates.html`,
  );
  expect(result.incomplete.map((r) => r.id)).toContain(PASTE_RULE_ID);
});

test('paste handler が戻らないページでも期限内に結果を返し、timeout として記録する', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  test.setTimeout(30_000);
  const startedAt = Date.now();

  const result = await runAuth(
    'hangs.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(Date.now() - startedAt).toBeLessThan(
    AUTH_PASTE_FIELD_TIMEOUT_MS + 5_000,
  );
  const password = result.details.fields.find((f) => f.kind === 'password');
  expect(password?.paste?.error).toBe('timeout');
  expect(result.incomplete.map((r) => r.id)).toContain(PASTE_RULE_ID);
});

test('合成 paste イベントの段で戻らなくなっても期限内に結果を返し、blocked のまま timeout を記録し、次の欄は試さない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  test.setTimeout(30_000);
  const startedAt = Date.now();

  const result = await runAuth(
    'hangs-synthetic.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(Date.now() - startedAt).toBeLessThan(
    AUTH_PASTE_FIELD_TIMEOUT_MS + 5_000,
  );
  const [first, second] = result.details.fields;
  expect(first?.paste?.result).toBe('blocked');
  expect(first?.paste?.pasteEventPrevented).toBeNull();
  expect(first?.paste?.error).toBe('timeout');
  expect(second?.paste).toBeNull();
});

test('戻らない paste handler のページでも CLI は有限時間で終了コード 0 か 1 で終わる', async ({
  baseUrl,
}, testInfo) => {
  test.setTimeout(60_000);
  const { code } = await runCli(
    [
      '--url',
      `${baseUrl}/accessible-authentication/hangs.html`,
      '--checks',
      'accessible-authentication-check',
      '--output-dir',
      testInfo.outputDir,
    ],
    45_000,
  );

  expect([0, 1]).toContain(code);
});

test('同じ id のパスワード欄が 2 つあっても selector は別になり、2 つ目の欄の結果が blocked になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'duplicate-id.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [first, second] = result.details.fields;
  expect(first?.selector).not.toBe(second?.selector);
  expect(first?.paste?.result).toBe('inserted');
  expect(second?.paste?.result).toBe('blocked');
});

test('貼り付けに使うテキストは 2 桁で、4 桁の確認コード欄が満桁にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'paste-ok.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.pasteTest.probe).toBe('12');
});

test('type=password でも autocomplete が one-time-code なら one-time-code と分類され、autocompleteStatus は ok', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'otp-password.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.fields).toHaveLength(1);
  expect(result.details.fields[0]?.kind).toBe('one-time-code');
  expect(result.details.fields[0]?.autocompleteStatus).toBe('ok');
});

test('パスワード欄の autocomplete="on" は自動入力を止めていないので auth-autocomplete の node にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'autocomplete-on.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.fields[0]?.autocompleteStatus).toBe('missing');
  expect(result.passes.map((r) => r.id)).toContain(AUTOCOMPLETE_RULE_ID);
});

test('form の外のログインの前にある検索欄は fields に入らず、同じまとまりの user 欄が username になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'username-search.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.fields.map((f) => [f.kind, f.name])).toEqual([
    ['username', 'user'],
    ['password', null],
  ]);
});

test('form の外のパスワード欄とは body でしか祖先を共有しない文字入力欄は username にならない', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'username-unrelated.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.fields.map((f) => f.kind)).toEqual(['password']);
});

test('名前が footprint の欄は確認コード欄にならず、otpCode の欄は one-time-code になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'otp-words.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.fields.map((f) => [f.kind, f.name])).toEqual([
    ['one-time-code', 'otpCode'],
  ]);
});

test('欄に autocomplete が無く form が autocomplete="off" なら、欄は off を引き継ぎ、summary に form 由来と書く', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'form-autocomplete-off.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const password = result.details.fields[0];
  expect(password?.autocompleteStatus).toBe('off');
  expect(password?.formAutocomplete).toBe('off');
  expect(password?.autocomplete).toBeNull();
  const rule = result.incomplete.find((r) => r.id === AUTOCOMPLETE_RULE_ID);
  expect(rule?.nodes).toHaveLength(1);
  expect(rule?.nodes[0]?.failureSummary).toContain('form');
});

test('form が autocomplete="off" でも、欄自身の autocomplete="current-password" が優先されて ok になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'form-autocomplete-override.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.fields[0]?.autocompleteStatus).toBe('ok');
  expect(result.passes.map((r) => r.id)).toContain(AUTOCOMPLETE_RULE_ID);
});

test('フォーカスすると別の欄へフォーカスを移すパスワード欄は貼り付けず、focus-moved の未計測になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'focus-moves.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const password = result.details.fields.find((f) => f.kind === 'password');
  expect(password?.paste?.result).toBeNull();
  expect(password?.paste?.valueAfterPaste).toBeNull();
  expect(password?.paste?.error).toBe('focus-moved');
  const summary = result.incomplete.find((r) => r.id === PASTE_RULE_ID)
    ?.nodes[0]?.failureSummary;
  expect(summary).toContain('could not be tested');
  expect(summary).toContain('focus-moved');
  expect(summary).not.toContain('did not insert');
});

test('paste: false のとき貼り付けを試さず status は disabled、全欄の paste は null で、auth-paste-blocked は incomplete', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runAuth(
    'paste-ok.html',
    { page, browser, testInfo },
    baseUrl,
    { paste: false },
  );

  expect(result.details.pasteTest.status).toBe('disabled');
  expect(result.details.fields.map((f) => f.paste)).toEqual([null, null]);
  expect(result.incomplete.map((r) => r.id)).toContain(PASTE_RULE_ID);
});

for (const fixture of [
  'paste-ok.html',
  'secret-restored.html',
  'paste-blocked.html',
  'paste-cleared.html',
  'autocomplete-off.html',
  'otp.html',
  'captcha.html',
  'none.html',
  'hidden.html',
  'navigates.html',
]) {
  test(`${fixture} の結果は accessible-authentication-check の schema に合う`, async ({
    page,
    browser,
    baseUrl,
  }, testInfo) => {
    const result = await runAuth(fixture, { page, browser, testInfo }, baseUrl);

    expect(
      validateEnvelope(result),
      JSON.stringify(validateEnvelope.errors),
    ).toBe(true);
  });
}
