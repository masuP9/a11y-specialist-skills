# Plan 018: 文字キーのショートカット (WCAG 2.1.4) チェック — 本文にフォーカスを置いて 1 文字ずつ押す

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/64

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> の本プランのステータス行を更新する（レビュアーが索引を管理すると言った場合を除く）。
>
> **Drift check (run first)**:
> `git diff --stat 4b3077d..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json packages/a11y-audit/README.md packages/a11y-audit/README.ja.md packages/a11y-audit/TODO-COVERAGE.md packages/a11y-audit/CHANGELOG.md skills/auditing-wcag`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比較してから
> 進む。構造的な不一致（`CHECK_REGISTRY` の形・`RULES` の形・`bucketize` /
> `pageNode` のシグネチャ・`buildEnvelopeSchema` のシグネチャ・
> `test/helpers/fixtures.ts` の `buildRunnerRegistry` の形・`EventListenerInspector`
> の形の変化）は STOP。別の新チェック（Issue #65 など）が先にマージされていて、
> 各ファイルの登録表・一覧に**新しい行が増えているだけ**なら構造的な不一致ではない。
> その行の後ろに本チェックを足す（チェック数・ルール数の数え直しを忘れない）。

## Status

- **Priority**: P2
- **Effort**: M（2〜3 日相当。listener の取り出しは既存の `cdpEventListeners.ts` をそのまま使い、
  読み込み直しの流れは `runChangeOnInputCheck.ts` の写しで済む。時間がかかるのは
  「キーで起きた変化」の見分け（ページが自分で起こす DOM の変化との区別）とフィクスチャ）
- **Risk**: LOW〜MEDIUM（新規チェックの追加のみで既存チェックには触れない。実際にキーを
  押すので、ショートカットが送信・削除などを起こすページでは副作用がある。CI の
  `--checks all` スモークが新チェックを必ず通すが、`cli-smoke.html` には `<script>` が無いので
  キーの listener が 0 件 → キーを送らずに inapplicable で終わるはず）
- **Depends on**: なし（Plan 013 の `src/playwright/cdpEventListeners.ts` を使う。完了済み）
- **Category**: feature
- **Planned at**: commit `4b3077d`, 2026-10-13
- **Consumer**: 下流の WCAG テスト管理ツール（関数 API で呼び、`details` を取り込む）。
  評価できていない達成基準の洗い出しで 2.1.4 が挙がった。

## Why this matters

2.1.4（文字キーのショートカット）はいま完全に手動（`coverage-matrix.ja.md:38` で
`インタラクティブ`・「操作ログ」）。修飾キーなしの 1 文字で動くショートカットは、
音声入力の利用者が話した言葉で誤って発火させる典型的な問題だが、どのキーが反応するかは
ページを見ても分からない。

入力欄でない場所（`<body>`）にフォーカスを置いて、印字できる ASCII 文字を 1 つずつ押し、
画面・フォーカス・URL・スクロールの変化を記録すれば、「反応するキー」を数値付きで拾える。
さらに CDP で `window` / `document` / `<html>` / `<body>` に付いたキーの listener を取り出せば、
根拠として添えられる。

ショートカットを止める・変える設定があるか、フォーカスがある部品の中だけで効くかは
人か AI が確かめるので、すべて `incomplete` で返す。これを
**21 個目のチェック `character-key-shortcut-check`（SC 2.1.4）** とする。

### 方針の要点

- **listener が無ければキーを送らない**: フォーカスが `<body>` にあるとき、キーイベントは
  `body → html → document → window` の順にしか届かない。CDP でこの 4 つにキーの listener
  （`keydown` / `keypress` / `keyup`）が 1 つも無いと分かれば、キーを押しても何も反応しないので、
  送らずに inapplicable にする（速い・CI で安全）。React などがルート要素に付ける listener は
  `<body>` から出たイベントでは呼ばれないので、数えなくてよい。
- **反応したら読み込み直す**: Issue のメモのとおり、キーごとには読み込み直さず、変化を見つけた
  ときだけ新しい context で読み込み直す（ショートカットが localStorage に状態を残す場合に備え、
  context ごと作り直す。`runChangeOnInputCheck.ts` と同じ）。
- **ページが自分で起こす変化と区別する**: 最初に何も押さずに同じ時間待って DOM の変化を数え
  （baseline）、キーのあとの変化がそれより明らかに多いときだけ反応とみなす
  （`motion-actuation-check` の `MOTION_MUTATION_MARGIN` と同じ考え方）。

## Current state（統合点 — `4b3077d` で確認済み）

リポジトリは npm workspaces モノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` ビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース。テストは Playwright Test で、**`../dist/...` から import する**
（先に build が要る）。以下のパスは `packages/a11y-audit/` からの相対。

### 見本にするファイル

- **`src/playwright/runChangeOnInputCheck.ts`** — `browser` を受けて自前の context を作り、
  操作して、遷移したら新しい context でやり直す。ここから写すもの:
  - ファイル先頭コメントの書き方（何をページにするか / Limitations の列挙）（:1-40）
  - `ACTION_TIMEOUT_MS`（:95）、`NAVIGATION_ERROR` 正規表現（:102-103。1 行目だけに当てる）
  - ブラウザ内関数 `getUniqueSelector`（:136-155、「Keep in sync」コメント付き）
  - 遷移・新しいウィンドウ・ダイアログの記録（:565-605: `framenavigated`、`context.on('page')`、
    `page.on('dialog')` で `dismiss()`）
  - `attempt` ループと `finally` で context を閉じる形（:560-853）、`abort()` の形（:547-558）
- **`src/playwright/runMotionActuationCheck.ts`** — `openEventListenerInspector(page)` で
  listener を取り出す形（:359-381、`forExpression(target, types)`）と、Chromium 以外では
  `listenerInspection: 'unsupported'` にする形。`finally` で `inspector.close()`。
  DOM の変化を数えて baseline と比べる考え方（`observeMotionWindow` :84-151、
  `describeMotionSimulation` の閾値 `2 * baseline + MOTION_MUTATION_MARGIN`、`axe-format.ts:703` 以降）。
- **`src/playwright/cdpEventListeners.ts`** — `EventListenerInspector.forExpression`（:51-54）。
  `EventListenerRecord`（:25-37）の項目をそのまま details に写す。

### 新チェック追加の統合点（直近の前例: non-text-contrast-check, PR #99）

1. `src/types.ts` — `CheckSource` ユニオン（:21-41、末尾が `'non-text-contrast-check'`）に
   `'character-key-shortcut-check'` を追加。details 型はファイル末尾（:1645 の後ろ）に節を足す。
2. `src/constants.ts` — 末尾（:1037 の後ろ）に節 `// character-key-shortcut-check (WCAG 2.1.4)`。
   既存の `DIALOG_MESSAGE_MAX`（:812）、`HTML_SNIPPET_MAX_LENGTH` を使う。
3. `src/utils/rule-registry.ts` — `RULES` の `// --- non-text-contrast-check ---` の節（:522-552）の後ろ、
   `} as const satisfies ...`（:553）の直前に節を足す。`motion-actuation`（:274-289）が書き方の見本
   （`scope: 'page'`）。
4. `src/utils/axe-format.ts` — `normalizeNonTextContrastCheck`（:1693〜）の後ろ、`normalizeAxeResults`（:1822）の前に
   `normalizeCharacterKeyShortcutCheck`。`normalizeMotionActuationCheck`（:703-735）が書き方の見本
   （`emptyBuckets()` → `bucketize(buckets, key, nodes, applicable)` → `pageNode(summary)`）。
5. `src/index.ts` — axe-format の export リスト（:71 付近に `normalizeNonTextContrastCheck`）に追加。
6. `src/playwright/index.ts` — runner と Options 型の export（:87-89 の `runNonTextContrastCheck` の後ろ）。
7. `src/schemas/index.ts` — `buildEnvelopeSchema` で schema を作り（`NON_TEXT_CONTRAST_CHECK_RESULT_SCHEMA` :1915 の後ろ）、
   `RESULT_SCHEMAS`（:1942〜、末尾 :1963 が `'non-text-contrast-check'`）に登録。
8. `src/cli.ts` — `CHECK_REGISTRY` 末尾（`non-text-contrast-check` の項 :296-307 の後ろ、`];` :308 の前）に、
   `pointer-cancellation-check`（:283-295）と同じ `kind: 'browser'` の項（lazy import、
   `browser` / `targetUrl: url` / `outputDir` を渡す）。
9. `src/test-entries/character-key-shortcut-check.ts`（新規）— `src/test-entries/pointer-cancellation-check.ts` と同形。
10. `package.json` — `exports` に `./test-entries/character-key-shortcut-check`（`non-text-contrast-check` の項
    :125-128 と同形）、`description`（:4）のチェック列挙の末尾に `character key shortcuts`。
11. テスト: `test/helpers/fixtures.ts` の `buildRunnerRegistry`（`non-text-contrast-check` の項 :145-148 の後ろ）に
    `kind: 'browser-navigating'`、`test/fixture-gallery.spec.ts`（`MANIFEST`、冒頭コメント
    「all 20 checks」:2・「all 35 custom finding-capable rules」:13 → 21 / 36）、
    `test/rule-classification.spec.ts`（`FINDING_EXPECTATIONS`）、`test/schema-validation.spec.ts`。
    フィクスチャは `test/fixtures/pages/character-key-shortcut/*.html`。`runFixtureCheck` の呼び方は
    `test/change-on-input.spec.ts` が見本（`browser-navigating` のチェック）。
12. ドキュメント:
    - `README.md` / `README.ja.md`: 検査一覧表（JA :14-36、末尾 :36 が `runNonTextContrastCheck`）、
      「`browser` を受けます」の文（JA :41）、本チェックの段落（JA :182 の `runNonTextContrastCheck` の段落の後ろ）、
      チェック名一覧（JA :255-275 のコードブロック末尾）、冒頭の検査数（JA :6「20 個の検査」→ 21）、
      `createContext` を渡せる検査の列挙（JA :390）、test entry の列挙（JA :524-529）。EN は対応する箇所。
    - `CHANGELOG.md`: `## Unreleased` の `### Added`（既にある）に 1 項目を足す。
    - `TODO-COVERAGE.md`（JA のみ）: 「## 部分的に自動化可能」節の `### 1.4.11 Non-text Contrast`（:263〜）の後ろ、
      `### 2.1.2 No Keyboard Trap`（:283）の前に 2.1.4 の節。「## 実装優先度（案）」の表（:317〜）に 1 行。
    - `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md`: CLI チェック表（JA :131 が末尾の `non-text-contrast-check`）。
    - `skills/auditing-wcag/references/coverage-matrix.ja.md` / `.md`: :38 が 2.1.4 行、:90 前後からの
      「基準 × チェック名 × 出力ファイル」表（SC 順。2.1.4 は 2.1.1 / 2.1.2 の行の後ろ、2.2.x の前）。
    - `skills/auditing-wcag/references/interactive-checks.ja.md` / `.md`: :17 が 2.1.4 行。
      `keyboard-reachability-check` の節（:19-31）の後ろに同じ書式で節を足す。

### CI

`.github/workflows/ci.yml` が `dist/cli.js --url file://.../cli-smoke.html --checks all` を実行し、
exit code 1 と `Errors: 0` を要求する。`cli-smoke.html` は `<img>` と
`<input type="text" id="name-field">` だけで `<script>` は無い（キーの listener 0 件）。

## Commands you will need

リポジトリルートで実行する（worktree では `npm --prefix <worktree> run <script>`）。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| Full test suite | `npm test` | all pass |
| New spec only | `npm test --workspace @a11y-skills/audit -- test/character-key-shortcut.spec.ts` | all pass |
| List checks | `node packages/a11y-audit/dist/cli.js --list-checks` | 末尾が `character-key-shortcut-check` |
| 整形 | `npx prettier --write <path>` | — |
| 全体検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/playwright/runCharacterKeyShortcutCheck.ts`、
  `src/test-entries/character-key-shortcut-check.ts`、
  `test/fixtures/pages/character-key-shortcut/{none,escape-only,toggle-panel,focus-search,navigate,question-mark,prevent-default,autofocus,body-listener,self-mutating,scroll}.html`、
  `test/character-key-shortcut.spec.ts`
- 編集（追加のみ）: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、
  `src/utils/axe-format.ts`、`src/index.ts`、`src/playwright/index.ts`、
  `src/schemas/index.ts`、`src/cli.ts`、`package.json`（`exports` と `description` のみ）、
  `test/helpers/fixtures.ts`、`test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、
  `test/schema-validation.spec.ts`
- ドキュメント: 上記統合点 12 のファイル

**Out of scope**（触らない）:

- 既存チェックの runner・normalizer・schema・rule、`cdpEventListeners.ts`（使うだけで変えない）
- 入力欄・部品にフォーカスがあるときのショートカット（2.1.4 の「フォーカスがあるときだけ有効」の例外に当たるため見ない）
- 修飾キー付きの組み合わせ（Ctrl / Alt / Meta）、Space・矢印・Enter・Escape などの印字しないキー
- iframe の中、`accesskey` 属性（修飾キーが要るので 2.1.4 の対象外）
- ショートカットを止める・変える設定の自動探索
- `package.json` の `version`、プラグイン 4 フィールドの version（リリース PR で別途）
- `.github/workflows/`、`plans/` の他のプラン

## Git workflow

- ブランチ: `feat/character-key-shortcut-check`
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`。`git log` の例:
  `feat(a11y-audit): add non-text-contrast-check for WCAG 1.4.11 candidates (#99)`）:
  1. `feat(a11y-audit): add character key shortcut types, constants, rule, normalizer and schema`
  2. `feat(a11y-audit): add character-key-shortcut-check runner`
  3. `feat(a11y-audit): register character-key-shortcut-check in CLI and exports`
  4. `test(a11y-audit): add character-key-shortcut-check fixtures and specs`
  5. `docs: document character-key-shortcut-check (2.1.4)`
- 公開リポジトリなので、コミットされる文面に下流の利用者のツール名・サービス名を
  書かない（「downstream consumer」と書く）。
- push・PR は指示されたときだけ。PR 本文に `Closes #64`。

## 設計

### A. 全体の流れ（runner）

1. 引数を確かめる（設計 F）。`resolveCreateContext`・`requireTargetUrl`・`createAuditOutput` は
   `runChangeOnInputCheck.ts:521-529` と同じ。
2. **1 回目の読み込み**: context を作り `newPage()`、遷移・新しいウィンドウ・ダイアログの記録を
   付けて（`runChangeOnInputCheck.ts:565-605` の写し）、`gotoAndSettle(page, targetUrl)`。
   `startUrl = page.url()`（結果の `url`）。
3. **listener の取り出し**（1 回目の読み込みでだけ。**自分の listener を入れる前に**行う）:
   `openEventListenerInspector(page)`。null なら `listenerInspection = 'unsupported'`。
   そうでなければ `window`・`document`・`document.documentElement`・`document.body` の順に
   `forExpression(expression, CHARACTER_KEY_EVENT_TYPES)` を呼び、`target` を
   `'window' | 'document' | 'html' | 'body'` として details.listeners に写す。
   `document.body` が null のページでは `forExpression` が投げるので、その対象だけ飛ばす
   （`try` で囲み、`body` が無いと分かる場合のみ握りつぶす。ほかの例外は外へ出す）。
   取り出したら `inspector.close()`（`finally`）。キーを押す間は CDP を使わない。
4. **キーを送るかの判断**:
   - `listenerInspection === 'cdp'` かつ listener が 0 件 → `keyProbe = 'skipped-no-listeners'`。
     キーを送らずに結果を作る（context を閉じて設計 E へ）。
   - それ以外（listener がある、または Chromium 以外で分からない）→ `keyProbe = 'ran'`。
5. **観察の準備**（読み込みのたびに）: ブラウザ内関数 `installObserver(stateKey)` を `page.evaluate`。
   `window[stateKey] = { mutations: 0, prevented: null }` を作り、
   - `MutationObserver` を `document.documentElement` に（`childList` / `attributes` / `characterData` / `subtree`）。
     コールバックで `mutations += records.length`。
   - `window.addEventListener('keydown', e => { state.prevented = e.defaultPrevented; })`（bubble 段階。
     先に登録されたページの listener のあとに呼ばれる）。
   `stateKey` は `` `__a11yCharKey_${randomUUID()}` ``（`runMotionActuationCheck.ts:238` と同じ作り方）。
6. **baseline**（1 回目の読み込みでだけ）: 状態を 0 に戻し、`settleMs` 待ち、`mutations` を読んで
   `baselineDomMutations` に入れる（何も押さずにページが自分で起こす変化の量）。
7. **キーごとに**（`keys` の順。設計 C）:
   1. 時間の上限を確かめる。超えていれば `abort('timeout')`（残りのキーを `untested` に `reason: 'timeout'` で入れる）。
   2. フォーカスを `<body>` に置く: ブラウザ内で `document.activeElement` が `body` / `html` / null 以外なら
      `(document.activeElement as HTMLElement).blur()`。それでも `body` 以外なら、そのキーを
      `untested` に `reason: 'focus-not-on-body'` で入れて次へ（自分でフォーカスを取り返す要素があるページ）。
   3. 記録を消す（遷移・新しいウィンドウ・ダイアログ）。ブラウザ内の状態を `{ mutations: 0, prevented: null }` に戻し、
      `scrollX` / `scrollY` と `page.url()` を控える。
   4. `page.keyboard.press(key)` → `page.waitForTimeout(settleMs)`。
   5. 開いた新しいウィンドウの読み込みを待って閉じる（`runChangeOnInputCheck.ts:721` の `Promise.all(pendingPopups)`）。
   6. ブラウザ内関数 `readReaction(stateKey)` を `page.evaluate`: `{ mutations, prevented, scrollX, scrollY, focusedSelector }`。
      `focusedSelector` は `document.activeElement` が `body` / `html` / null でなければ `getUniqueSelector` の結果、
      それ以外は null。evaluate が `NAVIGATION_ERROR` で失敗したら遷移とみなす。
   7. 反応（設計 B）をまとめる。1 つでもあれば `reacted` に `{ key, reactions }` を足す。
   8. **読み込み直すか**: 反応の種類が `'default-prevented'` だけなら読み込み直さない。それ以外の反応があれば、
      `reloads >= maxReloads` なら `abort('reload-limit')`（残りのキーを `untested` に `reason: 'reload-limit'`）。
      そうでなければ `reloads += 1`、context を閉じて手順 2 と同じく新しい context で読み込み、手順 5 をやり直す
      （baseline は取り直さない）。読み込み直しが例外で失敗したら `abort('reload-failed')`。
8. context はチェック全体の `finally` で閉じる（`runChangeOnInputCheck.ts:851-853` と同じ）。

### B. 反応の種類と判定

| `kind` | 判定 | 読み込み直す |
|---|---|---|
| `navigation` | main frame の `framenavigated` が 1 件以上（`#` だけの変化も含む）、または URL が変わった、または evaluate が `NAVIGATION_ERROR` で失敗 | する |
| `new-window` | `context.on('page')` で新しいページ | する |
| `dialog` | `page.on('dialog')`（`dismiss()` する） | する |
| `focus-moved` | `focusedSelector !== null` | する |
| `dom-change` | `mutations > 0 && (baseline === 0 ? true : mutations >= 2 * baseline + CHARACTER_KEY_MUTATION_MARGIN)` | する |
| `scroll` | `scrollX` / `scrollY` のどちらかが 1px 以上変わった | する |
| `default-prevented` | `prevented === true` で、上のどれも無い | しない |

`navigation` があるときは、ほかの項目（DOM の変化など）は読めないので記録しない。

### C. 送るキー（`src/constants.ts`）

```ts
// ---------------------------------------------------------------------------
// character-key-shortcut-check (WCAG 2.1.4)
// ---------------------------------------------------------------------------

/** Events a single-character shortcut is bound to. */
export const CHARACTER_KEY_EVENT_TYPES = ['keydown', 'keypress', 'keyup'] as const;
/**
 * Keys pressed one at a time with focus on <body>: printable ASCII except
 * space (letters, digits, punctuation and symbols; `?` and other shifted
 * symbols are included because they produce a single character).
 */
export const CHARACTER_KEY_SHORTCUT_KEYS: readonly string[] = Array.from(
  { length: 0x7e - 0x21 + 1 },
  (_, i) => String.fromCharCode(0x21 + i),
);
/** Wait after each key for a reaction to surface. */
export const CHARACTER_KEY_SHORTCUT_SETTLE_MS = 100;
export const CHARACTER_KEY_SHORTCUT_TIMEOUT_MS = 60_000;
/** Reloads after a key caused a change, before giving up on the remaining keys. */
export const CHARACTER_KEY_SHORTCUT_MAX_RELOADS = 30;
/** Same idea as MOTION_MUTATION_MARGIN: DOM changes must clearly exceed the page's own. */
export const CHARACTER_KEY_MUTATION_MARGIN = 3;
export const DEFAULT_CHARACTER_KEY_SHORTCUT_RESULT_FILE =
  'character-key-shortcut-result.json';
```

既定で 94 キー × 100ms ≈ 10 秒（反応が無いページ）。大文字は `page.keyboard.press('A')` で
`key: 'A'` が届くことを Step 3 のテストで確かめる（届かなければ STOP）。

### D. 型（`src/types.ts`、末尾に節 `// Character Key Shortcut Check (WCAG 2.1.4)`）

```ts
export type CharacterKeyEventType = 'keydown' | 'keypress' | 'keyup';

export interface CharacterKeyListener {
  /** Where the listener is; key events from <body> reach only these four. */
  target: 'window' | 'document' | 'html' | 'body';
  type: CharacterKeyEventType;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  scriptId: string;
  /** 0-based, as CDP reports them. */
  lineNumber: number;
  columnNumber: number;
  handlerPreview: string | null;
}

export type CharacterKeyReaction =
  | { kind: 'navigation'; toUrl: string }
  | { kind: 'new-window'; url: string }
  | { kind: 'dialog'; dialogType: string; message: string }
  | { kind: 'focus-moved'; toSelector: string }
  | { kind: 'dom-change'; mutations: number }
  | { kind: 'scroll'; dx: number; dy: number }
  | { kind: 'default-prevented' };

export interface CharacterKeyResult {
  key: string;
  reactions: CharacterKeyReaction[];
}

export interface CharacterKeyShortcutCheckDetails {
  /** 'unsupported' outside Chromium: keys are pressed without knowing the listeners. */
  listenerInspection: 'cdp' | 'unsupported';
  listeners: CharacterKeyListener[];
  /** 'skipped-no-listeners': CDP found no key listener that a key pressed on <body> can reach. */
  keyProbe: 'ran' | 'skipped-no-listeners';
  /** Keys pressed, in order. */
  keysTried: string[];
  /** Keys that caused at least one reaction, in the order pressed. */
  reacted: CharacterKeyResult[];
  untested: { key: string; reason: 'timeout' | 'reload-limit' | 'reload-failed' | 'focus-not-on-body' }[];
  /** DOM changes over `settleMs` with no key pressed; null when keys were not sent. */
  baselineDomMutations: number | null;
  reloads: number;
  aborted: { reason: 'timeout' | 'reload-limit' | 'reload-failed'; url: string } | null;
}

export type CharacterKeyShortcutCheckResult =
  AuditCheckResult<CharacterKeyShortcutCheckDetails>;
```

`CheckSource` に `'character-key-shortcut-check'`。

### E. ルール（`src/utils/rule-registry.ts`、`// --- character-key-shortcut-check ---`）

| key | id | classification | scope | impact |
|-----|----|----|----|----|
| `character-key-shortcut` | `a11y-skills/character-key-shortcut` | `incomplete` | page | `serious` |

`sc: ['2.1.4']`、`tags: ['a11y-skills', 'wcag21a', 'wcag214']`、
`helpUrl: \`${UNDERSTANDING}/character-key-shortcuts.html\``、
description `'Ensure single character key shortcuts can be turned off, remapped, or are active only on focus'`、
help `'Let users turn off or remap single-key shortcuts, or limit them to when the component has focus'`。
コメント: 反応したことは観察できるが、止める・変える設定があるか、フォーカスがあるときだけ効くかは人が確かめる。

### F. runner `runCharacterKeyShortcutCheck`

```ts
export interface RunCharacterKeyShortcutCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Defaults to the TEST_PAGE environment variable. */
  targetUrl?: string;
  /** Options for the contexts created from `browser` (ignored with `createContext`). */
  contextOptions?: BrowserContextOptions;
  /** Wait after each key (default: CHARACTER_KEY_SHORTCUT_SETTLE_MS). */
  settleMs?: number;
  /** Wall-clock budget for the whole check (default: CHARACTER_KEY_SHORTCUT_TIMEOUT_MS). */
  timeBudgetMs?: number;
  /** Keys to press, each a single printable non-space character (default: CHARACTER_KEY_SHORTCUT_KEYS). */
  keys?: readonly string[];
  /** Reloads after a reacting key (default: CHARACTER_KEY_SHORTCUT_MAX_RELOADS). 0 stops at the first reacting key. */
  maxReloads?: number;
}
```

- 先頭で `assertWalkLimits({ timeBudgetMs })`、`settleMs` は `runChangeOnInputCheck.ts:508-514` と同じ確かめ方。
  `keys` は空でない配列で、各要素が 1 文字（`[...k].length === 1`）かつ `/^[\x21-\x7e]$/` に当たらなければ `Error`
  （修飾キー付きや `'Enter'` のような名前を誤って渡させない）。重複は除く。
  `maxReloads` は 0 以上の整数でなければ `Error`。
- `buildAuditResult({ source: 'character-key-shortcut-check', url: startUrl, details, buckets: normalizeCharacterKeyShortcutCheck(details) })` →
  `out.save(result)` → `out.header('Character Key Shortcut Check', 'WCAG 2.1.4', startUrl)` →
  `out.summary({ 'Listener inspection', 'Key listeners', 'Keys tried', 'Keys with reactions', Reloads })` →
  `out.outputPaths()`（`runChangeOnInputCheck.ts:835-850` と同じ流れ）。
- ファイル先頭コメントに Limitations（Maintenance notes の既知の制限）を列挙。

### G. normalizer（`normalizeCharacterKeyShortcutCheck`）

`checkedNodes` は既存の normalizer に合わせる（`normalizeMotionActuationCheck` を見て同じ数え方にする）。

- `keyProbe === 'skipped-no-listeners'` → node なし、`applicable = false`（inapplicable）。
- それ以外は `applicable = true`。node（すべて `pageNode`）:
  - `reacted` 1 件ごとに
    `` `Pressing "${key}" with focus on the page body ${describeReactions(reactions)}. ${evidence} Verify that this shortcut can be turned off or remapped to use a modifier key, or is active only while a component has focus.` ``
    - `describeReactions`: 種類ごとの句を `; ` でつなぐ。`navigation` → `` `navigated to ${toUrl}` ``、
      `new-window` → `` `opened a new window (${url})` ``、`dialog` → `` `opened a ${dialogType} dialog` ``、
      `focus-moved` → `` `moved focus to ${toSelector}` ``、`dom-change` → `` `changed the DOM (${mutations} mutations)` ``、
      `scroll` → `` `scrolled the page (${dx}, ${dy})` ``、
      `default-prevented` → `called preventDefault() without a visible change`。
    - `evidence`: listener があれば `` `Key listeners: ${list}.` ``（`list` は
      `` `${target} "${type}" (script ${scriptId}, line ${lineNumber + 1}:${columnNumber + 1})` `` を `, ` でつなぐ。
      最大 5 件、残りは `and N more`）。`listenerInspection === 'unsupported'` なら `Key listeners could not be inspected (CDP is only available in Chromium).`
  - `untested` が 1 件以上 → pageNode
    `` `${untested.length} key(s) were not tried (${reasons}): ${keys}. Check them manually.` ``
    （`reasons` は理由の種類を `, ` でつなぐ。`keys` は最大 20 文字、残りは `…`）。
  - `listenerInspection === 'unsupported'` かつ `reacted` が 0 件 → node なし（passes）。キーは実際に押していて、
    Playwright のキー入力は信頼済み（`isTrusted: true`）のイベントなので、反応が無いことは根拠になる。
- `reacted` も `untested` も 0 件で `keyProbe === 'ran'` → passes（listener はあったが、どのキーにも反応しなかった。
  Escape だけを見る listener はよくある）。

### H. schema

`CHARACTER_KEY_SHORTCUT_CHECK_RESULT_SCHEMA` を `buildEnvelopeSchema` で作る。details の `required` は型の全フィールド。
`listenerInspection` / `keyProbe` / `target` / `type` / `untested[].reason` / `aborted.reason` は `enum`。
`reactions` の各要素は `kind` の `enum` と、種類ごとの項目を `oneOf` で書く（既存の `CHANGE_ON_INPUT_CHECK_RESULT_SCHEMA` の
`changes` の書き方に合わせる。無ければ `kind` の `enum` + 全項目を任意にした 1 つの object でよい）。
`baselineDomMutations` は `['integer', 'null']`、`handlerPreview` は `['string', 'null']`、
`aborted` は `MOTION_ACTUATION` / `CHANGE_ON_INPUT` の `aborted` の書き方に合わせる。
`RESULT_SCHEMAS` に `'character-key-shortcut-check'` で登録。

## Steps

### Step 0: Drift check

冒頭の drift check を実行。別の新チェックが先にマージ済みなら、Current state の行番号は
ずれている前提で、各ファイルの「末尾の登録」の位置を探し直す。

### Step 1: 型・定数・ルール・normalizer・schema

設計 C・D・E・G・H。`src/index.ts` の axe-format export に `normalizeCharacterKeyShortcutCheck`。
normalizer の単体テストは Step 2 のフィクスチャのテストと Step 4 の schema テストで兼ねる
（既存の normalizer も同じ扱い）。

**Verify**: `npm run typecheck` → exit 0、build → exit 0。

### Step 2: フィクスチャとブラウザのテスト（テスト先行）

`test/fixtures/pages/character-key-shortcut/` に作る。各ファイル冒頭の HTML コメントに意図と期待結果。
**テストでは速さのため `keys` を小さく渡す**（既定の 94 キーで回すのは `none.html` と `escape-only.html` だけ）。

| フィクスチャ | 中身 | 期待 |
|---|---|---|
| `none.html` | 段落だけ。`<script>` なし | `listeners` が空、`keyProbe === 'skipped-no-listeners'`、`keysTried` が空、inapplicable、1 秒以内 |
| `escape-only.html` | `document` の `keydown` で `e.key === 'Escape'` のときだけ要素を消す | `listeners` に `document` / `keydown`、`keysTried.length === 94`、`reacted` が空、passes |
| `toggle-panel.html` | `document` の `keydown` で `k` のときパネルの `hidden` を切り替える | `keys: ['j', 'k']` → `reacted` が `k` だけ、`dom-change`、incomplete、node の summary に `Pressing "k"` と `Key listeners: document "keydown"` |
| `focus-search.html` | `/` で検索欄に `focus()`（`preventDefault` もする。GitHub 風） | `keys: ['/']` → `focus-moved`（`toSelector` が検索欄） |
| `navigate.html` | `g` で `location.assign('none.html')`、`h` でパネルを表示 | `keys: ['g', 'h']` → `g` が `navigation`、`h` が `dom-change`、`reloads === 1`、`result.url` が元の URL |
| `question-mark.html` | `keydown` で `e.key === '?'` のときヘルプを表示。`A`（大文字）でも別の要素を表示 | `keys: ['?', 'A', 'a']` → `?` と `A` が反応、`a` は反応なし |
| `prevent-default.html` | `window` の `keydown` で `x` のとき `preventDefault()` だけ | `keys: ['x']` → `reactions` が `[{ kind: 'default-prevented' }]`、`reloads === 0` |
| `autofocus.html` | `<input autofocus>` と、`document` の `keydown` で `k` のときパネル表示（入力欄の中では反応しない書き方: `e.target === document.body` のときだけ） | `keys: ['k']` → `k` が反応（runner が blur してから押している） |
| `body-listener.html` | `<body>` に `keydown` の listener だけ（`k` でパネル表示） | `listeners` が `body` 1 件、`k` が反応 |
| `self-mutating.html` | `setInterval` で 50ms ごとに時計の文字を書き換える。`document` の `keydown` は Escape だけ | `keys: ['a', 'b', 'c']` → `reacted` が空（ページ自身の変化を反応とみなさない）、`baselineDomMutations > 0` |
| `scroll.html` | 3000px の高さ。`j` で `window.scrollBy(0, 200)` | `keys: ['j']` → `scroll`（`dy === 200`） |

`test/character-key-shortcut.spec.ts` を先に書き（`helpers/fixtures.js` の `test` / `runFixtureCheck` を使う。
`test/change-on-input.spec.ts` が見本）、上の期待を 1 テスト 1 振る舞いで確かめる。加えて:

- `maxReloads: 0` で `navigate.html`（`keys: ['g', 'h']`）→ `aborted.reason === 'reload-limit'`、
  `untested` が `[{ key: 'h', reason: 'reload-limit' }]`、node が 2 件（`g` と未計測）
- `timeBudgetMs: 1` で `toggle-panel.html` → `aborted.reason === 'timeout'`、`untested` が空でない、incomplete
- `keys: ['Enter']` → `Error`、`keys: []` → `Error`、`keys: ['ab']` → `Error`、`maxReloads: -1` → `Error`
- 全ケースでエンベロープが `RESULT_SCHEMAS['character-key-shortcut-check']` に valid

build して実行し、失敗理由が「runner が無い / 登録が無い」であることを確かめてから Step 3 へ
（Step 3 で `buildRunnerRegistry` に登録するまでは `runFixtureCheck` が見つけられない）。

### Step 3: runner・CLI・test-entry・exports

- `src/playwright/runCharacterKeyShortcutCheck.ts` を設計 A・B・F で実装。
- `src/playwright/index.ts` に runner と Options 型の export。
- `src/cli.ts` の `CHECK_REGISTRY` 末尾に `kind: 'browser'` の項。
- `src/test-entries/character-key-shortcut-check.ts`、`package.json` の `exports` / `description`。
- `test/helpers/fixtures.ts` の `buildRunnerRegistry` に `kind: 'browser-navigating'` で登録。

**Verify**: build → Step 2 の spec が green。`node packages/a11y-audit/dist/cli.js --list-checks` の末尾が
`character-key-shortcut-check`。

### Step 4: 既存テストの更新

- `test/fixture-gallery.spec.ts`: MANIFEST に `toggle-panel.html`（`'a11y-skills/character-key-shortcut': 'incomplete'`）、
  `escape-only.html`（`'passes'`）、`none.html`（`'inapplicable'`。MANIFEST がこの値を書けない形なら省く）。
  `toggle-panel.html` は既定の 94 キーで回ることになるので、時間がかかりすぎるなら MANIFEST の仕組みで
  オプションを渡せるか確かめ、渡せなければ `escape-only.html` と同じく既定のまま（10 秒程度）でよい。
  冒頭コメントを 21 checks / 36 rules に（他の新チェックが先に入っていれば数え直す）。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に 1 ルール分。
- `test/schema-validation.spec.ts`: 手組み details（listener 2 件、反応 7 種すべて、untested 1 件、`aborted` あり・なし、
  `listenerInspection: 'unsupported'`）が valid。

**Verify**: `npm test` → 全 green。

### Step 5: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/claude-cks-all > /tmp/claude-cks-all.log 2>&1; echo "exit=$?"
grep -E "character-key-shortcut-check|Errors:" /tmp/claude-cks-all.log
# 期待: [character-key-shortcut-check] DONE ...、Errors: 0、exit=1（axe 由来）
```

`character-key-shortcut-result.json` の `details.keyProbe` が `'skipped-no-listeners'` であることも確かめる。
満たせなければ STOP。

### Step 6: ドキュメント

日本語を先に書き、英語を同期する。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表の末尾に 1 行:
  `| \`character-key-shortcut-check\` | 2.1.4 | 本文にフォーカスを置いて 1 文字ずつ押し、画面・フォーカス・URL・スクロールが変わったキー（候補。要確認） |`
  / `| ... | 2.1.4 | Keys that change the page, focus, URL or scroll position when pressed one at a time with focus on the page body (candidates; needs review) |`
- `coverage-matrix.ja.md` / `.md` の 2.1.4 行（:38）を
  `インタラクティブ+自動の候補 | \`character-key-shortcut-check\` **[CLI]** + 操作ログ | 単一キー回避不可でFail`
  （EN: `Interactive + automated candidates | \`character-key-shortcut-check\` **[CLI]** + interaction log | Fail if single-key shortcuts cannot be avoided`。
  EN の既存の文言に合わせる）に。「基準 × チェック名 × 出力ファイル」表に SC 順で
  `| 2.1.4 | \`character-key-shortcut-check\` | \`character-key-shortcut-result.json\` |`。
- `interactive-checks.ja.md` / `.md`: `keyboard-reachability-check` の節の書式で
  「`character-key-shortcut-check` CLI チェック」節（自動で見るもの / 実際にキーを押す副作用 /
  反応したキーについて人が確かめること: 止める・変える設定、フォーカスがあるときだけ有効か）。2.1.4 行（:17）の根拠欄に
  `character-key-shortcut-check` を足す。
- `packages/a11y-audit/TODO-COVERAGE.md`（JA のみ）: 1.4.11 の節の後に「### 2.1.4 Character Key Shortcuts - **部分実装** ✅」
  （1.4.11 の節の書式で、実装・見ているもの・制限）、「実装優先度（案）」の表に 1 行。
- `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表に
  `runCharacterKeyShortcutCheck | 2.1.4 文字キーのショートカット（本文で 1 文字ずつ押して反応したキー。候補として報告）`、
  「`browser` を受けます」の文と `createContext` を渡せる検査の列挙に `runCharacterKeyShortcutCheck` を追加、
  冒頭の検査数を 21 に、チェック名一覧と test entry の列挙に追記、
  一覧表の下の段落群の末尾に段落（何を押すか、listener が無ければ押さない、反応したら新しい context で読み込み直す、
  `keys` / `maxReloads` / `timeBudgetMs`、listener は CDP で取り出すので Chromium のみ、既知の制限）。
- `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` の `### Added` に新チェック・ルール・既知の制限。
  **`package.json` の version は変えない**。

**Verify**: `npm run validate:skills && npm run lint && npm run format:check` → exit 0。

### Step 7: 全体検証とコミット

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
を通し、Git workflow のとおりコミット。`plans/README.md` に本プランの行を足す。

## Test plan

- **`test/character-key-shortcut.spec.ts`**: 11 フィクスチャで、listener の取り出し（4 つの対象）、
  キーを送らない判断、反応 7 種の検出、ページ自身の変化との区別、読み込み直しと続き、上限・時間切れ・
  引数の誤りを検証。schema も確かめる。
- **fixture-gallery / rule-classification / schema-validation**: 既存の枠組みに登録。
- **CI**: `--checks all` スモークが新チェックを自動で通す（Step 5）。

## Done criteria

ALL must hold:

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` exit 0
- [ ] `node packages/a11y-audit/dist/cli.js --list-checks` の末尾が `character-key-shortcut-check`
- [ ] Step 5 のスモークで `[character-key-shortcut-check] DONE`、`Errors: 0`、exit 1、`keyProbe === 'skipped-no-listeners'`
- [ ] `git diff --stat main -- packages/a11y-audit/src/playwright/cdpEventListeners.ts packages/a11y-audit/src/playwright/runChangeOnInputCheck.ts packages/a11y-audit/src/playwright/runMotionActuationCheck.ts` が空（既存のファイルは未変更）
- [ ] `git diff main -- packages/a11y-audit/src/types.ts` に削除行（`-` で始まる行、ヘッダーを除く）が無い
- [ ] 日英ドキュメントがペアで更新されている（SKILL / coverage-matrix / interactive-checks / README）
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更
- [ ] `plans/README.md` に本プランの行がある

## STOP conditions

- 既存チェックの挙動・型・schema・rule、または `cdpEventListeners.ts` を変えなければならなくなった
- headless Chromium で `page.keyboard.press(key)` を `<body>` にフォーカスがある状態で押しても、
  `document` の `keydown` listener に `e.key === key` で届かない（`?` と大文字 `A` を含む。設計 C の前提が崩れる）
- `self-mutating.html` で `reacted` が空にならない、または CI と手元で結果が変わる（baseline の比べ方が成り立たない）
- `blur()` のあとも `document.activeElement` が `<body>` にならないのが `autofocus.html` で起きる
- Step 5 で `--checks all` が ERROR・ハング・exit 2 になる、または `keyProbe` が `'ran'` になる
- いずれかのフィクスチャでチェックがハングする
- schema 検証・lint・format・既存テストのいずれかが green にできない

## Maintenance notes

- **既知の制限**（runner 先頭コメント・README・CHANGELOG に記載）:
  - フォーカスが `<body>` にあるときだけ押す。部品にフォーカスがあるときだけ効くショートカットは
    2.1.4 の例外に当たるので見ない。入力欄の中では効かないよう書かれたショートカットは正しく拾える。
  - アプリ全体を包む要素に付けた keydown（例: React の `<div onKeyDown>` でアプリを包む）は、
    フォーカスがその中のリンクやボタンにあるときだけ効き、`<body>` からは届かないので見落とす。
    React 17 以降は `#root` にほぼ全種類のイベントの listener を付けるため、CDP の listener でも区別できない。
  - 押すのは印字できる ASCII の 94 文字だけ（Space・日本語入力・ほかの配列の文字は押さない）。
  - listener は `window` / `document` / `<html>` / `<body>` の 4 つだけを CDP で見る（Chromium のみ）。
    最初の操作のあとで付く listener は見つからない。Chromium では、この 4 つに listener が無ければキーを送らない。
  - 反応は「遷移・新しいウィンドウ・ダイアログ・フォーカスの移動・DOM の変化・スクロール・preventDefault」で見る。
    canvas にだけ描くページ、音を鳴らすだけのページ、`settleMs` より後に起きる変化は拾えない。
  - ページが自分で DOM を書き換え続けると（時計・カルーセル）、キーで起きた小さな変化を見落とすことがある。
  - `preventDefault()` の記録は、ページが `window` に後から付けた listener や、`stopPropagation()` で
    `window` まで届かないイベントでは取れない。
  - 状態によって効いたり効かなかったりするショートカット（一覧が表示されているときだけ等）は、読み込み直後の状態でしか見ない。
  - 実際にキーを押すので、ショートカットが削除・送信などをするページでは副作用がある。`keys` で押すキーを絞れる。
  - ページのスクリプトが戻らない（無限ループ）場合は打ち切れない（`keyboard-reachability-check` と同じ）。
- **閾値の調整**: `CHARACTER_KEY_MUTATION_MARGIN`・`CHARACTER_KEY_SHORTCUT_SETTLE_MS` は実際のサイトで
  見落とし・誤検出が多ければ変える。変えるときは `self-mutating.html` のテストも見直す。
- **後回しにしたもの**（2026-10-13 にユーザーと合意。まず `<body>` だけで出す）:
  - **2 か所目のフォーカス位置**: `<body>` に加えて、アプリの中の普通のリンクかボタン 1 つ（listbox・menu・tree・grid・
    tablist・toolbar など、文字キーで項目を選ぶのが正しい部品の中のものは除く）にフォーカスを置いて同じキーを押す。
    上の「アプリ全体を包む要素の keydown」を拾うため。CDP で事前に絞れないので毎回押す（反応が無いページで約 10 秒 → 約 20 秒）。
    `cli-smoke.html` にはリンクもボタンも無いので CI には影響しない。別 Issue にして足す。
  - iframe の中、ショートカットを止める設定の自動探索、
  キーの組み合わせの連続（`g` → `i` のような 2 打鍵のショートカット。1 打目でだけ反応しないものは見落とす）。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit` を minor、
  スキル文書が変わるのでプラグインも minor に上げ、4 フィールドを揃える。
- レビュアーは特に、(1) context と CDP の接続が成功・失敗どちらの経路でも閉じられるか、(2) 自分の listener を
  入れる前に listener を取り出しているか（自分の listener を数えていないか）、(3) 遷移したときに例外が外へ漏れず
  それまでの記録が残るか、(4) 読み込み直したあと、続きのキーから再開しているか、を見ること。
