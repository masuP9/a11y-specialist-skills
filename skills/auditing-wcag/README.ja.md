# auditing-wcag

[English version](./README.md)

WCAG 2.2 AA準拠を体系的に監査し、達成基準ごとにPass/Fail/NT/NA判定を行うスキル。

## アーキテクチャ

テスト方法ベースの参照ガイドを使用した**ハイブリッドパターン**:

```
┌─────────────────────────────────────┐
│   auditing-wcag                     │
│   - 入力受付（URL/ファイル）         │
│   - スコープ契約の確立              │
│   - 体系的なチェック実行            │
│   - 準拠レポート生成                │
└──────────┬──────────────────────────┘
           │
    ┌──────┴────────┬─────────────┬──────────────┐
    │               │             │              │
    ▼               ▼             ▼              ▼
┌──────────┐  ┌───────────┐  ┌────────┐  ┌─────────┐
│自動チェック│  │インタラク │  │手動チェック│  │コンテンツ│
│          │  │ティブ    │  │        │  │チェック  │
└──────────┘  └───────────┘  └────────┘  └─────────┘
```

## reviewing-a11yとの使い分け

| 観点 | reviewing-a11y | auditing-wcag |
|------|----------------|---------------|
| **目的** | 問題発見・改善提案 | 準拠状況の体系的確認 |
| **出力** | 重大度別の問題リスト | 達成基準ごとのPass/Fail/NT/NA |
| **スコープ** | 実用的な問題にフォーカス | 全WCAG 2.2 A/AAを網羅 |
| **ユースケース** | 開発中のフィードバック | 監査、準拠証明 |

### 振り分けルール
- **auditing-wcag**: 「監査」「準拠確認」「コンプライアンス」、正式なレポート
- **reviewing-a11y**: 「レビュー」「チェック」「問題を見つけて」、開発フィードバック

## ワークフロー（6ステップ）

1. **入力受付**: URLまたはファイルパスの識別
2. **スコープ契約**: レベル、ページ範囲、制限事項について合意
3. **自動チェック**: Playwrightでアクセシビリティツリー解析
4. **インタラクティブチェック**: キーボード・フォーカス確認
5. **手動確認項目提示**: NTとなる項目をユーザーに提示
6. **レポート生成**: 達成基準ごとのPass/Fail/NT/NA判定

## 自動化の範囲と制限

Playwrightで取得できるのはアクセシビリティツリー（role/name/state）のみ:
- ❌ スクリーンリーダー検証（NVDA/JAWS/VoiceOver）
- ❌ 支援技術×ブラウザの互換性テスト
- ❌ 認知的なアクセシビリティ判断

自動化できない項目は**NT（Not Tested）**としてマークされます。

## レポートのステータス値

| ステータス | 意味 |
|----------|------|
| **Pass** | 達成基準を満たしている |
| **Fail** | 違反を検出 |
| **NT** | 未テスト - 支援技術/人間の確認が必要 |
| **NA** | 適用外 - 対象コンテンツが存在しない |

## ファイル構成

```
skills/auditing-wcag/
├── SKILL.md                        # メインスキル（英語）
├── SKILL.ja.md                     # メインスキル（日本語）
├── README.md                       # 英語README
├── README.ja.md                    # このファイル
└── references/
    ├── automated-checks.md         # 自動テスト可能な基準
    ├── automated-checks.ja.md
    ├── interactive-checks.md       # インタラクションベースのチェック
    ├── interactive-checks.ja.md
    ├── manual-checks.md            # 人間の判断が必要
    ├── manual-checks.ja.md
    ├── content-checks.md           # コンテンツ品質チェック
    ├── content-checks.ja.md
    ├── output-format.md            # レポートテンプレート
    ├── output-format.ja.md
    ├── coverage-matrix.md          # 全A/AAカバレッジマトリクス
    └── coverage-matrix.ja.md
```

## 使用例

```
https://example.com のWCAG準拠を監査して
https://mysite.com のWCAG 2.2 AAコンプライアンスをチェック
```

## 参考資料

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2 日本語訳](https://waic.jp/translations/WCAG22/)
- [WCAG クイックリファレンス](https://www.w3.org/WAI/WCAG22/quickref/)
