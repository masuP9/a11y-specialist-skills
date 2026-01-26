# WCAG Automated Audit Scripts

Playwright ベースの WCAG 自動テストスクリプト集。手動テストでは見落としやすいアクセシビリティの問題を自動検出します。

## スクリプト一覧

| スクリプト | WCAG 基準 | 検出内容 |
|-----------|----------|----------|
| `axe-audit.ts` | 複数 | axe-core による包括的な自動テスト |
| `reflow-check.ts` | 1.4.10 | 320px viewport での水平スクロール・オーバーフロー |
| `text-spacing-check.ts` | 1.4.12 | テキストスペーシング変更後のクリッピング |
| `zoom-200-check.ts` | 1.4.4 | 200% ズーム時のコンテンツ切り取り |
| `orientation-check.ts` | 1.3.4 | 画面の向き制限メッセージの検出 |
| `autocomplete-audit.ts` | 1.3.5 | autocomplete 属性の欠落・不正値 |
| `time-limit-detector.ts` | 2.2.1 | タイマー・meta refresh の検出 |
| `auto-play-detection.ts` | 1.4.2 | 自動再生コンテンツの検出 |
| `focus-indicator-check.ts` | 2.4.7 / 2.4.12 / 3.2.1 | フォーカスインジケーターの視認性、遮蔽検出、フォーカス時コンテキスト変更 |
| `target-size-check.ts` | 2.5.5 / 2.5.8 | タップターゲットサイズ (24px / 44px) |

## セットアップ

```bash
# 依存関係のインストール
npm install

# Playwright ブラウザのインストール
npx playwright install chromium
```

## 使い方

### 全テスト実行

```bash
npm test
```

### 個別テスト実行

```bash
# axe-core テスト
npx playwright test axe-audit.ts

# 特定の WCAG 基準のテスト
npx playwright test reflow-check.ts
npx playwright test text-spacing-check.ts
```

### カスタム URL でテスト

```bash
# 環境変数で URL を指定
TEST_URL="https://example.com" npm test

# 個別テストの場合
TEST_PAGE="https://example.com/form" npx playwright test autocomplete-audit.ts
```

### デバッグモード

```bash
# ブラウザを表示して実行
npm run test:headed

# Playwright Inspector を起動
npm run test:debug
```

## 出力

各スクリプトは結果を JSON ファイルとして出力します：

- `axe-result.json` - axe-core の検出結果
- `reflow-result.json` - リフローの問題
- `text-spacing-result.json` - テキストスペーシングの問題
- `zoom-200-result.json` - ズーム時の問題
- `orientation-result.json` - 向き制限の検出結果
- `autocomplete-result.json` - autocomplete の問題
- `time-limit-result.json` - タイムリミットの検出結果
- `focus-indicator-result.json` - フォーカスインジケーターの問題（2.4.7 / 2.4.12 / 3.2.1）
- `target-size-result.json` - ターゲットサイズの問題

スクリーンショットも保存されます（該当するテストのみ）。

## テストサイト

デフォルトでは [City Komaru](https://a11yc.com/city-komaru/) テストサイトを使用します。このサイトは意図的にアクセシビリティの問題を含んでおり、テストに適しています。

```bash
# 問題の多いプリセットでテスト
TEST_PAGE="?preset=ng-terrible1&wcagver=22" npx playwright test axe-audit.ts

# 特定の WCAG 基準の問題があるプリセット
TEST_PAGE="?criteria=1.3.5" npx playwright test autocomplete-audit.ts
```

## WCAG 2.2 AA カバレッジ

### カスタムスクリプトでカバー

| 達成基準 | スクリプト | 検出内容 |
|---------|-----------|---------|
| 1.3.4 Orientation | `orientation-check.ts` | 向き制限メッセージ・コンテンツ非表示 |
| 1.3.5 Identify Input Purpose | `autocomplete-audit.ts` | autocomplete 属性の欠落・不正値 |
| 1.4.2 Audio Control | `auto-play-detection.ts` | 自動再生コンテンツ |
| 1.4.4 Resize Text | `zoom-200-check.ts` | 200% ズーム時のクリッピング |
| 1.4.10 Reflow | `reflow-check.ts` | 320px での水平スクロール |
| 1.4.12 Text Spacing | `text-spacing-check.ts` | スペーシング変更後のクリッピング |
| 2.2.1 Timing Adjustable | `time-limit-detector.ts` | タイマー・meta refresh |
| 2.4.7 Focus Visible | `focus-indicator-check.ts` | フォーカスインジケーターの視認性 |
| 2.4.12 Focus Not Obscured | `focus-indicator-check.ts` | fixed/sticky 要素によるフォーカス遮蔽 |
| 3.2.1 On Focus | `focus-indicator-check.ts` | フォーカス時のコンテキスト変更（ナビゲーション） |
| 2.5.8 Target Size (Minimum) | `target-size-check.ts` | タップターゲット 24px 未満 |

### axe-core でカバー（部分的）

`axe-audit.ts` は axe-core を使用して以下を含む多くの基準をチェックします：

- 1.1.1 Non-text Content（alt 属性など）
- 1.3.1 Info and Relationships（構造的マークアップ）
- 1.4.3 Contrast (Minimum)
- 1.4.11 Non-text Contrast
- 2.4.4 Link Purpose (In Context)
- 3.1.1 Language of Page
- 3.1.2 Language of Parts
- 3.3.1 Error Identification
- 3.3.2 Labels or Instructions
- 4.1.2 Name, Role, Value

### 自動テスト困難（手動テスト必須）

以下の達成基準は自動テストでは十分に検証できません：

| カテゴリ | 達成基準 | 理由 |
|---------|---------|------|
| メディア代替 | 1.2.1〜1.2.5 | 代替コンテンツの同等性判定が必要 |
| 意味・順序 | 1.3.2, 1.3.3 | コンテンツの意味的理解が必要 |
| 色の使用 | 1.4.1, 1.4.5 | 色の意味的使用・画像内テキスト判定 |
| キーボード | 2.1.1, 2.1.2, 2.1.4 | 全機能のキーボード操作検証 |
| ナビゲーション | 2.4.1〜2.4.6 | 論理性・適切さの判定 |
| 入力支援 | 3.2.x, 3.3.x | 一貫性・予測可能性の判定 |
| ポインター | 2.5.1〜2.5.4, 2.5.7 | ジェスチャー・モーション検証 |

## 制限事項

これらのスクリプトは **自動検出可能な問題のみ** を報告します：

- **検出できるもの**: DOM 構造、CSS プロパティ、タイミング、レイアウト、コントラスト比
- **検出できないもの**: コンテンツの意味的な適切さ、代替テキストの品質、キーボード操作の論理性、ユーザー体験の一貫性

> ⚠️ 自動テストで検出できるのは WCAG 違反の約 30〜40% と言われています。完全な WCAG 準拠の確認には、手動テストとの併用が必須です。

## 今後の拡張

未カバーの達成基準で自動化の可能性があるものは [TODO-COVERAGE.md](./TODO-COVERAGE.md) にまとめています。

## ライセンス

MIT
