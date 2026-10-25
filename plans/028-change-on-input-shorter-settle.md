# Plan 028: change-on-input-check の欄ごとの待ちを 500 → 250 ms に半分にする

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。完了したら `plans/README.md` のこのプランの行を更新する
> （レビュアーが索引を管理すると言った場合は除く）。
>
> **差分確認（最初に実行）**:
> `git diff --stat 143e564..HEAD -- packages/a11y-audit/src/constants.ts packages/a11y-audit/src/playwright/runChangeOnInputCheck.ts packages/a11y-audit/test/change-on-input.spec.ts packages/a11y-audit/test/fixtures/pages/change-on-input/ packages/a11y-audit/CHANGELOG.md`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **優先度**: P3（効果が小さい。他の変更のついでに入れてよい）
- **工数**: S
- **リスク**: MED（×0.25 = 125 ms では実ページで検出が変わった。250 ms は確かめた範囲の下限）
- **依存**: なし（根拠は Plan 021 の結果文書 `plans/021-result-slow-check-timing.md`）
- **カテゴリ**: perf
- **計画時点**: commit `143e564`, 2026-10-16
- **同じ系列のプラン**: 1 検査 1 プランで待ちを半分にする。022 pointer-cancellation / 023 content-on-hover / 024 keyboard-trap / 025 focus-indicator / 026 focus-order / 027 keyboard-reachability / 028 change-on-input。互いに独立で、どの順でも入れられる。

## なぜ重要か

Plan 021 の計測（結果文書の第 3 節）で、change-on-input-check の時間のうち決まった秒数の待ちは 28% だけだった。
残りはページ遷移の後の回復などの実処理で、待ちを縮めても縮む量は小さい。

| 確かめた範囲 | 結果 |
|---|---|
| 公開 5 ページ、×0.5（250 ms） | `nodes` / `targets` / `untested` / `aborted` がすべて一致 |
| ×0.25（125 ms） | **Wikipedia で検出が変わった**（試せなかった欄が試せるようになり、別の欄の判定が `no-change` から `focus-moved` に変わった） |
| リポジトリの fixture 12 件 | ×0.5 / ×0.25 とも全件一致 |
| 5 ページ合計の所要時間 | 32.1 秒 → 27.5 秒（−14%）。最大でも Wikipedia の約 3.3 秒 |

結果文書の第 6 節の 4 番目に従い、×0.5 までにとどめる。

## 現状

すべて `packages/a11y-audit/` 配下。行番号は commit `143e564` 時点。

`src/constants.ts:797-798`:

```ts
/** Wait after each value change for a context change to surface. */
export const CHANGE_ON_INPUT_SETTLE_MS = 500;
```

`src/playwright/runChangeOnInputCheck.ts`:

| 行 | 内容 |
|---|---|
| `:29-32` | ファイル冒頭の説明。「`settleMs` を過ぎてから起きる変化は見落とす」「欄ごとに `settleMs` を 2 回（focus 後と値の変更後）使う」。値は書かれていない |
| `:59` | `CHANGE_ON_INPUT_SETTLE_MS,`（import） |
| `:86-87` | `settleMs?: number;`（説明は `default: CHANGE_ON_INPUT_SETTLE_MS`） |
| `:501` | `settleMs = CHANGE_ON_INPUT_SETTLE_MS,` |
| `:509-512` | 正の有限数でなければ Error |
| `:678` | 欄に focus した後 `settleMs`（**今回縮まる**） |
| `:714` | 値を変えて blur した後 `settleMs`（**今回縮まる**） |

この定数は `src/index.ts` から公開していない。change-on-input-check はリリース済み（0.12.0）なので、CHANGELOG の `### Changed` に書く。
README（`README.ja.md:82`、`README.md:97`）は `settleMs` の名前だけで値は書いていない。

### 時間に関わる fixture（計画時に確認済み）

| fixture | 中身 | 250 ms との関係 |
|---|---|---|
| `test/fixtures/pages/change-on-input/focus-delayed.html` | focus の 50 ms 後に alert | 250 ms の窓の中 |
| `test/fixtures/pages/change-on-input/select-async-focus.html` | 値の変更の 100 ms 後にフォーカスを移す | 250 ms の窓の中 |

どちらも ×0.25（125 ms）でも一致した。`test/change-on-input.spec.ts:453` は `settleMs: 0` で Error になることを確かめるテストで、既定値に依存しない。

### 守る書き方

- TypeScript ESM、2 スペース、シングルクォート、末尾カンマ（Prettier + ESLint を CI で強制）。
- テストはビルド済みの `../dist/…` を import する。定数を読む前例: `test/accessible-authentication.spec.ts:10`。
- テスト名は日本語で「どんな条件で・何をすると・どうなるか」。
- コミット例: `perf(a11y-audit): halve change-on-input-check settle wait (500 → 250 ms)`。

## 使うコマンド

| 目的 | コマンド（リポジトリ直下。worktree なら `npm --prefix <worktree> run <script>`） | 成功の目安 |
|---|---|---|
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 1 ファイルのテスト | `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/change-on-input.spec.ts`（先にビルド） | 全件成功 |
| 全体の検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |
| 整形 | `npx prettier --write <path>` | ファイルが書き換わる |

## 範囲

**変更してよいファイル**:
- `packages/a11y-audit/src/constants.ts`（`CHANGE_ON_INPUT_SETTLE_MS` の値と説明コメントだけ）
- `packages/a11y-audit/test/change-on-input.spec.ts`（テスト 1 つ追加）
- `packages/a11y-audit/CHANGELOG.md`
- `plans/README.md`（行の更新）

**触らない**:
- `runChangeOnInputCheck.ts`（既定値は定数から取るので、コードの変更は要らない）。
- `CHANGE_ON_INPUT_TIMEOUT_MS`、`CHANGE_ON_INPUT_MAX_CONTROLS`。
- `MOTION_SIMULATION_SETTLE_MS`（同じ 500 だが別の検査の値）。
- 他の検査のファイル、README、バージョン欄。
- 計測スクリプトと計測結果（`packages/a11y-audit/test-results/` と `tmp/` は gitignore 済み）。

## Git の進め方

- ブランチ: `perf/change-on-input-settle`
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
node packages/a11y-audit/test-results/spike-021/measure.mjs <url> --page <name> --checks change-on-input-check --out tmp/spike-021/before-<name>.jsonl
```

**確認**: 5 ファイルとも 1 行ずつあり、`"error"` を含まない。

計測は欄を実際に操作する。結果文書の第 1 節のとおり、この 5 ページでフォーム送信などの副作用は見ていない。
もし送信後の URL への遷移など副作用が疑われる挙動が出たら、そのページの計測を止めて報告する。

### ステップ 2: 失敗するテストを書く

`test/change-on-input.spec.ts` に足す:

```ts
import { CHANGE_ON_INPUT_SETTLE_MS } from '../dist/constants.js';

test('欄を操作した後の既定の待ちは 250ms（Plan 021 で 500ms と結果が同じで、125ms では実ページで判定が変わった値）', () => {
  expect(CHANGE_ON_INPUT_SETTLE_MS).toBe(250);
});
```

ビルドしてこのファイルを実行する。**確認**: 新しいテストだけが `Expected: 250 / Received: 500` で落ちる。

### ステップ 3: 既定値を変える

`src/constants.ts` の `CHANGE_ON_INPUT_SETTLE_MS = 500` を `250` にし、説明コメントに根拠を足す:

```ts
/**
 * Wait after each value change for a context change to surface. 250 ms gave the
 * same results as 500 ms on 5 public pages and 12 fixtures; 125 ms changed a
 * verdict on Wikipedia (plans/021-result-slow-check-timing.md).
 */
export const CHANGE_ON_INPUT_SETTLE_MS = 250;
```

ビルドしてこのファイルを実行する。**確認**: 全件成功。

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
- `durationMs` の合計が変更前より短い（目安は 5 ページ合計で 1 割強短い。w3c-bad は遷移の待ちが大半なのでほぼ変わらない）。

### ステップ 6: CHANGELOG

`## Unreleased` の `### Changed` に書く:

```md
- `change-on-input-check`: the default wait after focusing and after changing
  each control (`settleMs`) is now 250 ms (was 500 ms). On 5 public pages and
  the change-on-input fixtures the results were the same. A context change that
  surfaces 250–500 ms later is now missed by default; pass `settleMs: 500` to
  keep the old window.
```

### ステップ 7: CLI のスモークを手元で再現

```bash
node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" --checks all --output-dir /tmp/cli-smoke-028
```

**確認**: `Errors:       0`。

## テスト計画

| テスト | 種類 | 変更前 | 変更後 |
|---|---|---|---|
| 欄を操作した後の既定の待ちは 250ms | 追加 | 落ちる（500） | 通る |
| `change-on-input.spec.ts` の既存テスト（`focus-delayed` と `select-async-focus` を含む） | 既存 | 通る | 通る |
| 実ページ 5 つの比較（ステップ 5） | 手動 | — | 集合がすべて一致 |

## 完了条件

- [ ] 全体の検証コマンドが exit 0
- [ ] `git grep -n 'CHANGE_ON_INPUT_SETTLE_MS = 250' -- packages/a11y-audit/src/constants.ts` が 1 行
- [ ] ステップ 5 で 5 ページとも一致し、PR 本文に 5 ページの変更前後の秒数を表で載せる
- [ ] ステップ 7 で `Errors:       0`
- [ ] `git status --porcelain` に範囲内のファイルしか出ない
- [ ] `plans/README.md` の 028 の行を更新

## STOP 条件

- 差分確認で範囲内のファイルが変わっていて、「現状」の抜粋と食い違う。
- ステップ 2 の新しいテストが、値の不一致以外の理由で落ちる。
- ステップ 3 の後に既存テストが落ちる。テストに `settleMs` を足して通す、待ちを延ばす、テストを消す、のどれもしない。どのテストがどう落ちたかを報告する。
- ステップ 5 でどれかのページの集合が一致しない。同じページで変更前の計測をもう 1 回取り、変更前どうしでも同じ差が出るかを確かめてから報告する。
- 実ページに届かない、または計測中に副作用が疑われる挙動が出た。

## 保守メモ

- 250 ms より短くしない（125 ms で Wikipedia の判定が変わった）。
- この検査の時間の大半は遷移の後の回復なので、さらに縮めるなら待ちではなくそちらを調べる（今回の範囲外）。
