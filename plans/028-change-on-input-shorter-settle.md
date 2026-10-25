# Plan 028: change-on-input-check の値変更後の待ちを 500 → 250 ms に半分にする（focus 後は 500 ms のまま）

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。完了したら `plans/README.md` のこのプランの行を更新する
> （レビュアーが索引を管理すると言った場合は除く）。
>
> **差分確認（最初に実行）**:
> `git diff --stat 143e564..HEAD -- packages/a11y-audit/src/constants.ts packages/a11y-audit/src/playwright/runChangeOnInputCheck.ts packages/a11y-audit/test/change-on-input.spec.ts packages/a11y-audit/test/fixtures/pages/change-on-input/ packages/a11y-audit/CHANGELOG.md`
> 2026-10-25 時点の差分は、同系列の Plan 022–027 による行のずれと `settleMs` の検証式の整形（`runChangeOnInputCheck.ts:508-512`）だけで、「現状」の抜粋と食い違わないことを確認済み。これ以外の差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **Codex plan review**: 通過（1 巡目、2026-10-25、見送った low 0 件）。medium 1 件（focus 後の待ちを縮めると誤検出が増える）を反映し、masuP9 の判断で「値変更後だけ縮める」設計に変えた。
- **優先度**: P3（効果が小さい。他の変更のついでに入れてよい）
- **工数**: S
- **リスク**: MED（×0.25 = 125 ms では実ページで検出が変わった。250 ms は確かめた範囲の下限）
- **依存**: なし（根拠は Plan 021 の結果文書 `plans/021-result-slow-check-timing.md`）
- **カテゴリ**: perf
- **計画時点**: commit `143e564`, 2026-10-16（2026-10-25 に設計を改訂）
- **同じ系列のプラン**: 1 検査 1 プランで待ちを半分にする。022 pointer-cancellation / 023 content-on-hover / 024 keyboard-trap / 025 focus-indicator / 026 focus-order / 027 keyboard-reachability / 028 change-on-input。互いに独立で、どの順でも入れられる。

## なぜ重要か

Plan 021 の計測（結果文書の第 3 節）で、change-on-input-check の時間のうち決まった秒数の待ちは 28% だけだった。
残りはページ遷移の後の回復などの実処理で、待ちを縮めても縮む量は小さい。

| 確かめた範囲（Plan 021 は focus 後・値変更後の両方を縮めて測った） | 結果 |
|---|---|
| 公開 5 ページ、×0.5（250 ms） | `nodes` / `targets` / `untested` / `aborted` がすべて一致 |
| ×0.25（125 ms） | **Wikipedia で検出が変わった**（試せなかった欄が試せるようになり、別の欄の判定が `no-change` から `focus-moved` に変わった） |
| リポジトリの fixture 12 件 | ×0.5 / ×0.25 とも全件一致 |
| 5 ページ合計の所要時間 | 32.1 秒 → 27.5 秒（−14%）。最大でも Wikipedia の約 3.3 秒 |

結果文書の第 6 節の 4 番目に従い、×0.5 までにとどめる。

### focus 後の待ちは縮めない理由

`runChangeOnInputCheck.ts` は欄に focus した後 `settleMs` 待ち、その間に変化（フォーカス移動・遷移・新しいウィンドウ・ダイアログ）があれば
「focus で起きた変化」（3.2.1）として欄を `skipped`（`context-change-on-focus`）にする。変化がなければ記録をリセットし、
そこから後の変化を値の変更によるもの（3.2.2）として数える。

focus 後の待ちまで 250 ms にすると、focus から 250〜500 ms 後に出る変化は、リセットの後に記録されて **3.2.2 の finding になる**。
「遅い変化を見落とす」のではなく「誤検出が増える」ので、focus 後は 500 ms のまま残し、値変更後の待ちだけ 250 ms にする。
縮む量は Plan 021 の計測のおよそ半分（5 ページ合計で 1 割弱）になる見込み。

## 現状

すべて `packages/a11y-audit/` 配下。行番号は 2026-10-25（commit `f8b29f5`）時点。

`src/constants.ts:810-812`:

```ts
/** Wait after each value change for a context change to surface. */
export const CHANGE_ON_INPUT_SETTLE_MS = 500;
```

`src/playwright/runChangeOnInputCheck.ts`:

| 行 | 内容 |
|---|---|
| `:29-32` | ファイル冒頭の説明。「`settleMs` を過ぎてから起きる変化は見落とす」「欄ごとに `settleMs` を 2 回（focus 後と値の変更後）使う」。値は書かれていない |
| `:59` 付近 | `CHANGE_ON_INPUT_SETTLE_MS,`（import） |
| `:86-87` | `settleMs?: number;`（説明は `default: CHANGE_ON_INPUT_SETTLE_MS`） |
| `:501` | `settleMs = CHANGE_ON_INPUT_SETTLE_MS,` |
| `:508-512` | 正の有限数でなければ Error |
| `:678-692` | 欄に focus → `await page.waitForTimeout(settleMs);`（`:680`、**今回は 500 ms のまま残す**）→ 変化があれば `changedOnFocus` |
| `:694` | `resetRecords();`（ここから後は値の変更による変化として数える） |
| `:716` | 値を変えて blur した後 `await page.waitForTimeout(settleMs);`（**今回 250 ms に縮まる**） |

この定数は `src/index.ts` から公開していない。CLI（`src/cli.ts`）とテストは `settleMs` を渡していない
（`test/change-on-input.spec.ts` の `settleMs: 0` で Error になることを確かめるテストだけ）。
change-on-input-check はリリース済み（0.12.0）なので、CHANGELOG の `### Changed` に書く。
README（`README.ja.md:83`、`README.md:98`）は「`settleMs` を過ぎてから起きる変化は見落とす」とだけ書き、値は書いていない。
変更後も値の変更後の窓としては正しいので、README は触らない。

### 時間に関わる fixture（計画時に確認済み）

| fixture | 中身 | 変更後との関係 |
|---|---|---|
| `test/fixtures/pages/change-on-input/focus-delayed.html` | focus の 50 ms 後に alert。期待は findings なし・`#trap` が `context-change-on-focus` | focus 後 500 ms の窓の中 |
| `test/fixtures/pages/change-on-input/select-async-focus.html` | 値の変更の 100 ms 後にフォーカスを移す | 値変更後 250 ms の窓の中 |

### 守る書き方

- TypeScript ESM、2 スペース、シングルクォート、末尾カンマ（Prettier + ESLint を CI で強制）。
- テストはビルド済みの `../dist/…` を import する。定数を読む前例: `test/accessible-authentication.spec.ts:10`。
- fixture は既存の `focus-delayed.html` と同じ形（冒頭コメントに中身と期待値を書く）。
- テスト名は日本語で「どんな条件で・何をすると・どうなるか」。
- コミット例: `perf(a11y-audit): halve change-on-input-check wait after value change (500 → 250 ms)`。

## 使うコマンド

| 目的 | コマンド（リポジトリ直下。worktree なら `npm --prefix <worktree> run <script>`） | 成功の目安 |
|---|---|---|
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 1 ファイルのテスト | `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/change-on-input.spec.ts`（先にビルド） | 全件成功 |
| 全体の検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |
| 整形 | `npx prettier --write <path>` | ファイルが書き換わる |

## 範囲

**変更してよいファイル**:
- `packages/a11y-audit/src/constants.ts`（`CHANGE_ON_INPUT_SETTLE_MS` の値と説明コメント、`CHANGE_ON_INPUT_FOCUS_SETTLE_MS` の追加だけ）
- `packages/a11y-audit/src/playwright/runChangeOnInputCheck.ts`（import、`:29-32` の冒頭説明、`settleMs` の JSDoc、`:680` の focus 後の待ちだけ）
- `packages/a11y-audit/test/fixtures/pages/change-on-input/focus-delayed-300.html`（新規）
- `packages/a11y-audit/test/change-on-input.spec.ts`（テスト 3 つ追加）
- `packages/a11y-audit/CHANGELOG.md`
- `plans/README.md`（行の更新）

**触らない**:
- `runChangeOnInputCheck.ts` の上記以外（`:716` の値変更後の待ちは `settleMs` のままで、既定値は定数から取るのでコードの変更は要らない）。
- `CHANGE_ON_INPUT_TIMEOUT_MS`、`CHANGE_ON_INPUT_MAX_CONTROLS`。
- `MOTION_SIMULATION_SETTLE_MS`（同じ 500 だが別の検査の値）。
- `settleMs` 以外の新しい option（focus 後の待ちを別の option にはしない）。
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

### ステップ 2: 誤検出を防ぐ fixture とテストを先に足す（変更前から通る）

`test/fixtures/pages/change-on-input/focus-delayed-300.html` を作る。`focus-delayed.html` と同じで、alert までの遅れだけ 300 ms にする:

```html
<!doctype html>
<!--
  Focusing the select opens an alert 300ms later: after the 250ms wait that
  follows a value change, but inside the 500ms wait that follows focus. The
  change event has no handler.
  Expected: no findings; #trap is skipped with reason
  "context-change-on-focus" (the alert is On Focus, 3.2.1, not On Input).
-->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Dialog 300ms after focus</title>
  </head>
  <body>
    <label for="trap">Trap</label>
    <select
      id="trap"
      onfocus="
        setTimeout(function () {
          alert('later');
        }, 300)
      "
    >
      <option>A</option>
      <option>B</option>
    </select>
  </body>
</html>
```

`test/change-on-input.spec.ts` の `focus-delayed.html` のテストの直後に、同じ形で足す:

```ts
test('focus の 300ms 後に alert を出す select は finding にせず context-change-on-focus で skipped にする', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runChange(
    'focus-delayed-300.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.findings).toEqual([]);
  expect(result.details.skipped).toContainEqual({
    selector: '#trap',
    reason: 'context-change-on-focus',
  });
});
```

ビルドしてこのファイルを実行する。**確認**: 新しいテストを含めて全件成功（変更前は両方の待ちが 500 ms なので通る。これは focus 後の待ちを縮めたときに落ちる見張りのテスト）。

### ステップ 3: 失敗するテストを書く

`test/change-on-input.spec.ts` に足す:

```ts
import {
  CHANGE_ON_INPUT_FOCUS_SETTLE_MS,
  CHANGE_ON_INPUT_SETTLE_MS,
} from '../dist/constants.js';

test('値を変えた後の既定の待ちは 250ms（Plan 021 で 500ms と結果が同じで、125ms では実ページで判定が変わった値）', () => {
  expect(CHANGE_ON_INPUT_SETTLE_MS).toBe(250);
});

test('focus した後の待ちは 500ms のまま（縮めると focus 起因の遅い変化を入力起因の finding にしてしまう）', () => {
  expect(CHANGE_ON_INPUT_FOCUS_SETTLE_MS).toBe(500);
});
```

ビルドする。**確認**: `CHANGE_ON_INPUT_FOCUS_SETTLE_MS` がまだ無いので、typecheck かテストの実行で import の失敗として落ちる。
これは期待どおり（定数が無いことが失敗の理由）。

### ステップ 4: 定数を変え、focus 後の待ちを分ける

`src/constants.ts` の `CHANGE_ON_INPUT_SETTLE_MS` を次に置き換える:

```ts
/**
 * Wait after each value change for a context change to surface. 250 ms gave the
 * same results as 500 ms on 5 public pages and 12 fixtures; 125 ms changed a
 * verdict on Wikipedia (plans/021-result-slow-check-timing.md).
 */
export const CHANGE_ON_INPUT_SETTLE_MS = 250;
/**
 * Minimum wait after focusing each control, before its value changes. Kept at
 * 500 ms: a change that surfaces after this wait is counted as caused by the
 * value change (3.2.2) instead of by focus (3.2.1).
 */
export const CHANGE_ON_INPUT_FOCUS_SETTLE_MS = 500;
```

`src/playwright/runChangeOnInputCheck.ts`:

- import に `CHANGE_ON_INPUT_FOCUS_SETTLE_MS` を足す。
- `:680` を `await page.waitForTimeout(Math.max(settleMs, CHANGE_ON_INPUT_FOCUS_SETTLE_MS));` にする
  （`settleMs` を 500 より大きくすれば focus 後も延び、`settleMs: 500` で変更前と同じ動きに戻る）。
- `:29-32` の冒頭説明の「欄ごとに `settleMs` を 2 回」を、「値の変更後に `settleMs`、focus 後に `settleMs` と `CHANGE_ON_INPUT_FOCUS_SETTLE_MS` の大きい方」と分かる文に直す。
- `settleMs` の JSDoc（`:86-87`）に、値の変更後の待ちであり、focus 後の待ちは `CHANGE_ON_INPUT_FOCUS_SETTLE_MS` を下回らないことを 1 行足す。

ビルドしてこのファイルを実行する。**確認**: 全件成功（ステップ 2 の `focus-delayed-300` を含む）。

### ステップ 5: 全体の検証

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` が exit 0。

### ステップ 6: 変更後の実ページ結果を取り、変更前と比べる

テストを実行すると Playwright が `packages/a11y-audit/test-results/` を丸ごと消すので、計測スクリプトも消えている。まずステップ 1 の `node -e` をもう一度実行してスクリプトを取り出し直す（計測結果はリポジトリ直下の `tmp/spike-021/` に書くので消えない。`/tmp` は gitignore 済み）。

ビルドしてから、ステップ 1 と同じコマンドを `--out tmp/spike-021/after-<name>.jsonl` で 5 ページ実行し、比べる:

```bash
node packages/a11y-audit/test-results/spike-021/compare.mjs tmp/spike-021/before-<name>.jsonl tmp/spike-021/after-<name>.jsonl
```

**確認**:
- 5 ページとも `nodes.same` / `targets.same` / `untested.same` / `aborted.same` が `true`。
- `durationMs` の合計が変更前より短い（目安は 5 ページ合計で 1 割弱短い。Plan 021 の −14% は focus 後も縮めた値なので、その半分程度になる。w3c-bad は遷移の待ちが大半なのでほぼ変わらない）。

### ステップ 7: CHANGELOG

`## Unreleased` の `### Changed` に書く:

```md
- `change-on-input-check`: the default wait after changing each control
  (`settleMs`) is now 250 ms (was 500 ms). The wait after focusing each control
  stays at 500 ms (or `settleMs` if larger), so a change that surfaces late
  after focus is still attributed to focus, not reported as a change on input.
  On 5 public pages and the change-on-input fixtures the results were the same.
  A context change that surfaces 250–500 ms after a value change is now missed
  by default; pass `settleMs: 500` to keep the old behavior.
```

### ステップ 8: CLI のスモークを手元で再現

```bash
node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" --checks all --output-dir /tmp/cli-smoke-028
```

**確認**: `Errors:       0`。

## テスト計画

| テスト | 種類 | 変更前 | 変更後 |
|---|---|---|---|
| focus の 300ms 後に alert を出す select は skipped（`focus-delayed-300`） | 追加 | 通る | 通る（focus 後も 250 ms にすると落ちる） |
| 値を変えた後の既定の待ちは 250ms | 追加 | 落ちる（500） | 通る |
| focus した後の待ちは 500ms のまま | 追加 | 落ちる（定数が無い） | 通る |
| `change-on-input.spec.ts` の既存テスト（`focus-delayed` と `select-async-focus` を含む） | 既存 | 通る | 通る |
| 実ページ 5 つの比較（ステップ 6） | 手動 | — | 集合がすべて一致 |

## 完了条件

- [ ] 全体の検証コマンドが exit 0
- [ ] `git grep -n -e 'CHANGE_ON_INPUT_SETTLE_MS = 250' -e 'CHANGE_ON_INPUT_FOCUS_SETTLE_MS = 500' -- packages/a11y-audit/src/constants.ts` が 2 行
- [ ] `git grep -n 'Math.max(settleMs, CHANGE_ON_INPUT_FOCUS_SETTLE_MS)' -- packages/a11y-audit/src/playwright/runChangeOnInputCheck.ts` が 1 行
- [ ] ステップ 6 で 5 ページとも一致し、PR 本文に 5 ページの変更前後の秒数を表で載せる
- [ ] ステップ 8 で `Errors:       0`
- [ ] `git status --porcelain` に範囲内のファイルしか出ない
- [ ] `plans/README.md` の 028 の行を更新

## STOP 条件

- 差分確認で範囲内のファイルが変わっていて、「現状」の抜粋と食い違う。
- ステップ 2 の `focus-delayed-300` のテストが変更前のコードで落ちる（fixture か前提が違う）。
- ステップ 3 の新しいテストが、値の不一致・定数が無いこと以外の理由で落ちる。
- ステップ 4 の後に既存テストが落ちる。テストに `settleMs` を足して通す、待ちを延ばす、テストを消す、のどれもしない。どのテストがどう落ちたかを報告する。
- ステップ 6 でどれかのページの集合が一致しない。同じページで変更前の計測をもう 1 回取り、変更前どうしでも同じ差が出るかを確かめてから報告する。
- 実ページに届かない、または計測中に副作用が疑われる挙動が出た。

## 保守メモ

- 値変更後の待ちを 250 ms より短くしない（125 ms で Wikipedia の判定が変わった）。
- focus 後の待ちは縮めない。縮めると、focus から遅れて出る変化が 3.2.2 の finding になる（`focus-delayed-300` が見張る）。
- この検査の時間の大半は遷移の後の回復なので、さらに縮めるなら待ちではなくそちらを調べる（今回の範囲外）。
