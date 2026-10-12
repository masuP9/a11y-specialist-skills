# Plan 012: 冗長な入力 (WCAG 3.3.7) の候補を拾うチェックの実装

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/70

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。`plans/README.md` は作らない・
> 触らない。完了したら本ファイルの Status に `- **Progress**: DONE` を 1 行足す。
>
> **Drift check (run first)**:
> `git diff --stat 69b4049..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json skills/auditing-wcag .github/workflows/ci.yml`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比較してから
> 進む。構造的な不一致（`runAutocompleteAudit` の関数構成・`CHECK_REGISTRY` の形・
> `RULES` の形・`buildEnvelopeSchema` のシグネチャの変化）は STOP。

## Status

- **Priority**: P3
- **Effort**: M（2〜3 日相当。同じ目的の欄を束ねる解析が中心）
- **Risk**: LOW（新規チェックの追加のみ。既存チェックの出力は変えない。ただし
  CI の `--checks all` スモークが新チェックを必ず通るため、`cli-smoke.html` で
  ERROR・ハングを起こすと CI が落ちる）
- **Depends on**: なし
- **Category**: feature
- **Planned at**: commit `69b4049`, 2026-10-13

## Why this matters

WCAG 3.3.7（冗長な入力）は、同じ手順の中で一度入力した情報をもう一度入力させては
いけない、という基準。静的なキャプチャからは「再入力を求めている」と言い切れない
（同じ情報が必要かどうか、自動で写す手段があるかは画面の意味を読まないと決まらない）。
しかし 1 ページの中に **同じ情報を求める欄が重なっている**（`autocomplete` の値が
同じ、`name` やラベルが「お届け先」「請求先」のように対になっている）ことは機械で
拾え、そこが人や AI が見るべき場所になる。

そこで `@a11y-skills/audit` に 13 個目のチェック `redundant-entry-check`（SC 3.3.7）
を足す。重なった欄を **候補（incomplete）** として報告し、近くに「請求先と同じ」の
ような自動で写す手段・選ぶ手段がありそうかを `details` に添える。現状 3.3.7 は
完全に手動項目なので、人手レビューの絞り込みが主な価値。

## 範囲

- **範囲内**: 1 ページ（読み込み済みの現在のページ）の中で、同じ form に属する欄の重なり。
- **範囲外（明記）**: **手順が複数ページに分かれるフォーム**。1 ページのチェックでは
  前のページの入力を知り得ないので扱わない。README・runner 先頭コメント・CHANGELOG・
  スキル文書に「複数ページに分かれる手順は範囲外」と書く。
- 結果は常に **`incomplete`**（violation にはしない）。理由: 3.3.7 には例外（再入力が
  必須の場合、セキュリティ、以前の情報が無効になった場合）があり、自動で写す手段が
  別の仕組みで用意されているかも機械では確定できない。

## Current state（`69b4049` で確認済み）

リポジトリは npm workspaces モノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` ビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース。

### 流用元: autocomplete チェック

`src/playwright/runAutocompleteAudit.ts`（`runAutocompleteAudit({ page, outputDir })`。
呼び出し側が遷移済みの `page` を渡す `kind: 'page'` 型）:

- `collectBasicFieldInfo`（:72）— ブラウザ内で `input, select, textarea` を列挙
  （`hidden/submit/reset/button/image/file`、disabled、readonly を除く）。`selector`、
  `name`、`id`、`placeholder`、`autocomplete` などを返す。**非公開（export なし）**。
- `parseAccessibleName`（:168）、`findPatternMatch`（:178、`name`→`id`→ラベル→
  `placeholder` の順に `AUTOCOMPLETE_FIELD_PATTERNS` を当てる）、
  `autocompleteTokens`（:207）、`isValidAutocompleteTokens`（:227）— いずれも非公開。
- 各欄のラベルは `page.locator(selector).ariaSnapshot()` から取る（:326）。
- `src/constants.ts:358` `AUTOCOMPLETE_FIELD_PATTERNS`（目的トークン → 正規表現。
  **文字列全体に一致する `^…$`** なので `shipping_address` のような接頭辞付きは当たらない）、
  `:414〜` トークン一覧、`:483` `DEFAULT_AUTOCOMPLETE_RESULT_FILE`。

### 新チェック追加の統合点（autocomplete-audit と同じ 12 か所）

1. `src/types.ts:21-32` `CheckSource` ユニオン（末尾に `'redundant-entry-check'` を追加）。
   details 型は autocomplete の節（:630〜）の後ろに新節を追加。
2. `src/constants.ts` — 新定数（autocomplete 定数群 :483 の後ろ）。
3. `src/utils/rule-registry.ts` — `RULES`（autocomplete-audit は :201〜）。`RuleMeta`
   （:18）。2.2 で足された基準のタグは `wcag22aa` のように `wcag22` + レベル
   （例 :73 `['a11y-skills', 'wcag22aa', 'wcag2411']`）。3.3.7 は A なので
   `['a11y-skills', 'wcag22a', 'wcag337']`。
4. `src/utils/axe-format.ts` — normalizer を追加。見本は `normalizeAutocompleteAudit`
   （:504）。`toNode(el, summary)`（:113）、`bucketize`（:78: applicable=false →
   inapplicable、nodes=[] → passes、それ以外 → レジストリの classification）。
5. `src/index.ts:45` 付近 — axe-format の export リストに normalizer を追加。
6. `src/playwright/index.ts:39-41` — runner と Options 型の export を追加。
7. `src/schemas/index.ts` — `buildEnvelopeSchema`（:156）で作り、`RESULT_SCHEMAS`
   （:882 付近）に登録。見本は `AUTOCOMPLETE_AUDIT_RESULT_SCHEMA`（:618）。
8. `src/cli.ts` — `CHECK_REGISTRY`（:66〜）の `autocomplete-audit`（:131-142、
   `kind: 'page'`）と同形のエントリを末尾に追加。
9. `src/test-entries/redundant-entry-check.ts`（新規）— `autocomplete-audit.ts` と同形の
   薄いラッパー（`gotoAndSettle` → runner）。
10. `packages/a11y-audit/package.json` — `exports` に
    `./test-entries/redundant-entry-check`（`types` / `import`）、`description`（:4）に
    `redundant entry` を追加。
11. テスト: `test/helpers/fixtures.ts`（`buildRunnerRegistry` :44〜。autocomplete は
    :85 で `kind: 'page-current'`）、`test/fixture-gallery.spec.ts`（`MANIFEST`、冒頭
    コメントの「all 12 checks」「all 22 custom finding-capable rules」を更新）、
    `test/rule-classification.spec.ts`（`FINDING_EXPECTATIONS` 末尾）、
    `test/schema-validation.spec.ts`（手組み details の例）。
    フィクスチャは `test/fixtures/pages/<check>/*.html`、`test/helpers/static-server.ts`
    が HTTP 配信する。
12. ドキュメント: `packages/a11y-audit/README.md` / `README.ja.md`（検査一覧の表
    :15-28 付近、`### Available check names`）、`packages/a11y-audit/CHANGELOG.md`
    （`## Unreleased` の `### Added`）、`skills/auditing-wcag/SKILL.md` / `SKILL.ja.md`
    （CLI チェック表 :117-123 付近）、`references/coverage-matrix.md` / `.ja.md`
    （:72 の 3.3.7 行、:86-99 の CLI チェック表）、`references/manual-checks.md` /
    `.ja.md`（3.3.7 の節。`.ja.md:52-55`）、`packages/a11y-audit/TODO-COVERAGE.md`
    （日本語のみ）。

### CI

`.github/workflows/ci.yml` の `a11y-audit-package` ジョブが
`dist/cli.js --url file://.../cli-smoke.html --checks all` を実行し、exit code 1 と
`Errors: +0` を要求する。`cli-smoke.html` は `<img>` と `<input type="text">` 1 個だけ。
新チェックは自動的にここを通る。

### リポジトリ規約（AGENTS.md）

- スキル文書は日英同期、**日本語（`.ja.md`）が正本**。日本語を先に直して英語へ。
- プラグイン版は 4 フィールドで揃える（CI が検査）。本 PR では変えない。
- 公開リポジトリなので、コミットされる文面（コード、コメント、CHANGELOG、README、
  プラン、コミットメッセージ、PR 本文）に **利用側のツール名・サービス名・下流のリポジトリ名**
  を書かない。「下流の利用者」と書く。

## Commands you will need

リポジトリルート（worktree）で実行する。worktree では `npm --prefix <worktree> run <script>`。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm ci` | exit 0 |
| Browsers (once) | `npx playwright install chromium`（`packages/a11y-audit` で） | exit 0 |
| Typecheck | `npm run typecheck --workspace @a11y-skills/audit` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| Full test suite | `npm test --workspace @a11y-skills/audit` | all pass（pretest が build） |
| New spec only | `npm test --workspace @a11y-skills/audit -- test/redundant-entry.spec.ts` | all pass |
| List checks | `node packages/a11y-audit/dist/cli.js --list-checks` | 13 行、末尾が `redundant-entry-check` |
| Lint / format | `npm run lint` / `npm run format:check` | exit 0 |
| Skill docs | `npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/playwright/runRedundantEntryCheck.ts`、
  `src/test-entries/redundant-entry-check.ts`、
  `test/fixtures/pages/redundant-entry/{clear,finding-scoped,finding-names,finding-repeated}.html`、
  `test/redundant-entry.spec.ts`
- 編集: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、
  `src/utils/axe-format.ts`、`src/index.ts`、`src/playwright/index.ts`、
  `src/schemas/index.ts`、`src/cli.ts`、`packages/a11y-audit/package.json`
  （`exports` と `description` のみ）、`test/helpers/fixtures.ts`、
  `test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、
  `test/schema-validation.spec.ts`
- **`src/playwright/runAutocompleteAudit.ts` への最小の変更のみ**: 下記の関数・型に
  `export` を付ける。`BasicFieldInfo` に新しい欄を足す（Step 3）。**autocomplete-audit の
  出力（`AutocompleteIssue`、結果 JSON、バケット）は 1 バイトも変えない。**
- ドキュメント: Current state の 12 に挙げたファイル

**Out of scope**（触らない）:

- 手順が複数ページに分かれるフォーム（上記「範囲」）
- autocomplete-audit の判定ロジック・既存の他チェックの runner・normalizer・schema・rule
- `packages/a11y-audit/package.json` の `version`、プラグイン 4 フィールドの version
  （リリース PR で別途バンプ）
- `plans/README.md`、他のプラン
- 実際に画面を操作して「同じ」チェックボックスを押し、値が写るかを確かめること
  （本チェックは DOM を読むだけ。押下は人か AI に回す）

## Git workflow

- ブランチ: `feat/issue-70-redundant-entry`（作成済み）
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`）:
  1. `feat(a11y-audit): add redundant entry types, constants and rule`
  2. `feat(a11y-audit): add redundant entry normalizer and schema`
  3. `feat(a11y-audit): add redundant entry runner (3.3.7)`
  4. `feat(a11y-audit): register redundant-entry-check in CLI and exports`
  5. `test(a11y-audit): add redundant entry fixtures and specs`
  6. `docs: document redundant-entry-check (3.3.7)`
- 各コミット末尾にセッションの規定どおり `Co-Authored-By:` 行を付ける。
- PR 本文に `Closes #70`。バージョンバンプはしない。

## 設計

### 用語

- **目的（purpose）**: 欄が求める情報の種類。`autocomplete` の欄名トークン
  （`street-address`、`email` など）で表す。
- **範囲（scope）**: `shipping` / `billing` / なし。
- **同じ目的の欄のグループ**: 同じ form（`el.form`。無ければページ全体）の中で、
  同じ `section-*`（無ければ「なし」同士）、同じ目的を持つ欄が 2 つ以上あるもの。

### アルゴリズム（`runRedundantEntryCheck({ page, outputDir })`）

`runAutocompleteAudit` と同じく、呼び出し側が遷移済みの `page` を渡す。

**1. 欄の収集**

`collectBasicFieldInfo` を `export` して流用し、ラベルは autocomplete と同じく
`ariaSnapshot()` から取る（`parseAccessibleName` を `export`）。`BasicFieldInfo` に次の
2 欄を足す（ブラウザ内で計算）:

- `formSelector: string | null` — `el.form` のセレクタ（`id` があれば `#id`、無ければ
  同ファイルの `getUniqueSelector` と同じ作り方）。form に属さなければ `null`。
- `groupLabel: string | null` — 最も近い `fieldset > legend` のテキスト、無ければ
  最も近い `[role=group|region][aria-label]` または `aria-labelledby` の参照先テキスト
  （80 文字で切る）。範囲（shipping/billing）の推定にだけ使う。

`input[type=checkbox|radio]` は候補の欄から除く（グループ化で同名ラジオが重複する
ため。「同じ」チェックボックスは別途コピー手段として探す）。

**2. 目的と範囲の決定**（欄ごと）

- `autocompleteTokens(field.autocomplete)` が `isValidAutocompleteTokens` を満たす
  （export する）とき: 目的 = 最後の欄名トークン（`webauthn` を除く。連絡先種別
  `home/work/…` は目的に含めない）、範囲 = `shipping` / `billing` トークン、
  section = `section-*` トークン。`on` / `off` のみのときは次の推定へ進む。
- 上で目的が決まらないとき: 名前・id・ラベル・placeholder から推定する。**先に範囲の
  語を取り除いてから** `AUTOCOMPLETE_FIELD_PATTERNS` を当てる（`shipping_address` →
  `address`、`お届け先住所` → `住所`）。取り除く語は新定数
  `REDUNDANT_ENTRY_SCOPE_PATTERNS`（下記）。取り除いたあとの前後の `-_ .:：` を trim する。
  範囲は、取り除いた語から決める。名前・id・ラベルに無ければ `groupLabel` から決める。
- 目的が決まらない欄はグループ化の対象外。
- **目的が `new-password` / `current-password` / `one-time-code` の欄は対象外**
  （確認用の再入力は 3.3.7 の例外にあたる。セキュリティ）。

**3. グループ化と種別**

キー = `(formSelector, section, 目的)`。サイズ 2 以上のグループを候補にする。
グループの `kind`:

- `scoped` — 範囲が `shipping` と `billing` のように異なる欄を含む。
- `repeated` — それ以外（同じ範囲・範囲なしで同じ目的が 2 回出る。例: メールアドレスと
  メールアドレス（確認））。

欄は DOM 順に並べる。

**4. 自動で写す手段・選ぶ手段の探索**

グループごとに、同じ form（無ければページ全体）の中の次の要素を探す:
`input[type=checkbox|radio]`、`button`、`select`、`[role=button|checkbox|switch]`。
その表示テキスト（`<label>` / `aria-label` / `value` / `textContent`、80 文字で切る）が
新定数 `REDUNDANT_ENTRY_COPY_CONTROL_PATTERN` に当たったものを `copyControls` に
入れる。**見つかっても結果は incomplete のまま**（実際に値が写るかは確かめない）。
`select` は、`option` のテキストが当たるものも対象にする（保存済みの住所を選ぶ方式）。

**5. 結果組み立て**

`details`:

```ts
{
  totalFieldsChecked: number;     // 候補の欄の総数（Step 1 の欄）
  fieldsWithPurpose: number;      // 目的が決まった欄の数
  groups: RedundantEntryGroup[];  // サイズ 2 以上のグループ
}
```

`buckets.checkedNodes = totalFieldsChecked`、`applicable = totalFieldsChecked > 0`。
normalizer は、グループごとに **2 つ目以降の欄**を node にする（`toNode`）。
summary 例（英語。既存の normalizer と同じ）:

- `scoped` で `copyControls` あり:
  `` `Field asks for "${purpose}" again (${scopeA} / ${scopeB}); the first is ${firstSelector}. A control that may copy or select the earlier value was found: ${copyControl.selector} ("${text}"). Verify it fills this field, or whether an exception to 3.3.7 applies.` ``
- `copyControls` なし:
  `` `Field asks for "${purpose}" again (first: ${firstSelector}). No control that copies or selects the earlier value was found nearby. Verify whether the user must re-enter it, or whether an exception to 3.3.7 applies (essential, security, no longer valid).` ``

`bucketize(buckets, 'redundant-entry', nodes, applicable)`。

`out.header('Redundant Entry Check Results', 'WCAG 3.3.7', url)`、`out.summary`、
`out.issueList`、`out.save`、`out.outputPaths()` の順で、autocomplete の runner と同じ
流れにする（`createAuditOutput` の `quiet` / `writeResult` を必ず尊重）。
runner 先頭コメントに「Limitations」を列挙する（下記 Maintenance notes）。

### 定数（`src/constants.ts` の autocomplete 定数群の後ろ）

```ts
/** WCAG 3.3.7: words marking a field as shipping- or billing-specific (stripped before purpose matching). */
export const REDUNDANT_ENTRY_SCOPE_PATTERNS = {
  shipping:
    /(shipping|ship[-_ ]?to|deliver(?:y|[-_ ]?to)|お届け先?|配送先?|送付先?|お送り先)/gi,
  billing: /(billing|bill[-_ ]?to|invoice|ご?請求先?)/gi,
} as const;
/** Visible text of a control that probably copies or selects an earlier entry. */
export const REDUNDANT_ENTRY_COPY_CONTROL_PATTERN =
  /(same as|same address|use (the )?(shipping|billing)|copy|identical|autofill|saved address|同じ|同一|同上|コピー|転記|自動入力|保存済み)/i;
/** Purposes whose repeated entry is allowed (security exception). */
export const REDUNDANT_ENTRY_EXEMPT_PURPOSES = [
  'new-password',
  'current-password',
  'one-time-code',
] as const;
export const DEFAULT_REDUNDANT_ENTRY_RESULT_FILE = 'redundant-entry-result.json';
```

（正規表現の `g` フラグを `.test()` に使うと `lastIndex` が残るので、`replace` にだけ使い、
検出には別に作った非 `g` の複製か `matchAll` を使う。実装時に確かめること。）

## Steps

### Step 0: Drift check

冒頭の drift check を実行。Current state の行アンカーと形を実ファイルで確認。

### Step 1: 型・定数・ルール

- `src/constants.ts` に上記の定数を追加。
- `src/types.ts`: `CheckSource` に `'redundant-entry-check'` を追加し、autocomplete 節の後ろに
  新節を追加:

```ts
export interface RedundantEntryField {
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
  inputType: string;
  name: string | null;
  id: string | null;
  labelText: string | null;
  autocomplete: string | null;
  /** Autofill field name (e.g. 'street-address'). */
  purpose: string;
  purposeSource: 'autocomplete' | 'name' | 'id' | 'label' | 'placeholder';
  scope: 'shipping' | 'billing' | null;
  section: string | null;
  formSelector: string | null;
}

export interface RedundantEntryCopyControl {
  selector: string;
  tagName: string;
  text: string;
}

export interface RedundantEntryGroup {
  purpose: string;
  formSelector: string | null;
  kind: 'scoped' | 'repeated';
  /** DOM order; always 2 or more. */
  fields: RedundantEntryField[];
  copyControls: RedundantEntryCopyControl[];
}

export interface RedundantEntryCheckDetails {
  totalFieldsChecked: number;
  fieldsWithPurpose: number;
  groups: RedundantEntryGroup[];
}

export type RedundantEntryCheckResult =
  AuditCheckResult<RedundantEntryCheckDetails>;
```

- `src/utils/rule-registry.ts`: `RULES` に追加（autocomplete-audit の節の後ろ）:

```ts
// --- redundant-entry-check ---
'redundant-entry': {
  id: 'a11y-skills/redundant-entry',
  sc: ['3.3.7'],
  tags: ['a11y-skills', 'wcag22a', 'wcag337'],
  impact: 'moderate',
  scope: 'node',
  description: 'Ensure information already entered in the same page is not requested again',
  help: 'Provide a way to copy or select earlier entries, or confirm an exception applies',
  helpUrl: `${UNDERSTANDING}/redundant-entry.html`,
  // Whether re-entry is required, and whether an exception applies (essential,
  // security, no longer valid), needs a human; multi-page flows are out of scope.
  classification: 'incomplete',
},
```

**Verify**: `npm run typecheck --workspace @a11y-skills/audit` → exit 0。

### Step 2: normalizer・schema・export

- `src/utils/axe-format.ts` に `normalizeRedundantEntryCheck(details)` を追加
  （`normalizeAutocompleteAudit` と同形）。`src/index.ts` の export に追加。
- `src/schemas/index.ts`: `REDUNDANT_ENTRY_CHECK_RESULT_SCHEMA` を `buildEnvelopeSchema` で
  作る。details の `required` は `totalFieldsChecked` / `fieldsWithPurpose` / `groups`。
  `groups.items` は `purpose`・`kind`（`enum: ['scoped','repeated']`）・`fields`・
  `copyControls` を必須にし、`fields.items` の `scope` は
  `enum: ['shipping','billing', null]`、`formSelector` / `section` / `name` / `id` /
  `labelText` / `autocomplete` は `['string','null']`。`RESULT_SCHEMAS` に
  `'redundant-entry-check'` を登録。

**Verify**: build → exit 0。

### Step 3: runner

1. `runAutocompleteAudit.ts`: `collectBasicFieldInfo`、`parseAccessibleName`、
   `findPatternMatch`、`autocompleteTokens`、`isValidAutocompleteTokens`、`BasicFieldInfo`
   に `export` を付ける。`BasicFieldInfo` に `formSelector` / `groupLabel` を足し
   （上記）、`collectBasicFieldInfo` の中で埋める。`FieldInfo` / `AutocompleteIssue` には
   **足さない**。
2. `src/playwright/runRedundantEntryCheck.ts` を上記「設計」で実装。
   `RunRedundantEntryCheckOptions extends AuditOutputOptions`（`page`）。
   `src/playwright/index.ts` に export を追加。

**Verify**: typecheck と build → exit 0。続けて **既存の autocomplete のテストが変わらず通る
こと**: `npm test --workspace @a11y-skills/audit -- test/autocomplete-grammar.spec.ts test/fixture-gallery.spec.ts`
（autocomplete 以外のケースが落ちた場合も報告する）。

### Step 4: CLI・test-entry・exports

- `src/cli.ts` の `CHECK_REGISTRY` 末尾に `kind: 'page'` のエントリ（lazy import、
  `{ page, outputDir }` を渡す）。
- `src/test-entries/redundant-entry-check.ts`（autocomplete のラッパーと同形）。
- `package.json` の `exports` と `description`。

**Verify**:

```sh
npm run build --workspace @a11y-skills/audit
node packages/a11y-audit/dist/cli.js --list-checks   # 13 行、末尾が redundant-entry-check
```

### Step 5: フィクスチャ

`test/fixtures/pages/redundant-entry/` に作る。各ファイル冒頭の HTML コメントに意図と
期待結果を書く。スクリプトは使わない（静的 HTML のみ）。

- `clear.html`（期待: `redundant-entry` が passes、`inapplicable` でない）
  - 氏名・メール・電話が 1 つずつの form。
  - 新しいパスワードと確認用パスワード（`autocomplete="new-password"` ×2 — 例外で対象外）。
  - `section-guest1` / `section-guest2` で `name` が別 section の 2 欄（別の人の情報）。
  - 別の `<form>` にあるメール欄（ログイン用とニュースレター用）。
- `finding-scoped.html`（期待: incomplete、node 3 件、`kind: 'scoped'`）
  - `autocomplete="shipping street-address"` と `billing street-address`、
    `shipping postal-code` と `billing postal-code`、`shipping email` と `billing email`。
  - 請求先の前に `<input type="checkbox"> お届け先と同じ` のチェックボックス（
    `copyControls` に入る）。
- `finding-names.html`（期待: incomplete、`kind: 'scoped'`、`copyControls` 空）
  - `autocomplete` なし。`<fieldset><legend>お届け先</legend>` の中に
    `name="address"` / ラベル「住所」、`<fieldset><legend>ご請求先</legend>` の中にも
    同じ。名前・id の接頭辞（`shipping_zip` と `billing_zip`）の組も 1 つ。
- `finding-repeated.html`（期待: incomplete、`kind: 'repeated'`）
  - 「メールアドレス」（`autocomplete="email"`）と「メールアドレス（確認）」
    （`name="email_confirm"`、ラベルから推定）の 2 欄。

### Step 6: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
# zsh では tee + PIPESTATUS を使わず、ファイルに直接書く
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/re-all > /tmp/re-all.log 2>&1; echo "exit=$?"
```

ログを読み、`[redundant-entry-check] DONE`、`Errors: 0`、`exit=1`（axe 由来）を確かめる。
満たせなければ STOP。

### Step 7: テスト

- `test/helpers/fixtures.ts`: `buildRunnerRegistry` に
  `'redundant-entry-check': { kind: 'page-current', run: ... }` を追加。
- `test/fixture-gallery.spec.ts`: MANIFEST に 4 件（`finding-scoped` / `finding-names` /
  `finding-repeated` → `'a11y-skills/redundant-entry': 'incomplete'`、`clear` → `'passes'`）。
  冒頭コメントの件数を 13 checks / 23 rules に更新。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に
  `{ ruleId: 'a11y-skills/redundant-entry', expectedBucket: 'incomplete' }`。
- `test/schema-validation.spec.ts`: 手組みの details（`scoped` と `repeated` を 1 グループ
  ずつ、`copyControls` あり・なし）から作ったエンベロープが valid であることを 1 ケース。
- `test/redundant-entry.spec.ts`（新規、DAMP で書く。入力と期待値を各テストに直接書く）:
  - `autocomplete が shipping と billing に分かれた同じ目的の欄は scoped のグループになる`
  - `「お届け先と同じ」チェックボックスがあると copyControls に入る`
  - `fieldset の見出しだけで範囲が分かる欄（autocomplete なし）も scoped のグループになる`
  - `メールアドレスと確認用メールアドレスは repeated のグループになる`
  - `new-password が 2 つあってもグループにならない`
  - `別の section-* の同じ目的の欄はグループにならない`
  - `別の form の同じ目的の欄はグループにならない`
  - `欄が 1 つもないページは inapplicable になる`（`page.setContent` で作る小さな HTML）
  - 全ケースでエンベロープが `RESULT_SCHEMAS['redundant-entry-check']` に valid

**Verify**: `npm test --workspace @a11y-skills/audit` → 既存 + 新規すべて green。

### Step 8: ドキュメント

日本語を先に書き、英語を同期する（各ファイル先頭の言語リンクは既存のまま）。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表に 1 行:
  `| \`redundant-entry-check\` | 3.3.7 | 同じ目的の入力欄の重なり（候補。要確認） |` /
  `| ... | 3.3.7 | Overlapping fields asking for the same information (candidates; needs review) |`
- `coverage-matrix.ja.md` / `.md`: `:72` の 3.3.7 行を
  `手動+自動の候補 | \`redundant-entry-check\` **[CLI]** + 操作ログ | 同一情報の再入力を要求でFail`
  （EN は `Manual + automated candidates | ...`）に。CLI チェック表（:86-99）に
  `| 3.3.7 | \`redundant-entry-check\` | \`redundant-entry-result.json\` |` を 3.3.7 の順位
  （2.5.5, 2.5.8 の後ろ）に追加。
- `manual-checks.ja.md` / `.md` の 3.3.7 の節: 表の後ろに「CLIチェック」の引用を追加
  （`focus-indicator-check` の例にならう）。**1 ページの中の重なりだけを拾う。手順が複数
  ページに分かれるフォームは範囲外で、手動で確認する**と書く。
- `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧の表に
  `runRedundantEntryCheck | 3.3.7 Redundant Entry`、「遷移済みの `page` を受ける」旨の段落、
  `### Available check names` に 1 行。範囲外（複数ページ）を 1 行書く。
- `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` の `### Added` に新チェック、ルール
  `a11y-skills/redundant-entry`（incomplete）、`details.groups`、既知の制限を追記。
  `package.json` の version は変えない。
- `packages/a11y-audit/TODO-COVERAGE.md`（JA のみ）: 3.3.7 の記述を「部分実装」にし、
  実装内容と残る制限を追記。

**Verify**:

```sh
npm run validate:skills
npm run lint
npm run format:check
npm run build --workspace @a11y-skills/audit
```

### Step 9: コミット

Git workflow のとおり 6 コミット。

## Test plan

- **新規 spec**（`test/redundant-entry.spec.ts`）: 範囲あり・名前だけ・確認欄・例外
  （パスワード、別 section、別 form）・欄なしを網羅（Step 7）。
- **fixture-gallery**: finding → incomplete、clear → passes（非 inapplicable）、Ajv による
  スキーマ検証。
- **rule-classification** / **schema-validation**: Step 7 のとおり。
- **回帰**: autocomplete-audit の既存テストが無変更で通る（Step 3）。
- **CI**: 既存 `a11y-audit-package` ジョブの `--checks all` スモークが新チェックを自動で
  通す（Step 6）。追加の CI ジョブは不要。

## Done criteria

ALL must hold:

- [ ] `npm run typecheck --workspace @a11y-skills/audit` exit 0
- [ ] `npm test --workspace @a11y-skills/audit` exit 0（新 spec を含む）
- [ ] `--list-checks` が 13 行で末尾が `redundant-entry-check`
- [ ] Step 6 のスモークで `[redundant-entry-check] DONE`、`Errors: 0`、exit 1
- [ ] `npm run lint`、`npm run format:check`、`npm run validate:skills` exit 0
- [ ] `git diff 69b4049 -- packages/a11y-audit/src/playwright/runAutocompleteAudit.ts` が
      `export` の追加・`BasicFieldInfo` への 2 欄追加・それを埋めるコードだけ
- [ ] 日英ドキュメントがペアで更新されている
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更
- [ ] 複数ページに分かれる手順が範囲外だと README・runner 先頭コメント・CHANGELOG に書いてある

## STOP conditions

以下に該当したら停止して報告する（即興で回避しない）:

- autocomplete-audit の出力（結果 JSON・バケット・既存テスト）を変えなければ流用できない
  と分かった
- Step 6 で `--checks all` が `cli-smoke.html` に対して ERROR・ハング・exit 2 になる
- 目的の推定が、`AUTOCOMPLETE_FIELD_PATTERNS` に手を入れないと成り立たない
  （パターンの変更は 1.3.5 の判定に影響する）
- `clear.html` が candidate を出してしまい、原因が設計（グループ化の条件）にある
- 既存テスト・schema・lint・format のいずれかが green にできない
- 公開してよいか迷う名前（利用側のサービス名など）をコミット対象に書く必要が出た

## Maintenance notes

- **既知の制限**（runner 先頭コメントと CHANGELOG に記載）:
  - **手順が複数ページに分かれるフォームは範囲外**（前のページの入力を知り得ない）。
  - 同じ form（無ければページ全体）の中だけを見る。別の form にまたがる重なりは拾わない。
  - 目的の推定は名前・id・ラベル・placeholder の語の一致による推測。チェックボックス・
    ラジオは候補の欄に入れない。
  - `copyControls` はテキストの一致による推測。値が実際に写るかは確かめない。
  - 読み込み時に非表示の欄（「請求先が違う場合」を開くと出る欄）も数える。コピー手段が
    あれば `copyControls` に出る。
  - 3.3.7 の例外（再入力が必須、セキュリティ、以前の情報が無効）は判断できない。パスワード
    系だけを対象外にしている。
  - Shadow DOM・iframe の中は見ない（autocomplete-audit と同じ）。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit` を
  minor（新チェック）、スキル文書が変わるのでプラグインも minor に上げる。
- レビュアーは特に、(1) `runAutocompleteAudit.ts` の変更が出力を変えていないか、
  (2) 範囲の語を取り除く正規表現の `g` フラグ（`lastIndex`）の扱い、
  (3) パスワード・別 section・別 form が候補にならないか、を見ること。
