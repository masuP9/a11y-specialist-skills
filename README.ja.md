# a11y-specialist-skills

[English](./README.md)

[Claude Code](https://claude.ai/claude-code) 用のアクセシビリティ専門スキルプラグイン。

WCAG 2.2 & WAI-ARIA APG に基づいたアクセシビリティレビューを行うスキルを提供します。

## スキル一覧

| スキル | 説明 |
|--------|------|
| [reviewing-a11y](./skills/reviewing-a11y/) | Webページ、コンポーネント実装、デザイン案、仕様書のアクセシビリティレビュー |
| [planning-a11y-improvement](./skills/planning-a11y-improvement/) | 成熟度評価、ロードマップ、KPI設計によるアクセシビリティ改善計画 |

## インストール

### プラグインとして（推奨）

```bash
# マーケットプレイスを追加
/plugin marketplace add masuP9/a11y-specialist-skills

# プラグインをインストール
/plugin install a11y-specialist-skills@a11y-specialist-skills
```

### スタンドアロンスキルとして（シンボリックリンク）

```bash
# リポジトリをクローン
git clone https://github.com/masuP9/a11y-specialist-skills.git

# skillsディレクトリにシンボリックリンクを作成
ln -s /path/to/a11y-specialist-skills/skills/reviewing-a11y ~/.claude/skills/reviewing-a11y
```

### 開発用

```bash
# --plugin-dir でローカルテスト
claude --plugin-dir /path/to/a11y-specialist-skills
```

## 使い方

Claudeはリクエストに応じて自動的にスキルを検出します：

```
# 例
a11yレビューして
アクセシビリティ確認して
このページのアクセシビリティをチェックして
```

特定の対象を指定することもできます：

```
# URL
https://example.com のa11yレビューして

# ローカルファイル
src/components/Button.tsx のアクセシビリティを確認して

# デザイン案
このデザイン案のa11y観点でレビューして
```

## レビュー出力

スキルは以下を含む構造化されたフィードバックを提供します：

- **良い点**: アクセシビリティの観点で良くできている点
- **問題点**: 重要度別に分類された問題（Critical / Major / Minor）
  - コード/ページ内の箇所
  - 問題の説明
  - 関連するWCAG達成基準
  - 修正案
- **手動確認**: 人間による確認が必要な項目

## 参考リソース

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2 日本語訳](https://waic.jp/translations/WCAG22/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

## ライセンス

[MIT](./LICENSE)
