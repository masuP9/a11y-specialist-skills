# Plan 025: focus-indicator-check の Tab ごとの待ちを 50 → 25 ms に半分にする

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。完了したら `plans/README.md` のこのプランの行を更新する
> （レビュアーが索引を管理すると言った場合は除く）。
>
> **差分確認（最初に実行）**:
> `git diff --stat 143e564..HEAD -- packages/a11y-audit/src/constants.ts packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts packages/a11y-audit/test/focus-navigation.spec.ts packages/a11y-audit/CHANGELOG.md`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。
> 同じ系列のプラン（024 / 026 / 027）が先に入って `DEFAULT_NAVIGATION_SETTLE_MS` の使われ方が変わっているのは想定内。
> **024〜027 をまとめて実施する手順は 024 の「024〜027 をまとめて実施するとき」にある。**
> **計画後の変更（2026-10-25 追記）**: `runFocusIndicatorCheck.ts` は Plan 030（フォーカスした要素が画面に出ているかを `allElements[].visibility` に記録）、031（見えないと測った要素を、この Tab の待ちの後にもう一度測る）、032（id のエスケープ）で変わった。既定値は今 `:269`、説明は `:212`、Tab ごとの待ちは `:631`。031 の測り直しはこの待ちの後に行うので、待ちを縮めると visibility の結果が変わりうる。021 の計測は visibility を比べていないため、ステップ 5b で別に比べる。

## ステータス

- **Codex plan review**: 通過（2 巡目、2026-10-25、024〜027 をまとめて審査、見送った low 0 件）

- **優先度**: P3
- **工数**: S
- **リスク**: MED（この待ちは「フォーカスで起きる遷移（WCAG 3.2.1）」を捕まえる窓でもある。Tab の後 25〜50 ms で遷移するページは既定では見落としうる）
- **依存**: なし（根拠は Plan 021 の結果文書 `plans/021-result-slow-check-timing.md`）
- **カテゴリ**: perf
- **計画時点**: commit `143e564`, 2026-10-16
- **同じ系列のプラン**: 1 検査 1 プランで待ちを半分にする。022 pointer-cancellation / 023 content-on-hover / 024 keyboard-trap / 025 focus-indicator / 026 focus-order / 027 keyboard-reachability / 028 change-on-input。互いに独立で、どの順でも入れられる。

## なぜ重要か

Plan 021 の計測（結果文書の第 3 節）で、focus-indicator-check の時間の 71% は Tab ごとの 50 ms の待ちだった。
Wikipedia では 19.9 秒、MDN では 13.8 秒かかる。

| 確かめた範囲 | 結果 |
|---|---|
| 公開 5 ページ、×0.5（25 ms） | `nodes` / `targets` / `untested` / `aborted` がすべて一致 |
| ×0.25（12.5 ms） | 一致 |
| リポジトリの fixture 8 件 | ×0.5 / ×0.25 とも全件一致 |
| 5 ページ合計の所要時間 | 50.8 秒 → 31.6 秒（−38%） |

結果文書の第 5 節の限界: 実ページ標本に「フォーカス後に遅れて動くハンドラ」を持つページがない。
短くするほどそうしたページで 3.2.1 を見落とす余地が増えるので、×0.5 で止める。

## 現状

すべて `packages/a11y-audit/` 配下。行番号は commit `143e564` 時点。

`src/constants.ts:98-99`（Tab 系 4 検査が共有している既定値）:

```ts
/** Default ms to wait after each Tab press for a focus-triggered navigation to surface. */
export const DEFAULT_NAVIGATION_SETTLE_MS = 50;
```

使っているのは keyboard-trap / focus-indicator / focus-order / keyboard-reachability の 4 検査。
1 検査ずつ変えるため、共有の定数は**値を変えず**、focus-indicator-check 専用の定数を足して既定値をそちらに切り替える。
このプランで最後の使用者がいなくなったら、共有の定数ごと消す（ステップ 3 の 5）。

`src/playwright/runFocusIndicatorCheck.ts`:

| 行 | 内容 |
|---|---|
| `:34` | `DEFAULT_NAVIGATION_SETTLE_MS,`（import） |
| `:205-211` | `navigationSettleMs` の説明。`to surface (default: 50).` と**数値が直書き**されている |
| `:264` | `navigationSettleMs = DEFAULT_NAVIGATION_SETTLE_MS,` |
| `:355-359` | 「遅いハンドラのページでは `navigationSettleMs` を上げる」というコメント。そのままでよい |
| `:571-572` | Tab ごとに `await page.waitForTimeout(navigationSettleMs);`（**今回縮まるのはここ**） |

テスト側の既定値への言及:

- `test/focus-navigation.spec.ts:70-71` のコメント `beyond the default 50ms settle window.`。テスト自体は `navigationSettleMs: 600` を明示していて、既定値に依存しない。
- `test/focus-navigation-culprit.spec.ts:195,212`、`test/time-budget.spec.ts:127` も値を明示している。

新しい定数は `src/constants.ts` の「Focus Indicator Detection Constants (WCAG 2.4.7)」の節（`:55` から。`DEFAULT_NAVIGATION_SETTLE_MS` の `:99` もこの節）に置く。
この定数群は `src/index.ts` から公開していない。focus-indicator-check はリリース済みなので、CHANGELOG の `### Changed` に書く。

### 守る書き方

- TypeScript ESM、2 スペース、シングルクォート、末尾カンマ（Prettier + ESLint を CI で強制）。
- テストはビルド済みの `../dist/…` を import する。
- **まだ無い定数を読むテストは `import * as constants from '../dist/constants.js'` で書く**。名前付き import にすると、定数が無い間はファイルの読み込み自体が失敗し、「期待どおりの理由で落ちる」を確かめられない。
- テスト名は日本語で「どんな条件で・何をすると・どうなるか」（このファイルの既存テストは英語名だが、新しいテストは日本語でよい）。
- コミット例: `perf(a11y-audit): halve focus-indicator-check Tab settle wait (50 → 25 ms)`。

## 使うコマンド

| 目的 | コマンド（リポジトリ直下。worktree なら `npm --prefix <worktree> run <script>`） | 成功の目安 |
|---|---|---|
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 1 ファイルのテスト | `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/focus-navigation.spec.ts`（先にビルド） | 全件成功 |
| 全体の検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |
| 整形 | `npx prettier --write <path>` | ファイルが書き換わる |

## 範囲

**変更してよいファイル**:
- `packages/a11y-audit/src/constants.ts`（新しい定数 1 つ。`DEFAULT_NAVIGATION_SETTLE_MS` は使用者がいなくなったときだけ削除）
- `packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts`（import、`:205-211` の説明、`:264` の既定値だけ）
- `packages/a11y-audit/test/focus-navigation.spec.ts`（テスト 1 つ追加と、`:71` のコメント）
- `packages/a11y-audit/CHANGELOG.md`
- `plans/README.md`（行の更新）

**触らない**:
- `DEFAULT_NAVIGATION_SETTLE_MS` の値（他の検査の既定値）。
- `runFocusIndicatorCheck.ts` の遷移の扱い（`:355` 以降の `framenavigated` の処理など）。
- 他の検査のファイル、README（この待ちは README に書かれていない）、バージョン欄。
- 計測スクリプトと計測結果（`packages/a11y-audit/test-results/` と `tmp/` は gitignore 済み）。

## Git の進め方

- ブランチ: `perf/focus-indicator-settle`
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
node packages/a11y-audit/test-results/spike-021/measure.mjs <url> --page <name> --checks focus-indicator-check --out tmp/spike-021/before-<name>.jsonl
```

**確認**: 5 ファイルとも 1 行ずつあり、`"error"` を含まない。

### ステップ 2: 失敗するテストを書く

`test/focus-navigation.spec.ts` に足す:

```ts
import * as constants from '../dist/constants.js';

test('focus-indicator-check の Tab ごとの既定の待ちは 25ms（Plan 021 で 5 ページと fixture 8 件の結果が 50ms と同じだった値）', () => {
  expect(
    (constants as unknown as Record<string, unknown>).FOCUS_INDICATOR_NAVIGATION_SETTLE_MS,
  ).toBe(25);
});
```

ビルドしてこのファイルを実行する。**確認**: 新しいテストだけが `Expected: 25 / Received: undefined` で落ちる。

### ステップ 3: 専用の定数を足し、既定値を切り替える

1. `src/constants.ts` の Focus Indicator の節（`DEFAULT_NAVIGATION_SETTLE_MS` の近く）に足す:
   ```ts
   /**
    * focus-indicator-check: wait after each Tab press for a focus-triggered navigation
    * to surface. 25 ms gave the same results as the shared 50 ms on 5 public pages and
    * 8 fixtures (plans/021-result-slow-check-timing.md).
    */
   export const FOCUS_INDICATOR_NAVIGATION_SETTLE_MS = 25;
   ```
2. `runFocusIndicatorCheck.ts` の import の `DEFAULT_NAVIGATION_SETTLE_MS` を `FOCUS_INDICATOR_NAVIGATION_SETTLE_MS` に替え、`:264` を `navigationSettleMs = FOCUS_INDICATOR_NAVIGATION_SETTLE_MS,` にする。
3. `:207` の説明の `(default: 50)` を `(default: 25)` にする。
4. `test/focus-navigation.spec.ts:71` のコメント `the default 50ms settle window` を `the default 25ms settle window` にする。
5. `git grep -n 'DEFAULT_NAVIGATION_SETTLE_MS' -- packages/a11y-audit` が `constants.ts` の定義 1 行だけになったら、その定義（とすぐ上の説明コメント）を消す。他の使用者が残っていれば何もしない。

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
- `durationMs` の合計が変更前より短い（目安は 5 ページ合計で 4 割弱短い）。

### ステップ 5b: visibility の結果を 50 ms と 25 ms で比べる

021 の `measure.mjs` は `allElements[].visibility` を残さないので、これだけは別に比べる。変更後のビルドで、`runFocusIndicatorCheck` に `navigationSettleMs` を渡して既定値（25）と 50 を同じビルドで比べる（ソースは変えない）。

1. 使い捨てのスクリプトを `packages/a11y-audit/test-results/visibility-025/compare-visibility.mjs` に書く（gitignore 済み。コミットしない）。`../../dist/index.js` の `runFocusIndicatorCheck` を、同じ URL に対して `navigationSettleMs: 50` で 2 回、指定なし（既定の 25）で 1 回実行する。各回の `allElements` から、キーを `` `${frame ?? ''}|${tabStep}|${selector}` ``、値を `` `${visibility.visible}|${visibility.reason}` `` にした対応表を作り、次を JSON 1 行で出す:
   - `worse`: 50 ms の 2 回とも `visible` が `true` か `null` なのに、25 ms で `false` になったキー（悪くなったもの）
   - `changed`: 値が変わったキーすべて
   - `flake`: 50 ms の 2 回どうしで値が違うキー（もともと揺れるもの）
   - `onlyIn50` / `onlyIn25`: 片方にしか無いキーの数
   引数の形や `frame` の持ち方が上と違えば、実際の型（`src/types.ts` の `FocusRecord` / `FocusVisibility`）に合わせる。
2. 実ページ 5 つ（ステップ 1 の表）と、visibility の fixture（`test/fixtures/pages/focus-indicator/visibility-*.html` の全件。`file://` の URL で渡す）で実行する。

**確認**:
- 実ページと fixture のすべてで、`worse` のうち `flake` に入っていないものが 0 件。
- `changed` から `flake` を除いたものが 0 件でなければ、その内容を PR 本文に載せる（`worse` でないなら、悪くなったわけではない）。
- 既存の `test/focus-visibility.spec.ts` はステップ 4 で通っていること（既定値 25 ms で fixture の期待値どおり）。

### ステップ 6: CHANGELOG

`## Unreleased` の `### Changed` に書く:

```md
- `focus-indicator-check`: the default wait after each Tab press
  (`navigationSettleMs`) is now 25 ms (was 50 ms). On 5 public pages and the
  focus-indicator fixtures the results were the same, and the check took about
  38% less time. A navigation that a focus handler starts 25–50 ms later may now
  be missed or attributed to a neighboring element; pass `navigationSettleMs: 50`
  (or more) for such pages.
```

### ステップ 7: CLI のスモークを手元で再現

```bash
node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" --checks all --output-dir /tmp/cli-smoke-025
```

**確認**: `Errors:       0`。

## テスト計画

| テスト | 種類 | 変更前 | 変更後 |
|---|---|---|---|
| focus-indicator-check の Tab ごとの既定の待ちは 25ms | 追加 | 落ちる（undefined） | 通る |
| `focus-*.spec.ts`、`time-budget.spec.ts` など focus-indicator-check を走らせる既存テスト | 既存 | 通る | 通る |
| 実ページ 5 つの比較（ステップ 5） | 手動 | — | 集合がすべて一致 |

## 完了条件

- [ ] 全体の検証コマンドが exit 0
- [ ] `git grep -n 'DEFAULT_NAVIGATION_SETTLE_MS' -- packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts` が 0 行
- [ ] `git grep -n 'default: 50' -- packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts` が 0 行
- [ ] ステップ 5 で 5 ページとも一致し、PR 本文に 5 ページの変更前後の秒数を表で載せる
- [ ] ステップ 5b で、実ページ 5 つと visibility の fixture 全件の `worse`（`flake` を除く）が 0 件。PR 本文に件数を載せる
- [ ] ステップ 7 で `Errors:       0`
- [ ] `git status --porcelain` に範囲内のファイルしか出ない
- [ ] `plans/README.md` の 025 の行を更新

## STOP 条件

- 差分確認で `runFocusIndicatorCheck.ts` が変わっていて、「現状」の抜粋と食い違う。
- ステップ 2 の新しいテストが、値の不一致以外の理由で落ちる。
- ステップ 3 の後に既存テストが落ちる。特に、フォーカスで起きる遷移を既定値のまま確かめているテストが落ちたら、それはこの変更で見落としが増えた証拠なので、テストに `navigationSettleMs` を足して通さない。どのテストがどう落ちたかを報告する。
- ステップ 5 でどれかのページの集合が一致しない。同じページで変更前の計測をもう 1 回取り、変更前どうしでも同じ差が出るかを確かめてから報告する。
- ステップ 5b で、`flake` に入っていない `worse` が 1 件でもある（待ちを縮めたせいで「見えない」が増えた）。focus-indicator-check の既定値は 50 のまま据え置くか、031 の測り直しの待ちを Tab の待ちと分けるかは masuP9 が決めるので、該当の URL・キー・値を添えて報告する。024 / 026 / 027 だけ先に進めることもしない。
- `test/focus-visibility.spec.ts` が既定値 25 ms で落ちる。テストに `navigationSettleMs` を足して通さない。
- 実ページに届かない。fixture だけで済ませない。

## 保守メモ

- 25 ms より短くするのは、結果文書の第 6 節「やらない」に従い見送る。
- 3.2.1 の見落としの報告があれば、まず既定値を 50 に戻す。遅いハンドラを持つ fixture を足して境界を測り直すのが次の一手。
