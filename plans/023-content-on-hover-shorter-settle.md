# Plan 023: content-on-hover-check の待ち（settleMs）を 400 → 200 ms に半分にする

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。完了したら `plans/README.md` のこのプランの行を更新する
> （レビュアーが索引を管理すると言った場合は除く）。
>
> **差分確認（最初に実行）**:
> `git diff --stat 143e564..HEAD -- packages/a11y-audit/src/constants.ts packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts packages/a11y-audit/test/content-on-hover.spec.ts packages/a11y-audit/README.ja.md packages/a11y-audit/README.md packages/a11y-audit/CHANGELOG.md`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **Codex plan review**: 通過（1 巡目、2026-10-16、見送った low 0 件。medium 1 件「HTTP ステータスと対象数を確かめる手順がない」を反映）
- **優先度**: P2
- **工数**: S
- **リスク**: MED（×0.25 = 100 ms では実ページで検出が後退した。200 ms は計測で確かめた下限に近い）
- **依存**: なし（根拠は Plan 021 の結果文書 `plans/021-result-slow-check-timing.md`）
- **カテゴリ**: perf
- **計画時点**: commit `143e564`, 2026-10-16
- **同じ系列のプラン**: 1 検査 1 プランで待ちを半分にする。022 pointer-cancellation / 023 content-on-hover / 024 keyboard-trap / 025 focus-indicator / 026 focus-order / 027 keyboard-reachability / 028 change-on-input。互いに独立で、どの順でも入れられる。

## なぜ重要か

content-on-hover-check は一番遅い検査で、Wikipedia で 39.6 秒、W3C bad demo で 37.1 秒かかる。
Plan 021 の計測（結果文書の第 3 節）では、時間の 87% が待ちで、そのうち `settleMs`（400 ms）が 75% を占めた。
内容が出ない組でも、後始末・hover 後・Escape 後などで `settleMs` を何度も待つため、1 組あたり約 1 秒かかる。

計測の結果:

| 確かめた範囲 | 結果 |
|---|---|
| 公開 5 ページ、`settleMs` と `persistMs` の両方 ×0.5 | `nodes` / `targets` / `untested` / `aborted` がすべて一致。5 ページ合計 97.2 → 60.2 秒 |
| Wikipedia、`settleMs` だけ ×0.5（200 ms、`persistMs` 据え置き） | 一致。39.6 → 26.1 秒 |
| Wikipedia、`settleMs` だけ ×0.25（100 ms） | **後退**。検索欄の focus で出る候補表示を見落とした |
| リポジトリの fixture 13 件、×0.5 / ×0.25 | 全件一致 |

結果文書の第 6 節の 2 番目に従い、`settleMs` だけを 200 ms にする。`persistMs`（3 秒、「内容が残り続けるか」の判定窓）は変えない。

**このプランで新しく確かめること**: `settleMs` だけ ×0.5 の実ページ計測は Wikipedia 1 ページしかない。
ステップ 5 で 5 ページすべてを変更前後で比べ、その穴を埋める。

## 現状

すべて `packages/a11y-audit/` 配下。行番号は commit `143e564` 時点。

`src/constants.ts:1096-1098`:

```ts
export const CONTENT_ON_HOVER_SETTLE_MS = 400;
...
export const CONTENT_ON_HOVER_PERSIST_MS = 3_000;
```

`src/playwright/runContentOnHoverCheck.ts` で `settleMs` を待つ場所（`git grep -n 'waitForTimeout(' -- packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts`）:

| 行 | 何を待つか | 200 ms にした後 |
|---|---|---|
| `:895` | `settleMs = CONTENT_ON_HOVER_SETTLE_MS,`（既定値） | — |
| `:1100` | トリガーごとの後始末（ポインタを隅へ・blur・Escape）の後 | 200 ms |
| `:1134` | スクロール後 `Math.min(settleMs, 100)` | 100 ms のまま |
| `:1150` | hover または focus の後（新しい内容が出たか見る） | 200 ms |
| `:1167` | 内容が出たときだけ `persistMs` | 3000 ms のまま（触らない） |
| `:1182` | Escape の後 | 200 ms |
| `:1203`, `:1231` | hover で残った内容にポインタを乗せ直す際 | 200 ms |

Plan 021 の ×0.5 は、上の `settleMs` を使う場所をすべて同時に縮めた計測である。このプランも同じく既定値だけを変え、場所ごとに分けない。

ドキュメントの既定値の記述:

- `README.ja.md:245`: `` `settleMs`（既定 400ms）・`persistMs`・… ``
- `README.md:330`: `` `settleMs` (default 400 ms), `persistMs`, … ``

この検査は**未リリース**（`CHANGELOG.md` の `## Unreleased` → `### Added` にある）。Added の文に 400 ms は書かれていないので、CHANGELOG は変えない。

### 既存テスト（計画時に確認済み）

- `test/content-on-hover.spec.ts` の多くのテストは `{ persistMs: 600, settleMs: 150 }` を明示していて、既定値に依存しない。
- `:199` の「Escape で消え、ポインタを載せても消えず、残り続けるツールチップは既定の待ち時間で 3 ルールとも passes になる」は既定値で走る。200 ms でも通る見込み（fixture 13 件の感度実験で一致）。

### 守る書き方

- TypeScript ESM、2 スペース、シングルクォート、末尾カンマ（Prettier + ESLint を CI で強制）。
- テストはビルド済みの `../dist/…` を import する。定数を読む前例: `test/accessible-authentication.spec.ts:10`。
- テスト名は日本語で「どんな条件で・何をすると・どうなるか」。
- README は日本語版が正。`README.ja.md` を先に直し、`README.md` をそろえる。
- コミット例: `perf(a11y-audit): halve content-on-hover-check settle wait (400 → 200 ms)`。

## 使うコマンド

| 目的 | コマンド（リポジトリ直下。worktree なら `npm --prefix <worktree> run <script>`） | 成功の目安 |
|---|---|---|
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 1 ファイルのテスト | `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/content-on-hover.spec.ts`（先にビルド） | 全件成功 |
| 全体の検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |
| 整形 | `npx prettier --write <path>` | ファイルが書き換わる |

## 範囲

**変更してよいファイル**:
- `packages/a11y-audit/src/constants.ts`（`CONTENT_ON_HOVER_SETTLE_MS` の値と説明コメントだけ）
- `packages/a11y-audit/test/content-on-hover.spec.ts`
- `packages/a11y-audit/README.ja.md`、`packages/a11y-audit/README.md`（既定値の 1 か所ずつ）
- `plans/README.md`（行の更新）

**触らない**:
- `CONTENT_ON_HOVER_PERSIST_MS` と `:1167` の待ち。途中で打ち切る変更も含め、判定が変わりうるので別判断（結果文書の第 5 節）。
- `:1134` の `Math.min(settleMs, 100)`。
- 他の検査の定数、`src/playwright/` の他のファイル、`CHANGELOG.md`、バージョン欄。
- 計測スクリプトと計測結果（`packages/a11y-audit/test-results/` と `tmp/` は gitignore 済み）。

## Git の進め方

- ブランチ: `perf/content-on-hover-settle`
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

ページごとに、まず最終の HTTP ステータスを確かめてから測る（`<name>` と `<url>` を上の表で置き換える）。
計測スクリプトは HTTP ステータスを記録しないので、エラーページを測っても `"error"` は付かず、空の結果どうしが「一致」してしまう。この確認を飛ばさない。

```bash
curl -sIL -o /dev/null -w '%{http_code}\n' <url>
node packages/a11y-audit/test-results/spike-021/measure.mjs <url> --page <name> --checks content-on-hover-check --out tmp/spike-021/before-<name>.jsonl
```

**確認**:
- 5 ページとも `curl` が `200` を出す。
- 5 ファイルとも 1 行ずつあり、`"error"` を含まない。
- 各行の `counts["triggers.length"]` が Plan 021 の値と同じ桁である: w3c-bad 21、w3c-good 1、w3c-wai 8、wikipedia 18 は **0 より大きい**こと。mdn は Plan 021 でも 0 件なので 0 でよい（mdn は「対象が無いページで待ちが変わっても結果が変わらない」ことの確認にしかならない。PR 本文にそう書く）。
- Wikipedia の行で `#searchInput|focus` の `targets` が `no-content` 以外（内容が出た組）になっている。これが ×0.25 で消えた組で、変更後も残ることを確かめる目印になる。

### ステップ 2: 失敗するテストを書く

`test/content-on-hover.spec.ts` に足す:

```ts
import { CONTENT_ON_HOVER_PERSIST_MS, CONTENT_ON_HOVER_SETTLE_MS } from '../dist/constants.js';

test('表示や後始末の後の既定の待ちは 200ms（Plan 021 で 400ms と結果が同じで、100ms では実ページで見落とした値）', () => {
  expect(CONTENT_ON_HOVER_SETTLE_MS).toBe(200);
});

test('内容が残り続けるかを見る既定の待ちは 3000ms のまま変えない', () => {
  expect(CONTENT_ON_HOVER_PERSIST_MS).toBe(3_000);
});
```

ビルドしてこのファイルを実行する。**確認**: 1 つ目だけが `Expected: 200 / Received: 400` で落ち、2 つ目は通る。

### ステップ 3: 既定値を変える

`src/constants.ts` の `CONTENT_ON_HOVER_SETTLE_MS = 400` を `200` にし、説明コメントに根拠を足す:

```ts
/**
 * Wait after showing, dismissing or moving the pointer. 200 ms gave the same
 * results as 400 ms on 5 public pages and 13 fixtures; 100 ms missed a focus-shown
 * suggestion list on Wikipedia (plans/021-result-slow-check-timing.md).
 */
```

（既存のコメントがあれば、その内容を残したうえで根拠を足す。）

ビルドしてこのファイルを実行する。**確認**: 全件成功。

### ステップ 4: README と全体の検証

1. `README.ja.md:245` の `既定 400ms` を `既定 200ms` に、`README.md:330` の `default 400 ms` を `default 200 ms` にする。
2. `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` が exit 0。

### ステップ 5: 変更後の実ページ結果を取り、変更前と比べる

テストを実行すると Playwright が `packages/a11y-audit/test-results/` を丸ごと消すので、計測スクリプトも消えている。まずステップ 1 の `node -e` をもう一度実行してスクリプトを取り出し直す（計測結果はリポジトリ直下の `tmp/spike-021/` に書くので消えない。`/tmp` は gitignore 済み）。

ビルドしてから、ステップ 1 と同じコマンド（`curl` によるステータスの確認と、`triggers.length` の確認を含む）を `--out tmp/spike-021/after-<name>.jsonl` で 5 ページ実行し、比べる:

```bash
node packages/a11y-audit/test-results/spike-021/compare.mjs tmp/spike-021/before-<name>.jsonl tmp/spike-021/after-<name>.jsonl
```

**確認**:
- 5 ページとも `nodes.same` / `targets.same` / `untested.same` / `aborted.same` が `true`。
- Wikipedia の `#searchInput|focus` が変更後も `no-content` になっていない。
- `durationMs` の合計が変更前より短い（目安は Wikipedia で 3 割前後短い）。

### ステップ 6: CLI のスモークを手元で再現

```bash
node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" --checks all --output-dir /tmp/cli-smoke-023
```

**確認**: `Errors:       0`。

## テスト計画

| テスト | 種類 | 変更前 | 変更後 |
|---|---|---|---|
| 表示や後始末の後の既定の待ちは 200ms | 追加 | 落ちる（400） | 通る |
| 内容が残り続けるかを見る既定の待ちは 3000ms のまま | 追加（据え置きの確認） | 通る | 通る |
| `content-on-hover.spec.ts:199`（既定値で 3 ルール passes） | 既存 | 通る | 通る |
| 実ページ 5 つの比較（ステップ 5） | 手動 | — | 集合がすべて一致 |

## 完了条件

- [ ] 全体の検証コマンドが exit 0
- [ ] `git grep -n 'CONTENT_ON_HOVER_SETTLE_MS = 200' -- packages/a11y-audit/src/constants.ts` が 1 行、`CONTENT_ON_HOVER_PERSIST_MS = 3_000` が残っている
- [ ] `git grep -n '400 \?ms' -- packages/a11y-audit/README.ja.md packages/a11y-audit/README.md` が 0 行
- [ ] ステップ 5 で 5 ページとも一致し、PR 本文に 5 ページの変更前後の秒数を表で載せる
- [ ] ステップ 6 で `Errors:       0`
- [ ] `git status --porcelain` に範囲内のファイルしか出ない
- [ ] `plans/README.md` の 023 の行を更新

## STOP 条件

- 差分確認で範囲内のファイルが変わっていて、「現状」の抜粋と食い違う。
- ステップ 2 の新しいテストが、値の不一致以外の理由で落ちる。
- ステップ 3 の後に既存テストが落ちる。テストに `settleMs` を足して通す、待ちを延ばす、テストを消す、のどれもしない。どのテストがどう落ちたかを報告する。
- ステップ 1 で Wikipedia の `#searchInput|focus` がすでに `no-content`（ページが変わって、目印の組が無くなった）。目印なしで進めず報告する。
- ステップ 5 でどれかのページの集合が一致しない。同じページで変更前の計測をもう 1 回取り、変更前どうしでも同じ差が出るかを確かめてから報告する。
- 実ページに届かない（ネットワーク不可、`curl` の最終ステータスが 200 でない）、または mdn 以外のページで変更前・変更後の `counts["triggers.length"]` が 0。そのページを比較から外して合格にせず、fixture だけでも済ませない。

## 保守メモ

- 200 ms は「100 ms で見落とし、200 ms で一致した」という 1 ページの境界から選んだ値で、余裕は大きくない。
  これより短くしない。検出漏れの報告があれば、まず `settleMs` を戻す。
- `persistMs` を縮める・途中で打ち切る変更は、結果文書の第 5 節のとおり判定の定義が変わりうるので、別のプランで判断する。
