# Plan 035: 新しい検査の登録漏れを、型検査とテストで落とす

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。`plans/README.md` は更新しない。
>
> **差分確認（最初に実行）**:
> `git diff --stat 3b7d8e1..HEAD -- packages/a11y-audit/src/schemas/index.ts packages/a11y-audit/src/cli.ts packages/a11y-audit/src/types.ts packages/a11y-audit/test/fixture-gallery.spec.ts packages/a11y-audit/test/helpers/fixtures.ts packages/a11y-audit/package.json`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **Codex plan review**: 通過(1 巡目、2026-10-25、見送った low 0 件)
- **優先度**: P2
- **工数**: M
- **リスク**: LOW（型注釈とテストの追加。実行時の振る舞いは変えない）
- **依存**: Plan 034（README に `keyboard-trap-check` を載せる。先に入れないと手順 4 のテストが最初から落ちる）
- **カテゴリ**: tech-debt
- **計画時点**: commit `3b7d8e1`, 2026-10-25

## なぜ重要か

検査を 1 つ足すと、約 11 か所を一緒に変える必要がある（下の表）。どれかを忘れても、今は何も失敗しない。実例として、`keyboard-trap-check` は README の名前一覧から抜けたまま 0.5.0 から 0.17.0 まで来た（Plan 034 で直す）。スキーマが無い検査は fixture-gallery の検証を黙って飛ばされる。この半年で `types.ts` が 39 回、`schemas/index.ts` が 31 回、`constants.ts` が 29 回変わっており、登録漏れは起きやすい。

## 現状

### 検査 1 つの登録先（`content-on-hover-check` を例に）

| 場所 | 内容 |
|---|---|
| `src/types.ts:21-44` | `CheckSource` 文字列ユニオン（下に抜粋） |
| `src/types.ts` | `ContentOnHoverCheckDetails` などの型 |
| `src/schemas/index.ts:2362-2386` | `RESULT_SCHEMAS`（下に抜粋） |
| `src/constants.ts:1088-1111` | 定数と結果ファイル名 |
| `src/utils/rule-registry.ts` | `RULES` のルール項目 |
| `src/utils/axe-format.ts` | `normalizeContentOnHoverCheck` |
| `src/index.ts:67`、`src/playwright/index.ts:95-97` | 再公開 |
| `src/test-entries/content-on-hover-check.ts` | Playwright 用の入口 |
| `package.json` `exports` | `"./test-entries/content-on-hover-check"` |
| `src/cli.ts:70` `CHECK_REGISTRY` | CLI の登録表 |
| `test/helpers/fixtures.ts:41-150` | CLI の登録表を手で写した `buildRunnerRegistry` |
| `README.md` / `README.ja.md` | 関数表と名前一覧 |

### `src/types.ts:21-44`

```ts
/** Identifier of the check that produced a result. */
export type CheckSource =
  | 'axe-audit'
  | 'focus-indicator-check'
  …
  | 'content-on-hover-check'
  | 'page-snapshot';
```

### `src/schemas/index.ts:2361-2386`

```ts
/** All result schemas keyed by check id. */
export const RESULT_SCHEMAS = {
  'axe-audit': AXE_AUDIT_RESULT_SCHEMA,
  'focus-indicator-check': FOCUS_CHECK_RESULT_SCHEMA,
  …
  'page-snapshot': PAGE_SNAPSHOT_RESULT_SCHEMA,
} as const;
```

`as const` だけで、キーが `CheckSource` と一致する保証は無い。ファイル先頭（`:1-12`）の方針: 「The TypeScript types are the source of truth; the JSON Schemas are hand-written … intentionally permissive (no `additionalProperties: false`)」。

### `src/cli.ts:69-70`

```ts
// Checks are registered with lazy imports to avoid top-level peer resolution.
const CHECK_REGISTRY: CheckEntry[] = [
```

`CheckEntry.name` は `string`（`:40-49`）。`CHECK_REGISTRY` は export されていない（`cli.ts` は `#!/usr/bin/env node` の実行ファイルで、import すると `main()` が走る）。

### `test/fixture-gallery.spec.ts:33-39, 788-796`

```ts
const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validators = Object.fromEntries(
  Object.entries(RESULT_SCHEMAS).map(([checkName, schema]) => [
    checkName,
    ajv.compile(schema),
  ]),
);
…
    // 3. Schema validation
    const validate = validators[entry.check];
    if (validate) {
      const valid = validate(result);
      expect(valid, `Schema validation failed for ${entry.check}: …`).toBe(true);
    }
```

### `test/helpers/fixtures.ts:36-150`（抜粋）

```ts
// ---------------------------------------------------------------------------
// Runner registry (derived from src/cli.ts CHECK_REGISTRY)
// ---------------------------------------------------------------------------

async function buildRunnerRegistry(): Promise<Record<string, RunnerEntry>> {
  const { runAxeAudit, runFocusIndicatorCheck, … } = await import('../../dist/playwright/index.js');
  return {
    'axe-audit': { kind: 'page-current', run: (opts) => runAxeAudit(opts) },
    'focus-indicator-check': { kind: 'browser-navigating', run: (opts) => runFocusIndicatorCheck(opts) },
    …
  };
}
```

`RunnerKind` は `'page-current' | 'page-navigating' | 'browser-navigating'`（CLI の `kind: 'page' | 'browser'` と `ownsNavigation` を合わせたもの）。`page-snapshot` はここに無い（gallery の対象外）。

### テストが読む側

- テストは `../dist/...` から import する（ビルド後の JS）。`npm test` は `pretest` で `tsc` を走らせる。
- 既存の「2 つの表が一致するか」を見るテストの見本: `test/rule-classification.spec.ts`（fixture-gallery の期待と `rule-registry.ts` の `classification` を照らす）。
- `src/test-entries/` のファイル名は検査名と同じ（`content-on-hover-check.ts`）。`page-snapshot.ts` もある。

## 方針

コンパイル時のガードを 2 つ、テストを 1 つ、gallery の守りを 1 つ。CLI の登録表の名前は、`cli.ts` を import せずに知るために、`--list-checks` の出力を使う（既に公開された契約: `cli.ts:521-524`、`README.md:411`）。

## 範囲

変更可:

- `packages/a11y-audit/src/schemas/index.ts`（`RESULT_SCHEMAS` の型注釈のみ）
- `packages/a11y-audit/src/cli.ts`（`CheckEntry.name` の型のみ）
- `packages/a11y-audit/test/fixture-gallery.spec.ts`（`if (validate)` の 1 か所）
- `packages/a11y-audit/test/check-registration.spec.ts`（新規）

範囲外:

- `test/helpers/fixtures.ts` の手書き登録表（CLI の `kind` / `ownsNavigation` を公開して読む案は、`cli.ts` の分割が要るので今回はやらない。代わりに手順 4 のテストで**名前の集合**だけ照らす）
- スキーマを型から生成すること、`additionalProperties: false`
- `src/test-entries/*` の生成（手書きのままと決定済み）
- README の内容（Plan 034）

## 使うコマンド

| 目的 | コマンド | 期待 |
|---|---|---|
| 型検査 | `npm run typecheck` | exit 0 |
| 1 spec だけ | `npm test --workspace @a11y-skills/audit -- test/check-registration.spec.ts` | 全部 pass |
| 全検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | すべて exit 0 |

## 手順

1. **`RESULT_SCHEMAS` を `CheckSource` に縛る**（`src/schemas/index.ts:2362`）: `} as const;` を `} as const satisfies Record<CheckSource, object>;` にする（`CheckSource` は同ファイルの `../types.js` からの import 群に足す。既に import していればそのまま）。
   - 確認のため、一時的に 1 行（例: `'page-snapshot'`）をコメントアウトして `npm run typecheck` が失敗することを見る。戻してから次へ。
   - **検証**: `npm run typecheck` → exit 0。
2. **`CheckEntry.name` を `CheckSource` にする**（`src/cli.ts:40-49`）: `name: string;` → `name: CheckSource;`（`import type { CheckSource } from './types.js';` を足す）。`CHECK_REGISTRY` の 23 件はすべてユニオンにある名前なのでそのまま通る。綴りを間違えた登録は以後コンパイルで落ちる。
   - **検証**: `npm run typecheck` → exit 0。`node packages/a11y-audit/dist/cli.js --list-checks | wc -l` → `23`（ビルドは `npm run build --workspace @a11y-skills/audit`）。
3. **gallery でスキーマが無いときに落とす**（`test/fixture-gallery.spec.ts:789-790`）: `if (validate) {` を外し、直前に `expect(validate, \`RESULT_SCHEMAS has no entry for ${entry.check}\`).toBeDefined();` を置く。
   - **検証**: `npm test --workspace @a11y-skills/audit -- test/fixture-gallery.spec.ts` → 全部 pass（今は全検査にスキーマがあるので変化なし）。
4. **登録先の集合が一致するテスト**（`test/check-registration.spec.ts`、新規。`@playwright/test` の `test`/`expect` を直接 import、ブラウザ不要）。それぞれ別のテストにし、名前は日本語で:
   - 「`--list-checks` の出力は `RESULT_SCHEMAS` のキーと同じ集合である」: `execFile(process.execPath, [dist/cli.js, '--list-checks'])` の stdout を改行で分け、`Object.keys(RESULT_SCHEMAS)`（`../dist/schemas/index.js`）とソートして `toEqual`。
   - 「`src/test-entries/*.ts` のファイル名は `RESULT_SCHEMAS` のキーと同じ集合である」: `fs.readdirSync(new URL('../src/test-entries/', import.meta.url))` の `.ts` を落とした名前の集合。
   - 「`package.json` の `exports` にある `./test-entries/<name>` は `RESULT_SCHEMAS` のキーと同じ集合である」: `package.json` を読み、`Object.keys(exports).filter(k => k.startsWith('./test-entries/'))` から名前を取る。
   - 「`test/helpers/fixtures.ts` の登録表は `RESULT_SCHEMAS` のキーから `page-snapshot` を除いた集合である」: `fixtures.ts` から `buildRunnerRegistry` を export して呼ぶ（`export` を 1 語足すだけ。これは範囲内の最小の変更として許す）。
   - 「`README.md` と `README.ja.md` のチェック名一覧には `--list-checks` の全名がある」: 各 README を読み、名前ごとに行全体が一致する行（`^name$`）があることを確かめる。
   - **検証**: `npm test --workspace @a11y-skills/audit -- test/check-registration.spec.ts` → 5 テスト pass。
5. **整形と検証**: `npx prettier --write` → 全検証コマンド exit 0。

## 完了条件

- [ ] `RESULT_SCHEMAS` から 1 行消すと `npm run typecheck` が失敗する（確認後に戻す）。
- [ ] `CheckEntry.name` が `CheckSource` 型。
- [ ] `test/check-registration.spec.ts` の 5 テストが pass。
- [ ] `test/fixture-gallery.spec.ts` にスキーマ無しを許す `if (validate)` が無い。
- [ ] 全検証コマンドが exit 0。

## STOP 条件

- 手順 1 で `satisfies` が TypeScript 6.0 の設定（`tsconfig.base.json`）で使えない、または `RESULT_SCHEMAS` の値の型が `object` に合わない（そのエラーを報告する）。
- 手順 4 の README テストが落ちる（Plan 034 が未着手。先に 034 を入れる）。
- `cli.ts` に `CheckSource` を import すると実行時 import が増える（`import type` でなければならない。型以外を取り込みそうなら止める）。
- 差分確認で「現状」と食い違う。

## 保守メモ

- 以後、検査を足す手順: `CheckSource` に名前を足す → `typecheck` が `RESULT_SCHEMAS` の不足を指摘 → スキーマを足す → `check-registration.spec.ts` が test-entries / exports / fixtures.ts / README の不足を指摘。
- `test/helpers/fixtures.ts` の `kind` が CLI の `kind` + `ownsNavigation` と食い違っても、このプランでは検出できない。`cli.ts` から登録表を別モジュールに切り出す日が来たら、そのときに `kind` も照らす。
