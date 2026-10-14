# Plan 019: ホバー・フォーカスで表示されるコンテンツ (WCAG 1.4.13) チェック — 出しそうな要素にホバー・フォーカスし、消せるか・ポインタを載せられるか・自分で消えないかを測る

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/65

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP conditions」に該当
> したら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> の本プランのステータス行を更新する（レビュアーが索引を管理すると言った場合を除く）。
>
> **Drift check (run first)**:
> `git diff --stat 670957a..HEAD -- packages/a11y-audit/src packages/a11y-audit/test packages/a11y-audit/package.json packages/a11y-audit/README.md packages/a11y-audit/README.ja.md packages/a11y-audit/TODO-COVERAGE.md packages/a11y-audit/CHANGELOG.md skills/auditing-wcag skills/a11y-knowledge/references/checks-audit.ja.md skills/a11y-knowledge/references/checks-audit.md`
> 差分があれば「Current state」の抜粋・行アンカーと実ファイルを比較してから
> 進む。構造的な不一致（`CHECK_REGISTRY` の形・`RULES` の形・`bucketize` /
> `pageNode` のシグネチャ・`buildEnvelopeSchema` のシグネチャ・
> `test/helpers/fixtures.ts` の `buildRunnerRegistry` の形・`EventListenerInspector`
> の形の変化）は STOP。別の新チェックが先にマージされていて、各ファイルの登録表・
> 一覧に**新しい行が増えているだけ**なら構造的な不一致ではない。その行の後ろ
> （`page-snapshot` の前）に本チェックを足す（チェック数・ルール数の数え直しを忘れない）。

## Status

- **Codex plan review**: 通過(2 巡目、2026-10-14、見送った low 0 件)

- **Priority**: P3（`TODO-COVERAGE.md` の優先度「低」。ただし下流で未評価の達成基準として挙がった）
- **Effort**: M〜L（3〜4 日相当。context の作り直し・遷移の記録は `runCharacterKeyShortcutCheck.ts` の写し、
  listener の取り出しと「まとめて受けている要素」の見分けは `runPointerGestureCheck.ts` の写しで済む。
  時間がかかるのは CSS 規則からきっかけを引く部分、「新しく見えた中身」の見分け、待ち時間の多いフィクスチャのテスト）
- **Risk**: LOW〜MEDIUM（新規チェックの追加のみで既存チェックには触れない。クリックはしないので副作用は小さいが、
  フォーカスで遷移するページ（3.2.1 違反）はある。CI の `--checks all` スモークが新チェックを必ず通すが、
  `cli-smoke.html` には `<style>` / `<script>` が無いので候補 0 件 → 何もせず inapplicable で終わるはず）
- **Depends on**: なし（Plan 013 の `src/playwright/cdpEventListeners.ts` の `forExpression` / `forSubtree` / `collectNodes` を使う。完了済み）
- **Category**: feature
- **Planned at**: commit `670957a`, 2026-10-14
- **Consumer**: 下流の WCAG テスト管理ツール（関数 API で呼び、`details` を取り込む）。
  評価できていない達成基準の洗い出しで 1.4.13 が挙がった。
- **決めたこと**（2026-10-14 にユーザーと合意）:
  - きっかけの候補は **CSS の規則と JS の listener の 2 つだけ**から集める。Issue のメモにある属性
    （`title` / `aria-describedby` / `aria-haspopup`）は使わない。`title` はブラウザが描くツールチップで対象外かつ DOM に出ない、
    `aria-describedby` はずっと見えている説明文を指すことが多い、`aria-haspopup` のメニューはクリックで開くことが多く、
    ホバーで開くものは CSS か listener で見つかるため。
  - `document` やフレームワークのルート要素にまとめて付いた listener（イベントの委譲）は、どの子要素に反応するか
    CDP では分からない。**きっかけは推定せず、ページ全体の「要確認」として報告するだけ**にする（`pointer-gesture-check` と同じ扱い）。
    フレームワークの内部（React の `__reactProps$…` など）には頼らない。操作できる要素を推定する仕組みは別に考える。

## Why this matters

1.4.13（ホバー又はフォーカスで表示されるコンテンツ）はいま完全に手動（`coverage-matrix.ja.md:31` で
`インタラクティブ`・「動画/ログ」）。ツールチップ・ホバーで開くメニュー・カードのホバーで出る操作ボタンは
どのページにもあるが、どれが「Esc で消えない」「ポインタを載せると消える」「数秒で勝手に消える」かは
1 つずつ操作しないと分からない。

出しそうな要素に実際にホバー・フォーカスし、新しく見えるようになった要素を見つけ、
3 つの条件を Playwright の操作で測れば、外れた候補を数値付きで拾える。

ただし 1.4.13 には例外がある（消せなくてよい: 入力エラーを伝える中身、ほかの中身を隠さない・置き換えない中身。
ブラウザが出す `title` のツールチップは対象外）。これは機械では決めきれないので、すべて `incomplete` で返す。
これを **22 個目のチェック `content-on-hover-check`（SC 1.4.13）** とする。

### 方針の要点

- **新しく見えた要素を「差分」で見つける**: きっかけを与える前に、見えている要素をすべて印付けしておき
  （ブラウザ内の `WeakSet`）、ホバー・フォーカスのあとに「見えているのに印が無い」要素を拾う。そのうち
  親も新しく見えたものは除き、いちばん外側だけを「中身」として扱う。
- **きっかけの候補は 2 つの出どころから集める**:
  1. CSS: `:hover` / `:focus` / `:focus-within` / `:focus-visible` を含み、**その後ろに結合子がある**
     セレクタ（`.menu:hover > .sub`、`.card:hover .actions` など。自分の色を変えるだけの `.btn:hover` は除く）。
     疑似クラスとその後ろを取り除いた前半部分を `querySelectorAll` してきっかけにする
  2. JS: `mouseenter` / `mouseover` / `pointerenter` / `pointerover` / `focus` / `focusin` の listener が
     **その要素自身に**付いた要素（CDP で取り出す。Chromium のみ。`runPointerGestureCheck.ts` の `forSubtree` → `collectNodes` と同じ取り出し方）
- **まとめて受けている listener は報告だけ**: `window` / `document` / `<html>` / `<body>` に上の種類の listener があるとき、
  または 1 つの要素に `POINTER_GESTURE_DELEGATION_MIN_TYPES`（20）種類以上の listener があり、その中に上の種類が含まれるとき
  （React などのルート要素）は、その要素を「まとめて受けている要素」として記録する。候補にはせず、3 ルールそれぞれに
  ページ全体の node を 1 つ入れて「ここで処理される中身は測っていない。人が確かめる」と伝える。
- **候補が 0 件で、まとめて受けている要素も無ければ何もしない**: ホバーもフォーカスもせずに inapplicable（速い・CI で安全）。
- **測る順番**（ホバー・フォーカスそれぞれについて）:
  1. 出す → 新しい中身が無ければ次へ
  2. **自分で消えないか**: そのまま `persistMs` 待ち、まだ見えているか
  3. **消せるか**: ポインタもフォーカスも動かさずに Escape を押し、見えなくなったか
  4. **ポインタを載せられるか**（ホバーのときだけ）: いったん戻して出し直し、ポインタを中身の上へ少しずつ動かし、
     まだ見えているか
- **戻せないときだけ読み込み直す**: きっかけごとにポインタを隅へ動かし、フォーカスを外し、Escape を押して戻す。
  それでも前の中身が見えたまま、または遷移したときだけ、新しい context で読み込み直す
  （`runCharacterKeyShortcutCheck.ts` と同じ）。

## Current state（統合点 — `670957a` で確認済み）

リポジトリは npm workspaces モノレポ。パッケージは `packages/a11y-audit`、ESM、
strict TypeScript、`tsc` ビルド、import 指定子は `.js` 付き、シングルクォート・
セミコロン・2 スペース。テストは Playwright Test で、**`../dist/...` から import する**
（先に build が要る）。以下のパスは `packages/a11y-audit/` からの相対。

### 見本にするファイル

- **`src/playwright/runCharacterKeyShortcutCheck.ts`**（706 行）— `browser` を受けて自前の context を作り、
  操作して、変化が残ったら新しい context でやり直す。ここから写すもの:
  - ファイル先頭コメント（何をページにするか / Limitations の列挙）
  - Options の形（:95〜）、`ACTION_TIMEOUT_MS`（:112）、`NAVIGATION_ERROR`（:119。1 行目だけに当てる）
  - ブラウザ内関数の書き方（`installObserver` :143、`readReaction` :200、`getUniqueSelector` :206）
  - 引数の確かめ方と準備（`assertWalkLimits` :266、`resolveCreateContext` :292、`requireTargetUrl` :296、
    `createAuditOutput` :297、状態キー `` `__a11yCharKey_${randomUUID()}` `` :302）
  - 遷移・新しいウィンドウ・ダイアログの記録（:330-354）と `gotoAndSettle`（:355）
  - CDP の inspector を開いて閉じる形（:366-395）
  - 結果の出力（`buildAuditResult` :417 → `out.save` / `header` / `summary` / `outputPaths` :423-432）
  - 読み込み直しのループと `finally` で context を閉じる形（:434〜、:702）
- **`src/playwright/runPointerGestureCheck.ts`** — `inspectListeners`（:436-530）: `window` / `document` を
  `forExpression` で見て、`forSubtree('document.documentElement')` で要素ごとの listener をまとめて取り、
  `distinctTypes(listeners) >= POINTER_GESTURE_DELEGATION_MIN_TYPES` の要素を「まとめて受けている要素」として分け（:489-497）、
  `inspector.collectNodes(...)` で要素に戻す（:499-521）。`finally` で `withTimeout(inspector.close(), 1_000)`（:628）。
  ブラウザ内の `isVisible`（:185-190: `getClientRects().length > 0 && visibility !== 'hidden'`）。
  まとめて受けている要素の型は `PointerGestureDelegationRoot`（`src/types.ts:908-914`: `selector` / `shadowHosts` / `eventTypeCount`）、
  報告の文面は `normalizePointerGestureCheck` の `delegationRoots` の node（`src/utils/axe-format.ts:980-992`）。
- **`src/playwright/cdpEventListeners.ts`** — `forExpression`（:51-54）、`forSubtree`（:70-73）、`collectNodes`（:74〜）。
- **`src/constants.ts:905-906`** — `POINTER_GESTURE_DELEGATION_MIN_TYPES = 20`（そのまま import して使う。値を写さない）。

### 新チェック追加の統合点（直近の前例: character-key-shortcut-check, PR #100）

`page-snapshot`（PR #101）は「判定しない材料」で検査数に数えない。各登録表では
**`character-key-shortcut-check` の後ろ、`page-snapshot` の前**に足す。

1. `src/types.ts` — `CheckSource` ユニオン（:21-43。:42 が `'character-key-shortcut-check'`、:43 が `'page-snapshot'`）の
   :42 と :43 の間に `'content-on-hover-check'`。details 型は `// Character Key Shortcut Check (WCAG 2.1.4)` の節（:1650〜）の後ろ、
   page-snapshot の節の前に足す（無ければファイル末尾 :1752 の後ろ）。
2. `src/constants.ts` — `// character-key-shortcut-check (WCAG 2.1.4)` の節（:1040〜）の後ろ、
   `// page-snapshot ...`（:1082）の前に節 `// content-on-hover-check (WCAG 1.4.13)`。既存の `HTML_SNIPPET_MAX_LENGTH`（:39）を使う。
3. `src/utils/rule-registry.ts` — `// --- character-key-shortcut-check ---` の節（:554〜）の後ろ、
   `} as const satisfies Record<string, RuleMeta>;`（:569）の直前に節を足す。
4. `src/utils/axe-format.ts` — `normalizeCharacterKeyShortcutCheck`（:1794〜）の後ろ、`normalizeAxeResults`（:1899）の前に
   `normalizeContentOnHoverCheck`。`emptyBuckets()`（:87）→ `bucketize(...)`（:112）→ `pageNode(summary)`（:159）。
   きっかけに結び付く候補は要素の node にする（`normalizePointerGestureCheck` の要素 node の作り方に合わせる）。
5. `src/index.ts` — axe-format の export リスト（:66 の `normalizeCharacterKeyShortcutCheck` の後ろ）に追加。
6. `src/playwright/index.ts` — runner と Options 型の export（:91-93 の `runCharacterKeyShortcutCheck` の後ろ、:95 の `runPageSnapshot` の前）。
7. `src/schemas/index.ts` — `CHARACTER_KEY_SHORTCUT_CHECK_RESULT_SCHEMA`（:2004〜）の後ろ、`PAGE_SNAPSHOT_RESULT_SCHEMA`（:2112）の前に
   `buildEnvelopeSchema` で schema を作り、`RESULT_SCHEMAS`（:2170〜）の :2192 と :2193 の間に登録。
   `delegationRoots` の項目は `POINTER_GESTURE_CHECK_RESULT_SCHEMA` の `delegationRoots`（:1480 付近）の書き方に合わせる。
8. `src/cli.ts` — `CHECK_REGISTRY`（:66〜）の `character-key-shortcut-check` の項（:309〜）の後ろ、`page-snapshot` の項（:324）の前に
   `kind: 'browser'` の項（lazy import、`browser` / `targetUrl: url` / `outputDir` を渡す。:309 の項と同形）。
9. `src/test-entries/content-on-hover-check.ts`（新規）— `src/test-entries/character-key-shortcut-check.ts` と同形。
10. `package.json` — `exports` の `./test-entries/character-key-shortcut-check`（:129-132）の後ろに同形の項、
    `description`（:4）のチェック列挙の末尾（`character key shortcuts` の後ろ）に `content on hover or focus`。
11. テスト: `test/helpers/fixtures.ts` の `buildRunnerRegistry`（`'character-key-shortcut-check'` の項 :150〜 の後ろ）に
    `kind: 'browser-navigating'`、`test/fixture-gallery.spec.ts`（`MANIFEST`、冒頭コメント
    「all 21 checks」:2・「all 36 custom finding-capable rules」:13 → 22 / 39）、
    `test/rule-classification.spec.ts`（`FINDING_EXPECTATIONS`）、`test/schema-validation.spec.ts`。
    フィクスチャは `test/fixtures/pages/content-on-hover/*.html`。`runFixtureCheck` の呼び方は
    `test/character-key-shortcut.spec.ts` が見本。
12. ドキュメント:
    - `README.md` / `README.ja.md`: 冒頭の検査数（JA :6「21 個の検査」→ 22）、検査一覧表（JA :38 の
      `runCharacterKeyShortcutCheck` の行の後ろ、:39 の `runPageSnapshot` の前）、「`browser` を受けます」の文（JA :44）、
      本チェックの段落（JA :210 の `runCharacterKeyShortcutCheck` の段落の後ろ、:227 の `runPageSnapshot` の段落の前）、
      チェック名一覧（JA :315 と :316 の間）、`createContext` を渡せる検査の列挙（JA :432）、test entry の列挙。EN は対応する箇所。
    - `CHANGELOG.md`: 先頭は `## 0.14.0 — 2026-10-14`（:6）。その上に `## Unreleased` / `### Added` を作って 1 項目を足す
      （過去の Unreleased 節の形は `git log -p -- packages/a11y-audit/CHANGELOG.md` で見て合わせる）。
    - `TODO-COVERAGE.md`（JA のみ）: 「## 比較的自動化しやすい」の `### 1.4.13 Content on Hover or Focus`（:72-90）を
      「- **部分実装** ✅」にして中身を実装に合わせて書き直す（ほかの「部分実装」の節の書式: 実装・見ているもの・制限）。
      「## 実装優先度（案）」の「新規スクリプト作成が必要なもの」の表の 1.4.13 の行（:346）を消し、
      「既存でカバー済み」の表に `| 1.4.13 Content on Hover or Focus | \`content-on-hover-check\`（部分） ✅ |` を足す。
    - `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md`: CLI チェック表（JA :142 が `character-key-shortcut-check`）の後ろに 1 行。
    - `skills/auditing-wcag/references/coverage-matrix.ja.md` / `.md`: :31 が 1.4.13 行、:90 前後からの
      「基準 × チェック名 × 出力ファイル」表（SC 順。1.4.13 は :95 の 1.4.12 の後ろ）。
    - `skills/auditing-wcag/references/interactive-checks.ja.md` / `.md`: 「## ホバー/フォーカス表示」（:209-213、
      表の 1.4.13 行が :212）。その節の表の後ろに `### \`content-on-hover-check\` CLIチェック` を
      `### \`character-key-shortcut-check\` CLIチェック`（:32-45）の書式で足し、:212 の根拠欄に `content-on-hover-check` を足す。
    - `skills/a11y-knowledge/references/checks-audit.ja.md` / `.md`: 「## チェックごとの対応」の表（:34 が
      `character-key-shortcut-check`）の後ろに 1 行（列の中身は :34 の行に合わせる）。

### CI

`.github/workflows/ci.yml:113-117` が `dist/cli.js --url file://.../cli-smoke.html --checks all` を実行し、
exit code 1 と `Errors: 0` を要求する。`cli-smoke.html` は `<h1>`・`<img>`・`<input type="text" id="name-field">` だけで、
`<style>` / `<script>` は無い（候補 0 件・まとめて受けている要素 0 件）。

## Commands you will need

リポジトリルートで実行する（worktree では `npm --prefix <worktree> run <script>`）。

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| Full test suite | `npm test` | all pass |
| New spec only | `npm test --workspace @a11y-skills/audit -- test/content-on-hover.spec.ts` | all pass |
| List checks | `node packages/a11y-audit/dist/cli.js --list-checks` | `content-on-hover-check` が `page-snapshot` の直前 |
| 整形 | `npx prettier --write <path>` | — |
| 全体検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |

## Scope

**In scope**:

- 新規: `src/playwright/runContentOnHoverCheck.ts`、
  `src/test-entries/content-on-hover-check.ts`、
  `test/fixtures/pages/content-on-hover/{none,compliant-tooltip,no-escape,not-hoverable,auto-hide,css-hover-menu,css-self-only,focus-only,focus-within,escape-blurs,attributes-only,hidden-trigger,stuck,focus-navigates,document-delegation,root-delegation}.html`、
  `test/content-on-hover.spec.ts`
- 編集（追加のみ）: `src/constants.ts`、`src/types.ts`、`src/utils/rule-registry.ts`、
  `src/utils/axe-format.ts`、`src/index.ts`、`src/playwright/index.ts`、
  `src/schemas/index.ts`、`src/cli.ts`、`package.json`（`exports` と `description` のみ）、
  `test/helpers/fixtures.ts`、`test/fixture-gallery.spec.ts`、`test/rule-classification.spec.ts`、
  `test/schema-validation.spec.ts`
- ドキュメント: 上記統合点 12 のファイル

**Out of scope**（触らない）:

- 既存チェックの runner・normalizer・schema・rule、`cdpEventListeners.ts`（使うだけで変えない）
- 属性（`title` / `aria-describedby` / `aria-haspopup`）からの候補化（「決めたこと」参照）
- まとめて受けている listener で処理される中身の測定（報告だけ）、フレームワークの内部（`__reactProps$…`・Vue の `_vei`・
  jQuery の `$._data` など）を読む方法、操作できる要素の推定（別に考える）
- クリックで開く中身（1.4.13 の対象外）、ブラウザが描く `title` のツールチップ（対象外。DOM に出ないので拾えない）
- 例外の自動判定（入力エラーを伝える中身か、ほかの中身を隠しているか）— 人が確かめる。後回し（Maintenance notes）
- iframe の中の要素・closed shadow root の中の要素、タッチ操作
- `package.json` の `version`、プラグイン 4 フィールドの version（リリース PR で別途）
- `.github/workflows/`、`plans/` の他のプラン

## Git workflow

- ブランチ: `feat/content-on-hover-check`
- 論理単位で分割コミット（Conventional Commits、scope は `a11y-audit`。`git log` の例:
  `feat(a11y-audit): add character-key-shortcut-check for WCAG 2.1.4 candidates (#100)`）:
  1. `feat(a11y-audit): add content on hover types, constants, rules, normalizer and schema`
  2. `feat(a11y-audit): add content-on-hover-check runner`
  3. `feat(a11y-audit): register content-on-hover-check in CLI and exports`
  4. `test(a11y-audit): add content-on-hover-check fixtures and specs`
  5. `docs: document content-on-hover-check (1.4.13)`
- 公開リポジトリなので、コミットされる文面に下流の利用者のツール名・サービス名を
  書かない（「downstream consumer」と書く）。
- push・PR は指示されたときだけ。PR 本文に `Closes #65`。

## 設計

### A. 全体の流れ（runner）

1. 引数を確かめる（設計 G）。`resolveCreateContext`・`requireTargetUrl`・`createAuditOutput` は
   `runCharacterKeyShortcutCheck.ts:292-302` と同じ。
2. **読み込み**: context を作り `newPage()`、遷移・新しいウィンドウ・ダイアログの記録を付けて
   （`runCharacterKeyShortcutCheck.ts:330-354` の写し）、`gotoAndSettle(page, targetUrl)`。
   1 回目の `page.url()` を `startUrl`（結果の `url`）にする。
3. **候補を集める**:
   1. **listener**（1 回目の読み込みでだけ。取り終えたら inspector を閉じる）: `openEventListenerInspector(page)`。
      null なら `listenerInspection = 'unsupported'`（候補は CSS だけ、`delegationRoots` は空）。そうでなければ
      `runPointerGestureCheck.ts` の `inspectListeners`（:436-530）と同じ形で:
      - `window` / `document` を `forExpression(target)` で見る。`CONTENT_ON_HOVER_LISTENER_TYPES` の listener があれば
        `delegationRoots` に `{ selector: target, shadowHosts: [], eventTypeCount, types }`。
      - `forSubtree('document.documentElement')`（種類で絞らない。種類の数を数えるため）を要素ごとにまとめ、
        - 種類の数が `POINTER_GESTURE_DELEGATION_MIN_TYPES` 以上で、`CONTENT_ON_HOVER_LISTENER_TYPES` を 1 つ以上含む要素、
          または `<html>` / `<body>` で `CONTENT_ON_HOVER_LISTENER_TYPES` を含む要素 → まとめて受けている要素
        - それ以外で `CONTENT_ON_HOVER_LISTENER_TYPES` を含む要素 → きっかけの候補（`'listener'`）
      - `collectNodes(ids, nodesKey, ...)` で `window[nodesKey]` に要素を入れる（:499-521 の写し。上限は
        `CONTENT_ON_HOVER_MAX_LISTENER_NODES`、超えたら `listenerNodesTruncated: true`）。
      - まとめて受けている要素の `selector` / `shadowHosts` は、ブラウザ内で `getUniqueSelector` と
        `runPointerGestureCheck.ts` の `delegationRoots` と同じ作り方で決める。
   2. ブラウザ内関数 `collectTriggers({ stateKey, nodesKey, listenerIndices, maxTriggers })` を `page.evaluate`（設計 C）。
      返り値は `{ selector, sources, focusTarget, html, htmlTruncated }[]`（文書順・重複なし・最大 `maxTriggers` 件）、
      `triggersTruncated`、`cssRulesUnreadable`（読めなかったスタイルシートの数）。
   3. 候補が 0 件 → context を閉じて結果を作る（`delegationRoots` があれば incomplete、無ければ inapplicable。設計 H）。
4. **きっかけごと・方法ごとに**（`triggers` の順。方法は `hover` → `focus` の順。`focusTarget === null` なら `focus` は飛ばす）:
   1. 時間の上限を確かめる。超えていれば `abort('timeout')`（残りを `untested` に `reason: 'timeout'`）。
   2. **戻す**（`resetState`）: `page.mouse.move(0, 0)`、ブラウザ内で `document.activeElement?.blur()`、
      `page.keyboard.press('Escape')`、`settleMs` 待つ。
   3. 見えている要素をすべて印付け（ブラウザ内関数 `markVisible(stateKey)`。`WeakSet` を `window[stateKey].seen` に）。
   4. **出す**: `hover` は要素を `scrollIntoView({ block: 'center' })` してから中心座標へ `page.mouse.move(x, y, { steps: 1 })`
      （途中を通らずに直接載せる。少しずつ動かすと隅から来る経路上の別のきっかけに触れ、その中身をこの組の中身と
      取り違えるため。`stuck.html` で確認済み）。
      `focus` は `focusTarget` の要素を `locator.focus()`（`:focus-within` のように、きっかけ自身ではなく子孫に
      フォーカスして出す形があるため。設計 C）。要素が見つからない・大きさ 0 なら、その組を `untested` に
      `reason: 'trigger-not-found'` で入れて次へ。`settleMs` 待つ。
   5. 遷移していたら（`framenavigated` / URL の変化 / evaluate が `NAVIGATION_ERROR`）、その組を `untested` に
      `reason: 'navigated'` で入れ、読み込み直して（手順 11 の読み込み直し）次の組へ。
   6. ブラウザ内関数 `findNewContent(stateKey, triggerSelector)`: 見えていて印が無い要素のうち、
      親も新しく見えたものを除いた外側の要素（`roots`）を返す。きっかけ自身とその祖先は除く。
      大きさ 0 のもの・`aria-hidden="true"` の中・`<script>` / `<style>` / `<template>` は除く。
      各 root について `{ selector, rect, html, htmlTruncated, text }`。0 件なら次の組へ（`noContent` に数える）。
   7. **自分で消えないか**: `persistMs` 待ち、roots がまだ見えているか（ブラウザ内で `isVisible`）。
      1 つでも消えていれば `persistent = 'disappeared'`。
   8. **消せるか**: `persistent === 'stayed'` のときだけ（消えたあとでは測れない。そうでなければ `'not-tested'`）。
      Escape を押して `settleMs` 待ち、すべて見えなくなれば `'dismissed'`、1 つでも残れば `'stayed'`。
      押す前と後で `document.activeElement` が変わっていたら `escapeMovedFocus: true`。
      **`'dismissed'` でも `escapeMovedFocus` なら dismissible の外れとして扱う**（Escape で blur して、その blur で
      消しているだけかもしれず、「フォーカスを動かさずに消せる」ことを確かめられていないため。設計 B）。
   9. **ポインタを載せられるか**（`hover` のときだけ。`focus` は `'not-applicable'`。`persistent === 'disappeared'` のときは
      測れないので `'not-tested'`）: 手順 2〜4 をやり直して
      もう一度出し、roots のうち最大の rect の中心へ `page.mouse.move(x, y, { steps: 10 })`、`settleMs` 待ち、
      すべて見えていれば `'stayed'`、消えていれば `'disappeared'`。出し直しで中身が出なければ `'not-tested'`。
      rect がビューポートの外なら `'not-tested'`。
   10. 記録（設計 D の `HoverContentResult`）。
   11. **読み込み直すか**: 次の組へ進む前に手順 2 で戻し、「この組の roots がまだ見えている」（戻せない中身）なら、
       まだ残りがあるときだけ読み込み直す。`reloads >= maxReloads` なら `abort('reload-limit')`、
       そうでなければ `reloads += 1`、context を閉じて手順 2 と同じく新しい context で読み込み、
       候補をセレクタで引き直す（CDP は使わない。見つからない候補は手順 4 で `trigger-not-found` になる）。
       読み込み直しが例外で失敗したら `abort('reload-failed')`。
5. context はチェック全体の `finally` で閉じる（`runCharacterKeyShortcutCheck.ts:702` と同じ）。

### B. 判定と分類

| 条件 | 判定 | ルール |
|---|---|---|
| 自分で消えない | `persistent === 'disappeared'` | `content-on-hover-persistent` |
| 消せる | `dismissible === 'stayed'`（Escape で消えない）、または `escapeMovedFocus === true`（消えてもフォーカスが動いた） | `content-on-hover-dismissible` |
| ポインタを載せられる | `hoverable === 'disappeared'` | `content-on-hover-hoverable` |

どれも外れていない組は passes に数える。`'not-tested'` は外れとみなさない（理由は `untested` か node の要約に残る）。

### C. 候補の集め方（ブラウザ内 `collectTriggers`）

- 対象は main frame の文書の、見えている要素（`isVisible`。`runPointerGestureCheck.ts:185-190` と同じ）。
  `<html>` / `<body>` と、まとめて受けている要素は除く。
- `sources` は次の組み合わせ（両方に当たったら 1 つの候補にまとめる）:
  - `'css'`: `document.styleSheets` の規則を再帰的に（`@media` / `@supports` / `@layer` の中も）たどり、
    `selectorText` をカンマで分け、`:hover` / `:focus` / `:focus-within` / `:focus-visible` を含む複合セレクタを探す。
    その複合セレクタの**後ろに結合子（空白・`>`・`+`・`~`）が続く**ときだけ、その複合セレクタまでを取り、
    4 つの疑似クラスを取り除いたものを `querySelectorAll`（`try` で囲み、構文エラーは飛ばす）。
    取り除いた結果が空（`:hover > .x` のような形）なら飛ばす。読めないスタイルシート
    （別オリジンで `cssRules` が `SecurityError`）は数えて `cssRulesUnreadable` に返す。
  - `'listener'`: 手順 A-3-1 で `window[nodesKey]` に入れた要素のうち `listenerIndices` のもの。
- 「フォーカスできる」: `el.tabIndex >= 0` または `el.matches('a[href], button, input, select, textarea, [tabindex], [contenteditable="true"], summary')`
  で、`disabled` でなく、見えている（`isVisible`）。
- `focusTarget`（フォーカスで出すときにフォーカスする要素のセレクタ）:
  - きっかけ自身がフォーカスできる → きっかけ自身の `selector`。
  - そうでなければ、文書順で最初のフォーカスできる子孫の `getUniqueSelector`（`:focus-within` の規則や、
    子孫からバブリングする `focusin` の listener で出す形のため。`.group:focus-within > .hint` なら `.group` の中の `<input>`）。
    子孫のうち試すのは 1 つだけ（最初の 1 つで出なければ、ほかの子孫でも出ないとみなす。既知の制限に記載）。
  - どちらも無い → `null`（キーボードで出せないので focus は試さない。hover だけ試す）。
- 文書順に並べ、`maxTriggers` 件まで（超えた数は `triggersTruncated` に）。`selector` は `getUniqueSelector`
  （`runCharacterKeyShortcutCheck.ts:206` の写し、「Keep in sync」コメント付き）。

### D. 型（`src/types.ts`、節 `// Content on Hover or Focus Check (WCAG 1.4.13)`）

```ts
export type HoverTriggerSource = 'css' | 'listener';

export interface HoverTrigger {
  selector: string;
  sources: HoverTriggerSource[];
  /** Element focused for the 'focus' method: the trigger itself, its first focusable descendant, or null (focus not tried). */
  focusTarget: string | null;
  html: string;
  htmlTruncated: boolean;
}

/** Where hover or focus listeners are delegated; the elements they serve are not tried. */
export interface HoverDelegationRoot {
  /** 'window', 'document', or the element's selector. */
  selector: string;
  /** [] for window / document and elements outside shadow DOM. */
  shadowHosts: string[];
  /** Number of distinct event types listened for on this target. */
  eventTypeCount: number;
  /** The CONTENT_ON_HOVER_LISTENER_TYPES among them. */
  types: string[];
}

export interface HoverContentRoot {
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  html: string;
  htmlTruncated: boolean;
  /** Visible text, trimmed to CONTENT_ON_HOVER_TEXT_MAX characters. */
  text: string;
}

export interface HoverContentResult {
  trigger: string;
  method: 'hover' | 'focus';
  content: HoverContentRoot[];
  /** Still visible after `persistMs` with the pointer or focus kept on the trigger. */
  persistent: 'stayed' | 'disappeared';
  /** Escape pressed without moving the pointer or focus. 'not-tested' when it had already disappeared. */
  dismissible: 'dismissed' | 'stayed' | 'not-tested';
  /** document.activeElement changed when Escape was pressed; flagged even when the content was dismissed. */
  escapeMovedFocus: boolean;
  /** Pointer moved from the trigger onto the content. 'not-applicable' for focus. */
  hoverable: 'stayed' | 'disappeared' | 'not-tested' | 'not-applicable';
}

export interface ContentOnHoverCheckDetails {
  /** 'unsupported' outside Chromium: triggers come from CSS only and delegation is not detected. */
  listenerInspection: 'cdp' | 'unsupported';
  delegationRoots: HoverDelegationRoot[];
  /** Listener nodes dropped by CONTENT_ON_HOVER_MAX_LISTENER_NODES. */
  listenerNodesTruncated: boolean;
  triggers: HoverTrigger[];
  /** Candidates dropped by `maxTriggers`. */
  triggersTruncated: number;
  /** Style sheets whose rules could not be read (cross-origin). */
  cssRulesUnreadable: number;
  /** Trigger and method pairs that showed content, in the order tried. */
  results: HoverContentResult[];
  /** Pairs tried that showed no new content. */
  noContent: number;
  untested: {
    trigger: string;
    method: 'hover' | 'focus';
    reason: 'timeout' | 'reload-limit' | 'reload-failed' | 'trigger-not-found' | 'navigated';
  }[];
  reloads: number;
  aborted: { reason: 'timeout' | 'reload-limit' | 'reload-failed'; url: string } | null;
}

export type ContentOnHoverCheckResult =
  AuditCheckResult<ContentOnHoverCheckDetails>;
```

`CheckSource` に `'content-on-hover-check'`。`PointerGestureDelegationRoot` は使い回さない（`types` を足すため。
既存の型は変えない）。

### E. 定数（`src/constants.ts`）

```ts
// ---------------------------------------------------------------------------
// content-on-hover-check (WCAG 1.4.13)
// ---------------------------------------------------------------------------

/** Listener types that suggest an element shows something on hover or focus. */
export const CONTENT_ON_HOVER_LISTENER_TYPES = [
  'mouseenter',
  'mouseover',
  'pointerenter',
  'pointerover',
  'focus',
  'focusin',
] as const;
/** Wait after showing, dismissing or moving the pointer (tooltip libraries delay up to a few hundred ms). */
export const CONTENT_ON_HOVER_SETTLE_MS = 400;
/** How long shown content must stay with the pointer or focus kept on the trigger. */
export const CONTENT_ON_HOVER_PERSIST_MS = 3_000;
export const CONTENT_ON_HOVER_MAX_TRIGGERS = 30;
/** Upper bound on nodes resolved through CDP (listener nodes + delegation roots). */
export const CONTENT_ON_HOVER_MAX_LISTENER_NODES = 500;
export const CONTENT_ON_HOVER_TIMEOUT_MS = 120_000;
export const CONTENT_ON_HOVER_MAX_RELOADS = 10;
export const CONTENT_ON_HOVER_TEXT_MAX = 200;
export const DEFAULT_CONTENT_ON_HOVER_RESULT_FILE = 'content-on-hover-result.json';
```

まとめて受けている要素の種類の数の閾値は `POINTER_GESTURE_DELEGATION_MIN_TYPES` を import して使う（新しい定数は作らない）。

中身が出ない組は約 `2 × settleMs`（≈ 1 秒）、出た組はホバーで約 `persistMs + 4 × settleMs`（≈ 5 秒）。
候補 30 件すべてで中身が出ると上限 120 秒に当たる（`aborted: timeout` で incomplete になり、残りは `untested`）。

### F. ルール（`src/utils/rule-registry.ts`、`// --- content-on-hover-check ---`）

| key | id | classification | scope | impact |
|-----|----|----|----|----|
| `content-on-hover-dismissible` | `a11y-skills/content-on-hover-dismissible` | `incomplete` | element | `serious` |
| `content-on-hover-hoverable` | `a11y-skills/content-on-hover-hoverable` | `incomplete` | element | `serious` |
| `content-on-hover-persistent` | `a11y-skills/content-on-hover-persistent` | `incomplete` | element | `serious` |

3 つとも `sc: ['1.4.13']`、`tags: ['a11y-skills', 'wcag21aa', 'wcag1413']`、
`helpUrl: \`${UNDERSTANDING}/content-on-hover-or-focus.html\``。
- dismissible: description `'Ensure content shown on hover or focus can be dismissed without moving pointer or focus'`、
  help `'Let users dismiss content shown on hover or focus (e.g. with Escape) without moving the pointer or focus'`
- hoverable: description `'Ensure the pointer can move over content shown on hover without it disappearing'`、
  help `'Keep content shown on hover visible while the pointer moves over it'`
- persistent: description `'Ensure content shown on hover or focus stays until dismissed or no longer relevant'`、
  help `'Keep content shown on hover or focus visible until the user dismisses it or moves the pointer or focus away'`

`scope` の値と書き方は既存の要素単位ルール（例: `pointer-gestures`）に合わせる。
コメント: 外れたことは観察できるが、例外（入力エラーを伝える中身、ほかの中身を隠さない中身は消せなくてよい）に
当たるかは人が確かめる。まとめて受けている listener の中身は測らないので、ページ全体の node で人に渡す。

### G. runner `runContentOnHoverCheck`

```ts
export interface RunContentOnHoverCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Defaults to the TEST_PAGE environment variable. */
  targetUrl?: string;
  /** Options for the contexts created from `browser` (ignored with `createContext`). */
  contextOptions?: BrowserContextOptions;
  /** Wait after showing, dismissing or moving the pointer (default: CONTENT_ON_HOVER_SETTLE_MS). */
  settleMs?: number;
  /** How long shown content must stay (default: CONTENT_ON_HOVER_PERSIST_MS). */
  persistMs?: number;
  /** Wall-clock budget for the whole check (default: CONTENT_ON_HOVER_TIMEOUT_MS). */
  timeBudgetMs?: number;
  /** Upper bound on candidate triggers (default: CONTENT_ON_HOVER_MAX_TRIGGERS). */
  maxTriggers?: number;
  /** Reloads when content could not be cleared (default: CONTENT_ON_HOVER_MAX_RELOADS). */
  maxReloads?: number;
}
```

- 先頭で `assertWalkLimits({ timeBudgetMs })`。`settleMs` / `persistMs` は 0 以上の有限数、`maxTriggers` は 1 以上の整数、
  `maxReloads` は 0 以上の整数でなければ `Error`（`runCharacterKeyShortcutCheck.ts` の確かめ方に合わせる）。
- `buildAuditResult({ source: 'content-on-hover-check', url: startUrl, details, buckets: normalizeContentOnHoverCheck(details) })` →
  `out.save(result)` → `out.header('Content on Hover or Focus Check', 'WCAG 1.4.13', startUrl)` →
  `out.summary({ 'Listener inspection', 'Delegation roots', Triggers, 'Pairs with content', 'Not dismissible', 'Not hoverable', 'Not persistent', Reloads })` →
  `out.outputPaths()`。
- ファイル先頭コメントに Limitations（Maintenance notes の既知の制限）を列挙。

### H. normalizer（`normalizeContentOnHoverCheck`）

`checkedNodes` は既存の normalizer に合わせる。

- 適用されるか: `results` が 1 件以上、または `delegationRoots` / `untested` が 1 件以上、または `aborted` がある、
  または下の「調べきれなかった」条件のどれかに当たる → `applicable = true`。どれも無ければ 3 ルールとも node なし、
  `applicable = false`（inapplicable）。
- **調べきれなかったことは必ず page node にする**（`normalizePointerGestureCheck` の `listenerInspection !== 'cdp'`・
  候補の切り捨て・`listenerNodesTruncated` の扱い（`axe-format.ts:937-1008`）に合わせる。候補が 0 件でも inapplicable にしない）。
  3 ルールそれぞれに、当たったものごとに 1 つ:
  - `listenerInspection === 'unsupported'` → `` `Event listeners could not be inspected (unsupported). CDP is only available in Chromium. Triggers come only from CSS rules; hover over and focus the page's controls to check content shown by scripts manually.` ``
  - `cssRulesUnreadable > 0` → `` `${n} style sheet(s) could not be read (cross-origin); content shown by their :hover / :focus rules was not tried. Check it manually.` ``
  - `triggersTruncated > 0` → `` `Only the first ${triggers.length} of ${triggers.length + triggersTruncated} triggers were tried (maxTriggers); check the rest of the page manually.` ``
  - `listenerNodesTruncated` → `` `Listeners on more than ${CONTENT_ON_HOVER_MAX_LISTENER_NODES} elements were found; elements beyond that were not tried. Check them manually.` ``
- 外れた条件ごとに、その組のきっかけ（`trigger`）を対象にした要素 node:
  - persistent: `` `Content shown on ${method} of this element (${contentSelectors}) disappeared within ${persistMs} ms while the ${method === 'hover' ? 'pointer' : 'focus'} stayed on it. Verify that it stays until dismissed, or that the information is no longer valid.` ``
  - dismissible（`'stayed'`）: `` `Content shown on ${method} of this element (${contentSelectors}) stayed visible after pressing Escape.${escapeMovedFocus ? ' Escape also moved focus.' : ''} Verify that it can be dismissed without moving the pointer or focus, unless it reports an input error or does not obscure or replace other content.` ``
  - dismissible（`'dismissed'` かつ `escapeMovedFocus`）: `` `Content shown on ${method} of this element (${contentSelectors}) disappeared after pressing Escape, but Escape also moved focus. Verify that it can be dismissed without moving the pointer or focus.` ``
  - hoverable: `` `Content shown on hover of this element (${contentSelectors}) disappeared when the pointer moved onto it. Verify that the pointer can move over the content without it disappearing.` ``
  - `contentSelectors` は最大 3 件、残りは `and N more`。本文の先頭 80 文字を `Text: "..."` で添える。
  - `persistMs` は details に無いので、normalizer の引数で受けるか、要約から数値を外す（`within the wait`）。
    既存の normalizer の引数の形を見て、変えずに済む方を選ぶ。
- `delegationRoots` が 1 件以上 → 3 ルールそれぞれに page node
  `` `Hover or focus listeners are delegated to ${roots} (${types}); content shown through them was not tried. Hover over and focus the page's controls to check them manually.` ``
  （`roots` は `normalizePointerGestureCheck` と同じく `${[...shadowHosts, selector].join(' >>> ')}` を `, ` でつなぐ。`axe-format.ts:980-992` が見本）。
- `untested` が 1 件以上 → 3 ルールそれぞれに page node `` `${untested.length} trigger(s) were not tried (${reasons}): ${selectors}. Check them manually.` ``
  （`selectors` は最大 10 件、残りは `…`）。
- 外れの node も page node も無く、`results` が 1 件以上 → passes。

### I. schema

`CONTENT_ON_HOVER_CHECK_RESULT_SCHEMA` を `buildEnvelopeSchema` で作る。details の `required` は型の全フィールド。
`listenerInspection` / `sources[]` / `method` / `persistent` / `dismissible` / `hoverable` / `untested[].reason` / `aborted.reason` は `enum`。
`focusTarget` は `string` または `null`（既存 schema の nullable の書き方に合わせる）。
`rect` は 4 つの `number`。`delegationRoots` は `POINTER_GESTURE_CHECK_RESULT_SCHEMA` の `delegationRoots` に `types`（文字列の配列）を足した形。
`aborted` は `CHARACTER_KEY_SHORTCUT_CHECK_RESULT_SCHEMA` の `aborted` の書き方に合わせる。
`RESULT_SCHEMAS` に `'content-on-hover-check'` で登録。

## Steps

### Step 0: Drift check

冒頭の drift check を実行。別の新チェックが先にマージ済みなら、Current state の行番号は
ずれている前提で、各ファイルの「`page-snapshot` の直前」の位置を探し直す。

### Step 1: 型・定数・ルール・normalizer・schema

設計 D・E・F・H・I。`src/index.ts` の axe-format export に `normalizeContentOnHoverCheck`。
normalizer の大半は Step 2 のフィクスチャのテストと Step 4 の schema テストで兼ねる。ただしフィクスチャでは
再現しにくい「調べきれなかった」4 条件（unsupported・読めない CSS・候補の上限・listener の上限）は、
`test/content-on-hover.spec.ts` で手組みの details を `normalizeContentOnHoverCheck`（`../dist/index.js` から import）に
渡して確かめる（Step 2）。

**Verify**: `npm run typecheck` → exit 0、build → exit 0。

### Step 2: フィクスチャとブラウザのテスト（テスト先行）

`test/fixtures/pages/content-on-hover/` に作る。各ファイル冒頭の HTML コメントに意図と期待結果。
**テストでは速さのため `persistMs: 600`、`settleMs: 150` を渡す**（既定値で回すのは `none.html` と
`compliant-tooltip.html` だけ）。JS のツールチップは、きっかけの要素自身に `addEventListener` で
`mouseenter` / `focus` を付けて出し、`mouseleave` / `blur` で消す形を基本にする（CDP で要素に結び付くように）。

| フィクスチャ | 中身 | 期待 |
|---|---|---|
| `none.html` | 段落とリンクだけ。`<style>` / `<script>` なし | `triggers` と `delegationRoots` が空、`results` が空、3 ルール inapplicable、1 秒以内 |
| `compliant-tooltip.html` | ボタン（listener でツールチップ）。ホバー・フォーカスで出し、Escape で消し、ツールチップの上に載せても消えない（トリガーとツールチップを 1 つの親で包み、親の `mouseleave` で消す。親にも listener が付くので親も候補になるが、親のホバーで出る中身は同じ。期待は「ボタンの結果」で確かめる） | ボタンの `results` が hover と focus の 2 件、`persistent: 'stayed'`・`dismissible: 'dismissed'`・hover の `hoverable: 'stayed'`、3 ルール passes |
| `no-escape.html` | compliant と同じだが Escape を聞かない | `dismissible: 'stayed'`（hover・focus とも）、dismissible だけ incomplete、node の対象がボタン |
| `not-hoverable.html` | ボタン自身の `mouseleave` で消す。ツールチップはボタンから 8px 離れた位置 | hover の `hoverable: 'disappeared'`、hoverable だけ incomplete |
| `auto-hide.html` | 出して 300ms 後に `setTimeout` で消す | `persistent: 'disappeared'`、`dismissible: 'not-tested'`、persistent だけ incomplete |
| `css-hover-menu.html` | `.menu:hover > .sub { display: block }`（JS なし、ホバー中は `.sub` が見える。`.sub` は `.menu` の子なので載せられる、Escape では消えない） | `triggers[0].sources` が `['css']`、hover で `dismissible: 'stayed'`、`hoverable: 'stayed'` |
| `css-self-only.html` | `.btn:hover { color: red }` だけ | `triggers` が空（後ろに結合子が無い規則は候補にしない） |
| `focus-only.html` | `<input>` の `focus` で下にヒントを出す（`input:focus + .hint`）、Escape で消えない | focus の結果だけ（hover は中身なし → `noContent` に数える）、`hoverable: 'not-applicable'`、dismissible incomplete |
| `focus-within.html` | フォーカスできない `<div class="group">` の中に `<input>`、`.group:focus-within > .hint { display: block }`。Escape で消えない | `.group` の候補の `focusTarget` が中の `<input>` のセレクタ、focus の結果が 1 件（中身は `.hint`）、dismissible incomplete |
| `escape-blurs.html` | ボタンの `focus` でツールチップを出し `blur` で消す。`keydown` の Escape で `document.activeElement.blur()` するだけ | focus の結果が `dismissible: 'dismissed'`・`escapeMovedFocus: true`、dismissible が incomplete（要約に `moved focus`） |
| `attributes-only.html` | `title` 付きのリンク、ずっと見えている説明文を指す `aria-describedby` 付きの入力欄、`aria-haspopup="menu"` 付きのボタン（クリックで開く）。`:hover` 規則も hover の listener も無い | `triggers` が空、3 ルール inapplicable（属性だけでは候補にしない） |
| `hidden-trigger.html` | `display: none` の要素に `mouseenter` の listener | `triggers` が空 |
| `stuck.html` | 1 つ目のボタンの `mouseenter` で出した中身が消えない（`mouseleave` も Escape も聞かない）。2 つ目のボタンは compliant と同じ | `reloads === 1`、2 つ目のボタンの結果が `compliant` と同じ（1 つ目の中身を 2 つ目の中身と取り違えない） |
| `focus-navigates.html` | リンクの `focus` の listener で `location.assign('none.html')` | focus の組が `untested` に `reason: 'navigated'`、例外にならない、`result.url` が元の URL |
| `document-delegation.html` | `document.addEventListener('mouseover', e => …)` で `e.target.closest('[data-tip]')` に吹き出しを出す。要素自身には listener なし | `delegationRoots` が `[{ selector: 'document', types: ['mouseover'], … }]`、`triggers` が空、3 ルールとも incomplete（page node 1 つ、要約に `delegated to document`） |
| `root-delegation.html` | `<div id="root">` に 20 種類以上のイベントの listener（`mouseover` / `focusin` を含む。React のルートをまねる）。中のボタンには listener なし | `delegationRoots` に `#root`（`eventTypeCount >= 20`）、`#root` は `triggers` に入らない、3 ルールとも incomplete |

`test/content-on-hover.spec.ts` を先に書き（`helpers/fixtures.js` の `test` / `runFixtureCheck` を使う。
`test/character-key-shortcut.spec.ts` が見本）、上の期待を 1 テスト 1 振る舞いで確かめる。加えて:

- `maxReloads: 0` で `stuck.html` → `aborted.reason === 'reload-limit'`、2 つ目のボタンが `untested` に `reason: 'reload-limit'`
- `timeBudgetMs: 1` で `compliant-tooltip.html` → `aborted.reason === 'timeout'`、`untested` が空でない、3 ルール incomplete
- `maxTriggers: 1` で `stuck.html` → `triggers.length === 1`、`triggersTruncated === 1`、3 ルールとも incomplete
  （1 つ目の結果が外れていなくても、切り捨ての page node が入るので passes にならない）
- `normalizeContentOnHoverCheck` に手組みの details（`results`・`triggers`・`delegationRoots`・`untested` が空、`aborted: null`）を渡し、
  次のそれぞれ 1 つだけを立てたとき 3 ルールとも incomplete（page node 1 つ、要約に該当の語）になること（1 条件 1 テスト）:
  `listenerInspection: 'unsupported'`（`Chromium`）、`cssRulesUnreadable: 1`（`cross-origin`）、`listenerNodesTruncated: true`（`were not tried`）。
  4 つとも立てない details では 3 ルールとも inapplicable
- `settleMs: -1` → `Error`、`persistMs: Number.NaN` → `Error`、`maxTriggers: 0` → `Error`、`maxReloads: -1` → `Error`
- 全ケースでエンベロープが `RESULT_SCHEMAS['content-on-hover-check']` に valid

build して実行し、失敗理由が「runner が無い / 登録が無い」であることを確かめてから Step 3 へ
（Step 3 で `buildRunnerRegistry` に登録するまでは `runFixtureCheck` が見つけられない）。

### Step 3: runner・CLI・test-entry・exports

- `src/playwright/runContentOnHoverCheck.ts` を設計 A・B・C・G で実装。
- `src/playwright/index.ts` に runner と Options 型の export。
- `src/cli.ts` の `CHECK_REGISTRY` の `page-snapshot` の前に `kind: 'browser'` の項。
- `src/test-entries/content-on-hover-check.ts`、`package.json` の `exports` / `description`。
- `test/helpers/fixtures.ts` の `buildRunnerRegistry` に `kind: 'browser-navigating'` で登録。

**Verify**: build → Step 2 の spec が green。`node packages/a11y-audit/dist/cli.js --list-checks` で
`content-on-hover-check` が `page-snapshot` の直前。

### Step 4: 既存テストの更新

- `test/fixture-gallery.spec.ts`: MANIFEST に `no-escape.html`（`'a11y-skills/content-on-hover-dismissible': 'incomplete'`）、
  `not-hoverable.html`（`'a11y-skills/content-on-hover-hoverable': 'incomplete'`）、
  `auto-hide.html`（`'a11y-skills/content-on-hover-persistent': 'incomplete'`）、
  `compliant-tooltip.html`（3 ルール `'passes'`）、`document-delegation.html`（3 ルール `'incomplete'`）、
  `none.html`（`'inapplicable'`。MANIFEST がこの値を書けない形なら省く）。
  MANIFEST の仕組みでオプション（`persistMs` など）を渡せるか確かめ、渡せなければ既定値のまま（1 件 10 秒程度）でよい。
  冒頭コメントを 22 checks / 39 rules に（他の新チェックが先に入っていれば数え直す）。
- `test/rule-classification.spec.ts`: `FINDING_EXPECTATIONS` に 3 ルール分。
- `test/schema-validation.spec.ts`: 手組み details（候補 2 件で `sources` 2 種、`delegationRoots` 2 件（`document` と要素）、
  結果 2 件で各状態の値を一通り、untested 1 件、`aborted` あり・なし、`listenerInspection: 'unsupported'`）が valid。

**Verify**: `npm test` → 全 green。

### Step 5: `--checks all` が cli-smoke.html で壊れないこと（CI 安全性）

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/claude-coh-all > /tmp/claude-coh-all.log 2>&1; echo "exit=$?"
grep -E "content-on-hover-check|Errors:" /tmp/claude-coh-all.log
# 期待: [content-on-hover-check] DONE ...、Errors: 0、exit=1（axe 由来）
```

`content-on-hover-result.json` の `details.triggers`・`details.delegationRoots`・`details.results` が空であることも確かめる。
満たせなければ STOP。

### Step 6: ドキュメント

日本語を先に書き、英語を同期する。

- `skills/auditing-wcag/SKILL.ja.md` / `SKILL.md` の CLI チェック表の `character-key-shortcut-check` の行の後ろに 1 行:
  `| \`content-on-hover-check\` | 1.4.13 | CSS の \`:hover\` / \`:focus\` 規則や listener から中身を出しそうな要素を探してホバー・フォーカスし、Escape で消えない・ポインタを載せると消える・数秒で消える中身（候補。要確認）。まとめて受けている listener は報告のみ |`
  / `| ... | 1.4.13 | Content shown on hover or focus (found from CSS :hover / :focus rules and listeners) that Escape does not dismiss, that disappears when the pointer moves onto it, or that disappears on its own (candidates; needs review). Delegated listeners are reported only |`
- `coverage-matrix.ja.md` / `.md` の 1.4.13 行（:31）を
  `インタラクティブ+自動の候補 | \`content-on-hover-check\` **[CLI]** + 動画/ログ | 解除/保持不可でFail`
  （EN は既存の文言に合わせる）に。「基準 × チェック名 × 出力ファイル」表に SC 順で
  `| 1.4.13 | \`content-on-hover-check\` | \`content-on-hover-result.json\` |`。
- `interactive-checks.ja.md` / `.md`: 「## ホバー/フォーカス表示」の表の後ろに
  `character-key-shortcut-check` の節の書式で「`content-on-hover-check` CLI チェック」節（自動で見るもの /
  候補の集め方と見落とす形（属性だけの要素、まとめて受けている listener、別オリジンの CSS） /
  外れた候補と `delegationRoots` について人が確かめること: 例外（入力エラー、ほかの中身を隠さない）、
  Escape 以外の消し方があるか、`persistMs` より長く出ていれば足りる中身か、まとめて受けている listener のページでは
  ボタンやリンクに実際にホバー・フォーカスして確かめる）。1.4.13 行（:212）の根拠欄に `content-on-hover-check` を足す。
- `skills/a11y-knowledge/references/checks-audit.ja.md` / `.md`: 「## チェックごとの対応」の表に 1 行。
- `packages/a11y-audit/TODO-COVERAGE.md`（JA のみ）: 統合点 12 のとおり。
- `packages/a11y-audit/README.md` / `README.ja.md`: 検査一覧表に
  `runContentOnHoverCheck | 1.4.13 ホバー又はフォーカスで表示されるコンテンツ（CSS の規則と listener から出しそうな要素を探してホバー・フォーカスし、消せない・載せられない・自分で消える中身。候補として報告）`、
  「`browser` を受けます」の文と `createContext` を渡せる検査の列挙に `runContentOnHoverCheck` を追加、
  冒頭の検査数を 22 に、チェック名一覧と test entry の列挙に追記、
  `runCharacterKeyShortcutCheck` の段落の後ろに段落（候補の集め方、まとめて受けている listener は報告だけ、
  候補が無ければ何もしない、測る順番、戻せないときだけ新しい context で読み込み直す、
  `settleMs` / `persistMs` / `maxTriggers` / `maxReloads` / `timeBudgetMs`、listener は CDP で取り出すので Chromium のみ、既知の制限）。
- `packages/a11y-audit/CHANGELOG.md`: `## Unreleased` の `### Added` に新チェック・3 ルール・既知の制限。
  **`package.json` の version は変えない**。

**Verify**: `npm run validate:skills && npm run lint && npm run format:check` → exit 0。

### Step 7: 全体検証とコミット

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills`
を通し、Git workflow のとおりコミット。`plans/README.md` に本プランの行を足す。

## Test plan

- **`test/content-on-hover.spec.ts`**: 16 フィクスチャと手組み details の normalizer テストで、`:focus-within` の
  フォーカス先の選び方、Escape でフォーカスが動いた場合、調べきれなかった場合の incomplete、候補の集め方（CSS・listener、属性だけの要素・見えない要素・
  自分だけ変わる CSS の除外）、まとめて受けている listener の報告（`document` とルート要素）、新しい中身の見分け、
  3 条件の判定、Escape・ポインタ移動・待ちの各経路、戻せない中身での読み込み直し、フォーカスで遷移するページ、
  上限・時間切れ・引数の誤りを検証。schema も確かめる。
- **fixture-gallery / rule-classification / schema-validation**: 既存の枠組みに登録。
- **CI**: `--checks all` スモークが新チェックを自動で通す（Step 5）。

## Done criteria

ALL must hold:

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` exit 0
- [ ] `node packages/a11y-audit/dist/cli.js --list-checks` で `content-on-hover-check` が `page-snapshot` の直前
- [ ] Step 5 のスモークで `[content-on-hover-check] DONE`、`Errors: 0`、exit 1、`triggers`・`delegationRoots`・`results` が空
- [ ] `git diff --stat main -- packages/a11y-audit/src/playwright/cdpEventListeners.ts packages/a11y-audit/src/playwright/runCharacterKeyShortcutCheck.ts packages/a11y-audit/src/playwright/runPointerGestureCheck.ts` が空（既存のファイルは未変更）
- [ ] `git diff main -- packages/a11y-audit/src/types.ts` に削除行（`-` で始まる行、ヘッダーを除く）が無い
- [ ] 日英ドキュメントがペアで更新されている（SKILL / coverage-matrix / interactive-checks / checks-audit / README）
- [ ] `package.json` の `version` とプラグイン 4 フィールドが未変更
- [ ] `plans/README.md` に本プランの行がある

## STOP conditions

- 既存チェックの挙動・型・schema・rule、または `cdpEventListeners.ts` を変えなければならなくなった
- headless Chromium で `page.mouse.move` が `:hover` の CSS 規則を効かせない、または `mouseenter` を発火させない
  （`css-hover-menu.html` / `compliant-tooltip.html` で中身が出ない。設計の前提が崩れる）
- `stuck.html` で 2 つ目のボタンの中身を 1 つ目の中身と取り違える、または CI と手元で結果が変わる（差分の取り方が成り立たない）
- `compliant-tooltip.html` が既定値の `settleMs` / `persistMs` で passes にならない（待ち時間の前提が崩れる）
- `root-delegation.html` の `#root` が `forSubtree` で 20 種類以上と数えられない（まとめて受けている要素の見分けが成り立たない）
- Step 5 で `--checks all` が ERROR・ハング・exit 2 になる、または `triggers` / `delegationRoots` が空にならない
- いずれかのフィクスチャでチェックがハングする
- schema 検証・lint・format・既存テストのいずれかが green にできない

## Maintenance notes

- **既知の制限**（runner 先頭コメント・README・CHANGELOG に記載）:
  - 候補は「`:hover` / `:focus` の後ろに結合子がある CSS 規則」と「要素自身に付いた `mouseenter` などの listener（Chromium のみ）」
    の 2 つから集める。属性（`title` / `aria-describedby` / `aria-haspopup`）だけの要素は候補にしない。
    別オリジンのスタイルシートの規則から出る中身は見落とす。候補は最大 `maxTriggers` 件。
  - `document` やフレームワークのルート要素にまとめて付いた listener（React など）で出す中身は測らない。
    見つけたら「まとめて受けている要素」として報告し、人に確かめてもらう。Chromium 以外ではこれも見つけられない。
  - 新しい中身は「見えていなかった要素が見えるようになった」ことで見つける。もとから DOM にあって見えていた要素の
    中身が書き換わるだけのもの、`opacity` や `transform` だけで出し入れするもの、canvas に描くものは拾えない。
  - 消せるかは Escape だけで測る。ほかの消し方（Ctrl キーなど）が用意されていても外れとして出る。
    Escape で消えてもフォーカスが動いた場合も外れとして出す（フォーカスを動かさずに消せるかを確かめられないため）。
  - きっかけ自身がフォーカスできないときは、最初のフォーカスできる子孫 1 つだけにフォーカスして試す。
    2 つ目以降の子孫でだけ出る中身は見落とす。
  - Chromium 以外・別オリジンの CSS・候補や listener の上限で調べきれなかったときは、候補が 0 件でも
    3 ルールとも要確認（incomplete）の page node を出す。
  - 例外（入力エラーを伝える中身、ほかの中身を隠さない・置き換えない中身は消せなくてよい）は判定しない。
  - 自分で消えないかは `persistMs`（既定 3 秒）だけ見る。それより後に消える中身は拾えない。
  - ポインタは、きっかけの中心から中身の最大の部分の中心へまっすぐ動かす。別の経路なら載せられる中身も外れとして出る。
  - きっかけと方法の組ごとに戻す（ポインタを隅へ・フォーカスを外す・Escape）。戻せない中身があるときだけ読み込み直す。
  - iframe の中、shadow root の中（open も closed も。候補にしない）、タッチ操作は見ない。クリックで開く中身は 1.4.13 の対象外なので見ない。
  - フォーカスするので、フォーカスで遷移するページでは遷移が起きる（`untested` に `navigated` で残る）。
  - ページのスクリプトが戻らない（無限ループ）場合は打ち切れない（`keyboard-reachability-check` と同じ）。
- **待ち時間の調整**: `CONTENT_ON_HOVER_SETTLE_MS`・`CONTENT_ON_HOVER_PERSIST_MS` は実際のサイトで見落とし・
  時間切れが多ければ変える。変えるときは `compliant-tooltip.html` と `auto-hide.html` のテストも見直す。
- **後回しにしたもの**:
  - **まとめて受けている listener のページでの候補探し**: 操作できる要素（`<div>` で作ったボタンなども含む）を推定する
    仕組みを別に考え、それができたら `delegationRoots` の中の操作できる要素を候補に足す（2026-10-14 にユーザーと合意。
    フレームワークの内部には頼らない）。
  - **ほかの中身を隠しているかの判定**: 中身の範囲の格子点で `elementsFromPoint` を取り、中身の下に別の文字や部品が
    あるかを記録すれば、dismissible の例外（隠さない中身）を人が判断しやすくなる。まず 3 条件の測定だけで出す。
  - iframe の中。
- **バージョン方針**: 本 PR では version を変えない。リリース PR で `@a11y-skills/audit` を minor、
  スキル文書が変わるのでプラグインも minor に上げ、4 フィールドを揃える。
- レビュアーは特に、(1) context と CDP の接続が成功・失敗どちらの経路でも閉じられるか、(2) 前の組の中身を次の組の
  中身と取り違えないか（印付けの前に戻しているか）、(3) 遷移したときに例外が外へ漏れずそれまでの記録が残るか、
  (4) 読み込み直したあと、続きの組から再開しているか、(5) まとめて受けている要素を候補に入れていないか、を見ること。
