[English](./coverage-matrix.md)

# WCAG 2.2 A/AA カバレッジマトリクス

判定方法は「自動/インタラクティブ/手動/コンテンツ」を組み合わせて記載する。

> **Note:** **[スクリプト]** マークの基準には `scripts/` ディレクトリに自動テストスクリプトがあります。使用方法は `scripts/README.md` を参照してください。

## 1. 知覚可能
| 基準 | テスト方法 | 証跡 | 判定ルール |
|---|---|---|---|
| 1.1.1 | 自動+コンテンツ | a11y tree/画像一覧 | 情報画像が無名または代替不十分でFail |
| 1.2.1 | 自動+コンテンツ | DOMメディア検出 + トランスクリプトリンク | 代替がない場合Fail |
| 1.2.2 | 自動+コンテンツ | axe video-caption + track要素 | 字幕がない場合Fail |
| 1.2.3 | 自動+コンテンツ | track要素 + トランスクリプトリンク | 代替なしでFail |
| 1.2.4 | コンテンツ | 画面キャプチャ | ライブ字幕なしでFail |
| 1.2.5 | 自動+コンテンツ | track要素 | 音声解説なしでFail |
| 1.3.1 | 自動 | a11y tree断片 | セマンティクス欠落でFail |
| 1.3.2 | 自動 | a11y tree + DOM順 | 意味順序が崩れるとFail |
| 1.3.3 | 自動+コンテンツ | a11y treeテキスト + 文面抜粋 | 感覚依存のみでFail |
| 1.3.4 | 自動+手動 | orientation-check.ts + 画面キャプチャ | 特定方向で機能不可ならFail |
| 1.3.5 | 自動 | autocomplete-audit.ts | autocomplete不備でFail |
| 1.4.1 | 自動+手動 | a11y treeテキスト + スクショ | 色のみで識別ならFail |
| 1.4.2 | 手動 | 操作ログ | 停止/調整不可でFail |
| 1.4.3 | 自動 | axe color-contrast | AA未満でFail |
| 1.4.4 | 自動+手動 | zoom-200-check.ts + スクショ | 200%で欠落/重なりならFail |
| 1.4.5 | 手動+コンテンツ | スクショ | テキストが画像化ならFail |
| 1.4.10 | 自動+手動 | reflow-check.ts + スクショ | 横スクロール必須でFail |
| 1.4.11 | 自動 | axe非テキストコントラストルール | 非テキストコントラスト不足でFail |
| 1.4.12 | 自動+手動 | text-spacing-check.ts + スクショ | 文字欠落/重なりでFail |
| 1.4.13 | インタラクティブ | 動画/ログ | 解除/保持不可でFail |

## 2. 操作可能
| 基準 | テスト方法 | 証跡 | 判定ルール |
|---|---|---|---|
| 2.1.1 | インタラクティブ | 操作ログ | キーボード不可でFail |
| 2.1.2 | インタラクティブ | 操作ログ | トラップでFail |
| 2.1.4 | インタラクティブ | 操作ログ | 単一キー回避不可でFail |
| 2.2.1 | 自動+手動 | time-limit-detector.ts + 操作ログ | 延長/解除不可でFail |
| 2.2.2 | 自動+インタラクティブ | auto-play-detection.ts + 操作ログ | 停止/一時停止不可でFail |
| 2.3.1 | 手動 | 動画 | 点滅閾値超でFail |
| 2.4.1 | 自動 | a11y tree | 回避手段なしでFail |
| 2.4.2 | 自動 | `document.title` | タイトル空でFail |
| 2.4.3 | インタラクティブ | フォーカス順ログ | 視覚順と不一致でFail |
| 2.4.4 | 自動+コンテンツ | a11y tree + 文面抜粋 | 文脈内で不明瞭ならFail |
| 2.4.5 | 自動+コンテンツ | リンクグラフ + 検索/サイトマップ検出 | 複数手段なしでFail |
| 2.4.6 | 自動+コンテンツ | a11y tree/文面 | 見出し/ラベルが不明瞭でFail |
| 2.4.7 | インタラクティブ | スクショ | フォーカス不可視でFail |
| 2.4.11 | インタラクティブ | スクショ/計測 | 最低要件未満でFail |
| 2.4.12 | インタラクティブ | スクショ | フォーカスが隠れるとFail |
| 2.5.1 | インタラクティブ | 操作ログ | 複雑ジェスチャ必須でFail |
| 2.5.2 | インタラクティブ | 操作ログ | 誤作動/キャンセル不可でFail |
| 2.5.3 | 自動 | a11y name比較 | ラベル文字列不一致でFail |
| 2.5.4 | インタラクティブ | 操作ログ | 動作検知のみでFail |
| 2.5.7 | インタラクティブ | 操作ログ | ドラッグ必須でFail |
| 2.5.8 | 自動 | target-size-check.ts | 最低サイズ未満でFail |

## 3. 理解可能
| 基準 | テスト方法 | 証跡 | 判定ルール |
|---|---|---|---|
| 3.1.1 | 自動 | DOM属性 | lang未設定でFail |
| 3.1.2 | 自動+コンテンツ | axe valid-lang + テキスト分析 | 部分言語未指定でFail |
| 3.2.1 | 自動+インタラクティブ | focus-indicator-check.ts + DOM差分 | フォーカスで遷移/大更新でFail |
| 3.2.2 | インタラクティブ | DOM差分 | 入力のみで送信/遷移でFail |
| 3.2.3 | 自動 | 全ページa11y tree比較 | 一貫性欠如でFail |
| 3.2.4 | 自動 | 全ページa11y tree比較 | 同一機能の識別が不一致でFail |
| 3.2.6 | 自動 | 全ページa11y tree比較 | ヘルプ手段が不一致でFail |
| 3.3.1 | インタラクティブ | スクショ | エラー識別なしでFail |
| 3.3.2 | 自動+コンテンツ | a11y tree/文面 | ラベル/説明不足でFail |
| 3.3.3 | インタラクティブ | スクショ | 修正提案なしでFail |
| 3.3.4 | インタラクティブ | 操作ログ | 取消/確認不可でFail |
| 3.3.7 | 手動 | 操作ログ | 冗長入力要求でFail |
| 3.3.8 | インタラクティブ | 画面キャプチャ | 認知テストのみでFail |

## 4. 堅牢
| 基準 | テスト方法 | 証跡 | 判定ルール |
|---|---|---|---|
| 4.1.1 | 自動 | HTML検証ログ | 構文エラーが支援技術を阻害する場合Fail |
| 4.1.2 | 自動 | a11y tree | 名前/ロール/値が取得不可でFail |
| 4.1.3 | 自動+インタラクティブ | a11y tree/ログ | 状態メッセージが露出しない場合Fail |

## 利用可能なテストスクリプト

以下の基準には `scripts/` ディレクトリに自動テストスクリプトがあります:

| 基準 | スクリプト | 出力 |
|---|---|---|
| 複数 | `axe-audit.ts` | `axe-result.json` |
| 1.3.4 | `orientation-check.ts` | `orientation-result.json` |
| 1.3.5 | `autocomplete-audit.ts` | `autocomplete-result.json` |
| 1.4.2, 2.2.2 | `auto-play-detection.ts` | `auto-play-screenshots/` |
| 1.4.4 | `zoom-200-check.ts` | `zoom-200-result.json` |
| 1.4.10 | `reflow-check.ts` | `reflow-result.json` |
| 1.4.12 | `text-spacing-check.ts` | `text-spacing-result.json` |
| 2.2.1 | `time-limit-detector.ts` | `time-limit-result.json` |
| 2.4.7, 2.4.12, 3.2.1 | `focus-indicator-check.ts` | `focus-indicator-result.json`, `focus-indicators.png` |
| 2.5.5, 2.5.8 | `target-size-check.ts` | `target-size-result.json`, `target-size-screenshot.png` |
