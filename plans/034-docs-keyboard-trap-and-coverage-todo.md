# Plan 034: README に `keyboard-trap-check` を載せ、TODO-COVERAGE.md を今の空白に合わせる

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。`plans/README.md` は更新しない。
>
> **差分確認（最初に実行）**:
> `git diff --stat 3b7d8e1..HEAD -- packages/a11y-audit/README.md packages/a11y-audit/README.ja.md packages/a11y-audit/TODO-COVERAGE.md packages/a11y-audit/src/cli.ts`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **Codex plan review**: 通過（1 巡目、2026-10-25、見送った low 0 件。medium 1 件「脱出操作と分類が実装とずれている」を反映）
- **優先度**: P2（公開パッケージの参照文書が間違っている）
- **工数**: S
- **リスク**: LOW（文書のみ）
- **依存**: なし。Plan 035（登録ガード）はこのプランの後に入れる（035 が足す「README に登録表の全名が載っている」テストが最初から通るように）
- **カテゴリ**: docs
- **計画時点**: commit `3b7d8e1`, 2026-10-25

## なぜ重要か

- `packages/a11y-audit/README.md` / `README.ja.md` は npm パッケージの参照文書。CLI の登録表（`src/cli.ts` の `CHECK_REGISTRY`、23 件）にある `keyboard-trap-check` が、README の「チェック名一覧」（22 行）と関数表（`runKeyboardTrapCheck` の行が無い）から抜けている。`--checks` の利用者は 2.1.2 が検査できることを知れない。README 末尾の例（`README.md:561-566` / `README.ja.md:465-470`）は `runKeyboardTrapCheck` を使っているので、表との食い違いにもなっている。
- `packages/a11y-audit/TODO-COVERAGE.md`（まだ自動化していない達成基準のメモ）は、2.1.2 を「新規スクリプト作成が必要なもの」の唯一の項目として残している（`:310-326`、`:346-350`）が、`keyboard-trap-check` は 0.5.0 からある。逆に、本当に残っている空白（4.1.3、3.3.1 / 3.3.3、2.3.1、2.5.3）が書かれていない。次の検査を選ぶエージェントや人がこの文書を見ると、間違った答えを得る。

## 現状

### README 英語版 `packages/a11y-audit/README.md`

- `:16-41` 関数表。`runAutoPlayDetection` の行（`:27`）の次が `runKeyboardReachabilityCheck`（`:28`）で、`runKeyboardTrapCheck` の行が無い。
- `:414-439` 「### Available check names」のコードブロック。`target-size-check` の次が `keyboard-reachability-check` で、`keyboard-trap-check` が無い。
- `:7` と `:388` の「22 checks」は正しい（登録表 23 件 − `page-snapshot` = 22 検査）。変えない。

### README 日本語版 `packages/a11y-audit/README.ja.md`

- `:17-44` 関数表。同じく `runKeyboardTrapCheck` の行が無い。
- `:325-350` 「### チェック名一覧」のコードブロック。同じく `keyboard-trap-check` が無い。
- `:6` の「22 個の検査」は正しい。変えない。

### 登録表 `packages/a11y-audit/src/cli.ts:207-222`

```ts
  {
    name: 'keyboard-trap-check',
    slow: true,
    kind: 'browser',
    async run({ browser, outputDir, screenshot, url, quiet }) {
      const { runKeyboardTrapCheck } =
        await import('./playwright/runKeyboardTrapCheck.js');
```

登録順: … `auto-play-detection`, `target-size-check`, `keyboard-trap-check`, `keyboard-reachability-check`, … README の名前一覧はこの順に並んでいる。

### 検査の中身（表の説明に使う）

- ルール: `a11y-skills/no-keyboard-trap`（violation）と `a11y-skills/keyboard-trap-needs-review`（incomplete）（`src/utils/rule-registry.ts:450-472`）。
- 動き（`src/playwright/runKeyboardTrapCheck.ts`、定数は `src/constants.ts:663-673`）: ページの操作可能要素の数 `count` を数え、Tab を `2 × count + 10` 回（上限 600 回）押して `activeElement` の列を記録。末尾 `count + 1` 個に `(body)` が無く、要素の種類が `count` 未満なら罠候補。候補には Escape → Shift+Tab → 閉じるボタン（罠の中にある `button` / `role="button"` で、ラベルが close / 閉じる / dismiss のもの）をスクリプトから `click()` の順で最大 3 回脱出を試みる（`:360-403`）。どれでも抜けられなければ `no-keyboard-trap` 違反。抜けられたうち、`role="dialog"` + `aria-modal="true"` の中で Escape が効いたものは正しいモーダルとして報告しない（`:497-505`）。それ以外の抜け方（Shift+Tab や閉じるボタンだけ、aria-modal で無いもの）は `keyboard-trap-needs-review`。
- 既存の文書での言い方: `skills/auditing-wcag/references/coverage-matrix.ja.md:37` 「| 2.1.2 | 自動+インタラクティブ | `keyboard-trap-check` **[CLI]** + 操作ログ | トラップでFail |」。

### TODO-COVERAGE.md

- `:310-326` 「### 2.1.2 No Keyboard Trap」: 見出しに「実装済み」が無く、「実装アイデア」だけ。
- `:344-350`:

```markdown
## 実装優先度（案）

**新規スクリプト作成が必要なもの:**

| 優先度 | 達成基準 | 理由 |
|-------|---------|------|
| 中 | 2.1.2 No Keyboard Trap | モーダル問題の検出 |
```

- `:352-374` 「**既存でカバー済み:**」の表。2.1.2 の行が無い。
- 部分実装の項の書き方の見本は `:98-119`（2.1.1）: 見出し `### 2.1.1 Keyboard - **部分実装** ✅`、`**概要**`、`**実装**: \`keyboard-reachability-check\`（\`runKeyboardReachabilityCheck.ts\`）` の箇条書き、`**残る制限**` の箇条書き。
- `:43-50` 「### 2.5.3 Label in Name」は「`automated-checks.md` でカバー済み」としている。`coverage-matrix.md:53` は「axe `label-content-name-mismatch` is experimental and not run by default」と書いており、自動では見ていない。

### 残っている空白（`skills/auditing-wcag/references/coverage-matrix.md` から）

| 達成基準 | coverage-matrix の扱い | 流用できそうな既存コード |
|---|---|---|
| 4.1.3 Status Messages | Automated + Interactive（CLI 検査なし、`:80`） | 操作後の DOM 変化を静かな期間の基準線と比べる処理（`runCharacterKeyShortcutCheck.ts` / `runMotionActuationCheck.ts` の `domMutations`）、フォーム入力の `runChangeOnInputCheck.ts` |
| 3.3.1 Error Identification / 3.3.3 Error Suggestion | Interactive（`:68`, `:70`） | 同上（空で送信してから出た文字列と、その祖先の `aria-live` / `role=alert|status`） |
| 2.3.1 Three Flashes | Manual（`:41`） | `runAutoPlayDetection.ts` のスクリーンショット差分。ただし 2 秒間隔なので点滅の検出には粗すぎ、CDP screencast が必要 |
| 2.5.3 Label in Name | axe ルールは experimental で既定では走らない（`:53`） | 可視テキストとアクセシブル名の比較（`page-snapshot` の aria snapshot） |

## 方針

- README は**日本語版を先に**直し、英語版をそろえる（AGENTS.md の規則）。
- TODO-COVERAGE.md は日本語のみの文書（英語版は無い。作らない）。
- 検査の仕様は変えない。文書だけ。

## 範囲

変更可:

- `packages/a11y-audit/README.ja.md`、`packages/a11y-audit/README.md`
- `packages/a11y-audit/TODO-COVERAGE.md`

範囲外:

- `src/` 全部、`skills/` 全部（coverage-matrix は既に正しい）
- README の「22」の数え方
- CHANGELOG（文書修正のみなので項目は足さない）

## 使うコマンド

| 目的 | コマンド | 期待 |
|---|---|---|
| 一致確認 | 下の「完了条件」のシェル 1 行 | 出力なし |
| 整形 | `npx prettier --write packages/a11y-audit/README.md packages/a11y-audit/README.ja.md packages/a11y-audit/TODO-COVERAGE.md` | — |
| 全検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | すべて exit 0 |

## 手順

1. **README.ja.md 関数表**: `runAutoPlayDetection` の行の直後に 1 行足す:
   `| \`runKeyboardTrapCheck\` | 2.1.2 キーボードトラップなし（Tab を要素数の 2 倍押して巡回を記録し、`<body>` に戻らず一部の要素に留まるものを候補に。Escape・Shift+Tab・閉じるボタンのクリックのどれでも抜けられなければ違反。`aria-modal` のダイアログで Escape が効けば報告せず、それ以外の抜け方は要確認） |`
2. **README.ja.md チェック名一覧**: `target-size-check` の次の行に `keyboard-trap-check` を足す（登録順）。
3. **README.md**: 同じ 2 か所に英語で。関数表: `| \`runKeyboardTrapCheck\` | 2.1.2 No Keyboard Trap (presses Tab twice the number of focusable elements and records the cycle; focus that never returns to \`<body>\` and stays within a subset is a candidate. A violation when neither Escape, Shift+Tab nor clicking a close button escapes. An \`aria-modal\` dialog that Escape closes is not reported; any other way out is needs review) |`。名前一覧も同じ位置。
4. **TODO-COVERAGE.md 2.1.2 の項**（`:310-326`）を部分実装の形に書き換える: 見出し `### 2.1.2 No Keyboard Trap - **部分実装** ✅`、`**実装**: \`keyboard-trap-check\`（\`runKeyboardTrapCheck.ts\`）` に上の「検査の中身」を箇条書き、`**残る制限**` に「閉じるボタンの脱出はスクリプトの `click()` で、キーボードで押せるかは確かめない。`aria-modal` で Escape が効くモーダルは正しい作りとみなして報告しない（他の抜け方は `needs-review` 止まり）。iframe・shadow DOM の中のフォーカスは最上位 document の `activeElement` でしか見ない。Tab 上限 600 回を超える大きなページは `tabWalkCapped` を付けて報告」。
5. **TODO-COVERAGE.md 実装優先度の表**（`:346-350`）を、上の「残っている空白」の 4 行に置き換える（列は「優先度 | 達成基準 | 理由・流用できる土台」。優先度は 4.1.3 を「高」、3.3.1/3.3.3 を「中」、2.5.3 を「中」、2.3.1 を「低（screencast が要る・誤判定の代償が大きい）」）。
6. **TODO-COVERAGE.md 既存でカバー済みの表**（`:352-374`）に `| 2.1.2 No Keyboard Trap | \`keyboard-trap-check\`（部分） ✅ |` を足す（2.1.1 の行の次）。
7. **TODO-COVERAGE.md 2.5.3 の項**（`:43-50`）の備考に 1 文足す: 「axe の `label-content-name-mismatch` は experimental で既定では走らないため、自動では見ていない（`coverage-matrix.md`）」。
8. **整形と検証**: prettier → 全検証コマンド。

## 完了条件

- [ ] 次のシェルが何も出力しない（登録表の全名が両 README の名前一覧にある）:
  `for n in $(grep -oE "^\s+name: '[a-z0-9-]+'" packages/a11y-audit/src/cli.ts | grep -oE "[a-z0-9-]+'" | tr -d "'"); do for f in packages/a11y-audit/README.md packages/a11y-audit/README.ja.md; do grep -qx "$n" "$f" || echo "MISSING $n in $f"; done; done`
- [ ] `grep -c runKeyboardTrapCheck packages/a11y-audit/README.md packages/a11y-audit/README.ja.md` がどちらも 3 以上（表 1 + 既存の例 2）。
- [ ] `grep -n '新規スクリプト作成が必要なもの' packages/a11y-audit/TODO-COVERAGE.md` の直後の表に 2.1.2 が無く、4.1.3 がある。
- [ ] 全検証コマンドが exit 0（`format:check` を含む）。

## STOP 条件

- README の関数表や名前一覧の位置が「現状」の行番号から大きくずれていて、該当ブロックを見つけられない。
- 差分確認で「現状」と食い違う。

## 保守メモ

- Plan 035 は「`CHECK_REGISTRY` の全名が両 README にある」テストを足す予定。以後、検査を足したら README を直さないとテストが落ちる。
- TODO-COVERAGE.md は次の検査を選ぶときの入口。検査を足したら「実装優先度」の表から消し、「既存でカバー済み」に移す。
