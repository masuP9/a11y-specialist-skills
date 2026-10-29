# Plan 038: スキルの手順と権限を今のツールに合わせる（CLI を主に、allowed-tools、planning-wcag-audit のスクリプト）

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/141

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。`plans/README.md` は更新しない。
>
> **差分確認（最初に実行）**:
> `git diff --stat eee45fe..HEAD -- skills/auditing-wcag skills/reviewing-a11y skills/planning-wcag-audit`
> PR #139 と Plan 037 の分は差分として出てよい。それ以外の差分があれば、「現状」と実ファイルを
> 見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **優先度**: P2
- **工数**: M
- **リスク**: MEDIUM（`allowed-tools` は Claude Code での権限の確認に効く。コードの変更は無い）
- **依存**: Plan 037（`interactive-checks` と `page-review` に両方が触るので、037 の後に行う）
- **カテゴリ**: skills
- **計画時点**: commit `eee45fe`, 2026-10-29

## なぜ重要か

手順と権限が、`@a11y-skills/audit` CLI が育つ前のままになっている。

- CLI は今いちばん厳密な情報源（実測と、確定と要確認の仕分け）なのに、auditing-wcag では後回しの扱いで、reviewing-a11y にはまったく出てこない。
- auditing-wcag は `npx` を実行させ、レポートを保存させるのに、`allowed-tools` に Bash も Write も無い。毎回確認が出るか、モデルが CLI を避ける。
- planning-wcag-audit のシェル例は macOS では動かない。

## 現状

### auditing-wcag/SKILL.ja.md

- `:41-46`（3. 自動チェック）: 「Playwright でページに遷移し、アクセシビリティツリーを取得する」→「ブラウザ操作が使えない場合は `a11y-audit` CLI」→「CLI も使えなければ Web 取得」の順
- `:5` `allowed-tools: Read Grep Glob WebFetch Task mcp__playwright__browser_snapshot mcp__playwright__browser_navigate mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_press_key`

### reviewing-a11y

- `SKILL.ja.md:5` `allowed-tools: Read Grep Glob WebFetch Task mcp__playwright__browser_snapshot mcp__playwright__browser_navigate mcp__playwright__browser_click`
- `references/page-review.ja.md:11-25`: ツールの選択は「ブラウザ操作 > Web 取得 > ユーザー提供」の 3 段。CLI への言及は無い

### Playwright MCP のツール名

- プラグイン版で入れると `mcp__plugin_playwright_playwright__browser_*` になる（このリポジトリの作者の環境で確認）。`mcp__playwright__browser_*` は、MCP サーバーを `playwright` という名前で直接登録したときの名前
- 対話チェックで使うのに `allowed-tools` に無いもの: `browser_hover`、`browser_evaluate`、`browser_take_screenshot`、`browser_wait_for`、`browser_resize`

### auditing-wcag/references/interactive-checks.ja.md

- 383 行。CLI のチェックごとに 1 節ずつ（`:19`〜`:325`）あり、パッケージ README の内部の説明（target-size の幾何判定・切り取りの扱い `:154-208` など）を書き写している
- 結果の読み方は a11y-knowledge の `references/checks-audit.ja.md` にある（チェックごとに「確定すること」と「要確認として残ること」）

### planning-wcag-audit/references/page-selection-guide.ja.md

- `:46` `grep -oP`（BSD grep に無い）、`:168` と `:190` `shuf`（macOS の標準に無い）、`:168` `openssl enc` をシードにする技
- `planning-wcag-audit/SKILL.ja.md:5` `allowed-tools: Read Grep Glob AskUserQuestion Write`（Bash・WebFetch が無いので、ガイドのコマンドを走らせられない）

### 検証器

- `scripts/validate-skills.mjs:106` は `allowed-tools` が日英で一致することだけを見る

## 方針

- **CLI を主に、ブラウザ操作は確認用に。** シェルが使えるなら最初に CLI を流す。Playwright MCP は、CLI の `incomplete` の候補を確かめる・CLI が見ない操作（エラー表示、複数手順のフォームなど）をするのに使う。
- **allowed-tools は「使わせるもの」をすべて書く。** Playwright MCP は両方の名前を並べる。Bash は CLI の実行に絞った形にする（Claude Code の `Bash(npx -y @a11y-skills/audit:*)` パターン）。
- **手順の本文はツール名でなく能力で書く**（AGENTS.md）。ツール名は frontmatter にだけ書く。

## 範囲

- **触る**: `skills/auditing-wcag/**`、`skills/reviewing-a11y/SKILL*.md`・`references/page-review*.md`、`skills/planning-wcag-audit/**`
- **触らない**: `packages/**`、`skills/a11y-knowledge/**`（checks-audit に足りないことがあれば PR 本文に書く）、`agents/openai.yaml`（必要が出たら STOP）

## 使うコマンド

- 検証: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
- 整形: `npx prettier --write <path>`

## 手順

日本語版を先に直し、英語版に同じ変更を入れる。frontmatter は日英で同じにする。

1. **auditing-wcag の自動チェックの順番を入れ替える**（`SKILL.ja.md` 3. 自動チェック）
   1. シェルが使えるなら `npx -y @a11y-skills/audit --url <url> --checks all --output-dir <dir>` を流す（`page-snapshot` を含む）
   2. 結果は a11y-knowledge の checks-axe / checks-audit で確定と要確認に仕分ける（今の記述を活かす）
   3. ブラウザ操作は、要確認の候補を確かめるのと、4. インタラクティブチェックに使う
   4. シェルが使えないときは、ブラウザ操作で 1 の代わりをし、カバーできなかったチェックを制限事項に書く
   5. どちらも無いときは Web 取得（今と同じ）
2. **reviewing-a11y の page-review に CLI を足す**: 「ツール選択」の表の先頭に「シェル（`@a11y-skills/audit` CLI）」を足す。レビューでは `--checks axe-audit,page-snapshot` を既定にし、ページの性質に応じて足す（フォームがあれば autocomplete-audit など）と書く。結果の読み方は checks-audit を参照させる。
3. **`allowed-tools` を更新する**（日英とも同じ値）
   - auditing-wcag: `Read Grep Glob Write WebFetch Agent Bash(npx -y @a11y-skills/audit:*) Bash(npx playwright install:*)` と、Playwright MCP の `browser_snapshot` `browser_navigate` `browser_click` `browser_type` `browser_press_key` `browser_hover` `browser_evaluate` `browser_take_screenshot` `browser_wait_for` `browser_resize` を `mcp__playwright__` と `mcp__plugin_playwright_playwright__` の両方の接頭辞で
   - reviewing-a11y: `Read Grep Glob WebFetch Agent Bash(npx -y @a11y-skills/audit:*)` と、Playwright MCP の `browser_snapshot` `browser_navigate` `browser_click` `browser_press_key` `browser_take_screenshot` を両方の接頭辞で
   - `Task` は `Agent` に置き換える
4. **`interactive-checks` を絞る**: CLI のチェックごとの節から、内部の仕組みの説明（どう測るか・何を切り取るか）を削る。残すのは、(a) 実行コマンド、(b) 副作用（実際にキーを押す、送信が起きうる など。実行するかの判断に要る）、(c) 人が確かめること、の 3 つ。結果の読み方は checks-audit への参照にする。詳細はパッケージの README（`packages/a11y-audit/README.ja.md`）への参照にする。
5. **planning-wcag-audit のシェル例を削る**
   - `page-selection-guide` の Step 1・2・4・5 の bash / JavaScript のコード片を削り、要件だけを書く: URL 一覧の取得元を記録する、除外パターンと理由を記録する、乱数のシードと抽出方法を記録し、同じ手順で再現できるようにする、重複を除く。
   - 対象ページ一覧の出力形式（Step 6）に、auditing-wcag にそのまま渡せる URL 一覧（1 行 1 URL）を足す。`SKILL.ja.md` の最後に「計画ができたら auditing-wcag で監査する」の 1 行を足す。
   - `allowed-tools` に `WebFetch` を足す（sitemap.xml の取得）。Bash は足さない。
6. 検証コマンドを通す。
7. **実際に動かして確かめる**: Claude Code で、プラグインを読み込んだ状態で次を試し、PR 本文に結果を書く。
   - auditing-wcag に `packages/a11y-audit/test/fixtures/` のページ（ローカルサーバで配信）を渡し、最初に CLI が走ること、`npx` で権限の確認が出ないこと
   - reviewing-a11y に同じページを渡し、`axe-audit` の結果がレビューに使われること

## 完了条件

- `grep -rn "mcp__playwright__\|Task" skills/*/SKILL*.md` の結果が、両方の接頭辞のペアだけになっている（`Task` は 0 件）
- auditing-wcag の手順で、CLI がブラウザ操作より前にある
- `page-review.ja.md` に CLI が出てくる
- `interactive-checks.ja.md` が 200 行以下で、各 CLI チェックの節に「副作用」と「人が確かめること」が残っている
- `grep -n "grep -oP\|shuf\|openssl" skills/planning-wcag-audit -r` が 0 件
- 手順 7 の 2 つの確認ができている
- 検証コマンドがすべて通る

## STOP 条件

- `validate:skills` か Codex 側の読み込みが、`Bash(...)` 形式や `mcp__plugin_...` の名前を拒む → どの値が拒まれたかを書いて止まる
- 手順 7 で、`allowed-tools` に書いても `npx` に権限の確認が出る（パターンの書き方が合っていない）→ 試した書き方を記録して止まる
- `interactive-checks` から削ろうとしている「人が確かめること」が、checks-audit にも README にも無い → 削らずに残し、PR 本文に挙げる（止まらなくてよい）

## 保守メモ

- CLI にチェックを足したら、`interactive-checks` には実行コマンド・副作用・人が確かめることだけを足す。仕組みの説明はパッケージの README に書く。
- Playwright MCP の名前が変わったら、`allowed-tools` の両方の接頭辞を見直す。
