# Plan 013: 非テキストのコントラスト (WCAG 1.4.11) チェック — 部品の境界とアイコンの比を機械で出す

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/66

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> があれば本プランのステータス行を更新する（無ければ何もしない）。
>
> **Drift check (run first)**:
> `git diff --stat 4fff965..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json skills/auditing-wcag .github/workflows/ci.yml`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比較してから
> 進む。構造的な不一致（`CHECK_REGISTRY` の形・`RULES` の形・`bucketize` /
> `toNode` のシグネチャ・`buildEnvelopeSchema` のシグネチャ・`createAuditOutput`
> の使い方の変化）は STOP。
> 別の作業（#62、plan 012 系）が先にマージされていた場合、`types.ts` / `constants.ts` /
> `rule-registry.ts` / `axe-format.ts` / `cli.ts` / `schemas` / `index.ts` / テストの
> 登録表 / ドキュメントの一覧に**新しい行が増えているだけ**なら構造的な不一致ではない。
> その行の後ろに本チェックを足す（チェック数・ルール数の数え直しを忘れない）。

> **番号について**: `plans/013-device-motion-check.md`（実装済みの旧プラン）と番号が
> 重なるが、依頼者の指定で `013-non-text-contrast-check.md` とした。参照するときは
> ファイル名まで書く。

## Status

- **Priority**: P2
- **Effort**: M（2〜3 日相当。背景色の決め方と、決まらないときの見分けが半分）
- **Risk**: LOW（新規チェックの追加のみで既存チェックには触れない。ページに
  イベントを送らず、`page.evaluate` 1 回で読むだけ。CI の `--checks all` スモークが
  新チェックを必ず通すが、`cli-smoke.html` の入力欄は既定の見た目なので pass で終わるはず）
- **Depends on**: なし（#62 とは同じファイルの末尾に行を足す点だけがぶつかる）
- **Category**: feature
- **Planned at**: commit `4fff965`, 2026-10-13
- **Consumer**: 下流の WCAG テスト管理ツール（関数 API で呼び、`details` を取り込む）。
  評価できていない達成基準の洗い出しで 1.4.11 が挙がった。画像から AI に比を
  読ませると誤るため、比は機械で出したい（Issue のメモ）。

## Why this matters

1.4.11（非テキストのコントラスト）は今すべて手動（`coverage-matrix` で `手動`、
「axe に該当ルールなし、CLI 未対応」）。しかも `automated-checks.md` には
「axe 非テキストコントラストルール」とあるが、axe-core にそのルールは無い（誤記）。

入力欄・チェックボックス・ラジオ・スイッチの**枠や塗り**と、その外側の背景の色は
計算済みスタイルから取れる。アイコンだけのボタンの**アイコンの色**も、インライン SVG
とアイコンフォント（`::before` の文字）なら取れる。これらから比を出し、3:1 未満を
候補として出す。背景が画像・グラデーション・半透明の重なりなどで色が決まらない
ものは「決められない」と明示して人に回す。

これを **19 個目のチェック `non-text-contrast-check`（SC 1.4.11）** とする。

### 色の計算を共通部品にする（2.4.13 で使い回すため）

コントラスト比の計算は今のパッケージに無い（`git grep -n -i -E 'contrast|luminance' -- packages/a11y-audit/src`
は `annotations.ts` のコメント 1 件だけ）。依存も `pixelmatch` / `pngjs`（optional）だけで、
色の変換に使えるものは無い。数式は短いので**依存を足さず** `src/utils/color.ts` に
純粋関数として書く。

- 引数は **0〜255 の sRGB の数値**（`{ r, g, b }`）にする。計算済みスタイルの色も、
  スクリーンショット（`pngjs` の画素）の色も同じ形で渡せるので、2.4.13（フォーカスの
  印のコントラスト、AAA）で印の画素と周りの画素の比を出すときにそのまま使える。
- CSS の色文字列の解釈は **Node 側でしない**。Chromium の計算済みスタイルは書かれ方に
  よって `oklch(0.7 0.1 200)` や `color(srgb 0.5 0 0.5)` をそのまま返す（計画時に確認、
  下記）。これを自前で解釈すると色空間の変換を全部書くことになるので、**ページ内で
  1×1 の canvas に塗って `getImageData` で sRGB の 4 バイトに直す**。
- 本プランで作るのは 1.4.11 だけ。2.4.13 のチェックは作らない。

## Current state（統合点 — `4fff965` で確認済み）

リポジトリは npm workspaces モノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` ビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース。以下のパスは断りがなければ `packages/a11y-audit/` からの相対。

### 計画時の試作で確かめたこと（Chromium、headless）

`page.setContent` したページで `getComputedStyle` の色と、canvas に塗って読み戻した値:

| 書いた色 | 計算済みスタイルの文字列 | canvas の `getImageData` |
|---|---|---|
| `background: oklch(0.7 0.1 200)` | `oklch(0.7 0.1 200)` | `[64, 177, 183, 255]` |
| `border-color: color-mix(in srgb, red 50%, blue)` | `color(srgb 0.5 0 0.5)` | `[128, 0, 128, 255]` |
| `background: rgba(0,0,0,.5)` | `rgba(0, 0, 0, 0.5)` | `[0, 0, 0, 128]` |
| `background: #fff8` | `rgba(255, 255, 255, 0.533)` | `[255, 255, 255, 136]` |
| `border: 2px solid transparent` | `rgba(0, 0, 0, 0)` | `[0, 0, 0, 0]` |

既定の見た目の部品（スタイル指定なし）:

| 要素 | `appearance` | 枠（top） | 背景 |
|---|---|---|---|
| `<input>` | `auto` | `2px inset rgb(118, 118, 118)` | `rgb(255, 255, 255)` |
| `<input type="checkbox">` | `auto` | `0px none` | `rgba(0, 0, 0, 0)`（**箱の描画は計算済みスタイルに出ない**） |
| `<select>` | `auto` | `1px solid rgb(118, 118, 118)` | `rgb(239, 239, 239)` |
| `<button>` | `auto` | `2px outset rgb(0, 0, 0)` | `rgb(239, 239, 239)` |
| `body` | — | — | `rgba(0, 0, 0, 0)` |

canvas の変換関数（試作で動いたもの。ページ内関数にこの形で書く）:

```js
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 1;
const ctx = canvas.getContext('2d', { willReadFrequently: true });
function toRgba(css) {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}
```

### 新チェック追加の統合点（直近の前例: pointer-gesture-check, #95）

`pointer-gesture-check`（`kind: 'page'`、遷移済み `page` を受け、`page.evaluate` で
ページを走査する）が最も近い見本。runner の形は `src/playwright/runPointerGestureCheck.ts`
を見ること（先頭コメントに Limitations、`createAuditOutput` → `buildAuditResult` →
`out.header` → `out.summary` → `out.issueList` → `out.save` → `out.outputPaths()`、:536-676）。
ページ内関数は import できないので、`scopeSelector` / `safeOuterHTML` / `isVisible` は
`runPointerGestureCheck.ts:142-190` から**コピーする**（同ファイル :121-124 のコメントと同じ断り書きを付ける）。

1. `src/types.ts` — `CheckSource` ユニオン（:21-39、末尾が `| 'focus-order-check';`）に追加。details 型もここ。
2. `src/constants.ts` — 新定数。`HTML_SNIPPET_MAX_LENGTH` は既存。結果ファイル名は
   `DEFAULT_FOCUS_ORDER_RESULT_FILE`（:975）の後ろに。
3. `src/utils/rule-registry.ts` — `RULES`（:41-505）。末尾 `// --- focus-order-check ---`（:477-504）の後ろに追加。
4. `src/utils/axe-format.ts` — `bucketize(buckets, key, nodes, applicable, override?)`（:99）、
   `toNode(el, failureSummary)`（:134。`el` は `{ selector, html?, htmlTruncated?, tagName?, tag? }`）。
   normalizer は `normalizeFocusOrderCheck`（:1325）の後ろ、`normalizeAxeRule`（:1519）より前に置く。
5. `src/utils/color.ts`（新規）— 色の純粋関数。`src/utils/focus-order.ts`（純粋関数 `analyzeFocusOrder`
   を持ち、`src/index.ts:42-46` で export、`test/focus-order-analysis.spec.ts` がブラウザ無しで
   `../dist/index.js` から import して試す）が見本。
6. `src/index.ts` — `./utils/color.js` の export を追加、axe-format の export リスト（:55-72）に normalizer を追加。
7. `src/playwright/index.ts` — runner と Options 型の export（:75-81 の形）。
8. `src/schemas/index.ts` — `buildEnvelopeSchema` で schema を作り（見本 `FOCUS_ORDER_CHECK_RESULT_SCHEMA` :1583）、
   `RESULT_SCHEMAS`（:1653〜）末尾に登録。
9. `src/cli.ts` — `CHECK_REGISTRY`（:66〜）末尾、`focus-order-check`（:271〜）の後ろに
   `kind: 'page'` のエントリ（lazy import。`pointer-gesture-check` :259〜 が同形）。
10. `src/test-entries/non-text-contrast-check.ts`（新規）— `src/test-entries/pointer-gesture-check.ts` と同形:

    ```ts
    import { test } from '@playwright/test';
    import { runPointerGestureCheck } from '../playwright/runPointerGestureCheck.js';
    import { requireTargetUrl } from '../utils/test-harness.js';
    import { gotoAndSettle } from '../playwright/gotoAndSettle.js';

    test('pointer gesture check (WCAG 2.5.1 / 2.5.7)', async ({ page }) => {
      await gotoAndSettle(page, requireTargetUrl());
      await runPointerGestureCheck({ page });
    });
    ```
11. `package.json` — `exports` に `./test-entries/non-text-contrast-check`（`focus-order-check` の後ろ）、
    `description` のチェック列挙の末尾（`... pointer gestures, focus order).`）に `non-text contrast` を追記、
    `keywords` に `non-text-contrast`。
12. テスト: `test/helpers/fixtures.ts`（`buildRunnerRegistry` :44〜、:135 の focus-order の後ろに
    `kind: 'page-current'`。`pointer-gesture-check` :131 と同形）、`test/fixture-gallery.spec.ts`
    （`MANIFEST` :56〜、冒頭コメント :2「all 18 checks」:13「all 32 custom finding-capable rules」→ 19 / 34）、
    `test/rule-classification.spec.ts`（`FINDING_EXPECTATIONS`）、`test/schema-validation.spec.ts`。
    フィクスチャは `test/fixtures/pages/non-text-contrast/*.html`。テストは `../dist/...` から import する
    （`pretest` が build する）。spec の形は `test/pointer-gesture.spec.ts` を見本に
    （`runFixtureCheck` を包む関数、normalizer の no-browser テスト、Ajv で schema 検証）。
13. ドキュメント（Step 7 に詳細）: `README.md` / `README.ja.md`、`CHANGELOG.md`
    （`## Unreleased` → `### Added` が既にある）、`TODO-COVERAGE.md`（JA のみ）、
    `skills/auditing-wcag/SKILL.md` / `SKILL.ja.md`、`references/coverage-matrix.md` / `.ja.md`、
    `references/automated-checks.md` / `.ja.md`（:68 の誤記の訂正）。

### CI

`.github/workflows/ci.yml:111-118` が `dist/cli.js --url file://.../cli-smoke.html --checks all`
を実行し、exit code 1 と `Errors: +0` を要求する。`cli-smoke.html` には既定の見た目の
`<input type="text" id="name-field">` しか無い（枠 `rgb(118,118,118)` / 背景白 → 比 4.54）ので、
本チェックは `non-text-contrast-boundary` が passes、`non-text-contrast-icon` が inapplicable で
終わるはず（Step 6 で確認）。

## Commands you will need

リポジトリルートで実行する（worktree では `npm --prefix <worktree> run <script>`）。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| Full test suite | `npm test` | all pass |
| New specs only | `npm test --workspace @a11y-skills/audit -- test/color.spec.ts test/non-text-contrast.spec.ts` | all pass |
| List checks | `node packages/a11y-audit/dist/cli.js --list-checks` | 末尾が `non-text-contrast-check` |
| 整形 | `npx prettier --write <path>` | — |
| 全体検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/utils/color.ts`、`src/playwright/runNonTextContrastCheck.ts`、
  `src/test-entries/non-text-contrast-check.ts`、
  `test/color.spec.ts`、`test/non-text-contrast.spec.ts`、
  `test/fixtures/pages/non-text-contrast/*.html`（Step 3 の一覧）
- 編集（追加のみ）: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、
  `src/utils/axe-format.ts`、`src/index.ts`、`src/playwright/index.ts`、
  `src/schemas/index.ts`、`src/cli.ts`、`package.json`（`exports` / `description` / `keywords` のみ）、
  `test/helpers/fixtures.ts`、`test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、
  `test/schema-validation.spec.ts`
- ドキュメント: 統合点 13 のファイル

**Out of scope**:

- 2.4.13（フォーカスの印のコントラスト）のチェック・`runFocusIndicatorCheck.ts` の変更。
  `color.ts` を使えるようにするだけ。
- 既存チェックの runner・normalizer・schema・rule。
- ホバー・フォーカス・選択済みなど**状態ごとの見た目**（読み込んだときの見た目だけを見る）。
- グラフ・図など、部品以外の意味のある図形（1.4.11 の「グラフィカルオブジェクト」）。
- チェックボックスの**チェックの印**やスイッチのつまみなど、部品の中の部分ごとの比。
- iframe・shadow root の中の部品（主文書の light DOM だけ）。
- 新しい依存の追加。
- `package.json` の `version`、プラグイン 4 フィールドの version（リリース PR で別途）。
- `.github/workflows/`。

## Git workflow

- ブランチ: worktree のブランチをそのまま使う（`/ship-plan` が PR を作る）
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`）:
  1. `feat(a11y-audit): add color contrast utilities`
  2. `feat(a11y-audit): add non-text contrast types, constants, rules, normalizer and schema`
  3. `feat(a11y-audit): add non-text-contrast-check runner (1.4.11)`
  4. `feat(a11y-audit): register non-text-contrast-check in CLI and exports`
  5. `test(a11y-audit): add non-text contrast specs and fixtures`
  6. `docs: document non-text-contrast-check (1.4.11)`
- 公開リポジトリなので、コミットされる文面に下流の利用者のツール名・サービス名を
  書かない（「downstream consumer」と書く）。

## 設計

### A. 色の純粋関数（`src/utils/color.ts`）

```ts
/** An sRGB color with 0–255 channels (fractions allowed after compositing). */
export interface RgbColor { r: number; g: number; b: number; }
/** RgbColor with alpha 0–1. */
export interface RgbaColor extends RgbColor { a: number; }

/** Paint `top` over an opaque `bottom` (source-over). */
export function compositeOver(top: RgbaColor, bottom: RgbColor): RgbColor;

/**
 * Paint `layers` (nearest first) over `base`: the farthest layer is painted
 * first. Returns `base` when `layers` is empty.
 */
export function compositeLayers(layers: readonly RgbaColor[], base: RgbColor): RgbColor;

/** WCAG 2.x relative luminance (sRGB, linearization threshold 0.04045). */
export function relativeLuminance(c: RgbColor): number;

/** WCAG 2.x contrast ratio, 1–21, not rounded. Order of arguments does not matter. */
export function contrastRatio(a: RgbColor, b: RgbColor): number;

/** Round a ratio DOWN to 2 decimals for display (2.996 → 2.99, never 3.00). */
export function floorRatio(ratio: number): number;

/** '#rrggbb' (channels rounded and clamped to 0–255). */
export function toHexColor(c: RgbColor): string;
```

- `relativeLuminance`: 各チャンネル `c / 255` を `c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`、
  `0.2126 R + 0.7152 G + 0.0722 B`。
- `contrastRatio`: `(L1 + 0.05) / (L2 + 0.05)`（L1 が大きいほう）。
- **閾値の比較は丸める前の値で行う**（`ratio < 3`）。2.996 は 3 未満。表示・details には `floorRatio` の値。
- 白: `export const WHITE: RgbColor = { r: 255, g: 255, b: 255 };`（ページの土台の色）。
- `src/index.ts` から上の関数・型・`WHITE` を export する（2.4.13 で使うため。JSDoc に
  「pngjs の画素もこの形で渡せる」と書く）。

### B. 対象の部品の見つけ方（ページ内 `page.evaluate`、主文書の light DOM のみ）

`document.querySelectorAll(NON_TEXT_CONTRAST_SELECTOR)` を文書順に走査し、`kind` を付ける
（上から順に最初に当たったもの）:

| kind | 条件 |
|------|------|
| `switch` | `role="switch"`（`input[type=checkbox][role=switch]` を含む） |
| `checkbox` | `input[type=checkbox]`、`role="checkbox"` |
| `radio` | `input[type=radio]`、`role="radio"` |
| `text-input` | `textarea`、`select`、`input` で `type` が `NON_TEXT_CONTRAST_TEXT_INPUT_TYPES` に含まれる（`type` 属性が無い・知らない値は `text` 扱い＝`el.type` を見る）、`role` が `textbox` / `searchbox` / `combobox` |
| `icon-button` | `button`、`role="button"` で、`innerText.trim() === ''` かつアイコンの元（下記 D）が 1 つ以上あるか、`svg` / `img` を子孫に持つ |

- `NON_TEXT_CONTRAST_SELECTOR`（定数）:
  `'input, textarea, select, button, [role="switch"], [role="checkbox"], [role="radio"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="button"]'`
- `NON_TEXT_CONTRAST_TEXT_INPUT_TYPES`（定数）:
  `['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'datetime-local', 'month', 'time', 'week']`
- どの kind にも当たらないもの（`input[type=hidden|submit|button|reset|image|file|range|color]`、文字のあるボタンなど）は対象外（数えない）。
- **除外**（数えない・details に載せない）: `el.matches(':disabled')`、`el.closest('[aria-disabled="true"]')`、
  `el.closest('[inert]')`、`!isVisible(el)`（`getClientRects().length > 0` かつ `visibility !== 'hidden'`）。
  無効な部品は 1.4.11 の例外（inactive）。
- 上限 `NON_TEXT_CONTRAST_MAX_COMPONENTS = 300`。それを超えた分は測らない。
  `componentCounts: { found, kept }`（`found` は除外の後で kind が付いた数、`kept = min(found, 300)`）。
- 各部品について記録: `selector`（`scopeSelector` のコピー）、`html` / `htmlTruncated`
  （`safeOuterHTML` のコピー）、`kind`、下記 C / D の生データ。

### C. 背景の色の決め方（ページ内で生データを集め、Node 側で合成する）

ページ内関数 `layersFrom(start: Element | null)` を 1 つ書き、部品の外側（`start = el.parentElement`）と
アイコンの背景（D）の両方で使う。祖先を 1 つずつ上がり（`parentElement`）、各要素の計算済み
スタイルを見る:

1. 次のどれかに当たったら `blockedBy` を返して止める（**色が決まらない**）:
   - `backgroundImage !== 'none'` → `'background-image'`（画像・グラデーション）
   - `Number(opacity) < 1` → `'opacity'`
   - `filter !== 'none'`、`backdropFilter !== 'none'`、`mixBlendMode !== 'normal'` → `'filter'`
2. `toRgba(backgroundColor)` の `a > 0` なら `layers` に積む（近い順）。
3. `a === 1`（不透明）なら止める（`blockedBy: null`）。
4. まだ不透明な層が無いまま `position` が `absolute` / `fixed` の要素を**通り過ぎる**なら
   `'out-of-flow'` で止める（その下に描かれているのは祖先ではないかもしれないため）。
   この判定は 2・3 の後（その要素自身の背景が不透明なら 3 で止まっていて問題ない）。
5. 根（`html`）まで不透明な層が無ければ、`html` の計算済み `colorScheme` に `dark` が含まれるとき
   `'color-scheme'`（キャンバスの既定色が白でない）で止める。それ以外は土台を白とする。

返り値 `{ layers: RgbaColor[], blockedBy: NonTextContrastUndeterminedReason | null }`。
Node 側で `blockedBy === null` なら `compositeLayers(layers, WHITE)` が**外側の色**。

部品そのものについても同じ 1 の判定をする（部品自身の `backgroundImage` / `opacity` / `filter`）。
当たれば `undetermined`（理由は同じ値）。

### D. 測るもの（Node 側。ページ内では生データだけ集める）

**境界の部品（`text-input` / `checkbox` / `radio` / `switch`）**

ページ内で集める: 部品の `backgroundColor`（rgba）、`backgroundClip`、4 辺それぞれの
`border-*-width`（px の数値）・`border-*-style`・`border-*-color`（rgba）、`appearance`、
`accentColor`、`boxShadow !== 'none'`、`outlineStyle !== 'none'`。

1. **UA が描く部品**: `kind` が `checkbox` / `radio` / `switch` で要素が `input`、かつ
   `appearance !== 'none'` のとき:
   - `accentColor === 'auto'` → `status: 'user-agent'`（測らない。著者が見た目を変えていない
     UA の部品は 1.4.11 の例外。node にしない）
   - それ以外 → `status: 'undetermined'`、`undeterminedReason: 'accent-color'`
2. 外側の色 `outer` が決まらなければ `undetermined`（理由は C の `blockedBy`）。
3. `fill = compositeOver(background, outer)`。
4. **指標**（`indicators`）を作る:
   - 背景: `background.a > 0` なら `{ part: 'background', color: fill, against: outer }`。
   - 枠: 各辺で `width > 0` かつ style が `none` / `hidden` でなく、色の `a > 0` のとき
     `{ part: 'border-top' | ..., color: compositeOver(border, backgroundClip === 'border-box' ? fill : outer), against: outer }`。
   - 各指標に `ratio = contrastRatio(color, against)`。
5. 指標が 0 個 → `status: 'no-boundary'`（枠も塗りも無い）。
6. `best = max(ratio)`。`best < NON_TEXT_CONTRAST_MIN_RATIO`（3）→ `status: 'low'`、それ以外 `'pass'`。
   （枠か塗りのどれか 1 つが外側と 3:1 あれば部品の範囲は分かる、という判断。下線だけの
   入力欄は下の枠だけで pass になる。）
7. `otherVisuals`: `boxShadow` / `outline` が有れば `['box-shadow', 'outline']` の該当分。
   判定には使わない（色を取らない）が、`low` / `no-boundary` の説明文で「他の見た目で
   範囲を示しているかもしれない」と添える。

**アイコンだけのボタン（`icon-button`）**

ボタンの範囲（枠）は 1.4.11 で求められないので、**アイコンの色**を測る。ページ内で集めるアイコンの元
（ボタンとその子孫。最大 `NON_TEXT_CONTRAST_MAX_ICON_PARTS = 20` 要素まで）:

| 元 | 色の取り方 | 背景 |
|----|-----------|------|
| インライン `svg` の図形（`path, circle, rect, ellipse, line, polyline, polygon, text, use`） | 計算済み `fill` と `stroke`（`none` と `a === 0` は除く。`stroke` は `strokeWidth` が 0 なら除く）。`url(` で始まる（グラデーションなど）→ `undetermined: 'svg-paint-server'` | `layersFrom(svg.parentElement)` |
| 文字のある `::before` / `::after`（`content` が `none` / `normal` / `""` 以外） | その疑似要素の計算済み `color`（`getComputedStyle(el, '::before').color`） | `layersFrom(el)`（疑似要素の背景は見ない） |
| `img`、`svg` の中の `image`、ボタンや子孫の `backgroundImage !== 'none'`、`input[type=image]` | 色は取れない → `undetermined: 'image-icon'` | — |

- アイコンの元が 1 つも無い（`svg` も疑似要素の文字も画像も無い）ボタンは `icon-button` にしない（B の条件）。
- 各色について `ratio = contrastRatio(compositeOver(color, bg), bg)`（`bg` は表の背景を C の方法で合成した色。
  決まらなければ `undetermined`、理由は `blockedBy`）。指標の `part` は `'icon'`。
- 画像の元と色の取れる元が混ざっていれば、**色の取れる元だけで判定**し、`best >= 3` なら `pass`、
  そうでなければ `undetermined: 'image-icon'`（画像のほうが見分けの役をしているかもしれない）。
- `best = max(ratio)`。`best < 3` → `'low'`、それ以外 `'pass'`。アイコンの一部が薄くても、
  最も濃い部分が 3:1 あれば形は分かる、という判断（候補を絞りすぎない向き）。
- `otherVisuals` はアイコンでは常に `[]`。

### E. 型（`src/types.ts`）

```ts
export type NonTextContrastComponentKind =
  | 'text-input'
  | 'checkbox'
  | 'radio'
  | 'switch'
  | 'icon-button';

export type NonTextContrastUndeterminedReason =
  | 'background-image'
  | 'opacity'
  | 'filter'
  | 'out-of-flow'
  | 'color-scheme'
  | 'accent-color'
  | 'svg-paint-server'
  | 'image-icon';

export interface NonTextContrastIndicator {
  part:
    | 'background'
    | 'border-top'
    | 'border-right'
    | 'border-bottom'
    | 'border-left'
    | 'icon';
  /** '#rrggbb' after compositing over what is behind it. */
  color: string;
  /** '#rrggbb' of the adjacent color it is compared with. */
  against: string;
  /** Contrast ratio rounded down to 2 decimals. */
  ratio: number;
}

export interface NonTextContrastComponent {
  selector: string;
  html: string;
  htmlTruncated: boolean;
  kind: NonTextContrastComponentKind;
  /**
   * pass: best indicator ≥ threshold. low: below. no-boundary: no border or
   * background to measure. undetermined: a color could not be decided.
   * user-agent: native control drawn by the browser, not measured (exception).
   */
  status: 'pass' | 'low' | 'no-boundary' | 'undetermined' | 'user-agent';
  /** Set only when status is 'undetermined'. */
  undeterminedReason: NonTextContrastUndeterminedReason | null;
  /** Highest indicator ratio (rounded down); null when there are no indicators. */
  bestRatio: number | null;
  indicators: NonTextContrastIndicator[];
  otherVisuals: ('box-shadow' | 'outline')[];
}

export interface NonTextContrastCheckDetails {
  /** Minimum ratio used (3). */
  threshold: number;
  components: NonTextContrastComponent[];
  componentCounts: { found: number; kept: number };
}

export type NonTextContrastCheckResult =
  AuditCheckResult<NonTextContrastCheckDetails>;
```

`CheckSource` に `'non-text-contrast-check'` を追加。

### F. ルール（`src/utils/rule-registry.ts`、`// --- non-text-contrast-check ---`）

| key | id | classification | scope | impact |
|-----|----|----|----|----|
| `non-text-contrast-boundary` | `a11y-skills/non-text-contrast-boundary` | `incomplete` | node | `serious` |
| `non-text-contrast-icon` | `a11y-skills/non-text-contrast-icon` | `incomplete` | node | `serious` |

どちらも `sc: ['1.4.11']`、`tags: ['a11y-skills', 'wcag21aa', 'wcag1411']`、
`helpUrl: \`${UNDERSTANDING}/non-text-contrast.html\``。

- **incomplete にする根拠**（ルールのコメントに書く）: 色は祖先の背景から決めており、
  兄弟要素の重なり（絶対配置でない重なり・`z-index`）や `box-shadow`・画像による境界は
  見ていない。部品の範囲を示すのが枠や塗りでなく別の手がかり（配置・文字）である場合や、
  見た目が UA の既定のままである場合は 1.4.11 を満たしうる。分類の方針（`rule-registry.ts:8-13`:
  死角が無く例外が当てはまり得ないものだけ violation）に従う。
- `description` / `help`:
  - boundary: `'Ensure the visual boundary of form controls has a contrast ratio of at least 3:1 with adjacent colors'` /
    `'Give inputs, checkboxes, radio buttons and switches a border or background with at least 3:1 contrast against what surrounds them'`
  - icon: `'Ensure icons in icon-only buttons have a contrast ratio of at least 3:1 with their background'` /
    `'Make the icon of an icon-only button contrast at least 3:1 with the button background'`

### G. 定数（`src/constants.ts`、`// --- Non-text contrast (WCAG 1.4.11) ---` の節を作る）

```ts
/** WCAG 1.4.11: minimum contrast ratio for UI component boundaries and icons. */
export const NON_TEXT_CONTRAST_MIN_RATIO = 3;
export const NON_TEXT_CONTRAST_SELECTOR = '…'; // 設計 B の値
export const NON_TEXT_CONTRAST_TEXT_INPUT_TYPES: readonly string[] = [ … ]; // 設計 B の値
/** Components measured per page; the rest are counted in componentCounts.found only. */
export const NON_TEXT_CONTRAST_MAX_COMPONENTS = 300;
/** Elements inside one icon-only button that are examined for icon colors. */
export const NON_TEXT_CONTRAST_MAX_ICON_PARTS = 20;
export const DEFAULT_NON_TEXT_CONTRAST_RESULT_FILE = 'non-text-contrast-result.json';
```

### H. runner `runNonTextContrastCheck`（`src/playwright/runNonTextContrastCheck.ts`）

```ts
export interface RunNonTextContrastCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
}
```

- `kind: 'page'`。スクリーンショットは撮らない。イベントを送らず、ページを書き換えない
  （canvas は DOM に挿入しない）。`url` は開始時の `page.url()`。
- 1 回の `page.evaluate(scanNonTextContrast, { selector, textInputTypes, maxComponents, maxIconParts, htmlSnippetMaxLength })`
  でページ内の生データ（B・C・D の「ページ内で集める」もの）を返し、Node 側の
  `measureComponent(raw): NonTextContrastComponent` で D の判定をする。`measureComponent` は
  runner ファイル内の非 export 関数でよい（テストはフィクスチャ経由）。
- `buildAuditResult({ source: 'non-text-contrast-check', url, details, buckets: normalizeNonTextContrastCheck(details) })`
  → `out.header('Non-text Contrast Results', 'WCAG 1.4.11', url)` → `out.summary({ Components: kept, Low: …, Undetermined: … })`
  → `out.issueList`（`low` / `no-boundary` / `undetermined` の部品を `selector [kind] status best=…`）
  → `out.save(result)` → `out.outputPaths()`。
- ファイル先頭コメントに目的・判定・Limitations（Maintenance notes の既知の制限）を書く。

### I. normalizer（`normalizeNonTextContrastCheck`、`src/utils/axe-format.ts`）

`checkedNodes = components.length`。node は `toNode(component, summary)`。

- **`non-text-contrast-boundary`**: 対象は `kind !== 'icon-button'` の部品。
  `applicable = 対象のうち status !== 'user-agent' が 1 つ以上`。
  node にするのは `low` / `no-boundary` / `undetermined`。summary:
  - low: `` `Best contrast of the ${kindLabel} boundary is ${bestRatio}:1 (${describeIndicators}), below 3:1.${others}` ``
    （`describeIndicators` は例 `border-bottom #cccccc vs #ffffff 1.6:1, background #ffffff vs #ffffff 1:1` のように全指標を並べる。
    `others` は `otherVisuals` が有れば ` It also has ${otherVisuals.join(' and ')}, which was not measured; check whether that marks the boundary.`）
  - no-boundary: `` `The ${kindLabel} has no border or background to mark its boundary.${others} Check whether its extent is identifiable without one.` ``
  - undetermined: `` `Contrast of the ${kindLabel} could not be measured (${reasonText}). Check manually.` ``
  - 1 つも node が無く applicable → passes。
- **`non-text-contrast-icon`**: 対象は `kind === 'icon-button'`。`applicable = 対象が 1 つ以上`。
  node は `low` / `undetermined`。summary:
  - low: `` `Best contrast of the icon is ${bestRatio}:1 (${describeIndicators}), below 3:1.` ``
  - undetermined: 同上の形。
- `kindLabel`: `text-input` → `text field`、`checkbox` → `checkbox`、`radio` → `radio button`、
  `switch` → `switch`、`icon-button` → `icon button`。
- `reasonText`: `background-image` → `background image or gradient`、`opacity` → `opacity below 1`、
  `filter` → `filter or blend mode`、`out-of-flow` → `positioned over content that is not its ancestor`、
  `color-scheme` → `dark color-scheme without a background`、`accent-color` → `native control with accent-color`、
  `svg-paint-server` → `SVG gradient or pattern`、`image-icon` → `icon is an image`。
- 部品が 0 件なら 2 ルールとも inapplicable。

### J. schema

`NON_TEXT_CONTRAST_CHECK_RESULT_SCHEMA` を `buildEnvelopeSchema` で作る。details の `required` は
型の全フィールド、`kind` / `status` / `undeterminedReason`（`null` を含む）/ `part` / `otherVisuals` の要素は `enum`、
`color` / `against` は `pattern: '^#[0-9a-f]{6}$'`、`ratio` / `threshold` は `number`、`bestRatio` は `['number', 'null']`、
`componentCounts` の 2 つは `integer`（`minimum: 0`）。既存 schema（例 `FOCUS_ORDER_STOP_SCHEMA` :1481）の
書き方（`additionalProperties` の扱いなど）に合わせる。`RESULT_SCHEMAS` に `'non-text-contrast-check'` で登録。

## Steps

### Step 0: Drift check

冒頭の drift check を実行。#62 が先にマージ済みなら、Current state の行番号は
ずれている前提で、各ファイルの「末尾の登録」の位置を探し直す。

### Step 1: 色の純粋関数（テスト先行）

1. `test/color.spec.ts` を先に書く（`test/focus-order-analysis.spec.ts` の形。`../dist/index.js` から import、
   ブラウザ不要）。1 テスト 1 振る舞い、入力と期待値はテストの中に直接書く:
   - 黒と白の比は 21
   - 同じ色どうしの比は 1
   - 引数の順を入れ替えても比は同じ（`#767676` と白）
   - `#767676` と白の比は 4.54 以上 4.55 未満
   - `#cccccc` と白の比を `floorRatio` すると 1.6
   - `floorRatio(2.996)` は 2.99（3 に切り上げない）
   - `relativeLuminance` は黒で 0、白で 1
   - `compositeOver({0,0,0,a:0.5}, 白)` の各チャンネルは 127.5
   - `compositeLayers([{255,255,255,a:0.5}, {0,0,0,a:0.5}], 白)` は、遠い層（黒 50%）を先に塗るので 191.25
   - `compositeLayers([], 白)` は白
   - `toHexColor({ r: 127.5, g: 0, b: 255.4 })` は `#8000ff`
2. `npm test --workspace @a11y-skills/audit -- test/color.spec.ts` を実行し、**ビルドは通るが
   `contrastRatio` などが export されていない**ことによる失敗であることを確かめる。
3. `src/utils/color.ts` を設計 A で実装し、`src/index.ts` から export。

**Verify**: `npm test --workspace @a11y-skills/audit -- test/color.spec.ts` → all pass。

### Step 2: 型・定数・ルール・normalizer・schema・export

設計 E・F・G・I・J。`src/index.ts` の axe-format export に `normalizeNonTextContrastCheck`、
型の export（`NonTextContrast*` を `types.ts` から export しているリストがあればそこへ）。

**Verify**: `npm run typecheck` → exit 0、`npm run build --workspace @a11y-skills/audit` → exit 0。

### Step 3: フィクスチャとテスト（テスト先行）

`test/fixtures/pages/non-text-contrast/` に作る。各ファイル冒頭の HTML コメントに意図と期待結果。
`body` は明示しない限り背景なし（＝白の土台）。

| fixture | 中身 | 期待 |
|---|---|---|
| `low-border.html` | `<input style="border:1px solid #ccc; background:#fff">` | `low`、`bestRatio` 1.6、boundary が incomplete |
| `good-border.html` | `<input style="border:1px solid #767676">`、`<input type="checkbox" style="appearance:none;width:16px;height:16px;border:2px solid #595959">` | 2 つとも `pass`、boundary が passes |
| `underline.html` | `<input style="border:0;border-bottom:2px solid #767676;background:transparent">` | `pass`、指標は `border-bottom` の 1 つだけ |
| `fill-only.html` | `<input style="border:0;background:#e0e0e0">` と `<input style="border:0;background:#595959;color:#fff">` | 1 つ目 `low`、2 つ目 `pass`（指標 `background`） |
| `no-boundary.html` | `<input style="border:0;background:transparent">` | `no-boundary`、`bestRatio: null`、boundary が incomplete |
| `translucent.html` | `<div style="background:rgba(0,0,0,.5);padding:8px"><input style="border:1px solid #808080;background:transparent"></div>` と、白の上の `<input style="border:1px solid rgba(0,0,0,.2)">` | 1 つ目は外側が `#808080` 付近（合成）で `low`、2 つ目は枠が `#cccccc` 付近で `low`（合成が効いていることの確認） |
| `oklch.html` | `<input style="border:2px solid oklch(0.4 0 0)">` | `pass`（計算済みスタイルが `oklch(...)` でも測れる） |
| `gradient.html` | `<div style="background:linear-gradient(#fff,#000)"><input></div>` | `undetermined`、`background-image` |
| `opacity.html` | `<div style="opacity:.5"><input style="border:1px solid #000"></div>` | `undetermined`、`opacity` |
| `out-of-flow.html` | 黒い `div` の上に、背景なしの `position:absolute` の `div` で包んだ入力欄を重ねる | `undetermined`、`out-of-flow` |
| `dark-scheme.html` | `<meta name="color-scheme" content="dark">`、背景指定なしで `<input style="border:1px solid #777">` | `undetermined`、`color-scheme` |
| `native-controls.html` | 既定の `<input type="checkbox">` と `<input type="radio">`、`accent-color:#ccc` の checkbox | 既定の 2 つは `user-agent`、accent の 1 つは `undetermined`（`accent-color`） |
| `native-only.html` | 既定の checkbox と radio だけ | boundary が inapplicable（`user-agent` のみ） |
| `icon-low.html` | `<button aria-label="閉じる" style="background:#fff;border:0"><svg viewBox="0 0 10 10" width="20" height="20"><path d="M0 0L10 10" stroke="#bbb" stroke-width="2"/></svg></button>` | icon が incomplete、`low` |
| `icon-good.html` | 同じ形で `style="color:#333"`、`stroke="currentColor"` | icon が passes |
| `icon-font.html` | `<button aria-label="検索"><span class="i"></span></button>`、`.i::before { content: "\2715"; color: #ddd }`、ボタンは `background:#fff;border:0` | `low`（疑似要素の色が取れる） |
| `icon-image.html` | `<button aria-label="設定"><img src="data:image/gif;base64,…" alt=""></button>` | `undetermined`、`image-icon` |
| `excluded.html` | 枠 `#eee` の `disabled` な入力欄、`display:none` の入力欄、`aria-disabled="true"` の `role=checkbox`、文字のあるボタン | `components` が 0 件、2 ルールとも inapplicable |
| `none.html` | 見出しと段落だけ | 2 ルールとも inapplicable、`componentCounts` が `{ found: 0, kept: 0 }` |
| `many.html` | スクリプトで `<input style="border:1px solid #ccc">` を 310 個作る | `componentCounts` が `{ found: 310, kept: 300 }`、`components.length` 300 |

`test/non-text-contrast.spec.ts` を先に書く（`test/pointer-gesture.spec.ts` の形。`helpers/fixtures.js` の
`test` / `runFixtureCheck` を使う）。上の期待を 1 テスト 1 振る舞いで確かめる。加えて:

- normalizer の no-browser テスト（手組み details）: `low` の summary に比と `below 3:1` を含む、
  `otherVisuals: ['box-shadow']` のとき summary に `box-shadow` を含む、部品 0 件で 2 ルールとも inapplicable。
- 全フィクスチャの結果がエンベロープの schema（`RESULT_SCHEMAS['non-text-contrast-check']`）に valid。
- 検査の前後で `document.body.innerHTML` が変わらない（`low-border.html` で確認。canvas を挿入しない）。

フィクスチャ側の失敗理由が「`non-text-contrast-check` が `buildRunnerRegistry` に無い」ことを
確かめてから Step 4 へ。

### Step 4: runner・CLI・test-entry・exports

- `src/playwright/runNonTextContrastCheck.ts` を設計 B〜D・H で実装。
- `src/playwright/index.ts` に runner と Options 型の export。
- `src/cli.ts` の `CHECK_REGISTRY` 末尾に `kind: 'page'` エントリ。
- `src/test-entries/non-text-contrast-check.ts`、`package.json` の `exports` / `description` / `keywords`。
- `test/helpers/fixtures.ts` の `buildRunnerRegistry` に `kind: 'page-current'` で登録。

**Verify**: Step 3 の spec が green。`node packages/a11y-audit/dist/cli.js --list-checks` の末尾が `non-text-contrast-check`。

### Step 5: 既存テストの更新

- `test/fixture-gallery.spec.ts`: MANIFEST に `low-border.html`（`'a11y-skills/non-text-contrast-boundary': 'incomplete'`）、
  `good-border.html`（boundary `'passes'`）、`icon-low.html`（`'a11y-skills/non-text-contrast-icon': 'incomplete'`）、
  `icon-good.html`（icon `'passes'`）、`none.html`（2 ルール `'inapplicable'`）。冒頭コメントを
  19 checks / 34 rules に（#62 が先に入っていれば、その分を足して数え直す）。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に 2 ルール分（既存の書き方に合わせる）。
- `test/schema-validation.spec.ts`: 手組み details（5 種の kind・5 種の status を含む）が valid、
  `color: 'red'`（`#rrggbb` でない）が invalid。

**Verify**: `npm test` → 全 green。

### Step 6: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/claude-ntc-all > /tmp/claude-ntc-all.log 2>&1; echo "exit=$?"
grep -E "non-text-contrast-check|Errors:" /tmp/claude-ntc-all.log
# 期待: [non-text-contrast-check] DONE ...、Errors: 0、exit=1（axe 由来）
```

あわせて `/tmp/claude-ntc-all/non-text-contrast-result.json` の `#name-field` が `pass`（`bestRatio` 4.54）であること。
満たせなければ STOP。

### Step 7: ドキュメント

日本語を先に書き、英語を同期する。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表（`focus-order-check` の行 :129 の後ろ）に 1 行:
  `| \`non-text-contrast-check\` | 1.4.11 | 入力欄・チェックボックス・ラジオ・スイッチの枠や塗りと外側の色の比、アイコンだけのボタンのアイコンの比（3:1 未満と測れないものを候補に。要確認） |`
  / `| ... | 1.4.11 | Contrast of input, checkbox, radio and switch borders or fills against the surrounding color, and of icons in icon-only buttons (below 3:1 or not measurable; needs review) |`
- `references/coverage-matrix.ja.md` / `.md`: 1.4.11 行（:29）を
  `| 1.4.11 | 自動の候補+手動 | \`non-text-contrast-check\` **[CLI]** + スクショ | 部品の境界・アイコンが3:1未満でFail。状態ごとの見た目・グラフ・画像の背景は手動 |`
  （EN: `| 1.4.11 | Automated candidates + manual | ... | Fail if a component boundary or icon is below 3:1. States, charts and image backgrounds are manual |`）に。
  「基準 × チェック名 × 出力ファイル」表（:90〜）の SC 順の位置（1.4.10 の後）に
  `| 1.4.11 | \`non-text-contrast-check\` | \`non-text-contrast-result.json\` |`。
- `references/automated-checks.ja.md` / `.md` :68 の「axe非テキストコントラストルール」（axe に無い）を
  `` `non-text-contrast-check` [CLI]（部品の境界・アイコンだけのボタン） `` に直す。
- `packages/a11y-audit/TODO-COVERAGE.md`（JA のみ）: 「部分的に自動化可能」節に 1.4.11 の節を
  2.4.3 の節（:224）の書式で追加し、実装状況の表（:290 付近）に 1 行。
- `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表（JA :16-35）に
  `| \`runNonTextContrastCheck\` | 1.4.11 非テキストのコントラスト（入力欄などの枠・塗り、アイコンだけのボタンのアイコン。候補として報告） |`、
  チェック名一覧（JA :227 付近）・test entry の列挙（JA :480 付近）に追記、検査の段落（JA :142 付近、focus-order の段落の後）に
  何を見るか・`user-agent` を報告しない理由・決められない理由の一覧・主文書のみ・状態は見ない、を書く。
  色の純粋関数（`contrastRatio` など）を export したことも 1 行。
- `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` の `### Added` に新チェック・2 ルール・
  `contrastRatio` などの export・既知の制限。**`package.json` の version は変えない**。

**Verify**: `npm run validate:skills && npm run lint && npm run format:check`

### Step 8: 全体検証とコミット

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
を通し、Git workflow のとおりコミット。

## Test plan

- **`test/color.spec.ts`**: 比・相対輝度・合成・丸め・16 進の変換（ブラウザ不要）。
- **`test/non-text-contrast.spec.ts`**: 20 フィクスチャで部品の分類・除外・枠/塗り/下線の指標・
  半透明の合成・`oklch` の変換・決められない 6 種・UA の部品・アイコン（SVG / 疑似要素 / 画像）・
  上限・ページを書き換えないこと・schema を検証。
- **fixture-gallery / rule-classification / schema-validation**: 既存の枠組みに登録。
- **CI**: `--checks all` スモークが新チェックを自動で通す（Step 6）。

## Done criteria

ALL must hold:

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` exit 0
- [ ] `--list-checks` の末尾が `non-text-contrast-check`
- [ ] Step 6 のスモークで `[non-text-contrast-check] DONE`、`Errors: 0`、exit 1
- [ ] 既存 runner（`src/playwright/run*.ts` の既存ファイル）に差分がない（`git diff --stat 4fff965 -- packages/a11y-audit/src/playwright` が新規ファイルと `index.ts` だけ）
- [ ] `package.json` の `dependencies` / `optionalDependencies` / `devDependencies` が未変更
- [ ] 日英ドキュメントがペアで更新されている（SKILL / coverage-matrix / automated-checks / README）
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更

## STOP conditions

- 既存チェックの挙動・型・schema・rule を変えなければならなくなった
- canvas の読み戻しが CI（GitHub Actions の ubuntu、headless Chromium）で `oklch.html` を測れない
  （値が全部 0 になるなど。色の変換の前提が崩れる）
- `native-controls.html` で既定のチェックボックスの `appearance` が `auto` 以外になる、または
  既定の入力欄の枠が `rgb(118, 118, 118)` 以外になる（UA の前提が崩れる。テストの期待値を
  勝手に合わせず報告）
- Step 6 で `--checks all` が ERROR・ハング・exit 2 になる、または `cli-smoke.html` の入力欄が `pass` にならない
- 新しい依存を足さないと実装できないと判断した
- schema 検証・lint・format・既存テストのいずれかが green にできない

## Maintenance notes

- **既知の制限**（runner 先頭コメントと CHANGELOG・README に記載）:
  - 読み込んだときの見た目だけを見る。ホバー・フォーカス・選択済み・エラー表示などの状態ごとの
    見た目は見ない。検査の時点でフォーカスのある部品は、フォーカスの見た目で測られる。
  - 外側の色は**祖先の背景色**から決める。祖先でない要素との重なり（`z-index`、負のマージン、
    `transform` での移動）は見ない。背景なしの絶対配置・固定配置を通るときだけ `out-of-flow` で止める。
  - `box-shadow` や `outline` で描いた枠、`border-image`、疑似要素で描いた枠は色を取らない
    （`otherVisuals` に有無だけ残す）。
  - `inset` / `outset` などの枠の立体表現は、計算済みの枠の色 1 色として扱う。
  - UA が描く既定のチェックボックス・ラジオは測らない（`user-agent`）。`accent-color` を変えたものは
    `undetermined`。既定の入力欄・`select` は計算済みの枠の色で測る（既定では 3:1 を満たす）。
  - アイコンは SVG の図形の `fill` / `stroke` と疑似要素の文字色だけ。画像・CSS の背景画像のアイコンは
    `undetermined`。アイコンの一部の色が薄くても、最も濃い部分で判定する。
  - チェックボックスのチェックの印・スイッチのつまみなど、部品の中の部分どうしの比は見ない。
  - 主文書の light DOM だけ。iframe・shadow root の中は見ない。部品は 300 個まで。
  - グラフ・図など部品以外のグラフィカルオブジェクトは見ない。
- **2.4.13 で使い回すとき**: `src/utils/color.ts` の `contrastRatio` / `compositeOver` /
  `floorRatio` は `{ r, g, b }`（0〜255）を受けるので、`pngjs` の画素（`data[i], data[i+1], data[i+2]`）を
  そのまま渡せる。フォーカスの前後のスクリーンショットの差分の画素と、その周りの画素の比を
  出す形になるはず。ページ内の `toRgba`（canvas）と `layersFrom` は runner 内の関数なので、
  2.4.13 で計算済みスタイルの色を使うなら、そのときにコピーするか共通化を考える（今は 1 か所でしか使わない）。
- **分類**: どちらのルールも incomplete。violation に上げるなら、重なり・状態・`box-shadow` の死角を
  消す別の設計（スクリーンショットの画素で外側の色を確かめるなど）が要る。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit` を minor、
  スキル文書が変わるのでプラグインも minor に上げ、4 フィールドを揃える。
- レビュアーは特に、(1) 閾値の比較が丸める前の値か、(2) 半透明の層の合成順（遠い層が先）、
  (3) `user-agent` で報告しない条件が広すぎないか、(4) 決められないときに `pass` にしていないか、を見ること。
