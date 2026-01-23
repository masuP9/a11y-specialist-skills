---
name: auditing-wcag
description: WCAG 2.2 AA conformance auditor. Systematically verifies success criteria through automated, interactive, and manual testing methods.
license: MIT
metadata:
  author: masuP9
  version: "1.0.0"
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
- ローカルファイルは`Read`で内容を取得する（実行時挙動は評価できない）。

### 2. スコープ契約
以下を明示し、合意を得る。
- 対象レベル（A/AA、既定はWCAG 2.2 AA）
- 対象ページ範囲（全ページ/代表ページ/指定URL）
- 制限事項（AT確認は範囲外、動的挙動はPlaywright依存）
- 出力形式（達成基準ごとのPass/Fail/NT/NA）

### 3. 自動チェック
- Playwrightでページに遷移し、アクセシビリティツリーを取得する。
- `references/automated-checks.ja.md`を基準に判定する。
- Playwrightが使えない場合は`WebFetch`でHTMLを取得し、判定可能な範囲のみ実施する。
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
