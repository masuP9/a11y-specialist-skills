# Plan 007-C: README に GitHub Actions ワークフロースニペットを追加する

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP 条件」に該当した
> ら停止して報告する。完了したら `plans/README.md` の本プランのステータス行
> を更新する。
>
> **Drift check (run first)**:
> `git diff --stat e4c51b9..HEAD -- packages/a11y-audit/README.md packages/a11y-audit/README.ja.md`
> 差分があれば「Current state」の見出し位置と実ファイルを比較してから進む。
> 見出しが見つからなければ STOP。

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW（ドキュメントのみ。コード・CI・publish payload に影響なし）
- **Depends on**: 008 (DONE — CLI は 0.4.0 で公開済み)
- **Category**: docs
- **Planned at**: commit `e4c51b9`, 2026-06-12

## Why this matters

007 スパイク（`plans/007-result-cli-design.md` §5）は「コピー&ペースト用の
GitHub Actions スニペットを README に載せる」ことを即時実施項目（オプション
c）として推奨した。スパイク時の下書きは Playwright の関数 API を heredoc の
インライン ESM スクリプトで呼ぶ複雑なものだったが、その後 Plan 008 で
`a11y-audit` CLI が 0.4.0 として公開されたため、スニペットは
`npx a11y-audit --url <url>` ベースに大幅に簡略化できる。
CI に貼るだけで WCAG 自動チェックのゲートを作れることを README で示すのが
目的。

## Current state

- `packages/a11y-audit/README.md` — `## CLI` セクション（55 行目付近）があり、
  サブセクション `### Flags`, `### Available check names`, `### Exit codes`,
  `### Peer requirements`, `### \`auto-play-detection\` and optional deps` を
  含む。CLI セクションの直後は `## Usage — function API (recommended)`
  （119 行目付近）
- `packages/a11y-audit/README.ja.md` — 同構成。`## CLI`（53 行目付近）、
  最後のサブセクションは `### \`auto-play-detection\` と optional deps`、
  直後は `## 使い方 — 関数 API（推奨）`（117 行目付近）
- CLI の終了コード契約: `0` = violations なし、`1` = violations あり、
  `2` = 実行時エラー。violations があるとジョブが fail する
- このリポジトリ自身の CI は actions/checkout@v6 / setup-node@v6 /
  cache@v5 / upload-artifact@v7、Node 24 に統一済み — スニペットもこれに
  揃える

## Steps

### Step 1: EN README にサブセクションを追加

`packages/a11y-audit/README.md` の `### \`auto-play-detection\` and optional
deps` サブセクションの末尾（`## Usage — function API (recommended)` の直前）
に、以下を**そのまま**追加する:

````markdown
### GitHub Actions

Copy-paste workflow for a manually triggered audit. Violations fail the job
(exit code 1); add `continue-on-error: true` to the audit step if you want the
result to be informational only.

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

- Add `push` / `schedule` triggers (with a hardcoded URL) to run the audit as
  a recurring gate.
- Result JSON files (and the focus-indicator screenshot when `--screenshot`
  is set) are uploaded as a build artifact.
- To speed up repeat runs, cache `~/.cache/ms-playwright` keyed on the
  installed `@playwright/test` version — see this repository's `ci.yml` for
  the pattern.
````

### Step 2: JA README に同内容を追加

`packages/a11y-audit/README.ja.md` の `### \`auto-play-detection\` と
optional deps` の末尾（`## 使い方 — 関数 API（推奨）` の直前）に、Step 1 と
同一の YAML を含む日本語版を追加する:

- 見出し: `### GitHub Actions`
- 導入文: 「手動トリガーで監査を実行するコピー&ペースト用ワークフロー。
  violations があるとジョブは fail する（終了コード 1）。結果を情報提供のみに
  したい場合は監査ステップに `continue-on-error: true` を付ける。」
- YAML ブロック: **Step 1 と byte 単位で同一**
- Notes の 3 項目も同内容を日本語で（`push` / `schedule` トリガー、結果
  JSON のアーティファクト化、`~/.cache/ms-playwright` のキャッシュパターンは
  本リポジトリの `ci.yml` 参照）

### Step 3: 検証

```sh
# 1. YAML ブロックが EN/JA で同一であること
awk '/^```yaml$/,/^```$/' packages/a11y-audit/README.md > /tmp/snippet-en.yaml
awk '/^```yaml$/,/^```$/' packages/a11y-audit/README.ja.md > /tmp/snippet-ja.yaml
diff /tmp/snippet-en.yaml /tmp/snippet-ja.yaml && echo SAME
# 注: README に yaml ブロックが複数あれば抽出方法を調整すること

# 2. YAML として valid であること（フェンス行を除去してから）
sed '/^```/d' /tmp/snippet-en.yaml > /tmp/snippet.yaml
npx --yes js-yaml /tmp/snippet.yaml > /dev/null && echo "YAML OK"

# 3. run: | ブロック内に列 0 から始まる行がないこと（本スニペットは
#    マルチライン run を使っていないので該当なしのはず — 目視確認）

# 4. スニペットが参照する CLI フラグが実在すること
node packages/a11y-audit/dist/cli.js --help | grep -- --output-dir
# dist が無ければ: npm ci && npm run build --workspace @a11y-skills/audit

# 5. リポジトリの format/lint ゲート
npm run format:check
npm run lint
```

### Step 4: コミット

ブランチ `docs/actions-snippet` で 1 コミット:
`docs(a11y-audit): add GitHub Actions workflow snippet to README`
push や PR 作成はしない（レビュアーが扱う）。

## STOP conditions

- Drift check で README の見出し構成が「Current state」と食い違う
- `--output-dir` など、スニペットが参照する CLI フラグが `--help` の出力に
  存在しない
- YAML 検証が通らない

## In scope (files)

- `packages/a11y-audit/README.md`
- `packages/a11y-audit/README.ja.md`

## Out of scope (touch nothing here)

- `.github/workflows/` — スニペットは**ドキュメントのみ**。このリポジトリの
  実ワークフローとして追加しない
- `packages/a11y-audit/src/`、`package.json`、CHANGELOG（リリースを伴わない
  ドキュメント変更のため CHANGELOG 追記は不要）
- `skills/` 配下すべて

## Maintenance notes

- CLI のフラグ・終了コードが変わったらこのスニペットも更新すること
  （README 内の `### Flags` / `### Exit codes` と同じメンテナンス単位）
- 将来 Plan 009（スキル移行）でスキルのドキュメントから CLI を参照する際、
  このスニペットが参照実装になる
