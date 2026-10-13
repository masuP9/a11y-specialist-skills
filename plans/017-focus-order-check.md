# Plan 017: フォーカス順序 (WCAG 2.4.3) チェック — Tab の順と見た目の並びのずれ・モーダルのフォーカス

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/67

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> の本プランのステータス行を更新する（レビュアーが索引を管理すると言った場合を除く）。
>
> **Drift check (run first)**:
> `git diff --stat f6269e9..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json packages/a11y-audit/README.md packages/a11y-audit/README.ja.md packages/a11y-audit/TODO-COVERAGE.md packages/a11y-audit/CHANGELOG.md skills/auditing-wcag`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比較してから
> 進む。構造的な不一致（`CHECK_REGISTRY` の形・`RULES` の形・`bucketize` /
> `toNode` / `pageNode` のシグネチャ・`buildEnvelopeSchema` のシグネチャ・
> `test/helpers/fixtures.ts` の `buildRunnerRegistry` の形の変化）は STOP。
> 別の新チェック（Issue #69 など）が先にマージされていて、`types.ts` /
> `constants.ts` / `rule-registry.ts` / `axe-format.ts` / `cli.ts` / `schemas` /
> テストの登録表 / ドキュメントの一覧に**新しい行が増えているだけ**なら構造的な
> 不一致ではない。その行の後ろに本チェックを足す（チェック数・ルール数の数え直しを忘れない）。

> **番号について**: `016` は Issue #69 のプランが並行して使う可能性があるため `017` にした。

## Status

- **Codex plan review**: 通過（3 巡目、2026-10-13、見送った low 0 件）

- **Priority**: P2
- **Effort**: L（3〜4 日相当。Tab の一巡は既存の書き方の写しで済むが、ダイアログの
  開閉と、位置の比較の調整・フィクスチャに時間がかかる）
- **Risk**: LOW〜MEDIUM（新規チェックの追加のみで既存チェックには触れない。
  ダイアログの開閉は実際に Enter / Escape を押すので、ページによっては送信・遷移が
  起きうる。CI の `--checks all` スモークが新チェックを必ず通すが、`cli-smoke.html`
  にはフォーカスできる要素が 1 つ・ダイアログが無いので、2 ルールとも inapplicable で終わるはず）
- **Depends on**: Issue #52（`FocusRecord` に `tabStep` と `rect` を足す）— **完了済み**
  （`src/types.ts:181-193`）。本チェックは自前で Tab を押すので #52 の記録は使わないが、
  分析関数 `analyzeFocusOrder` を #52 の記録にも当てられる形で公開する（設計 C）。
- **Category**: feature
- **Planned at**: commit `f6269e9`, 2026-10-13
- **Consumer**: 下流の WCAG テスト管理ツール（関数 API で呼び、`details` を取り込む）。
  評価できていない達成基準の洗い出しで 2.4.3 が挙がった。

## Why this matters

2.4.3（フォーカス順序）はいま完全に手動（`coverage-matrix` で `インタラクティブ`・
「フォーカス順ログ」）。DOM の順で判定すると CSS の `order` / `flex-direction: *-reverse` /
正の `tabindex` / 絶対配置で誤るため、パッケージは 2.4.3 を対象外にしてきた。
実際に Tab を押した順に要素の位置を並べれば、「前の要素より大きく上へ戻る」「同じ行で
逆向きに進む」「遠くへ跳んですぐ戻ってくる」といった、人が見て怪しい移動を数値付きで
拾える。さらに「モーダルを開いてもフォーカスが外に残る」「閉じたあと開いたボタンに
戻らない」は、2.4.3 の典型的な不適合（WCAG の失敗例 F85 系）で、操作して確かめられる。

ずれが問題か（意味や操作の順が保たれているか）は人か AI が決めるので、すべて
`incomplete` で返す。これを **17 個目のチェック `focus-order-check`（SC 2.4.3）** とする。

### 既存の `focus-indicator-check` に足さず、新チェックにする理由

- `focus-indicator-check` の Tab の一巡は、要素ごとにスタイルを取り、3.2.1 の遷移で
  やり直し、スクリーンショットの比較もする重い処理。2.4.3 には位置だけあればよい。
- ダイアログの確認は、開くボタンごとにページを読み直して Enter / Escape を押す。
  `focus-indicator-check` の「Tab を押すだけ」という前提を崩す。
- 既存チェックの挙動・結果の意味を変えない（過去の新チェックのプランと同じ方針）。
- 一方、分析は純粋関数 `analyzeFocusOrder` に分けて公開するので、`focus-indicator-check`
  の `details.allElements`（#52 で `tabStep` と `rect` を持つ）を持っている利用者は、
  それに当てても同じ判定を得られる（README に書く）。

## Current state（統合点 — `f6269e9` で確認済み）

リポジトリは npm workspaces モノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` ビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース。テストは Playwright Test で、**`../dist/...` から import する**
（先に build が要る）。

### 見本にするファイル

- **`src/playwright/runChangeOnInputCheck.ts`** — `browser` を受けて自前の context を作り、
  部品ごとに操作し、遷移したら打ち切る。ファイル先頭コメントの書き方（何をページに
  するか / Limitations の列挙）、`ACTION_TIMEOUT_MS`、`NAVIGATION_ERROR` 正規表現、
  ブラウザ内関数 `getUniqueSelector`（「Keep in sync」コメント付き）を**写して使う**。
  冒頭（:1-40）:
  ```ts
  /**
   * Change on Input Check
   *
   * WCAG 3.2.2 (On Input)
   * ...
   * Like the focus-indicator check, this one owns its `BrowserContext`: ...
   * Limitations:
   * - Only controls in the main frame's light DOM ...
   */
  ```
- **`src/playwright/runKeyboardReachabilityCheck.ts:990-1000`** — Tab の一巡の終わり方:
  ```ts
  let firstActive: number | null = null;
  for (let i = 0; i < pressN && !run.aborted; i++) {
    if (timedOut()) break;
    await page.keyboard.press('Tab');
    await settle();
    const r = await sync();
    if (!r) break;
    if (firstActive === null) firstActive = r.active;
    else if (r.active === firstActive) break; // cycled once
  }
  ```
  押す回数の上限は「フォーカスできる要素の数 + 余り」（`:979-981`）。
- **`src/utils/target-spacing.ts`** と **`test/target-spacing.spec.ts`** — ブラウザ不要の
  純粋関数を `src/index.ts`（`:35-40`）から export し、単体テストする形。

### 位置の記録（#52 で入ったもの）

`src/types.ts:125-131`:
```ts
/** Element rectangle in page coordinates (viewport rect + scroll offset). */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```
`src/types.ts:181-193`（`FocusRecord` の一部）:
```ts
  id: number;
  /**
   * Which Tab key press (1-based, counted per page load) moved focus to this
   * element, including an element inside an iframe. null when focus arrived
   * another way (autofocus, script).
   */
  tabStep: number | null;
  /**
   * Element rectangle at the moment it received focus. Page coordinates of the
   * element's own document: inside an iframe the origin is that iframe
   * document's top-left, not the main page's (see `frame`).
   */
  rect: PageRect;
```
`runFocusIndicatorCheck.ts:1511-1516` が `rect` をページ座標で取る書き方
（`box.left + window.scrollX` / `box.top + window.scrollY`）。本チェックも同じ式で取る。

### 新チェック追加の統合点（直近の前例: accessible-authentication-check, plan 015）

1. `src/types.ts` — `CheckSource` ユニオン（:21-37、末尾が `'accessible-authentication-check'`）に
   `'focus-order-check'` を追加。details 型もここ（ファイル末尾に節を足す）。
2. `src/constants.ts` — 新定数。既存の `FOCUSABLE_SELECTOR`（:81）、`DEFAULT_NAVIGATION_SETTLE_MS = 50`（:94）、
   `HTML_SNIPPET_MAX_LENGTH` を使う。`CHANGE_ON_INPUT_*`（:793〜）の並べ方に合わせる。
3. `src/utils/rule-registry.ts` — `RULES`（:41〜446）。`// --- accessible-authentication-check ---`
   の節（:291-333）の後、`// --- time-limit-detector ---` の前に節を足すか、
   `// --- keyboard-reachability-check ---`（:431-445）の後ろ（`} as const` の直前）に足す。**後者**にする。
4. `src/utils/axe-format.ts` — `bucketize(buckets, key, nodes, applicable, override?)`（:91）、
   `toNode(el, failureSummary)`（:126。`el` は `{ selector, html?, htmlTruncated?, tag? }`）、
   `pageNode(failureSummary)`（:138）。`normalizeFocusCheck`（:225-301）が書き方の見本。
5. `src/index.ts` — axe-format の export リスト（:44〜、`normalizeAccessibleAuthenticationCheck` がある）に
   `normalizeFocusOrderCheck` を、`./utils/target-spacing.js` の export（:35-40）と同じ形で
   `./utils/focus-order.js` の `analyzeFocusOrder` と型を追加。
6. `src/playwright/index.ts` — runner と Options 型の export。
7. `src/schemas/index.ts` — `buildEnvelopeSchema`（:171）で schema を作り、`RESULT_SCHEMAS`（:1306〜）に登録。
8. `src/cli.ts` — `CHECK_REGISTRY` 末尾（`accessible-authentication-check` の項 :246-257 の後ろ、`];` の前）に
   `keyboard-reachability-check`（:195-208）と同じ `kind: 'browser'` の項（lazy import）。
9. `src/test-entries/focus-order-check.ts`（新規）— `src/test-entries/keyboard-reachability-check.ts` と同形。
10. `packages/a11y-audit/package.json` — `exports` に `./test-entries/focus-order-check`
    （`keyboard-reachability-check` の項 :92-95 と同形）、`description` のチェック列挙に追記。
11. テスト: `test/helpers/fixtures.ts` の `buildRunnerRegistry`（`accessible-authentication-check` の項 :125-128
    の後ろに `kind: 'browser-navigating'`）、`test/fixture-gallery.spec.ts`（`MANIFEST`、冒頭コメント
    「all 16 checks」「all 28 custom finding-capable rules」→ 17 / 30）、
    `test/rule-classification.spec.ts`（`FINDING_EXPECTATIONS`）、`test/schema-validation.spec.ts`。
    フィクスチャは `test/fixtures/pages/<check>/*.html`。`runFixtureCheck` の呼び方は
    `test/keyboard-reachability.spec.ts:34` 付近が見本。
12. ドキュメント:
    - `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表（JA :14-32）、「`browser` を受けます」の文
      （JA :34-37）、チェック名一覧（JA :184-202）、`timeBudgetMs` / `maxTabPresses` の段落（JA :417）、
      test entry の列挙（JA :453 付近）。EN は対応する箇所。
    - `packages/a11y-audit/CHANGELOG.md`: `## Unreleased`（:6）に `### Added` を作る（今は `### Fixed` だけ）。
    - `packages/a11y-audit/TODO-COVERAGE.md`（JA のみ）: 「## 部分的に自動化可能」節の 3.3.8 の節（:184〜）の後ろに
      2.4.3 の節、「## 実装優先度（案）」の表（:254〜264 付近）に 1 行。
    - `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md`: CLI チェック表（:123 が keyboard-reachability、:127 が
      accessible-authentication）。
    - `skills/auditing-wcag/references/coverage-matrix.ja.md` / `.md`: :44 が 2.4.3 行、:90-103 が
      「基準 × チェック名 × 出力ファイル」表（SC 順。2.2.1 :97 と 2.4.7 :98 の間に入れる）。
    - `skills/auditing-wcag/references/interactive-checks.ja.md` / `.md`: :35 が 2.4.3 行。
      `keyboard-reachability-check` の節（:19〜）の書式で節を足す。

### CI

`.github/workflows/ci.yml` が `dist/cli.js --url file://.../cli-smoke.html --checks all` を実行し、
exit code 1 と `Errors: 0` を要求する。`cli-smoke.html` は `<img>` と
`<input type="text" id="name-field">` だけ（フォーカスできる要素 1、ダイアログ 0）。

## Commands you will need

リポジトリルートで実行する（worktree では `npm --prefix <worktree> run <script>`）。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| Full test suite | `npm test` | all pass |
| New specs only | `npm test --workspace @a11y-skills/audit -- test/focus-order.spec.ts test/focus-order-analysis.spec.ts` | all pass |
| List checks | `node packages/a11y-audit/dist/cli.js --list-checks` | 末尾が `focus-order-check` |
| 整形 | `npx prettier --write <path>` | — |
| 全体検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/utils/focus-order.ts`、`src/playwright/runFocusOrderCheck.ts`、
  `src/test-entries/focus-order-check.ts`、
  `test/fixtures/pages/focus-order/{in-order,backward-block,backward-inline,backward-tail,columns,rtl,detour,fixed,shadow,first-focus-navigates,dialog-good,dialog-focus-outside,dialog-no-return,dialog-navigates,dialog-open-navigates,dialog-mixed,none}.html`、
  `test/focus-order.spec.ts`、`test/focus-order-analysis.spec.ts`
- 編集（追加のみ）: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、
  `src/utils/axe-format.ts`、`src/index.ts`、`src/playwright/index.ts`、
  `src/schemas/index.ts`、`src/cli.ts`、`packages/a11y-audit/package.json`
  （`exports` と `description` のみ）、`test/helpers/fixtures.ts`、
  `test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、
  `test/schema-validation.spec.ts`
- ドキュメント: 上記統合点 12 のファイル

**Out of scope**（触らない）:

- 既存チェックの runner・normalizer・schema・rule（特に `runFocusIndicatorCheck.ts` と
  `FocusRecord`）。見た目が近くても変えない
- iframe の**中**の要素の位置（iframe にフォーカスがある間は iframe 要素の箱で代用する。設計 A）
- ダイアログの中の Tab の巡回（外へ漏れるか）。2.1.2 の `keyboard-trap-check` と重なるので今回は見ない
- 開くボタンの自動推定（属性の無い「開く」ボタン）。設計 D の決まった属性だけを見る
- `popover` 属性（非モーダル）
- `package.json` の `version`、プラグイン 4 フィールドの version（リリース PR で別途）
- `.github/workflows/`
- `plans/` の他のプラン（特に Issue #69 のプラン）

## Git workflow

- ブランチ: `feat/focus-order-check`
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`。`git log` の例:
  `feat(a11y-audit): add accessible-authentication-check for WCAG 3.3.8 candidates (#91)`）:
  1. `feat(a11y-audit): add focus order analysis (WCAG 2.4.3)`（分析関数と単体テスト）
  2. `feat(a11y-audit): add focus order types, constants, rules, normalizer and schema`
  3. `feat(a11y-audit): add focus-order-check runner`
  4. `feat(a11y-audit): register focus-order-check in CLI and exports`
  5. `test(a11y-audit): add focus-order-check fixtures and specs`
  6. `docs: document focus-order-check (2.4.3)`
- 公開リポジトリなので、コミットされる文面に下流の利用者のツール名・サービス名を
  書かない（「downstream consumer」と書く）。
- push・PR は指示されたときだけ。PR 本文に `Closes #67`。

## 設計

### A. Tab の一巡（runner、主文書）

1. `resolveCreateContext` で context を作り、`newPage()`、`gotoAndSettle(page, targetUrl)`。
2. `page.viewportSize()`（null なら `{ width: 1280, height: 720 }`）と、
   `getComputedStyle(document.documentElement).direction`（`'rtl'` 以外は `'ltr'`）を記録。
3. 押す回数の上限 `pressN = min(wanted, maxTabPresses)`、
   `wanted = focusableCount + FOCUS_ORDER_TAB_SLACK + frameCount * FOCUS_ORDER_FRAME_SLACK`。
   `focusableCount` は主文書と、**開いている shadow root を再帰的にたどった中**の
   `querySelectorAll(FOCUSABLE_SELECTOR)` の件数の合計（`runFocusIndicatorCheck.ts:1411-1421` の
   `queryFocusable` と同じたどり方）。`frameCount` は主文書の `iframe, frame` 要素の数
   （中を数えられないので 1 枚ごとに余りを足す）。`wanted > maxTabPresses` なら `tabWalk.capped = true`。
4. 各回: 時間の上限を確かめる → `page.keyboard.press('Tab')` → `page.waitForTimeout(settleMs)` →
   `page.url()` が開始時と違えば `aborted = { reason: 'navigation', url }` で一巡を終える →
   ブラウザ内関数 `describeFocus()` を `page.evaluate`（失敗が `NAVIGATION_ERROR` に当たれば
   同じく navigation で終える）。
5. `describeFocus()`（ブラウザ内。シリアライズされるので import しない）:
   - `let el = document.activeElement; const hosts = []; while (el?.shadowRoot?.activeElement) { hosts.push(el); el = el.shadowRoot.activeElement; }`
   - `el` が null / `document.body` / `document.documentElement` → `null` を返す（記録しない。
     一巡の終わりでブラウザの外へ出た状態。押し続ける）。
   - 要素ごとの番号は `window.__a11yFocusOrderIds`（`WeakMap<Element, number>`。無ければ作る）で振る。
     **同じ要素が続いた（iframe の中を進んでいる間など）ときは記録しない**。
   - 返す値: `{ elementId, selector, shadowHosts, tag, role, name, html, htmlTruncated, rect, positioning, inFrame }`
     - `selector`: `runChangeOnInputCheck.ts` の `getUniqueSelector` を写したもの（要素を含む
       ルート（document か shadow root）からの相対）。`shadowHosts`: `hosts` を外側から
       `getUniqueSelector` したもの。
     - `name`: `aria-label` || textContent の先頭 80 文字（空白を詰める）。
     - `html` / `htmlTruncated`: `outerHTML` を `HTML_SNIPPET_MAX_LENGTH` で切る。
     - `rect`: `getBoundingClientRect()` + `window.scrollX` / `scrollY`（`PageRect`）。
     - `positioning`: 自分と祖先（shadow host をまたいで `getRootNode().host` を辿る）に
       `position: fixed` があれば `'fixed'`、無くて `sticky` があれば `'sticky'`、どちらも無ければ `'flow'`。
     - `inFrame`: `el.tagName === 'IFRAME' || el.tagName === 'FRAME'`（フォーカスがフレームの中にある）。
6. 1 件目の `elementId` がもう一度出たら一巡したとして終える（`tabWalk.ended = 'cycle'`）。
   上限に達したら `'tab-limit'`、時間切れなら `'timeout'`（`aborted = { reason: 'timeout', url }` も立てる）、
   遷移なら `'navigation'`。押した回数を `tabWalk.presses` に。
   **`'cycle'` 以外で終わった一巡は「最後まで見たか分からない」扱い**（設計 G で incomplete の pageNode を出す）。
   **記録が 0 件でも、`'navigation'` / `'timeout'` で止まったときは同じく incomplete**（最初の要素の focus で
   遷移するページ、記録前の時間切れ）。inapplicable にしてよいのは「対象が無いと確かめられた」場合だけ:
   `ended === 'tab-limit' && stops.length === 0 && focusableCount === 0 && frameCount === 0`。
   判定に使うので `focusableCount` と `frameCount` も `tabWalk` に記録する。
7. 記録した要素を `stops`（Tab の順。`step` は何回目の Tab で来たか、1 始まり）にする。

### B. ダイアログの確認（runner、Tab の一巡の後）

1. 同じ page を `gotoAndSettle` で読み直し、開くボタンの候補を集める（ブラウザ内、主文書の light DOM）:
   - `FOCUS_ORDER_DIALOG_TRIGGER_SELECTOR` に当たる要素（定数。下記）、または
     `[aria-controls]` で、`aria-controls` の id のどれかが `FOCUS_ORDER_DIALOG_SELECTOR` に当たる要素、または
     `[commandfor]` で `command` が `show-modal` のもの。
   - 見えている（`getClientRects().length > 0` かつ `visibility !== 'hidden'`）・`:disabled` でない・
     `[inert]` の中でないもの。`selector` で重複を除き、ページの順で先頭から
     `maxDialogTriggers`（既定 `FOCUS_ORDER_MAX_DIALOG_TRIGGERS`）件。見つかった総数は `dialogTriggersFound` に。
2. 候補ごとに（時間の上限を確かめてから）:
   1. `gotoAndSettle(page, targetUrl)` で読み直す（前の候補の状態を持ち越さない）。
   2. その時点で見えているダイアログの selector を控える（`FOCUS_ORDER_DIALOG_SELECTOR` に当たり見えているもの）。
   3. `page.locator(trigger.selector).first().focus({ timeout: ACTION_TIMEOUT_MS })` →
      `page.keyboard.press('Enter')` → `waitForTimeout(FOCUS_ORDER_DIALOG_SETTLE_MS)`。
   4. URL が変わった、または `NAVIGATION_ERROR` → `status: 'navigated'`、次の候補へ。
   5. 新しく見えたダイアログ（控えに無いもの）を探す。無ければ `status: 'not-opened'`、次へ。
      複数あればページの順で最後のもの（入れ子で最も内側になりやすい）。
   6. `modal`: `el.matches('dialog:modal') || el.getAttribute('aria-modal') === 'true'`。
   7. 開いた直後のフォーカス `focusAfterOpen`: 深い activeElement（shadow を辿る）が
      ダイアログの中（`dialog.contains(x)` を、x とその shadow host の連鎖のどれかで満たす）→ `'inside'`、
      開くボタン自身 → `'trigger'`、body / null → `'body'`、それ以外 → `'elsewhere'`。
      `'elsewhere'` のときは `focusAfterOpenSelector` にその selector。
   8. 閉じる: `Escape` を押す → settle → ダイアログがまだ見えていれば、ダイアログの中で
      見えている最初の閉じるボタン（`FOCUS_ORDER_DIALOG_CLOSE_SELECTOR` に当たる、または
      `button, [role="button"]` で、trim した `aria-label || textContent` が
      `FOCUS_ORDER_DIALOG_CLOSE_NAME_PATTERN` に当たる）に `focus()` → `Enter` → settle。
      閉じられた手段を `closedBy: 'escape' | 'close-button'`、閉じられなければ `null`。
      各操作のあとも 4 と同じ遷移の確認をする（遷移したら `status: 'navigated'`。それまでの記録は残す）。
   9. 閉じたら `focusAfterClose`: 深い activeElement が開くボタン（同じ要素、または
      要素が作り直された場合に備えて `getUniqueSelector` が開くボタンの selector と同じ）→ `'trigger'`、
      body / null → `'body'`、それ以外 → `'elsewhere'`（`focusAfterCloseSelector`）。閉じなければ `null`。
   10. 想定外の例外（`focus()` の失敗を含む）は `status: 'error'`、`error` に例外の 1 行目。次の候補へ。
   11. **途中で終わっても、それまでに観察した値は消さない**。例: 開いた直後に `focusAfterOpen` と `modal` を
       記録し、閉じる操作で遷移したら `status: 'navigated'` にするが、`focusAfterOpen` / `modal` はそのまま残す。
3. 時間の上限で候補の途中で止めたら、まだ試していない候補の数を `dialogsNotTried` に足し、
   `aborted = { reason: 'timeout', url }` を立てる。候補の上限（`maxDialogTriggers`）で試さなかった数は
   `dialogTriggersFound - dialogs.length` で分かる（`dialogsNotTried` には含めない）。
4. context はチェック全体の `finally` で閉じる（`runChangeOnInputCheck.ts` と同じ）。

### C. 位置のずれの分析（`src/utils/focus-order.ts`、純粋関数）

```ts
export interface FocusOrderPoint {
  rect: PageRect;
  positioning: 'flow' | 'fixed' | 'sticky';
}

export function analyzeFocusOrder(
  points: readonly FocusOrderPoint[],
  options: { viewport: { width: number; height: number }; direction: 'ltr' | 'rtl' },
): { transitions: FocusOrderTransition[]; detours: FocusOrderDetour[]; skippedTransitions: number };
```

- **比べられる点**: `rect.width > 0 && rect.height > 0 && positioning === 'flow'`。
  隣り合う 2 点（`i` と `i + 1`）のどちらかが比べられなければ `skippedTransitions++` で飛ばす
  （fixed / sticky は Tab でスクロールするとページ座標が変わるため）。
- **行内の向き**: `ltr` では x そのもの、`rtl` では左右を反転して考える
  （`inlineStart = rtl ? -(x + width) : x`、`inlineEnd = inlineStart + width`）。
- 各遷移（from → to）:
  - `dx = to.inlineStart - from.inlineStart`（読む向きに進むと正）、`dy = to.y - from.y`（下へ進むと正）。
  - `distance`: 2 つの矩形の中心間の距離（px）。`distanceRatio = distance / hypot(viewport.width, viewport.height)`（小数 3 桁に丸める）。
  - `sameRow`: 縦の重なり `min(bottom) - max(top)` が `0.5 * min(from.height, to.height)` 以上。
  - `kind`:
    - `sameRow` のとき: `to.inlineStart < from.inlineStart - FOCUS_ORDER_TOLERANCE_PX` なら
      `'backward-inline'`、それ以外 `'forward'`。
    - 同じ行でなく `to.y >= from.y - FOCUS_ORDER_TOLERANCE_PX` なら `'forward'`（下へ。左右は問わない＝改行）。
    - 同じ行でなく上へ戻るとき: `to.inlineStart >= from.inlineEnd - FOCUS_ORDER_TOLERANCE_PX`
      （読む向きに見て完全に後ろの列）なら `'column-wrap'`（段組みの次の列）、
      それ以外で `from.y - to.y > FOCUS_ORDER_MIN_BACKWARD_PX` なら `'backward-block'`、それ以外 `'forward'`。
  - `from` / `to` は `points` の添字。
- **遠回り（detour）**: 連続する 3 点 A, B, C がすべて比べられ、
  `d(A,B) >= FOCUS_ORDER_DETOUR_FAR_RATIO * diag` かつ `d(B,C) >= FOCUS_ORDER_DETOUR_FAR_RATIO * diag` かつ
  `d(A,C) <= FOCUS_ORDER_DETOUR_NEAR_RATIO * diag`（`d` は中心間距離、`diag` はビューポートの対角線）なら、
  B を `{ index: B の添字, distanceIn: d(A,B), distanceOut: d(B,C), distanceAcross: d(A,C) }` として記録
  （Issue の「画面の端から端へ跳ぶ移動」。1 回の遠い移動だけでは記録しない。ヘッダーから本文へ
  大きく下がるのは普通なので）。
- runner はこの関数に `stops` をそのまま渡す。`focus-indicator-check` の利用者は
  `details.allElements.filter(r => r.tabStep !== null && r.frame === null)` を `tabStep` 順に並べ、
  `positioning: 'flow'` を補って渡せる（fixed / sticky を区別できない分、誤検出が増える。README に書く）。

### D. 定数（`src/constants.ts`、末尾に節 `// focus-order-check (WCAG 2.4.3)`）

```ts
/** Tab presses beyond the focusable-element count, for elements the selector misses. */
export const FOCUS_ORDER_TAB_SLACK = 10;
/** Extra Tab presses per iframe, whose contents cannot be counted from the main document. */
export const FOCUS_ORDER_FRAME_SLACK = 20;
export const FOCUS_ORDER_MAX_TAB_PRESSES = 300;
export const FOCUS_ORDER_TIMEOUT_MS = 60_000;
/** Slack for sub-pixel and baseline differences when comparing positions. */
export const FOCUS_ORDER_TOLERANCE_PX = 8;
/** A move up smaller than this (and not on the same row) is not reported. */
export const FOCUS_ORDER_MIN_BACKWARD_PX = 16;
/** Detour: both legs at least this share of the viewport diagonal ... */
export const FOCUS_ORDER_DETOUR_FAR_RATIO = 0.5;
/** ... and the elements before and after it this close. */
export const FOCUS_ORDER_DETOUR_NEAR_RATIO = 0.25;
export const FOCUS_ORDER_MAX_DIALOG_TRIGGERS = 10;
/** Wait after opening / closing a dialog, for transitions and focus scripts. */
export const FOCUS_ORDER_DIALOG_SETTLE_MS = 300;
export const FOCUS_ORDER_DIALOG_SELECTOR =
  'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
export const FOCUS_ORDER_DIALOG_TRIGGER_SELECTOR = [
  '[aria-haspopup="dialog"]',
  '[data-bs-toggle="modal"]',
  '[data-toggle="modal"]',
  '[data-micromodal-trigger]',
  '[data-a11y-dialog-show]',
].join(', ');
export const FOCUS_ORDER_DIALOG_CLOSE_SELECTOR =
  '[data-bs-dismiss="modal"], [data-dismiss="modal"], [data-micromodal-close], [data-a11y-dialog-hide], form[method="dialog"] button';
export const FOCUS_ORDER_DIALOG_CLOSE_NAME_PATTERN =
  /^(close|dismiss|cancel|×|✕|x|閉じる|キャンセル)$/i;
export const DEFAULT_FOCUS_ORDER_RESULT_FILE = 'focus-order-result.json';
```

### E. 型（`src/types.ts`、末尾に節 `// Focus Order Check (WCAG 2.4.3)`）

```ts
export interface FocusOrderStop {
  /** Which Tab press (1-based) moved focus here. */
  step: number;
  /** Relative to the document or shadow root that contains the element. */
  selector: string;
  /** Shadow hosts above the element, outermost first; empty outside shadow DOM. */
  shadowHosts: string[];
  tag: string;
  role: string | null;
  name: string;
  html: string;
  htmlTruncated: boolean;
  /** Page coordinates when focused. For `inFrame`, the iframe element's box. */
  rect: PageRect;
  /** 'fixed' / 'sticky' when the element or an ancestor has that position; such stops are not compared. */
  positioning: 'flow' | 'fixed' | 'sticky';
  /** Focus was inside this iframe; positions inside the frame are not examined. */
  inFrame: boolean;
}

export type FocusOrderTransitionKind =
  | 'forward'
  | 'column-wrap'
  | 'backward-block'
  | 'backward-inline';

export interface FocusOrderTransition {
  /** Indexes into `stops`. */
  from: number;
  to: number;
  kind: FocusOrderTransitionKind;
  /** Along the reading direction (positive = forward), px. */
  dx: number;
  /** Downward positive, px. */
  dy: number;
  /** Between rectangle centers, px. */
  distance: number;
  /** `distance` / viewport diagonal. */
  distanceRatio: number;
}

export interface FocusOrderDetour {
  /** Index into `stops` of the far-away element. */
  index: number;
  distanceIn: number;
  distanceOut: number;
  distanceAcross: number;
}

export interface FocusOrderDialogProbe {
  trigger: {
    selector: string;
    tag: string;
    role: string | null;
    name: string;
    html: string;
    htmlTruncated: boolean;
  };
  /** Final state. Values observed before a navigation / error are kept in the fields below. */
  status: 'opened' | 'not-opened' | 'navigated' | 'error';
  dialogSelector: string | null;
  modal: boolean | null;
  focusAfterOpen: 'inside' | 'trigger' | 'body' | 'elsewhere' | null;
  focusAfterOpenSelector: string | null;
  closedBy: 'escape' | 'close-button' | null;
  focusAfterClose: 'trigger' | 'body' | 'elsewhere' | null;
  focusAfterCloseSelector: string | null;
  error: string | null;
}

export interface FocusOrderCheckDetails {
  viewport: { width: number; height: number };
  direction: 'ltr' | 'rtl';
  stops: FocusOrderStop[];
  /** Pairs of neighboring stops that could be compared. */
  transitions: FocusOrderTransition[];
  /** Pairs left out because a stop is fixed / sticky / has no size. */
  skippedTransitions: number;
  detours: FocusOrderDetour[];
  tabWalk: {
    presses: number;
    ended: 'cycle' | 'tab-limit' | 'timeout' | 'navigation';
    capped: boolean;
    /** Focusable elements counted in the main document and open shadow roots before the walk. */
    focusableCount: number;
    /** iframe / frame elements in the main document. */
    frameCount: number;
  };
  /** Triggers found before the `maxDialogTriggers` cap. */
  dialogTriggersFound: number;
  dialogs: FocusOrderDialogProbe[];
  /** Triggers within the cap that were not tried because the time budget ran out. */
  dialogsNotTried: number;
  aborted: { reason: 'timeout' | 'navigation'; url: string } | null;
}

export type FocusOrderCheckResult = AuditCheckResult<FocusOrderCheckDetails>;
```

`CheckSource` に `'focus-order-check'`。分析関数の `FocusOrderPoint` は `src/utils/focus-order.ts` で定義し、
`src/index.ts` から型も export する。

### F. ルール（`src/utils/rule-registry.ts`、`// --- focus-order-check ---`）

| key | id | classification | scope | impact |
|-----|----|----|----|----|
| `focus-order-visual` | `a11y-skills/focus-order-visual` | `incomplete` | node | `moderate` |
| `focus-order-dialog` | `a11y-skills/focus-order-dialog` | `incomplete` | node | `serious` |

どちらも `sc: ['2.4.3']`、`tags: ['a11y-skills', 'wcag2a', 'wcag243']`、
`helpUrl: \`${UNDERSTANDING}/focus-order.html\``。

- `focus-order-visual`: description `'Ensure the Tab order follows the visual reading order'`、
  help `'Check that focus moving against the visual order still preserves meaning and operability'`。
  コメント: 見た目の順から外れても意味と操作が保たれていれば 2.4.3 を満たす。その判断は人がする。
- `focus-order-dialog`: description `'Ensure focus moves into a modal dialog when it opens and returns to its trigger when it closes'`、
  help `'Move focus into the modal dialog on open, and back to the control that opened it on close'`。
  コメント: フォーカスが外に残る・戻らないのは観察できるが、別の場所へ戻すのが妥当な場合
  （開くボタンが消えた、次の手順へ進む）もあるので人が確かめる。

### G. normalizer（`normalizeFocusOrderCheck`、`src/utils/axe-format.ts`、`normalizeFocusCheck` の近くでなく末尾に）

`checkedNodes = stops.length + dialogs.length`。要素の node は `toNode`（`target: [selector]`。
`shadowHosts` があれば `target` は `[...shadowHosts, selector]` ではなく、axe の書き方に合わせず
**`[selector]` のまま**にし、summary に `inside shadow host ${shadowHosts.join(' > ')}` を足す）。

- **`focus-order-visual`**: `applicable = transitions.length > 0`。node:
  - `kind` が `backward-block` / `backward-inline` の遷移 1 件ごとに、`to` の要素で
    `` `Tab moved from ${describe(from)} (step ${from.step}) to ${describe(to)} (step ${to.step}), which is ${how}. Verify that this order preserves meaning and operability.` ``、
    `how` は block: `` `${Math.round(-dy)}px above it` ``、inline: `` `${Math.round(-dx)}px before it on the same row` ``。
  - 遠回り 1 件ごとに、B の要素で
    `` `Tab jumps ${Math.round(distanceIn)}px to ${describe(B)} (step ${B.step}) and ${Math.round(distanceOut)}px back to an element ${Math.round(distanceAcross)}px from where it started. Verify that this element belongs at this point in the order.` ``
  - **一巡を最後まで見られなかったとき**（`tabWalk.ended !== 'cycle'`）は pageNode
    `` `The Tab walk ended without returning to the first element (${tabWalk.ended}) after ${stops.length} elements; the rest of the order was not compared.` ``
    を足し、`applicable` を真にする（先頭の数件が順方向でも、記録が 0 件でも passes / inapplicable にしない）。
    **例外は「対象が無いと確かめられた」ときだけ**: `ended === 'tab-limit' && stops.length === 0 && tabWalk.focusableCount === 0 && tabWalk.frameCount === 0`
    なら pageNode を足さない（inapplicable のまま）。
  - `describe(stop)` は `` `<${tag.toLowerCase()}> "${name}"` ``。
- **`focus-order-dialog`**: `applicable = dialogTriggersFound > 0`（`maxDialogTriggers: 0` で 1 件も試さなかった
  場合も、候補があれば下の「上限で試さなかった」pageNode で incomplete になる）。
  未計測は人の確認に回す（`runChangeOnInputCheck` が `untested` を incomplete にするのと同じ考え方）。
  probe ごとに、当てはまるものを**すべて**開くボタンの node にする（1 つの probe から複数出てよい）:
  - **開いた直後にフォーカスが外**: `modal === true && focusAfterOpen !== null && focusAfterOpen !== 'inside'`
    （`status` が最終的に `navigated` / `error` でも、観察済みなら出す）:
    `` `Opening the modal dialog ${dialogSelector} with Enter left focus ${where(focusAfterOpen, focusAfterOpenSelector)}. Verify that focus moves into the dialog.` ``
  - **閉じたあと戻らない**: `modal === true && closedBy !== null && focusAfterClose !== null && focusAfterClose !== 'trigger'`:
    `` `After closing the modal dialog (${closedBy}), focus went ${where(focusAfterClose, focusAfterCloseSelector)} instead of back to this control. Verify where focus should return.` ``
  - **未計測**（`untested(reason)` = `` `Could not test the dialog opened by this control (${reason}). Verify manually that focus moves into the dialog and returns on close.` ``）:
    - `status === 'not-opened'` → reason `Enter did not open a dialog`
    - `status === 'error'` → reason `` `error: ${error}` ``
    - `status === 'navigated'` → reason `the page navigated`
    - `status === 'opened' && modal === true && closedBy === null` → reason `the dialog could not be closed with Escape or a close button, so focus return was not tested`
  - `dialogsNotTried > 0` → pageNode
    `` `${dialogsNotTried} dialog trigger(s) were not tried because the time budget ran out.` ``
  - `dialogTriggersFound > dialogs.length + dialogsNotTried`（候補の上限で試さなかった）→ pageNode
    `` `Only the first ${dialogs.length + dialogsNotTried} of ${dialogTriggersFound} dialog triggers were tried (maxDialogTriggers).` ``
  - `where`: `'trigger'` → `on the trigger`、`'body'` → `on the document body`、`'elsewhere'` → `` `on ${selector}` ``。
  - 非モーダル（`modal === false`）で開いて閉じたものは node にしない（非モーダルは Tab の順で
    開くボタンの隣に置けば足りるため）。理由を normalizer のコメントに書く。

### H. runner `runFocusOrderCheck`

```ts
export interface RunFocusOrderCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Target URL. Falls back to the `TEST_PAGE` env var; required. */
  targetUrl?: string;
  /** Options forwarded to `browser.newContext()`. Ignored when `createContext` is used. */
  contextOptions?: BrowserContextOptions;
  /** Wait after each Tab press (default: DEFAULT_NAVIGATION_SETTLE_MS). */
  settleMs?: number;
  /** Wall-clock budget for the whole check (default: FOCUS_ORDER_TIMEOUT_MS). */
  timeBudgetMs?: number;
  /** Cap on Tab presses (default: FOCUS_ORDER_MAX_TAB_PRESSES). */
  maxTabPresses?: number;
  /**
   * Dialog triggers to open and close (default: FOCUS_ORDER_MAX_DIALOG_TRIGGERS).
   * 0 skips the dialog part. Opening presses Enter on the trigger after a reload.
   */
  maxDialogTriggers?: number;
}
```

- 先頭で `assertWalkLimits({ timeBudgetMs, maxTabPresses })`（`test-harness.ts`）。
  `maxDialogTriggers` は 0 以上の整数でなければ `Error`。
- `url` は Tab の一巡を始めたときの `page.url()`。スクリーンショットは撮らない。
- `buildAuditResult({ source: 'focus-order-check', url, details, buckets: normalizeFocusOrderCheck(details) })` →
  `out.header('Focus Order Results', 'WCAG 2.4.3', url)` → `out.log` で件数（stops / 逆向き / 遠回り /
  ダイアログ）→ `out.save(result)` → `out.outputPaths()`（`runChangeOnInputCheck.ts` と同じ流れ）。
- ファイル先頭コメントに Limitations（Maintenance notes の既知の制限）を列挙。

### I. schema

`FOCUS_ORDER_CHECK_RESULT_SCHEMA` を `buildEnvelopeSchema` で作る。details の `required` は型の全フィールド、
`positioning` / `kind` / `status` / `focusAfterOpen` / `closedBy` / `focusAfterClose` / `tabWalk.ended` /
`aborted.reason` / `direction` は `enum`（null 可のものは `null` を enum に含める）、`string | null` は
`['string', 'null']`、`modal` は `['boolean', 'null']`、`aborted` は既存の
`KEYBOARD_REACHABILITY_CHECK_RESULT_SCHEMA`（:827〜）の `aborted` の書き方に合わせる。
`RESULT_SCHEMAS` に `'focus-order-check'` で登録。

## Steps

### Step 0: Drift check

冒頭の drift check を実行。別の新チェックが先にマージ済みなら、Current state の行番号は
ずれている前提で、各ファイルの「末尾の登録」の位置を探し直す。

### Step 1: 分析関数（テスト先行）

1. `test/focus-order-analysis.spec.ts` を先に書く（`test/target-spacing.spec.ts` の形。
   `import { analyzeFocusOrder } from '../dist/index.js'`）。ビューポートは `{ width: 1000, height: 1000 }`
   （対角線 ≈ 1414px）。1 テスト 1 振る舞い、入力の矩形はテスト内に直接書く:
   - 同じ行で右へ進む 2 点 → `kind === 'forward'`、`dx > 0`
   - 同じ行で左へ戻る 2 点（x 300 → x 100、どちらも y 0・高さ 20）→ `'backward-inline'`、`dx === -200`
   - 下の行の左端へ進む（改行）→ `'forward'`
   - 左の列の下（x 0, y 800）から右の列の上（x 500, y 0）→ `'column-wrap'`
   - 同じ列で上へ戻る（y 500 → y 100、x 同じ）→ `'backward-block'`、`dy === -400`
   - 上へ 10px だけ戻る（行が重ならない小さな要素）→ `'forward'`（`FOCUS_ORDER_MIN_BACKWARD_PX` 未満）
   - `rtl` で同じ行を左へ進む → `'forward'`、右へ戻る → `'backward-inline'`
   - `positioning: 'fixed'` を含む 2 点 → `transitions` が空、`skippedTransitions === 1`
   - 幅 0 の点を含む → 同上
   - A (0,0) → B (900,900) → C (10,10)（各 20×20）→ `detours` に `{ index: 1, ... }`。`distanceIn` は 1272 前後
   - A → 遠い B → 遠い C（C が A から遠い）→ `detours` が空
   - `distanceRatio` が小数 3 桁に丸められている
2. build して実行し、**`analyzeFocusOrder` が export されていない**ことで失敗するのを確かめる。
3. `src/utils/focus-order.ts` を設計 C で実装、`src/index.ts` に export。定数（設計 D のうち分析が使うもの）と、
   `FocusOrderTransition` / `FocusOrderDetour` / `FocusOrderTransitionKind` 型（設計 E）をこの時点で足す。

**Verify**: build → `npm test --workspace @a11y-skills/audit -- test/focus-order-analysis.spec.ts` → all pass。

### Step 2: 型・残りの定数・ルール・normalizer・schema

設計 D・E・F・G・I。`src/index.ts` の axe-format export に `normalizeFocusOrderCheck`。

**Verify**: `npm run typecheck` → exit 0、build → exit 0。

### Step 3: フィクスチャとブラウザのテスト（テスト先行）

`test/fixtures/pages/focus-order/` に作る。各ファイル冒頭の HTML コメントに意図と期待結果。
レイアウトは**固定の px 幅**（`body { margin: 0; width: 1000px }` など）で書き、フォントの差で
行が折り返さないよう、リンクの文字は短くする。

- `in-order.html`: 横並びのナビ 3 リンク（flex, row）、その下に縦に 2 リンク、最後にフッターの 1 リンク。
  期待: `stops.length === 6`、`backward-*` が 0、`detours` が空、`focus-order-visual` が passes、
  `focus-order-dialog` が inapplicable、`tabWalk.ended === 'cycle'`。
- `backward-block.html`: `display: flex; flex-direction: column` の中で、DOM の 1 つ目のリンクに
  `order: 2`（見た目は下）、2 つ目に `order: 1`。期待: 遷移 1 件が `'backward-block'`、`focus-order-visual` が incomplete。
- `backward-inline.html`: `flex-direction: row-reverse` の 3 ボタン。期待: `'backward-inline'` が 2 件。
- `columns.html`: 2 列の grid、左列 3 リンク・右列 3 リンク（DOM は左列→右列）。期待: `'column-wrap'` 1 件、passes。
- `rtl.html`: `<html dir="rtl">`、横並び 3 リンク（DOM の順に右から左へ並ぶ）。期待: `direction === 'rtl'`、passes。
- `detour.html`: 左上に A と C（近い）、B は `position: absolute; left: 900px; top: 900px`。DOM は A, B, C。
  `body` の高さを 1200px 以上にする。期待: `detours` に B（`index === 1`）、`focus-order-visual` が incomplete、
  node の summary に `Tab jumps` を含む。
- `fixed.html`: 2000px の高さのページ、`position: sticky; top: 0` のヘッダーにリンク 1、本文にリンク 3、
  最後に `position: fixed; right: 0; bottom: 0` のボタン。期待: `skippedTransitions >= 2`、passes。
- `dialog-good.html`: `<button aria-haspopup="dialog">` が `<dialog>` を `showModal()` し、中の閉じるボタンへ
  フォーカス。`close` イベントで開くボタンへ `focus()`。期待: `dialogs[0]` が `opened`・`modal === true`・
  `focusAfterOpen === 'inside'`・`closedBy === 'escape'`・`focusAfterClose === 'trigger'`、`focus-order-dialog` が passes。
- `dialog-focus-outside.html`: `<button aria-controls="d">` が `<div id="d" role="dialog" aria-modal="true" hidden>`
  の `hidden` を外すだけ（フォーカスを動かさない）。`keydown` の Escape で `hidden` に戻す。
  期待: `focusAfterOpen === 'trigger'`、`focus-order-dialog` が incomplete で node 1 件（開くボタン）。
- `dialog-no-return.html`: `[data-bs-toggle="modal"]` のボタンが `role="dialog" aria-modal="true"` の div を表示し、
  中の「閉じる」ボタンへフォーカス。Escape では閉じない。「閉じる」で div を `display: none` にするだけ。
  期待: `closedBy === 'close-button'`、`focusAfterClose === 'body'`、incomplete で node 1 件、summary に `instead of back to this control`。
- `dialog-navigates.html`: `<a href="none.html" aria-haspopup="dialog">`。期待: `status === 'navigated'`、例外なし、
  `focus-order-dialog` が incomplete で node 1 件（summary に `the page navigated`）、`result.url` が元のフィクスチャの URL。
- `dialog-open-navigates.html`: `aria-haspopup="dialog"` のボタンが `role="dialog" aria-modal="true"` の div を表示する
  （フォーカスは動かさない）。div 内の Escape の keydown（document に付ける）で `location.assign('none.html')`。
  期待: `status === 'navigated'`、`focusAfterOpen === 'trigger'` が残っている、`focus-order-dialog` の node が 2 件
  （開いた直後にフォーカスが外・未計測）。
- `dialog-mixed.html`: `dialog-good.html` と同じ正常なモーダル 1 つと、`aria-haspopup="dialog"` だが何もしないボタン 1 つ。
  期待: `dialogs` が 2 件（`opened` と `not-opened`）、`focus-order-dialog` が incomplete で node 1 件（何もしないボタン、
  summary に `Enter did not open a dialog`）。
- `shadow.html`: 開いた shadow root を持つ要素 1 つの中に、縦に並んだボタン 25 個（`FOCUS_ORDER_TAB_SLACK` を超える数）。
  期待: `stops.length === 25`、`tabWalk.ended === 'cycle'`（shadow root の中も上限の計算に入っている）、`focus-order-visual` が passes。
- `none.html`: 段落だけ（フォーカスできる要素なし）。期待: `stops` が空、2 ルールとも inapplicable、
  有限時間で終わる。

`test/focus-order.spec.ts` を先に書き（`helpers/fixtures.js` の `test` / `runFixtureCheck` を使う。
`test/keyboard-reachability.spec.ts` が見本）、上の期待を 1 テスト 1 振る舞いで確かめる。加えて:

- `maxDialogTriggers: 0` で `dialog-good.html` → `dialogs` が空、`dialogTriggersFound === 1`、`focus-order-dialog` が
  incomplete で pageNode 1 件（summary に `maxDialogTriggers`）
- `maxTabPresses: 2` で `in-order.html` → `tabWalk.ended === 'tab-limit'`、`tabWalk.capped === true`、
  `stops.length === 2`
- `first-focus-navigates.html`（新規フィクスチャ: 最初のリンクの `focus` で `location.assign('none.html')`、ほかにリンク 2 つ）→
  `stops` が空、`tabWalk.ended === 'navigation'`、`focus-order-visual` が inapplicable ではなく incomplete、例外なし
- `timeBudgetMs: 1` で `in-order.html` → 記録前に時間切れ（`stops` が空、`tabWalk.ended === 'timeout'`）、`focus-order-visual` が incomplete
- `maxTabPresses: 2` で `backward-tail.html`（新規フィクスチャ: 先頭 3 リンクは順方向、4 つ目が `order` で上に表示）→
  最初の 2 件だけでは逆向きが見えないが、`focus-order-visual` が passes ではなく incomplete（summary に
  `ended without returning to the first element`）
- 全ケースでエンベロープが `RESULT_SCHEMAS['focus-order-check']` に valid

失敗理由が「runner が無い / 登録が無い」であることを確かめてから Step 4 へ（Step 4 で
`buildRunnerRegistry` に登録するまでは `runFixtureCheck` が見つけられない）。

### Step 4: runner・CLI・test-entry・exports

- `src/playwright/runFocusOrderCheck.ts` を設計 A・B・H で実装。
- `src/playwright/index.ts` に runner と Options 型の export。
- `src/cli.ts` の `CHECK_REGISTRY` 末尾に `kind: 'browser'` の項。
- `src/test-entries/focus-order-check.ts`、`package.json` の `exports` / `description`。
- `test/helpers/fixtures.ts` の `buildRunnerRegistry` に `kind: 'browser-navigating'` で登録。

**Verify**: build → Step 3 の spec が green。`node packages/a11y-audit/dist/cli.js --list-checks` の末尾が `focus-order-check`。

### Step 5: 既存テストの更新

- `test/fixture-gallery.spec.ts`: MANIFEST に `backward-block.html`（`'a11y-skills/focus-order-visual': 'incomplete'`）、
  `in-order.html`（`'a11y-skills/focus-order-visual': 'passes'`）、`dialog-focus-outside.html`
  （`'a11y-skills/focus-order-dialog': 'incomplete'`）、`dialog-good.html`（`'a11y-skills/focus-order-dialog': 'passes'`）。
  冒頭コメントを 17 checks / 30 rules に（他の新チェックが先に入っていれば数え直す）。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に 2 ルール分。
- `test/schema-validation.spec.ts`: 手組み details（stops 3、各 `kind` の遷移、detour 1、
  dialog probe の `opened` / `not-opened` / `navigated`、`aborted` あり・なし）が valid。

**Verify**: `npm test` → 全 green。

### Step 6: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/claude-fo-all > /tmp/claude-fo-all.log 2>&1; echo "exit=$?"
grep -E "focus-order-check|Errors:" /tmp/claude-fo-all.log
# 期待: [focus-order-check] DONE ...、Errors: 0、exit=1（axe 由来）
```

満たせなければ STOP。

### Step 7: ドキュメント

日本語を先に書き、英語を同期する。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表の末尾に 1 行:
  `| \`focus-order-check\` | 2.4.3 | Tab の順と見た目の並びのずれ（上へ戻る・行内で逆向き・遠回り）、モーダルを開いたときと閉じたときのフォーカス（候補。要確認） |`
  / `| ... | 2.4.3 | Tab order vs. visual order (moving back up, backwards on a row, detours) and focus on opening / closing modal dialogs (candidates; needs review) |`
- `coverage-matrix.ja.md` / `.md` の 2.4.3 行（:44）を
  `インタラクティブ+自動の候補 | \`focus-order-check\` **[CLI]** + フォーカス順ログ | 視覚順と不一致で意味・操作が損なわれればFail`
  （EN: `Interactive + automated candidates | \`focus-order-check\` **[CLI]** + focus order log | Fail if the order deviates from visual order and meaning or operability is lost`）に。
  「基準 × チェック名 × 出力ファイル」表の 2.2.1 行の後に `| 2.4.3 | \`focus-order-check\` | \`focus-order-result.json\` |`。
- `interactive-checks.ja.md` / `.md`: `keyboard-reachability-check` の節の書式で
  「`focus-order-check` CLI チェック」節（自動で見るもの / ダイアログを開くために Enter・Escape を押す副作用 /
  見た目の順から外れても意味が保たれていれば満たすので人が確かめる）。2.4.3 行（:35）の根拠欄に
  `focus-order-check` を足す。
- `packages/a11y-audit/TODO-COVERAGE.md`（JA のみ）: 3.3.8 の節の後に「### 2.4.3 Focus Order - **部分実装** ✅」
  （3.3.8 の節の書式で、実装・見ているもの・制限）、「実装優先度（案）」の表に 1 行。
- `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表に
  `runFocusOrderCheck | 2.4.3 フォーカス順序（Tab の順と見た目の並びのずれ・モーダルのフォーカス。候補として報告）`、
  「`browser` を受けます」の文に `runFocusOrderCheck` を追加、`timeBudgetMs` / `maxTabPresses` の段落にも追加、
  チェック名一覧・test entry の列挙に追記、表の下に段落（何を比べるか、fixed / sticky は比べない、
  iframe は箱で代用、ダイアログを開くために読み直して Enter・Escape を押す、`maxDialogTriggers: 0` で止められる、
  `analyzeFocusOrder` を `focus-indicator-check` の `allElements` に当てる方法）。
- `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` に `### Added` を作り（`### Fixed` の前）、新チェック・2 ルール・
  `analyzeFocusOrder`・既知の制限。**`package.json` の version は変えない**。

**Verify**: `npm run validate:skills && npm run lint && npm run format:check` → exit 0。

### Step 8: 全体検証とコミット

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
を通し、Git workflow のとおりコミット。`plans/README.md` のステータス行を更新。

## Test plan

- **`test/focus-order-analysis.spec.ts`**（ブラウザ不要）: 遷移の分類 4 種・閾値・rtl・比べない点・遠回り・丸め。
- **`test/focus-order.spec.ts`**: 16 フィクスチャで Tab の一巡（順・終わり方・上限・shadow root）、
  位置のずれの検出、ダイアログの開閉とフォーカス、未計測（遷移・開かない・上限）が incomplete に
  なること、遷移への頑健さ、schema を検証。
- **fixture-gallery / rule-classification / schema-validation**: 既存の枠組みに登録。
- **CI**: `--checks all` スモークが新チェックを自動で通す（Step 6）。

## Done criteria

ALL must hold:

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` exit 0
- [ ] `node packages/a11y-audit/dist/cli.js --list-checks` の末尾が `focus-order-check`
- [ ] Step 6 のスモークで `[focus-order-check] DONE`、`Errors: 0`、exit 1
- [ ] `git diff --stat main -- packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts packages/a11y-audit/src/playwright/runKeyboardReachabilityCheck.ts packages/a11y-audit/src/playwright/runChangeOnInputCheck.ts` が空（既存 runner は未変更）
- [ ] `git diff main -- packages/a11y-audit/src/types.ts` に削除行（`-` で始まる行、ヘッダーを除く）が無い
- [ ] 日英ドキュメントがペアで更新されている（SKILL / coverage-matrix / interactive-checks / README）
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更
- [ ] `plans/README.md` のステータス行を更新

## STOP conditions

- 既存チェックの挙動・型・schema・rule を変えなければならなくなった
- headless Chromium で、最後の要素の次の Tab が 1 件目の要素へ戻らず、`body` のまま上限まで進む
  （設計 A の「一巡したら終える」が成り立たない。上限で終わること自体は許容するが、
  `in-order.html` が `tabWalk.ended === 'cycle'` にならないなら報告する）
- `dialog-good.html` で `<dialog>` の `showModal()` 後に Escape で閉じない、または `close` イベントが来ない
  （ブラウザの挙動の前提が崩れる）
- フィクスチャの判定がフォントや DPR の差で CI と手元で変わる（px 固定のレイアウトにしても揺れる）
- Step 6 で `--checks all` が ERROR・ハング・exit 2 になる
- いずれかのフィクスチャでチェックがハングする、または `none.html` が 10 秒を超える
- schema 検証・lint・format・既存テストのいずれかが green にできない

## Maintenance notes

- **既知の制限**（runner 先頭コメント・README・CHANGELOG に記載）:
  - 見た目の順は「上から下、行の中は読む向き、上へ戻るなら右（rtl では左）の列」という単純な規則で推定する。
    カード型の格子、横スクロール、`writing-mode` の縦書きは誤りうる。
  - fixed / sticky の要素（とその中の要素）は比べない。
  - iframe にフォーカスがある間は iframe 要素の箱を位置とし、中の順は見ない。shadow root は開いているものだけ。
  - 見えない要素（幅・高さ 0。スキップリンクの非表示状態など）は比べない。
  - ダイアログは決まった属性（`aria-haspopup="dialog"`・`aria-controls` の先が dialog・`commandfor`・
    よく使われるライブラリの `data-*`）を持つ開くボタンからしか開かない。属性の無いボタンで開くダイアログは見ない。
  - 開くために Enter を押し、閉じるために Escape と閉じるボタンを押す。開くボタンが送信や遷移を兼ねると
    リクエストが飛ぶ。`maxDialogTriggers: 0` で止められる。
  - モーダルの中で Tab が外へ漏れるか（背景へ出る）は見ない（2.1.2 の `keyboard-trap-check` と重なる。後回し）。
  - 戻ってこないことは観察できても、別の場所へ戻すのが妥当な場合（開くボタンが消える、次の手順へ進む）があるので incomplete。
  - ページのスクリプトが戻らない（無限ループ）場合は打ち切れない（`keyboard-reachability-check` と同じ）。
- **閾値の調整**: `FOCUS_ORDER_TOLERANCE_PX`・`FOCUS_ORDER_MIN_BACKWARD_PX`・`FOCUS_ORDER_DETOUR_*` は
  実際のサイトで誤検出が多ければ変える。変えるときは `test/focus-order-analysis.spec.ts` の境界のテストも直す。
- **後回しにしたもの**: Tab の順と見た目の順の全体の一致度（順位相関など）の 1 つの数値、モーダルの中の Tab の巡回、
  属性の無いダイアログの開くボタンの推定。
- **1 つのチェックにした理由**: Issue は「位置のずれ」と「モーダルのフォーカス」を同じ 2.4.3 の根拠として
  挙げている。将来ダイアログ部分が重くなったら、`maxDialogTriggers` で分けて呼べる。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit` を minor、
  スキル文書が変わるのでプラグインも minor に上げ、4 フィールドを揃える。
- レビュアーは特に、(1) context が成功・失敗どちらの経路でも閉じられるか、(2) 遷移したときに例外が外へ漏れず
  それまでの記録が残るか、(3) `analyzeFocusOrder` の分類がフィクスチャ以外の形（rtl・段組み）でも筋が通るか、
  (4) ダイアログの node が非モーダルで出ていないか、を見ること。
