# Plan 022: pointer-cancellation-check の押下後の待ちを 300 → 150 ms に半分にする

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。完了したら `plans/README.md` のこのプランの行を更新する
> （レビュアーが索引を管理すると言った場合は除く）。
>
> **差分確認（最初に実行）**:
> `git diff --stat 143e564..HEAD -- packages/a11y-audit/src/constants.ts packages/a11y-audit/src/playwright/runPointerCancellationCheck.ts packages/a11y-audit/test/pointer-cancellation.spec.ts packages/a11y-audit/test/fixtures/pages/pointer-cancellation/ packages/a11y-audit/CHANGELOG.md`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **優先度**: P2
- **工数**: S
- **リスク**: LOW〜MED（既定の待ちが短くなり、押してから 150〜300 ms の間に起きる変化は既定では見落とす。根拠は下の計測）
- **依存**: なし（根拠は Plan 021 の結果文書 `plans/021-result-slow-check-timing.md`）
- **カテゴリ**: perf
- **計画時点**: commit `143e564`, 2026-10-16
- **同じ系列のプラン**: 1 検査 1 プランで待ちを半分にする。022 pointer-cancellation / 023 content-on-hover / 024 keyboard-trap / 025 focus-indicator / 026 focus-order / 027 keyboard-reachability / 028 change-on-input。互いに独立で、どの順でも入れられる。

## なぜ重要か

Plan 021 の計測（結果文書の第 2〜5 節）で、pointer-cancellation-check の時間の 89% が
決まった秒数の待ちで、その大半（85%）は「要素を押した後に 300 ms 待つ」部分だった。
要素数に比例し、1 要素あたり約 0.35 秒かかる。

待ちを半分（150 ms）にしたとき:

| 確かめた範囲 | 結果 |
|---|---|
| 公開 5 ページ（W3C bad / good / WAI、MDN、Wikipedia） | `nodes` / `targets` / `untested` / `aborted` がすべて一致。×0.25 でも一致 |
| リポジトリの fixture 17 件 | 全件一致（`slow-navigation` だけ内部のやり直し回数 `restarts` が 1 → 0。結果は同じ） |
| 5 ページ合計の所要時間 | 134.8 秒 → 74.9 秒（−44%）。Wikipedia は 35.3 → 19.3 秒 |

×0.25 でも一致したが、`slow-navigation` で内部の経路が変わったので、まず ×0.5 にとどめる
（結果文書の第 5 節と第 6 節の 1 番目）。

## 現状

すべて `packages/a11y-audit/` 配下。行番号は commit `143e564` 時点。

`src/constants.ts:979-988`:

```ts
// =============================================================================
// pointer-cancellation-check (WCAG 2.5.2)
// =============================================================================

/** WCAG 2.5.2: wait after a press for a change to surface. */
export const POINTER_CANCELLATION_SETTLE_MS = 300;
/** Wall-clock budget for the whole check. */
export const POINTER_CANCELLATION_TIMEOUT_MS = 60_000;
/** Minimum time to watch the page for changes of its own before the first press. */
export const POINTER_CANCELLATION_BACKGROUND_MS = 1_000;
```

`src/playwright/runPointerCancellationCheck.ts` での使われ方:

| 行 | 内容 |
|---|---|
| `:119-120` | `settleMs?: number;`（説明は `default: POINTER_CANCELLATION_SETTLE_MS`） |
| `:678` | `settleMs = POINTER_CANCELLATION_SETTLE_MS,`（既定値） |
| `:688-691` | 正の有限数でなければ Error |
| `:895-897` | context ごとに 1 回 `Math.max(settleMs, POINTER_CANCELLATION_BACKGROUND_MS)` 待つ。150 にしても 1000 ms のまま |
| `:971` | 要素ごとに押し下げ後 `settleMs` 待つ（**今回縮まるのはここ**） |

この定数は `src/index.ts` から公開していない（公開しているのは `AUDIT_DISCLAIMER` などの 6 つだけ）。
値を変えても公開 API は変わらないが、既定の振る舞いは変わるので CHANGELOG の `### Changed` に書く。

### 既定値に依存している既存テスト（計画時に確認済み）

`test/pointer-cancellation.spec.ts:773-787`:

```ts
test('settleMs より後に移動するページでも、後ろのボタンは element-gone にならず、やり直して押される', async ({
  ...
  const result = await runCancel(
    'slow-navigation.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.untested).toEqual([]);
  expect(result.details.restarts).toBeGreaterThanOrEqual(1);
  expect(result.details.targetsTested).toBe(2);
});
```

fixture `test/fixtures/pages/pointer-cancellation/slow-navigation.html` は、`#slow` を押すと
**600 ms 後に**遷移する。既定 300 ms では「`#slow` の待ち 300 ms + `#after` の待ち 300 ms」の途中で
遷移が起き、やり直し（`restarts >= 1`）が起きる。150 ms にすると 2 つとも押し終わってから遷移するので
`restarts` が 0 になり、**このテストは落ちる**（結果文書の第 4 節の補足実験で ×0.5 は `restarts` 0）。
このテストの意図は「待ちより遅れて起きる遷移」で、既定値そのものではないので、テストに
`settleMs: 300` を明示して時間の関係を固定する（ステップ 3）。

その他、`pointer-cancellation.spec.ts:746` は `settleMs: 10` を明示しているので影響を受けない。

### 守る書き方

- TypeScript ESM、2 スペース、シングルクォート、末尾カンマ（Prettier + ESLint を CI で強制）。
- テストは `@playwright/test` で、ビルド済みの `../dist/…` を import する（`pretest` がビルドする）。
  定数を読むテストの前例: `test/accessible-authentication.spec.ts:10`（`import { AUTH_PASTE_FIELD_TIMEOUT_MS } from '../dist/constants.js';`）。
- テスト名は日本語で「どんな条件で・何をすると・どうなるか」。
- コミットは conventional commits、パッケージ名でスコープを付ける（例: `perf(a11y-audit): halve pointer-cancellation-check settle wait (300 → 150 ms)`）。
- CHANGELOG は `packages/a11y-audit/CHANGELOG.md` の `## Unreleased` に書く。今は `### Added` と空の `### Changed` がある。

## 使うコマンド

| 目的 | コマンド（リポジトリ直下で実行。worktree なら `npm --prefix <worktree> run <script>`） | 成功の目安 |
|---|---|---|
| インストール | `npm ci` | exit 0 |
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 1 ファイルのテスト | `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/pointer-cancellation.spec.ts`（先にビルド） | 全件成功 |
| 全体の検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |
| 整形 | `npx prettier --write <path>` | ファイルが書き換わる |

## 範囲

**変更してよいファイル**:
- `packages/a11y-audit/src/constants.ts`（`POINTER_CANCELLATION_SETTLE_MS` の値と説明コメントだけ）
- `packages/a11y-audit/test/pointer-cancellation.spec.ts`
- `packages/a11y-audit/test/fixtures/pages/pointer-cancellation/slow-navigation.html`（冒頭コメントの `300ms` だけ）
- `packages/a11y-audit/CHANGELOG.md`
- `plans/README.md`（行の更新）

**触らない**:
- `POINTER_CANCELLATION_BACKGROUND_MS`（1000 ms）と `:895-897` の `Math.max(...)`。押す前の静観の長さは今回の判断の対象外。
- `POINTER_CANCELLATION_MAX_TARGETS`（100 件の上限。Wikipedia で `target-limit` に達するのは網羅性の別問題）。
- 他の検査の定数と `src/playwright/` の他のファイル。
- バージョン欄（リリースは別に切る）。
- 計測スクリプト（`packages/a11y-audit/test-results/` は gitignore 済み。コミットしない）。

## Git の進め方

- ブランチ: `perf/pointer-cancellation-settle`
- コミットは 1〜2 個でよい。push と PR は指示があるときだけ。

## ステップ

### ステップ 1: 変更前の実ページ結果を取る

結果文書の付録から計測スクリプトを取り出し、**変更前のビルド**で 5 ページを測る。

```bash
node -e '
const fs = require("fs");
const md = fs.readFileSync("plans/021-result-slow-check-timing.md", "utf8");
const dir = "packages/a11y-audit/test-results/spike-021";
fs.mkdirSync(dir, { recursive: true });
for (const name of ["measure.mjs", "compare.mjs"]) {
  const m = md.match(new RegExp("#### `" + name.replace(".", "\\.") + "`\\n\\n```js\\n([\\s\\S]*?)\\n```"));
  if (!m) throw new Error("not found: " + name);
  fs.writeFileSync(dir + "/" + name, m[1] + "\n");
}'
npm run build --workspace @a11y-skills/audit
```

5 ページの名前と URL（結果文書の第 1 節）:

| 名前 | URL |
|---|---|
| w3c-bad | `https://www.w3.org/WAI/demos/bad/before/home.html` |
| w3c-good | `https://www.w3.org/WAI/demos/bad/after/home.html` |
| w3c-wai | `https://www.w3.org/WAI/` |
| mdn | `https://developer.mozilla.org/en-US/` |
| wikipedia | `https://en.wikipedia.org/wiki/Main_Page` |

ページごとに実行する（`<name>` と `<url>` を上の表で置き換える）:

```bash
node packages/a11y-audit/test-results/spike-021/measure.mjs <url> --page <name> --checks pointer-cancellation-check --out packages/a11y-audit/test-results/spike-021/before-<name>.jsonl
```

**確認**: 5 ファイルとも 1 行ずつあり、`"error"` を含まない。
`node packages/a11y-audit/test-results/spike-021/compare.mjs --self-test packages/a11y-audit/test-results/spike-021/before-wikipedia.jsonl` が `PASS` を出す。

### ステップ 2: 失敗するテストを書く

`test/pointer-cancellation.spec.ts` に次のテストを足す（import は既存の import 群に合わせて足す）。

```ts
import { POINTER_CANCELLATION_SETTLE_MS } from '../dist/constants.js';

test('押した後の既定の待ちは 150ms（Plan 021 で 5 ページと fixture 17 件の結果が 300ms と同じだった値）', () => {
  expect(POINTER_CANCELLATION_SETTLE_MS).toBe(150);
});
```

ビルドしてこのファイルだけ実行する。**確認**: 新しいテストだけが `Expected: 150 / Received: 300` で落ちる
（import の失敗やビルドの失敗で落ちていないこと）。

### ステップ 3: 既定値を変え、時間の関係に依存するテストを固定する

1. `src/constants.ts` の `POINTER_CANCELLATION_SETTLE_MS = 300` を `150` にする。説明コメントに根拠を 1 行足す:
   ```ts
   /**
    * WCAG 2.5.2: wait after a press for a change to surface. 150 ms gave the same
    * results as 300 ms on 5 public pages and 17 fixtures (plans/021-result-slow-check-timing.md).
    */
   export const POINTER_CANCELLATION_SETTLE_MS = 150;
   ```
2. `test/pointer-cancellation.spec.ts:773` のテストの `runCancel(...)` に第 4 引数 `{ settleMs: 300 }` を渡す。
   テスト名は変えない（「settleMs より後に移動する」は 600 ms > 300 ms で成り立つ）。
3. `slow-navigation.html` の冒頭コメント `later than settleMs (300ms)` を
   `later than the settleMs the test passes (300ms)` にする。

ビルドしてこのファイルを実行する。**確認**: 全件成功。

### ステップ 4: 全体の検証

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` が exit 0。
整形で落ちたら `npx prettier --write <path>` をかけてやり直す。

### ステップ 5: 変更後の実ページ結果を取り、変更前と比べる

ビルドしてから、ステップ 1 と同じコマンドを `--out .../after-<name>.jsonl` で 5 ページ実行し、比べる:

```bash
node packages/a11y-audit/test-results/spike-021/compare.mjs packages/a11y-audit/test-results/spike-021/before-<name>.jsonl packages/a11y-audit/test-results/spike-021/after-<name>.jsonl
```

**確認**: 5 ページとも、出力の `nodes.same` / `targets.same` / `untested.same` / `aborted.same` が `true`。
`durationMs` の合計が変更前より短い（目安は 5 ページ合計で 4 割前後短い）。

### ステップ 6: CHANGELOG

`## Unreleased` の `### Changed` に書く:

```md
- `pointer-cancellation-check`: the default wait after each press
  (`settleMs`) is now 150 ms (was 300 ms). On 5 public pages and the
  pointer-cancellation fixtures the results were the same, and the check took
  about 44% less time. Pages whose reaction to a press appears 150–300 ms later
  can pass `settleMs: 300` to keep the old window.
```

### ステップ 7: CLI のスモークを手元で再現

```bash
node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" --checks all --output-dir /tmp/cli-smoke-022
```

**確認**: `Errors:       0` が出る（終了コードは指摘があれば 1 でよい）。

## テスト計画

| テスト | 種類 | 変更前 | 変更後 |
|---|---|---|---|
| 押した後の既定の待ちは 150ms | 追加 | 落ちる（300） | 通る |
| settleMs より後に移動するページでも…やり直して押される | 変更（`settleMs: 300` を明示） | 通る | 通る |
| `pointer-cancellation.spec.ts` の他のテスト | 既存 | 通る | 通る |
| 実ページ 5 つの比較（ステップ 5） | 手動 | — | 集合がすべて一致 |

## 完了条件

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` が exit 0
- [ ] `git grep -n 'POINTER_CANCELLATION_SETTLE_MS = 150' -- packages/a11y-audit/src/constants.ts` が 1 行
- [ ] ステップ 5 の比較で 5 ページとも `nodes` / `targets` / `untested` / `aborted` が一致し、PR 本文に 5 ページの変更前後の秒数を表で載せる
- [ ] ステップ 7 で `Errors:       0`
- [ ] `git status --porcelain` に範囲内のファイルしか出ない（`test-results/` は gitignore 済みなので出ない）
- [ ] `plans/README.md` の 022 の行を更新

## STOP 条件

次のときは止まって報告する:

- 差分確認で範囲内のファイルが変わっていて、「現状」の抜粋と食い違う。
- ステップ 2 の新しいテストが、値の不一致以外の理由（import の失敗など）で落ちる。
- ステップ 3 の後、`slow-navigation` のテスト以外の既存テストが落ちる。そのテストに
  `settleMs` を足して通す、待ちを延ばす、テストを消す、のどれもしない。どのテストがどう落ちたかを報告する。
- ステップ 5 で、どれかのページの `nodes` / `targets` / `untested` / `aborted` が一致しない。
  同じページで変更前の計測をもう 1 回取り、変更前どうしでも同じ差が出るか（元々揺れるか）を確かめてから報告する。
- 実ページに届かない（ネットワーク不可、ステータス 200 でない）。fixture だけで済ませない。

## 保守メモ

- これより短く（×0.25 = 75 ms）するのは、結果文書の第 6 節「やらない」に従い今は見送る。
  理由は、押してから遅れて反応するハンドラを持つ実ページを標本に入れていないこと。
- 押す前の静観（`POINTER_CANCELLATION_BACKGROUND_MS`）は `Math.max(settleMs, 1000)` なので、
  `settleMs` を 1000 より大きく渡した利用者だけがその影響を受ける。今回の変更では変わらない。
- レビューで見る点: `slow-navigation` のテストに渡した `settleMs: 300` が、テストの意図（待ちより遅い遷移）を保っているか。
