# @a11y-skills/audit

Playwright + axe-core based WCAG 2.2 accessibility audit functions.

This package is the functional core extracted from the
[`auditing-wcag`](https://github.com/masuP9/a11y-specialist-skills) Claude Code
skill. It ships ten checks as plain functions plus ready-to-run Playwright
test entries.

> **日本語版は [README.ja.md](./README.ja.md) を参照してください。**

> **Scope.** Automated testing detects only ~30–40% of WCAG issues. Manual
> testing is required for full conformance. This package automates a subset.

## Checks

| Function | WCAG |
| --- | --- |
| `runAxeAudit` | axe-core broad coverage (2.0/2.1/2.2 A & AA) |
| `runFocusIndicatorCheck` | 2.4.7 Focus Visible / 2.4.11 Focus Not Obscured (Minimum) / 2.4.12 Focus Not Obscured (Enhanced) / 3.2.1 On Focus |
| `runReflowCheck` | 1.4.10 Reflow |
| `runTargetSizeCheck` | 2.5.5 / 2.5.8 Target Size |
| `runTextSpacingCheck` | 1.4.12 Text Spacing |
| `runZoomCheck` | 1.4.4 Resize Text (200% zoom) |
| `runOrientationCheck` | 1.3.4 Orientation |
| `runAutocompleteAudit` | 1.3.5 Identify Input Purpose |
| `runTimeLimitDetector` | 2.2.1 Timing Adjustable |
| `runAutoPlayDetection` | 2.2.2 Pause, Stop, Hide (audio is not inspected; 1.4.2 is left to axe's `no-autoplay-audio` and manual review) |
| `runKeyboardReachabilityCheck` | 2.1.1 Keyboard (Tab, arrow keys in composite widgets, activedescendant) |

Most checks take an already-navigated `page`. A few own navigation and take a
`targetUrl` instead (or `TEST_PAGE`): `runOrientationCheck` and
`runTimeLimitDetector` (and `runZoomCheck` when a URL is given).
`runFocusIndicatorCheck` and `runKeyboardReachabilityCheck` take a `browser`. `runAutoPlayDetection` needs the
optional `pixelmatch` + `pngjs` deps (see Install).

## Install

```sh
npm install -D @a11y-skills/audit @playwright/test @axe-core/playwright
```

`@playwright/test` and `@axe-core/playwright` are **peer dependencies**.

`runAutoPlayDetection` additionally needs `pixelmatch` and `pngjs` (declared as
**optional dependencies**, installed by default). They are loaded lazily, so
the other nine checks work even if you install with `--omit=optional`:

```sh
npm install -D pixelmatch pngjs   # only if you use runAutoPlayDetection
```

> ESM only. This package does not ship a CommonJS build; import it from ESM
> (or a TypeScript project compiled to ESM).

## CLI

Run all ten checks against a URL with a single command — no test runner needed.

```sh
npx -y @a11y-skills/audit --url https://example.com
```

Peer dependencies (`@playwright/test`, `@axe-core/playwright`) are pulled in
automatically by npm 7+. Install Chromium on first use:

```sh
npx playwright install chromium
```

### Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--url <url>` | `TEST_PAGE` env | Target URL. `--url` takes priority over the env var. If neither is set, usage is printed and the process exits 2. |
| `--checks <list>` | `all` | Comma-separated check names (see list below). |
| `--output-dir <dir>` | `./a11y-audit-results` | Directory for result JSON files. |
| `--screenshot` | off | Enable focus-indicator screenshot. |
| `--list-checks` | — | Print check names and exit 0. |
| `--version` | — | Print version and exit 0. |
| `--help` | — | Print usage and exit 0. |

### Available check names

```
axe-audit
focus-indicator-check
reflow-check
text-spacing-check
zoom-200-check
orientation-check
autocomplete-audit
time-limit-detector
auto-play-detection
target-size-check
keyboard-reachability-check
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All checks completed, no violations found. |
| `1` | All checks completed, at least one violation found. |
| `2` | Runtime error — bad arguments, missing peers, navigation failure, or check crash. |

Completed-check JSON is always written even when the exit code is non-zero.

### Peer requirements

`@playwright/test >=1.50.0` and `@axe-core/playwright >=4.10.0` must be
resolvable. If they are not found, the CLI exits 2 with an install hint.
`--list-checks`, `--help`, and `--version` work without peers.

### `auto-play-detection` and optional deps

`auto-play-detection` needs `pixelmatch` and `pngjs`. If they are absent, that
check is skipped with a `SKIPPED` message and does not affect the exit code.
The other nine checks continue normally.

### GitHub Actions

Copy-paste workflow for a manually triggered audit. Violations fail the job
(exit code 1); add `continue-on-error: true` to the audit step if you want the
result to be informational only.

```yaml
# .github/workflows/a11y-audit.yml
name: A11y Audit

on:
  workflow_dispatch:
    inputs:
      target_url:
        description: 'Audit target URL'
        required: true
        default: 'https://example.com'

jobs:
  a11y-audit:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '24'

      - name: Install audit package
        run: npm install --no-save @a11y-skills/audit @playwright/test @axe-core/playwright

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run a11y audit
        run: npx a11y-audit --url "$TARGET_URL" --output-dir a11y-audit-results
        env:
          TARGET_URL: ${{ inputs.target_url }}

      - name: Upload audit results
        uses: actions/upload-artifact@v7
        if: always()
        with:
          name: a11y-audit-results
          path: a11y-audit-results/
          retention-days: 30
```

Notes:

- Add `push` / `schedule` triggers (with a hardcoded URL) to run the audit as
  a recurring gate.
- Result JSON files (and the focus-indicator screenshot when `--screenshot`
  is set) are uploaded as a build artifact.
- To speed up repeat runs, cache `~/.cache/ms-playwright` keyed on the
  installed `@playwright/test` version — see this repository's `ci.yml` for
  the pattern.

## Usage — function API (recommended)

You navigate the page; the function runs the check, writes a result JSON, and
returns the parsed result.

```ts
import { test } from "@playwright/test";
import { runAxeAudit } from "@a11y-skills/audit/playwright";

test("axe audit", async ({ page }, testInfo) => {
  await page.goto("https://example.com");
  const result = await runAxeAudit({
    page,
    outputDir: testInfo.outputDir,   // where to write axe-result.json
    // outputFile: "axe-result.json", // optional override
    // tags: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
  });
  expect(result.summary.violationCount).toBe(0);
});
```

The focus indicator check owns its browser context (it restarts in a fresh
context when focus triggers a navigation), so it takes a `browser` and a
`targetUrl` instead of a `page`:

```ts
import { runFocusIndicatorCheck } from "@a11y-skills/audit/playwright";

test("focus indicators", async ({ browser }, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: "https://example.com", // or set TEST_PAGE env var
    outputDir: testInfo.outputDir,
    screenshot: true,                 // default: false
    // contextOptions: { locale: "ja-JP" }, // forwarded to browser.newContext()
  });
  expect(result.details.elementsWithoutFocusStyle).toBe(0);
});
```

`runFocusIndicatorCheck`, `runKeyboardReachabilityCheck` and
`runKeyboardTrapCheck` accept `createContext` instead of `browser`. Use it to
attach your own guards (such as a `context.route` URL check) to every context
the check uses:

```ts
const result = await runKeyboardTrapCheck({
  createContext: async () => {
    const context = await browser.newContext({ locale: "ja-JP" });
    await context.route("**/*", guardRequest); // your own check
    return context;
  },
  targetUrl: "https://example.com",
});
```

- If both `createContext` and `browser` are given, `createContext` wins. Passing neither throws.
- `contextOptions` is not applied when `createContext` is used; set options inside the function.
- Return a **new** context on every call (the check closes each one when done; the focus indicator check calls it again on every retry).

To match results to your own elements, pass an attribute name (e.g.
`data-test-id`) as `echoAttribute` to `runFocusIndicatorCheck`. Every record
that points at an element (`allElements`, `issues`, the `element` and
`obscuredBy` in `focusObscuredIssues`, the `element` in `onFocusViolations`)
then carries the attribute's value as `echo` (`null` when the element lacks it;
no `echo` at all when the option is omitted). The check opens the page in fresh
contexts, so the attribute must already be on the element when the page loads
(page markup, or `addInitScript` on the context returned by `createContext`).
The name is passed to `getAttribute` as a plain string; an invalid name throws
an `Error`.

The focus indicator check's element records (`allElements`, `issues`, and the
`element` in `focusObscuredIssues` and `onFocusViolations`) carry `frame` and
`shadowHosts`, which say which document the element is in.

- `frame`: `null` for the main frame. For an element inside an iframe it is
  `{ url, selector }`: the iframe document's URL and the iframe element's
  selector in its parent (`selector` is `null` when the parent is cross-origin).
  For nested iframes it describes the innermost one only.
- `shadowHosts`: for an element inside an open shadow root, the hosts'
  selectors, outermost first; `[]` otherwise. `selector` is relative to that
  shadow root (the inner element is recorded, not the host).
- `rect` of an element in an iframe is relative to that iframe's document, not
  the main page.
- Closed shadow roots are not seen (the host is recorded). Fixed content outside
  an iframe is not detected as hiding an element inside it (obscuring is judged
  per document).

### Output location resolution

For every check:

1. `outputPath` — full path (mutually exclusive with `outputDir`/`outputFile`).
2. otherwise `outputDir` → `A11Y_OUTPUT_DIR` env → `process.cwd()`, joined with
   `outputFile` → the check's default filename.

Screenshots (when enabled) are written next to the result file. `outputFile`
must be a bare filename; use `outputPath` for an absolute location.

### Calling from a server

Every check accepts options that turn off its side effects. The defaults keep
the existing behavior.

| Option | Default | Effect |
|---|---|---|
| `writeResult` | `true` | When `false`, no result JSON is written; the result is only returned. With `screenshot: true` the image is still written per the resolution order above. |
| `quiet` | `false` | When `true`, nothing is printed to the console. |

Invalid output options (e.g. `outputPath` together with `outputDir`) throw
before the check starts, even with `writeResult: false`.

`runTargetSizeCheck` also accepts:

| Option | Default | Effect |
|---|---|---|
| `resolveAccessibleNames` | `true` | When `false`, skips the per-target `locator.ariaSnapshot()` call and sets every `accessibleName` to `null`. On a page with 300 links: ~1.1 s → ~0.06 s. |

```ts
const result = await runTargetSizeCheck({
  page,
  writeResult: false,
  quiet: true,
  resolveAccessibleNames: false,
});
```

Warnings that `quiet` hides but that affect how far the result can be trusted
are kept in the result JSON:

- keyboard-trap: `details.tabWalkCapped: true` when the Tab walk hit the press
  limit.
- focus-indicator: `details.interrupted: true` when navigation on focus
  exhausted the retries and some elements were not tested.
- focus-indicator / keyboard-reachability: see "Time and Tab-press limits"
  below for what happens when a limit is hit.

**Time and Tab-press limits:**

`runFocusIndicatorCheck` and `runKeyboardReachabilityCheck` accept
`timeBudgetMs` (milliseconds, positive finite number) and `maxTabPresses`
(positive integer). Zero, negative or non-numeric values throw.

| Check | `timeBudgetMs` default | `maxTabPresses` default | When a limit is hit |
|---|---|---|---|
| focus-indicator | no limit | no limit | `details.aborted: { reason: 'timeout' \| 'tab-limit', url, recordedCount, focusableCount }`: `recordedCount` elements were tested out of `focusableCount` focusable ones. Time and presses are counted across 3.2.1 restarts. Separate from `interrupted` (retries exhausted) |
| keyboard-reachability | 60 s | 600 | time: `details.aborted.reason: 'timeout'`; presses: `details.tabWalkCapped: true` |

**Running checks concurrently:**

- Give each request its own `outputDir`. Screenshots are written as the output
  directory plus a fixed file name, so changing only `outputFile` still
  collides.
- Give each request its own page (and browser context). Checks change page
  state such as the viewport and the current URL.
- `runAutoPlayDetection` always writes frame screenshots and diff images to
  `outputDir` and reads them back to decide; `writeResult: false` only skips
  `detection-result.json`.

> **Reflow note.** `runReflowCheck` sets the narrow viewport itself, so it works
> on an already-navigated page. For pages that read the viewport only at load
> time, set the viewport *before* `page.goto(...)` for results identical to the
> legacy script (the compatibility entry does this).

## Usage — compatibility test entries

If you prefer not to write test bodies, re-export the bundled entries from a
one-line local spec. The entries call `test(...)` at import time and read
`TEST_PAGE` (target URL) and `A11Y_OUTPUT_DIR` (output directory), capturing
screenshots — reproducing the legacy script behavior.

```ts
// tests/a11y/axe.spec.ts
import "@a11y-skills/audit/test-entries/axe-audit";
// tests/a11y/focus.spec.ts
import "@a11y-skills/audit/test-entries/focus-indicator-check";
// tests/a11y/reflow.spec.ts
import "@a11y-skills/audit/test-entries/reflow-check";
// tests/a11y/target-size.spec.ts
import "@a11y-skills/audit/test-entries/target-size-check";
// ...also: text-spacing-check, zoom-200-check, orientation-check,
// autocomplete-audit, time-limit-detector, auto-play-detection
import "@a11y-skills/audit/test-entries/text-spacing-check";
```

```sh
TEST_PAGE=https://example.com A11Y_OUTPUT_DIR=./a11y-results npx playwright test
```

> **Why not `testMatch` into `node_modules`?** Playwright excludes
> `node_modules` from test collection, so pointing `testMatch` at
> `**/node_modules/@a11y-skills/audit/dist/test-entries/*.js` finds no tests.
> The one-line re-export specs above are the supported way to run the entries.

## Result format

Every check returns — and saves as JSON — the same axe-style envelope:

```ts
interface AuditCheckResult<TDetails> {
  source: CheckSource;            // e.g. "reflow-check"
  url: string;
  timestamp: string;
  violations: NormalizedRuleResult[];   // confirmed findings
  incomplete: NormalizedRuleResult[];   // needs manual review
  passes: NormalizedRuleResult[];       // rules that ran and found nothing
  inapplicable: NormalizedRuleResult[]; // nothing to examine
  summary: { violationCount; incompleteCount; passCount; checkedNodes? };
  details: TDetails;              // check-specific evidence (measurements, screenshots, ...)
  disclaimer: { ... };
}
```

Each rule result is axe-shaped (`id` / `impact` / `description` / `help` /
`helpUrl` / `tags` / `nodes[]`, with `nodes[].target` / `html` /
`htmlTruncated` / `failureSummary`). Custom rules are namespaced
(`a11y-skills/focus-visible`, `a11y-skills/target-size-minimum`, ...) and
tagged with accurate WCAG version/level tags (`wcag2aa`, `wcag21aa`,
`wcag22aa`, `wcag247`-style SC tags).

**Classification is conservative.** A finding lands in `violations` only when
the detection has no blind spot and no WCAG exception can apply (on-focus
context change, text-spacing clipping, invalid autocomplete tokens). All other
detections — reflow/zoom overflow, meta refresh, orientation lock, missing
focus styles, undersized targets — are `incomplete`: treat that bucket as the
manual-review queue, not as noise.

To combine several checks for the same page into one view:

```ts
import { mergeNormalizedResults } from "@a11y-skills/audit";

const merged = mergeNormalizedResults([axeResult, reflowResult, targetResult]);
```

`mergeNormalizedResults` throws on URL mismatches, deduplicates nodes by
`target` + `failureSummary`, and resolves a rule appearing in several buckets
by priority (`violations > incomplete > passes > inapplicable`). Identical
selectors inside different frames or shadow roots are not distinguished.

## Result types & schemas

```ts
import type { AxeAuditResult, FocusCheckResult } from "@a11y-skills/audit/schemas";
import { RESULT_SCHEMAS } from "@a11y-skills/audit/schemas";
```

`RESULT_SCHEMAS` maps each check id to a hand-written JSON Schema
(draft 2020-12) for validating the `*-result.json` files at runtime. The
normalization mappers (`normalize*`) and `buildAuditResult` are exported from
the package root, so the buckets can be re-derived from a saved result's
`details` at any time.

## License

MIT
