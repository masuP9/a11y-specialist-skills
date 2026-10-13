# Plan 012: ポインタのキャンセル (WCAG 2.5.2) の候補を拾う `pointer-cancellation-check`

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/62

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。
>
> **Drift check (run first)**:
> `git diff --stat 4fff965..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json packages/a11y-audit/README.md packages/a11y-audit/README.ja.md packages/a11y-audit/CHANGELOG.md packages/a11y-audit/TODO-COVERAGE.md skills/auditing-wcag`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比べてから進む。
> 構造的な不一致（`CHECK_REGISTRY` の形、`RULES` の形、`bucketize` / `toNode` /
> `pageNode` のシグネチャ、`buildEnvelopeSchema` のシグネチャ、
> `cdpEventListeners.ts` の `EventListenerInspector` の形、`InputContextChange` の形の変化）は STOP。
> 行番号のずれだけなら、抜粋の文字列で場所を探して進めてよい。
> **並行作業の注意**: Issue #66（非テキストのコントラスト、plans/013 系）が同時に
> 進んでいて、チェック一覧・README・CHANGELOG・`cli.ts` の `CHECK_REGISTRY`・
> fixture-gallery の件数コメントなど「新チェックを足すときに触る場所」が衝突しうる。
> 衝突はマージ時に解消する前提なので、本プランでは気にせず main 時点の内容に足す。

## Status

- **Priority**: P2
- **Effort**: M（2〜3 日相当。runner とフィクスチャが大半）
- **Risk**: MEDIUM（ページにイベントを送るチェック。CI の `--checks all` スモークが
  新チェックを必ず通るので、`cli-smoke.html` で ERROR・ハングを起こすと CI が落ちる。
  CDP は Chromium 専用）
- **Depends on**: なし（`cdpEventListeners.ts` の `forSubtree` / `collectNodes` は #95 で main に入っている）
- **Category**: direction（新しいチェック）
- **Planned at**: commit `4fff965`, 2026-10-13
- **Consumer**: 下流の WCAG テスト管理ツール（関数 API で呼び、`details` を取り込む）。
  評価できていない達成基準の洗い出しで 2.5.2 が挙がった。

## Why this matters

2.5.2（ポインタのキャンセル: 押し下げただけで機能が実行されないこと。実行されるなら、
離したときに実行する・途中でやめられる・取り消せる、のどれかを満たすこと）は、今は
すべて手動（`coverage-matrix.ja.md:52` が `| 2.5.2 | インタラクティブ | 操作ログ | 誤作動/キャンセル不可でFail |`）。
押し下げで動く部品は見た目では分からず、確認から漏れやすい。

このチェックは、操作できる要素ごとに **押し下げのイベント（`pointerdown` と `mousedown`）だけを
送り（離さない）**、それだけでページの移動・新しいウィンドウ・ダイアログ・フォーカス移動・
DOM の変化が起きたものを候補にする。ピアノの鍵盤やゲームのように押し下げで動くのが必須の
場合（例外）があり、取り消しの手段があるかも自動では分からないので、すべて `incomplete`。
加えて、CDP で「押す listener（`pointerdown` / `mousedown` / `touchstart`）だけを持ち、
離す・クリックの listener を持たない要素」を根拠として添える。

## Current state（`4fff965` で確認済み）

リポジトリは npm workspaces のモノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` でビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース（Prettier と ESLint が CI で強制）。

### 使い回すもの（調査結果）

**`src/playwright/cdpEventListeners.ts`（288 行）はそのまま使える。変更不要。**
内部モジュール（パッケージの入口からは export しない）。使うメソッド:

```ts
// :45-95 より抜粋
export interface EventListenerInspector {
  forExpression(expression: string, types?: readonly string[]): Promise<EventListenerRecord[]>;
  forSubtree(expression: string, types?: readonly string[]): Promise<SubtreeEventListenerRecord[]>;
  collectNodes(backendNodeIds: readonly number[], key: string, shouldStop?: () => boolean): Promise<number[]>;
  close(): Promise<void>;
  // forEach / terminateExecution もあるが本チェックでは使わない
}
export async function openEventListenerInspector(page: Page): Promise<EventListenerInspector | null>; // :169
```

- `forSubtree('document.documentElement')` は文書全体（open shadow root・同一オリジン iframe を含む）の
  listener を CDP 1 回で返す。各 listener に `type` / `scriptId` / `lineNumber` / `columnNumber` /
  `handlerPreview` / `backendNodeId`。
- `collectNodes(ids, key)` は `window[key]` に要素の配列を作り、各 id の番号を返す（iframe 内・解決不可は -1）。
  **呼び出し側が後で `window[key]` を消す**約束だが、本チェックは自前の BrowserContext を使い捨てるので、
  消し忘れても他のチェックに影響しない（それでも消す）。

**`src/playwright/runPointerGestureCheck.ts`（676 行）からは「考え方と小さな関数」を書き写す。
ファイル自体は変えない**（既存 runner を触らない方針。#95 のプラン 016 と同じ）。

| 使い回すもの | 場所 | 使い方 |
|---|---|---|
| `withTimeout` / `isStepTimeout` / `firstLine` | `:326-342` | そのまま新 runner に書き写す |
| 委譲先（delegation root）の判定 | `:432-434` `distinctTypes`、`:489-497` | listener の種類（`type` の重複なし）が `POINTER_GESTURE_DELEGATION_MIN_TYPES`（20）以上のノードは根拠から外す |
| `scopeSelector` / `shadowHostsOf` / `safeOuterHTML` | `:142-183`（ページ内関数の中） | ページ内関数に書き写す（ページ内では import できないため。`:121-124` のコメントどおり重複は意図的） |
| 合成された木（document と open shadow root）の深さ優先の走査 | `:211-254` `visit` / `walk` | 対象要素を文書順に集めるのに使う |
| 定数 `POINTER_GESTURE_PRESS_TYPES`（`['pointerdown','mousedown','touchstart']`）・`POINTER_GESTURE_DELEGATION_MIN_TYPES`・`POINTER_GESTURE_MAX_LISTENER_NODES`（1000） | `src/constants.ts:872`、`:906`、`:909` | **import して使う**（意味が同じ。名前に GESTURE が付いているのは気にしない） |
| 型 `PointerGestureListenerLocation`（`{ scriptId, lineNumber, columnNumber, handlerPreview }`） | `src/types.ts:857` | listener の場所の型としてそのまま使う |

**時間切れ時の中止の仕組み（`runPointerGestureCheck.ts:575-604` の猶予付きの待ち）は書き写さない。**
pointer-gesture は呼び出し側のページを使うので一時プロパティを確実に消す必要があったが、本チェックは
自前の BrowserContext を閉じるので不要。時間切れなら `run.cancelled = true` にして根拠なしで続ける。

**押し下げを送って変化を見る部分は `src/playwright/runChangeOnInputCheck.ts`（854 行）が見本。**
自前の BrowserContext を作り、移動が起きたら新しい context でやり直し、試した要素を飛ばす。

- `:80-92` Options（`AuditOutputOptions, ContextSourceOptions` を継承、`targetUrl` / `contextOptions` /
  `settleMs` / `timeBudgetMs` / `maxControls`）
- `:95-103` `ACTION_TIMEOUT_MS = 5_000` と `NAVIGATION_ERROR` 正規表現（書き写す）
- `:507-529` 引数の検査、`resolveCreateContext` / `requireTargetUrl` / `createAuditOutput`
- `:560-611` 試行ループの骨組み: `newContext()` → `page.on('framenavigated')`（メインフレームだけ）・
  `context.on('page')`（ポップアップの URL を待って閉じる）・`page.on('dialog')`（`dismiss`）→
  `gotoAndSettle(page, targetUrl)` → `page.setDefaultTimeout(ACTION_TIMEOUT_MS)` → `resetRecords()`
- `:619-639` 予算・上限・試し済みの判定、`:721-733` エラーの 1 行目から移動を判定
- `:802-824` 移動したら break してやり直し、`CHANGE_ON_INPUT_MAX_RESTARTS` で打ち切り
- `:826-853` `buildAuditResult` → `out.save` → `out.header` / `out.summary` / `out.outputPaths`、`finally` で `context?.close()`

**変化の型 `InputContextChange` を再利用する**（`src/types.ts:1297-1301`）:

```ts
export type InputContextChange =
  | { kind: 'navigation'; toUrl: string }
  | { kind: 'new-window'; url: string }
  | { kind: 'focus-moved'; toSelector: string }
  | { kind: 'dialog'; dialogType: string; message: string };
```

schema 側にも `INPUT_CONTEXT_CHANGE_SCHEMA`（`src/schemas/index.ts:1067`、非 export の const）がある。
本チェックはこれに DOM の変化 1 種類を足した union を使う（設計 B / G）。

### 新チェック追加の統合点（直近の前例: `focus-order-check` #96、`browser` 種別）

本チェックは移動したら作り直すので、CLI では **`kind: 'browser'`**（`change-on-input-check` / `focus-order-check` と同じ）。

1. `src/types.ts` — `CheckSource` ユニオン（`:21-39`、末尾 `'focus-order-check'`）に `'pointer-cancellation-check'`。details 型もここ（ファイル末尾に足す）。
2. `src/constants.ts` — 新定数を末尾に。`CHANGE_ON_INPUT_*`（`:798-814`）が書式の見本。
3. `src/utils/rule-registry.ts` — `RULES` の `// --- pointer-gesture-check ---`（`:335`）ブロックの直後に新ブロック。
4. `src/utils/axe-format.ts` — `bucketize(buckets, key, nodes, applicable)`（`:99`）、
   `toNode(el, failureSummary)`（`:134`）、`pageNode(failureSummary)`（`:146`）。
   見本の normalizer は `normalizeChangeOnInputCheck`（`:626`〜。変化の文言、打ち切りの page node、
   `applicable = nodes.length > 0 || details.controlsTested > 0`）と `normalizePointerGestureCheck`（`:909`〜。
   `target = [...shadowHosts, selector]` の置き換え）。新 normalizer は `normalizePointerGestureCheck` の直後に置く。
5. `src/index.ts` — axe-format の export リスト（`:54-61` 付近、アルファベット順）に `normalizePointerCancellationCheck`。
   型の export も同ファイルで行っていればそこに足す（`PointerGesture` の型の export の書き方に合わせる）。
6. `src/playwright/index.ts` — runner と Options 型の export（`runFocusOrderCheck` の後）。`cdpEventListeners` は export しない。
7. `src/schemas/index.ts` — `buildEnvelopeSchema` で schema を作り（見本: `CHANGE_ON_INPUT_CHECK_RESULT_SCHEMA` `:1124`、
   `FOCUS_ORDER_CHECK_RESULT_SCHEMA` `:1583`）、`RESULT_SCHEMAS`（`:1653`）の末尾に登録。
8. `src/cli.ts` — `CHECK_REGISTRY` の末尾（`focus-order-check` `:270-281` の後ろ）:

   ```ts
   {
     name: 'focus-order-check',
     kind: 'browser',
     async run({ browser, outputDir, url }) {
       const { runFocusOrderCheck } =
         await import('./playwright/runFocusOrderCheck.js');
       return (await runFocusOrderCheck({
         browser,
         targetUrl: url,
         outputDir,
       })) as AuditResultEnvelope;
     },
   },
   ```
9. `src/test-entries/pointer-cancellation-check.ts`（新規）— `src/test-entries/change-on-input-check.ts` と同形
   （`test('pointer cancellation check', async ({ browser }) => { await runPointerCancellationCheck({ browser }); })`）。
10. `packages/a11y-audit/package.json` — `exports` に `./test-entries/pointer-cancellation-check`
    （`:116-118` の focus-order-check と同形）、`description`（`:4`）の列挙末尾に `pointer cancellation`。
11. テスト:
    - `test/helpers/fixtures.ts` の `buildRunnerRegistry`（`:135-138` が focus-order-check）に
      `'pointer-cancellation-check': { kind: 'browser-navigating', run: (opts) => runPointerCancellationCheck(opts) }`。
      import も同ファイル冒頭に足す（既存の import の並びに合わせる）。
    - `test/fixture-gallery.spec.ts` の MANIFEST（focus-order の見本 `:433-467`）。冒頭コメント
      `all 18 checks`（`:2`）→ `all 19 checks`、`all 32 custom finding-capable rules`（`:13`）→ `all 33`。
    - `test/rule-classification.spec.ts` の `FINDING_EXPECTATIONS`（`:117` 付近が pointer-gesture）。
    - `test/schema-validation.spec.ts`（`:812` 付近が focus-order の例）。
    - テストは `../dist/...` から import する（`pretest` が build する）。新しい spec の見本は
      `test/change-on-input.spec.ts:1-34`（`runFixtureCheck` を包む `runChange` と schema 検証、テスト名は日本語で「条件・操作・結果」）。
12. ドキュメント（日本語が正、英語を同期）:
    - `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表（ja `:129` が focus-order-check、その後ろ）。
    - `skills/auditing-wcag/references/coverage-matrix.ja.md` / `.md`: `:52` が 2.5.2 行。`:101` の
      `| 2.5.1, 2.5.7 | \`pointer-gesture-check\` | ...` の直後に出力の行。
    - `skills/auditing-wcag/references/interactive-checks.ja.md` / `.md`: 「ポインター」表に 2.5.2 行が
      あるか確かめ（無ければ 2.5.1 行の後に足す）、`### \`pointer-gesture-check\` CLIチェック`（ja `:121`）の節の後ろに新しい節。
    - `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表、runner ごとの段落、チェック名一覧
      （ja `:226-227` の後ろ）、test entry の「他にも」列挙（ja `:480`）。
    - `packages/a11y-audit/TODO-COVERAGE.md`（日本語のみ）: 2.5.1 / 2.5.7 の節（`:137` 付近）の書式に合わせて
      2.5.2 の節、末尾の対応表（`:293-294` の間）に 1 行。
    - `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` の `### Added` の末尾（focus-order-check の項の後）に 1 項目。

### CI

`.github/workflows/ci.yml:108-118` が
`dist/cli.js --url file://.../cli-smoke.html --checks all` を実行し、exit 1 と `Errors: +0` を要求する。
`cli-smoke.html` は `<h1>`・`<img>`・`<input type="text">` だけ（16 行）で、本チェックの対象要素は 0 個のはず
（`input[type=text]` は対象外）。→ ルールは inapplicable で、すぐ終わる（Step 8 で確認）。

## Commands you will need

リポジトリルートで実行する（worktree では `npm --prefix <worktree> run <script>`）。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 新 spec だけ | `npm test --workspace @a11y-skills/audit -- test/pointer-cancellation.spec.ts` | all pass |
| 全テスト | `npm test` | all pass |
| チェック一覧 | `node packages/a11y-audit/dist/cli.js --list-checks` | 末尾が `pointer-cancellation-check` |
| 整形 | `npx prettier --write <path>` | exit 0 |
| 全体検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/playwright/runPointerCancellationCheck.ts`、`src/test-entries/pointer-cancellation-check.ts`、
  `test/pointer-cancellation.spec.ts`、`test/fixtures/pages/pointer-cancellation/*.html`（Step 5 の一覧）
- 編集（追加のみ）: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、`src/utils/axe-format.ts`、
  `src/index.ts`、`src/playwright/index.ts`、`src/schemas/index.ts`、`src/cli.ts`、
  `packages/a11y-audit/package.json`（`exports` と `description` のみ）、`test/helpers/fixtures.ts`、
  `test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、`test/schema-validation.spec.ts`
- ドキュメント: 統合点 12 のファイル

**Out of scope**（触らない）:

- `src/playwright/cdpEventListeners.ts`（変更不要。変えたくなったら STOP）
- 既存チェックの runner・normalizer・schema・rule（`runPointerGestureCheck.ts` / `runChangeOnInputCheck.ts` の
  関数を共通化したくなっても触らず、新 runner に書き写す）
- `INPUT_CONTEXT_CHANGE_SCHEMA` の中身（参照するだけ。export が必要ならしてよいが中身は変えない）
- `touchstart` を合成して送ること、実際のマウス操作（`page.mouse.down()`）で押すこと（設計の判断の根拠を参照）
- iframe の中の要素
- `package.json` の `version`、プラグイン 4 フィールドの version（リリース PR で別途）
- `.github/workflows/`

## Git workflow

- ブランチ: `feat/pointer-cancellation-check`（worktree のブランチ名がすでに決まっていればそれでよい）
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`。例: `git log` の
  `feat(a11y-audit): add pointer-gesture-check for WCAG 2.5.1 / 2.5.7 candidates (#95)`）:
  1. `feat(a11y-audit): add pointer cancellation types, constants and rule`
  2. `feat(a11y-audit): add pointer cancellation normalizer and schema`
  3. `feat(a11y-audit): add pointer cancellation runner (2.5.2)`
  4. `feat(a11y-audit): register pointer-cancellation-check in CLI and exports`
  5. `test(a11y-audit): add pointer cancellation specs and fixtures`
  6. `docs: document pointer-cancellation-check (2.5.2)`
- 公開リポジトリなので、コミットされる文面に下流の利用者のツール名・サービス名を書かない
  （「downstream consumer」と書く）。
- push・PR 作成はオペレーターの指示があるときだけ。

## 設計

### 判断の根拠

- **押し方: ページ内で合成イベントを `dispatchEvent` する**（`PointerEvent('pointerdown')` → `MouseEvent('mousedown')`）。
  - 実際のマウス（`page.mouse.down()`）で押すと、後で離すときに `click` が出てしまう（離す位置をずらしても、
    共通の祖先に `click` が届きうる）。離さないままだと次の要素を押せない。合成イベントなら `click` は出ず、
    フォーカス移動・`<select>` が開く・文字の選択などブラウザ既定の動作も起きないので、**ページの作者のスクリプトが
    押し下げに反応したかだけ**を見られる。
  - ブラウザの順序に合わせ、`pointerdown` の `dispatchEvent` が `false`（`preventDefault` された）なら
    `mousedown` は送らない（ブラウザも互換の mouse イベントを出さない）。送ったイベントは `dispatched` に記録する。
  - 観察の後、後片付けとして同じ要素に `pointercancel` を送る（2.5.2 の「途中でやめる」に当たるイベント）。
    `mouseup` / `pointerup` は送らない（離したときの動作を起こさないため）。
  - 制限: `event.isTrusted` を確かめるハンドラには反応されない。`touchstart` は送らない（`touchstart` の
    listener は根拠としてだけ使う）。
- **押す要素**（すべて合成された木＝document と open shadow root を文書順にたどって集める。iframe の中は見ない）:
  1. CDP で `POINTER_GESTURE_PRESS_TYPES` のどれかの listener が**その要素自身に**付いている要素（委譲先は除く）
  2. インラインの `onpointerdown` / `onmousedown` / `ontouchstart` 属性を持つ要素（CDP が無いブラウザでも拾える）
  3. 操作できる要素（`POINTER_CANCELLATION_TARGET_SELECTOR`）。React などは根の要素に listener をまとめる
     （委譲）ので、1 だけでは押し下げに反応する部品を見落とす。実際に押して確かめる必要がある。
  - 表示されていない要素・無効な要素（`:disabled`、`aria-disabled="true"`）は除く。
  - 並び: 1 か 2 に当たる要素を先に（文書順）、その後に 3 だけの要素（文書順）。上限
    `POINTER_CANCELLATION_MAX_TARGETS` で切るとき、根拠のある要素が残るようにするため。
- **「動作した」とみなす変化**（押してから `settleMs` 待つ間に起きたもの）:
  - メインフレームの移動、新しいウィンドウ、ダイアログ（`alert` など）— `InputContextChange` と同じ記録方法
  - フォーカスの移動（押した要素自身・その子孫へのフォーカスは除く。押した部品が自分にフォーカスを
    移すのはよくある作りで、機能の実行ではないため）
  - DOM の変化: `MutationObserver`（`document` と、走査で見つけた open shadow root それぞれ）で
    `childList` / `characterData` / `attributes`（`subtree: true`）を数える。**`style` 属性の変化は数えない**
    （押したときの見た目の反応やアニメーションでよく変わり、機能の実行とは言えないため）。
- **何もしなくても動くページ**: 試行を始める前に 1 回、`settleMs` の間何もせずに DOM を観察する。
  その間に（`style` 以外の）変化があれば、そのページでは DOM の変化を候補の根拠に使わない
  （`details.domObservation = 'ignored-background-activity'`）。移動・新しいウィンドウ・ダイアログ・
  フォーカス移動は引き続き使う。自動で回るカルーセルや時計があるページで、全部の要素が候補になるのを防ぐ。
- **候補の 2 種類**（どちらも `incomplete`）:
  - `activated-on-press`: 押し下げだけで上の変化が 1 つ以上起きた要素。
  - `press-only-listener`: 変化は見えなかったが、CDP で見て、押す listener がその要素自身にあり、
    離す・クリックの listener（`POINTER_CANCELLATION_RELEASE_TYPES`）がその要素自身に無い要素
    （押し下げで、目に見えない処理——送信・タイマー開始など——をしている可能性がある）。
    `activated-on-press` になった要素は `press-only-listener` にはしない（1 要素 1 候補）。
- **`window` / `document` の押す listener** は要素に帰属できないので、`details.pageListeners` に記録するだけ
  （node にしない。解析ツールなどで非常に多いため）。
- **委譲先**: listener の種類が `POINTER_GESTURE_DELEGATION_MIN_TYPES` 以上のノードは根拠（1・press-only）から外し、
  数だけ `details.delegationRootCount` に記録する。その子孫の操作できる要素は 3 で押されるので、委譲で作られた
  押し下げの動作も「押して確かめる」側で拾える。

### A. 共通モジュール

**変更しない**（`cdpEventListeners.ts` の既存メソッドだけで足りる）。

### B. 型（`src/types.ts` の末尾）

```ts
export type PointerCancellationTargetSource =
  | 'listener'
  | 'inline-handler'
  | 'interactive';

export interface PointerCancellationTarget {
  /**
   * Unique within the element's own scope: the document, or the shadow root it
   * is in. Resolve it after the hosts in `shadowHosts`.
   */
  selector: string;
  /** Open shadow hosts above the element, outermost first; [] outside shadow DOM. Same convention as PointerGestureCandidate.shadowHosts. */
  shadowHosts: string[];
  html: string;
  htmlTruncated: boolean;
  tagName: string;
  role: string | null;
  /** Why the element was pressed, in ['listener', 'inline-handler', 'interactive'] order. */
  sources: PointerCancellationTargetSource[];
  /**
   * Listener types on the element itself, in constant order; null when
   * listeners were not inspected (listenerInspection !== 'cdp') or the element
   * was not resolved through CDP.
   */
  listeners: { press: string[]; release: string[] } | null;
  /** First press listener on the element itself; null when there is none or listeners were not inspected. */
  pressListener: PointerGestureListenerLocation | null;
}

export type PointerCancellationChange =
  | InputContextChange
  | {
      kind: 'dom';
      addedNodes: number;
      removedNodes: number;
      textChanges: number;
      /** Names of changed attributes (style excluded), unique, at most POINTER_CANCELLATION_MAX_ATTRIBUTES. */
      attributes: string[];
    };

export interface PointerCancellationFinding {
  target: PointerCancellationTarget;
  kind: 'activated-on-press' | 'press-only-listener';
  /** Events sent: ['pointerdown', 'mousedown'], or ['pointerdown'] when it was cancelled. */
  dispatched: string[];
  /** Empty for 'press-only-listener'. */
  changes: PointerCancellationChange[];
}

export interface PointerCancellationPageListener extends PointerGestureListenerLocation {
  target: 'window' | 'document';
  type: string;
}

export interface PointerCancellationCheckDetails {
  /** 'failed': CDP was available but inspection threw or timed out. Same meaning as PointerGestureCheckDetails. */
  listenerInspection: 'cdp' | 'unsupported' | 'failed';
  /** 'timeout' or the error's first line (200 chars); null when not failed. */
  inspectionError: string | null;
  /** 'ignored-background-activity' when the page changed on its own before any press. */
  domObservation: 'used' | 'ignored-background-activity';
  /** Targets found on the first load. */
  targetsFound: number;
  /** Targets pressed and observed (with or without a change). */
  targetsTested: number;
  findings: PointerCancellationFinding[];
  /** Targets that could not be pressed (gone, not resolvable after a restart, error). */
  untested: { target: PointerCancellationTarget; reason: string }[];
  pageListeners: PointerCancellationPageListener[];
  delegationRootCount: number;
  restarts: number;
  aborted: {
    reason: 'timeout' | 'target-limit' | 'restart-limit';
    testedCount: number;
    foundCount: number;
  } | null;
}

export type PointerCancellationCheckResult =
  AuditCheckResult<PointerCancellationCheckDetails>;
```

`AuditCheckResult` は既存の総称型（`PointerGestureCheckResult` の定義と同じ書き方にする）。

### C. 定数（`src/constants.ts` の末尾）

```ts
/** WCAG 2.5.2: wait after a press for a change to surface. */
export const POINTER_CANCELLATION_SETTLE_MS = 300;
/** Wall-clock budget for the whole check. */
export const POINTER_CANCELLATION_TIMEOUT_MS = 60_000;
export const POINTER_CANCELLATION_MAX_TARGETS = 100;
export const POINTER_CANCELLATION_MAX_RESTARTS = 10;
/** Listener inspection (window, document, subtree, node collection) per page load. */
export const POINTER_CANCELLATION_INSPECTION_TIMEOUT_MS = 15_000;
/** A listener of one of these types on the element means the press may complete on release. */
export const POINTER_CANCELLATION_RELEASE_TYPES = [
  'pointerup',
  'mouseup',
  'touchend',
  'click',
] as const;
/** Elements that are pressed even without a press listener of their own (delegated handlers). */
export const POINTER_CANCELLATION_TARGET_SELECTOR =
  'a[href], area[href], button, summary, input[type="button"], input[type="submit"], input[type="reset"], input[type="image"], input[type="checkbox"], input[type="radio"], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="treeitem"], [onclick], [onmousedown], [onpointerdown], [ontouchstart]';
export const POINTER_CANCELLATION_MAX_ATTRIBUTES = 10;
export const DEFAULT_POINTER_CANCELLATION_RESULT_FILE =
  'pointer-cancellation-result.json';
```

### D. ルール（`src/utils/rule-registry.ts`、`// --- pointer-gesture-check ---` ブロックの直後）

```ts
// --- pointer-cancellation-check ---
'pointer-cancellation': {
  id: 'a11y-skills/pointer-cancellation',
  sc: ['2.5.2'],
  tags: ['a11y-skills', 'wcag21a', 'wcag252'],
  impact: 'serious',
  scope: 'node',
  description:
    'Ensure functions operated with a single pointer are not completed on the down-event, or can be aborted or undone',
  help: 'Complete the function on the up-event (e.g. click), or let users abort or undo it, unless completing on the down-event is essential',
  helpUrl: `${UNDERSTANDING}/pointer-cancellation.html`,
  // Pressing shows what reacts to the down-event; whether it can be aborted or
  // undone, or reacting on the down-event is essential, needs a human.
  classification: 'incomplete',
},
```

（`pointer-gestures` ブロックの他のフィールドがこれと違う形なら、そちらに合わせる。）

### E. normalizer（`normalizePointerCancellationCheck(details)`、`src/utils/axe-format.ts`）

```ts
export function normalizePointerCancellationCheck(details: PointerCancellationCheckDetails): NormalizedBuckets
```

- 候補ごとに `toNode(finding.target, summary)` を作り、**`node.target = [...finding.target.shadowHosts, finding.target.selector]`**
  に置き換える（`normalizePointerGestureCheck` と同じ）。
- summary（文言は英語）:
  - `activated-on-press`: `Pressing it (${dispatched.join(' + ')}, not released) caused ${変化を ', ' でつないだもの}. `
    変化の文言: `navigation to ${toUrl}` / `a new window (${url})` / `focus moving to ${toSelector}` /
    `a ${dialogType} dialog ("${message}")` / `DOM changes (${addedNodes} added, ${removedNodes} removed, ${textChanges} text, attributes: ${attributes.join(', ') || 'none'})`。
    `normalizeChangeOnInputCheck` の `switch` の書き方に合わせる。
  - `press-only-listener`: `Has ${listeners.press.join(' / ')} listener(s) at script ${scriptId}, line ${lineNumber + 1}:${columnNumber + 1} but no pointerup / mouseup / touchend / click listener on the element itself; pressing it caused no visible change. `
  - 両方の末尾に確認依頼:
    `Verify that the function completes on the up-event, or can be aborted (e.g. by moving the pointer away before release) or undone, unless completing on the down-event is essential.`
- page node（`pageNode`）:
  - `details.aborted` があれば: `Stopped early (${reason}): ${testedCount} of ${foundCount} targets were pressed. Check the rest manually.`
  - `details.domObservation === 'ignored-background-activity'` かつ `targetsTested > 0` なら:
    `The page changed on its own before any press, so DOM changes after a press were not used (navigation, new windows, dialogs and focus moves still were). Check press behaviour manually.`
- `applicable = nodes.length > 0 || details.targetsTested > 0`（`normalizeChangeOnInputCheck` と同じ考え方。
  押した要素があって何も起きなければ `passes`、押す要素が無ければ `inapplicable`）。
- `bucketize(buckets, 'pointer-cancellation', nodes, applicable)`。
- `buckets.checkedNodes` を他の normalizer が設定していればそれに合わせて `details.targetsTested` を入れる
  （設定していなければ何もしない）。

### F. runner（`src/playwright/runPointerCancellationCheck.ts`）

```ts
export interface RunPointerCancellationCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Defaults to the TEST_PAGE environment variable. */
  targetUrl?: string;
  /** Options for the contexts created from `browser` (ignored with `createContext`). */
  contextOptions?: BrowserContextOptions;
  /** Wait after each press for a change to surface (default: POINTER_CANCELLATION_SETTLE_MS). */
  settleMs?: number;
  /** Wall-clock budget for the whole check (default: POINTER_CANCELLATION_TIMEOUT_MS). */
  timeBudgetMs?: number;
  /** Targets to press before stopping (default: POINTER_CANCELLATION_MAX_TARGETS). */
  maxTargets?: number;
  /** Upper bound for the listener inspection per page load (default: POINTER_CANCELLATION_INSPECTION_TIMEOUT_MS). Mainly for tests. */
  inspectionTimeoutMs?: number;
}
export async function runPointerCancellationCheck(options: RunPointerCancellationCheckOptions): Promise<PointerCancellationCheckResult>;
```

ファイル先頭のコメントに目的と Limitations（Maintenance notes の「既知の制限」）を列挙する
（`runChangeOnInputCheck.ts:1-39` の書き方）。

手順:

1. 引数の検査は `runChangeOnInputCheck.ts:507-519` を書き写す（`settleMs` は正の有限数、`maxTargets` は正の整数、
   `assertWalkLimits({ timeBudgetMs })`）。`resolveCreateContext` / `requireTargetUrl` / `createAuditOutput`
   （`defaultFile: DEFAULT_POINTER_CANCELLATION_RESULT_FILE`）。
2. 試行ループ（`runChangeOnInputCheck.ts:560-611` と同じ骨組み。`tried: Set<string>` のキーは
   `JSON.stringify([...shadowHosts, selector])`）。各回で:
   1. `context = await newContext()`、`page`、`framenavigated` / `context.on('page')` / `dialog` の記録を付ける
      （`:579-605` を書き写す。`DIALOG_MESSAGE_MAX` を使う）。
   2. `gotoAndSettle(page, targetUrl)`、`page.setDefaultTimeout(ACTION_TIMEOUT_MS)`、初回は `startUrl = page.url()`、`resetRecords()`。
   3. **初回だけ**: 何もしないでの観察（`backgroundCheck`）。ページ内で `MutationObserver` を張り（下の 2.5 と同じ数え方）、
      `page.waitForTimeout(settleMs)` の後に結果を読む。変化があれば `domObservation = 'ignored-background-activity'`。
   4. listener の取り出し（`inspectListeners`。時間の上限 `inspectionTimeoutMs ?? POINTER_CANCELLATION_INSPECTION_TIMEOUT_MS` を
      `withTimeout` でかけ、時間切れ・失敗なら `run.cancelled = true` にして根拠なしで続ける。`listenerInspection` /
      `inspectionError` は**初回の結果を残す**。`openEventListenerInspector` が null なら `'unsupported'`）:
      - `forExpression('window')` / `forExpression('document')`: 種類が委譲のしきい値以上なら `delegationRootCount++` して飛ばす。
        そうでなければ `POINTER_GESTURE_PRESS_TYPES` の listener を `pageListeners` に（初回だけ）。
      - `forSubtree('document.documentElement')`（型の絞り込みなし。委譲の判定に全種類が要る）→ `backendNodeId` ごとにまとめる。
        種類がしきい値以上なら `delegationRootCount++`（初回だけ数える）して外す。押す listener があるノードだけ残し、
        `{ press, release, pressListener }` を作る（`press` / `release` は定数の順に、そのノードにある型だけ）。
      - `backendNodeId` 昇順で `POINTER_GESTURE_MAX_LISTENER_NODES` 件まで `collectNodes(ids, nodesKey, () => run.cancelled)`。
        -1 は捨てる。`nodesKey = \`__a11yPointerCancel_nodes_${randomUUID()}\``。
      - inspector は `finally` で `withTimeout(inspector.close(), 1_000).catch(() => {})`。
   5. ページ内関数 `collectTargets(args)` を `page.evaluate` で 1 回呼ぶ。`args`:
      `{ nodesKey, targetsKey, listenerNodes: { index, press, release, pressListener }[], selector: POINTER_CANCELLATION_TARGET_SELECTOR, htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH }`。
      - `runPointerGestureCheck.ts:211-254` の `walk` で合成された木を文書順にたどり、各要素について
        `sources` を決める（`window[nodesKey][index]` に入っている要素 → `'listener'`、インライン属性 → `'inline-handler'`、
        `element.matches(selector)` → `'interactive'`）。1 つも無ければ飛ばす。
      - 表示判定は `runChangeOnInputCheck.ts:165-170` の `isVisible`（`checkVisibility({ visibilityProperty: true })` と幅・高さ）、
        無効判定は `:disabled` か `aria-disabled="true"`。
      - 並べ替え: `'listener'` か `'inline-handler'` を含むものが先、各群の中は文書順。
      - `window[targetsKey] = { elements: Element[], roots: (Document | ShadowRoot)[] }` に要素と、走査で見つけた
        open shadow root（と `document`）を保存し、`PointerCancellationTarget` の配列を返す（`listeners` / `pressListener` は
        `'listener'` の要素だけ値を入れ、他は `listeners: listenerInspection === 'cdp' ? { press: [], release: [] } : null`、
        `pressListener: null` にする — この判断は Node 側でしてもよい）。
      - 初回は `targetsFound = targets.length`。
   6. 各 target について（`tried` にあれば飛ばす。予算超過なら `abort('timeout')`、`processed >= maxTargets` なら
      `abort('target-limit')`。`tried.add` は押す前にする）:
      1. `resetRecords()`。
      2. `page.evaluate(startPress, { targetsKey, index })`: 要素が `isConnected` でなければ `{ missing: true }`。
         `MutationObserver` を `roots` すべてに張って `window[targetsKey].observer` に保存、押す前の
         「深い activeElement」（shadow root の中まで `activeElement` をたどる）を保存、要素の中心座標で
         `new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX, clientY, view: window })`
         を `dispatchEvent`。戻り値が true なら同じ設定の `new MouseEvent('mousedown', …)` も送る。`{ dispatched }` を返す。
      3. `page.waitForTimeout(settleMs)`、`await Promise.all(pendingPopups)`。
      4. `page.evaluate(endPress, { targetsKey, index, maxAttributes: POINTER_CANCELLATION_MAX_ATTRIBUTES, selectorScopeHelpers… })`:
         `observer.takeRecords()` と溜めた記録を数え（`addedNodes` / `removedNodes` の合計、`characterData` の数、
         `attributeName` の集合から `style` を除いたもの）、`disconnect()`。深い activeElement が変わっていて、`body` でも
         押した要素自身・その子孫でもなければ `toSelector`（`scopeSelector` で作る。shadow root の中なら
         `shadowHostsOf` の後に `' >>> '` でつなぐ）。最後に要素へ `pointercancel` を送る。数えた結果を返す。
      5. `startPress` / `endPress` が throw したら、1 行目が `NAVIGATION_ERROR` に当たれば移動として扱う。
         それ以外の throw や `missing` は `untested` に `{ target, reason }`（理由は 1 行目 200 文字、`missing` は `'element-gone'`）。
      6. 変化を組み立てる: 移動（`navigations` があるか、移動のエラー）→ `{ kind: 'navigation', toUrl: navigations.at(-1) ?? page.url() }`、
         新しいウィンドウ、ダイアログ、フォーカス移動、`domObservation === 'used'` で数のどれかが 0 より大きければ `dom`。
      7. 変化があれば `activated-on-press` の finding。無ければ、`target.listeners` があって `press.length > 0 && release.length === 0`
         なら `press-only-listener` の finding（`changes: []`）。どちらでも `targetsTested += 1`（`untested` に入れたものは数えない）。
      8. 移動したら `navigated = true` で break し、context を閉じてやり直す（`:809-824`。全部試したら終わり、
         `restarts >= POINTER_CANCELLATION_MAX_RESTARTS` なら `abort('restart-limit')`）。
3. `buildAuditResult({ source: 'pointer-cancellation-check', url: startUrl, details, buckets: normalizePointerCancellationCheck(details) })`。
4. `out.save(result)`、`out.header('Pointer Cancellation Check', 'WCAG 2.5.2', startUrl)`、
   `out.summary({ 'Listener inspection': …, 'Targets found': …, 'Targets pressed': …, Findings: findings.length, Restarts: restarts })`、
   `out.outputPaths()`。`finally` で `context?.close()`。

ページ内関数は import を使えないので、`scopeSelector` / `shadowHostsOf` / `safeOuterHTML` / `isVisible` は
使う関数の中に書き写す（`collectTargets` と `endPress` の 2 か所。「Keep in sync with …」のコメントを付ける。
`runChangeOnInputCheck.ts:136` / `:317` と同じ流儀）。

### G. schema（`POINTER_CANCELLATION_CHECK_RESULT_SCHEMA`）

`buildEnvelopeSchema({ id: 'pointer-cancellation-check-result', title: 'PointerCancellationCheckResult', source: 'pointer-cancellation-check', details: {...} })`。
details の `required` は型の全フィールド。`listenerInspection` / `domObservation` / `findings[].kind` /
`target.sources[]` / `pageListeners[].target` / `aborted.reason` は `enum`、`inspectionError` / `role` /
`handlerPreview` は `['string', 'null']`、`listeners` / `pressListener` / `aborted` は `type: ['object', 'null']` + `properties`。
`changes[]` の items は `{ oneOf: [INPUT_CONTEXT_CHANGE_SCHEMA, DOM の変化のスキーマ] }` か、既存の
`INPUT_CONTEXT_CHANGE_SCHEMA` の書き方（`:1067-1122`）に合わせて `kind` の enum を広げた新しい const を作る
（**`INPUT_CONTEXT_CHANGE_SCHEMA` 自体は変えない**）。schema は `additionalProperties: false` を使わない方針。
`RESULT_SCHEMAS` の末尾に `'pointer-cancellation-check'` で登録。

## Steps

### Step 0: Drift check

冒頭の drift check を実行。

### Step 1: 型・定数・ルール

設計 B・C・D を追加。**Verify**: `npm run typecheck` → exit 0。

### Step 2: normalizer の単体テスト（テスト先行）

`test/pointer-cancellation.spec.ts` を作り、`normalizePointerCancellationCheck` を `../dist/index.js` から import して、
手で組んだ details で確かめる（ブラウザ不要）。まだ export が無いので build か import で失敗することを確かめる。1 テスト 1 振る舞い:

- `targetsFound: 0`・`targetsTested: 0`・候補 0 → `a11y-skills/pointer-cancellation` が inapplicable
- `targetsTested: 3`・候補 0 → passes
- `activated-on-press` で `navigation` の変化 1 つ → incomplete、summary に `navigation to` と `up-event` を含む
- `activated-on-press` で `dom` の変化（`addedNodes: 2`, `attributes: ['aria-expanded']`）→ summary に `2 added` と `aria-expanded`
- `press-only-listener`（`listeners: { press: ['mousedown'], release: [] }`、`pressListener` の場所あり）→ incomplete、summary に `no pointerup / mouseup / touchend / click listener`
- shadow root の中の候補（`selector: '#b'`, `shadowHosts: ['#host']`）→ node の `target` が `['#host', '#b']`
- `aborted: { reason: 'timeout', testedCount: 1, foundCount: 5 }`・候補 0・`targetsTested: 1` → incomplete、page node に `1 of 5`
- `domObservation: 'ignored-background-activity'`・`targetsTested: 2`・候補 0 → incomplete、page node に `changed on its own`

### Step 3: normalizer・schema・export

設計 E・G。`src/index.ts` の axe-format export に `normalizePointerCancellationCheck` と型を足す。
**Verify**: `npm run build --workspace @a11y-skills/audit` → exit 0、Step 2 のテストが pass。

### Step 4: schema の単体テスト

`test/schema-validation.spec.ts` に、手組み details の例 2 つ（変化 5 種類すべてを含む finding・`press-only-listener`・
`pageListeners` 1 件・`aborted` ありの例と、`listenerInspection: 'unsupported'`・`listeners: null` の例）が valid のテストを足す。
**Verify**: そのテストが pass。

### Step 5: フィクスチャと runner（テスト先行）

`test/fixtures/pages/pointer-cancellation/` に作る。各ファイル冒頭の HTML コメントに意図と期待結果を書く。

| ファイル | 中身 | 期待 |
|---|---|---|
| `mousedown-navigates.html` | `<button id="go">` の `mousedown` で `location.href = 'landing.html'`、その後ろに `click` だけで何かする `<button id="safe">` | incomplete。finding が `#go` の `activated-on-press`、変化 `{ kind: 'navigation', toUrl: <baseUrl>/pointer-cancellation/landing.html }`。`restarts === 1`（やり直して `#safe` も押される）、`targetsTested === 2` |
| `landing.html` | 移動先（中身は見出しだけ） | — |
| `pointerdown-opens-menu.html` | `<div role="button" id="menu-btn">` の `pointerdown` で `<ul id="menu">` を追加し `aria-expanded="true"` にする | finding `#menu-btn`、`dom` の変化で `addedNodes >= 1`、`attributes` に `aria-expanded` |
| `pointerdown-prevented.html` | `<div role="button" id="p">` の `pointerdown` で `e.preventDefault()` して要素を追加、`mousedown` にも別の要素を追加する listener | finding の `dispatched` が `['pointerdown']`（`mousedown` は送られない） |
| `mousedown-alert.html` | `<button>` の `mousedown` で `alert('x')` | finding の変化に `{ kind: 'dialog', dialogType: 'alert', message: 'x' }` |
| `mousedown-window-open.html` | `<button>` の `mousedown` で `window.open('landing.html')` | finding の変化に `new-window` |
| `press-only-silent.html` | `<div id="s" tabindex="0">` に `mousedown` の listener（何もしない関数 `function onPressOnly() {}`）だけ | finding `#s` が `press-only-listener`、`target.sources` が `['listener']`、`pressListener.handlerPreview` に `onPressOnly` |
| `press-and-click.html` | `<div id="pc" role="button">` に `mousedown`（何もしない）と `click`（要素を追加） | 候補 0、passes（押す listener があっても離す側の listener があれば press-only にしない。押しただけでは何も起きない） |
| `click-only.html` | `<button>` と `<a href="landing.html">` に `click` だけ | 候補 0、passes、`targetsTested === 2`、`restarts === 0`（押し下げだけでは移動しない） |
| `focus-self.html` | `<div role="button" tabindex="0" id="f">` の `mousedown` で `this.focus()` | 候補 0、passes（自分へのフォーカスは数えない） |
| `style-feedback.html` | `<button id="sf">` の `pointerdown` で `this.style.transform = 'scale(0.95)'` | 候補 0、passes（`style` は数えない） |
| `delegated.html` | `<div id="root">` に 25 種類の型の listener（配列で回して `addEventListener`）を付け、`pointerdown` のときだけ `event.target.closest('[data-action]')` があれば要素を追加。中に `<button data-action id="d">` | finding `#d` が `activated-on-press`（委譲でも押して確かめる側で拾える）、`target.sources` が `['interactive']`、`delegationRootCount === 1` |
| `background-ticker.html` | 100ms ごとに `<span id="clock">` の文字を書き換え、`<button>` の `click` だけ | `domObservation === 'ignored-background-activity'`、候補 0、incomplete（page node だけ） |
| `shadow.html` | `#host` の open shadow root の中の `<button id="b">` の `mousedown` で要素を追加 | finding の `target.shadowHosts` が `['#host']`、`selector` が `#b` |
| `none.html` | `<p>` と `<input type="text">` だけ | `targetsFound === 0`、inapplicable |

`test/pointer-cancellation.spec.ts` に、`runFixtureCheck('pointer-cancellation-check', 'pointer-cancellation/<file>', …)` を包む
`runCancel(fixture, context, baseUrl, extra)` を置き（`test/change-on-input.spec.ts:17-34` と同形。schema 検証もそこで行う）、
上の表の期待を 1 テスト 1 振る舞いで書く。加えて:

- `maxTargets: 1` で `click-only.html` → `aborted.reason === 'target-limit'`、incomplete
- `inspectionTimeoutMs: 1` で `press-only-silent.html` → 例外を投げずに返り、`listenerInspection === 'failed'`、
  `inspectionError === 'timeout'`、`press-only-listener` の finding は無い（根拠なしで続く）

次に runner を設計 F で実装し、`src/playwright/index.ts` に export、`src/cli.ts` の `CHECK_REGISTRY` 末尾に
`kind: 'browser'` のエントリ（focus-order-check と同形）、`src/test-entries/pointer-cancellation-check.ts`、
`package.json` の `exports` / `description`、`test/helpers/fixtures.ts` の `buildRunnerRegistry` に
`kind: 'browser-navigating'` で登録。

**Verify**: `npm test --workspace @a11y-skills/audit -- test/pointer-cancellation.spec.ts` → all pass。
`node packages/a11y-audit/dist/cli.js --list-checks` の末尾が `pointer-cancellation-check`。

### Step 6: 実行時間

`test/pointer-cancellation.spec.ts` に「`<button>` 150 個（`click` だけ）のページ（フィクスチャ `many.html`。
スクリプトで作ってよい）で、既定の設定でチェックが 60 秒＋20 秒以内に終わり、`aborted.reason === 'target-limit'`、
`targetsTested === 100`」のテストを 1 つ足す（テストの timeout は 120 秒）。
**Verify**: pass。100 個で予算 60 秒を超えて `timeout` で止まる場合は STOP（1 件あたりの時間が想定
（`settleMs` 300ms + evaluate 2 回）より大きい。上限・待ち時間の調整は設計判断）。

### Step 7: 既存テストの更新

- `test/fixture-gallery.spec.ts`: MANIFEST に 2 件（`mousedown-navigates.html` →
  `'a11y-skills/pointer-cancellation': 'incomplete'`、`click-only.html` → `'passes'`）。check は `'pointer-cancellation-check'`。
  冒頭コメントを `all 19 checks` / `all 33 custom finding-capable rules` に。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に 1 件（`expectedBucket: 'incomplete'`）。

**Verify**: `npm test` → 全 green。

### Step 8: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/claude-pc-all > /tmp/claude-pc-all.log 2>&1; echo "exit=$?"
grep -E "pointer-cancellation-check|Errors:" /tmp/claude-pc-all.log
# 期待: [pointer-cancellation-check] DONE ...、Errors: 0、exit=1（axe 由来）
```

満たせなければ STOP。

### Step 9: ドキュメント

日本語を先に書き、英語を同期する（AGENTS.md の方針）。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表の末尾に:
  `| \`pointer-cancellation-check\` | 2.5.2 | 押し下げただけで動く部品（ページの移動・新しいウィンドウ・ダイアログ・DOM の変化）と、押す listener だけを持つ要素（候補。要確認） |`
  / `| \`pointer-cancellation-check\` | 2.5.2 | Components that act on the down-event alone (navigation, new window, dialog, DOM change) and elements with only press listeners (candidates; needs review) |`
- `coverage-matrix.ja.md` / `.md`:
  - `:52` を `| 2.5.2 | インタラクティブ+自動の候補 | \`pointer-cancellation-check\` **[CLI]** + 操作ログ | 誤作動/キャンセル不可でFail |`
    （EN: 今の英語行の Fail 条件の文言を保ち、`Interactive + automated candidates | \`pointer-cancellation-check\` **[CLI]** + logs` に）
  - 出力の表で `pointer-gesture-check` の行の直後に `| 2.5.2 | \`pointer-cancellation-check\` | \`pointer-cancellation-result.json\` |`
- `interactive-checks.ja.md` / `.md`: `pointer-gesture-check` の節の後に `### \`pointer-cancellation-check\` CLIチェック`（EN: `CLI Check`）。
  中身は 4 点程度の箇条書き: 何をするか（押し下げの合成イベントだけを送り、離さない。何が起きたら候補か）／
  押す listener だけの要素も根拠として出す／候補はすべて `incomplete` で、離したときの実行・中止・取り消しと例外は人が確かめる／
  実行: `npx -y @a11y-skills/audit --url "<url>" --checks pointer-cancellation-check`。
  「ポインター」表に 2.5.2 の行が無ければ足す（ある場合は確認方法の列に `pointer-cancellation-check` を足す）。
- `packages/a11y-audit/README.ja.md` / `README.md`: 検査一覧表に
  `runPointerCancellationCheck | 2.5.2 ポインタのキャンセル（押し下げだけで動く部品。候補として報告）`、
  runner の段落（`browser` を受けて自前の context を作り、移動したらやり直す。合成イベントを送るのでページの
  スクリプトが動く——送信や保存をするページでは実際に動きうる。CDP は Chromium のみで、それ以外は listener の根拠なし）、
  チェック名一覧の末尾、test entry の「他にも」列挙の末尾。
- `packages/a11y-audit/TODO-COVERAGE.md`: 2.5.1 / 2.5.7 の節の書式（概要／実装／残る制限）で 2.5.2 の節、
  末尾の対応表に `| 2.5.2 Pointer Cancellation | \`pointer-cancellation-check\`（部分） ✅ |`。
- `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` の `### Added` の末尾に 1 項目（pointer-gesture-check の項の
  書き方に合わせ、新チェック・ルール・押し方・候補の 2 種類・既知の制限）。**`package.json` の version は変えない**。

**Verify**: `npm run validate:skills && npm run lint && npm run format:check` → exit 0。

### Step 10: 全体検証とコミット

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
を通し、Git workflow のとおりコミット。

## Test plan

- **`test/pointer-cancellation.spec.ts`**（新規）: normalizer の単体 8 件（Step 2）、フィクスチャ 15 件の期待（Step 5 の表）、
  上限・時間切れの経路、大きなページの時間（Step 6）。全フィクスチャの結果を schema で検証（`runCancel` の中）。
- **schema-validation / fixture-gallery / rule-classification**: 既存の枠組みに登録（Step 4・7）。
- **CI**: `--checks all` スモークが新チェックを自動で通す（Step 8）。

## Done criteria

ALL must hold:

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` exit 0
- [ ] `node packages/a11y-audit/dist/cli.js --list-checks` の末尾が `pointer-cancellation-check`
- [ ] Step 8 のスモークで `[pointer-cancellation-check] DONE`、`Errors: 0`、exit 1
- [ ] `git diff main --stat -- packages/a11y-audit/src/playwright/` に既存ファイルの差分がない（新規ファイルと `index.ts` のみ）
- [ ] `git diff main -- packages/a11y-audit/src/playwright/cdpEventListeners.ts` が空
- [ ] `git grep -n cdpEventListeners -- packages/a11y-audit/src/index.ts packages/a11y-audit/src/playwright/index.ts` が 0 件
- [ ] 日英ドキュメントがペアで更新されている（SKILL / coverage-matrix / interactive-checks / README）
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更

## STOP conditions

- 既存チェックの挙動・型・schema・rule、または `cdpEventListeners.ts` を変えなければならなくなった
- 合成した `pointerdown` / `mousedown` に、フィクスチャの普通の `addEventListener` のハンドラが反応しない
- `mousedown-window-open.html` で新しいウィンドウが開かない（ポップアップが止められている。
  実マウスに切り替えるかは設計判断なので、期待を書き換えて通さないこと）
- `click-only.html` で移動・候補が出る（合成イベントで `click` が出ている。前提が崩れている）
- Step 6 で 100 個の押下が予算内に終わらない
- Step 8 で `--checks all` が ERROR・ハング・exit 2 になる
- いずれかのフィクスチャでチェックがハングする
- `delegated.html` 以外の普通のフィクスチャで要素が委譲先と判定される
- schema 検証・lint・format・既存テストのいずれかが green にできない

## Maintenance notes

- **既知の制限**（runner 先頭コメント・CHANGELOG・TODO-COVERAGE に書く）:
  - 押し下げは合成イベント（`isTrusted === false`）。`isTrusted` を確かめるハンドラには反応されない。
    `touchstart` は送らない（`touchstart` の listener は根拠としてだけ使う）。
  - 押した後は `pointercancel` を送るだけで、ハンドラが始めた処理（ドラッグの開始など）は元に戻さない。
    前の要素の影響が後の要素の結果に出ることがある。
  - `settleMs` の後に表れる変化（通信の後の移動など）は見逃す。
  - 何もしなくても DOM が変わるページでは、DOM の変化を根拠に使わない（移動・新しいウィンドウ・ダイアログ・
    フォーカス移動だけ）。`style` 属性の変化は常に数えない。
  - 送信・保存などを押し下げで行うページでは、実際に送られる。
  - press-only の判定はその要素自身の listener だけを見る（祖先の `click` は見ない）。CDP は Chromium のみ。
  - iframe の中は見ない。closed shadow root の中は見えない。
  - 上限: 押すのは 100 要素、予算 60 秒、やり直し 10 回。
- **follow-up 候補**（本プランの範囲外）:
  - 実マウス（CDP `Input.dispatchMouseEvent`）で押し、離す前にポインタを外へ動かして「途中でやめられるか」まで確かめる
    （`isTrusted` の制限が消えるが、`click` を出さずに離す方法の検証が要る）。
  - `touchstart` の合成（`Touch` / `TouchEvent` のコンストラクタがあるブラウザだけ）。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit` を minor、
  スキル文書が変わるのでプラグインも minor に上げ、4 フィールドを揃える。
- **#66 との衝突**: `cli.ts` の `CHECK_REGISTRY` 末尾、`types.ts` の `CheckSource`、`RESULT_SCHEMAS`、
  fixture-gallery の件数コメント、README / SKILL / coverage-matrix / CHANGELOG の一覧は #66 も末尾に足す。
  後からマージする側が両方の行を残し、件数コメントを合計に直す。
- レビュアーは特に、(1) 押した後に `click` / `mouseup` を送っていないか、(2) 移動の後のやり直しで同じ要素を
  2 回押していないか（`tried` のキー）、(3) context が成功・失敗どちらの経路でも閉じられるか、
  (4) `activated-on-press` と `press-only-listener` が 1 要素で重複しないか、を見ること。
