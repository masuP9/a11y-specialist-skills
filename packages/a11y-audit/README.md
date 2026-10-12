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
| `runAutoPlayDetection` | 2.2.2 Pause, Stop, Hide (visual changes) / 1.4.2 Audio Control (playback state of `<audio>` / `<video>`; whether sound is actually heard needs manual review) |
| `runKeyboardReachabilityCheck` | 2.1.1 Keyboard (Tab, arrow keys in composite widgets, activedescendant) |
| `runRedundantEntryCheck` | 3.3.7 Redundant Entry (fields in the same form asking for the same information, reported as candidates) |
| `runMotionActuationCheck` | 2.5.4 Motion Actuation (`devicemotion` / `deviceorientation` listeners, reported as candidates) |

Most checks take an already-navigated `page`. A few own navigation and take a
`targetUrl` instead (or `TEST_PAGE`): `runOrientationCheck` and
`runTimeLimitDetector` (and `runZoomCheck` when a URL is given).
`runFocusIndicatorCheck` and `runKeyboardReachabilityCheck` take a `browser`. `runAutoPlayDetection` needs the
optional `pixelmatch` + `pngjs` deps (see Install).

`runRedundantEntryCheck` (3.3.7, `a11y-skills/redundant-entry`) takes an
already-navigated `page`. Within the same form (the whole page for fields
outside any form), when two or more fields ask for the same purpose, the second
and later fields are reported as `incomplete` candidates. The purpose comes from
the `autocomplete` field name, or is inferred from the name / id / label /
placeholder (scope words such as "shipping" and confirmation words such as
"confirm" are removed before matching). Groups whose scope differs
(`shipping` / `billing`) have `kind: 'scoped'`; repeats within the same scope
have `kind: 'repeated'`. Checkboxes, buttons and selects in the same form whose
text suggests "same as ..." are listed in `copyControls`; whether the value is
actually copied is not verified. Disabled / readonly fields count as earlier
information, but only an editable field after the first one is reported (made a
node) as a re-entry (`fields[].editable`). Password and one-time-code fields, different
`section-*` tokens and different forms are not compared. **Multi-page flows
(steps split across several pages) are out of scope**, because a single-page
check cannot know what an earlier page asked for.

`runMotionActuationCheck` (2.5.4, `a11y-skills/motion-actuation`) takes an
already-navigated `page`. Through the Chrome DevTools Protocol (CDP) it lists
the `devicemotion` / `deviceorientation` / `deviceorientationabsolute`
listeners on the main frame's `window` / `document` and reports each as an
`incomplete` candidate; whether a UI-component alternative exists and motion
actuation can be turned off is for a human to verify. For event types with a
`window` listener, synthetic events are dispatched and whether the DOM changes
(`details.simulation.results[].domMutations`, compared with `baselineDomMutations`, the
changes over an equally long window without events, so self-updating pages are not
misread) and any navigation are recorded as evidence. When listeners exist only on
`document`, `simulation.status` is `skipped-document-only` (`skipped-no-listeners` when
there are none) (`simulate: false` skips this; the simulation changes the page's
state, so use `false` when reusing the same page). A handler that never returns
is stopped through CDP. **CDP is Chromium only**; elsewhere the result is
`incomplete` with `listenerInspection: 'unsupported'`. Listeners inside iframes
and listeners added after a user action are not found.

For 1.4.2 (`a11y-skills/auto-play-audio`), `runAutoPlayDetection` records
whether every `<audio>` / `<video>` in the page and its iframes (nested frames
and shadow roots included) is playing, unmuted, with volume above 0 and a
playback rate above 0: when the check starts, with each screenshot (about
every 2 seconds), and on every play / pause / ended / volumechange /
ratechange event. Media added during the check is recorded from the moment
it is added (the document and open shadow roots are observed). Each recorded
state lasts until the next record, and the time with sound is added up as
`audibleSeconds`, so stopping or muting between screenshots does not erase
the time before it. Media removed from the DOM during the check stays in the
result with `removed: true` (its `target` is its document's `html`). When its
iframe is removed or its frame's content is replaced, the last record taken
before that stays with `documentRemoved: true`; its `target` is the nearest
remaining parent document's `html`, and the message names the original
frame's URL. Sound after that last record is not counted, but if the last
record was playing with sound, the time it kept playing is unknown, so it
goes to `incomplete` regardless of `audibleSeconds`. Media without
visible `controls` goes to `incomplete` when it was heard for more
than 3 seconds, or when it is playing with sound at the last check and will
keep playing for more than 3 seconds (`loop`, an endless stream, or more than
3 seconds of real time left at the current playback rate). Visibility uses
the size, `display`, `visibility` and `opacity` of the element and the iframe
elements above it, and its rendered ancestors (an assigned slot before the
DOM parent). An ancestor with overflow `hidden` / `clip` whose padding box
(inside its border) does not overlap the element makes it invisible;
`clip-path` (not `none`) or `clip` (not `auto`), a non-overlapping scroll
container, a fixed / absolute box that may escape the ancestor, or a
transform that keeps the padding box from being placed makes visibility
undetermined (`incomplete`).
Partial clipping and off-screen position are not checked. Recording starts
when the check starts (after the page is opened), so sound before that is not
counted, and each check on the same page starts a fresh record.
Pause/mute controls found by name in the same frame are recorded but not
clicked to verify. A result's `target` lists the outer iframes, shadow hosts
and the element in order; each entry is looked up in the document (or shadow
root) opened by the entry before it.

Chromium blocks unmuted autoplay until the user interacts with the page, so
when you launch the browser yourself, pass the flag below. Without it, unmuted
media never starts and is reported as `incomplete` ("playback did not start").
The CLI launches with it.

```ts
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
```

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
redundant-entry-check
motion-actuation-check
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

**Before/after focus screenshot comparison (`screenshotDiff`):**

Pass `screenshotDiff: true` to `runFocusIndicatorCheck` to compare screenshots
of the area around each element (its rect plus an 8px margin) taken before and
after it gets focus. Every record in `allElements` and `issues` then carries
`visualDiff: { diffRatio, rect }`: `diffRatio` is the share (0-1) of pixels in
the compared area that changed, and `rect` is the bounding box of the changed
pixels in page coordinates (`null` when nothing changed). Use it to catch cues
that computed styles cannot show (`::before` / `::after`, a parent's
`:focus-within`, another element).

- Default `false`: without the option no `visualDiff` is added and behavior is unchanged. Screenshots are taken on every Tab press, so the walk is slower, and that time counts toward `timeBudgetMs`.
- The baseline is one full-page capture taken before the Tab walk starts, with nothing focused. Annotation boxes and the styles kept on earlier elements are hidden while capturing.
- Classification does not change. An element with no computed-style change stays `incomplete` under `focus-visible`; the message says the screenshot differs around it (a cue may exist) or that it shows no visual change either.
- Without the optional `pixelmatch` and `pngjs`, a warning is printed instead of an error, the comparison is skipped and `visualDiff` is `null`. It is also `null` for an element that could not be captured.
- **Limits:** fixed / sticky content, animations, video, and anything that changes with scroll position or time can show up as a difference that is not a focus indicator. An element already focused at load (autofocus) has no baseline to differ from. A difference means "a cue may exist"; verify it by eye. Elements inside an iframe are not compared; their `visualDiff` is `null`.

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
- focus-indicator: `details.unidentifiedNavigation: true` when focus caused a
  navigation whose element could not be identified and no later attempt
  identified it (including when retries ran out or a limit stopped the walk).
  If `onFocusViolations` is empty, `a11y-skills/no-context-change-on-focus` is
  then `incomplete` instead of `passes`.
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
// autocomplete-audit, time-limit-detector, auto-play-detection,
// redundant-entry-check, motion-actuation-check
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
