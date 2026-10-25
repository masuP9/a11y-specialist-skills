# Plan 007: スパイク — `@a11y-skills/audit` の CLI ランナーと GitHub Actions シナリオ

> **実行者への指示**: これはビルドプランではなくデザインスパイクである。成果物は、動作する使い捨てプロトタイプを根拠として添えた設計文書であり、公開済み CLI ではない。以下のステップに従い、STOP 条件を守り、完了後は `plans/README.md` のこのプランのステータス行を更新すること。
>
> **ドリフト確認（最初に実行）**: `git diff --stat f86de93..HEAD -- packages/a11y-audit/package.json packages/a11y-audit/src skills/auditing-wcag/references/scripts/`
> Plan 005 によるフォーマットのドリフトは問題ない。`exports` マップの変更や package.json への新規 `bin` フィールドの追加はSTOP条件となる（既に誰かが着手している可能性がある）。

## ステータス

- **Priority**: P3
- **Effort**: M（粗い見積もり — 方向性カテゴリーの概算）
- **Risk**: LOW（スパイクのため本番変更なし）
- **Depends on**: none
- **Category**: direction (design spike)
- **Planned at**: commit `f86de93`, 2026-06-11

## このプランが重要な理由

`@a11y-skills/audit`（v0.3.0、npm で公開済み）は、10 の WCAG チェックを TypeScript 関数およびチェックごとの Playwright テストエントリとして提供している。しかし、1 つの URL に対して 1 つのチェックを実行するだけでも、利用者は自分で Playwright プロジェクト・設定・結果処理を組み立てる必要がある。このリポジトリ自体がその組み立てを 2 回行っている: `skills/auditing-wcag/references/scripts/run-test.cjs`（約30行：引数解析、`TEST_PAGE` 環境変数の設定、`playwright test` へのシェルアウト）とその周辺の npm スクリプト群、および `.github/workflows/ci.yml` に示されたフルCIのインカンテーション（ブラウザのインストール、実行、`*-result.json` やスクリーンショットをアーティファクトとして収集）。元の npm 公開プランでは「CLI ツール化」を明示的にスコープ外として先送りにしていた。次の可能性として: `npx @a11y-skills/audit --url https://example.com` とコピー＆ペースト可能な GitHub Actions レシピがあれば、このパッケージを Playwright ユーザー向けのライブラリから誰でも使えるツールへと変えられる。正直な注記（監査より）: まだユーザーからの需要シグナルは記録されていない — それ自体が、作り込まずに安価にスパイクする理由でもある。

## 現状（設計の出発点）

- `packages/a11y-audit/package.json` — ESM（`"type": "module"`）、`.`、`./playwright`、`./schemas`、および 10 の `./test-entries/*` に対する `exports`；`bin` フィールドなし；`peerDependencies`: `@axe-core/playwright` ^4.10、`@playwright/test` ^1.50；`optionalDependencies`: pixelmatch、pngjs。CLI は、ピアが存在しない場合（npx コールドランのケース）の動作を決定する必要がある。
- チェック関数のシグネチャ（`src/playwright/` より）: ほとんどは `{ page, ... }` を受け取る；`runFocusIndicatorCheck` は `{ browser, ... }` を受け取る（独自のコンテキストを管理する）。すべて `OutputLocationOptions`（`outputDir` / `outputFile` / `outputPath`、環境変数フォールバック `A11Y_OUTPUT_DIR`）を受け付け、`saveAuditResult`（`src/utils/test-harness.ts`）を通じて JSON エンベロープを書き出す。`requireTargetUrl()` は `TEST_PAGE` 環境変数を読む。
- 結果形式: axe スタイルのエンベロープ（violations / incomplete / passes + summary）、`./schemas` 配下で JSON スキーマ定義済み — 既に機械可読であり、CI レポーターを安価に実装できる。
- リポジトリ内の既存ランナー: `skills/auditing-wcag/references/scripts/run-test.cjs`（約30行：引数解析、`TEST_PAGE` 環境変数、`execFileSync('npx', ['playwright', 'test', ...files])`）および `package.json` スクリプト `test:axe` ... `test:all`。
- CI アーティファクトのパターン: `.github/workflows/ci.yml` の `wcag-audit-tests` ジョブが `actions/upload-artifact@v4` で `*-result.json` / スクリーンショットをアップロード。

## 必要なコマンド

| 目的 | コマンド | 成功時の期待値 |
|---------|---------|---------------------|
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| プロトタイプ実行 | `node <prototype>.mjs --url <fixture>` | 結果 JSON を書き出し、設計通りに終了する |

## スコープ

**対象**（成果物）:
- `plans/007-result-cli-design.md`（設計文書）

**使い捨て**（コミットしない）: プロトタイプスクリプト群（例: `packages/a11y-audit/_spike-cli.mjs`）、スクラッチワークフロー YAML。

**対象外**（触れないこと）:
- `packages/a11y-audit/package.json`（まだ `bin` は追加しない）、`src/`、`exports` — ビルドプランの領域。
- 何かを公開すること、GitHub Action リポジトリを作成すること、タグをプッシュすること。

## Git ワークフロー

- Branch: `spike/cli-and-gh-action-design`
- 単一コミット: `docs(plans): CLI + GitHub Actions design spike`
- 操作者から指示がない限り、プッシュや PR の作成は行わないこと。

## ステップ

### ステップ 1: パッケージング形式を決定する（根拠に基づいて、感覚ではなく）

設計文書内で以下を比較し、1 つを選択する:

| オプション | 回答すべき主な問い |
|---|---|
| A. `@a11y-skills/audit` に `bin` を追加 | `peerDeps`（`@playwright/test`）がインストールされていない場合、`npx @a11y-skills/audit` は動作するか？ コールド npx パスを実証的に検証すること。 |
| B. playwright への強依存を持つ別パッケージ `@a11y-skills/audit-cli` | リリースの結合: 監査リリースのたびに cli のバージョンアップが必要になる（このリポジトリは Plan 003 でその苦痛を経験済み）。それだけの価値があるか？ |
| C. CLI なし；ドキュメント化された `npx playwright test` レシピと GH Action のみを提供 | コスト最小；実際に摩擦を解消できるか？ |

オプション A の実証テストがこのステップの核心である: リポジトリ外のスクラッチディレクトリで `npm init -y && npx @a11y-skills/audit@0.3.0` を実行しても、現時点では何も起こらない — 代わりに以下をシミュレートする: ピアなしでパッケージのみをインストールし、`import('@a11y-skills/audit/playwright')` が何をするか確認する（期待値: `@playwright/test` の解決エラー）。実際のエラーテキストを文書に記録すること；これによってオプション A にランタイムのピア確認とフレンドリーなインストールヒントが必要かどうかが決まる。

### ステップ 2: CLI サーフェスのプロトタイプ作成

使い捨て `.mjs` スクリプト（依存関係が存在する `packages/a11y-audit` 内で実行）で、最小限の誠実なスライスを実装する:

```
--url <url>            required
--checks <a,b,c>       default: axe (full list: axe,focus-indicator,reflow,
                       target-size,text-spacing,zoom,orientation,autocomplete,
                       time-limit,auto-play)
--output-dir <dir>     default: ./a11y-audit-results (maps to outputDir)
exit code              0 = no violations, 1 = violations found, 2 = runner error
```

chromium を playwright で起動し、2〜3 のチェックを実行し（browser vs page の分岐に直面するため `runFocusIndicatorCheck` を含めること）、チェックごとに1行のサマリーを出力する。既知の不具合がある公開フィクスチャ、またはローカルの `data:` / インラインページに対して実行すること。文書に以下を記録する: 総実行時間、CLI が肩代わりするブラウザ管理コード（それ自体が CLI が吸収する摩擦である）、関数 API が CLI レイヤーに露出させる際に不自然な点（例: 一貫性のないオプション名）— それらはビルドプランの API 改善メモとなる。

**検証**: 文書に「プロトタイプの知見」セクションがあり、実際に使用したコマンドライン、実行時間、および観察した終了コードの挙動が記載されていること。使い捨てファイルは削除済みであること。

### ステップ 3: GitHub Actions シナリオを設計する

文書内で以下から選択する: (a) このリポジトリ内の再利用可能ワークフロー、(b) マーケットプレイスに公開するコンポジットアクション、(c) パッケージ README にドキュメント化されたコピー＆ペースト用ワークフロースニペット。判断材料: このリポジトリ自身の `wcag-audit-tests` CI ジョブはすでに (c) の形態である；マーケットプレイス公開はメンテナンス負荷（バージョン管理、第2のリリースプロセス）を増やすが、Plan 003 ではその負荷をこのリポジトリが強く感じていることが示された。選択したオプションの実際の YAML を文書内（`.github/workflows/` 内ではなく）に下書きすること。内容として: ブラウザのインストール（Plan 002 のキャッシュパターンを用いて）、ユーザー提供 URL への実行、結果 JSON とスクリーンショットのアーティファクトアップロード、およびステップ 2 の CLI 終了コードによる違反検出時のジョブ失敗。

### ステップ 4: 見積もりと推奨事項

文書を以下で締める: 各軸で選択したオプション（CLI 形式 × Actions 形式）、各オプションの工数見積もり（S/M/L）、不足している需要シグナルへの対処（提案: まず README ワークフロースニペット (c) を提供する — リリースコストゼロ — そしてイシュートラフィックで CLI の正当性を判断する）、および「今すぐ進める / 進めない」の推奨。

## テストプラン

該当なし（スパイク）。ステップ 2 のプロトタイプ実行が根拠となる。

## 完了条件

すべてを満たすこと:

- [ ] `plans/007-result-cli-design.md` が存在し、以下を含むこと: 実証的なコールドインストール結果を含むパッケージング形式の決定、プロトタイプの知見（コマンド、実行時間、終了コード）、Actions YAML の下書き、工数見積もり、進める / 進めない の推奨
- [ ] `packages/a11y-audit/package.json`、`src/`、`.github/workflows/` に変更がないこと（`git status` で確認）
- [ ] 使い捨てファイルが削除済みであること
- [ ] `plans/README.md` のステータス行が更新済みであること

## STOP 条件

以下の場合は作業を中断して報告すること:

- `packages/a11y-audit/package.json` に既に `bin` フィールドがある場合（ドリフト発生 — 着手した人物と調整すること）。
- ステップ 2 のプロトタイプが `src/` を変更せずにチェックを実行できない場合（例: チェックが Playwright テストランナーのコンテキストを必須要件としている）— その知見自体がスパイクの結論となる：文書にまとめて終了すること。

## メンテナンスメモ

- CLI への「進める」推奨が出た場合、ビルドプランは以下も対象とする必要がある: README（EN + JA — AGENTS.md の同期ルール）、`files` / `exports` / `bin` の配線、および Plan 003 のバンプ自動化が新パッケージを認識すること。
- 終了コードの仕様（0/1/2）は CI サンプルに含まれた瞬間にパブリック API となる — ビルドプランでは、後からの変更を破壊的変更として扱うこと。
