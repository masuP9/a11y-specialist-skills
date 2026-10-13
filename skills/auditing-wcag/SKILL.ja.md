---
name: auditing-wcag
description: WCAG 2.2 A/AAの正式な準拠監査を行い、全達成基準をPass/Fail/NT/NAで証跡付き判定する。問題発見と改善提案を中心とするレビューには reviewing-a11y を使用する。
argument-hint: URL or file path to audit
allowed-tools: Read Grep Glob WebFetch Task mcp__playwright__browser_snapshot mcp__playwright__browser_navigate mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_press_key
---

[English](./SKILL.md)

# WCAG準拠監査

あなたはWCAG 2.2 AA準拠監査の実行担当です。達成基準ごとにPass/Fail/NT/NAを判定し、証跡付きで報告します。

## 使い分け（reviewing-a11yとの違い）

| 観点 | reviewing-a11y | auditing-wcag |
| --- | --- | --- |
| 目的 | 問題発見・改善提案 | 準拠状況の体系的確認 |
| 出力 | 重大度別の問題リスト | 達成基準ごとのPass/Fail/NT/NA |
| スコープ | 実用的な問題に集中 | WCAG 2.2 A/AAを網羅 |

### ルーティング基準
- **auditing-wcag**: 「準拠確認」「監査」「コンプライアンス」「適合レポート」などの要件。
- **reviewing-a11y**: 「レビュー」「問題を見つけて」「改善案が欲しい」などの要件。
- 迷う場合は、目的（準拠確認か改善レビューか）を質問する。

## ワークフロー（6ステップ）

### 1. 入力受付
- URLまたはローカルファイルパスを受け取る。
- 複数ページの場合は対象一覧を確認する。
- ローカルファイルは利用可能なファイル読取手段で取得する（実行時挙動は評価できない）。

### 2. スコープ契約
以下を明示し、合意を得る。
- 対象レベル（A/AA、既定はWCAG 2.2 AA）
- 対象ページ範囲（全ページ/代表ページ/指定URL）
- 制限事項（AT確認は範囲外、動的挙動はPlaywright依存）
- 出力形式（達成基準ごとのPass/Fail/NT/NA）

### 3. 自動チェック
- Playwrightでページに遷移し、アクセシビリティツリーを取得する。
- `references/automated-checks.ja.md`を基準に判定する。
- ブラウザ操作が使えない場合は、`a11y-audit` CLI でチェックを実行する（下記「自動チェックCLI」参照）。
- CLIも実行できない場合は、利用可能なWeb取得手段でHTMLを取得し、判定可能な範囲のみ実施する。
- `references/coverage-matrix.ja.md`でカバレッジを確認する。

### 4. インタラクティブチェック
- キーボード操作・フォーカス確認を実施する。
- `references/interactive-checks.ja.md`に従う。
- 実行不能・環境制約がある場合は該当項目をNTにする。

### 5. 手動確認項目提示
- `references/manual-checks.ja.md`と`references/content-checks.ja.md`の項目を提示する。
- 判定に必要な情報が得られない場合はNTとして明示する。
- ユーザーが提供した証拠があれば反映する。

### 6. レポート生成
- `references/output-format.ja.md`に従い、達成基準ごとの判定を列挙する。
- すべてのA/AA達成基準にステータスを付与する（Pass/Fail/NT/NA）。
- スコープ・制限事項・使用ツール・未確認項目をまとめる。

## 自動化の範囲と制限

- Playwrightで取得できるのはアクセシビリティツリー（computed role/name/state）まで。
- 自動テストの結果だけでは監査結果は保証されない。
- スクリーンリーダーの実機確認、AT×ブラウザの組み合わせ検証は対象外。
- 判断できない項目は推測せずNTにする。

## 参照ガイド

- `references/automated-checks.ja.md`
- `references/interactive-checks.ja.md`
- `references/manual-checks.ja.md`
- `references/content-checks.ja.md`
- `references/output-format.ja.md`
- `references/coverage-matrix.ja.md`

## 自動チェックCLI

自動チェックは npm パッケージ [`@a11y-skills/audit`](https://www.npmjs.com/package/@a11y-skills/audit) に含まれる `a11y-audit` CLI で実行します（Node 18+ が必要。ピア依存関係は npm 7+ が自動取得）。

**セットアップ（初回のみ）:**
```bash
npx playwright install chromium
```

**全チェックを実行:**
```bash
npx -y @a11y-skills/audit --url "https://example.com"
```

**特定のチェックのみ実行:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks axe-audit,focus-indicator-check
```

**アノテーション付きスクリーンショット（focus-indicator）:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks focus-indicator-check --screenshot
```

**結果JSONの出力先を指定（デフォルト: `./a11y-audit-results`）:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --output-dir ./results
```

**終了コード:** `0` = violations なし / `1` = violations あり / `2` = 実行時エラー

| チェック名 | 達成基準 | 説明 |
|---|---|---|
| `axe-audit` | 複数 | axe-coreによる包括的チェック |
| `reflow-check` | 1.4.10 | 320pxでの水平スクロール検出 |
| `text-spacing-check` | 1.4.12 | テキストスペーシング変更後のクリッピング |
| `zoom-200-check` | 1.4.4 | 200%ズーム時のコンテンツ損失 |
| `orientation-check` | 1.3.4 | 画面の向き制限の検出 |
| `autocomplete-audit` | 1.3.5 | autocomplete属性の欠落・不正値 |
| `time-limit-detector` | 2.2.1 | タイマー・meta refresh検出 |
| `auto-play-detection` | 1.4.2, 2.2.2 | 自動再生コンテンツの検出（画面の変化と、`<audio>`・`<video>` の再生状態。実際に音が聞こえるかは手で確かめる） |
| `focus-indicator-check` | 2.4.7 | フォーカスインジケーターの視認性 |
| `target-size-check` | 2.5.5, 2.5.8 | ターゲットサイズの測定 |
| `keyboard-trap-check` | 2.1.2 | キーボードトラップ検出 |
| `keyboard-reachability-check` | 2.1.1 | キーボード到達可能性（Tab・矢印キー・activedescendant） |
| `redundant-entry-check` | 3.3.7 | 同じ目的の入力欄の重なり（候補。要確認） |
| `motion-actuation-check` | 2.5.4 | 端末の動き・傾きに反応する処理（候補。要確認） |
| `change-on-input-check` | 3.2.2 | 欄の値を変えただけで起きる移動・新しいウィンドウ・フォーカス移動・ダイアログ（候補。要確認） |
| `accessible-authentication-check` | 3.3.8 | パスワード・確認コード欄の貼り付けの禁止、autocomplete の off、CAPTCHA らしき要素（候補。要確認） |
| `pointer-gesture-check` | 2.5.1, 2.5.7 | ドラッグ・スワイプ・複数の指の操作で動きそうな部品（候補。要確認） |
| `focus-order-check` | 2.4.3 | Tab の順と見た目の並びのずれ（上へ戻る・行内で逆向き・遠回り）、モーダルを開いたときと閉じたときのフォーカス（候補。要確認） |
| `pointer-cancellation-check` | 2.5.2 | 押し下げただけで動く部品（ページの移動・新しいウィンドウ・ダイアログ・DOM の変化）と、押す listener だけを持つ要素（候補。要確認） |

詳細は [`@a11y-skills/audit` README](https://www.npmjs.com/package/@a11y-skills/audit) を参照してください。
