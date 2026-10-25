# Plan 036: CLI の引数と終了コードの分岐をテストで固め、`--checks` の重複を除く

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。`plans/README.md` は更新しない。
>
> **差分確認（最初に実行）**:
> `git diff --stat 3b7d8e1..HEAD -- packages/a11y-audit/src/cli.ts packages/a11y-audit/test/cli-concurrency.spec.ts packages/a11y-audit/test/network-busy.spec.ts packages/a11y-audit/test/accessible-authentication.spec.ts packages/a11y-audit/test/motion-actuation.spec.ts`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **優先度**: P2
- **工数**: S
- **リスク**: LOW（本体の変更は重複除去の 1 行。残りはテスト）
- **依存**: なし
- **カテゴリ**: tests
- **計画時点**: commit `3b7d8e1`, 2026-10-25

## なぜ重要か

`src/cli.ts` は skill がエージェントに使わせる入口で、この半年で 19 回変わった。終了コードの契約（0 = 違反なし、1 = 違反あり、2 = 実行エラー）と `--list-checks` / `--version` / 引数エラーの分岐に、テストは `--concurrency` の検証（`test/cli-concurrency.spec.ts:73-91`）しかない。CI も「exit 1」しか見ていない（`.github/workflows/ci.yml` の CLI smoke）。きれいなページで exit 0 が返らなくなる、`--list-checks` が壊れる、不明な検査名が黙って無視される、といった退行は今は気づけない。

ついでに直す小さなバグ: `--checks a,a` のように同じ名前を 2 回書くと同じ検査が 2 回走り、`--concurrency` が 2 以上なら並行で同じ結果ファイル・スクリーンショットに書く（`cli.ts:542-555` に重複除去が無い）。

`runCli`（CLI を子プロセスで走らせるヘルパ）は 4 つの spec に別々に書かれている。新しいテストを書く前に 1 つにまとめる。

## 現状

### `src/cli.ts` の分岐（行番号は計画時点）

| 行 | 条件 | 出力 | 終了コード |
|---|---|---|---|
| `:499-506` | `parseArgs` が例外（不明なフラグ、値なし） | stderr `Error: …` + usage | 2 |
| `:508-511` | `--help` | stdout に usage | 0 |
| `:513-516` | `--version` | stdout に `pkgVersion`（`package.json` の `version`） | 0 |
| `:518-521` | `--list-checks` | stdout に `CHECK_REGISTRY` の名前を 1 行ずつ | 0 |
| `:524-531` | `--url` も `TEST_PAGE` も無い | stderr `Error: --url is required (or set the TEST_PAGE environment variable).` + usage | 2 |
| `:546-552` | 不明な検査名 | stderr `Error: unknown check(s): <names>` + `Run --list-checks to see available names.` | 2 |
| `:565-571` | `--concurrency` が正の整数でない | stderr `Error: --concurrency must be a positive integer (got …).` | 2（テスト済み） |
| `:580-585` | peer が無い | stderr `Error: Missing required peer dependencies: …` | 2 |
| `:597-603` | ブラウザ起動失敗 | stderr `Error launching browser: …` | 2 |
| `:776-782` | 完走 | `--- Summary …` | エラーあり 2 / 違反あり 1 / それ以外 0 |

`:538-555`:

```ts
  let selectedChecks: CheckEntry[];
  if (!checksArg || checksArg === 'all') {
    selectedChecks = CHECK_REGISTRY;
  } else {
    const names = checksArg.split(',').map((n) => n.trim());
    const unknown = names.filter(
      (n) => !CHECK_REGISTRY.some((c) => c.name === n),
    );
    if (unknown.length > 0) {
      process.stderr.write(
        `Error: unknown check(s): ${unknown.join(', ')}\n` +
          `Run --list-checks to see available names.\n`,
      );
      process.exit(2);
    }
    selectedChecks = names
      .map((n) => CHECK_REGISTRY.find((c) => c.name === n))
      .filter((c): c is CheckEntry => c !== undefined);
  }
```

完走時の 1 検査ごとの出力は `[<name>] DONE …` / `[<name>] SKIPPED …` / `[<name>] ERROR: …` の行（`test/cli-concurrency.spec.ts` の `finishedCheckCount` が `^\[[a-z0-9-]+\] (DONE|SKIPPED)` で数えている）。

### `runCli` の 4 つのコピー

`test/cli-concurrency.spec.ts:14-45`（最も整った版）:

```ts
interface CliRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

// Async on purpose: a sync spawn would block this process, which also serves
// the fixture pages.
function runCli(args: string[], timeoutMs: number): Promise<CliRun> {
  const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [cliPath, ...args],
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && child.exitCode === null) {
          reject(new Error(`a11y-audit CLI did not exit normally (${error.message})`));
          return;
        }
        resolve({ code: child.exitCode, stdout, stderr });
      },
    );
  });
}
```

他の 3 つは `execFile` をその場で書いている: `test/network-busy.spec.ts:117-135`（code と stderr だけ返す）、`test/accessible-authentication.spec.ts:331-350`（code だけ、`timeout: 45_000`）、`test/motion-actuation.spec.ts:261-280`（code だけ、`timeout: 30_000`）。

### 使える fixture

- きれいなページ: `test/fixtures/pages/axe-audit/clear.html`（gallery で `axe-audit` が違反なしになることを確認済み）。`baseUrl` fixture（`test/helpers/fixtures.ts` の `test`）で HTTP 配信される。
- 違反のあるページ: `test/fixtures/cli-smoke.html`（CI の smoke が exit 1 を確認している。img に alt なし、label なし input）。
- テスト名は日本語（`test/cli-concurrency.spec.ts:73` 「`--concurrency 0` で usage エラーになり終了コード 2 で終わる」が見本）。

## 方針

- `runCli` を `test/helpers/cli.ts` に移し、4 spec から使う（戻り値は `CliRun`。古い 3 つは `code` だけ見るので、そのまま `.code` を読む）。
- 新 spec `test/cli-args.spec.ts` に、ブラウザを使わない分岐（`--help` / `--version` / `--list-checks` / `--url` なし / 不明な検査名 / 不明なフラグ）と、ブラウザを使う完走 2 本（exit 0、exit 1）を書く。
- `--checks` の名前を `[...new Set(names)]` で重複除去する。

## 範囲

変更可:

- `packages/a11y-audit/src/cli.ts`（`:542` 付近の 1 行と、必要ならコメント）
- `packages/a11y-audit/test/helpers/cli.ts`（新規）
- `packages/a11y-audit/test/cli-args.spec.ts`（新規）
- `packages/a11y-audit/test/cli-concurrency.spec.ts`、`test/network-busy.spec.ts`、`test/accessible-authentication.spec.ts`、`test/motion-actuation.spec.ts`（`runCli` の置き換えのみ。期待値は変えない）
- `packages/a11y-audit/CHANGELOG.md`

範囲外:

- `cli.ts` の他の分岐・メッセージ文言・終了コードの契約
- `README` の CLI 節（振る舞いは変わらない）
- `ci.yml`

## 使うコマンド

| 目的 | コマンド | 期待 |
|---|---|---|
| 新 spec だけ | `npm test --workspace @a11y-skills/audit -- test/cli-args.spec.ts` | 全部 pass |
| 置き換えた spec | `npm test --workspace @a11y-skills/audit -- test/cli-concurrency.spec.ts test/network-busy.spec.ts test/accessible-authentication.spec.ts test/motion-actuation.spec.ts` | 全部 pass |
| 全検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | すべて exit 0 |

## 手順

1. **`test/helpers/cli.ts` を作る**: `cli-concurrency.spec.ts:14-45` の `CliRun` と `runCli` を移し、両方 `export`。`cliPath` は `new URL('../../dist/cli.js', import.meta.url).pathname`（helpers/ から 1 段深いので注意）。`cli-concurrency.spec.ts` からは元の定義を消して `import { runCli } from './helpers/cli.js';` にする。
   - **検証**: `npm test --workspace @a11y-skills/audit -- test/cli-concurrency.spec.ts` → 全部 pass。
2. **他の 3 spec を置き換える**: それぞれの `execFile` ブロックを `const { code } = await runCli([...args], <元の timeout>);` にする（`network-busy` は `{ code, stderr }`）。元の timeout 値（45_000 / 30_000、network-busy は無指定なので `test.setTimeout` の値より少し短い値、例 50_000）を保つ。
   - **検証**: 上の表の 4 spec が pass。
3. **失敗するテストを先に書く**（`test/cli-args.spec.ts`）。`import { test, expect } from './helpers/fixtures.js';`（`baseUrl` が要るため）と `import { runCli } from './helpers/cli.js';`。1 テスト 1 振る舞い:
   - 「`--help` で usage を出して終了コード 0」: `code === 0`、stdout に `Usage: a11y-audit --url <url> [options]`。
   - 「`--version` で package.json の version を出して終了コード 0」: `packages/a11y-audit/package.json` を読んで比較（`fs.readFileSync(new URL('../package.json', import.meta.url))`）。stdout を `trim()` して一致。
   - 「`--list-checks` で `RESULT_SCHEMAS` のキーと同じ名前を 1 行ずつ出して終了コード 0」: `import { RESULT_SCHEMAS } from '../dist/schemas/index.js'`、stdout を改行で分けてソートし `toEqual`（Plan 035 の `check-registration.spec.ts` と重なるが、ここでは「CLI の出力契約」として残す）。
   - 「`--url` も `TEST_PAGE` も無いと終了コード 2 で `--url is required` を出す」: `runCli([], 30_000)`。**注意**: 親プロセスに `TEST_PAGE` があると通らないので、`runCli` に `env` を渡せるようにするか、このテストでは `execFile` の `env: { ...process.env, TEST_PAGE: '' }` 相当が要る。`runCli(args, timeoutMs, { env })` の第 3 引数（任意）を helpers/cli.ts に足し、`TEST_PAGE` を削った env を渡す。
   - 「不明な検査名を渡すと終了コード 2 で `unknown check(s): <name>` と `--list-checks` の案内を出す」: `['--url', 'file:///dev/null', '--checks', 'axe-audit,no-such-check']` → stderr に `unknown check(s): no-such-check`。
   - 「不明なフラグを渡すと終了コード 2 で usage を出す」: `['--url', 'file:///dev/null', '--bogus']` → `code === 2`、stderr に `Error:`、stdout に `Usage:`。
   - 「違反の無いページを `--checks axe-audit` で走らせると終了コード 0 で `[axe-audit] DONE` を出す」: `['--url', \`${baseUrl}/axe-audit/clear.html\`, '--checks', 'axe-audit', '--output-dir', testInfo.outputDir]`、timeout 60_000、`test.setTimeout(90_000)`。
   - 「違反のあるページを `--checks axe-audit` で走らせると終了コード 1 になる」: `test/fixtures/cli-smoke.html` を `file://` で（`new URL('./fixtures/cli-smoke.html', import.meta.url).href`）。
   - 「`--checks axe-audit,axe-audit` と重ねて書いても axe-audit は 1 回だけ走る」: きれいなページで、stdout の `^\[axe-audit\] DONE` の行数が 1。**これだけが実装前に落ちる**（今は 2 行出る）。他は実装前から通るはず（通らなければ本体のバグとして報告する）。
   - **検証**: `npm test --workspace @a11y-skills/audit -- test/cli-args.spec.ts` → 重複のテストだけ落ちる。
4. **重複除去**（`src/cli.ts:542`）: `const names = checksArg.split(',').map((n) => n.trim());` を `const names = [...new Set(checksArg.split(',').map((n) => n.trim()))];` にする。
   - **検証**: `test/cli-args.spec.ts` 全部 pass。
5. **CHANGELOG**（Unreleased、Fixed）: 「CLI: a check named more than once in `--checks` now runs once.」
6. **整形と検証**: `npx prettier --write` → 全検証コマンド exit 0。

## 完了条件

- [ ] `git grep -n 'execFile' -- packages/a11y-audit/test` が `test/helpers/cli.ts` だけを返す。
- [ ] `test/cli-args.spec.ts` の 9 テストが pass。
- [ ] 置き換えた 4 spec の期待値が変わっていない（diff が `runCli` の呼び出しへの置き換えだけ）。
- [ ] 全検証コマンドが exit 0。

## STOP 条件

- 手順 3 で、重複のテスト**以外**が実装前に落ちる（契約と実装がずれている。どれが・どう落ちたかを報告する）。
- `axe-audit/clear.html` が `--checks axe-audit` で exit 1 になる（fixture が「きれい」でなくなっている）。
- 差分確認で「現状」と食い違う。

## 保守メモ

- 以後 CLI のメッセージ文言を変えるときは `cli-args.spec.ts` の `toContain` の文字列も直す。文言を固定したくなければ、終了コードの検証だけ残して文言の検証を緩める判断もある。
- `checkPeers` 失敗（exit 2）とブラウザ起動失敗（exit 2）は、子プロセスの環境を壊さないと再現できないので、このプランでは試験しない。
