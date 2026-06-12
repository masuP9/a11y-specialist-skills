# Changelog

All notable changes to `@a11y-skills/audit` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased] — 0.4.0

### Added

- `bin` CLI (`a11y-audit`): run all ten WCAG checks against a URL without a
  Playwright test runner — `npx -y @a11y-skills/audit --url <url>`. Flags:
  `--checks <list>`, `--output-dir`, `--screenshot`, `--list-checks`,
  `--version`, `--help`. Exit codes: `0` = no violations, `1` = violations
  found, `2` = runtime error. JSON output uses the same envelope as the
  function API regardless of exit code.
- `test/fixtures/cli-smoke.html`: network-independent smoke fixture (a page
  with intentional axe violations) for the CI CLI smoke test.

## 0.3.1

### Fixed

- `runFocusIndicatorCheck`: focus-triggered navigations slower than the
  per-Tab settle window are no longer silently missed. The settle window is
  now configurable via the new `navigationSettleMs` option (default: 50), and
  a `framenavigated` listener additionally catches URL changes that commit and
  revert within a single window. (#26)

## 0.3.0

**Breaking** — every check now returns (and saves) a single axe-style envelope
instead of its own ad-hoc shape. The public API is not yet stable in `0.x`, so
this lands as a minor release.

### Changed (breaking)

- All `runXxx()` functions return `AuditCheckResult<TDetails>`: findings are
  normalized into `violations` / `incomplete` / `passes` / `inapplicable`
  rule arrays (axe-style `id` / `impact` / `tags` / `helpUrl` / `nodes`), with
  rule-level counts in `summary`. The former top-level fields (`issues`,
  `failAA`, `overflowingElements`, `clippedElements`, ...) moved unchanged
  under `details`.
- Classification is conservative: only findings whose detection has no blind
  spot and where no WCAG exception can apply are `violations`
  (on-focus context change, text-spacing clipping, invalid autocomplete
  tokens). Everything else — reflow/zoom overflow, meta refresh, orientation
  lock, missing focus styles, undersized targets — lands in `incomplete`, the
  manual-review queue.
- Saved JSON files use the same envelope; the JSON Schemas were rewritten
  accordingly (`$defs`-based shared envelope + per-check `details` schemas).
  Pre-0.3.0 result files no longer validate.
- `saveAuditResult()` no longer appends a disclaimer (the envelope carries it).
- `runAxeAudit` builds the buckets from the raw axe results: violations and
  incomplete keep their nodes, passes/inapplicable keep rule metadata only;
  `details` records the execution configuration.

### Added

- `rule-registry.ts`: per-rule metadata (`sc`, accurate per-SC `wcag*` tags,
  `impact`, `scope`, classification) — target size split into
  `a11y-skills/target-size-minimum` (2.5.8 AA) and
  `a11y-skills/target-size-enhanced` (2.5.5 AAA).
- Pure normalization mappers (`normalize*`), `buildAuditResult()`, and the
  opt-in `mergeNormalizedResults()` exported from the package root. The
  buckets are re-derivable from a saved result's `details`.
- Element-level evidence: detail records now carry `html` (outerHTML, capped
  at `HTML_SNIPPET_MAX_LENGTH`) and `htmlTruncated`; focus issues gained
  `selector`. `TargetSizeIssue.exceptionAssessment`
  (`ruled-out`/`possible`/`not-assessed`) drives the violation promotion.
- Tests: mapper unit tests, merge invariants, and ajv (draft 2020-12) schema
  validation of the produced envelopes.

## 0.2.0

Phase 2 checks added (additive). Still a `0.x` preview — the function API may
change before `1.0.0` based on downstream feedback.

### Added

- `runTextSpacingCheck` — WCAG 1.4.12.
- `runZoomCheck` — WCAG 1.4.4.
- `runOrientationCheck` — WCAG 1.3.4 (owns navigation: takes `page` + `targetUrl`,
  loads the page at portrait and landscape viewports).
- `runAutocompleteAudit` — WCAG 1.3.5.
- `runTimeLimitDetector` — WCAG 2.2.1 (owns navigation: installs a timer hook
  before `goto`, so takes `page` + `targetUrl`).
- `runAutoPlayDetection` — WCAG 1.4.2 / 2.2.2. Requires the **optional**
  dependencies `pixelmatch` + `pngjs` (for pixel-diffing screenshot frames);
  they are loaded lazily, so importing the package without them keeps the other
  nine checks working. Throws a clear error if invoked without them.
- `test-entries/*` and JSON Schemas (`RESULT_SCHEMAS`) for all six new checks.
- `getTargetUrl(defaultPath)` exported from `@a11y-skills/audit/playwright`.

## 0.1.0

Initial preview release. The function API may change before `1.0.0` based on
downstream feedback.

### Added

- `runAxeAudit` — axe-core broad WCAG coverage (2.0/2.1/2.2 A & AA).
- `runFocusIndicatorCheck` — WCAG 2.4.7 / 2.4.12 / 3.2.1 (owns its browser
  context; supports `contextOptions`).
- `runReflowCheck` — WCAG 1.4.10.
- `runTargetSizeCheck` — WCAG 2.5.5 / 2.5.8.
- Compatibility `test-entries/*`, run via a one-line local re-export spec
  (`TEST_PAGE` / `A11Y_OUTPUT_DIR`). Note: Playwright excludes `node_modules`
  from test collection, so a `testMatch` glob into `node_modules` finds no
  tests — use the re-export spec instead.
- `schemas` subpath: result types + hand-written JSON Schemas.
- Output path resolution: `outputDir` option → `A11Y_OUTPUT_DIR` env →
  `process.cwd()`, with `outputPath`/`outputDir` exclusivity (promoted from
  the downstream `resolveOutputPath` improvement).

### Notes

- Ported from the `auditing-wcag` skill's vendor scripts, including the
  downstream strict-TS fix in the focus check.
- Screenshots default to `false` in the function API; the compatibility entries
  enable them to preserve legacy behavior.
- Phase 2 checks (text-spacing / zoom-200 / orientation / autocomplete /
  time-limit / auto-play) are out of scope for this release.
