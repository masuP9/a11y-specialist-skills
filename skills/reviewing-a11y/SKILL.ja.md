---
name: reviewing-a11y
description: Webページ、コード実装、デザインモックアップや仕様書のアクセシビリティをレビューし、重大度別の問題と修正案を報告する。準拠状況を全達成基準について判定する正式監査には auditing-wcag を使用する。
argument-hint: URL, file path, or Figma URL to review
allowed-tools: Read Grep Glob WebFetch Agent Bash(npx -y @a11y-skills/audit:*) Bash(npx playwright install:*) mcp__playwright__browser_snapshot mcp__plugin_playwright_playwright__browser_snapshot mcp__playwright__browser_navigate mcp__plugin_playwright_playwright__browser_navigate mcp__playwright__browser_click mcp__plugin_playwright_playwright__browser_click mcp__playwright__browser_press_key mcp__plugin_playwright_playwright__browser_press_key mcp__playwright__browser_take_screenshot mcp__plugin_playwright_playwright__browser_take_screenshot
---

[English](./SKILL.md)

# アクセシビリティレビュー

レビュー対象を特定し、対応する参照ガイドに従ってアクセシビリティの問題を見つけ、重大度別に報告する。

## ステップ1: レビュー対象の特定

| 対象 | 手がかり | ガイド |
|---|---|---|
| Webページ | `http://` / `https://` の URL、デプロイ済みのページ | `references/page-review.ja.md` |
| コード | ファイルパス・ディレクトリ（`.tsx`、`.vue`、`.html` など）、コンポーネント名 | `references/code-review.ja.md` |
| デザイン | Figma の URL（`figma.com/design/`・`/file/`・`/proto/`・`/board/`）、デザインの画像・PDF、仕様書 | `references/design-review.ja.md` |

決められないときは、URL・ファイルパス・デザインのどれをレビューするかを 1 行で尋ねる。

## ステップ2: 知識ベースで線引きを引く

対象を特定したら、コードやページを見る前に、[a11y-knowledge](../a11y-knowledge/SKILL.ja.md) で指摘の線引きをそろえます。

1. 対象に出てくる部品を ARIA の役割（button、dialog、combobox など）で挙げる。
2. [index-by-component.ja.md](../a11y-knowledge/references/index-by-component.ja.md) で、役割ごとに問われる達成基準を引く。レイアウトやページ全体を見るときは [index-by-criterion.ja.md](../a11y-knowledge/references/index-by-criterion.ja.md) の「ページ全体」「複数ページ」も引く。
3. 引いた達成基準ごとに `../a11y-knowledge/references/criteria/<番号>.ja.md` の「線引き」と「作るとき」を読んでから、指摘を書く。WCAGの適用対象外とする項目はWCAG違反として指摘しない。知識ベースがベストプラクティスとして扱うものは、達成基準を付けず改善候補として報告する。例: dialog自身の名前の欠落。
4. **[独自]** の線引き（運用上の解釈）に基づいて指摘するときは、指摘にその旨を書き添える（例:「[独自] の線引き。プロジェクトの判断で上書き可」）。**[解説書]** の線引きは書き添え不要。

知識ベースは `../a11y-knowledge/` の相対パスで引きます。プラグインとして入れていれば届きます。スキルのディレクトリ単位のシンボリックリンクで入れているときは `a11y-knowledge` も一緒にリンクしてください。届かないときはこのステップを飛ばし、レポートに「知識ベース未参照」と書きます。

## ステップ3: 参照ガイドの読み込みとレビュー

ステップ1の表のガイドを、ユーザーの言語に合わせて読み（日本語は `.ja.md`、英語は `.md`）、その手順をこのエージェントが実行する。対象の種類ごとに 1 つのガイドを使い、混ぜない。

サブエージェントは、ユーザーが並列レビュー・委譲・複数対象の分担を明示したときだけ使う。対象の種類ごとに 1 つのエージェントへ、該当ガイドと対象を渡し、すべての結果を待って重複を除き、1 つのレポートにまとめる。使えない環境では順番にレビューする。

## 重大度

すべてのガイドで、指摘の重大度はこの表で付ける。重大度は利用者への影響で決め、WCAG のレベル（A/AA）とは別に考える。

| 重大度 | 定義 | パターン例 |
|---|---|---|
| **Critical** | 操作や情報の取得が完全にできない | 情報を持つ画像に代替が無い、アイコンだけのボタンに名前が無い、入力欄にラベルが関連付いていない、クリックでしか動かない・フォーカスできない操作部品、キーボードトラップ、存在しない ID を指す `aria-labelledby`、重要な情報が `display:none` や `aria-hidden="true"` で隠れている、エラーを色だけで示す |
| **Major** | できるが大きな困難を招く | 見出し構造の欠如・破綻、ランドマークの欠如・重複、誤った role・不正な `aria-*` の値、見た目と大きく違うフォーカス順、「こちら」「詳細」だけのリンクやボタン、表の `th` / `scope` の欠如、ページの言語の欠如（3.1.1）、コントラスト不足 |
| **Minor** | できるが改善の余地がある | ネイティブ要素で書ける ARIA 部品（名前・役割・キーボード操作は揃っている）、ネイティブのセマンティクスと重なる冗長な ARIA、スキップリンクが無い（見出し・ランドマークでブロックを飛ばせる場合）、軽微な見出しレベルの不整合、WCAG の要件ではないベストプラクティス |

WCAG の要件ではない指摘には「ベストプラクティス」と明記し、達成基準を付けない。

## ステップ4: 結果の返却

1. ガイドの出力フォーマットで発見事項を提示する。確認できたことと、確認できなかったこと（手動確認に回すもの）を分ける。証拠が足りない項目を推測で断定しない。
2. 必要なら別の種類の対象のレビューを提案する（例:「次はコード実装をレビューしますか？」）。
