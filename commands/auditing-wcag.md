---
name: auditing-wcag
description: WCAG 2.2 AA conformance auditor. Systematically verifies success criteria through automated, interactive, and manual testing methods.
argument-hint: URL or file path to audit
---

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
- For local files, use `Read` to capture contents (runtime behavior cannot be executed).

### 2. Scope Contract
Confirm and get agreement on:
- Target level (A/AA, default WCAG 2.2 AA)
- Page scope (all pages / representative pages / provided URLs)
- Limitations (AT checks out of scope, dynamic behavior depends on Playwright)
- Output format (Pass/Fail/NT/NA per success criterion)

### 3. Automated Checks
- Use Playwright to navigate and capture the accessibility tree.
- Apply `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/automated-checks.md`.
- If Playwright is unavailable, use `WebFetch` for HTML-only checks and limit findings accordingly.
- Use `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/coverage-matrix.md` to ensure A/AA coverage.

### 4. Interactive Checks
- Validate keyboard access and focus behavior with Playwright.
- Follow `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/interactive-checks.md`.
- If execution is blocked, mark affected criteria as NT.

### 5. Manual Check Items
- Present items from `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/manual-checks.md` and `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/content-checks.md`.
- If evidence is not available, keep them as NT and list them explicitly.
- Incorporate any evidence the user provides.

### 6. Report Generation
- Follow `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/output-format.md`.
- Assign a status to every A/AA success criterion (Pass/Fail/NT/NA).
- Summarize scope, limitations, tools, and unresolved items.

## Automation Scope and Limits

- Playwright only provides computed accessibility tree signals (role/name/state).
- Automated test results alone do not guarantee audit outcomes.
- Screen reader verification and AT×browser compatibility testing are out of scope.
- Do not guess; use NT when evidence is missing.

## Reference Guides

- `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/automated-checks.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/interactive-checks.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/manual-checks.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/content-checks.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/output-format.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/coverage-matrix.md`

## Automated Test Scripts

The `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/scripts/` directory contains Playwright-based test scripts for detailed automated checks. These scripts generate JSON results and annotated screenshots.

| Script | Criterion | Description |
|---|---|---|
| `axe-audit.ts` | Multiple | axe-core comprehensive check |
| `reflow-check.ts` | 1.4.10 | Horizontal scroll at 320px |
| `text-spacing-check.ts` | 1.4.12 | Text spacing override clipping |
| `zoom-200-check.ts` | 1.4.4 | 200% zoom content loss |
| `orientation-check.ts` | 1.3.4 | Orientation lock detection |
| `autocomplete-audit.ts` | 1.3.5 | Missing/invalid autocomplete |
| `time-limit-detector.ts` | 2.2.1 | Timer/meta refresh detection |
| `auto-play-detection.ts` | 1.4.2, 2.2.2 | Auto-play content detection |
| `focus-indicator-check.ts` | 2.4.7 | Focus indicator visibility |
| `target-size-check.ts` | 2.5.5, 2.5.8 | Target size measurement |

**Usage:**
```bash
cd ${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/scripts
npm install
TEST_PAGE="https://example.com" npx playwright test <script-name>.ts
```

See `${CLAUDE_PLUGIN_ROOT}/skills/auditing-wcag/references/scripts/README.md` for detailed documentation.
