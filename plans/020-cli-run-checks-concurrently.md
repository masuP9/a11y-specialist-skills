# Plan 020: Run CLI checks concurrently (bounded pool, `--concurrency`)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8ccf591..HEAD -- packages/a11y-audit/src/cli.ts packages/a11y-audit/src/utils/test-harness.ts packages/a11y-audit/test/network-busy.spec.ts packages/a11y-audit/README.ja.md packages/a11y-audit/README.md packages/a11y-audit/CHANGELOG.md .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (timing-sensitive checks run under more CPU load; mitigated by a parity test and `--concurrency 1`)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `8ccf591`, 2026-10-16
- **Codex plan review**: 通過(2 巡目、2026-10-16、見送った low 0 件)

## Why this matters

The `a11y-audit` CLI is how the `auditing-wcag` skill runs automated checks
(`npx -y @a11y-skills/audit --url <url>`; see `skills/auditing-wcag/SKILL.ja.md:98`).
`src/cli.ts` runs the 23 registered checks **one after another** in a single
`for` loop, so the wall-clock time is the *sum* of all check durations.
Measured at commit `8ccf591` (fresh `tsc` build, local Chromium, WSL2):

| Target | Total (sequential) | Largest contributors |
|---|---|---|
| `test/fixtures/index.html` (file://) | **50.5 s** | pointer-cancellation 14.5 s, auto-play 7.0 s, focus-indicator 4.2 s, keyboard-trap 4.2 s, focus-order 4.1 s, keyboard-reachability 3.6 s, time-limit 2.6 s |
| `https://www.w3.org/WAI/demos/bad/before/home.html` | **100.8 s** | content-on-hover 34.0 s, pointer-cancellation 16.2 s, auto-play 7.5 s, change-on-input 6.5 s, keyboard-trap 5.1 s, focus-indicator 4.8 s, focus-order 4.8 s, keyboard-reachability 4.2 s |

The slow checks are slow by design (they wait fixed settle/persist periods
per element: e.g. `CONTENT_ON_HOVER_PERSIST_MS = 3_000`, per-element
`POINTER_CANCELLATION_SETTLE_MS = 300`, `SCREENSHOT_INTERVALS = [0, 2000, 4000, 6000]`).
Most of that time is **waiting, not CPU**, and every check already runs in
its own `BrowserContext` — so running several checks at once in the same
Chromium cuts wall time to roughly the longest check plus a little. Expected:
~50 s → ~20 s on the fixture, ~100 s → ~40 s on the W3C demo page (bounded by
content-on-hover at 34 s). Multi-page audits (the skill runs the CLI once per
page) scale accordingly.

This plan adds a `--concurrency <n>` flag to the CLI with a bounded worker
pool (default on), keeps `--concurrency 1` byte-for-byte equivalent to today's
behaviour, and adds a parity test proving sequential and concurrent runs
produce the same per-check verdict counts.

## Current state

Relevant files (all paths relative to the repo root):

- `packages/a11y-audit/src/cli.ts` — the CLI. `CHECK_REGISTRY` (lines 66–350),
  `parseArgs` options (lines 440–452), usage text (lines 356–385), the
  sequential loop (lines 555–661), the summary (lines 670–696).
- `packages/a11y-audit/src/utils/test-harness.ts` — `AuditOutputOptions`
  (lines 86–95): every check accepts `quiet` / `writeResult` through this
  interface; its doc comment states "concurrent runs do not affect each other".
- `packages/a11y-audit/test/network-busy.spec.ts` — lines 114–144 spawn
  `dist/cli.js` with `execFile`; use this as the pattern for the new CLI test.
- `packages/a11y-audit/README.ja.md` (lines 310–320) and
  `packages/a11y-audit/README.md` (lines 398–408) — the CLI flags tables.
- `packages/a11y-audit/CHANGELOG.md` — `## Unreleased` / `### Added` at the top.
- `.github/workflows/ci.yml` lines 108–118 and 161–169 — CLI smoke steps that
  run `--checks all` and grep `Errors: +0` from stdout. **They must keep passing
  unchanged.**

### The sequential loop today (`src/cli.ts:555-661`, abridged)

```ts
  const summaries: CheckSummary[] = [];
  let hasViolations = false;
  let hasErrors = false;

  for (const check of selectedChecks) {
    const start = Date.now();

    // page-based checks get a fresh context + navigated page
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      if (check.kind === 'page') {
        context = await browser.newContext();
        page = await context.newPage();

        if (!check.ownsNavigation) {
          try {
            await gotoAndSettle(page, url);
          } catch (navErr) {
            // ... pushes an ERROR summary, hasErrors = true, `continue`
          }
        }
      }

      const result = await check.run({
        // page is null only for browser-kind checks, which do not use it
        page: page as Page,
        browser,
        outputDir,
        screenshot,
        url,
      });

      const durationMs = Date.now() - start;
      // ... counts, `[name] DONE in …` line, summaries.push({ status: 'DONE', ... })
    } catch (err) {
      // ... auto-play optional-dep → SKIPPED, otherwise ERROR + hasErrors = true
    } finally {
      if (context !== null) {
        try {
          await context.close();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
```

### The summary today (`src/cli.ts:670-688`)

```ts
  const totalMs = summaries.reduce((acc, s) => acc + s.durationMs, 0);
  // ...
  process.stdout.write(
    `--- Summary (${formatDuration(totalMs)}) ---\n` +
      `  Checks run:   ${doneCount}\n` +
      `  Skipped:      ${skippedCount}\n` +
      `  Errors:       ${errorCount}\n` +
      `  Total violations: ${totalViolations}\n` +
      `  Results written to: ${outputDir}\n`,
  );
```

### `RunCheckOptions` and `CheckEntry` today (`src/cli.ts:25-48`)

```ts
interface RunCheckOptions {
  page: Page;
  browser: Browser;
  outputDir: string;
  screenshot: boolean;
  url: string;
}
// ...
interface CheckEntry {
  name: string;
  kind: CheckKind;
  /** When true, the check owns its own navigation (page.goto). ... */
  ownsNavigation?: boolean;
  run: (opts: RunCheckOptions) => Promise<AuditResultEnvelope>;
}
```

Each registry entry's `run` forwards a fixed set of options to the check, e.g.
(`src/cli.ts:68-74`):

```ts
  {
    name: 'axe-audit',
    kind: 'page',
    async run({ page, outputDir }) {
      const { runAxeAudit } = await import('./playwright/runAxeAudit.js');
      return (await runAxeAudit({ page, outputDir })) as AuditResultEnvelope;
    },
  },
```

### Facts verified during planning (do not re-derive)

- All 23 checks accept `quiet?: boolean` via `AuditOutputOptions`
  (`git grep -c AuditOutputOptions -- packages/a11y-audit/src/playwright/run*.ts`
  → every `run*.ts` file matches).
- Each check writes a **distinct** default result file into `outputDir`
  (`axe-result.json`, `focus-indicator-result.json`, …, 23 files) and
  auto-play writes its frames into the `auto-play-screenshots/` sub-directory
  (the CLI already passes `path.join(outputDir, 'auto-play-screenshots')`).
  Concurrent checks therefore do not clobber each other's files.
- `browser`-kind checks create their own contexts
  (`runFocusIndicatorCheck.ts:352`, `runKeyboardTrapCheck.ts:120`,
  `runContentOnHoverCheck.ts:947`, …); `page`-kind checks get a fresh
  context from the CLI loop. Nothing is shared across checks except the
  `Browser` object, which Playwright supports using from several contexts at once.
- `runAccessibleAuthenticationCheck` calls `page.bringToFront()` and grants
  clipboard permissions **on its own context** (`runAccessibleAuthenticationCheck.ts:567-577, 665`).
  This is the one place where a concurrently running check could in theory be
  affected (focus/visibility). The parity test in Step 6 covers it.
- The CLI's own per-check line `[name] DONE in Xs — violations: …` is
  written by `cli.ts`, not by the checks; checks print their own summaries
  through `console.log` unless `quiet: true`.
- Node engine is `>=18` (`packages/a11y-audit/package.json`). Use
  `os.cpus().length` (not `os.availableParallelism`, which needs 18.14+).

### Conventions to match

- TypeScript ESM, 2-space indent, single quotes, trailing commas (Prettier +
  ESLint enforced in CI: `npm run lint && npm run format:check`).
- Doc comments in English; test titles may be Japanese or English (both exist,
  e.g. `motion-actuation.spec.ts:257` uses Japanese).
- Tests use `@playwright/test` and import from the **built** `../dist/…`
  (`pretest` runs `npm run build`). Spawning the CLI uses
  `execFile(process.execPath, [cliPath, ...])` asynchronously — see
  `network-busy.spec.ts:114-144`.
- Commit messages: conventional commits scoped to the package, e.g.
  `feat(a11y-audit): add content-on-hover-check for WCAG 1.4.13 candidates (#107)`.
- README: Japanese file is the source of truth; update `README.ja.md` first,
  then mirror in `README.md`. CHANGELOG entries go under `## Unreleased`.

## Commands you will need

| Purpose | Command (run from the repo root) | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0, `packages/a11y-audit/dist/cli.js` updated |
| Lint + format | `npm run lint && npm run format:check` | exit 0 |
| Format a file | `npx prettier --write <path>` | file rewritten |
| Tests (all) | `npm test --workspace @a11y-skills/audit` | all pass (builds first via `pretest`) |
| Tests (one file) | `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/cli-concurrency.spec.ts` | all pass (build first) |
| Skill validation | `npm run validate:skills` | exit 0 |
| Full gate | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | exit 0 |
| Manual timing | `node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/index.html" --checks all --output-dir /tmp/a11y-c4` | exit 0, `--- Summary (…)` well under 50 s |

Playwright browsers must be installed (`npx playwright install chromium` in
`packages/a11y-audit` if the tests fail with a "browser not found" error).

## Scope

**In scope** (the only files you should modify):
- `packages/a11y-audit/src/cli.ts`
- `packages/a11y-audit/test/cli-concurrency.spec.ts` (create)
- `packages/a11y-audit/README.ja.md`, `packages/a11y-audit/README.md` (flags table + one sentence)
- `packages/a11y-audit/CHANGELOG.md` (`## Unreleased` entry)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- Any `packages/a11y-audit/src/playwright/run*.ts` or `src/constants.ts` —
  shortening a check's settle/persist waits changes what it detects; that is a
  separate decision per check (see "Maintenance notes").
- `skills/**` — the skill's command snippets stay valid because the new
  default is concurrent; no doc change needed there.
- `.github/workflows/ci.yml` — the smoke steps must pass **without** edits;
  if they don't, that is a STOP condition, not a reason to edit CI.
- Version fields (`package.json`, `.claude-plugin/*`, `.codex-plugin/*`) —
  releases are cut separately on `release/*` branches.
- Result JSON shape, exit codes, check names, registry order.

## Git workflow

- Branch: `feat/cli-concurrency` (repo convention: `feat/…`, `fix/…`, `docs/…`).
- One commit per step group is fine; message style: `feat(a11y-audit): run CLI checks concurrently (--concurrency)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `--concurrency` flag (parse, validate, usage)

In `packages/a11y-audit/src/cli.ts`:

1. Add `import * as os from 'node:os';` next to the other `node:` imports.
2. Extend the `ParsedValues` interface and the `parseArgs` options with
   `concurrency: { type: 'string' as const }` (parseArgs has no number type;
   parse it yourself).
3. Resolve it right after `const screenshot = values.screenshot === true;`:

```ts
  // --- Resolve concurrency ---
  // Checks mostly wait (settle/persist periods), so several can share one
  // Chromium. Default: 4, but never more than the machine has cores.
  const defaultConcurrency = Math.max(1, Math.min(4, os.cpus().length));
  let concurrency = defaultConcurrency;
  if (values.concurrency !== undefined) {
    concurrency = Number(values.concurrency);
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      process.stderr.write(
        `Error: --concurrency must be a positive integer (got ${values.concurrency}).\n`,
      );
      process.exit(2);
    }
  }
```

4. Add to `printUsage()` after the `--screenshot` line:

```
  --concurrency <n>      How many checks run at once in the same browser
                         (default: 4, capped at the CPU count). 1 runs them
                         one after another, as before.
```

5. Print it with the other header lines, after `Output dir:`:
   `process.stdout.write(`Concurrency: ${concurrency}\n`);`

**Verify**: `npm run typecheck` → exit 0.
`npm run build --workspace @a11y-skills/audit && node packages/a11y-audit/dist/cli.js --url x --concurrency 0; echo "exit $?"` → prints the error line and `exit 2`.
`node packages/a11y-audit/dist/cli.js --help | grep -c concurrency` → `1` or more.

### Step 2: Extract the loop body into `runOne(check)`

Move the body of the `for (const check of selectedChecks)` loop (everything
from `const start = Date.now();` through the `finally` block) into a local
`async function runOne(check: CheckEntry): Promise<void>` declared right before
the loop. Rules:

- Replace the `continue` in the navigation-failure branch with `return`.
- Keep `summaries.push(...)`, `hasViolations = true`, `hasErrors = true`,
  and the `process.stdout.write` / `process.stderr.write` calls exactly as they
  are — they close over the same variables.
- Keep the loop for now: `for (const check of selectedChecks) { await runOne(check); }`.

Also add `quiet` to the options passed to every check: extend
`RunCheckOptions` with `quiet: boolean;`, pass `quiet: concurrency > 1` from
`runOne` into `check.run({...})`, and forward it in **every** registry entry,
e.g.

```ts
    async run({ page, outputDir, quiet }) {
      const { runAxeAudit } = await import('./playwright/runAxeAudit.js');
      return (await runAxeAudit({ page, outputDir, quiet })) as AuditResultEnvelope;
    },
```

(23 entries; each check's options type includes `quiet` via
`AuditOutputOptions`, so this type-checks.) Reason: with several checks
running at once their own `console.log` summaries would interleave; the
CLI's `[name] DONE …` lines remain and are the stable contract. With
`--concurrency 1` nothing changes (`quiet: false`).

**Verify**: `npm run typecheck` → exit 0.
`npm run build --workspace @a11y-skills/audit && node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" --checks all --concurrency 1 --output-dir /tmp/a11y-c1; echo "exit $?"`
→ output identical in structure to today (per-check summaries from the checks
**plus** `[name] DONE` lines), `Errors:       0`, `exit 1`.

### Step 3: Replace the loop with a bounded worker pool, slow checks first

1. Add an optional `slow?: boolean` to `CheckEntry` with the doc comment
   `/** Known to take several seconds per page; the pool starts these first so they do not become the tail. */`
   and set `slow: true` on these registry entries (measured at planning time):
   `content-on-hover-check`, `pointer-cancellation-check`, `auto-play-detection`,
   `change-on-input-check`, `keyboard-trap-check`, `focus-indicator-check`,
   `focus-order-check`, `keyboard-reachability-check`.
2. Replace `for (const check of selectedChecks) { await runOne(check); }` with:

```ts
  // Stable partition: slow checks first, otherwise the --checks order.
  const queue = [
    ...selectedChecks.filter((c) => c.slow),
    ...selectedChecks.filter((c) => !c.slow),
  ];
  const startedAt = Date.now();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        await runOne(next);
      }
    }),
  );
```

`runOne` never throws (all paths are caught inside it), so `Promise.all`
cannot reject early. Do **not** add a dependency for the pool.

3. In the summary, report wall-clock time instead of the sum of durations:
   replace `const totalMs = summaries.reduce(...)` with
   `const totalMs = Date.now() - startedAt;` (with concurrency 1 this equals
   the old sum within milliseconds).
4. Keep `--list-checks` output and the `Checks:` header line in registry /
   `--checks` order (they are computed from `selectedChecks`, not `queue`).

**Verify**: `npm run typecheck && npm run build --workspace @a11y-skills/audit` → exit 0.
`node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/index.html" --checks all --output-dir /tmp/a11y-c4 | tail -8; echo "exit ${PIPESTATUS[0]}"`
→ `Checks run:   23`, `Errors:       0`, `exit 0`, and `--- Summary (…)` **at most 30 s**
(it was 50.5 s sequentially). The first `[… DONE` lines printed should be
fast checks finishing while slow ones are still running — that is expected.

### Step 4: Documentation

1. `packages/a11y-audit/README.ja.md` — in the `### フラグ` table (around line
   310) add a row after `--screenshot`:
   `| \`--concurrency <n>\` | \`4\`（CPU コア数が上限） | 同じブラウザの中で同時に走らせる検査の数。\`1\` にすると従来どおり 1 つずつ走り、各検査の要約も標準出力に出る。2 以上では各検査の要約は出さず、CLI の \`[name] DONE …\` 行と結果 JSON だけになる。時間に敏感な検査（time-limit / auto-play / motion-actuation）で結果が揺れるときは \`--concurrency 1\` で再現する。 |`
2. `packages/a11y-audit/README.md` — mirror the row in the `### Flags` table
   (around line 403) in English.
3. `packages/a11y-audit/CHANGELOG.md` — under `## Unreleased` add a
   `### Changed` section (keep `### Added` above it if present) with:
   `- CLI: checks now run concurrently in the same browser (\`--concurrency <n>\`, default 4 capped at the CPU count; slow checks are started first). \`--concurrency 1\` restores the sequential behaviour. With concurrency above 1 the checks' own console summaries are suppressed (\`quiet\`); the CLI's \`[name] DONE …\` lines and the result JSON files are unchanged. The summary line now reports wall-clock time.`

**Verify**: `npx prettier --write packages/a11y-audit/README.ja.md packages/a11y-audit/README.md packages/a11y-audit/CHANGELOG.md && npm run format:check` → exit 0.

### Step 5: Lint and format the code

`npx prettier --write packages/a11y-audit/src/cli.ts && npm run lint && npm run format:check`

**Verify**: exit 0, no warnings about `cli.ts`.

### Step 6: Tests (see Test plan) and the full gate

Write `packages/a11y-audit/test/cli-concurrency.spec.ts`, then run:

`npm test --workspace @a11y-skills/audit`

**Verify**: all tests pass, including the 6 new ones; total runtime grows by
roughly 2–3 minutes (three fixtures × two full CLI runs).

Then the full gate:
`npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` → exit 0.

### Step 7: Reproduce the CI smoke steps locally

```
node packages/a11y-audit/dist/cli.js \
  --url "file://$PWD/packages/a11y-audit/test/fixtures/cli-smoke.html" \
  --checks all --output-dir /tmp/cli-smoke | tee /tmp/cli-smoke-stdout.log
echo "exit ${PIPESTATUS[0]}"
grep -E "Errors: +0" /tmp/cli-smoke-stdout.log && test -n "$(ls /tmp/cli-smoke)" && echo OK
```

**Verify**: `exit 1` (the fixture has axe violations), `Errors:       0`
matched, `OK` printed. This is exactly what `.github/workflows/ci.yml:108-118`
and `:161-169` check.

## Test plan

New file `packages/a11y-audit/test/cli-concurrency.spec.ts`. Import
`{ test, expect } from './helpers/fixtures.js'` — this `test` provides the
worker-scoped `baseUrl` fixture, an HTTP server for `test/fixtures/pages/`
(`test/helpers/fixtures.ts:167-185`). Spawn
`new URL('../dist/cli.js', import.meta.url).pathname` with `process.execPath`
asynchronously, modelled on `test/network-busy.spec.ts:114-144`; capture
`stdout`, `stderr`, exit code. Write a small local helper
`runCli(args, timeoutMs)` returning `{ code, stdout, stderr }`; keep inputs
and expectations inline in each test.

**Why these fixtures**: the parity test must actually exercise the paths that
concurrency could disturb — `bringToFront` + clipboard in the auth check
(only runs when the page has a paste-able password field), the 6-second
screenshot series of auto-play, and the timer/countdown detection. The
link-list page `test/fixtures/index.html` has none of these, so it is used
only for timing, not for parity. The three fixtures below are served from
`baseUrl` (relative to `test/fixtures/pages/`):

| Fixture | Risky path it exercises | Precondition asserted on the **sequential** run (proves the path ran) |
|---|---|---|
| `accessible-authentication/paste-ok.html` | `runPasteTest` → `grantPermissions(clipboard)`, helper page, `bringToFront` (`runAccessibleAuthenticationCheck.ts:567-665`) | `accessible-authentication-result.json`: `details.pasteTest.status === 'ran'` (type at `src/types.ts:835`: `'ran' \| 'disabled' \| 'unavailable' \| 'skipped-no-targets'`) |
| `auto-play/finding.html` | infinite CSS animation measured over `SCREENSHOT_INTERVALS` (0/2/4/6 s) | `auto-play-screenshots/detection-result.json`: `details.hasAutoPlayContent === true`, `summary.incompleteCount >= 1` (see `test/auto-play.spec.ts:29-58`) |
| `time-limit/finding-countdown.html` | countdown wording / timers observed over `settleMs` | `time-limit-result.json`: `summary.incompleteCount >= 1` (gallery expectation `a11y-skills/time-limit-countdown: incomplete`, `test/fixture-gallery.spec.ts:647-654`) |

1. `--concurrency 0 で usage エラーになり終了コード 2 で終わる`
   args: `['--url', 'file:///dev/null', '--concurrency', '0']` →
   `code === 2`, `stderr` contains `--concurrency must be a positive integer`.
2. `--concurrency abc で usage エラーになり終了コード 2 で終わる` → same
   expectations as 1 (`'abc'`).
3. One test per fixture row above (3 tests), titled
   `<fixture> を --checks all で --concurrency 1 と 4 で走らせると検査ごとの summary と終了コードが一致する`:
   - `test.setTimeout(300_000)` (two full 23-check runs on a small page;
     ~25 s + ~12 s measured on the planning machine).
   - Run `--url ${baseUrl}/<fixture> --checks all` once with
     `--concurrency 1 --output-dir <testInfo.outputDir>/seq` and once with
     `--concurrency 4 --output-dir <testInfo.outputDir>/par`.
   - Assert the row's **precondition** on the `seq` result file first; if it
     fails, the fixture no longer exercises the path — that is a STOP
     condition, not something to patch in the test.
   - List `seq/*.json` (plus `seq/auto-play-screenshots/detection-result.json`);
     expect 23 result files (22 if stdout contains
     `[auto-play-detection] SKIPPED`, optional deps missing). For every file,
     read the JSON from both dirs and `expect(par.summary).toEqual(seq.summary)`
     (`summary` holds `violationCount` / `incompleteCount` / `passCount` and may
     hold extra per-check counters — compare the whole object).
   - Additionally for `paste-ok.html`: `expect(par.details.pasteTest.status).toBe('ran')`
     — the concurrent run must also have measured the paste, not fallen back
     to `unavailable`.
   - `expect(parCode).toBe(seqCode)`; both stdouts contain `Errors:       0`.
4. `--concurrency 4 でも CLI の DONE 行と Errors 行が標準出力に出る`
   args: `--url ${baseUrl}/time-limit/clear.html --checks axe-audit,orientation-check --concurrency 4`
   → `code === 0`, stdout matches `/^\[axe-audit\] DONE in /m`,
   `/^\[orientation-check\] DONE in /m`, `/Errors: +0/`, and does **not**
   contain the check's own summary text (run the same command with
   `--concurrency 1` first and pick one line that only the check itself prints,
   e.g. the header produced by `printSummary` for axe; assert it is present
   with concurrency 1 and absent with concurrency 4).

Verification: `npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/cli-concurrency.spec.ts` → 6 passed.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint && npm run format:check` exits 0
- [ ] `npm test --workspace @a11y-skills/audit` exits 0 and includes 6 tests from `test/cli-concurrency.spec.ts` (3 of them the seq-vs-par parity runs on `paste-ok.html`, `auto-play/finding.html`, `time-limit/finding-countdown.html`)
- [ ] `node packages/a11y-audit/dist/cli.js --help | grep -c -- '--concurrency'` ≥ 1
- [ ] `node packages/a11y-audit/dist/cli.js --url "file://$PWD/packages/a11y-audit/test/fixtures/index.html" --checks all --output-dir /tmp/a11y-c4` exits 0 with `Checks run:   23`, `Errors:       0`, and the `--- Summary (…)` number is ≤ 30 s (sequential baseline 50.5 s on the planning machine; on a slower CI runner the relative drop is what matters: concurrent must be < 60 % of `--concurrency 1`)
- [ ] The Step 7 CI-smoke reproduction prints `OK` and `exit 1`
- [ ] `git grep -n "quiet" -- packages/a11y-audit/src/cli.ts | wc -l` ≥ 25 (the option plus 23 forwarding sites)
- [ ] `git status --porcelain` shows only the in-scope files
- [ ] `plans/README.md` status row for 020 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `src/cli.ts:555-661` does not match the "Current state" excerpt
  (drift).
- A parity test (Test plan item 3) fails **twice in a row** — i.e. a check's
  `summary` differs between `--concurrency 1` and `4`, or the concurrent auth
  run reports `pasteTest.status !== 'ran'`. Report which fixture, which check
  and the two summaries; do not "fix" it by excluding the check, dropping the
  fixture, lowering the default below 2 silently, or widening a wait inside
  `src/playwright/*`.
- A parity precondition fails on the **sequential** run (e.g.
  `pasteTest.status !== 'ran'` on `paste-ok.html`, `hasAutoPlayContent !== true`
  on `auto-play/finding.html`, `incompleteCount < 1` on
  `finding-countdown.html`): the fixture no longer exercises the risky path and
  the test design must be revisited by a human.
- A concurrent run (`--checks all`) reports any `ERROR` status that the
  `--concurrency 1` run does not.
- The concurrent `--checks all` run on `test/fixtures/index.html` is **not**
  faster than 60 % of the sequential run on the same machine (the premise —
  "checks mostly wait" — would be wrong).
- The Step 7 CI-smoke reproduction fails (`Errors:` not 0, or exit ≠ 1).
- Chromium crashes or hangs under concurrency (process never exits within
  3 minutes on the fixture).
- Any step appears to require editing a file in the out-of-scope list.

## Maintenance notes

- **Adding a check**: a new registry entry must forward `quiet` like the
  others, and should carry `slow: true` if it typically takes more than ~3 s
  per page, so the pool starts it early. The parity tests run `--checks all`,
  so a new check is covered automatically; add a fixture row only if the new
  check has its own page-state or focus dependency (like the auth paste test).
- **Timing-sensitive checks** (`time-limit-detector`, `auto-play-detection`,
  `motion-actuation-check`, anything with `settleMs`): under heavy host load
  the concurrent run may differ from the sequential one. The README row tells
  users to reproduce with `--concurrency 1`. If reports of flapping appear,
  the first lever is a lower default (e.g. 2), not per-check waits.
- **Reviewer focus**: (1) every `catch` path in `runOne` still sets
  `hasErrors` / pushes a summary exactly as before; (2) `--concurrency 1`
  output is unchanged (checks not quiet, same lines); (3) `queue.shift()` is
  used from a single event loop so the pool has no race; (4) the CI smoke
  greps still match.
- **Deferred on purpose** (separate decisions, each changes detection
  semantics): shortening `CONTENT_ON_HOVER_PERSIST_MS` (3 s per trigger is the
  dominant cost on real pages — hovering several triggers at once in the same
  page would need a redesign of that check), reducing `SCREENSHOT_INTERVALS`
  for auto-play, and the per-element `settleMs` in pointer-cancellation /
  change-on-input. If wall time is still too long after this plan, profile
  those checks per element count before touching constants.
- **Not done here**: parallelism across *pages* (the skill runs one CLI per
  page); that can be added later as `--url` repeated or a URL list, reusing the
  same pool.
