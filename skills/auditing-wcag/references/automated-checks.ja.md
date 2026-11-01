[English](./automated-checks.md)

# 自動チェック

ページを開いた状態の情報（アクセシビリティツリー・DOM・スクリーンショット・axe の結果）から集める材料と、その判定の拠りどころをまとめる。判定は「Pass/Fail/NT/NA」を明示し、証跡（ツリーの断片・DOM 断片・セレクタ）を残す。

> **CLIチェック:** まず `axe-audit` と `page-snapshot` を流して材料を集める。
> 実行: `npx -y @a11y-skills/audit --url "<url>" --checks axe-audit,page-snapshot`

## 判定の拠りどころ

- 「判定」列が **線引き** のものは、a11y-knowledge の `criteria/<番号>.ja.md` の「線引き」と「確かめるとき」で判定する。この文書には判定ルールを書かない。
- axe と CLI の結果を確定・要確認に仕分ける規則は、a11y-knowledge の [checks-axe.ja.md](../../a11y-knowledge/references/checks-axe.ja.md) と [checks-audit.ja.md](../../a11y-knowledge/references/checks-audit.ja.md)。
- 知識ベースにファイルが無い達成基準だけ、この文書の「判定」列に従う。

## 共通方針

- 取得元: `locator.ariaSnapshot()`（例: `page.locator('body').ariaSnapshot()`、`page-snapshot` の `details.snapshot`）/ DOM属性 / スクリーンショット
- 証跡: 要素のロール、名前、関連属性、CSSセレクタ

## 達成基準ごとの材料

| 基準 | 材料 | 判定 |
|---|---|---|
| 1.1.1 | ツリーの画像の名前、axe `image-alt` ほか | [線引き](../../a11y-knowledge/references/criteria/1.1.1.ja.md) |
| 1.2.1 / 1.2.3 / 1.2.5 | `<video>` / `<audio>` / 埋め込みプレーヤー、`<track kind="descriptions">`、近くの代替へのリンク | 下の「時間依存メディア」 |
| 1.2.2 | `<track kind="captions">`、axe `video-caption` | [線引き](../../a11y-knowledge/references/criteria/1.2.2.ja.md) |
| 1.3.1 | 画面・音の提示とDOM・ツリーの関係を照合 | [線引き](../../a11y-knowledge/references/criteria/1.3.1.ja.md) |
| 1.3.2 | ツリーの順序と見た目の順序 | 順序を入れ替えると意味が変わる箇所で、ツリーの順序が見た目の意味と食い違えば Fail |
| 1.3.3 | 指示の文章、対象のラベル・機能・記号の代替、読む順。「以下」も曖昧でないか確認 | [線引き](../../a11y-knowledge/references/criteria/1.3.3.ja.md) |
| 1.3.5 | `autocomplete-audit` **[CLI]** と本人情報・実際の目的・例外 | [線引き](../../a11y-knowledge/references/criteria/1.3.5.ja.md) |
| 1.4.1 | スクリーンショット、ツリーのテキスト、axe `link-in-text-block` | [線引き](../../a11y-knowledge/references/criteria/1.4.1.ja.md)。明るさの境界は測定し、同じ情報の可視の手がかり・訪問済みリンクの扱いを確認 |
| 1.4.3 | axe `color-contrast` | 4.5:1 未満（大きな文字は 3:1 未満）で Fail。axe が計算できなかった箇所（画像・グラデーションの背景）は実測するまで NT |
| 1.4.11 | `non-text-contrast-check` **[CLI]**（部品の境界・アイコンだけのボタン） | [線引き](../../a11y-knowledge/references/criteria/1.4.11.ja.md)。必要な表示・隣接色・例外を確認して判定 |
| 2.4.1 | 反復ブロックと迂回先の構造。リンクに依存する場合は起動後の到達も確認 | [線引き](../../a11y-knowledge/references/criteria/2.4.1.ja.md) |
| 2.4.2 | 現在の `document.title` と主題・目的、axe `document-title`（空でないこと） | [線引き](../../a11y-knowledge/references/criteria/2.4.2.ja.md) |
| 2.4.4 | リンク名とDOM上の文・段落・リスト項目・表見出し・ARIA参照。直前見出しは著者方針 | [線引き](../../a11y-knowledge/references/criteria/2.4.4.ja.md) |
| 2.4.6 | 見出しとラベルのテキスト | 見出し・ラベルが主題や目的を表していなければ Fail（有無は問わない。無いことは 1.3.1 / 3.3.2） |
| 2.5.3 | 見えているラベルの文字列とアクセシブルネーム | ラベルの文字列が名前に含まれなければ Fail（axe `label-content-name-mismatch` は実験的ルールのため既定では未実行） |
| 3.1.1 | lang / xml:lang、axeと代表的な本文の言語 | [線引き](../../a11y-knowledge/references/criteria/3.1.1.ja.md) |
| 3.1.2 | ページの主言語と異なる言語で書かれた箇所、axe `valid-lang` | 下の「部分の言語」 |
| 3.3.2 | 見えるラベル・説明と入力条件（名前チェックだけでは確定しない） | [線引き](../../a11y-knowledge/references/criteria/3.3.2.ja.md) |
| 4.1.2 | 操作できる要素の役割・名前・状態 | [線引き](../../a11y-knowledge/references/criteria/4.1.2.ja.md) |
| 4.1.3 | 状態の変化を伝えるメッセージと、そのロール（`status` / `alert` / `log` など） | 利用者の操作の結果や処理の状態を伝えるメッセージが、フォーカスを動かさずに支援技術に伝わらなければ Fail |

## 時間依存メディア（1.2.1 / 1.2.3 / 1.2.5）

- `<video>`・`<audio>`・埋め込みプレーヤー（`<iframe>` の YouTube / Vimeo など）を探し、近くに文字起こしなどの代替があるかを文脈で確かめる（リンク、`aria-describedby`、すぐ後の本文）。
- 1.2.3: 音声解説（`<track kind="descriptions">` や音声解説版）か、メディアの代替テキストがあれば Pass。
- 1.2.5: 音声解説が無ければ Fail。映像の情報がすべて音声で語られていれば不要。
- 埋め込みプレーヤーは独自の字幕・音声解説を持つことがあるので、見つからなければ NT にして手動確認に回す。
- 代替の中身が映像・音声と合っているかは、自動では決まらない。

## 部分の言語（3.1.2）

- ページの主言語と異なる言語の文や語句を文脈で見つけ、その要素か祖先に正しい `lang` があるかを確かめる。
- 固有名詞、技術用語、主言語に定着した借用語は対象外。
- 異なる言語の箇所に `lang` が無ければ Fail。

## ページ横断チェック

全監査対象ページの材料（`page-snapshot`）を集めてから判定する。3.2.3 / 3.2.4 / 3.2.6 は、先に [cross-page.ja.md](../../a11y-knowledge/references/cross-page.ja.md) を読み、各達成基準の線引きで判定する。`page-snapshot`自体は合否を出さない。3.2.3の視覚的順序、3.2.4の可視ラベル・アイコン・同一ページ内の反復、3.2.6の開閉後の経路は必要な材料を追加する。

| 基準 | 材料 | 判定 |
|---|---|---|
| 2.4.5 | 検索フォーム、サイトマップへのリンク、ページ間のリンク | 下の「2.4.5」 |
| 3.2.3 | 各ページの `banner` / `navigation` / `contentinfo` の中身 | [線引き](../../a11y-knowledge/references/criteria/3.2.3.ja.md) |
| 3.2.4 | 同じ反復機能の役割・名前・可視ラベル・アイコン | [線引き](../../a11y-knowledge/references/criteria/3.2.4.ja.md) |
| 3.2.6 | ヘルプの手段と経路、共通内容との直列順、同じ表示条件 | [線引き](../../a11y-knowledge/references/criteria/3.2.6.ja.md) |

### 2.4.5

- 検索、サイトマップ、ページ間の相互リンク、目次などのうち 2 つ以上でページにたどり着ければ Pass。
- 手順の途中のページ（購入手続きの 2 ページ目など）は対象外。
- 1 つの経路でしかたどり着けないページがあれば Fail。サイトマップのページは監査対象に含めることを推奨する。
