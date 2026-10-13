---
name: auditing-wcag
description: Perform formal WCAG 2.2 A/AA conformance audits and assign Pass/Fail/NT/NA to every success criterion with evidence. Use reviewing-a11y instead for issue discovery and improvement feedback.
argument-hint: URL or file path to audit
allowed-tools: Read Grep Glob WebFetch Task mcp__playwright__browser_snapshot mcp__playwright__browser_navigate mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_press_key
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
- Limitations (AT checks out of scope, dynamic behavior depends on Playwright)
- Output format (Pass/Fail/NT/NA per success criterion)

### 3. Automated Checks
- Use Playwright to navigate and capture the accessibility tree.
- Apply `references/automated-checks.md`.
- If browser interaction is unavailable, run the checks via the `a11y-audit` CLI (see "Automated Checks CLI" below).
- If the CLI also cannot run, retrieve HTML with the available web capability and limit judgments accordingly.
- Use `references/coverage-matrix.md` to ensure A/AA coverage.

### 4. Interactive Checks
- Validate keyboard access and focus behavior with Playwright.
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

- Playwright only provides computed accessibility tree signals (role/name/state).
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

## Automated Checks CLI

Automated checks are run via the `a11y-audit` CLI included in the npm package [`@a11y-skills/audit`](https://www.npmjs.com/package/@a11y-skills/audit) (requires Node 18+; peer dependencies are fetched automatically by npm 7+).

**Setup (first time only):**
```bash
npx playwright install chromium
```

**Run all checks:**
```bash
npx -y @a11y-skills/audit --url "https://example.com"
```

**Run specific checks:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks axe-audit,focus-indicator-check
```

**With annotated screenshots (focus-indicator):**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks focus-indicator-check --screenshot
```

**Custom output directory (default: `./a11y-audit-results`):**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --output-dir ./results
```

**Exit codes:** `0` = no violations / `1` = violations found / `2` = runtime error

| Check name | Criterion | Description |
|---|---|---|
| `axe-audit` | Multiple | axe-core comprehensive check |
| `reflow-check` | 1.4.10 | Horizontal scroll at 320px |
| `text-spacing-check` | 1.4.12 | Text spacing override clipping |
| `zoom-200-check` | 1.4.4 | 200% zoom content loss |
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

See the [`@a11y-skills/audit` README](https://www.npmjs.com/package/@a11y-skills/audit) for detailed documentation.
