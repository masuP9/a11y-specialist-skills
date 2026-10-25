# Plan 008: `@a11y-skills/audit` に `bin` CLI を追加する（007 オプション A の実施）

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP 条件」に該当した
> ら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> の本プランのステータス行を更新する。
>
> **Drift check (run first)**:
> `git diff --stat 2c163b8..HEAD -- packages/a11y-audit/package.json packages/a11y-audit/src/ .github/workflows/ci.yml`
> いずれかが変更されていた場合、「Current state」の抜粋と実ファイルを比較
> してから進む。不一致があれば STOP 条件として扱う。

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MEDIUM(additive — 既存 API・ラッパーには触れないが、publish payload と README が変わる)
- **Depends on**: なし（007 スパイク DONE が前提知識。007-C の README スニペットとは独立 — 「007-C との関係」参照）
- **Category**: feature / dx
- **Planned at**: commit `2c163b8`, 2026-06-12

## Why this matters

007 スパイク（`plans/007-result-cli-design.md`）はオプション A（`bin` 追加）を
「需要シグナルのイシューが 3 件溜まるまで保留」と結論した。しかしスパイクは
**外部ユーザーの需要のみ**を評価しており、内部需要を見落としていた:
`auditing-wcag` スキル自身が最初の CLI 利用者になれる。

現状、スキルの実行フローは重い:

1. `skills/auditing-wcag/references/scripts/` で `npm install`
2. `npx playwright install chromium`
3. チェックごとに `TEST_PAGE=... npx playwright test <check>.ts`

CLI があればステップ 1 と 3 が `npx -y @a11y-skills/audit --url <url>` 一発に
潰れる。さらに将来のスキル移行（フォローアップ Plan 009、本プランのスコープ外）
が完了すれば:

- `references/scripts/` の薄いラッパー 10 本 + `run-test.cjs` +
  `playwright.config.ts` を廃止できる
- Plan 003 のラッパーバンプ自動化（propagation poll → auto-PR →
  close/reopen の儀式）を引退させられる
- スキルディレクトリ内の `node_modules`（testMatch の罠、vendoring 時の注意
  書きの原因）が消える
- Plan 006 のキーボードトラップ実装は CLI レジストリへの登録だけで済む

技術的な実現可能性はスパイクで実証済み: `dist/` から Playwright テストランナー
なしで直接チェックを実行でき（007-result §4.4）、プロトタイプは W3C bad demo
に対して 2 チェックを 4.1 秒で実行し、終了コード契約 0/1/2 も検証済み
（007-result §4.1）。

## Current state

- `packages/a11y-audit/package.json` — v0.3.1。関連する抜粋:
  - `"type": "module"`、`engines: { node: ">=18" }`
  - `bin` フィールド: **なし**
  - `files`: `["dist", "README.md", "README.ja.md", "CHANGELOG.md"]`
    （→ `dist/cli.js` は自動的に payload に入る）
  - `exports`: `.`, `./playwright`, `./schemas`, `./test-entries/*`（10 件）
  - `peerDependencies`: `@axe-core/playwright ^4.10.0`,
    `@playwright/test ^1.50.0`
  - `optionalDependencies`: `pixelmatch ^7.1.0`, `pngjs ^7.0.0`
    （`auto-play-detection` のみが使用）
- チェック関数のシグネチャは 2 種類（007-result §2.2）:
  - **page ベース**（9 本）: `runAxeAudit`, `runReflowCheck`, `runZoomCheck`,
    `runTargetSizeCheck`, `runTextSpacingCheck`, `runOrientationCheck`,
    `runAutocompleteAudit`, `runTimeLimitDetector`, `runAutoPlayDetection`
    — `{ page, ... }` を受け取る。ナビゲーション済みページが前提
  - **browser ベース**（1 本）: `runFocusIndicatorCheck` — `{ browser, ... }`
    を受け取り、内部でコンテキストを再生成する
- 出力: `OutputLocationOptions`（`outputDir` / `outputFile` / `outputPath`、
  env フォールバック `A11Y_OUTPUT_DIR`）。結果エンベロープは
  `{ source, url, timestamp, violations, incomplete, passes, inapplicable,
  summary: { violationCount, incompleteCount, passCount }, details,
  disclaimer }`
- `requireTargetUrl()` は `TEST_PAGE` 環境変数を参照する
- スキルラッパーの「プリセット」の実体は薄い: デフォルトのデモ URL
  （`?preset=ng-terrible1&wcagver=22`）と `runFocusIndicatorCheck` の
  `screenshot: true` のみ。CLI に複雑なプリセット機構は不要で、フラグで足りる
- コールドインストール実験（007-result §3.1）: npm 7+ は peer を自動で引き込む。
  欠けるのは `--legacy-peer-deps` / pnpm / yarn1 のときのみ → **ランタイムの
  ピア確認が必要**（これが工数を S でなく M にしている要因）
- CI（`.github/workflows/ci.yml`）の `package` ジョブ: `npm ci` → lint →
  `npm run build --workspace @a11y-skills/audit` → Playwright ブラウザ
  キャッシュ＋インストール → `npm test --workspace @a11y-skills/audit` →
  `npm publish --dry-run`

## Design

### CLI 仕様

- **bin 名**: `a11y-audit` → `package.json` に
  `"bin": { "a11y-audit": "./dist/cli.js" }`
- **実装**: `packages/a11y-audit/src/cli.ts`（先頭に `#!/usr/bin/env node`、
  tsc は shebang を保持する）。補助モジュールが要る場合は `src/cli/` 配下。
  **既存の `src/` のチェック関数・型・エンベロープには手を入れない**（入れ
  たくなったら STOP 条件）
- **引数解析**: `node:util` の `parseArgs`（Node 18.3+、engines を満たす）。
  **新しい依存を追加しない**

| フラグ | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `--url <url>` | △ | `TEST_PAGE` 環境変数 | 監査対象 URL。`--url` が env より優先。どちらも無ければ usage を出して exit 2 |
| `--checks <list>` | — | `all` | カンマ区切りのチェック名（下記レジストリのキー） |
| `--output-dir <dir>` | — | `./a11y-audit-results` | 007-result §4.3 の指摘どおり `process.cwd()` 直書きを避けた明示デフォルト |
| `--screenshot` | — | off | focus-indicator にのみ作用（ラッパーのプリセット相当） |
| `--list-checks` | — | — | チェック名一覧を出して exit 0 |
| `--help` / `--version` | — | — | 慣例どおり |

- **チェックレジストリ**: `{ name, kind: 'page' | 'browser', run }` の配列。
  名前はラッパーのファイル名から拡張子を落としたものに揃える:
  `axe-audit`, `focus-indicator-check`, `reflow-check`, `text-spacing-check`,
  `zoom-200-check`, `orientation-check`, `autocomplete-audit`,
  `time-limit-detector`, `auto-play-detection`, `target-size-check`。
  page/browser の非対称はレジストリの `kind` で中央処理する（007-result §4.2）
- **ライフサイクル**: `chromium.launch()` を 1 回。page ベースは各チェックで
  `browser.newContext()` → `page.goto(url, { waitUntil: 'networkidle' })` →
  実行 → `context.close()`。browser ベースは `browser` をそのまま渡す
- **ランタイムのピア確認**: チェック実行前に `@playwright/test` と
  `@axe-core/playwright` を動的 import で確認。欠けていたら
  `npm i -D @playwright/test @axe-core/playwright` を案内するエラーを stderr に
  出して exit 2。ブラウザ未インストール時の Playwright のエラー
  （`npx playwright install chromium` 案内）はそのまま透過させてよい
- **optionalDependencies の欠落**: `auto-play-detection` 実行時に
  `pixelmatch` / `pngjs` が無ければ、そのチェックだけ `SKIPPED`（理由付き）
  としてサマリーに出し、他チェックは続行。SKIPPED 自体は終了コードに影響
  させない
- **終了コード契約**（スパイクで検証済み）: `0` = violations なし、
  `1` = いずれかのチェックで violations あり、`2` = 実行時エラー
  （引数不正・ピア欠落・ナビゲーション失敗・チェックのクラッシュ）。
  **エラーや violations があっても、完了したチェックの JSON は必ず書き出す**
- **コンソール出力**: スパイクの形式を踏襲 —
  `[axe-audit] DONE in 1639ms — violations: 6, passes: 14, incomplete: 1`。
  最後に総括行と出力ディレクトリのパスを出す
- **JSON 出力**: 既存の `OutputLocationOptions` 経由で書く。エンベロープは
  ラッパー実行時と **byte 互換である必要はないが、フィールド構成は同一**
  であること（下記「Plan 009 への前方互換要件」参照）

### Plan 009（スキル移行）への前方互換要件

本プランでは移行しないが、CLI は以下を満たして将来の移行を妨げないこと:

1. 10 チェックすべてが CLI から実行できる
2. JSON エンベロープのフィールド構成がラッパー実行時と同一
3. `--screenshot` で focus-indicator のスクリーンショットを有効化できる
4. 終了コードが非 0 でも出力 JSON は書かれている
5. ラッパー（`references/scripts/`）は本プランでは**削除も変更もしない**

### 007-C（README ワークフロースニペット）との関係

007-C は未着手。本プランが先に完了した場合、007-C のスニペットは
007-result §5.2 の YAML 下書き（テストファイル方式）ではなく
`npx -y @a11y-skills/audit --url ...` ベースに簡略化してよい。
逆順で着手されても衝突はしない（スニペットの更新が 1 回増えるだけ）。

## Steps

### Step 0: Drift check

冒頭の drift check を実行。差分があれば Current state と突き合わせる。

### Step 1: `src/cli.ts` の実装と `bin` の配線

1. `packages/a11y-audit/src/cli.ts` を上記仕様で実装する
2. `package.json` に `"bin": { "a11y-audit": "./dist/cli.js" }` を追加
3. ビルド確認:

```sh
npm run build --workspace @a11y-skills/audit
head -1 packages/a11y-audit/dist/cli.js   # => #!/usr/bin/env node
node packages/a11y-audit/dist/cli.js --list-checks   # => 10 チェック名、exit 0
node packages/a11y-audit/dist/cli.js --help           # => usage、exit 0
```

### Step 2: 終了コード契約の検証（ローカル）

```sh
# exit 1: violations あり（スパイクと同じターゲット）
node packages/a11y-audit/dist/cli.js \
  --url "https://www.w3.org/WAI/demos/bad/before/home.html" \
  --checks axe-audit,focus-indicator-check \
  --output-dir /tmp/plan008-results; echo "exit=$?"
# 期待: [axe-audit] / [focus-indicator-check] のサマリー行、exit=1
ls /tmp/plan008-results/   # 期待: 2 チェック分の JSON が存在

# exit 2: ナビゲーション失敗
node packages/a11y-audit/dist/cli.js --url "https://invalid.invalid/" \
  --checks axe-audit --output-dir /tmp/plan008-err; echo "exit=$?"
# 期待: exit=2、stderr にエラー

# exit 2: URL なし
node packages/a11y-audit/dist/cli.js --checks axe-audit; echo "exit=$?"
# 期待: usage 表示、exit=2

# exit 0: violations なしのページ（CI スモークと同じローカルフィクスチャを使う。Step 4 参照）
```

JSON のフィールド構成がラッパー実行時の出力（`source`, `url`, `timestamp`,
`violations`, `incomplete`, `passes`, `inapplicable`, `summary.violationCount`
ほか）と一致することを 1 ファイルで目視確認する。

### Step 3: コールドインストール検証（pack ベース）

```sh
cd packages/a11y-audit && npm pack --pack-destination /tmp && cd -
mkdir -p /tmp/plan008-cold && cd /tmp/plan008-cold && npm init -y
npm i /tmp/a11y-skills-audit-*.tgz
npx a11y-audit --list-checks   # 期待: npm 7+ なので peer が入り、一覧が出る

# ピア欠落パスの確認
mkdir -p /tmp/plan008-legacy && cd /tmp/plan008-legacy && npm init -y
npm i --legacy-peer-deps /tmp/a11y-skills-audit-*.tgz
npx a11y-audit --url https://example.com --checks axe-audit; echo "exit=$?"
# 期待: ピア確認の friendly エラー（npm i -D ... の案内）、exit=2
```

`--list-checks` / `--help` はピア・ブラウザなしでも動くこと（ピア確認は
チェック実行時のみ）。

### Step 4: CI スモークの追加

ネットワーク非依存にするため、ローカル HTML フィクスチャを使う:

1. `packages/a11y-audit/test/fixtures/cli-smoke.html` を追加
   （違反を 1 つ以上含む最小ページ。例: alt なし `<img>` + ラベルなし
   `<input>`。`test/` は `files` に含まれないため publish payload には
   入らない — `npm publish --dry-run` の出力で確認すること）
2. `.github/workflows/ci.yml` の `package` ジョブ、
   「Run smoke tests」の後に追加:

```yaml
      - name: CLI smoke test
        run: |
          set +e
          node packages/a11y-audit/dist/cli.js \
            --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
            --checks axe-audit --output-dir /tmp/cli-smoke
          code=$?
          set -e
          test "$code" -eq 1
          test -n "$(ls /tmp/cli-smoke/)"
```

> 注意: `run: |` ブロック内に列 0 から始まる行を置かないこと
> （workflow-yaml-validation の既知の罠）。js-yaml が通っても Actions
> スキーマで落ちる場合がある。`actionlint` があれば実行する。

3. `file://` + `waitUntil: 'networkidle'` の組み合わせがハングしないことを
   ローカルで確認してから push する。ハングする場合は CLI 側で `file:` スキーム
   のとき `waitUntil: 'load'` にフォールバックしてよい（その判断を README に
   書く必要はない）

### Step 5: ドキュメント

1. `packages/a11y-audit/README.md` と `README.ja.md` に「CLI」セクションを
   追加（**AGENTS.md の EN/JA 同期ルールに従い両方更新**）。内容:
   インストール、`npx -y @a11y-skills/audit --url <url>` の基本形、フラグ表、
   チェック名一覧、終了コード契約、`--url` > `TEST_PAGE` の優先順位、
   ピア要件とブラウザインストール（`npx playwright install chromium`）、
   `auto-play-detection` の optional deps
2. `packages/a11y-audit/CHANGELOG.md` に Unreleased / 0.4.0 エントリを追加
3. `plans/007-result-cli-design.md` の §6.2 直後に追記:
   「2026-06-12: 親スキル（auditing-wcag）の実行簡素化という内部需要により
   オプション A を Plan 008 として実施。3 件のイシュー待ち条件はこれで上書き」

### Step 6: PR とリリース

1. ブランチ `feat/audit-cli` で PR を作成。CI 全ジョブ green を確認
   （`wcag-audit-tests` ジョブはラッパー未変更なので影響しないはず —
   落ちたら STOP）
2. マージ後、既存のリリースフロー（`a11y-audit-v0.4.0` タグ → release.yml）
   で **minor バンプ（0.4.0）** としてリリース。新機能なのでリポジトリの
   バージョニング規約どおり minor
3. リリース後、Plan 003 の bump-wrapper 自動化がラッパーの依存バンプ PR
   （`^0.4.0`）を開く。NPM-PACKAGE-NOTE.md の手順どおり close/reopen して
   CI を回し、マージする。`bin` フィールド追加が bump 自動化を壊さないこと
   をこの PR で確認する
4. `plans/README.md` の本プランのステータス行を更新

## STOP conditions

- Drift check で `packages/a11y-audit/package.json` の `exports` / `files` /
  `peerDependencies` が Current state の抜粋と食い違う
- CLI 実装のために**既存チェック関数のシグネチャまたは出力エンベロープの
  変更が必要**になった（`src/cli.ts` と `src/cli/` の追加だけで完結しない）
- `node:util` の `parseArgs` で仕様が満たせず、新しい依存が必要になった
- 出力 JSON のフィールド構成がラッパー実行時と一致しない
- `file://` フィクスチャでの CI スモークが Step 4-3 のフォールバックを
  入れても安定しない
- `npm publish --dry-run` の payload に `test/` や想定外のファイルが入った

## Out of scope

- スキル本体の移行（ラッパー削除、SKILL.md / automated-checks.md /
  scripts/README の書き換え）→ フォローアップ **Plan 009** として別途起案
- Plan 003 のバンプ自動化の引退 → Plan 009 完了後に判断
- 007-C の README ワークフロースニペット → 別作業（上記「007-C との関係」）
- キーボードトラップチェック（Plan 006 の実装）→ CLI 完了後ならレジストリ
  登録だけで済む

## Maintenance notes

- `plugin-version-check.yml` は影響なし（バージョンフィールドは増えない）
- Plan 006 の実装者へ: 新チェックは `src/cli.ts` のレジストリにも登録する
  こと（登録漏れは `--list-checks` の出力と README のチェック名一覧で気づける）
- 将来 Plan 009 でラッパーを廃止したら、NPM-PACKAGE-NOTE.md と
  bump-wrapper ジョブも一緒に整理すること
