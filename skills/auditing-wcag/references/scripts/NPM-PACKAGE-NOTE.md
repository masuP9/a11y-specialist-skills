# Heads up: these scripts are being consolidated into `@masup9/a11y-audit`

The four checks here — `axe-audit.ts`, `focus-indicator-check.ts`,
`reflow-check.ts`, `target-size-check.ts` (plus `utils/`, `constants.ts`,
`types.ts`) — have been ported into the npm package
[`packages/a11y-audit`](../../../../packages/a11y-audit) (`@masup9/a11y-audit`).

**Until that package reaches `1.0.0` and Block B replaces these scripts with
thin wrappers, the same logic lives in two places.** Treat
`packages/a11y-audit/src/**` as the place where new work should land.

## If you change a check here

Keep the behavior in sync with the package, or you will break the parity
drift guard:

- `packages/a11y-audit/test/parity.spec.ts` runs **both** copies against an
  identical fixture and asserts the result JSON matches (currently axe +
  reflow). CI runs it in the `a11y-audit-package` job.

If a change is intentional and should diverge, update the package side too (or
adjust the parity test) in the same PR.

## Scope of the duplication

- Ported (kept in sync): the 4 checks above + their utils/constants/types.
- Not ported (skill-only, Phase 2): `text-spacing-check.ts`,
  `zoom-200-check.ts`, `orientation-check.ts`, `autocomplete-audit.ts`,
  `time-limit-detector.ts`, `auto-play-detection.ts`, `detectors/`.
