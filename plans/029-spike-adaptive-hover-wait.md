# Plan 029: スパイク — content-on-hover-check の固定の待ちを「ページが始めた動きを待つ」方式に置き換えられるか確かめる

> **実行者への指示**: これはビルドプランではなく「調査スパイク」である。
> 成果物は次の 2 つ:
> (1) 遅れて出る・消える中身を再現する fixture 6 件（コミットする）。
> (2) 計測結果と判断をまとめた文書 `plans/029-result-adaptive-hover-wait.md`（試作の差分と計測スクリプトを付録に全文で載せる）。
> `packages/a11y-audit/src/` は**コミットしない**。試作のために一時的に書き換えてよいが、最後に `git checkout -- packages/a11y-audit/src` で戻す。
> 各ステップを順守し、STOP 条件に従い、完了後は `plans/README.md` のこのプランの行を更新する（レビュアーが索引を管理すると言った場合は除く）。
>
> **差分確認（最初に実行）**:
> `git diff --stat 695e640..HEAD -- packages/a11y-audit/src/constants.ts packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts packages/a11y-audit/src/playwright/runTimeLimitDetector.ts packages/a11y-audit/test/fixtures/pages/content-on-hover/`
> 差分があれば「現状」の抜粋と実コードを見比べ、待ちの場所や既定値が変わっていたら STOP 条件として扱う。

## ステータス

- **Codex plan review**: 通過（2 巡目、2026-10-16、見送った low 0 件。1 巡目の high「delayed-show はボタンの mouseleave で隠すと hoverable が stayed にならない」と medium「CSS fixture のきっかけは #wrap」を反映）
- **優先度**: P2
- **工数**: M（fixture 6 件 + 試作 + 計測 + 文書。検査の本実装は別プラン）
- **リスク**: LOW（プロダクションコードはコミットしない。実ページへは読み取りのアクセスだけ）
- **依存**: なし（Plan 021 の結果文書 `plans/021-result-slow-check-timing.md` の計測スクリプトを使う）
- **カテゴリ**: perf（調査スパイク）
- **計画時点**: commit `695e640`, 2026-10-16
- **経緯**: Plan 023（`settleMs` を 400 → 200 ms に縮める）は PR #111 で実装したが、マージせずに閉じた。理由は「なぜ重要か」の通り。

## なぜ重要か

content-on-hover-check は一番遅い検査で（Wikipedia で約 40 秒）、時間の 75% は固定の待ち `settleMs`（400 ms）である（Plan 021）。
ところが、この待ちを縮めると、遅れて出る・消える中身で判定が狂う。この検査は「表示用の枠があり、`visibility: hidden` でない」要素を見えているとみなし、`opacity` は見ない。そのため、遅れの種類ごとに次のことが起きる:

| 遅れの種類 | 待ちより長いと | 悪さ |
|---|---|---|
| フェードイン（すぐ表示され、透明度だけが変わる） | 影響なし | なし |
| 表示までの遅延（`setTimeout` で 300 ms 後に出す、CSS の `transition-delay`） | 中身が出なかった扱い（`empty`）になり、何も報告しない | 黙って見落とす |
| Escape 後のフェードアウト（消えきるまで `display` が残る） | `dismissible: 'stayed'` になる | 誤警報（人の確認に回る） |
| ポインタを外した後のフェードアウトや遅延 | `hoverable: 'stayed'` になる | **不適合を見逃して passes になる** |

Plan 021 では、5 つの公開ページで待ちを半分にしても結果が一致した。ただし実際に中身が出た組は Wikipedia の検索欄の 1 組だけで、上の表の危ないケースはほとんど試せていない。

そこで、固定の時間を待つのをやめ、**操作した後にページが実際に始めた動き**を待つ方式を考える:
- **CSS のアニメーションとトランジション**: `document.getAnimations()` で取れる。
- **操作中に予約された短い `setTimeout`**: `setTimeout` を包んで追う。前例は `runTimeLimitDetector.ts`。

何も起きない組（実ページの大半）は短い最低限の待ちで先へ進み、動きがあるときはその分だけ待てるかもしれない。このスパイクは、それが本当に「速く・しかも正しく」なるかを fixture と実ページで測り、実装プランを書くか見送るかを決める材料を作る。

## 現状

すべて `packages/a11y-audit/` 配下。行番号は commit `695e640` 時点。

### 待ちの場所（`src/playwright/runContentOnHoverCheck.ts`）

既定値は `src/constants.ts:1101` の `CONTENT_ON_HOVER_SETTLE_MS = 400` と、`:1103` の `CONTENT_ON_HOVER_PERSIST_MS = 3_000`。

| 行 | 何を待つか | 待った後に何を判断するか |
|---|---|---|
| `:1096-1101` `resetState` | ポインタを隅へ・blur・Escape の後に `settleMs` | 次の組の前に、前の組の中身が片付いた状態にする |
| `:1115` | `if (!clean) await resetState();` | `clean` は hover/focus の直前（`:1144`）で `false` になり、`true` に戻るのは中身が出た組の片付け後（`:1298`）と読み込み直し後だけ。**中身が出なかった組の次の組でも毎回 `resetState` が走る** |
| `:1134` | スクロール後に `Math.min(settleMs, 100)` | スクロールで出るものを「元からある」側に含める |
| `:1150` | hover または focus の後に `settleMs` | `findNewContent` で新しい中身があるか。0 件なら `empty` |
| `:1167` | 中身が出たときだけ `persistMs` | 中身が残り続けるか |
| `:1182` | Escape の後に `settleMs` | `dismissible`（`readVisibility` が 1 つでも見えていれば `stayed`） |
| `:1203` | hover し直した後に `settleMs` | もう一度中身を見つける |
| `:1231` | ポインタを中身の中心へ `steps: 10` で動かした後に `settleMs` | `hoverable`（全部見えていれば `stayed`） |

見えているかの判定（`:234-239`。`markVisible` `:542`、`findNewContent` `:584`、`readVisibility` `:690` も同じ条件）:

```ts
function isVisible(element: Element): boolean {
  return (
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden'
  );
}
```

ページを開く処理（`:944-959`）の `openPage` は、`context.newPage()` の後に `gotoAndSettle(opened, targetUrl)` を呼ぶ。初期化スクリプトを入れるなら、`gotoAndSettle` より前に `opened.addInitScript(...)` を置く。

### `setTimeout` を包む前例（`src/playwright/runTimeLimitDetector.ts:41-106`）

ページのスクリプトより前に `page.addInitScript(createTimerHookScript, { minMs, maxMs })`（`:258`）で入れ、`window.setTimeout` を包んで、条件に合う呼び出しを記録してから元の関数に渡している。この試作でも同じ形で包む（`clearTimeout` も包み、取り消されたタイマーを数から外す点だけが違う）。

### 既存の fixture とテスト

- fixture は `test/fixtures/pages/content-on-hover/` に 23 件ある。冒頭の HTML コメントに「Expected:」として期待する結果を書く書き方。例: `not-hoverable.html`（mouseleave で `hidden = true`、8px の隙間があるのでポインタを載せると消える）。
- テストは `test/content-on-hover.spec.ts` の `runHover(fixture, { page, browser, testInfo }, baseUrl, extra)` で走らせている。このスパイクではテストを足さない。

### Plan 021 の計測スクリプト

`plans/021-result-slow-check-timing.md` の付録に `measure.mjs` と `compare.mjs` が全文で載っている。

- 取り出し方: 下のステップ 1 の `node -e`。
- 使い方: `node measure.mjs <url> --page <name> --checks content-on-hover-check --out <file.jsonl> [--settle-scale k] [--persist-scale 1]`
- ビルド済みの `dist/` を読む。試作を測るときは、ビルドし直してから走らせる。
- **注意**: `--persist-scale` を省くと `--settle-scale` と同じ値になり、`persistMs` も縮む。このスパイクでは常に `--persist-scale 1` を付ける。
- 出力の各行の `targets[]` は `{ id: '<selector>|<method>', outcome: '<persistent>/<dismissible>/<hoverable>' }` の形（例: `"#searchInput|focus"` → `"stayed/stayed/not-applicable"`）。中身が出なかった組は `no-content`。
- `counts["triggers.length"]` は試したきっかけの数。

### 守る書き方

- fixture は既存と同じく `<!doctype html>`、冒頭コメントに構成と `Expected:`、Prettier で整形する。
- 結果文書は日本語。表を中心に書き、計測スクリプトと試作の差分は付録に全文で載せる（021 の結果文書が手本）。

## 使うコマンド

| 目的 | コマンド（リポジトリ直下。worktree なら `npm --prefix <worktree> run <script>`） | 成功の目安 |
|---|---|---|
| インストール | `npm ci` | exit 0 |
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 1 ファイルのテスト | `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/content-on-hover.spec.ts`（先にビルド） | 全件成功 |
| 全体の検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |
| 整形 | `npx prettier --write <path>` | ファイルが書き換わる |

## 範囲

**変更してよいファイル（コミットする）**:
- `packages/a11y-audit/test/fixtures/pages/content-on-hover/` に新しい fixture 6 件（ステップ 2）
- `plans/029-result-adaptive-hover-wait.md`（新規）
- `plans/README.md`（行の更新）

**一時的に書き換えてよいが、コミットしない**:
- `packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts`（試作。最後に戻す）

**触らない**:
- `src/` のほかのファイル、`src/constants.ts` の既定値、既存の fixture とテスト、`CHANGELOG.md`、バージョン欄。
- 計測スクリプトと計測結果（`packages/a11y-audit/test-results/` と `tmp/` は gitignore 済み。結果は結果文書に表で写す）。

## Git の進め方

- ブランチ: `spike/adaptive-hover-wait`
- コミットは fixture と結果文書の 1〜2 個。例: `docs(plans): 029 — adaptive hover wait spike results`。
- push と PR は指示があるときだけ。

## ステップ

### ステップ 1: 計測スクリプトを取り出し、変更前のビルドを用意する

```bash
node -e '
const fs = require("fs");
const md = fs.readFileSync("plans/021-result-slow-check-timing.md", "utf8");
const dir = "packages/a11y-audit/test-results/spike-021";
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync("tmp/spike-029", { recursive: true });
for (const name of ["measure.mjs", "compare.mjs"]) {
  const m = md.match(new RegExp("#### `" + name.replace(".", "\\.") + "`\\n\\n```js\\n([\\s\\S]*?)\\n```"));
  if (!m) throw new Error("not found: " + name);
  fs.writeFileSync(dir + "/" + name, m[1] + "\n");
}'
npm run build --workspace @a11y-skills/audit
```

**確認**: `packages/a11y-audit/test-results/spike-021/measure.mjs` と `compare.mjs` ができている。
テストを実行すると Playwright が `test-results/` を丸ごと消すので、そのときはこの `node -e` をやり直す。計測結果は `tmp/spike-029/` に書くので消えない。

### ステップ 2: 遅れを再現する fixture を 6 件作る

`test/fixtures/pages/content-on-hover/` に作る。冒頭コメントに構成と「Expected:」（**正しい**判定。`persistent/dismissible/hoverable`）を書く。

構成は 2 通りある（どちらも既存の fixture が手本）:
- **ポインタを載せられる形**（`compliant-tooltip.html` が手本）: `<span id="wrap" class="wrap">` の中に `<button id="btn">` と中身を隙間なく置く。`#btn` の `mouseenter` と `focus` で出す。`#btn` の `blur` と、**`#wrap` の `mouseleave`** で隠す。ボタンの `mouseleave` で隠すと、ポインタを中身へ動かした時点で消えてしまうので使わない。`mouseleave` はこの検査の候補の listener に入らないので、`#wrap` はきっかけにならない。
- **ポインタを載せられない形**（`not-hoverable.html` が手本）: 中身をボタンから 8px 離し、`#btn` の `mouseleave` と `blur` で隠す。

照合する `targets` の id は、JS の fixture は `#btn|hover`、CSS だけの fixture は `#wrap|hover` である。CSS の規則から集めたきっかけは、擬似クラスが付いた要素（ここでは `.wrap`）になるため。

| ファイル | 作り | 照合する id | 正しい判定（hover） |
|---|---|---|---|
| `delayed-show.html` | 載せられる形。`#btn` の `mouseenter` で `setTimeout(show, 300)`（focus は即座に出す）。`#wrap` の `mouseleave` と Escape では `clearTimeout` して即座に隠す | `#btn` | `stayed/dismissed/stayed` |
| `css-delayed-show.html` | CSS だけ（script なし）。`<span id="wrap" class="wrap">` の中に `<button id="btn">` と中身を隙間なく置く。中身は `visibility: hidden` が既定で、`.wrap:hover .tip, .wrap:focus-within .tip { visibility: visible; transition: visibility 0s 300ms; }`。Escape では消えない | `#wrap` | `stayed/stayed/stayed` |
| `fade-out-escape.html` | 載せられる形。出すと即座に表示。Escape で `opacity` を 300 ms かけて 0 にする CSS トランジションを始め、`transitionend` で `hidden = true`。`#wrap` の `mouseleave` と `blur` では即座に隠す | `#btn` | `stayed/dismissed/stayed` |
| `fade-out-leave.html` | 載せられない形。`#btn` の `mouseleave` で 300 ms のフェードアウト（CSS トランジション）を始め、`transitionend` で `hidden = true`。Escape も同じフェードで消す | `#btn` | `stayed/dismissed/disappeared` |
| `delayed-hide-leave.html` | 載せられない形。`#btn` の `mouseleave` で `setTimeout(hide, 300)`（中身に載っても取り消さない）。Escape は即座に隠す | `#btn` | `stayed/dismissed/disappeared` |
| `raf-fade-out-leave.html` | 載せられない形。`#btn` の `mouseleave` で `requestAnimationFrame` を回して 300 ms かけて `opacity` を下げ、終わったら `hidden = true`（jQuery の `fadeOut` と同じ仕組み）。Escape は即座に隠す | `#btn` | `stayed/dismissed/disappeared` |

どの fixture も、きっかけ（`triggers.length`）は 1 つになるようにする。

`npx prettier --write` をかける。

**確認**: 6 件それぞれを今のビルド（400 ms）で測る（`<file>` は拡張子なしの名前）:

```bash
node packages/a11y-audit/test-results/spike-021/measure.mjs "file://$PWD/packages/a11y-audit/test/fixtures/pages/content-on-hover/<file>.html" --page <file> --checks content-on-hover-check --out tmp/spike-029/fx-F400-<file>.jsonl
```

各行の `counts["triggers.length"]` が 1 で、`targets` の「照合する id」`|hover` が上の「正しい判定」と一致する。400 ms は 300 ms の遅れより長いので、6 件とも一致するはず。**一致しない fixture があれば作りを直す**（fixture 側の誤り）。2 回直しても一致しなければ STOP。

### ステップ 3: 固定の待ちでどこが狂うかを表にする（試作の前）

ステップ 2 の 6 件と既存 23 件の計 29 件を、`--settle-scale 0.5 --persist-scale 1`（200 ms）と `--settle-scale 0.25 --persist-scale 1`（100 ms）で測る。出力は `tmp/spike-029/fx-F200-<file>.jsonl` と `fx-F100-<file>.jsonl` とする。既存 23 件の 400 ms の基準 `fx-F400-<file>.jsonl` も取る。

比べ方: `node packages/a11y-audit/test-results/spike-021/compare.mjs tmp/spike-029/fx-F400-<file>.jsonl tmp/spike-029/fx-F200-<file>.jsonl`。新しい 6 件は「正しい判定」とも突き合わせる。

**確認**: 結果文書の表 A（行は fixture、列は F400 / F200 / F100、セルは一致か、狂った `targets` の中身）ができる。
少なくとも `fade-out-leave` と `delayed-hide-leave` が F200 で `hoverable: stayed` に狂うことが予想される。予想と違えば、そのまま表に書く（STOP ではない）。

### ステップ 4: 試作を作る（コミットしない）

`src/playwright/runContentOnHoverCheck.ts` だけを書き換える。切り替えは環境変数で行う（試作専用。本実装では使わない）。

- `HOVER_WAIT_MODE`: `fixed`（既定。今の動き）/ `adaptive` / `skip-reset`
- `HOVER_WAIT_MIN`: `adaptive` の最低限の待ち（ms）。既定 100
- `HOVER_WAIT_CAP`: `adaptive` の上限（ms）。既定 1000

#### 4-1. タイマーを追う初期化スクリプト

`openPage` で `gotoAndSettle` より前に `opened.addInitScript(trackShortTimers, { maxMs: 1000 })` を入れる。`trackShortTimers` はページ内で動く関数で、次のことをする:
- `window.setTimeout` を包み、`delay` が 1〜`maxMs` ms のものを `Map<id, dueAt>` に入れる（`dueAt = performance.now() + delay`）。
- コールバックが動いたら、その id を消す。
- `window.clearTimeout` も包み、取り消された id を消す。
- `window.__hoverWaitMark()` を呼ぶと、その時刻を記録する。
- `window.__hoverWaitPendingMs()` は、記録した時刻より後に予約され、まだ動いていないタイマーのうち、一番遅いものの残り時間を返す（無ければ 0）。

`setInterval` と `requestAnimationFrame` は追わない（繰り返し動くものを待つと終わらないため。rAF の扱いは `raf-fade-out-leave` で測る）。

#### 4-2. アニメーションの残り時間

ページ内で動く関数 `runningAnimationMs()` を作る。`document.getAnimations()` のうち、`playState` が `running` か `pending` で、`effect.getComputedTiming()` の `iterations` が有限のものについて、残り時間 `(endTime - currentTime) / playbackRate` の最大を返す。無ければ 0。

#### 4-3. 待ちの置き換え

`settleMs` を待っている 5 か所（`:1100` `:1150` `:1182` `:1203` `:1231`）を、関数 `settle()` の呼び出しに置き換える:
- `fixed` と `skip-reset`: 今と同じく `page.waitForTimeout(settleMs)`。
- `adaptive`:
  1. 操作の**直前**に `__hoverWaitMark()` を呼ぶ。`:1144` の前、Escape の前、ポインタを動かす前、`resetState` の最初。
  2. `HOVER_WAIT_MIN` だけ待つ。
  3. `max(__hoverWaitPendingMs(), runningAnimationMs())` が 0 なら終わる。0 より大きければ、その時間に 16 ms を足した分を待ち、また測る。
  4. 操作の直前から数えて `HOVER_WAIT_CAP` に達したら打ち切る。打ち切った回数を数える。

`skip-reset` は「待ちの長さは変えず、中身が出なかった組の後の `resetState` の**待ちだけ**を省く」比較用の案である。`tryPair` が `empty` を返したときに印を立て、次の `resetState` は待ちを飛ばす（ポインタを隅へ・blur・Escape は行う）。

`persistMs` の待ち（`:1167`）と、スクロール後の待ち（`:1134`）は変えない。

#### 4-4. 数の記録

試作の間だけ、`details` に次の数を足し、`measure.mjs` の出力で読めるようにする。読めなければ `console.error` に JSON で出す。
- `adaptiveWaits`: `settle()` を呼んだ回数
- `adaptiveExtended`: 最低限の待ちを超えて待った回数
- `adaptiveCapped`: 上限で打ち切った回数
- `adaptiveWaitMsTotal`: 待った時間の合計

ビルドしてから、`HOVER_WAIT_MODE` を付けずに既存テスト（1 ファイルのテスト）を走らせる。

**確認**: 全件成功（`fixed` が今と同じ動きであることの確認）。落ちたら試作の誤りなので直す。2 回直しても落ちれば STOP。

### ステップ 5: 試作を fixture で測る

29 件を次の 4 通りで測る。環境変数はコマンドの頭に付ける。

| 名前 | 設定 |
|---|---|
| A100 | `HOVER_WAIT_MODE=adaptive HOVER_WAIT_MIN=100 HOVER_WAIT_CAP=1000` |
| A50 | `HOVER_WAIT_MODE=adaptive HOVER_WAIT_MIN=50 HOVER_WAIT_CAP=1000` |
| A150 | `HOVER_WAIT_MODE=adaptive HOVER_WAIT_MIN=150 HOVER_WAIT_CAP=1000` |
| SKIP | `HOVER_WAIT_MODE=skip-reset`（待ちは 400 ms のまま） |

出力は `tmp/spike-029/fx-<名前>-<file>.jsonl` とする。

**確認**: 表 A に 4 列を足す。新しい 6 件では、`raf-fade-out-leave` 以外の 5 件が A100 で正しい判定になるかが要点である。rAF の 1 件は追えない想定なので、狂ったらそのまま書く。

### ステップ 6: 実ページで測る

8 ページを、F400（`HOVER_WAIT_MODE` なし、scale 1）、F200（`--settle-scale 0.5 --persist-scale 1`）、A100、SKIP の 4 通りで測る。後半の 3 ページは、実際に中身が出るツールチップを標本に入れるために足したものである。

| 名前 | URL |
|---|---|
| w3c-bad | `https://www.w3.org/WAI/demos/bad/before/home.html` |
| w3c-good | `https://www.w3.org/WAI/demos/bad/after/home.html` |
| w3c-wai | `https://www.w3.org/WAI/` |
| mdn | `https://developer.mozilla.org/en-US/` |
| wikipedia | `https://en.wikipedia.org/wiki/Main_Page` |
| bootstrap-tooltip | `https://getbootstrap.com/docs/5.3/components/tooltips/` |
| mui-tooltip | `https://mui.com/material-ui/react-tooltip/` |
| jqueryui-tooltip | `https://jqueryui.com/resources/demos/tooltip/default.html` |

ページごとに、まず `curl -sIL -o /dev/null -w '%{http_code}\n' <url>` が `200` であることを確かめる。計測スクリプトは HTTP ステータスを記録しないので、エラーページどうしが「一致」してしまう。

出力は `tmp/spike-029/live-<variant>-<name>.jsonl`。F400 を基準に `compare.mjs` で比べる。ページの揺れを知るため、F400 は 2 回取る（`live-F400b-<name>.jsonl`）。

**確認**: 結果文書の表 B ができる。行はページで、列は次のとおり:
- `triggers.length`
- 中身が出た組の数（`targets` のうち `no-content` 以外）
- 4 通りそれぞれの所要秒数と、F400 との一致・不一致（不一致なら中身）
- F400 どうしの一致（揺れ）
- A100 の `adaptiveExtended` と `adaptiveCapped`

後半 3 ページで中身が出た組が 0 なら、標本として役に立っていない。その旨を書き、同じ種類の別のページ（ライブラリの公式デモ）を 1 つ探して足す。見つからなければそのまま書く。

### ステップ 7: 試作を戻し、結果文書を書く

1. 試作の差分を `git diff -- packages/a11y-audit/src > tmp/spike-029/prototype.diff` で保存する。
2. `git checkout -- packages/a11y-audit/src` で戻す。
3. `plans/029-result-adaptive-hover-wait.md` を書く（日本語、冒頭は結論）。次の節を入れる:
   1. 結論: 次の 3 つのどれを勧めるか、とその理由。
      - (a) 動きを待つ方式で実装プランを書く。最低限の待ちと上限の値も示す。
      - (b) `skip-reset` だけを実装する。
      - (c) どちらも見送り、400 ms のままにする。
   2. 表 A（fixture 29 件 × 7 通り）と表 B（実ページ 8 つ × 4 通り）。
   3. 動きを待つ方式で拾えなかったもの（rAF など）と、その影響の向き（見落とし・誤警報・見逃し）。
   4. 実ページで上限に当たった回数と、その原因（あれば、ずっと何かを予約し続けるページなど）。
   5. 本実装で決めることの一覧（初期化スクリプトをどこで入れるか、他の検査への流用、公開する引数）。
   6. 付録: 試作の差分の全文と、使った計測コマンドの一覧。
4. `npx prettier --write plans/029-result-adaptive-hover-wait.md` と、新しい fixture 6 件。

**確認**:
- `git status --porcelain` に、新しい fixture 6 件と 2 つのプラン文書（と `plans/README.md`）しか出ない。
- `git diff -- packages/a11y-audit/src` が空。
- 全体の検証コマンドが exit 0。

## テスト計画

- このスパイクではテストを足さない。fixture 6 件は、次の実装プランが「正しい判定」を期待値にしたテストで使う。
- 試作が今の動きを壊していないことは、ステップ 4 の既存テスト（`fixed` で全件成功）で確かめる。

## 完了条件

- [ ] 新しい fixture 6 件がコミットされ、F400 で 6 件とも「正しい判定」と一致する（表 A）
- [ ] `plans/029-result-adaptive-hover-wait.md` があり、結論・表 A・表 B・拾えなかったもの・付録（試作の差分の全文）を含む
- [ ] `git diff 695e640..HEAD -- packages/a11y-audit/src` が空
- [ ] 全体の検証コマンドが exit 0
- [ ] `plans/README.md` の 029 の行を更新

## STOP 条件

- 差分確認で範囲内のファイルが変わっていて、「現状」の抜粋と食い違う。
- ステップ 2 の fixture が、2 回作り直しても F400 で「正しい判定」にならない。
- ステップ 4 の試作で `fixed` のまま既存テストが落ち、2 回直しても通らない。
- 試作に `src/` のほかのファイルを変える必要が出た（たとえば `measure.mjs` から `details` を読むために型や出力の形を変える必要がある）。`console.error` で済ませられないときは STOP。
- 実ページに届かない（ネットワーク不可、`curl` の最終ステータスが 200 でない）。そのページを外して進めない（後半 3 ページの差し替えはステップ 6 の手順の範囲で行う）。
- F400 どうしで結果が揺れるページが 3 つ以上ある（比べる土台にならない）。

## 保守メモ

- `getAnimations()` は CSS のアニメーションとトランジションと Web Animations API だけを返す。`requestAnimationFrame` や `setInterval` で動かす JS アニメーションは拾えないので、最低限の待ちを何 ms にするかで、それらをどこまで受けるかが決まる。
- `setTimeout` を包むと、ページの動きに口を挟むことになる。本実装では、包んだ関数が元の関数と同じ戻り値・同じ `this` で呼ぶこと、例外を出さないことをテストで確かめる。
- この方式がうまくいけば、ほかの固定の待ち（024〜028 の Tab ごとの待ち、change-on-input の待ち）にも使える可能性がある。その判断は結果文書の 5 節に書くだけにとどめ、このスパイクでは試さない。
