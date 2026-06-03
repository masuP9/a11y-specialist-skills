# Changelog

All notable changes to `@masup9/a11y-audit` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

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
