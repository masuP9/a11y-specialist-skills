# Plan 007 設計ドキュメント: `@a11y-skills/audit` CLI ランナーと GitHub Actions シナリオ

> **種別**: デザインスパイク（成果物は設計文書のみ。公開済みパッケージへの変更なし）
> **実施日**: 2026-06-12
> **ベースコミット**: `359289c`（ドリフト確認: `f86de93..HEAD`）

---

## 1. ドリフト確認結果

`git diff --stat f86de93..HEAD -- packages/a11y-audit/package.json packages/a11y-audit/src skills/auditing-wcag/references/scripts/` を実行した結果:

- `packages/a11y-audit/package.json`: **変更なし**（`bin` フィールドなし、STOP条件クリア）
- `packages/a11y-audit/src/`: Plan 004（`runFocusIndicatorCheck` の `navigationSettleMs` オプション追加、`framenavigated` リスナー）および Plan 005（フォーマット統一）による変更のみ — 想定内
- `skills/auditing-wcag/references/scripts/`: タイポ修正 1 行のみ — 問題なし

**STOP条件は発動しなかった。**

---

## 2. 現状の整理

### 2.1 パッケージ構成（v0.3.0 確認済み）

- `"type": "module"`（ESM）
- `exports` マップ: `.`, `./playwright`, `./schemas`, `./test-entries/*`（10 チェック）
- `bin` フィールド: **なし**
- `peerDependencies`: `@axe-core/playwright ^4.10.0`, `@playwright/test ^1.50.0`
- `optionalDependencies`: `pixelmatch`, `pngjs`

### 2.2 チェック関数シグネチャの分類

チェック関数は 2 種類に分かれる:

| 種別 | 関数 | 受け取るオブジェクト | 理由 |
|---|---|---|---|
| page ベース | `runAxeAudit`, `runReflowCheck`, `runZoomCheck`, `runTargetSizeCheck`, `runTextSpacingCheck`, `runOrientationCheck`, `runAutocompleteAudit`, `runTimeLimitDetector`, `runAutoPlayDetection` | `{ page: Page, ... }` | ページはすでにナビゲーション済みを前提 |
| browser ベース | `runFocusIndicatorCheck` | `{ browser: Browser, ... }` | タブ移動ごとにナビゲーションが発生しうるため、内部でコンテキストを再生成する設計 |

**CLI レイヤーへの影響**: CLI はブラウザとページの両ライフサイクルを管理する必要がある。`runFocusIndicatorCheck` は `browser` を渡せばよいが、page ベースのチェックでは `browser.newContext()` → `page.goto()` → チェック実行 → `context.close()` のパターンを繰り返す必要がある。

### 2.3 出力形式

- `OutputLocationOptions`: `outputDir` / `outputFile` / `outputPath`（`outputPath` と他は排他）
- 環境変数フォールバック: `A11Y_OUTPUT_DIR`
- `requireTargetUrl()`: `TEST_PAGE` 環境変数を参照
- 結果形式: `{ source, url, timestamp, violations, incomplete, passes, inapplicable, summary: { violationCount, incompleteCount, passCount }, details, disclaimer }`

### 2.4 既存ランナー

`skills/auditing-wcag/references/scripts/run-test.cjs`（約30行）は引数解析 + `TEST_PAGE` 環境変数設定 + `execFileSync('npx', ['playwright', 'test', ...files])` のシェルアウトで構成されている。利用者は Playwright プロジェクト設定・結果処理を自前で組み立てる必要があり、これが「摩擦」の実体。

---

## 3. ステップ 1: パッケージング形式の選択

### 3.1 オプション A: `@a11y-skills/audit` に `bin` を追加する

#### コールドインストール実証実験

**実験環境**: `/tmp/spike-cold-install-legacy`（npm `--legacy-peer-deps` でピア自動インストールを抑制）

```
$ mkdir /tmp/spike-cold-install-legacy && cd $_ && npm init -y
$ npm install --legacy-peer-deps @a11y-skills/audit@0.3.0
```

**インストール結果**: `@playwright/test` は **インストールされなかった**（`node_modules/@playwright`: NOT installed）

**インポートテスト結果（実際のエラーテキスト原文）**:

```
ERROR: Cannot find package '@axe-core/playwright' imported from /tmp/spike-cold-install-legacy/node_modules/@a11y-skills/audit/dist/playwright/runAxeAudit.js
```

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@axe-core/playwright' imported from /tmp/spike-cold-install-legacy/node_modules/@a11y-skills/audit/dist/playwright/runAxeAudit.js
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:316:9)
    at packageResolve (node:internal/modules/esm/resolve:768:81)
    at moduleResolve (node:internal/modules/esm/resolve:858:18)
    at defaultResolve (node:internal/modules/esm/resolve:990:11)
    ...
    code: 'ERR_MODULE_NOT_FOUND'
```

**npm v7+ のデフォルト動作に関する観察**:

`--legacy-peer-deps` なしの `npm install @a11y-skills/audit@0.3.0` では、npm v7+ が `peerDependencies` を **自動的にインストール**する。具体的には `@playwright/test`, `@axe-core/playwright`, `pixelmatch`, `pngjs` がインストールされ、インポートは成功した。

**「ピアが欠けるのはどんなとき」**:

1. `npm install --legacy-peer-deps`（CI でよく見られるオプション）
2. `pnpm install`（デフォルトでは peerDeps を自動インストールしない）
3. `yarn v1 add`（peerDeps は自動インストールしない）
4. モノレポ内での部分インストール（ピアが親ワークスペースに存在しない場合）

**結論**: オプション A の `bin` 追加は実現可能だが、CLI エントリポイントで `@playwright/test` / `@axe-core/playwright` の存在確認とわかりやすいエラーメッセージを出す「ランタイムのピア確認」が必要。

#### オプション A の懸念点

- `package.json` の `bin` フィールドは `files` に含まれ、publish payload に入る
- `peerDependencies` に `@playwright/test` があるため `npx @a11y-skills/audit` 単独では npm が peer を引き込む（コールドランコストが増大: chromium + playwright 合計 ~300MB）
- CLI 用と ライブラリ用で同一パッケージバージョンが紐付く — ライブラリ API 変更が不要でも CLI 変更でバンプが必要になる

### 3.2 オプション B: 別パッケージ `@a11y-skills/audit-cli`

- `@playwright/test` を `dependencies`（peerDepsではなく）に持てる → `npx @a11y-skills/audit-cli` でピア問題なし
- **懸念**: Plan 003 でバージョン同期の苦痛を経験済み。`@a11y-skills/audit` のリリースごとに `audit-cli` も追従バンプが必要
- CI: `plugin-version-check.yml` が新パッケージを認識する必要あり、Plan 003 の bump 自動化も更新が必要

### 3.3 オプション C: CLI なし、ドキュメント化されたレシピのみ

- リリースコストゼロ
- `run-test.cjs` のパターン（引数解析 + playwright test シェルアウト）は30行で書けることを既存コードが証明している
- 摩擦の本質: 「どのファイルを渡せばいいか」「TEST_PAGE をどう設定するか」「結果 JSON はどこに出るか」— これはドキュメントで解消できる

### 3.4 選択: **オプション C を今すぐ実施、A をバックバーナーに置く**

**推奨理由（後述の見積もりも参照）**:

1. 需要シグナルがまだ記録されていない
2. オプション C（README スニペット）はリリースコストゼロで試せる
3. オプション A は「ランタイムのピア確認」実装コストを加えると S ではなく M になる
4. オプション B はメンテコストが Plan 003 で証明された通り重い

---

## 4. ステップ 2: プロトタイプの知見

### 4.1 実行コマンドと結果

プロトタイプスクリプト `packages/a11y-audit/_spike-cli.mjs` を使い捨てで作成し、以下を実行:

```
$ node _spike-cli.mjs \
    --url "https://www.w3.org/WAI/demos/bad/before/home.html" \
    --checks "axe,focus-indicator" \
    --output-dir /tmp/spike-results2
```

**実行時間**:

| チェック | 実行時間 |
|---|---|
| axe | 1,639ms |
| focus-indicator | 2,047ms |
| 合計 | 3,788ms（総 wall clock: 4.1秒） |

**終了コード**: `1`（violations あり）— 設計通り動作確認済み

**各チェックのサマリー出力**:

```
[axe] DONE in 1639ms — violations: 6, passes: 14, incomplete: 1
[focus-indicator] DONE in 2047ms — violations: 0, passes: 3, incomplete: 0
```

### 4.2 CLI が吸収するブラウザ管理コード

page ベースのチェック（axe 等）では毎回:

```javascript
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
// ... チェック実行 ...
await context.close();
```

focus-indicator は `browser` を直接渡すだけ。この非対称性は CLI レイヤーに分岐ロジックを強制する。

### 4.3 API が CLI 露出時に不自然な点（ビルドプランへのメモ）

| 観察点 | 詳細 |
|---|---|
| `summary` フィールド名の不一致 | `violationCount` / `passCount` / `incompleteCount`（`violations` / `passes` / `incomplete` ではない）。CLI での集計時に誤りやすい |
| `requireTargetUrl()` の二重管理 | CLI が `--url` 引数を受け取るが、内部関数も `TEST_PAGE` 環境変数を参照する。CLI が `targetUrl` オプションを渡せば問題ないが、環境変数との優先順位がビルドプランで文書化されるべき |
| page ベース vs browser ベースの非対称 | `runFocusIndicatorCheck` だけが `browser` を受け取る。今後チェックを増やす際の一貫性ルールが必要 |
| `outputDir` デフォルトが `process.cwd()` | CLI ユーザーには `./a11y-audit-results` のような明示的なデフォルトを提示する方がよい（`cwd()` は何もない場所に散らかる） |

### 4.4 STOP 条件の確認

「`src/` を変更せずにチェックを実行できるか」→ **できた**。`dist/` のビルド済み成果物から直接インポートしたため、Playwright テストランナーコンテキスト（`test()` / `expect()`）は一切不要だった。STOP 条件は発動しない。

---

## 5. ステップ 3: GitHub Actions シナリオの選択と YAML 下書き

### 5.1 選択: オプション (c) — コピー&ペースト用ワークフロースニペット

**判断理由**:

- このリポジトリ自身の `wcag-audit-tests` CI ジョブはすでに (c) の形態であり、これが参照実装として機能している
- マーケットプレイスへのコンポジットアクション公開（オプション b）は第 2 のリリースプロセスを生み出す — Plan 003 でそのコストを痛感済み
- 再利用可能ワークフロー（オプション a）はリポジトリ内部専用になり、外部ユーザーに提供できない

### 5.2 YAML 下書き

以下は `packages/a11y-audit/README.md` に掲載するコピー&ペースト用スニペット。実際のファイル（`.github/workflows/`）には追加しない。

```yaml
# .github/workflows/a11y-audit.yml
# @a11y-skills/audit による WCAG 2.2 AA 自動監査
# 前提: package.json に @playwright/test, @axe-core/playwright が入っていること

name: A11y Audit

on:
  push:
    branches: [main]
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
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Get Playwright version
        id: playwright-version
        run: |
          echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium

      - name: Install Playwright system deps (cache hit)
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium

      - name: Run a11y audit
        run: |
          node - << 'AUDIT_SCRIPT'
          import { chromium } from '@playwright/test';
          import { runAxeAudit, runFocusIndicatorCheck } from '@a11y-skills/audit/playwright';
          import { mkdir } from 'fs/promises';

          const url = process.env.TARGET_URL;
          const outputDir = './a11y-audit-results';
          await mkdir(outputDir, { recursive: true });

          const browser = await chromium.launch({ headless: true });
          let hasViolations = false;

          // axe チェック
          const ctx = await browser.newContext();
          const page = await ctx.newPage();
          await page.goto(url, { waitUntil: 'networkidle' });
          const axeResult = await runAxeAudit({ page, outputDir });
          await ctx.close();
          if ((axeResult?.summary?.violationCount ?? 0) > 0) hasViolations = true;

          // フォーカスインジケーターチェック
          const focusResult = await runFocusIndicatorCheck({ browser, targetUrl: url, outputDir });
          if ((focusResult?.summary?.violationCount ?? 0) > 0) hasViolations = true;

          await browser.close();
          process.exit(hasViolations ? 1 : 0);
          AUDIT_SCRIPT
        env:
          TARGET_URL: ${{ github.event.inputs.target_url || 'https://example.com' }}

      - name: Upload audit results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: a11y-audit-results
          path: |
            a11y-audit-results/*-result.json
            a11y-audit-results/*-screenshot*.png
          retention-days: 30
```

**YAML 品質チェック**:
- `run: |` ブロック内の全行はブロックのインデント（8スペース）以上 ✓
- カラム 0 から始まる行なし ✓（`AUDIT_SCRIPT` ヒアドキュメントは意図的な heredoc 終端であり、YAML キーではない）

**注意**: 上記スニペットの `node - << 'AUDIT_SCRIPT'` は ESM (`--input-type=module`) が必要。Actions 環境では Node 20 以降で `--input-type=module` を使うか、`type: module` の package.json を持つディレクトリからスクリプトを呼ぶ形に調整が必要。ビルドプランでの実装時は `node --input-type=module -e "..."` または専用 `.mjs` ファイルを用意する形が安全。

### 5.3 既存 CI との対照

このリポジトリの `wcag-audit-tests` ジョブは `skills/auditing-wcag/references/scripts/` 配下の `playwright.config.ts` ベースで動作しており、`TEST_PAGE` 環境変数経由で URL を渡す。上記スニペットはその知識なしにコピー&ペーストで動く形を目指しているが、「`node --input-type=module` で ESM ヒアドキュメントを動かす」という非直感的な記述が残る。

**改善案**: ビルドプランでは `@a11y-skills/audit/cli` エクスポートか、`scripts/a11y-audit.mjs` サンプルファイルを `files` に含めて `node node_modules/@a11y-skills/audit/scripts/run.mjs` として呼び出せる形を検討する。

---

## 6. ステップ 4: 見積もりと推奨

### 6.1 各オプションの工数見積もり

| オプション | CLI 形式 | Actions 形式 | 工数 | 備考 |
|---|---|---|---|---|
| A+c（bin 追加 + READMEスニペット） | bin 追加 | スニペット | M | ランタイムピア確認、テスト、README(EN+JA) |
| B+c（別パッケージ + スニペット） | 別パッケージ | スニペット | L | 新パッケージ設定、CI 拡張、bump 自動化更新 |
| **C+c（スニペットのみ）** | なし | **スニペット** | **S** | README(EN+JA) への追記のみ |

### 6.2 不足している需要シグナルへの対処

現時点でユーザーから「CLI がほしい」「npm run で簡単に使いたい」というイシュートラフィックは記録されていない。このことは「CLI が不要」を意味しないが、「CLI が確実に必要」も意味しない。

**提案フロー**:

1. **今すぐ**: オプション C（README スニペット）を提供 → リリースコストゼロ
2. **計測**: スニペットに関する質問・改善要望・「もっと簡単にならないか」イシューが 3 件以上蓄積したらオプション A を検討
3. **将来**: ユーザーベースが確認できたらオプション A で `bin` 追加（ランタイムピア確認付き）

> **2026-06-12 追記**: 親スキル（auditing-wcag）の実行簡素化という内部需要に
> よりオプション A を Plan 008 として実施。「イシュー 3 件待ち」の条件はこれで
> 上書きされた。本スパイクは外部ユーザーの需要のみを評価しており、親スキル
> 自身が最初の CLI 利用者になれる点を見落としていた。

### 6.3 推奨

**今すぐ進める / 進めない**: **部分的に進める**

- **進める（S）**: README(EN+JA) へのコピー&ペーストワークフロースニペット追加 → 上記 YAML 下書きをベースにビルドプランを立てる
- **保留**: `bin` フィールド追加（オプション A）→ イシュートラフィックで正当性を確認してから

**CLI 形式の最終選択**: オプション A（将来的に）または C（今すぐ）
**Actions 形式の最終選択**: オプション c（コピー&ペーストスニペット）

---

## 7. メンテナンスメモ

- CLI への「進める」推奨が出た場合、ビルドプランは以下も対象とする必要がある: README(EN+JA)（AGENTS.md の同期ルール）、`files` / `exports` / `bin` の配線、Plan 003 のバンプ自動化が新フィールドを認識すること
- 終了コード仕様（0=violations なし、1=violations あり、2=ランナーエラー）は README スニペットに含まれた時点でパブリック API となる — ビルドプランでは後からの変更を破壊的変更として扱うこと
- `summary.violationCount`（`violations` ではない）を集計に使うこと — プロトタイプで一度誤った点（API 改善候補）
- `runFocusIndicatorCheck` の `summary` フィールドに `violationCount` がない場合は `0` フォールバックが必要（スパイクで観察: `violations: 0, passes: 3` だが `violationCount` 自体は存在した）
