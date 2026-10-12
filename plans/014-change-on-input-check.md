# Plan 014: 入力時 (WCAG 3.2.2) チェック — 値を変えただけで文脈が変わるか

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/61

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> にこのプランのステータス行を追加する（無ければ「Plan index」相当の節を作らず、
> 末尾に 1 行で足す）。
>
> **Drift check (run first)**:
> `git diff --stat a6b24ff..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json skills/auditing-wcag .github/workflows/ci.yml`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比較してから
> 進む。構造的な不一致（`CHECK_REGISTRY` の形・`RULES` の形・`bucketize` /
> `pageNode` のシグネチャ・`buildEnvelopeSchema` のシグネチャ・
> `resolveCreateContext` / `requireTargetUrl` / `assertWalkLimits` の変化）は STOP。

## Status

- **Codex plan review**: 未実施

- **Priority**: P2
- **Effort**: M（2〜3 日相当。値の変え方を欄の種類ごとに分けるのと、移動後のやり直しが中心）
- **Risk**: MEDIUM（新規チェックのみで既存チェックには触れないが、ページの値を実際に
  変えるので、対象ページによっては自動保存などの通信が起きる。CI の `--checks all`
  スモークが新チェックを必ず通り、`cli-smoke.html` には `<input type="text" id="name-field">`
  が 1 つあるので、ここで ERROR・ハングを起こすと CI が落ちる）
- **Depends on**: なし
- **Category**: feature
- **Planned at**: commit `a6b24ff`, 2026-10-13
- **Consumer**: 下流の WCAG テスト管理ツール（関数 API で呼び、`details` を取り込む）。
  評価できていない達成基準の洗い出しで 3.2.2 が挙がった。

## Why this matters

3.2.2（入力時）は現在すべて手動（`coverage-matrix` の 3.2.2 行は `インタラクティブ` /
`DOM差分`）。select を選んだだけでページが移動する、チェックボックスを入れただけで
別ウィンドウが開く、といった実装は、検査する人が全部の欄を触らない限り見落とす。
欄の値を 1 つずつ変えて「移動・新しいウィンドウ・フォーカスの移動・ダイアログ」が
起きたかを記録できれば、手動確認の対象をその欄だけに絞れる。

3.2.1（オンフォーカス）では `runFocusIndicatorCheck` が「Tab ごとに主フレームの移動を
見張り、移動したら新しい context で開き直して原因の要素を飛ばして続ける」作りをすでに
持っている。本チェックは**同じ見張り方とやり直し方**を、Tab の代わりに「値の変更」で行う。

前もって説明がある場合（「選ぶとすぐ移動します」等）は適合なので、自動では違反と
決められない。見つかったものは `incomplete`（要確認）で返し、説明の有無は人か AI が見る。

## Current state（統合点 — `a6b24ff` で確認済み）

リポジトリは npm workspaces モノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` ビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース。

### 使い回す 3.2.1 の仕組み（`src/playwright/runFocusIndicatorCheck.ts`）

- `:282-286` — `resolveCreateContext({ browser, createContext }, contextOptions)` と
  `requireTargetUrl(targetUrlOption)`（どちらも `src/utils/test-harness.ts:257` / `:279`）。
- `:348-353` — やり直しのループ。1 回ごとに `context = await newContext()` →
  `context.newPage()`。`context` はループの外で持ち、`finally` で必ず閉じる。
- `:361-366` — `page.on('framenavigated', ...)` で主フレームの移動を記録
  （`frame === page.mainFrame()` のときだけ）。初回の `gotoAndSettle` の後で
  記録をリセット（`:503`）。
- `:571-626` — 操作の後 `navigationSettleMs` 待ち、URL の差か `framenavigated` の記録で
  移動を判定。原因の要素の selector を `skipSelectors` に入れ、ループを抜けて
  新しい context でやり直す。上限は `MAX_RETRIES`（`:111`）。
- `src/playwright/runKeyboardReachabilityCheck.ts:875-901` — `page.evaluate` が
  `Execution context was destroyed|Frame was detached` で失敗したら移動とみなす書き方。

### 新チェック追加の統合点（直近の前例: motion-actuation-check, #89）

`browser` を受けて自分で開くチェックの見本は `keyboard-reachability-check`。

1. `src/types.ts` — `CheckSource` ユニオンに追加。details 型もここ。
2. `src/constants.ts` — 新定数（`DEFAULT_NAVIGATION_SETTLE_MS` は既存）。
3. `src/utils/rule-registry.ts` — `RULES` に追加。3.2.1 の `'no-context-change-on-focus'`（`:57-69`）が
   兄弟ルール、直近の追加は `'motion-actuation'`（`:260`〜）。
4. `src/utils/axe-format.ts` — `bucketize` / `pageNode` と normalizer。直近は
   `normalizeMotionActuationCheck`。
5. `src/index.ts` — axe-format の export リストに normalizer を追加。
6. `src/playwright/index.ts` — runner と Options 型の export。
7. `src/schemas/index.ts` — `buildEnvelopeSchema` で schema を作り `RESULT_SCHEMAS` に登録。
8. `src/cli.ts` — `CHECK_REGISTRY` 末尾（`motion-actuation-check` の後ろ）に
   `kind: 'browser'` エントリ（`keyboard-reachability-check` と同形、lazy import）。
   ファイル先頭コメントのチェック数も直す。
9. `src/test-entries/change-on-input-check.ts`（新規）— `keyboard-reachability-check.ts` と同形
   （`browser` と `TEST_PAGE` を使う）。
10. `packages/a11y-audit/package.json` — `exports` に `./test-entries/change-on-input-check`、
    `description` のチェック列挙に追記。
11. テスト: `test/helpers/fixtures.ts`（`buildRunnerRegistry` に `kind: 'browser-navigating'`）、
    `test/fixture-gallery.spec.ts`（`MANIFEST` と冒頭コメントの checks / rules の数を +1）、
    `test/rule-classification.spec.ts`（`FINDING_EXPECTATIONS`）、
    `test/schema-validation.spec.ts`。フィクスチャは `test/fixtures/pages/<check>/*.html`。
    テストは `../dist/...` から import する（pretest が build する）。
12. ドキュメント: `packages/a11y-audit/README.md` / `README.ja.md`（検査一覧表、
    チェック名一覧、test entry の列挙、説明の段落）、`CHANGELOG.md`、`TODO-COVERAGE.md`（JA のみ）、
    `skills/auditing-wcag/SKILL.md` / `SKILL.ja.md`（CLI チェック表）、
    `references/coverage-matrix.md` / `.ja.md`（`:64` が 3.2.2 行、「基準 × チェック名 ×
    出力ファイル」表）、`references/interactive-checks.md` / `.ja.md`。

### CI

`.github/workflows/ci.yml` が `dist/cli.js --url file://.../cli-smoke.html --checks all` を
実行し、exit code 1 と `Errors: +0` を要求する。`cli-smoke.html` の `#name-field` には
handler が無いので、本チェックは 1 欄を試して何も起きず `passes` で終わるはず（Step 6 で確認）。

## Commands you will need

リポジトリルートで実行する（worktree では `npm --prefix <worktree> run <script>`）。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| Full test suite | `npm test` | all pass |
| New spec only | `npm test --workspace @a11y-skills/audit -- test/change-on-input.spec.ts` | all pass |
| List checks | `node packages/a11y-audit/dist/cli.js --list-checks` | 末尾が `change-on-input-check` |
| 全体検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/playwright/runChangeOnInputCheck.ts`、`src/test-entries/change-on-input-check.ts`、
  `test/fixtures/pages/change-on-input/*.html`（Step 4）、`test/change-on-input.spec.ts`
- 編集（追加のみ）: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、
  `src/utils/axe-format.ts`、`src/index.ts`、`src/playwright/index.ts`、
  `src/schemas/index.ts`、`src/cli.ts`、`packages/a11y-audit/package.json`
  （`exports` と `description` のみ）、`test/helpers/fixtures.ts`、
  `test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、
  `test/schema-validation.spec.ts`
- ドキュメント: 上記統合点 12 のファイル

**Out of scope**:

- 既存チェックの runner・normalizer・schema・rule（`runFocusIndicatorCheck.ts` から処理を
  切り出して共通化することもしない。必要な数行は新 runner に書く。共通化は 3 つ目の
  利用者ができたとき）
- 「前もって説明があるか」の自動判定
- iframe の中・shadow root の中の欄、`contenteditable`、`type="range" / "color" / "file"`、
  独自部品（`role="combobox"` / `role="listbox"` 等の ARIA だけの部品）
- 値を変えたときの「内容の大きな変化」（DOM の差分量）の判定
- `package.json` の `version`、プラグイン 4 フィールドの version（リリース PR で別途）
- `.github/workflows/`

## Git workflow

- ブランチ: `feat/change-on-input-check`
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`）:
  1. `feat(a11y-audit): add change-on-input types, constants and rule`
  2. `feat(a11y-audit): add change-on-input normalizer and schema`
  3. `feat(a11y-audit): add change-on-input runner (3.2.2)`
  4. `feat(a11y-audit): register change-on-input-check in CLI and exports`
  5. `test(a11y-audit): add change-on-input specs and fixtures`
  6. `docs: document change-on-input-check (3.2.2)`
- 公開リポジトリなので、コミットされる文面に下流の利用者のツール名・サービス名を
  書かない（「downstream consumer」と書く）。

## 設計

### A. 対象の欄

主フレームの文書（light DOM のみ）から、次をページの並び順で集める:

| 種類（`ControlKind`） | 対象 | 値の変え方（Playwright の操作で、本物のイベントを起こす） |
|---|---|---|
| `select` | `<select>`（`multiple` を含む） | 今と違う最初の有効な `<option>` を `locator.selectOption({ index })` |
| `radio` | `<input type="radio">` を **name + form ごとに 1 グループ**として扱う | グループ内で未選択の最初の有効なものを `locator.check()` |
| `checkbox` | `<input type="checkbox">` | `locator.click()`（入/切を反転） |
| `text` | `<textarea>` と、`type` が `text` / `search` / `email` / `tel` / `url` / `number` / `password` / 未指定の `<input>` | `locator.fill(value)` の後、`locator.evaluate(el => el.blur())` で change を起こす |

- 除外: `disabled`、`readonly`、見えない（`checkVisibility()` が false、または幅・高さ 0）、
  `type` が上記以外の `<input>`（`hidden` / `submit` / `date` 等）。select で選べる別の
  option が無いもの、radio で未選択が無いグループも除外（`skippedCount` に数える）。
- `text` の値: `type` ごとに 2 候補を持つ（`email` → `a11y@example.com` / `a11y2@example.com`、
  `tel` → `0123456789` / `0987654321`、`url` → `https://example.com/` / `https://example.org/`、
  `number` → `1` / `2`、その他 → `a11y-test` / `a11y-test2`）。`maxlength` があれば、その長さ
  ちょうどになるよう埋めるか切り詰める（1 候補目は `1`、2 候補目は `2` で埋める。上限に
  達すると次の欄へ移る実装を拾うため）。**現在値と違う最初の候補**を使う。どちらも
  現在値と同じなら（あり得ないが）その欄は `skipped`（`reason: 'value-unchanged'`）。
  定数 `CHANGE_ON_INPUT_TEXT_VALUES`。
- **値が実際に変わったかを確かめる**: 操作の後（`text` は `blur()` の前）に、`value` /
  `checked` / `selectedIndex` が控えた元の値と違うかを見る。同じなら（handler が即座に
  戻した・`number` の `min` などで弾かれた等）その欄は `controlsTested` に数えず
  `skipped`（`reason: 'value-unchanged'`）にする。変更が成立しなかった欄を `passes` に
  吸収しないため。ただしその時点で文脈の変化が記録されていれば、finding を優先する
  （下の B の手順 3 の 5）。
- 欄の識別は `selector`（`runRedundantEntryCheck.ts:197` の `getUniqueSelector(element)` と
  同じ作りのものを runner のページ内関数に書く）。radio グループはグループ内で最初の
  radio の selector を代表にし、`name` も記録する。
- 上限: `maxControls`（既定 `CHANGE_ON_INPUT_MAX_CONTROLS = 100`）を超えた分は試さず
  `aborted: { reason: 'control-limit', ... }`。

### B. 1 欄ごとの手順（`runChangeOnInputCheck`）

```ts
export interface RunChangeOnInputCheckOptions extends AuditOutputOptions {
  browser?: Browser;
  createContext?: () => Promise<BrowserContext>;
  targetUrl?: string;
  contextOptions?: BrowserContextOptions;
  /** Wait after each change for a context change to surface. Default: CHANGE_ON_INPUT_SETTLE_MS (500). */
  settleMs?: number;
  /** Default: CHANGE_ON_INPUT_TIMEOUT_MS (60_000). Same validation as other walk limits. */
  timeBudgetMs?: number;
  /** Default: CHANGE_ON_INPUT_MAX_CONTROLS (100). Positive integer. */
  maxControls?: number;
}
```

`kind: 'browser'`（`keyboard-reachability-check` と同じく自分で context を作って開く）。
スクリーンショットは撮らない。`settleMs` / `timeBudgetMs` / `maxControls` の値の検証は
`assertWalkLimits` と同じ基準（正の有限数・正の整数。違えば `Error`）。

1. `newContext()` → `newPage()` → 見張りを付ける → `gotoAndSettle(page, targetUrl)`。
   最初の 1 回の `page.url()` を `startUrl`（結果の `url`）として控える。見張り:
   - `page.on('framenavigated')`: 主フレームなら URL を記録（同じ URL の再読み込み・
     `#` だけの変化も記録する。ビューポートの移動も文脈の変化に当たるため）。
   - `context.on('page')`: 新しいページの URL（`popup.url()`、取れなければ `about:blank`）を
     記録し、そのページを閉じる。
   - `page.on('dialog')`: 種類と文言（`DIALOG_MESSAGE_MAX` = 200 字で切る）を記録し `dismiss()`。
   いずれも `goto` の後で記録をリセットする（focus-indicator の `:503` と同じ）。
2. 欄を集める（A）。やり直しの 2 回目以降は、集めた中から**すでに試した selector を除いた
   最初の欄**から続ける（ページが移動して戻ってきても、試した欄は `tested` の集合で飛ばす）。
3. 欄ごとに（時間切れなら `aborted: { reason: 'timeout' }` で止める）:
   1. 記録をリセット。元の値（`value` / `checked` / `selectedIndex`）を控える。
      この欄の selector を**この時点で** `tested` 集合に入れる（操作中に移動・例外が
      起きても、やり直しで同じ欄を再び試さないため。無限ループ防止）。
   2. **試行**（操作と観測をまとめて 1 つの `try` で包む）:
      - `locator.focus()` → A の操作。
      - **focus 確認 1**（select / radio / checkbox は操作の直後、`text` は `fill` の後・`blur()` の前）:
        `document.activeElement` が操作した欄（radio はそのグループのどれか）かを見る。
        違えば `focus-moved`（移った先の `selector`。`<body>` / null なら記録しない）。
      - 値が変わったかを確かめる（A の「値が実際に変わったか」）。
      - `text` のみ: ページ内で `focusin` の見張り（`document` に capture で付け、移った先の
        要素を記録）を付けてから `el.blur()` を呼ぶ。blur 自体は focus を `<body>` に移すだけで
        `focusin` を起こさないので、**`blur()` の後に `focusin` が記録されていれば change handler が
        focus を動かした**とみなし `focus-moved`（focus 確認 2）。見張りは確認後に外す。
      - `settleMs` 待つ。
   3. **試行が例外になったとき**の判定順（keyboard-reachability の `inPage`
      `runKeyboardReachabilityCheck.ts:889-900` と同じく、記録済みの移動を先に見る）:
      1. `framenavigated` の記録がある、または例外の文言が
         `Execution context was destroyed|Frame was detached|Target page, context or browser has been closed|navigat`
         に当たる → `navigation`（`toUrl` は記録の URL、無ければ `page.url()`）として下の 4 へ。
      2. 新しいページかダイアログの記録がある → それを finding にして下の 4 へ（操作の例外は
         記録しない）。
      3. それ以外（要素が消えた・見えない・操作できない）→ その欄は `skipped`（`reason` は
         例外の 1 行目、200 字まで）にして次の欄へ。
   4. 記録を見る: 主フレームの移動 → `navigation`（`toUrl`）、新しいページ → `new-window`、
      ダイアログ → `dialog`、focus 確認 1・2 → `focus-moved`。確認のための `page.evaluate` が
      上の例外判定 1 の文言で失敗した場合も `navigation`（それ以外の例外は外に投げる）。
   5. 1 つでもあれば `findings` に積み、`controlsTested` に数える。無ければ、値が変わって
      いれば `controlsTested` に数え、変わっていなければ `skipped`（`value-unchanged`）。
   6. **`navigation` があったら**: context を閉じ、新しい context で 1. からやり直す
      （3.2.1 と同じ。やり直しは `CHANGE_ON_INPUT_MAX_RESTARTS = 20` 回まで。超えたら
      `aborted: { reason: 'restart-limit' }`）。
      **それ以外**: 値を元に戻す（**イベントを起こさずに**プロパティで `value` /
      `checked` / `selectedIndex` を戻す。handler が戻しの操作に反応しないようにするため）。
      戻せなかった（要素が消えた）ら気にせず次へ。
4. `finally` で context を必ず閉じる。結果を `buildAuditResult({ source: 'change-on-input-check',
   url: startUrl, details, buckets: normalizeChangeOnInputCheck(details) })` → `out.save` →
   `out.header('Change on Input Check', 'WCAG 3.2.2', startUrl)`。

### C. 型（`src/types.ts`）

```ts
export type ChangeOnInputControlKind = 'select' | 'radio' | 'checkbox' | 'text';

export type InputContextChange =
  | { kind: 'navigation'; toUrl: string }
  | { kind: 'new-window'; url: string }
  | { kind: 'focus-moved'; toSelector: string }
  | { kind: 'dialog'; dialogType: string; message: string };

export interface ChangeOnInputControl {
  selector: string;
  controlKind: ChangeOnInputControlKind;
  /** <input> type attribute, 'select' or 'textarea'. */
  type: string;
  name: string | null;
  /** Visible label text (label[for], wrapping label, aria-label), trimmed; null if none. */
  label: string | null;
  html: string;
  htmlTruncated: boolean;
}

export interface ChangeOnInputFinding {
  control: ChangeOnInputControl;
  /** What was done, e.g. 'selected option 2 "Tokyo"', 'checked', 'typed "a11y-test" and blurred'. */
  action: string;
  changes: InputContextChange[];
}

export interface ChangeOnInputCheckDetails {
  controlsFound: number;
  controlsTested: number;
  skipped: { selector: string; reason: string }[];
  findings: ChangeOnInputFinding[];
  restarts: number;
  aborted: {
    reason: 'timeout' | 'control-limit' | 'restart-limit';
    testedCount: number;
    foundCount: number;
  } | null;
}

export type ChangeOnInputCheckResult = AuditCheckResult<ChangeOnInputCheckDetails>;
```

### D. ルール（`src/utils/rule-registry.ts`）

```ts
// --- change-on-input-check ---
'no-context-change-on-input': {
  id: 'a11y-skills/no-context-change-on-input',
  sc: ['3.2.2'],
  tags: ['a11y-skills', 'wcag2a', 'wcag322'],
  impact: 'serious',
  scope: 'node',
  description:
    'Ensure changing the setting of a form control does not automatically cause a change of context',
  help: 'Changing a form control value must not trigger a context change unless users are advised beforehand',
  helpUrl: `${UNDERSTANDING}/on-input.html`,
  // The change is observed, but advising users beforehand makes it conform,
  // and that advice can only be judged by a human.
  classification: 'incomplete',
},
```

### E. normalizer（`normalizeChangeOnInputCheck`）

- `findings` 1 件ごとに node 1 つ（`target: [control.selector]`、`html` / `htmlTruncated` は
  control から）。`failureSummary` 例:
  `` `Changing this ${type} control (${label ?? name ?? 'unlabeled'}) — ${action} — caused: ${changes}. Unless users are advised of this behavior before using the control, this fails 3.2.2.` ``
  `changes` は `navigation to <url>` / `a new window (<url>)` / `focus moving to <selector>` /
  `a <type> dialog ("<message>")` を `; ` でつなぐ。
- `findings` が 0 で `aborted` がある: `pageNode` 1 つで incomplete
  （`Stopped early (${reason}): ${testedCount} of ${foundCount} controls were tested. Check the rest manually.`）。
  `findings` があり `aborted` もある場合は、findings の node に加えて同じ page node を足す。
- それ以外で `controlsTested > 0`: `applicable = true`、node 0 件（→ `passes`）。
- `controlsTested === 0`: `applicable = false`（inapplicable）。
- `bucketize(buckets, 'no-context-change-on-input', nodes, applicable)`。

### F. schema

`CHANGE_ON_INPUT_CHECK_RESULT_SCHEMA` を `buildEnvelopeSchema` で作る。details の `required` は
型の全フィールド。`InputContextChange` は `kind` の `const` ごとの `oneOf`、`controlKind` と
`aborted.reason` は `enum`、`name` / `label` は `['string', 'null']`、`aborted` は
`oneOf [object, null]`。`RESULT_SCHEMAS` に `'change-on-input-check'` で登録。

### G. 定数（`src/constants.ts`）

```ts
/** WCAG 3.2.2: wait after each value change for a context change to surface. */
export const CHANGE_ON_INPUT_SETTLE_MS = 500;
export const CHANGE_ON_INPUT_TIMEOUT_MS = 60_000;
export const CHANGE_ON_INPUT_MAX_CONTROLS = 100;
/** Fresh-context restarts after a value change navigated the page. */
export const CHANGE_ON_INPUT_MAX_RESTARTS = 20;
export const CHANGE_ON_INPUT_TEXT_VALUES = { email: 'a11y@example.com', tel: '0123456789', url: 'https://example.com/', number: '1', default: 'a11y-test' } as const;
export const DIALOG_MESSAGE_MAX = 200;
export const DEFAULT_CHANGE_ON_INPUT_RESULT_FILE = 'change-on-input-result.json';
```

## Steps

### Step 0: Drift check

冒頭の drift check を実行。

### Step 1: 型・定数・ルール

設計 C・D・G を追加。**Verify**: `npm run typecheck` → exit 0。

### Step 2: normalizer・schema・export

設計 E・F。`src/index.ts` の axe-format export に `normalizeChangeOnInputCheck` を追加。
**Verify**: build → exit 0。

### Step 3: フィクスチャと spec（テスト先行）

`test/fixtures/pages/change-on-input/` に作る。各ファイル冒頭の HTML コメントに意図と期待結果。

- `select-navigates.html`: `<select>` の `change` で `location.assign('landing.html')`。
  ほかに handler の無い text 欄 1 つ（試した欄が飛ばされず続けて検査されることを見る）。
- `landing.html`: 移動先（欄なし）。
- `checkbox-popup.html`: チェックボックスの `change` で `window.open('landing.html')`。
- `radio-focus.html`: radio の `change` で別の `<input>` に `focus()`。
- `text-autoadvance.html`: `maxlength="3"` の text 欄で、`input` イベントで 3 文字に達したら
  次の欄へ `focus()`（郵便番号の自動送り）。
- `text-submit-on-change.html`: text 欄の `change` で `form.submit()`（`action="landing.html"`）。
- `select-alert.html`: `<select>` の `change` で `alert('saved')`。
- `clear.html`: select / radio / checkbox / text があり、handler は表示テキストを変えるだけ。
- `none.html`: 欄なし（ボタンとリンクだけ）。
- `text-navigates-on-input.html`: text 欄の `input` イベントで同期的に
  `location.assign('landing.html')`（`fill` の最中に文書が置き換わり、操作が例外になる場合）。
  ほかに handler の無い checkbox 1 つ。
- `text-change-focus.html`: text 欄の `change` で別の `<input>` に `focus()`（blur の後の移動）。
- `initial-value.html`: `value="1"` の `type="number"` と、`value="111" maxlength="3"` の text 欄。
  どちらも `change` で表示テキストを変えるだけ（現在値と同じ試験値を避けて、値を変えられること）。
- `value-reverted.html`: text 欄の `input` で即座に `this.value = ''` に戻す（値を変えられない欄）。
- `restore-silent.html`: checkbox の `change` handler が呼ばれた回数を数え、2 回目で
  `location.assign('landing.html')`（値の戻しがイベントを起こさないことを見る）。
- `skips.html`: `disabled` / `readonly` / `type="hidden"` / 見えない欄 / option が 1 つだけの select のみ。

`test/change-on-input.spec.ts` を先に書き（`helpers/fixtures.js` の `test` / `runFixtureCheck`）、
1 テスト 1 振る舞いで確かめる。テスト名は「どんな条件で・何をすると・どうなるか」。

- select の変更で移動するページ → incomplete、finding 1 件の `changes[0]` が
  `{ kind: 'navigation', toUrl: …/landing.html }`、`restarts === 1`、
  text 欄も試されている（`controlsTested === 2`）、`result.url` が元のフィクスチャ URL
- チェックボックスで新しいウィンドウ → `new-window`
- radio でフォーカスが移る → `focus-moved`、`toSelector` が移った先
- maxlength で自動送り → `focus-moved`
- text の change で submit → `navigation`
- text の input で入力の最中に移動（操作が例外になる）→ 例外にならず `navigation` の finding、
  `restarts === 1`、checkbox も試されている（`controlsTested === 2`）、text 欄は 2 回試されない
- text の change で別の欄へ focus → `focus-moved`、`toSelector` が移った先
- 初期値が試験値と同じ欄 → 2 欄とも `controlsTested` に数えられ、`skipped` に入らない
- 値を即座に戻される欄 → `skipped` に `value-unchanged`、`controlsTested === 0`、inapplicable
- select で alert → `dialog`、`message === 'saved'`、チェックがハングしない
- clear → `a11y-skills/no-context-change-on-input` が `passes`、`controlsTested === 4`
- none / skips → inapplicable、skips は `skipped` に option 1 つの select が理由付きで入る
- `maxControls: 1` で clear → `aborted.reason === 'control-limit'`、incomplete
- 不正な `settleMs: 0` / `maxControls: 1.5` は `Error`
- 値の戻しでイベントが起きないこと（`restore-silent.html`: checkbox の `change` で
  2 回目の呼び出し時だけ `location.assign('landing.html')`。戻しで change が起きると移動して
  finding になる）→ finding 0 件・`passes`
- 全ケースでエンベロープが `RESULT_SCHEMAS['change-on-input-check']` に valid

失敗理由が「モジュール／export が無い」であることを確かめてから Step 4 へ。

### Step 4: runner・CLI・test-entry・exports

- `src/playwright/runChangeOnInputCheck.ts` を設計 A・B で実装。ファイル先頭コメントに
  何を見るか・Limitations（Maintenance notes の既知の制限）を列挙。
- `src/playwright/index.ts` に runner と Options 型の export。
- `src/cli.ts` の `CHECK_REGISTRY` 末尾に `kind: 'browser'` エントリ（`keyboard-reachability-check` と同形、
  `screenshot` は渡さない）。先頭コメントのチェック数を直す。
- `src/test-entries/change-on-input-check.ts`、`package.json` の `exports` / `description`。
- `test/helpers/fixtures.ts` の `buildRunnerRegistry` に `kind: 'browser-navigating'` で登録。

**Verify**: Step 3 の spec が green。`--list-checks` の末尾が `change-on-input-check`。

### Step 5: 既存テストの更新

- `test/fixture-gallery.spec.ts`: MANIFEST に 2 件（`select-navigates.html` →
  `'a11y-skills/no-context-change-on-input': 'incomplete'`、`clear.html` → `'passes'`）。
  冒頭コメントの checks / rules の数を +1。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に
  `{ ruleId: 'a11y-skills/no-context-change-on-input', expectedBucket: 'incomplete' }`。
- `test/schema-validation.spec.ts`: 手組み details（4 種の change を 1 つずつ含む finding、
  `aborted` あり・なし）が valid。

**Verify**: `npm test` → 全 green。

### Step 6: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/claude-coi-all > /tmp/claude-coi-all.log 2>&1; echo "exit=$?"
grep -E "change-on-input-check|Errors:" /tmp/claude-coi-all.log
# 期待: [change-on-input-check] DONE ...、Errors: 0、exit=1（axe 由来）
```

満たせなければ STOP。

### Step 7: ドキュメント

日本語を先に書き、英語を同期する。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表に 1 行:
  `| \`change-on-input-check\` | 3.2.2 | 欄の値を変えただけで起きる移動・新しいウィンドウ・フォーカス移動・ダイアログ（候補。要確認） |`
  / `| ... | 3.2.2 | Navigation, new windows, focus moves or dialogs caused by just changing a form control (candidates; needs review) |`
- `coverage-matrix.ja.md` / `.md` `:64` の 3.2.2 行を
  `インタラクティブ+自動の候補 | \`change-on-input-check\` **[CLI]** + DOM差分 | 入力のみで送信/遷移（事前の説明なし）でFail`
  （EN: `Interactive + automated candidates | \`change-on-input-check\` **[CLI]** + DOM diff | Fail if input triggers submit/navigation without prior advice`）に。
  「基準 × チェック名 × 出力ファイル」表に
  `| 3.2.2 | \`change-on-input-check\` | \`change-on-input-result.json\` |` を SC 順の位置に追加。
- `interactive-checks.ja.md` / `.md`: 3.2.1 の節の後ろに短い節「`change-on-input-check` CLI
  チェック」（何を変えるか / 何を記録するか / 前もっての説明は人が確かめる、実ページで値を
  変えるので自動保存などが起きうる、の 4 点程度）。
- `packages/a11y-audit/TODO-COVERAGE.md`（JA のみ）: 3.2.2 の節を motion-actuation の節の書式で追加
  （部分実装、残る制限）。
- `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表に
  `runChangeOnInputCheck | 3.2.2 入力時（値を変えただけで起きる移動・新しいウィンドウ・フォーカス移動・ダイアログ。候補として報告）`、
  チェック名一覧に 1 行、test entry の列挙に追記、`browser` を受けるチェックの列挙
  （「`runFocusIndicatorCheck` と `runKeyboardReachabilityCheck` は `browser` を受けます」）に追加、
  `createContext` を受けるチェックの列挙にも追加、表の下に短い段落（対象の欄と変え方、
  移動したら新しい context でやり直す、値は戻すがページの内部状態は戻らない、
  **実ページで値を変えるので、自動保存・送信が起きうるページでは注意**）。
- `packages/a11y-audit/CHANGELOG.md`: 先頭の未リリース節の `### Added` に新チェック・ルール・
  既知の制限。**`package.json` の version は変えない**。

**Verify**: `npm run validate:skills && npm run lint && npm run format:check`

### Step 8: 全体検証とコミット

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
を通し、Git workflow のとおりコミット。`plans/README.md` にステータス行を追加。

## Test plan

- **`test/change-on-input.spec.ts`**: 4 種の欄 × 4 種の変化（移動・新しいウィンドウ・
  フォーカス移動・ダイアログ）、移動後のやり直しで残りの欄も試すこと、問題なし・対象なし・
  除外、上限、引数の検証、schema。
- **fixture-gallery / rule-classification / schema-validation**: 既存の枠組みに登録。
- **CI**: `--checks all` スモークが新チェックを自動で通す（Step 6）。

## Done criteria

ALL must hold:

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` exit 0
- [ ] `--list-checks` の末尾が `change-on-input-check`
- [ ] Step 6 のスモークで `[change-on-input-check] DONE`、`Errors: 0`、exit 1
- [ ] 既存 runner（`src/playwright/run*.ts` の既存ファイル）に差分がない
- [ ] 日英ドキュメントがペアで更新されている（SKILL / coverage-matrix / interactive-checks / README）
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更
- [ ] `plans/README.md` のステータス行を追加

## STOP conditions

- 既存チェックの挙動・型・schema・rule を変えなければならなくなった
- `locator.selectOption` / `check` / `fill` + `blur()` でフィクスチャの handler が動かない
  （値の変え方を設計し直す判断が要る）
- `page.on('dialog')` を付けても alert でチェックが止まる
- 入力の最中の移動で、Playwright の操作が例外にならず戻らない（ハングする）、または
  例外判定 1 の文言に当たらない文言の例外を投げる（判定の文言を足すか、設計判断が要る）
- `blur()` の後の `focusin` の見張りで、change handler による focus 移動を拾えない
- Step 6 で `--checks all` が ERROR・ハング・exit 2 になる
- いずれかのフィクスチャでチェックがハングする
- schema 検証・lint・format・既存テストのいずれかが green にできない

## Maintenance notes

- **3.2.1 との関係**: 移動の見張り（主フレームの `framenavigated`）と、移動したら新しい
  context でやり直して試した要素を飛ばす作りは `runFocusIndicatorCheck` と同じ。違いは
  (1) 操作が Tab ではなく値の変更、(2) 同じ URL の再読み込みや `#` だけの変化も記録する、
  (3) 新しいウィンドウ・フォーカス移動・ダイアログも記録する、(4) 結果は violation ではなく
  incomplete。3 つ目の利用者ができたら、見張りとやり直しを共通化してよい。
- **既知の制限**（runner 先頭コメントと CHANGELOG に記載）:
  - 主フレームの light DOM の欄だけ。iframe・shadow root・ARIA だけの独自部品は見ない。
  - 値を 1 種類だけ試す（select は別の option 1 つ、text は固定値 1 つ）。特定の値でだけ
    起きる変化は見落とす。
  - 値はイベントを起こさずにプロパティで戻すので、handler が変えたページの内部状態・DOM は
    戻らない。前の欄の変更が後の欄の結果に影響しうる。
  - `settleMs` を過ぎてから起きる変化（通信の後の移動など）は見落とす。
  - 「内容の大きな変化」（パネルの入れ替えなど）は記録しない。
  - **実ページで値を変え、change を起こす**。自動保存・自動送信のあるページでは実際に
    通信が起きうる。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit`
  を minor、スキル文書が変わるのでプラグインも minor に上げ、4 フィールドを揃える。
- レビュアーは特に、(1) 移動・例外のどの経路でも context が閉じられるか、
  (2) やり直しで試した欄が確実に飛ばされ無限ループにならないか、(3) 値の戻しが
  イベントを起こしていないか、(4) ダイアログでハングしないか、を見ること。
