[English](./README.md)

# a11y-knowledge

WCAG 2.2 の達成基準ごとに「判断の根拠になること」をまとめた知識ベース。実装する・レビューする・自動チェックの結果を精査する、の 3 つの場面で同じ知識を引けるようにする。

## 何が書いてあるか

達成基準ごとに 1 ファイル（`references/criteria/<番号>.ja.md`）。中は 4 段。

1. **根拠**: 解説書（Understanding）のどこを押さえるべきか。リンクと要点。
2. **線引き**: この基準をどう読むか。適用しないもの、例外、よくある誤判定。解説書に基づくもの（[解説書]）と運用上の解釈（[独自]）を分ける。
3. **作るとき**: 線引きを満たす作り方と避ける作り方。
4. **確かめるとき**: 自動チェック（axe、`@a11y-skills/audit`）が決めること、残ること、言い切ってはいけないこと。

達成基準の定義、ARIA の仕様、HTML の基本は書かない（エージェントは知っている前提。`AGENTS.md` の「Assume the Agent's Prior Knowledge」）。

## 索引と共通ページ

| ファイル                                                                 | 用途                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [references/index-by-criterion.ja.md](./references/index-by-criterion.ja.md) | 達成基準の番号から引く。各基準の性質（要る材料）も書いてある       |
| [references/index-by-component.ja.md](./references/index-by-component.ja.md) | 部品の種類（button、link、image など）から、問われる達成基準を引く |
| [references/checks-axe.ja.md](./references/checks-axe.ja.md)                 | axe の結果のうち、適合に数えてよいもの・要確認にとどめるもの       |
| [references/checks-audit.ja.md](./references/checks-audit.ja.md)             | `@a11y-skills/audit` の各チェックが決めること・残ること           |
| [references/cross-page.ja.md](./references/cross-page.ja.md)                 | 複数ページを見比べる達成基準の共通の判定のきまり                   |

## 他のスキルとの関係

| スキル                     | この知識ベースの使い方                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| reviewing-a11y             | 差分や画面に出てくる部品から `index-by-component` で達成基準を引き、「線引き」「作るとき」を読む |
| auditing-wcag              | 自動チェックの結果を `checks-*` で仕分けし、要確認の達成基準の「線引き」「確かめるとき」を読む   |
| （実装のスキル。今後追加）  | 書こうとしている部品から `index-by-component` で引き、「作るとき」を読む                       |

## 出どころ

線引きと「確かめるとき」の多くは、[a11y-guild](https://github.com/masuP9/a11y-guild)（AI によるアクセシビリティテストの管理ツール）で、答えつきの練習ページと実サイトに対して判定を測りながら決めたもの。測定の数字は載せず、誤判定の型だけを載せている。

## ファイル構造

```
skills/a11y-knowledge/
├── SKILL.md / SKILL.ja.md            # 引き方と使うときの決まり
├── README.md / README.ja.md          # このファイル
├── agents/openai.yaml                # Codex UI メタデータ
└── references/
    ├── index-by-criterion(.ja).md    # 達成基準からの索引
    ├── index-by-component(.ja).md    # 部品からの索引
    ├── checks-axe(.ja).md            # axe の結果の読み方
    ├── checks-audit(.ja).md          # @a11y-skills/audit の結果の読み方
    ├── cross-page(.ja).md            # 複数ページの見比べの共通ルール
    └── criteria/
        ├── 1.1.1(.ja).md
        ├── 1.2.2(.ja).md
        └── ...
```
