# Plan 010: CLI 0.4.1 — orientation/time-limit チェックに targetUrl を渡す

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP 条件」に該当した
> ら停止して報告する。完了したら `plans/README.md` の本プランのステータス行
> を更新する。
>
> **Drift check (run first)**:
> `git diff --stat 036ae78..HEAD -- packages/a11y-audit/src/cli.ts .github/workflows/ci.yml`
> 差分があれば「Current state」の抜粋と実ファイルを比較してから進む。

## Status

- **Priority**: P1（Plan 009 をブロックしている）
- **Effort**: S
- **Risk**: LOW（CLI レイヤーのみ。チェック関数本体は不変）
- **Depends on**: 008 (DONE)。**Plan 009 はこのプランのリリース完了までBLOCKED**
- **Category**: correctness / bug
- **Planned at**: commit `036ae78`, 2026-06-12

## Why this matters

Plan 009 の実行中、CLI 0.4.0 の `--checks all` が file:// フィクスチャに
対して exit 2 になることが判明した（エグゼキューターが STOP 条件で正しく
停止）。原因は CLI レジストリのオプション渡し漏れ:

- `runOrientationCheck` と `runTimeLimitDetector` は `targetUrl` オプション
  を取り、未指定時は `TEST_PAGE` 環境変数 → それも無ければ
  「No target URL provided」を throw する
  （`src/playwright/runOrientationCheck.ts:175`、
  `src/playwright/runTimeLimitDetector.ts:255`）
- 両関数とも**ナビゲーションを自前で行う**設計
  （orientation は L190 付近、time-limit は L259 で `page.goto`）。
  time-limit のヘッダコメントには「pass an un-navigated `page` and a
  `targetUrl`」と明記されている
- ところが `src/cli.ts` のレジストリは両チェックに `{ page, outputDir }`
  しか渡さず、さらに page ベース共通処理として**事前に `page.goto` 済み**の
  page を渡している → `requireTargetUrl(undefined)` が throw、かつ修正後も
  事前 goto は冗長（同じ URL に 2 回ナビゲートする）

`requireTargetUrl` を使うチェックは全 10 中 3 つで、`focus-indicator-check`
は CLI が `targetUrl` を渡し済み（browser ベース）。**漏れはこの 2 つで全部**
（`grep -ln "requireTargetUrl" packages/a11y-audit/src/playwright/run*.ts`
で確認済み）。

このバグが 008 のレビューをすり抜けた理由: CI の CLI スモークも手元検証も
`--checks axe-audit`（+ focus-indicator）しか実行しておらず、「10 チェック
すべてが CLI から実行できる」という前方互換要件が個別には検証されていな
かった。本プランで CI スモークを `--checks all` に拡張して再発を防ぐ。

## Current state

`packages/a11y-audit/src/cli.ts` — 該当レジストリエントリ（v0.4.0、
`refactor(a11y-audit): type CLI with playwright type-only imports` 後）:

```ts
  {
    name: 'orientation-check',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runOrientationCheck } =
        await import('./playwright/runOrientationCheck.js');
      return (await runOrientationCheck({
        page,
        outputDir,
      })) as AuditResultEnvelope;
    },
  },
```

```ts
  {
    name: 'time-limit-detector',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runTimeLimitDetector } =
        await import('./playwright/runTimeLimitDetector.js');
      return (await runTimeLimitDetector({
        page,
        outputDir,
      })) as AuditResultEnvelope;
    },
  },
```

メインループの page ベース共通処理（`check.kind === 'page'` のとき
`browser.newContext()` → `page.goto(url, { waitUntil })` → `check.run(...)`）。
`RunCheckOptions` は `{ page, browser, outputDir, screenshot, url }` を持ち、
`url` は既に全 run() に渡っている。

`.github/workflows/ci.yml` の「CLI smoke test」ステップ（`a11y-audit-package`
ジョブ内）:

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

## Design

1. `CheckEntry` に `ownsNavigation?: boolean` を追加。メインループは
   `check.kind === 'page' && !check.ownsNavigation` のときだけ事前 goto する
   （ナビゲーション失敗ハンドリングはそのまま）。`ownsNavigation` のチェック
   には fresh context + un-navigated page を渡す
2. `orientation-check` / `time-limit-detector` のエントリに
   `ownsNavigation: true` を付け、run() で `targetUrl: url` を渡す
3. CI スモークを `--checks all` に拡張し、「ERROR 0 件 + exit 1」を機械検証
   する（stdout の `Errors:` 行で判定）
4. パッチリリース 0.4.1（バグ修正 = patch のリポジトリ規約どおり）

既存チェック関数・型・エンベロープには触れない（008 と同じ境界）。

## Steps

### Step 1: cli.ts の修正

1. `CheckEntry` インターフェースに `ownsNavigation?: boolean` を追加
2. メインループの事前 goto 条件を
   `if (check.kind === 'page' && !check.ownsNavigation)` に変更し、
   `ownsNavigation` の場合も context/page は同様に生成して渡す
   （クローズ処理 finally はそのまま全 page チェック共通）
3. 2 エントリを修正:
   - `orientation-check`: `ownsNavigation: true`、
     `runOrientationCheck({ page, targetUrl: url, outputDir })`
   - `time-limit-detector`: `ownsNavigation: true`、
     `runTimeLimitDetector({ page, targetUrl: url, outputDir })`
4. 検証:

```sh
npm ci && npm run build --workspace @a11y-skills/audit
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks orientation-check,time-limit-detector --output-dir /tmp/p010; echo "exit=$?"
# 期待: 両チェック DONE、exit=0 または 1（ERROR が無いこと）
ls /tmp/p010/
```

> 注意: `runTimeLimitDetector` は内部で `waitUntil: 'networkidle'` を使う
> （`runTimeLimitDetector.ts:259`）。file:// でハングしないことを上の検証で
> 確認する。ハングする場合は STOP（チェック関数側の変更はスコープ外）。

### Step 2: 全チェック検証

```sh
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/p010-all; echo "exit=$?"
# 期待: exit=1（axe violations）、ERROR 0 件、SKIPPED 0 件
#       （optionalDeps はワークスペースに入っているため auto-play も DONE）
ls /tmp/p010-all/ | wc -l   # 10 チェック分の出力があること（JSON 10 件前後 + スクリーンショット類）
```

stdout の `--- Summary` ブロックで `Errors:       0` を目視確認。

### Step 3: CI スモークの拡張

「CLI smoke test」ステップを次に置き換える:

```yaml
      - name: CLI smoke test (all checks)
        run: |
          set +e
          node packages/a11y-audit/dist/cli.js \
            --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
            --checks all --output-dir /tmp/cli-smoke | tee /tmp/cli-smoke-stdout.log
          code=$?
          set -e
          test "$code" -eq 1
          grep -E "Errors: +0" /tmp/cli-smoke-stdout.log
          test -n "$(ls /tmp/cli-smoke/)"
```

`run: |` ブロック内に列 0 から始まる行を置かないこと（既知の罠）。
`npx --yes js-yaml .github/workflows/ci.yml` で妥当性確認。

### Step 4: CHANGELOG とゲート

1. `packages/a11y-audit/CHANGELOG.md` に `## 0.4.1 — <実行日>` を追加:
   Fixed — CLI が `orientation-check` / `time-limit-detector` に `targetUrl`
   を渡さず「No target URL provided」で失敗していた。両チェックはナビゲー
   ションを自前で行うため、CLI の冗長な事前ナビゲーションも省略するように
   なった
2. `npm run lint` / `npm run format:check` / 既存テスト
   `npm test --workspace @a11y-skills/audit` がすべて green

### Step 5: コミット

ブランチ `fix/cli-owns-navigation`。コミット例:
`fix(a11y-audit): pass targetUrl to checks that own navigation`。
末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
push・PR・バージョンバンプ・リリースはしない（レビュアー/オペレーターが
扱う。リリースは 0.4.1 patch。**注意: 0.4.1 リリース時点では main に
ラッパーがまだ存在するため、bump-wrapper ジョブが `^0.4.1` の auto-PR を
開く — 通常どおり close/reopen → マージで処理。Plan 009 が先にマージされて
いた場合は bump-wrapper は既に削除済みなので何も起きない）

## STOP conditions

- `requireTargetUrl` を使うチェックが上記 2 + focus-indicator 以外にも
  見つかった
- 修正後も file:// フィクスチャでいずれかのチェックが ERROR になる
- 修正に `src/cli.ts` 以外のソース変更（チェック関数側）が必要になった

## In scope (files)

- `packages/a11y-audit/src/cli.ts`
- `packages/a11y-audit/CHANGELOG.md`
- `.github/workflows/ci.yml`（CLI smoke ステップのみ）

## Out of scope

- `packages/a11y-audit/src/playwright/`（チェック関数は不変）
- `package.json` のバージョン（リリースフローで別途）
- `skills/` 配下（Plan 009 の領分）

## Maintenance notes

- Plan 009 はこのプランの **0.4.1 リリース後に再開**する（009 の
  `cli-integration` ジョブとローカルリハーサルは公開済みパッケージの
  `--checks all` に依存するため、0.4.0 のままでは必ず落ちる）
- Plan 006（キーボードトラップ）実装時: 新チェックがナビゲーションを自前で
  行う設計なら `ownsNavigation: true` を忘れずに。CI スモークが
  `--checks all` になったので、登録漏れ・オプション渡し漏れは CI で検出される
