# Plan 004: Make 3.2.1 focus-navigation detection robust to navigations slower than 50ms

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f86de93..HEAD -- packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts packages/a11y-audit/src/constants.ts packages/a11y-audit/test/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the most complex check in the package; mitigated by new regression test + existing suite)
- **Depends on**: none (but execute BEFORE Plan 005, which reformats the whole tree)
- **Category**: bug (audit false negatives)
- **Planned at**: commit `f86de93`, 2026-06-11

## Why this matters

`runFocusIndicatorCheck` detects WCAG 3.2.1 (On Focus) violations by pressing
Tab, waiting a fixed **50ms**, and comparing `page.url()` before/after. A
focus handler that navigates after a debounce, an animation frame chain, or a
slow redirect (anything >50ms) is **missed entirely or attributed to the wrong
element** — the URL change surfaces during a *later* iteration, where
`urlBeforeTab` has already absorbed the new URL. For an audit tool, a silent
false negative on a user-hostile pattern (focus-triggered navigation) directly
undermines the conformance claim. The fix: keep the fast 50ms settle, but also
listen for Playwright's `framenavigated` event on the main frame so late
navigations are still caught and attributed to the most plausible element, and
make the settle delay configurable for slow environments.

## Current state

All in `packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts`
(~1000+ lines; the check owns its `BrowserContext`, restarts in a fresh
context when a navigation violation is found, with the offender added to
`skipSelectors` — see the file's doc comment at lines 1–12):

- Lines 155–161 — retry loop creates the context/page per attempt:

  ```ts
  while (retryCount < MAX_RETRIES) {
    // Create a fresh context for each attempt to reset init scripts
    context = await browser.newContext(contextOptions);
    const page = await context.newPage();
  ```

- Line 205 — initial navigation: `await page.goto(targetUrl, { waitUntil: 'networkidle' });`
- Lines 244–315 — the Tab loop (abridged, faithful to source):

  ```ts
  for (let i = 0; i < count + EXTRA_TAB_ITERATIONS; i++) {
    const urlBeforeTab = page.url();
    await page.keyboard.press('Tab');
    // ... page.evaluate() captures currentFocusedElement ...
    // Small wait to allow any navigation to start
    await page.waitForTimeout(50);          // ← line 299, the fixed window
    const urlAfterTab = page.url();
    if (urlAfterTab !== urlBeforeTab) {     // ← line 303, sole detection
      navigationDetected = true;
      const culprit = currentFocusedElement || lastFocusedElement;
      ...
  ```

- `RunFocusIndicatorCheckOptions` is defined at lines 109–118 (extends
  `OutputLocationOptions`; fields `browser`, `targetUrl?`, `screenshot?`,
  `contextOptions?`).
- `packages/a11y-audit/src/constants.ts:75` — `export const EXTRA_TAB_ITERATIONS = 10;`
  (this file is the home for check constants; add the new default there).
- The on-focus violation maps to rule id `a11y-skills/no-context-change-on-focus`
  (`packages/a11y-audit/src/utils/rule-registry.ts:58`), populated from
  `details.onFocusViolations` in `normalizeFocusCheck`
  (`packages/a11y-audit/src/utils/axe-format.ts`).
- Existing test exemplar: `packages/a11y-audit/test/smoke.spec.ts:114-133` —
  `runFocusIndicatorCheck flags missing focus indicator as incomplete`; uses a
  `data:text/html,` fixture URL, passes `{ browser, targetUrl, outputDir:
  testInfo.outputDir }`, asserts on `result.details` and
  `result.incomplete.find((r) => r.id === '...')`. Match this structure.
- Code style: TypeScript ESM with `.js` import specifiers, single quotes,
  semicolons, 2-space indent, JSDoc on exported symbols.

**Important fixture constraint**: browsers block script-driven top-frame
navigation to `data:` URLs, so a delayed-navigation fixture CANNOT be a
`data:` URL navigating to another `data:` URL. The test must serve fixtures
over local HTTP (`node:http` server on an ephemeral port inside the spec).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck --workspace @a11y-skills/audit` | exit 0 |
| Build | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| Browsers (once) | `npx playwright install chromium` in `packages/a11y-audit` | exit 0 |
| Full test suite | `npm test --workspace @a11y-skills/audit` | all pass (runs build via pretest) |
| Just the new spec | `npx playwright test test/focus-navigation.spec.ts` in `packages/a11y-audit` | all pass |

## Scope

**In scope** (the only files you should modify/create):
- `packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts`
- `packages/a11y-audit/src/constants.ts`
- `packages/a11y-audit/test/focus-navigation.spec.ts` (create)

**Out of scope** (do NOT touch):
- `src/utils/axe-format.ts`, `src/utils/rule-registry.ts`, `src/types.ts` — the
  envelope/rule plumbing already handles on-focus violations; no schema change.
- `skills/auditing-wcag/references/scripts/*` — wrappers consume the published
  package; they pick this up at the next release.
- The browser-injected focus tracker script inside the same file
  (`createFocusTrackerScript` and `WARNING_STYLES`) — the fix is entirely in
  the Node-side loop.

## Git workflow

- Branch: `fix/focus-navigation-detection-window`
- Commits: conventional, e.g.
  `fix(a11y-audit): catch focus-triggered navigations slower than the settle window`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the configurable settle constant and option

In `packages/a11y-audit/src/constants.ts`, near `EXTRA_TAB_ITERATIONS`
(line 75), add:

```ts
/** Default ms to wait after each Tab press for a focus-triggered navigation to surface. */
export const DEFAULT_NAVIGATION_SETTLE_MS = 50;
```

In `runFocusIndicatorCheck.ts`, import it, and add to
`RunFocusIndicatorCheckOptions`:

```ts
/**
 * Milliseconds to wait after each Tab press for a focus-triggered navigation
 * to surface (default: 50). Raise on slow pages/networks. Late navigations
 * are also caught via the `framenavigated` listener regardless of this value.
 */
navigationSettleMs?: number;
```

Destructure it where the other options are read, defaulting to
`DEFAULT_NAVIGATION_SETTLE_MS`, and replace the literal in
`await page.waitForTimeout(50)` (line 299) with it.

**Verify**: `npm run typecheck --workspace @a11y-skills/audit` → exit 0.

### Step 2: Add a main-frame `framenavigated` listener

Immediately after `const page = await context.newPage();` (line 161), add:

```ts
// Catch navigations that surface later than the per-Tab settle window
// (WCAG 3.2.1). Reset per Tab iteration; checked alongside the URL diff.
let lateNavigationUrl: string | null = null;
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) {
    lateNavigationUrl = frame.url();
  }
});
```

Two adjustments so the initial load and intentional state don't false-positive:

1. The initial `page.goto(targetUrl, ...)` (line 205) fires `framenavigated`.
   Reset `lateNavigationUrl = null` after the goto (and after the
   `initFocusTracker` evaluate) — i.e. just before the Tab loop starts.
2. At the TOP of each Tab-loop iteration (right after `const urlBeforeTab =
   page.url();`), capture-and-clear: `const pendingNav = lateNavigationUrl;
   lateNavigationUrl = null;` is NOT the shape we want (it would erase a
   navigation mid-detection). Instead, simply leave the variable set and use
   the detection condition in Step 3, clearing it only after a detection is
   handled. Concretely: do nothing at loop top; clear inside the violation
   branch.

**Verify**: `npm run typecheck --workspace @a11y-skills/audit` → exit 0.

### Step 3: Widen the detection condition

Replace the detection condition at line 303:

```ts
// before
if (urlAfterTab !== urlBeforeTab) {
```

with:

```ts
const lateNav =
  lateNavigationUrl !== null && lateNavigationUrl !== urlBeforeTab;
if (urlAfterTab !== urlBeforeTab || lateNav) {
```

Inside the violation branch, where `fromUrl`/`toUrl` are recorded
(currently `fromUrl: urlBeforeTab, toUrl: urlAfterTab`), use
`toUrl: urlAfterTab !== urlBeforeTab ? urlAfterTab : (lateNavigationUrl ?? urlAfterTab)`,
and add `lateNavigationUrl = null;` at the end of the branch so one navigation
is reported once. Keep the existing `culprit = currentFocusedElement ||
lastFocusedElement` attribution unchanged — for a late navigation this may
attribute to the element one Tab after the true offender; that is accepted and
documented (see Maintenance notes), and the retry/skip mechanism plus
`MAX_RETRIES` cap bounds the cost.

**Verify**: `npm run typecheck --workspace @a11y-skills/audit` → exit 0, then
`npm test --workspace @a11y-skills/audit` → existing suite still green
(`smoke.spec.ts` focus test must still pass — it has no navigation, so the new
listener must not fire on it after the initial-goto reset).

### Step 4: Write the regression test

Create `packages/a11y-audit/test/focus-navigation.spec.ts`, modeled
structurally on `smoke.spec.ts:114-133`. Shape:

```ts
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

const PAGE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>delayed nav fixture</title></head>
<body>
  <button id="safe">safe</button>
  <button id="delayed-nav">navigates on focus (delayed)</button>
  <script>
    document.getElementById('delayed-nav').addEventListener('focus', () => {
      setTimeout(() => { location.href = '/navigated'; }, 120);
    });
  </script>
</body></html>`;

const NAVIGATED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>navigated</title></head>
<body><p>navigated</p></body></html>`;
```

- `test.beforeAll`: start the server (`listen(0)` for an ephemeral port,
  serve `/` → `PAGE_HTML`, `/navigated` → `NAVIGATED_HTML`, both with
  `Content-Type: text/html`); `test.afterAll`: close it.
- The test: call `runFocusIndicatorCheck({ browser, targetUrl:
  `http://127.0.0.1:${port}/`, outputDir: testInfo.outputDir })` and assert:
  - `result.details.onFocusViolations.length` ≥ 1, with one violation whose
    `toUrl` contains `/navigated`;
  - `result.violations.find((r) => r.id === 'a11y-skills/no-context-change-on-focus')`
    is defined. (If the rule lands in `incomplete` instead of `violations`,
    check `normalizeFocusCheck` in `src/utils/axe-format.ts` for which bucket
    `onFocusViolations` feeds, and assert on that bucket — read the code, do
    not guess.)
- The 120ms delay is the point: it exceeds the 50ms settle window, so this
  test FAILS on the pre-fix code. Confirm that by stashing your src changes
  once (`git stash -- packages/a11y-audit/src && npm test ...`), observing the
  red run, then `git stash pop`. If the pre-fix code unexpectedly PASSES the
  test, the fixture delay isn't exercising the gap — raise the delay to 200ms
  and re-confirm before proceeding.

**Verify**: `npm test --workspace @a11y-skills/audit` → all pass, including
the new spec; and the stash experiment showed the new test failing pre-fix.

## Test plan

- New: `test/focus-navigation.spec.ts` (Step 4) — delayed-navigation regression
  (the bug this plan fixes) plus implicitly the no-false-positive case (the
  `#safe` button and the existing `smoke.spec.ts` fixture must produce zero
  on-focus violations).
- Existing: full suite via `npm test --workspace @a11y-skills/audit`.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck --workspace @a11y-skills/audit` exits 0
- [ ] `npm test --workspace @a11y-skills/audit` exits 0, including the new `focus-navigation.spec.ts`
- [ ] The new test was demonstrated to fail against pre-fix src (stash experiment)
- [ ] `grep -n "waitForTimeout(50)" packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts` returns no matches (literal replaced by the option)
- [ ] No files outside the in-scope list modified (`git status`, plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at lines 155–161 / 244–315 doesn't match the Current state excerpts.
- The existing `smoke.spec.ts` focus test starts failing after Step 3 and one
  fix attempt — the initial-goto reset is probably mishandled; report rather
  than restructuring the retry loop.
- You find the retry loop re-detects the SAME late navigation across attempts
  (skipSelectors never converges, MAX_RETRIES exhausted in the new test) —
  attribution design needs a human decision.
- The fix appears to require changing `types.ts` or the result envelope.

## Maintenance notes

- **Known approximation**: a navigation surfacing in iteration N+1 is
  attributed to the element focused at N+1 (or `lastFocusedElement`), which can
  be one element off. The violation itself is never lost anymore — reviewers
  should treat the reported element as "at or adjacent to" the offender. A
  follow-up could timestamp `framenavigated` against per-element focus times.
- If anyone later parallelizes or batches the Tab loop, the single
  `lateNavigationUrl` flag must become per-step state.
- Reviewer should scrutinize: the reset point after `page.goto` (false
  positives on every page if missed), and that `screenshot: true` paths still
  work (screenshot happens after the loop; unaffected, but cheap to eyeball).
