# Plan 013: 動きによる起動 (WCAG 2.5.4) チェックと CDP イベントリスナー取り出し処理

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/68

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> の本プランのステータス行を更新する。
>
> **Drift check (run first)**:
> `git diff --stat 5832dce..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json skills/auditing-wcag .github/workflows/ci.yml`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比較してから
> 進む。構造的な不一致（`CHECK_REGISTRY` の形・`RULES` の形・`bucketize` /
> `pageNode` のシグネチャ・`buildEnvelopeSchema` のシグネチャの変化）は STOP。

> **番号について**: Issue 側の依頼では `012` だったが、`plans/012-redundant-entry-check.md`
> がコミット済み（#88）のため `013` にした。

## Status

- **Priority**: P2
- **Effort**: M（2〜3 日相当。CDP 取り出し処理の共通化とテストが半分）
- **Risk**: LOW〜MEDIUM（新規チェックと新規モジュールの追加のみで既存チェックには
  触れない。CI の `--checks all` スモークが新チェックを必ず通るので、`cli-smoke.html`
  で ERROR・ハングを起こすと CI が落ちる。CDP は Chromium 専用）
- **Depends on**: なし
- **Category**: feature
- **Planned at**: commit `5832dce`, 2026-10-13
- **Consumer**: 下流の WCAG テスト管理ツール（関数 API で呼び、`details` を取り込む）。
  評価できていない達成基準の洗い出しで 2.5.4 が挙がった。

## Why this matters

2.5.4（動きによる起動）は現在すべて手動（`coverage-matrix` で `Interactive`）。
端末を振る・傾けることで動く機能は、ページを開いただけでは人も気づきにくく、
「そもそも動きに反応する処理があるか」を自動で拾えるだけで手動確認の対象を
絞れる。

`devicemotion` / `deviceorientation` の listener（端末の傾きや振りに反応する処理）は
ページのスクリプトから見えないが、Chrome DevTools Protocol（CDP）の
`DOMDebugger.getEventListeners` なら、ページを開いた後でも `window` / `document`
に付いている listener を一覧できる。これを使って **13 個目のチェック
`motion-actuation-check`（SC 2.5.4）** を追加し、見つかった listener を「同じことを
画面の部品でできるか・動きでの起動を止められるかを人が確かめる」候補
（`incomplete`）として返す。加えて、合成した `DeviceMotionEvent` /
`DeviceOrientationEvent` を送って DOM が変わるか（＝本当に何かが起きるか）を
証跡として添える。

`DOMDebugger.getEventListeners` はまだコードベースで使っていない。#62（2.5.2
押し下げでの起動: 要素の `pointerdown` / `mousedown` / `touchstart`）、#64（2.1.4
文字キーのショートカット: `document` / `window` の `keydown`）、#69（2.5.1 / 2.5.7
軌跡・ドラッグ: 要素の pointer / touch 系）も同じ取り出しが要るので、**listener の
取り出しは独立したモジュールとして作り**、本チェックはその最初の利用者にする。

## Current state（統合点 — `5832dce` で確認済み）

リポジトリは npm workspaces モノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` ビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース。

### CDP は未使用

- `src/` 全体で `newCDPSession` / `CDPSession` / `DOMDebugger` にヒットなし。
- CLI（`src/cli.ts`）は `chromium` で起動し、`kind: 'page'` のチェックには
  `browser.newContext()` → `newPage()` → `gotoAndSettle(page, url)` 済みの page を
  渡す（`src/cli.ts:428-440` 付近）。チェックごとに新しい context なので、本チェックが
  ページへイベントを送っても他のチェックに影響しない。

### 新チェック追加の統合点（直近の前例: redundant-entry-check, #88）

`redundant-entry-check`（`kind: 'page'`、遷移済み `page` を受ける）が最も近い見本。

1. `src/types.ts` — `CheckSource` ユニオンに追加。details 型もここ。
2. `src/constants.ts` — 新定数。
3. `src/utils/rule-registry.ts` — `RULES`（:41〜）。page scope の見本は
   `orientation-lock`（:187-198、`tags: ['a11y-skills', 'wcag21aa', 'wcag134']`）、
   直近の追加は `redundant-entry`（:244〜）。
4. `src/utils/axe-format.ts` — `bucketize(buckets, key, nodes, applicable)`（:79）、
   `pageNode(summary)`（:126、`target: ['html']`）。直近の normalizer は
   `normalizeRedundantEntryCheck`（:566）。
5. `src/index.ts` — axe-format の export リストに normalizer を追加。
6. `src/playwright/index.ts` — runner と Options 型の export。
7. `src/schemas/index.ts` — `buildEnvelopeSchema` で schema を作り `RESULT_SCHEMAS` に登録
   （redundant-entry の schema が見本）。
8. `src/cli.ts` — `CHECK_REGISTRY`（:66〜）末尾、`redundant-entry-check`（:209-220）の後ろに
   `kind: 'page'` エントリ（lazy import）。
9. `src/test-entries/motion-actuation-check.ts`（新規）— `redundant-entry-check.ts` と同形。
10. `packages/a11y-audit/package.json` — `exports` に `./test-entries/motion-actuation-check`、
    `description` のチェック列挙に追記。
11. テスト: `test/helpers/fixtures.ts`（`buildRunnerRegistry`、`kind: 'page-current'`）、
    `test/fixture-gallery.spec.ts`（`MANIFEST`、冒頭コメント「all 13 checks」「all 23
    custom finding-capable rules」→ 14 / 24）、`test/rule-classification.spec.ts`
    （`FINDING_EXPECTATIONS`）、`test/schema-validation.spec.ts`。
    フィクスチャは `test/fixtures/pages/<check>/*.html`。テストは `../dist/...` から
    import する（pretest が build する）。
12. ドキュメント: `packages/a11y-audit/README.md` / `README.ja.md`（検査一覧表、
    チェック名一覧、test entry の列挙）、`CHANGELOG.md`、`TODO-COVERAGE.md`（JA のみ）、
    `skills/auditing-wcag/SKILL.md` / `SKILL.ja.md`（CLI チェック表、:124 が
    redundant-entry）、`references/coverage-matrix.md` / `.ja.md`（:54 が 2.5.4 行、
    :86〜 の「基準 × チェック名 × 出力ファイル」表、:100 が 3.3.7）、
    `references/interactive-checks.md` / `.ja.md`（「ポインター」表 :81-85。2.5.4 行は無い）。

### CI

`.github/workflows/ci.yml:108-118` が `dist/cli.js --url file://.../cli-smoke.html
--checks all` を実行し、exit code 1 と `Errors: +0` を要求する。`cli-smoke.html` に
motion listener は無いので、本チェックは inapplicable で終わるはず（Step 6 で確認）。

## Commands you will need

リポジトリルートで実行する（worktree では `npm --prefix <worktree> run <script>`）。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| Full test suite | `npm test` | all pass |
| New spec only | `npm test --workspace @a11y-skills/audit -- test/motion-actuation.spec.ts test/cdp-event-listeners.spec.ts` | all pass |
| List checks | `node packages/a11y-audit/dist/cli.js --list-checks` | 末尾が `motion-actuation-check` |
| 全体検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/playwright/cdpEventListeners.ts`、`src/playwright/runMotionActuationCheck.ts`、
  `src/test-entries/motion-actuation-check.ts`、
  `test/fixtures/pages/event-listeners/listeners.html`、
  `test/fixtures/pages/motion-actuation/{finding-shake,finding-tilt,document-only,no-reaction,none,navigates,hangs}.html`、
  `test/cdp-event-listeners.spec.ts`、`test/motion-actuation.spec.ts`
- 編集（追加のみ）: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、
  `src/utils/axe-format.ts`、`src/index.ts`、`src/playwright/index.ts`、
  `src/schemas/index.ts`、`src/cli.ts`、`packages/a11y-audit/package.json`
  （`exports` と `description` のみ）、`test/helpers/fixtures.ts`、
  `test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、
  `test/schema-validation.spec.ts`
- ドキュメント: 上記統合点 12 のファイル

**Out of scope**:

- 既存チェックの runner・normalizer・schema・rule
- #62 / #64 / #69 のチェック本体（取り出し処理を使える形にするところまで）
- Generic Sensor API（`Accelerometer` / `Gyroscope` など）の検出
- iframe（特に別オリジン）の中の listener
- `package.json` の `version`、プラグイン 4 フィールドの version（リリース PR で別途）
- `.github/workflows/`

## Git workflow

- ブランチ: `feat/motion-actuation-check`
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`）:
  1. `feat(a11y-audit): add CDP event listener inspector`
  2. `feat(a11y-audit): add motion actuation types, constants and rule`
  3. `feat(a11y-audit): add motion actuation normalizer and schema`
  4. `feat(a11y-audit): add motion actuation runner (2.5.4)`
  5. `feat(a11y-audit): register motion-actuation-check in CLI and exports`
  6. `test(a11y-audit): add motion actuation and listener inspector specs`
  7. `docs: document motion-actuation-check (2.5.4)`
- 公開リポジトリなので、コミットされる文面に下流の利用者のツール名・サービス名を
  書かない（「downstream consumer」と書く）。

## 設計

### A. 共通モジュール `src/playwright/cdpEventListeners.ts`

#62 / #64 / #69 で使い回す前提の、listener 取り出し処理。**パッケージの公開 API には
しない**（`src/playwright/index.ts` から export しない。形が固まるまで内部扱い）。

```ts
import type { Page } from '@playwright/test';

/** One listener as reported by DOMDebugger.getEventListeners. */
export interface EventListenerRecord {
  type: string;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  /** V8 script id; meaningful only within the inspected page's lifetime. */
  scriptId: string;
  /** 0-based, as CDP reports them. */
  lineNumber: number;
  columnNumber: number;
  /** Start of the handler's source text (EVENT_LISTENER_HANDLER_PREVIEW_MAX chars), or null. */
  handlerPreview: string | null;
}

export interface EventListenerInspector {
  /**
   * Listeners on the object `expression` evaluates to in the main frame's main
   * world (e.g. 'window', 'document'). `types` filters by event type; omit for all.
   * Throws when the expression throws or does not evaluate to an object.
   */
  forExpression(expression: string, types?: readonly string[]): Promise<EventListenerRecord[]>;
  /**
   * Same, for each item of an array-like expression (e.g. a NodeList), in index
   * order. For per-element checks (#62, #69).
   */
  forEach(expression: string, types?: readonly string[]): Promise<EventListenerRecord[][]>;
  /**
   * Stops the script currently running on the page's main thread
   * (Runtime.terminateExecution). For checks that dispatch events into the
   * page and must recover when a handler never returns (#62 also needs this).
   */
  terminateExecution(): Promise<void>;
  /** Releases remote objects and detaches the CDP session. Safe to call twice. */
  close(): Promise<void>;
}

/** Returns null when the browser has no CDP (Firefox / WebKit). */
export async function openEventListenerInspector(page: Page): Promise<EventListenerInspector | null>;
```

実装の要点:

- `page.context().newCDPSession(page)` を try/catch で包み、失敗したら `null`
  （Chromium 以外では例外になる）。
- `Runtime.evaluate({ expression, objectGroup: GROUP })` で objectId を得る。
  `exceptionDetails` がある、または `result.objectId` が無い（プリミティブ）なら
  `Error` を投げる（呼び出し側のバグなので握りつぶさない）。
- `DOMDebugger.getEventListeners({ objectId, objectGroup: GROUP })`。`objectGroup` を
  渡すと `handler` の RemoteObject が付くので、`handler.description`（関数のソース
  文字列）を `EVENT_LISTENER_HANDLER_PREVIEW_MAX`（200）文字で切って `handlerPreview`
  にする。`types` が渡されたら `type` で絞る。
- `forEach` は `Runtime.getProperties({ objectId, ownProperties: true })` で
  数字名のプロパティだけを取り、数値順に並べて各要素で上と同じ処理。
- `close()` は `Runtime.releaseObjectGroup({ objectGroup: GROUP })` → `session.detach()`。
  どちらも失敗は無視（ページが閉じた後でも呼べるように）。2 回目以降は何もしない。
- **`Debugger.enable` は呼ばない**（スクリプトの URL は取れるが、ページの
  `debugger;` 文で止まって検査がハングするため）。場所は `scriptId` と行・列だけ。
- **`DOM.enable` も要らない**（objectId 経由で取るため）。
- `terminateExecution()` は `Runtime.terminateExecution` を送る。失敗は無視しない
  （呼び出し側が「打ち切れなかった」と記録できるよう例外を投げる）。

### B. チェック `runMotionActuationCheck`

```ts
export interface RunMotionActuationCheckOptions extends AuditOutputOptions {
  page: Page;
  /** Dispatch synthetic motion/orientation events to see whether the page reacts. Default: true. */
  simulate?: boolean;
}
```

`kind: 'page'`（遷移済み page を受ける。redundant-entry と同じ）。スクリーンショットは撮らない。

手順:

1. `openEventListenerInspector(page)`。`null` なら
   `listenerInspection: 'unsupported'`、listener 0 件、`simulation.status: 'unsupported'`
   で結果を作る（下記 normalizer で incomplete になる）。
2. `forExpression('window', MOTION_EVENT_TYPES)` と `forExpression('document', MOTION_EVENT_TYPES)`。
   `MOTION_EVENT_TYPES = ['devicemotion', 'deviceorientation', 'deviceorientationabsolute']`。
   各記録に `target: 'window' | 'document'` を付けて `listeners` にする。
   inspector はシミュレーションが終わるまで開いたままにし（打ち切りに使う）、
   チェック全体の `finally` で `inspector.close()`。
3. `simulate !== false` で、`window` に listener がある型があれば、その型ごとに
   シミュレーションする（`document` にしか無い型は送らない。ブラウザはこれらの
   イベントを `window` にしか送らないので、`document` の listener は実際には動かない）:
   - `page.evaluate` で、`document.documentElement` を見る `MutationObserver`
     （`childList` / `attributes` / `characterData`、`subtree: true`）を付け、件数を
     数え始める。押す前の `page.url()` を控える。
   - 型ごとの列を、`MOTION_SIMULATION_INTERVAL_MS`（50ms）おきに
     `MOTION_SIMULATION_EVENT_COUNT`（10）回 `window.dispatchEvent` する:
     - `devicemotion`: 振る動き。`accelerationIncludingGravity.x` と `acceleration.x`
       を `+25 / -25` で交互に、`rotationRate` は `{ alpha: 0, beta: 0, gamma: 0 }`、`interval: 16`。
     - `deviceorientation`: 傾ける動き。`beta` と `gamma` を 0 → 60 まで等間隔、`alpha: 0`、
       `absolute: false`。
     - `deviceorientationabsolute`: 同じ値で `absolute: true`。
   - 送り終わったら `MOTION_SIMULATION_SETTLE_MS`（500ms）待ち、件数を読んで
     observer を外す。
   - 送る処理は**ページ内の 1 回の `page.evaluate`**（`async` で中の待ちも含める）に
     まとめる。コンストラクタ（`DeviceMotionEvent` / `DeviceOrientationEvent`）が
     無ければ `{ error: 'constructor-unavailable' }` を返す。
   - **時間の上限**: この `page.evaluate` を Node 側で `MOTION_SIMULATION_TIMEOUT_MS`
     （5000ms。送信 10 回 × 50ms + 待ち 500ms の約 5 倍）と `Promise.race` する。
     期限を過ぎたら `inspector.terminateExecution()` でページのスクリプトを打ち切り、
     `error: 'timeout'` を記録して**残りの型は送らない**。打ち切り後に元の
     `page.evaluate` の Promise が reject されても外に漏らさない（`.catch(() => {})`
     を付けておく）。`terminateExecution()` 自体が失敗したら `error: 'timeout-unrecoverable'`
     を記録して同様に止める。いずれの場合も**借りた page は閉じない**（呼び出し側の
     もの。CLI はチェックごとに context を閉じる）。listener が同期的に戻らない場合でも
     期限内に結果を返せるので、`--checks all` は止まらない。
   - `page.evaluate` が「Execution context was destroyed」等で失敗した、または
     `page.url()` が変わったら `navigated: true`・`urlAfter` を記録し、残りの型は
     送らない（`simulation.status: 'ran'` のまま、送らなかった型は結果に載せない）。
     その他の失敗は `error` に文言を入れて次の型へ進む（チェック全体は落とさない）。
   - 結果: `{ type, eventsDispatched, domMutations, navigated, urlAfter, error }`。
     **遷移・期限切れ・評価失敗で evaluate の戻り値が得られなかったときは
     `eventsDispatched` と `domMutations` を `null`（未計測）にする**。0 は「送って、
     変化が無かった」ときだけに使う。
4. `simulation.status`: CDP 不可 → `'unsupported'`、`simulate: false` → `'disabled'`、
   `window` の listener が 0 → `'skipped-no-listeners'`、それ以外 → `'ran'`。
5. `buildAuditResult({ source: 'motion-actuation-check', url, details, buckets:
   normalizeMotionActuationCheck(details) })` → `out.save` → `out.header`。
   **`url` は検査開始時の `page.url()`** を使う（シミュレーションで遷移したとき遷移先を
   書かないため）。`writeResult` / `quiet` は `createAuditOutput` 経由で尊重する
   （redundant-entry と同じ）。

### C. 型（`src/types.ts`）

```ts
export type MotionEventType = 'devicemotion' | 'deviceorientation' | 'deviceorientationabsolute';

export interface MotionListener {
  target: 'window' | 'document';
  type: MotionEventType;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  scriptId: string;
  lineNumber: number;
  columnNumber: number;
  handlerPreview: string | null;
}

export interface MotionSimulationResult {
  type: MotionEventType;
  /** null when not measured (navigation, timeout or evaluate failure). */
  eventsDispatched: number | null;
  /**
   * childList + attributes + characterData records observed during dispatch and
   * settle. null when not measured; 0 only means "dispatched, nothing changed".
   */
  domMutations: number | null;
  navigated: boolean;
  urlAfter: string | null;
  error: string | null;
}

export interface MotionActuationCheckDetails {
  listenerInspection: 'cdp' | 'unsupported';
  listeners: MotionListener[];
  simulation: {
    status: 'ran' | 'disabled' | 'skipped-no-listeners' | 'unsupported';
    results: MotionSimulationResult[];
  };
}

export type MotionActuationCheckResult = AuditCheckResult<MotionActuationCheckDetails>;
```

### D. ルール（`src/utils/rule-registry.ts`）

```ts
// --- motion-actuation-check ---
'motion-actuation': {
  id: 'a11y-skills/motion-actuation',
  sc: ['2.5.4'],
  tags: ['a11y-skills', 'wcag21a', 'wcag254'],
  impact: 'serious',
  scope: 'page',
  description: 'Ensure functions operated by device motion can also be operated by UI components and motion actuation can be disabled',
  help: 'Provide a UI alternative to device motion and a way to turn motion actuation off',
  helpUrl: `${UNDERSTANDING}/motion-actuation.html`,
  // A listener only shows the page reacts to motion; whether a UI alternative and
  // an off switch exist (or the essential / accessibility-supported-interface
  // exceptions apply) needs a human.
  classification: 'incomplete',
},
```

### E. normalizer（`normalizeMotionActuationCheck`）

- `listenerInspection === 'unsupported'`: `applicable = true`、ページ単位の node 1 つ
  （`Event listeners could not be inspected (CDP is only available in Chromium). Check manually whether the page reacts to device motion or orientation.`）。
- それ以外で `listeners.length === 0`: `applicable = false`（inapplicable。動きに
  反応する処理が見つからない＝この基準の対象が無い）。
- それ以外: listener 1 件ごとに `pageNode(summary)`。summary 例:
  `` `${target} has a "${type}" listener (script ${scriptId}, line ${lineNumber + 1}:${columnNumber + 1})${preview}. ${sim} Verify that the same function is available through UI components and that motion actuation can be turned off.` ``
  - `preview`: `handlerPreview` があれば `` `: ${handlerPreview}` ``
  - `sim`: `target === 'document'` なら「Browsers dispatch this event only to window, so this listener may never run.」。
    `window` なら、その型のシミュレーション結果で
    「Synthetic events changed the DOM (${n} mutations).」/「…caused navigation to ${urlAfter}.」/
    「Synthetic events caused no DOM change (the page may react only to trusted events or draw on canvas).」
    （`domMutations === 0` のときだけ）/
    `error === 'timeout'` 等で `domMutations === null` なら
    「Simulation did not finish (${error}); the page's reaction is unknown.」
    （**未計測を「変化なし」と書かない**）/ 結果が無ければ「Not simulated.」
  - summary が listener ごとに違う（type・場所が違う）ので、`mergeNormalizedResults` の
    重複排除（`target` + `failureSummary`）で潰れない。同じ型・同じ場所の listener が
    2 つある場合は潰れてよい。
- `bucketize(buckets, 'motion-actuation', nodes, applicable)`。

### F. schema

`MOTION_ACTUATION_CHECK_RESULT_SCHEMA` を `buildEnvelopeSchema` で作る。details の
`required` は型の全フィールド、`type` / `target` / `listenerInspection` /
`simulation.status` は `enum`、`handlerPreview` / `urlAfter` / `error` は
`['string', 'null']`、`eventsDispatched` / `domMutations` は `['integer', 'null']`。`RESULT_SCHEMAS` に `'motion-actuation-check'` で登録。

### G. 定数（`src/constants.ts`）

```ts
/** WCAG 2.5.4: event types fired by device motion / orientation sensors. */
export const MOTION_EVENT_TYPES = ['devicemotion', 'deviceorientation', 'deviceorientationabsolute'] as const;
export const MOTION_SIMULATION_EVENT_COUNT = 10;
export const MOTION_SIMULATION_INTERVAL_MS = 50;
export const MOTION_SIMULATION_SETTLE_MS = 500;
/** Per event type; the page script is terminated via CDP when exceeded. */
export const MOTION_SIMULATION_TIMEOUT_MS = 5_000;
export const EVENT_LISTENER_HANDLER_PREVIEW_MAX = 200;
export const DEFAULT_MOTION_ACTUATION_RESULT_FILE = 'motion-actuation-result.json';
```

## Steps

### Step 0: Drift check

冒頭の drift check を実行。

### Step 1: CDP 取り出し処理（テスト先行）

1. `test/fixtures/pages/event-listeners/listeners.html` を作る（冒頭の HTML コメントに意図）:
   - `window.addEventListener('devicemotion', fnA, { capture: true })`
   - `window.onkeydown = function onKey() {}`（プロパティで付けた handler）
   - `document.addEventListener('keydown', fnB, { passive: true, once: true })`
   - `<button id="b1">` に `pointerdown` と `click`、`<button id="b2">` に `click` だけ、
     `<button id="b3">` は listener なし
2. `test/cdp-event-listeners.spec.ts`（`@playwright/test` の `test` + `helpers/static-server.js`）を先に書き、
   失敗（モジュールが無い）を確かめる。テストは `../dist/playwright/cdpEventListeners.js` から import:
   - `window` を devicemotion で絞ると 1 件で `useCapture === true`
   - `window` の keydown（プロパティ handler）が取れ、`handlerPreview` に `onKey` を含む
   - `document` の keydown が `passive === true`・`once === true`
   - `forEach('document.querySelectorAll("button")', ['pointerdown', 'click'])` が
     `[[pointerdown, click], [click], []]` の型の並び
   - 数値を返す式（`'1'`）は例外になる
   - `close()` を 2 回呼んでも例外にならない
3. `src/playwright/cdpEventListeners.ts` を設計 A どおりに実装し、テストを通す。

**Verify**: 新 spec が green。プロパティ handler が取れない場合は STOP（設計判断が要る）。

### Step 2: 型・定数・ルール

設計 C・D・G を追加。**Verify**: `npm run typecheck` → exit 0。

### Step 3: normalizer・schema・export

設計 E・F。`src/index.ts` の axe-format export に `normalizeMotionActuationCheck` を追加。
**Verify**: build → exit 0。

### Step 4: フィクスチャ（テスト先行）

`test/fixtures/pages/motion-actuation/` に作る。各ファイル冒頭の HTML コメントに意図と期待結果。

- `finding-shake.html`: `window.addEventListener('devicemotion', ...)` で、
  `accelerationIncludingGravity.x` の符号が前回と変わり絶対値が 15 を超えたら
  「元に戻す」を実行して `<p id="status">` の文言を変える（振ると取り消し）。
  画面には「元に戻す」ボタンもある。期待: incomplete、listener 1 件、
  `simulation.results[0].domMutations > 0`。
- `finding-tilt.html`: `deviceorientation` で `gamma > 30` のとき次のスライドへ（`<div>` の
  `hidden` を切り替え）。期待: incomplete、`domMutations > 0`。
- `document-only.html`: `document.addEventListener('devicemotion', ...)` のみ。期待:
  incomplete、listener の `target === 'document'`、`simulation.status === 'skipped-no-listeners'`、
  summary に「only to window」を含む。
- `no-reaction.html`: `devicemotion` listener はあるが `event.isTrusted` が false なら何もしない。
  期待: incomplete、`domMutations === 0`、summary に「no DOM change」を含む。
- `none.html`: `click` listener だけ。期待: `a11y-skills/motion-actuation` が inapplicable、
  `simulation.status === 'skipped-no-listeners'`。

`test/motion-actuation.spec.ts` を先に書き（`helpers/fixtures.js` の `test` /
`runFixtureCheck` を使う）、上の期待を 1 テスト 1 振る舞いで確かめる。加えて:

- `simulate: false` のとき `simulation.status === 'disabled'`・`results` が空
- 全ケースでエンベロープが `RESULT_SCHEMAS['motion-actuation-check']` に valid
- シミュレーションで遷移するページ（`navigates.html`: `devicemotion` で
  `location.assign('none.html')`）で例外を投げず、`navigated === true`、
  `result.url` が元のフィクスチャ URL、`eventsDispatched === null`・`domMutations === null`、
  summary に「no DOM change」を含まない
- 戻らない listener のページ（`hangs.html`: `devicemotion` の handler が `for (;;) {}`）で、
  チェックが `MOTION_SIMULATION_TIMEOUT_MS` + 5 秒以内に結果を返し、`error === 'timeout'`、
  `domMutations === null`、incomplete（テストの timeout は 20 秒に設定）。
  加えて `hangs.html` に対して CLI（`--checks motion-actuation-check`）が exit 0〜1 で
  有限時間内に終わること（`execFile` に 30 秒の timeout）

### Step 5: runner・CLI・test-entry・exports

- `src/playwright/runMotionActuationCheck.ts` を設計 B で実装。ファイル先頭コメントに
  Limitations（Maintenance notes の既知の制限）を列挙。
- `src/playwright/index.ts` に runner と Options 型の export（`cdpEventListeners` は export しない）。
- `src/cli.ts` の `CHECK_REGISTRY` 末尾に `kind: 'page'` エントリ（redundant-entry と同形）。
- `src/test-entries/motion-actuation-check.ts`、`package.json` の `exports` / `description`。
- `test/helpers/fixtures.ts` の `buildRunnerRegistry` に `kind: 'page-current'` で登録。

**Verify**: Step 4 の spec が green。`--list-checks` の末尾が `motion-actuation-check`。

### Step 6: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/claude-ma-all > /tmp/claude-ma-all.log 2>&1; echo "exit=$?"
grep -E "motion-actuation-check|Errors:" /tmp/claude-ma-all.log
# 期待: [motion-actuation-check] DONE ...、Errors: 0、exit=1（axe 由来）
```

満たせなければ STOP。

### Step 7: 既存テストの更新

- `test/fixture-gallery.spec.ts`: MANIFEST に 2 件（`finding-shake.html` →
  `'a11y-skills/motion-actuation': 'incomplete'`、`none.html` → `'inapplicable'`）。
  冒頭コメントを 14 checks / 24 rules に。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に
  `{ ruleId: 'a11y-skills/motion-actuation', expectedBucket: 'incomplete' }`。
- `test/schema-validation.spec.ts`: 手組み details（window / document の listener 各 1、
  シミュレーション結果 1、`listenerInspection: 'unsupported'` の例 1）が valid。

**Verify**: `npm test` → 全 green。

### Step 8: ドキュメント

日本語を先に書き、英語を同期する。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表に 1 行:
  `| \`motion-actuation-check\` | 2.5.4 | 端末の動き・傾きに反応する処理（候補。要確認） |`
  / `| ... | 2.5.4 | Listeners reacting to device motion / orientation (candidates; needs review) |`
- `coverage-matrix.ja.md` / `.md` `:54` の 2.5.4 行を
  `インタラクティブ+自動の候補 | \`motion-actuation-check\` **[CLI]** + 操作ログ | 動作検知のみでFail`
  （EN: `Interactive + automated candidates | \`motion-actuation-check\` **[CLI]** + logs | ...`）に。
  「基準 × チェック名 × 出力ファイル」表に
  `| 2.5.4 | \`motion-actuation-check\` | \`motion-actuation-result.json\` |` を SC 順の位置に追加。
- `interactive-checks.ja.md` / `.md`: 「ポインター」表の前に 2.5.4 行
  （`| 2.5.4 | 振る・傾ける操作に画面の部品の代わりがあり、動きでの起動を止められるか | 操作ログ | 動きでしか操作できない、または止められない |`）と、
  短い節「`motion-actuation-check` CLI チェック」（何を自動で見るか / シミュレーションの
  意味と限界 / 候補は incomplete で人手確認、の 3 点程度）。
- `packages/a11y-audit/TODO-COVERAGE.md`（JA のみ）: 2.5.4 の節を redundant-entry の節の
  書式で追加（部分実装、残る制限）。
- `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表に
  `runMotionActuationCheck | 2.5.4 動きによる起動（devicemotion / deviceorientation の listener。候補として報告）`、
  チェック名一覧に 1 行、test entry の列挙に追記、表の下に短い段落（CDP を使うので
  Chromium のみ。それ以外では `incomplete`。`simulate: false` で合成イベントを送らない）。
- `packages/a11y-audit/CHANGELOG.md`: 先頭の未リリース節（無ければ作る）の `### Added` に
  新チェック・ルール・既知の制限。**`package.json` の version は変えない**。

**Verify**: `npm run validate:skills && npm run lint && npm run format:check`

### Step 9: 全体検証とコミット

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
を通し、Git workflow のとおりコミット。`plans/README.md` のステータス行を更新。

## Test plan

- **`test/cdp-event-listeners.spec.ts`**: 取り出し処理の単体（window / document /
  プロパティ handler / 要素ごと / 不正な式 / close の二重呼び出し）。#62・#64・#69 は
  この spec を足場に要素・`keydown` の取り出しを足せる。
- **`test/motion-actuation.spec.ts`**: 6 フィクスチャで listener 検出・シミュレーション
  結果・遷移時の頑健さ・`simulate: false`・schema を検証。
- **fixture-gallery / rule-classification / schema-validation**: 既存の枠組みに登録。
- **CI**: `--checks all` スモークが新チェックを自動で通す（Step 6）。

## Done criteria

ALL must hold:

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` exit 0
- [ ] `--list-checks` の末尾が `motion-actuation-check`
- [ ] Step 6 のスモークで `[motion-actuation-check] DONE`、`Errors: 0`、exit 1
- [ ] 既存 runner（`src/playwright/run*.ts` の既存ファイル）に差分がない
- [ ] `cdpEventListeners.ts` が `src/playwright/index.ts` からも `src/index.ts` からも export されていない
- [ ] 日英ドキュメントがペアで更新されている（SKILL / coverage-matrix / interactive-checks / README）
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更
- [ ] `plans/README.md` のステータス行を更新

## STOP conditions

- 既存チェックの挙動・型・schema・rule を変えなければならなくなった
- `DOMDebugger.getEventListeners` がプロパティで付けた handler（`window.onkeydown = fn`）を返さない
  （#64 で必要になるため、取り出し方を設計し直す判断が要る）
- 合成イベントで `finding-shake.html` / `finding-tilt.html` の listener が動かない
  （`dispatchEvent` 方式の限界。CDP の sensor override に切り替えるかは設計判断）
- Step 6 で `--checks all` が ERROR・ハング・exit 2 になる
- いずれかのフィクスチャでチェックがハングする
- `hangs.html` で `Runtime.terminateExecution` を送っても `page.evaluate` が戻らない、
  またはその後の page 操作（`out` の後処理、CLI の context close）が止まる
  （打ち切り方式の限界。page を閉じる方式にするかは設計判断）
- schema 検証・lint・format・既存テストのいずれかが green にできない

## Maintenance notes

- **取り出し処理の使い回し（#62 / #64 / #69）**:
  - #64（2.1.4）: `forExpression('window', ['keydown', 'keypress'])` と `'document'` で足りる。
  - #62（2.5.2）・#69（2.5.1 / 2.5.7）: 列挙した要素を
    `page.evaluate` でページの一時的な配列（例: `window.__a11yTargets`）に入れ、
    `forEach('window.__a11yTargets', [...])` で要素ごとに取る。CDP の `Runtime.evaluate`
    は Playwright の `page.evaluate` と同じ main world で動くので、その配列が見える。
  - 委譲（`document` に付けて `event.target` で振り分ける）listener は要素に帰属できない。
    要素ごとの判定では `document` / `window` 側も合わせて見ること。
  - 公開 API にするか（`@a11y-skills/audit/playwright` から export）は、2 つ目の利用者が
    できた時点で決める。
- **既知の制限**（runner 先頭コメントと CHANGELOG に記載）:
  - CDP は Chromium のみ。それ以外のブラウザでは `listenerInspection: 'unsupported'` で incomplete。
  - 見るのは主フレームの `window` / `document` だけ。iframe の中は見ない。
  - 利用者の操作の後に付く listener（iOS の `DeviceMotionEvent.requestPermission()` を
    ボタンで許可してから付ける実装など）は、検査時点では見つからない。
  - Generic Sensor API（`Accelerometer` 等）やカメラ・マイクでの動き検知は見ない。
  - 合成イベントは `isTrusted: false`。`isTrusted` を確かめるページや、canvas に描くだけで
    DOM が変わらないページでは「変化なし」になる（listener がある限り候補には出る）。
  - シミュレーションは呼び出し側の page の状態を変える（関数 API で同じ page を使い回す
    場合は `simulate: false`）。CLI はチェックごとに新しい context を使うので影響しない。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit`
  を minor、スキル文書が変わるのでプラグインも minor に上げ、4 フィールドを揃える。
- レビュアーは特に、(1) CDP セッションが成功・失敗どちらの経路でも detach されるか、
  (2) `Debugger.enable` を呼んでいないか、(3) シミュレーション中の遷移で例外が外に
  漏れないか、を見ること。
