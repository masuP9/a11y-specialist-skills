# Plan 021: スパイク — 遅い検査の時間内訳を測り、縮め方を検査ごとに判断する

> **実行者への指示**: これはビルドプランではなく「計測スパイク」である。
> 成果物は計測結果と判断をまとめた文書 `plans/021-result-slow-check-timing.md` と、
> それを再現できる使い捨てスクリプト（結果文書の付録に全文を載せる）であり、
> `packages/a11y-audit/src/` は**一切変更しない**。各ステップを順守し、STOP 条件に
> 従い、完了後は `plans/README.md` のこのプランのステータス行を更新すること
> （レビュアーが索引を管理すると言った場合は除く）。
>
> **差分確認（最初に実行）**:
> `git diff --stat 4358e7f..HEAD -- packages/a11y-audit/src/constants.ts packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts packages/a11y-audit/src/playwright/runPointerCancellationCheck.ts packages/a11y-audit/src/playwright/runChangeOnInputCheck.ts packages/a11y-audit/src/playwright/runAutoPlayDetection.ts packages/a11y-audit/src/detectors/pause-control.ts packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts packages/a11y-audit/src/playwright/runKeyboardTrapCheck.ts packages/a11y-audit/src/playwright/runFocusOrderCheck.ts packages/a11y-audit/src/playwright/runKeyboardReachabilityCheck.ts`
> 差分があれば「現状」の抜粋と実コードを見比べ、待ち時間の場所や既定値が
> 変わっていたら STOP 条件として扱う。

## ステータス

- **優先度**: P3
- **工数**: M（計測 + 感度実験 + 文書。検査の変更そのものは別プラン）
- **リスク**: LOW（プロダクションコードへの変更なし。実ページにアクセスするが読み取りのみ）
- **依存**: なし（Plan 020 の `--concurrency` は main に入っている。commit `4358e7f`）
- **カテゴリ**: perf（計測スパイク）
- **計画時点**: commit `4358e7f`, 2026-10-16

## なぜ重要か

Plan 020 で CLI は検査を同時に走らせるようになり、全検査の所要時間は
「合計」から「一番遅い検査 + α」になった（`test/fixtures/index.html` で 52.8 秒 → 19.2 秒）。
これ以上縮めるには、一番遅い検査そのものを速くするしかない。

計画時点の実測（commit `8ccf591`、逐次実行、ローカル Chromium）:

| ページ | 検査 | 所要時間 |
|---|---|---|
| `https://www.w3.org/WAI/demos/bad/before/home.html` | content-on-hover-check | 34.0 秒 |
| 同上 | pointer-cancellation-check | 16.2 秒 |
| 同上 | auto-play-detection | 7.5 秒 |
| 同上 | change-on-input-check | 6.5 秒 |
| 同上 | keyboard-trap / focus-indicator / focus-order / keyboard-reachability | 各 4〜5 秒 |
| `test/fixtures/index.html`（リンク集、file://） | pointer-cancellation-check | 14.5 秒 |

遅さの正体は、コードを読む限り「要素ごとに決まった秒数を待つ」設計である（下の「現状」）。
ただし**どの待ちが何回入って何秒になっているか**、**縮めたら検出結果が変わるか**は
測っていない。待ちを短くすると見落としが増えうるので、検査ごとに「縮めてよいか・どう縮めるか」を
データで判断する必要がある。このスパイクはその判断材料を作る。

## 現状（計測が踏まえるべき事実）

すべて `packages/a11y-audit/src/` 配下。行番号は commit `4358e7f` 時点。

### 待ち時間の場所と既定値

`constants.ts` の既定値:

```
DEFAULT_NAVIGATION_SETTLE_MS = 50        (focus-indicator / keyboard-trap / focus-order / keyboard-reachability の Tab ごと)
SCREENSHOT_INTERVALS = [0, 2000, 4000, 6000]   (auto-play: 固定 6 秒)
SCREENSHOT_COMPARISON_WAIT = 2000 / PAUSE_CLICK_WAIT = 500   (detectors/pause-control.ts、停止ボタンがあるときだけ)
CHANGE_ON_INPUT_SETTLE_MS = 500          (欄ごとに 2 回)
POINTER_CANCELLATION_SETTLE_MS = 300     (要素ごとに 1 回) / POINTER_CANCELLATION_BACKGROUND_MS = 1_000 (context ごとに 1 回)
POINTER_CANCELLATION_TIMEOUT_MS = 60_000 / POINTER_CANCELLATION_MAX_TARGETS (要素数の上限)
CONTENT_ON_HOVER_SETTLE_MS = 400 / CONTENT_ON_HOVER_PERSIST_MS = 3_000 / CONTENT_ON_HOVER_TIMEOUT_MS = 120_000
```

`waitForTimeout` の呼び出し箇所（`git grep -n 'waitForTimeout(' -- packages/a11y-audit/src` で再確認できる）:

| 検査 | 場所 | 何を待つか |
|---|---|---|
| content-on-hover | `runContentOnHoverCheck.ts:1100` | トリガーごとの後始末（ポインタを隅へ・blur・Escape）の後 `settleMs` |
| 〃 | `:1134` | スクロール後 `min(settleMs, 100)` |
| 〃 | `:1150` | hover または focus の後 `settleMs`（新しい内容が出たか見る） |
| 〃 | `:1167` | **内容が出たときだけ** `persistMs`（3 秒）— 「消えずに残るか」 |
| 〃 | `:1182` | Escape の後 `settleMs` |
| 〃 | `:1203`, `:1231` | hover で残った内容にポインタを乗せ直す際に `settleMs` × 2 |
| pointer-cancellation | `runPointerCancellationCheck.ts:895-897` | context ごとに 1 回、`max(settleMs, 1000)`（ページが勝手に変わらないかの静観） |
| 〃 | `:971` | 要素ごとに押し下げ後 `settleMs` |
| change-on-input | `runChangeOnInputCheck.ts:678` | 欄に focus した後 `settleMs` |
| 〃 | `:714` | 値を変えて blur した後 `settleMs` |
| auto-play | `runAutoPlayDetection.ts:59` | スクリーンショット間隔（2 秒 × 3 回 = 6 秒固定） |
| focus-indicator | `runFocusIndicatorCheck.ts:572` | Tab ごとに `navigationSettleMs`（50 ms） |
| keyboard-trap | `runKeyboardTrapCheck.ts:201, 317, 413` | Tab ごと 50 ms、Escape 後 200 ms |
| focus-order | `runFocusOrderCheck.ts:661, 871` | Tab ごと 50 ms、ダイアログ後 300 ms |
| keyboard-reachability | `runKeyboardReachabilityCheck.ts:947` | Tab ごと 50 ms |

content-on-hover のトリガー 1 つあたりの流れ（`runContentOnHoverCheck.ts:1095-1235`、抜粋）:

```ts
    const resetState = async (): Promise<void> => {
      await page.mouse.move(0, 0);
      await page.evaluate(blurActive);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(settleMs);
    };
    // ...
      if (method === 'focus') {
        await page.evaluate(focusElement, { stateKey, index });
      } else {
        await page.mouse.move(point.x, point.y, { steps: 1 });
      }
      await page.waitForTimeout(settleMs);
      // ...
      if (shown.roots.length === 0) {
        details.noContent += 1;
        return 'empty';
      }

      // Stays by itself?
      await page.waitForTimeout(persistMs);
```

つまり「hover で何か出た」トリガーは 1 つにつき最低 `settleMs × 2 + persistMs ≈ 3.8 秒`、
残った場合はさらに `settleMs × 3` 程度かかる。Tab 系の 4 検査は待ちが 50 ms と小さく、
時間の大半は Tab ごとの `evaluate`（フォーカス先の記述・スタイル計算）である可能性が高い
— これは計測で確かめる。

### ソースを変えずに測れる仕組み

- browser を受け取る検査は `browser` の代わりに **`createContext`**（context を返す関数）を受け取る
  （`README.ja.md:464-479`、`runContentOnHoverCheck.ts:892,926`、`runFocusIndicatorCheck.ts:260,283`、
  `runChangeOnInputCheck.ts:498,522`、`runFocusOrderCheck.ts:556` ほか）。この関数の中で
  `context.newPage` を包み、作られた page の `waitForTimeout` を差し替えれば、検査ごとの
  「固定待ちの回数・合計ミリ秒」が取れる。page を受け取る検査（auto-play、time-limit）は
  スクリプト側で page を作って同じ差し替えをする。
- 待ち時間は関数の引数で変えられる: content-on-hover `settleMs` / `persistMs`（`:115-117`）、
  pointer-cancellation `settleMs` / `maxTargets`（`:120-124`）、change-on-input `settleMs`（`:87`）、
  focus-indicator `navigationSettleMs`（`:264`）、focus-order `settleMs`（`:559`）、
  keyboard-trap / keyboard-reachability `walkSettleMs`（`:100` / `:786`）。
  **感度実験は src を触らずにこれで行う。**
- すべての検査は `writeResult: false, quiet: true` を受け付け、戻り値だけで結果が得られる
  （`src/utils/test-harness.ts:86-95`）。
- 要素数は結果の `details` にある。読む場所: `src/types.ts` の各 `*Details` インターフェース
  （content-on-hover `:1766-1790` の `triggers` / `untested` / `aborted`、
  pointer-cancellation `:1553-1560` の `untested` / `delegationRootCount` / `restarts` / `aborted`、
  change-on-input `:1333-1340` の `untested` / `restarts` / `aborted`、
  focus-indicator `:294-298` の `aborted.recordedCount` / `focusableCount`）。
  各 details に「試した要素数」を表す項目があるので、スクリプトを書く前に該当インターフェースを
  読んで項目名を確定する（推測しない）。

### 守るべき決まり

- `AGENTS.md`: 文書は日本語を正本とし英語版も作る決まりだが、**`plans/` 配下の文書は対象外**
  （既存のスパイク結果 `plans/006-result-keyboard-trap-design.md` も日本語のみ）。
- 実ページの計測では、ページの本文・フォームの値・スクリーンショットを結果文書に**残さない**。
  残すのは件数・秒数・ルール ID・要素のセレクタだけ。
- 公開リポジトリなので、計測対象の URL は公開ページに限る（下の候補リスト）。

## 必要なコマンド

| 目的 | コマンド（リポジトリルートで） | 期待 |
|---|---|---|
| インストール | `npm ci` | exit 0 |
| ビルド | `npm run build --workspace @a11y-skills/audit` | exit 0、`packages/a11y-audit/dist/` 更新 |
| 計測スクリプト実行 | `node packages/a11y-audit/test-results/spike-021/measure.mjs <url> [--settle-scale 0.5]` | 標準出力に JSON 行（下記） |
| 比較用の CLI | `node packages/a11y-audit/dist/cli.js --url <url> --checks all --concurrency 1 --output-dir packages/a11y-audit/test-results/spike-021/cli-<name>` | `[name] DONE in …` 行 |
| 整形（結果文書） | `npx prettier --write plans/021-result-slow-check-timing.md` | exit 0 |
| 検証ゲート（src を変えていない確認） | `npm run lint && npm run format:check && npm run typecheck && npm run validate:skills` | exit 0 |

`packages/a11y-audit/test-results/` は gitignore 済み（`git check-ignore -v packages/a11y-audit/test-results` で確認できる）。
スクリプトはそこに置き、**コミットしない**。再現性のためにスクリプト全文を結果文書の付録に載せる。
Playwright の Chromium が無ければ `npx playwright install chromium`（`packages/a11y-audit` で）。
`npm test` は走らせなくてよい（src を変えないため）。

## スコープ

**変更してよいもの**:
- `plans/021-result-slow-check-timing.md`（新規。成果物）
- `plans/README.md`（ステータス行）
- `packages/a11y-audit/test-results/spike-021/`（gitignore 済み。スクリプトと出力）

**触ってはいけないもの**:
- `packages/a11y-audit/src/**` — 定数・待ち時間・検査ロジックを 1 行も変えない。
  「ついでに縮める」は禁止。縮め方はこのスパイクの結論を受けた別プランで行う。
- `packages/a11y-audit/test/**`、`README*.md`、`CHANGELOG.md`、`skills/**`、バージョン欄。
- 実ページに対する書き込み操作（フォーム送信など）。検査が合成イベントを送ることは
  検査の仕様なので許容するが、ログインが要るページ・送信で副作用が出るページは対象にしない。

## Git の進め方

- ブランチ: `docs/spike-slow-check-timing`
- コミット: 結果文書 1 コミット（`docs(plans): 021 — slow check timing spike result`）。
  `plans/README.md` の更新は同じコミットでよい。
- push / PR は指示があるまでしない。

## 手順

### ステップ 1: 対象ページと対象検査を決める

対象検査（Plan 020 で `slow: true` を付けた 8 つ + auto-play の内訳用に pause-control）:
`content-on-hover-check`, `pointer-cancellation-check`, `auto-play-detection`, `change-on-input-check`,
`keyboard-trap-check`, `focus-indicator-check`, `focus-order-check`, `keyboard-reachability-check`。

対象ページ（公開・ログイン不要・送信の副作用なし。5 ページ）:

| 名前 | URL | 選ぶ理由 |
|---|---|---|
| w3c-bad | `https://www.w3.org/WAI/demos/bad/before/home.html` | 計画時の基準値がある |
| w3c-good | `https://www.w3.org/WAI/demos/bad/after/home.html` | 同じ内容で作りの良い版。差が出るか |
| w3c-wai | `https://www.w3.org/WAI/` | ナビに hover メニューがある実サイト |
| mdn | `https://developer.mozilla.org/en-US/` | フォーカス可能要素が多い |
| wikipedia | `https://en.wikipedia.org/wiki/Main_Page` | リンクが非常に多い（上限に当たるか） |

ページが落ちていたら（HTTP 5xx / 接続不可）、同種の公開ページに差し替えて結果文書に書く。
3 ページ以上測れなければ STOP。

**確認**: `curl -sI <各 URL> | head -1` → すべて `200`。

### ステップ 2: 計測スクリプトを書く（`packages/a11y-audit/test-results/spike-021/measure.mjs`）

ESM。`packages/a11y-audit/dist/playwright/index.js` から各 `run*` 関数を、`@playwright/test` から
`chromium` を import する（`packages/a11y-audit/node_modules` か root の `node_modules` から解決される。
解決できなければスクリプトを `packages/a11y-audit/` 直下の gitignore 済み場所に置くか、
`NODE_PATH` ではなく相対 import に直す）。

やること:

1. `chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })`（CLI と同じ。`src/cli.ts` 参照）。
2. 計測用の包み:
   ```js
   function instrument(page, stats) {
     const wait = page.waitForTimeout.bind(page);
     page.waitForTimeout = async (ms) => {
       stats.waits += 1;
       stats.waitMs += ms;
       (stats.byMs[ms] ??= 0); stats.byMs[ms] += 1;
       return wait(ms);
     };
     return page;
   }
   async function createContext(browser, stats) {
     const context = await browser.newContext();
     const newPage = context.newPage.bind(context);
     context.newPage = async () => instrument(await newPage(), stats);
     return context;
   }
   ```
   browser 系の検査には `createContext: () => createContext(browser, stats)` を渡す。
   page 系（auto-play）は `context.newPage()` して `instrument` し、`gotoAndSettle`
   （`dist/playwright/gotoAndSettle.js`）で遷移してから渡す。
3. 検査ごとに `{ writeResult: false, quiet: true, targetUrl, outputDir: <spike dir> }` で 1 回ずつ
   順に（並列にしない。CPU の影響を除くため）実行し、壁時計時間を測る。
   auto-play は `outputDir` にスクリーンショットを必ず書くので spike dir を渡す。
4. 各検査の結果から要素数を取る（ステップ 2 の前に `src/types.ts` の `*Details` を読んで項目名を確定）。
   少なくとも: content-on-hover `details.triggers.length` と内容が出た数（`persistMs` を待った回数 =
   `stats.byMs[3000]`）、pointer-cancellation の押した要素数、change-on-input の試した欄数、
   Tab 系の `focusableCount` / 記録数、`aborted` の有無（時間予算で打ち切られたか）。
5. `--settle-scale <k>` を受け取ったら、各検査の待ちを `k` 倍にして渡す
   （content-on-hover `settleMs: 400*k, persistMs: 3000*k`、pointer-cancellation `settleMs: 300*k`、
   change-on-input `settleMs: 500*k`、Tab 系 `walkSettleMs` / `navigationSettleMs` / `settleMs: 50*k`。
   auto-play は引数で変えられないので対象外）。`k` は 0.5 と 0.25 を使う。
6. 検査 1 つにつき JSON を 1 行出力:
   ```json
   {"page":"w3c-bad","check":"content-on-hover-check","scale":1,"durationMs":34012,"waits":41,"waitMs":27600,"byMs":{"400":34,"3000":7},"elements":12,"aborted":null,"summary":{"violationCount":0,"incompleteCount":0,"passCount":0},"rules":{"a11y-skills/content-on-hover-dismissible":"incomplete:3"}}
   ```
   `rules` は「ルール ID → どのバケットに何件か」。感度比較で使う。
7. 1 検査が 180 秒を超えたら打ち切って `"error":"timeout"` を出す。

**確認**: `node packages/a11y-audit/test-results/spike-021/measure.mjs "file://$PWD/packages/a11y-audit/test/fixtures/index.html"`
→ 8 検査分の JSON 行が出て、`durationMs` の合計が Plan 020 時点の逐次実測（各検査 1〜15 秒）と
同じ桁。`waitMs <= durationMs` がすべての行で成り立つ。

### ステップ 3: 基準計測（scale 1）

5 ページ × 8 検査を **2 回ずつ**測る（ばらつきを見るため）。出力は
`packages/a11y-audit/test-results/spike-021/baseline-<page>-<n>.jsonl`。

同じページに CLI（`--concurrency 1 --checks all`）も 1 回走らせ、`[name] DONE in …` の秒数が
スクリプトの `durationMs` と ±20% で一致することを確かめる（スクリプトの包みが検査を
遅くしていないことの確認）。

**確認**: 10 ファイル（5 ページ × 2 回）がそれぞれ 8 行。`error` 行があればページと検査を控える。

### ステップ 4: 感度実験（scale 0.5 と 0.25）

5 ページ × 7 検査（auto-play を除く）× 2 スケール。出力 `sensitivity-<page>-<scale>.jsonl`。

比較するもの（基準の 1 回目と）:
- `rules`（ルール ID ごとのバケットと件数）が同じか
- `elements`（試した要素数）が同じか
- `aborted` が変わらないか（待ちを縮めて時間予算内に収まるようになった、は良い変化。逆は STOP ではないが記録）
- `durationMs` がどれだけ縮んだか

ばらつきの基準: 基準 2 回の間で `rules` が違う検査は「元々揺れる」として印を付け、感度の判定から外す
（揺れの原因は結果文書に書くが、このスパイクでは追わない）。

**確認**: 10 ファイルがそれぞれ 7 行。

### ステップ 5: 結果文書を書く（`plans/021-result-slow-check-timing.md`）

構成（この順で。既存のスパイク結果 `plans/006-result-keyboard-trap-design.md` と同じく日本語・Markdown）:

1. **計測条件**: commit、マシン、Chromium のバージョン、日付、対象ページ（URL と到達性）、スクリプトの置き場所。
2. **時間内訳の表**（ページ × 検査）: `durationMs`、`waitMs`、待ちの割合（`waitMs / durationMs`）、
   `waits`、`elements`、要素 1 つあたりの秒数（`durationMs / elements`）、`aborted`。2 回の差も書く。
3. **どの待ちが支配的か**: `byMs` から、検査ごとに「どの定数が合計の何 % か」。
   例: content-on-hover の `persistMs` が合計の 70% など。
4. **感度実験の表**（検査 × スケール）: 縮んだ秒数、`rules` の一致/不一致、`elements` の一致、`aborted` の変化。
5. **検査ごとの判断**。各検査について次の 4 つの選択肢のどれを勧めるかと根拠:
   - **早く打ち切る**（例: content-on-hover は内容が消えた時点で `persistMs` の残りを待たない。
     「残る」場合だけ全部待つ。見落としは増えない）
   - **待ちを短くする**（感度実験で `rules` が変わらなかった範囲まで。変わったものは不可）
   - **対象を絞る**（同じセレクタ・同じ listener の要素を 1 つに代表させる、上限件数。
     見落としの可能性と引き換えなので、どの条件なら代表させてよいかを書く）
   - **変えない**（auto-play の 6 秒のように待ちが検出の定義そのもの、または感度実験で検出が変わった）
   判断ごとに「縮む見込み秒数（基準ページでの実測から）」と「検出への影響（実験で確かめた範囲）」を書く。
6. **次に書くプラン**: 価値があると判断した変更だけを、1 プラン 1 検査で列挙（優先順位つき）。
   「やらない」と判断したものも理由つきで列挙する。
7. **付録**: `measure.mjs` の全文、生データのファイル名一覧。

**確認**: `npx prettier --check plans/021-result-slow-check-timing.md` → exit 0。
文書中にページ本文・入力値・スクリーンショットの貼り付けが無い（`git grep -n -E '<img|data:image' -- plans/021-result-slow-check-timing.md` → 0 件）。

### ステップ 6: src を変えていないことの確認とコミット

`git status --porcelain` が `plans/021-result-slow-check-timing.md` と `plans/README.md` だけであること。
`npm run lint && npm run format:check && npm run typecheck && npm run validate:skills` → exit 0。
コミット（Git の進め方の節）。

## テスト計画

プロダクションコードを変えないので自動テストの追加はない。スパイクの「テスト」は次の 2 つ:

- ステップ 2 の確認: 包みを入れたスクリプトの `durationMs` が CLI の `[name] DONE in …` と ±20% で一致する
  （包みが検査を歪めていない）。
- ステップ 3 の 2 回計測: 同じ条件で `rules` と `elements` が一致する検査だけを感度判定に使う
  （元々揺れる検査を「待ちを縮めたせい」と誤判定しない）。

## 完了条件

すべて満たすこと:

- [ ] `plans/021-result-slow-check-timing.md` が存在し、上の 7 節を持つ
- [ ] 結果文書の内訳表に 3 ページ以上 × 8 検査の `durationMs` / `waitMs` / `elements` がある
- [ ] 感度表に 7 検査 × 2 スケールの `rules` 一致/不一致がある
- [ ] 8 検査それぞれに「早く打ち切る / 待ちを短くする / 対象を絞る / 変えない」のいずれかの判断と根拠がある
- [ ] `git diff --stat 4358e7f..HEAD -- packages/a11y-audit/src packages/a11y-audit/test` が空
- [ ] `npm run lint && npm run format:check && npm run typecheck && npm run validate:skills` が exit 0
- [ ] `plans/README.md` のステータス行が更新されている

## STOP 条件

次の場合は止めて報告する（勝手に補わない）:

- 「現状」の待ちの場所・既定値が実コードと違う（ドリフト）。
- browser 系の検査のどれかが `createContext` を受け付けない（`git grep -n createContext -- packages/a11y-audit/src/playwright/<file>` で 0 件）。
  その検査は `browser` を渡して `durationMs` だけ測り、`waitMs` は「未計測」として続行してよいが、報告には明記する。
- 対象ページが 3 ページ未満しか到達できない（ネットワーク制限など）。
- `waitForTimeout` の差し替えが効かない（`waits` が常に 0）— Playwright の実装が変わった可能性。
  別の差し替え方法を探さず報告する。
- 基準 2 回の計測で 8 検査中 4 つ以上の `rules` が一致しない（環境が不安定で判断材料にならない）。
- 計測中に実ページでフォーム送信・購入などの副作用が疑われる挙動（送信後の URL への遷移など）を見た
  — そのページを候補から外し、何が起きたかを報告する。
- スパイクの範囲を超える発見（検査のバグなど）: 結果文書の「気づき」節に書くに留め、直さない。

## 保守メモ

- このスパイクの結論は、検査ごとの別プラン（1 検査 1 プラン）の「なぜ重要か」と「現状」に流用する想定。
  結果文書には、別プランがそのまま引用できるよう、数値と根拠を検査ごとに閉じて書く。
- 待ちを縮める変更を実装するときは、Plan 020 が足した `test/cli-concurrency.spec.ts` の一致テスト
  （逐次 vs 並列）と `test/fixture-gallery.spec.ts` の期待バケットが、検出の回帰を捕まえる基盤になる。
  変更後に `rules` が変わる fixture が出たら、それは「縮めすぎ」の信号。
- Plan 020 は `slow: true` を 8 検査に手で付けた。このスパイクの内訳表で「実はそれほど遅くない」検査が
  あれば、`src/cli.ts` の `slow` 印を見直す小さなフォローアップになる（このスパイクでは触らない）。
- 計測対象の実ページは中身が変わる。結果文書の数値は日付つきの参考値として扱い、再計測は付録のスクリプトで行う。
