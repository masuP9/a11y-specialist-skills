---
name: auditing-wcag
description: Perform formal WCAG 2.2 A/AA conformance audits and assign Pass/Fail/NT/NA to every success criterion with evidence. Use reviewing-a11y instead for issue discovery and improvement feedback.
argument-hint: URL or file path to audit
allowed-tools: Read Grep Glob Write WebFetch Agent Bash(npx -y @a11y-skills/audit:*) Bash(npx playwright install:*) mcp__playwright__browser_snapshot mcp__plugin_playwright_playwright__browser_snapshot mcp__playwright__browser_navigate mcp__plugin_playwright_playwright__browser_navigate mcp__playwright__browser_click mcp__plugin_playwright_playwright__browser_click mcp__playwright__browser_type mcp__plugin_playwright_playwright__browser_type mcp__playwright__browser_press_key mcp__plugin_playwright_playwright__browser_press_key mcp__playwright__browser_hover mcp__plugin_playwright_playwright__browser_hover mcp__playwright__browser_evaluate mcp__plugin_playwright_playwright__browser_evaluate mcp__playwright__browser_take_screenshot mcp__plugin_playwright_playwright__browser_take_screenshot mcp__playwright__browser_wait_for mcp__plugin_playwright_playwright__browser_wait_for mcp__playwright__browser_resize mcp__plugin_playwright_playwright__browser_resize
---

[日本語版 (Japanese)](./SKILL.ja.md)

# WCAG Conformance Audit

You perform WCAG 2.2 AA conformance audits. Report Pass/Fail/NT/NA per success criterion with evidence.

## When to Use This Skill

| Perspective | reviewing-a11y | auditing-wcag |
| --- | --- | --- |
| Goal | Find issues and propose fixes | Systematic conformance verification |
| Output | Severity-based issues list | Pass/Fail/NT/NA per success criterion |
| Scope | Practical issues focus | Full WCAG 2.2 A/AA coverage |

### Routing Rules
- **auditing-wcag**: Requests for "audit", "compliance", "conformance", or formal reporting.
- **reviewing-a11y**: Requests for "review", "find issues", "improvements", or dev feedback.
- If unclear, ask which goal they want: compliance report or issue review.

## Workflow (6 Steps)

### 1. Input Acceptance
- Accept a URL or local file path.
- For multiple pages, confirm the list and entry points.
- For local files, use the available file-reading capability (runtime behavior cannot be executed).

### 2. Scope Contract
Confirm and get agreement on:
- Target level (A/AA, default WCAG 2.2 AA)
- Page scope (all pages / representative pages / provided URLs)
- Target environment (production / staging) and whether key presses, value changes and submissions may happen (confirm with the user; this decides the `--checks` value in "Automated Checks" below)
- Limitations (AT checks out of scope, dynamic behavior depends on browser interaction)
- Output format (Pass/Fail/NT/NA per success criterion)

### 3. Automated Checks
1. If a shell is available, run the `a11y-audit` CLI first (see "Automated Checks CLI" below). Use `--checks all` only when the scope contract confirmed that side effects are acceptable. If that was not confirmed or side effects are not acceptable, list only the "allowlist of checks that do not operate the page" below (including `page-snapshot`).
2. Sort the results into "settled / needs review" with the knowledge base rules below.
3. Use browser interaction to verify candidates that need review and for "4. Interactive Checks".
4. If no shell is available, use browser interaction in place of step 1 (navigate and capture the accessibility tree). Record the checks it could not cover under limitations.
5. If neither is available, retrieve HTML with the available web capability and limit judgments accordingly.
- Collect the material for each criterion with `references/automated-checks.md`.
- Use `references/coverage-matrix.md` to ensure A/AA coverage.

**Allowlist of checks that do not operate the page:** "Side effects" means **input operations** that can cause submission, saving, authentication requests and the like (key presses, clicks, pointer operations, typing values, pasting, dispatching synthetic events). The checks below perform none of these, so they may run even when side effects are not confirmed acceptable.
`--checks axe-audit,page-snapshot,reflow-check,text-spacing-check,zoom-200-check,orientation-check,autocomplete-audit,time-limit-detector,target-size-check,redundant-entry-check,pointer-gesture-check,non-text-contrast-check`

- They do change the display (scrolling, resizing the window, injecting CSS): `target-size-check` scrolls; `reflow-check`, `zoom-200-check` and `orientation-check` resize the window; `text-spacing-check` injects CSS. `zoom-200-check` also applies CSS `zoom: 200%` to the page in addition to resizing the window. `time-limit-detector` replaces `setTimeout` / `setInterval` before load to record the calls (the page's timers still run normally). On pages that run handlers on scroll or resize, the user may drop these.
- Checks not on the allowlist (`focus-indicator-check`, `keyboard-trap-check`, `keyboard-reachability-check`, `content-on-hover-check`, `auto-play-detection`, `motion-actuation-check`, `change-on-input-check`, `accessible-authentication-check`, `focus-order-check`, `pointer-cancellation-check`, `character-key-shortcut-check`) run only when side effects are confirmed acceptable. For criteria whose checks were not run, have a person verify with browser interaction or mark NT (not tested), and state the reason under limitations.

**Sort the results with the knowledge base ([a11y-knowledge](../a11y-knowledge/SKILL.md)):**
- Also run `page-snapshot` from `@a11y-skills/audit` 0.14.0 or later (include it even when narrowing `--checks`). It gives no verdict, but it is the material for 2.4.1 / 2.4.2 / 3.1.1 and for comparing multiple pages.
- Sort the results into "settled / needs review" by the rules in [checks-axe.md](../a11y-knowledge/references/checks-axe.md) and [checks-audit.md](../a11y-knowledge/references/checks-audit.md). Use axe passes as evidence within each rule’s scope, not as criterion-wide conformance (Pass). Check the remaining conditions in each criterion file.
- For criteria that need review, read "Judgment lines" and "When checking" in `../a11y-knowledge/references/criteria/<number>.md` before deciding. Anything under "do not assert" stays NT, with a note on what would settle it.
- When auditing multiple pages, first read the shared judgment rules in [cross-page.md](../a11y-knowledge/references/cross-page.md).
- Judgment rules live in the knowledge base; the reference guides hold only the material and the judgments for criteria without a knowledge base file. The knowledge base is referenced by the relative path `../a11y-knowledge/` (it resolves when installed as a plugin; when installed by symlinking individual skill directories, link `a11y-knowledge` as well).

### 4. Interactive Checks
- Perform keyboard operation and focus checks.
- Follow `references/interactive-checks.md`.
- If execution is blocked, mark affected criteria as NT.

### 5. Manual Check Items
- Present items from `references/manual-checks.md` and `references/content-checks.md`.
- If evidence is not available, keep them as NT and list them explicitly.
- Incorporate any evidence the user provides.

### 6. Report Generation
- Follow `references/output-format.md`.
- Assign a status to every A/AA success criterion (Pass/Fail/NT/NA).
- Summarize scope, limitations, tools, and unresolved items.

## Automation Scope and Limits

- Browser interaction only provides computed accessibility tree signals (role/name/state).
- Automated test results alone do not guarantee audit outcomes.
- Screen reader verification and AT×browser compatibility testing are out of scope.
- Do not guess; use NT when evidence is missing.

## Reference Guides

- `references/automated-checks.md`
- `references/interactive-checks.md`
- `references/manual-checks.md`
- `references/content-checks.md`
- `references/output-format.md`
- `references/coverage-matrix.md`
- Knowledge base (`../a11y-knowledge/`): `references/checks-axe.md`, `references/checks-audit.md`, `references/cross-page.md`, `references/criteria/<number>.md`

## Automated Checks CLI

Automated checks are run via the `a11y-audit` CLI included in the npm package [`@a11y-skills/audit`](https://www.npmjs.com/package/@a11y-skills/audit) (requires Node 18+; peer dependencies are fetched automatically by npm 7+).

**Setup (first time only):**
```bash
npx playwright install chromium
```

**Run all checks (only when side effects are confirmed acceptable):**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks all --output-dir ./results
```

**Run specific checks (the example uses allowlist checks only):**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks axe-audit,page-snapshot --output-dir ./results
```

**Omitting `--checks` means `all`, which also runs the checks with side effects. Always pass `--checks <the value decided in the scope contract>`.** Add checks not on the allowlist, such as `focus-indicator-check`, only when side effects are confirmed acceptable.

Include `page-snapshot` (0.14.0 or later) even when narrowing `--checks`. It is the material for 2.4.1 / 2.4.2 / 3.1.1 and for comparing multiple pages.

**With annotated screenshots (focus-indicator; not on the allowlist, so only when side effects are acceptable):**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks focus-indicator-check --screenshot --output-dir ./results
```

**Custom output directory (default: `./a11y-audit-results`):**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks axe-audit,page-snapshot --output-dir ./results
```

**Exit codes:** `0` = no violations / `1` = violations found / `2` = runtime error

| Check name | Criterion | Description |
|---|---|---|
| `axe-audit` | Multiple | axe-core comprehensive check |
| `reflow-check` | 1.4.10 | Horizontal scroll at 320px |
| `text-spacing-check` | 1.4.12 | Text spacing override clipping |
| `zoom-200-check` | 1.4.4 | Clipping and other candidates at CSS zoom 200%; verify in the actual browser |
| `orientation-check` | 1.3.4 | Orientation lock detection |
| `autocomplete-audit` | 1.3.5 | Missing/invalid autocomplete |
| `time-limit-detector` | 2.2.1 | Timer/meta refresh detection |
| `auto-play-detection` | 1.4.2, 2.2.2 | Auto-play content detection (visual changes and the playback state of `<audio>` / `<video>`; whether sound is actually heard needs manual review) |
| `focus-indicator-check` | 2.4.7 | Focus indicator visibility |
| `target-size-check` | 2.5.5, 2.5.8 | Target size measurement |
| `keyboard-trap-check` | 2.1.2 | Keyboard trap detection |
| `keyboard-reachability-check` | 2.1.1 | Keyboard reachability (Tab, arrow keys, activedescendant) |
| `redundant-entry-check` | 3.3.7 | Overlapping fields asking for the same information (candidates; needs review) |
| `motion-actuation-check` | 2.5.4 | Listeners reacting to device motion / orientation (candidates; needs review) |
| `change-on-input-check` | 3.2.2 | Navigation, new windows, focus moves or dialogs caused by just changing a form control (candidates; needs review) |
| `accessible-authentication-check` | 3.3.8 | Paste blocking and autocomplete="off" on password / code fields, CAPTCHA-like elements (candidates; needs review) |
| `pointer-gesture-check` | 2.5.1, 2.5.7 | Components likely operated by dragging, swiping or multiple fingers (candidates; needs review) |
| `focus-order-check` | 2.4.3 | Tab order vs. visual order (moving back up, backwards on a row, detours) and focus on opening / closing modal dialogs (candidates; needs review) |
| `pointer-cancellation-check` | 2.5.2 | Components that act on the down-event alone (navigation, new window, dialog, DOM change) and elements with only press listeners (candidates; needs review) |
| `non-text-contrast-check` | 1.4.11 | Contrast of input, checkbox, radio and switch borders or fills against the surrounding color, and of icons in icon-only buttons (below 3:1 or not measurable; needs review) |
| `character-key-shortcut-check` | 2.1.4 | Keys that cause a navigation, new window, dialog, focus move, DOM change, scroll or `preventDefault()` when pressed one at a time with focus on the page body (candidates; needs review) |
| `content-on-hover-check` | 1.4.13 | Content shown on hover or focus (found from CSS :hover / :focus rules and listeners) that Escape does not dismiss, that disappears when the pointer moves onto it, or that disappears on its own (candidates; needs review). Delegated listeners are reported only |
| `page-snapshot` | Material for 2.4.1 / 2.4.2 / 3.1.1 / 3.2.3 / 3.2.4 / 3.2.6 | No verdict. Writes the body's aria snapshot, the title, the `lang` of `<html>`, the URLs and an aria snapshot per iframe (read it to judge; for several pages, use a separate `--output-dir` per page and compare) |

See the [`@a11y-skills/audit` README](https://www.npmjs.com/package/@a11y-skills/audit) for detailed documentation.
