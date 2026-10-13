# Plan 016: ポインタのジェスチャ (WCAG 2.5.1)・ドラッグ動作 (2.5.7) の候補を拾う `pointer-gesture-check`

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/69

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> の本プランのステータス行を更新する（レビュアーが index を管理すると言った場合を除く）。
>
> **Drift check (run first)**:
> `git diff --stat f6269e9..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json packages/a11y-audit/README.md packages/a11y-audit/README.ja.md packages/a11y-audit/CHANGELOG.md packages/a11y-audit/TODO-COVERAGE.md skills/auditing-wcag`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比べてから進む。
> 構造的な不一致（`CHECK_REGISTRY` の形、`RULES` の形、`bucketize` / `toNode` /
> `pageNode` のシグネチャ、`buildEnvelopeSchema` のシグネチャ、
> `cdpEventListeners.ts` の `EventListenerInspector` の形の変化）は STOP。
> 行番号のずれだけなら、抜粋の文字列で場所を探して進めてよい。

## Status

- **Priority**: P2
- **Effort**: M（2〜3 日相当。共通の listener 取り出し処理の拡張とフィクスチャが半分）
- **Risk**: LOW〜MEDIUM（新規チェックの追加と、共通モジュール `cdpEventListeners.ts` への
  **メソッド追加のみ**。既存メソッドの挙動は変えない。CI の `--checks all` スモークが
  新チェックを必ず通るので、`cli-smoke.html` で ERROR・ハングを起こすと CI が落ちる。
  CDP は Chromium 専用）
- **Depends on**: なし（Plan 013 の `cdpEventListeners.ts` は main に入っている）
- **Category**: direction（新しいチェック）
- **Planned at**: commit `f6269e9`, 2026-10-13
- **Consumer**: 下流の WCAG テスト管理ツール（関数 API で呼び、`details` を取り込む）。
  評価できていない達成基準の洗い出しで 2.5.1 / 2.5.7 が挙がった。

## Why this matters

2.5.1（ポインタのジェスチャ: 複数の指や軌跡に沿った操作を、1 点の操作でもできるか）と
2.5.7（ドラッグ動作: ドラッグを、ドラッグ無しの 1 点の操作でもできるか）は、今は
すべて手動（`coverage-matrix` で「インタラクティブ」）。ページを開いただけでは
「どこがドラッグやスワイプで動くのか」が人にも分かりにくく、確認の漏れが起きやすい。

このチェックは、ドラッグやジェスチャで動く**可能性がある部品を候補として列挙**し、
「1 点の操作（ボタンやクリック）で同じことができるか」を人か AI が確かめる対象
（`incomplete`）にする。合否は出さない（代わりの操作があるか、例外に当たるかは
自動で判断できないため）。2 つの基準は拾い方がほぼ同じなので、1 つのチェックで
2 つのルールに振り分けて返す。

## Current state（`f6269e9` で確認済み）

リポジトリは npm workspaces のモノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` でビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース（Prettier と ESLint が CI で強制）。

### 共通の listener 取り出し処理 `src/playwright/cdpEventListeners.ts`（191 行）

Plan 013（#89）で作った内部モジュール。パッケージの入口からは export していない。
今あるメソッド（`:37-63`）:

```ts
export interface EventListenerInspector {
  forExpression(expression: string, types?: readonly string[]): Promise<EventListenerRecord[]>;
  forEach(expression: string, types?: readonly string[]): Promise<EventListenerRecord[][]>;
  terminateExecution(): Promise<void>;
  close(): Promise<void>;
}
```

内部関数 `listenersOf(session, objectId, types)`（`:75-104`）が
`DOMDebugger.getEventListeners({ objectId, objectGroup: GROUP })` を呼び、
`handler.description` を `EVENT_LISTENER_HANDLER_PREVIEW_MAX`（200）文字で切って
`handlerPreview` にする。`evaluateToObject(session, expression)`（`:106-123`）が
式を objectId にする（例外・プリミティブなら throw）。`Debugger.enable` / `DOM.enable` は
意図的に呼んでいない（ファイル先頭コメント `:12-16`）。

`forEach` は要素ごとに CDP を 1 回呼ぶので遅い。**計画時に実測した結果**（Chromium、
span 5000 個のページ）:

| 方式 | 時間 |
|---|---|
| `forEach('document.querySelectorAll("*")')`（要素ごと） | 3.2〜4.0 秒 |
| `DOMDebugger.getEventListeners({ objectId: <document>, depth: -1, pierce: true })`（1 回で子孫すべて） | 約 40ms |

`depth: -1, pierce: true` の結果は各 listener に `backendNodeId`（どの要素に付いているか）
が付き、**open shadow root の中の要素の listener も返る**。`DOM.resolveNode({ backendNodeId })`
は `DOM.enable` なしで動き、要素の objectId を返す（`Runtime.callFunctionOn` で
`this.id` 等が読めることを確認済み）。`objectGroup` を渡せば `handler.description` も付く。
本プランはこの 2 つを使うメソッドを共通モジュールに**追加**する（設計 A）。

### 要素ごとの listener 取り出しの先例

`src/playwright/runAccessibleAuthenticationCheck.ts:623-663`: 対象要素を
`window.__a11yAuthFields` に入れて `inspector.forEach('window.__a11yAuthFields', [...])` で
取り出し、`finally` で `delete` する。全体を `withTimeout(..., AUTH_PASTE_STEP_TIMEOUT_MS)`
で包み、失敗したら証跡なしで続ける。`withTimeout` はそのファイルのローカル関数（`:358-365`）:

```ts
/** Rejects when `promise` takes longer than `ms`; the promise is left running. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('step timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
```

同じファイルの `getUniqueSelector` / `safeOuterHTML` / `isVisible`（`:137-180` 付近、
ページ内で動く関数の中に定義）が、ページ内で selector と HTML 抜粋を作る見本。
**ページ内で動く関数は import を使えないので、補助関数はその関数の中に書き写す**
（同ファイル `:120-123` のコメントのとおり、重複は意図的）。

### 新チェック追加の統合点（直近の前例: `accessible-authentication-check`, #91）

`motion-actuation-check`（`kind: 'page'`、遷移済み `page` を受ける、CDP を使う）が
最も近い見本。`src/playwright/runMotionActuationCheck.ts:344-438` の runner 本体の形
（`createAuditOutput` → 検査 → `buildAuditResult` → `out.header` / `out.summary` /
`out.issueList` / `out.save` / `out.outputPaths`）をそのまま真似る。

1. `src/types.ts` — `CheckSource` ユニオン（`:21〜`）に `'pointer-gesture-check'` を追加。details 型もここ。
2. `src/constants.ts` — 新定数。Motion 系定数は `:766-786`、`AUTH_*` は `:825〜`。末尾に足す。
3. `src/utils/rule-registry.ts` — `RULES`。`// --- motion-actuation-check ---`（`:274`）と
   `// --- accessible-authentication-check ---`（`:291`）の形を真似て、
   `// --- time-limit-detector ---`（`:335`）の直前に新ブロックを足す。
4. `src/utils/axe-format.ts` — `bucketize(buckets, key, nodes, applicable)`（`:91`）、
   `toNode(el, failureSummary)`（`:126`、`el` は `{ selector, html?, htmlTruncated?, tagName? }`）、
   `pageNode(failureSummary)`（`:138`）。直近の normalizer は
   `normalizeAccessibleAuthenticationCheck`（`:773-854`、要素単位の node を `toNode` で作る見本）。
   新 normalizer はその直後（`normalizeTimeLimitDetector` `:856` の前）に置く。
5. `src/index.ts` — axe-format の export リストに normalizer を追加（`normalizeMotionActuationCheck` の隣）。
6. `src/playwright/index.ts` — runner と Options 型の export（`cdpEventListeners` は export しない）。
7. `src/schemas/index.ts` — `buildEnvelopeSchema` で schema を作り（見本:
   `MOTION_ACTUATION_CHECK_RESULT_SCHEMA` `:969`、`ACCESSIBLE_AUTHENTICATION_CHECK_RESULT_SCHEMA` `:1204`）、
   `RESULT_SCHEMAS`（`:1306`）に登録。schema は `additionalProperties: false` を使わない方針（`:7`）。
8. `src/cli.ts` — `CHECK_REGISTRY`（`:66〜`）の末尾、`accessible-authentication-check`（`:246-257`）の後ろ:

   ```ts
   {
     name: 'accessible-authentication-check',
     kind: 'page',
     async run({ page, outputDir }) {
       const { runAccessibleAuthenticationCheck } =
         await import('./playwright/runAccessibleAuthenticationCheck.js');
       return (await runAccessibleAuthenticationCheck({
         page,
         outputDir,
       })) as AuditResultEnvelope;
     },
   },
   ```
9. `src/test-entries/pointer-gesture-check.ts`（新規）— `src/test-entries/motion-actuation-check.ts` と同形。
10. `packages/a11y-audit/package.json` — `exports` に `./test-entries/pointer-gesture-check`
    （`:108-110` の accessible-authentication と同形）、`description`（`:4`）の列挙末尾に `pointer gestures`。
11. テスト:
    - `test/helpers/fixtures.ts` の `buildRunnerRegistry`（`:125-128` が accessible-authentication、
      `kind: 'page-current'`）に追加。
    - `test/fixture-gallery.spec.ts` の MANIFEST（motion の見本 `:317-336`）。冒頭コメント
      「all 16 checks」→「all 17 checks」、「all 28 custom finding-capable rules」→「all 30」。
    - `test/rule-classification.spec.ts` の `FINDING_EXPECTATIONS`（`:105-106` が motion）。
    - `test/schema-validation.spec.ts`。
    - テストは `../dist/...` から import する（`pretest` が build する）。
      新しい spec の見本は `test/motion-actuation.spec.ts`（`runFixtureCheck` を包む小さな関数を
      冒頭に置き、テスト名は日本語で「条件・操作・結果」）と `test/cdp-event-listeners.spec.ts`。
12. ドキュメント（日本語が正、英語を同期）:
    - `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表（`:127` が accessible-authentication）。
    - `skills/auditing-wcag/references/coverage-matrix.ja.md` / `.md`: `:51` が 2.5.1 行、`:55` が 2.5.7 行
      （今は `| 2.5.1 | インタラクティブ | 操作ログ | 複雑ジェスチャ必須でFail |` /
      `| 2.5.1 | Interactive | logs | Fail if complex gestures required |`）。`:86〜104` が
      「基準 × チェック名 × 出力」表（`:99` が 2.5.4）。
    - `skills/auditing-wcag/references/interactive-checks.ja.md` / `.md`: 「ポインター」表
      （`:91-96`。2.5.4 / 2.5.7 / 2.5.8 の行はあるが **2.5.1 の行は無い**）、
      `### \`motion-actuation-check\` CLIチェック`（`:98`）の後、`### \`target-size-check\``（`:107`）の前。
    - `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表（ja `:30` が motion）、
      runner ごとの段落（ja `:52` が motion）、チェック名一覧（ja `:185-201`）、
      test entry の「他にも」列挙（ja `:450-452`）。
    - `packages/a11y-audit/TODO-COVERAGE.md`（日本語のみ）: 2.5.4 の節（`:137〜`）の書式、
      末尾の対応表（`:258` が 2.5.4）。2.5.1 / 2.5.7 の節は今は無い。
    - `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` には `### Fixed` しか無い。`### Added` を足す。

### CI

`.github/workflows/ci.yml:108-118` が
`dist/cli.js --url file://.../cli-smoke.html --checks all` を実行し、`Errors: +0` を要求する。
`cli-smoke.html` には drag / pointer / touch / `addEventListener` の記述が無い（`git grep` で 0 件）ので、
本チェックは両ルールとも inapplicable で終わるはず（Step 7 で確認）。

## Commands you will need

リポジトリルートで実行する（worktree では `npm --prefix <worktree> run <script>`）。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| 新 spec だけ | `npm test --workspace @a11y-skills/audit -- test/pointer-gesture.spec.ts test/cdp-event-listeners.spec.ts` | all pass |
| 全テスト | `npm test` | all pass |
| チェック一覧 | `node packages/a11y-audit/dist/cli.js --list-checks` | 末尾が `pointer-gesture-check` |
| 整形 | `npx prettier --write <path>` | exit 0 |
| 全体検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/playwright/runPointerGestureCheck.ts`、`src/test-entries/pointer-gesture-check.ts`、
  `test/pointer-gesture.spec.ts`、`test/fixtures/pages/event-listeners/subtree.html`、
  `test/fixtures/pages/pointer-gesture/*.html`（Step 5 の一覧）
- 編集（**追加のみ**）: `src/playwright/cdpEventListeners.ts`（メソッド 2 つと型 1 つを追加。
  既存の `forExpression` / `forEach` / `terminateExecution` / `close` と `EventListenerRecord` は変えない）、
  `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、`src/utils/axe-format.ts`、
  `src/index.ts`、`src/playwright/index.ts`、`src/schemas/index.ts`、`src/cli.ts`、
  `packages/a11y-audit/package.json`（`exports` と `description` のみ）、
  `test/cdp-event-listeners.spec.ts`（テスト追加のみ）、`test/helpers/fixtures.ts`、
  `test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、`test/schema-validation.spec.ts`
- ドキュメント: 統合点 12 のファイル

**Out of scope**（触らない）:

- 既存チェックの runner・normalizer・schema・rule（`withTimeout` を共通化したくなっても
  `runAccessibleAuthenticationCheck.ts` は触らず、新 runner にローカルで書き写す）
- `test/fixtures/pages/event-listeners/listeners.html`（既存テストが要素数に依存している）
- 実際にドラッグ・スワイプを再現して DOM の変化を測ること（Maintenance notes の follow-up）
- iframe の中の要素
- `package.json` の `version`、プラグイン 4 フィールドの version（リリース PR で別途）
- `.github/workflows/`

## Git workflow

- ブランチ: `feat/pointer-gesture-check`
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`。例: `git log` の
  `feat(a11y-audit): add accessible-authentication-check for WCAG 3.3.8 candidates (#91)`）:
  1. `feat(a11y-audit): list subtree event listeners in the CDP inspector`
  2. `feat(a11y-audit): add pointer gesture types, constants and rules`
  3. `feat(a11y-audit): add pointer gesture normalizer and schema`
  4. `feat(a11y-audit): add pointer gesture runner (2.5.1 / 2.5.7)`
  5. `feat(a11y-audit): register pointer-gesture-check in CLI and exports`
  6. `test(a11y-audit): add pointer gesture specs and fixtures`
  7. `docs: document pointer-gesture-check (2.5.1 / 2.5.7)`
- 公開リポジトリなので、コミットされる文面に下流の利用者のツール名・サービス名を書かない
  （「downstream consumer」と書く）。
- push・PR 作成はオペレーターの指示があるときだけ。

## 設計

### 何を候補にするか（判断の根拠）

| シグナル `kind` | 拾い方 | 2.5.1 | 2.5.7 | 理由 |
|---|---|:-:|:-:|---|
| `draggable-attribute` | `getAttribute('draggable') === 'true'`（明示した属性だけ。`<img>` / `<a href>` が既定でドラッグできるのは数えない） | | ✓ | HTML のドラッグ＆ドロップの部品 |
| `drag-listener` | 要素に `dragstart` か `drop` の listener | | ✓ | ドラッグ元・ドロップ先 |
| `move-listener` | 同じ要素に「押す」listener（`pointerdown` / `mousedown` / `touchstart`）**と**「動かす」listener（`pointermove` / `mousemove` / `touchmove`）の両方 | ✓ | ✓ | ドラッグもスワイプ（軌跡）も「押して動かす」で作る。**動かす listener だけ**（ツールチップなどの hover 効果に多い）は候補にしない |
| `multipoint-listener` | `gesturestart` / `gesturechange` の listener、または `touchstart` / `touchmove` の `handlerPreview` が `POINTER_GESTURE_MULTIPOINT_PATTERN` に一致 | ✓ | | 複数の指を前提にする処理 |
| `widget-slider` | `[role="slider"]:not(input)` | | ✓ | 自作スライダーはつまみのドラッグが主操作になりがち。ネイティブの `<input type="range">` はキーボードと溝のクリックで動くので対象外 |
| `widget-sortable` | 並べ替えライブラリのしるし（定数 `POINTER_GESTURE_WIDGET_HINTS`） | | ✓ | 並べ替えのリスト |
| `widget-carousel` | カルーセルのしるし | ✓ | | スワイプでの送り |
| `widget-map` | 地図のしるし（埋め込み iframe を含む） | ✓ | ✓ | ピンチ・ドラッグでの移動 |

ページ全体（`window` / `document`）の listener は要素に帰属できないので扱いを分ける:

- `window` / `document` の `gesturestart` / `gesturechange`、および `touchstart` / `touchmove` で
  `handlerPreview` が複数の指のパターンに一致するもの → 2.5.1 のページ単位 node（`target: ['html']`）。
- `window` / `document` の `dragstart` / `drop` → 2.5.7 のページ単位 node。
- `window` / `document` の `pointermove` / `mousemove` / `touchmove` など → `details.pageListeners` に
  記録するだけで node にしない（解析ツールや hover 効果で非常に多く、候補にすると全ページが incomplete になる）。

**イベントの委譲先（delegation root）**: React 17 以降などは、アプリの根の要素（例 `#root`）に
あらゆる種類のイベントの listener をまとめて付ける。これを候補にすると React のページは
すべて候補になってしまう。そこで、**付いている listener の種類（`type` の重複なし）が
`POINTER_GESTURE_DELEGATION_MIN_TYPES`（20）以上の要素・`document`・`window`** は
`details.delegationRoots` に記録するだけにし、候補・ページ単位 node の材料から外す。
（その結果、委譲で作られたドラッグ UI は listener からは拾えない。属性と部品のしるしからは拾える。
これは既知の制限として文書に書く。）

### A. 共通モジュールへの追加（`src/playwright/cdpEventListeners.ts`）

既存のコードは変えず、型 1 つとメソッド 2 つを足す。ファイル先頭コメントの Notes に 1 行
（「`forSubtree` uses `depth: -1, pierce: true`; `collectNodes` uses `DOM.resolveNode`, which
works without `DOM.enable`.」）を足す。

```ts
/** A listener found under a node, with the node it is attached to. */
export interface SubtreeEventListenerRecord extends EventListenerRecord {
  /** CDP backendNodeId of the node the listener is on; valid for this inspector only. */
  backendNodeId: number;
}

// EventListenerInspector に追加:
  /**
   * Listeners on the node `expression` evaluates to and all of its descendants,
   * including open shadow roots and same-origin iframes
   * (DOMDebugger.getEventListeners with depth -1 and pierce). One CDP call, so
   * it scales to large documents, unlike forEach. `types` filters as in
   * forExpression. Listeners without a backendNodeId are dropped.
   */
  forSubtree(
    expression: string,
    types?: readonly string[],
  ): Promise<SubtreeEventListenerRecord[]>;
  /**
   * Stores the nodes for `backendNodeIds` in a new array at window[key] of the
   * main frame, and returns, for each id in order, its index in that array, or
   * -1 when the node could not be resolved or belongs to another frame.
   * The caller deletes window[key] when done.
   */
  collectNodes(
    backendNodeIds: readonly number[],
    key: string,
  ): Promise<number[]>;
```

実装の要点:

- `forSubtree`: `evaluateToObject(session, expression)` → `session.send('DOMDebugger.getEventListeners',
  { objectId, depth: -1, pierce: true, objectGroup: GROUP })`。Playwright の型に `objectGroup` が無いので、
  既存の `listenersOf`（`:80-82`）と同じく `as { objectId: string; depth: number; pierce: boolean }` で渡す。
  記録への変換は `listenersOf` の `.map` と同じ（`handlerPreview` の切り詰めも同じ）に
  `backendNodeId: l.backendNodeId` を足す。`l.backendNodeId === undefined` の listener は捨てる。
  **既存の `listenersOf` は変えない**（重複する数行は、変換を小さな関数 `toRecord(l)` に切り出して
  両方から呼ぶ形にしてよい。その場合も既存 2 メソッドの返り値は 1 バイトも変えないこと）。
- `collectNodes`:
  1. `Runtime.evaluate({ expression: \`window[${JSON.stringify(key)}] = []\` })`
  2. 各 id について `DOM.resolveNode({ backendNodeId: id, objectGroup: GROUP })` →
     `Runtime.callFunctionOn({ objectId, functionDeclaration, arguments: [{ value: key }], returnByValue: true })`。
     `functionDeclaration` は
     `'function (key) { if (window !== window.top) return -1; return window[key].push(this) - 1; }'`。
     関数はノードが属するフレームの世界で動くので、iframe 内のノードでは `window !== window.top` になり
     -1 を返す（iframe の `window[key]` は無いので、先に判定すること）。
  3. どちらかの send が throw したら、その id は -1 にして続ける。戻り値が number でなければ -1。
- `Debugger.enable` / `DOM.enable` は呼ばない（既存の方針どおり）。

### B. 型（`src/types.ts`）

```ts
export type PointerGestureSignalKind =
  | 'draggable-attribute'
  | 'drag-listener'
  | 'move-listener'
  | 'multipoint-listener'
  | 'widget-slider'
  | 'widget-sortable'
  | 'widget-carousel'
  | 'widget-map';

export type PointerGestureCriterion = '2.5.1' | '2.5.7';

export interface PointerGestureListenerLocation {
  scriptId: string;
  /** 0-based, as CDP reports them. */
  lineNumber: number;
  columnNumber: number;
  handlerPreview: string | null;
}

export interface PointerGestureSignal {
  kind: PointerGestureSignalKind;
  /**
   * Listener kinds: the event types joined with '+' (e.g. 'pointerdown+pointermove').
   * Widget kinds: the hint selector that matched. 'draggable-attribute': 'draggable="true"'.
   */
  detail: string;
  /** First matching listener for listener kinds; null otherwise. */
  listener: PointerGestureListenerLocation | null;
}

export interface PointerGestureCandidate {
  /** Unique within the document, or within the shadow root for shadow DOM elements. */
  selector: string;
  html: string;
  htmlTruncated: boolean;
  tagName: string;
  role: string | null;
  visible: boolean;
  signals: PointerGestureSignal[];
  /** Criteria this candidate is reported under, in ['2.5.1', '2.5.7'] order. */
  criteria: PointerGestureCriterion[];
}

export interface PointerGesturePageListener extends PointerGestureListenerLocation {
  target: 'window' | 'document';
  type: string;
  multipoint: boolean;
}

export interface PointerGestureDelegationRoot {
  /** 'window', 'document', or the element's selector. */
  selector: string;
  eventTypeCount: number;
}

export interface PointerGestureCheckDetails {
  /** 'failed': CDP was available but inspection threw or timed out. */
  listenerInspection: 'cdp' | 'unsupported' | 'failed';
  inspectionError: string | null;
  candidates: PointerGestureCandidate[];
  /** Candidates found before the POINTER_GESTURE_MAX_CANDIDATES cap. */
  totalCandidates: number;
  /** True when candidates or listener nodes were cut at a cap. */
  truncated: boolean;
  pageListeners: PointerGesturePageListener[];
  delegationRoots: PointerGestureDelegationRoot[];
}

export type PointerGestureCheckResult = AuditCheckResult<PointerGestureCheckDetails>;
```

`AuditCheckResult` は既存の総称型（`MotionActuationCheckResult` の定義と同じ書き方にする）。

### C. 定数（`src/constants.ts` の末尾）

```ts
/** WCAG 2.5.1 / 2.5.7: listener types the pointer gesture check reads. */
export const POINTER_GESTURE_PRESS_TYPES = ['pointerdown', 'mousedown', 'touchstart'] as const;
export const POINTER_GESTURE_MOVE_TYPES = ['pointermove', 'mousemove', 'touchmove'] as const;
export const POINTER_GESTURE_DRAG_TYPES = ['dragstart', 'drop'] as const;
/** Safari gesture events; other browsers never fire them, but listeners still show intent. */
export const POINTER_GESTURE_MULTIPOINT_TYPES = ['gesturestart', 'gesturechange'] as const;
/** Matched against handlerPreview of touchstart / touchmove (first 200 chars only). */
export const POINTER_GESTURE_MULTIPOINT_PATTERN =
  /\btouches\s*\.\s*length|\btouches\s*\[\s*1\s*\]|\btargetTouches\b|\.scale\b/;
/** A node with listeners for at least this many event types is treated as a framework delegation root. */
export const POINTER_GESTURE_DELEGATION_MIN_TYPES = 20;
export const POINTER_GESTURE_MAX_CANDIDATES = 200;
/** Upper bound on nodes resolved through CDP (listener nodes + delegation roots). */
export const POINTER_GESTURE_MAX_LISTENER_NODES = 1_000;
/** Whole listener inspection (window, document, subtree, node collection). */
export const POINTER_GESTURE_INSPECTION_TIMEOUT_MS = 15_000;
export const POINTER_GESTURE_WIDGET_HINTS = [
  { kind: 'widget-slider', selector: '[role="slider"]:not(input)' },
  {
    kind: 'widget-sortable',
    selector:
      '[aria-roledescription="sortable" i], [aria-roledescription="draggable" i], [data-rbd-drag-handle-draggable-id], [data-rfd-drag-handle-draggable-id], .ui-sortable, [data-sortable]',
  },
  {
    kind: 'widget-carousel',
    selector:
      '[aria-roledescription="carousel" i], .swiper, .slick-slider, .splide, .flickity-enabled, .glide, .keen-slider, .embla',
  },
  {
    kind: 'widget-map',
    selector:
      '.leaflet-container, .mapboxgl-map, .maplibregl-map, .gm-style, .ol-viewport, iframe[src*="google.com/maps"], iframe[src*="maps.google."], iframe[src*="openstreetmap.org"]',
  },
] as const;
export const DEFAULT_POINTER_GESTURE_RESULT_FILE = 'pointer-gesture-result.json';
```

正規表現をページ内に渡す必要は無い（照合は Node 側でする）。ヒントの selector はページ内に
`{ kind, selector }[]` のまま渡す（`page.evaluate` の引数は JSON に直せる値ならよい）。

シグナル → 基準の対応（runner 内の定数。normalizer では使わず、`candidate.criteria` を見る）:

```ts
const CRITERIA_BY_SIGNAL: Record<PointerGestureSignalKind, PointerGestureCriterion[]> = {
  'draggable-attribute': ['2.5.7'],
  'drag-listener': ['2.5.7'],
  'move-listener': ['2.5.1', '2.5.7'],
  'multipoint-listener': ['2.5.1'],
  'widget-slider': ['2.5.7'],
  'widget-sortable': ['2.5.7'],
  'widget-carousel': ['2.5.1'],
  'widget-map': ['2.5.1', '2.5.7'],
};
```

### D. ルール（`src/utils/rule-registry.ts`、`// --- time-limit-detector ---` の直前）

```ts
// --- pointer-gesture-check ---
'pointer-gestures': {
  id: 'a11y-skills/pointer-gestures',
  sc: ['2.5.1'],
  tags: ['a11y-skills', 'wcag21a', 'wcag251'],
  impact: 'serious',
  scope: 'node',
  description:
    'Ensure functions that use multipoint or path-based gestures can also be operated with a single pointer without a path',
  help: 'Provide a single-pointer alternative (e.g. buttons) to pinch, swipe and other path-based or multipoint gestures',
  helpUrl: `${UNDERSTANDING}/pointer-gestures.html`,
  // Listeners and widget markup only show a gesture may be used; whether a
  // single-pointer alternative exists, or the gesture is essential, needs a human.
  classification: 'incomplete',
},
'dragging-movements': {
  id: 'a11y-skills/dragging-movements',
  sc: ['2.5.7'],
  tags: ['a11y-skills', 'wcag22aa', 'wcag257'],
  impact: 'serious',
  scope: 'node',
  description:
    'Ensure functions that use dragging can also be operated with a single pointer without dragging',
  help: 'Provide a single-pointer alternative (e.g. buttons or click-to-place) to drag-and-drop, sliders and sortable lists',
  helpUrl: `${UNDERSTANDING}/dragging-movements.html`,
  // Same reason as pointer-gestures: the alternative and the essential
  // exception need a human.
  classification: 'incomplete',
},
```

`UNDERSTANDING` は同ファイルの既存定数。`RuleKey` 型が `RULES` のキーから作られていれば自動で増える
（作られていなければ、motion-actuation の追加でどう足したかを `git show a6b24ff -- packages/a11y-audit/src/utils/rule-registry.ts` で見て同じようにする）。

### E. normalizer（`normalizePointerGestureCheck(details)`、`src/utils/axe-format.ts`）

```ts
export function normalizePointerGestureCheck(details: PointerGestureCheckDetails): NormalizedBuckets
```

- `buckets.checkedNodes = details.candidates.length`。
- 各ルールについて（`'pointer-gestures'` ↔ `'2.5.1'`、`'dragging-movements'` ↔ `'2.5.7'`）:
  1. `nodes` を作る:
     - `listenerInspection !== 'cdp'` なら先頭に `pageNode(...)`:
       `Event listeners could not be inspected (${listenerInspection}${inspectionError ? `: ${inspectionError}` : ''}). Candidates come only from attributes and known widget markup; check drag and gesture interactions manually.`
       （`listenerInspection === 'unsupported'` の文言には `CDP is only available in Chromium` を含める）
     - そのルールの基準を `criteria` に含む候補ごとに `toNode(candidate, summary)`。
       summary は「シグナルの説明を `; ` でつないだもの」+ 末尾の確認依頼。シグナルの説明:
       - `draggable-attribute`: `has draggable="true"`
       - `drag-listener`: `has ${detail} listener(s) at script ${scriptId}, line ${lineNumber + 1}:${columnNumber + 1}`
       - `move-listener`: `has press and move listeners (${detail}) at script …`
       - `multipoint-listener`: `has a listener that looks at multiple touches (${detail}) at script …`
       - `widget-*`: `matches ${kind の後半 (slider / sortable / carousel / map)} markup (${detail})`
       - `visible === false` なら末尾に ` (not visible at load)`
       - 確認依頼: 2.5.1 は `Verify that the same function works with a single pointer without a path (e.g. buttons), unless the gesture is essential.`、
         2.5.7 は `Verify that the same function works with a single pointer without dragging (e.g. buttons or click-to-place), unless dragging is essential.`
       - 1 つの候補の summary には、**そのルールの基準に対応するシグナルだけ**を書く
         （`CRITERIA_BY_SIGNAL` と同じ対応表を axe-format 側にも置く。runner からの import はしない —
         axe-format は playwright 層に依存しないため。表が 2 か所になることをコメントで書く）。
     - ページ単位 node（`pageNode`）: `details.pageListeners` のうち、2.5.1 なら `multipoint === true` のもの、
       2.5.7 なら `type` が `dragstart` / `drop` のものごとに 1 つ:
       `${target} has a "${type}" listener (script …)${preview}. Handlers may implement gestures for elements through delegation; ${確認依頼}`
     - `details.truncated` なら末尾に `pageNode('Only the first ${POINTER_GESTURE_MAX_CANDIDATES} of ${totalCandidates} candidates were recorded.')`
       を **両ルールに** 1 つ（そのルールの node が他に 1 つ以上あるときだけ）。
  2. `applicable = nodes.length > 0`（候補が無ければ inapplicable。2.5.4 と同じ考え方:
     対象の部品が見つからない）。
  3. `bucketize(buckets, key, nodes, applicable)`。

### F. runner（`src/playwright/runPointerGestureCheck.ts`）

```ts
export interface RunPointerGestureCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
}
export async function runPointerGestureCheck(options: RunPointerGestureCheckOptions): Promise<PointerGestureCheckResult>;
```

ファイル先頭のコメントに目的と Limitations（Maintenance notes の「既知の制限」）を列挙する
（`runMotionActuationCheck.ts:1-25` の書き方）。ページの状態は変えない（イベントを送らない。
一時的な `window` のプロパティは必ず消す）。

手順:

1. `const url = page.url()`。`createAuditOutput({ ...location, defaultFile: DEFAULT_POINTER_GESTURE_RESULT_FILE })`。
2. `openEventListenerInspector(page)` を try/catch で開く（throw したら `listenerInspection: 'failed'`、
   `inspectionError` に 1 行目 200 文字まで）。`null` なら `'unsupported'`。
3. inspector があれば、次の 3a〜3d を **まとめて** `withTimeout(…, POINTER_GESTURE_INSPECTION_TIMEOUT_MS)` で包む
   （`withTimeout` は `runAccessibleAuthenticationCheck.ts:358-365` をこのファイルに書き写す）。
   throw / timeout なら `listenerInspection: 'failed'`、`inspectionError` に文言、listener 由来の
   シグナル・`pageListeners`・`delegationRoots` は空のまま 4 へ（属性と部品のしるしは 4 で拾う）。
   - 3a. `forExpression('window')` と `forExpression('document')`（型の絞り込みなし）。
   - 3b. `forSubtree('document.documentElement')`（型の絞り込みなし。委譲先の判定に全種類が要る）。
   - 3c. 集計（Node 側）:
     - `window` / `document` / 各 `backendNodeId` ごとに `type` の集合を作る。集合の大きさが
       `POINTER_GESTURE_DELEGATION_MIN_TYPES` 以上なら委譲先。`window` / `document` は
       `delegationRoots` に `{ selector: 'window' | 'document', eventTypeCount }` で入れ、以降の材料から外す。
     - 委譲先でない `window` / `document` の listener のうち、PRESS / MOVE / DRAG / MULTIPOINT のどれかの型を
       `pageListeners` に入れる（`multipoint` は MULTIPOINT の型、または `touchstart` / `touchmove` で
       `handlerPreview` が `POINTER_GESTURE_MULTIPOINT_PATTERN` に一致）。
     - 委譲先でないノードごとに、設計の表に従ってシグナルを作る（`drag-listener`: DRAG の型があれば 1 つ、
       `detail` は見つかった型を定数の順に `+` でつなぐ。`move-listener`: PRESS と MOVE の両方があれば 1 つ、
       `detail` は両方の型を定数の順で。`multipoint-listener`: 上と同じ判定。`listener` は該当した最初の listener の場所）。
       シグナルが 1 つも無いノードは捨てる。
     - 解決するノード = 「シグナルのあるノード」+「委譲先のノード」。`backendNodeId` の昇順で
       `POINTER_GESTURE_MAX_LISTENER_NODES` 件まで（超えたら `truncated = true`）。
   - 3d. `const nodesKey = \`__a11yPointerGesture_${randomUUID()}\`` を作り、
     `inspector.collectNodes(ids, nodesKey)` で番号を得る（-1 のノードは捨てる＝iframe 内か解決できない）。
4. `page.evaluate(scanPointerGestures, args)` を 1 回呼ぶ（**`finally` で `nodesKey` を delete** する
   `page.evaluate` を必ず呼ぶ。3 が失敗して `collectNodes` を呼んでいなければ不要）。`args`:
   `{ nodesKey: string | null, nodeSignals: { index: number; signals: PointerGestureSignal[] }[], delegationIndices: number[],
   hints: POINTER_GESTURE_WIDGET_HINTS, htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH, maxCandidates: POINTER_GESTURE_MAX_CANDIDATES }`。
   ページ内の処理:
   - `getUniqueSelector` / `safeOuterHTML` / `isVisible` を `runAccessibleAuthenticationCheck.ts` から書き写す。
     ただし `getUniqueSelector` は shadow root の中の要素で `document.body` にたどり着かないので、
     `element.getRootNode()` が `ShadowRoot` なら、その shadow root の中で一意な selector
     （親をたどって shadow root の直下で止める）を返すように直す。
   - `Map<Element, { signals: PointerGestureSignal[] }>` を作る。
     `nodeSignals` は `window[nodesKey][index]` の要素に足す（`Element` でなければ捨てる）。
     `document.querySelectorAll('[draggable="true"]')` の各要素に `{ kind: 'draggable-attribute', detail: 'draggable="true"', listener: null }`。
     ヒントごとに `querySelectorAll(hint.selector)` の各要素に `{ kind: hint.kind, detail: hint.selector, listener: null }`
     （selector が不正で throw しても、そのヒントだけ飛ばす）。
   - 委譲先: `delegationIndices` の要素の selector を返す（`delegationRoots` に `eventTypeCount` と合わせて Node 側で入れる）。
   - 要素を文書順（`a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING` で並べる。
     shadow 内の要素同士・shadow 内外の比較もこの関数で順序が付く）に並べ、`totalCandidates` を数え、
     先頭 `maxCandidates` 件だけ `{ selector, html, htmlTruncated, tagName, role: getAttribute('role'), visible, signals }` にする。
   - `criteria` は Node 側で `CRITERIA_BY_SIGNAL` から作る（重複を除き `['2.5.1', '2.5.7']` の順）。
5. `inspector` は `finally` で `withTimeout(inspector.close(), 1_000).catch(() => {})` で閉じる。
6. `buildAuditResult({ source: 'pointer-gesture-check', url, details, buckets: normalizePointerGestureCheck(details) })`。
7. `out.header('Pointer Gesture Check Results', 'WCAG 2.5.1 / 2.5.7', result.url)`、
   `out.summary({ 'Listener inspection': …, Candidates: details.candidates.length, 'Delegation roots': details.delegationRoots.length })`、
   `out.issueList('Pointer Gesture Candidates', details.candidates, (c, i) => [\`${i + 1}. ${c.selector} [${c.criteria.join(', ')}] ${c.signals.map((s) => s.kind).join(', ')}\`])`、
   `out.save(result)`、`out.outputPaths()`。

### G. schema（`POINTER_GESTURE_CHECK_RESULT_SCHEMA`）

`buildEnvelopeSchema({ id: 'pointer-gesture-check-result', title: 'PointerGestureCheckResult', source: 'pointer-gesture-check', details: {...} })`。
details の `required` は型の全フィールド。`listenerInspection` / `signals[].kind` / `criteria[]` /
`pageListeners[].target` は `enum`、`inspectionError` / `role` / `handlerPreview` は `['string', 'null']`、
`signals[].listener` は `oneOf`（null か、場所のオブジェクト）でなく `type: ['object', 'null']` + `properties`
（既存 schema に合わせる。迷ったら `MOTION_ACTUATION_CHECK_RESULT_SCHEMA` の書き方に従う）。
`RESULT_SCHEMAS` に `'pointer-gesture-check'` で登録。

## Steps

### Step 0: Drift check

冒頭の drift check を実行。ブランチ `feat/pointer-gesture-check` を `main` から切る。

### Step 1: 共通モジュールの拡張（テスト先行）

1. `test/fixtures/pages/event-listeners/subtree.html` を作る（冒頭の HTML コメントに意図）:
   - `<div id="map">` に `pointermove`（`function onMove(e) {}`）
   - `<ul id="list">` に `dragstart`
   - `<div id="host">` に open shadow root、その中の `<span id="inner">` に `touchmove`
   - `<iframe id="frame" srcdoc="<div id='in-frame'>x</div><script>document.getElementById('in-frame').addEventListener('pointerdown', () => {})</script>">`
   - `<button id="b">` に `click`
2. `test/cdp-event-listeners.spec.ts` の末尾にテストを足し、build して失敗する
   （`forSubtree is not a function`）ことを確かめる:
   - `forSubtree('document.documentElement', ['pointermove'])` が 1 件で `handlerPreview` に `onMove` を含み、`backendNodeId` が number
   - `forSubtree('document.documentElement', ['touchmove'])` が 1 件（shadow root の中も取れる）
   - `forSubtree('document.documentElement')` の結果を `collectNodes(ids, key)` に渡し、`#map` の番号の
     `window[key][i].id === 'map'` になる（`page.evaluate` で確かめる）
   - iframe 内の `pointerdown` の `backendNodeId` を `collectNodes` に渡すと `-1`
   - 既存のテストは変えない
3. 設計 A どおりに実装し、spec を通す。

**Verify**: `npm test --workspace @a11y-skills/audit -- test/cdp-event-listeners.spec.ts` → 既存 + 新規すべて pass。
iframe 内の listener が `forSubtree` に出てこない場合は、そのテストを「出てこない」に直して進んでよい
（`collectNodes` の -1 経路は他の方法で確かめる必要は無い）。shadow root の中が取れない場合は STOP。

### Step 2: 型・定数・ルール

設計 B・C・D を追加。**Verify**: `npm run typecheck` → exit 0。

### Step 3: normalizer・schema・export

設計 E・G。`src/index.ts` の axe-format export に `normalizePointerGestureCheck` を足す。
**Verify**: `npm run build --workspace @a11y-skills/audit` → exit 0。

### Step 4: normalizer の単体テスト（テスト先行で書いてから Step 3 を直してもよい）

`test/pointer-gesture.spec.ts` を作り、`normalizePointerGestureCheck` を `../dist/index.js` から import して、
手で組んだ details で確かめる（ブラウザ不要）。1 テスト 1 振る舞い:

- `listenerInspection: 'unsupported'`・候補 0 → 両ルールが incomplete、node は `target: ['html']` で文言に `Chromium` を含む
- `move-listener` だけの候補 1 つ → 両ルールが incomplete、2.5.1 の summary に `single pointer without a path`、2.5.7 の summary に `without dragging`
- `draggable-attribute` だけの候補 → `a11y-skills/dragging-movements` が incomplete、`a11y-skills/pointer-gestures` が inapplicable
- `widget-carousel` だけの候補 → pointer-gestures が incomplete、dragging-movements が inapplicable
- `multipoint: true` の `pageListeners` 1 件・候補 0 → pointer-gestures にページ単位 node 1 つ、dragging-movements は inapplicable
- `pageListeners` が `mousemove` だけ・候補 0 → 両ルール inapplicable
- `truncated: true`・`totalCandidates: 250` → 両ルールの node に `Only the first 200 of 250` を含む

### Step 5: フィクスチャと runner（テスト先行）

`test/fixtures/pages/pointer-gesture/` に作る。各ファイル冒頭の HTML コメントに意図と期待結果を書く。

| ファイル | 中身 | 期待 |
|---|---|---|
| `sortable.html` | `<ul id="tasks">` に `dragstart` と `drop`、`<li draggable="true">` が 3 つ、各 `li` に「上へ」「下へ」ボタン | dragging-movements incomplete。候補に `#tasks`（`drag-listener`、detail `dragstart+drop`）と `li` 3 つ（`draggable-attribute`）。pointer-gestures inapplicable |
| `custom-slider.html` | `<div role="slider" tabindex="0" aria-valuenow="50" id="thumb">` に `pointerdown` と `pointermove` | 候補 `#thumb` のシグナルが `widget-slider` と `move-listener`、`criteria` が `['2.5.1', '2.5.7']`。両ルール incomplete |
| `pinch-zoom.html` | `<div id="photo">` に `touchstart`（handler の先頭で `if (e.touches.length > 1) { … }`） | pointer-gestures incomplete、候補 `#photo` のシグナルが `multipoint-listener` だけ。dragging-movements inapplicable |
| `carousel.html` | `<section aria-roledescription="carousel">`、listener なし | pointer-gestures incomplete（`widget-carousel`）。dragging-movements inapplicable |
| `hover-only.html` | `<div id="tip">` に `mousemove` だけ | 候補 0、両ルール inapplicable |
| `delegation-root.html` | `<div id="root">` に 25 種類の型（`click`, `keydown`, `pointerdown`, `pointermove`, `dragstart`, … を配列で回して `addEventListener`） | 候補 0、両ルール inapplicable、`delegationRoots` が `[{ selector: '#root', eventTypeCount: 25 }]` |
| `document-pinch.html` | `document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) {} })` だけ | pointer-gestures incomplete（node の target が `html`）、`pageListeners[0].multipoint === true` |
| `shadow.html` | open shadow root の中の `<div id="swipe">` に `touchstart` と `touchmove` | 候補 1 つ（`move-listener`）、`selector` が `#swipe` |
| `iframe.html` | 同一オリジンの `<iframe srcdoc>` の中の要素にだけ `pointerdown` + `pointermove` | 候補 0、両ルール inapplicable |
| `many.html` | スクリプトで `<div draggable="true">` を 250 個作る | `candidates.length === 200`、`totalCandidates === 250`、`truncated === true` |
| `none.html` | `<input type="range">` と `click` だけのボタン | 候補 0、両ルール inapplicable |

`test/pointer-gesture.spec.ts` に、`runFixtureCheck('pointer-gesture-check', 'pointer-gesture/<file>', …)` を包む
`runPointerGesture(fixture, context, baseUrl)` を置き（`test/motion-actuation.spec.ts:23-36` と同形）、
上の表の期待を 1 テスト 1 振る舞いで書く。加えて:

- 全フィクスチャの結果が `RESULT_SCHEMAS['pointer-gesture-check']` に valid（フィクスチャごとに 1 テスト、
  または `test.describe` 内のパラメータ化。テスト本体に分岐・ループを書かない）
- チェック後に `window` に `__a11yPointerGesture_` で始まるプロパティが残っていない（`sortable.html`）

次に runner を設計 F で実装し、`src/playwright/index.ts` に export、`src/cli.ts` の `CHECK_REGISTRY` 末尾に
`kind: 'page'` のエントリ（accessible-authentication と同形）、`src/test-entries/pointer-gesture-check.ts`、
`package.json` の `exports` / `description`、`test/helpers/fixtures.ts` の `buildRunnerRegistry` に
`kind: 'page-current'` で登録。

**Verify**: `npm test --workspace @a11y-skills/audit -- test/pointer-gesture.spec.ts` → all pass。
`node packages/a11y-audit/dist/cli.js --list-checks` の末尾が `pointer-gesture-check`。

### Step 6: 大きなページでの時間

`test/pointer-gesture.spec.ts` に「span 5000 個すべてに `pointerdown` と `pointermove` を付けた
ページ（`page.setContent` で作ってよい）でチェックが 20 秒以内に終わり、`truncated === true`」の
テストを 1 つ足す（テストの timeout は 60 秒。計画時の実測では `forSubtree` 1 回は約 40ms だが、
`collectNodes` は 1 ノードごとに CDP を 2 回呼ぶので、上限 1000 ノード分の時間がかかる）。
**Verify**: そのテストが pass。20 秒を超える場合は STOP（`collectNodes` の 1 件ずつの CDP 呼び出しが
遅い。上限値の調整か一括化かは設計判断）。

### Step 7: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/claude-pg-all > /tmp/claude-pg-all.log 2>&1; echo "exit=$?"
grep -E "pointer-gesture-check|Errors:" /tmp/claude-pg-all.log
# 期待: [pointer-gesture-check] DONE ...、Errors: 0、exit=1（axe 由来）
```

満たせなければ STOP。

### Step 8: 既存テストの更新

- `test/fixture-gallery.spec.ts`: MANIFEST に 3 件（`custom-slider.html` → 両ルール `'incomplete'`、
  `carousel.html` → `'a11y-skills/pointer-gestures': 'incomplete'` と `'a11y-skills/dragging-movements': 'inapplicable'`、
  `none.html` → 両ルール `'inapplicable'`）。冒頭コメントを `all 17 checks` / `all 30 custom finding-capable rules` に。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に 2 件（両ルール `expectedBucket: 'incomplete'`）。
- `test/schema-validation.spec.ts`: 手組み details（候補 1・ページ listener 1・委譲先 1 の例と、
  `listenerInspection: 'unsupported'` の例）が valid。

**Verify**: `npm test` → 全 green。

### Step 9: ドキュメント

日本語を先に書き、英語を同期する（AGENTS.md の方針）。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表の末尾に:
  `| \`pointer-gesture-check\` | 2.5.1, 2.5.7 | ドラッグ・スワイプ・複数の指の操作で動きそうな部品（候補。要確認） |`
  / `| \`pointer-gesture-check\` | 2.5.1, 2.5.7 | Components likely operated by dragging, swiping or multiple fingers (candidates; needs review) |`
- `coverage-matrix.ja.md` / `.md`:
  - `:51` を `| 2.5.1 | インタラクティブ+自動の候補 | \`pointer-gesture-check\` **[CLI]** + 操作ログ | 複雑ジェスチャ必須でFail |`
    （EN: `| 2.5.1 | Interactive + automated candidates | \`pointer-gesture-check\` **[CLI]** + logs | Fail if complex gestures required |`）
  - `:55` を同様に（Fail 条件は今の文言のまま）
  - 出力の表で 2.5.4 の行の直後に `| 2.5.1, 2.5.7 | \`pointer-gesture-check\` | \`pointer-gesture-result.json\` |`
- `interactive-checks.ja.md` / `.md`:
  - 「ポインター」表の 2.5.4 行の前に 2.5.1 行:
    `| 2.5.1 | ピンチ・スワイプなど複数の指や軌跡の操作に、1 点の操作の代わりがあるか | 操作ログ | 複数の指・軌跡でしか操作できない |`
    / `| 2.5.1 | Pinch, swipe and other multipoint / path-based gestures have a single-pointer alternative | logs | Operable only by multipoint or path-based gestures |`
  - `motion-actuation-check` の節の後に `### \`pointer-gesture-check\` CLIチェック`（EN: `CLI Check`）。
    中身は 4 点程度の箇条書き: 何を拾うか（設計の表を 1 行ずつ縮めて）／委譲先と hover だけの要素は
    候補にしない理由／候補はすべて `incomplete` で、代わりの操作と例外は人が確かめる／
    実行: `npx -y @a11y-skills/audit --url "<url>" --checks pointer-gesture-check`
- `packages/a11y-audit/README.ja.md` / `README.md`: 検査一覧表に
  `runPointerGestureCheck | 2.5.1 ポインタのジェスチャ / 2.5.7 ドラッグ動作（ドラッグ・スワイプ・複数の指で動きそうな部品。候補として報告）`、
  runner の段落（遷移済み `page` を受ける。CDP は Chromium のみで、それ以外は属性と部品のしるしだけ。
  イベントは送らずページの状態を変えない）、チェック名一覧の末尾、test entry の「他にも」列挙の末尾。
- `packages/a11y-audit/TODO-COVERAGE.md`: 2.5.4 の節の前に `### 2.5.1 Pointer Gestures / 2.5.7 Dragging Movements - **部分実装** ✅`
  を 2.5.4 の節の書式（概要／実装／残る制限）で、末尾の対応表に 2 行。
- `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` に `### Added` を作り（`### Fixed` の前）、
  新チェック・2 ルール・`cdpEventListeners` の `forSubtree` / `collectNodes`（内部）・既知の制限を書く。
  0.12.0 の Added の書き方に合わせる。**`package.json` の version は変えない**。

**Verify**: `npm run validate:skills && npm run lint && npm run format:check` → exit 0。

### Step 10: 全体検証とコミット

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
を通し、Git workflow のとおりコミット。`plans/README.md` のステータス行を更新。

## Test plan

- **`test/cdp-event-listeners.spec.ts`**（追加）: `forSubtree` が子孫・shadow root の listener を
  `backendNodeId` 付きで返す、`collectNodes` が要素を `window[key]` に並べる、iframe 内は -1。
- **`test/pointer-gesture.spec.ts`**（新規）: normalizer の単体 7 件（Step 4）、フィクスチャ 11 件の
  期待（Step 5 の表）、schema の valid、一時プロパティの後片付け、大きなページの時間（Step 6）。
- **fixture-gallery / rule-classification / schema-validation**: 既存の枠組みに登録（Step 8）。
- **CI**: `--checks all` スモークが新チェックを自動で通す（Step 7）。

## Done criteria

ALL must hold:

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` exit 0
- [ ] `node packages/a11y-audit/dist/cli.js --list-checks` の末尾が `pointer-gesture-check`
- [ ] Step 7 のスモークで `[pointer-gesture-check] DONE`、`Errors: 0`、exit 1
- [ ] `git diff main -- packages/a11y-audit/src/playwright/run*.ts` に既存 runner の差分がない（新規ファイルのみ）
- [ ] `git diff main -- packages/a11y-audit/src/playwright/cdpEventListeners.ts` が追加のみで、既存の
      `test/cdp-event-listeners.spec.ts` のテストが変更なしで pass
- [ ] `git grep -n cdpEventListeners -- packages/a11y-audit/src/index.ts packages/a11y-audit/src/playwright/index.ts` が 0 件
- [ ] 日英ドキュメントがペアで更新されている（SKILL / coverage-matrix / interactive-checks / README）
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更
- [ ] `plans/README.md` のステータス行を更新

## STOP conditions

- 既存チェックの挙動・型・schema・rule、または `cdpEventListeners.ts` の既存メソッドの返り値を
  変えなければならなくなった
- `forSubtree` が open shadow root の中の listener を返さない（計画時の実測と違う）
- `DOM.resolveNode` が `DOM.enable` なしで失敗する（計画時の実測と違う。`DOM.enable` を呼ぶかは設計判断）
- Step 6 で 5000 要素のページが 20 秒以内に終わらない
- Step 7 で `--checks all` が ERROR・ハング・exit 2 になる
- いずれかのフィクスチャでチェックがハングする
- `delegation-root.html` 以外の普通のフィクスチャで要素が委譲先と判定される
  （しきい値 20 が低すぎる。値の変更は設計判断）
- schema 検証・lint・format・既存テストのいずれかが green にできない

## Maintenance notes

- **既知の制限**（runner 先頭コメント・CHANGELOG・TODO-COVERAGE に書く）:
  - CDP は Chromium のみ。それ以外では listener を見られず、属性と部品のしるしだけで候補を出し、
    両ルールにページ単位の「手で確かめて」node を付ける。
  - 委譲（`document` や、20 種類以上の listener を持つ根の要素に付けて `event.target` で振り分ける）で
    作られたドラッグ・ジェスチャは要素に帰属できず、listener からは拾えない。React などの
    フレームワークのページでは、属性・部品のしるし・委譲していない listener だけが手がかりになる。
  - 押したときに後から `document` へ `pointermove` を付ける実装（よくあるドラッグの作り方）は、
    押す listener が要素にあれば `move-listener` にならない（動かす listener が検査時点で無いため）。
    `pointerdown` だけの要素は 2.5.2（#62）の範囲と重なるので、本チェックでは候補にしない。
  - 複数の指の判定は handler の先頭 200 文字の文字列照合。pointer events で `pointerId` を数える
    実装は見分けられない。
  - iframe の中は見ない（地図の埋め込み iframe は、iframe 要素そのものを `widget-map` として拾う）。
  - shadow root の中の候補の `selector` はその shadow root の中で一意な形で、文書全体の selector ではない。
  - 実際にドラッグ・スワイプしてみて、何かが動くかは確かめない。
- **follow-up 候補**（本プランの範囲外）:
  - 候補に `page.mouse` で実際にドラッグ（押す→動かす→離す）を送り、DOM の変化を証跡に添える
    （2.5.4 の合成イベントと同じ考え方。ページの状態を変えるので `simulate` オプションで切れるように）。
  - #62（2.5.2）は `forSubtree` + `collectNodes` をそのまま使える（`pointerdown` / `mousedown` / `touchstart`）。
  - 部品のしるしの selector は、実サイトで外れが見つかるたびに `POINTER_GESTURE_WIDGET_HINTS` に足す。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit` を minor、
  スキル文書が変わるのでプラグインも minor に上げ、4 フィールドを揃える。
- レビュアーは特に、(1) `window[nodesKey]` が成功・失敗どちらの経路でも消されるか、
  (2) `cdpEventListeners.ts` の既存メソッドの返り値が変わっていないか（motion / accessible-authentication の
  テストが通ること）、(3) 2 か所に置いた「シグナル → 基準」の対応表が一致しているか、
  (4) inspector が成功・失敗どちらの経路でも閉じられるか、を見ること。
