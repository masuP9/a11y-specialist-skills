# Plan 009: auditing-wcag スキルを `a11y-audit` CLI に移行し、ラッパー層を引退させる

> **Executor instructions**: このプランをステップごとに実行すること。各検証
> コマンドを実行し、期待結果を確認してから次へ進む。「STOP 条件」に該当した
> ら停止して報告する — 即興で回避しないこと。完了したら `plans/README.md`
> の本プランのステータス行を更新する。
>
> **Drift check (run first)**:
> `git diff --stat 036ae78..HEAD -- skills/auditing-wcag/ .github/workflows/ .claude-plugin/ .codex-plugin/`
> 差分があれば「Current state」の抜粋と実ファイルを比較してから進む。
> 構造的な不一致（ジョブの増減、見出しの消失）は STOP 条件。

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MEDIUM（スキルの実行手順・CI ジョブ・リリース自動化を同時に変更。
  npm パッケージ本体には触れない）
- **Depends on**: 008 (DONE — CLI は 0.4.0 で npm 公開済み)、007-C (DONE)
- **Category**: tech debt / dx
- **Planned at**: commit `036ae78`, 2026-06-12

## Why this matters

`auditing-wcag` スキルの自動チェックは現在、
`skills/auditing-wcag/references/scripts/` 配下の薄いラッパー 10 本
（+ `run-test.cjs` + `playwright.config.ts` + 独自 `package.json`）経由で
実行される。チェックロジックは Plan 008 までに npm パッケージ
`@a11y-skills/audit`（0.4.0、`a11y-audit` CLI 同梱）へ完全に移動済みで、
ラッパー層は次のコストだけを生んでいる:

- スキル実行時の摩擦: `cd scripts && npm install && npx playwright install
  chromium && TEST_PAGE=... npx playwright test <x>.ts` という多段手順
- リリースごとのバンプ PR サイクル（release.yml の `bump-wrapper` ジョブ、
  close/reopen の儀式つき — Plan 003 で自動化したが、儀式自体は残った）
- スキルディレクトリ内の `node_modules`（vendoring 時の注意書き、Playwright
  の testMatch 問題の温床）

CLI 移行後の実行手順は 1 コマンド:
`npx -y @a11y-skills/audit --url <url> --checks <name>`。
スキルは「ドキュメントのみ」になり、上記コストがすべて消える。

## Current state

### 削除対象: `skills/auditing-wcag/references/scripts/`（git 管理 19 ファイル）

ラッパー 10 本（`axe-audit.ts`, `focus-indicator-check.ts`, `reflow-check.ts`,
`text-spacing-check.ts`, `zoom-200-check.ts`, `orientation-check.ts`,
`autocomplete-audit.ts`, `time-limit-detector.ts`, `auto-play-detection.ts`,
`target-size-check.ts`）+ `run-test.cjs`, `playwright.config.ts`,
`package.json`, `package-lock.json`, `tsconfig.json`, `README.md`,
`NPM-PACKAGE-NOTE.md`, `IMPLEMENTATION-PLAN.md`, `TODO-COVERAGE.md`。
ほかに untracked の `node_modules/`, `test-results/` がある。

- `TODO-COVERAGE.md` は**生きた内容**（未自動化の達成基準メモ。Plan 006 の
  キーボードトラップ等に関わる）→ 削除ではなく
  `packages/a11y-audit/TODO-COVERAGE.md` へ移動（`files` に含まれないため
  publish payload には入らない — 検証あり）
- それ以外は削除（履歴は git にある）

### ラッパー名 → CLI チェック名の対応（= ファイル名から `.ts` を落とすだけ）

| ラッパー | CLI チェック名 |
|---|---|
| `axe-audit.ts` | `axe-audit` |
| `focus-indicator-check.ts` | `focus-indicator-check` |
| `reflow-check.ts` | `reflow-check` |
| `text-spacing-check.ts` | `text-spacing-check` |
| `zoom-200-check.ts` | `zoom-200-check` |
| `orientation-check.ts` | `orientation-check` |
| `autocomplete-audit.ts` | `autocomplete-audit` |
| `time-limit-detector.ts` | `time-limit-detector` |
| `auto-play-detection.ts` | `auto-play-detection` |
| `target-size-check.ts` | `target-size-check` |

### 書き換え対象ドキュメント（EN/JA 6 ペア = 12 ファイル）

`grep -rn "scripts/\|run-test\|npx playwright test\|TEST_PAGE" skills/auditing-wcag --include="*.md"`
の該当箇所（node_modules 配下は無視）:

1. **`SKILL.md` / `SKILL.ja.md`** — 3 箇所:
   - L44 付近: 「If browser interaction is unavailable, run the Playwright
     tests in `references/scripts/`.」
   - L78–105: `## Automated Test Scripts` セクション全体。スクリプト表
     （10 行）+ Usage コードブロック:
     ```bash
     cd references/scripts
     npm install
     TEST_PAGE="https://example.com" npx playwright test <script-name>.ts
     ```
     + 「See `references/scripts/README.md` for detailed documentation.」
2. **`references/automated-checks.md` / `.ja.md`** — `> **Script:**
   \`scripts/axe-audit.ts\` ...`、`scripts/autocomplete-audit.ts` の 2 箇所
3. **`references/content-checks.md` / `.ja.md`** — `scripts/auto-play-detection.ts`
   への Tip 1 箇所
4. **`references/coverage-matrix.md` / `.ja.md`** — `**[Script]**` マーカーの
   凡例（`scripts/` ディレクトリ + `scripts/README.md` 参照）と
   「The following criteria have automated test scripts in `scripts/`:」
   セクション
5. **`references/interactive-checks.md` / `.ja.md`** — focus-indicator /
   target-size / auto-play の 3 チェックについて、説明文 + 実行コマンド
   （`npx playwright test scripts/<x>.ts`、`TEST_PAGE=...` 形式）
6. **`references/manual-checks.md` / `.ja.md`** — zoom-200 / reflow /
   text-spacing / time-limit / auto-play / orientation のスクリプト言及

### CI（`.github/workflows/ci.yml`）

- paths フィルタに `'skills/auditing-wcag/references/scripts/**'` が
  push/pull_request の 2 箇所
- `wcag-audit-tests` ジョブ（L124 付近〜末尾）: scripts ディレクトリで
  `npm ci` → `npm run typecheck` → Playwright ブラウザキャッシュ →
  `npm test` → `actions/upload-artifact@v7` で `*-result.json` 等を
  アップロード。**役割 = 「公開済み npm パッケージ + スキルの実行手順」の
  結合テスト**。この役割は CLI ベースの新ジョブが引き継ぐ
- actions は checkout@v6 / setup-node@v6 / cache@v5 / upload-artifact@v7、
  Node 24 に統一済み（PR #33）

### release.yml

- `bump-wrapper` ジョブ（L82〜150、冒頭コメント 2 行を含む）: publish 後に
  scripts/package.json をバンプする auto-PR を作る。ラッパー消滅で全削除
- `publish` ジョブ（L15〜）は**触らない**

### プラグインバージョン（4 箇所、CI 強制）

現在 `2.9.0`。スキルの構造変更（ディレクトリ削除）はリポジトリ規約で
**minor バンプ** → `2.10.0`:
`.claude-plugin/plugin.json` の `version`、
`.claude-plugin/marketplace.json` の `metadata.version` と
`plugins[0].version`、`.codex-plugin/plugin.json` の `version`。
`plugin-version-check.yml` が同期を強制する。

## Steps

### Step 0: Drift check + 参照の全量確認

```sh
git diff --stat 036ae78..HEAD -- skills/auditing-wcag/ .github/workflows/ .claude-plugin/ .codex-plugin/
grep -rn "scripts/\|run-test\|npx playwright test\|TEST_PAGE" skills/auditing-wcag --include="*.md" | grep -v node_modules
```

2 つ目の出力が「Current state」の 6 ペアの範囲に収まることを確認。
**列挙外のファイル・パターンが出たら STOP**（プランの想定漏れ）。

### Step 1: TODO-COVERAGE.md の移動と scripts/ の削除

```sh
git mv skills/auditing-wcag/references/scripts/TODO-COVERAGE.md packages/a11y-audit/TODO-COVERAGE.md
git rm -r skills/auditing-wcag/references/scripts/
rm -rf skills/auditing-wcag/references/scripts/   # untracked node_modules/test-results
git status --short | head   # scripts/ 配下が D + R のみであること
```

移動した TODO-COVERAGE.md の冒頭に 1 行追記:
「(2026-06-12 に `skills/auditing-wcag/references/scripts/` から移動。
チェック実装は本パッケージに集約されたため)」

### Step 2: スキルドキュメントの書き換え（EN/JA 同期）

変換規則（全ファイル共通）:

- `scripts/<name>.ts` への言及 → `` `<name>` check ``（チェック名は上の対応表）
- 実行コマンド → `npx -y @a11y-skills/audit --url "<url>" --checks <name>`
- `TEST_PAGE="..." npx playwright test ...` 形式 → 同上（`TEST_PAGE` への言及は
  すべて削除。CLI は `--url` を取る）
- 「See `scripts/README.md`」→ 「See the
  [`@a11y-skills/audit` README](https://www.npmjs.com/package/@a11y-skills/audit)」
  （スキルは単体配布されるため、**リポジトリ相対パスでなく npm URL** にする）

個別指示:

1. **SKILL.md / SKILL.ja.md**: `## Automated Test Scripts` セクションを
   `## Automated Checks CLI` に改題し、次の構成に書き換える:
   - 1 行説明: チェックは npm パッケージ `@a11y-skills/audit` の
     `a11y-audit` CLI で実行する（Node 18+。peer は npm 7+ が自動取得）
   - セットアップ: `npx playwright install chromium`（初回のみ）
   - 実行: `npx -y @a11y-skills/audit --url "https://example.com"`
     （全チェック）/ `--checks axe-audit,focus-indicator-check`（個別）/
     `--screenshot`（focus-indicator の注釈付きスクリーンショット）/
     `--output-dir`（結果 JSON の出力先、デフォルト
     `./a11y-audit-results`）
   - 終了コード: `0` = violations なし / `1` = あり / `2` = 実行時エラー
   - チェック名と対象基準の表（既存の表のファイル名列をチェック名に変更
     して再利用）
   - L44 付近は「run the checks via the `a11y-audit` CLI (see
     "Automated Checks CLI" below)」に変更
2. **coverage-matrix**: `**[Script]**` マーカーは `**[CLI]**` に改め、凡例を
   「`a11y-audit` CLI で自動チェック可能（チェック名は SKILL.md の表を参照）」
   に変更。「scripts in `scripts/`」のセクション見出しも同様に
3. **interactive-checks / manual-checks / automated-checks / content-checks**:
   変換規則どおり機械的に置換。チェックの**説明文（何を検出するか）は
   変更しない**

JA 側は EN と構造・内容を同期させる（このリポジトリの EN/JA 同期規約）。

### Step 3: ci.yml の書き換え

1. paths フィルタから `'skills/auditing-wcag/references/scripts/**'` を
   2 箇所削除
2. `wcag-audit-tests` ジョブを次の `cli-integration` ジョブで**置き換える**
   （公開済みパッケージをスキルの手順どおりに使う結合テスト）:

```yaml
  cli-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '24'

      - name: Install published @a11y-skills/audit (as the skill instructs)
        run: |
          mkdir -p /tmp/cli-it && cd /tmp/cli-it
          npm init -y > /dev/null
          npm install @a11y-skills/audit @playwright/test @axe-core/playwright

      - name: Get Playwright version
        id: playwright-version
        run: echo "version=$(node -p "require('/tmp/cli-it/node_modules/@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v5
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: cd /tmp/cli-it && npx playwright install --with-deps chromium

      - name: Install Playwright system deps
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: cd /tmp/cli-it && npx playwright install-deps chromium

      - name: Run all checks via CLI against local fixture
        run: |
          set +e
          cd /tmp/cli-it
          npx a11y-audit \
            --url "file://$GITHUB_WORKSPACE/packages/a11y-audit/test/fixtures/cli-smoke.html" \
            --checks all --output-dir results
          code=$?
          set -e
          test "$code" -eq 1
          test -n "$(ls results/)"
```

> 注意: `run: |` ブロック内に列 0 から始まる行を置かないこと（既知の罠）。

### Step 4: release.yml から bump-wrapper を削除

`bump-wrapper` ジョブ全体（ジョブ直前の説明コメント行も含む）を削除。
`publish` ジョブと `on:` / `permissions` は変更しない。
削除後 `grep -n "bump-wrapper\|references/scripts" .github/workflows/release.yml`
が 0 件であること。

### Step 5: プラグインバージョンを 2.10.0 に

4 箇所すべて編集後、ローカルで同期チェック（plugin-version-check.yml の
インラインスクリプトと同等）:

```sh
node -e '
  const r=(p)=>JSON.parse(require("fs").readFileSync(p,"utf8"));
  const vs=[r(".claude-plugin/plugin.json").version,
    r(".claude-plugin/marketplace.json").metadata.version,
    r(".claude-plugin/marketplace.json").plugins[0].version,
    r(".codex-plugin/plugin.json").version];
  if (new Set(vs).size!==1 || vs[0]!=="2.10.0") { console.error(vs); process.exit(1); }
  console.log("version sync OK:", vs[0]);
'
```

### Step 6: 検証

```sh
# 1. 参照の残骸ゼロ
grep -rn "references/scripts\|run-test\|npx playwright test\|TEST_PAGE" \
  skills/ .github/ --include="*.md" --include="*.yml" | grep -v node_modules
# 期待: 0 件

# 2. ゲート
npm run validate:skills
npm run lint
npm run format:check

# 3. ワークフローの YAML 妥当性
npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo CI-OK
npx --yes js-yaml .github/workflows/release.yml > /dev/null && echo REL-OK

# 4. cli-integration ジョブのローカルリハーサル（公開済み 0.4.0 を使用）
mkdir -p /tmp/cli-it-local && cd /tmp/cli-it-local && npm init -y > /dev/null
npm install @a11y-skills/audit @playwright/test @axe-core/playwright
npx playwright install chromium
npx a11y-audit --url "file://$OLDPWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir results; echo "exit=$?"
# 期待: exit=1（axe violations）、results/ に JSON 群
ls results/
cd -

# 5. TODO-COVERAGE.md が publish payload に入らないこと
npm pack --workspace @a11y-skills/audit --dry-run 2>&1 | grep -i "todo" || echo "payload clean"
```

### Step 7: コミット

ブランチ `feat/skill-cli-migration`。論理単位で分割コミット（例:
①scripts 削除+TODO 移動、②docs 書き換え、③CI/release、④version bump）。
各コミット末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
push・PR 作成はしない（レビュアーが扱う）。

## STOP conditions

- Step 0 で列挙外のスクリプト参照が見つかった
- ドキュメントの記述が CLI に等価機能のない動作を約束している
  （例: CLI に無いフラグや出力が必要）
- Step 6-4 のローカルリハーサルで、いずれかのチェックが file:// フィクスチャ
  に対して ERROR（exit 2 の原因）になる。1 チェックのみなら、CI ジョブの
  `--checks` からそのチェックを除外して NOTES に明記する**回避を 1 回だけ**
  許可。2 チェック以上なら STOP
- `validate:skills` がスクリプトディレクトリの存在に依存していて失敗する
- marketplace.json の構造が「Current state」と異なる

## In scope (files)

- `skills/auditing-wcag/references/scripts/`（全削除）
- `packages/a11y-audit/TODO-COVERAGE.md`（移動先、冒頭 1 行追記のみ）
- スキルドキュメント 12 ファイル（SKILL ×2、references の 5 ペア）
- `.github/workflows/ci.yml`、`.github/workflows/release.yml`
- `.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、
  `.codex-plugin/plugin.json`（バージョンのみ）

## Out of scope (touch nothing here)

- `packages/a11y-audit/` の src / package.json / README / CHANGELOG
  （npm パッケージのリリースは伴わない）
- 他のスキル（reviewing-a11y, planning-*）
- `.github/workflows/plugin-version-check.yml`
- ルート package.json / eslint / prettier 設定

## Maintenance notes

- **レビュアーへ**: ブランチ保護で `wcag-audit-tests` が required check に
  指定されている場合、ジョブ名変更でマージがブロックされる。マージ前に
  リポジトリ設定を確認すること（executor は確認できない）
- `cli-integration` は**公開済み**パッケージを `@latest` で使うため、
  パッケージのリリース後は自動的に新バージョンで走る（バンプ PR 不要 —
  これが bump-wrapper 引退の根拠）。逆に言うと PR の src 変更はこのジョブに
  反映されない（それは `a11y-audit-package` ジョブの役割）
- Plan 006（キーボードトラップ）実装時: 新チェックは CLI レジストリ登録 +
  スキルドキュメントのチェック表への行追加のみ。ラッパー追加は不要になった
- スキル利用者向けの破壊的変更（スキル内スクリプト廃止）なので、プラグイン
  リリースノートがある場合は明記すること
