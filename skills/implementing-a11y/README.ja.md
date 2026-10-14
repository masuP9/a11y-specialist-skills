[English](./README.md)

# implementing-a11y

UI の部品やページを実装するときに、[a11y-knowledge](../a11y-knowledge/README.ja.md) の「線引き」と「作るとき」を引いてから書くための薄い入口。自前の参照資料は持たない。

## 何をするか

1. 書く部品を ARIA の役割で挙げる
2. `index-by-component` で問われる達成基準を引く（ページ全体・複数ページのものは `index-by-criterion` から）
3. 各達成基準の「線引き」と「作るとき」を読む
4. 標準の要素を優先し、自作の部品は APG のパターンで作る
5. 「確かめるとき」の「言い切ってはいけないこと」を「目視で確かめること」として残す

## 他のスキルとの関係

| スキル         | 使う場面                                             |
| -------------- | ---------------------------------------------------- |
| implementing-a11y | これから書く。書きながら線引きと作り方を引く        |
| reviewing-a11y | 書いたもの・既存のものを指摘してほしい               |
| auditing-wcag  | 達成基準ごとに Pass/Fail/NT/NA を付ける正式な監査    |
| a11y-knowledge | 上の 3 つが引く知識ベース。単体では使わない          |

プラグインとして入れれば `../a11y-knowledge/` が届く。スキルのディレクトリ単位のシンボリックリンクで入れるときは `a11y-knowledge` も一緒にリンクする。

## ファイル構造

```
skills/implementing-a11y/
├── SKILL.md / SKILL.ja.md     # 手順
├── README.md / README.ja.md   # このファイル
└── agents/openai.yaml         # Codex UI メタデータ
```
