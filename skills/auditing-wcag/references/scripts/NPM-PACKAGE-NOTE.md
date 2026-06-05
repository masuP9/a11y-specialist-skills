# These scripts are thin wrappers around `@a11y-skills/audit`

Every check here (`axe-audit.ts`, `focus-indicator-check.ts`, `reflow-check.ts`,
`target-size-check.ts`, `text-spacing-check.ts`, `zoom-200-check.ts`,
`orientation-check.ts`, `autocomplete-audit.ts`, `time-limit-detector.ts`,
`auto-play-detection.ts`) is now a **thin wrapper** that calls the published npm
package [`@a11y-skills/audit`](../../../../packages/a11y-audit). The check logic
lives in the package (`packages/a11y-audit/src/`); these files only wire the
package's `runXxx()` functions into Playwright tests with this skill's preset
defaults.

## To change a check's behavior

Edit it in `packages/a11y-audit/src/**`, release a new `@a11y-skills/audit`
version, and bump the dependency in `package.json`. Do **not** reintroduce
check logic here.

## Running

```sh
npm install
npx playwright install chromium
TEST_PAGE="https://example.com" npx playwright test <check>.ts
# or: npm run test:axe  (etc.)
```

`npm install` pulls `@a11y-skills/audit` and its optional `pixelmatch`/`pngjs`
deps (needed by `auto-play-detection`). The scripts are ESM (`"type": "module"`);
the cross-platform runner is `run-test.cjs`.

## Vendoring note

If you vendor-copy this directory, you must also have `@a11y-skills/audit`
available (via `npm install`); these files no longer work standalone.
