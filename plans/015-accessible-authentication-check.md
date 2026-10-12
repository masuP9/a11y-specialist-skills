# Plan 015: アクセシブルな認証 (WCAG 3.3.8) チェック — 貼り付けの禁止・autocomplete・CAPTCHA

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/63

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> の本プランのステータス行を更新する。
>
> **Drift check (run first)**:
> `git diff --stat a6b24ff..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json skills/auditing-wcag .github/workflows/ci.yml`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比較してから
> 進む。構造的な不一致（`CHECK_REGISTRY` の形・`RULES` の形・`bucketize` /
> `pageNode` のシグネチャ・`buildEnvelopeSchema` のシグネチャ・
> `openEventListenerInspector` の返り値の形の変化）は STOP。
> #61（3.2.2、plan 014）が先にマージされていた場合、`types.ts` / `constants.ts` /
> `rule-registry.ts` / `axe-format.ts` / `cli.ts` / `schemas` / テストの登録表 /
> ドキュメントの一覧に**新しい行が増えているだけ**なら構造的な不一致ではない。
> その行の後ろに本チェックを足す（チェック数・ルール数の数え直しを忘れない）。

> **番号について**: `014` は #61 が並行して使うため `015` にした。

## Status

- **Priority**: P2
- **Effort**: M（2〜3 日相当。貼り付けの実測と、ハング・遷移への備えが半分）
- **Risk**: LOW〜MEDIUM（新規チェックの追加のみで既存チェックには触れない。
  CI の `--checks all` スモークが新チェックを必ず通すが、`cli-smoke.html` に
  パスワード欄・CAPTCHA は無いので inapplicable で終わるはず。貼り付けの実測は
  クリップボードの権限を context に付与する＝呼び出し側の context を変える）
- **Depends on**: なし（#61 とは同じファイルの末尾に行を足す点だけがぶつかる）
- **Category**: feature
- **Planned at**: commit `a6b24ff`, 2026-10-13
- **Consumer**: 下流の WCAG テスト管理ツール（関数 API で呼び、`details` を取り込む）。
  評価できていない達成基準の洗い出しで 3.3.8 が挙がった。

## Why this matters

3.3.8（アクセシブルな認証（最低限））は現在すべて手動（`coverage-matrix` で
`インタラクティブ`）。ただし、よくある不適合のうち次の 3 つは機械で拾える。

1. **パスワード・確認コード欄への貼り付けの禁止**。パスワード管理ソフトからの
   貼り付けができないと、記憶や書き写し（認知機能テスト）を強いることになる。
   実際に貼ってみれば「入らない」ことは確かめられる（別の手段があれば満たしうるので、分類は incomplete）。
2. **`autocomplete="off"` などで自動入力を妨げている**。パスワード管理ソフトや
   SMS のコード自動入力が使えなくなる。
3. **CAPTCHA らしき要素**。画像の文字やパズルは認知機能テストになりうるが、
   別の手段があるかは人でないと決められない。

これを **15 個目のチェック `accessible-authentication-check`（SC 3.3.8）** として
まとめる。

### autocomplete を既存の `autocomplete-audit` に足さず、新チェックにまとめる理由

Issue では「今ある autocomplete のチェックに足すのが近い」とあったが、次の理由で
新チェック側に置く。

- **判断材料が違う**: `autocomplete-audit`（1.3.5）は欄の名前・ラベルから目的を
  **推定**し、推定できた欄の autocomplete 欠落を報告する。3.3.8 で見たいのは
  `type=password`・`one-time-code` など**認証の欄であること自体が確定している欄**で、
  「`off` で自動入力を止めている」ことが問題。推定の仕組みを共有しない。
- **SC タグが違う**: 既存のルールは `wcag135`。3.3.8 の所見に `wcag338` を付けるには
  別ルールが要る。既存ルールに 3.3.8 を混ぜると、既存の結果（1.3.5 だけを集計して
  いる利用者）の意味が変わる。
- **既存チェックの挙動を変えない**: 既存の runner・normalizer・schema・rule には
  触れない（過去のプランと同じ方針）。
- **一緒に見たほうが判断しやすい**: 貼り付けの禁止と autocomplete の `off` は
  どちらも「パスワード管理ソフトが使えるか」の問いで、同じ欄の一覧に並ぶ。

使い回すのは `runAutocompleteAudit.ts` の `autocompleteTokens()`（字句の分け方）だけ。
1.3.5 側の `autocomplete-missing` は今までどおりパスワード欄も報告する（重なりは
許容する。SC が違う所見なので）。

### #89（motion-actuation-check）から使い回すもの

- `src/playwright/cdpEventListeners.ts` の `openEventListenerInspector()` を
  **`terminateExecution()` のため**に使う（貼り付けの handler が戻らないときの打ち切り）。
  listener の一覧（`forEach`）は証跡として `paste` / `beforeinput` の listener の
  有無を記録するのに使う（任意の証跡。判定には使わない）。
- 時間の上限・遷移の扱いは `runMotionActuationCheck.ts` の `simulateOne` と同じ考え方
  （`Promise.race` で期限を切る、遷移したら残りを打ち切る、未計測は `null`）。

## Current state（統合点 — `a6b24ff` で確認済み）

リポジトリは npm workspaces モノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` ビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース。

### 貼り付けの実測は headless Chromium で動く（計画時に確認済み）

計画時の試作（`chromium.launch()` 既定の headless）で次を確認した:

- `context.grantPermissions(['clipboard-read', 'clipboard-write'])` の後、
  **安全な接続（https）のページ**で `navigator.clipboard.writeText()` が使える。
  about:blank・`setContent` のページでは `navigator.clipboard` が `undefined`。
- そこで、**同じ context に補助ページを開き**、`page.route('https://a11y-audit.invalid/', …)`
  で返した https のページで `writeText` してから補助ページを閉じると、
  **対象ページが about:blank（安全でない接続）でも** `page.keyboard.press('ControlOrMeta+V')`
  で値が入る（クリップボードはブラウザ全体で共有）。
- `onpaste="return false"` の欄と、`input` で `inputType === 'insertFromPaste'` の
  ときに値を消す欄は、どちらも貼った後に値が空になる（＝実測で見分けられる）。
- 合成の `new ClipboardEvent('paste', { clipboardData, cancelable: true })` を
  `dispatchEvent` すると、`onpaste="return false"` で `defaultPrevented === true` になる。

### 新チェック追加の統合点（直近の前例: motion-actuation-check, #89）

`motion-actuation-check`（`kind: 'page'`、遷移済み `page` を受ける）が最も近い見本。

1. `src/types.ts` — `CheckSource` ユニオン（:21-35、末尾が `'motion-actuation-check'`）に追加。details 型もここ。
2. `src/constants.ts` — 新定数。`AUTOCOMPLETE_NORMAL_FIELD_NAMES`（:436〜）に
   `username` / `new-password` / `current-password` / `one-time-code` がある。
3. `src/utils/rule-registry.ts` — `RULES`。node scope の見本は `redundant-entry`（:244〜）、
   page scope は `motion-actuation`（:260〜）。
4. `src/utils/axe-format.ts` — `bucketize(buckets, key, nodes, applicable, override?)`（:86。
   `override` で分類を上書きできる）、`pageNode(summary)`（:133）。要素の node は
   `normalizeAutocompleteAudit` が使う `toNode(field, summary)` が見本。
5. `src/index.ts` — axe-format の export リストに normalizer を追加。
6. `src/playwright/index.ts` — runner と Options 型の export。
7. `src/schemas/index.ts` — `buildEnvelopeSchema` で schema を作り `RESULT_SCHEMAS` に登録。
8. `src/cli.ts` — `CHECK_REGISTRY`（:66〜）末尾、`motion-actuation-check`（:221-232）の後ろに
   `kind: 'page'` エントリ（lazy import）。CLI は `kind: 'page'` のチェックごとに
   `browser.newContext()` を作る（:446-447）ので、権限の付与は他のチェックに影響しない。
9. `src/test-entries/accessible-authentication-check.ts`（新規）— `motion-actuation-check.ts` と同形。
10. `packages/a11y-audit/package.json` — `exports` に `./test-entries/accessible-authentication-check`、
    `description` のチェック列挙に追記。
11. テスト: `test/helpers/fixtures.ts`（`buildRunnerRegistry`、:115 の motion-actuation の後ろに
    `kind: 'page-current'`）、`test/fixture-gallery.spec.ts`（`MANIFEST`、冒頭コメント
    「all 14 checks」「all 24 custom finding-capable rules」→ 15 / 27）、
    `test/rule-classification.spec.ts`（`FINDING_EXPECTATIONS`）、`test/schema-validation.spec.ts`。
    フィクスチャは `test/fixtures/pages/<check>/*.html`。テストは `../dist/...` から import する。
12. ドキュメント: `packages/a11y-audit/README.md` / `README.ja.md`（検査一覧表 :16-30、
    チェック名一覧 :144-158、test entry の列挙 :406-408）、`CHANGELOG.md`（`## Unreleased` →
    `### Added` が既にある）、`TODO-COVERAGE.md`（JA のみ。「部分的に自動化可能」節、
    2.5.4 の節 :137 の後ろ）、`skills/auditing-wcag/SKILL.md` / `SKILL.ja.md`（CLI チェック表、
    :125 が motion-actuation）、`references/coverage-matrix.md` / `.ja.md`（:73 が 3.3.8 行、
    :99-101 の「基準 × チェック名 × 出力ファイル」表）、`references/interactive-checks.md` /
    `.ja.md`（:232 が 3.3.8 行）。

### CI

`.github/workflows/ci.yml` が `dist/cli.js --url file://.../cli-smoke.html --checks all`
を実行し、exit code 1 と `Errors: +0` を要求する。`cli-smoke.html` には
`<input type="text" id="name-field">` しか無いので、本チェックは認証欄 0・CAPTCHA 0 で
全ルール inapplicable、補助ページも開かずに終わるはず（Step 6 で確認）。

## Commands you will need

リポジトリルートで実行する（worktree では `npm --prefix <worktree> run <script>`）。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| Full test suite | `npm test` | all pass |
| New spec only | `npm test --workspace @a11y-skills/audit -- test/accessible-authentication.spec.ts` | all pass |
| List checks | `node packages/a11y-audit/dist/cli.js --list-checks` | 末尾が `accessible-authentication-check` |
| 全体検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/playwright/runAccessibleAuthenticationCheck.ts`、
  `src/test-entries/accessible-authentication-check.ts`、
  `test/fixtures/pages/accessible-authentication/{paste-blocked,paste-cleared,paste-ok,autocomplete-off,otp,captcha,none,navigates,hangs,hangs-synthetic,hidden,secret-restored}.html`、
  `test/accessible-authentication.spec.ts`
- 編集（追加のみ）: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、
  `src/utils/axe-format.ts`、`src/index.ts`、`src/playwright/index.ts`、
  `src/schemas/index.ts`、`src/cli.ts`、`packages/a11y-audit/package.json`
  （`exports` と `description` のみ）、`test/helpers/fixtures.ts`、
  `test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、
  `test/schema-validation.spec.ts`
- ドキュメント: 上記統合点 12 のファイル

**Out of scope**:

- 既存チェック（`runAutocompleteAudit.ts` を含む）の runner・normalizer・schema・rule。
  `autocompleteTokens` は import するだけで変えない
- `cdpEventListeners.ts` の変更（今の API で足りる。足りなければ STOP）
- iframe（別オリジンのログインフォームなど）・shadow root の中の欄
- 認証の手順が複数ページに分かれる場合の 2 ページ目以降（呼び出し側がそのページを渡せば見る）
- パスキー・SSO など、認知機能テストを使わない別の手段があるかの判定（人の確認に回す）
- `package.json` の `version`、プラグイン 4 フィールドの version（リリース PR で別途）
- `.github/workflows/`

## Git workflow

- ブランチ: `feat/accessible-authentication-check`
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`）:
  1. `feat(a11y-audit): add accessible authentication types, constants and rules`
  2. `feat(a11y-audit): add accessible authentication normalizer and schema`
  3. `feat(a11y-audit): add accessible authentication runner (3.3.8)`
  4. `feat(a11y-audit): register accessible-authentication-check in CLI and exports`
  5. `test(a11y-audit): add accessible authentication specs and fixtures`
  6. `docs: document accessible-authentication-check (3.3.8)`
- 公開リポジトリなので、コミットされる文面に下流の利用者のツール名・サービス名を
  書かない（「downstream consumer」と書く）。

## 設計

### A. 対象の欄の見つけ方（ページ内の `page.evaluate`、主文書のみ）

`document.querySelectorAll('input')` を走査し、各欄に `kind` を付ける。

| kind | 条件（上から順に最初に当たったもの） |
|------|------|
| `password` | `type === 'password'` |
| `one-time-code` | autocomplete の字句に `one-time-code` を含む。または `type` が `text` / `tel` / `number` / `password` 以外の文字入力で、name・id・ラベル・`aria-label`・placeholder のどれかが `AUTH_OTP_NAME_PATTERN` に当たる |
| `username` | autocomplete の字句に `username` を含む。または `type` が `text` / `email` / `tel` で、**同じ form（form に属さない場合は文書全体）の中で最初のパスワード欄より前にある、最後の文字入力欄** |

- 字句の分解は `autocompleteTokens()`（`runAutocompleteAudit.ts` から import）をページ内でも
  使えないので、ページ内では値をそのまま返し、**Node 側で** `autocompleteTokens()` を通す。
  ページ内で必要な判定（`one-time-code` / `username` を含むか）は、小文字化して ASCII 空白で
  分ける同じ処理をページ内関数の中に書く（関数はシリアライズされて送られるため import できない）。
  その旨をコメントに書く。
- ラベルの文字列は `el.labels` の textContent・`aria-label`・`aria-labelledby` の参照先の
  textContent を空白でつないだもの（80 文字で切る）。`ariaSnapshot` は使わない（欄の数が
  少ないので精度より単純さを取る）。
- `AUTH_OTP_NAME_PATTERN`（定数）:
  `/(otp|one.?time|verification.?code|verify.?code|auth(entication)?.?code|security.?code.?(sms|email)|2fa|mfa|totp|確認コード|認証コード|ワンタイム|検証コード)/i`
  （カードの「セキュリティコード」単独には当てない）。
- 各欄について記録する: `selector`（`collectBasicFieldInfo` の `getUniqueSelector` と同じ規則。
  ページ内関数に同じ処理を書く）、`html` / `htmlTruncated`（**下記 B の `safeOuterHTML` で取る**。初期値に本物の秘密が入っているページで漏らさないため）、
  `kind`、`inputType`、`name`、`id`、`labelText`、`autocomplete`（属性値。無ければ `null`）、
  `editable`（`:disabled` でも `readOnly` でもない）、`visible`（`getClientRects().length > 0`
  かつ `visibility !== 'hidden'`）、`formSelector`。
- **全欄に `data-a11y-auth-index` 属性などを付けない**（ページを汚さない）。後の操作は
  `page.locator(selector)` で行う。`#id` の selector が CSS として不正な id（数字始まりなど）を
  含む場合は `CSS.escape` を使う（`getUniqueSelector` には無い配慮。本チェック側でだけ使う）。

### B. CAPTCHA らしき要素の見つけ方（同じ `page.evaluate`）

`AUTH_CAPTCHA_SELECTOR`（定数、1 本の CSS セレクタ）に当たる要素を集め、**祖先がすでに
当たっている要素は除く**（`.g-recaptcha` の中の `iframe` を二重に数えない）:

```
iframe[src*="captcha" i], iframe[src*="challenges.cloudflare.com" i],
iframe[src*="arkoselabs" i], iframe[src*="funcaptcha" i],
.g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey],
[id*="captcha" i], [class*="captcha" i], [name*="captcha" i],
img[src*="captcha" i], img[alt*="captcha" i]
```

（`captcha` は `recaptcha` / `hcaptcha` を含む。`<script>` / `<style>` / `<link>` /
`<meta>` は対象外にする。）各要素について `selector`・`html` / `htmlTruncated`・
`matchedBy`（当たったセレクタの部分。最初に当たったもの）・`visible` を記録する。

**html 抜粋の秘匿（欄・CAPTCHA 候補の両方に共通）**: ページ内関数に `safeOuterHTML(el)` を
1 つ書き、`html` はすべてこれで取る。`el.cloneNode(true)` した複製について、複製自身と
`querySelectorAll('[value]')` の子孫すべての `value` 属性を外してから `outerHTML` を取り、
`HTML_SNIPPET_MAX_LENGTH` で切る。CAPTCHA 候補は `[id*="captcha" i]` などで親の form を
拾いうる（`<form id="captcha-login"><input type="password" value="…">`）ため、子孫の
初期値も漏らさないようにする。

### C. 貼り付けの実測

対象: `kind` が `password` / `one-time-code` で、`editable && visible` の欄。
（`username` は実測しない。Issue の対象外。）

手順（runner 内。対象欄が 0 件なら何もしない＝補助ページも開かない）:

1. `paste === false` なら `pasteTest.status = 'disabled'`、各欄の `paste` は `null`。
2. `page.context().grantPermissions(['clipboard-read', 'clipboard-write'])` を try/catch。
   失敗（Chromium 以外）→ `status: 'unavailable'`、`reason: 'clipboard-permission'`。
3. 補助ページ: `const helper = await page.context().newPage()`、
   `helper.route(PASTE_HELPER_URL, r => r.fulfill({ contentType: 'text/html', body: '<input id="probe">' }))`、
   `helper.goto(PASTE_HELPER_URL)`、`helper.evaluate(t => navigator.clipboard.writeText(t), probe)`。
   続けて**補助ページの `#probe` に Ctrl+V して値が `probe` になるか**を確かめる（この環境で
   キーボードの貼り付けが効くことの対照実験）。ならなければ `status: 'unavailable'`、
   `reason: 'paste-shortcut'`。補助ページは `finally` で必ず閉じる。
   `PASTE_HELPER_URL = 'https://a11y-audit.invalid/paste-probe'`（`.invalid` は実在しない
   TLD なので外へ通信しない。route で必ず返す）。
   **クリップボードの中身は欄ごとに書き直さない**（1 回書いた値を全欄で使う）。
4. **（実測より前に）証跡の listener 件数を取る**。inspector が開けていれば対象欄の
   `paste` / `beforeinput` / `input` の listener の件数を `forEach` で取る
   （`pasteListenerCount: number | null`）。対象欄を `page.evaluate` でページの一時的な配列
   （`window.__a11yAuthFields`）に入れ、`forEach('window.__a11yAuthFields', ['paste', 'beforeinput', 'input'])`、
   取り終わったら `delete window.__a11yAuthFields`。**ページのスクリプトがまだ何も走らされて
   いない実測前に行う**（実測でハングした後に CDP・evaluate を呼ばないため）。この処理全体も
   `AUTH_PASTE_STEP_TIMEOUT_MS` で `Promise.race` し、期限切れ・失敗なら全欄 `null` にして
   実測へ進む。listener は委譲（`document` に付ける）もあるので、判定には使わない。
5. `page.bringToFront()` してから、欄ごとに **1 欄分の操作列 `pasteOne(field, signal)`** を走らせる。
   操作列は次のすべてを含む（**合成イベントと復元も期限の内側**）:
   1. 元の値を控える（`locator.inputValue()`）。
   2. `locator.focus()`（`timeout: AUTH_PASTE_STEP_TIMEOUT_MS`）→ 空にする
      （`locator.evaluate(el => { el.value = '' })`。イベントは起こさない）→
      `page.keyboard.press('ControlOrMeta+V')` → `AUTH_PASTE_SETTLE_MS`（300ms）待つ →
      `locator.inputValue()`。
   3. 判定: 値が空でなく、**`probe` の先頭部分を含む**（`maxlength` で切られることがあるため、
      `value.length > 0 && probe.startsWith(value)` または `value === probe`）→ `'inserted'`。
      それ以外 → `'blocked'`。
   4. `'blocked'` のときだけ、**合成の paste イベント**を送り `defaultPrevented` を
      `pasteEventPrevented` に記録する（禁止の仕組みの証跡。`true` なら paste の
      `preventDefault`、`false` なら貼った後に値を消すなど別の仕組み）。
   5. 元の値に戻す（`el.value = original`、イベントは起こさない）。

   - **取り消し**: `signal` は `{ cancelled: boolean }` の Node 側の印。操作列は**各 `await` の
     直後に `signal.cancelled` を確かめ、立っていれば以後のページ操作をせずに戻る**
     （`Promise.race` は元の操作列を止めないため。`runMotionActuationCheck.ts` の `simulateOne`
     がページ側の取消フラグで同じことをしている）。
   - **時間の上限**: 操作列全体を Node 側で `AUTH_PASTE_FIELD_TIMEOUT_MS`（5000ms）と
     `Promise.race` する。期限切れなら `signal.cancelled = true` にし、inspector の
     `terminateExecution()`（これ自体も `AUTH_PASTE_STEP_TIMEOUT_MS` で race する）で
     ページのスクリプトを打ち切り、`error: 'timeout'` を記録して**残りの欄は試さない**。
     打ち切りに失敗・期限切れ、または inspector が `null`（CDP 不可）なら
     `error: 'timeout-unrecoverable'`。元の操作列の Promise には `.catch(() => {})` を付けて
     外に漏らさない。借りた page は閉じない。
   - **期限切れ・遷移の後に呼んでよいページ操作は無い**。listener の証跡（手順 4）は実測前に
     取り終えているので、この後は `page.url()`（Node 側で保持している値を返すだけでページを
     待たない）以外のページ操作をせず、結果を組み立てて返す。値の復元もしない（未復元である
     ことは `error` で分かる）。
   - **遷移**: 操作後に `page.url()` が開始時と違う、または「Execution context was destroyed」
     等で失敗したら `navigated: true` を記録し、残りの欄は試さない（OTP 欄で値が入ると
     自動送信するページがあるため）。`probe` はその対策として**短く**する（下記 G）。
   - その他の例外は `error` に文言を入れて次の欄へ。
   - 結果: `paste: { result: 'inserted' | 'blocked' | null, valueAfterPaste: 'probe' | 'probe-prefix' | 'empty' | 'other' | null,
     pasteEventPrevented: boolean | null, navigated: boolean, error: string | null }`。
   - **欄の値そのものは結果に一切残さない**（details・summary・コンソール出力のどれにも）。
     貼った後の値は `probe` との比較の種類（`valueAfterPaste`: 一致 / `probe` の先頭部分 /
     空 / それ以外）だけを記録する。ページが貼り付けを拒んで元の値（既に入っていた本物の
     パスワードなど）を戻すことがあり、生の値を記録すると認証情報が監査結果に漏れるため。
     控えた元の値は復元のために Node 側の変数に持つだけで、記録・出力しない。`error` には
     Playwright の例外の文言を入れるが、欄の値を含む文言を組み立てない。
     未計測は `result: null`・`valueAfterPaste: null`。期限切れが合成イベントの段で起きた場合は、`result` は
     `'blocked'` のまま `pasteEventPrevented: null`、`error: 'timeout'`。
6. inspector はチェック全体の `finally` で `close()`（`close()` は失敗を握りつぶす実装。
   これも `AUTH_PASTE_STEP_TIMEOUT_MS` で race し、待ちきれなくても結果は返す）。
   補助ページの `close()` も同様に race する。

### D. autocomplete の判定（Node 側、全対象欄。editable・visible を問わない）

| kind | 期待する欄名（`section-*` / `shipping` / `billing` / `webauthn` は無視して欄名を見る） |
|------|------|
| `password` | `current-password` / `new-password` |
| `one-time-code` | `one-time-code` |
| `username` | `username` / `email` / `tel` |

`autocompleteStatus`:

- `'ok'`: 期待する欄名を含む
- `'off'`: 字句が `off` だけ
- `'mismatch'`: 期待しない欄名（例: パスワード欄に `email`、`on`、文法違反の値）
- `'missing'`: 属性が無い、または空

node にするのは **`off` と `mismatch` だけ**。`missing` は details に残すが node にしない
（属性が無くてもパスワード管理ソフトは欄の種類から推定して動くことが多く、`off` のように
明示的に止めてはいない。1.3.5 の `autocomplete-missing` が別に報告する）。この判断は
runner 先頭コメントと README に書く。

### E. 型（`src/types.ts`）

```ts
export type AuthFieldKind = 'password' | 'one-time-code' | 'username';

export interface AuthPasteResult {
  /** null when not measured (navigation, timeout or error). */
  result: 'inserted' | 'blocked' | null;
  /**
   * How the field value compared with the probe after pasting. The raw value is
   * never recorded: a page may restore a real secret instead of the probe.
   */
  valueAfterPaste: 'probe' | 'probe-prefix' | 'empty' | 'other' | null;
  /** Only measured when result is 'blocked'. */
  pasteEventPrevented: boolean | null;
  navigated: boolean;
  error: string | null;
}

export interface AuthField {
  selector: string;
  html: string;
  htmlTruncated: boolean;
  kind: AuthFieldKind;
  inputType: string;
  name: string | null;
  id: string | null;
  labelText: string | null;
  autocomplete: string | null;
  autocompleteStatus: 'ok' | 'off' | 'mismatch' | 'missing';
  editable: boolean;
  visible: boolean;
  formSelector: string | null;
  /** null when the field was not paste-tested (username, hidden, disabled, or pasteTest not 'ran'). */
  paste: AuthPasteResult | null;
  /** paste/beforeinput/input listeners on the field itself; null when not inspected. */
  pasteListenerCount: number | null;
}

export interface CaptchaCandidate {
  selector: string;
  html: string;
  htmlTruncated: boolean;
  matchedBy: string;
  visible: boolean;
}

export interface AccessibleAuthenticationCheckDetails {
  fields: AuthField[];
  captchas: CaptchaCandidate[];
  pasteTest: {
    status: 'ran' | 'disabled' | 'unavailable' | 'skipped-no-targets';
    /** Why the test could not run; null unless status is 'unavailable'. */
    reason: 'clipboard-permission' | 'paste-shortcut' | 'helper-page' | null;
    /** The text written to the clipboard; null when not written. */
    probe: string | null;
  };
}

export type AccessibleAuthenticationCheckResult =
  AuditCheckResult<AccessibleAuthenticationCheckDetails>;
```

`CheckSource` に `'accessible-authentication-check'` を追加。

### F. ルール（`src/utils/rule-registry.ts`、`// --- accessible-authentication-check ---`）

| key | id | classification | scope | impact |
|-----|----|----|----|----|
| `auth-paste-blocked` | `a11y-skills/auth-paste-blocked` | `incomplete` | node | `serious` |
| `auth-autocomplete` | `a11y-skills/auth-autocomplete` | `incomplete` | node | `moderate` |
| `auth-captcha` | `a11y-skills/auth-captcha` | `incomplete` | node | `moderate` |

すべて `sc: ['3.3.8']`、`tags: ['a11y-skills', 'wcag22aa', 'wcag338']`、
`helpUrl: \`${UNDERSTANDING}/accessible-authentication-minimum.html\``。

- `auth-paste-blocked` を **`incomplete`** にする根拠（コメントに書く）: 貼って入らなかった
  こと自体は実測で確かめているが、3.3.8 は「認知機能テストを使わない別の手段がある」
  「自動入力など別の支援の仕組みがある」場合に満たしうる。本チェックはどちらも判定しない
  （貼り付けの失敗だけでは自動入力が使えないことまでは分からない）。分類の方針
  （`rule-registry.ts` 冒頭・README「分類は保守的です」: 死角が無く例外が当てはまり得ない
  ものだけ violation）に従い incomplete とする。Issue #63 の「入らなければ violation」からの
  変更点として PR 本文に書く。`impact` は確度の高い所見なので `serious` にする。
- `description` / `help` の例:
  - paste: `'Ensure password and verification code fields allow pasting'` /
    `'Allow pasting into authentication fields so password managers can be used (unless another authentication method without a cognitive function test is offered)'`
  - autocomplete: `'Ensure authentication fields do not disable autofill'` /
    `'Use autocomplete="current-password" / "new-password" / "one-time-code" / "username" on authentication fields instead of "off"'`
  - captcha: `'Ensure CAPTCHAs in authentication offer an alternative without a cognitive function test'` /
    `'Check that a CAPTCHA is not the only way through authentication, or that it recognizes objects or user-provided content'`

### G. 定数（`src/constants.ts`）

```ts
/** WCAG 3.3.8: fields whose name/label suggests a one-time verification code. */
export const AUTH_OTP_NAME_PATTERN = /…/i; // 設計 A の値
/** WCAG 3.3.8: elements that look like a CAPTCHA (outermost match only). */
export const AUTH_CAPTCHA_SELECTOR = '…'; // 設計 B の値
/** Secure-context page used to write the clipboard; never leaves the browser (route-fulfilled). */
export const AUTH_PASTE_HELPER_URL = 'https://a11y-audit.invalid/paste-probe';
/** Short, digit-only so that one-time-code fields accept it and do not auto-submit on a full code. */
export const AUTH_PASTE_PROBE = '1234';
export const AUTH_PASTE_SETTLE_MS = 300;
export const AUTH_PASTE_STEP_TIMEOUT_MS = 2_000;
/** Per field; the page script is terminated via CDP when exceeded. */
export const AUTH_PASTE_FIELD_TIMEOUT_MS = 5_000;
export const DEFAULT_ACCESSIBLE_AUTHENTICATION_RESULT_FILE = 'accessible-authentication-result.json';
```

- `AUTH_PASTE_PROBE` が 4 桁なのは、6 桁の OTP 欄で満桁の自動送信を起こさないため。
  4 桁の OTP 欄（満桁で送信）では遷移しうるが、設計 C の遷移の扱いで止まる。
- パスワード欄に `pattern` / `minlength` があっても、値が入るかだけを見るので問題ない。

### H. runner `runAccessibleAuthenticationCheck`

```ts
export interface RunAccessibleAuthenticationCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /**
   * Paste into password / one-time-code fields to see whether pasting works.
   * Grants clipboard permissions to the page's context, overwrites the
   * clipboard, and opens a short-lived helper page in that context. Default: true.
   */
  paste?: boolean;
}
```

`kind: 'page'`。スクリーンショットは撮らない。`url` は検査開始時の `page.url()`。
`buildAuditResult({ source: 'accessible-authentication-check', url, details, buckets:
normalizeAccessibleAuthenticationCheck(details) })` → `out.header('Accessible Authentication Results', 'WCAG 3.3.8', url)`
→ `out.summary({...})` → `out.save` → `out.outputPaths()`（motion-actuation と同じ）。

### I. normalizer（`normalizeAccessibleAuthenticationCheck`）

`checkedNodes = fields.length + captchas.length`。要素の node は
`normalizeAutocompleteAudit` の `toNode` と同じ形（`target: [selector]`、`html`、`htmlTruncated`）。

- **`auth-paste-blocked`**: `applicable = fields.some(kind が password / one-time-code)`。
  - `pasteTest.status === 'ran'`: `paste.result === 'blocked'` の欄を node（分類は rule どおり incomplete）。
    summary: `` `Pasting into this ${kindLabel} field did not insert the text (field value after paste: ${valueAfterPaste === 'empty' ? 'empty' : 'not the pasted text'}).${how} Allow pasting so password managers can be used.` ``、
    `how` は `pasteEventPrevented === true` なら ` The paste event was cancelled (preventDefault).`、
    `false` なら ` The paste event was not cancelled; a script may clear the value after pasting.`
  - 加えて、`paste.result === null`（未計測: 遷移・期限切れ・例外）または
    実測対象なのに `paste === null`（打ち切りで試さなかった欄）の欄、および
    **editable でない・見えない欄**（実測しなかった欄）も node にする
    （`Paste could not be tested (${reason}). Check manually whether pasting works.`。
    `reason` は `error` の値、`navigated`、`not visible`、`not editable`、`not tried after an earlier timeout or navigation`）。
    blocked と未計測の node は同じ 1 回の `bucketize` に入れる（どちらも incomplete）。
    node が 0 なら passes。
  - `status` が `disabled` / `unavailable`: 対象欄すべてを node
    （`Paste was not tested (${status}${reason ? `: ${reason}` : ''}). Check manually…`）。
- **`auth-autocomplete`**: `applicable = fields.length > 0`。`autocompleteStatus` が `off` /
  `mismatch` の欄を node。summary:
  `` `${kindLabel} field has autocomplete="${autocomplete}", which ${status === 'off' ? 'turns off autofill' : `is not the expected value`}. Expected ${expected}.` ``
- **`auth-captcha`**: `applicable = fields.length > 0 || captchas.length > 0`。CAPTCHA 1 件ごとに node。
  summary: `` `Looks like a CAPTCHA (matched ${matchedBy})${visible ? '' : ', not visible (may be score-based)'}. Check that authentication offers an alternative without a cognitive function test, or that it only asks to recognize objects or user-provided content.` ``
- 認証欄も CAPTCHA も 0 件なら 3 ルールとも inapplicable。

`kindLabel`: `password` → `Password`、`one-time-code` → `Verification code`、`username` → `Username`。

### J. schema

`ACCESSIBLE_AUTHENTICATION_CHECK_RESULT_SCHEMA` を `buildEnvelopeSchema` で作る。details の
`required` は型の全フィールド、`kind` / `autocompleteStatus` / `pasteTest.status` /
`pasteTest.reason` / `paste.result` / `paste.valueAfterPaste` は `enum`（null 可のものは `null` を enum に含める）、
`string | null` は `['string', 'null']`、`pasteListenerCount` は `['integer', 'null']`、
`paste` は `oneOf: [{ type: 'null' }, {...object}]`（既存 schema で null 可オブジェクトを
どう書いているかに合わせる）。`RESULT_SCHEMAS` に `'accessible-authentication-check'` で登録。

## Steps

### Step 0: Drift check

冒頭の drift check を実行。#61 が先にマージ済みなら、Current state の行番号は
ずれている前提で、各ファイルの「末尾の登録」の位置を探し直す。

### Step 1: 型・定数・ルール

設計 E・F・G を追加。**Verify**: `npm run typecheck` → exit 0。

### Step 2: normalizer・schema・export

設計 I・J。`src/index.ts` の axe-format export に `normalizeAccessibleAuthenticationCheck` を追加。
**Verify**: build → exit 0。

### Step 3: フィクスチャとテスト（テスト先行）

`test/fixtures/pages/accessible-authentication/` に作る。各ファイル冒頭の HTML コメントに
意図と期待結果。

- `paste-ok.html`: `<form>` に `<input type="text" name="user" autocomplete="username">` と
  `<input type="password" autocomplete="current-password">`。期待: 3 ルールとも passes
  （`auth-captcha` は認証欄があるので applicable・node 0 → passes）。パスワード欄の
  `paste.result === 'inserted'`、`valueAfterPaste === 'probe'`。
- `secret-restored.html`: パスワード欄に初期値 `value="S3cret-Leak-Canary"` があり、`input` の
  handler が `insertFromPaste` のとき値を初期値に戻す（貼り付けを拒んで元の値を復元する
  controlled input の再現）。期待: `result === 'blocked'`、`valueAfterPaste === 'other'`、
  **結果 JSON 全体（`JSON.stringify(result)`）に `S3cret-Leak-Canary` が含まれない**、
  検査後の欄の値が `S3cret-Leak-Canary` に戻っている。
  加えて同じページに `<form id="captcha-login"><input type="password" value="S3cret-Leak-Canary-2"></form>`
  を置き、この form が CAPTCHA 候補に当たる（`captchas` に 1 件）一方で、結果 JSON 全体に
  `S3cret-Leak-Canary-2` も含まれないこと（`captchas[].html`・正規化後の `nodes[].html` の経路）。
- `paste-blocked.html`: パスワード欄に `onpaste="return false"`。期待: `auth-paste-blocked` が
  incomplete、`paste.result === 'blocked'`、`pasteEventPrevented === true`。
- `paste-cleared.html`: `input` で `inputType === 'insertFromPaste'` なら値を消す。期待: incomplete、`result === 'blocked'`、
  `pasteEventPrevented === false`、summary に「may clear the value」を含む。
- `autocomplete-off.html`: ユーザー名欄（autocomplete なし、パスワード欄の直前）と
  パスワード欄が `autocomplete="off"`。期待: `auth-autocomplete` が incomplete で node 1 件
  （パスワード欄。ユーザー名欄は `missing` で node にならない）。ユーザー名欄の `kind === 'username'`。
- `otp.html`: `<input inputmode="numeric" name="otp" maxlength="6">`（autocomplete なし）と、
  別の form に `<input autocomplete="one-time-code" onpaste="event.preventDefault()">`。
  期待: 2 欄とも `kind === 'one-time-code'`、1 つ目 `inserted`、2 つ目 `blocked`。
  加えて、カードの `<input name="cc-csc" aria-label="セキュリティコード">` が対象にならないこと。
- `captcha.html`: `<div class="g-recaptcha" data-sitekey="x"><iframe src="about:blank#recaptcha"></iframe></div>`
  とログインフォーム。期待: `auth-captcha` が incomplete で node **1 件**（外側の div だけ）。
- `none.html`: 検索欄だけ。期待: 3 ルールとも inapplicable、`pasteTest.status === 'skipped-no-targets'`。
- `hidden.html`: `hidden` 属性のダイアログの中のパスワード欄。期待: `paste === null`、
  `auth-paste-blocked` が incomplete（未計測）、例外なし。
- `navigates.html`: パスワード欄が 2 つあり、1 つ目の `input` で `location.assign('none.html')`。
  期待: 例外を投げず、1 つ目 `navigated === true`・`result === null`、2 つ目は `paste === null`、
  `result.url` が元のフィクスチャ URL、`auth-paste-blocked` が incomplete。
- `hangs.html`: パスワード欄の paste handler が `for (;;) {}`。期待: チェックが
  `AUTH_PASTE_FIELD_TIMEOUT_MS` + 5 秒以内に結果を返し、`error === 'timeout'`、incomplete
  （テストの timeout は 20 秒）。加えて CLI（`--checks accessible-authentication-check`）が
  exit 0〜1 で有限時間内に終わること（`execFile` に 30 秒の timeout）。
- `hangs-synthetic.html`: 本物の貼り付けは `preventDefault` で止め、**合成の paste イベント
  （`event.isTrusted === false`）のときだけ** `for (;;) {}` で戻らない handler。
  期待: 合成イベントの段で期限切れになっても `AUTH_PASTE_FIELD_TIMEOUT_MS` + 5 秒以内に
  結果を返し、`result === 'blocked'`・`pasteEventPrevented === null`・`error === 'timeout'`。
  パスワード欄を 2 つ置き、2 つ目が `paste === null`（期限切れの後は試さない）であること。

`test/accessible-authentication.spec.ts` を先に書き（`helpers/fixtures.js` の `test` /
`runFixtureCheck` を使う）、上の期待を 1 テスト 1 振る舞いで確かめる。失敗理由が
「モジュールが無い」であることを確かめてから Step 4 へ。加えて:

- `paste: false` のとき `pasteTest.status === 'disabled'`、全欄 `paste === null`、
  `auth-paste-blocked` が incomplete
- `paste-ok.html` の検査後、パスワード欄の値が検査前と同じ（空）に戻っている
- 全ケースでエンベロープが `RESULT_SCHEMAS['accessible-authentication-check']` に valid

### Step 4: runner・CLI・test-entry・exports

- `src/playwright/runAccessibleAuthenticationCheck.ts` を設計 A〜D・H で実装。ファイル先頭
  コメントに Limitations（Maintenance notes の既知の制限）を列挙。
- `src/playwright/index.ts` に runner と Options 型の export。
- `src/cli.ts` の `CHECK_REGISTRY` 末尾に `kind: 'page'` エントリ。
- `src/test-entries/accessible-authentication-check.ts`、`package.json` の `exports` / `description`。
- `test/helpers/fixtures.ts` の `buildRunnerRegistry` に `kind: 'page-current'` で登録。

**Verify**: Step 3 の spec が green。`--list-checks` の末尾が `accessible-authentication-check`。

### Step 5: 既存テストの更新

- `test/fixture-gallery.spec.ts`: MANIFEST に `paste-blocked.html`
  （`'a11y-skills/auth-paste-blocked': 'incomplete'`）、`autocomplete-off.html`
  （`'a11y-skills/auth-autocomplete': 'incomplete'`）、`captcha.html`
  （`'a11y-skills/auth-captcha': 'incomplete'`）、`none.html`（3 ルール `'inapplicable'`）。
  冒頭コメントを 15 checks / 27 rules に（#61 が先に入っていれば +1 ずつ）。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に 3 ルール分。
- `test/schema-validation.spec.ts`: 手組み details（3 種の欄、CAPTCHA 1、`pasteTest` の
  `ran` / `unavailable` の例）が valid。

**Verify**: `npm test` → 全 green。

### Step 6: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/claude-aa-all > /tmp/claude-aa-all.log 2>&1; echo "exit=$?"
grep -E "accessible-authentication-check|Errors:" /tmp/claude-aa-all.log
# 期待: [accessible-authentication-check] DONE ...、Errors: 0、exit=1（axe 由来）
```

満たせなければ STOP。

### Step 7: ドキュメント

日本語を先に書き、英語を同期する。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表に 1 行:
  `| \`accessible-authentication-check\` | 3.3.8 | パスワード・確認コード欄の貼り付けの禁止、autocomplete の off、CAPTCHA らしき要素 |`
  / `| ... | 3.3.8 | Paste blocking and autocomplete="off" on password / code fields, CAPTCHA-like elements |`
- `coverage-matrix.ja.md` / `.md` の 3.3.8 行を
  `インタラクティブ+自動の候補 | \`accessible-authentication-check\` **[CLI]** + 画面キャプチャ | 貼り付けの禁止は別の手段が無ければFail、CAPTCHA・別の手段は要確認`
  （EN も同様）に。「基準 × チェック名 × 出力ファイル」表に
  `| 3.3.8 | \`accessible-authentication-check\` | \`accessible-authentication-result.json\` |` を SC 順の位置に。
- `interactive-checks.ja.md` / `.md`: 3.3.8 行の後に短い節「`accessible-authentication-check`
  CLI チェック」（自動で見るもの 3 点 / 貼り付けの実測の副作用（権限・クリップボード・
  補助ページ）/ CAPTCHA と別の手段は人が確かめる）。
- `packages/a11y-audit/TODO-COVERAGE.md`（JA のみ）: 3.3.8 の節を 2.5.4 の節の書式で追加。
- `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表に
  `runAccessibleAuthenticationCheck | 3.3.8 アクセシブルな認証（貼り付けの禁止・autocomplete の off・CAPTCHA らしき要素）`、
  チェック名一覧・test entry の列挙に追記、表の下に段落（何を見るか、`missing` を報告しない理由、
  `paste: false`、貼り付けの実測は context の権限・クリップボード・補助ページに触れるので
  同じ page を使い回すときは注意、主文書のみ）。
- `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` の `### Added` に新チェック・3 ルール・
  既知の制限。**`package.json` の version は変えない**。

**Verify**: `npm run validate:skills && npm run lint && npm run format:check`

### Step 8: 全体検証とコミット

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
を通し、Git workflow のとおりコミット。`plans/README.md` のステータス行を更新。

## Test plan

- **`test/accessible-authentication.spec.ts`**: 12 フィクスチャで欄の分類・貼り付けの実測
  （入る / preventDefault / 値を消す）・autocomplete の判定・CAPTCHA の重複除去・
  遷移とハングへの頑健さ・`paste: false`・元の値への復元・schema を検証。
- **fixture-gallery / rule-classification / schema-validation**: 既存の枠組みに登録。
- **CI**: `--checks all` スモークが新チェックを自動で通す（Step 6）。

## Done criteria

ALL must hold:

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` exit 0
- [ ] `--list-checks` の末尾が `accessible-authentication-check`
- [ ] Step 6 のスモークで `[accessible-authentication-check] DONE`、`Errors: 0`、exit 1
- [ ] 既存 runner（`src/playwright/run*.ts` の既存ファイル）と `cdpEventListeners.ts` に差分がない
- [ ] 日英ドキュメントがペアで更新されている（SKILL / coverage-matrix / interactive-checks / README）
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更
- [ ] `plans/README.md` のステータス行を更新

## STOP conditions

- 既存チェックの挙動・型・schema・rule、または `cdpEventListeners.ts` を変えなければならなくなった
- CI（GitHub Actions の ubuntu、headless Chromium）で補助ページの対照実験が失敗し、
  `paste-ok.html` が `unavailable` になる（実測方式の前提が崩れる。合成イベントだけに
  落とすかは設計判断）
- Step 6 で `--checks all` が ERROR・ハング・exit 2 になる
- いずれかのフィクスチャでチェックがハングする
- `hangs.html` / `hangs-synthetic.html` で `terminateExecution` 後も `keyboard.press` /
  `inputValue` / `evaluate` が戻らない、またはその後の page 操作（CLI の context close を含む）が止まる
- schema 検証・lint・format・既存テストのいずれかが green にできない

## Maintenance notes

- **既知の制限**（runner 先頭コメントと CHANGELOG に記載）:
  - 主文書の `input` だけを見る。iframe（別オリジンのログイン部品など）・shadow root の中は見ない。
  - 貼り付けの実測は Chromium で確かめた方式。他のブラウザで権限の付与に失敗したら
    `unavailable` で incomplete。
  - 貼り付けの実測は呼び出し側の context にクリップボードの権限を付与し、クリップボードを
    上書きし、補助ページを一時的に開く。欄の値は元に戻すが、`input` などのイベントで
    ページが状態を変えた分は戻らない。同じ page を使い回すなら `paste: false`。
    CLI はチェックごとに新しい context を使うので影響しない。
  - 見えない・操作できない欄（閉じたダイアログの中など）は実測しない（incomplete）。
    ログインボタンを押してから出るフォームは、呼び出し側が開いた状態の page を渡す必要がある。
  - OTP 欄の見つけ方は名前の推定を含む。分割された 1 桁ずつの欄は、1 つ目だけが当たることが多い。
  - CAPTCHA らしき要素は名前の一致で探す。名前に `captcha` を含まない独自実装は見つからない。
    見えない CAPTCHA（スコア型）も候補に出る（summary に not visible と書く）。
  - 別の手段（パスキー・SSO・メールのリンク）があるか、CAPTCHA が物の認識・本人が用意した
    内容の識別か、は判定しない。
- **`auth-paste-blocked` の分類**: incomplete の根拠は設計 F。violation に上げるなら、
  別の手段（同じ画面のパスキー・SSO など）と自動入力の可否を排除できる別の設計が要る。
- **1.3.5 との重なり**: パスワード欄の autocomplete 欠落は `autocomplete-audit`
  （`autocomplete-missing`、1.3.5）が、`off` は両方が報告しうる。SC が違うので重複排除はしない。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit`
  を minor、スキル文書が変わるのでプラグインも minor に上げ、4 フィールドを揃える。
- レビュアーは特に、(1) 補助ページが成功・失敗どちらの経路でも閉じられるか、
  (2) 欄の値が元に戻るか、(3) 実測中の遷移・ハングで例外が外に漏れないか、
  (4) inspector が `finally` で close されるか、を見ること。
