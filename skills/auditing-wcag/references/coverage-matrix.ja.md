[English](./coverage-matrix.md)

# WCAG 2.2 A/AA カバレッジマトリクス

判定方法は「自動/インタラクティブ/手動/コンテンツ」を組み合わせて記載する。達成基準ごとに、どのチェックと材料を使うかの索引として使う。

「判定ルール」列が **線引き** のものは、a11y-knowledge の `criteria/<番号>.ja.md` の「線引き」と「確かめるとき」で判定する。それ以外はこの列に従う。

> **Note:** **[CLI]** マークの基準は `a11y-audit` CLI で自動チェック可能です（チェック名は SKILL.ja.md の表を参照）。

## 1. 知覚可能
| 基準 | テスト方法 | 証跡 | 判定ルール |
|---|---|---|---|
| 1.1.1 | 自動+コンテンツ | a11y tree/画像一覧 | [線引き](../../a11y-knowledge/references/criteria/1.1.1.ja.md) |
| 1.2.1 | 自動+コンテンツ | DOMメディア検出 + トランスクリプトリンク | 代替がない場合Fail |
| 1.2.2 | 自動+コンテンツ | axe video-caption + track要素 | [線引き](../../a11y-knowledge/references/criteria/1.2.2.ja.md) |
| 1.2.3 | 自動+コンテンツ | track要素 + トランスクリプトリンク | 代替なしでFail |
| 1.2.4 | コンテンツ | 画面キャプチャ | ライブ字幕なしでFail |
| 1.2.5 | 自動+コンテンツ | track要素 | 音声解説なしでFail |
| 1.3.1 | 自動 | a11y tree断片 | [線引き](../../a11y-knowledge/references/criteria/1.3.1.ja.md) |
| 1.3.2 | 自動 | a11y tree + DOM順 | 意味順序が崩れるとFail |
| 1.3.3 | 自動+コンテンツ | a11y treeテキスト + 文面抜粋 | [線引き](../../a11y-knowledge/references/criteria/1.3.3.ja.md) |
| 1.3.4 | 自動+手動 | `orientation-check` **[CLI]** + 画面キャプチャ | [線引き](../../a11y-knowledge/references/criteria/1.3.4.ja.md) |
| 1.3.5 | 自動 | `autocomplete-audit` **[CLI]** | [線引き](../../a11y-knowledge/references/criteria/1.3.5.ja.md) |
| 1.4.1 | 自動+手動 | a11y treeテキスト + スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.1.ja.md) |
| 1.4.2 | 自動+手動 | `auto-play-detection` **[CLI]**（`a11y-skills/auto-play-audio`）+ 操作ログ | [線引き](../../a11y-knowledge/references/criteria/1.4.2.ja.md) |
| 1.4.3 | 自動 | axe color-contrast | AA未満でFail |
| 1.4.4 | 自動+手動 | `zoom-200-check` **[CLI]** + スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.4.ja.md) |
| 1.4.5 | 手動+コンテンツ | スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.5.ja.md) |
| 1.4.10 | 自動+手動 | `reflow-check` **[CLI]** + スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.10.ja.md) |
| 1.4.11 | 自動の候補+手動 | `non-text-contrast-check` **[CLI]** + スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.11.ja.md)。必要な表示・隣接色・例外を確認して判定 |
| 1.4.12 | 自動+手動 | `text-spacing-check` **[CLI]** + スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.12.ja.md) |
| 1.4.13 | インタラクティブ+自動の候補 | `content-on-hover-check` **[CLI]** + 動画/ログ | 解除/保持不可でFail |

## 2. 操作可能
| 基準 | テスト方法 | 証跡 | 判定ルール |
|---|---|---|---|
| 2.1.1 | 自動+インタラクティブ | `keyboard-reachability-check` **[CLI]** + 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.1.1.ja.md) |
| 2.1.2 | 自動+インタラクティブ | `keyboard-trap-check` **[CLI]** + 操作ログ | トラップでFail |
| 2.1.4 | インタラクティブ+自動の候補 | `character-key-shortcut-check` **[CLI]** + 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.1.4.ja.md) |
| 2.2.1 | 自動+手動 | `time-limit-detector` **[CLI]** + 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.2.1.ja.md) |
| 2.2.2 | 自動+インタラクティブ | `auto-play-detection` **[CLI]** + 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.2.2.ja.md) |
| 2.3.1 | 手動 | 動画 | 点滅閾値超でFail |
| 2.4.1 | 自動 | a11y tree | [線引き](../../a11y-knowledge/references/criteria/2.4.1.ja.md) |
| 2.4.2 | 自動 | `document.title` | [線引き](../../a11y-knowledge/references/criteria/2.4.2.ja.md) |
| 2.4.3 | インタラクティブ+自動の候補 | `focus-order-check` **[CLI]** + フォーカス順ログ | [線引き](../../a11y-knowledge/references/criteria/2.4.3.ja.md) |
| 2.4.4 | 自動+コンテンツ | a11y tree + 文面抜粋 | [線引き](../../a11y-knowledge/references/criteria/2.4.4.ja.md) |
| 2.4.5 | 自動+コンテンツ | リンクグラフ + 検索/サイトマップ検出 | 複数手段なしでFail |
| 2.4.6 | 自動+コンテンツ | a11y tree/文面 | 見出し/ラベルが不明瞭でFail |
| 2.4.7 | インタラクティブ | スクショ | [線引き](../../a11y-knowledge/references/criteria/2.4.7.ja.md) |
| 2.4.11 | 自動+インタラクティブ | `focus-indicator-check` **[CLI]** + スクショ | [線引き](../../a11y-knowledge/references/criteria/2.4.11.ja.md) |
| 2.4.12 (AAA) | 自動+インタラクティブ | `focus-indicator-check` **[CLI]** + スクショ | [線引き](../../a11y-knowledge/references/criteria/2.4.12.ja.md) |
| 2.4.13 (AAA) | 実測 + 手動 | 同じ位置の前後の色・有効面積 | [線引き](../../a11y-knowledge/references/criteria/2.4.13.ja.md) |
| 2.5.1 | インタラクティブ+自動の候補 | `pointer-gesture-check` **[CLI]** + 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.5.1.ja.md) |
| 2.5.2 | インタラクティブ+自動の候補 | `pointer-cancellation-check` **[CLI]** + 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.5.2.ja.md) |
| 2.5.3 | 自動+手動 | a11y name比較（axe `label-content-name-mismatch` は実験的ルールのため既定では未実行） | ラベル文字列不一致でFail |
| 2.5.4 | インタラクティブ+自動の候補 | `motion-actuation-check` **[CLI]** + 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.5.4.ja.md) |
| 2.5.7 | インタラクティブ+自動の候補 | `pointer-gesture-check` **[CLI]** + 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.5.7.ja.md) |
| 2.5.8 | 自動 | `target-size-check` **[CLI]** | [線引き](../../a11y-knowledge/references/criteria/2.5.8.ja.md) |

## 3. 理解可能
| 基準 | テスト方法 | 証跡 | 判定ルール |
|---|---|---|---|
| 3.1.1 | 自動 | DOM属性 | [線引き](../../a11y-knowledge/references/criteria/3.1.1.ja.md) |
| 3.1.2 | 自動+コンテンツ | axe valid-lang + テキスト分析 | 部分言語未指定でFail |
| 3.2.1 | 自動+インタラクティブ | `focus-indicator-check` **[CLI]** + DOM差分 | [線引き](../../a11y-knowledge/references/criteria/3.2.1.ja.md) |
| 3.2.2 | インタラクティブ+自動の候補 | `change-on-input-check` **[CLI]** + DOM差分 | 入力のみで送信/遷移（事前の説明なし）でFail |
| 3.2.3 | 自動 | 全ページa11y tree比較 | [線引き](../../a11y-knowledge/references/criteria/3.2.3.ja.md) |
| 3.2.4 | 自動 | 全ページa11y tree比較 | [線引き](../../a11y-knowledge/references/criteria/3.2.4.ja.md) |
| 3.2.6 | 自動 | 全ページa11y tree比較 | [線引き](../../a11y-knowledge/references/criteria/3.2.6.ja.md) |
| 3.3.1 | インタラクティブ | スクショ | [線引き](../../a11y-knowledge/references/criteria/3.3.1.ja.md) |
| 3.3.2 | 自動+コンテンツ | a11y tree/文面 | [線引き](../../a11y-knowledge/references/criteria/3.3.2.ja.md) |
| 3.3.3 | インタラクティブ | スクショ | [線引き](../../a11y-knowledge/references/criteria/3.3.3.ja.md) |
| 3.3.4 | インタラクティブ | 操作ログ | [線引き](../../a11y-knowledge/references/criteria/3.3.4.ja.md) |
| 3.3.7 | 手動+自動の候補 | `redundant-entry-check` **[CLI]** + 操作ログ | 同一情報の再入力を要求でFail |
| 3.3.8 | インタラクティブ+自動の候補 | `accessible-authentication-check` **[CLI]** + 画面キャプチャ | 貼り付けの禁止は別の手段が無ければFail、CAPTCHA・別の手段は要確認 |

## 4. 堅牢
| 基準 | テスト方法 | 証跡 | 判定ルール |
|---|---|---|---|
| 4.1.1 | — | — | WCAG 2.2 で廃止。判定対象・サマリーの件数に含めない（WCAG 2.0 / 2.1 の監査では、HTML・XML は常に満たすものとして扱う） |
| 4.1.2 | 自動 | a11y tree | [線引き](../../a11y-knowledge/references/criteria/4.1.2.ja.md) |
| 4.1.3 | 自動+インタラクティブ | a11y tree/ログ | 状態メッセージが露出しない場合Fail |

## 利用可能なCLIチェック

以下の基準は `a11y-audit` CLI で自動チェック可能です（使用方法は SKILL.ja.md を参照）:

| 基準 | チェック名 | 出力 |
|---|---|---|
| 複数 | `axe-audit` | `axe-result.json` |
| 1.3.4 | `orientation-check` | `orientation-result.json` |
| 1.3.5 | `autocomplete-audit` | `autocomplete-result.json` |
| 1.4.2, 2.2.2 | `auto-play-detection` | `auto-play-screenshots/` |
| 1.4.4 | `zoom-200-check` | `zoom-200-result.json` |
| 1.4.10 | `reflow-check` | `reflow-result.json` |
| 1.4.11 | `non-text-contrast-check` | `non-text-contrast-result.json` |
| 1.4.12 | `text-spacing-check` | `text-spacing-result.json` |
| 1.4.13 | `content-on-hover-check` | `content-on-hover-result.json` |
| 2.1.1 | `keyboard-reachability-check` | `keyboard-reachability-result.json` |
| 2.1.2 | `keyboard-trap-check` | `keyboard-trap-result.json` |
| 2.1.4 | `character-key-shortcut-check` | `character-key-shortcut-result.json` |
| 2.2.1 | `time-limit-detector` | `time-limit-result.json` |
| 2.4.3 | `focus-order-check` | `focus-order-result.json` |
| 2.4.7, 2.4.11, 2.4.12 (AAA), 3.2.1 | `focus-indicator-check` | `focus-indicator-result.json`, `focus-indicators.png` |
| 2.5.4 | `motion-actuation-check` | `motion-actuation-result.json` |
| 2.5.1, 2.5.7 | `pointer-gesture-check` | `pointer-gesture-result.json` |
| 2.5.2 | `pointer-cancellation-check` | `pointer-cancellation-result.json` |
| 3.2.2 | `change-on-input-check` | `change-on-input-result.json` |
| 2.5.5, 2.5.8 | `target-size-check` | `target-size-result.json`, `target-size-screenshot.png` |
| 3.3.7 | `redundant-entry-check` | `redundant-entry-result.json` |
| 3.3.8 | `accessible-authentication-check` | `accessible-authentication-result.json` |
