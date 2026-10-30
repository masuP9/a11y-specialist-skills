# Plan 037: reviewing-a11y / auditing-wcag の中身を今のモデル向けに絞り、a11y-knowledge との二重化を解く

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/140

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。`plans/README.md` は更新しない。
>
> **差分確認（最初に実行）**:
> `git diff --stat eee45fe..HEAD -- skills/reviewing-a11y skills/auditing-wcag skills/a11y-knowledge/references`
> PR #139（参照文書の WCAG の誤りの修正）の分は差分として出てよい。それ以外の差分があれば、
> 「現状」の抜粋と実ファイルを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **優先度**: P2
- **工数**: M
- **リスク**: MEDIUM（スキルの振る舞いが変わる。コードの変更は無い）
- **依存**: PR #139 のマージ（同じファイルに触る）
- **カテゴリ**: skills
- **計画時点**: commit `eee45fe`, 2026-10-29

## なぜ重要か

reviewing-a11y と auditing-wcag の参照文書は、a11y-knowledge ができる前に古いモデル向けに書いたもので、次の 3 つの問題を抱えている。

1. **判定ルールが 2 か所にある。** auditing-wcag は「`automated-checks` と重なる項目は知識ベースの規則を優先する」（`auditing-wcag/SKILL.ja.md:53`）という但し書きで回避しているだけで、実際に食い違っていた（1.4.1 チェックC。#139 で修正）。直しても、また別の箇所でずれる。
2. **キーワードで判定させている。** 単語リストは、今のモデルが文脈で判断するより粗く、誤検出のもとになる。
3. **AGENTS.md の「エージェントの事前知識を前提にする」に反する。** WCAG の書き写し、役割付け、「あなたは既に知っています」の繰り返し、ほぼ同じ例の重複がある。

## 現状

### auditing-wcag/references/automated-checks.ja.md（行番号は計画時点）

| 行 | 内容 | a11y-knowledge 側 |
|---|---|---|
| `:70-` | 1.4.1 チェックA: 色名の一覧（赤、青、緑、レッド、ブルー等）を探す | `criteria/1.4.1.ja.md` |
| `:108-` | 1.3.3: 位置・形・サイズ・音・視覚の語の表 | `criteria/1.3.3.ja.md` |
| `:138-` | 3.1.2: 文字体系の違い・よくある外国語フレーズの検出 | 無し |
| `:159-` | 2.4.4: 汎用語の一覧（「こちら」「詳細」…）と唯一の子かどうか | `criteria/2.4.4.ja.md` |
| `:172-` | ページ横断（2.4.5 / 3.2.3 / 3.2.4 / 3.2.6） | `cross-page.ja.md`、`criteria/3.2.3` `3.2.4` `3.2.6` |

`coverage-matrix` / `manual-checks` / `content-checks` にも、達成基準ごとの「Fail 条件」が 1 行ずつある。axe と CLI の結果の読み方は、a11y-knowledge の `checks-axe.ja.md` / `checks-audit.ja.md` にある。

### reviewing-a11y

- `SKILL.ja.md:118-151`: ワークフロー例 3 つ（どれも「特定 → 線引き → 読み込み → 実行 → 返却」で同じ）
- `SKILL.ja.md:153-169`: WCAG リンク集と「よく参照する達成基準」
- `references/code-review.ja.md:5,9,30,146`、`references/design-review.ja.md:5,9,29,160`: 「あなたは〜に特化したレビュアー」「あなたは既に…を知っています」
- `references/wcag-checklist.ja.md`: 冒頭で「人間のレビュアー向けの参考資料」と自称。チェックリストと達成基準の一覧は WCAG の書き写し。重大度の基準（`:73-100`）はここにしかない。参照元は `reviewing-a11y/README(.ja).md` だけ
- 重大度の基準が `code-review` / `design-review` / `page-review` / `wcag-checklist` の 4 か所で別々に書かれている
- `references/design-review.ja.md`: 「正確なコントラストを測定できない - 確認用にフラグ」（`:141` 付近）。Figma の判別は `figma.com/file/...`（`SKILL.ja.md:37`）だけ

## 方針

- 判定ルールは a11y-knowledge に一本化する。スキル側には、**手順**（何をどの順で見るか、何を材料にするか）と**出力**だけを残す。
- a11y-knowledge に無い達成基準（`criteria/` に無いもの）のルールは、今回は消さずに残す。知識ベースへの移し替えは範囲外。
- 重大度の基準は reviewing-a11y の SKILL に 1 か所だけ置き、各ガイドからはそこを参照する。

## 範囲

- **触る**: `skills/reviewing-a11y/**`、`skills/auditing-wcag/references/**`、`skills/auditing-wcag/SKILL(.ja).md`（参照の書き換えだけ）
- **触らない**: `skills/a11y-knowledge/**`（不足に気づいたら PR 本文に書く）、`packages/**`、`allowed-tools` と手順の順番（Plan 038 の範囲）

## 使うコマンド

- 検証: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
- 整形: `npx prettier --write <path>`

## 手順

すべて日本語版（`.ja.md`）を先に直し、英語版に同じ変更を入れる。

1. **キーワード判定を参照に置き換える**（`automated-checks`）
   - 1.4.1 チェックA、1.3.3、2.4.4 の語の一覧・表を削り、「何を材料にするか（ツリーのテキスト、スクリーンショット）」と「`../../a11y-knowledge/references/criteria/<番号>.ja.md` の線引きで判定する」の 2 行にする。
   - 3.1.2 は知識ベースに無いので、外国語フレーズの検出リストだけ削り、「主言語と異なる言語の箇所を文脈で見つけ、`lang` を確かめる。固有名詞や定着した借用語は対象外」に縮める。
2. **重なる判定ルールを参照に置き換える**（`automated-checks` / `coverage-matrix` / `manual-checks` / `content-checks`）
   - `criteria/` にファイルがある達成基準の「Fail 条件」「判定ルール」列は、`criteria/<番号>` の参照に置き換える。`coverage-matrix` は「テスト方法」と「証跡」の列を残す（どのチェックと材料を使うかの索引として使う）。
   - ページ横断の 2.4.5 / 3.2.x の手順は、`cross-page.ja.md` と重なる部分を削る。
   - `auditing-wcag/SKILL.ja.md:53` の「重なる項目は知識ベースの規則を優先する」は、重なりが無くなるので削る。
3. **重大度の基準を 1 か所にまとめる**
   - `reviewing-a11y/SKILL.ja.md` に「重大度」の節を作る。中身は `wcag-checklist.ja.md:73-100` の表（#139 適用後のもの）を基に、Critical / Major / Minor の定義とパターン例を 1 つの表にする。
   - `code-review` / `design-review` / `page-review` の「各問題の重要度を判定」は、SKILL の節への参照に置き換える。
4. **`wcag-checklist` を削除する**（日英）。`reviewing-a11y/README(.ja).md` の参照を消す。
5. **前置きを削る**
   - 3 つのガイドの役割付けの一文と「あなたは既に…を知っています」を削る。
   - `SKILL.ja.md` のワークフロー例は 1 つにまとめるか削る。各ガイド末尾の「ワークフロー例」も、手順の繰り返しなら削る。
   - `SKILL.ja.md` の WCAG リンク集と「よく参照する達成基準」を削る。
6. **design-review を今の能力に合わせる**
   - 色の値（16 進など）が分かるときは、コントラスト比を計算して報告する。値が分からない（画像からの推定など）ときだけ「要確認」にする。
   - Figma の判別を `figma.com/design/`・`/file/`・`/proto/`・`/board/` に広げる。Figma を読むツール（MCP など）があれば、塗り・変数・寸法をそこから取る、と書く（ツール名は書かず、能力で書く）。
7. 検証コマンドを通す。

## 完了条件

- `grep -rn "あなたは既に\|に特化した" skills/reviewing-a11y` が 0 件
- `grep -rn "wcag-checklist" skills` が 0 件で、`skills/reviewing-a11y/references/wcag-checklist*.md` が存在しない
- `automated-checks.ja.md` に、色名・感覚の語・汎用リンク語の一覧が無い
- 重大度の定義が `reviewing-a11y/SKILL.ja.md` の 1 か所だけにある（`grep -rn "Critical（致命的）" skills/reviewing-a11y` が SKILL の 1 ファイルだけ）
- 日英の見出し構成が一致している
- 検証コマンドがすべて通る

## STOP 条件

- `criteria/<番号>` の線引きが、スキル側から消そうとしているルールより狭く、消すと判定できなくなるケースが出る（知識ベース側の追記が要る）→ 該当の達成基準を挙げて止まる
- `validate:skills` が、参照先の削除やリンク切れで落ち、その原因が範囲外のファイルにある
- PR #139 が未マージ、または差し戻されている

## 保守メモ

- 今後、判定ルールを足すときは a11y-knowledge の `criteria/` に書き、スキル側には書かない。
- `coverage-matrix` は「達成基準 → 使うチェックと材料」の索引として残る。CLI にチェックを足したら、ここと a11y-knowledge の `checks-audit` を更新する。
