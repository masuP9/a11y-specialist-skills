# Plan 032: 要素 id をエスケープしてセレクタを作る（8 ファイル 9 か所）。不正なセレクタで focus-indicator-check 全体が落ちないようにする

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。`plans/README.md` は更新しない。
>
> **差分確認（最初に実行）**:
> `git diff --stat 3b7d8e1..HEAD -- packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts packages/a11y-audit/src/playwright/runZoomCheck.ts packages/a11y-audit/src/playwright/runTextSpacingCheck.ts packages/a11y-audit/src/playwright/runTimeLimitDetector.ts packages/a11y-audit/src/playwright/runAutocompleteAudit.ts packages/a11y-audit/src/playwright/runRedundantEntryCheck.ts packages/a11y-audit/src/utils/layout.ts packages/a11y-audit/src/detectors/pause-control.ts`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **Codex plan review**: 通過（1 巡目、2026-10-25、見送った low 0 件。medium 1 件「完了条件の grep が範囲外の `runContentOnHoverCheck.ts:730`（セレクタではない識別文字列）にも一致する」を反映: 対象を 8 ファイル 9 か所に限定し、完了条件からそのファイルを除いた）
- **優先度**: P1（React の `useId` が出す id を持つページで、検査が丸ごと ERROR になる）
- **工数**: S
- **リスク**: LOW（変わるのは、今すでに壊れている id のセレクタ文字列だけ）
- **依存**: なし
- **カテゴリ**: bug
- **計画時点**: commit `3b7d8e1`, 2026-10-25

## なぜ重要か

多くの検査はページの中（`page.evaluate`）で要素の CSS セレクタを作り、結果 JSON の `target` / `selector` に書く。その関数のうち 8 ファイル 9 か所が、id をそのまま `` `#${el.id}` `` に入れている。CSS では id が数字で始まる（`#1st`）、`:` や `.` や `[` や空白を含む（React 18 以降の `useId()` が出す `:r1:`、`user.name`）とき、そのままでは不正なセレクタになる。

実害は 2 段階ある。

1. 結果 JSON に書かれる `target` が、利用側（skill や人）が `document.querySelector` で要素を探し直すのに使えない。
2. **focus-indicator-check では検査そのものが落ちる**: フォーカスで遷移する要素（3.2.1 違反）のセレクタを `skipSelectors` に積み、再試行のときに `document.querySelector(sel)` を try/catch なしで呼ぶ（`runFocusIndicatorCheck.ts:517-519`）。そこで `SyntaxError` が投げられ、検査は ERROR、CLI は exit 2 になり、2.4.7 / 2.4.11 / 3.2.1 の結果が全部消える。

新しい検査（`runAccessibleAuthenticationCheck.ts:138-143` など 12 ファイル）は `CSS.escape` を使っていて、古い検査だけが取り残されている。

## 現状

### 直す 9 か所（8 ファイル、すべて `packages/a11y-audit/` 配下）

**対象外**: `src/playwright/runContentOnHoverCheck.ts:730` の `activeIdentity()` も `` `#${…id}` `` の形だが、これは CSS 検索に使わないフォーカス要素の識別文字列なので直さない。

| ファイル:行 | 今のコード |
|---|---|
| `src/playwright/runFocusIndicatorCheck.ts:1028` | `if (el.id) return \`#${el.id}\`;`（関数 `getSelector`） |
| `src/playwright/runZoomCheck.ts:87-89` | `if (element.id) { return \`#${element.id}\`; }`（関数 `getUniqueSelector`） |
| `src/playwright/runTextSpacingCheck.ts:80-82` | 同上 |
| `src/playwright/runTextSpacingCheck.ts:190-192` | 同上（同じファイルに 2 つ目のコピー） |
| `src/playwright/runTimeLimitDetector.ts:143-145` | 同上 |
| `src/playwright/runAutocompleteAudit.ts:108-110` | 同上 |
| `src/playwright/runRedundantEntryCheck.ts:198` | `if (element.id) return \`#${element.id}\`;` |
| `src/utils/layout.ts:68-70` | `if (element.id) { return \`#${element.id}\`; }`（reflow-check が使う） |
| `src/detectors/pause-control.ts:53-64` | 下の抜粋 |

`pause-control.ts:53-64`（2.2.2 の一時停止ボタンを探してクリックする）:

```ts
    const getSelector = (el: HTMLElement): string => {
      if (el.id) return `#${el.id}`;
      if (el.className) {
        const classes = el.className
          .toString()
          .split(' ')
          .filter((c) => c)
          .join('.');
        if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
      }
      return el.tagName.toLowerCase();
    };
```

ここは id だけでなく class も問題: 空白 1 種（半角スペース）でしか分割しないのでタブ・改行区切りの class が壊れ、Tailwind 風の `md:hidden` や `w-1/2` はエスケープなしだと不正。できたセレクタは後で `page.$(selector)` → `click()` に使われる（`pause-control.ts:210,222`）。

### 落ちる経路（focus-indicator-check）

`src/playwright/runFocusIndicatorCheck.ts:515-522`:

```ts
      // Mark elements that caused navigation violations (from previous attempts)
      if (skipSelectors.length > 0) {
        await page.evaluate((selectors) => {
          selectors.forEach((sel) => {
            const el = document.querySelector(sel);
            if (el) {
              el.setAttribute('data-focus-navigation-violation', '');
              (el as HTMLElement).tabIndex = -1; // Remove from tab order
```

`skipSelectors` に積むのは `:665` の `skipSelectors.push(culprit.selector);`。`culprit.selector` は上の `getSelector` の戻り値。

### 手本（そろえる先）

`src/playwright/runAccessibleAuthenticationCheck.ts:134-143`:

```ts
  // Like collectBasicFieldInfo() in runAutocompleteAudit.ts, except that an id
  // is used only when it is unique in the document (escaped so that it is valid
  // CSS), and the path always starts at body.
  function getUniqueSelector(element: Element): string {
    if (
      element.id &&
      document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1
    ) {
      return `#${CSS.escape(element.id)}`;
    }
```

`CSS.escape(':r1:')` は `\:r1\:` を返すので、セレクタは `#\:r1\:`、JSON の文字列としては `"#\\:r1\\:"` になる。

### テストの書き方（手本）

- fixture は `packages/a11y-audit/test/fixtures/pages/<check>/*.html`。worker ごとの HTTP サーバーで配られる（`test/helpers/fixtures.ts` の `baseUrl`）。
- 検査関数を直接呼ぶ spec の形は `test/focus-visibility.spec.ts:10-25`:

```ts
import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

test('…', async ({ browser, baseUrl }, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/visibility-clipped-nav.html`,
    outputDir: testInfo.outputDir,
  });
  const link = result.details.allElements.find((e) => e.tag === 'A');
  expect(link?.visibility).toEqual({ visible: false, reason: 'ancestor-overflow' });
});
```

- 任意の検査を名前で走らせるには `runFixtureCheck(checkName, fixtureRelPath, baseUrl, { page, browser, testInfo })`（`test/helpers/fixtures.ts:204`）。
- テスト名は日本語で「どんな条件で・何をすると・どうなるか」（`test/cli-concurrency.spec.ts` の既存テスト名を見本に）。
- 3.2.1 違反の fixture の見本: `test/fixtures/pages/focus-indicator/finding-context-change.html`（`<a id="trigger" href="#" onfocus="window.location.href = '/navigated'">`）。
- 3.2.1 の結果は `result.details.onFocusViolations[]`、要素は `.element.selector`（`src/types.ts:271-280, 254-258`）。
- autocomplete の候補報告の fixture の見本: `test/fixtures/pages/autocomplete/finding-missing.html`（`<input type="email" id="email" name="email" />` に autocomplete が無い → `a11y-skills/autocomplete-missing` が `incomplete`）。

## 方針

- 9 か所すべてで `` `#${CSS.escape(id)}` `` にする。**一意性チェック（`querySelectorAll(...).length === 1`）は今回は足さない**: 一意性で経路に落ちると `target` の形が変わり、既存 fixture の期待に影響しうる。エスケープだけなら、特殊文字を含まない id の出力は 1 文字も変わらない。
- `runFocusIndicatorCheck.ts:519` の `document.querySelector(sel)` を try/catch で包み、不正なセレクタは無視する（エスケープ後は起きないはずだが、二重の守り）。
- `pause-control.ts` の class は `split(/\s+/)` で分け、各トークンを `CSS.escape` してから `.` で結ぶ。
- ページ内ヘルパの一本化（19 か所の `getUniqueSelector` を 1 つに）は**やらない**（別件・工数 L）。

## 範囲

変更可:

- 上の表の 8 ファイル（`runTextSpacingCheck.ts` は 2 か所）
- `packages/a11y-audit/test/fixtures/pages/focus-indicator/finding-context-change-react-id.html`（新規）
- `packages/a11y-audit/test/fixtures/pages/autocomplete/finding-missing-react-id.html`（新規）
- `packages/a11y-audit/test/selector-escaping.spec.ts`（新規）
- `packages/a11y-audit/CHANGELOG.md`

範囲外:

- `CSS.escape` を既に使っている 12 ファイル
- `src/playwright/runContentOnHoverCheck.ts`（`:730` の `activeIdentity()` はセレクタではない）
- 一意性チェックの追加、ヘルパの共通化、`isVisible` の違いの統一
- README（出力の形は変わらないので記述の変更は不要）
- 版を上げるリリース（マージ後に別 PR）

## 使うコマンド

| 目的 | コマンド | 期待 |
|---|---|---|
| 1 spec だけ | `npm test --workspace @a11y-skills/audit -- test/selector-escaping.spec.ts` | ビルド後に実行、全部 pass |
| 全検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | すべて exit 0 |
| 整形 | `npx prettier --write <path>` | — |

## 手順

1. **失敗するテストを先に書く**（`test/selector-escaping.spec.ts`、fixture 2 つ）。実装前に走らせ、1 つ目が「検査が例外で落ちる（または `selector` が `#:r1:`）」で失敗することを確かめる。
   - `focus-indicator/finding-context-change-react-id.html`: `finding-context-change.html` を写し、リンクの id を `:r1:` に変える（`<a id=":r1:" href="#" onfocus="window.location.href = '/navigated'">`）。`<button id="safe">` はそのまま。
     - テスト 1「`:r1:` の id を持つリンクがフォーカスで遷移すると、検査は落ちずに 3.2.1 違反を 1 件報告し、selector は `#\\:r1\\:` になる」: `runFocusIndicatorCheck({ browser, targetUrl, outputDir })` が resolve する。`result.details.onFocusViolations` が 1 件で、`[0].element.selector` が `'#\\:r1\\:'`。`result.violations` に `a11y-skills/no-context-change-on-focus` がある。
   - `autocomplete/finding-missing-react-id.html`: `finding-missing.html` を写し、email 欄の id を `:r1:`、`<label for=":r1:">` にする（phone 欄は消してよい）。
     - テスト 2「`:r1:` の id を持つ入力欄に autocomplete が無いと、報告される target は `#\\:r1\\:` になる」: `runFixtureCheck('autocomplete-audit', 'autocomplete/finding-missing-react-id.html', baseUrl, { page, browser, testInfo })` の結果の `incomplete` から `a11y-skills/autocomplete-missing` を探し、`nodes[0].target[0]` が `'#\\:r1\\:'`。
   - 他の 7 か所は fixture を作らず、同じ 1 行の直しなので既存テスト（fixture-gallery）が通り続けることで確かめる。
2. **9 か所を直す。** 各箇所を `` `#${CSS.escape(el.id)}` ``（変数名は各ファイルに合わせる）にする。`runTextSpacingCheck.ts` は 2 か所とも。
3. **`runFocusIndicatorCheck.ts:519` を守る。** `document.querySelector(sel)` を try/catch で包み、catch では何もしない（コメントで「不正なセレクタは飛ばす」と書く）。
4. **`pause-control.ts` の class。** `.split(/\s+/)` → `.filter(Boolean)` → `.map((c) => CSS.escape(c))` → `.join('.')`。
5. **CHANGELOG**（Unreleased、Fixed）に 1 項目: 「特殊文字を含む id（React `useId` の `:r1:` など）のセレクタを `CSS.escape` で作る。focus-indicator-check がそのような要素の 3.2.1 違反で落ちなくなる。」（英語で、既存項目の調子に合わせる）
6. **検証**: 全検証コマンドがすべて exit 0。`npx prettier --write` で整形。

## 完了条件

- [ ] 次のコマンドが 0 件（`CSS.escape` を通さない `#${…id}` が、対象外の `runContentOnHoverCheck.ts` 以外に残っていない）:
  `git grep -nE '`#\$\{[a-zA-Z.]*id\}`' -- packages/a11y-audit/src ':!packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts'`
- [ ] `test/selector-escaping.spec.ts` の 2 テストが pass。
- [ ] 既存の fixture-gallery・focus-* の spec の期待を変えずに全テスト pass。
- [ ] CHANGELOG に項目があり、全検証コマンドが exit 0。

## STOP 条件

- 既存 fixture に特殊文字を含む id があって、エスケープ後に `target` の期待が変わる（期待を書き換えて通すのではなく報告する）。
- テスト 1 が実装後も落ちる（`querySelector` 以外の経路でも不正セレクタが使われている）。その経路を報告する。
- 差分確認で「現状」と食い違う。

## 保守メモ

- 今後セレクタを作る関数を新しい検査に書くときは `runAccessibleAuthenticationCheck.ts:138` の形（エスケープ＋一意性）を写す。
- 19 か所ある `getUniqueSelector` のコピーを 1 つの注入スクリプトにまとめる案は見送り中（工数 L、`target` の形が検査間で変わる）。利用者から「検査ごとにセレクタが違う」と言われたら再検討。
