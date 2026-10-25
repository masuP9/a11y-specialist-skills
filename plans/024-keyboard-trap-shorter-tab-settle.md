# Plan 024: keyboard-trap-check の Tab ごとの待ちを 50 → 25 ms に半分にする

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。完了したら `plans/README.md` のこのプランの行を更新する
> （レビュアーが索引を管理すると言った場合は除く）。
>
> **差分確認（最初に実行）**:
> `git diff --stat 143e564..HEAD -- packages/a11y-audit/src/constants.ts packages/a11y-audit/src/playwright/runKeyboardTrapCheck.ts packages/a11y-audit/CHANGELOG.md`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。
> 同じ系列のプラン（025〜027）が先に入って `DEFAULT_NAVIGATION_SETTLE_MS` の使われ方が変わっているのは想定内（下の「現状」の注を参照）。

## ステータス

- **優先度**: P2
- **工数**: S
- **リスク**: LOW〜MED（Tab の後 25〜50 ms の間に動くハンドラは既定では見落としうる。実ページ標本にそうしたページはない）
- **依存**: なし（根拠は Plan 021 の結果文書 `plans/021-result-slow-check-timing.md`）
- **カテゴリ**: perf
- **計画時点**: commit `143e564`, 2026-10-16
- **同じ系列のプラン**: 1 検査 1 プランで待ちを半分にする。022 pointer-cancellation / 023 content-on-hover / 024 keyboard-trap / 025 focus-indicator / 026 focus-order / 027 keyboard-reachability / 028 change-on-input。互いに独立で、どの順でも入れられる。

## なぜ重要か

Plan 021 の計測（結果文書の第 3 節）で、keyboard-trap-check の時間の 78% は Tab ごとの 50 ms の待ちだった。
Tab を 2 周するので Tab 系 4 検査の中で一番長く、Wikipedia では 37.0 秒かかる。

| 確かめた範囲 | 結果 |
|---|---|
| 公開 5 ページ、×0.5（25 ms） | `nodes` / `untested` / `aborted` が一致。`targets` は w3c-wai だけ 5 要素が入れ替わったが、変更前どうしの 2 回でも同じ 5 要素が同じように入れ替わる（iframe 内の動画プレイヤーの揺れ） |
| ×0.25（12.5 ms） | ×0.5 と同じ |
| リポジトリの fixture 5 件 | ×0.5 / ×0.25 とも全件一致 |
| 5 ページ合計の所要時間 | 87.3 秒 → 49.3 秒（−44%） |

結果文書の第 6 節の 3 番目に従い、×0.5 にとどめる（遅れて動くフォーカスハンドラを持つ実ページが標本にないため）。

## 現状

すべて `packages/a11y-audit/` 配下。行番号は commit `143e564` 時点。

`src/constants.ts:98-99`（Tab 系 4 検査が共有している既定値）:

```ts
/** Default ms to wait after each Tab press for a focus-triggered navigation to surface. */
export const DEFAULT_NAVIGATION_SETTLE_MS = 50;
```

使っているのは 4 検査（`git grep -n 'DEFAULT_NAVIGATION_SETTLE_MS' -- packages/a11y-audit/src`）:

| 検査 | 既定値を入れている行 |
|---|---|
| keyboard-trap-check | `runKeyboardTrapCheck.ts:100` `walkSettleMs = DEFAULT_NAVIGATION_SETTLE_MS,`（**このプランで変える**） |
| focus-indicator-check | `runFocusIndicatorCheck.ts:264` |
| focus-order-check | `runFocusOrderCheck.ts:559` |
| keyboard-reachability-check | `runKeyboardReachabilityCheck.ts:786` |

1 検査ずつ変えるため、共有の定数は**値を変えず**、keyboard-trap-check 専用の定数を足して既定値をそちらに切り替える。
（注: 025〜027 が先に入っていれば、`DEFAULT_NAVIGATION_SETTLE_MS` の使用者はもっと少ない。このプランで最後の使用者がいなくなったら、定数ごと消す。ステップ 3 の 4。）

`src/playwright/runKeyboardTrapCheck.ts`:

| 行 | 内容 |
|---|---|
| `:32` | `DEFAULT_NAVIGATION_SETTLE_MS,`（import） |
| `:67-68` | `/** Milliseconds to wait after each Tab press (default: DEFAULT_NAVIGATION_SETTLE_MS). */` `walkSettleMs?: number;` |
| `:100` | `walkSettleMs = DEFAULT_NAVIGATION_SETTLE_MS,` |
| `:198-202` | Tab ごとに `if (walkSettleMs > 0) await page.waitForTimeout(walkSettleMs);`（**今回縮まるのはここ**） |
| `:317`, `:413` | Escape 後 `KEYBOARD_TRAP_ESCAPE_SETTLE_MS`（200 ms）。触らない |

`src/constants.ts:663-675` に keyboard-trap-check の定数の節がある（`KEYBOARD_TRAP_ESCAPE_SETTLE_MS = 200` が `:671`）。新しい定数はここに置く。

この定数群は `src/index.ts` から公開していない。keyboard-trap-check はリリース済みなので、既定の振る舞いの変化を CHANGELOG の `### Changed` に書く。

keyboard-trap-check 専用の spec ファイルはない（`smoke.spec.ts` や `fixture-gallery.spec.ts` で走る）。定数のテストは新しいファイルに置く。

### 守る書き方

- TypeScript ESM、2 スペース、シングルクォート、末尾カンマ（Prettier + ESLint を CI で強制）。
- テストはビルド済みの `../dist/…` を import する。
- **まだ無い定数を読むテストは `import * as constants from '../dist/constants.js'` で書く**。名前付き import にすると、定数が無い間はファイルの読み込み自体が失敗し、「期待どおりの理由で落ちる」を確かめられない。
- テスト名は日本語で「どんな条件で・何をすると・どうなるか」。
- コミット例: `perf(a11y-audit): halve keyboard-trap-check Tab settle wait (50 → 25 ms)`。

## 使うコマンド

| 目的 | コマンド（リポジトリ直下。worktree なら `npm --prefix <worktree> run <script>`） | 成功の目安 |
|---|---|---|
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 1 ファイルのテスト | `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/keyboard-trap-defaults.spec.ts`（先にビルド） | 全件成功 |
| 全体の検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |
| 整形 | `npx prettier --write <path>` | ファイルが書き換わる |

## 範囲

**変更してよいファイル**:
- `packages/a11y-audit/src/constants.ts`（新しい定数 1 つ。`DEFAULT_NAVIGATION_SETTLE_MS` は使用者がいなくなったときだけ削除）
- `packages/a11y-audit/src/playwright/runKeyboardTrapCheck.ts`（import、`:67` の説明、`:100` の既定値だけ）
- `packages/a11y-audit/test/keyboard-trap-defaults.spec.ts`（新規）
- `packages/a11y-audit/CHANGELOG.md`
- `plans/README.md`（行の更新）

**触らない**:
- `DEFAULT_NAVIGATION_SETTLE_MS` の値（他の 3 検査の既定値。それぞれのプランで変える）。
- `KEYBOARD_TRAP_ESCAPE_SETTLE_MS`（200 ms）、`KEYBOARD_TRAP_MAX_TAB_PRESSES`（600 回の上限。Wikipedia の `tab-walk-capped` は網羅性の別問題）。
- 他の検査のファイル、README（この検査の既定の待ちは README に書かれていない）、バージョン欄。
- 計測スクリプトと計測結果（`packages/a11y-audit/test-results/` と `tmp/` は gitignore 済み）。

## Git の進め方

- ブランチ: `perf/keyboard-trap-settle`
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

ページごとに実行する。**w3c-wai だけは 2 回**取る（`before-w3c-wai.jsonl` と `before2-w3c-wai.jsonl`）。元々揺れる要素を見分けるため。

```bash
node packages/a11y-audit/test-results/spike-021/measure.mjs <url> --page <name> --checks keyboard-trap-check --out tmp/spike-021/before-<name>.jsonl
```

**確認**: 6 ファイルとも 1 行ずつあり、`"error"` を含まない。

### ステップ 2: 失敗するテストを書く

`test/keyboard-trap-defaults.spec.ts` を作る:

```ts
import { expect, test } from '@playwright/test';
import * as constants from '../dist/constants.js';

test('keyboard-trap-check の Tab ごとの既定の待ちは 25ms（Plan 021 で 5 ページと fixture 5 件の結果が 50ms と同じだった値）', () => {
  expect(
    (constants as unknown as Record<string, unknown>).KEYBOARD_TRAP_WALK_SETTLE_MS,
  ).toBe(25);
});
```

ビルドしてこのファイルを実行する。**確認**: `Expected: 25 / Received: undefined` で落ちる（読み込みの失敗ではない）。

### ステップ 3: 専用の定数を足し、既定値を切り替える

1. `src/constants.ts` の keyboard-trap-check の節（`KEYBOARD_TRAP_ESCAPE_SETTLE_MS` の近く）に足す:
   ```ts
   /**
    * Wait after each Tab press. 25 ms gave the same results as the shared 50 ms on
    * 5 public pages and 5 fixtures (plans/021-result-slow-check-timing.md).
    */
   export const KEYBOARD_TRAP_WALK_SETTLE_MS = 25;
   ```
2. `runKeyboardTrapCheck.ts` の import の `DEFAULT_NAVIGATION_SETTLE_MS` を `KEYBOARD_TRAP_WALK_SETTLE_MS` に替え、`:100` を `walkSettleMs = KEYBOARD_TRAP_WALK_SETTLE_MS,` にする。
3. `:67` の説明を `(default: KEYBOARD_TRAP_WALK_SETTLE_MS)` にする。
4. `git grep -n 'DEFAULT_NAVIGATION_SETTLE_MS' -- packages/a11y-audit` が `constants.ts` の定義 1 行だけになったら、その定義（とすぐ上の説明コメント）を消す。他の使用者が残っていれば何もしない。

ビルドしてステップ 2 のテストを実行する。**確認**: 通る。
通ったら、テストの import を名前付き（`import { KEYBOARD_TRAP_WALK_SETTLE_MS } from '../dist/constants.js';`）に書き換えて型の変換を外し、もう一度通ることを確かめる。

### ステップ 4: 全体の検証

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` が exit 0。

### ステップ 5: 変更後の実ページ結果を取り、変更前と比べる

テストを実行すると Playwright が `packages/a11y-audit/test-results/` を丸ごと消すので、計測スクリプトも消えている。まずステップ 1 の `node -e` をもう一度実行してスクリプトを取り出し直す（計測結果はリポジトリ直下の `tmp/spike-021/` に書くので消えない。`/tmp` は gitignore 済み）。

ビルドしてから、ステップ 1 と同じコマンドを `--out tmp/spike-021/after-<name>.jsonl` で 5 ページ実行し、比べる:

```bash
node packages/a11y-audit/test-results/spike-021/compare.mjs tmp/spike-021/before-<name>.jsonl tmp/spike-021/after-<name>.jsonl
```

w3c-wai は、元々の揺れと見分ける比較も行う:

```bash
node packages/a11y-audit/test-results/spike-021/compare.mjs --flake tmp/spike-021/before-w3c-wai.jsonl tmp/spike-021/before2-w3c-wai.jsonl tmp/spike-021/after-w3c-wai.jsonl
```

**確認**:
- 5 ページとも `nodes.same` / `untested.same` / `aborted.same` が `true`。
- `targets.same` は w3c-wai 以外の 4 ページで `true`。w3c-wai で `false` なら、`--flake` の出力が `outsideFlakeCount: 0`（変更前どうしの揺れの範囲内）。出力が無い場合は差分が無い。
- `durationMs` の合計が変更前より短い（目安は 5 ページ合計で 4 割前後短い）。

### ステップ 6: CHANGELOG

`## Unreleased` の `### Changed` に書く:

```md
- `keyboard-trap-check`: the default wait after each Tab press
  (`walkSettleMs`) is now 25 ms (was 50 ms). On 5 public pages and the
  keyboard-trap fixtures the results were the same, and the check took about
  44% less time. Pass `walkSettleMs: 50` to keep the old wait.
```

### ステップ 7: CLI のスモークを手元で再現

```bash
node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" --checks all --output-dir /tmp/cli-smoke-024
```

**確認**: `Errors:       0`。

## テスト計画

| テスト | 種類 | 変更前 | 変更後 |
|---|---|---|---|
| keyboard-trap-check の Tab ごとの既定の待ちは 25ms | 追加 | 落ちる（undefined） | 通る |
| `smoke.spec.ts` / `fixture-gallery.spec.ts` などの keyboard-trap-check を走らせる既存テスト | 既存 | 通る | 通る |
| 実ページ 5 つの比較（ステップ 5） | 手動 | — | 一致（w3c-wai は元々の揺れの範囲内） |

## 完了条件

- [ ] 全体の検証コマンドが exit 0
- [ ] `git grep -n 'KEYBOARD_TRAP_WALK_SETTLE_MS' -- packages/a11y-audit/src` が定義・import・既定値・説明の 4 行以上
- [ ] `git grep -n 'DEFAULT_NAVIGATION_SETTLE_MS' -- packages/a11y-audit/src/playwright/runKeyboardTrapCheck.ts` が 0 行
- [ ] ステップ 5 の条件をすべて満たし、PR 本文に 5 ページの変更前後の秒数を表で載せる
- [ ] ステップ 7 で `Errors:       0`
- [ ] `git status --porcelain` に範囲内のファイルしか出ない
- [ ] `plans/README.md` の 024 の行を更新

## STOP 条件

- 差分確認で `runKeyboardTrapCheck.ts` が変わっていて、「現状」の抜粋と食い違う。
- ステップ 2 の新しいテストが、値の不一致以外の理由で落ちる。
- ステップ 3 の後に既存テストが落ちる。テストに `walkSettleMs` を足して通す、待ちを延ばす、テストを消す、のどれもしない。どのテストがどう落ちたかを報告する。
- ステップ 5 で、w3c-wai 以外のページの集合が一致しない。または w3c-wai の `outsideFlakeCount` が 0 でない。同じページで変更前の計測をもう 1 回取り、変更前どうしでも同じ差が出るかを確かめてから報告する。
- 実ページに届かない。fixture だけで済ませない。

## 保守メモ

- 25 ms より短くするのは、結果文書の第 6 節「やらない」に従い見送る。
- 検査ごとに定数を分けたので、他の Tab 系検査の既定値はこのプランでは変わらない（025〜027 で 1 つずつ変える）。
