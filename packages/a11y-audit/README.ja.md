# @a11y-skills/audit

Playwright + axe-core ベースの WCAG 2.2 アクセシビリティ検査関数。

本パッケージは [`auditing-wcag`](https://github.com/masuP9/a11y-specialist-skills)
Claude Code skill から機能本体を切り出したものです。10 個の検査を関数として提供し、
すぐ実行できる Playwright 用の互換 test entry も同梱します。

> **English: see [README.md](./README.md).**

> **スコープ.** 自動テストで検出できるのは WCAG 違反の約 30〜40% です。完全な準拠確認には
> 手動テストが必須です。本パッケージはその一部を自動化します。

## 検査一覧

| 関数 | WCAG |
| --- | --- |
| `runAxeAudit` | axe-core による広範な検出 (2.0/2.1/2.2 A & AA) |
| `runFocusIndicatorCheck` | 2.4.7 フォーカスの可視化 / 2.4.11 フォーカスの非遮蔽（最低限） / 2.4.12 フォーカスの非遮蔽（強化） / 3.2.1 オンフォーカス |
| `runReflowCheck` | 1.4.10 リフロー |
| `runTargetSizeCheck` | 2.5.5 / 2.5.8 ターゲットのサイズ |
| `runTextSpacingCheck` | 1.4.12 テキストの間隔 |
| `runZoomCheck` | 1.4.4 テキストのサイズ変更（200% ズーム） |
| `runOrientationCheck` | 1.3.4 表示の向き |
| `runAutocompleteAudit` | 1.3.5 入力目的の特定 |
| `runTimeLimitDetector` | 2.2.1 タイミング調整可能 |
| `runAutoPlayDetection` | 2.2.2 一時停止、停止、非表示（画面の変化）／ 1.4.2 音声の制御（`<audio>`・`<video>` の再生状態。実際に音が聞こえるかは手で確かめる） |
| `runKeyboardReachabilityCheck` | 2.1.1 キーボード（Tab・複合部品内の矢印キー・activedescendant） |

多くの検査は遷移済みの `page` を受けます。一部は navigation を所有し `targetUrl`
（または `TEST_PAGE`）を受けます: `runOrientationCheck` と `runTimeLimitDetector`
（`runZoomCheck` は URL 指定時）。`runFocusIndicatorCheck` と
`runKeyboardReachabilityCheck` は `browser` を受けます。
`runAutoPlayDetection` は optional 依存 `pixelmatch` + `pngjs` が必要です（インストール参照）。

`runAutoPlayDetection` の 1.4.2（`a11y-skills/auto-play-audio`）は、ページと iframe（入れ子・
shadow root の中も含む）の `<audio>`・`<video>` について、「再生中・消音でない・音量が 0 より大きい・
再生速度が 0 より大きい」かを、検査の開始時とスクリーンショットのたび（約 2 秒ごと）に測り、
あわせて play / pause / ended / volumechange / ratechange の発生時刻も記録します。記録した状態は
次の記録まで続くものとして、音ありだった時間を足して `audibleSeconds`（音ありで鳴った秒数）と
します。測定の間に止めたり消音したりしても、それまでの時間は数えます。これが 3 秒を超えるもの、
または最後の測定で音ありで再生中で、この先も 3 秒を超えて鳴るもの（`loop`、終わりのない配信、
残りの再生時間を再生速度で割った実時間が 3 秒超）のうち、見えている `controls` が無いものを
`incomplete` にします。見えているかは、要素とその上の iframe 要素の大きさ・`display`・`visibility`・
`opacity` で判断します。要素・祖先・iframe 要素のどれかに `clip-path`（`none` 以外）や
`clip`（`auto` 以外）があるときは決めきれないとして `incomplete` にし、`overflow` による切り取りや
画面外の位置までは見ません。測るのは検査を始めてから（ページを開いた後）なので、それより前に
鳴った音は数えません。同じ page で検査を繰り返しても、記録は検査ごとに作り直します。同じ frame で名前から見つけた止める・消音の部品は
記録しますが、クリックして確かめはしません。結果の `target` は、外側の iframe・shadow host・
要素の順に並び、それぞれ一つ前の要素が開く文書（または shadow root）の中で探します。

Chromium は利用者の操作が無いと音ありの自動再生を止めるので、自分でブラウザを起動する
場合は次の引数を付けてください。付けないと音ありのメディアは再生が始まらず、
「再生が始まらなかった」という `incomplete` になります（CLI は付けて起動します）。

```ts
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
```

## インストール

```sh
npm install -D @a11y-skills/audit @playwright/test @axe-core/playwright
```

`@playwright/test` と `@axe-core/playwright` は **peer dependencies** です。

`runAutoPlayDetection` は追加で `pixelmatch` と `pngjs` を必要とします（**optional
dependencies** として宣言、既定でインストールされます）。遅延ロードされるため、
`--omit=optional` でインストールしても他の9検査は動作します:

```sh
npm install -D pixelmatch pngjs   # runAutoPlayDetection を使う場合のみ
```

> ESM 専用です。CommonJS ビルドは同梱しません。ESM（または ESM 出力の TypeScript）から
> import してください。

## CLI

テストランナー不要で、コマンド 1 本で 10 検査すべてを実行できます。

```sh
npx -y @a11y-skills/audit --url https://example.com
```

npm 7 以降では peer dependencies（`@playwright/test`、`@axe-core/playwright`）が
自動でインストールされます。初回は Chromium のインストールが必要です:

```sh
npx playwright install chromium
```

### フラグ

| フラグ | デフォルト | 説明 |
| --- | --- | --- |
| `--url <url>` | `TEST_PAGE` 環境変数 | 対象 URL。`--url` が環境変数より優先されます。どちらも未設定の場合は usage を表示して exit 2。 |
| `--checks <list>` | `all` | カンマ区切りのチェック名（下記一覧参照）。 |
| `--output-dir <dir>` | `./a11y-audit-results` | 結果 JSON の出力ディレクトリ。 |
| `--screenshot` | off | focus-indicator のスクリーンショットを有効化。 |
| `--list-checks` | — | チェック名一覧を出力して exit 0。 |
| `--version` | — | バージョンを出力して exit 0。 |
| `--help` | — | usage を出力して exit 0。 |

### チェック名一覧

```
axe-audit
focus-indicator-check
reflow-check
text-spacing-check
zoom-200-check
orientation-check
autocomplete-audit
time-limit-detector
auto-play-detection
target-size-check
keyboard-reachability-check
```

### 終了コード

| コード | 意味 |
| --- | --- |
| `0` | すべてのチェックが完了し、違反なし。 |
| `1` | すべてのチェックが完了し、1 件以上の違反あり。 |
| `2` | 実行時エラー — 引数不正・peer 欠落・ナビゲーション失敗・チェックのクラッシュ。 |

exit コードが非 0 でも、完了したチェックの JSON は必ず書き出されます。

### peer 要件

`@playwright/test >=1.50.0` および `@axe-core/playwright >=4.10.0` が必要です。
見つからない場合は exit 2 でインストール手順を案内します。
`--list-checks`、`--help`、`--version` は peer なしでも動作します。

### `auto-play-detection` と optional deps

`auto-play-detection` は `pixelmatch` と `pngjs` が必要です。
未インストールの場合はそのチェックだけ `SKIPPED` となり、終了コードには影響しません。
他の 9 検査は通常通り実行されます。

### GitHub Actions

手動トリガーで監査を実行するコピー&ペースト用ワークフロー。violations があるとジョブは fail する（終了コード 1）。結果を情報提供のみにしたい場合は監査ステップに `continue-on-error: true` を付ける。

```yaml
# .github/workflows/a11y-audit.yml
name: A11y Audit

on:
  workflow_dispatch:
    inputs:
      target_url:
        description: 'Audit target URL'
        required: true
        default: 'https://example.com'

jobs:
  a11y-audit:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '24'

      - name: Install audit package
        run: npm install --no-save @a11y-skills/audit @playwright/test @axe-core/playwright

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run a11y audit
        run: npx a11y-audit --url "$TARGET_URL" --output-dir a11y-audit-results
        env:
          TARGET_URL: ${{ inputs.target_url }}

      - name: Upload audit results
        uses: actions/upload-artifact@v7
        if: always()
        with:
          name: a11y-audit-results
          path: a11y-audit-results/
          retention-days: 30
```

Notes:

- `push` / `schedule` トリガー（URL はハードコード）を追加すると、定期的なゲートとして実行できる。
- 結果 JSON ファイル（`--screenshot` 指定時はフォーカスインジケーターのスクリーンショットも含む）はビルドアーティファクトとしてアップロードされる。
- 繰り返し実行を高速化するには、インストール済みの `@playwright/test` バージョンをキーに `~/.cache/ms-playwright` をキャッシュする — パターンはこのリポジトリの `ci.yml` を参照。

## 使い方 — 関数 API（推奨）

ページの遷移は呼び出し側で行い、関数は検査の実行・結果 JSON の書き出し・結果オブジェクトの
return を担います。

```ts
import { test } from "@playwright/test";
import { runAxeAudit } from "@a11y-skills/audit/playwright";

test("axe audit", async ({ page }, testInfo) => {
  await page.goto("https://example.com");
  const result = await runAxeAudit({
    page,
    outputDir: testInfo.outputDir,   // axe-result.json の出力先
    // outputFile: "axe-result.json", // 任意で上書き
    // tags: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
  });
  expect(result.summary.violationCount).toBe(0);
});
```

フォーカス表示検査は、フォーカスで遷移が起きた際に新しい context で再試行するため、
自身の browser context を所有します。そのため `page` ではなく `browser` と `targetUrl`
を受け取ります。

```ts
import { runFocusIndicatorCheck } from "@a11y-skills/audit/playwright";

test("focus indicators", async ({ browser }, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: "https://example.com", // または TEST_PAGE 環境変数
    outputDir: testInfo.outputDir,
    screenshot: true,                 // 既定: false
    // contextOptions: { locale: "ja-JP" }, // browser.newContext() に転送
  });
  expect(result.details.elementsWithoutFocusStyle).toBe(0);
});
```

`runFocusIndicatorCheck` / `runKeyboardReachabilityCheck` / `runKeyboardTrapCheck` は、
`browser` の代わりに `createContext` を渡せます。`context.route` による URL 検査のような
呼び出し側の守りを、検査が使うすべての context に付けたいときに使います。

```ts
const result = await runKeyboardTrapCheck({
  createContext: async () => {
    const context = await browser.newContext({ locale: "ja-JP" });
    await context.route("**/*", guardRequest); // 呼び出し側の検査
    return context;
  },
  targetUrl: "https://example.com",
});
```

- `createContext` と `browser` の両方を渡すと `createContext` が使われます。どちらも無いとエラーになります。
- `createContext` を使うとき `contextOptions` は使われません。必要なオプションは関数の中で指定してください。
- 呼ばれるたびに**新しい** context を返してください（検査が使い終わると閉じます。フォーカス表示検査はやり直しのたびに呼びます）。

結果を呼び出し側の要素に結びつけたいときは、`runFocusIndicatorCheck` の `echoAttribute` に属性名（例: `data-test-id`）を
渡します。要素を指す記録（`allElements`、`issues`、`focusObscuredIssues` の `element` と
`obscuredBy`、`onFocusViolations` の `element`）すべてに `echo` として属性の値が付きます
（属性が無い要素は `null`、オプションを渡さなければ `echo` は付きません）。検査は新しい
context でページを開くため、属性はページの読み込み時点で要素に付いている必要があります
（ページのマークアップ、または `createContext` で作る context に `addInitScript` で付ける）。
属性名は文字列としてそのまま `getAttribute` に渡され、不正な名前は `Error` になります。

フォーカス表示検査の要素の記録（`allElements`、`issues`、`focusObscuredIssues` と
`onFocusViolations` の `element`）には、要素がどの文書にあるかを示す `frame` と
`shadowHosts` が付きます。

- `frame`: 主フレームの要素は `null`。iframe の中の要素は `{ url, selector }`（その文書の URL と、
  親文書での iframe 要素の selector。親から辿れない別オリジンでは `selector` が `null`）。
  入れ子の iframe は一番内側の iframe だけを表します。
- `shadowHosts`: open な shadow root の中の要素は、外側から順に host の selector。外の要素は `[]`。
  `selector` はその shadow root の中での selector です（host ではなく、中の要素そのものを記録します）。
- iframe の中の要素の `rect` は、主ページではなくその iframe の文書の左上が原点です。
- closed な shadow root の中は見えず、host として記録されます。iframe の外の固定要素が iframe の
  中の要素を隠す場合は検出しません（隠れ判定は文書ごと）。

**フォーカス前後の画像の差（`screenshotDiff`）:**

`runFocusIndicatorCheck` に `screenshotDiff: true` を渡すと、各要素について「フォーカスしていないとき」と
「フォーカスしたとき」の、要素の周り（8px 広げた範囲）の画像を比べ、`allElements` の各記録と `issues` に
`visualDiff: { diffRatio, rect }` を付けます。`diffRatio` は比べた範囲のうち変わった画素の割合（0〜1）、
`rect` は変わった範囲（ページ座標。変化なしなら `null`）です。計算済みスタイルでは見えない印
（`::before` / `::after`、親の `:focus-within`、別の要素）を拾うためのオプションです。

- 既定は `false`（オプションを渡さなければ `visualDiff` は付かず、挙動は変わりません）。Tab のたびに画像を撮るので遅くなります。この時間も `timeBudgetMs` に含まれます。
- 基準の画像は、Tab で回り始める前に何もフォーカスしていない状態で 1 回撮ったページ全体です。注釈の枠と、前の要素に残した見た目は撮影中だけ隠します。
- 分類は変わりません。スタイルの差が無い要素は `focus-visible` の `incomplete` のままで、画像に差があればメッセージに「画像では周りが変わっている。印がある可能性」と出ます。差が無ければ「画像にも変化なし」と出ます。
- `pixelmatch` と `pngjs`（optionalDependencies）が入っていない環境では、エラーにせず警告を出して比較を飛ばし、`visualDiff` は `null` になります。画像を撮れなかった要素も `null` です。
- **限界:** fixed / sticky の要素、アニメーション・動画、スクロール位置や時間で変わる内容は、印ではない差として出ることがあります。読み込み時点でフォーカスされている要素（autofocus）は、基準の画像との差がありません。差があっても「印がある可能性」であり、目視で確かめてください。iframe の中の要素は比べず、`visualDiff` は `null` です。

### 出力先の解決順

各検査共通:

1. `outputPath` — フルパス（`outputDir`/`outputFile` とは排他）。
2. それ以外は `outputDir` → `A11Y_OUTPUT_DIR` 環境変数 → `process.cwd()` に、
   `outputFile` → 各検査の既定ファイル名を結合。

スクリーンショット（有効時）は結果ファイルの隣に書き出します。`outputFile` はファイル名のみ
指定可能です。絶対パスを使う場合は `outputPath` を使ってください。

### サーバー内で呼ぶ場合

すべての検査は副作用を止めるオプションを受け付けます。既定値は従来どおりの挙動です。

| オプション | 既定 | 内容 |
|---|---|---|
| `writeResult` | `true` | `false` のとき結果 JSON を書き出さず、返り値だけにする。`screenshot: true` なら画像は出力先の解決順どおりに書く。 |
| `quiet` | `false` | `true` のときコンソールに何も出さない。 |

出力先の指定が不正な場合（`outputPath` と `outputDir` の併用など）は、`writeResult: false` でも検査を始める前にエラーになります。

`runTargetSizeCheck` はさらに次のオプションを受け付けます。

| オプション | 既定 | 内容 |
|---|---|---|
| `resolveAccessibleNames` | `true` | `false` のときターゲットごとの `locator.ariaSnapshot()` を省き、`accessibleName` をすべて `null` にする。リンク 300 件のページで約 1.1 秒 → 約 0.06 秒。 |

```ts
const result = await runTargetSizeCheck({
  page,
  writeResult: false,
  quiet: true,
  resolveAccessibleNames: false,
});
```

`quiet` で消える警告のうち、結果の信頼性に関わるものは結果 JSON に残ります。

- keyboard-trap: Tab の押下回数が上限に達して打ち切った場合は `details.tabWalkCapped: true`
- focus-indicator: フォーカスによる遷移でリトライが上限に達し、未検査の要素が残った場合は `details.interrupted: true`
- focus-indicator: フォーカスで遷移したが原因の要素を特定できず、その後のやり直しでも特定できなかった場合（やり直しの使い切りや上限での打ち切りを含む）は `details.unidentifiedNavigation: true`。`onFocusViolations` が空なら `a11y-skills/no-context-change-on-focus` は `passes` ではなく `incomplete` になる
- focus-indicator / keyboard-reachability: 上限で打ち切った場合の挙動は下の「時間と Tab 回数の上限」を参照

**時間と Tab 回数の上限:**

`runFocusIndicatorCheck` と `runKeyboardReachabilityCheck` は `timeBudgetMs`（ミリ秒、正の有限数）と `maxTabPresses`（正の整数）を受け取ります。0 以下や数でない値はエラーになります。

| チェック | `timeBudgetMs` の既定 | `maxTabPresses` の既定 | 上限に達したとき |
|---|---|---|---|
| focus-indicator | 上限なし | 上限なし | `details.aborted: { reason: 'timeout' \| 'tab-limit', url, recordedCount, focusableCount }`。`recordedCount` 件までを検査し、フォーカスできる要素は `focusableCount` 件あった。時間と回数は 3.2.1 のやり直しを含めた全体で数える。`interrupted`（やり直しの使い切り）とは別 |
| keyboard-reachability | 60 秒 | 600 回 | 時間は `details.aborted.reason: 'timeout'`、回数は `details.tabWalkCapped: true` |

**同時に実行する場合の前提:**

- リクエストごとに専用の `outputDir` を渡す。スクリーンショットは「出力先ディレクトリ＋固定のファイル名」で書くため、`outputFile` だけを変えても衝突する。
- リクエストごとに専用の page（と browser context）を使う。検査は viewport の変更や遷移など、page の状態を変える。
- `runAutoPlayDetection` は判定のためにフレームのスクリーンショットと差分画像を必ず `outputDir` に書き、読み直す。`writeResult: false` で止まるのは `detection-result.json` だけ。

> **リフローの注意.** `runReflowCheck` は自身で狭い viewport を設定するため、遷移済みの
> page でも動作します。load 時にのみ viewport を読むページでは、legacy スクリプトと完全に
> 同じ結果を得るために `page.goto(...)` の**前**に viewport を設定してください（互換 entry
> はこれを行っています）。

## 使い方 — 互換 test entry

テスト本体を書きたくない場合は、同梱 entry を 1 行のローカル spec から re-export します。
entry は import 時に `test(...)` を呼び、`TEST_PAGE`（対象 URL）と `A11Y_OUTPUT_DIR`
（出力先）を読み、スクリーンショットも撮ります（従来スクリプトと同等の挙動）。

```ts
// tests/a11y/axe.spec.ts
import "@a11y-skills/audit/test-entries/axe-audit";
// tests/a11y/focus.spec.ts
import "@a11y-skills/audit/test-entries/focus-indicator-check";
// tests/a11y/reflow.spec.ts
import "@a11y-skills/audit/test-entries/reflow-check";
// tests/a11y/target-size.spec.ts
import "@a11y-skills/audit/test-entries/target-size-check";
// 他にも: text-spacing-check, zoom-200-check, orientation-check,
// autocomplete-audit, time-limit-detector, auto-play-detection
import "@a11y-skills/audit/test-entries/text-spacing-check";
```

```sh
TEST_PAGE=https://example.com A11Y_OUTPUT_DIR=./a11y-results npx playwright test
```

> **`node_modules` への `testMatch` が使えない理由.** Playwright はテスト収集から
> `node_modules` を除外するため、`**/node_modules/@a11y-skills/audit/dist/test-entries/*.js`
> を `testMatch` に指定してもテストは見つかりません。上記の 1 行 re-export spec が
> entry を実行する正式な方法です。

## 結果形式

すべての検査は同じ axe 風の envelope を返し、同じ形式で JSON に保存します:

```ts
interface AuditCheckResult<TDetails> {
  source: CheckSource;            // 例: "reflow-check"
  url: string;
  timestamp: string;
  violations: NormalizedRuleResult[];   // 確定した違反
  incomplete: NormalizedRuleResult[];   // 要手動確認
  passes: NormalizedRuleResult[];       // 実行して問題が見つからなかったルール
  inapplicable: NormalizedRuleResult[]; // 検査対象がなかったルール
  summary: { violationCount; incompleteCount; passCount; checkedNodes? };
  details: TDetails;              // 検査固有の証跡（測定値・スクリーンショット等）
  disclaimer: { ... };
}
```

各ルール結果は axe と同じ形（`id` / `impact` / `description` / `help` /
`helpUrl` / `tags` / `nodes[]`、`nodes[].target` / `html` / `htmlTruncated` /
`failureSummary`）です。独自ルールは名前空間付き
（`a11y-skills/focus-visible`、`a11y-skills/target-size-minimum` など）で、
SC ごとに正確な WCAG バージョン・レベルタグ（`wcag2aa`、`wcag21aa`、
`wcag22aa`、`wcag247` 形式の SC タグ）が付きます。

**分類は保守的です。** 検出に死角がなく WCAG の例外が適用され得ない場合のみ
`violations` に入ります（フォーカスによる文脈変化、テキストスペーシングの
クリップ、autocomplete の不正トークン）。それ以外の検出 — reflow/zoom の
オーバーフロー、meta refresh、画面方向ロック、フォーカススタイル欠如、
小さすぎるターゲット — は `incomplete` に入ります。`incomplete` はノイズでは
なく「要手動確認キュー」として扱ってください。

同一ページに対する複数検査の結果を 1 つにまとめるには:

```ts
import { mergeNormalizedResults } from "@a11y-skills/audit";

const merged = mergeNormalizedResults([axeResult, reflowResult, targetResult]);
```

`mergeNormalizedResults` は URL 不一致で例外を投げ、ノードを
`target` + `failureSummary` で重複排除し、複数バケツに現れるルールは
`violations > incomplete > passes > inapplicable` の優先順位で統合します。
frame / shadow root 内の同一セレクタは区別しません。

## 結果型とスキーマ

```ts
import type { AxeAuditResult, FocusCheckResult } from "@a11y-skills/audit/schemas";
import { RESULT_SCHEMAS } from "@a11y-skills/audit/schemas";
```

`RESULT_SCHEMAS` は各検査 id に手書きの JSON Schema（draft 2020-12）を
対応付けており、`*-result.json` を実行時に検証できます。正規化マッパー
（`normalize*`）と `buildAuditResult` はパッケージルートから export されて
いるため、保存済み結果の `details` から 4 区分をいつでも再導出できます。

## ライセンス

MIT
