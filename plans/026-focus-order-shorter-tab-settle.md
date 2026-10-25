# Plan 026: focus-order-check の Tab ごとの待ちを 50 → 25 ms に半分にする

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。完了したら `plans/README.md` のこのプランの行を更新する
> （レビュアーが索引を管理すると言った場合は除く）。
>
> **差分確認（最初に実行）**:
> `git diff --stat 143e564..HEAD -- packages/a11y-audit/src/constants.ts packages/a11y-audit/src/playwright/runFocusOrderCheck.ts packages/a11y-audit/test/focus-order.spec.ts packages/a11y-audit/CHANGELOG.md`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。
> 同じ系列のプラン（024 / 025 / 027）が先に入って `DEFAULT_NAVIGATION_SETTLE_MS` の使われ方が変わっているのは想定内。
> **024〜027 をまとめて実施する手順は 024 の「024〜027 をまとめて実施するとき」にある。**

## ステータス

- **Codex plan review**: 通過（2 巡目、2026-10-25、024〜027 をまとめて審査、見送った low 0 件）

- **優先度**: P3
- **工数**: S
- **リスク**: LOW〜MED（Tab の後 25〜50 ms で起きる遷移やフォーカス移動は既定では見落としうる。実ページ標本にそうしたページはない）
- **依存**: なし（根拠は Plan 021 の結果文書 `plans/021-result-slow-check-timing.md`）
- **カテゴリ**: perf
- **計画時点**: commit `143e564`, 2026-10-16
- **同じ系列のプラン**: 1 検査 1 プランで待ちを半分にする。022 pointer-cancellation / 023 content-on-hover / 024 keyboard-trap / 025 focus-indicator / 026 focus-order / 027 keyboard-reachability / 028 change-on-input。互いに独立で、どの順でも入れられる。

## なぜ重要か

Plan 021 の計測（結果文書の第 3 節）で、focus-order-check の時間の 62% は Tab ごとの 50 ms の待ちだった。
Wikipedia では 17.9 秒かかる。

| 確かめた範囲 | 結果 |
|---|---|
| 公開 5 ページ、×0.5（25 ms） | `nodes` / `targets` / `untested` / `aborted` がすべて一致 |
| ×0.25（12.5 ms） | 一致 |
| リポジトリの fixture 13 件 | ×0.5 / ×0.25 とも全件一致 |
| 5 ページ合計の所要時間 | 44.3 秒 → 28.3 秒（−36%） |

遅れて動くフォーカスハンドラを持つ実ページが標本にないので、×0.5 で止める（結果文書の第 6 節）。
ダイアログを開閉した後の 300 ms（`FOCUS_ORDER_DIALOG_SETTLE_MS`）は計測で動かしていないので変えない。

## 現状

すべて `packages/a11y-audit/` 配下。行番号は commit `143e564` 時点。

`src/constants.ts:98-99`（Tab 系 4 検査が共有している既定値）:

```ts
/** Default ms to wait after each Tab press for a focus-triggered navigation to surface. */
export const DEFAULT_NAVIGATION_SETTLE_MS = 50;
```

使っているのは keyboard-trap / focus-indicator / focus-order / keyboard-reachability の 4 検査。
1 検査ずつ変えるため、共有の定数は**値を変えず**、focus-order-check 専用の定数を足して既定値をそちらに切り替える。
このプランで最後の使用者がいなくなったら、共有の定数ごと消す（ステップ 3 の 4）。

`src/playwright/runFocusOrderCheck.ts`:

| 行 | 内容 |
|---|---|
| `:57` | `DEFAULT_NAVIGATION_SETTLE_MS,`（import） |
| `:62` | `FOCUS_ORDER_DIALOG_SETTLE_MS,`（import。触らない） |
| `:93-94` | `/** Wait after each Tab press (default: DEFAULT_NAVIGATION_SETTLE_MS). */` `settleMs?: number;` |
| `:559` | `settleMs = DEFAULT_NAVIGATION_SETTLE_MS,` |
| `:568-571` | 正の有限数でなければ Error |
| `:660-661` | Tab ごとに `await page.waitForTimeout(settleMs);`（**今回縮まるのはここ**） |
| `:871` | ダイアログ後 `FOCUS_ORDER_DIALOG_SETTLE_MS`（300 ms）。触らない |

`src/constants.ts:936` から focus-order-check の定数の節がある（`FOCUS_ORDER_DIALOG_SETTLE_MS = 300` が `:955`）。新しい定数はここに置く。
この定数群は `src/index.ts` から公開していない。focus-order-check はリリース済み（0.13.0）なので、CHANGELOG の `### Changed` に書く。

### 守る書き方

- TypeScript ESM、2 スペース、シングルクォート、末尾カンマ（Prettier + ESLint を CI で強制）。
- テストはビルド済みの `../dist/…` を import する。
- **まだ無い定数を読むテストは `import * as constants from '../dist/constants.js'` で書く**。名前付き import にすると、定数が無い間はファイルの読み込み自体が失敗し、「期待どおりの理由で落ちる」を確かめられない。
- テスト名は日本語で「どんな条件で・何をすると・どうなるか」。
- コミット例: `perf(a11y-audit): halve focus-order-check Tab settle wait (50 → 25 ms)`。

## 使うコマンド

| 目的 | コマンド（リポジトリ直下。worktree なら `npm --prefix <worktree> run <script>`） | 成功の目安 |
|---|---|---|
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 1 ファイルのテスト | `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/focus-order.spec.ts`（先にビルド） | 全件成功 |
| 全体の検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |
| 整形 | `npx prettier --write <path>` | ファイルが書き換わる |

## 範囲

**変更してよいファイル**:
- `packages/a11y-audit/src/constants.ts`（新しい定数 1 つ。`DEFAULT_NAVIGATION_SETTLE_MS` は使用者がいなくなったときだけ削除）
- `packages/a11y-audit/src/playwright/runFocusOrderCheck.ts`（import、`:93` の説明、`:559` の既定値だけ）
- `packages/a11y-audit/test/focus-order.spec.ts`（テスト 1 つ追加）
- `packages/a11y-audit/CHANGELOG.md`
- `plans/README.md`（行の更新）

**触らない**:
- `DEFAULT_NAVIGATION_SETTLE_MS` の値（他の検査の既定値）。
- `FOCUS_ORDER_DIALOG_SETTLE_MS`（300 ms）と `:871`。
- 他の検査のファイル、README（この待ちは README に書かれていない）、バージョン欄。
- 計測スクリプトと計測結果（`packages/a11y-audit/test-results/` と `tmp/` は gitignore 済み）。

## Git の進め方

- ブランチ: `perf/focus-order-settle`
- push と PR は指示があるときだけ。

## ステップ

### ステップ 1: 変更前の実ページ結果を取る

結果文書の付録から計測スクリプトを取り出し、**変更前のビルド**で 5 ページを測る。

```bash
node -e '
const fs = require("fs");
const md = fs.readFileSync("plans/021-result-slow-check-timing.md", "utf8");
const dir = "packages/a11y-audit/test-results/spike-021";
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync("tmp/spike-021", { recursive: true });
for (const name of ["measure.mjs", "compare.mjs"]) {
  const m = md.match(new RegExp("#### `" + name.replace(".", "\\.") + "`\\n\\n```js\\n([\\s\\S]*?)\\n```"));
  if (!m) throw new Error("not found: " + name);
  fs.writeFileSync(dir + "/" + name, m[1] + "\n");
}'
npm run build --workspace @a11y-skills/audit
```

| 名前 | URL |
|---|---|
| w3c-bad | `https://www.w3.org/WAI/demos/bad/before/home.html` |
| w3c-good | `https://www.w3.org/WAI/demos/bad/after/home.html` |
| w3c-wai | `https://www.w3.org/WAI/` |
| mdn | `https://developer.mozilla.org/en-US/` |
| wikipedia | `https://en.wikipedia.org/wiki/Main_Page` |

```bash
node packages/a11y-audit/test-results/spike-021/measure.mjs <url> --page <name> --checks focus-order-check --out tmp/spike-021/before-<name>.jsonl
```

**確認**: 5 ファイルとも 1 行ずつあり、`"error"` を含まない。

### ステップ 2: 失敗するテストを書く

`test/focus-order.spec.ts` に足す:

```ts
import * as constants from '../dist/constants.js';

test('focus-order-check の Tab ごとの既定の待ちは 25ms（Plan 021 で 5 ページと fixture 13 件の結果が 50ms と同じだった値）', () => {
  expect(
    (constants as unknown as Record<string, unknown>).FOCUS_ORDER_SETTLE_MS,
  ).toBe(25);
});
```

ビルドしてこのファイルを実行する。**確認**: 新しいテストだけが `Expected: 25 / Received: undefined` で落ちる。

### ステップ 3: 専用の定数を足し、既定値を切り替える

1. `src/constants.ts` の focus-order-check の節（`FOCUS_ORDER_DIALOG_SETTLE_MS` の近く）に足す:
   ```ts
   /**
    * Wait after each Tab press. 25 ms gave the same results as the shared 50 ms on
    * 5 public pages and 13 fixtures (plans/021-result-slow-check-timing.md).
    */
   export const FOCUS_ORDER_SETTLE_MS = 25;
   ```
2. `runFocusOrderCheck.ts` の import の `DEFAULT_NAVIGATION_SETTLE_MS` を `FOCUS_ORDER_SETTLE_MS` に替え、`:559` を `settleMs = FOCUS_ORDER_SETTLE_MS,` にする。
3. `:93` の説明を `(default: FOCUS_ORDER_SETTLE_MS)` にする。
4. `git grep -n 'DEFAULT_NAVIGATION_SETTLE_MS' -- packages/a11y-audit` が `constants.ts` の定義 1 行だけになったら、その定義（とすぐ上の説明コメント）を消す。他の使用者が残っていれば何もしない。

ビルドしてこのファイルを実行する。**確認**: 全件成功。
通ったら、新しいテストの import を名前付きに書き換えて型の変換を外し、もう一度通ることを確かめる。

### ステップ 4: 全体の検証

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` が exit 0。

### ステップ 5: 変更後の実ページ結果を取り、変更前と比べる

テストを実行すると Playwright が `packages/a11y-audit/test-results/` を丸ごと消すので、計測スクリプトも消えている。まずステップ 1 の `node -e` をもう一度実行してスクリプトを取り出し直す（計測結果はリポジトリ直下の `tmp/spike-021/` に書くので消えない。`/tmp` は gitignore 済み）。

ビルドしてから、ステップ 1 と同じコマンドを `--out tmp/spike-021/after-<name>.jsonl` で 5 ページ実行し、比べる:

```bash
node packages/a11y-audit/test-results/spike-021/compare.mjs tmp/spike-021/before-<name>.jsonl tmp/spike-021/after-<name>.jsonl
```

**確認**:
- 5 ページとも `nodes.same` / `targets.same` / `untested.same` / `aborted.same` が `true`。
- `durationMs` の合計が変更前より短い（目安は 5 ページ合計で 3〜4 割短い）。

### ステップ 6: CHANGELOG

`## Unreleased` の `### Changed` に書く:

```md
- `focus-order-check`: the default wait after each Tab press (`settleMs`) is
  now 25 ms (was 50 ms). On 5 public pages and the focus-order fixtures the
  results were the same, and the check took about 36% less time. The 300 ms
  wait after opening or closing a dialog is unchanged. Pass `settleMs: 50` to
  keep the old wait.
```

### ステップ 7: CLI のスモークを手元で再現

```bash
node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" --checks all --output-dir /tmp/cli-smoke-026
```

**確認**: `Errors:       0`。

## テスト計画

| テスト | 種類 | 変更前 | 変更後 |
|---|---|---|---|
| focus-order-check の Tab ごとの既定の待ちは 25ms | 追加 | 落ちる（undefined） | 通る |
| `focus-order.spec.ts` の既存テスト | 既存 | 通る | 通る |
| 実ページ 5 つの比較（ステップ 5） | 手動 | — | 集合がすべて一致 |

## 完了条件

- [ ] 全体の検証コマンドが exit 0
- [ ] `git grep -n 'DEFAULT_NAVIGATION_SETTLE_MS' -- packages/a11y-audit/src/playwright/runFocusOrderCheck.ts` が 0 行
- [ ] `git grep -n 'FOCUS_ORDER_DIALOG_SETTLE_MS = 300' -- packages/a11y-audit/src/constants.ts` が 1 行（据え置き）
- [ ] ステップ 5 で 5 ページとも一致し、PR 本文に 5 ページの変更前後の秒数を表で載せる
- [ ] ステップ 7 で `Errors:       0`
- [ ] `git status --porcelain` に範囲内のファイルしか出ない
- [ ] `plans/README.md` の 026 の行を更新

## STOP 条件

- 差分確認で `runFocusOrderCheck.ts` が変わっていて、「現状」の抜粋と食い違う。
- ステップ 2 の新しいテストが、値の不一致以外の理由で落ちる。
- ステップ 3 の後に既存テストが落ちる。テストに `settleMs` を足して通す、待ちを延ばす、テストを消す、のどれもしない。どのテストがどう落ちたかを報告する。
- ステップ 5 でどれかのページの集合が一致しない。同じページで変更前の計測をもう 1 回取り、変更前どうしでも同じ差が出るかを確かめてから報告する。
- 実ページに届かない。fixture だけで済ませない。

## 保守メモ

- 25 ms より短くするのは、結果文書の第 6 節「やらない」に従い見送る。
- ダイアログ後の 300 ms を縮めるかは、計測していないので別の判断。
