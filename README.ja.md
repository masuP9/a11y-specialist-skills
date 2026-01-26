# a11y-specialist-skills

[English](./README.md)

[Claude Code](https://claude.ai/claude-code) 用のアクセシビリティ専門スキルプラグイン。

WCAG 2.2 & WAI-ARIA APG に基づいたアクセシビリティレビューを行うスキルを提供します。

## スキル一覧

| スキル | 説明 |
|--------|------|
| [reviewing-a11y](./skills/reviewing-a11y/) | Webページ、コンポーネント実装、デザイン案、仕様書のアクセシビリティレビュー |
| [auditing-wcag](./skills/auditing-wcag/) | WCAG 2.2 AA準拠の体系的な監査（自動テストスクリプト付き） |
| [planning-wcag-audit](./skills/planning-wcag-audit/) | WAICガイドラインに基づくWCAG監査計画（対象ページ選定、試験方法） |
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

### reviewing-a11y（アクセシビリティレビュー）

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

スラッシュコマンドで直接呼び出すこともできます：

```
/reviewing-a11y
```

#### レビュー出力

スキルは以下を含む構造化されたフィードバックを提供します：

- **良い点**: アクセシビリティの観点で良くできている点
- **問題点**: 重要度別に分類された問題（Critical / Major / Minor）
  - コード/ページ内の箇所
  - 問題の説明
  - 関連するWCAG達成基準
  - 修正案
- **手動確認**: 人間による確認が必要な項目

### auditing-wcag（WCAG適合監査）

WCAG 2.2 AA準拠の体系的な監査を実施します：

```
# 例
このページのWCAG監査をして
https://example.com をWCAG監査して
WCAG 2.2 AA適合性をチェックして
```

スラッシュコマンドで直接呼び出すこともできます：

```
/auditing-wcag
```

#### 監査プロセス

4フェーズで監査を進めます：

1. **自動チェック**: axe-core + カスタムPlaywrightスクリプト
2. **インタラクティブチェック**: キーボード、フォーカス、ポインター操作
3. **手動チェック**: 人間による確認項目
4. **コンテンツレビュー**: 代替テキスト、ラベル、見出しの品質

自動テストスクリプト対応項目：
- フォーカスインジケーター（2.4.7, 2.4.12, 3.2.1）
- 320pxでのリフロー（1.4.10）
- テキストスペーシング（1.4.12）
- ターゲットサイズ（2.5.5, 2.5.8）
- その他多数...

### planning-wcag-audit（監査計画）

WAICガイドラインに基づくWCAG監査計画を策定します：

```
# 例
WCAG監査の計画を立てたい
ウェブサイトの監査計画を作成して
アクセシビリティ試験の対象ページを選定して
```

スラッシュコマンドで直接呼び出すこともできます：

```
/planning-wcag-audit
```

#### 計画出力

- **対象ページ選定**: WAIC方式に基づく代表ページ選定
- **試験方法**: 自動/手動試験の割り当て
- **監査計画書**: 正式な監査計画テンプレート

### planning-a11y-improvement（改善計画）

組織のアクセシビリティ改善計画を策定します：

```
# 例
アクセシビリティの改善計画を立てたい
a11y戦略を考えて
組織のa11y成熟度を評価して
```

スラッシュコマンドで直接呼び出すこともできます：

```
/planning-a11y-improvement
```

#### 計画出力

インタビュー形式で情報を収集し、以下を生成します：

- **成熟度評価**: 現状レベル（L1-L4）と根拠
- **ロードマップ**: フェーズ別の施策と担当
- **KPI設計**: 先行指標・遅行指標
- **ステークホルダー説得資料**: ビジネスインパクトとROI

アクセシビリティ試験結果や取り組み履歴などのドキュメントを読み込んで、より精度の高い計画を策定することもできます。

## 参考リソース

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2 日本語訳](https://waic.jp/translations/WCAG22/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

## ライセンス

[MIT](./LICENSE)
