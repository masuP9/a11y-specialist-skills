---
name: auditing-wcag
description: WCAG 2.2 A/AAの正式な準拠監査を行い、全達成基準をPass/Fail/NT/NAで証跡付き判定する。問題発見と改善提案を中心とするレビューには reviewing-a11y を使用する。
argument-hint: URL or file path to audit
allowed-tools: Read Grep Glob Write WebFetch Agent Bash(npx -y @a11y-skills/audit:*) Bash(npx playwright install:*) mcp__playwright__browser_snapshot mcp__plugin_playwright_playwright__browser_snapshot mcp__playwright__browser_navigate mcp__plugin_playwright_playwright__browser_navigate mcp__playwright__browser_click mcp__plugin_playwright_playwright__browser_click mcp__playwright__browser_type mcp__plugin_playwright_playwright__browser_type mcp__playwright__browser_press_key mcp__plugin_playwright_playwright__browser_press_key mcp__playwright__browser_hover mcp__plugin_playwright_playwright__browser_hover mcp__playwright__browser_evaluate mcp__plugin_playwright_playwright__browser_evaluate mcp__playwright__browser_take_screenshot mcp__plugin_playwright_playwright__browser_take_screenshot mcp__playwright__browser_wait_for mcp__plugin_playwright_playwright__browser_wait_for mcp__playwright__browser_resize mcp__plugin_playwright_playwright__browser_resize
---

[English](./SKILL.md)

# WCAG準拠監査

あなたはWCAG 2.2 AA準拠監査の実行担当です。達成基準ごとにPass/Fail/NT/NAを判定し、証跡付きで報告します。

## 使い分け（reviewing-a11yとの違い）

| 観点 | reviewing-a11y | auditing-wcag |
| --- | --- | --- |
| 目的 | 問題発見・改善提案 | 準拠状況の体系的確認 |
| 出力 | 重大度別の問題リスト | 達成基準ごとのPass/Fail/NT/NA |
| スコープ | 実用的な問題に集中 | WCAG 2.2 A/AAを網羅 |

### ルーティング基準
- **auditing-wcag**: 「準拠確認」「監査」「コンプライアンス」「適合レポート」などの要件。
- **reviewing-a11y**: 「レビュー」「問題を見つけて」「改善案が欲しい」などの要件。
- 迷う場合は、目的（準拠確認か改善レビューか）を質問する。

## ワークフロー（6ステップ）

### 1. 入力受付
- URLまたはローカルファイルパスを受け取る。
- 複数ページの場合は対象一覧を確認する。
- ローカルファイルは利用可能なファイル読取手段で取得する（実行時挙動は評価できない）。

### 2. スコープ契約
以下を明示し、合意を得る。
- 対象レベル（A/AA、既定はWCAG 2.2 AA）
- 対象ページ範囲（全ページ/代表ページ/指定URL）
- 対象環境（本番／検証環境）と、キー入力・値の変更・送信が起きてよいか（ユーザーに確かめる。下記「自動チェック」の `--checks` の値が決まる）
- 制限事項（AT確認は範囲外、動的挙動はブラウザ操作に依存）
- 出力形式（達成基準ごとのPass/Fail/NT/NA）

### 3. 自動チェック
1. シェルが使えるなら、最初に `a11y-audit` CLI を流す（下記「自動チェックCLI」参照）。`--checks` の値は、スコープ契約で副作用を許せると確かめられた場合だけ `all`。確かめられない・許せない場合は、下記「ページを操作しないチェックの許可リスト」だけを並べる（`page-snapshot` を含む）。
2. 結果を下の知識ベースの規則で「確定 / 要確認」に仕分ける。
3. ブラウザ操作は、要確認の候補を確かめるのと、「4. インタラクティブチェック」に使う。
4. シェルが使えないときは、ブラウザ操作で 1 の代わりをする（ページに遷移し、アクセシビリティツリーを取得する）。カバーできなかったチェックは制限事項に書く。
5. どちらも使えないときは、利用可能なWeb取得手段でHTMLを取得し、判定可能な範囲のみ実施する。
- `references/automated-checks.ja.md`で、達成基準ごとの材料を集める。
- `references/coverage-matrix.ja.md`でカバレッジを確認する。

**ページを操作しないチェックの許可リスト:** 「副作用」は、送信・保存・認証要求などを起こしうる**入力の操作**（キー入力・クリック・ポインター操作・値の入力・貼り付け・合成イベントの送出）を指す。次のチェックはこれを行わないので、副作用を許せると確かめられなくても流してよい。
`--checks axe-audit,page-snapshot,reflow-check,text-spacing-check,zoom-200-check,orientation-check,autocomplete-audit,time-limit-detector,target-size-check,redundant-entry-check,pointer-gesture-check,non-text-contrast-check`

- 表示の変更（スクロール・ウィンドウの大きさの変更・CSS の差し込み）は行う。`target-size-check` はスクロール、`reflow-check` `zoom-200-check` `orientation-check` はウィンドウの大きさの変更、`text-spacing-check` は CSS の差し込み。`zoom-200-check` はウィンドウの大きさの変更に加えて、ページに CSS の `zoom: 200%` を当てる。`time-limit-detector` は、読み込み前に `setTimeout` / `setInterval` を差し替えて呼び出しを記録する（ページのタイマーは通常どおり動く）。スクロールやリサイズで処理が走るページでは、利用者の判断でこれらを外す。
- 許可リストに無いチェック（`focus-indicator-check` `keyboard-trap-check` `keyboard-reachability-check` `content-on-hover-check` `auto-play-detection` `motion-actuation-check` `change-on-input-check` `accessible-authentication-check` `focus-order-check` `pointer-cancellation-check` `character-key-shortcut-check`）は、副作用を許せると確かめられた場合だけ流す。流さなかったチェックの達成基準は、ブラウザ操作で人が確かめるか NT（未テスト）にし、制限事項に理由を書く。

**知識ベース（[a11y-knowledge](../a11y-knowledge/SKILL.ja.md)）で結果を仕分ける:**
- `@a11y-skills/audit` 0.14.0 以降の `page-snapshot` も走らせる（`--checks` を絞るときも含める）。判定はしないが、2.4.1 / 2.4.2 / 3.1.1 と複数ページの見比べの材料になる。
- 結果は [checks-axe.ja.md](../a11y-knowledge/references/checks-axe.ja.md) と [checks-audit.ja.md](../a11y-knowledge/references/checks-audit.ja.md) の規則で「確定 / 要確認」に仕分ける。axe の pass を適合（Pass）に数えてよい規則は、そこに列挙したものだけ。それ以外の pass は、その規則が見る範囲で問題が無かった以上の意味を持たない。
- 要確認になった達成基準は、`../a11y-knowledge/references/criteria/<番号>.ja.md` の「線引き」と「確かめるとき」を読んで判定する。「言い切らない」に当たるものは NT にとどめ、何を確かめれば決まるかを書く。
- 複数ページを監査するときは、先に [cross-page.ja.md](../a11y-knowledge/references/cross-page.ja.md) の共通の判定のきまりを読む。
- 判定ルールは知識ベースにあり、参照ガイドは材料と、知識ベースにファイルが無い達成基準の判定だけを持つ。知識ベースは `../a11y-knowledge/` の相対パスで引く（プラグインとして入れていれば届く。スキルのディレクトリ単位のシンボリックリンクで入れているときは `a11y-knowledge` も一緒にリンクする）。

### 4. インタラクティブチェック
- キーボード操作・フォーカス確認を実施する。
- `references/interactive-checks.ja.md`に従う。
- 実行不能・環境制約がある場合は該当項目をNTにする。

### 5. 手動確認項目提示
- `references/manual-checks.ja.md`と`references/content-checks.ja.md`の項目を提示する。
- 判定に必要な情報が得られない場合はNTとして明示する。
- ユーザーが提供した証拠があれば反映する。

### 6. レポート生成
- `references/output-format.ja.md`に従い、達成基準ごとの判定を列挙する。
- すべてのA/AA達成基準にステータスを付与する（Pass/Fail/NT/NA）。
- スコープ・制限事項・使用ツール・未確認項目をまとめる。

## 自動化の範囲と制限

- ブラウザ操作で取得できるのはアクセシビリティツリー（computed role/name/state）まで。
- 自動テストの結果だけでは監査結果は保証されない。
- スクリーンリーダーの実機確認、AT×ブラウザの組み合わせ検証は対象外。
- 判断できない項目は推測せずNTにする。

## 参照ガイド

- `references/automated-checks.ja.md`
- `references/interactive-checks.ja.md`
- `references/manual-checks.ja.md`
- `references/content-checks.ja.md`
- `references/output-format.ja.md`
- `references/coverage-matrix.ja.md`
- 知識ベース（`../a11y-knowledge/`）: `references/checks-axe.ja.md`、`references/checks-audit.ja.md`、`references/cross-page.ja.md`、`references/criteria/<番号>.ja.md`

## 自動チェックCLI

自動チェックは npm パッケージ [`@a11y-skills/audit`](https://www.npmjs.com/package/@a11y-skills/audit) に含まれる `a11y-audit` CLI で実行します（Node 18+ が必要。ピア依存関係は npm 7+ が自動取得）。

**セットアップ（初回のみ）:**
```bash
npx playwright install chromium
```

**全チェックを実行（副作用を許せると確かめられた場合のみ）:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks all --output-dir ./results
```

**特定のチェックのみ実行（例は許可リストの中だけ）:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks axe-audit,page-snapshot --output-dir ./results
```

**`--checks` を省くと `all` になり、副作用のあるチェックも走る。必ず `--checks <スコープ契約で決めた値>` を付ける。** `focus-indicator-check` など許可リスト外のチェックを足すのは、副作用を許せると確かめられた場合だけ。

`page-snapshot`（0.14.0 以降）は、`--checks` を絞るときも含める。2.4.1 / 2.4.2 / 3.1.1 と複数ページの見比べの材料になる。

**アノテーション付きスクリーンショット（focus-indicator。許可リスト外なので副作用を許せる場合のみ）:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks focus-indicator-check --screenshot --output-dir ./results
```

**結果JSONの出力先を指定（デフォルト: `./a11y-audit-results`）:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks axe-audit,page-snapshot --output-dir ./results
```

**終了コード:** `0` = violations なし / `1` = violations あり / `2` = 実行時エラー

| チェック名 | 達成基準 | 説明 |
|---|---|---|
| `axe-audit` | 複数 | axe-coreによる包括的チェック |
| `reflow-check` | 1.4.10 | 320pxでの水平スクロール検出 |
| `text-spacing-check` | 1.4.12 | テキストスペーシング変更後のクリッピング |
| `zoom-200-check` | 1.4.4 | 200%ズーム時のコンテンツ損失 |
| `orientation-check` | 1.3.4 | 画面の向き制限の検出 |
| `autocomplete-audit` | 1.3.5 | autocomplete属性の欠落・不正値 |
| `time-limit-detector` | 2.2.1 | タイマー・meta refresh検出 |
| `auto-play-detection` | 1.4.2, 2.2.2 | 自動再生コンテンツの検出（画面の変化と、`<audio>`・`<video>` の再生状態。実際に音が聞こえるかは手で確かめる） |
| `focus-indicator-check` | 2.4.7 | フォーカスインジケーターの視認性 |
| `target-size-check` | 2.5.5, 2.5.8 | ターゲットサイズの測定 |
| `keyboard-trap-check` | 2.1.2 | キーボードトラップ検出 |
| `keyboard-reachability-check` | 2.1.1 | キーボード到達可能性（Tab・矢印キー・activedescendant） |
| `redundant-entry-check` | 3.3.7 | 同じ目的の入力欄の重なり（候補。要確認） |
| `motion-actuation-check` | 2.5.4 | 端末の動き・傾きに反応する処理（候補。要確認） |
| `change-on-input-check` | 3.2.2 | 欄の値を変えただけで起きる移動・新しいウィンドウ・フォーカス移動・ダイアログ（候補。要確認） |
| `accessible-authentication-check` | 3.3.8 | パスワード・確認コード欄の貼り付けの禁止、autocomplete の off、CAPTCHA らしき要素（候補。要確認） |
| `pointer-gesture-check` | 2.5.1, 2.5.7 | ドラッグ・スワイプ・複数の指の操作で動きそうな部品（候補。要確認） |
| `focus-order-check` | 2.4.3 | Tab の順と見た目の並びのずれ（上へ戻る・行内で逆向き・遠回り）、モーダルを開いたときと閉じたときのフォーカス（候補。要確認） |
| `pointer-cancellation-check` | 2.5.2 | 押し下げただけで動く部品（ページの移動・新しいウィンドウ・ダイアログ・DOM の変化）と、押す listener だけを持つ要素（候補。要確認） |
| `non-text-contrast-check` | 1.4.11 | 入力欄・チェックボックス・ラジオ・スイッチの枠や塗りと外側の色の比、アイコンだけのボタンのアイコンの比（3:1 未満と測れないものを候補に。要確認） |
| `character-key-shortcut-check` | 2.1.4 | 本文にフォーカスを置いて 1 文字ずつ押し、ページの移動・新しいウィンドウ・ダイアログ・フォーカスの移動・DOM の変化・スクロール・`preventDefault()` が起きたキー（候補。要確認） |
| `content-on-hover-check` | 1.4.13 | CSS の `:hover` / `:focus` 規則や listener から中身を出しそうな要素を探してホバー・フォーカスし、Escape で消えない・ポインタを載せると消える・数秒で消える中身（候補。要確認）。まとめて受けている listener は報告のみ |
| `page-snapshot` | 2.4.1 / 2.4.2 / 3.1.1 / 3.2.3 / 3.2.4 / 3.2.6 の材料 | 判定はしない。body の aria snapshot・タイトル・`<html>` の lang・URL・iframe ごとの aria snapshot を書き出す（読んで判定する。複数ページはページごとに `--output-dir` を分けて見比べる） |

詳細は [`@a11y-skills/audit` README](https://www.npmjs.com/package/@a11y-skills/audit) を参照してください。
