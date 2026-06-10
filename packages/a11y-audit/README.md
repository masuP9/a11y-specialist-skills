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
| `runFocusIndicatorCheck` | 2.4.7 Focus Visible / 2.4.12 Focus Not Obscured / 3.2.1 On Focus |
| `runReflowCheck` | 1.4.10 Reflow |
| `runTargetSizeCheck` | 2.5.5 / 2.5.8 Target Size |
| `runTextSpacingCheck` | 1.4.12 Text Spacing |
| `runZoomCheck` | 1.4.4 Resize Text (200% zoom) |
| `runOrientationCheck` | 1.3.4 Orientation |
| `runAutocompleteAudit` | 1.3.5 Identify Input Purpose |
| `runTimeLimitDetector` | 2.2.1 Timing Adjustable |
| `runAutoPlayDetection` | 1.4.2 Audio Control / 2.2.2 Pause, Stop, Hide |

Most checks take an already-navigated `page`. A few own navigation and take a
`targetUrl` instead (or `TEST_PAGE`): `runOrientationCheck` and
`runTimeLimitDetector` (and `runZoomCheck` when a URL is given).
`runFocusIndicatorCheck` takes a `browser`. `runAutoPlayDetection` needs the
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

### Output location resolution

For every check:

1. `outputPath` — full path (mutually exclusive with `outputDir`/`outputFile`).
2. otherwise `outputDir` → `A11Y_OUTPUT_DIR` env → `process.cwd()`, joined with
   `outputFile` → the check's default filename.

Screenshots (when enabled) are written next to the result file. `outputFile`
must be a bare filename; use `outputPath` for an absolute location.

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
