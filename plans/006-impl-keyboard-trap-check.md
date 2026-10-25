# Plan 006-impl: キーボードトラップ (WCAG 2.1.2) チェックの実装

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP 条件」に該当した
> ら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> の本プランのステータス行を更新する。
>
> **Drift check (run first)**:
> `git diff --stat 58c3bd4..HEAD -- packages/a11y-audit/src .github/workflows/ci.yml skills/auditing-wcag/SKILL.md`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比較してから
> 進む。構造的な不一致（関数シグネチャの変化、レジストリ形式の変化）は STOP。

## Status

- **Priority**: P2
- **Effort**: M（3〜5 日相当）
- **Risk**: MEDIUM（新規チェックの追加。既存チェックには触れないが、`--checks all`
  を実行する 2 つの CI スモークが新チェックを必ず通るため、`cli-smoke.html` に
  対して ERROR やハングを起こすと CI が落ちる）
- **Depends on**: 008 (CLI, DONE)、009 (skill migration, DONE)、010 (CLI nav fix, DONE)
- **Category**: feature
- **Planned at**: commit `58c3bd4`, 2026-06-13
- **設計の出典**: `plans/006-result-keyboard-trap-design.md`（Go 判定のスパイク）。
  本プランは設計を現行コード（CLI + スキル移行後）に適合させ、アルゴリズムの
  欠陥を 1 点補正したもの。

## Why this matters

WCAG 2.1.2 (No Keyboard Trap) はキーボードユーザーがページ操作を完全に失う
致命的な失敗で、axe-core には自動ルールが無い（自動化困難とされる領域）。
設計スパイク（`006-result-keyboard-trap-design.md`）が 3/3 フィクスチャを
正しく分類できることを実証し **Go** と判定した。本プランはそれを
`@a11y-skills/audit` パッケージの 11 個目のチェックとして実装する。

実装後、チェックは CLI（`npx -y @a11y-skills/audit --checks keyboard-trap-check`）
と関数 API の両方で使え、auditing-wcag スキルのチェック表にも載る。

## 設計からの補正（実装前に必ず読む）

スパイク設計は固定ウィンドウ `KEYBOARD_TRAP_WINDOW = 10` で「末尾 11 ステップが
同一要素集合ならトラップ」と判定する。**これはフォーカス可能要素数 `count` > 10 の
ページで誤検知する**: 健全なページでも末尾 11 ステップには全要素が現れず、部分集合に
見えてしまう。

**補正**: ウィンドウを固定値ではなく **`count + 1`（フルサイクル 1 周分）** とする。
健全なページでは連続 `count` 回の Tab で全フォーカス可能要素を 1 周するため、
末尾 `count + 1` ステップのユニーク集合サイズは `count` に等しい。トラップでは
フォーカスが部分集合に吸収され、ユニーク集合サイズ < `count` になる。これは
`count` に依存せず堅牢。スパイクが count=5 で成功したのは偶然 `10 >= count`
だったため。

この補正に伴い `KEYBOARD_TRAP_WINDOW` 定数は**追加しない**（`count + 1` を使う）。
ウォーク長も、トラップが終盤の要素で発生する場合に「トラップ進入後に `count + 1`
ステップ」を確保するため **`2 * count + KEYBOARD_TRAP_SLACK`** とする（設計の
`count + slack` では終盤トラップを取りこぼす）。暴走防止に
`KEYBOARD_TRAP_MAX_TAB_PRESSES` で上限を設ける。

## Current state（統合点 — すべて確認済み）

リポジトリは npm workspaces モノレポ。パッケージは `packages/a11y-audit`、
ESM (`"type": "module"`)、strict TypeScript、`tsc` ビルド（バンドラなし）。
ビルド/テスト/lint コマンド（リポジトリルートで実行）:

```sh
npm ci
npm run build --workspace @a11y-skills/audit   # tsc
npm test --workspace @a11y-skills/audit         # playwright（pretest が build）
npm run lint                                    # eslint（ルート）
npm run format:check                            # prettier（ルート）
```

既存チェックは 10 個。新チェックを足すために触る統合点（行番号は `58c3bd4`
時点の目安。drift check で確認すること）:

1. **`src/playwright/runFocusIndicatorCheck.ts`** — **構造テンプレート**。`browser`
   所有モデル（`page` でなく `browser` を受ける）、`browser.newContext()` →
   `page.goto()` → `finally` で `context.close()`、`addInitScript` で
   ブラウザ内列挙、`buildAuditResult` + `normalizeXxx` で結果組み立て、
   `resolveOutputPath`/`saveAuditResult`/`takeAuditScreenshot`/`requireTargetUrl`/
   `logAuditHeader`/`logOutputPaths` を `../utils/test-harness.js` から使う。
   キーボードトラップチェックはこれを**コピーして適合**させる（共通化はしない
   — 設計 §3.3 のとおり制御フローが異なるため独立実装）。

2. **`src/constants.ts`** — `FOCUSABLE_SELECTOR`（L65）、`EXTRA_TAB_ITERATIONS = 10`
   （L75）、`DEFAULT_NAVIGATION_SETTLE_MS = 50`（L78）、
   `DEFAULT_FOCUS_RESULT_FILE`/`DEFAULT_FOCUS_SCREENSHOT_FILE`（L111/113）、
   `HTML_SNIPPET_MAX_LENGTH = 300`（L34）がある。ここに新定数を追加。

3. **`src/types.ts`** — `CheckSource` ユニオン（L21〜、10 個の文字列）に
   `'keyboard-trap-check'` を追加。新しい details/result 型もここに追加。
   `AuditCheckResult<TDetails>` がエンベロープ総称型（L79 付近で `source` を使用）。

4. **`src/utils/rule-registry.ts`** — `RULES` オブジェクト（L41〜）に 2 エントリ追加。
   `UNDERSTANDING`（L39）定数を helpUrl に使う。`RuleMeta` の形は L18〜37。
   `classification: 'violation' | 'incomplete'`、`scope: 'node' | 'page'`、
   `impact: NormalizedImpact`。

5. **`src/utils/axe-format.ts`** — `normalizeKeyboardTrapCheck(details)` を追加し
   export。`emptyBuckets()`/`bucketize()`/`pageNode()`/`buildAuditResult()` は
   既存。`normalizeTimeLimitDetector`（L457〜）が **page-scope + pageNode** の
   参考例。`bucketize(buckets, key, nodes, applicable)` は applicable=false →
   inapplicable、nodes=[] → passes、それ以外 → レジストリの classification。

6. **`src/playwright/index.ts`** — `runKeyboardTrapCheck` と
   `RunKeyboardTrapCheckOptions` を export。

7. **`src/index.ts`** — `normalizeKeyboardTrapCheck` を
   `./utils/axe-format.js` の export リストに追加。

8. **`src/schemas/index.ts`** — `buildEnvelopeSchema(...)` で
   `KEYBOARD_TRAP_CHECK_RESULT_SCHEMA` を作り、`RESULT_SCHEMAS`（L567〜）に
   `'keyboard-trap-check': ...` を登録。

9. **`src/cli.ts`** — `CHECK_REGISTRY` に新エントリ。**`kind: 'browser'`**
   （focus-indicator-check と同じ、L76〜）。`run({ browser, outputDir, screenshot, url })`
   で `runKeyboardTrapCheck({ browser, targetUrl: url, outputDir, screenshot })`
   を呼ぶ。`CheckKind` は `'page' | 'browser'`（L23）。**page-kind ではないので
   `ownsNavigation` は不要**（browser-kind は元々事前ナビゲーションされない）。
   registry の名前順は既存の並び（axe → focus → reflow → ... → target-size）の
   末尾、`target-size-check` の後に追加するのが自然。

10. **`src/test-entries/keyboard-trap-check.ts`** — 薄いラッパー（新規）。
    `focus-indicator-check.ts`（`runFocusIndicatorCheck({ browser, screenshot: true })`）
    と同形。

11. **`packages/a11y-audit/package.json`** — `exports` に
    `"./test-entries/keyboard-trap-check"` エントリを追加（既存 10 個と同形:
    `types` と `import` の 2 条件）。

12. **`packages/a11y-audit/CHANGELOG.md`** — 新機能なので **0.5.0** エントリ
    （`## 0.5.0 — <実行日>`、Added）。**`package.json` の version は変更しない**
    （リリースフローで別途バンプ）。

13. **`skills/auditing-wcag/SKILL.md` / `SKILL.ja.md`** — `## Automated Checks CLI`
    のチェック名×基準の表に 1 行追加: `| \`keyboard-trap-check\` | 2.1.2 |
    Keyboard trap detection |`（JA は説明を日本語で「キーボードトラップ検出」）。
    EN/JA 両方。**表以外は変更しない**。

14. **`packages/a11y-audit/test/smoke.spec.ts`** と
    **`test/schema-validation.spec.ts`** — テスト追加（Test plan 参照）。

## アルゴリズム仕様（実装の中身）

`runFocusIndicatorCheck` の構造を流用しつつ、ロジックは以下:

### 1. セットアップ（browser 所有）
- `context = await browser.newContext(contextOptions)`、`page = context.newPage()`
- `addInitScript` で `FOCUSABLE_SELECTOR` に基づく列挙ヘルパーと、要素→CSS
  セレクタ生成（focus check の `getSelector` を流用）をブラウザに注入
- **`file:` スキームの URL は `waitUntil: 'load'`、それ以外は `'networkidle'`**
  でナビゲート（runFocusIndicatorCheck は networkidle 固定だが、本チェックは
  `cli-smoke.html`（file://）に対して CI で走るため必須。orientation/time-limit
  の 0.4.1 修正と同じ判断）
- `count = フォーカス可能要素数`を評価。**`count === 0` → inapplicable** で早期に
  結果を組み立てて返す（トラップ判定不要）

### 2. Tab ウォーク
- `pressN = Math.min(2 * count + KEYBOARD_TRAP_SLACK, KEYBOARD_TRAP_MAX_TAB_PRESSES)`
- `pressN` 回 `page.keyboard.press('Tab')`。各ステップ後に `document.activeElement`
  の `{ selector, tag, name }` を読む。`activeElement` が `null` か `body` の場合は
  **特別マーカー `'(body)'`** を selector として記録（フォーカスが本文/外に
  逃げたことを表し、confinement を自然に破る）
- 各ステップ後 `KEYBOARD_TRAP_ESCAPE_SETTLE_MS` ではなく短い `walkSettleMs`
  （`DEFAULT_NAVIGATION_SETTLE_MS = 50` を流用してよい）待つ程度で可

### 3. トラップ検出（補正済みアルゴリズム）
- `walk` = セレクタ列（長さ `pressN`）
- `windowSize = count + 1`、`tail = walk.slice(-windowSize)`、
  `tailSet = new Set(tail)`
- **トラップ候補**: `tailSet` が `'(body)'` を含まず、かつ
  `tailSet.size < count`（フルサイクル分の窓で全要素に到達できていない =
  フォーカスが部分集合に閉じ込められている）。`tailSet` がトラップ集合 S。
- トラップ候補が無ければ confinedTraps=[]、needsReview=[] のまま（→ 両ルール pass）

### 4. 脱出パス試行（候補があるとき、最大 `KEYBOARD_TRAP_MAX_ESCAPE_ATTEMPTS`）
S 内のいずれかにフォーカスを置いた状態から順に試し、`activeElement` が S 外
（または `'(body)'`）に出るか、トラップコンテナが非表示になるかを各試行後
`KEYBOARD_TRAP_ESCAPE_SETTLE_MS` 待って判定:
1. **Escape** キー
2. **Shift+Tab**（設計 §2.3-1: focusout 型トラップは Shift+Tab も捕捉するので
   期待でなく実試行で判定）
3. **可視クローズアフォーダンス**: アクセシブル名が `/close|閉じる|dismiss/i` に
   マッチする `button`/`[role=button]` を S のコンテナ内で探し `click()`

各試行の成否を記録。コンテナ判定用に S 要素の最も近い共通祖先、または S 要素が
`[role=dialog][aria-modal="true"]` の子孫かを評価。

### 5. 分類（設計 §1.2）
- **violation（`no-keyboard-trap`）**: どの脱出パスも機能しない真のトラップ
- **incomplete（`keyboard-trap-needs-review`）**: 脱出パスはあるが非慣用的
  （Escape は効くが `role=dialog`+`aria-modal=true` でない、または Shift+Tab のみ
  脱出など）
- **pass**: `role=dialog`+`aria-modal=true` コンテナで Escape が機能（正しい
  モーダル）→ どちらのルールにも node を出さない

### 6. 結果組み立て
- details を作り、`normalizeKeyboardTrapCheck(details)` で buckets を得て
  `buildAuditResult({ source: 'keyboard-trap-check', url: page.url(), details, buckets })`
- `screenshot` が true なら `takeAuditScreenshot`、`saveAuditResult`、
  `logAuditHeader`/`logOutputPaths`、戻り値を返す
- `finally` で `context.close()`

### details / 型の形（`src/types.ts`）

```ts
export interface KeyboardTrapEvidence {
  selector: string;
  tag: string;
  name: string;
  html: string;
  htmlTruncated: boolean;
  /** 試行した脱出パスとその成否（incomplete の根拠説明に使う）。 */
  escapeAttempts: { escape: boolean; shiftTab: boolean; closeAffordance: boolean };
  /** role=dialog かつ aria-modal=true のコンテナ内か。 */
  isAriaModal: boolean;
}

export interface KeyboardTrapCheckDetails {
  totalFocusableElements: number;
  /** 検出したトラップ領域の数。 */
  trapCandidates: number;
  /** 脱出不能の確定トラップ（→ violation）。 */
  confirmedTraps: KeyboardTrapEvidence[];
  /** 脱出可能だが要人手確認（→ incomplete）。 */
  needsReview: KeyboardTrapEvidence[];
  screenshotPath: string;
}

export type KeyboardTrapCheckResult =
  AuditCheckResult<KeyboardTrapCheckDetails>;
```

### normalizer（`src/utils/axe-format.ts`、page-scope）

`normalizeTimeLimitDetector` の pageNode パターンに倣う:

```ts
export function normalizeKeyboardTrapCheck(
  details: KeyboardTrapCheckDetails,
): NormalizedBuckets {
  const buckets = emptyBuckets();
  const applicable = details.totalFocusableElements > 0;
  buckets.checkedNodes = details.totalFocusableElements;

  bucketize(
    buckets,
    'no-keyboard-trap',
    details.confirmedTraps.map((t) =>
      pageNode(
        `Keyboard focus is trapped in <${t.tag.toLowerCase()}> "${t.name}" ` +
          `(${t.selector}). None of Escape / Shift+Tab / a close control moved ` +
          `focus out. Keyboard users cannot leave this region.`,
      ),
    ),
    applicable,
  );

  bucketize(
    buckets,
    'keyboard-trap-needs-review',
    details.needsReview.map((t) =>
      pageNode(
        `Focus appears confined to <${t.tag.toLowerCase()}> "${t.name}" ` +
          `(${t.selector}); it can be left via ` +
          `${[t.escapeAttempts.escape && 'Escape', t.escapeAttempts.shiftTab && 'Shift+Tab', t.escapeAttempts.closeAffordance && 'a close control'].filter(Boolean).join(', ')}. ` +
          `Verify the escape method is documented/discoverable (WCAG 2.1.2 exception).`,
      ),
    ),
    applicable,
  );

  return buckets;
}
```

### 定数（`src/constants.ts`）

```ts
/** Tab ウォーク: フォーカス可能要素数 count に対する追加 Tab 回数。 */
export const KEYBOARD_TRAP_SLACK = 10;
/** ウォーク長の暴走防止上限（巨大ページ対策）。超過時はログに残す。 */
export const KEYBOARD_TRAP_MAX_TAB_PRESSES = 600;
/** 各脱出試行後の待機 ms。 */
export const KEYBOARD_TRAP_ESCAPE_SETTLE_MS = 200;
/** 1 ページあたりの最大脱出試行回数。 */
export const KEYBOARD_TRAP_MAX_ESCAPE_ATTEMPTS = 3;
export const DEFAULT_KEYBOARD_TRAP_RESULT_FILE = 'keyboard-trap-result.json';
export const DEFAULT_KEYBOARD_TRAP_SCREENSHOT_FILE = 'keyboard-trap.png';
```

### ルールレジストリ（`src/utils/rule-registry.ts`、設計 §3.2 を転記）

```ts
'no-keyboard-trap': {
  id: 'a11y-skills/no-keyboard-trap',
  sc: ['2.1.2'],
  tags: ['a11y-skills', 'wcag2a', 'wcag212'],
  impact: 'critical',
  scope: 'page',
  description: 'Ensure keyboard focus can be moved away from all components',
  help: 'Keyboard users must be able to navigate away from any focused component',
  helpUrl: `${UNDERSTANDING}/no-keyboard-trap.html`,
  // focus confinement with no working exit is directly observed; no exception applies.
  classification: 'violation',
},
'keyboard-trap-needs-review': {
  id: 'a11y-skills/keyboard-trap-needs-review',
  sc: ['2.1.2'],
  tags: ['a11y-skills', 'wcag2a', 'wcag212'],
  impact: 'critical',
  scope: 'page',
  description:
    'Focus appears confined; verify whether the escape path is documented or discoverable',
  help: 'Verify that users can escape focus-confined areas via documented keyboard methods',
  helpUrl: `${UNDERSTANDING}/no-keyboard-trap.html`,
  // 2.1.2 allows non-standard exit if the user is advised; that判定 is manual.
  classification: 'incomplete',
},
```

## Steps

### Step 0: Drift check
冒頭の drift check を実行。統合点（Current state）の行アンカー・形を実ファイルで確認。

### Step 1: 定数・型・ルールレジストリ
Current state 2/3/4 と上記スニペットに従い `constants.ts`、`types.ts`
（`CheckSource` に `'keyboard-trap-check'` 追加 + 新型）、`rule-registry.ts`
（2 エントリ）を編集。ビルド: `npm run build --workspace @a11y-skills/audit` が
通ること。

### Step 2: normalizer + index export
`axe-format.ts` に `normalizeKeyboardTrapCheck` を追加し、`src/index.ts` の
axe-format export リストに加える。ビルド通過を確認。

### Step 3: runner 実装
`src/playwright/runKeyboardTrapCheck.ts` を上記アルゴリズム仕様で実装。
`runFocusIndicatorCheck.ts` を構造テンプレートにする。`playwright/index.ts` に
export を追加。ビルド通過を確認。

### Step 4: schema + cli + test-entry + exports
- `schemas/index.ts`: `KEYBOARD_TRAP_CHECK_RESULT_SCHEMA` を `buildEnvelopeSchema`
  で作り `RESULT_SCHEMAS` に登録（details は上記 4 フィールド）
- `cli.ts`: registry に `kind: 'browser'` エントリ追加（Current state 9）
- `src/test-entries/keyboard-trap-check.ts`: 薄いラッパー
- `package.json`: `exports` に `./test-entries/keyboard-trap-check`
- ビルド後の確認:

```sh
npm run build --workspace @a11y-skills/audit
node packages/a11y-audit/dist/cli.js --list-checks   # keyboard-trap-check が 11 個目に出る
```

### Step 5: フィクスチャでの動作確認（ローカル）
`test/fixtures/` に 3 つの HTML フィクスチャを追加（スパイク §2 を流用）:
`keyboard-trap-true.html`（focusout 再フォーカス型の真トラップ、Escape 処理なし）、
`keyboard-trap-modal.html`（`role=dialog aria-modal=true` + Escape で閉じる正しい
モーダル。ページロード時にモーダルを開いた状態にしておく）、
`keyboard-trap-none.html`（普通に並んだ button/input/a）。

```sh
for f in true modal none; do
  node packages/a11y-audit/dist/cli.js \
    --url "file://$PWD/packages/a11y-audit/test/fixtures/keyboard-trap-$f.html" \
    --checks keyboard-trap-check --output-dir /tmp/kt-$f; echo "[$f] exit=$?"
done
```

期待: `true` → exit 1（violations）、`modal` → exit 0（pass）、`none` → exit 0
（pass）。いずれも ERROR（exit 2）やハングを起こさないこと。

### Step 6: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）
2 つの CI スモーク（`a11y-audit-package` ジョブと `cli-integration` ジョブ）が
`--checks all` を `cli-smoke.html`（file://、`input` 1 個）に対して実行する。
新チェックがそこで ERROR/ハングしないことをローカルで再現:

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/kt-all 2>&1 | grep -E "keyboard-trap-check|Errors:"
echo "exit=$?"
# 期待: [keyboard-trap-check] DONE ...、Summary の Errors: 0、全体 exit=1
```

これが満たせない場合は STOP（CI を落とすため）。

### Step 7: テスト追加
- `test/smoke.spec.ts`: `runKeyboardTrapCheck` を import し 3 ケース追加
  （真トラップ → `result.violations` に `a11y-skills/no-keyboard-trap`、
  正しいモーダル → violations も needsReview も空（passes）、トラップなし → 同）。
  既存の focus テストが `data:text/html,` + `encodeURIComponent(FIXTURE)` を
  `targetUrl` に渡すパターンを踏襲（browser 所有チェックの呼び方）。
  ただし `setContent` 相当を data: URL で渡すと file: 判定が効かないため、
  data: URL では `networkidle` 経路を通る — フィクスチャは外部リソースを
  読まないので問題ない。
- `test/schema-validation.spec.ts`: `normalizeKeyboardTrapCheck` で作った
  エンベロープが `RESULT_SCHEMAS['keyboard-trap-check']` に valid であることを
  1 ケース追加（既存 focus の expectValid パターン）。

```sh
npm test --workspace @a11y-skills/audit   # 既存 + 新規すべて green
```

### Step 8: スキルドキュメント + CHANGELOG + ゲート
- `SKILL.md` / `SKILL.ja.md` のチェック表に 1 行追加（EN/JA）
- `CHANGELOG.md` に 0.5.0 Added エントリ
- ゲート:

```sh
npm run lint
npm run format:check
npm run build --workspace @a11y-skills/audit   # 最終ビルド
```

### Step 9: コミット
ブランチ `feat/keyboard-trap-check`。論理単位で分割コミット（①constants/types/registry、
②normalizer/schema、③runner、④cli/test-entry/exports、⑤tests/fixtures、
⑥skill docs/changelog）。各コミット末尾に
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。push・PR・バージョン
バンプはしない（レビュアー/オペレーターが扱う。リリースは 0.5.0 minor）。

## STOP conditions

- Step 6 で `--checks all` が `cli-smoke.html` に対して ERROR・ハング・exit 2 に
  なる（新チェックが既存 CI スモークを壊す — 最優先の不変条件）
- トラップフィクスチャに対して Tab ウォークがハングする（`networkidle` ではなく
  `waitUntil: 'load'` を file: で使っているか確認。それでも直らないなら STOP）
- 実装に既存チェック関数（`runFocusIndicatorCheck` 等）や既存型・既存スキーマの
  **変更**が必要になった（本チェックは追加のみで完結するはず）
- `count + 1` ウィンドウのトラップ検出が 3 フィクスチャを正しく分類できない
  （`true`→violation、`modal`→pass、`none`→pass のいずれかが外れる）
- schema 検証・lint・format・既存テストのいずれかが green にできない

## In scope (files)

- 新規: `src/playwright/runKeyboardTrapCheck.ts`、
  `src/test-entries/keyboard-trap-check.ts`、
  `test/fixtures/keyboard-trap-{true,modal,none}.html`
- 編集: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、
  `src/utils/axe-format.ts`、`src/index.ts`、`src/playwright/index.ts`、
  `src/schemas/index.ts`、`src/cli.ts`、`packages/a11y-audit/package.json`
  （exports のみ）、`packages/a11y-audit/CHANGELOG.md`、
  `test/smoke.spec.ts`、`test/schema-validation.spec.ts`、
  `skills/auditing-wcag/SKILL.md`、`skills/auditing-wcag/SKILL.ja.md`

## Out of scope (touch nothing here)

- 既存 10 チェックの runner / 既存 normalizer / 既存 schema / 既存 rule エントリ
- `package.json` の `version` フィールド（リリース時に別途 0.5.0）
- `.github/workflows/`（CI は `--checks all` のままで新チェックを自動的に拾う —
  ジョブ追加・変更は不要）
- `skills/auditing-wcag/references/*`（チェック表のあるのは SKILL.md。references
  の個別ファイルは 2.1.2 を扱っていないので触らない。drift check で確認）
- 他のスキル、ルート設定（eslint/prettier/tsconfig）

## 既知の制限（実装の docstring と CHANGELOG に明記）

設計 §3.5 / §4.4 のとおり、本チェックは検出できない:
- Shadow DOM 内のフォーカストラップ（`querySelectorAll` が貫通しない）
- iframe 内のトラップ（`document.activeElement` は `<iframe>` 要素を返す）
- `inert` の動的付与で作るトラップ
- SPA でウォーク中にフォーカス可能要素数が変わるケース

これらは runner のファイル先頭コメントに「Limitations」として列挙し、
真トラップ（violation）はレア・`incomplete`（needs-review）が人手レビューの
絞り込みに主価値、という設計の位置づけ（§4.2）を残す。

## Test plan

- **smoke**（`test/smoke.spec.ts`、Playwright、`dist/` を import）: 3 フィクスチャ
  で violation / pass / pass を確認。最低限のアサーション: 真トラップで
  `result.violations.some(r => r.id === 'a11y-skills/no-keyboard-trap')`、
  正しいモーダルで `result.violations` 空かつ `result.incomplete` 空、
  トラップなしで同。`result.summary.checkedNodes` がフォーカス可能要素数に一致。
- **schema**（`test/schema-validation.spec.ts`）: 新エンベロープが
  `RESULT_SCHEMAS['keyboard-trap-check']` に valid。
- **CI**: 既存の 2 スモークが `--checks all` で新チェックを自動的に通す（Step 6）。
  追加の CI ジョブは不要。

## Maintenance notes

- 将来 Tab ウォークを `runFocusIndicatorCheck` と共通化する余地あり（設計 §3.3、
  工数 M の 30% と見積もり）。今回は独立実装。
- `cli-integration` ジョブ（公開済みパッケージを使う）は **0.5.0 リリース後**に
  新チェックを `--checks all` で走らせるようになる。リリース前の PR CI では
  `a11y-audit-package` ジョブが `dist/` をビルドして `--checks all` を走らせるので
  そちらでカバーされる。
- 実サイトでの誤検知率は未確認（設計 §4.4）。リリース後に実サイト数件での
  smoke を推奨。
- `incomplete`（needs-review）が実運用で支配的になる見込み（設計 §4.2）。これは
  仕様どおりで、手動レビューの絞り込みが主価値。
