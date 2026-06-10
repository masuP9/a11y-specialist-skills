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
| `runFocusIndicatorCheck` | 2.4.7 フォーカスの可視化 / 2.4.12 フォーカスの非遮蔽 / 3.2.1 オンフォーカス |
| `runReflowCheck` | 1.4.10 リフロー |
| `runTargetSizeCheck` | 2.5.5 / 2.5.8 ターゲットのサイズ |
| `runTextSpacingCheck` | 1.4.12 テキストの間隔 |
| `runZoomCheck` | 1.4.4 テキストのサイズ変更（200% ズーム） |
| `runOrientationCheck` | 1.3.4 表示の向き |
| `runAutocompleteAudit` | 1.3.5 入力目的の特定 |
| `runTimeLimitDetector` | 2.2.1 タイミング調整可能 |
| `runAutoPlayDetection` | 1.4.2 音声制御 / 2.2.2 一時停止、停止、非表示 |

多くの検査は遷移済みの `page` を受けます。一部は navigation を所有し `targetUrl`
（または `TEST_PAGE`）を受けます: `runOrientationCheck` と `runTimeLimitDetector`
（`runZoomCheck` は URL 指定時）。`runFocusIndicatorCheck` は `browser` を受けます。
`runAutoPlayDetection` は optional 依存 `pixelmatch` + `pngjs` が必要です（インストール参照）。

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

### 出力先の解決順

各検査共通:

1. `outputPath` — フルパス（`outputDir`/`outputFile` とは排他）。
2. それ以外は `outputDir` → `A11Y_OUTPUT_DIR` 環境変数 → `process.cwd()` に、
   `outputFile` → 各検査の既定ファイル名を結合。

スクリーンショット（有効時）は結果ファイルの隣に書き出します。`outputFile` はファイル名のみ
指定可能です。絶対パスを使う場合は `outputPath` を使ってください。

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
