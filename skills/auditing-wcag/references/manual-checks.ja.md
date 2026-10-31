[English](./manual-checks.md)

# 手動チェック

人間の判断が必要な項目。視覚評価や文脈理解を含むため、証跡はスクリーンショット/動画/注記を必ず残す。「Fail条件」列が **線引き** のものは、a11y-knowledge の `criteria/<番号>.ja.md` で判定する。

## 色・コントラスト

> **Note:** 1.4.1（色の使用）、1.4.3（テキストコントラスト）、1.4.11（非テキストコントラスト）の材料は [automated-checks.ja.md](./automated-checks.ja.md) にあります。1.4.1 はスクリーンショットを見て判定するので、グラフや図表も含めて目視で確かめます。

## テキスト/レイアウト
| 基準 | 確認内容 | 証跡 | Fail条件 |
|---|---|---|---|
| 1.4.4 | 200%までの拡大で情報・機能の損失なし | スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.4.ja.md) |
| 1.4.5 | 画像内文字の回避 | スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.5.ja.md) |
| 1.4.10 | 例外でない各領域を一方向で読め、情報・機能が利用可能 | スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.10.ja.md) |
| 1.4.12 | 適切な間隔変更後も内容・機能が利用可能 | スクショ | [線引き](../../a11y-knowledge/references/criteria/1.4.12.ja.md) |

> **CLIチェック:**
> - `zoom-200-check` - CSS zoom 200%でクリッピング等の候補を検出（実ブラウザのズームとは区別）（1.4.4）
> - `reflow-check` - 320pxビューポートでの水平スクロールを検出（1.4.10）
> - `text-spacing-check` - 間隔上書き後のクリッピングを検出。上書き条件・全文表示を確認して判定（1.4.12）
>
> 実行: `npx -y @a11y-skills/audit --url "<url>" --checks zoom-200-check,reflow-check,text-spacing-check`

## タイミング
| 基準 | 確認内容 | 証跡 | Fail条件 |
|---|---|---|---|
| 2.2.1 | 時間制限の延長/解除 | 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.2.1.ja.md) |
| 2.2.2 | 自動更新/アニメの停止 | 操作ログ | [線引き](../../a11y-knowledge/references/criteria/2.2.2.ja.md) |

> **CLIチェック:**
> - `time-limit-detector` - meta refresh、setTimeout/setInterval、カウントダウン表示を検出（2.2.1）
> - `auto-play-detection` - スクリーンショット比較による自動再生コンテンツの検出（2.2.2）。詳細は [interactive-checks.ja.md](./interactive-checks.ja.md#自動再生検出) を参照。
>
> 実行: `npx -y @a11y-skills/audit --url "<url>" --checks time-limit-detector,auto-play-detection`

## フラッシュ
| 基準 | 確認内容 | 証跡 | Fail条件 |
|---|---|---|---|
| 2.3.1 | 3回/秒超の点滅なし | 動画 | 閾値超の点滅 |

## 画面方向
| 基準 | 確認内容 | 証跡 | Fail条件 |
|---|---|---|---|
| 1.3.4 | 縦横どちらでも利用可能 | スクショ | [線引き](../../a11y-knowledge/references/criteria/1.3.4.ja.md) |

> **CLIチェック:** `orientation-check` - 画面の向き制限メッセージと縦横でのコンテンツ表示差異を検出。
>
> 実行: `npx -y @a11y-skills/audit --url "<url>" --checks orientation-check`

## 冗長入力
| 基準 | 確認内容 | 証跡 | Fail条件 |
|---|---|---|---|
| 3.3.7 | 既出情報の再入力を要求しない | 操作ログ | 同一情報の再入力を要求 |

> **CLIチェック:** `redundant-entry-check` - 同じ form の中で同じ情報（`autocomplete` の目的、または名前・ラベルから推定した目的）を求める欄の重なりと、「同じ」のような自動で写す手段・選ぶ手段がありそうな部品を候補（incomplete）として報告。拾うのは**1ページの中の重なりだけ**。手順が複数ページに分かれるフォームは範囲外なので、手動で確認する。実際に値が写るかは確かめない。
>
> 実行: `npx -y @a11y-skills/audit --url "<url>" --checks redundant-entry-check`
